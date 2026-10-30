// A host CLI that is not on PATH is often still on the machine: in npm's global folder, in Downloads under the
// name the release page gave it, or in a tools folder. Look there before telling the user to install anything,
// and where the host is an npm package offer to install it.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The command name each host answers to, and (when there is one) the npm package that provides it.
export const HOST_CLI = {
  'claude-code': { bin: 'claude', pkg: '@anthropic-ai/claude-code' },
  codebuddy: { bin: 'codebuddy', pkg: '@tencent-ai/codebuddy-code' },
  codewhale: { bin: 'codewhale', pkg: 'codewhale' },
};

const isWin = process.platform === 'win32';
const RUNNABLE = isWin ? /\.(exe|cmd|bat)$/i : /^[^.]*$/;

function npmGlobalDir() {
  try {
    const prefix = execSync('npm prefix -g', { encoding: 'utf8', timeout: 15000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return isWin ? prefix : path.join(prefix, 'bin');
  } catch { return null; }
}

function listDir(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
}

// Files named like the host (codewhale.exe, codewhale-windows-x64.exe, codewhale.cmd) directly in dir.
function inDir(dir, bin) {
  const out = [];
  for (const e of listDir(dir)) {
    if (!e.isFile()) continue;
    const base = e.name.toLowerCase();
    const exact = base === bin || base.startsWith(`${bin}.`);
    // a Windows release asset keeps its platform suffix (codewhale-windows-x64.exe); only a real exe counts for those.
    // Elsewhere an executable has no extension and only the exact name is trusted.
    const variant = isWin && (base.startsWith(`${bin}-`) || base.startsWith(`${bin}_`)) && base.endsWith('.exe');
    if ((exact || variant) && RUNNABLE.test(e.name)) out.push(path.join(dir, e.name));
  }
  return out;
}

// Directories worth looking in, nothing recursive beyond one level of subfolders for the download-like ones.
export function searchDirs() {
  const home = os.homedir();
  const dirs = [npmGlobalDir(), ...(process.env.PATH || '').split(path.delimiter)].filter(Boolean);
  for (const sub of ['.local/bin', '.cargo/bin', 'bin', 'tools', 'Downloads', 'Desktop', 'Documents']) dirs.push(path.join(home, sub));
  if (process.env.LOCALAPPDATA) dirs.push(path.join(process.env.LOCALAPPDATA, 'Programs'));
  return dirs;
}

// Absolute paths of candidates for a host, best first (a real .exe before a .cmd shim). `dirs` is injectable.
export function searchHost(host, dirs = searchDirs()) {
  const spec = HOST_CLI[host];
  if (!spec) return [];
  const seen = new Set();
  const found = [];
  const add = (f) => { if (!seen.has(f.toLowerCase())) { seen.add(f.toLowerCase()); found.push(f); } };
  for (const dir of dirs) {
    inDir(dir, spec.bin).forEach(add);
    // one level down: Downloads\codewhale\codewhale.exe, Programs\codewhale\...
    for (const e of listDir(dir).slice(0, 400)) {
      if (e.isDirectory() && e.name.toLowerCase().includes(spec.bin)) inDir(path.join(dir, e.name), spec.bin).forEach(add);
    }
  }
  const exactName = (f) => { const b = path.basename(f).toLowerCase(); return b === spec.bin || b.startsWith(`${spec.bin}.`); };
  const rank = (f) => (exactName(f) ? 0 : 10) + (/\.exe$/i.test(f) ? 0 : /\.(cmd|bat)$/i.test(f) ? 1 : 2);
  return found.sort((a, b) => rank(a) - rank(b));
}

// Codewhale's package has an install script, and npm only runs install scripts it has been told to allow. The
// allowance is given for this one command (--allow-scripts) rather than written into the user's npm config.
const INSTALL_FLAGS = { codewhale: ' --allow-scripts=codewhale' };
export const installCommand = (host) => (HOST_CLI[host]?.pkg ? `npm install -g ${HOST_CLI[host].pkg}${INSTALL_FLAGS[host] || ''}` : null);

// Runs the npm install with its output on the user's terminal. Throws with a short reason on failure.
export function installHost(host, run = (cmd) => execSync(cmd, { stdio: 'inherit' })) {
  const cmd = installCommand(host);
  if (!cmd) throw new Error('no installer for this host');
  try { run(cmd); } catch (err) { throw new Error(String(err.message || err).split(/\r?\n/)[0]); }
}

// How to sign in to a host from this terminal. Claude Code and Codewhale have a login command; CodeBuddy has none, its
// sign-in is the /login command inside its own interface, so its CLI is opened and the user is told what to type.
export const LOGIN = {
  'claude-code': { args: ['auth', 'login'], hint: 'loginHintBrowser' },
  codewhale: { args: ['login'], hint: 'loginHintBrowser' },
  codebuddy: { args: [], hint: 'loginHintCodebuddy' },
};
export const loginCommand = (host, bin) => (LOGIN[host] ? `${bin} ${LOGIN[host].args.join(' ')}`.trim() : null);
