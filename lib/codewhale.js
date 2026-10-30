// Codewhale (formerly DeepSeek-TUI) as a trigger host.
//
// Its stream is one JSON object per line (`schema: codewhale.exec-stream`). A skill is read through a
// `load_skill` tool: `{"type":"tool_use","name":"load_skill","input":{"name":"<skill>"}}`, and the
// result starts with `# Skill: <skill>`. `input.query` is a search and `input.name == "list"` lists the
// catalogue; neither selects a skill. That differs from Claude Code, where the model picks from a
// fixed list, so a rate measured here is a Codewhale number and is never merged with another host's.
//
// Two facts from live runs shape the launch:
//   * a skill in the workspace's own .agents/skills is loaded only once the workspace is trusted, which a
//     tool-restricted exec run is not; a skill in the *global* root (<home>/.agents/skills) is loaded
//     without trust. So the trial gets a throw-away home directory holding only the tested skill. That
//     also keeps the user's own skills out of the catalogue.
//   * `--auto` means full access and Windows has no execution sandbox, so the run is limited with
//     `--allowed-tools load_skill`: the model can look a skill up and can do nothing else.
//
// Usage statistics are on by default in a fresh home; they are switched off in the throw-away home
// before the first request.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { launchSpec } from './spawn.js';

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

// A throw-away home with only the tested skill in its global skills root, and an empty working directory.
export function isolatedHome(skillDir, skillName) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-cw-home-'));
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-cw-cwd-'));
  if (skillDir) copyDir(skillDir, path.join(home, '.agents', 'skills', skillName));
  return {
    home,
    cwd,
    env: { ...process.env, HOME: home, USERPROFILE: home },
    cleanup() {
      for (const d of [home, cwd]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } }
    },
  };
}

function telemetryOff(bin, env) {
  const launch = launchSpec(bin, ['config', 'set', 'telemetry', 'false'], 'codewhale');
  try {
    execFileSync(launch.cmd, launch.args, { env, stdio: 'ignore', timeout: 30000, shell: launch.shell, windowsHide: true });
  } catch { /* the setting is a courtesy; a failure here must not hide the trial's own result */ }
}

// The verdict for one stream line, or null to keep reading.
export function judgeLine(ev, skillName, rec) {
  if (ev.type === 'content' && typeof ev.content === 'string') rec.said = `${rec.said || ''}${ev.content}`.slice(0, 2000);
  if (ev.type === 'tool_use') rec.firstInput = rec.firstInput || String(ev.input?.name ?? ev.input?.query ?? ev.input?.command ?? JSON.stringify(ev.input ?? '')).slice(0, 300);
  if (ev.type === 'tool_use' && ev.name === 'load_skill') {
    rec.tools.push('load_skill');
    rec.firstTool = rec.firstTool || 'load_skill';
    const name = typeof ev.input?.name === 'string' ? ev.input.name : '';
    if (!name || name === 'list') return null; // a search or a catalogue listing selects nothing
    if (name === skillName || name.endsWith(`:${skillName}`)) return { verdict: 'triggered', invokedSkill: name };
    return { verdict: 'other_skill', invokedSkill: name };
  }
  if (ev.type === 'tool_use') {
    rec.tools.push(ev.name);
    rec.firstTool = rec.firstTool || ev.name;
    return { verdict: 'not_triggered' };
  }
  if (ev.type === 'error') return { verdict: 'error', error: String(ev.error || 'error').slice(0, 500) };
  if (ev.type === 'done') return { verdict: 'not_triggered' };
  return null;
}

export function runCodewhaleTrial({ bin, skillDir, skillName, query, model, timeout = 180 }) {
  return new Promise((resolve) => {
    const iso = isolatedHome(skillDir, skillName);
    telemetryOff(bin, iso.env);
    const args = ['exec', '--allowed-tools', 'load_skill', '--output-format', 'stream-json'];
    if (model) args.push('--model', model);
    args.push('--', query);
    const rec = { host: 'codewhale', verdict: null, invokedSkill: null, firstTool: null, tools: [], exploreSteps: 0, error: null,
      events: { lines: 0, toolUse: 0, types: {} } };
    const launch = launchSpec(bin, args, 'codewhale');
    const child = spawn(launch.cmd, launch.args, {
      cwd: iso.cwd, env: iso.env, shell: launch.shell, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
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
        if (ev.type === 'tool_use') rec.events.toolUse += 1;
        if (ev.type === 'metadata') rec.modelResolved = ev.meta?.model;
        const v = judgeLine(ev, skillName, rec);
        if (v) { finish(v.verdict, v); return; }
      }
    });
    child.on('error', (err) => { rec.error = String(err.message || err); finish('error'); });
    child.on('close', () => {
      clearTimeout(timer);
      if (!settled) {
        if (timedOut) finish('timeout', { error: `no verdict within ${timeout}s` });
        else if (rec.error) finish('error');
        else if (!rec.events.lines) {
          finish('error', { error: (stderr.trim().split(/\r?\n/).filter(Boolean).slice(0, 2).join(' ') || 'no output from the CLI').slice(0, 500) });
        } else finish('not_triggered');
      }
      iso.cleanup();
      resolve(rec);
    });
  });
}

// One-shot answer with no tools: the text is the concatenated `content` events.
export function draftWithCodewhale({ bin, prompt, model, timeout }) {
  const iso = isolatedHome(null, null);
  telemetryOff(bin, iso.env);
  const args = ['exec', '--output-format', 'stream-json'];
  if (model) args.push('--model', model);
  args.push('--', prompt);
  const launch = launchSpec(bin, args, 'codewhale');
  let out;
  try {
    out = execFileSync(launch.cmd, launch.args, {
      encoding: 'utf8', timeout: timeout * 1000, maxBuffer: 32 * 1024 * 1024, cwd: iso.cwd, env: iso.env,
      shell: launch.shell, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    // A rejected key still prints its reason as an `error` event on stdout.
    const events = String(err.stdout || '').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } });
    const e = events.find((x) => x?.type === 'error');
    const why = e ? String(e.error).split(/\r?\n/)[0] : (err.killed ? `no answer within ${timeout}s` : String(err.stderr || err.message).split(/\r?\n/).find(Boolean));
    throw new Error(`the drafting call failed: ${why}`);
  } finally {
    iso.cleanup();
  }
  const events = out.split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const err = events.find((x) => x.type === 'error');
  if (err) throw new Error(`the drafting call failed: ${String(err.error).split(/\r?\n/)[0]}`);
  return events.filter((x) => x.type === 'content').map((x) => x.content).join('');
}
