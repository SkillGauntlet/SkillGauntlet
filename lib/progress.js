// The wait for the trials. On a terminal the bar is drawn at once (0 of N) and redrawn every second with the seconds
// elapsed, so there is something on screen from the moment the trials start rather than after the first one finishes;
// a trial can take many seconds. `total` is known when a run starts; a resumed run learns it from its first trial.
// Without a terminal each finished trial is one line. finish() stops the redraw and ends the line.
import { t } from './i18n.js';
import { bar } from './chart.js';

export function makeProgress(total = 0, {
  tty = Boolean(process.stdout.isTTY),
  write = (s) => process.stdout.write(s),
  line = (s) => process.stdout.write(`${s}\n`),
  now = Date.now,
  every = setInterval,
  stopEvery = clearInterval,
} = {}) {
  const started = now();
  let finished = 0;
  let of = total;
  let timer = null;
  let open = false;
  const draw = () => {
    open = true;
    write(`\r\x1b[2K  ${t('progressLine')} ${bar(of ? finished / of : 0, 24)} ${finished}/${of || '?'}  ${t('waitElapsed', { s: Math.floor((now() - started) / 1000) })}`);
  };
  const stop = () => {
    if (timer) stopEvery(timer);
    timer = null;
    if (tty && open) { write('\n'); open = false; }
  };
  if (tty && total) {
    draw();
    timer = every(draw, 1000);
  }
  const onTrial = ({ row, done, total: n }) => {
    finished = done;
    of = n;
    if (tty) {
      if (!timer) timer = every(draw, 1000);
      draw();
      if (done >= n) stop();
      return;
    }
    const mark = { triggered: '✓', not_triggered: '·', other_skill: '↷' }[row.verdict] || '!';
    line(`  [${done}/${n}] ${mark} ${row.queryId}#${row.run} → ${row.verdict}`);
  };
  onTrial.finish = stop;
  return onTrial;
}
