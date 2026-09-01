import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import * as THREE from 'three';

import { createGaragePhasePresentationRuntime } from './garagePhasePresentationRuntime.ts';

const scene = new THREE.Scene();
const stageRoot = new THREE.Group();
const dressingRoot = new THREE.Group();
scene.add(stageRoot, dressingRoot);
const garagePosition = new THREE.Vector3(-1500, 0, -1500);
const sunDirection = new THREE.Vector3(0.3, 0.8, -0.4);
const calls = [];
let phase = 'garage';
let warmCount = 0;
let pedestalPoseCount = 0;
let cameraPoseCount = 0;
const authoredSky = { sunColorHex: 0xffe0c0, sunIntensity: 4.8, haze: 0.2 };

const runtime = createGaragePhasePresentationRuntime({
  scene,
  stageRoot,
  dressingRoot,
  garagePosition,
  lighting: {
    setFarCascadeDormant: (value) => calls.push(['farDormant', value]),
    setSun: (direction, config) => calls.push(['sun', direction, config]),
  },
  sunDirection,
  getSkyConfig: () => authoredSky,
  getGroundHeight: (x, z) => (x + z) / -1000,
  getPhase: () => phase,
  posePedestal: () => { pedestalPoseCount += 1; },
  poseCamera: () => { cameraPoseCount += 1; },
  restorePresentationGpu: async () => {
    calls.push(['restorePresentationGpu']);
    warmCount += 1;
    return {
      totalMs: 12,
      shadowPasses: [4, 3],
      shadowPassMax: 4,
      sceneUploadBatches: [2, 1],
      sceneUploadMax: 2,
    };
  },
});

runtime.setSunTrim(true);
const trimmed = calls.at(-1);
assert.equal(trimmed[0], 'sun');
assert.equal(trimmed[1], sunDirection);
assert.deepEqual(trimmed[2], {
  sunColorHex: 0xf2f0ea,
  sunIntensity: 4.8 * 0.55,
  haze: 0.2,
});
assert.deepEqual(authoredSky, { sunColorHex: 0xffe0c0, sunIntensity: 4.8, haze: 0.2 },
  'showroom trim must not mutate the authored battlefield preset');
runtime.setSunTrim(false);
assert.equal(calls.at(-1)[2], authoredSky,
  'battle presentation restores the exact authored preset object');

runtime.place();
assert.equal(garagePosition.y, 3);
assert.deepEqual(stageRoot.position.toArray(), garagePosition.toArray());
assert.deepEqual(dressingRoot.position.toArray(), garagePosition.toArray());
assert.equal(pedestalPoseCount, 1);
assert.equal(cameraPoseCount, 1);
phase = 'battle';
runtime.place();
assert.equal(pedestalPoseCount, 2);
assert.equal(cameraPoseCount, 1, 'battle placement must not steal the live camera');

runtime.setActive(false);
assert.equal(stageRoot.parent, null);
assert.equal(dressingRoot.parent, null);
assert.deepEqual(calls.find(([name]) => name === 'farDormant'), ['farDormant', false]);
assert.equal(runtime.diagnostics().scene.garageMounted, false);
assert.equal(runtime.diagnostics().gpu.suspended, true);
runtime.setActive(false);
assert.equal(calls.filter(([name]) => name === 'farDormant').length, 1,
  'idempotent phase requests must not repeat lighting work');

runtime.setActive(true);
assert.equal(stageRoot.parent, scene);
assert.equal(dressingRoot.parent, scene);
assert.equal(runtime.diagnostics().gpu.suspended, true,
  'scene remount precedes the covered GPU restore');
const firstRestore = await runtime.restoreGpu();
assert.equal(warmCount, 1);
assert.equal(firstRestore.totalMs, 12);
assert.equal(runtime.diagnostics().gpu.suspended, false);
assert.deepEqual(calls.at(-1), ['restorePresentationGpu'],
  'GPU renewal delegates to the bounded presentation restore once');

const residentRestore = await runtime.restoreGpu();
assert.equal(warmCount, 2, 'resident returns still settle one exact covered Garage frame');
assert.equal(residentRestore.sceneUploadMax, 2);

const worldA = new THREE.Group();
const worldB = new THREE.Group();
runtime.swapWorld(null, worldA);
assert.equal(worldA.parent, scene);
runtime.swapWorld(worldA, worldB);
assert.equal(worldA.parent, null);
assert.equal(worldB.parent, scene);
runtime.setWorldActive(worldB, false);
assert.equal(worldB.parent, null);

assert.throws(() => createGaragePhasePresentationRuntime({}),
  /requires every scene lifecycle port/);

const mainSource = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
assert.doesNotMatch(mainSource, /new THREE\.SpotLight\(/,
  'main must not construct Garage phase lights');
assert.doesNotMatch(mainSource, /function setGarageSpots\(/,
  'main must not own Garage phase membership');
assert.doesNotMatch(mainSource, /function setGarageSunTrim\(/,
  'main must not own Garage sun policy');
assert.doesNotMatch(mainSource, /function placeGarage\(/,
  'main must not own terrain-relative Garage placement');
assert.match(mainSource, /createGaragePhasePresentationRuntime\(/,
  'the composition root must delegate Garage presentation ownership');

console.log('garagePhasePresentationRuntime.selftest: lighting, placement, residency, and world swaps pass');
