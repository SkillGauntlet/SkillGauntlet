// What a machine with nothing installed needs before a result can be submitted, and what happens after the pull request
// is opened: git and the GitHub CLI (installed when the user presses enter), a GitHub sign-in (the CLI's own browser
// flow), the one-time CLA the bot asks for, and the wait for the merge. Every outside call goes through `exec`, `pick`
// and `run`, so the whole thing is tested with fakes.
import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { t } from './i18n.js';

const quiet = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, timeout: 120000 });
// a long-running, interactive command on the user's terminal (an installer, a browser sign-in)
const live = (cmd, args) => spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', windowsHide: false });

export const TOOLS = {
  git: { url: 'https://git-scm.com/downloads', pkg: { winget: 'Git.Git', choco: 'git', scoop: 'git', brew: 'git', apt: 'git', dnf: 'git', pacman: 'git', zypper: 'git', apk: 'git' } },
  gh: { url: 'https://cli.github.com', pkg: { winget: 'GitHub.cli', choco: 'gh', scoop: 'gh', brew: 'gh', apt: 'gh', dnf: 'gh', pacman: 'github-cli', zypper: 'gh', apk: 'github-cli' } },
};

// The package managers to look for on each system, in the order they are preferred.
export const MANAGERS = { win32: ['winget', 'choco', 'scoop'], darwin: ['brew'], linux: ['apt-get', 'dnf', 'pacman', 'zypper', 'apk', 'brew'] };

// The steps that install `pkg` with a manager. The system-wide ones need root, so they are run through sudo unless the
// user already is root; a `sudo` prompt for the password then appears on the user's own terminal.
function stepsFor(manager, pkg, id, asRoot) {
  const root = (args) => (asRoot ? args : ['sudo', ...args]);
  switch (manager) {
    case 'winget': return [['winget', 'install', '--id', id, '-e', '--accept-source-agreements', '--accept-package-agreements']];
    case 'choco': return [['choco', 'install', pkg, '-y']];
    case 'scoop': return [['scoop', 'install', pkg]];
    case 'brew': return [['brew', 'install', pkg]];
    case 'apt-get': return [root(['apt-get', 'update']), root(['apt-get', 'install', '-y', pkg])];
    case 'dnf': return [root(['dnf', 'install', '-y', pkg])];
    case 'pacman': return [root(['pacman', '-S', '--noconfirm', pkg])];
    case 'zypper': return [root(['zypper', '--non-interactive', 'install', pkg])];
    case 'apk': return [root(['apk', 'add', pkg])];
    default: return null;
  }
}

// What this system can run to install a tool, or null when it cannot be done here. `ctx.have(cmd)` says whether a command
// exists; `ctx.uid` is the user id (0 is root). The first package manager found wins.
export function installPlan(tool, platform = process.platform, ctx = {}) {
  const spec = TOOLS[tool];
  if (!spec) return null;
  const have = ctx.have || (() => false);
  const asRoot = ctx.uid === 0;
  const manager = (MANAGERS[platform] || []).find((m) => have(m));
  if (!manager) return null;
  const key = manager === 'apt-get' ? 'apt' : manager;
  const pkg = spec.pkg[key];
  if (!pkg) return null;
  const sudoNeeded = !['winget', 'choco', 'scoop', 'brew'].includes(manager) && !asRoot;
  if (sudoNeeded && !have('sudo')) return null; // neither root nor sudo: nothing that can be done from here
  return { manager, steps: stepsFor(manager, pkg, pkg, asRoot), sudo: sudoNeeded };
}

// Where a fresh install lands when the running process was started before it existed (its PATH is out of date).
export function knownDirs(platform = process.platform) {
  if (platform === 'win32') return ['C:\\Program Files\\Git\\cmd', 'C:\\Program Files\\GitHub CLI', `${process.env.LOCALAPPDATA || ''}\\Programs\\Git\\cmd`];
  if (platform === 'darwin') return ['/opt/homebrew/bin', '/usr/local/bin'];
  return [];
}

export function addKnownDirsToPath(platform = process.platform, exists = fs.existsSync, env = process.env) {
  const key = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'PATH';
  const sep = platform === 'win32' ? ';' : ':'; // the separator of the system being described, not of the one running
  const have = String(env[key] || '').split(sep).map((d) => d.toLowerCase());
  const add = knownDirs(platform).filter((d) => d && exists(d) && !have.includes(d.toLowerCase()));
  if (add.length) env[key] = `${add.join(sep)}${sep}${env[key] || ''}`;
  return add;
}

export const has = (tool, exec = quiet) => { try { exec(tool, ['--version']); return true; } catch { return false; } };

const line = (plan) => plan.steps.map((st) => st.join(' ')).join(' && ');

// One tool: present, or offered for install with enter. True when it is usable afterwards.
export async function ensureTool(tool, { exec = quiet, run = live, pick, out, platform = process.platform, exists = fs.existsSync, ctx = {} } = {}) {
  if (has(tool, exec)) return true;
  addKnownDirsToPath(platform, exists);
  if (has(tool, exec)) return true;
  const plan = installPlan(tool, platform, { have: (c) => has(c, exec), uid: typeof process.getuid === 'function' ? process.getuid() : undefined, ...ctx });
  out(`\n${t('toolMissing', { tool })}`);
  if (!plan) {
    out(t('toolNoAuto', { tool, url: TOOLS[tool].url }));
    return false;
  }
  if (plan.sudo) out(t('toolSudo'));
  const choice = await pick(t('toolQ', { tool }), [
    { label: t('toolInstallNow', { tool }), hint: t('toolRuns', { cmd: line(plan) }), value: 'now' },
    { label: t('toolInstallSelf'), value: 'self' },
  ], 1);
  if (choice !== 'now') return false;
  out(`\n${t('toolInstalling', { tool })}\n`);
  for (const [cmd, ...args] of plan.steps) {
    const r = run(cmd, args);
    if (r?.error || (r && r.status !== 0 && r.status != null)) {
      out(t('toolInstallFailed', { tool, url: TOOLS[tool].url }));
      return false;
    }
  }
  addKnownDirsToPath(platform, exists);
  if (has(tool, exec)) {
    out(t('toolInstalled', { tool }));
    return true;
  }
  out(t('toolStillMissing', { tool }));
  return false;
}

export const signedIn = (exec = quiet) => { try { exec('gh', ['auth', 'status']); return true; } catch { return false; } };

// The GitHub sign-in: the CLI's own browser flow (it shows a one-time code and opens the browser after enter).
// The arguments of the browser sign-in for the installed gh. `-p https` (the git protocol) exists only in newer versions;
// the gh in an older Ubuntu's own repositories rejects it ("unknown shorthand flag: 'p'"), so it is added only when this
// gh lists it, and otherwise gh asks that one question itself.
export function loginArgs(exec = quiet) {
  let help = '';
  try { help = String(exec('gh', ['auth', 'login', '--help'])); } catch (err) { help = `${err.stdout || ''}${err.stderr || ''}`; }
  const args = ['auth', 'login', '-h', 'github.com', '-w'];
  return /--git-protocol/.test(help) ? [...args, '-p', 'https'] : args;
}

export async function ensureSignedIn({ exec = quiet, run = live, pick, out } = {}) {
  while (!signedIn(exec)) {
    out(`\n${t('ghLoginNeeded')}`);
    const args = loginArgs(exec);
    const choice = await pick(t('ghLoginQ'), [
      { label: t('ghLoginNow'), hint: t('toolRuns', { cmd: `gh ${args.join(' ')}` }), value: 'now' },
      { label: t('ghLoginSkip'), value: 'skip' },
    ], 1);
    if (choice !== 'now') return false;
    out(`\n${t('ghLoginHint')}\n`);
    const r = run('gh', args);
    if (r?.error || (r && r.status != null && r.status !== 0)) out(`\n${t('ghLoginFailed')}`);
  }
  return true;
}

// Everything submit needs on a machine with nothing on it. False when the user chose to stop or it cannot be done here.
export async function ensureGithub(env = {}) {
  for (const tool of ['git', 'gh']) if (!(await ensureTool(tool, env))) return false;
  return ensureSignedIn(env);
}

// ------------------------------------------------------------------------------------------------ after the PR is opened

// The state of the CLA bot's check among a pull request's checks, or null when it has not appeared yet.
export function claState(rollup) {
  const e = (rollup || []).find((c) => (c.context || c.name) === 'license/cla');
  return e ? String(e.state || e.conclusion || '').toUpperCase() : null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Show where the pull request stands until it is merged, needs a person, or the wait runs out. The first time the CLA
// check is not green the contributor is given the link and asked to come back with enter: signing is a web page that
// belongs to them and cannot be done for them.
export async function watchPullRequest(url, { exec = quiet, pick, out, upstream = 'SkillGauntlet/SkillGauntlet', wait = sleep, every = 10000, rounds = 60 } = {}) {
  const number = String(url).split('/').pop();
  let askedCla = false;
  let shown = '';
  out(`\n${t('prWaiting')}`);
  for (let i = 0; i < rounds; i += 1) {
    let view;
    try { view = JSON.parse(exec('gh', ['pr', 'view', url, '--json', 'state,mergedAt,labels,statusCheckRollup'])); } catch { view = null; }
    if (view) {
      if (view.state === 'MERGED' || view.mergedAt) { out(`\n${t('prMerged', { url })}`); return 'merged'; }
      if (view.state === 'CLOSED') { out(`\n${t('prClosed', { url })}`); return 'closed'; }
      if ((view.labels || []).some((l) => l.name === 'needs-review')) { out(`\n${t('prNeedsReview', { url })}`); return 'review'; }
      const cla = claState(view.statusCheckRollup);
      if (cla && cla !== 'SUCCESS' && !askedCla) {
        askedCla = true;
        out(`\n${t('prCla', { url: `https://cla-assistant.io/${upstream}?pullRequest=${number}` })}`);
        const choice = await pick(t('prClaQ'), [
          { label: t('prClaDone'), value: 'wait' },
          { label: t('prLater'), value: 'later' },
        ], 1);
        if (choice === 'later') { out(t('prLaterNote', { url })); return 'later'; }
      }
      const status = cla ? `${t('prStepCla')} ${cla === 'SUCCESS' ? '✓' : '…'}` : t('prStepChecks');
      if (status !== shown) { out(`  ${status}`); shown = status; }
    }
    await wait(every);
  }
  out(`\n${t('prTimeout', { url, m: Math.round((rounds * every) / 60000) })}`);
  return 'timeout';
}
