#!/usr/bin/env node
// SkillGauntlet CLI. Two ways in:
//   npx skillgauntlet                 interactive: language first, then arrow keys / y / n / enter
//   npx skillgauntlet static <dir>    one skill, layer 0 only, no model calls
import fs from 'node:fs';
import path from 'node:path';
import { analyze } from '../lib/static.js';
import { staticMarkdown, trialSection, gainSection, probeSection, scorecard } from '../lib/report.js';
import { findSkills, resolveSpec } from '../lib/discover.js';
import { installedSkills } from '../lib/installed.js';
import { probeActivation } from '../lib/codex.js';
import { fingerprint, cacheFileFor, readCachedQueries, writeCachedQueries } from '../lib/queries.js';
import { openRun, querySetHash } from '../lib/runs.js';
import { DEPTHS, estimate } from '../lib/depth.js';
import { ask, choose, select, confirm, say, closeUi } from '../lib/ui.js';
import { setLang, detectLang, errorText, t } from '../lib/i18n.js';
import { resolveBin, backend, backendFor, isDeepseekModel, HOSTS, checkModel, draftQueries, draftQuality, runTrial, requireHost } from '../lib/trial.js';
import { runGain } from '../lib/gain.js';
import { ERROR_STREAK_STOP, executeTrials, finishRun, resumeRun } from '../lib/execute.js';
import { cmdSubmit } from '../lib/submit.js';

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

async function runTriggerLayer({ skillDir, skillName, depth, model, host = 'claude-code' }) {
  requireHost(host);
  const bin = resolveBin(HOSTS[host].bin);
  const cacheFile = cacheFileFor(skillDir, depth);
  const want = { perClause: depth.perClause, negatives: depth.negatives, skillFingerprint: fingerprint(skillDir) };

  let qs = readCachedQueries(cacheFile, want);
  const reused = Boolean(qs);
  if (qs) {
    say(`  ${t('queriesReused', { n: qs.queries.length, file: path.basename(cacheFile) })}`);
  } else {
    say(`  ${t('drafting')}`);
    qs = draftQueries({ bin, skillDir, skillName, model, perClause: depth.perClause, negatives: depth.negatives, host });
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

  try {
    const outcome = await executeTrials({
      run,
      trials,
      doTrial: ({ q }) => runTrial({ bin, skillDir, skillName, query: q.query, model, maxExplore: depth.maxExplore, host }),
      onTrial: progress(),
    });
    const result = finishRun(run, { model, backend: backendFor(host, model), host, runs: depth.runs, expected: trials.length }, outcome.stopped);
    say(`  ${t('runSaved', { path: run.dir })}`);
    if (outcome.stopped) reportStopped(outcome.stopped, run.dir, model);
    else if (result?.incomplete) reportIncomplete(result.incomplete, run.dir, model);
    return result;
  } catch (err) {
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

function progress() {
  return ({ row, done, total }) => {
    const mark = { triggered: '✓', not_triggered: '·', other_skill: '↷' }[row.verdict] || '!';
    say(`  [${done}/${total}] ${mark} ${row.queryId}#${row.run} → ${row.verdict}`);
  };
}

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
  const result = await resumeRun({
    dir: full,
    bin: resolveBin((HOSTS[runHost] || HOSTS['claude-code']).bin),
    want: { model: flag('--model'), runs: flag('--runs'), maxExplore: flag('--max-explore'), backend: backendFor(runHost, flag('--model') ?? runMeta.model) },
    onTrial: progress(),
  });
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
      resolved = resolveSpec(parsed.repo);
    } catch (err) {
      say(`  ${errorText(err)}`);
      continue;
    }
    const found = findSkills(resolved.dir);
    if (!found.length) {
      say(`  ${t('noSkill')}`);
      return [];
    }
    if (parsed.hint) {
      const hit = found.find((d) => relLabel(resolved.dir, d) === parsed.hint || d.endsWith(`/${parsed.hint}`));
      if (hit) return [{ name: path.basename(hit), dir: hit, root: resolved.dir }];
      say(`  ${t('notFoundNamed', { name: parsed.hint, list: found.map((d) => relLabel(resolved.dir, d)).slice(0, 8).join(', ') })}`);
      return [];
    }
    if (found.length === 1) return [{ name: path.basename(found[0]), dir: found[0], root: resolved.dir }];
    say(`  ${t('multiFound', { n: found.length })}`);
    const name = await ask(t('pickOneQ'));
    const hit = found.find((d) => path.basename(d) === name.trim());
    if (hit) return [{ name: path.basename(hit), dir: hit, root: resolved.dir }];
    say(`  ${t('notFoundNamed', { name: name.trim(), list: found.map((d) => relLabel(resolved.dir, d)).slice(0, 8).join(', ') })}`);
    return [];
  }
}

async function interactive() {
  const langChoice = await select(`${t('langTitle')}`, [
    { label: t('langZh'), value: 'zh' },
    { label: t('langEn'), value: 'en' },
    { label: t('langJa'), value: 'ja' },
  ], 0);
  setLang(langChoice);

  say('');
  say(t('title'));
  say(t('rule'));

  const source = await choose(t('sourceQ'), [
    { label: t('srcInstalled'), hint: t('srcInstalledHint'), value: 'installed' },
    { label: t('srcPath'), value: 'path' },
    { label: t('srcRepo'), hint: 'owner/repo', value: 'repo' },
  ], 1);

  let targets = [];
  if (source === 'installed') targets = await pickInstalled();
  else if (source === 'path') {
    const root = path.resolve(await ask(t('srcPath')));
    const found = findSkills(root);
    if (!found.length) say(`\n${t('noSkill')}`);
    else if (found.length === 1) targets = [{ name: path.basename(found[0]), dir: found[0], root }];
    else {
      const name = await select(t('pickOneQ'), found.map((d) => ({ label: relLabel(root, d), value: d })), 0);
      targets = [{ name: path.basename(name), dir: name, root }];
    }
  } else targets = await pickRemote();
  if (!targets.length) return;

  const host = await choose(t('hostQ'), [
    { label: t('hostClaude'), hint: t('hostClaudeHint'), value: 'claude' },
    { label: t('hostCodebuddy'), hint: t('hostCodebuddyHint'), value: 'codebuddy' },
    { label: t('hostCodewhale'), hint: t('hostCodewhaleHint'), value: 'codewhale' },
    { label: t('hostCodex'), hint: t('hostCodexHint'), value: 'codex' },
  ], 1);

  let depth = null;
  let model = null;
  let wantProbe = false;

  if (host === 'claude') {
    const depthId = await choose(t('depthQ'), [
      { label: t('depthQuick'), hint: t('depthQuickHint'), value: 'quick' },
      { label: t('depthStandard'), hint: t('depthStandardHint'), value: 'standard' },
      { label: t('depthDeep'), hint: t('depthDeepHint'), value: 'deep' },
    ], 2);
    depth = DEPTHS[depthId];

    const provider = await choose(t('providerQ'), [
      { label: t('provClaude'), hint: t('provClaudeHint'), value: 'claude' },
      { label: t('provDeepseek'), hint: t('provDeepseekHint'), value: 'deepseek' },
      { label: t('provManual'), value: 'manual' },
    ], 1);

    if (provider === 'claude') {
      model = await choose(t('modelQ'), [
        { label: 'haiku', hint: t('modelCheap'), value: 'haiku' },
        { label: 'sonnet', hint: t('modelDaily'), value: 'sonnet' },
        { label: 'opus', hint: t('modelExpensive'), value: 'opus' },
      ], 1);
    } else if (provider === 'deepseek') {
      if (!process.env.ANTHROPIC_BASE_URL) {
        say(`\n${t('needBaseUrl')}`);
        return;
      }
      model = await choose(t('modelQ'), [
        { label: 'deepseek-v4-flash', value: 'deepseek-v4-flash' },
        { label: 'deepseek-v4-pro', value: 'deepseek-v4-pro' },
      ], 1);
    } else model = await ask(t('modelQ'));
    checkModel(model, false);
    say(`\n${t('backendLine', { backend: backend(), model })}`);

    const est = estimate(depthId, 3);
    say(`\n${t('estimate', {
      skills: targets.length,
      trials: est.trials,
      minutes: est.minutes,
      totalMinutes: est.minutes * targets.length,
    })}`);
  } else if (host === 'codewhale') {
    say(`\n${t('codewhaleNote')}`);
    const depthId = await choose(t('depthQ'), [
      { label: t('depthQuick'), hint: t('depthQuickHint'), value: 'quick' },
      { label: t('depthStandard'), hint: t('depthStandardHint'), value: 'standard' },
    ], 1);
    depth = DEPTHS[depthId];
    model = (await ask(t('modelQ'), 'deepseek-flash')).trim() || 'deepseek-flash';
    if (!process.env.DEEPSEEK_API_KEY) {
      say(`\n${t('needDeepseekKey')}`);
      return;
    }
    const est = estimate(depthId, 3);
    say(`\n${t('codewhaleEstimate', { skills: targets.length, trials: est.trials * targets.length })}`);
  } else if (host === 'codebuddy') {
    say(`\n${t('codebuddyNote')}`);
    const depthId = await choose(t('depthQ'), [
      { label: t('depthQuick'), hint: t('depthQuickHint'), value: 'quick' },
      { label: t('depthStandard'), hint: t('depthStandardHint'), value: 'standard' },
    ], 1);
    depth = DEPTHS[depthId];
    model = (await ask(t('modelQ'), '')).trim() || null;
    if (isDeepseekModel(model) && !process.env.DEEPSEEK_API_KEY) {
      say(`\n${t('needDeepseekKey')}`);
      return;
    }
    const est = estimate(depthId, 3);
    say(`\n${t('codebuddyEstimate', { skills: targets.length, trials: est.trials * targets.length })}`);
  } else {
    say(`\n${t('codexNote')}`);
    model = (await ask(t('modelQ'), '')).trim() || null;
    if (isDeepseekModel(model) && !process.env.DEEPSEEK_API_KEY) {
      say(`\n${t('needDeepseekKey')}`);
      return;
    }
    wantProbe = await confirm(t('probeQ'), false);
    say(`\n${wantProbe
      ? t('codexEstimate', { skills: targets.length, runs: 2 })
      : t('codexStaticOnly', { skills: targets.length })}`);
  }

  if (!(await confirm(t('confirmRun'), false))) {
    say(t('cancelled'));
    return;
  }

  for (const target of targets) {
    say(`\n──── ${target.name} ────`);
    const result = analyze(target.dir);
    const sc = scorecard(result);
    const verdicts = result.groups
      .map((g) => `${g.id}${g.verdict === 'pass' ? '✓' : g.verdict === 'warn' ? '!' : '✗'}`).join(' ');
    say(`  ${t('staticDone', { verdicts })}`);

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

    const md = `${staticMarkdown(result)}${trialSection(trial)}${gainSection(gain)}${probeSection(probe)}`;
    const out = writeOut(target.dir, target.name, md, sc);
    say(`  ${t('reportAt', { path: path.join(out, `${target.name}.md`) })}`);
    // The run stopped on a failure streak (usage limit, dead token): the next skill would fail the same way.
    if ((host === 'claude' || host === 'codebuddy' || host === 'codewhale') && process.exitCode === 3) break;
  }

  // Nothing is uploaded from here. Contributing a run is a separate, deliberate command (`submit`), which
  // scrubs, previews and asks first; saying so plainly beats a yes/no prompt in the middle of a test run.
  say(`\n${t('shareState')}`);
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
  .finally(() => closeUi());
