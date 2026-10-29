// Running trials against an open run archive, and picking a run back up.
//
// Ported from the `run` / `--resume` path of step0/trigger_test.py (v0.4.1-v0.4.2). Two rules come
// with it. A trial that errored or timed out is written to raw.jsonl but never counted, and is
// retried on resume. And a run stops itself after ERROR_STREAK_STOP failed trials in a row: that is
// a usage limit, a dead token or a network outage, and carrying on would only burn the queue.
import fs from 'node:fs';
import path from 'node:path';
import { fingerprint } from './queries.js';
import { readRun, reopenRun, validRecords, querySetHash } from './runs.js';
import { FAILED, runTrial as realRunTrial, summarize, wilson } from './trial.js';

export const ERROR_STREAK_STOP = 8;

// trials: [{ q, i }]. doTrial({ q, i }) resolves to a trial record, optionally carrying `init`
// (the CLI's init event), which is lifted into the run's meta instead of being stored on every row.
export async function executeTrials({ run, trials, doTrial, workers = 2, streakStop = ERROR_STREAK_STOP, onTrial = () => {} }) {
  const state = { next: 0, done: 0, streak: 0, stopped: null };
  const worker = async () => {
    for (;;) {
      if (state.stopped) return;
      const idx = state.next++;
      if (idx >= trials.length) return;
      const { q, i } = trials[idx];
      const rec = await doTrial({ q, i });
      const { init, ...stored } = rec;
      const row = { ...stored, queryId: q.id, run: i, query: q.query, shouldTrigger: q.shouldTrigger };
      if (init && !run.meta.tools) {
        run.patch({
          modelResolved: init.model,
          apiKeySource: init.apiKeySource,
          claudeCodeVersion: init.claudeCodeVersion,
          loadedSkills: init.skills,
          tools: [...(init.tools || [])].sort(),
        });
      }
      run.append(row);
      state.done += 1;
      state.streak = FAILED.has(row.verdict) ? state.streak + 1 : 0;
      if (state.streak >= streakStop && !state.stopped) {
        state.stopped = (String(row.error || row.verdict).trim().split(/\r?\n/).pop() || '?').slice(0, 200);
      }
      onTrial({ row, done: state.done, total: trials.length });
    }
  };
  await Promise.all(Array.from({ length: Math.min(workers, trials.length) }, worker));
  return { done: state.done, stopped: state.stopped };
}

// Close a finished run, or park a stopped one. A stopped run writes no summary: it is not complete,
// and a number computed from half the queue would read as a result.
export function finishRun(run, { model, backend, host, runs, expected }, stopped) {
  if (stopped) {
    run.patch({ stoppedAt: new Date().toISOString(), stoppedReason: stopped });
    run.close(null, { interrupted: true });
    return null;
  }
  const all = readRun(run.dir).records;
  const records = validRecords(all);
  const s = summarize(records);
  const posQ = s.questions.filter((q) => q.shouldTrigger);
  const negQ = s.questions.filter((q) => !q.shouldTrigger);
  const result = {
    ...s,
    failedTrials: all.length - records.length,
    // trials still owed (errors and timeouts with no valid retry): the numbers cover fewer trials than planned
    incomplete: expected ? Math.max(0, expected - records.length) : 0,
    model,
    backend,
    host,
    runs,
    recallCi: wilson(posQ.filter((q) => q.hits * 2 > q.n).length, posQ.length),
    fprCi: wilson(negQ.filter((q) => q.hits > 0).length, negQ.length),
  };
  if (result.incomplete) run.patch({ incompleteTrials: result.incomplete });
  run.close(result);
  return result;
}

export function pendingTrials(queries, runs, records) {
  const have = new Set(validRecords(records).map((r) => `${r.queryId}#${r.run}`));
  const out = [];
  for (const q of queries) for (let i = 0; i < runs; i += 1) if (!have.has(`${q.id}#${i}`)) out.push({ q, i });
  return out;
}

function mismatch(what, was, got) {
  const err = new Error(`cannot resume: ${what} was ${was}, now ${got}`);
  err.messageKey = 'resumeMismatch';
  err.vars = { what, was, got };
  return err;
}

// The conditions a resumed run must keep. Records from different conditions cannot be pooled, so a
// change is refused rather than merged. `want` holds only what the caller supplied; anything left out
// is taken from the run.
export function checkResume(meta, want) {
  for (const k of ['model', 'runs', 'maxExplore']) {
    if (want[k] !== undefined && want[k] !== null && String(want[k]) !== String(meta[k])) {
      throw mismatch(k, meta[k], want[k]);
    }
  }
  if (want.backend !== undefined && want.backend !== meta.backend) throw mismatch('backend', meta.backend, want.backend);
}

export function loadRunQueries(dir, meta) {
  const skillDir = path.resolve(dir, '..', '..', '..');
  let queries = null;
  try { queries = JSON.parse(fs.readFileSync(path.join(dir, 'queries.json'), 'utf8')).queries; } catch { /* older run */ }
  if (!queries) {
    // Runs written before queries.json existed: fall back to the cache file they were drawn from.
    try { queries = JSON.parse(fs.readFileSync(path.join(skillDir, '.skillgauntlet', meta.querySets[0].file), 'utf8')).queries; } catch { /* gone */ }
  }
  const was = meta.querySets?.[0]?.sha256;
  if (!queries || querySetHash(queries) !== was) {
    const err = new Error('cannot resume: the question set no longer matches the one this run used');
    err.messageKey = 'resumeQueriesChanged';
    throw err;
  }
  if (meta.skillFingerprint && fingerprint(skillDir) !== meta.skillFingerprint) {
    const err = new Error('cannot resume: SKILL.md changed since this run started');
    err.messageKey = 'resumeSkillChanged';
    throw err;
  }
  return { skillDir, queries };
}

// Continue a run directory: skip every valid record, retry errors and timeouts.
// want: { model, runs, maxExplore, backend } as supplied now; mismatches throw with a messageKey.
export async function resumeRun({ dir, want = {}, bin, runTrialFn = realRunTrial, workers = 2, timeout, onTrial }) {
  const { meta, records } = readRun(dir);
  checkResume(meta, want);
  const { skillDir, queries } = loadRunQueries(dir, meta);
  const todo = pendingTrials(queries, meta.runs, records);
  if (!todo.length) return { nothing: true, meta };

  const run = reopenRun(dir);
  const doTrial = ({ q }) => runTrialFn({
    bin, skillDir, skillName: meta.skill, query: q.query, model: meta.model, maxExplore: meta.maxExplore, timeout,
    host: meta.host,
  });
  let outcome;
  try {
    outcome = await executeTrials({ run, trials: todo, doTrial, workers, onTrial });
  } catch (err) {
    run.close(null, { interrupted: true });
    throw err;
  }
  const result = finishRun(run, {
    model: meta.model, backend: meta.backend, host: meta.host, runs: meta.runs, expected: queries.length * meta.runs,
  }, outcome.stopped);
  return { nothing: false, result, stopped: outcome.stopped, dir, meta: run.meta, total: todo.length, done: outcome.done };
}
