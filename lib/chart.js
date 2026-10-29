// A result drawn for the terminal: bars for rates, one mark per question, a verdict in words. The Markdown report
// stays the full record; this is what a person reads first, so it carries the few numbers that decide the reading.
import { stdout } from 'node:process';
import { gradeTrigger } from './submission.js';
import { t, lang } from './i18n.js';

const color = () => stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, s) => (color() ? `\x1b[${code}m${s}\x1b[0m` : s);
const green = (s) => paint(32, s);
const yellow = (s) => paint(33, s);
const red = (s) => paint(31, s);
const dim = (s) => paint(2, s);
const bold = (s) => paint(1, s);

const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);

// width cells; filled share = value (0..1)
export function bar(value, width = 24, tone = (s) => s) {
  const v = Math.min(1, Math.max(0, value ?? 0));
  const n = Math.round(v * width);
  return `${tone('█'.repeat(n))}${dim('░'.repeat(width - n))}`;
}

const good = (v) => (v >= 0.8 ? green : v >= 0.5 ? yellow : red);   // higher is better
const bad = (v) => (v <= 0.1 ? green : v <= 0.25 ? yellow : red);    // lower is better

const GRADE_TONE = { well: green, fair: yellow, poorly: red, insufficient: dim };

function staticLines(result) {
  const L = [bold(t('chart.static'))];
  for (const g of result.groups) {
    const mark = g.verdict === 'pass' ? green('✓') : g.verdict === 'warn' ? yellow('!') : red('✗');
    L.push(`  ${mark} ${g.id}  ${t(g.titleKey)}`);
  }
  return L;
}

function triggerLines(trial) {
  const pos = trial.questions.filter((q) => q.shouldTrigger);
  const neg = trial.questions.filter((q) => !q.shouldTrigger);
  const nPos = pos.reduce((a, q) => a + q.n, 0);
  const nNeg = neg.reduce((a, q) => a + q.n, 0);
  const grade = gradeTrigger({ recall: trial.recall, fpr: trial.fpr, nPos, nNeg });
  const ci = (c) => (c?.[0] == null ? '' : dim(`  ${t('chart.ci', { lo: pct(c[0]), hi: pct(c[1]) })}`));
  const L = [bold(t('chart.trigger')), ''];
  L.push(`  ${t('chart.verdict')}  ${(GRADE_TONE[grade] || ((s) => s))(bold(t(`chart.grade.${grade}`)))}`);
  L.push('');
  L.push(`  ${padCells(t('chart.recall'), pad(t('chart.recall'), t('chart.fpr')))}${bar(trial.recall, 24, good(trial.recall ?? 0))} ${pct(trial.recall)}${ci(trial.recallCi)}`);
  L.push(`  ${padCells(t('chart.fpr'), pad(t('chart.recall'), t('chart.fpr')))}${bar(trial.fpr, 24, bad(trial.fpr ?? 0))} ${pct(trial.fpr)}${ci(trial.fprCi)}`);
  L.push('');
  L.push(`  ${dim(t('chart.legend'))}`);
  const strip = (qs) => qs.map((q) => (q.hits * 2 > q.n ? green('●') : q.hits > 0 ? yellow('◐') : dim('○'))).join('');
  L.push(`  ${padCells(t('chart.should'), pad(t('chart.should'), t('chart.shouldNot')))}${strip(pos)}  ${dim(`${pos.filter((q) => q.hits * 2 > q.n).length}/${pos.length}`)}`);
  L.push(`  ${padCells(t('chart.shouldNot'), pad(t('chart.should'), t('chart.shouldNot')))}${strip(neg)}  ${dim(`${neg.filter((q) => q.hits > 0).length}/${neg.length}`)}`);
  if (trial.incomplete) L.push(`  ${yellow(t('chart.incomplete', { n: trial.incomplete }))}`);
  return L;
}

// Width of the wider of two labels in terminal cells: CJK characters take two.
function cells(s) {
  let n = 0;
  for (const ch of String(s)) n += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/.test(ch) ? 2 : 1;
  return n;
}
function pad(a, b) { return Math.max(cells(a), cells(b)) + 2; }
// String.padEnd counts code units, not cells, so columns are padded by hand.
const padCells = (str, width) => str + ' '.repeat(Math.max(0, width - cells(str)));

function probeLines(probe) {
  const same = (b) => (b ? green(t('probeSame')) : yellow(t('probeDiffer')));
  return [
    bold(t('chart.probe')),
    `  ${t('probeActionKind')}  ${same(probe.actionKindIdentical)}`,
    `  ${t('probeArtifacts')}  ${same(probe.artifactsIdentical)}`,
    `  ${dim(t('chart.probeNote'))}`,
  ];
}

function gainLines(gain) {
  const L = [bold(t('chart.gain')), `  ${dim(t('chart.gainLegend'))}`];
  for (const c of gain.contracts) {
    L.push(`  ${String(c.descI18n?.[lang()] || c.desc).slice(0, 60)}`);
    L.push(`    ${padCells(t('gain.withHeader'), 10)}${bar(c.with, 20, green)} ${pct(c.with)}`);
    L.push(`    ${padCells(t('gain.withoutHeader'), 10)}${bar(c.without, 20, (s) => s)} ${pct(c.without)}`);
  }
  return L;
}

// One block per tested skill. Any part may be absent (static only, probe only, no gain layer).
export function renderResult({ name, result, trial, gain, probe, reportPath }) {
  const L = ['', bold(`════ ${name} ════`), ''];
  if (result) L.push(...staticLines(result), '');
  if (trial) L.push(...triggerLines(trial), '');
  if (probe) L.push(...probeLines(probe), '');
  if (gain?.contracts?.length) L.push(...gainLines(gain), '');
  if (reportPath) L.push(dim(t('chart.full', { path: reportPath })));
  return L.join('\n');
}
