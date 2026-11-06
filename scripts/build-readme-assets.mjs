#!/usr/bin/env node
// Builds the SVGs the README shows, into docs/assets/. Numbers come from step0/data/leaderboard-maintainer.json and
// the terminal panel is real output of the CLI, so a figure on the front page can always be traced and regenerated.
//
//   node scripts/build-readme-assets.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs/assets');
fs.mkdirSync(out, { recursive: true });

const SANS = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`;
const MONO = `ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace`;

const THEMES = {
  light: { ink: '#1f2328', ink2: '#57606a', ink3: '#6e7781', line: '#d0d7de', panel: '#f6f8fa', card: '#ffffff', accent: '#C2410C', accentSoft: '#fff1e8' },
  dark: { ink: '#f0f6fc', ink2: '#9da7b3', ink3: '#8b949e', line: '#30363d', panel: '#161b22', card: '#0d1117', accent: '#EA580C', accentSoft: '#2a1a10' },
};

const STRINGS = {
  en: {
    tagline: 'Every skill runs the gauntlet.',
    questions: 'Does it trigger?  Does it help?  Is it safe?',
    gates: [['0', 'static', 'free'], ['1', 'trigger', 'model calls'], ['2', 'gain', 'model calls ×2']],
    chartAxis: 'Recall: share of requests that should use the skill and did',
    chartZones: ['under 50%', '50–80%', '80%+'],
    chartNote: (n) => `Claude Code × claude-haiku-5-5, ${n} skills, tested 2026-10-28. Line: 95% interval, computed over questions. Automated results under these conditions only.`,
    you: 'YOU',
    auto: 'automatic',
    lane1: 'Test: one command',
    lane2: 'Contribute: one more yes',
    flow1: [['Pick a skill', 'arrow keys, enter', true], ['Static checks', '22 checks, no model', false], ['Draft questions', 'should and should not fire', false], ['Run the trials', 'on your host and model', false], ['Grade', 'by program, with ranges', false], ['Report', 'raw records stay local', false]],
    flow2: [['Scrub, preview', 'paths, logins, keys', false], ['Say yes', 'nothing leaves before this', true], ['Open your PR', 'forks and pushes as you', false], ['CI checks', 'format, hashes, arithmetic', false], ['Merge', 'if every check holds', false], ['Leaderboard', 'with your name on the row', false]],
  },
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const write = (name, svg) => fs.writeFileSync(path.join(out, name), `${svg.trim()}\n`);

// Hero: a wordmark and three gates a skill has to pass, cheapest first.
function hero(s, c) {
  const W = 960; const H = 300;
  const gx = [560, 680, 800];
  const gate = (x, i) => `
    <g class="g g${i}">
      <path d="M${x - 34} 196 V128 a34 34 0 0 1 68 0 V196" fill="${c.card}" stroke="${c.line}" stroke-width="2"/>
      <path class="lit" d="M${x - 34} 196 V128 a34 34 0 0 1 68 0 V196" fill="${c.accentSoft}" stroke="${c.accent}" stroke-width="3"/>
      <text x="${x}" y="150" text-anchor="middle" font-family="${MONO}" font-size="26" font-weight="700" fill="${c.ink}">${s.gates[i][0]}</text>
      <text x="${x}" y="222" text-anchor="middle" font-family="${SANS}" font-size="15" font-weight="600" fill="${c.ink}">${esc(s.gates[i][1])}</text>
      <text x="${x}" y="242" text-anchor="middle" font-family="${SANS}" font-size="12.5" fill="${c.ink3}">${esc(s.gates[i][2])}</text>
    </g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="SkillGauntlet. ${esc(s.tagline)}">
  <style>
    .lit { opacity: 0; animation: lit 6s ease-in-out infinite; }
    .g1 .lit { animation-delay: 0.9s; } .g2 .lit { animation-delay: 1.8s; }
    .token { animation: run 6s ease-in-out infinite; }
    @keyframes lit { 0%, 12% { opacity: 0; } 20%, 62% { opacity: 1; } 76%, 100% { opacity: 0; } }
    @keyframes run { 0% { transform: translateX(0); opacity: 0; } 8% { opacity: 1; } 58% { transform: translateX(370px); opacity: 1; } 70%, 100% { transform: translateX(370px); opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { .lit { animation: none; opacity: 1; } .token { animation: none; opacity: 0; } }
  </style>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="16" fill="${c.panel}" stroke="${c.line}" stroke-width="2"/>
  <text x="52" y="136" font-family="${SANS}" font-size="56" font-weight="800" letter-spacing="-1.5" fill="${c.ink}">Skill<tspan fill="${c.accent}">Gauntlet</tspan></text>
  <text x="54" y="178" font-family="${SANS}" font-size="23" font-weight="500" fill="${c.ink}">${esc(s.tagline)}</text>
  <text x="54" y="212" font-family="${SANS}" font-size="16" fill="${c.ink2}">${esc(s.questions)}</text>
  <line x1="500" y1="196" x2="880" y2="196" stroke="${c.line}" stroke-width="2"/>
  ${gx.map(gate).join('')}
  <circle class="token" cx="505" cy="196" r="8" fill="${c.accent}"/>
</svg>`;
}

// The Haiku batch: one dot and interval per skill, against the grade thresholds on recall.
function chart(s, c, rows) {
  const W = 960; const rowH = 27; const top = 64; const x0 = 262; const x1 = 880;
  const H = top + rows.length * rowH + 66;
  const x = (v) => x0 + (x1 - x0) * v;
  const bottom = top + rows.length * rowH;
  const ticks = [0, 0.25, 0.5, 0.8, 1];
  const band = (a, b, label) => `<text x="${(x(a) + x(b)) / 2}" y="${top - 16}" text-anchor="middle" font-family="${SANS}" font-size="13" font-weight="600" fill="${c.ink2}">${esc(label)}</text>`;
  const row = (r, i) => {
    const y = top + i * rowH + rowH / 2;
    const pct = Math.round(r.recall * 100);
    return `
    <text x="${x0 - 14}" y="${y + 4.5}" text-anchor="end" font-family="${MONO}" font-size="13.5" fill="${c.ink}">${esc(r.skill)}</text>
    <line x1="${x(r.recallCi[0]).toFixed(1)}" y1="${y}" x2="${x(r.recallCi[1]).toFixed(1)}" y2="${y}" stroke="${c.accent}" stroke-width="2" stroke-linecap="round" opacity="0.55"/>
    <circle cx="${x(r.recall).toFixed(1)}" cy="${y}" r="5" fill="${c.accent}" stroke="${c.card}" stroke-width="2"/>
    <text x="${x1 + 40}" y="${y + 4.5}" text-anchor="end" font-family="${MONO}" font-size="13.5" font-weight="600" fill="${c.ink}">${pct}%</text>`;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(s.chartAxis)}. ${rows.map((r) => `${r.skill} ${Math.round(r.recall * 100)}%`).join(', ')}.">
  <text x="${x0}" y="20" font-family="${SANS}" font-size="14.5" font-weight="600" fill="${c.ink}">${esc(s.chartAxis)}</text>
  ${band(0, 0.5, s.chartZones[0])}${band(0.5, 0.8, s.chartZones[1])}${band(0.8, 1, s.chartZones[2])}
  <rect x="${x(0)}" y="${top - 6}" width="${x(0.5) - x(0)}" height="${bottom - top + 12}" fill="${c.accentSoft}" opacity="0.7"/>
  ${[0.5, 0.8].map((t) => `<line x1="${x(t)}" y1="${top - 6}" x2="${x(t)}" y2="${bottom + 6}" stroke="${c.ink3}" stroke-width="1" stroke-dasharray="3 4"/>`).join('')}
  ${rows.map(row).join('')}
  <line x1="${x0}" y1="${bottom + 6}" x2="${x1}" y2="${bottom + 6}" stroke="${c.line}"/>
  ${ticks.map((t) => `<text x="${x(t)}" y="${bottom + 25}" text-anchor="middle" font-family="${MONO}" font-size="12" fill="${c.ink3}">${t * 100}%</text>`).join('')}
  <text x="${W / 2}" y="${H - 8}" text-anchor="middle" font-family="${SANS}" font-size="12.5" fill="${c.ink3}">${esc(s.chartNote(rows.length))}</text>
</svg>`;
}

// Two lanes: what the tool does by itself, and the only two places it needs a person.
function flow(s, c) {
  const W = 960; const boxW = 142; const gap = 13; const boxH = 84;
  const lane = (title, steps, y) => {
    const boxes = steps.map(([t, sub, you], i) => {
      const x = 12 + i * (boxW + gap);
      const arrow = i < steps.length - 1 ? `<path d="M${x + boxW + 2} ${y + boxH / 2} h${gap - 5} m-4 -4 l4 4 l-4 4" fill="none" stroke="${c.ink3}" stroke-width="1.5"/>` : '';
      const tag = you
        ? `<rect x="${x + 10}" y="${y + 9}" width="${s.you.length > 1 ? 34 : 24}" height="17" rx="8.5" fill="${c.accent}"/><text x="${x + 10 + (s.you.length > 1 ? 17 : 12)}" y="${y + 21.5}" text-anchor="middle" font-family="${SANS}" font-size="10.5" font-weight="700" fill="${c.card}">${esc(s.you)}</text>`
        : `<text x="${x + 11}" y="${y + 21.5}" font-family="${SANS}" font-size="10.5" fill="${c.ink3}">${esc(s.auto)}</text>`;
      return `
      <rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" rx="10" fill="${you ? c.accentSoft : c.card}" stroke="${you ? c.accent : c.line}" stroke-width="${you ? 2 : 1.5}"/>
      ${tag}
      <text x="${x + 11}" y="${y + 47}" font-family="${SANS}" font-size="14.5" font-weight="700" fill="${c.ink}">${esc(t)}</text>
      <text x="${x + 11}" y="${y + 67}" font-family="${SANS}" font-size="${sub.length > 24 ? 10 : 11}" fill="${c.ink2}">${esc(sub)}</text>
      ${arrow}`;
    }).join('');
    return `<text x="12" y="${y - 12}" font-family="${SANS}" font-size="15" font-weight="700" fill="${c.ink}">${esc(title)}</text>${boxes}`;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 262" width="${W}" height="262" role="img" aria-label="${esc(s.lane1)}: ${s.flow1.map((f) => esc(f[0])).join(', ')}. ${esc(s.lane2)}: ${s.flow2.map((f) => esc(f[0])).join(', ')}.">
  ${lane(s.lane1, s.flow1, 30)}
  ${lane(s.lane2, s.flow2, 164)}
</svg>`;
}

// A terminal replaying the real output of the free layer. Only the absolute path line and the per-check detail are cut.
function terminal() {
  const target = 'step0/examples/csv-dedupe';
  const text = execFileSync(process.execPath, ['bin/skillgauntlet.js', 'static', target, '--lang', 'en'], { cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  const lines = text.split('\n');
  const grab = (re) => lines.find((l) => re.test(l)) || '';
  const groups = lines.filter((l) => /^\| [A-E] /.test(l)).map((l) => l.split('|').map((p) => p.trim()).filter(Boolean));
  if (groups.length !== 5) throw new Error('unexpected static output: the verdict table was not found');
  const mark = { pass: ['✓ pass', '#3fb950'], warn: ['! warn', '#d29922'], fail: ['✗ fail', '#f85149'] };
  const rows = [
    ['cmd', `$ npx skillgauntlet static ${target}`],
    ['head', grab(/^# /).replace(/^# /, '')],
    ['dim', grab(/^- SKILL\.md/).replace(/^- /, '')],
    ['dim', grab(/^- Package/).replace(/^- /, '')],
    ['gap', ''],
    ...groups.map((g) => ['group', g]),
    ['gap', ''],
    ['dim', 'No model calls. No quota spent.'],
  ];
  let y = 66;
  let n = 0;
  const body = rows.map(([kind, v]) => {
    if (kind === 'gap') { y += 12; return ''; }
    const delay = kind === 'cmd' ? 0.2 : 0.9 + n * 0.16;
    if (kind !== 'cmd') n += 1;
    const yy = y; y += 25;
    const open = `<g class="l" style="animation-delay:${delay.toFixed(2)}s">`;
    if (kind === 'cmd') return `${open}<text x="26" y="${yy}" font-size="15.5" font-weight="600" fill="#f0f6fc">${esc(v)}</text></g>`;
    if (kind === 'head') return `${open}<text x="26" y="${yy}" font-size="15" font-weight="700" fill="#FB923C">${esc(v)}</text></g>`;
    if (kind === 'dim') return `${open}<text x="26" y="${yy}" font-size="14" fill="#9da7b3">${esc(v)}</text></g>`;
    const [name, verdict] = v;
    const [label, color] = mark[verdict] || [verdict, '#9da7b3'];
    return `${open}<text x="26" y="${yy}" font-size="14.5" fill="#e6edf3">${esc(name)}</text><text x="340" y="${yy}" font-size="14.5" font-weight="600" fill="${color}">${esc(label)}</text></g>`;
  }).join('\n  ');
  const H = y + 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 ${H}" width="640" height="${H}" role="img" aria-label="Terminal running the free static layer on an example skill and printing a verdict per group.">
  <style>
    .l { opacity: 0; animation: in .25s ease-out forwards; }
    text { font-family: ${MONO}; }
    @keyframes in { to { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .l { animation: none; opacity: 1; } }
  </style>
  <rect width="640" height="${H}" rx="12" fill="#0d1117"/>
  <rect x=".5" y=".5" width="639" height="${H - 1}" rx="11.5" fill="none" stroke="#30363d"/>
  <circle cx="24" cy="22" r="6" fill="#f85149"/><circle cx="44" cy="22" r="6" fill="#d29922"/><circle cx="64" cy="22" r="6" fill="#3fb950"/>
  ${body}
</svg>`;
}

const data = JSON.parse(fs.readFileSync(path.join(root, 'step0/data/leaderboard-maintainer.json'), 'utf8'));
const haiku = data.entries.filter((e) => e.host === 'claude-code' && e.model === 'claude-haiku-5-5').sort((a, b) => b.recall - a.recall);

for (const [lang, s] of Object.entries(STRINGS)) {
  for (const [theme, c] of Object.entries(THEMES)) {
    write(`hero-${lang}-${theme}.svg`, hero(s, c));
    write(`recall-${lang}-${theme}.svg`, chart(s, c, haiku));
    write(`flow-${lang}-${theme}.svg`, flow(s, c));
  }
}
write('terminal.svg', terminal());
console.log(`wrote ${fs.readdirSync(out).length} files to ${path.relative(root, out)}; ${haiku.length} skills in the chart`);
