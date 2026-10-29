// One Codex call, to confirm the event schema the adapter was written against.
//
// The adapter's shape came from strings inside codex.exe: turn.* / item.* events and the item types
// command_execution, mcp_tool_call, file_change, todo_list, agent_message, user_message,
// agent_reasoning -- and no skill item, which is why Codex has no comparable trigger rate.
// This script checks that against a live stream and prints anything the adapter would not recognise.
//
//   node scripts/smoke-codex.mjs             # read-only, no file writes
//   node scripts/smoke-codex.mjs --dump      # also write the raw JSONL to smoke-codex.jsonl
import fs from 'node:fs';
import { runCodexTrial } from '../lib/codex.js';
import { resolveBin } from '../lib/trial.js';

const bin = resolveBin('codex');
console.log(`binary : ${bin}`);
console.log(`prompt : list the files in this directory, then stop\n`);

const rec = await runCodexTrial({
  bin,
  skillDir: null,
  skillName: null,
  query: 'List the files in this directory, then stop.',
  model: process.env.SG_SMOKE_MODEL || null,
  sandbox: 'read-only',
  keepDir: Boolean(process.argv.includes('--dump')),
});

console.log(`events : ${rec.eventCount} lines`);
console.log(`event types: ${rec.eventTypes.join(', ') || '(none)'}`);
console.log(`item types : ${rec.itemTypes.join(', ') || '(none)'}`);
console.log(`turn       : ${rec.completed ? 'completed' : 'did not complete'}`);
if (rec.errors?.length) console.log(`error      : ${rec.errors.join(' | ')}`);
console.log(`first action: ${rec.firstAction ? `${rec.firstAction.kind} — ${rec.firstAction.detail}` : '(none)'}`);
console.log(`changed     : ${rec.changedFiles.join(', ') || '-'}`);
console.log(`tokens      : ${JSON.stringify(rec.tokenUsage)}`);
console.log(`latency     : ${rec.latencyMs} ms`);
if (rec.unknownItemTypes.length) console.log(`UNKNOWN item types (adapter must learn these): ${rec.unknownItemTypes.join(', ')}`);
if (rec.stderr) console.log(`stderr      : ${rec.stderr}`);
console.log(`\nfinal message:\n${rec.finalMessage || '(empty)'}`);

if (rec.dir) {
  fs.writeFileSync('smoke-codex.jsonl', `${JSON.stringify(rec, null, 2)}\n`);
  console.log('\nraw record written to smoke-codex.jsonl');
}

if (rec.eventCount === 0) {
  const err = (rec.stderr || '').toLowerCase();
  if (/quota|expired|subscription|billing|payment|plan/.test(err)) {
    console.log('\nno events: the account looks out of quota or its plan expired. A failed authorisation costs nothing; check `codex login status` and the plan.');
  } else if (/401|403|unauthor/.test(err)) {
    console.log('\nno events: authorisation rejected. Run `codex login` again.');
  } else {
    console.log('\nno events: check that `codex exec --json` writes JSONL to stdout and that codex is logged in.');
  }
  process.exit(1);
}
