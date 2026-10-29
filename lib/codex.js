// Codex host. What Codex exposes is narrower than Claude Code's, and the difference is structural,
// not a missing flag.
//
// Schema, confirmed against a live run on 2026-10-27 (codex-cli 0.159.2, ChatGPT account):
//   events : thread.started / turn.started / turn.completed / turn.failed / item.started /
//            item.updated / item.completed / error
//   items  : command_execution, mcp_tool_call, file_change, todo_list, agent_message, user_message,
//            agent_reasoning, error
//   usage  : turn.completed carries input_tokens, cached_input_tokens, output_tokens
//
// There is no skill item. In Codex a skill is host-side context: it is selected and injected, not
// called as a tool, so "did the model choose this skill" has no observable answer. `skills_used`
// exists only in the telemetry profile struct (unique_skills_used, total_skills_used), not in the
// stream. Reporting a trigger rate here would mean inventing one.
//
// So this host supports what is observable: whether the agent acted, what it ran, what it changed,
// and therefore the paired with/without probe and the contract checks. Not a trigger rate.
//
// Two traps found by that run: with --sandbox read-only every exec_command is refused by policy, so
// a probe needs workspace-write; and without --ignore-user-config a stale model id in
// ~/.codex/config.toml fails every turn for reasons unrelated to the skill.
//
// A third trap, found by the probe itself: installing the skill into .codex/skills as well as
// .agents/skills made the skill-installed side report a read-only workspace while the clean side
// wrote files, which turned the comparison into a false positive. Only the documented path is used.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runnerFor, quoteForCmd } from './spawn.js';

const KNOWN_ITEMS = new Set([
  'command_execution', 'mcp_tool_call', 'file_change', 'todo_list',
  'agent_message', 'user_message', 'agent_reasoning', 'error',
]);
const ACTION_ITEMS = new Set(['command_execution', 'mcp_tool_call', 'file_change', 'web_search']);

export function parseCodexJsonl(text) {
  const events = [];
  const items = [];
  const unknownItemTypes = new Set();
  const errors = [];
  let tokenUsage = null;
  let completed = false;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    const type = obj.type || obj.msg?.type || '';
    events.push({ type, raw: obj });
    if (type === 'turn.completed') completed = true;
    if (type === 'turn.failed' || type === 'error') {
      const msg = obj.error?.message || obj.message || obj.error || type;
      errors.push(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    if (type.startsWith('item.')) {
      const item = obj.item || obj.msg?.item;
      if (item && typeof item === 'object') {
        items.push({ phase: type.slice(5), ...item });
        if (item.type === 'error') errors.push(String(item.message || item.error || 'error item'));
        if (item.type && !KNOWN_ITEMS.has(item.type)) unknownItemTypes.add(item.type);
      }
    }
    if (type === 'turn.completed') tokenUsage = obj.usage || obj.token_usage || null;
  }
  return { events, items, unknownItemTypes: [...unknownItemTypes], errors, completed, tokenUsage };
}

function detailOf(item) {
  switch (item.type) {
    case 'command_execution':
      return (item.command || item.cmd || item.args || []).toString().slice(0, 200);
    case 'mcp_tool_call':
      return [item.server, item.name || item.tool].filter(Boolean).join(':');
    case 'file_change': {
      const paths = item.paths || item.changes?.map?.((c) => c.path) || item.path || [];
      return Array.isArray(paths) ? paths.join(', ') : String(paths);
    }
    default:
      return '';
  }
}

export function firstAction(items) {
  const hit = items.find((i) => ACTION_ITEMS.has(i.type) && i.phase !== 'started') || items.find((i) => ACTION_ITEMS.has(i.type));
  return hit ? { kind: hit.type, detail: detailOf(hit) } : null;
}

export function finalMessage(items) {
  const msgs = items.filter((i) => i.type === 'agent_message' || i.type === 'assistant_message');
  const last = msgs[msgs.length - 1];
  return last ? String(last.message || last.text || last.content || '').slice(0, 2000) : '';
}

export function changedFiles(items) {
  const out = new Set();
  for (const i of items.filter((x) => x.type === 'file_change')) {
    const paths = i.paths || i.path || [];
    for (const p of Array.isArray(paths) ? paths : [paths]) if (p) out.add(String(p));
  }
  return [...out].sort();
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

// Codex reads `.agents/skills/` per the shared convention; several guides also claim
// `.codex/skills/`. Installing into both looked safer, but a `.codex/` directory in the workspace is
// also where Codex looks for project config, and its presence changed the sandbox outcome of a run
// (the skill-installed side reported a read-only workspace while the clean side wrote files). A probe
// is only meaningful if both sides run under identical conditions, so only the documented path is used.
function installSkill(tmp, skillDir, skillName) {
  copyDir(skillDir, path.join(tmp, '.agents', 'skills', skillName));
}

function listFiles(root) {
  const out = [];
  const walk = (dir) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === '.agents' || e.name === '.codex' || e.name === '.git') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(path.relative(root, p).replace(/\\/g, '/'));
    }
  };
  walk(root);
  return out.sort();
}

// A minimal model catalog for a DeepSeek model, using the field names of DeepSeek's own Codex guide. The
// long agent instructions of the official file are replaced by a short fixed text, so a probe through this
// catalog does not run with DeepSeek's recommended prompt; it is the same on both sides of the comparison.
const INSTRUCTIONS = 'You are a coding agent running in a terminal. Do what the user asks by running commands and editing files in the current directory, then stop.';

export function deepseekCatalog(model) {
  return `${JSON.stringify({
    models: [{
      slug: model,
      display_name: model,
      description: 'DeepSeek model for a SkillGauntlet probe',
      default_reasoning_level: 'high',
      supported_reasoning_levels: [
        { effort: 'low', description: 'Fast' },
        { effort: 'medium', description: 'Balanced' },
        { effort: 'high', description: 'Thorough' },
      ],
      shell_type: 'shell_command',
      visibility: 'list',
      supported_in_api: true,
      priority: 1,
      minimal_client_version: '0.144.0',
      apply_patch_tool_type: 'freeform',
      web_search_tool_type: 'text',
      input_modalities: ['text'],
      truncation_policy: { mode: 'tokens', limit: 10000 },
      supports_parallel_tool_calls: true,
      supports_reasoning_summaries: true,
      supports_search_tool: false,
      context_window: 1048576,
      max_context_window: 1048576,
      effective_context_window_percent: 95,
      auto_review_model_override: model,
      prefer_websockets: false,
      support_verbosity: true,
      default_verbosity: 'low',
      supports_image_detail_original: false,
      tool_mode: null,
      multi_agent_version: 'v2',
      use_responses_lite: false,
      include_skills_usage_instructions: false,
      auto_compact_token_limit: null,
      comp_hash: '3000',
      reasoning_summary_format: 'experimental',
      default_reasoning_summary: 'none',
      availability_nux: null,
      upgrade: null,
      default_service_tier: null,
      model_messages: { instructions_template: INSTRUCTIONS, instructions_variables: ['', '', ''], approvals: null },
      experimental_supported_tools: [],
      base_instructions: INSTRUCTIONS,
    }],
  }, null, 2)}
`;
}

export function runCodexTrial({
  bin, skillDir, skillName, query, model, sandbox = 'read-only', timeout = 180, keepDir = false,
  ignoreUserConfig = true, keepRaw = false, reasoningEffort = null, effort = process.env.SG_CODEX_EFFORT,
}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-codex-'));
  if (skillDir) installSkill(tmp, skillDir, skillName);
  const before = listFiles(tmp);
  const args = ['exec', '--json', '-C', tmp, '--skip-git-repo-check'];
  // --approve-for-me replaces --sandbox rather than combining with it: the two flags are mutually
  // exclusive, and that flag carries the workspace-write sandbox. Without it, a non-interactive run
  // refuses every command ("blocked by policy"), the turn ends with an apology, and no
  // command_execution item is ever produced. The sandbox-bypass flag is never used, because it would
  // run code we are deliberately treating as untrusted without any sandbox at all.
  if (sandbox === 'read-only') args.push('--sandbox', 'read-only');
  else args.push('--approve-for-me');
  if (ignoreUserConfig) args.push('--ignore-user-config');
  if (model) args.push('-m', model);
  // DeepSeek's Codex guide points a model provider at its Responses endpoint. With --ignore-user-config the
  // user's config.toml is not read, so the provider is passed inline and the key comes from the environment.
  let catalogFile = null;
  if (/^deepseek/i.test(model || '')) {
    // The catalog entry carries auto_review_model_override: --approve-for-me asks a review model, named
    // codex-auto-review by default, which DeepSeek's API rejects. It is a per-model catalog field, not a
    // config key (passing it with -c is reported as "ignored").
    catalogFile = path.join(os.tmpdir(), `sg-codex-catalog-${process.pid}-${Date.now()}.json`);
    fs.writeFileSync(catalogFile, deepseekCatalog(model));
    args.push('-c', 'model_provider="deepseek"',
      '-c', 'model_providers.deepseek={name="deepseek", base_url="https://api.deepseek.com/", wire_api="responses", env_key="DEEPSEEK_API_KEY"}',
      '-c', `model_catalog_json="${catalogFile.replace(/\\/g, '/')}"`);
  }
  // --ignore-user-config also drops the user's effort setting, so it has to be passed explicitly. The
  // value is left unquoted: codex falls back to a plain string, and quotes get mangled on the cmd shim.
  const pinnedEffort = reasoningEffort || effort;
  if (pinnedEffort) args.push('-c', `model_reasoning_effort=${pinnedEffort}`);
  args.push(query);
  const runner = runnerFor(bin, 'codex');
  const argv = [...runner.prefix, ...args];
  const cmdArgs = runner.shell ? argv.map(quoteForCmd) : argv;

  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(runner.cmd, cmdArgs, {
      cwd: tmp, env: process.env, windowsHide: true, shell: runner.shell,
      // Without this codex waits on stdin ("Reading additional input from stdin...") forever,
      // because an inherited pipe stays open.
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      try {
        if (process.platform === 'win32') execFileSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore' });
        else child.kill('SIGKILL');
      } catch { /* already gone */ }
      setTimeout(() => finish(), 3000);
    }, timeout * 1000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (c) => { err += c; });
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      // An agent can leave a background process (a browser daemon) holding our pipes, in which case
      // 'close' never fires and the run would hang past its timeout.
      try { child.stdout.destroy(); child.stderr.destroy(); } catch { /* already closed */ }
      const parsed = parseCodexJsonl(out);
      // file_change items only appear for patch-style edits; on Windows the agent usually writes
      // through a shell command, so the filesystem diff is the dependable record of what it did.
      const after = listFiles(tmp);
      const rec = {
        host: 'codex',
        // What was asked of the CLI, so an archived record says which model and settings produced it.
        invocation: { model: model || null, effort: effort || null, sandbox, ignoreUserConfig },
        // Deliberately not a trigger verdict: the stream cannot answer that question.
        verdict: 'unobservable',
        firstAction: firstAction(parsed.items),
        commands: parsed.items.filter((i) => i.type === 'command_execution').map(detailOf),
        finalMessage: finalMessage(parsed.items),
        changedFiles: changedFiles(parsed.items),
        createdFiles: after.filter((f) => !before.includes(f)),
        itemTypes: [...new Set(parsed.items.map((i) => i.type).filter(Boolean))],
        unknownItemTypes: parsed.unknownItemTypes,
        tokenUsage: parsed.tokenUsage,
        eventTypes: [...new Set(parsed.events.map((e) => e.type).filter(Boolean))],
        eventCount: parsed.events.length,
        completed: parsed.completed,
        errors: parsed.errors,
        latencyMs: Date.now() - started,
        stderr: err.slice(-500),
        rawLines: parsed.events.length,
      };
      if (catalogFile) { try { fs.rmSync(catalogFile, { force: true }); } catch { /* best effort */ } }
      // The unparsed event stream, so a batch record can be re-read without re-running.
      if (keepRaw) rec.rawJsonl = out;
      if (keepDir) rec.dir = tmp;
      else { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } }
      resolve(rec);
    };
    child.on('error', (e) => { err += String(e.message || e); finish(); });
    child.on('close', finish);
    // Give buffered output a moment to arrive after the process exits, then stop waiting for the pipes.
    child.on('exit', () => setTimeout(() => finish(), 2000));
  });
}

// Paired probe: the same request with and without the skill installed. It returns facts, not a
// verdict. Two runs of the same request never execute identical command strings, so "the first
// action differs" is true almost always and means nothing; an automatic influenced/not-influenced
// flag would be a coin flip dressed up as a finding. The report shows both sides and the reader
// decides.
export async function probeActivation(opts) {
  const withSkill = await runCodexTrial({ ...opts, sandbox: 'workspace-write' });
  const without = await runCodexTrial({ ...opts, skillDir: null, sandbox: 'workspace-write' });
  return {
    withSkill,
    without,
    actionKindIdentical: withSkill.firstAction?.kind === without.firstAction?.kind,
    artifactsIdentical: JSON.stringify(withSkill.createdFiles) === JSON.stringify(without.createdFiles),
  };
}
