// Fixes from the first hands-on test of skillgauntlet@1.1.1: repository discovery, host ping, wording.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findSkills } from '../lib/discover.js';
import { pingHost } from '../lib/trial.js';
import { setLang, t, errorText, messageTables } from '../lib/i18n.js';
import { fileURLToPath } from 'node:url';
const ROOT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const write = (root, rel, body) => {
  fs.mkdirSync(path.join(root, rel), { recursive: true });
  fs.writeFileSync(path.join(root, rel, 'SKILL.md'), body);
};

test('repository scan finds skills under .claude and drops identical copies', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-disc-'));
  write(root, '.claude/skills/main', '---\nname: main\n---\nbody');
  write(root, '.claude/skills/design', '---\nname: design\n---\nbody');
  write(root, 'cli/assets/skills/design', '---\nname: design\n---\nbody');
  write(root, 'cli/assets/skills/other', '---\nname: other\n---\nbody');
  write(root, '.git/skills/hidden', 'x');
  const names = findSkills(root).map((d) => path.relative(root, d).replace(/\\/g, '/'));
  assert.deepEqual(names, ['.claude/skills/design', '.claude/skills/main', 'cli/assets/skills/other']);
  fs.rmSync(root, { recursive: true, force: true });
});

test('a same-named skill with different content is kept', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-disc-'));
  write(root, 'a/skills/foo', 'one');
  write(root, 'b/skills/foo', 'two');
  assert.equal(findSkills(root).length, 2);
  fs.rmSync(root, { recursive: true, force: true });
});

test('pingHost turns a failed, silent or empty call into a translatable message with the CLI own words', () => {
  const ok = { status: 0, stdout: '{"type":"result","result":"OK"}', stderr: '' };
  const timedOut = { status: null, signal: 'SIGTERM', stdout: '', stderr: '' };
  const noLogin = { status: 1, stdout: '', stderr: 'Please run /login\nmore' };
  // CodeBuddy exits 0 with nothing on stdout and the complaint on stderr for a custom model without an url
  const exitZeroEmpty = { status: 0, stdout: '', stderr: 'Custom model x has no endpoint url configured.\n' };
  const errorResult = { status: 0, stdout: JSON.stringify([{ type: 'result', is_error: true, result: 'model not found\nmore' }]), stderr: '' };
  const call = (r) => () => pingHost('codebuddy', { bin: 'codebuddy', spawn: () => r });
  assert.throws(call(timedOut), (e) => e.messageKey === 'hostNotReady' && /90s/.test(e.vars.why));
  assert.throws(call(noLogin), (e) => e.vars.why === 'Please run /login');
  assert.throws(call(exitZeroEmpty), (e) => /no endpoint url/.test(e.vars.why));
  assert.throws(call(errorResult), (e) => e.vars.why === 'model not found');
  assert.doesNotThrow(call(ok));
  assert.doesNotThrow(() => pingHost('codewhale', { bin: 'codewhale', spawn: () => timedOut }));
});

test('the not-signed-in message exists in every language and names /login', () => {
  for (const lang of ['zh', 'en', 'ja']) {
    setLang(lang);
    const msg = errorText({ messageKey: 'hostNotReady', vars: { host: 'CodeBuddy', why: 'w' } });
    assert.match(msg, /\/login/);
    assert.ok(t('modelOptionalQ').length > 0);
  }
  setLang('en');
});

test('no estimate or hint promises "no cash"', () => {
  for (const [lang, table] of Object.entries(messageTables())) {
    for (const key of ['draftFirst', 'trialsQ', 'codewhaleNote']) {
      assert.doesNotMatch(String(table[key]), /no cash|不花现金|无现金|現金不要|現金はかから|cents|几分钱|数セント/, `${lang}.${key}`);
    }
  }
});

test('browseDir walks folders with a scripted selection and can hand over to typing', async () => {
  const { browseDir } = await import('../lib/browse.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-browse-'));
  fs.mkdirSync(path.join(root, 'a', 'inner'), { recursive: true });
  fs.mkdirSync(path.join(root, '.hidden'));
  fs.writeFileSync(path.join(root, 'a', 'SKILL.md'), 'x');
  setLang('en');
  const seen = [];
  const script = (steps) => async (title, options) => {
    seen.push(options.map((o) => o.label));
    return steps.shift()(options);
  };
  const go = (name) => (opts) => opts.find((o) => o.label === name).value;
  const picked = await browseDir(script([go(`a${path.sep}`), go('✔ Use this folder')]), root);
  assert.equal(picked, path.join(root, 'a'));
  assert.ok(!seen[0].some((l) => l.startsWith('.hidden')), 'plain dot folders are not offered');
  assert.equal(await browseDir(script([go('✎ Type a path…')]), root), null);
  fs.rmSync(root, { recursive: true, force: true });
});

test('the wait bar draws its label and counts seconds, and the wrapper is a no-op without a terminal', async () => {
  const { TICKER_SCRIPT, withTicker } = await import('../lib/ticker.js');
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, ['-e', TICKER_SCRIPT, 'drafting', '{s} s', 'Ctrl+C aborts', '1'], { encoding: 'utf8', timeout: 1600, killSignal: 'SIGKILL' });
  assert.match(r.stdout, /drafting/);
  assert.match(r.stdout, /1 s/);
  assert.match(r.stdout, /Ctrl\+C aborts/);
  assert.equal(withTicker({ label: 'x', elapsed: '{s}', abortHint: 'h' }, () => 42), 42);
});

test('model lists are read from the host and any failure gives an empty list', async () => {
  const { parseCodebuddyModels, parseCodexModels, hostModels } = await import('../lib/models.js');
  assert.deepEqual(parseCodebuddyModels('  --model <model>  Model. Currently supported: (hy3, deepseek-v4-pro, custom-local:x)\n'), ['hy3', 'deepseek-v4-pro', 'custom-local:x']);
  assert.deepEqual(parseCodebuddyModels('no list here'), []);
  const json = JSON.stringify({ models: [{ slug: 'a', visibility: 'list' }, { slug: 'b', visibility: 'hide' }] });
  assert.deepEqual(parseCodexModels(json), ['a']);
  assert.deepEqual(parseCodexModels('not json'), []);
  assert.deepEqual(hostModels('codex', 'codex', () => json), ['a']);
  assert.deepEqual(hostModels('codex', 'codex', () => { throw new Error('x'); }), []);
  assert.deepEqual(hostModels('codewhale', 'codewhale', () => json), []);
});

test('the quick tier asks for enough negatives that its result can be graded', async () => {
  const { DEPTHS, minutesFor } = await import('../lib/depth.js');
  assert.ok(DEPTHS.quick.negatives * DEPTHS.quick.runs >= 10);
  assert.equal(minutesFor(24), 1);
  assert.equal(minutesFor(300), 10);
});

test('searchHost finds the exact name first and ignores unrelated variants', async () => {
  const { searchHost, installCommand, installHost } = await import('../lib/findhost.js');
  const win = process.platform === 'win32';
  const exact = win ? 'codewhale.exe' : 'codewhale';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-find-'));
  fs.writeFileSync(path.join(dir, 'codewhale-notes.txt'), 'x');
  fs.writeFileSync(path.join(dir, win ? 'codewhale-code.cmd' : 'codewhale-code'), 'x'); // a different tool sharing the prefix
  if (win) {
    // a Windows release asset keeps its platform suffix and is found one folder down, without renaming
    const dl = path.join(dir, 'codewhale-win');
    fs.mkdirSync(dl);
    fs.writeFileSync(path.join(dl, 'codewhale-windows-x64.exe'), 'x');
    assert.deepEqual(searchHost('codewhale', [dir]).map((f) => path.basename(f)), ['codewhale-windows-x64.exe']);
  } else {
    assert.deepEqual(searchHost('codewhale', [dir]), []);
  }
  fs.writeFileSync(path.join(dir, exact), 'x');
  assert.equal(path.basename(searchHost('codewhale', [dir])[0]), exact);
  assert.equal(installCommand('codewhale'), 'npm install -g codewhale --allow-scripts=codewhale');
  assert.match(installCommand('codebuddy'), /^npm install -g @tencent-ai\/codebuddy-code$/);
  const ran = [];
  installHost('codebuddy', (c) => ran.push(c));
  assert.equal(ran.length, 1);
  assert.throws(() => installHost('nothing'), /no installer/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a skill is known by its frontmatter name, not by the folder it sits in', async () => {
  const { skillNameOf } = await import('../lib/discover.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-name-'));
  const dir = path.join(root, 'ruvnet__ruflo');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: ruflo\ndescription: x\n---\nbody');
  assert.equal(skillNameOf(dir), 'ruflo');
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\ndescription: x\n---\nbody');
  assert.equal(skillNameOf(dir), 'ruvnet__ruflo');
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: "has spaces & slashes/"\n---\nbody');
  assert.equal(skillNameOf(dir), 'ruvnet__ruflo');
  fs.rmSync(root, { recursive: true, force: true });
});

test('the update check: newer versions, declining, caching, and every failure means no update', async () => {
  const { isNewer, checkForUpdate, declineUpdate } = await import('../lib/update.js');
  assert.ok(isNewer('1.2.1', '1.2.0') && isNewer('2.0.0', '1.9.9') && isNewer('1.2.0', '1.2.0-rc.1'));
  assert.ok(!isNewer('1.2.0', '1.2.0') && !isNewer('1.1.9', '1.2.0') && !isNewer('garbage', '1.2.0') && !isNewer('1.2.0-rc.1', '1.2.0'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-upd-'));
  const file = path.join(dir, 'u.json');
  let calls = 0;
  const fetchLatest = async () => { calls += 1; return '1.3.0'; };
  const base = { file, current: '1.2.0', env: {}, now: 1000 };
  assert.deepEqual(await checkForUpdate({ ...base, fetchLatest }), { current: '1.2.0', latest: '1.3.0' });
  await checkForUpdate({ ...base, fetchLatest, now: 2000 }); // inside 12 h: answered from the cache
  assert.equal(calls, 1);
  declineUpdate('1.3.0', file);
  assert.equal(await checkForUpdate({ ...base, fetchLatest, now: 3000 }), null);
  const newer = async () => '1.4.0';
  assert.equal((await checkForUpdate({ ...base, fetchLatest: newer, now: 1000 + 13 * 3600 * 1000 })).latest, '1.4.0');
  const boom = async () => { throw new Error('offline'); };
  assert.equal(await checkForUpdate({ file: path.join(dir, 'none.json'), current: '1.2.0', env: {}, fetchLatest: boom }), null);
  assert.equal(await checkForUpdate({ ...base, fetchLatest, env: { SG_NO_UPDATE_CHECK: '1' }, file: path.join(dir, 'x.json') }), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('--version prints the package version', async () => {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT_DIR, 'bin', 'skillgauntlet.js'), '--version'], { encoding: 'utf8' });
  assert.equal(r.stdout.trim(), JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8')).version);
});

test('a typed model the host does not list is caught before anything is spent', async () => {
  const { unknownModel } = await import('../lib/models.js');
  const known = ['hy3', 'deepseek-v4.1-flash'];
  assert.deepEqual(unknownModel('custom-local:deepseek-flash', known), known);
  assert.equal(unknownModel('hy3', known), null);
  assert.equal(unknownModel(null, known), null);      // the default model
  assert.equal(unknownModel('deepseek-flash', known), null); // the package's own DeepSeek route
  assert.equal(unknownModel('anything', []), null);   // the list could not be read: do not block
});

test('no message says how a backend is billed; cost is left to the backend and the plan', () => {
  const claims = /spends weekly quota|bills per use|billed by DeepSeek|spends DeepSeek cash|占周额度|按 DeepSeek 用量|花 DeepSeek 现金|週間の利用枠を消費|DeepSeek の従量課金|現金がかかります/;
  for (const [lang, table] of Object.entries(messageTables())) {
    for (const [key, value] of Object.entries(table)) assert.doesNotMatch(String(value), claims, `${lang}.${key}`);
  }
});

test('a DeepSeek model the host lists itself needs no key; an unlisted deepseek-* name takes the package route', async () => {
  const { usesOwnDeepseek, setNativeModels, backendFor } = await import('../lib/trial.js');
  setNativeModels('codebuddy', ['hy3', 'deepseek-v4.1-flash']);
  assert.equal(usesOwnDeepseek('codebuddy', 'deepseek-v4.1-flash'), false);
  assert.equal(usesOwnDeepseek('codebuddy', 'deepseek-flash'), true);
  assert.equal(usesOwnDeepseek('codebuddy', 'hy3'), false);
  assert.equal(usesOwnDeepseek('codebuddy', null), false);
  assert.equal(backendFor('codebuddy', 'deepseek-v4.1-flash'), 'codebuddy');
  assert.equal(backendFor('codebuddy', 'deepseek-flash'), 'codebuddy:api.deepseek.com');
  setNativeModels('codebuddy', []);
});

test('the full report lists every question with what was expected, what happened and what the model did', async () => {
  const { trialSection } = await import('../lib/report.js');
  setLang('en');
  const queries = [
    { id: 'q01', query: 'build a landing page | with a pipe', shouldTrigger: true, clause: 'design', note: 'new page' },
    { id: 'q02', query: 'refactor this button', shouldTrigger: true, clause: 'design', note: 'component' },
    { id: 'q03', query: 'review this diff', shouldTrigger: false, clause: 'design', shares: 'review', note: 'plain code review' },
  ];
  const records = [
    { queryId: 'q01', run: 0, shouldTrigger: true, verdict: 'triggered', invokedSkill: 'demo', firstTool: 'Skill' },
    { queryId: 'q02', run: 0, shouldTrigger: true, verdict: 'not_triggered', firstTool: 'Bash' },
    { queryId: 'q03', run: 0, shouldTrigger: false, verdict: 'triggered', invokedSkill: 'demo', firstTool: 'Skill' },
  ];
  const trial = {
    host: 'codebuddy', backend: 'codebuddy', model: 'm', runs: 1, trials: 3, recall: 0.5, fpr: 1, noToolRate: 0,
    questions: [
      { query: queries[0].query, shouldTrigger: true, hits: 1, n: 1 },
      { query: queries[1].query, shouldTrigger: true, hits: 0, n: 1 },
      { query: queries[2].query, shouldTrigger: false, hits: 1, n: 1 },
    ],
    queries,
  };
  const md = trialSection(trial, records);
  assert.match(md, /At a glance/);
  assert.match(md, /Clause: design/);
  assert.match(md, /\| should trigger \| triggered \| ✓ \| build a landing page \\| with a pipe \| invoked skill demo \|/);
  assert.match(md, /\| should trigger \| did not trigger \| ✗ \| refactor this button \| Bash \|/);
  assert.match(md, /\| should not \| false trigger 1\/1 \| ✗ \| review this diff \|.*borrowed words: review/);
  assert.match(md, /The 1 misses: what the model did instead/);
  // without the run records the old compact table is still produced
  assert.match(trialSection(trial, null), /\| 1\/1 \|/);
  setLang('en');
});

test('what the model said and did first is kept beside the run, not in the raw rows', async () => {
  const { executeTrials } = await import('../lib/execute.js');
  const { addSaid, inputSummary, SAID_LIMIT } = await import('../lib/trial.js');
  const rows = [];
  const answers = [];
  const run = { meta: { tools: [1] }, patch() {}, append: (r) => rows.push(r), appendAnswer: (a) => answers.push(a) };
  const doTrial = async () => ({ host: 'x', verdict: 'not_triggered', firstTool: 'Bash', said: 'Let me look.', firstInput: 'ls -la' });
  await executeTrials({ run, trials: [{ q: { id: 'q01', query: 'qq', shouldTrigger: true }, i: 0 }], doTrial });
  assert.equal(rows.length, 1);
  assert.ok(!('said' in rows[0]) && !('firstInput' in rows[0]), 'the raw row, which is what gets submitted, carries neither');
  assert.deepEqual(answers, [{ queryId: 'q01', run: 0, said: 'Let me look.', firstInput: 'ls -la' }]);
  const rec = {};
  addSaid(rec, 'a'.repeat(SAID_LIMIT + 500));
  assert.equal(rec.said.length, SAID_LIMIT);
  assert.equal(inputSummary('Bash', { command: 'ls -la' }), 'ls -la');
  assert.equal(inputSummary('Read', { file_path: 'a.md' }), 'a.md');
  assert.equal(inputSummary('Bash', {}), '');
});

test('the report shows what the model said and did first, and says a trial stops at the first action', async () => {
  const { trialSection } = await import('../lib/report.js');
  setLang('en');
  const queries = [{ id: 'q01', query: 'refactor this button', shouldTrigger: true, clause: 'design', note: 'component' }];
  const records = [{ queryId: 'q01', run: 0, shouldTrigger: true, verdict: 'not_triggered', firstTool: 'Bash' }];
  const trial = {
    host: 'codebuddy', backend: 'b', model: 'm', runs: 1, trials: 1, recall: 0, fpr: null, noToolRate: 0,
    questions: [{ query: 'refactor this button', shouldTrigger: true, hits: 0, n: 1 }], queries,
  };
  const answers = new Map([['q01#0', { queryId: 'q01', run: 0, said: 'I will check the repo first.\nThen edit.', firstInput: 'ls -la' }]]);
  const md = trialSection(trial, records, answers);
  assert.match(md, /Per question: what the model said and did first/);
  assert.match(md, /stops at the model's first action/);
  assert.match(md, /- Bash: `ls -la`/);
  assert.match(md, /Before acting it said:\n\n {4}> I will check the repo first\.\n {4}> Then edit\./);
  assert.doesNotMatch(trialSection(trial, records, new Map()), /Per question: what the model said/);
});

test('the CodeBuddy catalog is read from its cache even when --help lists only a few models', async () => {
  const { catalogFromTexts, codebuddyCatalog } = await import('../lib/models.js');
  const entry = JSON.stringify([{ userId: 'u', data: { agents: [{ name: 'cli', models: ['hy3', 'glm-5.3', 'deepseek-v4-pro'], tools: ['Read'] }, { name: 'x', models: ['hy3', 'bad name!'] }] } }]);
  assert.deepEqual(catalogFromTexts([entry, 'not json']).sort(), ['deepseek-v4-pro', 'glm-5.3', 'hy3']);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-cat-'));
  fs.writeFileSync(path.join(dir, 'entry_1.info'), entry);
  fs.writeFileSync(path.join(dir, 'other.txt'), '{"models":["nope-x"]}');
  assert.deepEqual(codebuddyCatalog(dir).sort(), ['deepseek-v4-pro', 'glm-5.3', 'hy3']);
  assert.deepEqual(codebuddyCatalog(path.join(dir, 'missing')), []);
  fs.rmSync(dir, { recursive: true, force: true });
});
