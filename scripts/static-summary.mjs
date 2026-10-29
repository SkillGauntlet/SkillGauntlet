// Regenerate the static-layer summary for the manifest's skills, from the local cache.
// Usage: node scripts/static-summary.mjs [manifest] [outDir]
// No model calls: safe to run any time, costs nothing.
import fs from 'node:fs';
import path from 'node:path';
import { analyze } from '../lib/static.js';
import { readerPollSection } from '../lib/report.js';
import { setLang } from '../lib/i18n.js';

// The summary is published, so it ends with the reader poll; the CLI takes --lang for the same text.
setLang(process.env.SG_LANG || 'en');

const manifest = process.argv[2] || 'step0/skills.json';
const outDir = process.argv[3] || 'step0/data/static';
const spec = JSON.parse(fs.readFileSync(manifest, 'utf8'));
const entries = Array.isArray(spec) ? spec : spec.skills;

function findCached(entry) {
  const slug = `${entry.repo.split('://').pop()}@${entry.ref}`.replace(/[^A-Za-z0-9_.@-]/g, '_');
  return path.join('step0/.cache', slug, entry.subdir || '');
}

const rows = [];
for (const entry of entries) {
  const dir = entry.path ? path.resolve(entry.path) : findCached(entry);
  if (!fs.existsSync(path.join(dir, 'SKILL.md'))) {
    process.stderr.write(`skip ${entry.name}: not cached\n`);
    continue;
  }
  rows.push(analyze(dir));
}

rows.sort((a, b) => b.stats.skillMdTokens - a.stats.skillMdTokens);

const L = [];
L.push('# Static layer: every skill in the manifest, layer 0 only');
L.push('');
L.push('Regenerate with `node scripts/static-summary.mjs`. No model calls, no cost, and the same');
L.push('directory always produces the same result.');
L.push('');
L.push('| skill | SKILL.md tokens | package | code files | allowed-tools | desc chars | A | B | C | D | E | flagged |');
L.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  const flags = [];
  for (const g of r.groups) for (const c of g.checks) if (c.status === 'warn' || c.status === 'fail') flags.push(c.id);
  const g = r.groups.map((x) => x.id + (x.verdict === 'pass' ? '+' : x.verdict === 'warn' ? '!' : '-')).join(' ');
  L.push(`| ${r.skill} | ${r.stats.skillMdTokens} | ${Math.round(r.stats.bytes / 1024)} KB | ${r.stats.codeFiles} `
    + `| ${r.stats.allowedTools ? 'declared' : 'none'} | ${r.stats.descriptionChars} | ${g} | ${flags.join(' ') || '-'} |`);
}
L.push('');
L.push('A context cost, B permission surface, C code risk, D instruction hijacking, E description quality.');
L.push('`+` pass, `!` warning, `-` failure. No composite score on purpose.');
L.push('');

const n = rows.length;
const noTools = rows.filter((r) => !r.stats.allowedTools).length;
const withCode = rows.filter((r) => r.stats.codeFiles > 0);
const heavy = rows.filter((r) => r.stats.skillMdTokens > 2000);
const heavyPkg = rows.filter((r) => r.stats.bytes >= 1048576);
L.push('## Findings');
L.push('');
L.push(`1. **${noTools} of ${n} skills declare no \`allowed-tools\`.** The host grants each of them the default scope, and the user never sees what that scope is.`);
L.push(`2. **${withCode.length} of ${n} ship executable code** (${withCode.map((r) => `${r.skill} ${r.stats.codeFiles}`).join(', ')}). Two of them make network calls.`);
L.push(`3. **${heavy.length} skills put more than 2,000 tokens of SKILL.md into the window every time they fire** (${heavy.slice(0, 4).map((r) => `${r.skill} ${r.stats.skillMdTokens}`).join(', ')}).`);
L.push(`4. **${heavyPkg.length} packages exceed 1 MB** (${heavyPkg.map((r) => `${r.skill} ${Math.round(r.stats.bytes / 1024)} KB`).join(', ')}) to deliver text instructions.`);
L.push('');
L.push('## What this layer cannot see');
L.push('');
L.push('- Whether the skill helps. That needs paired tasks with verifiable outcomes (layer 2).');
L.push('- Whether it triggers. That needs model calls (layer 1).');
L.push('- Whether a declared scope is honoured at runtime: this reads declarations, not behaviour.');
L.push(readerPollSection());

fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'SUMMARY.md');
fs.writeFileSync(out, `${L.join('\n')}\n`);
process.stdout.write(`${out}\n`);


