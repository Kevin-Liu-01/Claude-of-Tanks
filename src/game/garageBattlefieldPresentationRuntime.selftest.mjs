import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import * as THREE from 'three';

import { createGarageBattlefieldPresentationRuntime } from './garageBattlefieldPresentationRuntime.ts';

const createWorld = (mapId, updateCalls, { blocked = false } = {}) => ({
  mapId,
  spawnPoints: { player: { pos: [68, 3, -82] } },
  heightField: {
    getHeightAt: () => 3,
    getNormalAt: () => ({ y: 0.99 }),
    getGroundType: () => 'hard',
  },
  getObstacles: () => blocked
    ? [{ min: [-500, 0, -500], max: [500, 4, 500] }]
    : [],
  update: (deltaSeconds, cameraPosition) => updateCalls.push([deltaSeconds, cameraPosition]),
});

const garagePosition = new THREE.Vector3(-1500, 0, -1500);
const cameraPosition = new THREE.Vector3(1, 2, 3);
const calls = [];
const poses = [];
const errors = [];
const updateCalls = [];
let selectedVariantId = 'verdant_motor_pool';
let loadWorld = async (mapId) => createWorld(mapId, updateCalls);
const runtime = createGarageBattlefieldPresentationRuntime({
  garagePosition,
  cameraPosition,
  getSelectedVariantId: () => selectedVariantId,
  loadWorld: (mapId) => loadWorld(mapId),
  setWorldDormant: (value) => calls.push(['dormant', value]),
  placeGarage: () => calls.push(['place']),
  setGarageSunTrim: (value) => calls.push(['sun', value]),
  invalidatePresentation: () => calls.push(['invalidate']),
  setCameraPose: (position, target, fov) => poses.push({
    position: position.toArray(), target: target.toArray(), fov,
  }),
  reportError: (message, error) => errors.push([message, error]),
});

assert.deepEqual(runtime.diagnostics(), {
  variantId: 'verdant_motor_pool',
  mapId: 'verdant',
  mode: 'verdant-workshop',
  ready: true,
  placement: null,
  error: '',
});

await runtime.activate('verdant_motor_pool');
assert.deepEqual(garagePosition.toArray(), [-1500, 0, -1500]);
assert.deepEqual(calls.slice(-4), [
  ['dormant', true], ['place'], ['sun', true], ['invalidate'],
]);
runtime.poseCamera();
assert.deepEqual(poses.at(-1), {
  position: [-1492.6, 2.75, -1492],
  target: [-1500, 1.6, -1500],
  fov: 42,
});

selectedVariantId = 'desert_forward_depot';
await runtime.activate(selectedVariantId);
const outdoor = runtime.diagnostics();
assert.equal(outdoor.ready, true);
assert.equal(outdoor.mode, 'active-battlefield');
assert.equal(outdoor.mapId, 'desert');
assert.equal(outdoor.placement?.clear, true);
assert.deepEqual(garagePosition.toArray(), [68, 3, -82]);
assert.equal(updateCalls.length, 1);
assert.equal(updateCalls[0][0], 0);
assert.equal(updateCalls[0][1], cameraPosition);
assert.ok(calls.some(([name, value]) => name === 'dormant' && value === false));

const firstSnapshot = runtime.diagnostics();
assert.notEqual(firstSnapshot, runtime.diagnostics());
assert.notEqual(firstSnapshot.placement, runtime.diagnostics().placement,
  'diagnostics must not expose the retained state object');

const deferredWorlds = [];
loadWorld = (mapId) => new Promise((resolve) => { deferredWorlds.push({ mapId, resolve }); });
selectedVariantId = 'winter_repair_bunker';
const staleActivation = runtime.activate(selectedVariantId);
selectedVariantId = 'urban_arsenal';
const currentActivation = runtime.activate(selectedVariantId);
assert.deepEqual(deferredWorlds.map(({ mapId }) => mapId), ['winter', 'urban']);
deferredWorlds[0].resolve(createWorld('winter', updateCalls));
await staleActivation;
assert.equal(runtime.diagnostics().variantId, 'urban_arsenal');
deferredWorlds[1].resolve(createWorld('urban', updateCalls));
await currentActivation;
assert.equal(runtime.diagnostics().variantId, 'urban_arsenal');
assert.equal(runtime.diagnostics().ready, true);

selectedVariantId = 'desert_forward_depot';
loadWorld = async (mapId) => createWorld(mapId, updateCalls, { blocked: true });
await runtime.activate(selectedVariantId);
assert.equal(runtime.diagnostics().ready, false);
assert.match(runtime.diagnostics().error, /failed Garage clearance/);
assert.match(errors.at(-1)[0], /desert activation failed/);

assert.throws(() => createGarageBattlefieldPresentationRuntime({}),
  /requires every lifecycle port/);

const mainSource = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
assert.doesNotMatch(mainSource, /async function activateGarageBattlefield/,
  'main must not own Garage battlefield activation policy');
assert.doesNotMatch(mainSource, /let garageCameraOffset/,
  'main must not retain Garage battlefield camera state');
assert.match(mainSource, /createGarageBattlefieldPresentationRuntime(?:<[^>]+>)?\(/,
  'the composition root must delegate to the typed Garage battlefield owner');

console.log('garageBattlefieldPresentationRuntime.selftest: activation, cancellation, framing, diagnostics, and failure state pass');
