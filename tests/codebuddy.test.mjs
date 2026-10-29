// CodeBuddy Code as a trigger host. No model is called: a fake CLI replays event shapes copied from a
// live run (2026-10-29, codebuddy 2.177.1) and reports how it was launched.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runTrial, HOSTS, backendFor } from '../lib/trial.js';

const tmpdir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sg-cb-test-'));

function makeSkill(root) {
  const dir = path.join(root, 'demo');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: demo\ndescription: demo skill\n---\nbody\n');
  return dir;
}

// Replays FAKE_EVENTS and writes its argv and the skill directories it can see to FAKE_REPORT.
function fakeCli(root) {
  const file = path.join(root, 'fake-codebuddy.js');
  fs.writeFileSync(file, `
const fs = require('fs');
const evs = JSON.parse(process.env.FAKE_EVENTS || '[]');
const seen = ['.claude/skills/demo', '.codebuddy/skills/demo'].filter((p) => fs.existsSync(p));
fs.writeFileSync(process.env.FAKE_REPORT, JSON.stringify({ argv: process.argv.slice(2), seen }));
for (const e of evs) console.log(JSON.stringify(e));
`);
  return file;
}

async function run(events, { skillName = 'demo' } = {}) {
  const root = tmpdir();
  const report = path.join(root, 'report.json');
  const skillDir = makeSkill(root);
  const saved = { FAKE_EVENTS: process.env.FAKE_EVENTS, FAKE_REPORT: process.env.FAKE_REPORT };
  process.env.FAKE_EVENTS = JSON.stringify(events);
  process.env.FAKE_REPORT = report;
  try {
    const rec = await runTrial({ bin: fakeCli(root), skillDir, skillName, query: 'a prompt with spaces', host: 'codebuddy', maxExplore: 3 });
    return { rec, report: JSON.parse(fs.readFileSync(report, 'utf8')) };
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}

const init = { type: 'system', subtype: 'init', model: 'default-model', apiKeySource: 'www.codebuddy.ai', tools: ['Skill', 'Read'] };

test('codebuddy: the skill goes to .codebuddy/skills, and the launch restricts tools', async () => {
  const { rec, report } = await run([init, { type: 'result', subtype: 'success', is_error: false, result: 'Canberra' }]);
  assert.deepEqual(report.seen, ['.codebuddy/skills/demo']);
  assert.equal(rec.host, 'codebuddy');
  const i = report.argv.indexOf('--tools');
  assert.equal(report.argv[i + 1], HOSTS.codebuddy.tools);
  assert.ok(!report.argv.includes('--include-partial-messages'));
  assert.ok(report.argv.includes('a prompt with spaces'));
  assert.deepEqual(report.argv.slice(report.argv.indexOf('--allowedTools') + 1, report.argv.indexOf('--allowedTools') + 4), ['Read', 'Glob', 'Grep']);
});

test('codebuddy: a Skill tool_use naming the skill is triggered (shape from a live run)', async () => {
  const { rec } = await run([
    init,
    { type: 'assistant', message: { content: [{ type: 'text', text: "I'll use the CSV dedupe skill for this." }] } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'demo', args: 'leads.csv' } }] } },
  ]);
  assert.equal(rec.verdict, 'triggered');
  assert.equal(rec.invokedSkill, 'demo');
});

test('codebuddy: an answer without a tool is not_triggered; another skill is other_skill', async () => {
  const none = await run([init, { type: 'assistant', message: { content: [{ type: 'text', text: 'Canberra' }] } },
    { type: 'result', subtype: 'success', is_error: false, result: 'Canberra' }]);
  assert.equal(none.rec.verdict, 'not_triggered');
  const other = await run([init, { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'other' } }] } }]);
  assert.equal(other.rec.verdict, 'other_skill');
});

test('codebuddy: "Authentication required" is an error, not a miss', async () => {
  const { rec } = await run([
    init,
    { type: 'assistant', message: { content: [{ type: 'text', text: 'Authentication required. Please use /login command to sign in to your account' }] } },
    { type: 'result', subtype: 'error_during_execution', is_error: true, errors: ['Authentication required. Please use /login command to sign in to your account'] },
  ]);
  assert.equal(rec.verdict, 'error');
});

test('claude-code stays the default host, and codebuddy has its own backend label', async () => {
  assert.equal(backendFor('codebuddy'), 'codebuddy');
  const root = tmpdir();
  const skillDir = makeSkill(root);
  process.env.FAKE_EVENTS = '[]';
  process.env.FAKE_REPORT = path.join(root, 'r.json');
  try {
    const rec = await runTrial({ bin: fakeCli(root), skillDir, skillName: 'demo', query: 'q' });
    assert.equal(rec.host, 'claude-code');
    assert.deepEqual(JSON.parse(fs.readFileSync(process.env.FAKE_REPORT, 'utf8')).seen, ['.claude/skills/demo']);
  } finally { delete process.env.FAKE_EVENTS; delete process.env.FAKE_REPORT; }
});

test('codebuddy: a drafting reply that is a message list is read from its result element', async () => {
  const { draftQueries } = await import('../lib/trial.js');
  const root = tmpdir();
  const skillDir = makeSkill(root);
  const drafted = { clauses: ['c1'], queries: [{ query: 'q1', should_trigger: true, clause: 'c1', note: 'n' }] };
  const file = path.join(root, 'fake-draft.js');
  fs.writeFileSync(file, `console.log(JSON.stringify([{ type: 'message', role: 'user', content: [] }, { type: 'reasoning' },
    { type: 'result', subtype: 'success', result: ${JSON.stringify(JSON.stringify(drafted))} }]));`);
  const qs = draftQueries({ bin: file, skillDir, skillName: 'demo', model: null, host: 'codebuddy', timeout: 30 });
  assert.equal(qs.queries.length, 1);
  assert.equal(qs.queries[0].shouldTrigger, true);
});

test('codebuddy + a DeepSeek model: models.json goes in the trial directory, with no key in it', async () => {
  const { codebuddyModelsJson, isDeepseekModel, backendFor } = await import('../lib/trial.js');
  assert.ok(isDeepseekModel('deepseek-flash') && !isDeepseekModel('haiku') && !isDeepseekModel(null));
  assert.equal(backendFor('codebuddy', 'deepseek-flash'), 'codebuddy:api.deepseek.com');
  const cfg = JSON.parse(codebuddyModelsJson('deepseek-flash'));
  assert.equal(cfg.models[0].apiKey, '${DEEPSEEK_API_KEY}');
  assert.deepEqual(cfg.availableModels, ['deepseek-flash']);
  assert.ok(!/sk-/.test(JSON.stringify(cfg)));

  const root = tmpdir();
  const file = path.join(root, 'fake-cb.js');
  fs.writeFileSync(file, `
const fs = require('fs');
fs.writeFileSync(process.env.FAKE_REPORT, JSON.stringify({ argv: process.argv.slice(2), models: fs.existsSync('.codebuddy/models.json') }));
console.log(JSON.stringify({ type: 'result', is_error: false }));
`);
  const report = path.join(root, 'r.json');
  process.env.FAKE_REPORT = report;
  try {
    await runTrial({ bin: file, skillDir: makeSkill(root), skillName: 'demo', query: 'q', model: 'deepseek-flash', host: 'codebuddy' });
  } finally { delete process.env.FAKE_REPORT; }
  const seen = JSON.parse(fs.readFileSync(report, 'utf8'));
  assert.equal(seen.models, true);
  assert.equal(seen.argv[seen.argv.indexOf('--model') + 1], 'deepseek-flash');
});

test('codex + a DeepSeek model: the provider is passed inline, the key by environment name only', async () => {
  const { runCodexTrial } = await import('../lib/codex.js');
  const root = tmpdir();
  const file = path.join(root, 'fake-codex.js');
  fs.writeFileSync(file, `require('fs').writeFileSync(process.env.FAKE_REPORT, JSON.stringify(process.argv.slice(2))); console.log('{"type":"turn.completed"}');`);
  const report = path.join(root, 'r.json');
  process.env.FAKE_REPORT = report;
  try {
    await runCodexTrial({ bin: file, skillDir: null, skillName: 'demo', query: 'q', model: 'deepseek-flash', timeout: 30 });
  } finally { delete process.env.FAKE_REPORT; }
  const argv = JSON.parse(fs.readFileSync(report, 'utf8'));
  assert.ok(argv.includes('--ignore-user-config'));
  assert.ok(argv.some((a) => a.startsWith('model_providers.deepseek=') && a.includes('env_key="DEEPSEEK_API_KEY"')));
  assert.ok(argv.includes('model_provider="deepseek"'));
  const cat = argv.find((a2) => a2.startsWith('model_catalog_json='));
  assert.ok(cat, 'a catalog carrying auto_review_model_override is passed');
  const { deepseekCatalog } = await import('../lib/codex.js');
  const entry = JSON.parse(deepseekCatalog('deepseek-flash')).models[0];
  assert.equal(entry.slug, 'deepseek-flash');
  assert.equal(entry.auto_review_model_override, 'deepseek-flash');
  assert.ok(!argv.some((a) => /sk-[A-Za-z0-9]/.test(a)));
});
