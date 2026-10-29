// Offline tests for the leaderboard builder and the CI checking script. Fixtures only: real packages
// built from fake runs, synthetic entries for the rules, no network and no model.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildPackage, sha256, writePackage } from '../lib/submission.js';
import { build, buildRows, maintainerEntries, submissionEntries } from '../scripts/build-leaderboard.mjs';
import { checkChanged, renderComment, safeText } from '../scripts/check-submission.mjs';
import { FACTS, SKILL_MD, makeRun, tmpdir } from './_submit-fixture.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const GOOD_SHA = sha256(SKILL_MD);
const ctx = { home: 'C:\\Users\\alice', names: ['alice'], hosts: [], paths: ['C:\\Users\\alice'], secrets: [] };

async function addSubmission(root, contributor, opts = {}) {
  const r = await makeRun(opts);
  const pkg = buildPackage({ runDir: r.runDir, skillDir: r.skillDir, facts: FACTS, contributor, ctx });
  const dir = path.join(root, 'submissions', ...pkg.path);
  writePackage(dir, pkg);
  return { dir, pkg, rel: `submissions/${pkg.path.join('/')}` };
}

function maintainerFile(root, entries) {
  const dir = path.join(root, 'step0', 'data');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'leaderboard-maintainer.json'), JSON.stringify({ schema: 'skillgauntlet/maintainer-board/1', entries }));
}

const maint = (over = {}) => ({
  skill: 'demo', repo: FACTS.repo, subdir: FACTS.subdir, commit: FACTS.commit, skillMdSha256: GOOD_SHA, host: 'claude-code', hostVersion: '2.1.303',
  model: 'claude-x', grade: 'well', recall: 0.9, recallCi: [0.8, 0.95], fpr: 0, fprCi: [0, 0.1], queriesPos: 20, queriesNeg: 10, date: '2026-10-28', link: 'step0/data/b/BATCH.md', ...over,
});

const synth = (over = {}) => ({
  source: 'community', skill: 's', repo: 'https://github.com/o/r', subdir: '', commit: 'c', sha: 'h', host: 'claude-code', model: 'm', grade: 'fair',
  recall: 0.6, recallCi: [0.4, 0.8], fpr: 0, fprCi: [0, 0.1], qPos: 10, qNeg: 10, date: '2026-10-29', links: ['submissions/x/'], contributor: 'ann', ...over,
});

test('tags: one submission is a single sample; two accounts or maintainer plus one confirm; the same account twice does not', () => {
  const one = buildRows([synth()]);
  assert.equal(one[0].tag, 'community single sample');

  const two = buildRows([synth({ contributor: 'ann', links: ['submissions/a/'] }), synth({ contributor: 'bob', links: ['submissions/b/'] })]);
  assert.equal(two.length, 1);
  assert.equal(two[0].tag, 'confirmed (2 independent submissions)');
  assert.equal(two[0].submissions, 2);
  assert.deepEqual(two[0].contributors.sort(), ['ann', 'bob']);

  const same = buildRows([synth({ contributor: 'Ann', links: ['a/'] }), synth({ contributor: 'ann', links: ['b/'] })]);
  assert.equal(same[0].tag, 'community single sample');
  assert.equal(same[0].submissions, 1);

  const withMaint = buildRows([synth({ source: 'maintainer', contributor: null, links: ['step0/x'] }), synth()]);
  assert.equal(withMaint.length, 1);
  assert.equal(withMaint[0].tag, 'confirmed (maintainer run + community)');
  assert.equal(withMaint[0].source, 'maintainer', 'the maintainer run is the primary row');

  assert.equal(buildRows([synth({ source: 'maintainer', contributor: null })])[0].tag, 'maintainer run');
});

test('conflicting grades are kept side by side and never merged or deleted', () => {
  const rows = buildRows([
    synth({ contributor: 'ann', grade: 'well' }),
    synth({ contributor: 'bob', grade: 'poorly', links: ['submissions/y/'] }),
    synth({ source: 'maintainer', contributor: null, grade: 'fair', links: ['m'] }),
  ]);
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.tag === 'conflicting'));
});

test('hosts, models and skill commits are never pooled', () => {
  const rows = buildRows([synth(), synth({ host: 'codewhale' }), synth({ model: 'other' }), synth({ commit: 'c2' })]);
  assert.equal(rows.length, 4);
  assert.ok(rows.every((r) => r.tag === 'community single sample'));
});

test('insufficient and no-grade entries never confirm anything', () => {
  const rows = buildRows([synth({ grade: 'insufficient', contributor: 'ann' }), synth({ grade: 'insufficient', contributor: 'bob', links: ['b/'] })]);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.tag === 'community single sample'));
});

test('build(): real packages and a maintainer batch render into one page with counted numbers', async () => {
  const root = tmpdir();
  maintainerFile(root, [maint(), maint({ skill: 'other', skillMdSha256: 'b'.repeat(64), repo: 'https://github.com/o/other', subdir: '', commit: 'd'.repeat(40) })]);
  await addSubmission(root, 'ann');
  const a = await addSubmission(root, 'bob');
  const page = build(root);
  assert.match(page, /2 skills, 2 rows: 2 from the maintainer's batches in `step0\/data\/`, 2 community submissions/);
  assert.match(page, /confirmed \(maintainer run \+ community\)/);
  assert.ok(page.includes('[ann](https://github.com/ann)') && page.includes('[bob](https://github.com/bob)'));
  assert.match(page, /## Claude Code/);
  assert.equal(build(root), page, 'the same data gives the same page');

  // a tampered submission is left out and named, and does not put its numbers on the page
  const f = path.join(a.dir, 'summary.json');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/"recall": [0-9.]+/, '"recall": 0.01'));
  const after = build(root);
  assert.match(after, /## Left out/);
  assert.ok(after.includes(a.rel));
  assert.match(after, /1 community submissions/);
});

test('maintainer entries come from the generated JSON, one per skill and model', () => {
  const entries = maintainerEntries(ROOT);
  assert.ok(entries.length >= 36);
  assert.ok(entries.every((e) => /^[0-9a-f]{64}$/.test(e.sha) && e.links.length === 1));
  assert.equal(new Set(entries.map((e) => `${e.skill}|${e.model}`)).size, entries.length);
});

test('the committed LEADERBOARD.md has a row for every maintainer entry', () => {
  const page = fs.readFileSync(path.join(ROOT, 'LEADERBOARD.md'), 'utf8');
  const rows = page.split(/\r?\n/).filter((l) => l.startsWith('| ['));
  assert.ok(rows.length >= maintainerEntries(ROOT).length);
});

test('submissionEntries skips a directory that is not a package and says why', () => {
  const root = tmpdir();
  const bad = path.join(root, 'submissions', 'x', 'y', 'z');
  fs.mkdirSync(bad, { recursive: true });
  fs.writeFileSync(path.join(bad, 'meta.json'), '{}');
  const { entries, skipped } = submissionEntries(root);
  assert.equal(entries.length, 0);
  assert.equal(skipped.length, 1);
});

test('leaderboard --check passes right after a write and fails when the page is stale', () => {
  const root = tmpdir();
  maintainerFile(root, [maint()]);
  const run = (...a) => spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-leaderboard.mjs'), '--root', root, ...a], { encoding: 'utf8' });
  assert.equal(run('--check').status, 1, 'no page yet');
  assert.equal(run().status, 0);
  assert.equal(run('--check').status, 0);
  fs.appendFileSync(path.join(root, 'LEADERBOARD.md'), 'x');
  assert.equal(run('--check').status, 1);
});

// ---- the CI script ----

test('CI path rules: only added files in the right layout; anything else fails the whole pull request', async () => {
  const root = tmpdir();
  const s = await addSubmission(root, 'octocat');
  const files = ['meta.json', 'raw.jsonl', 'summary.json', 'queries.json'].map((f) => ({ status: 'added', path: `${s.rel}/${f}` }));
  const ok = checkChanged({ root, changed: files, author: 'octocat', fetchSha: () => GOOD_SHA });
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.items.length, 1);
  assert.ok(ok.items[0].ok, ok.items[0].errors.join('\n'));
  assert.equal(ok.items[0].grade, 'well');
  assert.match(renderComment(ok).text, /✅ Submission check passed/);

  const stray = checkChanged({ root, changed: [...files, { status: 'added', path: 'scripts/evil.mjs' }], author: 'octocat', fetchSha: () => GOOD_SHA });
  assert.match(stray.problems[0], /scripts\/evil\.mjs.*outside/);
  const workflow = checkChanged({ root, changed: [{ status: 'modified', path: '.github/workflows/validate.yml' }], author: 'octocat' });
  assert.ok(workflow.problems.length);
  const edited = checkChanged({ root, changed: [{ status: 'modified', path: `${s.rel}/raw.jsonl` }], author: 'octocat' });
  assert.match(edited.problems[0], /not edited/);
  const partial = checkChanged({ root, changed: files.slice(0, 2), author: 'octocat', fetchSha: () => GOOD_SHA });
  assert.match(partial.items[0].errors[0], /missing file\(s\): summary\.json, queries\.json/);
  const wrongAuthor = checkChanged({ root, changed: files, author: 'mallory', fetchSha: () => GOOD_SHA });
  assert.match(wrongAuthor.items[0].errors.join('\n'), /contributor/);
  const failed = renderComment(wrongAuthor);
  assert.equal(failed.ok, false);
  assert.match(failed.text, /❌ Submission check failed/);
  assert.match(failed.text, /cannot show that the trials were really run/);
  assert.ok(failed.text.startsWith('<!-- skillgauntlet-submission-check -->'));
});

test('comment text from a pull request cannot ping anyone or run long', () => {
  assert.ok(!safeText('thanks @octocat').includes('@octocat'));
  assert.ok(safeText('x'.repeat(5000)).length <= 500);
  assert.ok(!safeText('a\nb').includes('\n'));
});

test('check-submission script: exit 1 and a comment when the skill repo cannot be fetched', async () => {
  const root = tmpdir();
  const s = await addSubmission(root, 'octocat');
  const files = path.join(root, 'files.tsv');
  fs.writeFileSync(files, ['meta.json', 'raw.jsonl', 'summary.json', 'queries.json'].map((f) => `added\t${s.rel}/${f}`).join('\n'));
  const out = path.join(root, 'out');
  const res = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'check-submission.mjs'), '--root', root, '--files', files, '--author', 'octocat', '--pr', '12', '--out', out, '--offline'], { encoding: 'utf8' });
  assert.equal(res.status, 1, res.stdout + res.stderr);
  assert.match(fs.readFileSync(path.join(out, 'comment.md'), 'utf8'), /could not fetch/);
  assert.equal(fs.readFileSync(path.join(out, 'pr'), 'utf8').trim(), '12');
  assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'result.json'), 'utf8')).ok, false);
});
