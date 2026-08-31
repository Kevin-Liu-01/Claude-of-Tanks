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
  placeGarage: () => calls.push(['place']),
  setGarageSunTrim: (value) => calls.push(['sun', value]),
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
assert.deepEqual(calls.slice(-4), [
  ['dormant', true], ['place'], ['sun', true], ['invalidate'],
]);
assert.equal(poses.length, 0,
  'variant activation must not overwrite the active showroom camera solver');
runtime.poseCamera();
assert.deepEqual(poses.at(-1), {
  position: [-1492.6, 2.75, -1492],
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
assert.notEqual(runtime.diagnostics(), runtime.diagnostics(),
  'diagnostics must not expose retained state');
assert.notEqual(runtime.diagnostics().anchor, runtime.diagnostics().anchor,
  'diagnostics must not expose the retained anchor tuple');

assert.throws(() => createGarageEnvironmentPresentationRuntime({}),
  /requires every lifecycle port/);

const mainSource = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
assert.match(mainSource, /createGarageEnvironmentPresentationRuntime\(/,
  'the composition root must delegate to the typed Garage environment owner');
assert.doesNotMatch(mainSource, /loadWorld: \(mapId\).*garage/i,
  'Garage environment activation must not load a battlefield');

console.log('garageEnvironmentPresentationRuntime.selftest: static activation, dormancy, framing, and immutable diagnostics pass');
