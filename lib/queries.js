// Question sets cost one model call to draft, so they are cached and reused while the skill is
// unchanged. The fingerprint is the SKILL.md hash: edit the description and the cache goes stale,
// which is exactly when fresh questions are needed.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function fingerprint(skillDir) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(path.join(skillDir, 'SKILL.md'))).digest('hex').slice(0, 16);
  } catch { return null; }
}

export function cacheFileFor(skillDir, depth) {
  return path.join(skillDir, '.skillgauntlet', `queries-${depth.perClause}x${depth.negatives}.json`);
}

export function readCachedQueries(file, want) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    const same = j.perClause === want.perClause
      && j.negatives === want.negatives
      && j.skillFingerprint === want.skillFingerprint
      && Array.isArray(j.queries) && j.queries.length > 0;
    return same ? j : null;
  } catch { return null; }
}

export function writeCachedQueries(file, payload) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
    return true;
  } catch {
    return false; // a read-only skill directory must not break the run
  }
}
