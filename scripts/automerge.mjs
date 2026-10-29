#!/usr/bin/env node
// Auto-merge of community submissions, in two steps that run in two separate jobs (automerge.yml):
//
//   inspect  (read-only token)   reads one pull request through the GitHub API, as data, and decides.
//   apply    (write token)       comments, labels, merges or refuses, exactly as decided.
//
// Nothing here checks out, installs or runs anything from the pull request. The pull request's four files
// are downloaded as bytes, parsed by the validator of the base branch, and thrown away. Facts the decision
// rests on (the head commit, the CLA status, the account) are read from the API, never from the pull
// request's own CI output, which a fork can fake.
//
//   node scripts/automerge.mjs inspect --repo o/r --pr 12 [--expect-sha <sha>] --out dir
//   node scripts/automerge.mjs apply   --repo o/r --decision dir/decision.json
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { POLICY, decide, gateAccount, gateFiles, mergeTitle, renderVerdict } from '../lib/automerge.js';
import { checkChanged } from './check-submission.mjs';

const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');

// ---- GitHub access (replaced by fakes in the tests) ----------------------------------------------------
export function ghClient() {
  const run = (args, opts = {}) => execFileSync('gh', args, { encoding: opts.buffer ? 'buffer' : 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  return {
    get: (p) => JSON.parse(run(['api', p])),
    list: (p) => run(['api', '--paginate', p, '--jq', '.[]']).split('\n').filter(Boolean).map((l) => JSON.parse(l)),
    raw: (p) => run(['api', '-H', 'Accept: application/vnd.github.raw+json', p], { buffer: true }),
    send: (method, p, fields = {}) => {
      const args = ['api', '-X', method, p];
      for (const [k, v] of Object.entries(fields)) args.push('-f', `${k}=${v}`);
      return run(args);
    },
    dispatch: (repo, workflow, ref) => run(['api', '-X', 'POST', `repos/${repo}/actions/workflows/${workflow}/dispatches`, '-f', `ref=${ref}`]),
  };
}

const enc = (p) => p.split('/').map(encodeURIComponent).join('/');

// ---- inspect -------------------------------------------------------------------------------------------
export function inspect({ gh, repo, pr, expectSha = null, outDir, now = Date.now(), fetchSha, offline = false }) {
  const skip = (why) => ({ skip: why, pr });
  const info = gh.get(`repos/${repo}/pulls/${pr}`);
  if (info.state !== 'open' || info.draft) return skip('pull request is not open');
  const sha = info.head.sha;
  if (expectSha && expectSha !== sha) return skip('pull request moved on since the triggering run; a newer run will handle it');
  if (info.base.ref !== info.base.repo.default_branch) return skip('pull request does not target the default branch');
  const author = info.user.login;
  const headRepo = info.head.repo?.full_name;

  const changed = gh.list(`repos/${repo}/pulls/${pr}/files`).map((f) => ({ filename: f.filename, status: f.status }));
  if (!changed.some((f) => f.filename.startsWith('submissions/'))) return skip('pull request does not touch submissions/');

  // What kind of thing is each file at the head commit? (a symlink or submodule is not a file we may read)
  const entries = {};
  if (headRepo && changed.length <= POLICY.maxFiles) {
    for (const { filename } of changed) {
      if (filename.split('/').some((s) => s === '..' || s === '.' || s === '')) continue;
      try {
        const e = gh.get(`repos/${headRepo}/contents/${enc(filename)}?ref=${sha}`);
        entries[filename] = Array.isArray(e) ? { type: 'dir', size: 0 } : { type: e.type, size: e.size };
      } catch { /* absent at head: gateFiles reports it */ }
    }
  }
  const files = gateFiles(changed, entries);

  let validation = { ok: false, errors: [] };
  if (files.ok) {
    const root = path.join(outDir, 'data');
    fs.rmSync(root, { recursive: true, force: true });
    try {
      for (const { filename } of changed) {
        const buf = gh.raw(`repos/${headRepo}/contents/${enc(filename)}?ref=${sha}`);
        if (buf.length !== entries[filename].size) throw new Error(`${path.posix.basename(filename)} changed size while being read`);
        const dest = path.join(root, ...filename.split('/'));
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, buf);
      }
      const res = checkChanged({ root, changed: changed.map((f) => ({ status: f.status, path: f.filename })), author, offline, ...(fetchSha ? { fetchSha } : {}) });
      const item = res.items[0];
      const errors = [...res.problems, ...(item && !item.ok ? item.errors : [])];
      validation = { ok: !errors.length && res.items.length === 1 && item.ok, errors, dir: item?.dir };
      if (!validation.ok && !errors.length) validation.errors = ['the validator found no submission'];
    } catch (e) {
      validation = { ok: false, errors: [String(e.message).slice(0, 200)] };
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  let cla = null;
  try {
    cla = gh.get(`repos/${repo}/commits/${sha}/status`).statuses.find((s) => s.context === POLICY.claContext)?.state ?? null;
  } catch { /* stays null */ }

  let account = { ok: false, reasons: ['the account could not be looked up'] };
  try {
    const user = gh.get(`users/${author}`);
    const since = iso(now - DAY);
    const count = (q) => gh.get(`search/issues?q=${encodeURIComponent(q)}&per_page=1`).total_count;
    const merged = count(`repo:${repo} is:pr is:merged label:auto-merged author:${author} merged:>=${since}`);
    const flagged = count(`repo:${repo} is:pr label:${POLICY.label} author:${author} created:>=${since}`);
    // the search cannot exclude one pull request by number; subtract this one if it is already flagged
    const own = (info.labels || []).some((l) => l.name === POLICY.label) && Date.parse(info.created_at) >= now - DAY ? 1 : 0;
    account = gateAccount({ createdAt: user.created_at, association: info.author_association, mergedLastDay: merged, flaggedLastDay: Math.max(0, flagged - own) }, now);
  } catch { /* stays refused */ }

  const currentSha = gh.get(`repos/${repo}/pulls/${pr}`).head.sha;
  const verdict = decide({ validatedSha: sha, currentSha, files, validation, cla, account });
  return {
    pr, sha, dir: files.dir, author, ...verdict,
    comment: renderVerdict(verdict, { dir: files.dir }),
    title: files.dir ? mergeTitle(files.dir) : null,
  };
}

// ---- apply ---------------------------------------------------------------------------------------------
const MARKER = '<!-- skillgauntlet-automerge -->';

function say(gh, repo, pr, body) {
  const mine = gh.list(`repos/${repo}/issues/${pr}/comments`).find((c) => c.user?.login === 'github-actions[bot]' && c.body.includes(MARKER));
  if (mine) gh.send('PATCH', `repos/${repo}/issues/comments/${mine.id}`, { body });
  else gh.send('POST', `repos/${repo}/issues/${pr}/comments`, { body });
}

function label(gh, repo, pr, name, color) {
  try { gh.send('POST', `repos/${repo}/labels`, { name, color }); } catch { /* exists */ }
  gh.send('POST', `repos/${repo}/issues/${pr}/labels`, { 'labels[]': name });
}

// d is a decision.json read from an artifact: validate every field again before it reaches the API.
export function apply({ gh, repo, d, workflow = 'pages.yml' }) {
  if (d.skip) return { action: 'skip', why: d.skip };
  if (!Number.isInteger(d.pr) || !/^[0-9a-f]{40}$/.test(d.sha || '')) throw new Error('decision.json is malformed');
  if (d.stale) return { action: 'skip', why: 'stale' };
  if (!d.merge) {
    if (d.comment) say(gh, repo, d.pr, d.comment);
    if (!d.waitForCla) label(gh, repo, d.pr, POLICY.label, 'd93f0b');
    return { action: 'refused', reasons: d.reasons };
  }
  if (!/^submissions\/[a-z0-9._-]+\/[a-z0-9._-]+\/[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9-]+$/.test(d.dir || '')) throw new Error('decision.json has a bad directory');
  // the API itself refuses the merge when the head is no longer `sha`
  try {
    gh.send('PUT', `repos/${repo}/pulls/${d.pr}/merge`, { merge_method: 'squash', sha: d.sha, commit_title: mergeTitle(d.dir), commit_message: 'Merged automatically after the submission checks passed.' });
  } catch (e) {
    const text = String(e.stderr || e.message);
    if (/409|head branch was modified|sha/i.test(text)) return { action: 'skip', why: 'head moved before the merge' };
    say(gh, repo, d.pr, `${MARKER}\n### ⏸️ Not merged automatically\n\nEvery check passed, but GitHub refused the merge (${text.replace(/[@`\r\n]+/g, ' ').slice(0, 200)}). A maintainer will look at it.\n`);
    label(gh, repo, d.pr, POLICY.label, 'd93f0b');
    return { action: 'merge-failed' };
  }
  label(gh, repo, d.pr, 'auto-merged', '0e8a16');
  say(gh, repo, d.pr, d.comment);
  // commits made with GITHUB_TOKEN start no push workflows: ask for the Pages build explicitly
  gh.dispatch(repo, workflow, 'main');
  return { action: 'merged' };
}

// ---- CLI -----------------------------------------------------------------------------------------------
function arg(name, def = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}

function main() {
  const cmd = process.argv[2];
  const repo = arg('--repo');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '')) throw new Error('--repo owner/name is required');
  const gh = ghClient();
  if (cmd === 'inspect') {
    const pr = Number(arg('--pr'));
    if (!Number.isInteger(pr) || pr < 1) throw new Error('--pr must be a number');
    const outDir = path.resolve(arg('--out', 'out'));
    fs.mkdirSync(outDir, { recursive: true });
    const d = inspect({ gh, repo, pr, expectSha: arg('--expect-sha'), outDir });
    fs.writeFileSync(path.join(outDir, 'decision.json'), `${JSON.stringify(d, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ pr: d.pr, merge: d.merge, skip: d.skip, reasons: d.reasons }, null, 2)}\n`);
  } else if (cmd === 'apply') {
    const d = JSON.parse(fs.readFileSync(arg('--decision'), 'utf8'));
    process.stdout.write(`${JSON.stringify(apply({ gh, repo, d }))}\n`);
  } else {
    throw new Error('usage: automerge.mjs inspect|apply');
  }
}

if (process.argv[1]?.endsWith('automerge.mjs')) main();
