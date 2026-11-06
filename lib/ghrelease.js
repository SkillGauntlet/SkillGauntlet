// The GitHub CLI for a machine with no package manager that can install it: a Mac without Homebrew, or a Linux account
// without sudo. It comes from the project's own releases into ~/.local/bin, needs no password, and is only kept when it
// matches the checksum file published with the release.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const LATEST = 'https://api.github.com/repos/cli/cli/releases/latest';
const DOWNLOADS = 'https://github.com/cli/cli/releases/download/';
const ARCH = { arm64: 'arm64', x64: 'amd64' };

// The release file for this system, or null when the project publishes none we can use here.
export function assetName(version, platform = process.platform, arch = process.arch) {
  const a = ARCH[arch];
  if (!a || !/^\d+\.\d+\.\d+$/.test(version)) return null;
  if (platform === 'darwin') return `gh_${version}_macOS_${a}.zip`;
  if (platform === 'linux') return `gh_${version}_linux_${a}.tar.gz`;
  return null;
}

const checksumFor = (text, name) => {
  const line = String(text).split(/\r?\n/).find((l) => l.trim().endsWith(` ${name}`) || l.trim().endsWith(`*${name}`));
  return line ? line.trim().split(/\s+/)[0].toLowerCase() : null;
};

export const ghBinDir = (home = os.homedir()) => path.join(home, '.local', 'bin');

// Returns the path of the installed gh. Throws with a short reason; nothing is left behind in that case.
export async function installGhRelease({ fetchImpl = fetch, exec = execFileSync, platform = process.platform, arch = process.arch, home = os.homedir() } = {}) {
  const get = async (url) => {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(120000), headers: { 'user-agent': 'skillgauntlet' } });
    if (!res.ok) throw new Error(`${url} answered ${res.status}`);
    return res;
  };
  const release = await (await get(LATEST)).json();
  const version = String(release.tag_name || '').replace(/^v/, '');
  const name = assetName(version, platform, arch);
  if (!name) throw new Error(`no release of gh for ${platform} ${arch}`);
  const url = (file) => {
    const hit = (release.assets || []).find((a) => a.name === file)?.browser_download_url;
    if (!hit || !String(hit).startsWith(DOWNLOADS)) throw new Error(`${file} is not in the release`);
    return hit;
  };
  const want = checksumFor(await (await get(url(`gh_${version}_checksums.txt`))).text(), name);
  if (!want) throw new Error(`no checksum for ${name}`);
  const bytes = Buffer.from(await (await get(url(name))).arrayBuffer());
  const got = createHash('sha256').update(bytes).digest('hex');
  if (got !== want) throw new Error(`the download of ${name} does not match its checksum`);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-gh-'));
  try {
    const archive = path.join(tmp, name);
    fs.writeFileSync(archive, bytes);
    if (name.endsWith('.zip')) exec('unzip', ['-q', archive, '-d', tmp], { stdio: 'ignore' });
    else exec('tar', ['xzf', archive, '-C', tmp], { stdio: 'ignore' });
    const from = path.join(tmp, name.replace(/\.(zip|tar\.gz)$/, ''), 'bin', 'gh');
    if (!fs.existsSync(from)) throw new Error(`${name} has no bin/gh`);
    const dir = ghBinDir(home);
    fs.mkdirSync(dir, { recursive: true });
    const to = path.join(dir, 'gh');
    fs.copyFileSync(from, to);
    fs.chmodSync(to, 0o755);
    return to;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
