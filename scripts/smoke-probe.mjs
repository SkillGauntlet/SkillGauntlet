// Exercise the Codex probe end to end: two runs, with and without a skill, on a task that must
// touch files. The smoke test earlier could not reach this path -- read-only sandbox refuses every
// exec_command, so no command_execution or file_change item ever appeared.
//
//   node scripts/smoke-probe.mjs [skillDir] [prompt]
import fs from 'node:fs';
import path from 'node:path';
import { probeActivation } from '../lib/codex.js';
import { resolveBin } from '../lib/trial.js';

const skillDir = path.resolve(process.argv[2] || 'step0/examples/csv-dedupe');
const prompt = process.argv[3]
  || 'Create people.csv with a header row and three rows where two are identical, then make a copy with duplicates removed. Then stop.';
const skillName = path.basename(skillDir);

if (!fs.existsSync(path.join(skillDir, 'SKILL.md'))) {
  console.error(`no SKILL.md in ${skillDir}`);
  process.exit(2);
}

console.log(`skill  : ${skillName}`);
console.log(`prompt : ${prompt}\n`);

const probe = await probeActivation({
  bin: resolveBin('codex'),
  skillDir,
  skillName,
  query: prompt,
  model: process.env.SG_SMOKE_MODEL || null,
  timeout: 300,
});

const show = (label, r) => {
  console.log(`${label}`);
  console.log(`  events      : ${r.eventCount} (${r.eventTypes.join(', ') || '-'})`);
  console.log(`  item types  : ${r.itemTypes.join(', ') || '-'}`);
  console.log(`  turn        : ${r.completed ? 'completed' : 'did not complete'}`);
  console.log(`  first action: ${r.firstAction ? `${r.firstAction.kind} — ${r.firstAction.detail}` : '(none)'}`);
  console.log(`  created     : ${r.createdFiles.join(', ') || '-'}`);
  console.log(`  patch items : ${r.changedFiles.join(', ') || '-'}`);
  console.log(`  tokens      : ${r.tokenUsage ? `${r.tokenUsage.input_tokens} in / ${r.tokenUsage.output_tokens} out` : '-'}`);
  if (r.errors?.length) console.log(`  errors      : ${r.errors.join(' | ')}`);
  console.log(`  said        : ${(r.finalMessage || '').slice(0, 200)}`);
  console.log('');
};

show('WITH the skill', probe.withSkill);
show('WITHOUT the skill', probe.without);

console.log(`first action kind identical : ${probe.actionKindIdentical}`);
console.log(`files produced identical    : ${probe.artifactsIdentical}`);

const observed = probe.withSkill.itemTypes.some((t) => t === 'command_execution' || t === 'file_change');
if (!observed) {
  console.log('\nNo command_execution or file_change item appeared, so the action path is still unexercised.');
  process.exit(1);
}
const wrote = probe.withSkill.createdFiles.length > 0;
console.log(wrote
  ? '\nthe action path works: commands ran and the filesystem diff recorded what they produced'
  : '\ncommands ran but nothing was created; compare the two runs by first action only');
