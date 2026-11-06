// The parts of a first run that have to work with nothing set up: Mac and Linux without a package manager, what enter
// may run, the version reply, a same-named repository, and the terminal flow itself. No network, nothing installed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installPlan, ensureTool, knownDirs } from '../lib/github.js';
import { assetName, ghBinDir, installGhRelease } from '../lib/ghrelease.js';
import { HOST_CLI, LOGIN, installCommand, isDownloadLike } from '../lib/findhost.js';
import { isNewer, checkForUpdate } from '../lib/update.js';
import { setLang } from '../lib/i18n.js';

setLang('en');
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sink = () => { const lines = []; return { lines, out: (l) => lines.push(l) }; };
const only = (...names) => ({ have: (c) => names.includes(c) });

test('without a package manager: Apple installs git, official releases install gh, and Windows still names the page', () => {
  assert.deepEqual(installPlan('git', 'darwin', only('xcode-select')).steps, [['xcode-select', '--install']]);
  assert.equal(installPlan('git', 'darwin', only('xcode-select')).gui, true);
  assert.deepEqual(installPlan('git', 'darwin', only('brew', 'xcode-select')).steps, [['brew', 'install', 'git']], 'Homebrew is still preferred');
  assert.equal(installPlan('gh', 'darwin', { ...only(), arch: 'arm64' }).release, true);
  assert.equal(installPlan('gh', 'linux', { ...only('apt-get'), arch: 'x64' }).release, true, 'no sudo needed');
  assert.equal(installPlan('gh', 'linux', { ...only('apt-get', 'sudo'), arch: 'x64' }).manager, 'apt-get', 'a package manager that can do it comes first');
  assert.equal(installPlan('gh', 'linux', { ...only(), arch: 'ia32' }), null);
  assert.equal(installPlan('gh', 'win32', only()), null);
  assert.equal(installPlan('git', 'linux', only()), null);
  assert.ok(knownDirs('linux').includes(ghBinDir()) && knownDirs('darwin').includes(ghBinDir()));
});

test('the release file follows the system, and a strange version is not a file name', () => {
  assert.equal(assetName('2.1.0', 'darwin', 'arm64'), 'gh_2.1.0_macOS_arm64.zip');
  assert.equal(assetName('2.1.0', 'linux', 'x64'), 'gh_2.1.0_linux_amd64.tar.gz');
  assert.equal(assetName('2.1.0', 'win32', 'x64'), null);
  assert.equal(assetName('2.1.0;rm', 'linux', 'x64'), null);
});

// A fake release: a real tar.gz on Linux and macOS tools, served from memory.
function fakeRelease({ corrupt = false, base = 'https://github.com/cli/cli/releases/download/v2.1.0/' } = {}) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-rel-'));
  const folder = path.join(work, 'gh_2.1.0_linux_amd64', 'bin');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'gh'), '#!/bin/sh\necho gh\n');
  const tar = path.join(work, 'a.tar.gz');
  execFileSync('tar', ['czf', tar, '-C', work, 'gh_2.1.0_linux_amd64']);
  const bytes = fs.readFileSync(tar);
  const sum = createHash('sha256').update(bytes).digest('hex');
  const files = {
    [`${base}gh_2.1.0_checksums.txt`]: `${corrupt ? '0'.repeat(64) : sum}  gh_2.1.0_linux_amd64.tar.gz\n`,
    [`${base}gh_2.1.0_linux_amd64.tar.gz`]: bytes,
  };
  const assets = Object.keys(files).map((u) => ({ name: u.split('/').pop(), browser_download_url: u }));
  return async (url) => {
    if (url.includes('api.github.com')) return { ok: true, json: async () => ({ tag_name: 'v2.1.0', assets }) };
    const body = files[url];
    return body == null ? { ok: false, status: 404 } : { ok: true, text: async () => String(body), arrayBuffer: async () => body };
  };
}

test('a release is kept only when it matches its checksum and comes from the project', { skip: process.platform === 'win32' }, async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-home-'));
  const opts = { platform: 'linux', arch: 'x64', home };
  await assert.rejects(installGhRelease({ ...opts, fetchImpl: fakeRelease({ corrupt: true }) }), /does not match its checksum/);
  assert.ok(!fs.existsSync(path.join(ghBinDir(home), 'gh')));
  await assert.rejects(installGhRelease({ ...opts, fetchImpl: fakeRelease({ base: 'https://evil.example/' }) }), /not in the release/);
  const to = await installGhRelease({ ...opts, fetchImpl: fakeRelease() });
  assert.equal(to, path.join(home, '.local', 'bin', 'gh'));
  assert.equal(execFileSync(to, { encoding: 'utf8' }).trim(), 'gh');
});

test('Apple\'s installer is waited for with enter, and can be left', async () => {
  const s = sink();
  let ready = false;
  const exec = (cmd) => { if (cmd === 'git' && !ready) throw new Error('missing'); return 'ok'; };
  const asked = [];
  const ok = await ensureTool('git', {
    exec, platform: 'darwin', exists: () => false, out: s.out, ctx: only('xcode-select'),
    run: () => ({ status: 1 }), // it also says 1 when its window is already open
    pick: async (title, options) => {
      asked.push(title);
      if (asked.length === 3) ready = true;
      return options[0].value;
    },
  });
  assert.equal(ok, true);
  assert.equal(asked.length, 3, 'install, then not ready, then ready');
  const stop = await ensureTool('git', { exec: () => { throw new Error('missing'); }, platform: 'darwin', exists: () => false, out: s.out, ctx: only('xcode-select'), run: () => ({ status: 0 }), pick: async (t, o) => (o.some((x) => x.value === 'stop') ? 'stop' : o[0].value) });
  assert.equal(stop, false);
});

test('a failed download of gh says why and names the page', async () => {
  const s = sink();
  const ok = await ensureTool('gh', { exec: () => { throw new Error('missing'); }, platform: 'linux', exists: () => false, out: s.out, ctx: { ...only(), arch: 'x64' }, pick: async (t, o) => o[0].value, release: async () => { throw new Error('offline'); } });
  assert.equal(ok, false);
  assert.ok(s.lines.some((l) => l.includes('offline')));
  assert.ok(s.lines.some((l) => l.includes('cli.github.com')));
});

test('files in a downloads-type folder are told apart from install locations', () => {
  const home = path.join(path.sep, 'home', 'a');
  for (const f of ['Downloads/claude', 'Desktop/x/codewhale', 'Documents/codebuddy']) assert.equal(isDownloadLike(path.join(home, f), home), true, f);
  for (const f of ['.local/bin/claude', 'bin/claude', 'Downloads-old/claude']) assert.equal(isDownloadLike(path.join(home, f), home), false, f);
});

test('Codex is offered from its official package, with a sign-in, like the other hosts', () => {
  assert.equal(HOST_CLI.codex.pkg, '@openai/codex');
  assert.equal(installCommand('codex', { writable: true }), 'npm install -g @openai/codex');
  assert.deepEqual(LOGIN.codex.args, ['login']);
});

test('a version reply that could change the update command is not a version', () => {
  assert.equal(isNewer('2.0.0', '1.0.0'), true);
  assert.equal(isNewer('2.0.0-beta.1', '1.0.0'), true);
  for (const bad of ['2.0.0-$(curl evil)', '2.0.0-a;rm', '2.0.0 ', '2.0.0-a b', '2.0.0-`x`', '9.9.9\nrm']) assert.equal(isNewer(bad, '1.0.0'), false, JSON.stringify(bad));
});

test('the update offer never carries a bad version from the registry', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sg-up-')), 'c.json');
  assert.equal(await checkForUpdate({ fetchLatest: async () => '9.0.0;rm', file, current: '1.0.0', env: {} }), null);
});

// ---- the flow on a real terminal, driven with a script: enter only, an empty machine, a host that answers ----

test('a same-named repository is not pushed to; the fork gets a name of its own', async () => {
  const { openPullRequest } = await import('../lib/submit.js');
  const { buildPackage, writePackage } = await import('../lib/submission.js');
  const { FACTS, makeRun, tmpdir } = await import('./_submit-fixture.mjs');
  const ctx = { home: 'C:\\Users\\alice', names: ['alice'], hosts: [], paths: ['C:\\Users\\alice'], secrets: [] };
  const r = await makeRun();
  const pkg = buildPackage({ runDir: r.runDir, skillDir: r.skillDir, facts: FACTS, contributor: 'octocat', ctx });
  const out = path.join(tmpdir(), 'pkg');
  writePackage(out, pkg);
  const flow = (parent) => {
    const calls = [];
    const exec = (cmd, args) => {
      calls.push([cmd, ...args].join(' '));
      if (args[0] === 'clone') fs.mkdirSync(args.at(-1), { recursive: true });
      if (cmd === 'gh' && args[0] === 'api') { if (parent === null) throw new Error('404'); return `${parent}\n`; }
      if (cmd === 'gh' && args[0] === 'pr') return 'https://github.com/SkillGauntlet/SkillGauntlet/pull/1\n';
      return '';
    };
    openPullRequest({ pkgDir: out, pkg, gh: { user: 'octocat', id: '1' }, exec, say: () => {} });
    return calls;
  };
  const other = flow('none');
  assert.ok(other.some((c) => c.includes('gh repo fork SkillGauntlet/SkillGauntlet --clone=false --fork-name SkillGauntlet-submissions')));
  assert.ok(other.some((c) => c.includes('https://github.com/octocat/SkillGauntlet-submissions.git')));
  assert.ok(!other.some((c) => c.includes('octocat/SkillGauntlet.git')));
  assert.ok(other.some((c) => c.includes('--head octocat:submit/')));
  for (const parent of [null, 'SkillGauntlet/SkillGauntlet', 'skillgauntlet/skillgauntlet']) {
    assert.ok(flow(parent).some((c) => c.includes('https://github.com/octocat/SkillGauntlet.git')), String(parent));
  }
  const forkOfOther = flow('someone/SkillGauntlet');
  assert.ok(forkOfOther.some((c) => c.includes('--fork-name')));
});

test('--lang and SG_LANG are not asked again; a piped run still works', () => {
  const run = (args, env = {}) => spawnSync(process.execPath, [path.join(ROOT, 'bin/skillgauntlet.js'), ...args], { encoding: 'utf8', input: '', env: { ...process.env, SG_NO_UPDATE_CHECK: '1', SG_LANG: '', ...env } });
  assert.doesNotMatch(run(['--lang', 'en']).stdout, /Language \/ |语言 \/ /);
  assert.doesNotMatch(run([], { SG_LANG: 'en' }).stdout, /Language \/ |语言 \/ /);
  assert.match(run([]).stdout, /Language|语言/);
});
