// A machine with nothing installed: the tools it needs and the wait after the pull request, all with fakes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installPlan, ensureTool, ensureSignedIn, loginArgs, claState, watchPullRequest, addKnownDirsToPath } from '../lib/github.js';
import { setLang } from '../lib/i18n.js';

setLang('en');
const sink = () => { const lines = []; return { lines, out: (l) => lines.push(l) }; };
const throwing = () => { throw new Error('not found'); };

test('the install command follows the system and the package manager found on it', () => {
  const only = (...names) => ({ have: (c) => names.includes(c) });
  const w = installPlan('gh', 'win32', only('winget'));
  assert.deepEqual(w.steps[0].slice(0, 4), ['winget', 'install', '--id', 'GitHub.cli']);
  assert.equal(w.sudo, false);
  assert.deepEqual(installPlan('git', 'win32', only('choco')).steps, [['choco', 'install', 'git', '-y']]);
  assert.deepEqual(installPlan('git', 'win32', only('scoop')).steps, [['scoop', 'install', 'git']]);
  assert.deepEqual(installPlan('git', 'darwin', only('brew')).steps, [['brew', 'install', 'git']]);
  // Linux: the first manager found, run through sudo, with the package name that manager uses
  const apt = installPlan('gh', 'linux', only('apt-get', 'sudo'));
  assert.deepEqual(apt.steps, [['sudo', 'apt-get', 'update'], ['sudo', 'apt-get', 'install', '-y', 'gh']]);
  assert.equal(apt.sudo, true);
  assert.deepEqual(installPlan('gh', 'linux', only('pacman', 'sudo')).steps, [['sudo', 'pacman', '-S', '--noconfirm', 'github-cli']]);
  assert.deepEqual(installPlan('git', 'linux', only('dnf', 'sudo')).steps, [['sudo', 'dnf', 'install', '-y', 'git']]);
  assert.deepEqual(installPlan('git', 'linux', only('zypper', 'sudo')).steps, [['sudo', 'zypper', '--non-interactive', 'install', 'git']]);
  assert.deepEqual(installPlan('gh', 'linux', only('apk', 'sudo')).steps, [['sudo', 'apk', 'add', 'github-cli']]);
  // root needs no sudo; a user with neither root nor sudo gets no plan
  assert.deepEqual(installPlan('git', 'linux', { ...only('apt-get'), uid: 0 }).steps[1], ['apt-get', 'install', '-y', 'git']);
  assert.equal(installPlan('git', 'linux', only('apt-get')), null);
  // nothing found, or a tool that is not known
  assert.equal(installPlan('git', 'linux', only()), null);
  assert.equal(installPlan('git', 'win32', only()), null);
  assert.equal(installPlan('nothing', 'win32', only('winget')), null);
});

test('a tool that is there is left alone; a missing one is installed on enter and checked again', async () => {
  const s = sink();
  const picked = [];
  assert.equal(await ensureTool('git', { exec: () => 'git version 2', pick: async () => { picked.push(1); }, out: s.out }), true);
  assert.equal(picked.length, 0, 'nothing is asked when it is already there');

  let installed = false;
  const exec = (cmd) => { if (cmd === 'gh' && !installed) throw new Error('missing'); return 'ok'; };
  const ran = [];
  const ok = await ensureTool('gh', {
    exec, platform: 'win32', exists: () => false, out: s.out,
    pick: async (title, options) => { picked.push(options[0].value); return options[0].value; }, // the first entry is what enter chooses
    run: (cmd, args) => { ran.push([cmd, ...args]); installed = true; return { status: 0 }; },
  });
  assert.equal(ok, true);
  assert.deepEqual(ran[0].slice(0, 4), ['winget', 'install', '--id', 'GitHub.cli']);
  assert.ok(s.lines.some((l) => /gh is installed/.test(l)));
});

test('choosing to install it yourself, a failed install and an unsupported system all end without installing', async () => {
  const s = sink();
  const base = { exec: throwing, exists: () => false, out: s.out, ctx: { have: (c) => c === 'winget' } }; // the tool is missing, a package manager is there
  assert.equal(await ensureTool('gh', { ...base, platform: 'win32', pick: async () => 'self', run: () => assert.fail('must not run') }), false);
  assert.equal(await ensureTool('gh', { ...base, platform: 'win32', pick: async () => 'now', run: () => ({ status: 1 }) }), false);
  assert.ok(s.lines.some((l) => /did not install/.test(l)));
  assert.equal(await ensureTool('git', { ...base, ctx: { have: () => false }, platform: 'linux', pick: async () => assert.fail('nothing to offer'), run: () => assert.fail('no') }), false);
  assert.ok(s.lines.some((l) => /cannot install git automatically/.test(l)));
});

test('the GitHub sign-in is the CLI browser flow, offered until it works or the user stops', async () => {
  const s = sink();
  let signed = false;
  const exec = () => { if (!signed) throw new Error('not logged in'); return 'ok'; };
  const ran = [];
  const ok = await ensureSignedIn({ exec, out: s.out, pick: async (t, o) => o[0].value, run: (cmd, args) => { ran.push([cmd, ...args]); signed = true; } });
  assert.equal(ok, true);
  assert.deepEqual(ran[0], ['gh', 'auth', 'login', '-h', 'github.com', '-w']);
  assert.equal(await ensureSignedIn({ exec: throwing, out: s.out, pick: async () => 'skip', run: () => assert.fail('no') }), false);
});

test('the CLA check is read from either kind of check entry', () => {
  assert.equal(claState([{ context: 'license/cla', state: 'pending' }]), 'PENDING');
  assert.equal(claState([{ name: 'license/cla', conclusion: 'success' }]), 'SUCCESS');
  assert.equal(claState([{ name: 'node', conclusion: 'success' }]), null);
  assert.equal(claState(null), null);
});

const view = (o) => JSON.stringify({ state: 'OPEN', mergedAt: null, labels: [], statusCheckRollup: [], ...o });
const watch = (views, extra = {}) => {
  const s = sink();
  let i = 0;
  const exec = () => views[Math.min(i++, views.length - 1)];
  return { s, run: () => watchPullRequest('https://github.com/SkillGauntlet/SkillGauntlet/pull/42', { exec, out: s.out, wait: async () => {}, every: 1, rounds: 5, ...extra }) };
};

test('a first submission is given the CLA link, asked to come back with enter, and then followed to the merge', async () => {
  const asked = [];
  const w = watch([
    view({ statusCheckRollup: [{ context: 'license/cla', state: 'PENDING' }] }),
    view({ statusCheckRollup: [{ context: 'license/cla', state: 'SUCCESS' }] }),
    view({ state: 'MERGED', mergedAt: '2026-10-30T00:00:00Z' }),
  ], { pick: async (title, options) => { asked.push(options[0].value); return options[0].value; } });
  assert.equal(await w.run(), 'merged');
  assert.deepEqual(asked, ['wait'], 'enter, the first entry, means "I signed it"');
  const text = w.s.lines.join('\n');
  assert.match(text, /cla-assistant\.io\/SkillGauntlet\/SkillGauntlet\?pullRequest=42/);
  assert.match(text, /Merged ✓ Here is your submission record: https:\/\/github\.com\/SkillGauntlet\/SkillGauntlet\/pull\/42/);
});

test('looking later, a manual review, a closed pull request and a long wait each end the watch with a plain message', async () => {
  const pending = view({ statusCheckRollup: [{ context: 'license/cla', state: 'PENDING' }] });
  assert.equal(await watch([pending], { pick: async () => 'later' }).run(), 'later');
  const review = watch([view({ labels: [{ name: 'needs-review' }] })], { pick: async () => assert.fail('no question') });
  assert.equal(await review.run(), 'review');
  assert.match(review.s.lines.join('\n'), /maintainer for review.*30 days/);
  assert.equal(await watch([view({ state: 'CLOSED' })], { pick: async () => assert.fail('no') }).run(), 'closed');
  const slow = watch([view({ statusCheckRollup: [{ context: 'license/cla', state: 'SUCCESS' }] })], { pick: async () => assert.fail('no') });
  assert.equal(await slow.run(), 'timeout');
  assert.match(slow.s.lines.join('\n'), /Waited \d+ minutes/);
});

test('a PATH that predates an install is extended with the directories the installers use', () => {
  const gh = String.raw`C:\Program Files\GitHub CLI`;
  const env = { Path: String.raw`C:\Windows` };
  const added = addKnownDirsToPath('win32', (d) => d === gh, env);
  assert.deepEqual(added, [gh]);
  assert.equal(env.Path, `${gh};${String.raw`C:\Windows`}`);
  assert.deepEqual(addKnownDirsToPath('win32', (d) => d === gh, env), [], 'not added twice');
});

test('on Linux the install runs each step through sudo and says a password may be asked', async () => {
  const s = sink();
  let installed = false;
  const exec = () => { if (!installed) throw new Error('missing'); return 'ok'; };
  const ran = [];
  const ok = await ensureTool('git', {
    exec, platform: 'linux', exists: () => false, out: s.out,
    ctx: { have: (c) => c === 'apt-get' || c === 'sudo', uid: 1000 },
    pick: async (title, options) => options[0].value,
    run: (cmd, args) => { ran.push([cmd, ...args]); if (args.includes('install')) installed = true; return { status: 0 }; },
  });
  assert.equal(ok, true);
  assert.deepEqual(ran, [['sudo', 'apt-get', 'update'], ['sudo', 'apt-get', 'install', '-y', 'git']]);
  assert.ok(s.lines.some((l) => /administrator rights.*password/.test(l)));
});

test('the browser sign-in only passes -p https to a gh that has the flag', () => {
  const old = () => 'Flags:\n  -h, --hostname string\n  -s, --scopes strings\n  -w, --web\n      --with-token';
  const recent = () => 'Flags:\n  -h, --hostname string\n  -p, --git-protocol string   The protocol to use for git operations\n  -w, --web';
  assert.deepEqual(loginArgs(old), ['auth', 'login', '-h', 'github.com', '-w']);
  assert.deepEqual(loginArgs(recent), ['auth', 'login', '-h', 'github.com', '-w', '-p', 'https']);
  assert.deepEqual(loginArgs(() => { throw Object.assign(new Error('x'), { stdout: '', stderr: '' }); }), ['auth', 'login', '-h', 'github.com', '-w']);
});

test('a sign-in that fails says so and is offered again instead of looping silently', async () => {
  const s = sink();
  let tries = 0;
  const exec = (cmd, args) => { if (args[1] === 'login') return '-w'; throw new Error('not logged in'); };
  const ok = await ensureSignedIn({ exec, out: s.out, run: () => { tries += 1; return { status: 1 }; }, pick: async (title, options) => (tries < 2 ? options[0].value : 'skip') });
  assert.equal(ok, false);
  assert.equal(tries, 2);
  assert.equal(s.lines.filter((l) => /did not finish/.test(l)).length, 2);
});
