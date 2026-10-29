// Locating skills: a local directory, or owner/repo cloned at a pinned commit.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SKIP = new Set(['.git', 'node_modules', '.cache', 'dist', 'build', 'vendor', '__pycache__']);
// Dot directories are skipped, except the ones agent hosts install skills into: a repository's own skill
// often lives only under .claude/skills.
const SKILL_DOT_DIRS = new Set(['.claude', '.agents', '.codex', '.codebuddy']);

export function findSkills(root, { maxDepth = 6 } = {}) {
  const found = [];
  const walk = (dir, depth) => {
    if (depth > maxDepth) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    if (entries.some((e) => e.isFile() && e.name === 'SKILL.md')) {
      found.push(dir);
      return; // a skill dir does not contain nested skills
    }
    for (const e of entries) {
      if (!e.isDirectory() || SKIP.has(e.name) || (e.name.startsWith('.') && !SKILL_DOT_DIRS.has(e.name))) continue;
      walk(path.join(dir, e.name), depth + 1);
    }
  };
  walk(path.resolve(root), 0);
  return dropCopies(found.sort());
}

// Repositories often ship a second copy of a skill (a packaged template next to the installed one). A copy with
// the same name and byte-identical SKILL.md adds nothing to a test, so only the first path is kept.
function dropCopies(dirs) {
  const seen = new Set();
  return dirs.filter((d) => {
    let key = d;
    try { key = [path.basename(d), fs.readFileSync(path.join(d, 'SKILL.md'), 'utf8')].join(' | '); } catch { /* keep it */ }
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function readFrontmatter(skillDir) {
  const file = path.join(skillDir, 'SKILL.md');
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { return { fm: {}, text: '', file }; }
  const fm = {};
  const m = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (m) {
    let key = null;
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
      if (kv) {
        key = kv[1];
        fm[key] = kv[2].replace(/^["']|["']$/g, '').trim();
      } else if (key && /^\s+\S/.test(line)) {
        fm[key] = `${fm[key]} ${line.trim()}`.trim();
      }
    }
  }
  return { fm, text, file };
}

function cacheRoot() {
  const base = process.env.SKILLGAUNTLET_CACHE
    || path.join(os.homedir(), '.cache', 'skillgauntlet');
  fs.mkdirSync(base, { recursive: true });
  return base;
}

// Accepts: a local path, or owner/repo, or a github URL (with optional #ref).
export function resolveSpec(spec) {
  const local = path.resolve(spec);
  if (fs.existsSync(local)) return { kind: 'local', dir: local, source: { path: spec } };

  const m = spec.match(/^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:#(.+))?$/);
  if (!m) {
    const err = new Error(`cannot read this address: ${spec} (use a local directory or owner/repo)`);
    err.messageKey = 'badSource';
    err.vars = { spec };
    throw err;
  }
  const [, owner, repo, ref] = m;
  const slug = `${owner}__${repo}${ref ? `@${ref}` : ''}`.replace(/[^\w.@-]/g, '_');
  const dir = path.join(cacheRoot(), slug);
  if (!fs.existsSync(path.join(dir, '.git'))) {
    fs.rmSync(dir, { recursive: true, force: true });
    const args = ['clone', '--quiet', '--depth', '1'];
    if (ref) args.push('--branch', ref);
    args.push(`https://github.com/${owner}/${repo}.git`, dir);
    execFileSync('git', args, { stdio: 'inherit' });
  }
  let commit = '';
  try {
    commit = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch { /* keep empty */ }
  return { kind: 'git', dir, source: { repo: `https://github.com/${owner}/${repo}`, commit, ref: ref || null } };
}

// The name a host knows a skill by is the `name` in its SKILL.md frontmatter; the folder name is only a fallback.
// A skill at the root of a repository sits in a folder named after the repository (or its cache slug), so using
// the folder name made every trial of such a skill look like "another skill was used".
export function skillNameOf(skillDir) {
  const fm = readFrontmatter(skillDir).fm;
  const name = String(fm.name || '').trim();
  return /^[\w.-]+$/.test(name) ? name : path.basename(skillDir);
}
