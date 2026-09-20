import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APP_VERSION_TOKEN,
  formatAppVersion,
  replaceAppVersionTokens,
  resolveAppVersion,
} from './appVersion.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const index = readFileSync(resolve(root, 'index.html'), 'utf8');
const packageVersion = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;

assert.equal(formatAppVersion('1.2.3', 'ABCDEF1234567890'), 'v1.2.3+gabcdef123');
assert.equal(formatAppVersion('1.2.3-beta.2+preview', 'abcdef123', true),
  'v1.2.3-beta.2+preview.gabcdef123.dirty');
assert.equal(formatAppVersion('1.2.3', '', false), 'v1.2.3');
assert.throws(() => formatAppVersion('release-1', 'abcdef123'), /invalid semver/);

assert.ok(index.includes(APP_VERSION_TOKEN), 'playable boot page owns the build-version token');
assert.ok(!/Three\.js technology demo/i.test(index), 'obsolete technology-demo footer is removed');
const rendered = replaceAppVersionTokens(index, 'v9.8.7+gabcdef123');
assert.ok(!rendered.includes(APP_VERSION_TOKEN), 'HTML transform replaces every version token');
assert.match(rendered, /Claude of Tanks &middot; v9\.8\.7\+gabcdef123/);
assert.match(rendered, /name="application-version" content="v9\.8\.7\+gabcdef123"/);

const ciVersion = resolveAppVersion(root, { VERCEL_GIT_COMMIT_SHA: '123456789abcdef' });
assert.equal(ciVersion, formatAppVersion(packageVersion, '123456789'),
  'deployment revision overrides local Git state');
const localVersion = resolveAppVersion(root, {});
assert.ok(localVersion.startsWith(`v${packageVersion}`),
  'local build version follows the package semantic version');
assert.match(localVersion, /(?:\+|\.)g[0-9a-f]{9}(?:\.dirty)?$/,
  'local build version follows the checked-out Git revision');

// a rewritten lockfile alone does not make a build dirty; any other tracked change does (2026-09-20)
{
  const dir = mkdtempSync(join(tmpdir(), 'cot-appversion-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe', encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 'receipt@example.invalid'); git('config', 'user.name', 'receipt');
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '1.2.3' }));
  writeFileSync(join(dir, 'package-lock.json'), '{"lockfileVersion":3}\n');
  writeFileSync(join(dir, 'index.js'), 'export const a = 1;\n');
  git('add', '-A'); git('commit', '-q', '-m', 'fixture');
  const clean = resolveAppVersion(dir, {});
  assert.ok(!clean.endsWith('.dirty'), `a committed tree is clean (${clean})`);
  writeFileSync(join(dir, 'package-lock.json'), '{"lockfileVersion":3,"rewritten":true}\n');
  assert.equal(resolveAppVersion(dir, {}), clean, 'a rewritten lockfile alone does not dirty the build stamp');
  writeFileSync(join(dir, 'index.js'), 'export const a = 2;\n');
  assert.equal(resolveAppVersion(dir, {}), `${clean}.dirty`, 'a source change still dirties the stamp');
  rmSync(dir, { recursive: true, force: true });
}

console.log('appVersion.selftest: semantic package version and per-revision boot identity passed');
