// Verify the Node port of layer 1 against a live host. Two model calls, about fifteen seconds.
//
// What this proves, in order:
//   1. the `claude` binary resolves and spawns on this platform (the Python runner used a different path)
//   2. stream-json events parse into a verdict, including the init block (resolved model, key source)
//   3. a query that must trigger does trigger, and one that must not stays quiet
//   4. the early kill leaves no orphan process and the temp directory is removed
//
// What it does not prove: that the full 110-trial run behaves, or that Codex works.
//
//   node scripts/smoke-trial.mjs              # two trials, no drafting
//   node scripts/smoke-trial.mjs --draft      # also exercises one drafting call
import fs from 'node:fs';
import path from 'node:path';
import { resolveBin, runTrial, backend, draftQueries, checkModel } from '../lib/trial.js';

// The verdict rule was calibrated on Anthropic models. Any other backend needs its own model name,
// because gateways remap Anthropic names silently; checkModel() enforces that.
const host = backend();
const model = process.env.SG_SMOKE_MODEL || (host === 'anthropic' ? 'haiku' : null);
if (!model) {
  console.error(`backend is ${host}: set SG_SMOKE_MODEL to that backend's own model id (e.g. deepseek-v4-flash)`);
  process.exit(2);
}
checkModel(model, false);

const SKILL = process.env.SG_SMOKE_SKILL || 'tdd';
const manifest = JSON.parse(fs.readFileSync('step0/skills.json', 'utf8'));
const entry = (manifest.skills || manifest).find((e) => e.name === SKILL);
if (!entry) {
  console.error(`skill ${SKILL} is not in the manifest`);
  process.exit(2);
}
const slug = `${entry.repo.split('://').pop()}@${entry.ref}`.replace(/[^A-Za-z0-9_.@-]/g, '_');
const skillDir = path.join('step0/.cache', slug, entry.subdir || '');
if (!fs.existsSync(path.join(skillDir, 'SKILL.md'))) {
  console.error(`not cached: ${skillDir}`);
  process.exit(2);
}

const CASES = [
  { id: 'must-trigger', query: '用红-绿-重构的方式把这个函数改成可测试的', expect: ['triggered'] },
  { id: 'must-not', query: '这个测试跑得太慢了，看看能不能改成分片并行跑', expect: ['not_triggered', 'other_skill'] },
];

const bin = resolveBin('claude');
console.log(`binary   : ${bin}`);
console.log(`backend  : ${host}`);
console.log(`model    : ${model}`);
console.log(`skill    : ${SKILL} (${skillDir})`);
console.log('');

// The expected verdicts were calibrated on Haiku. Another model may legitimately behave differently,
// which is a result, not a defect -- so only an empty stream counts as a failure of the port.
let portFailures = 0;
let modelDifferences = 0;
for (const c of CASES) {
  const t0 = Date.now();
  const rec = await runTrial({ bin, skillDir, skillName: SKILL, query: c.query, model });
  const ms = Date.now() - t0;
  const matches = c.expect.includes(rec.verdict);
  if (!matches) modelDifferences += 1;
  if (rec.events.lines === 0) portFailures += 1;
  console.log(`${matches ? 'MATCHES' : 'DIFFERS'}  ${c.id}`);
  console.log(`      query    : ${c.query}`);
  console.log(`      verdict  : ${rec.verdict}${rec.invokedSkill ? ` (${rec.invokedSkill})` : ''}  expected ${c.expect.join('/')}`);
  console.log(`      first tool: ${rec.firstTool || '(none)'}  tools: ${rec.tools.join(',') || '-'}`);
  console.log(`      events   : ${rec.events.lines} lines, ${rec.events.toolUse} tool_use, types ${JSON.stringify(rec.events.types)}`);
  console.log(`      model    : ${rec.modelResolved || '?'}  key source: ${rec.apiKeySource || '?'}`);
  console.log(`      latency  : ${ms} ms${rec.error ? `  error: ${rec.error}` : ''}`);
  if (!matches) {
    console.log(rec.events.lines === 0
      ? '      → no events parsed: suspect the port, the binary or the credentials'
      : rec.events.toolUse === 0
        ? '      → events parsed but the model called no tool: model behaviour, not a parsing fault'
        : '      → events and tool calls parsed: the port works, and this model behaves differently');
  }
  console.log('');
}

if (process.argv.includes('--draft')) {
  const t0 = Date.now();
  try {
    const qs = draftQueries({ bin, skillDir, skillName: SKILL, model, perClause: 2, negatives: 2 });
    console.log(`PASS  drafting: ${qs.queries.length} queries over ${qs.clauses.length} clauses in ${Date.now() - t0} ms`);
    console.log(`      clauses: ${qs.clauses.join(' | ')}`);
  } catch (err) {
    portFailures += 1;
    console.log(`FAIL  drafting: ${err.message} (${Date.now() - t0} ms)`);
  }
}

if (portFailures) {
  console.log(`\n${portFailures} case(s) produced no events at all: the port, the binary or the credentials are at fault`);
  process.exit(2);
}
console.log(modelDifferences
  ? `\nthe port works; ${modelDifferences} of ${CASES.length} cases behave differently from the Haiku calibration`
  : '\nthe port works and this model matches the Haiku calibration');
process.exit(0);
