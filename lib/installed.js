// Where a skill can already be installed. Claude Code, Codex and the shared .agents convention all
// read a directory of skill folders, each with a SKILL.md inside.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Ordered: earlier roots win when the same skill name appears twice.
const ROOTS = [
  () => path.join(os.homedir(), '.agents', 'skills'),
  () => path.join(process.cwd(), '.agents', 'skills'),
  () => path.join(os.homedir(), '.claude', 'skills'),
  () => path.join(process.cwd(), '.claude', 'skills'),
  () => path.join(os.homedir(), '.codex', 'skills'),
  () => path.join(process.cwd(), '.codex', 'skills'),
];

function skillName(dir) {
  try {
    const text = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8');
    const m = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
    const n = m && m[1].match(/^name\s*:\s*(.+)$/m);
    if (n) return n[1].trim().replace(/^["']|["']$/g, '');
  } catch { /* fall through */ }
  return path.basename(dir);
}

export function installedSkills() {
  const seen = new Map();
  for (const rootFn of ROOTS) {
    const root = rootFn();
    let entries = [];
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue;
      const dir = path.join(root, e.name);
      if (!fs.existsSync(path.join(dir, 'SKILL.md'))) continue;
      const name = skillName(dir);
      if (seen.has(name)) continue;
      seen.set(name, { name, dir, root });
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}
