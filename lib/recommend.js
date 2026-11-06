// What to test when someone has no skill in mind: a row of the leaderboard that one more run can confirm.
//
// The list comes from the published site, so a row that was confirmed an hour ago is no longer offered. Offline, or
// while the site has no list yet, it comes from the maintainer's data shipped in this package, which is older but
// always there. A row is for one pinned commit, host and model, so the result only counts if all three are matched:
// the commit is carried along here, and the defaults of the later questions are Claude Code and haiku.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROWS_URL = 'https://skillgauntlet.github.io/SkillGauntlet/rows.json';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GRADEABLE = new Set(['well', 'fair', 'poorly']);
const REPO = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/;
const COMMIT = /^[0-9a-f]{40}$/;
const DEFAULT_HOST = 'claude-code';
const DEFAULT_MODEL = /haiku/;
const MAX = 5;

// A subfolder of a repository, relative and with nothing that walks out of it.
const safeSubdir = (s) => typeof s === 'string' && !s.startsWith('/') && !s.includes('\\')
  && (s === '' || s.split('/').every((p) => /^[\w.@+-]+$/.test(p) && p !== '.' && p !== '..'));

// The skills a gain contract exists for take many more model calls at Standard depth, and have the model do the task.
export function contractedSkills(dir = path.join(HERE, '..', 'contracts')) {
  try { return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)); } catch { return []; }
}

// rows: untrusted data from a web page or a file. The smallest question sets first, so the first suggestion is the cheapest.
export function pickSuggestions(rows, { contracted = contractedSkills() } = {}) {
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => r && r.host === DEFAULT_HOST && DEFAULT_MODEL.test(String(r.model)) && r.tag === 'maintainer run'
      && GRADEABLE.has(r.grade) && !contracted.includes(r.skill)
      && typeof r.skill === 'string' && /^[\w.-]+$/.test(r.skill) && REPO.test(String(r.repo)) && COMMIT.test(String(r.commit)) && safeSubdir(r.subdir ?? ''))
    .sort((a, b) => (Number(a.qPos) || 0) - (Number(b.qPos) || 0) || a.skill.localeCompare(b.skill))
    .slice(0, MAX)
    .map((r) => ({ skill: r.skill, repo: r.repo, commit: r.commit, subdir: r.subdir ?? '' }));
}

export function bundledRows(file = path.join(HERE, '..', 'step0', 'data', 'leaderboard-maintainer.json')) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).entries.map((e) => ({ ...e, tag: 'maintainer run', qPos: e.queriesPos }));
  } catch { return []; }
}

async function fetchRows(url = ROWS_URL, timeout = 2500) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`site ${res.status}`);
  return (await res.json()).rows;
}

// Never throws: without a list the question simply has one entry fewer.
export async function loadSuggestions({ remote = fetchRows, bundled = bundledRows } = {}) {
  try {
    const live = pickSuggestions(await remote());
    if (live.length) return live;
  } catch { /* offline, or the site has no list yet */ }
  return pickSuggestions(bundled());
}
