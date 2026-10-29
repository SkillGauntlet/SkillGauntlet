// Layer 0: static analysis. No model calls, no cost, reproducible: the same directory always
// yields the same result. Reports facts and flags, never a single composite score -- a weighted
// "87/100" cannot be audited or appealed, which is the one thing a rating must allow.
//
// Results carry message keys, not prose, so a scorecard is language-neutral and the report decides
// how to word it.
import fs from 'node:fs';
import path from 'node:path';
import { readFrontmatter } from './discover.js';

const CODE_EXT = new Set(['.py', '.sh', '.bash', '.zsh', '.js', '.mjs', '.cjs', '.ts', '.ps1', '.rb', '.pl', '.exe', '.bat', '.cmd']);
const SKIP_DIRS = new Set(['.git', 'node_modules', '__pycache__', '.cache', 'vendor', 'dist', 'build']);

const RE = {
  network: /\b(curl|wget|nc\s|ncat|requests\.(get|post|put)|urllib\.request|httpx\.|axios|fetch\s*\(|XMLHttpRequest|Invoke-WebRequest)\b/gi,
  exec: /\b(os\.system|os\.popen|subprocess\.(run|call|Popen|check_output)|child_process|execSync|spawnSync|eval\s*\(|exec\s*\(|Invoke-Expression)\b/g,
  secrets: /(ANTHROPIC_API_KEY|OPENAI_API_KEY|DEEPSEEK_API_KEY|AWS_SECRET|GITHUB_TOKEN|NPM_TOKEN|process\.env|os\.environ|~\/\.ssh|\/\.ssh\/|id_rsa|\.aws\/credentials|\.npmrc|\.netrc)/g,
  obfusc: /(base64\s+-d|atob\s*\(|fromCharCode|\\x[0-9a-fA-F]{2}\\x[0-9a-fA-F]{2}\\x[0-9a-fA-F]{2}|eval\(Buffer\.from)/g,
  install: /(postinstall|preinstall|prepare"\s*:)/g,
  hijack: /(ignore\s+(all\s+)?(previous|prior|above)\s+instructions|disregard\s+.{0,20}instructions|forget\s+(all\s+)?(previous|prior)|忽略(之前|以上|前面)的?(所有)?(指令|说明)|无视(之前|以上))/gi,
  exfil: /(send|post|upload|exfiltrat|上传|发送|回传).{0,40}(https?:\/\/|webhook|\burl\b)/gi,
  wide: /(\bany\b|\banything\b|\ball\s+tasks\b|\beverything\b|任何|所有任务|各种)/gi,
  triggerWords: /\b(use when|use this when|use for|should be used|designed for|trigger|when)\b|当用户|使用时机|适用于|用于/gi,
  extImage: /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g,
  zeroWidth: /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g,
};

function lineOf(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function hits(text, re, limit = 5) {
  const out = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text)) && out.length < limit) {
    out.push({ line: lineOf(text, m.index), match: m[0].trim().slice(0, 60) });
  }
  return out;
}

export function estTokens(text) {
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    if (/[\u3400-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/.test(ch)) cjk += 1;
    else other += 1;
  }
  return Math.round(cjk * 1 + other / 4);
}

function collect(skillDir) {
  const files = [];
  const walk = (dir, depth) => {
    if (depth > 6 || files.length > 3000) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(p, depth + 1);
      } else if (e.isFile()) {
        let size = 0;
        try { size = fs.statSync(p).size; } catch { /* ignore */ }
        files.push({ path: p, rel: path.relative(skillDir, p).replace(/\\/g, '/'), ext: path.extname(e.name).toLowerCase(), size });
      }
    }
  };
  walk(skillDir, 0);
  return files;
}

// A check carries its message keys and the variables to fill them.
const check = (id, status, detailKey, detailVars, evidence) => ({
  id,
  titleKey: `check.${id}.title`,
  status,
  detailKey,
  detailVars: detailVars || {},
  evidence: evidence || [],
});

const total = (list) => list.reduce((a, c) => a + (c.size || 0), 0);
const humanSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`);

export function analyze(skillDir) {
  const dir = path.resolve(skillDir);
  const { fm, text } = readFrontmatter(dir);
  const files = collect(dir);
  const codeFiles = files.filter((f) => CODE_EXT.has(f.ext));
  const codeText = codeFiles.map((f) => {
    try { return fs.readFileSync(f.path, 'utf8'); } catch { return ''; }
  }).join('\n');
  const body = text.replace(/^---[\s\S]*?---/, '');
  const totalBytes = total(files);
  const size = humanSize(totalBytes);
  const tokens = estTokens(text);
  const desc = fm.description || '';
  const allowed = (fm['allowed-tools'] || fm.allowed_tools || '').trim();
  const dmi = String(fm['disable-model-invocation'] || '').toLowerCase() === 'true';

  // A. context cost -- what the skill adds to the window, and how much of it is always on
  const A = [];
  A.push(check('A1', tokens > 5000 ? 'fail' : tokens > 2000 ? 'warn' : 'pass',
    tokens > 2000 ? 'check.A1.heavy' : 'check.A1.detail', { chars: text.length, tokens }));
  A.push(check('A2', desc.length > 800 ? 'warn' : 'pass',
    desc ? 'check.A2.detail' : 'check.A2.missing', { chars: desc.length }));
  const refs = (body.match(/\b(references|reference|assets|scripts)\/[\w./-]+/g) || []).length;
  A.push(check('A3', refs > 0 ? 'pass' : 'info', refs > 0 ? 'check.A3.detail' : 'check.A3.none', { n: refs }));
  A.push(check('A4', totalBytes > 2 * 1048576 ? 'warn' : 'pass', 'check.A4.detail', { size, files: files.length }));

  // B. permission surface -- what the host has to grant it
  const B = [];
  B.push(check('B1', allowed ? 'pass' : (codeFiles.length ? 'fail' : 'warn'),
    allowed ? 'check.B1.declared' : 'check.B1.missing', { tools: allowed.slice(0, 120) }));
  if (allowed) {
    const wide = /Bash\(\s*\*?\s*\)|Bash\s*(,|$)|Write\(\*\*\)|Edit\(\*\*\)/.test(allowed);
    B.push(check('B2', wide ? 'fail' : 'pass', wide ? 'check.B2.wide' : 'check.B2.narrow'));
  }
  B.push(check('B3', dmi ? 'info' : 'pass', dmi ? 'check.B3.manual' : 'check.B3.auto'));
  B.push(check('B4', codeFiles.length ? 'info' : 'pass',
    codeFiles.length ? 'check.B4.detail' : 'check.B4.none',
    { n: codeFiles.length, list: codeFiles.slice(0, 6).map((f) => f.rel).join(', ') }));

  // C. code risk -- facts, escalated only when the permission surface is undeclared
  const undeclared = !allowed && codeFiles.length > 0;
  const C = [];
  for (const [id, re] of [['C1', RE.network], ['C2', RE.exec], ['C3', RE.secrets], ['C4', RE.obfusc], ['C5', RE.install]]) {
    const h = hits(codeText, re);
    const detailKey = h.length ? (undeclared ? 'check.C.escalated' : 'check.C.hits') : 'check.C.none';
    C.push(check(id, h.length ? (undeclared ? 'warn' : 'info') : 'pass', detailKey, { n: h.length }, h));
  }

  // D. instruction hijacking -- aimed at the reader, not the shell
  const D = [];
  const dh = hits(text, RE.hijack);
  D.push(check('D1', dh.length ? 'fail' : 'pass', dh.length ? 'check.D1.hit' : 'check.D.none', {}, dh));
  const sec = hits(text, RE.secrets);
  D.push(check('D2', sec.length ? 'warn' : 'pass', sec.length ? 'check.D2.hit' : 'check.D.none', {}, sec));
  const ex = hits(text, RE.exfil);
  D.push(check('D3', ex.length ? 'warn' : 'pass', ex.length ? 'check.D3.hit' : 'check.D.none', {}, ex));
  const zw = hits(text, RE.zeroWidth);
  D.push(check('D4', zw.length ? 'fail' : 'pass', zw.length ? 'check.D4.hit' : 'check.D.none', {}, zw));
  const img = hits(text, RE.extImage);
  D.push(check('D5', img.length ? 'warn' : 'pass', img.length ? 'check.D5.hit' : 'check.D.none', {}, img));

  // E. description quality -- the only layer that is also the trigger layer's input
  const E = [];
  E.push(check('E1', desc ? 'pass' : 'fail', desc ? 'check.E1.detail' : 'check.E1.missing', { chars: desc.length }));
  const tw = hits(desc, RE.triggerWords, 1);
  E.push(check('E2', tw.length ? 'pass' : 'warn', tw.length ? 'check.E2.hit' : 'check.E2.miss'));
  const wide = hits(desc, RE.wide, 1);
  E.push(check('E3', wide.length ? 'warn' : 'pass', wide.length ? 'check.E3.hit' : 'check.E3.none', {}, wide));
  const clauses = (desc.match(/\bor\b|、|，|,|\//g) || []).length + 1;
  E.push(check('E4', 'info', 'check.E4.detail', { n: clauses }));
  const dirName = path.basename(dir);
  E.push(check('E5', fm.name && fm.name !== dirName ? 'warn' : 'pass',
    fm.name ? 'check.E5.detail' : 'check.E5.noname', { name: fm.name || '', dir: dirName }));

  const groups = [
    { id: 'A', titleKey: 'group.A', checks: A },
    { id: 'B', titleKey: 'group.B', checks: B },
    { id: 'C', titleKey: 'group.C', checks: C },
    { id: 'D', titleKey: 'group.D', checks: D },
    { id: 'E', titleKey: 'group.E', checks: E },
  ];
  for (const g of groups) {
    g.verdict = g.checks.some((c) => c.status === 'fail') ? 'fail'
      : g.checks.some((c) => c.status === 'warn') ? 'warn' : 'pass';
  }
  return {
    skill: fm.name || path.basename(dir),
    path: dir,
    groups,
    stats: {
      files: files.length,
      codeFiles: codeFiles.length,
      bytes: totalBytes,
      size,
      skillMdChars: text.length,
      skillMdTokens: tokens,
      descriptionChars: desc.length,
      allowedTools: allowed || null,
      disableModelInvocation: dmi,
    },
  };
}
