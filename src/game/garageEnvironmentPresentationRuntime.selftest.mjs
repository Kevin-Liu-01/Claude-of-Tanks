import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import * as THREE from 'three';

import { createGarageEnvironmentPresentationRuntime } from './garageEnvironmentPresentationRuntime.ts';

const garagePosition = new THREE.Vector3(-1500, 0, -1500);
const calls = [];
const poses = [];
let selectedVariantId = 'verdant_motor_pool';
const runtime = createGarageEnvironmentPresentationRuntime({
  garagePosition,
  getSelectedVariantId: () => selectedVariantId,
  setWorldDormant: (value) => calls.push(['dormant', value]),
  applySkyPreset: () => calls.push(['sky']),
  placeGarage: () => calls.push(['place']),
  setGarageSunTrim: (value) => calls.push(['sun', value]),
  setLightEnclosure: (enclosed) => calls.push(['enclosed', enclosed]),
  installEnvironment: () => calls.push(['environment']),
  loadOpenSkyLight: async () => { calls.push(['openSkyLight']); },
  invalidatePresentation: () => calls.push(['invalidate']),
  setCameraPose: (position, target, fov) => poses.push({
    position: position.toArray(), target: target.toArray(), fov,
  }),
});

assert.deepEqual(runtime.diagnostics(), {
  variantId: 'verdant_motor_pool',
  mapId: 'verdant',
  mode: 'authentic-scene-pack',
  ready: true,
  anchor: [-1500, 0, -1500],
});

await runtime.activate('verdant_motor_pool');
assert.deepEqual(garagePosition.toArray(), [-1500, 0, -1500]);
// (garage-env-276) a sealed bay keeps the authored rig: no grounded model asked, the enclosure set after its sky, then
// the pack's own environment installed before the trim
assert.deepEqual(calls.slice(-7), [
  ['dormant', true], ['sky'], ['enclosed', true], ['environment'], ['place'], ['sun', true], ['invalidate'],
]);
assert.equal(poses.length, 0,
  'variant activation must not overwrite the active showroom camera solver');
runtime.poseCamera();
assert.deepEqual(poses.at(-1), {
  // the presentation pose looks down about 14 degrees (garagePresentationPose cameraOffsetM [7.4, 4.32, 8], gallery-studio 3f78520edc)
  position: [-1492.6, 4.32, -1492],
  target: [-1500, 1.6, -1500],
  fov: 42,
});

selectedVariantId = 'desert_forward_depot';
await runtime.activate(selectedVariantId);
assert.deepEqual(runtime.diagnostics(), {
  variantId: 'desert_forward_depot',
  mapId: 'desert',
  mode: 'authentic-scene-pack',
  ready: true,
  anchor: [-1500, 0, -1500],
});
assert.ok(calls.some(([name, value]) => name === 'dormant' && value === true));
// (garage-env-276) an open yard lights as its battlefield: the grounded model lands before its sky, then the open flip
assert.deepEqual(calls.slice(-8), [
  ['dormant', true], ['openSkyLight'], ['sky'], ['enclosed', false], ['environment'], ['place'], ['sun', true], ['invalidate'],
]);
assert.notEqual(runtime.diagnostics(), runtime.diagnostics(),
  'diagnostics must not expose retained state');
assert.notEqual(runtime.diagnostics().anchor, runtime.diagnostics().anchor,
  'diagnostics must not expose the retained anchor tuple');

const skyCallsBeforeBurst = calls.filter(([name]) => name === 'sky').length;
await Promise.all([
  runtime.activate('winter_repair_bunker'),
  runtime.activate('urban_arsenal'),
  runtime.activate('foundry_heavy_works'),
]);
assert.equal(calls.filter(([name]) => name === 'sky').length, skyCallsBeforeBurst + 1,
  'synchronous selector intent must retarget only the final atmosphere');
assert.equal(runtime.diagnostics().variantId, 'foundry_heavy_works');

assert.throws(() => createGarageEnvironmentPresentationRuntime({}),
  /requires every lifecycle port/);

const mainSource = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
assert.match(mainSource, /createGarageEnvironmentPresentationRuntime\(/,
  'the composition root must delegate to the typed Garage environment owner');
assert.doesNotMatch(mainSource, /loadWorld: \(mapId\).*garage/i,
  'Garage environment activation must not load a battlefield');

console.log('garageEnvironmentPresentationRuntime.selftest: static activation, dormancy, framing, and immutable diagnostics pass');
