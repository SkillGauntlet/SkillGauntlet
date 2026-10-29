// A small JSON Schema checker: enough of the vocabulary to validate schemas/submission-1.json
// (type, enum, const, pattern, length and size bounds, required, properties, additionalProperties,
// items, local $ref) and nothing else. The package has no dependencies, and CI must not install any
// to look at a stranger's file. A keyword this checker does not know is an error, not silently ignored,
// so the schema cannot drift into promising checks nobody runs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const KNOWN = new Set([
  '$schema', '$id', '$defs', '$ref', 'title', 'description', 'type', 'enum', 'const', 'pattern', 'minLength',
  'maxLength', 'minimum', 'maximum', 'required', 'properties', 'additionalProperties', 'items', 'minItems',
  'maxItems', 'maxProperties',
]);

export function loadSchema() {
  return JSON.parse(fs.readFileSync(path.join(here, '..', 'schemas', 'submission-1.json'), 'utf8'));
}

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v;
}

function typeMatches(want, v) {
  const got = typeOf(v);
  return want === got || (want === 'number' && got === 'integer');
}

// Depth guard: a hostile file must not be able to blow the stack of the checker.
export function maxDepth(v, limit = 12, d = 0) {
  if (d > limit) return d;
  if (v && typeof v === 'object') {
    let m = d;
    for (const x of Object.values(v)) m = Math.max(m, maxDepth(x, limit, d + 1));
    return m;
  }
  return d;
}

// Returns a list of { path, message }. Empty means valid.
export function validate(root, value, defName) {
  const errors = [];
  const resolve = (ref) => {
    const m = /^#\/\$defs\/(\w+)$/.exec(ref);
    if (!m || !root.$defs?.[m[1]]) throw new Error(`unsupported $ref ${ref}`);
    return root.$defs[m[1]];
  };
  const walk = (schema, v, at) => {
    for (const k of Object.keys(schema)) if (!KNOWN.has(k)) throw new Error(`schema keyword not supported by the checker: ${k}`);
    if (schema.$ref) { walk(resolve(schema.$ref), v, at); return; }
    const fail = (message) => errors.push({ path: at || '(root)', message });
    if (schema.const !== undefined && v !== schema.const) { fail(`must be ${JSON.stringify(schema.const)}`); return; }
    if (schema.enum && !schema.enum.includes(v)) { fail(`must be one of ${schema.enum.map((x) => JSON.stringify(x)).join(', ')}`); return; }
    if (schema.type) {
      const want = [].concat(schema.type);
      if (!want.some((w) => typeMatches(w, v))) { fail(`must be ${want.join(' or ')}, got ${typeOf(v)}`); return; }
    }
    if (typeof v === 'string') {
      if (schema.minLength !== undefined && v.length < schema.minLength) fail(`shorter than ${schema.minLength}`);
      if (schema.maxLength !== undefined && v.length > schema.maxLength) fail(`longer than ${schema.maxLength}`);
      if (schema.pattern && !new RegExp(schema.pattern).test(v)) fail(`does not match ${schema.pattern}`);
    }
    if (typeof v === 'number') {
      if (schema.minimum !== undefined && v < schema.minimum) fail(`below ${schema.minimum}`);
      if (schema.maximum !== undefined && v > schema.maximum) fail(`above ${schema.maximum}`);
    }
    if (Array.isArray(v)) {
      if (schema.minItems !== undefined && v.length < schema.minItems) fail(`fewer than ${schema.minItems} items`);
      if (schema.maxItems !== undefined && v.length > schema.maxItems) fail(`more than ${schema.maxItems} items`);
      if (schema.items) v.forEach((x, i) => walk(schema.items, x, `${at}[${i}]`));
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const keys = Object.keys(v);
      if (schema.maxProperties !== undefined && keys.length > schema.maxProperties) fail(`more than ${schema.maxProperties} properties`);
      for (const r of schema.required || []) if (!(r in v)) errors.push({ path: at ? `${at}.${r}` : r, message: 'is required' });
      const props = schema.properties || {};
      for (const k of keys) {
        const sub = at ? `${at}.${k}` : k;
        if (props[k]) walk(props[k], v[k], sub);
        else if (schema.additionalProperties === false) errors.push({ path: sub, message: 'is not allowed here' });
      }
    }
  };
  walk(resolve(`#/$defs/${defName}`), value, '');
  return errors;
}
