// Picking a directory with the arrow keys: the list shows the folders under the current one, a way up, and a way
// to type a path instead. `select` is injected so the walk can be tested without a terminal.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { t } from './i18n.js';

const DOT_KEPT = new Set(['.claude', '.agents', '.codex', '.codebuddy']);

function subdirs(dir) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter((e) => e.isDirectory() && (!e.name.startsWith('.') || DOT_KEPT.has(e.name)) && e.name !== 'node_modules')
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
}

const holdsSkill = (dir) => fs.existsSync(path.join(dir, 'SKILL.md'));

function drives() {
  const found = [];
  for (let c = 65; c <= 90; c += 1) {
    const root = `${String.fromCharCode(c)}:\\`;
    if (fs.existsSync(root)) found.push(root);
  }
  return found;
}

// A long path would wrap and break the in-place redraw, so only its tail is shown.
const tail = (p, n = 36) => (p.length > n ? `…${p.slice(-(n - 1))}` : p);

// Returns the chosen directory, or null when the user asks to type a path instead.
export async function browseDir(select, start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    const parent = path.dirname(dir);
    const atRoot = parent === dir;
    const options = [{ label: t('browseUse'), hint: holdsSkill(dir) ? t('browseHasSkill') : '', value: { use: dir } }];
    if (!atRoot) options.push({ label: t('browseUp'), hint: tail(parent), value: { go: parent } });
    else if (process.platform === 'win32') options.push({ label: t('browseDrives'), value: { drives: true } });
    if (dir !== os.homedir()) options.push({ label: t('browseHome'), hint: tail(os.homedir()), value: { go: os.homedir() } });
    for (const name of subdirs(dir)) {
      const full = path.join(dir, name);
      options.push({ label: `${name}${path.sep}`, hint: holdsSkill(full) ? t('browseHasSkill') : '', value: { go: full } });
    }
    options.push({ label: t('browseType'), value: { type: true } });

    const pick = await select(t('browseTitle', { dir: tail(dir) }), options, 0);
    if (pick.use) return pick.use;
    if (pick.type) return null;
    if (pick.go) dir = pick.go;
    if (pick.drives) {
      const root = await select(t('browseDrives'), drives().map((d) => ({ label: d, value: d })), 0);
      dir = root;
    }
  }
}
