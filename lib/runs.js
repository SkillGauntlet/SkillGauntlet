// Trial records are the only artefact that cannot be regenerated cheaply.
//
// The report is a rendering of them, a scorecard is a rendering of the directory, but the 110
// records behind a trigger number cost ten minutes and real money. Until now they lived in memory
// and died with the process, so nothing could be recomputed later, two runs could not be compared,
// and a community submission had no file to submit.
//
// The shape copies the Python runner deliberately: meta.json first, then one JSON line per finished
// trial, then summary.json. A run killed by Ctrl-C, a quota limit or a closed laptop keeps
// everything it already finished, and a reader can tell from the files exactly what conditions
// produced them.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const RUNNER_VERSION = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8')).version;

export const RUN_SCHEMA = 'skillgauntlet/run/1';
export { RUNNER_VERSION };

export function runsRoot(skillDir) {
  return path.join(skillDir, '.skillgauntlet', 'runs');
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-`
    + `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// rename over an existing file can fail on Windows, so fall back to remove-then-rename.
function writeAtomic(file, text) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, text);
  try {
    fs.renameSync(tmp, file);
  } catch {
    fs.rmSync(file, { force: true });
    fs.renameSync(tmp, file);
  }
}

export function querySetHash(queries) {
  return createHash('sha256').update(JSON.stringify(queries)).digest('hex').slice(0, 16);
}

// A second run started within the same second would otherwise reuse the first one's directory and
// overwrite its records without a word. Fast failures and a re-run from a script do exactly that.
function uniqueDir(root, base) {
  let id = base;
  let n = 1;
  while (fs.existsSync(path.join(root, id))) {
    n += 1;
    id = `${base}-${n}`;
  }
  return id;
}

// Open a run before the first trial, so an interrupted run still has its conditions on disk.
export function openRun({ skillDir, skillName, host, backend, model, runs, maxExplore, depth, querySets, queries, skillFingerprint }) {
  const root = runsRoot(skillDir);
  fs.mkdirSync(root, { recursive: true });
  const runId = uniqueDir(root, stamp());
  const dir = path.join(root, runId);
  fs.mkdirSync(dir);

  const meta = {
    schema: RUN_SCHEMA,
    runId,
    runnerVersion: RUNNER_VERSION,
    skill: skillName,
    host,
    backend,
    model,
    runs,
    maxExplore,
    depth,
    querySets,
    skillFingerprint: skillFingerprint || null,
    platform: `${os.platform()} ${os.release()} / Node ${process.version}`,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    trials: 0,
    interrupted: false,
  };
  const metaFile = path.join(dir, 'meta.json');
  const rawFile = path.join(dir, 'raw.jsonl');
  writeAtomic(metaFile, `${JSON.stringify(meta, null, 2)}\n`);
  fs.writeFileSync(rawFile, '');
  // The questions themselves, so a resume works from exactly what this run asked and not from a cache
  // that may have been redrafted since. Its hash is meta.querySets[0].sha256.
  if (queries) writeAtomic(path.join(dir, 'queries.json'), `${JSON.stringify(queries, null, 2)}\n`);
  return handle(dir, meta);
}

// Shared by a new run and a resumed one: appending, refreshing and closing behave the same.
function handle(dir, meta) {
  const metaFile = path.join(dir, 'meta.json');
  const rawFile = path.join(dir, 'raw.jsonl');
  const flushMeta = () => writeAtomic(metaFile, `${JSON.stringify(meta, null, 2)}\n`);

  return {
    dir,
    meta,
    // Merge run-level facts learned mid-run (the tool list from the first init event, a stop reason).
    patch(fields) {
      Object.assign(meta, fields);
      flushMeta();
    },
    get file() { return rawFile; },
    // Called from the worker pool: appending is synchronous, so two in-flight trials cannot interleave
    // a half line. Refreshing meta every trial would be wasteful; every 25 matches the Python runner.
    append(row) {
      fs.appendFileSync(rawFile, `${JSON.stringify(row)}\n`);
      meta.trials += 1;
      if (meta.trials % 25 === 0) flushMeta();
    },
    // What the model said and did first, per trial. Local only: submissions copy a fixed list of files, and this
    // is not one of them.
    appendAnswer(row) {
      fs.appendFileSync(path.join(dir, 'answers.jsonl'), `${JSON.stringify(row)}\n`);
    },
    close(summary, { interrupted = false } = {}) {
      meta.finishedAt = new Date().toISOString();
      meta.interrupted = interrupted;
      flushMeta();
      if (summary) writeAtomic(path.join(dir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
      return dir;
    },
  };
}

// Open an existing run directory to continue it. The caller has already checked that the conditions
// match (see resumeRun in execute.js); this only reopens the files and notes the resume.
export function reopenRun(dir) {
  const { meta, records } = readRun(dir);
  meta.trials = records.length;
  meta.finishedAt = null;
  meta.interrupted = false;
  delete meta.stoppedAt;
  delete meta.stoppedReason;
  meta.resumedAt = [...(meta.resumedAt || []), new Date().toISOString()];
  fs.rmSync(path.join(dir, 'summary.json'), { force: true });
  const h = handle(dir, meta);
  h.patch({});
  return h;
}

// One valid record per (query, run index): the latest that is not an error or timeout. Failed trials
// stay in raw.jsonl as evidence but are retried on resume and never counted.
export function validRecords(records) {
  const byKey = new Map();
  for (const r of records) {
    if (r.verdict === 'error' || r.verdict === 'timeout') continue;
    byKey.set(`${r.queryId}#${r.run}`, r);
  }
  return [...byKey.values()];
}

// Rebuilding a report from a saved run is the reason the records are kept: the statistics can be
// corrected without spending another token.
export function readRun(dir) {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
  const raw = fs.readFileSync(path.join(dir, 'raw.jsonl'), 'utf8')
    .split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  let summary = null;
  try { summary = JSON.parse(fs.readFileSync(path.join(dir, 'summary.json'), 'utf8')); } catch { /* unfinished */ }
  return { meta, records: raw, summary };
}

// Answers kept beside a run, keyed "queryId#run". A run made before they were kept has none: an empty map.
export function readAnswers(dir) {
  const out = new Map();
  try {
    for (const line of fs.readFileSync(path.join(dir, 'answers.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean)) {
      const row = JSON.parse(line);
      out.set(`${row.queryId}#${row.run}`, row);
    }
  } catch { /* none kept */ }
  return out;
}
