// Codewhale as a trigger host. No model is called: a fake CLI replays event shapes copied from live runs
// (2026-10-29, codewhale 0.10.2) and reports how it was launched.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runTrial, draftQueries, backendFor, HOSTS } from '../lib/trial.js';
import { judgeLine } from '../lib/codewhale.js';

const tmpdir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sg-cwt-'));

function makeSkill(root) {
  const dir = path.join(root, 'demo');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: demo\ndescription: demo skill\n---\nbody\n');
  return dir;
}

// Replays FAKE_EVENTS for `exec`, ignores `config set`, and writes what it saw to FAKE_REPORT.
function fakeCli(root) {
  const file = path.join(root, 'fake-codewhale.js');
  fs.writeFileSync(file, `
const fs = require('fs');
const path = require('path');
const argv = process.argv.slice(2);
if (argv[0] === 'config') { fs.appendFileSync(process.env.FAKE_REPORT + '.config', argv.join(' ') + '\\n'); process.exit(0); }
const home = process.env.USERPROFILE;
const skills = fs.existsSync(path.join(home, '.agents', 'skills')) ? fs.readdirSync(path.join(home, '.agents', 'skills')) : [];
fs.writeFileSync(process.env.FAKE_REPORT, JSON.stringify({ argv, skills, homeEqual: process.env.HOME === home, cwdEmpty: fs.readdirSync(process.cwd()).length === 0 }));
for (const e of JSON.parse(process.env.FAKE_EVENTS || '[]')) console.log(JSON.stringify(e));
`);
  return file;
}

async function run(events, { query = 'a prompt with spaces' } = {}) {
  const root = tmpdir();
  const report = path.join(root, 'report.json');
  const saved = { FAKE_EVENTS: process.env.FAKE_EVENTS, FAKE_REPORT: process.env.FAKE_REPORT };
  process.env.FAKE_EVENTS = JSON.stringify(events);
  process.env.FAKE_REPORT = report;
  try {
    const rec = await runTrial({ bin: fakeCli(root), skillDir: makeSkill(root), skillName: 'demo', query, model: 'deepseek-flash', host: 'codewhale' });
    return { rec, report: JSON.parse(fs.readFileSync(report, 'utf8')), config: fs.readFileSync(`${report}.config`, 'utf8') };
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}

const use = (input) => ({ type: 'tool_use', name: 'load_skill', id: 'x', input });
const done = { type: 'done' };

test('codewhale: a load_skill call naming the skill is triggered (shape from a live run)', async () => {
  const { rec } = await run([
    { type: 'content', content: "I'll load the dedupe skill" },
    use({ name: 'demo' }),
    use({ query: 'list files in workspace' }),
    { type: 'tool_result', name: 'load_skill', output: '# Skill: demo\n\n> demo skill' },
    done,
  ]);
  assert.equal(rec.verdict, 'triggered');
  assert.equal(rec.invokedSkill, 'demo');
  assert.equal(rec.host, 'codewhale');
});

test('codewhale: a search or a catalogue listing selects nothing, so no tool use is not_triggered', async () => {
  const { rec } = await run([use({ query: 'csv deduplicate' }), use({ name: 'list' }), done]);
  assert.equal(rec.verdict, 'not_triggered');
  const plain = await run([{ type: 'content', content: 'Canberra' }, done]);
  assert.equal(plain.rec.verdict, 'not_triggered');
});

test('codewhale: another skill name is other_skill; an error event is an error', async () => {
  assert.equal((await run([use({ name: 'other' }), done])).rec.verdict, 'other_skill');
  const failed = await run([{ type: 'error', error: 'Authentication Fails, Your api key: ****x is invalid' }]);
  assert.equal(failed.rec.verdict, 'error');
  assert.match(failed.rec.error, /Authentication Fails/);
});

test('codewhale: the trial runs in a throw-away home that holds only the tested skill, with one tool', async () => {
  const { report, config } = await run([done]);
  assert.deepEqual(report.skills, ['demo']);
  assert.ok(report.homeEqual, 'HOME and USERPROFILE point at the same throw-away directory');
  assert.ok(report.cwdEmpty, 'the working directory is empty');
  assert.equal(report.argv[report.argv.indexOf('--allowed-tools') + 1], 'load_skill');
  assert.ok(!report.argv.includes('--auto'));
  assert.equal(report.argv.at(-1), 'a prompt with spaces');
  assert.equal(report.argv.at(-2), '--');
  assert.match(config, /config set telemetry false/);
});

test('codewhale: judgeLine ignores events that decide nothing', () => {
  const rec = { tools: [], firstTool: null };
  assert.equal(judgeLine({ type: 'content', content: 'x' }, 'demo', rec), null);
  assert.equal(judgeLine({ type: 'turn_usage' }, 'demo', rec), null);
  assert.equal(judgeLine(use({ name: 'ns:demo' }), 'demo', rec).verdict, 'triggered');
});

test('codewhale: drafting joins the content events; the backend label names DeepSeek', async () => {
  assert.equal(backendFor('codewhale', 'deepseek-flash'), 'codewhale:api.deepseek.com');
  assert.ok(HOSTS.codewhale);
  const root = tmpdir();
  const drafted = JSON.stringify({ clauses: ['c1'], queries: [{ query: 'q1', should_trigger: true, clause: 'c1', note: 'n' }] });
  const half = Math.floor(drafted.length / 2);
  const file = path.join(root, 'fake-draft.js');
  fs.writeFileSync(file, `
for (const c of ${JSON.stringify([drafted.slice(0, half), drafted.slice(half)])}) console.log(JSON.stringify({ type: 'content', content: c }));
console.log(JSON.stringify({ type: 'done' }));
`);
  const qs = draftQueries({ bin: file, skillDir: makeSkill(root), skillName: 'demo', model: 'deepseek-flash', host: 'codewhale', timeout: 30 });
  assert.equal(qs.queries.length, 1);
});
