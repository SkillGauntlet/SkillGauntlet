// Batch activation probe for Codex: every skill in the manifest, one fixed request, run once with the
// skill installed and once without. Records facts only.
//
// What this is not: a trigger rate. Codex's event stream has no skill item (see lib/codex.js), so the
// question "did the model choose the skill" cannot be answered from it. This compares what the agent
// did first and which files it produced, side by side. One pair per skill is a single sample: a
// difference between the two sides can be nothing but model randomness.
//
// Query rule (fixed, so the batch is reproducible): for each skill, the first query in
// step0/queries/<skill>/clause-1.json whose should_trigger is true.
//
// Skill source rule (same as step0/trigger_test.py): the manifest's repo at its pinned commit, shallow
// fetched into step0/.cache/<repo-slug>@<commit>. The cache is never committed.
//
//   node scripts/codex-probe-batch.mjs --plan                      list the runs, spend nothing
//   node scripts/codex-probe-batch.mjs --fetch                     fetch pinned sources, spend nothing
//   node scripts/codex-probe-batch.mjs --run --only tdd            spends Codex quota (needs --run)
//   node scripts/codex-probe-batch.mjs --report                    rebuild the tables from the records
//
// Options: --out <dir>  --manifest <file>  --only a,b  --model <id>  --effort <level>  --timeout <s>  --workers <n>
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCodexTrial } from '../lib/codex.js';
import { resolveBin } from '../lib/trial.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d = null) => { const i = args.indexOf(`--${n}`); return i >= 0 && i + 1 < args.length ? args[i + 1] : d; };

const today = new Date().toISOString().slice(0, 10);
const manifestPath = path.resolve(ROOT, opt('manifest', 'step0/skills.json'));
const outDir = path.resolve(ROOT, opt('out', `step0/data/${today}_codex_probe`));
const only = opt('only') ? opt('only').split(',').map((s) => s.trim()) : null;
const model = opt('model');
const effort = opt('effort');
const timeout = Number(opt('timeout', 300));
const workers = Math.max(1, Number(opt('workers', 2)));
const CACHE = path.join(ROOT, 'step0', '.cache');
const STOP_AFTER_FAILURES = 4;

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

// ---- selection ---------------------------------------------------------------------------------

function entries() {
  const spec = readJson(manifestPath);
  const all = Array.isArray(spec) ? spec : spec.skills;
  return only ? all.filter((e) => only.includes(e.name)) : all;
}

export function pickQuery(name) {
  const file = path.join(ROOT, 'step0', 'queries', name, 'clause-1.json');
  const raw = fs.readFileSync(file);
  const pack = JSON.parse(raw.toString('utf8'));
  const q = pack.queries.find((x) => x.should_trigger === true);
  if (!q) throw new Error(`${name}: no should_trigger query in clause-1.json`);
  return { set: 'clause-1', file: path.relative(ROOT, file).replace(/\\/g, '/'), fileSha256: sha256(raw), id: q.id, query: q.query, clause: q.clause || null };
}

// ---- fetching pinned sources (same slug rule as trigger_test.py resolve_skill) -----------------

function git(cwd, ...a) { return execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8' }).trim(); }

function resolveSource(entry) {
  const { repo, ref, subdir = '' } = entry;
  const slug = repo.split('://').pop().replace(/[^A-Za-z0-9_.-]/g, '_') + (ref ? `@${ref}` : '');
  const clone = path.join(CACHE, slug);
  // An interrupted fetch leaves a directory with no commit checked out; treat that as missing.
  let complete = false;
  try { complete = fs.existsSync(clone) && git(clone, 'rev-parse', 'HEAD').length === 40; } catch { /* incomplete */ }
  if (!complete) {
    fs.rmSync(clone, { recursive: true, force: true });
    fs.mkdirSync(clone, { recursive: true });
    if (/^[0-9a-f]{40}$/.test(ref || '')) {
      // shallow-fetch only the pinned commit
      git(clone, 'init', '--quiet');
      git(clone, 'remote', 'add', 'origin', repo);
      git(clone, 'fetch', '--quiet', '--depth', '1', 'origin', ref);
      git(clone, 'checkout', '--quiet', 'FETCH_HEAD');
    } else {
      fs.rmSync(clone, { recursive: true, force: true });
      execFileSync('git', ['clone', '--quiet', '--depth', '1', ...(ref ? ['--branch', ref] : []), repo, clone]);
    }
  }
  const commit = git(clone, 'rev-parse', 'HEAD');
  if (ref && /^[0-9a-f]{40}$/.test(ref) && commit !== ref) throw new Error(`${entry.name}: cache is at ${commit}, manifest pins ${ref}`);
  const dir = path.join(clone, subdir);
  const md = path.join(dir, 'SKILL.md');
  if (!fs.existsSync(md)) throw new Error(`${entry.name}: no SKILL.md at ${dir}`);
  return { dir, commit, repo, subdir, skillMdSha256: sha256(fs.readFileSync(md)) };
}

// ---- records -----------------------------------------------------------------------------------

const recordsFile = () => path.join(outDir, 'probe.jsonl');

function loadRecords() {
  if (!fs.existsSync(recordsFile())) return [];
  return fs.readFileSync(recordsFile(), 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
}

// A record counts as done only if the turn completed without errors; failed ones are retried on resume.
const isDone = (r) => r.completed === true && (!r.errors || r.errors.length === 0);
const lastBy = (records) => {
  const m = new Map();
  for (const r of records) m.set(`${r.skill}|${r.side}`, r);
  return m;
};

function failureReason(r) {
  if (r.eventCount === 0) return r.stderr ? `no events; stderr: ${r.stderr.trim().slice(-160)}` : 'no events';
  if (r.errors?.length) return r.errors.join(' | ').slice(0, 240);
  if (!r.completed) return r.latencyMs >= timeout * 1000 - 2000 ? `timed out after ${timeout}s` : 'turn did not complete';
  return '';
}

// ---- running -----------------------------------------------------------------------------------

async function runSide(src, entry, q, side, codexBin, ctx) {
  const rec = await runCodexTrial({
    bin: codexBin,
    skillDir: side === 'with' ? src.dir : null,
    skillName: entry.name,
    query: q.query,
    model,
    reasoningEffort: effort,
    sandbox: 'workspace-write',
    timeout,
    keepRaw: true,
    ignoreUserConfig: true,
  });
  const rawName = `${entry.name}.${side}.events.jsonl`;
  fs.mkdirSync(path.join(outDir, 'raw'), { recursive: true });
  fs.writeFileSync(path.join(outDir, 'raw', rawName), rec.rawJsonl || '');
  delete rec.rawJsonl;
  const skillCmds = rec.commands.filter((c) => /SKILL\.md|\.agents[\\/]+skills/i.test(c)).length;
  const full = {
    skill: entry.name, side, set: q.set, queryId: q.id, query: q.query,
    skillCommit: src.commit, skillMdSha256: src.skillMdSha256,
    codexVersion: ctx.codexVersion, model: model || 'codex default (--ignore-user-config)',
    reasoningEffort: effort || 'codex default',
    commandsMentioningSkillFiles: side === 'with' ? skillCmds : null,
    rawFile: `raw/${rawName}`,
    at: new Date().toISOString(),
    ...rec,
  };
  fs.appendFileSync(recordsFile(), JSON.stringify(full) + '\n');
  return full;
}

async function runBatch(list) {
  fs.mkdirSync(outDir, { recursive: true });
  const codexBin = resolveBin('codex');
  let ver = 'unknown';
  try { ver = execFileSync(codexBin, ['--version'], { encoding: 'utf8', shell: /\.(cmd|bat)$/i.test(codexBin) }).trim(); } catch { /* recorded as unknown */ }
  const ctx = { codexVersion: ver };
  const done = lastBy(loadRecords());
  const jobs = [];
  for (const { entry, src, q } of list) {
    for (const side of ['with', 'without']) {
      const prev = done.get(`${entry.name}|${side}`);
      if (prev && isDone(prev)) continue;
      jobs.push({ entry, src, q, side });
    }
  }
  console.log(`${jobs.length} run(s) to do (${list.length * 2 - jobs.length} already complete)`);
  let streak = 0; let stopped = false; let ran = 0;
  const queue = [...jobs];
  const worker = async () => {
    while (queue.length && !stopped) {
      const j = queue.shift();
      const r = await runSide(j.src, j.entry, j.q, j.side, codexBin, ctx);
      ran += 1;
      const ok = isDone(r);
      streak = ok ? 0 : streak + 1;
      console.log(`[${ran}/${jobs.length}] ${j.entry.name} ${j.side}: ${ok ? 'ok' : 'FAILED: ' + failureReason(r)}`);
      if (streak >= STOP_AFTER_FAILURES) { stopped = true; console.log(`stopping after ${streak} consecutive failures; rerun the same command to resume`); }
    }
  };
  await Promise.all(Array.from({ length: workers }, worker));
  return !stopped;
}

// ---- report ------------------------------------------------------------------------------------

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const clip = (s, n = 90) => { const t = String(s ?? ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
// The shell wrapper path is the same on every row and only crowds the table.
const bare = (d) => String(d).replace(/^"?[^"]*pwsh\.exe"?\s+-NoProfile\s+-Command\s+/i, 'pwsh: ');
const act = (r) => (r.firstAction ? `${r.firstAction.kind}: ${clip(bare(r.firstAction.detail), 70)}` : '(no action)');
const files = (r) => (r.createdFiles.length ? r.createdFiles.join(', ') : '(none)');

function buildReport(allEntries) {
  const m = lastBy(loadRecords());
  const rows = [];
  for (const e of allEntries) {
    const w = m.get(`${e.name}|with`); const wo = m.get(`${e.name}|without`);
    if (w || wo) rows.push({ name: e.name, w, wo });
  }
  const pairs = rows.filter((r) => r.w && r.wo);
  const okPair = (r) => r.w && r.wo && isDone(r.w) && isDone(r.wo);
  const valid = pairs.filter(okPair);
  const allRuns = rows.flatMap((r) => [r.w, r.wo]).filter(Boolean);
  const failed = allRuns.filter((r) => !isDone(r));
  const sameKind = valid.filter((r) => r.w.firstAction?.kind === r.wo.firstAction?.kind).length;
  const sameFiles = valid.filter((r) => JSON.stringify(r.w.createdFiles) === JSON.stringify(r.wo.createdFiles)).length;
  const noFilesBoth = valid.filter((r) => !r.w.createdFiles.length && !r.wo.createdFiles.length).length;
  const mentioned = valid.filter((r) => (r.w.commandsMentioningSkillFiles || 0) > 0).length;
  const first = allRuns[0];

  const L = [];
  L.push('# Codex activation probe: 18 skills, each run once with and once without the skill');
  L.push('');
  L.push('**Status: final.** This batch lists facts from single runs and rates no skill; there is nothing to grade.');
  L.push('Layer 0 (static) results do not depend on the host and are referenced below.');
  L.push('');
  L.push('## What this batch is and is not');
  L.push('');
  L.push('- Codex\'s event stream has no skill item, so whether a skill was used cannot be read from it.');
  L.push('  This batch therefore reports **no trigger measurement and no verdict** for Codex.');
  L.push('- For each skill the same request was run twice in an empty workspace: once with the skill');
  L.push('  installed at `.agents/skills/<skill>` and once with nothing installed. The tables below show the');
  L.push('  first action and the files each side produced.');
  L.push('- Each side was run **once**. The model is not deterministic, so a difference between the two sides of');
  L.push('  a pair can be nothing but run-to-run randomness; so can the absence of one. No pair here is');
  L.push('  evidence that a skill changed the behavior.');
  L.push('');
  L.push('## Method (fixed, reproducible)');
  L.push('');
  L.push('- Request per skill: the first query with `should_trigger: true` in `step0/queries/<skill>/clause-1.json`.');
  L.push('- Skill source: the commit pinned in `step0/skills.json`, shallow-fetched into `step0/.cache/` (not committed).');
  L.push('  Only the skill itself is installed; sibling skills in a family are not (so lark-doc runs without lark-drive/lark-shared).');
  L.push('- `codex exec --json --ignore-user-config --approve-for-me`, fresh temporary directory per run, `--skip-git-repo-check`.');
  L.push(`- Codex: ${first?.codexVersion || 'unknown'}; model: ${first?.model || 'unknown'}; reasoning effort: ${first?.reasoningEffort || 'unknown'}; timeout ${timeout}s per run.`);
  L.push('- A run counts as complete if the turn completed with no error. First action = first command, tool call or file change;');
  L.push('  created files = filesystem diff of the workspace (excluding `.agents`).');
  L.push('- Records were edited in two ways before publishing: command output longer than 8,000 characters is cut with a marker (one agent listed the whole OS temp folder), and the local user name is replaced by `<user>`.');
  L.push(`- Regenerate the tables: \`node scripts/codex-probe-batch.mjs --report --out ${path.relative(ROOT, outDir).split(path.sep).join('/')}\`.`);
  L.push('');
  L.push('## Runs');
  L.push('');
  L.push(`- Runs recorded: ${allRuns.length} of ${allEntries.length * 2}; complete: ${allRuns.length - failed.length}; failed: ${failed.length}.`);
  L.push(`- Pairs with both sides complete: ${valid.length}.`);
  L.push('- One run (agent-browser, skill installed) did not return within its timeout: the agent started a browser daemon that kept the output pipe open, and the batch script had no way to give up. That run was stopped by hand and repeated once; only the repeat is in `probe.jsonl`. The script now gives up on its own.');
  if (failed.length) {
    L.push('');
    L.push('| skill | side | reason |');
    L.push('|---|---|---|');
    for (const r of failed) L.push(`| ${r.skill} | ${r.side} | ${cell(failureReason(r) || 'unknown')} |`);
  }
  L.push('');
  L.push('## Facts across complete pairs');
  L.push('');
  L.push(`- First action of the same kind (command / file change / ...) on both sides: ${sameKind} of ${valid.length}.`);
  L.push(`- Identical set of created file names on both sides: ${sameFiles} of ${valid.length} (${noFilesBoth} of those created no file on either side).`);
  L.push(`- Skill-installed side ran at least one command whose text mentions \`SKILL.md\` or the skills directory: ${mentioned} of ${valid.length}.`);
  L.push('');
  L.push('Command strings from two runs of the same request are never identical, so the kind of the first action is');
  L.push('the only comparison made automatically; everything else is shown for the reader to judge.');
  L.push('');
  L.push('## Per skill');
  L.push('');
  L.push('| skill | request | first action, skill installed | first action, none installed | files, skill installed | files, none installed | skill files mentioned in commands |');
  L.push('|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const q = (r.w || r.wo);
    L.push(`| ${r.name} | ${cell(q.queryId)}: ${cell(clip(q.query, 80))} | ${r.w ? cell(isDone(r.w) ? act(r.w) : 'FAILED') : '-'} | ${r.wo ? cell(isDone(r.wo) ? act(r.wo) : 'FAILED') : '-'} `
      + `| ${r.w && isDone(r.w) ? cell(files(r.w)) : '-'} | ${r.wo && isDone(r.wo) ? cell(files(r.wo)) : '-'} | ${r.w ? (r.w.commandsMentioningSkillFiles ?? '-') : '-'} |`);
  }
  L.push('');
  L.push('Final messages, token counts and the unparsed event streams are in `probe.jsonl` and `raw/`.');
  L.push('');
  L.push('## Layer 0 (static)');
  L.push('');
  L.push('Static checks read the skill files only, so they do not depend on the host. See `static/SUMMARY.md`');
  L.push('in this directory (regenerated from the same pinned commits, no model calls).');
  L.push('');
  L.push('## Limits');
  L.push('');
  L.push('- One run per side per skill; no repetition, so run-to-run variation is not measured.');
  L.push('- One request per skill; the choice follows a fixed rule rather than being tuned to the skill.');
  L.push('- Empty workspace: requests that assume an existing project (a bug to diagnose, a repo to review) get no such context on either side.');
  L.push('- The workspace-write sandbox has no network, so requests that need one end differently from a normal session on both sides.');
  L.push('- Codex only: nothing here is comparable with the Claude Code results in `2026-10-28_all_haiku`.');
  L.push('');
  fs.writeFileSync(path.join(outDir, 'BATCH.md'), L.join('\n'));

  const json = rows.map((r) => ({
    skill: r.name,
    request: (r.w || r.wo)?.query,
    with: r.w && { complete: isDone(r.w), firstAction: r.w.firstAction, createdFiles: r.w.createdFiles, commands: r.w.commands, finalMessage: r.w.finalMessage, tokenUsage: r.w.tokenUsage, errors: r.w.errors },
    without: r.wo && { complete: isDone(r.wo), firstAction: r.wo.firstAction, createdFiles: r.wo.createdFiles, commands: r.wo.commands, finalMessage: r.wo.finalMessage, tokenUsage: r.wo.tokenUsage, errors: r.wo.errors },
  }));
  fs.writeFileSync(path.join(outDir, 'comparison.json'), JSON.stringify(json, null, 2) + '\n');
  console.log(`wrote ${path.relative(ROOT, path.join(outDir, 'BATCH.md'))} and comparison.json (${allRuns.length} runs, ${failed.length} failed)`);
}

// ---- scrub -------------------------------------------------------------------------------------
// Records are published, and an agent may list directories outside its workspace (one run dumped the
// whole OS temp folder, about 1 MB of unrelated local names). Two edits, both stated in BATCH.md:
// command output over OUTPUT_CAP characters is cut with a marker, and the local user name becomes <user>.
const OUTPUT_CAP = 8000;
const CUT_MARK = '\n[cut by codex-probe-batch --scrub: ';

function scrubText(text) {
  // The profile folder name is what appears in paths; it need not equal the login name.
  const names = new Set([path.basename(os.homedir()), process.env.USERNAME, process.env.USER].filter((n) => n && n.length > 2));
  return [...names].reduce((t, n) => t.split(n).join('<user>'), text);
}

function scrubStream(raw) {
  const out = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let o;
    try { o = JSON.parse(line); } catch { out.push(line); continue; }
    const it = o.item;
    // --report scrubs again on every rebuild, so an output that already carries the marker is left alone;
    // cutting it a second time would lose more text and overwrite the original length.
    if (it && typeof it.aggregated_output === 'string' && it.aggregated_output.length > OUTPUT_CAP
      && !it.aggregated_output.includes(CUT_MARK)) {
      const n = it.aggregated_output.length;
      it.aggregated_output = `${it.aggregated_output.slice(0, OUTPUT_CAP)}${CUT_MARK}${n} characters in total]`;
    }
    out.push(JSON.stringify(o));
  }
  return out.join('\n') + '\n';
}

function scrubAll() {
  const rawDir = path.join(outDir, 'raw');
  for (const f of fs.existsSync(rawDir) ? fs.readdirSync(rawDir) : []) {
    const p = path.join(rawDir, f);
    fs.writeFileSync(p, scrubText(scrubStream(fs.readFileSync(p, 'utf8'))));
  }
  for (const f of ['probe.jsonl', 'comparison.json', 'BATCH.md']) {
    const p = path.join(outDir, f);
    if (fs.existsSync(p)) fs.writeFileSync(p, scrubText(fs.readFileSync(p, 'utf8')));
  }
  console.log('scrubbed records in', path.relative(ROOT, outDir));
}

// ---- main --------------------------------------------------------------------------------------

const list = entries().map((entry) => ({ entry, q: pickQuery(entry.name) }));

if (flag('plan')) {
  for (const { entry, q } of list) console.log(`${entry.name.padEnd(30)} ${q.set}/${q.id}  ${q.query.slice(0, 100)}`);
  console.log(`\n${list.length} skills x 2 = ${list.length * 2} Codex runs (not started)`);
} else if (flag('fetch')) {
  for (const { entry } of list) { const s = resolveSource(entry); console.log(`${entry.name.padEnd(30)} ${s.commit.slice(0, 12)}`); }
} else if (flag('scrub')) {
  scrubAll();
} else if (flag('report')) {
  buildReport(entries());
  scrubAll();
} else if (flag('run')) {
  const withSrc = list.map((x) => ({ ...x, src: resolveSource(x.entry) }));
  const ok = await runBatch(withSrc);
  buildReport(entries());
  scrubAll();
  process.exit(ok ? 0 : 3);
} else {
  console.error('choose one of --plan, --fetch, --run, --report, --scrub (only --run spends Codex quota)');
  process.exit(2);
}
