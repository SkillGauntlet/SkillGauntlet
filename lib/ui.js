// Prompts. Interactive use is meant to be driven by arrow keys and single keys (y/n, enter);
// when stdin is a pipe there is no terminal to draw on, so every prompt falls back to numbers.
//
// Lines are queued rather than read with rl.question(): when stdin is a pipe, every line arrives
// before the first prompt and readline drops the ones nobody was waiting for, which silently ends
// the run mid-flow.
import readline, { emitKeypressEvents } from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import { words, t } from './i18n.js';

// Thrown by a list when the user presses ← or Esc: the caller goes back one question.
export class Back extends Error {
  constructor() { super('back'); this.name = 'Back'; }
}
let backEnabled = false;
export const setBack = (on) => { backEnabled = on; };

let rl = null;
const queue = [];
const waiters = [];

function getRl() {
  if (!rl) {
    rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
    rl.on('line', (line) => {
      const w = waiters.shift();
      if (w) w(line);
      else queue.push(line);
    });
    rl.on('close', () => {
      while (waiters.length) waiters.shift()(null);
    });
  }
  input.resume();
  return rl;
}

// Give the terminal back to raw-mode prompts without losing buffered pipe input.
export function pauseUi() {
  if (rl) {
    rl.removeAllListeners('line');
    rl.close();
    rl = null;
  }
}

export function closeUi() {
  pauseUi();
}

export const hasTerminal = () => Boolean(input.isTTY);

export function say(line = '') {
  output.write(`${line}\n`);
}

function readLine() {
  getRl();
  if (queue.length) return Promise.resolve(queue.shift());
  return new Promise((resolve) => { waiters.push(resolve); });
}

export async function ask(question, def = '') {
  const suffix = def === '' ? '' : ` [${def}]`;
  output.write(`${question}${suffix}: `);
  const line = await readLine();
  if (line === null) throw new Error('EOF');
  if (!input.isTTY) output.write('\n'); // a pipe does not echo, so the next prompt would collide
  return line.trim() || def;
}

export async function confirm(question, def = false) {
  if (input.isTTY) {
    return select(question, [{ label: t('ui.no'), value: false }, { label: t('ui.yes'), value: true }], def ? 1 : 0, { hotkeys: { y: 1, n: 0 } });
  }
  const hint = def ? 'Y/n' : 'y/N';
  for (;;) {
    const a = (await ask(`${question} (${hint})`, '')).toLowerCase();
    if (!a) return def;
    // Answers are matched against the current language's list (e.g. はい / いいえ) plus plain y / n.
    if (['y', 'yes', ...words('ui.yesWords')].includes(a)) return true;
    if (['n', 'no', ...words('ui.noWords')].includes(a)) return false;
    say('  y / n');
  }
}

// options: [{ label, hint, value }]. Arrow keys when a terminal is available, numbers otherwise.
export async function choose(title, options, def = 1) {
  if (input.isTTY) return select(title, options, def - 1);
  say('');
  say(title);
  options.forEach((o, i) => say(`  ${i + 1}) ${o.label}${o.hint ? `   ${o.hint}` : ''}`));
  for (;;) {
    const a = await ask('>', String(def));
    const n = Number.parseInt(a, 10);
    if (Number.isInteger(n) && n >= 1 && n <= options.length) return options[n - 1].value;
    say(`  1–${options.length}`);
  }
}

// opts.clear: erase the list once an entry is chosen, so a caller that shows the next level right away redraws
// in the same place instead of stacking lists down the terminal.
export async function select(title, options, defIndex = 0, opts = {}) {
  if (!input.isTTY) {
    say('');
    say(title);
    options.forEach((o, i) => say(`  ${i + 1}) ${o.label}${o.hint ? `   ${o.hint}` : ''}`));
    for (;;) {
      const a = await ask('>', String(defIndex + 1));
      const n = Number.parseInt(a, 10);
      if (Number.isInteger(n) && n >= 1 && n <= options.length) return options[n - 1].value;
      say(`  1–${options.length}`);
    }
  }
  pauseUi();
  let idx = Math.min(Math.max(defIndex, 0), options.length - 1);
  emitKeypressEvents(input);
  if (input.setRawMode) input.setRawMode(true);
  input.resume();
  // A window keeps the redraw line count constant (wrapping breaks the cursor maths) and keeps a
  // 69-skill list navigable with arrows alone.
  const WINDOW = 8;
  const width = Math.min(48, Math.max(...options.map((o) => o.label.length)));
  let first = true;
  let height = 0;
  const render = () => {
    const size = Math.min(WINDOW, options.length);
    const start = Math.min(Math.max(0, idx - Math.floor(size / 2)), Math.max(0, options.length - size));
    const lines = [options.length > WINDOW ? `${title}  (${start + 1}–${start + size}/${options.length})` : title];
    for (let i = start; i < start + size; i += 1) {
      const o = options[i];
      const label = o.label.length > width ? `${o.label.slice(0, width - 1)}…` : o.label.padEnd(width);
      const body = i === idx ? `\x1b[7m▶ ${label} \x1b[0m` : `  ${label} `;
      lines.push(`${body}${o.hint ? `  ${o.hint}` : ''}`);
    }
    if (backEnabled && !opts.noBack) lines.push(`\x1b[2m${t('backHint')}\x1b[0m`);
    height = lines.length;
    if (first) {
      output.write(`\n${lines.join('\n')}\n`);
      first = false;
    } else {
      output.write(`\x1b[${lines.length}A`);
      for (const line of lines) output.write(`\x1b[2K${line}\n`);
    }
  };
  render();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      input.removeListener('keypress', onKey);
      if (input.setRawMode) input.setRawMode(false);
      input.pause();
    };
    const onKey = (ch, key = {}) => {
      if (key.name === 'up' || ch === 'k') {
        idx = (idx - 1 + options.length) % options.length;
        render();
      } else if (key.name === 'down' || ch === 'j') {
        idx = (idx + 1) % options.length;
        render();
      } else if (key.name === 'return' || key.name === 'enter') {
        cleanup();
        if (opts.clear) output.write(`\x1b[${height + 1}A\x1b[J`);
        resolve(options[idx].value);
      } else if ((key.name === 'escape' || key.name === 'left') && backEnabled && !opts.noBack) {
        cleanup();
        output.write(`\x1b[${height + 1}A\x1b[J`);
        reject(new Back());
      } else if (key.ctrl && key.name === 'c') {
        cleanup();
        reject(new Error('interrupted'));
      } else if (ch && opts.hotkeys && Object.hasOwn(opts.hotkeys, ch.toLowerCase())) {
        idx = opts.hotkeys[ch.toLowerCase()];
        render();
      } else if (ch && /^[1-9]$/.test(ch) && Number(ch) <= options.length) {
        idx = Number(ch) - 1;
        render();
      }
    };
    input.on('keypress', onKey);
  });
}
