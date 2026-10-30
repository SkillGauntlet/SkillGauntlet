// Model names a host will accept, read from the host itself so the list is the user's own (it depends on the
// account and the custom models they set up) and never goes stale inside this package. Any failure gives [].
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { launchSpec } from './spawn.js';

const OPTS = { encoding: 'utf8', timeout: 20000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 * 1024 * 1024 };
// The arguments here are fixed words, so a shell launch (a .cmd shim) is one command string; passing an argument
// list together with shell: true makes Node print a deprecation warning into the user's terminal.
const run = (cmd, args, { shell } = {}) => (shell ? execSync(`"${cmd}" ${args.join(' ')}`, OPTS) : execFileSync(cmd, args, OPTS));

// CodeBuddy prints "Currently supported: (a, b, c)" in --help.
export function parseCodebuddyModels(help) {
  const m = String(help).match(/Currently supported:\s*\(([^)]*)\)/);
  return m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
}

// `codex debug models` renders its catalog as JSON; entries marked visibility "list" are the ones its own picker shows.
export function parseCodexModels(json) {
  try {
    const parsed = JSON.parse(json);
    const list = Array.isArray(parsed) ? parsed : parsed.models || [];
    return list.filter((m) => m?.slug && m.visibility === 'list').map((m) => m.slug);
  } catch { return []; }
}

export function hostModels(host, bin, exec = run) {
  try {
    if (host === 'codebuddy') {
      const l = launchSpec(bin, ['--help'], 'codebuddy');
      return parseCodebuddyModels(exec(l.cmd, l.args, { shell: l.shell }));
    }
    if (host === 'codex') {
      const l = launchSpec(bin, ['debug', 'models'], 'codex');
      return parseCodexModels(exec(l.cmd, l.args, { shell: l.shell }));
    }
  } catch { /* the caller falls back to typing */ }
  return [];
}

// A model the user typed that the host does not list would fail only after the question-drafting call started. Names the
// package turns into a DeepSeek model of its own (deepseek-*) are exempt: they are not in the host's list by design.
// Returns the host's current list when the name is not in it, else null (also null when the list could not be read).
export function unknownModel(model, known) {
  if (!model || !known?.length || known.includes(model) || /^deepseek/i.test(model)) return null;
  return known;
}

// `codebuddy --help` lists only what the account is signed in for right now (it can shrink to two entries), while the
// model catalog CodeBuddy last fetched stays in its local cache. Every string array called "models" inside those cache
// files is part of that catalog; the union with the help list is what the user remembers having been offered. A name
// from the catalog only is not promised to work for the account, so the list marks it and a failure shows the CLI's words.
export function catalogFromTexts(texts) {
  const names = new Set();
  const walk = (node, depth) => {
    if (!node || depth > 8) return;
    if (Array.isArray(node)) { node.forEach((n) => walk(n, depth + 1)); return; }
    if (typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node)) {
      if (k === 'models' && Array.isArray(v)) v.filter((x) => typeof x === 'string' && /^[\w.:-]{2,80}$/.test(x)).forEach((x) => names.add(x));
      else walk(v, depth + 1);
    }
  };
  for (const text of texts) { try { walk(JSON.parse(text), 0); } catch { /* not JSON */ } }
  return [...names];
}

export function codebuddyCatalog(dir = path.join(os.homedir(), '.codebuddy', 'local_storage')) {
  const texts = [];
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.info')) continue;
      const file = path.join(dir, f);
      if (fs.statSync(file).size > 2 * 1024 * 1024) continue;
      texts.push(fs.readFileSync(file, 'utf8'));
    }
  } catch { /* no cache: only the help list */ }
  return catalogFromTexts(texts);
}
