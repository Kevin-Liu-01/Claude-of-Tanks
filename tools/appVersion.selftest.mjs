import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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

console.log('appVersion.selftest: semantic package version and per-revision boot identity passed');
