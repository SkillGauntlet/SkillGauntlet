// A check for a newer published version before an interactive session. It must never get in the way: any failure
// (offline, slow registry, odd reply, unwritable cache) means "no update known" and the session goes on with the
// version that is running.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REGISTRY = 'https://registry.npmjs.org/skillgauntlet/latest';
const CHECK_EVERY_MS = 12 * 60 * 60 * 1000;
const here = path.dirname(fileURLToPath(import.meta.url));

export function currentVersion() {
  try { return JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8')).version; } catch { return null; }
}

// a.b.c with an optional pre-release tail; a pre-release is older than its release.
export function isNewer(latest, current) {
  const parse = (v) => {
    const m = String(v).trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
    return m ? { n: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] || null } : null;
  };
  const a = parse(latest);
  const b = parse(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i += 1) if (a.n[i] !== b.n[i]) return a.n[i] > b.n[i];
  return Boolean(b.pre) && !a.pre;
}

// A copy that runs from a git checkout is a developer's own; it is not nagged about releases.
export function isCheckout() {
  return fs.existsSync(path.join(here, '..', '.git'));
}

function cachePath() {
  return path.join(process.env.SKILLGAUNTLET_CACHE || path.join(os.homedir(), '.cache', 'skillgauntlet'), 'update-check.json');
}

function readCache(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}

function writeCache(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(data)}\n`);
  } catch { /* the cache is an optimisation */ }
}

// { current, latest } when a newer version is known and has not been declined, else null. Never throws.
export async function checkForUpdate({ fetchLatest, now = Date.now(), file = cachePath(), current = currentVersion(), env = process.env } = {}) {
  try {
    if (!current || env.SG_NO_UPDATE_CHECK || env.CI) return null;
    const cache = readCache(file);
    let latest = cache.latest;
    if (!latest || !cache.checkedAt || now - cache.checkedAt > CHECK_EVERY_MS) {
      const get = fetchLatest || (async () => {
        const res = await fetch(REGISTRY, { signal: AbortSignal.timeout(3000), headers: { accept: 'application/json' } });
        if (!res.ok) throw new Error(`registry ${res.status}`);
        return (await res.json()).version;
      });
      latest = await get();
      writeCache(file, { ...cache, latest, checkedAt: now });
    }
    if (!isNewer(latest, current) || cache.declined === latest) return null;
    return { current, latest };
  } catch { return null; }
}

// Remember that the user said no to this version, so the question is not asked again until a newer one appears.
export function declineUpdate(latest, file = cachePath()) {
  writeCache(file, { ...readCache(file), declined: latest });
}
