// Rendering. Two artefacts: a machine-readable scorecard and a page a human can read.
// Every sentence comes from the i18n table, so the report follows the language chosen in the CLI.
import { t, lang } from './i18n.js';

const ICON = { pass: '✓', warn: '!', fail: '✗', info: '·' };
const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);

export function staticMarkdown(result) {
  const s = result.stats;
  const L = [];
  L.push(`# ${result.skill}`);
  L.push('');
  L.push(`- ${t('report.path')}\`${result.path}\``);
  L.push(`- ${t('report.skillMd', { chars: s.skillMdChars, tokens: s.skillMdTokens, desc: s.descriptionChars })}`);
  L.push(`- ${t('report.package', { files: s.files, code: s.codeFiles, size: s.size })}`);
  L.push(`- ${t('report.permissions', { tools: s.allowedTools || t('report.notDeclared') })}`);
  L.push('');
  L.push(`| ${t('report.groupHeader')} | ${t('report.verdictHeader')} | ${t('report.checkHeader')} |`);
  L.push('|---|---|---|');
  for (const g of result.groups) {
    const bad = g.checks
      .filter((c) => c.status === 'warn' || c.status === 'fail')
      .map((c) => `${ICON[c.status]} ${t(c.titleKey)}`).join('; ');
    L.push(`| ${g.id} ${t(g.titleKey)} | ${g.verdict} | ${bad || t('report.allPass')} |`);
  }
  L.push('');
  L.push(t('report.legend'));
  L.push('');
  for (const g of result.groups) {
    L.push(`## ${g.id} ${t(g.titleKey)}`);
    L.push('');
    for (const c of g.checks) {
      L.push(`- ${ICON[c.status]} **${c.id} ${t(c.titleKey)}** — ${t(c.detailKey, c.detailVars)}`);
      for (const e of c.evidence.slice(0, 3)) L.push(`  - \`${e.file ? `${e.file}:` : ''}L${e.line}\` ${e.match}`);
    }
    L.push('');
  }
  L.push(t('report.noComposite'));
  return L.join('\n');
}

const bar = (v, w = 20) => {
  const n = Math.round(Math.min(1, Math.max(0, v ?? 0)) * w);
  return '█'.repeat(n) + '░'.repeat(w - n);
};
const cell = (x) => String(x ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();

// What the model did in one run, in words.
function didWhat(r) {
  if (r.verdict === 'triggered') return t('trial.didSkill', { name: r.invokedSkill || '?' });
  if (r.verdict === 'other_skill') return t('trial.otherSkill', { name: r.invokedSkill || '?' });
  return r.firstTool || t('trial.noToolRun');
}

// One row per question, grouped under the trigger clause it was written for: what was expected, what happened, whether
// they agree, what the model did instead, and why the question was written (for a near miss, the words it borrows).
function trialDetail(trial, records) {
  const byQuery = new Map();
  for (const r of records) {
    if (!byQuery.has(r.queryId)) byQuery.set(r.queryId, []);
    byQuery.get(r.queryId).push(r);
  }
  const L = [];
  const pos = trial.questions.filter((q) => q.shouldTrigger);
  const neg = trial.questions.filter((q) => !q.shouldTrigger);
  const hitP = pos.reduce((a, q) => a + q.hits, 0);
  const nP = pos.reduce((a, q) => a + q.n, 0);
  const hitN = neg.reduce((a, q) => a + q.hits, 0);
  const nN = neg.reduce((a, q) => a + q.n, 0);
  L.push('', `### ${t('trial.glance')}`, '', '```');
  L.push(`${t('trial.glanceRecall')}  ${bar(trial.recall)} ${pct(trial.recall)}  (${hitP}/${nP})`);
  L.push(`${t('trial.glanceFpr')}  ${bar(trial.fpr)} ${pct(trial.fpr)}  (${hitN}/${nN})`);
  L.push('```', '', t('trial.legend'));

  // group by clause, in the order the clauses were drafted
  const clauses = [];
  for (const q of trial.queries || []) if (!clauses.includes(q.clause || '')) clauses.push(q.clause || '');
  L.push('', `### ${t('trial.byClause')}`);
  for (const clause of clauses) {
    const qs = (trial.queries || []).filter((q) => (q.clause || '') === clause);
    L.push('', `#### ${clause ? t('trial.clauseTitle', { clause: cell(clause) }) : t('trial.noClause')}`, '');
    L.push(`| ${t('trial.hExpect')} | ${t('trial.hActual')} | ${t('trial.hMatch')} | ${t('trial.hQuery')} | ${t('trial.hFirst')} | ${t('trial.hNote')} |`);
    L.push('|---|---|---|---|---|---|');
    for (const q of [...qs.filter((x) => x.shouldTrigger), ...qs.filter((x) => !x.shouldTrigger)]) {
      const runs = byQuery.get(q.id) || [];
      const hits = runs.filter((r) => r.verdict === 'triggered').length;
      const n = runs.length;
      let actual;
      let ok;
      if (!n) { actual = '—'; ok = '—'; } else if (q.shouldTrigger) {
        actual = hits === n ? t('trial.actTriggered') : hits === 0 ? t('trial.actNot') : t('trial.actPartial', { k: hits, n });
        ok = hits * 2 > n ? '✓' : '✗';
      } else {
        actual = hits === 0 ? t('trial.actNot') : t('trial.actWrong', { k: hits, n });
        ok = hits === 0 ? '✓' : '✗';
      }
      const first = [...new Set(runs.map(didWhat))].join('; ') || '—';
      const note = [cell(q.note), q.shares ? t('trial.borrows', { words: cell(q.shares) }) : ''].filter(Boolean).join(' ');
      L.push(`| ${q.shouldTrigger ? t('trial.should') : t('trial.shouldNot')} | ${actual} | ${ok} | ${cell(q.query)} | ${cell(first)} | ${note} |`);
    }
  }

  const missed = records.filter((r) => r.shouldTrigger && r.verdict !== 'triggered');
  if (missed.length) {
    const kinds = new Map();
    for (const r of missed) kinds.set(didWhat(r), (kinds.get(didWhat(r)) || 0) + 1);
    L.push('', `### ${t('trial.missTitle', { n: missed.length })}`, '');
    L.push(`| ${t('trial.hFirstTool')} | ${t('trial.hCount')} | |`, '|---|---|---|');
    for (const [k, c] of [...kinds].sort((a, b) => b[1] - a[1])) L.push(`| ${cell(k)} | ${c} | ${bar(c / missed.length, 16)} |`);
  }
  if (trial.recall === 0 && trial.fpr === 0) L.push('', `> ${t('trial.allZero')}`);
  return L;
}

export function trialSection(trial, records = null) {
  if (!trial) return '';
  const L = ['', `## ${t('trial.title')}`, ''];
  L.push(`- ${t('trial.modelLine', {
    model: trial.modelResolved || trial.model,
    backend: trial.backend,
    host: trial.host || t('trial.hostUnknown'),
    runs: trial.runs,
    trials: trial.trials,
  })}`);
  L.push(`- ${t('trial.recall', { p: pct(trial.recall), lo: pct(trial.recallCi?.[0]), hi: pct(trial.recallCi?.[1]) })}`);
  L.push(`- ${t('trial.fpr', { p: pct(trial.fpr), lo: pct(trial.fprCi?.[0]), hi: pct(trial.fprCi?.[1]) })}`);
  if (trial.noToolRate != null) {
    L.push(`- ${t('trial.noTool', { p: pct(trial.noToolRate) })}${trial.noToolRate >= 0.5 ? t('trial.noToolWarn') : ''}`);
  }
  if (records?.length && trial.queries?.length) {
    L.push(...trialDetail(trial, records));
    return L.join('\n');
  }
  L.push('');
  L.push(`| ${t('trial.stateHeader')} | ${t('trial.queryHeader')} | ${t('trial.hitsHeader')} |`);
  L.push('|---|---|---|');
  for (const q of trial.questions) {
    L.push(`| ${q.shouldTrigger ? t('trial.should') : t('trial.shouldNot')} | ${q.query.replace(/\|/g, '\\|')} | ${q.hits}/${q.n} |`);
  }
  return L.join('\n');
}

export function gainSection(gain) {
  if (!gain) return '';
  const L = ['', `## ${t('gain.title')}`, ''];
  L.push(t('gain.intro'));
  L.push(t('gain.local'));
  L.push('');
  L.push(`| ${t('gain.contractHeader')} | ${t('gain.withHeader')} | ${t('gain.withoutHeader')} | ${t('gain.dirHeader')} |`);
  L.push('|---|---|---|---|');
  for (const c of gain.contracts) {
    const delta = c.with - c.without;
    const dir = delta > 0.1 ? t('gain.up') : delta < -0.1 ? t('gain.down') : t('gain.same');
    const desc = c.descI18n?.[lang()] || c.desc;
    L.push(`| ${desc} | ${pct(c.with)} | ${pct(c.without)} | ${dir} |`);
  }
  if (gain.tasks?.length) {
    L.push('');
    L.push(`### ${t('gain.perTask')}`);
    for (const task of gain.tasks) {
      L.push('');
      L.push(`**${task.id}**  ${task.prompt.replace(/\n/g, ' ').slice(0, 120)}`);
      for (const [label, side] of [[t('gain.withSkill'), task.with], [t('gain.withoutSkill'), task.without]]) {
        const files = side.added.length ? side.added.slice(0, 6).join(', ') : t('gain.noFiles');
        const ok = side.checks.filter((c) => c.ok).length;
        L.push(`- **${label}**: ${t('gain.side', { files, ok, n: side.checks.length })}`);
      }
    }
  }
  L.push('');
  L.push(t('gain.footnote1'));
  L.push(t('gain.footnote2'));
  return L.join('\n');
}

export function probeSection(probe) {
  if (!probe) return '';
  const same = (b) => (b ? t('probeSame') : t('probeDiffer'));
  const L = ['', `## ${t('probeTitle')}`, ''];
  L.push(t('probeIntro'));
  L.push('');
  L.push(`| | ${t('probeAction')} | ${t('probeFiles')} |`);
  L.push('|---|---|---|');
  for (const [label, side] of [[t('probeWith'), probe.withSkill], [t('probeWithout'), probe.without]]) {
    const action = side.firstAction ? `${side.firstAction.kind} — ${side.firstAction.detail}`.slice(0, 160) : '—';
    L.push(`| ${label} | ${action} | ${side.createdFiles?.join(', ') || '—'} |`);
  }
  L.push('');
  L.push(`- ${t('probeActionKind')}${t('report.colon')}${same(probe.actionKindIdentical)}`);
  L.push(`- ${t('probeArtifacts')}${t('report.colon')}${same(probe.artifactsIdentical)}`);
  L.push('');
  L.push(`> ${t('probeNoVerdict')}`);
  L.push(`> ${t('probeNoTrigger')}`);
  return L.join('\n');
}

export function scorecard(result) {
  return {
    schema: 'skillgauntlet/scorecard/2',
    skill: result.skill,
    path: result.path,
    stats: result.stats,
    groups: result.groups.map((g) => ({
      id: g.id,
      titleKey: g.titleKey,
      verdict: g.verdict,
      checks: g.checks.map((c) => ({
        id: c.id, status: c.status, detailKey: c.detailKey, detailVars: c.detailVars,
      })),
    })),
  };
}

// A published report ends with one question: which host does the reader use. It is a poll, not a
// feature -- one line, answered with a digit -- and it exists because a share count says how many
// people read a report but not whether its trigger numbers apply to them. Codex has no skill item in
// its event stream, so a Codex reader gets nothing from a trigger table; finding out that the readers
// are mostly Codex users is cheap now and expensive to discover after building the wrong layer.
// Deliberately absent from per-skill reports: the person reading one of those usually ran it.
export function readerPollSection() {
  return ['', '---', '', `## ${t('poll.title')}`, '', t('poll.body'), '', `> ${t('poll.why')}`].join('\n');
}
