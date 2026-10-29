// Offline tests for the community submission channel: schema, scrubbing, package building, the CI-side
// checks, and the `submit` command's dry path. No model call and no network: the skill-repo fetch and
// every GitHub call are faked.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadSchema, validate } from '../lib/schema.js';
import { emptyContext, findSecrets, localContext, scrubPackage, scrubValue } from '../lib/scrub.js';
import {
  SubmitError, buildPackage, keySource, checkPackageDir, computeSummary, gradeOfSummary, gradeTrigger, normalizeRepo, sha256, submissionPath, writePackage,
} from '../lib/submission.js';
import { ghState, openPullRequest, parseSubmitArgs } from '../lib/submit.js';
import { readRun } from '../lib/runs.js';
import { COMMIT, FACTS, SKILL_MD, makeRun, tmpdir } from './_submit-fixture.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CLI = path.join(ROOT, 'bin', 'skillgauntlet.js');
const GOOD_SHA = sha256(SKILL_MD);
const fetchGood = () => GOOD_SHA;

// a context that cannot collide with the machine running the tests
const ctxFor = (extra = {}) => ({ home: 'C:\\Users\\alice', names: ['alice'], hosts: ['ALICE-PC'], paths: ['C:\\Users\\alice', '/home/alice'], secrets: [], ...extra });

async function packageOf(opts = {}, build = {}) {
  const r = await makeRun(opts);
  const pkg = buildPackage({ runDir: r.runDir, skillDir: r.skillDir, facts: FACTS, contributor: 'octocat', ctx: ctxFor(), ...build });
  const out = path.join(tmpdir(), ...pkg.path);
  writePackage(out, pkg);
  return { ...r, pkg, out, layout: pkg.path.join('/') };
}

test('schema checker: accepts a built package, rejects missing, extra and malformed fields', async () => {
  const { pkg } = await packageOf();
  const root = loadSchema();
  assert.deepEqual(validate(root, pkg.files.meta, 'meta'), []);
  assert.deepEqual(validate(root, pkg.files.raw[0], 'rawLine'), []);

  const noSub = { ...pkg.files.meta };
  delete noSub.submission;
  assert.match(JSON.stringify(validate(root, noSub, 'meta')), /submission.*is required/);

  const extra = { ...pkg.files.meta, homeDir: 'C:\\x' };
  assert.match(JSON.stringify(validate(root, extra, 'meta')), /homeDir.*not allowed/);

  const badSha = structuredClone(pkg.files.meta);
  badSha.submission.skill.skillMdSha256 = 'abc';
  assert.match(JSON.stringify(validate(root, badSha, 'meta')), /skillMdSha256/);

  const badRepo = structuredClone(pkg.files.meta);
  badRepo.submission.skill.repo = 'https://evil.example/x/y';
  assert.ok(validate(root, badRepo, 'meta').length);

  const interrupted = { ...pkg.files.meta, interrupted: true };
  assert.ok(validate(root, interrupted, 'meta').length, 'an interrupted run is not a submission');
});

test('schema checker refuses a keyword it does not implement', () => {
  assert.throws(() => validate({ $defs: { a: { oneOf: [] } } }, 1, 'a'), /not supported/);
});

test('scrub: paths in both slash styles, login name, host name and env values are replaced', () => {
  const ctx = ctxFor({ secrets: ['hunter2-hunter2'] });
  const { value, counts } = scrubValue({
    error: 'ENOENT C:\\Users\\alice\\proj\\.skillgauntlet\\x and /home/alice/proj, by alice on ALICE-PC with hunter2-hunter2',
    nested: ['D:\\work\\secret-project\\file.txt', '/tmp/sg-abc/run'],
  }, ctx);
  const text = JSON.stringify(value);
  for (const leak of ['alice', 'ALICE-PC', 'hunter2', 'secret-project', 'sg-abc']) assert.ok(!text.includes(leak), `${leak} survived: ${text}`);
  assert.ok(counts.path >= 3 && counts.username >= 1 && counts.hostname === 1 && counts['env-value'] === 1, JSON.stringify(counts));
});

test('scrub: key and token shapes are redacted', () => {
  const samples = [
    'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789',
    'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
    'AKIAABCDEFGHIJKLMNOP',
    'Bearer abcdefghijklmnopqrstuvwxyz012345',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop',
    'API_KEY=abcd1234efgh5678',
    'https://user:pass1234@example.com/x',
    '-----BEGIN RSA PRIVATE KEY-----',
    'mail me at someone@example.com',
  ];
  for (const s of samples) {
    const { value } = scrubValue({ error: `failed: ${s} end` }, ctxFor());
    assert.deepEqual(findSecrets(value, ctxFor()), [], `still detected after scrub: ${s} -> ${value.error}`);
    assert.ok(!value.error.includes(s.slice(8)), `not redacted: ${s}`);
  }
});

test('scrub: question text is never edited, but a secret in it stops the package', () => {
  const files = {
    'queries.json': { queries: [{ id: 'q1', query: 'my key is sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789', shouldTrigger: true }] },
  };
  const verbatim = scrubPackage(files, ctxFor(), { verbatim: ['queries.json'] });
  assert.equal(verbatim.files['queries.json'].queries[0].query, files['queries.json'].queries[0].query);
  assert.ok(verbatim.problems.length, 'a secret in a question must be reported');

  const raw = scrubPackage({ 'raw.jsonl': [{ query: 'hello alice', note: 'by alice' }] }, ctxFor());
  assert.equal(raw.files['raw.jsonl'][0].query, 'hello alice', 'query text is kept as written');
  assert.equal(raw.files['raw.jsonl'][0].note, 'by <user>');
  assert.ok(raw.problems.some((p) => p.kind === 'username'), 'a username left in the question text is a problem, not silently edited');
});

test('scrub: a high-entropy token that no pattern names is still refused', () => {
  const found = findSecrets({ error: 'token Zx9Qw2Lm8Pq4Rt7Vb3Nc6Hd1Fg5Js0Ka2Yu' }, emptyContext());
  assert.equal(found[0].kind, 'high-entropy-token');
  assert.deepEqual(findSecrets({ sha: 'a'.repeat(64), commit: 'b'.repeat(40) }, emptyContext()), [], 'hashes are meant to be there');
});

test('buildPackage: scrubs a leaking run, keeps the numbers, and the result passes the CI check', async () => {
  const leak = 'spawn failed in C:\\Users\\alice\\proj with key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789';
  const { pkg, out, layout, result } = await packageOf({ leak });
  const text = JSON.stringify(pkg.files);
  assert.ok(!text.includes('alice') && !text.includes('sk-ant'), 'leak survived the package');
  assert.ok(pkg.counts.path >= 1 && pkg.counts.secret >= 1);
  assert.equal(pkg.files.summary.recall, result.recall);
  assert.equal(pkg.files.meta.submission.skill.skillMdSha256, GOOD_SHA);
  assert.match(layout, /^demo\/claude-code-claude-x\/\d{8}T\d{6}Z-octocat$/);

  const checked = checkPackageDir(out, { layoutPath: layout, author: 'OctoCat', fetchSha: fetchGood });
  assert.deepEqual(checked.errors, []);
  assert.ok(checked.ok);
});

test('SKILL.md hash ignores line endings, so a Windows (CRLF) checkout matches the blob in the repository', async () => {
  const r = await makeRun();
  const crlf = SKILL_MD.replace(/\n/g, '\r\n');
  fs.writeFileSync(path.join(r.skillDir, 'SKILL.md'), crlf);
  const metaFile = path.join(r.runDir, 'meta.json');
  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
  meta.skillFingerprint = sha256(crlf).slice(0, 16); // what the run recorded on a CRLF checkout
  fs.writeFileSync(metaFile, JSON.stringify(meta));
  const pkg = buildPackage({ runDir: r.runDir, skillDir: r.skillDir, facts: FACTS, contributor: 'octocat', ctx: ctxFor() });
  assert.equal(pkg.files.meta.submission.skill.skillMdSha256, GOOD_SHA);
});

test('apiKeySource keeps "none" and env var names but not an account endpoint host name', () => {
  assert.equal(keySource('none'), 'none');
  assert.equal(keySource('ANTHROPIC_API_KEY'), 'ANTHROPIC_API_KEY');
  assert.equal(keySource('copilot.tencent.com'), 'other');
  assert.equal(keySource(null), null);
});

test('buildPackage: the contributor login is not scrubbed even when it equals the OS user name', async () => {
  const r = await makeRun();
  const pkg = buildPackage({ runDir: r.runDir, skillDir: r.skillDir, facts: FACTS, contributor: 'alice', ctx: ctxFor() });
  assert.equal(pkg.files.meta.submission.contributor, 'alice');
});

test('buildPackage refuses: no source, dirty checkout, edited SKILL.md, unfinished run, edited questions', async () => {
  const r = await makeRun();
  const build = (over = {}, facts = FACTS) => () => buildPackage({ runDir: r.runDir, skillDir: r.skillDir, facts, contributor: 'octocat', ctx: ctxFor(), ...over });
  assert.throws(build({}, { repo: null, commit: null }), (e) => e.messageKey === 'submitNoSource');
  assert.throws(build({}, { ...FACTS, dirty: true }), (e) => e.messageKey === 'submitDirty');
  assert.throws(build({}, { ...FACTS, commit: 'abc' }), (e) => e.messageKey === 'submitBadCommit');

  fs.writeFileSync(path.join(r.skillDir, 'SKILL.md'), `${SKILL_MD}changed\n`);
  assert.throws(build(), (e) => e.messageKey === 'submitSkillChanged');
  fs.writeFileSync(path.join(r.skillDir, 'SKILL.md'), SKILL_MD);

  const q = path.join(r.runDir, 'queries.json');
  const original = fs.readFileSync(q, 'utf8');
  fs.writeFileSync(q, original.replace('demo thing number 1', 'demo thing number 1!'));
  assert.throws(build(), (e) => e.messageKey === 'submitQueriesChanged');
  fs.writeFileSync(q, original);

  const meta = JSON.parse(fs.readFileSync(path.join(r.runDir, 'meta.json'), 'utf8'));
  fs.writeFileSync(path.join(r.runDir, 'meta.json'), JSON.stringify({ ...meta, interrupted: true }));
  assert.throws(build(), (e) => e.messageKey === 'submitUnfinished');
});

test('buildPackage refuses to package when a secret sits in the question text', async () => {
  const r = await makeRun();
  const q = path.join(r.runDir, 'queries.json');
  const j = JSON.parse(fs.readFileSync(q, 'utf8'));
  j.queries[0].query = 'use token ghp_abcdefghijklmnopqrstuvwxyz0123456789 please';
  fs.writeFileSync(q, JSON.stringify(j));
  const meta = JSON.parse(fs.readFileSync(path.join(r.runDir, 'meta.json'), 'utf8'));
  const { querySetHash } = await import('../lib/runs.js');
  meta.querySets[0].sha256 = querySetHash(j.queries);
  fs.writeFileSync(path.join(r.runDir, 'meta.json'), JSON.stringify(meta));
  assert.throws(
    () => buildPackage({ runDir: r.runDir, skillDir: r.skillDir, facts: FACTS, contributor: 'octocat', ctx: ctxFor() }),
    (e) => e instanceof SubmitError && e.messageKey === 'submitSecrets' && e.problems.length > 0,
  );
});

test('CI check: each kind of tampering is named', async () => {
  const base = await packageOf();
  const ok = (over = {}) => checkPackageDir(base.out, { layoutPath: base.layout, author: 'octocat', fetchSha: fetchGood, ...over });
  const edit = (file, fn) => {
    const f = path.join(base.out, file);
    const original = fs.readFileSync(f, 'utf8');
    fs.writeFileSync(f, fn(original));
    return () => fs.writeFileSync(f, original);
  };
  assert.ok(ok().ok);

  let undo = edit('summary.json', (s) => s.replace(/"recall": [0-9.]+/, '"recall": 0.99'));
  assert.match(ok().errors.join('\n'), /do not recompute from raw\.jsonl/);
  undo();

  undo = edit('raw.jsonl', (s) => s.replace('"verdict":"triggered"', '"verdict":"not_triggered"'));
  assert.match(ok().errors.join('\n'), /do not recompute/);
  undo();

  assert.match(ok({ fetchSha: () => 'f'.repeat(64) }).errors.join('\n'), /SKILL\.md: at .* the hash is/);
  assert.match(ok({ fetchSha: () => { throw new Error('no network'); } }).errors.join('\n'), /could not fetch/);
  assert.match(ok({ author: 'someone-else' }).errors.join('\n'), /contributor/);
  assert.match(ok({ layoutPath: 'demo/x/y' }).errors.join('\n'), /belongs at submissions/);

  undo = edit('raw.jsonl', (s) => `${s}${JSON.stringify({ host: 'claude-code', verdict: 'error', queryId: 'p1', run: 9, query: 'please do the demo thing number 1', shouldTrigger: true, error: 'key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789' })}\n`);
  assert.match(ok().errors.join('\n'), /secret-shaped|trials is/);
  undo();

  undo = edit('raw.jsonl', (s) => s.replace('"error":null', '"error":"failed at C:\\\\Users\\\\bob\\\\x"'));
  assert.match(ok().errors.join('\n'), /local path/);
  undo();

  fs.writeFileSync(path.join(base.out, 'extra.sh'), 'echo hi');
  assert.match(ok().errors.join('\n'), /extra\.sh: not allowed/);
  fs.rmSync(path.join(base.out, 'extra.sh'));

  undo = edit('meta.json', (s) => s.replace('"schema": "skillgauntlet/run/1"', '"schema": "other"'));
  assert.match(ok().errors.join('\n'), /schema/);
  undo();

  undo = edit('meta.json', (s) => s.replace(/"trials": \d+/, '"trials": 999'));
  assert.match(ok().errors.join('\n'), /trials is 999/);
  undo();

  assert.ok(ok().ok, 'after every edit is undone the package is valid again');
});

test('CI check: a JSON bomb and an oversized line are rejected without being walked', async () => {
  const base = await packageOf();
  fs.writeFileSync(path.join(base.out, 'queries.json'), `${'['.repeat(500)}${']'.repeat(500)}`);
  assert.match(checkPackageDir(base.out, { fetchSha: fetchGood }).errors.join('\n'), /nested deeper|not valid JSON/);
});

test('computeSummary reproduces what finishRun wrote, from the raw records alone', async () => {
  const r = await makeRun();
  const { records, summary } = readRun(r.runDir);
  const again = computeSummary(records, { runs: 2, expected: r.queries.length * 2 });
  const { model, backend, host, ...numbers } = summary; // run conditions live in meta.json, not recomputed from records
  assert.deepEqual(JSON.parse(JSON.stringify(again)), JSON.parse(JSON.stringify(numbers)));
});

test('grade rule matches step0/trigger_test.py', () => {
  assert.equal(gradeTrigger({ recall: 0.9, fpr: 0, nPos: 12, nNeg: 12 }), 'well');
  assert.equal(gradeTrigger({ recall: 0.6, fpr: 0.2, nPos: 12, nNeg: 12 }), 'fair');
  assert.equal(gradeTrigger({ recall: 0.4, fpr: 0, nPos: 12, nNeg: 12 }), 'poorly');
  assert.equal(gradeTrigger({ recall: 0.9, fpr: 0.3, nPos: 12, nNeg: 12 }), 'poorly');
  assert.equal(gradeTrigger({ recall: 0.9, fpr: 0, nPos: 9, nNeg: 12 }), 'insufficient');
});

test('submissionPath, normalizeRepo and argument parsing', async () => {
  const { pkg } = await packageOf();
  assert.equal(submissionPath(pkg.files.meta).length, 3);
  assert.equal(normalizeRepo('git@github.com:a/b.git'), 'https://github.com/a/b');
  assert.equal(normalizeRepo('https://token@github.com/a/b.git'), 'https://github.com/a/b');
  assert.equal(normalizeRepo('https://example.com/a/b'), null);
  assert.deepEqual(parseSubmitArgs(['d', '--dry-run', '--repo', 'r']), { dir: 'd', 'dry-run': true, repo: 'r' });
  assert.throws(() => parseSubmitArgs([]), /usage/);
  assert.throws(() => parseSubmitArgs(['d', '--bogus']), /usage/);
});

test('ghState: missing, not logged in, logged in', () => {
  const enoent = () => { throw Object.assign(new Error('x'), { code: 'ENOENT' }); };
  assert.deepEqual(ghState(enoent), { usable: false, installed: false, user: null });
  assert.equal(ghState(() => { throw new Error('not logged in'); }).installed, true);
  const ok = ghState((cmd, args) => (args[0] === 'api' ? 'octocat 583231\n' : ''));
  assert.deepEqual(ok, { usable: true, installed: true, user: 'octocat', id: '583231' });
});

test('openPullRequest: forks, branches, commits as the contributor, pushes to the fork, opens the PR', async () => {
  const { pkg, out } = await packageOf();
  const calls = [];
  const exec = (cmd, args) => {
    calls.push([cmd, ...args]);
    if (args[0] === 'clone') fs.mkdirSync(args.at(-1), { recursive: true });
    if (cmd === 'gh' && args[0] === 'pr') return 'https://github.com/SkillGauntlet/SkillGauntlet/pull/7\n';
    return '';
  };
  const url = openPullRequest({ pkgDir: out, pkg, gh: { user: 'octocat', id: '583231' }, exec, say: () => {} });
  assert.equal(url, 'https://github.com/SkillGauntlet/SkillGauntlet/pull/7');
  const flat = calls.map((c) => c.join(' '));
  assert.ok(flat.some((c) => c.startsWith('gh repo fork SkillGauntlet/SkillGauntlet --clone=false')));
  assert.ok(flat.some((c) => c.includes('checkout -b submit/demo-claude-code-')));
  assert.ok(flat.some((c) => c.includes('user.email=583231+octocat@users.noreply.github.com')));
  assert.ok(flat.some((c) => c.includes('push -q fork submit/')) && flat.some((c) => c.includes('credential.helper=')));
  assert.ok(flat.some((c) => c.includes('--head octocat:submit/') && c.includes('--base main')));
  assert.ok(!flat.some((c) => /push .*(origin|SkillGauntlet\/SkillGauntlet\.git)/.test(c)), 'never pushes to upstream');
});

function runCli(args, env = {}) {
  return spawnSync(process.execPath, [CLI, ...args, '--lang', 'en'], { encoding: 'utf8', env: { ...process.env, ...env }, input: '' });
}

test('CLI submit --dry-run: previews, writes the package, uploads nothing', async () => {
  const r = await makeRun({ leak: `failed in ${os.homedir()}${path.sep}proj` });
  const outDir = tmpdir();
  const res = runCli(['submit', r.runDir, '--dry-run', '--skip-remote-check', '--github-user', 'octocat', '--repo', FACTS.repo, '--commit', COMMIT, '--subdir', FACTS.subdir, '--out', outDir]);
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /exactly what would be submitted/);
  assert.match(res.stdout, /Nothing has been uploaded yet/);
  assert.match(res.stdout, /sha256 [0-9a-f]{16}…/);
  assert.match(res.stdout, /scrubbed\s+.*path ×/);
  assert.match(res.stdout, /Contributor License Agreement/);
  assert.match(res.stdout, /cannot prove/);
  assert.match(res.stdout, /Dry run: nothing was submitted/);
  const dirs = fs.readdirSync(path.join(outDir, 'demo'));
  assert.equal(dirs.length, 1);
  const pkgDir = path.join(outDir, 'demo', dirs[0], fs.readdirSync(path.join(outDir, 'demo', dirs[0]))[0]);
  assert.deepEqual(fs.readdirSync(pkgDir).sort(), ['meta.json', 'queries.json', 'raw.jsonl', 'summary.json']);
  assert.ok(!fs.readFileSync(path.join(pkgDir, 'raw.jsonl'), 'utf8').includes(os.homedir()));
});

test('CLI submit refuses an unpinned skill and says what to pass', async () => {
  const r = await makeRun();
  const res = runCli(['submit', r.runDir, '--dry-run', '--skip-remote-check', '--github-user', 'octocat']);
  assert.equal(res.status, 1);
  assert.match(res.stdout, /--repo https:\/\/github\.com\/owner\/repo --commit/);
});

test('CLI submit without consent submits nothing and, without gh, prints the manual steps', async () => {
  const r = await makeRun();
  const outDir = tmpdir();
  // gh is hidden from PATH so the manual path is exercised on any machine
  const empty = tmpdir();
  const res = spawnSync(process.execPath, [CLI, 'submit', r.runDir, '--skip-remote-check', '--yes', '--github-user', 'octocat', '--repo', FACTS.repo, '--commit', COMMIT, '--subdir', FACTS.subdir, '--out', outDir, '--lang', 'en'], {
    encoding: 'utf8', env: { ...process.env, PATH: empty, Path: empty }, input: '',
  });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /GitHub CLI \(gh\) is not installed or not logged in/);
  assert.match(res.stdout, /To submit by hand/);
  assert.match(res.stdout, /Sign the CLA/);
});

test('shareState says results stay local until submit, in all three languages', () => {
  const src = fs.readFileSync(path.join(ROOT, 'lib', 'i18n.js'), 'utf8');
  for (const needle of ['skillgauntlet submit', 'skillgauntlet submit', 'skillgauntlet submit']) assert.ok(src.includes(needle));
  assert.equal([...src.matchAll(/shareState: '[^']*skillgauntlet submit/g)].length, 3);
});
