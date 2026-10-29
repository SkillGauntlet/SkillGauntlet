// Nothing leaves the machine before it has been through here.
//
// Run records are written by tools that capture error text, stderr and tool names, so they can hold the
// user's home path, login name, host name, an environment value or a key that was echoed in an error.
// A submission is public and permanent (it becomes a pull request), so the rule is: strip what is known
// to be personal, redact what is shaped like a secret, then scan the result again with a wider net and
// refuse to package anything the scan still dislikes. Stripping is best effort; the refusal is the guarantee.
//
// The question text is the one thing that must not be rewritten: the query-pack hash covers it. It is
// scanned but never edited, and a hit there stops the submission with a message naming the question.
import os from 'node:os';

// Patterns that are redacted when found, and reported when they survive the redaction.
export const SECRET_PATTERNS = [
  ['anthropic-key', /sk-ant-[A-Za-z0-9_-]{16,}/g],
  ['openai-style-key', /\bsk-[A-Za-z0-9_-]{16,}/g],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g],
  ['aws-access-key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{30,}/g],
  ['slack-token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/g],
  ['jwt', /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g],
  ['bearer-token', /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/gi],
  ['private-key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
  ['url-credentials', /\bhttps?:\/\/[^/\s:@]+:[^/\s@]+@/gi],
  ['assignment', /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|token|secret|password|passwd|authorization)(["']?\s*[:=]\s*["']?)[^\s"',;]{8,}/gi],
];

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const SENSITIVE_ENV = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH|COOKIE|SESSION)/i;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// What this machine knows about its user: replaced wherever it shows up, in any slash style.
export function localContext({ env = process.env, extraPaths = [], user = null } = {}) {
  const home = os.homedir();
  const names = new Set();
  for (const n of [user, env.USERNAME, env.USER, env.LOGNAME, safeUser()]) if (n && n.length >= 4) names.add(n);
  const hosts = new Set([os.hostname(), env.COMPUTERNAME, env.HOSTNAME].filter((h) => h && h.length >= 3));
  const paths = new Set([home, os.tmpdir(), ...extraPaths].filter(Boolean));
  const secrets = new Set();
  for (const [k, v] of Object.entries(env)) {
    if (SENSITIVE_ENV.test(k) && v && v.length >= 6) secrets.add(v);
  }
  return { home, names: [...names], hosts: [...hosts], paths: [...paths], secrets: [...secrets] };
}

// For CI: it knows nothing about the submitter's machine, so only the shape-based patterns apply.
export function emptyContext() {
  return { home: '', names: [], hosts: [], paths: [], secrets: [] };
}

function safeUser() {
  try { return os.userInfo().username; } catch { return null; }
}

// Both slash styles of one path, longest first so a path inside another is replaced as a whole.
function pathVariants(p) {
  const fwd = p.replace(/\\/g, '/').replace(/\/+$/, '');
  const back = fwd.replace(/\//g, '\\');
  return [...new Set([p.replace(/[\\/]+$/, ''), fwd, back])].filter((x) => x.length >= 4);
}

function compileContext(ctx) {
  const pathRes = ctx.paths
    .flatMap(pathVariants)
    .sort((a, b) => b.length - a.length)
    .map((p) => [new RegExp(escapeRe(p), 'gi'), p === ctx.home || pathVariants(ctx.home).includes(p) ? '<home>' : '<path>']);
  const nameRe = ctx.names.length ? new RegExp(`(?<![A-Za-z0-9])(?:${ctx.names.map(escapeRe).join('|')})(?![A-Za-z0-9])`, 'gi') : null;
  const hostRe = ctx.hosts.length ? new RegExp(`(?<![A-Za-z0-9])(?:${ctx.hosts.map(escapeRe).join('|')})(?![A-Za-z0-9])`, 'gi') : null;
  const secretRes = ctx.secrets.map((s) => new RegExp(escapeRe(s), 'g'));
  return { pathRes, nameRe, hostRe, secretRes };
}

export const GENERIC_PATHS = [
  [/[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s"']+/gi, '<home>'],
  [/(?<![A-Za-z0-9_.-])\/(?:home|Users)\/[^/\s"']+/g, '<home>'],
  [/\b[A-Za-z]:[\\/][^\s"'<>|*?]+/g, '<path>'],
  [/(?<![A-Za-z0-9_.:-])\/(?:tmp|var|private|opt|mnt|root|usr|etc|proc|run|snap|srv|Volumes)\/[^\s"'<>|*?]*/g, '<path>'],
];

// Returns { text, counts }. counts says how many of each kind were replaced, for the preview.
export function scrubString(s, compiled, counts = {}) {
  let out = s;
  const bump = (k, n) => { if (n) counts[k] = (counts[k] || 0) + n; };
  const sub = (re, repl, kind) => {
    let n = 0;
    out = out.replace(re, (...m) => { n += 1; return typeof repl === 'function' ? repl(...m) : repl; });
    bump(kind, n);
  };
  for (const re of compiled.secretRes) sub(re, '<redacted>', 'env-value');
  for (const [name, re] of SECRET_PATTERNS) {
    if (name === 'assignment') sub(re, (_m, sep) => `<redacted-key>${sep}<redacted>`, 'secret');
    else sub(re, '<redacted>', 'secret');
  }
  for (const [re, repl] of compiled.pathRes) sub(re, repl, 'path');
  for (const [re, repl] of GENERIC_PATHS) sub(re, repl, 'path');
  // host name first: a login name is often a piece of it (ALICE-PC)
  if (compiled.hostRe) sub(compiled.hostRe, '<host>', 'hostname');
  if (compiled.nameRe) sub(compiled.nameRe, '<user>', 'username');
  sub(EMAIL, '<email>', 'email');
  return { text: out, counts };
}

// The wider net, run on already-scrubbed data. Returns a list of { where, kind, sample }.
// Hex strings are exempt (hashes and commits are meant to be there); everything else long, mixed
// letters-and-digits and random-looking is treated as a probable credential.
export function findSecrets(value, ctx = localContext(), where = '') {
  const compiled = compileContext(ctx);
  const hits = [];
  const visit = (v, at) => {
    if (typeof v === 'string') {
      for (const [name, re] of SECRET_PATTERNS) {
        re.lastIndex = 0;
        // an already-redacted assignment still matches the assignment pattern; the placeholder is not a secret
        const m = [...v.matchAll(re)].find((x) => !/<redacted/.test(x[0]));
        if (m) hits.push({ where: at, kind: name, sample: mask(m[0]) });
      }
      for (const re of compiled.secretRes) {
        if (re.test(v)) hits.push({ where: at, kind: 'env-value', sample: '(a value from one of your environment variables)' });
        re.lastIndex = 0;
      }
      for (const tok of v.split(/[^A-Za-z0-9_\-+=]+/)) {
        if (tok.length >= 32 && !/^[0-9a-f]+$/i.test(tok) && /[A-Za-z]/.test(tok) && /\d/.test(tok) && entropy(tok) >= 4.2) {
          hits.push({ where: at, kind: 'high-entropy-token', sample: mask(tok) });
        }
      }
      for (const re of [...compiled.pathRes.map((x) => x[0]), ...GENERIC_PATHS.slice(0, 2).map((x) => x[0])]) {
        re.lastIndex = 0;
        const m = re.exec(v);
        re.lastIndex = 0;
        if (m) hits.push({ where: at, kind: 'local-path', sample: mask(m[0]) });
      }
      if (compiled.nameRe) {
        compiled.nameRe.lastIndex = 0;
        if (compiled.nameRe.test(v)) hits.push({ where: at, kind: 'username', sample: '(your login name)' });
        compiled.nameRe.lastIndex = 0;
      }
    } else if (Array.isArray(v)) v.forEach((x, i) => visit(x, `${at}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) visit(x, at ? `${at}.${k}` : k);
  };
  visit(value, where);
  return hits;
}

function mask(s) {
  return s.length <= 8 ? '****' : `${s.slice(0, 4)}…(${s.length} chars)`;
}

function entropy(s) {
  const f = new Map();
  for (const c of s) f.set(c, (f.get(c) || 0) + 1);
  let h = 0;
  for (const n of f.values()) h -= (n / s.length) * Math.log2(n / s.length);
  return h;
}

// Scrub a parsed JSON value. keepKeys names string fields that are copied as they are (the question
// text); those are only scanned. Returns { value, counts }.
export function scrubValue(value, ctx = localContext(), { keepKeys = [] } = {}) {
  const compiled = compileContext(ctx);
  const counts = {};
  const keep = new Set(keepKeys);
  const walk = (v, key) => {
    if (typeof v === 'string') return keep.has(key) ? v : scrubString(v, compiled, counts).text;
    if (Array.isArray(v)) return v.map((x) => walk(x, key));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    return v;
  };
  return { value: walk(value, ''), counts };
}

// The whole gate for one package: scrub every file, then scan. files is { name: parsed value | array of
// parsed lines }. Returns { files, counts, problems }; a non-empty problems list means do not package.
// `verbatim` names files that are scanned but never edited (the question pack: its hash covers every field).
export function scrubPackage(files, ctx = localContext(), { verbatim = [] } = {}) {
  const out = {};
  const counts = {};
  const problems = [];
  for (const [name, content] of Object.entries(files)) {
    const { value, counts: c } = verbatim.includes(name) ? { value: content, counts: {} } : scrubValue(content, ctx, { keepKeys: ['query'] });
    out[name] = value;
    for (const [k, n] of Object.entries(c)) counts[k] = (counts[k] || 0) + n;
    for (const h of findSecrets(value, ctx, name)) problems.push(h);
  }
  return { files: out, counts, problems };
}
