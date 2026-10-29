// Fixes from the first hands-on test of skillgauntlet@1.1.1: repository discovery, host ping, wording.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findSkills } from '../lib/discover.js';
import { pingHost } from '../lib/trial.js';
import { setLang, t, errorText, messageTables } from '../lib/i18n.js';

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

test('pingHost turns a failed or silent call into a translatable message', () => {
  const timedOut = () => { const e = new Error('x'); e.killed = true; throw e; };
  const noLogin = () => { const e = new Error('x'); e.stderr = 'Please run /login\nmore'; throw e; };
  assert.throws(() => pingHost('codebuddy', { bin: 'codebuddy', run: timedOut }), (e) => e.messageKey === 'hostNotReady' && /90s/.test(e.vars.why));
  assert.throws(() => pingHost('codebuddy', { bin: 'codebuddy', run: noLogin }), (e) => e.vars.why === 'Please run /login');
  assert.doesNotThrow(() => pingHost('codebuddy', { bin: 'codebuddy', run: () => '{}' }));
  assert.doesNotThrow(() => pingHost('codewhale', { bin: 'codewhale', run: timedOut }));
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
    for (const key of ['draftFirst', 'trialsQ', 'provClaudeHint', 'provDeepseekHint']) {
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
