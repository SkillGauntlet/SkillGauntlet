// A submission is a finished trigger run plus the facts a stranger needs to check it: which skill
// (repo, pinned commit, SKILL.md hash), which host and model, which questions, which runner.
//
// The same module builds a package on the contributor's machine and checks one in CI, so the two cannot
// disagree about what a valid submission is. Checking is only ever about format, hashes and arithmetic:
// nothing here can show that the trials were really run, and nothing in the docs says it can.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { loadSchema, maxDepth, validate } from './schema.js';
import { GENERIC_PATHS, emptyContext, findSecrets, localContext, scrubPackage } from './scrub.js';
import { summarize, wilson } from './trial.js';
import { querySetHash, validRecords } from './runs.js';

export const SUBMISSION_SCHEMA = 'skillgauntlet/submission/1';
export const FILES = ['meta.json', 'raw.jsonl', 'summary.json', 'queries.json'];
export const LIMITS = { fileBytes: 4 * 1024 * 1024, lineBytes: 20 * 1024, depth: 12 };
const MIN_TRIALS = 10; // the same floor as step0/trigger_test.py: fewer trials on either side gets no grade

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// The SKILL.md hash a submission states is taken over the text with LF line endings. A Windows checkout
// with autocrlf writes CRLF, and its raw bytes hash differently from the blob in the repository: without
// this, every honest Windows submission would fail the hash check against the pinned commit.
export const skillMdHash = (buf) => sha256(Buffer.from(String(buf).replace(/\r\n/g, '\n'), 'utf8'));
export const slug = (s) => String(s || 'unknown').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'unknown';

// Same coarse rule as step0/trigger_test.py grade(): no precise scores, and no grade on thin data.
export function gradeTrigger({ recall, fpr, nPos, nNeg }) {
  if (nPos < MIN_TRIALS || nNeg < MIN_TRIALS || recall == null || fpr == null) return 'insufficient';
  const rarely = recall < 0.5;
  const over = fpr > 0.25;
  if (recall >= 0.8 && fpr <= 0.1) return 'well';
  return rarely || over ? 'poorly' : 'fair';
}

export function gradeOfSummary(summary) {
  const nPos = summary.questions.filter((q) => q.shouldTrigger).reduce((a, q) => a + q.n, 0);
  const nNeg = summary.questions.filter((q) => !q.shouldTrigger).reduce((a, q) => a + q.n, 0);
  return gradeTrigger({ recall: summary.recall, fpr: summary.fpr, nPos, nNeg });
}

// The same numbers execute.js finishRun() writes into summary.json, recomputed from the raw records.
export function computeSummary(rawRecords, { runs, expected }) {
  const records = validRecords(rawRecords);
  const s = summarize(records);
  const posQ = s.questions.filter((q) => q.shouldTrigger);
  const negQ = s.questions.filter((q) => !q.shouldTrigger);
  return {
    ...s,
    failedTrials: rawRecords.length - records.length,
    incomplete: expected ? Math.max(0, expected - records.length) : 0,
    runs,
    recallCi: wilson(posQ.filter((q) => q.hits * 2 > q.n).length, posQ.length),
    fprCi: wilson(negQ.filter((q) => q.hits > 0).length, negQ.length),
  };
}

const compactTime = (iso) => iso.replace(/[-:]/g, '').replace(/\.\d+/, '');

// submissions/<skill-id>/<host>-<model>/<timestamp>-<github-user>/
export function submissionPath(meta) {
  const sub = meta.submission;
  const model = sub.model.resolved || sub.model.requested || 'unknown';
  return [slug(sub.skill.name), `${sub.host.id}-${slug(model)}`, `${compactTime(meta.startedAt)}-${sub.contributor}`];
}

export function normalizeRepo(url) {
  const m = /^(?:https?:\/\/(?:[^@/]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(String(url).trim());
  return m ? `https://github.com/${m[1]}/${m[2]}` : null;
}

const git = (cwd, args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// Where the skill came from, read from the checkout the run was made on. Flags can fill in or override
// (a skill copied in without its .git, or a fork's remote that is not the canonical repo).
export function gitFacts(skillDir, overrides = {}) {
  const facts = { repo: null, commit: null, subdir: null, dirty: false };
  try {
    facts.commit = git(skillDir, ['rev-parse', 'HEAD']);
    facts.repo = normalizeRepo(git(skillDir, ['remote', 'get-url', 'origin']));
    facts.subdir = git(skillDir, ['rev-parse', '--show-prefix']).replace(/\/$/, '');
    facts.dirty = git(skillDir, ['status', '--porcelain', '--untracked-files=no', '--', '.']) !== '';
  } catch { /* not a git checkout, or no origin: the overrides must supply it */ }
  if (overrides.repo) facts.repo = normalizeRepo(overrides.repo);
  if (overrides.commit) { facts.commit = overrides.commit; facts.dirty = false; }
  if (overrides.subdir !== undefined) facts.subdir = overrides.subdir.replace(/^\/+|\/+$/g, '');
  return facts;
}

// The question "does SKILL.md at that commit hash to this?" asked of the public repo. Used by the CLI
// before it opens a pull request and by CI after one is opened.
export function skillShaAtCommit({ repo, commit, subdir }, { exec = execFileSync } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-fetch-'));
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'echo' };
  const run = (args) => exec('git', ['-C', tmp, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  try {
    run(['init', '-q']);
    run(['fetch', '-q', '--depth', '1', repo, commit]);
    const file = subdir ? `${subdir}/SKILL.md` : 'SKILL.md';
    return skillMdHash(run(['show', `FETCH_HEAD:${file}`]));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const META_KEYS = [
  'schema', 'runId', 'runnerVersion', 'skill', 'host', 'backend', 'model', 'runs', 'maxExplore', 'depth', 'querySets',
  'skillFingerprint', 'platform', 'startedAt', 'finishedAt', 'trials', 'interrupted', 'resumedAt', 'modelResolved',
  'apiKeySource', 'claudeCodeVersion', 'loadedSkills', 'tools', 'incompleteTrials',
];

function environmentOf(meta) {
  const loaded = [...(meta.loadedSkills || [])].sort();
  const tools = [...(meta.tools || [])].sort();
  const osName = String(meta.platform || '').split(' ')[0];
  const id = sha256(JSON.stringify({ host: meta.host, v: meta.claudeCodeVersion || null, os: osName, loaded, tools })).slice(0, 12);
  return { id, platform: meta.platform, hostVersion: meta.claudeCodeVersion || null, backend: meta.backend, loadedSkills: loaded, toolCount: tools.length };
}

function readJsonl(text) {
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

export class SubmitError extends Error {
  constructor(key, vars = {}, message) {
    super(message || key);
    this.messageKey = key;
    this.vars = vars;
  }
}

// Build, scrub and validate a package from a run directory. Nothing is written. Throws SubmitError for
// anything the contributor can fix; returns { path, files, counts } otherwise.
export function buildPackage({ runDir, skillDir, facts, contributor, ctx: given, now = new Date() }) {
  // The GitHub login is public by design and goes in the file, so it must not be scrubbed as "your username".
  const base = given || localContext({ extraPaths: [runDir, skillDir] });
  const ctx = { ...base, names: base.names.filter((n) => n.toLowerCase() !== String(contributor).toLowerCase()) };
  const read = (f) => fs.readFileSync(path.join(runDir, f), 'utf8');
  let meta;
  let rawRecords;
  let summary;
  let queries;
  try { meta = JSON.parse(read('meta.json')); } catch { throw new SubmitError('submitNoRun', { dir: runDir }); }
  try { rawRecords = readJsonl(read('raw.jsonl')); } catch { throw new SubmitError('submitNoRun', { dir: runDir }); }
  try { summary = JSON.parse(read('summary.json')); } catch { throw new SubmitError('submitNoSummary', { dir: runDir }); }
  try { queries = JSON.parse(read('queries.json')); } catch { throw new SubmitError('submitNoQueries', { dir: runDir }); }

  if (meta.schema !== 'skillgauntlet/run/1' || !['claude-code', 'codebuddy', 'codewhale'].includes(meta.host) || summary.probe) {
    throw new SubmitError('submitNotTrigger', { host: meta.host });
  }
  if (!meta.finishedAt || meta.interrupted || meta.stoppedAt) throw new SubmitError('submitUnfinished', { dir: runDir });
  if (meta.querySets?.[0]?.sha256 !== querySetHash(queries.queries)) throw new SubmitError('submitQueriesChanged');
  if (!facts.repo || !facts.commit) throw new SubmitError('submitNoSource');
  if (!/^[0-9a-f]{40}$/.test(facts.commit)) throw new SubmitError('submitBadCommit', { commit: facts.commit });
  if (facts.dirty) throw new SubmitError('submitDirty');

  const skillMd = path.join(skillDir, 'SKILL.md');
  let skillBytes;
  try { skillBytes = fs.readFileSync(skillMd); } catch { throw new SubmitError('submitNoSkillMd', { dir: skillDir }); }
  // the run's fingerprint is over the raw bytes (queries.js); the submitted hash is the line-ending-neutral one
  if (meta.skillFingerprint && sha256(skillBytes).slice(0, 16) !== meta.skillFingerprint) throw new SubmitError('submitSkillChanged');
  const skillSha = skillMdHash(skillBytes);

  const submission = {
    schema: SUBMISSION_SCHEMA,
    contributor,
    skill: { name: meta.skill, repo: facts.repo, commit: facts.commit, subdir: facts.subdir || '', skillMdSha256: skillSha },
    host: { id: meta.host, version: meta.claudeCodeVersion || null },
    model: { requested: meta.model ?? null, resolved: meta.modelResolved ?? null },
    queryPack: { id: meta.querySets[0].id, sha256: sha256(JSON.stringify(queries.queries)), queries: queries.queries.length },
    environment: environmentOf(meta),
    submittedAt: now.toISOString().replace(/\.\d+Z$/, 'Z'),
  };
  const kept = Object.fromEntries(META_KEYS.filter((k) => meta[k] !== undefined).map((k) => [k, meta[k]]));
  const rows = rawRecords.map((r) => (typeof r.error === 'string' ? { ...r, error: r.error.slice(0, 380) } : r));

  const scrubbed = scrubPackage({
    'meta.json': { ...kept, submission },
    'raw.jsonl': rows,
    'summary.json': summary,
    'queries.json': { schema: 'skillgauntlet/queries/1', queries: queries.queries },
  }, ctx, { verbatim: ['queries.json'] });
  if (scrubbed.problems.length) throw Object.assign(new SubmitError('submitSecrets'), { problems: scrubbed.problems });

  // The scrubbed copy is what gets submitted, so it is what is validated.
  const out = { meta: scrubbed.files['meta.json'], raw: scrubbed.files['raw.jsonl'], summary: scrubbed.files['summary.json'], queries: scrubbed.files['queries.json'] };
  const errors = checkParsed(out);
  if (errors.length) throw Object.assign(new SubmitError('submitInvalid', { n: errors.length }), { errors });
  return { path: submissionPath(out.meta), files: out, counts: scrubbed.counts };
}

export function serialize(pkg) {
  return {
    'meta.json': `${JSON.stringify(pkg.files.meta, null, 2)}\n`,
    'raw.jsonl': pkg.files.raw.map((r) => JSON.stringify(r)).join('\n') + '\n',
    'summary.json': `${JSON.stringify(pkg.files.summary, null, 2)}\n`,
    'queries.json': `${JSON.stringify(pkg.files.queries, null, 2)}\n`,
  };
}

export function writePackage(outDir, pkg) {
  fs.mkdirSync(outDir, { recursive: true });
  const text = serialize(pkg);
  for (const [name, body] of Object.entries(text)) fs.writeFileSync(path.join(outDir, name), body);
  return Object.fromEntries(Object.entries(text).map(([n, b]) => [n, Buffer.byteLength(b)]));
}

const near = (a, b) => (a == null || b == null ? a === b : Math.abs(a - b) < 1e-9);

// Schema plus the cross-file facts, on parsed content. Returns a list of strings, empty when it is fine.
export function checkParsed({ meta, raw, summary, queries }) {
  const root = loadSchema();
  const errors = [];
  const add = (file, list) => list.forEach((e) => errors.push(`${file}: ${e.path} ${e.message}`));
  add('meta.json', validate(root, meta, 'meta'));
  add('summary.json', validate(root, summary, 'summary'));
  add('queries.json', validate(root, queries, 'queries'));
  raw.forEach((row, i) => add(`raw.jsonl line ${i + 1}`, validate(root, row, 'rawLine')));
  if (errors.length) return errors;

  const sub = meta.submission;
  if (sub.skill.name !== meta.skill) errors.push('meta.json: submission.skill.name differs from skill');
  if (sub.host.id !== meta.host) errors.push('meta.json: submission.host.id differs from host');
  if (meta.querySets[0].sha256 !== querySetHash(queries.queries)) errors.push('queries.json: hash differs from meta.querySets[0].sha256');
  if (sub.queryPack.sha256 !== sha256(JSON.stringify(queries.queries))) errors.push('queries.json: hash differs from submission.queryPack.sha256');
  if (sub.queryPack.queries !== queries.queries.length) errors.push('submission.queryPack.queries differs from the number of questions');
  if (meta.trials !== raw.length) errors.push(`meta.json: trials is ${meta.trials} but raw.jsonl has ${raw.length} lines`);

  // every record must be one of the pack's questions, with the pack's label
  const byId = new Map(queries.queries.map((q) => [q.id, q]));
  let bad = 0;
  for (const r of raw) {
    const q = byId.get(r.queryId);
    if (!q || q.query !== r.query || q.shouldTrigger !== r.shouldTrigger) bad += 1;
    if (r.host !== meta.host) bad += 1;
  }
  if (bad) errors.push(`raw.jsonl: ${bad} record(s) do not match queries.json or the run's host`);

  const again = computeSummary(raw, { runs: meta.runs, expected: queries.queries.length * meta.runs });
  const same = summary.trials === again.trials && near(summary.recall, again.recall) && near(summary.fpr, again.fpr)
    && near(summary.noToolRate, again.noToolRate) && summary.failedTrials === again.failedTrials
    && near(summary.recallCi[0], again.recallCi[0]) && near(summary.recallCi[1], again.recallCi[1])
    && near(summary.fprCi[0], again.fprCi[0]) && near(summary.fprCi[1], again.fprCi[1])
    && JSON.stringify(summary.questions) === JSON.stringify(again.questions);
  if (!same) {
    errors.push(`summary.json: the numbers do not recompute from raw.jsonl (summary says recall ${summary.recall}, `
      + `false positives ${summary.fpr}, ${summary.trials} trials; raw.jsonl gives ${again.recall}, ${again.fpr}, ${again.trials})`);
  }
  if (summary.incomplete) errors.push(`summary.json: the run is incomplete (${summary.incomplete} trials owed); finish it with resume first`);
  return errors;
}

// CI-side check of a directory on disk. layoutPath is the path below submissions/ ('a/b/c'), author the
// pull request's GitHub login. Fetching the skill repo is injected so tests need no network.
export function checkPackageDir(dir, { layoutPath = null, author = null, fetchSha = skillShaAtCommit } = {}) {
  const errors = [];
  const names = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  for (const f of FILES) if (!names.includes(f)) errors.push(`${f}: missing`);
  for (const f of names) if (!FILES.includes(f)) errors.push(`${f}: not allowed in a submission (only ${FILES.join(', ')})`);
  if (errors.length) return { ok: false, errors };

  const parsed = {};
  for (const f of FILES) {
    const file = path.join(dir, f);
    if (fs.statSync(file).size > LIMITS.fileBytes) { errors.push(`${f}: larger than ${LIMITS.fileBytes / 1024 / 1024} MB`); continue; }
  }
  if (errors.length) return { ok: false, errors };
  try {
    parsed.meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
    parsed.summary = JSON.parse(fs.readFileSync(path.join(dir, 'summary.json'), 'utf8'));
    parsed.queries = JSON.parse(fs.readFileSync(path.join(dir, 'queries.json'), 'utf8'));
  } catch (e) { return { ok: false, errors: [`not valid JSON: ${e.message}`] }; }
  const lines = fs.readFileSync(path.join(dir, 'raw.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean);
  if (lines.some((l) => Buffer.byteLength(l) > LIMITS.lineBytes)) return { ok: false, errors: [`raw.jsonl: a line is longer than ${LIMITS.lineBytes} bytes`] };
  try { parsed.raw = lines.map((l) => JSON.parse(l)); } catch (e) { return { ok: false, errors: [`raw.jsonl: not valid JSON lines (${e.message})`] }; }
  if (Object.values(parsed).some((v) => maxDepth(v) > LIMITS.depth)) return { ok: false, errors: [`JSON nested deeper than ${LIMITS.depth} levels`] };

  errors.push(...checkParsed(parsed));
  if (errors.length) return { ok: false, errors };

  const sub = parsed.meta.submission;
  if (layoutPath) {
    const want = submissionPath(parsed.meta).join('/');
    if (layoutPath !== want) errors.push(`path: this submission belongs at submissions/${want}/ but is at submissions/${layoutPath}/`);
  }
  if (author && author.toLowerCase() !== sub.contributor.toLowerCase()) {
    errors.push(`contributor: the file says "${sub.contributor}" but the pull request was opened by "${author}"`);
  }

  // secrets and paths, on everything except the question text (scanned for secrets only)
  const found = findSecrets({ meta: parsed.meta, raw: parsed.raw, summary: parsed.summary, queries: parsed.queries }, emptyContext());
  for (const h of found) errors.push(`secret-shaped text at ${h.where} (${h.kind}: ${h.sample})`);
  const leaks = [];
  const walk = (v, key, at) => {
    if (typeof v === 'string') {
      if (key === 'query' || key === 'note' || key === 'clause') return;
      for (const [re] of GENERIC_PATHS) { re.lastIndex = 0; if (re.test(v)) { leaks.push(at); break; } }
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, key, `${at}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k, at ? `${at}.${k}` : k);
  };
  walk({ meta: parsed.meta, raw: parsed.raw, summary: parsed.summary }, '', '');
  for (const at of leaks.slice(0, 5)) errors.push(`local path at ${at}`);

  // the hash check: fetch the skill at the pinned commit and hash SKILL.md ourselves
  try {
    const got = fetchSha(sub.skill);
    if (got !== sub.skill.skillMdSha256) {
      errors.push(`SKILL.md: at ${sub.skill.repo}@${sub.skill.commit.slice(0, 7)} the hash is ${got.slice(0, 12)}…, but the submission says ${sub.skill.skillMdSha256.slice(0, 12)}…`);
    }
  } catch (e) {
    errors.push(`SKILL.md: could not fetch ${sub.skill.repo} at commit ${sub.skill.commit.slice(0, 7)}${sub.skill.subdir ? ` (${sub.skill.subdir}/SKILL.md)` : ''}; is the commit pushed to that public repo?`);
  }
  return { ok: errors.length === 0, errors, meta: parsed.meta, summary: parsed.summary };
}
