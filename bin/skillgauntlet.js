#!/usr/bin/env node
// SkillGauntlet CLI. Two ways in:
//   npx skillgauntlet                 interactive: language first, then arrow keys / y / n / enter
//   npx skillgauntlet static <dir>    one skill, layer 0 only, no model calls
import fs from 'node:fs';
import path from 'node:path';
import { analyze } from '../lib/static.js';
import { staticMarkdown, trialSection, gainSection, probeSection, scorecard } from '../lib/report.js';
import { findSkills, resolveSpec, skillNameOf } from '../lib/discover.js';
import { installedSkills } from '../lib/installed.js';
import { probeActivation } from '../lib/codex.js';
import { fingerprint, cacheFileFor, readCachedQueries, writeCachedQueries } from '../lib/queries.js';
import { openRun, querySetHash, readRun, readAnswers, validRecords } from '../lib/runs.js';
import { DEPTHS, minutesFor } from '../lib/depth.js';
import { ask, choose, select, confirm, say, closeUi, hasTerminal, setBack, Back } from '../lib/ui.js';
import { hostModels, unknownModel, codebuddyCatalog } from '../lib/models.js';
import { browseDir } from '../lib/browse.js';
import { withTicker } from '../lib/ticker.js';
import { renderResult } from '../lib/chart.js';
import { makeProgress } from '../lib/progress.js';
import { setLang, detectLang, errorText, t } from '../lib/i18n.js';
import { resolveBin, backend, backendFor, usesOwnDeepseek, setNativeModels, HOSTS, checkModel, draftQueries, draftQuality, runTrial, requireHost, pingHost, setHostBin, binInstalled } from '../lib/trial.js';
import { HOST_CLI, searchHost, installCommand, installHost } from '../lib/findhost.js';
import { runGain } from '../lib/gain.js';
import { ERROR_STREAK_STOP, executeTrials, finishRun, resumeRun } from '../lib/execute.js';
import { cmdSubmit } from '../lib/submit.js';
import { gitFacts } from '../lib/submission.js';
import { checkForUpdate, declineUpdate, currentVersion, isCheckout } from '../lib/update.js';
import { spawnSync as runSync, execSync } from 'node:child_process';

function relLabel(root, dir) {
  const rel = path.relative(root, dir).replace(/\\/g, '/');
  return rel || path.basename(dir);
}

function parseSource(input) {
  let s = String(input).trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '');
  s = s.replace(/^\/+|\/+$/g, '');
  const parts = s.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  return { repo: `${parts[0]}/${parts[1]}`, hint: parts.slice(2).join('/') || null };
}

function writeOut(skillDir, name, md, sc) {
  const out = path.join(skillDir, '.skillgauntlet');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, `${name}.md`), md);
  fs.writeFileSync(path.join(out, `${name}.scorecard.json`), `${JSON.stringify(sc, null, 2)}\n`);
  return out;
}

// The host CLI is not on PATH. Look for it elsewhere on the machine, offer to install it where an installer
// exists, and otherwise let the user pick another host. True when the host can now be used.
async function fixMissingHost(hostId, err) {
  const { bin } = HOST_CLI[hostId];
  const label = err.vars?.host || hostId;
  say(`\n${t('hostNotOnPath', { host: label })}`);
  const options = withTicker(waitText(t('waitSearch', { host: label }), { slowAfter: 600 }), () => searchHost(hostId)).slice(0, 3).map((f) => ({ label: t('hostUseFound', { path: f }), value: { use: f } }));
  const cmd = installCommand(hostId);
  if (cmd) options.push({ label: t('hostInstallNow', { cmd }), value: { install: true } });
  else say(t(err.howKey));
  options.push({ label: t('hostOther'), value: { other: true } });

  const pick = await select(t('hostFixQ'), options, 0);
  if (pick.use) {
    setHostBin(bin, pick.use);
    say(`  ${pick.use}`);
    return true;
  }
  if (pick.install) {
    say(`\n${t('hostInstalling', { host: label })}`);
    try { installHost(hostId); } catch (e) {
      say(t('hostInstallFailed', { why: e.message }));
      return false;
    }
    if (binInstalled(bin)) return true;
    const again = searchHost(hostId)[0]; // npm's folder may not be on this process's PATH yet
    if (again) { setHostBin(bin, again); return true; }
    say(t('hostStillMissing', { host: label }));
  }
  return false;
}

let approvedFollowing = false; // the user said not to ask again for the remaining skills

async function approveTrials({ q, runs, n }) {
  if (approvedFollowing) return true;
  const pick = await choose(t('trialsQ', { q, runs, n, minutes: minutesFor(n) }), [
    { label: t('trialsGo'), value: 'go' },
    { label: t('trialsAll'), value: 'all' },
    { label: t('trialsSkip'), value: 'skip' },
  ], 1);
  if (pick === 'all') approvedFollowing = true;
  return pick !== 'skip';
}

const hostChecked = new Set();
const finishedRuns = []; // run directories of complete runs, offered for contribution at the end
const remoteSource = new Map(); // skill directory -> the public repository, commit and subfolder it was cloned from

// The arguments `submit` needs for a run. A skill cloned from GitHub in this session already has its repository,
// commit and subfolder, so the user is not asked for them; other skills are looked up from their own git checkout.
function submitArgs(runDir) {
  const skillDir = path.resolve(runDir, '..', '..', '..');
  const src = remoteSource.get(skillDir);
  return src ? [runDir, '--repo', src.repo, '--commit', src.commit, ...(src.subdir ? ['--subdir', src.subdir] : [])] : [runDir];
}

// Whether the public repository and commit of a run's skill can be told at all.
function canSubmit(runDir) {
  const skillDir = path.resolve(runDir, '..', '..', '..');
  if (remoteSource.has(skillDir)) return true;
  const f = gitFacts(skillDir);
  return Boolean(f.repo && f.commit);
}

const quoteArg = (a) => (/[\s"]/.test(a) ? `"${a}"` : a);
const waitText = (label, extra = {}) => ({ label, elapsed: t('waitElapsed'), abortHint: t('waitAbort'), ...extra });

// Asking a host CLI for its models takes a few seconds (CodeBuddy about three), so it shows a wait line and is
// remembered for the rest of the run.
const modelCache = new Map();

// A typed model the host does not list: say so now, while nothing has been spent, and ask again.
function notListed(model, known, label) {
  const list = unknownModel(model, known);
  if (!list) return false;
  say(`\n${t('modelUnknown', { model, host: label, list: list.slice(0, 8).join(', ') })}`);
  return true;
}
// Models in CodeBuddy's cached catalog that its --help does not list for this account right now.
function catalogOnly(host) {
  if (host !== 'codebuddy') return [];
  const listed = new Set(modelsOf('codebuddy', 'CodeBuddy'));
  return codebuddyCatalog().filter((m) => !listed.has(m) && !m.startsWith('custom-local:'));
}

function modelsOf(host, label) {
  if (!modelCache.has(host)) {
    const list = withTicker(waitText(t('waitModels', { host: label }), { slowAfter: 600 }), () => hostModels(host, resolveBin(host)));
    setNativeModels(host, list);
    modelCache.set(host, list);
  }
  return modelCache.get(host);
}
const HOST_LABEL = { 'claude-code': 'Claude Code', codebuddy: 'CodeBuddy', codewhale: 'Codewhale' };

async function runTriggerLayer({ skillDir, skillName, depth, model, host = 'claude-code' }) {
  requireHost(host);
  const bin = resolveBin(HOSTS[host].bin);
  if (!hostChecked.has(host)) {
    withTicker(waitText(t('hostPing', { host: HOST_LABEL[host] || host })), () => pingHost(host, { bin, model }));
    hostChecked.add(host);
  }
  const cacheFile = cacheFileFor(skillDir, depth);
  const want = { perClause: depth.perClause, negatives: depth.negatives, skillFingerprint: fingerprint(skillDir) };

  let qs = readCachedQueries(cacheFile, want);
  const reused = Boolean(qs);
  if (qs) {
    say(`  ${t('queriesReused', { n: qs.queries.length, file: path.basename(cacheFile) })}`);
  } else {
    qs = withTicker(waitText(t('drafting')), () => draftQueries({ bin, skillDir, skillName, model, perClause: depth.perClause, negatives: depth.negatives, host }));
    say(`  ${t('drafted', { q: qs.queries.length, c: qs.clauses.length })}`);
    writeCachedQueries(cacheFile, {
      schema: 'skillgauntlet/queries/1',
      skill: skillName,
      skillFingerprint: want.skillFingerprint,
      perClause: depth.perClause,
      negatives: depth.negatives,
      model,
      draftedAt: new Date().toISOString(),
      clauses: qs.clauses,
      queries: qs.queries,
    });
  }
  // Reported either way: a set whose negatives borrow nothing measures nothing, whether it was just
  // drafted or read from the cache.
  const quality = draftQuality(qs.queries);
  if (quality.weak) say(`  ${t('weakNegatives', { weak: quality.weak, total: quality.total })}`);
  else say(`  ${t('negativesChecked', { n: quality.total })}`);

  const trials = [];
  for (const q of qs.queries) for (let i = 0; i < depth.runs; i += 1) trials.push({ q, i });

  // The number of trials is only known now that the questions exist, so this is where the user agrees to it.
  if (!(await approveTrials({ q: qs.queries.length, runs: depth.runs, n: trials.length }))) {
    say(`  ${t('trialsDeclined')}`);
    return null;
  }

  // Opened before the first trial: an interrupted run keeps its conditions and every finished record,
  // which is what makes a later recompute or comparison possible without paying again.
  const run = openRun({
    skillDir,
    skillName,
    host,
    backend: backendFor(host, model),
    model,
    runs: depth.runs,
    maxExplore: depth.maxExplore,
    depth: { id: depth.id, perClause: depth.perClause, negatives: depth.negatives },
    skillFingerprint: want.skillFingerprint,
    querySets: [{
      id: 'main',
      source: reused ? 'cache' : 'drafted',
      file: path.basename(cacheFile),
      queries: qs.queries.length,
      clauses: qs.clauses.length,
      sha256: querySetHash(qs.queries),
      negativesQuality: { total: quality.total, weak: quality.weak },
    }],
    queries: { schema: 'skillgauntlet/queries/1', queries: qs.queries },
  });

  const prog = progress(trials.length);
  try {
    const outcome = await executeTrials({
      run,
      trials,
      doTrial: ({ q }) => runTrial({ bin, skillDir, skillName, query: q.query, model, maxExplore: depth.maxExplore, host }),
      onTrial: prog,
    });
    prog.finish();
    const result = finishRun(run, { model, backend: backendFor(host, model), host, runs: depth.runs, expected: trials.length }, outcome.stopped);
    say(`  ${t('runSaved', { path: run.dir })}`);
    if (outcome.stopped) reportStopped(outcome.stopped, run.dir, model);
    else if (result?.incomplete) reportIncomplete(result.incomplete, run.dir, model);
    else finishedRuns.push(run.dir);
    return result && { ...result, runDir: run.dir, queries: qs.queries };
  } catch (err) {
    prog.finish();
    run.close(null, { interrupted: true });
    throw err;
  }
}

// The probe is two Codex runs on quota that cannot be read back, so its records are archived in the same
// run format as a trigger run: the report is a rendering of them and cannot be rebuilt without them.
function archiveProbe({ skillDir, skillName, model, probe }) {
  const run = openRun({
    skillDir,
    skillName,
    host: 'codex',
    backend: 'codex',
    model,
    runs: 1,
    maxExplore: 0,
    depth: { id: 'probe' },
    querySets: [{ id: 'probe', queries: 1 }],
    skillFingerprint: fingerprint(skillDir),
  });
  run.patch({ invocation: probe.withSkill.invocation });
  run.append({ queryId: 'probe', run: 0, side: 'with-skill', ...probe.withSkill });
  run.append({ queryId: 'probe', run: 0, side: 'without-skill', ...probe.without });
  run.close({
    probe: true,
    actionKindIdentical: probe.actionKindIdentical,
    artifactsIdentical: probe.artifactsIdentical,
  });
  say(`  ${t('runSaved', { path: run.dir })}`);
}

const progress = makeProgress;

function reportIncomplete(n, dir, model) {
  say(`
  ${t('runIncomplete', { n })}`);
  say(`  ${t('resumeWith', { cmd: `npx skillgauntlet resume "${dir}"${model ? ` --model ${model}` : ''}` })}`);
}

function reportStopped(reason, dir, model) {
  say(`
  ${t('runStopped', { n: ERROR_STREAK_STOP, reason })}`);
  say(`  ${t('resumeWith', { cmd: `npx skillgauntlet resume "${dir}"${model ? ` --model ${model}` : ''}` })}`);
  process.exitCode = 3;
}

// Continue a run directory. Flags that are given must equal what the run used; flags left out are taken
// from the run, so `resume <dir>` alone is enough.
async function cmdResume(args) {
  const withValue = new Set(['--model', '--runs', '--max-explore']);
  const dir = args.find((a, i) => !a.startsWith('--') && !withValue.has(args[i - 1]));
  if (!dir) throw new Error(t('resumeUsage'));
  const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const full = path.resolve(dir);
  const runMeta = JSON.parse(fs.readFileSync(path.join(full, 'meta.json'), 'utf8'));
  const runHost = runMeta.host || 'claude-code';
  requireHost(runHost);
  const resumeProgress = progress();
  const result = await resumeRun({
    dir: full,
    bin: resolveBin((HOSTS[runHost] || HOSTS['claude-code']).bin),
    want: { model: flag('--model'), runs: flag('--runs'), maxExplore: flag('--max-explore'), backend: backendFor(runHost, flag('--model') ?? runMeta.model) },
    onTrial: resumeProgress,
  });
  resumeProgress.finish();
  if (result.nothing) {
    say(t('resumeNothing'));
    return;
  }
  say(`  ${t('runSaved', { path: full })}`);
  if (result.stopped) reportStopped(result.stopped, full, result.meta.model);
  else if (result.result?.incomplete) reportIncomplete(result.result.incomplete, full, result.meta.model);
  else say(`  ${t('resumeDone', { n: result.done })}`);
}

async function pickInstalled() {
  const list = installedSkills();
  if (!list.length) {
    say(`\n${t('noInstalled')}`);
    return [];
  }
  say(`\n${t('foundInstalled', { n: list.length })}`);
  const scope = await choose(t('scopeQ'), [
    { label: t('scopeAll'), hint: t('scopeAllHint', { n: list.length }), value: 'all' },
    { label: t('scopeOne'), hint: t('scopeOneHint'), value: 'one' },
  ], 2);
  if (scope === 'all') return list.map((s) => ({ name: s.name, dir: s.dir, root: s.root }));
  const name = await select(t('pickOneQ'), list.map((s) => ({ label: s.name, hint: path.basename(s.root), value: s.name })), 0);
  const hit = list.find((s) => s.name === name);
  return hit ? [{ name: hit.name, dir: hit.dir, root: hit.root }] : [];
}

// A model for hosts that have an account default: pick it, a known name, or type one. Returns null for the default.
async function pickModel(known = [], more = []) {
  if (!hasTerminal()) return (await ask(t('modelOptionalQ'), '')).trim() || null;
  const other = '\u0000other';
  // `known` is what the account can use now; `more` is in the host's catalog but not promised to the account
  const v = await select(t('modelQ'), [
    { label: t('modelDefault'), value: '' },
    ...known.map((m) => ({ label: m, hint: more.length ? t('modelAccountHint') : '', value: m })),
    ...more.map((m) => ({ label: m, hint: t('modelCatalogHint'), value: m })),
    { label: t('modelOther'), value: other },
  ], 0);
  if (v === other) return (await ask(t('modelOptionalQ'), '')).trim() || null;
  return v || null;
}

async function pickRemote() {
  for (;;) {
    const raw = await ask(t('askRepo'));
    const parsed = parseSource(raw);
    if (!parsed) {
      say(`  ${t('needRepo')}`);
      continue;
    }
    let resolved;
    try {
      resolved = withTicker(waitText(t('waitCloning'), { slowAfter: 600 }), () => resolveSpec(parsed.repo));
    } catch (err) {
      say(`  ${errorText(err)}`);
      continue;
    }
    const found = findSkills(resolved.dir);
    for (const d of found) {
      remoteSource.set(path.resolve(d), { repo: resolved.source.repo, commit: resolved.source.commit, subdir: path.relative(resolved.dir, d).replace(/\\/g, '/') });
    }
    if (!found.length) {
      say(`  ${t('noSkill')}`);
      return [];
    }
    if (parsed.hint) {
      const hit = found.find((d) => relLabel(resolved.dir, d) === parsed.hint || d.replace(/\\/g, '/').endsWith(`/${parsed.hint}`));
      if (hit) return [{ name: path.basename(hit), dir: hit, root: resolved.dir }];
      say(`  ${t('notFoundNamed', { name: parsed.hint, list: found.map((d) => relLabel(resolved.dir, d)).slice(0, 8).join(', ') })}`);
      return [];
    }
    if (found.length === 1) return [{ name: path.basename(found[0]), dir: found[0], root: resolved.dir }];
    say(`\n${t('multiFound', { n: found.length })}`);
    return pickAmong(found, resolved.dir);
  }
}

// Several skills in one place: all of them, or one picked from the full list.
async function pickAmong(found, root) {
  const scope = await choose(t('scopeQ'), [
    { label: t('scopeAll'), hint: t('scopeAllHint', { n: found.length }), value: 'all' },
    { label: t('scopeOne'), hint: t('scopeOneHint'), value: 'one' },
  ], 2);
  if (scope === 'all') return found.map((d) => ({ name: path.basename(d), dir: d, root }));
  const dir = await select(t('pickOneQ'), found.map((d) => ({ label: relLabel(root, d), value: d })), 0);
  return [{ name: path.basename(dir), dir, root }];
}

// Before the questions: is there a newer published version? The user chooses; if the update cannot be fetched or
// does not run, the session carries on with the version that is already running.
async function offerUpdate() {
  if (!hasTerminal() || (isCheckout() && !process.env.SG_FORCE_UPDATE_CHECK)) return; // a checkout is not nagged unless asked
  const found = await checkForUpdate();
  if (!found) return;
  say(`\n${t('updateAvail', found)}`);
  const pick = await choose(t('updateQ'), [
    { label: t('updateNow'), value: 'now' },
    { label: t('updateSkip'), value: 'skip' },
  ], 1);
  if (pick !== 'now') {
    declineUpdate(found.latest);
    return;
  }
  const spec = `skillgauntlet@${found.latest}`;
  const env = { ...process.env, SG_NO_UPDATE_CHECK: '1' };
  try {
    // fetch it first and check it answers as the version asked for, so a failed download never costs the session
    const said = withTicker(waitText(t('updating', found), { slowAfter: 600 }), () => execSync(`npx -y ${spec} --version`, { encoding: 'utf8', timeout: 180000, windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'] }));
    if (String(said).trim() !== found.latest) throw new Error(`it reported ${String(said).trim() || 'nothing'}`);
  } catch (err) {
    // npm's own words when it gave any ("... is not in this registry"), else the error's first line
    const lines = String(err.stderr || err.message).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const why = (lines.find((l) => /no matching version|not in this registry|404/i.test(l)) || lines.find((l) => /error|ERR/.test(l)) || lines[0] || 'unknown')
      .replace(/^npm error\s*(notarget\s*)?/i, '').replace(/[.。]+$/, '');
    say(t('updateFailed', { why: why.slice(0, 160), current: found.current }));
    return;
  }
  closeUi();
  const r = runSync(`npx -y ${spec}`, process.argv.slice(2), { stdio: 'inherit', env, shell: true });
  process.exit(r.status ?? 0);
}

async function interactive() {
  const langChoice = await select(`${t('langTitle')}`, [
    { label: t('langZh'), value: 'zh' },
    { label: t('langEn'), value: 'en' },
    { label: t('langJa'), value: 'ja' },
  ], 0);
  setLang(langChoice);
  await offerUpdate();

  say('');
  say(t('title'));
  say(t('rule'));

  setBack(true);

  // The questions run as steps so ← or Esc can return to the previous one (a step that ends the run returns END).
  const END = Symbol('end');
  const AGAIN = Symbol('again');
  const S = { targets: [], host: null, depth: null, model: null, wantProbe: false };

  const sourceStep = async () => {
    say(`\n${t('sourceNote')}`);
    const source = await choose(t('sourceQ'), [
      { label: t('srcInstalled'), hint: t('srcInstalledHint'), value: 'installed' },
      { label: t('srcPath'), value: 'path' },
      { label: t('srcRepo'), hint: t('srcRepoHint'), value: 'repo' },
    ], 1);

    let targets = [];
    if (source === 'installed') targets = await pickInstalled();
    else if (source === 'path') {
      // Arrow keys walk the folders; typing a path stays available as the last entry (and is all a pipe has).
      const browsed = hasTerminal() ? await browseDir((a, b, c) => select(a, b, c, { clear: true })) : null;
      if (browsed) say(`  ${browsed}`);
      const root = path.resolve(browsed ?? await ask(t('srcPath')));
      const found = findSkills(root);
      if (!found.length) say(`\n${t('noSkill')}`);
      else if (found.length === 1) targets = [{ name: path.basename(found[0]), dir: found[0], root }];
      else {
        say(`\n${t('multiFound', { n: found.length })}`);
        targets = await pickAmong(found, root);
      }
    } else targets = await pickRemote();
    if (!targets.length) return hasTerminal() ? AGAIN : END;
    S.targets = targets.map((tg) => ({ ...tg, name: skillNameOf(tg.dir) }));
    return null;
  };

  const hostStep = async () => {
    S.host = await choose(t('hostQ'), [
      { label: t('hostClaude'), hint: t('hostClaudeHint'), value: 'claude' },
      { label: t('hostCodebuddy'), hint: t('hostCodebuddyHint'), value: 'codebuddy' },
      { label: t('hostCodewhale'), hint: t('hostCodewhaleHint'), value: 'codewhale' },
      { label: t('hostCodex'), hint: t('hostCodexHint'), value: 'codex' },
    ], 1);

    // Look for the host CLI before any question about depth or model: a missing one ends the run here, for free.
    const hostId = { claude: 'claude-code', codebuddy: 'codebuddy', codewhale: 'codewhale' }[S.host];
    if (hostId) {
      try { requireHost(hostId); } catch (err) {
        if (!(await fixMissingHost(hostId, err))) return AGAIN;
      }
    }
    return null;
  };

  const optionsStep = async () => {
    const { host, targets } = S;
    S.depth = null;
    S.model = null;
    S.wantProbe = false;

    if (host === 'claude') {
      const depthId = await choose(t('depthQ'), [
        { label: t('depthQuick'), hint: t('depthQuickHint'), value: 'quick' },
        { label: t('depthStandard'), hint: t('depthStandardHint'), value: 'standard' },
        { label: t('depthDeep'), hint: t('depthDeepHint'), value: 'deep' },
      ], 2);
      S.depth = DEPTHS[depthId];

      const provider = await choose(t('providerQ'), [
        { label: t('provClaude'), value: 'claude' },
        { label: t('provDeepseek'), value: 'deepseek' },
        { label: t('provManual'), value: 'manual' },
      ], 1);

      let model;
      if (provider === 'claude') {
        model = await choose(t('modelQ'), [
          { label: 'haiku', hint: t('modelCheap'), value: 'haiku' },
          { label: 'sonnet', hint: t('modelDaily'), value: 'sonnet' },
          { label: 'opus', hint: t('modelExpensive'), value: 'opus' },
        ], 1);
      } else if (provider === 'deepseek') {
        if (!process.env.ANTHROPIC_BASE_URL) {
          say(`\n${t('needBaseUrl')}`);
          return END;
        }
        model = await choose(t('modelQ'), [
          { label: 'deepseek-v4-flash', value: 'deepseek-v4-flash' },
          { label: 'deepseek-v4-pro', value: 'deepseek-v4-pro' },
        ], 1);
      } else model = await ask(t('modelQ'));
      checkModel(model, false);
      S.model = model;
      say(`\n${t('backendLine', { backend: backend(), model })}`);

      say(`\n${t('draftFirst')}`);
    } else if (host === 'codewhale') {
      say(`\n${t('codewhaleNote')}`);
      const depthId = await choose(t('depthQ'), [
        { label: t('depthQuick'), hint: t('depthQuickHint'), value: 'quick' },
        { label: t('depthStandard'), hint: t('depthStandardHint'), value: 'standard' },
      ], 1);
      S.depth = DEPTHS[depthId];
      S.model = (await pickModel(['deepseek-flash'])) || 'deepseek-flash';
      if (!process.env.DEEPSEEK_API_KEY) {
        say(`\n${t('needDeepseekKey')}`);
        return END;
      }
      say(`\n${t('draftFirst')}`);
    } else if (host === 'codebuddy') {
      say(`\n${t('codebuddyNote')}`);
      const depthId = await choose(t('depthQ'), [
        { label: t('depthQuick'), hint: t('depthQuickHint'), value: 'quick' },
        { label: t('depthStandard'), hint: t('depthStandardHint'), value: 'standard' },
      ], 1);
      S.depth = DEPTHS[depthId];
      S.model = await pickModel(modelsOf('codebuddy', 'CodeBuddy'), catalogOnly('codebuddy'));
      if (notListed(S.model, [...modelsOf('codebuddy', 'CodeBuddy'), ...catalogOnly('codebuddy')], 'CodeBuddy')) return AGAIN;
      if (usesOwnDeepseek('codebuddy', S.model) && !process.env.DEEPSEEK_API_KEY) {
        say(`\n${t('needDeepseekKey')}`);
        return END;
      }
      say(`\n${t('draftFirst')}`);
    } else {
      say(`\n${t('codexNote')}`);
      S.model = await pickModel(modelsOf('codex', 'Codex'));
      if (notListed(S.model, modelsOf('codex', 'Codex'), 'Codex')) return AGAIN;
      if (usesOwnDeepseek('codex', S.model) && !process.env.DEEPSEEK_API_KEY) {
        say(`\n${t('needDeepseekKey')}`);
        return END;
      }
      S.wantProbe = await confirm(t('probeQ'), false);
      say(`\n${S.wantProbe
        ? t('codexEstimate', { skills: targets.length, runs: 2 })
        : t('codexStaticOnly', { skills: targets.length })}`);
    }
    return null;
  };

  const confirmStep = async () => {
    if (!(await confirm(t('confirmRun'), false))) {
      say(t('cancelled'));
      return END;
    }
    return null;
  };

  const steps = [sourceStep, hostStep, optionsStep, confirmStep];
  for (let i = 0; i < steps.length;) {
    let r;
    try { r = await steps[i](); } catch (err) {
      if (err instanceof Back) { i = Math.max(0, i - 1); continue; }
      throw err;
    }
    if (r === END) return;
    if (r !== AGAIN) i += 1;
  }
  const { targets, host, depth, model, wantProbe } = S;

  setBack(false); // from here on a ← would have nothing to go back to
  const outcomes = [];
  for (const target of targets) {
    say(`\n──── ${target.name} ────`);
    const result = withTicker(waitText(t('waitAnalyze'), { slowAfter: 600 }), () => analyze(target.dir));
    const sc = scorecard(result);

    let trial = null;
    let gain = null;
    let probe = null;

    if (host === 'claude' || host === 'codebuddy' || host === 'codewhale') {
      try {
        trial = await runTriggerLayer({
          skillDir: target.dir, skillName: target.name, depth, model, host: { claude: 'claude-code', codebuddy: 'codebuddy', codewhale: 'codewhale' }[host],
        });
      } catch (err) {
        say(`  ${t('trialFail', { err: errorText(err) })}`);
      }
      if (host === 'claude' && depth.layers.includes('gain')) {
        say(`  ${t('gainNote')}`);
        const g = await runGain({
          bin: resolveBin('claude'),
          skillDir: target.dir,
          skillName: target.name,
          model,
          onProgress: (id, cond) => say(`  · ${id} / ${cond}`),
        });
        if (g.measurable) gain = g;
        else say(`  ${t('gainSkip', { reason: t(g.reasonKey) })}`);
      }
    } else if (wantProbe) {
      say(`  ${t('probeRun')}`);
      probe = await probeActivation({
        bin: resolveBin('codex'),
        skillDir: target.dir,
        skillName: target.name,
        // The request must force action: a one-sentence answer ends both runs with no command and no file, and a
        // comparison of two empty runs says nothing. The skill is named but its description is not quoted, so
        // the run without it gets no hint of what the skill does.
        query: `Use whatever guidance you have for "${target.name}" on a small made-up example. Create the input files it needs in the current directory, do the job, and save the result as files there. Do not ask questions. Stop when the files are written.`,
        model,
      });
      if (!probe.withSkill.eventCount) say(`  ${t('probeEmpty')}`);
      archiveProbe({ skillDir: target.dir, skillName: target.name, model, probe });
    }

    let records = null;
    if (trial?.runDir) { try { records = validRecords(readRun(trial.runDir).records); } catch { /* the report then shows the totals only */ } }
    const answers = trial?.runDir ? readAnswers(trial.runDir) : null;
    const md = `${staticMarkdown(result)}${trialSection(trial, records, answers)}${gainSection(gain)}${probeSection(probe)}`;
    const out = writeOut(target.dir, target.name, md, sc);
    outcomes.push({ name: target.name, result, trial, records, gain, probe, reportPath: path.join(out, `${target.name}.md`) });
    // The run stopped on a failure streak (usage limit, dead token): the next skill would fail the same way.
    if ((host === 'claude' || host === 'codebuddy' || host === 'codewhale') && process.exitCode === 3) break;
  }

  // Nothing is uploaded without a yes here and a second yes after the preview: `submit` scrubs local paths and
  // keys, shows exactly what would go, and only then opens the pull request. Declining leaves the run on disk.
  // The results are drawn only after this decision, so the choice is made on the run, not on how it looks.
  let contributed = false;
  let explained = false;
  const submittable = finishedRuns.filter(canSubmit);
  if (finishedRuns.length && !submittable.length) {
    const manual = finishedRuns.map((d) => `npx skillgauntlet submit "${d}" --repo https://github.com/owner/repo --commit <sha> [--subdir path]`).join('\n  ');
    say(`\n${t('noSubmitNoSource', { cmd: manual })}`);
    explained = true;
  } else if (submittable.length && process.exitCode !== 3) {
    if (hasTerminal() && await confirm(t('contributeQ', { n: submittable.length }), false)) {
      for (const dir of submittable) await cmdSubmit(submitArgs(dir));
      contributed = true;
    }
  } else if (!finishedRuns.length && outcomes.length) {
    // Say why there is no upload question, instead of silently not asking.
    say(`\n${t(outcomes.some((o) => o.probe) ? 'noSubmitProbe' : 'noSubmitNoRun')}`);
    explained = true;
  }

  for (const o of outcomes) say(renderResult(o));
  if (!contributed && !explained) {
    const cmd = submittable.map((d) => `npx skillgauntlet submit ${submitArgs(d).map(quoteArg).join(' ')}`).join('\n  ');
    say(`\n${t('shareState', { cmd: submittable.length > 1 ? `\n  ${cmd}\n` : cmd })}`);
  }
}

async function cmdStatic(target, asJson) {
  const dir = path.resolve(target);
  if (!fs.existsSync(path.join(dir, 'SKILL.md'))) {
    const subs = findSkills(dir);
    if (!subs.length) throw new Error(t('noSkillUnder', { target }));
    for (const s of subs) {
      const result = analyze(s);
      say(asJson ? JSON.stringify(scorecard(result), null, 2) : staticMarkdown(result));
      say('');
    }
    return;
  }
  const result = analyze(dir);
  say(asJson ? JSON.stringify(scorecard(result), null, 2) : staticMarkdown(result));
}

// --lang zh|ja|en, else SG_LANG, else the OS locale. Interactive mode asks instead.
function applyLang(args) {
  const i = args.indexOf('--lang');
  setLang(i >= 0 ? args[i + 1] : detectLang());
  return i >= 0 ? [...args.slice(0, i), ...args.slice(i + 2)] : args;
}

async function main() {
  const args = applyLang(process.argv.slice(2));
  if (args.includes('--help') || args.includes('-h')) {
    say(t('usage'));
    return;
  }
  if (args.includes('--version') || args.includes('-v')) {
    say(currentVersion() || 'unknown');
    return;
  }
  if (args[0] === 'static') {
    await cmdStatic(args[1] || '.', args.includes('--json'));
    return;
  }
  if (args[0] === 'resume') {
    await cmdResume(args.slice(1));
    return;
  }
  if (args[0] === 'submit') {
    await cmdSubmit(args.slice(1));
    return;
  }
  await interactive();
}

main()
  .catch((err) => {
    if (err.message === 'interrupted') {
      say('');
      process.exitCode = 130;
      return;
    }
    const msg = err.message === 'EOF' ? t('inputEnded') : errorText(err);
    say(`\n${t('err', { msg })}`);
    if (process.env.SG_DEBUG) say(err.stack);
    process.exitCode = 1;
  })
  .finally(() => {
    closeUi();
    // After a ← or Esc on Windows the terminal's stdin can keep the process alive once the program has finished (or
    // handled Ctrl+C), so the shell prompt never comes back. A terminal session is over here: end it explicitly.
    // Output to a terminal is synchronous, so nothing is cut off; a pipe is left to end by itself.
    if (process.stdin.isTTY && process.stdout.isTTY) process.exit(process.exitCode ?? 0);
  });
