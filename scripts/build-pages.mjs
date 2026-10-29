#!/usr/bin/env node
// Builds the leaderboard site: _site/index.html (the page) and _site/LEADERBOARD.md (the same data as
// markdown), from step0/data/ and submissions/ only. Run by pages.yml; nothing is committed.
//
//   node scripts/build-pages.mjs [--root .] [--out _site] [--repo owner/name]
//
// Everything that came from a submission (skill name, model, user, repo, links) is untrusted text. It is
// HTML-escaped, and the only links that are written are https://github.com/... ones; a relative data link
// becomes a github.com blob/tree link on the main branch. Numbers are never averaged across hosts.
import fs from 'node:fs';
import path from 'node:path';
import { build, buildRows, maintainerEntries, submissionEntries } from './build-leaderboard.mjs';

const HOSTS = { 'claude-code': 'Claude Code', codebuddy: 'CodeBuddy', codewhale: 'Codewhale' };
const GRADE_TEXT = {
  well: 'triggers well', fair: 'triggers fair', poorly: 'triggers poorly',
  insufficient: 'insufficient data', disagree: 'no grade (question sets disagree)',
};

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"'`]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
}

const GH_URL = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.\-~%+=@:,/]*)?$/;
const SEGMENT = /^[A-Za-z0-9_.@=+,:~%-]+$/;

// Returns an https://github.com URL or null. `repo` is the site's own repository, for relative links.
export function safeLink(href, repo) {
  const s = String(href ?? '').trim();
  if (GH_URL.test(s) && !s.split('/').some((p) => p === '..' || p === '.') && !/%2e/i.test(s)) return s;
  if (!s || /^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith('/') || s.includes('\\')) return null;
  const parts = s.split('/').filter(Boolean);
  if (!parts.length || parts.some((p) => p === '..' || p === '.' || !SEGMENT.test(p))) return null;
  const kind = s.endsWith('/') ? 'tree' : 'blob';
  return `https://github.com/${repo}/${kind}/main/${parts.join('/')}${s.endsWith('/') ? '/' : ''}`;
}

const link = (href, text, repo) => {
  const u = safeLink(href, repo);
  return u ? `<a href="${escapeHtml(u)}" rel="noopener noreferrer">${escapeHtml(text)}</a>` : escapeHtml(text);
};
const pct = (x) => (x == null ? '–' : `${Math.round(x * 100)}%`);
const ci = (c) => (c && c[0] != null ? `${Math.round(c[0] * 100)}–${Math.round(c[1] * 100)}%` : '–');

const skillUrl = (r) => `${r.repo}/tree/${r.commit}${r.subdir ? `/${r.subdir}` : ''}`;

function credit(r, repo) {
  const names = r.contributors || (r.contributor ? [r.contributor] : []);
  const parts = names.map((n) => (/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(n) ? link(`https://github.com/${n}`, n, repo) : escapeHtml(n)));
  if (r.source === 'maintainer') parts.unshift('maintainer');
  return parts.join(', ') || '–';
}

export function renderPage({ rows, skipped = [], counts }, { repo = 'SkillGauntlet/SkillGauntlet', built = '' } = {}) {
  const out = [];
  out.push('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>SkillGauntlet leaderboard</title>',
    '<style>:root{color-scheme:light dark}body{font:15px/1.5 system-ui,sans-serif;max-width:1200px;margin:0 auto;padding:16px}',
    'table{border-collapse:collapse;width:100%;margin:0 0 24px}th,td{border:1px solid #8884;padding:4px 8px;text-align:left;vertical-align:top}',
    'th{background:#8882}.wrap{overflow-x:auto}.tag{white-space:nowrap}</style></head><body>',
    '<h1>SkillGauntlet leaderboard</h1>',
    '<p><strong>These are automated test results.</strong> The questions were drafted by AI and not reviewed by hand. A row describes how one skill triggered on the host and model named in its table, at the pinned SKILL.md; it is not an overall judgement of the skill.</p>',
    `<p>${escapeHtml(counts.skills)} skills, ${escapeHtml(counts.rows)} rows: ${escapeHtml(counts.maintainer)} from the maintainer's batches, ${escapeHtml(counts.community)} community submissions. `,
    `Want a row filled in or confirmed? See <a href="https://github.com/${escapeHtml(repo)}#submit-your-results">Submit your results</a>.</p>`,
    '<h2>How to read it</h2><ul>',
    '<li><strong>One table per host.</strong> Numbers are never averaged across hosts or models.</li>',
    '<li><strong>Grade</strong>: <em>well</em> = recall at least 80% and false positives at most 10%; <em>poorly</em> = recall under 50% or false positives over 25%; <em>fair</em> = in between; <em>insufficient data</em> = fewer than 10 trials on either side. Intervals are 95% Wilson intervals.</li>',
    '<li><strong>Data quality</strong>: <em>maintainer run</em> is the project\'s own run. <em>community single sample</em> is one submission, shown as received after format and hash checks. <em>confirmed</em> means two independent submissions (different GitHub accounts), or a maintainer run plus one community submission, landed on the same grade. <em>conflicting</em> means submissions for the same skill version, host and model gave different grades; all are shown.</li>',
    '<li><strong>What a tag cannot mean.</strong> The runner cannot prevent forgery, and the checks cover only format, hashes and arithmetic: they cannot show that the trials were really run. "Independent" means different accounts, nothing stronger. Treat <em>confirmed</em> as "more than one submission agrees", not as proof.</li>',
    '<li>A row is for one pinned commit of the skill. A new commit starts a new row.</li></ul>');
  if (!counts.community) out.push('<p>No community submissions yet.</p>');
  for (const host of [...new Set(rows.map((r) => r.host))].sort()) {
    out.push(`<h2>${escapeHtml(HOSTS[host] || host)}</h2><div class="wrap"><table><thead><tr>`,
      ['Skill', 'Model', 'Grade', 'Recall (95% CI)', 'False positives (95% CI)', 'Questions (pos / neg)', 'Data quality', 'Submissions', 'Last tested', 'Data', 'Credit'].map((h) => `<th>${h}</th>`).join(''),
      '</tr></thead><tbody>');
    for (const r of rows.filter((x) => x.host === host)) {
      const data = r.links.map((l, i) => link(l, i === 0 ? (r.source === 'maintainer' ? 'batch report' : 'raw data') : `+${i}`, repo)).join(' ');
      out.push('<tr>',
        `<td>${link(skillUrl(r), r.skill, repo)}</td><td>${escapeHtml(r.model)}</td><td>${escapeHtml(GRADE_TEXT[r.grade] || r.grade)}</td>`,
        `<td>${pct(r.recall)} (${ci(r.recallCi)})</td><td>${pct(r.fpr)} (${ci(r.fprCi)})</td><td>${escapeHtml(r.qPos)} / ${escapeHtml(r.qNeg)}</td>`,
        `<td class="tag">${escapeHtml(r.tag)}</td><td>${escapeHtml(r.submissions)}</td><td>${escapeHtml(r.date)}</td><td>${data}</td><td>${credit(r, repo)}</td></tr>`);
    }
    out.push('</tbody></table></div>');
  }
  if (skipped.length) {
    out.push('<h2>Left out</h2><p>These submission directories failed the offline checks and are not shown:</p><ul>');
    for (const s of skipped) out.push(`<li><code>${escapeHtml(s.dir)}</code>: ${escapeHtml(s.reason)}</li>`);
    out.push('</ul>');
  }
  out.push(`<p><small>Built from <code>step0/data/</code> and <code>submissions/</code> ${escapeHtml(built)}. <a href="LEADERBOARD.md">Markdown version</a>.</small></p></body></html>`);
  return `${out.join('\n')}\n`;
}

export function buildSite(root, { repo, built } = {}) {
  const maintainer = maintainerEntries(root);
  const { entries: community, skipped } = submissionEntries(root);
  const rows = buildRows([...maintainer, ...community]);
  const counts = {
    rows: rows.length,
    maintainer: rows.filter((r) => r.source === 'maintainer').length,
    community: community.length,
    skills: new Set(rows.map((r) => `${r.repo}|${r.subdir}|${r.skill}`)).size,
  };
  return { html: renderPage({ rows, skipped, counts }, { repo, built }), markdown: build(root) };
}

function main() {
  const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
  const root = path.resolve(arg('--root', '.'));
  const out = path.resolve(arg('--out', '_site'));
  const repo = arg('--repo', process.env.GITHUB_REPOSITORY || 'SkillGauntlet/SkillGauntlet');
  const { html, markdown } = buildSite(root, { repo, built: `at ${new Date().toISOString().slice(0, 16)}Z` });
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'index.html'), html);
  fs.writeFileSync(path.join(out, 'LEADERBOARD.md'), markdown);
  fs.writeFileSync(path.join(out, '.nojekyll'), '');
  process.stdout.write(`wrote ${out}\n`);
}

if (process.argv[1]?.endsWith('build-pages.mjs')) main();
