import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import '../src/vehicles/tankFactory.ts';
import {
  FIRST_PARTY_LICENSE,
  PROJECT_PACKAGE_LICENSE,
  PROJECT_COPYRIGHT,
  PROJECT_CREATOR,
} from '../src/authorship.ts';
import { ALL_TANK_IDS, getSpec } from '../src/vehicles/specs.ts';
import { CONTENT_ROOTS } from './asset-provenance-core.mjs';

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
const licensePolicy = read('LICENSE-POLICY.md');
const contentLicense = read('LICENSES/Proprietary-Content-License.txt');
const priorMitLicense = read('LICENSES/MIT-prior-revisions.txt');
const notice = read('NOTICE.md');
const attribution = read('docs/ATTRIBUTION.md');
const packageJson = JSON.parse(read('package.json'));

assert.match(license, /^MIT License/);
assert.match(license, /Copyright \(c\) 2026 Kevin B\. Liu/);
assert.equal(license, priorMitLicense, 'root MIT text must remain standard and detectable');
assert.match(licensePolicy, /MIT-licensed by default/i);
assert.match(licensePolicy, /src\/vehicles\/\*\*/);
assert.match(licensePolicy, /src\/world\/\*\*/);
assert.match(licensePolicy, /public\/media\/\*\*/);
assert.match(licensePolicy, /tools\/marketing-shots\/\*\*/);
assert.match(contentLicense, /PROPRIETARY CONTENT LICENSE/);
assert.match(contentLicense, /not\s+an open-source license/i);
assert.match(priorMitLicense, /^MIT License/);
for (const path of ['src/vehicles/LICENSE.md', 'src/world/LICENSE.md', 'tools/marketing-shots/LICENSE.md']) {
  assert.match(read(path), /expressly excluded from\s+the root MIT grant/i, `${path}: reserved-content marker`);
}
assert.match(notice, /every original file and asset/i);
assert.match(notice, /Every selectable vehicle model/i);
assert.equal(packageJson.author, PROJECT_CREATOR);
assert.equal(packageJson.private, true, 'package must not be publishable to npm');
assert.equal(packageJson.license, PROJECT_PACKAGE_LICENSE);
assert.doesNotMatch(attribution, /private, personal-use, never-published/i);

const publicPages = ['site/home.html', 'index.html', 'site/docs.html', 'site/gallery.html'];
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
  'public/textures/',
  'src/engine/post.ts',
  'src/vehicles/materials.ts',
];
const exceptedFiles = trackedFiles.filter((path) =>
  thirdPartyCoverage.some((entry) => entry.endsWith('/') ? path.startsWith(entry) : path === entry));
const firstPartyFiles = trackedFiles.filter((path) => !exceptedFiles.includes(path));

assert.equal(firstPartyFiles.length + exceptedFiles.length, trackedFiles.length);

// Every first-party shipped asset and generated data file sits under a Reserved Content glob, and every shipped asset
// family inside the authorship receipt's scope: a lane that adds a new asset class extends LICENSE-POLICY.md and
// CONTENT_ROOTS (tools/asset-provenance-core.mjs) in the same change, or this audit fails.
const globToRegExp = (glob) => new RegExp(`^${glob.split('**').map((part) => part.split('*')
  .map((text) => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*')}$`);
const reservedGlobs = (licensePolicy.match(/```text\n([\s\S]*?)```/)?.[1] ?? '')
  .split('\n').map((line) => line.trim()).filter(Boolean);
assert.ok(reservedGlobs.length > 0, 'LICENSE-POLICY.md lists its Reserved Content globs');
const reservedPatterns = reservedGlobs.map(globToRegExp);
const contentAsset = /\.(?:png|webp|jpe?g|gif|avif|mp4|webm|mov|glb|gltf|bin|ktx2|exr|hdr|mp3|ogg|opus|wav|m4a)$/i;
const contentFiles = firstPartyFiles.filter((path) => (path.startsWith('public/') && contentAsset.test(path))
  || path.startsWith('server/world-collision-manifests/')
  || (path.startsWith('src/') && /(?:\.generated\.(?:ts|js|json)|\.ledger\.json)$/.test(path)));
const unreserved = contentFiles.filter((path) => !reservedPatterns.some((pattern) => pattern.test(path)));
assert.deepEqual(unreserved.slice(0, 20), [],
  `${unreserved.length} first-party asset/generated files need a Reserved Content glob in LICENSE-POLICY.md`);
const unreceipted = contentFiles.filter((path) => (path.startsWith('public/') || path.startsWith('server/'))
  && !CONTENT_ROOTS.some((root) => path.startsWith(root)));
assert.deepEqual(unreceipted.slice(0, 20), [],
  `${unreceipted.length} shipped first-party assets need a CONTENT_ROOTS entry in tools/asset-provenance-core.mjs`);
assert.match(attribution, /Third-party exceptions take precedence/i);

console.log(
  `attribution audit passed: ${trackedFiles.length} tracked files covered; `
  + `${ALL_TANK_IDS.length} playable models name ${PROJECT_CREATOR}; `
  + `${trackedModels.length} tracked external models retain exact source records; `
  + `${contentFiles.length} first-party assets and generated data files are Reserved Content in the receipt's scope`,
);
