// Offline tests for the three-language UI (zh, ja, en). Nothing here calls a model.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { messageTables, setLang, lang, t, words, detectLang, errorText } from '../lib/i18n.js';
import { estimate } from '../lib/depth.js';
import { analyze } from '../lib/static.js';
import { staticMarkdown, gainSection, probeSection } from '../lib/report.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TABLES = messageTables();
const LANGS = ['zh', 'ja', 'en'];
const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

test('the table has exactly zh, ja and en', () => {
  assert.deepEqual(Object.keys(TABLES).sort(), [...LANGS].sort());
});

test('all three languages have the same key set', () => {
  const ref = Object.keys(TABLES.en).sort();
  for (const l of LANGS) {
    const keys = Object.keys(TABLES[l]).sort();
    assert.deepEqual(keys.filter((k) => !ref.includes(k)), [], `${l} has keys en lacks`);
    assert.deepEqual(ref.filter((k) => !keys.includes(k)), [], `${l} lacks keys en has`);
  }
});

test('no value is empty or a non-string', () => {
  for (const l of LANGS) {
    for (const [k, v] of Object.entries(TABLES[l])) {
      assert.equal(typeof v, 'string', `${l}.${k} is not a string`);
      assert.ok(v.trim().length > 0, `${l}.${k} is empty`);
    }
  }
});

test('placeholders match across languages, key by key', () => {
  for (const [k, v] of Object.entries(TABLES.en)) {
    for (const l of ['zh', 'ja']) {
      assert.equal(placeholders(TABLES[l][k]), placeholders(v), `${l}.${k} placeholders differ from en`);
    }
  }
});

test('braces are balanced: no stray { or } outside placeholders', () => {
  for (const l of LANGS) {
    for (const [k, v] of Object.entries(TABLES[l])) {
      const rest = String(v).replace(/\{\w+\}/g, '');
      assert.ok(!/[{}]/.test(rest), `${l}.${k} has an unmatched brace`);
    }
  }
});

test('the language menu names all three languages', () => {
  for (const l of LANGS) {
    assert.equal(TABLES[l].langZh, '中文');
    assert.equal(TABLES[l].langEn, 'English');
    assert.equal(TABLES[l].langJa, '日本語');
  }
});

test('every t(...) key used in bin/ and lib/ exists', () => {
  const used = new Set();
  for (const dir of ['bin', 'lib']) {
    for (const f of fs.readdirSync(path.join(ROOT, dir))) {
      if (!f.endsWith('.js') || f === 'i18n.js') continue;
      const src = fs.readFileSync(path.join(ROOT, dir, f), 'utf8');
      for (const m of src.matchAll(/\bt\(\s*'([^']+)'/g)) used.add(m[1]);
    }
  }
  assert.ok(used.size > 40);
  for (const k of used) assert.ok(k in TABLES.en, `t('${k}') is not in the table`);
});

test('setLang falls back to en for an unknown language; detectLang honours SG_LANG', () => {
  setLang('xx');
  assert.equal(lang(), 'en');
  setLang('ja');
  assert.equal(lang(), 'ja');
  assert.equal(detectLang({ SG_LANG: 'ja' }), 'ja');
  assert.equal(detectLang({ SG_LANG: 'zh-CN' }), 'zh');
  setLang('en');
});

test('yes/no words: Japanese accepts はい / いいえ, and every list is non-empty', () => {
  setLang('ja');
  assert.ok(words('ui.yesWords').includes('はい'));
  assert.ok(words('ui.noWords').includes('いいえ'));
  setLang('zh');
  assert.ok(words('ui.yesWords').includes('是'));
  assert.ok(words('ui.noWords').includes('否'));
  setLang('en');
  assert.ok(words('ui.yesWords').includes('yes'));
});

test('a message-key error is translated per language', () => {
  const err = Object.assign(new Error('x'), { messageKey: 'badSource', vars: { spec: '???' } });
  for (const l of LANGS) {
    setLang(l);
    assert.ok(errorText(err).includes('???'));
    assert.notEqual(errorText(err), 'x');
  }
  setLang('en');
});

test('no amount of money is shown: no currency symbol in the depth hints or the estimate', () => {
  for (const l of LANGS) {
    for (const k of ['depthQuickHint', 'depthStandardHint', 'depthDeepHint']) {
      assert.doesNotMatch(TABLES[l][k], /[¥$￥円元]|\{(price|cost|totalCost|cny)\}/, `${l}.${k} shows money`);
    }
  }
  assert.equal(estimate('standard', 3).cny, undefined);
});

test('contract descriptions are English with zh/ja translations', () => {
  const dir = path.join(ROOT, 'contracts');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const spec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const all = [...(spec.contracts || []), ...(spec.tasks || []).flatMap((x) => x.contracts || [])];
    for (const c of all) {
      assert.ok(!/[぀-ヿ一-鿿]/.test(c.desc), `${f}: desc must be English: ${c.desc}`);
      assert.ok(c.descI18n?.zh && c.descI18n?.ja, `${f}: missing descI18n for "${c.desc}"`);
    }
  }
});

test('gain table renders the contract description in the UI language, falling back to English', () => {
  const gain = {
    contracts: [
      { desc: 'a test file was added', descI18n: { zh: '新增了测试文件', ja: 'テストファイルが追加された' }, with: 1, without: 0 },
      { desc: 'only English', with: 1, without: 1 },
    ],
  };
  setLang('ja');
  assert.match(gainSection(gain), /テストファイルが追加された/);
  assert.match(gainSection(gain), /only English/);
  setLang('zh');
  assert.match(gainSection(gain), /新增了测试文件/);
  setLang('en');
  assert.match(gainSection(gain), /a test file was added/);
});

test('probe section uses the language colon, not a hardcoded one', () => {
  const probe = {
    withSkill: { firstAction: null, createdFiles: [] },
    without: { firstAction: null, createdFiles: [] },
    actionKindIdentical: true,
    artifactsIdentical: false,
  };
  setLang('en');
  assert.doesNotMatch(probeSection(probe), /：/);
  setLang('ja');
  assert.match(probeSection(probe), /：/);
  setLang('en');
});

test('layer-0 report renders in all three languages with no leaked key or placeholder', () => {
  const skill = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TEMP || '/tmp'), 'sg-i18n-'));
  const dir = path.join(skill, 'demo');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'SKILL.md'),
    '---\nname: demo\ndescription: Use when the user asks for anything about CSV files, or wants to dedupe rows.\n---\nSee [ref](ref.md).\n');
  fs.writeFileSync(path.join(dir, 'ref.md'), 'reference\n');
  const outputs = {};
  for (const l of LANGS) {
    setLang(l);
    const md = staticMarkdown(analyze(dir));
    outputs[l] = md;
    assert.doesNotMatch(md, /\{\w+\}/, `${l}: unfilled placeholder`);
    assert.doesNotMatch(md, /\b(check|group|report)\.[A-Za-z0-9.]+/, `${l}: leaked key`);
  }
  setLang('en');
  assert.match(outputs.ja, /[぀-ヿ]/);
  assert.match(outputs.zh, /[一-鿿]/);
  assert.doesNotMatch(outputs.en, /[぀-ヿ一-鿿]/);
  assert.notEqual(outputs.ja, outputs.en);
  fs.rmSync(skill, { recursive: true, force: true });
});
