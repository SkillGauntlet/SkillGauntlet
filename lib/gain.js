// Layer 2: gain. "Does the skill actually help" can only be answered honestly by pairing a task
// with a verifier that code can decide -- a test that passes, a file that appears, a value that
// matches. An LLM judge would give a general answer at the cost of being expensive, biased and
// not reproducible, so it is deliberately not implemented.
//
// Contract DSL (contracts/<skill>.json):
//   { "skill": "tdd",
//     "tasks":    [{ "id": "t1", "prompt": "…", "files": { "calc.py": "…" } }],
//     "contracts":[ { "desc": "a test file was added", "type": "files_added_matching", "glob": "**/*test*",
//                     "descI18n": { "zh": "新增了测试文件", "ja": "テストファイルが追加された" } },
//                   { "desc": "tests pass",            "type": "command_succeeds",     "cmd": "python -m pytest -q" },
//                   { "desc": "output contains a formula", "type": "file_contains",   "glob": "out.csv", "regex": "=" } ] }
//
// "desc" is English and doubles as the stable id a contract is aggregated and archived under.
// "descI18n" (optional) holds the same sentence for other UI languages; the report picks it by
// language and falls back to "desc".
//
// A skill with no contracts file is reported as "not measurable", not guessed at.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchSpec } from './spawn.js';
import { narrowEnv } from './trial.js';

const HERE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CONTRACT_DIR = path.join(HERE, 'contracts');

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name === '.git') continue;
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else if (e.isFile()) fs.copyFileSync(s, d);
  }
}

export function loadContracts(skillName, dir = CONTRACT_DIR) {
  const file = path.join(dir, `${skillName}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function listFiles(root) {
  const out = [];
  const walk = (dir) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === '.claude' || e.name === '.git' || e.name === 'node_modules') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(path.relative(root, p).replace(/\\/g, '/'));
    }
  };
  walk(root);
  return out;
}

function globToRe(glob) {
  const body = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '(?:.*/)?').replace(/\*/g, '[^/]*');
  return new RegExp(`^${body}$`);
}

export function evaluateContract(contract, dir, before) {
  const after = listFiles(dir);
  const added = after.filter((f) => !before.includes(f));
  switch (contract.type) {
    case 'files_added_matching': {
      const re = globToRe(contract.glob);
      return added.some((f) => re.test(f));
    }
    case 'no_files_matching': {
      const re = globToRe(contract.glob);
      return !after.some((f) => re.test(f));
    }
    case 'file_contains': {
      const re = globToRe(contract.glob);
      const target = after.find((f) => re.test(f));
      if (!target) return false;
      try {
        // An .xlsx is a zip, so its entry names sit in the archive uncompressed. Reading latin1 lets
        // the same check assert that a spreadsheet is a real one without adding a zip dependency.
        const enc = contract.encoding === 'latin1' ? 'latin1' : 'utf8';
        return new RegExp(contract.regex).test(fs.readFileSync(path.join(dir, target), enc));
      } catch { return false; }
    }
    case 'command_succeeds': {
      try {
        execFileSync(contract.cmd, { cwd: dir, shell: true, stdio: 'ignore', timeout: 120000 });
        return true;
      } catch { return false; }
    }
    default:
      return null;
  }
}

function runTask({ bin, model, task, skillDir, skillName, timeout }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-gain-'));
  for (const [rel, content] of Object.entries(task.files || {})) {
    const p = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  if (skillDir) copyDir(skillDir, path.join(tmp, '.claude', 'skills', skillName));
  const before = listFiles(tmp);
  const args = ['-p', task.prompt, '--permission-mode', 'dontAsk', '--setting-sources', 'project',
    '--strict-mcp-config', '--no-session-persistence'];
  if (model) args.push('--model', model);

  return new Promise((resolve) => {
    // Not through a shell: cmd.exe would re-split the prompt on spaces (see spawn.js).
    const launch = launchSpec(bin, args, 'claude');
    const child = spawn(launch.cmd, launch.args, {
      cwd: tmp, shell: launch.shell, env: narrowEnv(), windowsHide: true, stdio: 'ignore',
    });
    const timer = setTimeout(() => {
      try {
        if (process.platform === 'win32') execFileSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore' });
        else child.kill('SIGKILL');
      } catch { /* ignore */ }
    }, timeout * 1000);
    child.on('close', () => {
      clearTimeout(timer);
      resolve({ dir: tmp, before });
    });
    child.on('error', () => { clearTimeout(timer); resolve({ dir: tmp, before }); });
  });
}

export async function runGain({ bin, skillDir, skillName, model, timeout = 600, onProgress, contractDir }) {
  const spec = loadContracts(skillName, contractDir);
  const hasContracts = spec?.contracts?.length || spec?.tasks?.some((t) => t.contracts?.length);
  if (!spec || !hasContracts || !spec.tasks?.length) {
    return { measurable: false, reasonKey: 'gain.noContracts' };
  }
  const detail = [];
  for (const task of spec.tasks) {
    // Contracts belong to the task that can satisfy them: "a divide function was added" only makes
    // sense for the task that asks for one. A skill-level list is still allowed for contracts that
    // genuinely apply to every task.
    const contracts = task.contracts?.length ? task.contracts : (spec.contracts || []);
    const row = { id: task.id, prompt: task.prompt, with: null, without: null };
    for (const condition of ['with', 'without']) {
      if (onProgress) onProgress(task.id, condition);
      const { dir, before } = await runTask({
        bin, model, task,
        skillDir: condition === 'with' ? skillDir : null,
        skillName, timeout,
      });
      const added = listFiles(dir).filter((f) => !before.includes(f));
      const checks = contracts.map((c) => ({ desc: c.desc, descI18n: c.descI18n, ok: Boolean(evaluateContract(c, dir, before)) }));
      row[condition] = { added, checks };
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
    detail.push(row);
  }
  // Aggregate by description across the tasks that use it.
  const agg = new Map();
  for (const row of detail) {
    for (const condition of ['with', 'without']) {
      for (const c of row[condition].checks) {
        const e = agg.get(c.desc) || { with: 0, without: 0, n: 0, descI18n: c.descI18n };
        e[condition] += c.ok ? 1 : 0;
        e.n += 1;
        agg.set(c.desc, e);
      }
    }
  }
  return {
    measurable: true,
    localOnly: true,
    tasks: detail,
    contracts: [...agg].map(([desc, e]) => ({ desc, descI18n: e.descI18n, with: e.with / e.n, without: e.without / e.n })),
    taskCount: detail.length,
  };
}
