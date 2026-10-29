// Validate every contract file without spending a token: shape, known types, compilable patterns,
// and the property that matters most -- a contract must FAIL on a workspace where nothing was done.
// A contract that passes on an untouched fixture is measuring nothing.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { evaluateContract } from '../lib/gain.js';

const DIR = 'contracts';
const TYPES = new Set(['files_added_matching', 'no_files_matching', 'file_contains', 'command_succeeds']);
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'));
let problems = 0;
let total = 0;

function fail(msg) {
  problems += 1;
  console.log(`  FAIL ${msg}`);
}

for (const file of files) {
  const spec = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
  console.log(`${file}`);
  let fileTotal = 0;
  if (!spec.skill) fail('no skill name');
  if (!spec.tasks?.length) fail('no tasks');
  if (!spec.contracts?.length && !spec.tasks?.some((t) => t.contracts?.length)) fail('no contracts');

  const all = [...(spec.contracts || []), ...(spec.tasks || []).flatMap((t) => t.contracts || [])];
  for (const c of all) {
    if (!TYPES.has(c.type)) fail(`unknown type ${c.type}`);
    if (!c.desc) fail(`contract without a description: ${JSON.stringify(c)}`);
    for (const key of ['glob', 'regex']) {
      if (!c[key]) continue;
      const pattern = key === 'glob'
        ? c[key].replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '(?:.*/)?').replace(/\*/g, '[^/]*')
        : c[key];
      try { new RegExp(pattern); } catch { fail(`bad ${key}: ${c[key]}`); }
    }
  }

  // Each task's fixture, untouched: every contract should be false. Contracts may sit on the task
  // (the common case) or at skill level for ones that apply to all tasks.
  for (const task of spec.tasks || []) {
    const contracts = task.contracts?.length ? task.contracts : (spec.contracts || []);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-contract-'));
    for (const [rel, content] of Object.entries(task.files || {})) {
      const p = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, content);
    }
    for (const c of contracts) {
      if (evaluateContract(c, tmp, [])) fail(`${task.id}: contract passes on an untouched fixture -> "${c.desc}"`);
    }
    fs.rmSync(tmp, { recursive: true, force: true });
    fileTotal += contracts.length;
    total += contracts.length;
  }
  console.log(`  ${spec.tasks?.length || 0} tasks, ${fileTotal} contracts`);
}

console.log(problems ? `\n${problems} problem(s)` : `\n${files.length} contract file(s) sound, ${total} contracts total`);
process.exit(problems ? 1 : 0);
