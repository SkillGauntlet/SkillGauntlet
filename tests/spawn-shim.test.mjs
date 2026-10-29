// Resolving an npm .cmd shim to the script it runs. A wrong guess here runs another package's index.js,
// which is how the first CodeBuddy launch from a project-local install picked node-pty instead of the CLI.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runnerFor } from '../lib/spawn.js';

function shim(target) {
  return [
    '@ECHO off',
    'IF EXIST "%dp0%\\node.exe" (',
    '  SET "_prog=%dp0%\\node.exe"',
    ')',
    `endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\${target}" %*`,
    '',
  ].join('\r\n');
}

function layout(root, { local }) {
  // a decoy that the package-layout guess would pick up first
  fs.mkdirSync(path.join(root, 'node_modules', '@a', 'decoy'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules', '@a', 'decoy', 'index.js'), '');
  const entry = path.join(root, 'node_modules', '@z', 'real', 'bin', 'tool');
  fs.mkdirSync(path.dirname(entry), { recursive: true });
  fs.writeFileSync(entry, '');
  const shimDir = local ? path.join(root, 'node_modules', '.bin') : root;
  fs.mkdirSync(shimDir, { recursive: true });
  const rel = local ? '..\\@z\\real\\bin\\tool' : 'node_modules\\@z\\real\\bin\\tool';
  fs.writeFileSync(path.join(shimDir, 'tool.cmd'), shim(rel));
  return { shim: path.join(shimDir, 'tool.cmd'), entry };
}

for (const local of [false, true]) {
  test(`a .cmd shim resolves to the script it names (${local ? 'project-local .bin' : 'global'} layout)`, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-shim-'));
    const { shim: bin, entry } = layout(root, { local });
    const r = runnerFor(bin, 'tool');
    assert.equal(r.shell, false);
    assert.deepEqual(r.prefix, [entry]);
  });
}
