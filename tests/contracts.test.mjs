// Offline tests for the shipped contract files and the static layer. No model calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../lib/static.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('scripts/check-contracts.mjs passes on every shipped contract', () => {
  const r = spawnSync(process.execPath, ['scripts/check-contracts.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /contract file\(s\) sound/);
});

test('check-contracts rejects a contract that passes on an untouched fixture', () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-contracts-'));
  try {
    fs.mkdirSync(path.join(work, 'contracts'));
    fs.mkdirSync(path.join(work, 'scripts'));
    fs.copyFileSync(path.join(root, 'scripts', 'check-contracts.mjs'), path.join(work, 'scripts', 'check-contracts.mjs'));
    // the script imports ../lib/gain.js, so link the real lib next to it
    fs.cpSync(path.join(root, 'lib'), path.join(work, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(work, 'package.json'), '{"type":"module"}');
    fs.writeFileSync(path.join(work, 'contracts', 'bad.json'), JSON.stringify({
      skill: 'bad',
      tasks: [{
        id: 't1',
        files: { 'a.txt': 'already here' },
        contracts: [{ type: 'file_contains', glob: 'a.txt', regex: 'already', desc: 'passes without any work' }],
      }],
    }));
    const r = spawnSync(process.execPath, ['scripts/check-contracts.mjs'], { cwd: work, encoding: 'utf8' });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /untouched fixture/);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
});

test('static layer smoke: analyze() on step0/examples/csv-dedupe', () => {
  const dir = path.join(root, 'step0', 'examples', 'csv-dedupe');
  const first = analyze(dir);
  assert.ok(first.stats.skillMdTokens > 0);
  assert.deepEqual(first.groups.map((g) => g.id), ['A', 'B', 'C', 'D', 'E']);
  const checks = first.groups.flatMap((g) => g.checks);
  assert.equal(checks.length, 22); // counted at run time, as the handoff requires
  for (const c of checks) assert.ok(c.id && c.titleKey && c.status, `incomplete check: ${JSON.stringify(c)}`);
  // deterministic: same directory, same result
  assert.deepEqual(analyze(dir), first);
});
