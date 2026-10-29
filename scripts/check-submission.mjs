#!/usr/bin/env node
// CI entry point for a pull request that touches submissions/. It runs from the base branch (never from
// the pull request), reads the pull request's files as untrusted data, calls no model, holds no secret,
// and writes two files: result.json and comment.md. Posting the comment is a separate workflow.
//
//   node scripts/check-submission.mjs --root <pr checkout> --files <status<TAB>path lines> \
//        --author <login> --out <dir> [--pr <number>] [--offline]
//
// Exit code 0 when every submission passes, 1 when anything fails.
import fs from 'node:fs';
import path from 'node:path';
import { FILES, checkPackageDir, gradeOfSummary } from '../lib/submission.js';

export const MARKER = '<!-- skillgauntlet-submission-check -->';
const MAX_DIRS = 5;
const PATH_RE = new RegExp(`^submissions/([^/]+)/([^/]+)/([^/]+)/(${FILES.map((f) => f.replace('.', '\\.')).join('|')})$`);

function arg(name, def = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}

// Text that came out of a pull request goes into a comment: no @mentions, no huge lines.
export function safeText(s) {
  return String(s).replace(/@/g, '@​').replace(/[\r\n]+/g, ' ').slice(0, 500);
}

// changed: [{ status, path }]. Returns { items, problems } where problems are about the pull request as a whole.
export function checkChanged({ root, changed, author, fetchSha, offline = false }) {
  const problems = [];
  const dirs = new Map();
  for (const { status, path: p } of changed) {
    const m = PATH_RE.exec(p);
    if (!m) {
      problems.push(`\`${safeText(p)}\` is outside \`submissions/<skill>/<host>-<model>/<timestamp>-<user>/\` (only ${FILES.join(', ')} are allowed there). A submission pull request may not change anything else.`);
      continue;
    }
    if (status !== 'added') {
      problems.push(`\`${safeText(p)}\` is ${safeText(status)}, not added: published submissions are not edited. To correct one, open an Issue.`);
      continue;
    }
    const dir = `submissions/${m[1]}/${m[2]}/${m[3]}`;
    dirs.set(dir, [...(dirs.get(dir) || []), m[4]]);
  }
  if (dirs.size > MAX_DIRS) problems.push(`${dirs.size} submissions in one pull request; the limit is ${MAX_DIRS}.`);
  if (!changed.length) problems.push('No changed files were listed for this pull request.');

  const items = [];
  if (!problems.length) {
    for (const [dir, names] of dirs) {
      const missing = FILES.filter((f) => !names.includes(f));
      if (missing.length) { items.push({ dir, ok: false, errors: [`missing file(s): ${missing.join(', ')}`] }); continue; }
      const res = checkPackageDir(path.join(root, dir), {
        layoutPath: dir.replace(/^submissions\//, ''),
        author,
        ...(offline ? { fetchSha: () => { throw new Error('offline'); } } : fetchSha ? { fetchSha } : {}),
      });
      items.push({
        dir,
        ok: res.ok,
        errors: res.errors.map(safeText),
        skill: res.meta?.skill,
        host: res.meta?.host,
        model: res.meta?.submission?.model?.resolved || res.meta?.submission?.model?.requested,
        grade: res.summary ? gradeOfSummary(res.summary) : null,
        recall: res.summary?.recall ?? null,
        fpr: res.summary?.fpr ?? null,
        trials: res.summary?.trials ?? null,
      });
    }
  }
  return { items, problems };
}

const pct = (x) => (x == null ? '–' : `${Math.round(x * 1000) / 10}%`);

export function renderComment({ items, problems }) {
  const ok = !problems.length && items.length > 0 && items.every((i) => i.ok);
  const out = [MARKER];
  if (ok) {
    out.push('### ✅ Submission check passed', '');
    out.push('| Submission | Host / model | Grade | Recall | False positives | Trials |', '|---|---|---|---|---|---|');
    for (const i of items) out.push(`| \`${i.dir}\` | ${safeText(i.host)} / ${safeText(i.model)} | ${i.grade} | ${pct(i.recall)} | ${pct(i.fpr)} | ${i.trials} |`);
    out.push('', 'Format, SKILL.md hash at the pinned commit, and the summary numbers (recomputed from `raw.jsonl`) all check out, and no secret-shaped text or local path was found.');
  } else {
    out.push('### ❌ Submission check failed', '');
    for (const p of problems) out.push(`- ${p}`);
    for (const i of items) {
      out.push(`- \`${i.dir}\`:`);
      for (const e of i.ok ? [] : i.errors) out.push(`  - ${e}`);
    }
    out.push('', 'Fix these and push to the same branch; the check runs again. `skillgauntlet submit <run-dir> --dry-run` runs the same checks on your machine.');
  }
  out.push('',
    '<sub>This check verifies format, hashes and arithmetic only. It cannot show that the trials were really run, and nobody claims it can. ' +
    'A merged submission starts as a **community single sample**; it becomes **confirmed** when another independent submission, or a maintainer run, lands on the same grade. ' +
    'It also needs the signed CLA (`license/cla`), which is checked separately. Disagree with a result? Open an appeal Issue.</sub>');
  return { ok, text: `${out.join('\n')}\n` };
}

function main() {
  const root = path.resolve(arg('--root', '.'));
  const author = arg('--author');
  const outDir = path.resolve(arg('--out', 'out'));
  const changed = fs.readFileSync(arg('--files'), 'utf8').split(/\r?\n/).filter(Boolean).map((l) => {
    const [status, ...rest] = l.split('\t');
    return { status, path: rest.join('\t') };
  });
  const res = checkChanged({ root, changed, author, offline: process.argv.includes('--offline') });
  const { ok, text } = renderComment(res);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'comment.md'), text);
  fs.writeFileSync(path.join(outDir, 'result.json'), `${JSON.stringify({ pr: arg('--pr'), ok, items: res.items, problems: res.problems }, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, 'pr'), `${arg('--pr', '')}\n`);
  process.stdout.write(text);
  process.exitCode = ok ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('check-submission.mjs')) main();
