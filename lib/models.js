// Model names a host will accept, read from the host itself so the list is the user's own (it depends on the
// account and the custom models they set up) and never goes stale inside this package. Any failure gives [].
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
