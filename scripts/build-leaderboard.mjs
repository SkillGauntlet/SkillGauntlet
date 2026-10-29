#!/usr/bin/env node
// Builds LEADERBOARD.md from the maintainer's published batches (step0/data/leaderboard-maintainer.json,
// itself counted from run data by step0/batch_tables.py) and from every directory under submissions/.
// Every number on the page is read from those files; nothing is typed here.
//
//   node scripts/build-leaderboard.mjs            write LEADERBOARD.md
//   node scripts/build-leaderboard.mjs --check    exit 1 if LEADERBOARD.md is out of date
//
// Rules the page follows (design doc 14.1 and 14.3):
//  - one table per host, never an average across hosts or models;
//  - a single submission is a "community single sample";
//  - a cell is "confirmed" when two independent contributors land on the same grade, or a maintainer run
//    and one community submission do. Independent means different GitHub accounts, and nothing more;
//  - submissions that disagree are all kept, side by side, tagged "conflicting";
//  - the page says what the tags can and cannot mean.
import fs from 'node:fs';
import path from 'node:path';
import { checkParsed, gradeOfSummary } from '../lib/submission.js';

const GRADEABLE = new Set(['well', 'fair', 'poorly']);
const HOSTS = { 'claude-code': 'Claude Code', codebuddy: 'CodeBuddy', codewhale: 'Codewhale' };
const GRADE_TEXT = {
  well: 'triggers well', fair: 'triggers fair', poorly: 'triggers poorly',
  insufficient: 'insufficient data', disagree: 'no grade (question sets disagree)',
};

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

function readJsonl(f) {
  return fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
}

export function maintainerEntries(root) {
  const f = path.join(root, 'step0', 'data', 'leaderboard-maintainer.json');
  if (!fs.existsSync(f)) return [];
  return readJson(f).entries.map((e) => ({
    source: 'maintainer',
    skill: e.skill, repo: e.repo, subdir: e.subdir, commit: e.commit, sha: e.skillMdSha256,
    host: e.host, model: e.model, hostVersion: e.hostVersion,
    grade: e.grade, recall: e.recall, recallCi: e.recallCi, fpr: e.fpr, fprCi: e.fprCi,
    qPos: e.queriesPos, qNeg: e.queriesNeg, date: e.date, links: [e.link], contributor: null,
  }));
}

// Returns { entries, skipped }. A directory that fails the offline checks is left out and reported, so
// one bad file that slipped past review cannot put a wrong number on the page.
export function submissionEntries(root) {
  const base = path.join(root, 'submissions');
  const entries = [];
  const skipped = [];
  if (!fs.existsSync(base)) return { entries, skipped };
  for (const skill of fs.readdirSync(base)) {
    const sd = path.join(base, skill);
    if (!fs.statSync(sd).isDirectory()) continue;
    for (const hm of fs.readdirSync(sd)) {
      const hd = path.join(sd, hm);
      if (!fs.statSync(hd).isDirectory()) continue;
      for (const run of fs.readdirSync(hd)) {
        const dir = path.join(hd, run);
        if (!fs.statSync(dir).isDirectory()) continue;
        const rel = `submissions/${skill}/${hm}/${run}`;
        try {
          const parsed = {
            meta: readJson(path.join(dir, 'meta.json')),
            summary: readJson(path.join(dir, 'summary.json')),
            queries: readJson(path.join(dir, 'queries.json')),
            raw: readJsonl(path.join(dir, 'raw.jsonl')),
          };
          const errors = checkParsed(parsed);
          if (errors.length) { skipped.push({ dir: rel, reason: errors[0] }); continue; }
          const { meta, summary } = parsed;
          const s = meta.submission;
          entries.push({
            source: 'community',
            skill: meta.skill, repo: s.skill.repo, subdir: s.skill.subdir, commit: s.skill.commit, sha: s.skill.skillMdSha256,
            host: meta.host, model: s.model.resolved || s.model.requested || 'unknown', hostVersion: s.host.version,
            grade: gradeOfSummary(summary), recall: summary.recall, recallCi: summary.recallCi, fpr: summary.fpr, fprCi: summary.fprCi,
            qPos: summary.questions.filter((q) => q.shouldTrigger).length,
            qNeg: summary.questions.filter((q) => !q.shouldTrigger).length,
            date: meta.finishedAt.slice(0, 10), links: [`${rel}/`], contributor: s.contributor,
          });
        } catch (e) {
          skipped.push({ dir: rel, reason: e.message });
        }
      }
    }
  }
  return { entries, skipped };
}

// Keyed on the pinned commit, not the SKILL.md hash: the maintainer batches were hashed from Windows
// checkouts (CRLF) and submissions hash the line-ending-neutral text, so the two hashes of one file differ.
const cellKey = (e) => [e.repo, e.subdir, e.skill, e.host, e.model, e.commit].join('|');

// Groups entries into cells and decides each row's quality tag. Returns rows, one per displayed line.
export function buildRows(entries) {
  const cells = new Map();
  for (const e of entries) cells.set(cellKey(e), [...(cells.get(cellKey(e)) || []), e]);
  const rows = [];
  for (const group of cells.values()) {
    const gradeable = group.filter((e) => GRADEABLE.has(e.grade));
    const grades = new Set(gradeable.map((e) => e.grade));
    const alone = (e, tag) => rows.push({ ...e, tag, submissions: 1 });
    if (grades.size > 1) {
      for (const e of group) alone(e, 'conflicting');
      continue;
    }
    for (const e of group.filter((x) => !GRADEABLE.has(x.grade))) alone(e, e.source === 'maintainer' ? 'maintainer run' : 'community single sample');
    if (!gradeable.length) continue;
    const maintainer = gradeable.find((e) => e.source === 'maintainer');
    const community = gradeable.filter((e) => e.source === 'community');
    const people = [...new Set(community.map((e) => e.contributor.toLowerCase()))];
    const primary = maintainer || [...community].sort((a, b) => b.date.localeCompare(a.date))[0];
    const links = [primary, ...gradeable.filter((e) => e !== primary)].flatMap((e) => e.links);
    const date = gradeable.map((e) => e.date).sort().at(-1);
    let tag;
    if (maintainer && people.length >= 1) tag = 'confirmed (maintainer run + community)';
    else if (maintainer) tag = 'maintainer run';
    else if (people.length >= 2) tag = `confirmed (${people.length} independent submissions)`;
    else tag = 'community single sample';
    rows.push({
      ...primary, tag, date, links, submissions: people.length + (maintainer ? 1 : 0),
      contributors: [...new Map(community.map((e) => [e.contributor.toLowerCase(), e.contributor])).values()],
    });
  }
  return rows.sort((a, b) => a.host.localeCompare(b.host) || a.skill.localeCompare(b.skill) || a.model.localeCompare(b.model) || a.date.localeCompare(b.date));
}

const pct = (x) => (x == null ? '–' : `${Math.round(x * 100)}%`);
const ci = (c) => (c && c[0] != null ? `${Math.round(c[0] * 100)}–${Math.round(c[1] * 100)}%` : '–');
const esc = (s) => String(s).replace(/\|/g, '\\|');

function credit(row) {
  const names = row.contributors || (row.contributor ? [row.contributor] : []);
  const parts = names.map((n) => `[${n}](https://github.com/${n})`);
  if (row.source === 'maintainer') parts.unshift('maintainer');
  return parts.join(', ') || '–';
}

export function render({ rows, skipped = [], counts }) {
  const out = [];
  out.push('# Leaderboard', '',
    '<!-- Generated by scripts/build-leaderboard.mjs from step0/data/leaderboard-maintainer.json and submissions/. Do not edit by hand. -->', '',
    '**These are automated test results.** The questions were drafted by AI and not reviewed by hand. A row describes how one skill triggered on the host and model named in its table, at the pinned SKILL.md; it is not an overall judgement of the skill. Disagree with a result? Open an appeal (see "Appeals" in [CONTRIBUTING.md](CONTRIBUTING.md)).', '',
    `${counts.skills} skills, ${counts.rows} rows: ${counts.maintainer} from the maintainer's batches in \`step0/data/\`, ${counts.community} community submissions. Want a row filled in or confirmed? See "Submit your results" in the [README](README.md).`, '',
    '## How to read it', '',
    '- **One table per host.** Numbers are never averaged across hosts or models: a skill does not have one trigger rate, it has one per host and model.',
    '- **Grade** is the coarse trigger-layer rule: *well* = recall at least 80% and false positives at most 10%; *poorly* = recall under 50% or false positives over 25%; *fair* = in between; *insufficient data* = fewer than 10 trials on either side. Intervals are 95% Wilson intervals.',
    '- **Data quality**: *maintainer run* is the project\'s own run. *community single sample* is one submission, shown as received after format and hash checks. *confirmed* means two independent submissions (different GitHub accounts), or a maintainer run plus one community submission, landed on the same grade. *conflicting* means submissions for the same skill version, host and model gave different grades; all are shown, none is deleted.',
    '- **What a tag cannot mean.** The runner cannot prevent forgery, and CI checks only format, hashes and arithmetic. "Independent" means different accounts, nothing stronger, and several accounts can belong to one person. Treat *confirmed* as "more than one submission agrees", not as proof.',
    '- A row is for one pinned commit of the skill. A new commit starts a new row, so to confirm a row, test the commit its Skill link points to.', '');
  if (!counts.community) out.push('No community submissions yet. The first one will appear here after it is merged.', '');
  const hosts = [...new Set(rows.map((r) => r.host))].sort();
  for (const host of hosts) {
    out.push(`## ${HOSTS[host] || host}`, '',
      '| Skill | Model | Grade | Recall (95% CI) | False positives (95% CI) | Questions (pos / neg) | Data quality | Submissions | Last tested | Data | Credit |',
      '|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of rows.filter((x) => x.host === host)) {
      const link = `[${r.source === 'maintainer' ? 'batch report' : 'raw data'}](${r.links[0]})${r.links.length > 1 ? ` +${r.links.length - 1}` : ''}`;
      out.push(`| [${esc(r.skill)}](${r.repo}/tree/${r.commit}${r.subdir ? `/${r.subdir}` : ''}) | ${esc(r.model)} | ${GRADE_TEXT[r.grade] || r.grade} | ${pct(r.recall)} (${ci(r.recallCi)}) | ${pct(r.fpr)} (${ci(r.fprCi)}) | ${r.qPos} / ${r.qNeg} | ${r.tag} | ${r.submissions} | ${r.date} | ${link} | ${credit(r)} |`);
    }
    out.push('');
  }
  if (skipped.length) {
    out.push('## Left out', '', 'These submission directories failed the offline checks and are not shown:', '');
    for (const s of skipped) out.push(`- \`${s.dir}\`: ${esc(s.reason)}`);
    out.push('');
  }
  return `${out.join('\n')}`;
}

export function build(root) {
  const maintainer = maintainerEntries(root);
  const { entries: community, skipped } = submissionEntries(root);
  const rows = buildRows([...maintainer, ...community]);
  const counts = {
    rows: rows.length,
    maintainer: rows.filter((r) => r.source === 'maintainer').length,
    community: community.length,
    skills: new Set(rows.map((r) => `${r.repo}|${r.subdir}|${r.skill}`)).size,
  };
  return render({ rows, skipped, counts });
}

function main() {
  const root = path.resolve(process.argv.includes('--root') ? process.argv[process.argv.indexOf('--root') + 1] : '.');
  const text = build(root);
  const file = path.join(root, 'LEADERBOARD.md');
  if (process.argv.includes('--check')) {
    const have = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : '';
    if (have !== text) { process.stderr.write('LEADERBOARD.md is out of date: run `npm run leaderboard`\n'); process.exitCode = 1; }
    return;
  }
  fs.writeFileSync(file, text);
  process.stdout.write(`wrote ${file}\n`);
}

if (process.argv[1]?.endsWith('build-leaderboard.mjs')) main();
