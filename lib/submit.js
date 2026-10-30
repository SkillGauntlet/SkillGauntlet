// `skillgauntlet submit <run-dir>`: scrub, show, ask, then open the pull request.
//
// Nothing is uploaded before the contributor has seen what would go and said yes, and the pull request
// is opened as them, from their own fork: a bot-authored commit would not count as their contribution.
// When the GitHub CLI is missing or not logged in the same package is left on disk with manual steps.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { say, confirm, choose, hasTerminal } from './ui.js';
import { ensureGithub, watchPullRequest } from './github.js';
import { errorText, t } from './i18n.js';
import {
  SubmitError, buildPackage, gitFacts, gradeOfSummary, normalizeRepo, skillShaAtCommit, slug, writePackage,
} from './submission.js';

export const UPSTREAM = 'SkillGauntlet/SkillGauntlet';

const WITH_VALUE = ['--skill-dir', '--repo', '--commit', '--subdir', '--github-user', '--out'];
const FLAGS = ['--dry-run', '--yes', '--skip-remote-check'];

export function parseSubmitArgs(args) {
  const opts = { dir: null };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (WITH_VALUE.includes(a)) { opts[a.slice(2)] = args[i + 1]; i += 1; } else if (FLAGS.includes(a)) opts[a.slice(2)] = true;
    else if (!a.startsWith('--') && !opts.dir) opts.dir = a;
    else throw new Error(t('submitUsage'));
  }
  if (!opts.dir) throw new Error(t('submitUsage'));
  return opts;
}

const defaultExec = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });

// Who is logged in to the GitHub CLI, or why nothing can be done with it. Never throws.
export function ghState(exec = defaultExec) {
  try {
    exec('gh', ['auth', 'status']);
  } catch (err) {
    return { usable: false, installed: err.code !== 'ENOENT', user: null };
  }
  try {
    const user = exec('gh', ['api', 'user', '--jq', '.login + " " + (.id|tostring)']).trim().split(' ');
    return { usable: true, installed: true, user: user[0], id: user[1] };
  } catch {
    return { usable: false, installed: true, user: null };
  }
}

const pct = (x) => (x == null ? '–' : `${Math.round(x * 1000) / 10}%`);
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

function printPreview({ pkg, sizes, dir }) {
  const m = pkg.files.meta;
  const sub = m.submission;
  const s = pkg.files.summary;
  say(`\n${t('submitPreviewTitle')}\n`);
  say(t('submitPreviewSkill', { skill: m.skill, repo: sub.skill.repo, commit: sub.skill.commit.slice(0, 7), subdir: sub.skill.subdir ? `, ${sub.skill.subdir}` : '' }));
  say(t('submitPreviewSha', { sha: sub.skill.skillMdSha256.slice(0, 16) }));
  say(t('submitPreviewRun', {
    host: sub.host.id, hostVersion: sub.host.version || '?', model: sub.model.resolved || sub.model.requested || '?', trials: m.trials, questions: sub.queryPack.queries, runner: m.runnerVersion,
  }));
  say(t('submitPreviewResult', { grade: gradeOfSummary(s), recall: pct(s.recall), fpr: pct(s.fpr) }));
  say(t('submitPreviewFiles', { files: Object.entries(sizes).map(([n, b]) => `${n} ${kb(b)}`).join(', ') }));
  const counts = Object.entries(pkg.counts).map(([k, n]) => `${k} ×${n}`).join(', ');
  say(t('submitPreviewScrub', { what: counts || t('submitScrubNone') }));
  say(t('submitPreviewPath', { path: pkg.path.join('/'), upstream: UPSTREAM }));
  say(t('submitPreviewWhere', { dir }));
  say(`\n${t('submitPublic')}\n`);
}

function prBody(pkg) {
  const m = pkg.files.meta;
  const sub = m.submission;
  const s = pkg.files.summary;
  return [
    `Community submission: \`${m.skill}\` on ${sub.host.id} / ${sub.model.resolved || sub.model.requested}.`,
    '',
    '| | |',
    '|---|---|',
    `| Skill | ${sub.skill.repo} @ \`${sub.skill.commit.slice(0, 12)}\`${sub.skill.subdir ? ` (\`${sub.skill.subdir}\`)` : ''} |`,
    `| SKILL.md sha256 | \`${sub.skill.skillMdSha256}\` |`,
    `| Host | ${sub.host.id} ${sub.host.version || ''} |`,
    `| Trials / questions | ${m.trials} / ${sub.queryPack.queries} |`,
    `| Result | grade \`${gradeOfSummary(s)}\`, recall ${pct(s.recall)}, false positives ${pct(s.fpr)} |`,
    `| Runner | skillgauntlet ${m.runnerVersion} |`,
    '',
    'Opened by `skillgauntlet submit`: the files were scrubbed of local paths and secrets and shown to the contributor before this pull request was opened.',
    'I understand that the runner cannot prove the trials were really run, that the data is published under CC BY-NC-SA 4.0, and that I sign the CLA when the bot asks.',
    '',
  ].join('\n');
}

// A fork that was just created is not always cloneable at once; try a few times, a few seconds apart.
function cloneWithRetry(exec, url, dir, { tries = 5, waitMs = 3000 } = {}) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    try {
      exec('git', ['clone', '--depth', '1', '-c', 'credential.helper=', '-c', 'credential.https://github.com.helper=!gh auth git-credential', url, dir]);
      return;
    } catch (err) {
      last = err;
      fs.rmSync(dir, { recursive: true, force: true });
      if (i < tries - 1) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, waitMs);
    }
  }
  throw last;
}

// Fork, branch, commit, push, open. Every GitHub call goes through `exec` so tests can fake them.
export function openPullRequest({ pkgDir, pkg, gh, exec = defaultExec, say: out = say, cloneWait = 3000 }) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-pr-'));
  try {
    out(t('submitForking', { upstream: UPSTREAM }));
    exec('gh', ['repo', 'fork', UPSTREAM, '--clone=false']);
    out(t('submitPreparing'));
    const repoDir = path.join(work, 'repo');
    const forkUrl = `https://github.com/${gh.user}/${UPSTREAM.split('/')[1]}.git`;
    // The branch is made from the contributor's own fork, not from upstream's main. A fork made before upstream gained
    // workflow files lacks them, and pushing a branch built on upstream's main would then "create" those workflows in
    // the fork, which GitHub refuses for a token without the `workflow` scope (the default gh sign-in has none). A branch
    // made on the fork adds only the submission, and the pull request's diff against upstream is still just that.
    cloneWithRetry(exec, forkUrl, repoDir, { waitMs: cloneWait });
    const g = (...a) => exec('git', ['-C', repoDir, ...a]);
    const branch = `submit/${slug(pkg.files.meta.skill)}-${pkg.files.meta.submission.host.id}-${pkg.path[2].split('-')[0].toLowerCase()}`;
    g('checkout', '-b', branch);
    const target = path.join(repoDir, 'submissions', ...pkg.path);
    fs.mkdirSync(target, { recursive: true });
    for (const f of fs.readdirSync(pkgDir)) fs.copyFileSync(path.join(pkgDir, f), path.join(target, f));
    g('add', 'submissions');
    const msg = path.join(work, 'commit-message.txt');
    const m = pkg.files.meta;
    fs.writeFileSync(msg, `Add community submission: ${m.skill} on ${m.submission.host.id} / ${m.submission.model.resolved || m.submission.model.requested}\n\nSubmitted with skillgauntlet submit ${m.runnerVersion}.\n`);
    // the noreply address keeps a private email out of a public commit, and still links it to the account
    const ident = ['-c', `user.name=${gh.user}`, '-c', `user.email=${gh.id}+${gh.user}@users.noreply.github.com`];
    g(...ident, 'commit', '-q', '-F', msg);
    out(t('submitPushing'));
    g('-c', 'credential.helper=', '-c', 'credential.https://github.com.helper=!gh auth git-credential', 'push', '-q', 'origin', branch);
    out(t('submitOpening'));
    const body = path.join(work, 'body.md');
    fs.writeFileSync(body, prBody(pkg));
    const url = exec('gh', [
      'pr', 'create', '--repo', UPSTREAM, '--head', `${gh.user}:${branch}`, '--base', 'main',
      '--title', `Submission: ${m.skill} on ${m.submission.host.id} / ${m.submission.model.resolved || m.submission.model.requested}`,
      '--body-file', body,
    ]).trim().split(/\s+/).pop();
    return url;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

function printProblems(err) {
  for (const p of err.problems || []) say(`  - ${p.where}: ${p.kind} ${p.sample}`);
  for (const e of (err.errors || []).slice(0, 20)) say(`  - ${e}`);
}

export async function cmdSubmit(args, { exec = defaultExec, verifyRemote = skillShaAtCommit } = {}) {
  const opts = parseSubmitArgs(args);
  const runDir = path.resolve(opts.dir);
  const skillDir = opts['skill-dir'] ? path.resolve(opts['skill-dir']) : path.resolve(runDir, '..', '..', '..');
  // On a terminal, make sure git, the GitHub CLI and a sign-in exist before anything else: a machine with nothing on
  // it gets each offered with enter. Skipped when the contributor's name was given, and under test fakes.
  if (hasTerminal() && !opts['github-user'] && exec === defaultExec) await ensureGithub({ pick: choose, out: say });
  const gh = ghState(exec);
  const contributor = opts['github-user'] || gh.user;
  if (!contributor) throw new SubmitError('submitNoUser');

  let pkg;
  try {
    pkg = buildPackage({
      runDir, skillDir, contributor, facts: gitFacts(skillDir, { repo: opts.repo, commit: opts.commit, subdir: opts.subdir }),
    });
  } catch (err) {
    if (err instanceof SubmitError) {
      say(`\n${errorText(err)}`);
      printProblems(err);
      process.exitCode = 1;
      return null;
    }
    throw err;
  }

  const sk = pkg.files.meta.submission.skill;
  if (!opts['skip-remote-check']) {
    let got;
    try { got = verifyRemote(sk); } catch { got = null; }
    if (!got) {
      say(`\n${t('submitRemoteFail', { repo: sk.repo, commit: sk.commit.slice(0, 7) })}`);
      process.exitCode = 1;
      return null;
    }
    if (got !== sk.skillMdSha256) {
      say(`\n${t('submitRemoteMismatch', { repo: sk.repo, commit: sk.commit.slice(0, 7), got: got.slice(0, 12), want: sk.skillMdSha256.slice(0, 12) })}`);
      process.exitCode = 1;
      return null;
    }
  }

  const outRoot = opts.out ? path.resolve(opts.out) : fs.mkdtempSync(path.join(os.tmpdir(), 'sg-submit-'));
  const pkgDir = path.join(outRoot, ...pkg.path);
  const sizes = writePackage(pkgDir, pkg);
  printPreview({ pkg, sizes, dir: pkgDir });

  if (opts['dry-run']) {
    say(t('submitDry', { dir: pkgDir }));
    return { pkgDir, pkg };
  }
  if (!opts.yes && !(await confirm(t('submitAsk', { upstream: UPSTREAM }), false))) {
    say(t('submitCancelled', { dir: pkgDir }));
    return { pkgDir, pkg };
  }
  if (!gh.usable) {
    say(`\n${t('submitGhMissing')}`);
    say(t('submitManual', { upstream: UPSTREAM, dir: pkgDir, path: pkg.path.join('/') }));
    return { pkgDir, pkg };
  }
  try {
    const url = openPullRequest({ pkgDir, pkg, gh, exec });
    say(`\n${t('submitPrOpened', { url })}`);
    say(t('submitNext'));
    // the CLA link and the wait for the merge, with enter to continue (under test fakes there is nothing to wait for)
    if (hasTerminal() && exec === defaultExec) await watchPullRequest(url, { pick: choose, out: say });
    return { pkgDir, pkg, url };
  } catch (err) {
    say(`\n${t('submitGhFail', { msg: String(err.stderr || err.message).trim().split(/\r?\n/).slice(-3).join(' ') })}`);
    say(t('submitManual', { upstream: UPSTREAM, dir: pkgDir, path: pkg.path.join('/') }));
    process.exitCode = 1;
    return { pkgDir, pkg };
  }
}

export { normalizeRepo };
