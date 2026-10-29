// Launching a CLI on Windows. Three traps, all of which produce confusing errors rather than loud
// ones: `where` returns the extension-less shim first (Node cannot exec it), `shell: true` re-splits
// arguments on spaces (a prompt becomes several arguments), and cmd.exe treats & | < > ^ % specially.
//
// The way out is to not use a shell: run the package's JS entry with the current node binary. Only
// when that cannot be found do we fall back to the .cmd shim, and then every argument is quoted.
import fs from 'node:fs';
import path from 'node:path';

function looksLikeJs(p) {
  return /\.(c|m)?js$/i.test(p);
}

// An npm .cmd shim names the script it runs (`"%_prog%" "%dp0%\<relative path>" %*`). Reading it is exact;
// guessing from the package layout can land on a dependency's index.js instead of the CLI.
function entryFromShim(bin) {
  if (!/\.cmd$/i.test(bin)) return null;
  let text;
  try { text = fs.readFileSync(bin, 'utf8'); } catch { return null; }
  const hits = [...text.matchAll(/"%_prog%"\s+"%dp0%\\([^"]+)"/g)];
  if (!hits.length) return null;
  const target = path.join(path.dirname(bin), ...hits[hits.length - 1][1].split('\\'));
  try { return fs.statSync(target).isFile() ? target : null; } catch { return null; }
}

// Global npm layouts put the entry at node_modules/<pkg>/bin/<name>.js or
// node_modules/@scope/<pkg>/<entry>.js. Look a bounded distance, in that order.
function findJsEntry(bin, name) {
  const fromShim = entryFromShim(bin);
  if (fromShim) return fromShim;
  const root = path.dirname(bin);
  // A project-local install keeps its shims in node_modules/.bin, so the packages are one level up.
  const nm = path.basename(root) === '.bin' ? path.dirname(root) : path.join(root, 'node_modules');
  const candidates = [
    path.join(nm, name, 'bin', `${name}.js`),
    path.join(nm, name, `${name}.js`),
    path.join(nm, name, 'cli.js'),
    path.join(nm, name, 'index.js'),
  ];
  let entries = [];
  try { entries = fs.readdirSync(nm, { withFileTypes: true }); } catch { return null; }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith('@')) {
      let scoped = [];
      try { scoped = fs.readdirSync(path.join(nm, e.name), { withFileTypes: true }); } catch { continue; }
      for (const s of scoped) {
        if (!s.isDirectory()) continue;
        candidates.push(path.join(nm, e.name, s.name, 'bin', `${name}.js`));
        candidates.push(path.join(nm, e.name, s.name, 'bin', name));
        candidates.push(path.join(nm, e.name, s.name, `${name}.js`));
        candidates.push(path.join(nm, e.name, s.name, 'cli.js'));
        candidates.push(path.join(nm, e.name, s.name, 'index.js'));
      }
    }
  }
  return candidates.find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } });
}

export function runnerFor(bin, name = path.basename(bin).replace(/\.(cmd|bat|exe)$/i, '')) {
  if (looksLikeJs(bin)) return { cmd: process.execPath, prefix: [bin], shell: false };
  if (/\.exe$/i.test(bin)) return { cmd: bin, prefix: [], shell: false };
  const entry = findJsEntry(bin, name);
  if (entry) return { cmd: process.execPath, prefix: [entry], shell: false };
  return { cmd: bin, prefix: [], shell: true };
}

// Only used on the shell fallback. Wraps each argument and neutralises cmd.exe metacharacters.
export function quoteForCmd(arg) {
  const s = String(arg);
  if (!/[\s"&|<>^%()]/.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

// Command, argument list and shell flag for one launch. Callers that used `shell: /\.(cmd|bat)$/` handed
// the prompt to cmd.exe, which re-splits it on spaces; this routes every launch through runnerFor instead.
export function launchSpec(bin, argv, name) {
  const runner = runnerFor(bin, name);
  return {
    cmd: runner.cmd,
    args: runner.shell ? [...runner.prefix, ...argv].map(quoteForCmd) : [...runner.prefix, ...argv],
    shell: runner.shell,
  };
}
