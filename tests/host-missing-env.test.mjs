// Offline tests: a missing host CLI gets a translated message, and the gain layer launches without a
// shell on a narrowed environment. Nothing here calls a model.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { requireHost, narrowEnv } from '../lib/trial.js';
import { setLang, errorText } from '../lib/i18n.js';
import { runGain } from '../lib/gain.js';

for (const host of ['codebuddy', 'codewhale']) {
  test(`${host}: a missing binary raises a translated, host-naming message`, () => {
    let err;
    try { requireHost(host, () => false); } catch (e) { err = e; }
    assert.ok(err, 'should throw');
    const bin = host;
    for (const [lang, install] of [['en', 'To install'], ['zh', '安装方法'], ['ja', 'インストール方法']]) {
      setLang(lang);
      const text = errorText(err);
      assert.match(text, new RegExp(host === 'codebuddy' ? 'CodeBuddy' : 'Codewhale'));
      assert.ok(text.includes(bin));
      assert.ok(text.includes(install), `${lang} carries an install hint`);
      assert.ok(!text.includes('{'), 'no unfilled placeholder');
    }
    setLang('en');
  });

  test(`${host}: an installed binary passes`, () => {
    assert.doesNotThrow(() => requireHost(host, () => true));
  });
}

test('narrowEnv keeps what a host CLI needs and drops unrelated secrets', () => {
  const env = narrowEnv({
    PATH: '/bin', Path: 'win', HOME: '/h', USERPROFILE: 'win', APPDATA: 'win', TEMP: 'win',
    ANTHROPIC_API_KEY: 'k', ANTHROPIC_BASE_URL: 'u', DEEPSEEK_API_KEY: 'd', CLAUDE_CODE_OAUTH_TOKEN: 'o',
    CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'x', GITHUB_TOKEN: 'g', NPM_TOKEN: 'n', OPENAI_API_KEY: 'o',
  });
  for (const k of ['PATH', 'Path', 'HOME', 'USERPROFILE', 'APPDATA', 'TEMP', 'ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL',
    'DEEPSEEK_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN']) assert.ok(k in env, `${k} kept`);
  for (const k of ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'GITHUB_TOKEN', 'NPM_TOKEN', 'OPENAI_API_KEY']) assert.ok(!(k in env), `${k} dropped`);
});

test('gain launches the host without a shell, with the prompt as one argument and a narrowed env', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-gain-env-'));
  const report = path.join(root, 'report.json');
  const fake = path.join(root, 'fake-claude.js');
  fs.writeFileSync(fake, `require('fs').writeFileSync(${JSON.stringify(report)}, JSON.stringify({ argv: process.argv.slice(2), secret: process.env.SG_TEST_SECRET || null, path: Boolean(process.env.PATH || process.env.Path) }));`);
  process.env.SG_TEST_SECRET = 'leak';
  try {
    const cdir = path.join(root, 'contracts');
    fs.mkdirSync(cdir);
    fs.writeFileSync(path.join(cdir, 'demo.json'), JSON.stringify({ skill: 'demo',
      tasks: [{ id: 't1', prompt: 'write a file called out.txt with two words' }],
      contracts: [{ desc: 'a file was added', type: 'files_added_matching', glob: '*.txt' }] }));
    await runGain({ bin: fake, skillDir: null, skillName: 'demo', timeout: 30, contractDir: cdir });
    const r = JSON.parse(fs.readFileSync(report, 'utf8'));
    assert.equal(r.secret, null, 'unrelated variable not passed on');
    assert.ok(r.path);
    assert.equal(r.argv[0], '-p');
    assert.equal(r.argv[1], 'write a file called out.txt with two words', 'prompt is one raw argument');
  } finally {
    delete process.env.SG_TEST_SECRET;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
