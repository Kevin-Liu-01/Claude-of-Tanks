// skyEnvironmentEnclosure receipt (engine-cs, 2026-10-16): the environment a battle lights its open ground with is the
// grounded model's bake, never the Garage's enclosed full-dome bake. The media wave and prod 224 showed Verdant's chalk
// boulders glowing white and the meadow washed out: the battle kept the bay's bake (its sun disc folded into PMREM's
// diffuse mip, texel max 65254 against 0.9) at the open sky's intensity — the chalk's scene radiance 3.14 (bloom from
// 1.78), the meadow's 0.40, against 0.57 and 0.08 after a re-bake on the open flip. Pins the three owners' contract:
// lighting publishes every enclosure flip after the first rig, the sky re-bakes a full-dome bake (the bay's, or the
// boot's before the atmosphere showed) on the open flip under the atmosphere (and only then), and main.ts wires the two.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const lighting = read('./lighting.ts');
const sky = read('./sky.ts');
const main = read('../main.ts');

// 1. lighting: applyRig writes the enclosure, then notifies on a change (the first rig only records it)
const rigAt = lighting.indexOf('function applyRig(opts: SunPreset): void {');
assert.ok(rigAt > 0, 'applyRig present');
const rig = lighting.slice(rigAt, lighting.indexOf('\n  }\n', rigAt));
const writeAt = rig.indexOf('scene.userData.lightEnclosed = farCascadeDormant;');
const notifyAt = rig.indexOf('for (const listener of enclosureListeners) listener(farCascadeDormant);');
assert.ok(writeAt > 0 && notifyAt > writeAt, 'the listeners hear the flip after the scene records it');
assert.match(rig, /if \(publishedEnclosed !== farCascadeDormant\) \{\s*const first = publishedEnclosed === null;\s*publishedEnclosed = farCascadeDormant;\s*if \(!first\)/,
  'only a change notifies, and never the first rig');
assert.match(lighting, /onEnclosureChange\(listener: \(enclosed: boolean\) => void\): \(\) => void \{\s*enclosureListeners\.add\(listener\);\s*return \(\) => \{ enclosureListeners\.delete\(listener\); \};/,
  'onEnclosureChange subscribes and returns the unsubscribe');
// the dormancy switch is the flip's path out of the Garage: it re-applies the rig
assert.match(lighting, /setFarCascadeDormant\(on: boolean\): void \{[\s\S]{0,260}if \(lastSunPreset\) applyRig\(lastSunPreset\);/);

// 2. sky: the bake records whether it was the enclosed variant; the sync re-bakes only a bake made enclosed, on the open sky
const bakeAt = sky.indexOf('bakeEnvironment(): void {');
const bake = sky.slice(bakeAt, sky.indexOf('\n    },\n', bakeAt));
assert.ok(bake.indexOf('environments.install(') > 0
  && bake.indexOf('installedPhysical = physicalEnvBake();') > bake.indexOf('environments.install('),
  'whether the installed bake is the grounded model\'s is recorded after it installs');
// (the enclosed bake is the full dome: the physical bake only off the bay)
assert.match(sky, /const physicalEnvBake = \(\): boolean => physicalEnvIntensity != null && !scene\.userData\.lightEnclosed;/);
assert.match(sky, /atmosphereMaterial\.uniforms\.uEnvBake\.value = physicalEnvBake\(\) \? 1 : 0;/);
assert.match(sky, /syncEnvironmentEnclosure\(\): boolean \{\s*if \(installedPhysical \|\| scene\.userData\.lightEnclosed\) return false;\s*if \(!refreshAtmosphere\(\) \|\| physicalEnvIntensity == null\) return false;\s*rig\.bakeEnvironment\(\);\s*return true;\s*\}/,
  'the sync re-bakes a full-dome bake once the scene is open under the atmosphere, and nothing else');
assert.match(sky, /syncEnvironmentEnclosure\(\): boolean;/, 'the rig interface carries it');

// the decision, modelled: [installed physical, enclosed now, atmosphere showing] -> re-bake
const decide = (physical, enclosed, atmo) => !physical && !enclosed && atmo;
assert.deepEqual([[true, false, true], [false, true, true], [false, false, false], [false, false, true]].map((c) => decide(...c)),
  [false, false, false, true]);

// 3. main.ts: the open flip calls the sync, wired right after the boot's own dormancy request (before any battle)
const dormantAt = main.indexOf('if (!STUDIO_BOOT_INTENT) lighting.setFarCascadeDormant(true);');
const wireAt = main.indexOf('lighting.onEnclosureChange((enclosed) => { if (!enclosed) sky.syncEnvironmentEnclosure(); });');
assert.ok(dormantAt > 0 && wireAt > dormantAt && wireAt - dormantAt < 600, 'main.ts wires the open flip to the sky');
assert.equal(main.split('onEnclosureChange(').length - 1, 1, 'one subscriber');

console.log('skyEnvironmentEnclosure.selftest: lighting publishes enclosure flips, the sky re-bakes a full-dome bake on the open flip, main.ts wires them PASS');
