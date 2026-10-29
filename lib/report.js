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
      for (const e of c.evidence.slice(0, 3)) L.push(`  - \`L${e.line}\` ${e.match}`);
    }
    L.push('');
  }
  L.push(t('report.noComposite'));
  return L.join('\n');
}

export function trialSection(trial) {
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
