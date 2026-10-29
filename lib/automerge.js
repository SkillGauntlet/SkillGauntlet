// The decision rules of the submission auto-merge, as pure functions: no network, no files, no clock.
// scripts/automerge.mjs gathers the facts (through the GitHub API, as data) and applies the verdict.
//
// A pull request is merged automatically only when every rule here holds. Anything else is not an
// error: it is sent to a maintainer with the reasons written on the pull request.
import { FILES, LIMITS } from './submission.js';

export const POLICY = {
  fileBytes: LIMITS.fileBytes,        // per file (the same cap the validator enforces)
  totalBytes: 10 * 1024 * 1024,       // all four files of one submission
  maxFiles: FILES.length,
  perAccountPerDay: 5,                // auto-merged submissions per account in the last 24 hours
  minAccountAgeDays: 30,              // younger accounts go to manual review
  trustedAssociations: ['OWNER', 'MEMBER', 'COLLABORATOR'], // skip the account-age and recent-failure rules only
  claContext: 'license/cla',
  label: 'needs-review',
};

const DIR_RE = new RegExp(`^(submissions/[a-z0-9][a-z0-9._-]*/[a-z0-9][a-z0-9._-]*/[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9][A-Za-z0-9-]*)/(${FILES.map((f) => f.replace('.', '\\.')).join('|')})$`);

// The text goes into a pull-request comment: no @mentions, one line, bounded.
const safe = (s) => String(s).replace(/@/g, '@​').replace(/[\r\n`]+/g, ' ').slice(0, 200);

// changed: [{ filename, status }] from the pull request's file list.
// entries: { [path]: { type, size } } from the contents API at the head commit (type is 'file' for a plain
// file, 'symlink' / 'submodule' / 'dir' otherwise). Returns { ok, reasons, dir }.
export function gateFiles(changed, entries = {}) {
  const reasons = [];
  const dirs = new Set();
  if (!changed.length) reasons.push('the pull request lists no changed files');
  if (changed.length > POLICY.maxFiles) reasons.push(`it changes ${changed.length} files; a submission is exactly ${POLICY.maxFiles}`);
  let total = 0;
  const seen = new Set();
  for (const { filename, status } of changed) {
    const name = String(filename);
    if (name.split('/').some((seg) => seg === '..' || seg === '.' || seg === '') || name.includes('\\')) {
      reasons.push(`\`${safe(name)}\` is not a plain relative path`);
      continue;
    }
    const m = DIR_RE.exec(name);
    if (!m) { reasons.push(`\`${safe(name)}\` is outside a submission directory or is not one of ${FILES.join(', ')}`); continue; }
    dirs.add(m[1]);
    seen.add(m[2]);
    if (status !== 'added') { reasons.push(`\`${safe(name)}\` is ${safe(status)}, not added`); continue; }
    const e = entries[name];
    if (!e) { reasons.push(`\`${safe(name)}\` could not be read at the head commit`); continue; }
    if (e.type !== 'file') { reasons.push(`\`${safe(name)}\` is a ${safe(e.type)}, not a regular file`); continue; }
    if (!Number.isInteger(e.size) || e.size < 0) { reasons.push(`\`${safe(name)}\` has no usable size`); continue; }
    if (e.size > POLICY.fileBytes) reasons.push(`\`${safe(name)}\` is ${e.size} bytes; the limit is ${POLICY.fileBytes}`);
    total += e.size;
  }
  if (dirs.size > 1) reasons.push(`it touches ${dirs.size} submission directories; automatic merging takes exactly one`);
  if (dirs.size === 1 && !reasons.length) {
    const missing = FILES.filter((f) => !seen.has(f));
    if (missing.length) reasons.push(`missing file(s): ${missing.join(', ')}`);
  }
  if (total > POLICY.totalBytes) reasons.push(`the files total ${total} bytes; the limit is ${POLICY.totalBytes}`);
  return { ok: reasons.length === 0 && dirs.size === 1, reasons, dir: dirs.size === 1 ? [...dirs][0] : null };
}

// account: { createdAt, association, mergedLastDay, flaggedLastDay } (counts exclude this pull request).
export function gateAccount(account, now, policy = POLICY) {
  const reasons = [];
  if (account.mergedLastDay >= policy.perAccountPerDay) {
    reasons.push(`this account already has ${account.mergedLastDay} auto-merged submissions in the last 24 hours (limit ${policy.perAccountPerDay})`);
  }
  if (!policy.trustedAssociations.includes(account.association)) {
    const created = Date.parse(account.createdAt);
    if (!Number.isFinite(created)) reasons.push('the account creation date is unknown');
    else if ((now - created) / 86400000 < policy.minAccountAgeDays) reasons.push(`the account is younger than ${policy.minAccountAgeDays} days`);
    if (account.flaggedLastDay > 0) reasons.push('a submission from this account was refused in the last 24 hours');
  }
  return { ok: reasons.length === 0, reasons };
}

// facts: {
//   validatedSha, currentSha  – the head commit the validation read, and the head right now
//   files: gateFiles() result, validation: { ok, errors }, cla: 'success' | other | null,
//   account: gateAccount() result
// }
// Returns { merge, reasons, waitForCla }. waitForCla marks a refusal that is only "not yet": the maintainer or
// contributor fixes it by signing, and no needs-review label is warranted.
export function decide({ validatedSha, currentSha, files, validation, cla, account }) {
  const reasons = [];
  if (!validatedSha || validatedSha !== currentSha) {
    return { merge: false, reasons: ['the pull request changed after it was checked; the next run will check the new commit'], stale: true, waitForCla: false };
  }
  if (!files.ok) reasons.push(...files.reasons);
  if (files.ok && !validation.ok) reasons.push(...validation.errors.map((e) => `check: ${e}`));
  if (files.ok && validation.ok && validation.dir && validation.dir !== files.dir) reasons.push('the validated directory differs from the changed directory');
  const claOk = cla === 'success';
  if (!claOk) reasons.push(`the \`${POLICY.claContext}\` check is ${cla || 'missing'}; sign the CLA (see the comment from the CLA bot) and a maintainer can re-run this`);
  if (!account.ok) reasons.push(...account.reasons);
  const onlyCla = !claOk && reasons.length === 1;
  return { merge: reasons.length === 0, reasons, stale: false, waitForCla: onlyCla };
}

export function renderVerdict({ merge, reasons, stale }, { dir } = {}) {
  const marker = '<!-- skillgauntlet-automerge -->';
  if (merge) return `${marker}\n### ✅ Merged automatically\n\n\`${safe(dir)}\` passed every check and was merged as a **community single sample**.\n`;
  if (stale) return null;
  return `${marker}\n### ⏸️ Not merged automatically\n\n${reasons.map((r) => `- ${r}`).join('\n')}\n\nA maintainer will look at this by hand. Nothing is wrong with asking: this is a safety rule, not a verdict on your results.\n`;
}

export function mergeTitle(dir) {
  return `Add submission ${dir.replace(/^submissions\//, '')}`;
}
