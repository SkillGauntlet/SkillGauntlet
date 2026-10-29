// A moving bar with the elapsed seconds while one blocking call runs. The calls it wraps are synchronous
// (execFileSync), so a timer in this process cannot fire; a small child process draws on the same terminal
// instead. A single model call has no real percentage, so the bar is a bouncing marker, and the seconds are the
// honest part: they show the program is alive and how long it has been.
import { spawn } from 'node:child_process';
import { stdout } from 'node:process';

export const TICKER_SCRIPT = `
const [label, elapsedTpl, abortHint, slowAfter] = process.argv.slice(1);
const W = 16;
const start = Date.now();
let i = 0;
const draw = () => {
  const s = Math.floor((Date.now() - start) / 1000);
  const pos = Math.abs(((i % (2 * (W - 3))) - (W - 3)));
  i += 1;
  let bar = '';
  for (let k = 0; k < W; k += 1) bar += k >= pos && k < pos + 3 ? '█' : '░';
  const tail = s >= Number(slowAfter) ? '  ' + abortHint : '';
  process.stdout.write('\\r\\x1b[2K  ' + label + ' ' + bar + ' ' + elapsedTpl.replace('{s}', s) + tail);
};
draw();
setInterval(draw, 250);
`;

// Runs fn() with the bar showing; returns what fn returns. Without a terminal there is nothing to draw on.
export function withTicker({ label, elapsed, abortHint, slowAfter = 90 }, fn) {
  if (!stdout.isTTY) return fn();
  const child = spawn(process.execPath, ['-e', TICKER_SCRIPT, label, elapsed, abortHint, String(slowAfter)], {
    stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true,
  });
  try {
    return fn();
  } finally {
    child.kill();
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 80); // let a last frame land before it is wiped
    stdout.write('\r\x1b[2K');
  }
}
