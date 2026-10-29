// Fixtures for the submission tests: a real run directory written by the real run writer from fake
// trials. No model is called and nothing leaves the temp directory.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openRun, querySetHash } from '../lib/runs.js';
import { executeTrials, finishRun } from '../lib/execute.js';
import { sha256 } from '../lib/submission.js';

export const tmpdir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sg-sub-'));

export const SKILL_MD = '---\nname: demo\ndescription: demo skill for tests\n---\nbody\n';
export const COMMIT = 'a'.repeat(40);
export const FACTS = { repo: 'https://github.com/example/skills', commit: COMMIT, subdir: 'skills/demo', dirty: false };

export function makeQueries(n = 6) {
  const out = [];
  for (let i = 1; i <= n; i += 1) out.push({ id: `p${i}`, query: `please do the demo thing number ${i}`, shouldTrigger: true });
  for (let i = 1; i <= n; i += 1) out.push({ id: `n${i}`, query: `an unrelated request number ${i}`, shouldTrigger: false });
  return out;
}

// leak: text planted into the first trial's error field, as real stderr capture would.
export async function makeRun({ leak = null, model = 'haiku', host = 'claude-code', runs = 2, name = 'demo', skillMd = SKILL_MD } = {}) {
  const root = tmpdir();
  const skillDir = path.join(root, name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillMd);
  const queries = makeQueries();
  const run = openRun({
    skillDir,
    skillName: name,
    host,
    backend: 'anthropic',
    model,
    runs,
    maxExplore: 0,
    depth: { id: 'quick' },
    skillFingerprint: sha256(skillMd).slice(0, 16),
    querySets: [{ id: 'main', source: 'drafted', file: 'queries-2x2.json', queries: queries.length, clauses: 1, sha256: querySetHash(queries) }],
    queries: { schema: 'skillgauntlet/queries/1', queries },
  });
  const trials = [];
  for (const q of queries) for (let i = 0; i < runs; i += 1) trials.push({ q, i });
  let n = 0;
  const doTrial = async ({ q }) => {
    n += 1;
    // positives trigger about 70% of the time, negatives never
    const hit = q.shouldTrigger && (Number(q.id.slice(1)) % 4 !== 0);
    return {
      host, verdict: hit ? 'triggered' : 'not_triggered', invokedSkill: hit ? name : null, firstTool: hit ? 'Skill' : 'Bash',
      tools: [hit ? 'Skill' : 'Bash'], exploreSteps: 0, error: n === 1 && leak ? leak : null, events: { lines: 3, toolUse: 1, types: { assistant: 1 } },
      init: n === 1 ? { model: 'claude-x', apiKeySource: 'none', claudeCodeVersion: '2.1.303 (Claude Code)', skills: ['demo', 'other'], tools: ['Bash', 'Skill'] } : undefined,
    };
  };
  await executeTrials({ run, trials, doTrial, workers: 1 });
  const result = finishRun(run, { model, backend: 'anthropic', host, runs, expected: trials.length }, null);
  return { root, skillDir, runDir: run.dir, queries, result, run };
}
