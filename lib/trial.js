// Layer 1: trigger rate. Ported from step0/trigger_test.py (runner v0.3.2) so the numbers stay
// comparable with the Python runner and with Anthropic's skill-creator protocol.
//
// Verdict rule (headline, maxExplore 0): the first tool decision alone decides.
//   Skill with a matching name, or Read of the skill's SKILL.md -> triggered
//   Skill naming another skill                                  -> other_skill (stolen)
//   any other tool                                              -> not_triggered, killed at once
//   answers without calling any tool                            -> not_triggered, counted apart
//
// NOT YET VERIFIED against a live host: written from the Python runner, exercised only in dry-run.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launchSpec } from './spawn.js';
import { runCodewhaleTrial, draftWithCodewhale } from './codewhale.js';

const READ_ONLY = new Set(['Glob', 'Grep', 'Read', 'LS']);

// Hosts whose stream carries the same `Skill` tool_use as Claude Code. CodeBuddy Code (the CLI behind
// WorkBuddy) was checked against a live run: an `assistant` message with a tool_use named `Skill` and
// `input.skill`. Its default tool list is 60+ entries (image generation, chat replies, computer use), so
// a trial restricts it to the coding set Claude Code offers by default.
export const HOSTS = {
  'claude-code': { bin: 'claude', skillsDir: ['.claude', 'skills'] },
  codewhale: { bin: 'codewhale' },
  codebuddy: { bin: 'codebuddy', skillsDir: ['.codebuddy', 'skills'], tools: 'Skill,Read,Bash,Write,Edit,Glob,Grep' },
};

// What `backend` means per host: Claude Code can be pointed at another API; CodeBuddy is always its own account.
export function backendFor(host, model) {
  if (host === 'codewhale') return 'codewhale:api.deepseek.com';
  if (host !== 'codebuddy') return backendHost();
  return usesOwnDeepseek('codebuddy', model) ? 'codebuddy:api.deepseek.com' : 'codebuddy';
}

// A model id starting with "deepseek" means the DeepSeek API, whichever host drives it.
export const isDeepseekModel = (model) => /^deepseek/i.test(String(model || ''));

// A DeepSeek model that the host lists itself (CodeBuddy's own deepseek-v4.1-flash) is served by the host's account
// and needs no key of ours. Only a deepseek-* name the host does not list takes the package's own DeepSeek route
// (a models.json entry in the trial directory and DEEPSEEK_API_KEY from the environment).
const nativeModels = new Map();
export const setNativeModels = (host, list) => nativeModels.set(host, new Set(list || []));
export const usesOwnDeepseek = (host, model) => isDeepseekModel(model) && !nativeModels.get(host)?.has(model);

// DeepSeek's integration guide for WorkBuddy/CodeBuddy: a models.json entry whose key is read from the
// environment (${DEEPSEEK_API_KEY}), so the file holds no secret. It is written into the trial's own
// directory (project level), never into the user's ~/.codebuddy.
export function codebuddyModelsJson(model) {
  return `${JSON.stringify({
    models: [{
      id: model,
      name: model,
      vendor: 'DeepSeek',
      url: 'https://api.deepseek.com/v1/chat/completions',
      apiKey: '${DEEPSEEK_API_KEY}',
      maxInputTokens: 128000,
      maxOutputTokens: 8192,
      supportsToolCall: true,
      supportsImages: false,
    }],
    availableModels: [model],
  }, null, 2)}
`;
}

function writeModelsJson(dir, model) {
  fs.mkdirSync(path.join(dir, '.codebuddy'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.codebuddy', 'models.json'), codebuddyModelsJson(model));
}
const LINE_BREAK = /\r?\n/;

// On Windows `where` returns the extension-less shim first (a shell script Node cannot exec), then the
// .cmd that it can -- with shell: true. Prefer a real executable, then a cmd shim, then whatever is left.
// A host CLI found somewhere off PATH (or just installed) and accepted by the user, keyed by its command name.
const binOverride = new Map();
export const setHostBin = (name, file) => binOverride.set(name, file);

export function resolveBin(name) {
  if (binOverride.has(name)) return binOverride.get(name);
  const finder = process.platform === 'win32' ? 'where' : 'which';
  let found = [];
  try {
    found = execFileSync(finder, [name], { encoding: 'utf8' }).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } catch {
    return name;
  }
  return found.find((p) => /\.exe$/i.test(p))
    || found.find((p) => /\.(cmd|bat)$/i.test(p))
    || found[0]
    || name;
}

// Whether a host CLI can be found on PATH at all. resolveBin falls back to the bare name, which on Windows
// ends in cmd.exe's "not recognized" (or a spawn ENOENT) deep inside a trial; this asks up front.
export function binInstalled(name) {
  if (binOverride.has(name)) return true;
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [name], { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

const HOST_NAME = { 'claude-code': 'Claude Code', codebuddy: 'CodeBuddy', codewhale: 'Codewhale' };
const INSTALL_HINT = { 'claude-code': 'installClaude', codebuddy: 'installCodebuddy', codewhale: 'installCodewhale' };

// Throws an error with a translatable message when the host's CLI is not installed.
export function requireHost(host, probe = binInstalled) {
  const spec = HOSTS[host];
  if (!spec || probe(spec.bin)) return;
  const err = new Error(`host ${host} not found: ${spec.bin} is not on PATH`);
  err.messageKey = 'hostMissing';
  err.vars = { host: HOST_NAME[host] || host, bin: spec.bin };
  err.howKey = INSTALL_HINT[host];
  throw err;
}

// One tiny call before the real work: a host that is not signed in retries silently for minutes, so the user
// would stare at a frozen screen. A short timeout turns that into an immediate, actionable message.
// The first non-empty line of some CLI output, for an error message.
const firstLine = (text) => String(text || '').split(LINE_BREAK).map((l) => l.trim()).find(Boolean) || '';

// What a host CLI answered, as an error reason: the CLI's own words when it gave any. A CLI can exit 0 with nothing on
// stdout and its complaint on stderr (CodeBuddy does for a custom model without an endpoint url), so a clean exit
// status proves nothing; an empty or unreadable stdout is the failure.
export function hostAnswerProblem(r, timeout) {
  if (r.error) return r.error.code === 'ETIMEDOUT' ? `no answer within ${timeout}s` : String(r.error.message).split(LINE_BREAK)[0];
  if (r.signal) return `no answer within ${timeout}s`;
  const out = String(r.stdout || '');
  if (r.status !== 0) return firstLine(r.stderr) || firstLine(out) || `exit status ${r.status}`;
  if (!out.trim()) return firstLine(r.stderr) || 'the CLI answered with nothing';
  try {
    const parsed = JSON.parse(out);
    const last = Array.isArray(parsed) ? parsed.filter((m) => m?.type === 'result').pop() : parsed;
    if (last?.is_error) return firstLine(last.result) || 'the CLI reported an error';
  } catch { return firstLine(out); }
  return null;
}

export function pingHost(host, { bin, model = null, timeout = 90, spawn = spawnSync } = {}) {
  const spec = HOSTS[host];
  if (!spec || host === 'codewhale') return;
  const args = ['-p', 'Reply with the single word OK.', '--output-format', 'json', '--tools', '', '--no-session-persistence'];
  if (model && !usesOwnDeepseek(host, model)) args.push('--model', model); // the package's own DeepSeek route has no host-side name
  const launch = launchSpec(bin, args, spec.bin);
  const r = spawn(launch.cmd, launch.args, { encoding: 'utf8', timeout: timeout * 1000, shell: launch.shell, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const why = hostAnswerProblem(r, timeout);
  if (why) {
    const e = new Error(`host ${host} did not answer: ${why}`);
    e.messageKey = 'hostNotReady';
    e.vars = { host: HOST_NAME[host] || host, why: why.slice(0, 200) };
    throw e;
  }
}

// Variables a host (the Claude desktop app, the Agent SDK, an outer Claude Code session) sets for its own
// child processes. A trial inherits them otherwise, and they change what the model under test sees: under
// the desktop app the CLI adds Artifact, ArtifactComments and ArtifactData to the tool list, and the model
// then picks Artifact first on page-building requests. Auth and platform settings a user sets on purpose
// are kept. Mirrors HOST_ENV_KEEP / HOST_ENV_DROP in step0/trigger_test.py.
export const HOST_ENV_KEEP = new Set(['CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_GIT_BASH_PATH', 'CLAUDE_CODE_MAX_OUTPUT_TOKENS']);
export const HOST_ENV_DROP = new Set(['CLAUDECODE', 'CLAUDE_PID', 'CLAUDE_EFFORT', 'CLAUDE_AGENT_SDK_VERSION',
  'CLAUDE_AGENT_SDK_MCP_NO_PREFIX', 'CLAUDE_PREVIEW_CLASSIFIER_FLOOR', 'MCP_SERVER_CONNECTION_BATCH_SIZE',
  'MCP_CONNECTION_NONBLOCKING']);

// The environment for a trial: the given one, minus what a host injected for its own children.
export function trialEnv(env = process.env) {
  const out = {};
  for (const [k, v] of Object.entries(env)) {
    if (HOST_ENV_KEEP.has(k) || !(k.startsWith('CLAUDE_CODE_') || HOST_ENV_DROP.has(k))) out[k] = v;
  }
  return out;
}

// An allow-list environment for runs where the model executes code (the gain layer): the host CLI gets what
// it needs to start and authenticate and nothing else, so an unrelated token in the user's shell is not
// reachable from a task. Names match case-insensitively (Windows spells it Path).
const ENV_ALLOW = new Set(['PATH', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA',
  'PROGRAMDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'SYSTEMROOT', 'SYSTEMDRIVE', 'WINDIR', 'COMSPEC', 'PATHEXT',
  'TEMP', 'TMP', 'TMPDIR', 'USER', 'USERNAME', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL', 'TERM', 'TZ', 'OS',
  'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'ALL_PROXY',
  'SSL_CERT_FILE', 'NODE_EXTRA_CA_CERTS', 'CLOUD_ML_REGION', 'DEEPSEEK_API_KEY']);
const ENV_ALLOW_PREFIX = ['ANTHROPIC_', 'AWS_', 'GOOGLE_', 'CODEBUDDY_'];

export function narrowEnv(env = process.env) {
  const out = {};
  for (const [k, v] of Object.entries(trialEnv(env))) {
    const u = k.toUpperCase();
    if (ENV_ALLOW.has(u) || ENV_ALLOW_PREFIX.some((p) => u.startsWith(p)) || HOST_ENV_KEEP.has(k)) out[k] = v;
  }
  return out;
}

function backendHost() {
  const url = process.env.ANTHROPIC_BASE_URL;
  if (!url) return 'anthropic';
  try { return new URL(url.includes('://') ? url : `https://${url}`).host; } catch { return url; }
}

export function backend() {
  return backendHost();
}

// DeepSeek-style gateways remap Anthropic model names instead of rejecting them.
export function checkModel(model, allowRemap = false) {
  const host = backendHost();
  if (host === 'anthropic' || !model || allowRemap) return;
  if (/(haiku|sonnet|opus|claude)/i.test(model)) {
    const err = new Error(`${host} remaps Anthropic model names, so "${model}" would test a different model`);
    err.messageKey = 'modelRemap';
    err.vars = { host, model };
    throw err;
  }
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name === '.git') continue;
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else if (e.isFile()) fs.copyFileSync(s, d);
  }
}

function killTree(child) {
  if (!child || child.killed) return;
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore' });
    else child.kill('SIGKILL');
  } catch { /* already gone */ }
}

export function runTrial({ bin, skillDir, skillName, query, model, timeout = 180, maxExplore = 0, host = 'claude-code' }) {
  if (host === 'codewhale') return runCodewhaleTrial({ bin, skillDir, skillName, query, model, timeout });
  return new Promise((resolve) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-'));
    const spec = HOSTS[host];
    copyDir(skillDir, path.join(tmp, ...spec.skillsDir, skillName));
    if (host === 'codebuddy' && usesOwnDeepseek('codebuddy', model)) writeModelsJson(tmp, model);
    const args = host === 'codebuddy'
      ? ['-p', query, '--output-format', 'stream-json', '--verbose', '--setting-sources', 'project', '--strict-mcp-config',
        '--no-session-persistence', '--tools', spec.tools]
      : ['-p', query, '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
        '--permission-mode', 'dontAsk', '--setting-sources', 'project', '--strict-mcp-config', '--no-session-persistence'];
    if (maxExplore > 0) {
      args.push('--allowedTools', ...(host === 'codebuddy' ? ['Read', 'Glob', 'Grep'] : ['Read(./**)', 'Glob(./**)', 'Grep(./**)', 'LS(./**)']));
    }
    if (model) args.push('--model', model);

    // The host is recorded with every trial, not just the run: without it a record cannot be told
    // apart from a Codex one, and the two mean different things (a Codex record has no trigger).
    const rec = { host, verdict: null, invokedSkill: null, firstTool: null, tools: [], exploreSteps: 0, error: null,
      events: { lines: 0, toolUse: 0, types: {} } };
    // Not through a shell: cmd.exe would re-split the prompt on spaces (see spawn.js).
    const launch = launchSpec(bin, args, spec.bin);
    const child = spawn(launch.cmd, launch.args, {
      cwd: tmp,
      shell: launch.shell,
      env: trialEnv(),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'], // a prompt is on the command line; stdin must look closed
    });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; killTree(child); }, timeout * 1000);
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (c) => { if (stderr.length < 4000) stderr += c; });
    let buf = '';
    let settled = false;
    const finish = (verdict, extra = {}) => {
      if (settled) return;
      settled = true;
      rec.verdict = verdict;
      Object.assign(rec, extra);
      killTree(child);
    };

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let ev;
        try { ev = JSON.parse(line); } catch { continue; }
        rec.events.lines += 1;
        rec.events.types[ev.type] = (rec.events.types[ev.type] || 0) + 1;
        const type = ev.type;
        if (type === 'system' && ev.subtype === 'init') {
          rec.modelResolved = ev.model;
          rec.apiKeySource = ev.apiKeySource;
          // Lifted off the stored row by the executor: it becomes run-level metadata (what the model was offered).
          rec.init = { model: ev.model, apiKeySource: ev.apiKeySource, claudeCodeVersion: ev.claude_code_version,
            skills: ev.skills || [], tools: ev.tools || [] };
        } else if (type === 'stream_event') {
          const block = ev.event?.content_block;
          if (block?.type === 'tool_use') {
            rec.events.toolUse += 1;
            if (block.name !== 'Skill'
                && !(maxExplore > 0 ? READ_ONLY.has(block.name) : block.name === 'Read')) {
              rec.tools.push(block.name);
              finish('not_triggered', { firstTool: rec.firstTool || block.name });
              return;
            }
          }
        } else if (type === 'assistant') {
          for (const c of ev.message?.content || []) {
            if (c.type !== 'tool_use') continue;
            rec.tools.push(c.name);
            rec.firstTool = rec.firstTool || c.name;
            if (c.name === 'Skill') {
              const inv = String(c.input?.skill || '');
              if (inv === skillName || inv.endsWith(`:${skillName}`)) finish('triggered', { invokedSkill: inv });
              else finish('other_skill', { invokedSkill: inv });
              return;
            }
            if (c.name === 'Read' && String(c.input?.file_path || '').replace(/\\/g, '/').includes(`skills/${skillName}/`)) {
              finish('triggered');
              return;
            }
            if (READ_ONLY.has(c.name) && maxExplore > 0) {
              rec.exploreSteps += 1;
              if (rec.exploreSteps > maxExplore) { finish('not_triggered'); return; }
              continue;
            }
            finish('not_triggered');
            return;
          }
        } else if (type === 'result') {
          // A usage limit ends the CLI with an is_error result and no tool call, which would otherwise read
          // as "answered without the skill".
          if (!settled && ev.is_error) {
            finish('error', { error: String(ev.result || ev.subtype || 'error result').slice(0, 500) });
          } else if (!settled) finish('not_triggered');
        }
      }
    });
    child.on('error', (err) => { rec.error = String(err.message || err); finish('error'); });
    child.on('close', () => {
      clearTimeout(timer);
      if (!settled) {
        if (timedOut) finish('timeout', { error: `no verdict within ${timeout}s` });
        else if (rec.error) finish('error');
        else if (!rec.events.lines) {
          // exited without a single event: auth, quota or a bad flag, not a model that chose not to call the skill
          finish('error', { error: (stderr.trim().split(LINE_BREAK).pop() || 'no output from the CLI').slice(0, 500) });
        } else finish('not_triggered');
      }
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
      resolve(rec);
    });
  });
}

// One drafting call per set: lists the trigger clauses, then writes queries against them.
//
// The negatives are where a set is won or lost. The earlier wording asked for "near misses" sharing
// "vocabulary or domain", which let the drafter pick a different domain and still comply: the
// resulting negatives were far away, the false-positive rate came out at zero, and the failure mode
// the report is meant to expose -- an over-broad description -- could not show up. Three changes:
// a closed list of families, a mandatory "shares" field naming the borrowed words, and an explicit
// ban on softening. draftOverlap() then checks the claim mechanically.
export function draftQueries({ bin, skillDir, skillName, model, perClause = 3, negatives = 10, timeout = 600, host = 'claude-code' }) {
  const text = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8').slice(0, 20000);
  const prompt = `You are building a trigger-test set for an agent skill. Below is the skill's SKILL.md.

Step 1. List the trigger clauses: the distinct situations in which the frontmatter description says the skill
should be used. Use only the description, not the body. Name each clause in a few English words.

Step 2. For EACH clause, write exactly ${perClause} SHOULD-TRIGGER user requests that clearly fall under that
clause and no other. Do not paraphrase the description: write what a user types, not what the description says.

Step 3. Write exactly ${negatives} SHOULD-NOT-TRIGGER items, spread across the clauses. These are the hard part
and the reason the test exists: an easy negative measures nothing. Every negative must be a request that a
careless reader could mistake for this skill's job. Build them only from these families:
  (a) same words, different job - reuse the clause's own distinctive nouns or verbs, but ask for a
      neighbouring task the skill does not cover;
  (b) sibling's job - a task another skill or a built-in capability would own;
  (c) adjacent domain, different goal - the same files, stack or artefact, but a different intent.
For every negative also fill "shares" with the exact fragment copied verbatim out of your own request
that carries the borrowed wording (a substring of "query", same language, same spelling), and
"borrows" with the clause's own words it corresponds to in the description. Then "note" says in one
sentence why it must not trigger. If you cannot name a fragment that is really in the request, the item
is too far away: throw it out and write another one.

Never soften a negative into an obviously unrelated request (weather, recipes, small talk), never restate a
clause in other words as if it were a negative, and never write a negative whose only difference is a
negation of the clause.

Rules for every request:
- Realistic, varied phrasing as a real user would type to a coding agent: casual, terse, typos, concrete file names.
- About half in Chinese and half in English, within each clause as far as possible.
- Answerable on its own; do not reference earlier conversation.
Output ONLY JSON, no prose:
{"clauses": ["..."], "queries": [{"query": "...", "should_trigger": true, "clause": "...", "note": "why"}]}
For negatives, "shares" and "borrows" are required and "note" explains the near miss.

--- SKILL.md ---
${text}`;
  let text2;
  if (host === 'codewhale') {
    text2 = draftWithCodewhale({ bin, prompt, model, timeout });
  } else {
    const args = ['-p', prompt, '--output-format', 'json', '--tools', '', '--no-session-persistence',
      '--strict-mcp-config', '--setting-sources', 'project'];
    if (model) args.push('--model', model);
    const launch = launchSpec(bin, args, HOSTS[host].bin);
    // CodeBuddy reads a custom model from the working directory's .codebuddy/models.json, so a DeepSeek draft
    // runs in a scratch directory that has one.
    const scratch = host === 'codebuddy' && usesOwnDeepseek('codebuddy', model) ? fs.mkdtempSync(path.join(os.tmpdir(), 'sg-draft-')) : null;
    if (scratch) writeModelsJson(scratch, model);
    let r;
    try {
      r = spawnSync(launch.cmd, launch.args, {
        encoding: 'utf8', timeout: timeout * 1000, maxBuffer: 32 * 1024 * 1024,
        shell: launch.shell, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], ...(scratch ? { cwd: scratch } : {}),
      });
    } finally {
      if (scratch) { try { fs.rmSync(scratch, { recursive: true, force: true }); } catch { /* best effort */ } }
    }
    // The CLI's own words, not "Unexpected end of JSON input": an empty answer with a complaint on stderr is common.
    const problem = hostAnswerProblem(r, timeout);
    if (problem) {
      const hint = r.error?.code === 'ETIMEDOUT' || r.signal ? ' (a rejected key or an unreachable endpoint retries silently until then)' : '';
      throw new Error(`the drafting call failed: ${problem}${hint}`);
    }
    const out = r.stdout;
    const parsed = JSON.parse(out);
    // Claude Code answers with one result object; CodeBuddy Code with the whole message list, whose last
    // element is the result.
    text2 = (Array.isArray(parsed) ? parsed.filter((m) => m?.type === 'result').pop() : parsed)?.result || '';
  }
  const obj = JSON.parse(text2.slice(text2.indexOf('{'), text2.lastIndexOf('}') + 1));
  const items = (obj.queries || []).filter((q) => q && String(q.query || '').trim());
  return { skill: skillName, clauses: obj.clauses || [], queries: items.map((q, i) => ({
    id: `q${String(i + 1).padStart(2, '0')}`,
    query: String(q.query).trim(),
    shouldTrigger: Boolean(q.should_trigger),
    clause: q.clause || '',
    shares: String(q.shares || '').trim(),
    borrows: String(q.borrows || '').trim(),
    note: String(q.note || '').trim(),
  })) };
}

// A negative is only as hard as the words it borrows. "shares" is demanded verbatim from the request,
// so it can be checked instead of trusted; "borrows" names the clause's own wording and is recorded
// but not verified, because a Chinese request borrowing English description words cannot be matched
// mechanically. A set of negatives that fail the check reports a false-positive rate near zero for
// reasons that have nothing to do with the skill.
export function draftQuality(queries) {
  const negs = queries.filter((q) => !q.shouldTrigger);
  const report = { negatives: negs.length, noShares: [], notInQuery: [], noBorrows: [] };
  for (const q of negs) {
    const phrases = String(q.shares || '').split(/[,;、，]/).map((s) => s.trim()).filter(Boolean);
    if (!phrases.length) { report.noShares.push(q.id); continue; }
    const lower = q.query.toLowerCase();
    if (!phrases.some((p) => lower.includes(p.toLowerCase()))) report.notInQuery.push(q.id);
    if (!String(q.borrows || '').trim()) report.noBorrows.push(q.id);
  }
  report.weak = new Set([...report.noShares, ...report.notInQuery]).size;
  report.total = negs.length;
  return report;
}

// A trial that errored or timed out says nothing about the skill: it is kept in raw.jsonl but never counted.
export const FAILED = new Set(['error', 'timeout']);

export function summarize(allRecords) {
  const records = allRecords.filter((r) => !FAILED.has(r.verdict));
  const pos = records.filter((r) => r.shouldTrigger);
  const neg = records.filter((r) => !r.shouldTrigger);
  const hit = (list) => list.filter((r) => r.verdict === 'triggered').length;
  const q = new Map();
  for (const r of records) {
    const k = `${r.queryId}`;
    const e = q.get(k) || { query: r.query, shouldTrigger: r.shouldTrigger, hits: 0, n: 0 };
    e.n += 1;
    if (r.verdict === 'triggered') e.hits += 1;
    q.set(k, e);
  }
  const noTool = pos.filter((r) => r.verdict === 'not_triggered' && !r.firstTool).length;
  return {
    trials: records.length,
    recall: pos.length ? hit(pos) / pos.length : null,
    fpr: neg.length ? hit(neg) / neg.length : null,
    noToolRate: pos.length ? noTool / pos.length : null,
    questions: [...q.values()],
  };
}

// Wilson interval over queries (the independent unit), not over trials: three runs of one query
// are not three independent observations.
export function wilson(k, n, z = 1.96) {
  if (!n) return [null, null];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
