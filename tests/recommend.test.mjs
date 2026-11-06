// Suggesting a leaderboard row to test: untrusted lists, the offline fallback, and the pinned clone. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bundledRows, contractedSkills, loadSuggestions, pickSuggestions } from '../lib/recommend.js';
import { resolvePinned } from '../lib/discover.js';
import { buildRows } from '../scripts/build-leaderboard.mjs';
import { repoLabel, rowList } from '../scripts/build-pages.mjs';

const C = 'a'.repeat(40);
const row = (over = {}) => ({ skill: 's', repo: 'https://github.com/o/r', subdir: 'skills/s', commit: C, host: 'claude-code', model: 'claude-haiku-5-5', grade: 'fair', tag: 'maintainer run', qPos: 20, ...over });
const pick = (rows) => pickSuggestions(rows, { contracted: [] });

test('only an unconfirmed, gradeable row on the default host and model is suggested', () => {
  assert.equal(pick([row()]).length, 1);
  for (const over of [{ tag: 'confirmed (maintainer run + community)' }, { tag: 'community single sample' }, { grade: 'disagree' }, { grade: 'insufficient' }, { host: 'codebuddy' }, { model: 'deepseek-v4-flash' }]) {
    assert.equal(pick([row(over)]).length, 0, JSON.stringify(over));
  }
});

test('anything that would leave a repository or reach a shell is refused, the list being untrusted', () => {
  for (const over of [{ repo: 'https://evil.example/o/r' }, { repo: 'https://github.com/o/r/../../x' }, { repo: 'https://github.com/o/r;rm' }, { commit: 'main' }, { commit: `${C};rm` },
    { subdir: '../../etc' }, { subdir: '/etc' }, { subdir: 'a/../b' }, { subdir: 'a\\b' }, { skill: '$(x)' }, { skill: null }]) {
    assert.equal(pick([row(over)]).length, 0, JSON.stringify(over));
  }
  for (const junk of [null, 'x', {}, [null, 3]]) assert.deepEqual(pick(junk), []);
});

test('the smallest question set comes first, the list is short, and skills with a gain contract are left out', () => {
  const rows = [row({ skill: 'big', qPos: 40 }), row({ skill: 'small', qPos: 8 }), ...['a', 'b', 'c', 'd', 'e'].map((skill) => row({ skill, qPos: 30 }))];
  const got = pick(rows);
  assert.equal(got.length, 5);
  assert.equal(got[0].skill, 'small');
  assert.deepEqual(pickSuggestions([row({ skill: 'tdd' })], { contracted: ['tdd'] }), []);
  assert.ok(contractedSkills().includes('tdd'));
});

test('the data shipped in the package gives suggestions when the site cannot be reached', async () => {
  const got = await loadSuggestions({ remote: async () => { throw new Error('offline'); } });
  assert.ok(got.length >= 1);
  assert.ok(!got.some((s) => contractedSkills().includes(s.skill)));
  for (const s of got) assert.match(s.commit, /^[0-9a-f]{40}$/);
  assert.ok(bundledRows().length > 0);
  assert.deepEqual(await loadSuggestions({ remote: async () => [row({ skill: 'live' })], bundled: () => [] }).then((l) => l.map((s) => s.skill)), ['live']);
  assert.deepEqual(await loadSuggestions({ remote: async () => { throw new Error('x'); }, bundled: () => [] }), []);
});

test('the site list carries what the suggestion needs, and a confirmed row drops out of it', () => {
  const entry = (over) => ({ source: 'maintainer', skill: 's', repo: 'https://github.com/o/r', subdir: 'x', commit: C, host: 'claude-code', model: 'claude-haiku-5-5', grade: 'fair', recall: 0.6, recallCi: [0.4, 0.8], fpr: 0, fprCi: [0, 0.1], qPos: 10, qNeg: 10, date: '2026-10-29', links: ['a/'], contributor: null, ...over });
  const alone = rowList(buildRows([entry()])).rows;
  assert.equal(pick(alone).length, 1);
  const confirmed = rowList(buildRows([entry(), entry({ source: 'community', contributor: 'ann', links: ['b/'] })])).rows;
  assert.equal(pick(confirmed).length, 0);
  assert.equal(repoLabel('https://github.com/o/r'), 'o/r');
});

test('a pinned clone lands on that commit, not the newest, and is reused', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-pin-'));
  const before = process.env.SKILLGAUNTLET_CACHE;
  process.env.SKILLGAUNTLET_CACHE = path.join(root, 'cache');
  const calls = [];
  const exec = (cmd, args) => {
    calls.push(args.slice(2).join(' '));
    if (args[2] === 'rev-parse') { if (calls.includes(`checkout -q FETCH_HEAD`)) return `${C}\n`; throw new Error('no repo'); }
    return '';
  };
  try {
    const r = resolvePinned('https://github.com/o/r', C, { exec });
    assert.ok(r.dir.endsWith(`o__r@${C}`));
    assert.deepEqual(r.source, { repo: 'https://github.com/o/r', commit: C, ref: null });
    assert.ok(calls.includes(`fetch -q --depth 1 origin ${C}`));
    assert.ok(calls.includes('remote add origin https://github.com/o/r.git'));
    const n = calls.length;
    resolvePinned('https://github.com/o/r', C, { exec });
    assert.equal(calls.length, n + 1, 'only the check that it is already there');
    assert.throws(() => resolvePinned('https://evil.example/o/r', C, { exec }), /cannot read/);
    assert.throws(() => resolvePinned('https://github.com/o/r', '--upload-pack=x', { exec }), /cannot read/);
  } finally {
    if (before === undefined) delete process.env.SKILLGAUNTLET_CACHE; else process.env.SKILLGAUNTLET_CACHE = before;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
