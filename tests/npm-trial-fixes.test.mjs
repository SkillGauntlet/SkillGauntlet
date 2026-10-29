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
    for (const key of ['codebuddyEstimate', 'provClaudeHint', 'provDeepseekHint', 'codewhaleEstimate']) {
      assert.doesNotMatch(String(table[key]), /no cash|不花现金|无现金|現金不要|現金はかから|cents|几分钱|数セント/, `${lang}.${key}`);
    }
  }
});
