#!/usr/bin/env node
// Zero-request probe of what a trial is offered: starts the CLI the way runTrial does, waits for the
// stream-json `init` event (it carries the tool list), and kills the process at once. The init event
// is printed before the first model request, so nothing is billed. Compares the inherited environment
// with the trial environment (host-injected CLAUDE_CODE_* variables removed).
//
//   node scripts/init-probe.mjs [--model haiku]
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveBin, trialEnv } from '../lib/trial.js';
import { launchSpec } from '../lib/spawn.js';

const mi = process.argv.indexOf('--model');
const model = mi >= 0 ? process.argv[mi + 1] : 'haiku';
const bin = resolveBin('claude');

function killTree(child) {
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore' });
    else child.kill('SIGKILL');
  } catch { /* already gone */ }
}

function initOf(env) {
  return new Promise((resolve) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-init-'));
    const args = ['-p', 'hi', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'dontAsk',
      '--setting-sources', 'project', '--strict-mcp-config', '--no-session-persistence', '--model', model];
    const launch = launchSpec(bin, args, 'claude');
    const child = spawn(launch.cmd, launch.args, { cwd: tmp, shell: launch.shell, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    let done = false;
    const end = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      killTree(child);
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
      resolve(value);
    };
    const timer = setTimeout(() => end(null), 60000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (c) => {
      buf += c;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        let ev;
        try { ev = JSON.parse(line); } catch { continue; }
        if (ev.type === 'system' && ev.subtype === 'init') return end(ev);
        if (ev.type === 'result') return end({ result: ev });
      }
    });
    child.on('close', () => end(null));
    child.on('error', () => end(null));
  });
}

const inherited = await initOf({ ...process.env });
const clean = await initOf(trialEnv());
const names = (ev) => [...(ev?.tools || [])].sort();
for (const [label, ev] of [['inherited environment', inherited], ['trial environment', clean]]) {
  console.log(`== ${label}: ${names(ev).length} tools, apiKeySource=${ev?.apiKeySource ?? '?'}`);
  console.log('  ', names(ev).join(', ') || JSON.stringify(ev));
}
const a = new Set(names(inherited));
const b = new Set(names(clean));
console.log('only in inherited:', [...a].filter((x) => !b.has(x)).sort());
console.log('only in trial env:', [...b].filter((x) => !a.has(x)).sort());
console.log('Artifact in trial tools:', [...b].some((x) => /^Artifact/.test(x)));
const dropped = Object.keys(process.env).filter((k) => !(k in trialEnv())).sort();
console.log('variables removed:', dropped);
