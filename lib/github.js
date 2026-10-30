// What a machine with nothing installed needs before a result can be submitted, and what happens after the pull request
// is opened: git and the GitHub CLI (installed when the user presses enter), a GitHub sign-in (the CLI's own browser
// flow), the one-time CLA the bot asks for, and the wait for the merge. Every outside call goes through `exec`, `pick`
// and `run`, so the whole thing is tested with fakes.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { t } from './i18n.js';

const quiet = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, timeout: 120000 });
// a long-running, interactive command on the user's terminal (an installer, a browser sign-in)
const live = (cmd, args) => spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', windowsHide: false });

export const TOOLS = {
  git: { why: 'git', win: 'Git.Git', brew: 'git', url: 'https://git-scm.com/downloads' },
  gh: { why: 'gh', win: 'GitHub.cli', brew: 'gh', url: 'https://cli.github.com' },
};

// Where a fresh install lands when the running process was started before it existed (its PATH is out of date).
export function knownDirs(platform = process.platform) {
  if (platform === 'win32') return ['C:\\Program Files\\Git\\cmd', 'C:\\Program Files\\GitHub CLI', `${process.env.LOCALAPPDATA || ''}\\Programs\\Git\\cmd`];
  if (platform === 'darwin') return ['/opt/homebrew/bin', '/usr/local/bin'];
  return [];
}

export function addKnownDirsToPath(platform = process.platform, exists = fs.existsSync, env = process.env) {
  const key = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'PATH';
  const have = String(env[key] || '').split(path.delimiter).map((d) => d.toLowerCase());
  const add = knownDirs(platform).filter((d) => d && exists(d) && !have.includes(d.toLowerCase()));
  if (add.length) env[key] = `${add.join(path.delimiter)}${path.delimiter}${env[key] || ''}`;
  return add;
}

// The command that installs a tool on this system, or null when it cannot be done without a password or a guess.
export function installPlan(tool, platform = process.platform) {
  const spec = TOOLS[tool];
  if (!spec) return null;
  if (platform === 'win32') return { cmd: 'winget', args: ['install', '--id', spec.win, '-e', '--accept-source-agreements', '--accept-package-agreements'] };
  if (platform === 'darwin') return { cmd: 'brew', args: ['install', spec.brew] };
  return null;
}

export const has = (tool, exec = quiet) => { try { exec(tool, ['--version']); return true; } catch { return false; } };

const line = (plan) => `${plan.cmd} ${plan.args.join(' ')}`;

// One tool: present, or offered for install with enter. True when it is usable afterwards.
export async function ensureTool(tool, { exec = quiet, run = live, pick, out, platform = process.platform, exists = fs.existsSync } = {}) {
  if (has(tool, exec)) return true;
  addKnownDirsToPath(platform, exists);
  if (has(tool, exec)) return true;
  const plan = installPlan(tool, platform);
  out(`\n${t('toolMissing', { tool })}`);
  if (!plan) {
    out(t('toolNoAuto', { tool, url: TOOLS[tool].url }));
    return false;
  }
  const choice = await pick(t('toolQ', { tool }), [
    { label: t('toolInstallNow', { tool }), hint: t('toolRuns', { cmd: line(plan) }), value: 'now' },
    { label: t('toolInstallSelf'), value: 'self' },
  ], 1);
  if (choice !== 'now') return false;
  out(`\n${t('toolInstalling', { tool })}\n`);
  const r = run(plan.cmd, plan.args);
  if (r?.error || (r && r.status !== 0 && r.status != null)) {
    out(t('toolInstallFailed', { tool, url: TOOLS[tool].url }));
    return false;
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
export async function ensureSignedIn({ exec = quiet, run = live, pick, out } = {}) {
  while (!signedIn(exec)) {
    out(`\n${t('ghLoginNeeded')}`);
    const choice = await pick(t('ghLoginQ'), [
      { label: t('ghLoginNow'), hint: t('toolRuns', { cmd: 'gh auth login -h github.com -p https -w' }), value: 'now' },
      { label: t('ghLoginSkip'), value: 'skip' },
    ], 1);
    if (choice !== 'now') return false;
    out(`\n${t('ghLoginHint')}\n`);
    run('gh', ['auth', 'login', '-h', 'github.com', '-p', 'https', '-w']);
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
