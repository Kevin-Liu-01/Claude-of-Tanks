import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import '../src/vehicles/tankFactory.js';
import {
  FIRST_PARTY_LICENSE,
  PROJECT_COPYRIGHT,
  PROJECT_CREATOR,
} from '../src/authorship.js';
import { ALL_TANK_IDS, getSpec } from '../src/vehicles/specs.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const trackedFiles = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { cwd: root },
)
  .toString('utf8')
  .split('\0')
  .filter((path) => path && path !== 'node_modules');

assert.ok(trackedFiles.length > 0, 'attribution audit requires a tracked repository');

const license = read('LICENSE');
const notice = read('NOTICE.md');
const attribution = read('docs/ATTRIBUTION.md');
const packageJson = JSON.parse(read('package.json'));

assert.match(license, /MIT License/);
assert.match(license, /Copyright \(c\) 2026 Kevin B\. Liu/);
assert.match(notice, /every original file and asset/i);
assert.match(notice, /Every selectable vehicle model/i);
assert.equal(packageJson.author, PROJECT_CREATOR);
assert.equal(packageJson.license, FIRST_PARTY_LICENSE);

const publicPages = ['home.html', 'index.html', 'docs.html', 'gallery.html'];
for (const path of publicPages) {
  const html = read(path);
  assert.match(html, /<meta name="author" content="Kevin B\. Liu"\s*\/?>/i, `${path}: author meta`);
  assert.match(html, /<meta name="copyright" content="Copyright © 2026 Kevin B\. Liu"\s*\/?>/i, `${path}: copyright meta`);
}

for (const id of ALL_TANK_IDS) {
  const authorship = getSpec(id)?.authorship;
  assert.equal(authorship?.creator, PROJECT_CREATOR, `${id}: named model creator`);
  assert.equal(authorship?.copyright, PROJECT_COPYRIGHT, `${id}: model copyright`);
  assert.equal(authorship?.license, FIRST_PARTY_LICENSE, `${id}: model license`);
  assert.equal(authorship?.geometry, 'first-party-procedural', `${id}: procedural geometry`);
  assert.equal(authorship?.runtimeExternalGeometry, false, `${id}: no runtime external geometry`);
}

const trackedModels = trackedFiles.filter((path) => /\.(?:glb|gltf|obj|mtl|fbx|blend)$/i.test(path));
for (const path of trackedModels) {
  assert.ok(
    attribution.includes(path),
    `${path}: tracked external model must have an exact docs/ATTRIBUTION.md record`,
  );
}

const thirdPartyCoverage = [
  'docs/licenses/',
  'public/fonts/',
  'public/models/',
  'public/brand/',
  'src/engine/post.js',
  'src/vehicles/materials.js',
];
const exceptedFiles = trackedFiles.filter((path) =>
  thirdPartyCoverage.some((entry) => entry.endsWith('/') ? path.startsWith(entry) : path === entry));
const firstPartyFiles = trackedFiles.filter((path) => !exceptedFiles.includes(path));

assert.equal(firstPartyFiles.length + exceptedFiles.length, trackedFiles.length);
assert.match(attribution, /Third-party exceptions take precedence/i);

console.log(
  `attribution audit passed: ${trackedFiles.length} tracked files covered; `
  + `${ALL_TANK_IDS.length} playable models name ${PROJECT_CREATOR}; `
  + `${trackedModels.length} tracked external models retain exact source records`,
);
