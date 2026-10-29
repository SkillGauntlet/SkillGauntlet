// Offline tests for the Node runner's parity with step0/trigger_test.py (v0.4.1-v0.4.2).
// Nothing here calls a model: trials are either replaced by a fake runTrial or run against a fake
// CLI script that prints canned stream-json events.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openRun, readRun, querySetHash } from '../lib/runs.js';
import { ERROR_STREAK_STOP, executeTrials, finishRun, resumeRun } from '../lib/execute.js';
import { runTrial, trialEnv } from '../lib/trial.js';
import { launchSpec } from '../lib/spawn.js';

const tmpdir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sg-test-'));

function makeSkill(root) {
  const dir = path.join(root, 'demo');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: demo\ndescription: demo skill\n---\nbody\n');
  return dir;
}

const QUERIES = [
  { id: 'q01', query: 'do the demo thing', shouldTrigger: true },
  { id: 'q02', query: 'do another demo thing', shouldTrigger: true },
  { id: 'q03', query: 'something else entirely', shouldTrigger: false },
];

function newRun(skillDir, { runs = 2, model = 'haiku', backend = 'anthropic' } = {}) {
  return openRun({
    skillDir, skillName: 'demo', host: 'claude-code', backend, model, runs, maxExplore: 0,
    depth: { id: 'quick' },
    querySets: [{ id: 'main', file: 'q.json', queries: QUERIES.length, clauses: 1, sha256: querySetHash(QUERIES) }],
    queries: { schema: 'x', queries: QUERIES },
  });
}

const trialsFor = (runs) => QUERIES.flatMap((q) => Array.from({ length: runs }, (_, i) => ({ q, i })));
const ok = (verdict = 'triggered', extra = {}) => ({ host: 'claude-code', verdict, firstTool: null, tools: [], error: null, ...extra });

// ---- 1. environment -------------------------------------------------------------------------------

test('trialEnv drops host-injected variables and keeps deliberate ones', () => {
  const env = trialEnv({
    PATH: '/bin', HOME: '/h', ANTHROPIC_API_KEY: 'k',
    CLAUDE_CODE_ENTRYPOINT: 'claude-desktop', CLAUDE_CODE_SSE_PORT: '1', CLAUDECODE: '1', CLAUDE_PID: '9',
    CLAUDE_EFFORT: 'high', MCP_CONNECTION_NONBLOCKING: '1',
    CLAUDE_CODE_OAUTH_TOKEN: 't', CLAUDE_CODE_USE_BEDROCK: '1', CLAUDE_CODE_GIT_BASH_PATH: 'C:/git/bash.exe',
    CLAUDE_CODE_MAX_OUTPUT_TOKENS: '9999', CLAUDE_CODE_USE_VERTEX: '1',
  });
  assert.deepEqual(Object.keys(env).sort(), [
    'ANTHROPIC_API_KEY', 'CLAUDE_CODE_GIT_BASH_PATH', 'CLAUDE_CODE_MAX_OUTPUT_TOKENS', 'CLAUDE_CODE_OAUTH_TOKEN',
    'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'HOME', 'PATH',
  ]);
});

// A fake CLI: prints the events given in FAKE_EVENTS (a JSON array of lines), echoes what it saw.
function fakeCli(root) {
  const file = path.join(root, 'fake-claude.js');
  fs.writeFileSync(file, `
const evs = JSON.parse(process.env.FAKE_EVENTS || '[]');
const seen = Object.keys(process.env).filter((k) => k.startsWith('CLAUDE_CODE_') || k === 'CLAUDECODE').sort();
for (const e of evs) { if (e.system_probe) e.tools = seen; console.log(JSON.stringify(e)); }
`);
  return file;
}

async function withFakeEvents(events, extraEnv, fn) {
  const saved = {};
  const set = { FAKE_EVENTS: JSON.stringify(events), ...extraEnv };
  for (const [k, v] of Object.entries(set)) { saved[k] = process.env[k]; process.env[k] = v; }
  try { return await fn(); } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}

test('runTrial: the child sees no host CLAUDE_CODE_* variables, and init tools are captured', async () => {
  const root = tmpdir();
  const skillDir = makeSkill(root);
  const bin = fakeCli(root);
  const init = { type: 'system', subtype: 'init', model: 'm', apiKeySource: 'none', tools: ['Bash', 'Read'], skills: ['demo'], system_probe: true };
  const result = { type: 'result', is_error: false, result: 'hi' };
  const rec = await withFakeEvents([init, result], { CLAUDE_CODE_ENTRYPOINT: 'claude-desktop', CLAUDE_CODE_OAUTH_TOKEN: 'keep-me' }, () =>
    runTrial({ bin, skillDir, skillName: 'demo', query: 'a prompt with spaces' }));
  assert.equal(rec.verdict, 'not_triggered');
  // the fake CLI reports the CLAUDE_CODE_* names it inherited in place of a tool list
  assert.deepEqual(rec.init.tools, ['CLAUDE_CODE_OAUTH_TOKEN']);
  assert.equal(rec.init.skills[0], 'demo');
});

// ---- 2. is_error results --------------------------------------------------------------------------

test('runTrial: an is_error result is an error, not not_triggered', async () => {
  const root = tmpdir();
  const skillDir = makeSkill(root);
  const bin = fakeCli(root);
  const ev = [{ type: 'result', is_error: true, subtype: 'success', result: "You've hit your usage limit" }];
  const rec = await withFakeEvents(ev, {}, () => runTrial({ bin, skillDir, skillName: 'demo', query: 'q' }));
  assert.equal(rec.verdict, 'error');
  assert.match(rec.error, /usage limit/);
});

test('runTrial: exiting without any event is an error; a normal answer is not_triggered', async () => {
  const root = tmpdir();
  const skillDir = makeSkill(root);
  const bin = fakeCli(root);
  const empty = await withFakeEvents([], {}, () => runTrial({ bin, skillDir, skillName: 'demo', query: 'q' }));
  assert.equal(empty.verdict, 'error');
  const plain = await withFakeEvents([{ type: 'result', is_error: false, result: 'sure' }], {},
    () => runTrial({ bin, skillDir, skillName: 'demo', query: 'q' }));
  assert.equal(plain.verdict, 'not_triggered');
});

test('runTrial: a Skill call naming the skill is triggered', async () => {
  const root = tmpdir();
  const skillDir = makeSkill(root);
  const bin = fakeCli(root);
  const ev = [{ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'demo' } }] } }];
  const rec = await withFakeEvents(ev, {}, () => runTrial({ bin, skillDir, skillName: 'demo', query: 'q' }));
  assert.equal(rec.verdict, 'triggered');
});

test('errors and timeouts are kept in raw.jsonl but never counted', () => {
  const root = tmpdir();
  const run = newRun(makeSkill(root), { runs: 1 });
  run.append({ queryId: 'q01', run: 0, query: 'x', shouldTrigger: true, verdict: 'triggered' });
  run.append({ queryId: 'q02', run: 0, query: 'x', shouldTrigger: true, verdict: 'error', error: 'limit' });
  run.append({ queryId: 'q03', run: 0, query: 'x', shouldTrigger: false, verdict: 'timeout' });
  const result = finishRun(run, { model: 'haiku', backend: 'anthropic', host: 'claude-code', runs: 1, expected: 3 }, null);
  assert.equal(result.trials, 1);
  assert.equal(result.failedTrials, 2);
  assert.equal(result.incomplete, 2);
  assert.equal(result.recall, 1);
  assert.equal(result.fpr, null);
  assert.equal(readRun(run.dir).records.length, 3);
});

// ---- 2b. failure streak ---------------------------------------------------------------------------

test(`${ERROR_STREAK_STOP} failed trials in a row stop the run; no summary is written`, async () => {
  const root = tmpdir();
  const run = newRun(makeSkill(root), { runs: 10 });
  let calls = 0;
  const out = await executeTrials({
    run, trials: trialsFor(10), workers: 1,
    doTrial: async () => { calls += 1; return ok('error', { error: 'Claude usage limit reached' }); },
  });
  assert.equal(out.stopped, 'Claude usage limit reached');
  assert.equal(calls, ERROR_STREAK_STOP);
  assert.equal(finishRun(run, { model: 'haiku', backend: 'anthropic', host: 'claude-code', runs: 10 }, out.stopped), null);
  const { meta, summary } = readRun(run.dir);
  assert.equal(summary, null);
  assert.equal(meta.stoppedReason, 'Claude usage limit reached');
  assert.equal(meta.interrupted, true);
});

test('a success resets the streak', async () => {
  const root = tmpdir();
  const run = newRun(makeSkill(root), { runs: 10 });
  let n = 0;
  const out = await executeTrials({
    run, trials: trialsFor(10).slice(0, 24), workers: 1,
    doTrial: async () => { n += 1; return n % 5 === 0 ? ok('triggered') : ok('error', { error: 'x' }); },
  });
  assert.equal(out.stopped, null);
  assert.equal(out.done, 24);
});

test('the first init event writes the offered tool list into meta.json, and not into rows', async () => {
  const root = tmpdir();
  const run = newRun(makeSkill(root), { runs: 1 });
  await executeTrials({
    run, trials: trialsFor(1), workers: 1,
    doTrial: async () => ok('triggered', { init: { model: 'claude-x', apiKeySource: 'none', skills: ['demo'], tools: ['Task', 'Bash'] } }),
  });
  const { meta, records } = readRun(run.dir);
  assert.deepEqual(meta.tools, ['Bash', 'Task']);
  assert.equal(meta.modelResolved, 'claude-x');
  assert.equal('init' in records[0], false);
});

// ---- 3. resume ------------------------------------------------------------------------------------

async function interruptedRun(root) {
  const skillDir = makeSkill(root);
  const run = newRun(skillDir, { runs: 2 });
  // 6 trials owed: q01#0 triggered, q01#1 error, q02#0 timeout, q02#1 not yet run, q03#0 ok, q03#1 not yet run
  run.append({ queryId: 'q01', run: 0, query: 'x', shouldTrigger: true, verdict: 'triggered' });
  run.append({ queryId: 'q01', run: 1, query: 'x', shouldTrigger: true, verdict: 'error', error: 'limit' });
  run.append({ queryId: 'q02', run: 0, query: 'x', shouldTrigger: true, verdict: 'timeout' });
  run.append({ queryId: 'q03', run: 0, query: 'x', shouldTrigger: false, verdict: 'not_triggered' });
  run.close(null, { interrupted: true });
  return { skillDir, dir: run.dir };
}

test('resume skips valid records, retries errors and timeouts, and then summarises', async () => {
  const root = tmpdir();
  const { dir } = await interruptedRun(root);
  const seen = [];
  const out = await resumeRun({
    dir, bin: 'unused', workers: 1,
    runTrialFn: async ({ query }) => { seen.push(query); return ok('triggered'); },
  });
  assert.equal(out.nothing, false);
  assert.equal(out.total, 4); // q01#1, q02#0, q02#1, q03#1
  assert.equal(seen.length, 4);
  const { meta, records, summary } = readRun(dir);
  assert.equal(records.length, 8); // 4 old + 4 new, failed ones stay as evidence
  assert.equal(summary.trials, 6);
  assert.equal(summary.failedTrials, 2); // the two failed attempts stay on record
  assert.equal(summary.incomplete, 0);
  assert.equal(meta.resumedAt.length, 1);
  assert.equal(meta.interrupted, false);
});

test('resume of a complete run has nothing to do and spends nothing', async () => {
  const root = tmpdir();
  const { dir } = await interruptedRun(root);
  await resumeRun({ dir, bin: 'unused', workers: 1, runTrialFn: async () => ok('triggered') });
  let called = false;
  const again = await resumeRun({ dir, bin: 'unused', runTrialFn: async () => { called = true; return ok(); } });
  assert.equal(again.nothing, true);
  assert.equal(called, false);
});

test('resume that keeps failing is flagged incomplete, and a further resume finishes it', async () => {
  const root = tmpdir();
  const { dir } = await interruptedRun(root);
  const first = await resumeRun({
    dir, bin: 'unused', workers: 1, runTrialFn: async () => ok('error', { error: 'still limited' }),
  });
  assert.equal(first.stopped, null); // 4 failures, below the streak limit
  assert.equal(first.result.incomplete, 4);
  assert.equal(readRun(dir).meta.incompleteTrials, 4);
  const second = await resumeRun({ dir, bin: 'unused', workers: 1, runTrialFn: async () => ok('triggered') });
  assert.equal(second.result.incomplete, 0);
  assert.equal(readRun(dir).summary.trials, 6);
});

test('a resume that hits the failure streak stops, writes no summary and can be resumed again', async () => {
  const root = tmpdir();
  const skillDir = makeSkill(root);
  const run = newRun(skillDir, { runs: 10 }); // 30 trials owed, none done
  run.close(null, { interrupted: true });
  const first = await resumeRun({
    dir: run.dir, bin: 'unused', workers: 1, runTrialFn: async () => ok('error', { error: 'still limited' }),
  });
  assert.equal(first.stopped, 'still limited');
  assert.equal(first.done, ERROR_STREAK_STOP);
  assert.equal(readRun(run.dir).summary, null);
  assert.equal(readRun(run.dir).meta.stoppedReason, 'still limited');
  const second = await resumeRun({ dir: run.dir, bin: 'unused', workers: 1, runTrialFn: async () => ok('triggered') });
  assert.equal(second.stopped, null);
  assert.equal(readRun(run.dir).summary.trials, 30);
  assert.equal(readRun(run.dir).meta.stoppedReason, undefined);
});

for (const [what, want] of [['model', { model: 'sonnet' }], ['runs', { runs: 3 }], ['backend', { backend: 'api.deepseek.com' }],
  ['maxExplore', { maxExplore: 3 }]]) {
  test(`resume refuses a changed ${what}`, async () => {
    const root = tmpdir();
    const { dir } = await interruptedRun(root);
    await assert.rejects(
      resumeRun({ dir, want, bin: 'unused', runTrialFn: async () => assert.fail('must not run') }),
      (e) => e.messageKey === 'resumeMismatch' && e.vars.what === what,
    );
    assert.equal(readRun(dir).records.length, 4); // nothing was appended
  });
}

test('resume accepts the same conditions spelled out', async () => {
  const root = tmpdir();
  const { dir } = await interruptedRun(root);
  const out = await resumeRun({
    dir, want: { model: 'haiku', runs: '2', maxExplore: '0', backend: 'anthropic' }, bin: 'unused', workers: 1,
    runTrialFn: async () => ok('triggered'),
  });
  assert.equal(out.nothing, false);
});

test('resume refuses an edited question set', async () => {
  const root = tmpdir();
  const { dir } = await interruptedRun(root);
  const file = path.join(dir, 'queries.json');
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  j.queries[0].query = 'a different question';
  fs.writeFileSync(file, JSON.stringify(j));
  await assert.rejects(
    resumeRun({ dir, bin: 'unused', runTrialFn: async () => assert.fail('must not run') }),
    (e) => e.messageKey === 'resumeQueriesChanged',
  );
});

test('resume refuses when SKILL.md changed', async () => {
  const root = tmpdir();
  const skillDir = makeSkill(root);
  const { fingerprint } = await import('../lib/queries.js');
  const run = openRun({
    skillDir, skillName: 'demo', host: 'claude-code', backend: 'anthropic', model: 'haiku', runs: 1, maxExplore: 0,
    skillFingerprint: fingerprint(skillDir),
    querySets: [{ id: 'main', file: 'q.json', sha256: querySetHash(QUERIES) }],
    queries: { queries: QUERIES },
  });
  run.close(null, { interrupted: true });
  fs.appendFileSync(path.join(skillDir, 'SKILL.md'), 'edited\n');
  await assert.rejects(
    resumeRun({ dir: run.dir, bin: 'unused', runTrialFn: async () => assert.fail('must not run') }),
    (e) => e.messageKey === 'resumeSkillChanged',
  );
});

// ---- 4. launching without a shell re-split --------------------------------------------------------

test('launchSpec: a .cmd shim with a JS entry runs under node with the prompt as one argument', () => {
  const root = tmpdir();
  const entry = path.join(root, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
  fs.mkdirSync(path.dirname(entry), { recursive: true });
  fs.writeFileSync(entry, '');
  const shim = path.join(root, 'claude.cmd');
  fs.writeFileSync(shim, '');
  const spec = launchSpec(shim, ['-p', 'fix the login & the "logout" page', '--model', 'haiku'], 'claude');
  assert.equal(spec.shell, false);
  assert.equal(spec.cmd, process.execPath);
  assert.deepEqual(spec.args, [entry, '-p', 'fix the login & the "logout" page', '--model', 'haiku']);
});

test('launchSpec: the shell fallback quotes every argument that needs it', () => {
  const root = tmpdir();
  const shim = path.join(root, 'claude.cmd');
  fs.writeFileSync(shim, '');
  const spec = launchSpec(shim, ['-p', 'two words', 'plain'], 'claude');
  assert.equal(spec.shell, true);
  assert.deepEqual(spec.args, ['-p', '"two words"', 'plain']);
});
