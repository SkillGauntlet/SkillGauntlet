// The auto-merge rules and the Pages builder, with a fake GitHub: no network, no model, nothing leaves tmp.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildPackage, sha256, writePackage, FILES } from '../lib/submission.js';
import { POLICY, decide, gateAccount, gateFiles } from '../lib/automerge.js';
import { apply, inspect } from '../scripts/automerge.mjs';
import { buildRows } from '../scripts/build-leaderboard.mjs';
import { escapeHtml, renderPage, safeLink } from '../scripts/build-pages.mjs';
import { FACTS, SKILL_MD, makeRun, tmpdir } from './_submit-fixture.mjs';

const GOOD_SHA = sha256(SKILL_MD);
const ctx = { home: 'C:\\Users\\alice', names: ['alice'], hosts: [], paths: ['C:\\Users\\alice'], secrets: [] };
const HEAD = 'b'.repeat(40);
const NOW = Date.parse('2026-10-30T12:00:00Z');
const REPO = 'SkillGauntlet/SkillGauntlet';

async function realPackage(contributor = 'octocat') {
  const r = await makeRun();
  const pkg = buildPackage({ runDir: r.runDir, skillDir: r.skillDir, facts: FACTS, contributor, ctx });
  const dir = path.join(tmpdir(), 'pkg');
  writePackage(dir, pkg);
  const rel = `submissions/${pkg.path.join('/')}`;
  return { rel, files: Object.fromEntries(FILES.map((f) => [`${rel}/${f}`, fs.readFileSync(path.join(dir, f))])) };
}

// A fake GitHub holding one pull request. `fork` maps path -> { type, bytes } at the head commit.
function fakeGh({ files, changed, fork, user = 'octocat', association = 'FIRST_TIME_CONTRIBUTOR', created = '2020-01-01T00:00:00Z', cla = 'success', merged = 0, flagged = 0, heads = [HEAD], state = 'open' }) {
  const calls = [];
  let headReads = 0;
  const gh = {
    calls,
    get(p) {
      if (/^repos\/[^/]+\/[^/]+\/pulls\/\d+$/.test(p)) {
        const sha = heads[Math.min(headReads, heads.length - 1)];
        headReads += 1;
        return { state, draft: false, head: { sha, repo: { full_name: 'octocat/fork' } }, base: { ref: 'main', repo: { default_branch: 'main' } }, user: { login: user }, author_association: association, labels: [], created_at: '2026-10-30T11:00:00Z' };
      }
      if (/\/commits\/[0-9a-f]+\/status$/.test(p)) return { statuses: cla ? [{ context: 'license/cla', state: cla }] : [] };
      if (p.startsWith('users/')) return { created_at: created };
      if (p.startsWith('search/issues')) {
        const q = decodeURIComponent(p);
        return { total_count: q.includes('label:auto-merged') ? merged : flagged };
      }
      const m = /^repos\/octocat\/fork\/contents\/(.+)\?ref=/.exec(p);
      if (m) {
        const e = fork[decodeURIComponent(m[1])];
        if (!e) throw new Error('404');
        return { type: e.type || 'file', size: e.size ?? e.bytes.length };
      }
      throw new Error(`unexpected GET ${p}`);
    },
    list: () => changed,
    raw(p) {
      const m = /^repos\/octocat\/fork\/contents\/(.+)\?ref=/.exec(p);
      return fork[decodeURIComponent(m[1])].bytes;
    },
    send(method, p, fields) { calls.push({ method, p, fields }); return ''; },
    dispatch(repo, workflow, ref) { calls.push({ dispatch: workflow, ref }); },
  };
  return gh;
}

const addedAll = (files) => Object.keys(files).map((filename) => ({ filename, status: 'added' }));
const forkOf = (files) => Object.fromEntries(Object.entries(files).map(([k, v]) => [k, { bytes: v }]));
const run = (gh, over = {}) => inspect({ gh, repo: REPO, pr: 7, outDir: tmpdir(), now: NOW, fetchSha: () => GOOD_SHA, ...over });

// ---- the file-list gate ----

const ok4 = (dir = 'submissions/demo/claude-code-haiku/20261029T164010Z-octocat') => FILES.map((f) => ({ filename: `${dir}/${f}`, status: 'added' }));
const entries4 = (dir, over = {}) => Object.fromEntries(FILES.map((f) => [`${dir}/${f}`, { type: 'file', size: 1000, ...over }]));
const DIR = 'submissions/demo/claude-code-haiku/20261029T164010Z-octocat';

test('file gate: one new directory with the four files passes', () => {
  const g = gateFiles(ok4(), entries4(DIR));
  assert.deepEqual(g.reasons, []);
  assert.ok(g.ok);
  assert.equal(g.dir, DIR);
});

test('file gate: modified, extra, wrong place, traversal, symlink, oversize, size total, two dirs, missing', () => {
  const reasons = (changed, entries = entries4(DIR)) => gateFiles(changed, entries).reasons.join('\n');
  const first = ok4();
  assert.match(reasons([{ ...first[0], status: 'modified' }, ...first.slice(1)]), /modified, not added/);
  assert.match(reasons([...first, { filename: 'README.md', status: 'added' }]), /5 files|README\.md.*outside/);
  assert.match(reasons([{ filename: 'README.md', status: 'modified' }]), /outside/);
  assert.match(reasons([{ filename: '.github/workflows/automerge.yml', status: 'added' }]), /outside/);
  assert.match(reasons([{ filename: `${DIR}/extra.txt`, status: 'added' }, ...first.slice(0, 3)]), /extra\.txt.*outside/);
  assert.match(reasons([{ filename: `submissions/../.github/x/${FILES[0]}`, status: 'added' }]), /not a plain relative path/);
  assert.match(reasons([{ filename: 'submissions\\demo\\a\\b\\meta.json', status: 'added' }]), /not a plain relative path/);
  assert.match(reasons([{ filename: `submissions/demo/a/20261029T164010Z-x/../../../../meta.json`, status: 'added' }]), /not a plain relative path/);
  assert.match(reasons(first, entries4(DIR, { type: 'symlink' })), /symlink, not a regular file/);
  assert.match(reasons(first, entries4(DIR, { type: 'submodule' })), /submodule/);
  assert.match(reasons(first, entries4(DIR, { size: POLICY.fileBytes + 1 })), /the limit is/);
  assert.match(reasons(first, entries4(DIR, { size: POLICY.fileBytes })), /total/);
  assert.match(reasons(first.slice(0, 3)), /missing file\(s\): queries\.json/);
  assert.match(reasons([], {}), /no changed files/);
  const other = 'submissions/demo/claude-code-haiku/20261029T164011Z-octocat';
  assert.match(reasons([...first, ...ok4(other)], { ...entries4(DIR), ...entries4(other) }), /8 files|2 submission directories/);
  assert.match(reasons(first, {}), /could not be read/);
  assert.equal(gateFiles(first, entries4(DIR, { type: 'symlink' })).ok, false);
});

// ---- account limits ----

test('account limits: age, daily cap, recent refusal; maintainers skip age and refusals but not the cap', () => {
  const acct = (o) => gateAccount({ createdAt: '2020-01-01T00:00:00Z', association: 'NONE', mergedLastDay: 0, flaggedLastDay: 0, ...o }, NOW);
  assert.ok(acct({}).ok);
  assert.match(acct({ createdAt: '2026-10-20T00:00:00Z' }).reasons.join(), /younger than 30 days/);
  assert.match(acct({ createdAt: 'garbage' }).reasons.join(), /unknown/);
  assert.match(acct({ mergedLastDay: POLICY.perAccountPerDay }).reasons.join(), /already has/);
  assert.ok(acct({ mergedLastDay: POLICY.perAccountPerDay - 1 }).ok);
  assert.match(acct({ flaggedLastDay: 1 }).reasons.join(), /refused in the last 24 hours/);
  assert.ok(acct({ association: 'OWNER', createdAt: '2026-10-29T00:00:00Z', flaggedLastDay: 3 }).ok);
  assert.ok(!acct({ association: 'OWNER', mergedLastDay: 99 }).ok);
});

// ---- decide(): race, CLA ----

test('decide: a moved head, a missing CLA, or any failed gate stops the merge', () => {
  const good = { validatedSha: HEAD, currentSha: HEAD, files: { ok: true, reasons: [], dir: DIR }, validation: { ok: true, errors: [] }, cla: 'success', account: { ok: true, reasons: [] } };
  assert.equal(decide(good).merge, true);
  const raced = decide({ ...good, currentSha: 'c'.repeat(40) });
  assert.equal(raced.merge, false);
  assert.ok(raced.stale);
  const noCla = decide({ ...good, cla: 'pending' });
  assert.equal(noCla.merge, false);
  assert.ok(noCla.waitForCla);
  assert.equal(decide({ ...good, cla: null }).merge, false);
  const bad = decide({ ...good, validation: { ok: false, errors: ['hash'] }, cla: 'pending' });
  assert.ok(!bad.waitForCla);
  assert.equal(decide({ ...good, account: { ok: false, reasons: ['young'] } }).merge, false);
  assert.equal(decide({ ...good, files: { ok: false, reasons: ['x'], dir: null } }).merge, false);
});

// ---- inspect + apply against the fake GitHub ----

test('end to end: a good submission is merged with the checked sha, labelled, and the Pages build is dispatched', async () => {
  const { files } = await realPackage();
  const gh = fakeGh({ files, changed: addedAll(files), fork: forkOf(files) });
  const d = run(gh);
  assert.deepEqual(d.reasons, []);
  assert.equal(d.merge, true, JSON.stringify(d));
  const res = apply({ gh, repo: REPO, d });
  assert.equal(res.action, 'merged');
  const put = gh.calls.find((c) => c.method === 'PUT');
  assert.match(put.p, /pulls\/7\/merge$/);
  assert.equal(put.fields.sha, HEAD);
  assert.equal(put.fields.merge_method, 'squash');
  assert.ok(gh.calls.some((c) => c.dispatch === 'pages.yml' && c.ref === 'main'));
});

test('end to end: the branch moves while being checked → nothing is merged or said', async () => {
  const { files } = await realPackage();
  const gh = fakeGh({ files, changed: addedAll(files), fork: forkOf(files), heads: [HEAD, 'c'.repeat(40)] });
  const d = run(gh);
  assert.equal(d.merge, false);
  assert.ok(d.stale);
  const res = apply({ gh, repo: REPO, d });
  assert.equal(res.action, 'skip');
  assert.equal(gh.calls.length, 0);
});

test('end to end: GitHub refuses a merge whose sha moved after the check → skipped quietly', async () => {
  const { files } = await realPackage();
  const gh = fakeGh({ files, changed: addedAll(files), fork: forkOf(files) });
  const d = run(gh);
  gh.send = (method, p, fields) => {
    gh.calls.push({ method, p, fields });
    if (method === 'PUT') throw Object.assign(new Error('x'), { stderr: 'HTTP 409: Head branch was modified. Review and try the merge again.' });
    return '';
  };
  assert.equal(apply({ gh, repo: REPO, d }).action, 'skip');
  assert.ok(!gh.calls.some((c) => c.dispatch));
});

test('end to end: a fake "passing" CI changes nothing; the validator re-checks the bytes (tampered summary)', async () => {
  const { files } = await realPackage();
  const key = Object.keys(files).find((k) => k.endsWith('summary.json'));
  const bad = { ...files, [key]: Buffer.from(files[key].toString().replace(/"recall": [0-9.]+/, '"recall": 0.01')) };
  const gh = fakeGh({ files: bad, changed: addedAll(bad), fork: forkOf(bad) });
  const d = run(gh);
  assert.equal(d.merge, false);
  assert.match(d.reasons.join('\n'), /recompute/);
  const res = apply({ gh, repo: REPO, d });
  assert.equal(res.action, 'refused');
  assert.ok(gh.calls.some((c) => c.p?.endsWith('/issues/7/labels') && c.fields['labels[]'] === 'needs-review'));
  assert.ok(!gh.calls.some((c) => c.method === 'PUT'));
});

test('end to end: wrong hash at the pinned commit, a symlink, a README edit, a young account, the daily cap, no CLA', async () => {
  const { files } = await realPackage();
  const base = { files, changed: addedAll(files), fork: forkOf(files) };
  assert.match(run(fakeGh(base), { fetchSha: () => 'f'.repeat(64) }).reasons.join('\n'), /SKILL\.md/);

  const link = forkOf(files);
  link[Object.keys(files)[0]] = { type: 'symlink', size: 5, bytes: Buffer.from('x') };
  assert.match(run(fakeGh({ ...base, fork: link })).reasons.join('\n'), /symlink/);

  const withReadme = [...addedAll(files), { filename: 'README.md', status: 'modified' }];
  const r = run(fakeGh({ ...base, changed: withReadme }));
  assert.equal(r.merge, false);
  assert.match(r.reasons.join('\n'), /README\.md/);

  assert.match(run(fakeGh({ ...base, created: '2026-10-25T00:00:00Z' })).reasons.join('\n'), /younger/);
  assert.match(run(fakeGh({ ...base, merged: POLICY.perAccountPerDay })).reasons.join('\n'), /already has/);
  assert.match(run(fakeGh({ ...base, flagged: 1 })).reasons.join('\n'), /refused in the last/);
  const noCla = run(fakeGh({ ...base, cla: 'pending' }));
  assert.equal(noCla.merge, false);
  assert.ok(noCla.waitForCla);

  const other = run(fakeGh({ ...base, user: 'mallory' }));
  assert.match(other.reasons.join('\n'), /contributor/);
});

test('a pull request that touches nothing under submissions/, or is closed, is ignored', async () => {
  const { files } = await realPackage();
  const readme = fakeGh({ files, changed: [{ filename: 'README.md', status: 'modified' }], fork: {} });
  assert.ok(run(readme).skip);
  assert.ok(run(fakeGh({ files, changed: addedAll(files), fork: forkOf(files), state: 'closed' })).skip);
  const gh = fakeGh({ files, changed: addedAll(files), fork: forkOf(files) });
  assert.ok(run(gh, { expectSha: 'c'.repeat(40) }).skip);
});

test('apply rejects a malformed decision before touching the API', () => {
  const gh = fakeGh({ files: {}, changed: [], fork: {} });
  assert.throws(() => apply({ gh, repo: REPO, d: { pr: '7; rm', sha: 'x', merge: true } }), /malformed/);
  assert.throws(() => apply({ gh, repo: REPO, d: { pr: 7, sha: HEAD, merge: true, dir: 'submissions/../../x' } }), /bad directory/);
  assert.equal(gh.calls.length, 0);
});

// ---- the page builder ----

const row = (over = {}) => ({
  source: 'community', skill: 's', repo: 'https://github.com/o/r', subdir: '', commit: 'c'.repeat(40), sha: 'h', host: 'claude-code', model: 'm', grade: 'fair',
  recall: 0.6, recallCi: [0.4, 0.8], fpr: 0, fprCi: [0, 0.1], qPos: 10, qNeg: 10, date: '2026-10-29', links: ['submissions/x/y/z/'], contributor: 'ann', ...over,
});
const counts = { skills: 1, rows: 1, maintainer: 0, community: 1 };

test('page: every string from a submission is HTML-escaped and no script survives', () => {
  const evil = '<script>alert(1)</script>"\'&';
  const rows = buildRows([row({ skill: evil, model: evil, contributor: evil, host: 'claude-code' })]);
  const html = renderPage({ rows, counts, skipped: [{ dir: evil, reason: evil }] }, { repo: REPO });
  assert.ok(!html.includes('<script>alert'), 'raw script tag present');
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.equal(escapeHtml('a&b<c>"d\'e`f'), 'a&amp;b&lt;c&gt;&quot;d&#39;e&#96;f');
  // a contributor name that is not a valid login is shown as text, never linked
  assert.ok(!html.includes('href="https://github.com/<'));
});

test('page: only https://github.com links are written', () => {
  for (const bad of ['javascript:alert(1)', 'http://github.com/x/y', 'https://evil.example/x', 'https://github.com.evil.example/x', 'data:text/html,hi',
    '//evil.example/x', '../secret', 'submissions/../../x', 'submissions/a b/c', 'file:///etc/passwd', 'https://github.com/x/../y', 'https://github.com/x"onmouseover="y']) {
    assert.equal(safeLink(bad, REPO), null, bad);
  }
  assert.equal(safeLink('https://github.com/o/r/tree/abc/skills/x', REPO), 'https://github.com/o/r/tree/abc/skills/x');
  assert.equal(safeLink('submissions/a/b/c/', REPO), `https://github.com/${REPO}/tree/main/submissions/a/b/c/`);
  assert.equal(safeLink('step0/data/b/BATCH.md', REPO), `https://github.com/${REPO}/blob/main/step0/data/b/BATCH.md`);
  const rows = buildRows([row({ repo: 'javascript:alert(1)', links: ['javascript:alert(1)'] })]);
  const html = renderPage({ rows, counts }, { repo: REPO });
  assert.ok(!/href="javascript:/i.test(html));
});

test('page: one table per host, tags and raw-data links, no cross-host average', () => {
  const rows = buildRows([row(), row({ host: 'codebuddy', skill: 't', commit: 'd'.repeat(40) })]);
  const html = renderPage({ rows, counts: { skills: 2, rows: 2, maintainer: 0, community: 2 } }, { repo: REPO });
  assert.equal((html.match(/<table>/g) || []).length, 2);
  assert.ok(html.includes('Claude Code') && html.includes('CodeBuddy'));
  assert.ok(html.includes('community single sample'));
  assert.ok(html.includes(`https://github.com/${REPO}/tree/main/submissions/x/y/z/`));
  assert.ok(!/all hosts/i.test(html));
});
