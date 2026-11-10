// worldBuildPresetClass.selftest.mjs — (2026-11-02 audit R1) a cached battlefield is reused only under the quality preset
// it was built for. The world build reads the preset as it builds (texture scales, Ultra Low's light world: the vegetation's
// near band, grass and litter, the preset name several builders read), while the terrain material follows the live preset;
// the cache was keyed by map alone, so after switching to or from Ultra Low a cached map came back mixed (lite terrain under
// full vegetation, or the reverse). The real coordinator and activation runtime over a fake map module:
// 1. a lookup under another preset builds afresh and releases the old world (it was handed out again);
// 2. a dormant battlefield built under the old preset is replaced on the next entry and released, never shown again;
// 3. one still on screen stays until the fresh world replaces it, then the budget releases it;
// 4. a prefetch under the new preset is not skipped as a cache hit.
// 5. (review) the class is what a build captures (worldBuildClassOf: Ultra Low's light world, the texture scale and cap), not
//    the preset name: desktop Auto's frame governor and the context-loss recovery step the preset name mid-battle, and a
//    name key rebuilt the dormant battlefield for Battle Again after a High -> Medium step (a different track-mark ring
//    size). On the real quality module: those steps keep it (no build), a step into or out of Ultra Low rebuilds it.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWorldBuildCoordinator, worldBuildClassOf } from './worldBuildCoordinator.ts';
import { createWorldActivationRuntime } from './worldActivationRuntime.ts';
import {
  MOBILE_PRESET_ORDER, PRESETS, PRESET_ORDER, noteGraphicsContextLoss, reportSustainedOverload, reportSustainedRecovery,
  resolvePresetName, setPresetName,
} from '../engine/quality.ts';

let preset = 'high';
let builds = 0;
const released = [];
const dependencies = (scene, overrides = {}) => ({
  engineContext: {}, scene, renderer: { renderLists: { dispose() {} } }, deviceTier: 'desktop',
  getGarageActivity: () => ({ phase: 'garage', transitionActive: false, lastActivityAt: 0 }),
  releaseShadowMaterial() {},
  loadModule: async () => ({ async createMapAsync(_engine, { mapId }, progress) {
    await progress('Surveying terrain', 0.5);
    const serial = ++builds;
    const group = new THREE.Group();
    group.name = `${mapId}@${preset}#${serial}`;
    scene.add(group);
    return { mapId, group, config: { sky: {} }, raycast: () => null, serial, preset,
      dispose() { released.push(group.name); } };
  } }),
  now: () => 0, foregroundYielder: () => async () => {}, backgroundYielder: () => async () => {},
  resourceLimits: { pedestalVisuals: 2, worldScenes: 2 },
  buildClass: () => preset,
  ...overrides,
});
const turn = async () => { for (let i = 0; i < 6; i++) await new Promise((resolve) => setImmediate(resolve)); };

// ---- 1. the coordinator
{
  const coordinator = createWorldBuildCoordinator({ ...dependencies(new THREE.Scene()), getCurrentWorld: () => null });
  const high = await coordinator.beginBuild('verdant').promise;
  assert.equal(await coordinator.beginBuild('verdant').promise, high, 'the same preset reuses the cached world');
  preset = 'ultralow';
  const lite = await coordinator.beginBuild('verdant').promise;
  assert.notEqual(lite, high, 'under another preset the map builds afresh');
  assert.equal(lite.preset, 'ultralow');
  await turn();
  assert.ok(released.includes(high.group.name), 'and the world built for the old preset is released');
  assert.equal([...coordinator.cache.values()].includes(high), false);
  // ---- 4. a prefetch under the new preset is no cache hit
  preset = 'medium';
  const prefetched = coordinator.prefetch('verdant', { intent: true });
  assert.ok(prefetched, 'a prefetch under another preset starts the build');
  assert.equal((await prefetched).preset, 'medium');
  preset = 'high';
}

// ---- 2. and 3. the activation runtime: a dormant stale battlefield, then one on screen
{
  const scene = new THREE.Scene();
  const runtime = createWorldActivationRuntime({
    initialMapId: 'verdant',
    coordinatorDependencies: dependencies(scene),
    swapSceneWorld() {}, setSceneWorldActive() {}, ensureCloudTextures() {}, awaitInitialCloudWarm: async () => {},
    applySkyPreset() {}, applySkyPresentation() {}, setSun() {}, getFogDensity: () => 0, onFogDensityChanged() {},
    canCreateCollider: () => false, createCollider: () => null, placeGarage() {},
    isMinimapReady: () => false, buildMinimap() {}, loadMinimapAsset: async () => false,
    compilePrograms() {}, linkerBreathingSlices: function* () {}, updateShadowFrustums() {}, warmShadowFrame() {},
    nextFrame: async () => {}, now: () => 0,
  });
  const first = await runtime.ensure('verdant', null, { precompile: false });
  runtime.setDormant(true); // back in the Garage; the player switches to Ultra Low
  preset = 'ultralow';
  const rematch = await runtime.ensure('verdant', null, { precompile: false });
  assert.notEqual(rematch, first, 'the rematch builds the battlefield for the preset it now runs under');
  assert.equal(rematch.preset, 'ultralow');
  assert.equal(runtime.current, rematch);
  await turn();
  assert.ok(released.includes(first.group.name), 'the dormant battlefield built for the old preset is released');
  // on screen when the preset changes: kept until the fresh world replaces it
  preset = 'high';
  assert.equal(runtime.switchMap('verdant'), rematch, 'the battlefield on screen is not torn down by a lookup');
  const fresh = await runtime.ensure('verdant', null, { precompile: false });
  assert.notEqual(fresh, rematch);
  assert.equal(runtime.current, fresh);
  await turn();
  assert.ok(released.includes(rematch.group.name), 'and is released once the fresh one is presented');
  assert.equal([...runtime.cache.values()].includes(rematch), false);
}

// ---- 5. the class is what the build captures, on the real quality module
{
  const classOf = (name) => worldBuildClassOf(PRESETS[name]);
  for (const name of ['ultra', 'high', 'medium', 'low']) assert.equal(classOf(name), classOf('high'), `${name} builds the full world`);
  assert.notEqual(classOf('ultralow'), classOf('high'), 'Ultra Low builds the light world');
  for (const name of ['mobile-high', 'mobile', 'mobile-low']) assert.equal(classOf(name), classOf('mobile'), `${name}: the phone's world`);
  assert.notEqual(classOf('mobile-ultralow'), classOf('mobile'));
  assert.notEqual(classOf('mobile'), classOf('high'), 'the phones scale their world textures');
  assert.equal(PRESET_ORDER.length + MOBILE_PRESET_ORDER.length, Object.keys(PRESETS).length, 'every preset is classed above');

  const scene = new THREE.Scene();
  const runtime = createWorldActivationRuntime({
    initialMapId: 'verdant',
    coordinatorDependencies: dependencies(scene, { buildClass: undefined }), // the default: the live preset's class
    swapSceneWorld() {}, setSceneWorldActive() {}, ensureCloudTextures() {}, awaitInitialCloudWarm: async () => {},
    applySkyPreset() {}, applySkyPresentation() {}, setSun() {}, getFogDensity: () => 0, onFogDensityChanged() {},
    canCreateCollider: () => false, createCollider: () => null, placeGarage() {},
    isMinimapReady: () => false, buildMinimap() {}, loadMinimapAsset: async () => false,
    compilePrograms() {}, linkerBreathingSlices: function* () {}, updateShadowFrustums() {}, warmShadowFrame() {},
    nextFrame: async () => {}, now: () => 0,
  });
  const info = console.info;
  console.info = () => {}; // the governor's own notes
  try {
    // a desktop the hardware heuristics leave uncapped (engine/quality.ts heuristicAutoCap: more than four cores)
    Object.defineProperty(globalThis.navigator, 'hardwareConcurrency', { value: 16, configurable: true });
    setPresetName('auto');
    assert.equal(resolvePresetName(), 'high', 'desktop Auto starts at High');
    // a battle, then Battle Again after a live step: the battlefield waits dormant under the Garage meanwhile
    const battle = await runtime.ensure('verdant', null, { precompile: false });
    const rematch = async (step, expected) => {
      runtime.setDormant(true);
      step();
      assert.equal(resolvePresetName(), expected);
      const before = builds;
      const world = await runtime.ensure('verdant', null, { precompile: false });
      return { world, built: builds - before };
    };
    // the context-loss recovery steps one tier down
    let next = await rematch(() => noteGraphicsContextLoss(), 'medium');
    assert.equal(next.world, battle, 'after the recovery step the cached battlefield is reused');
    assert.equal(next.built, 0, 'with no build: Battle Again stays instant');
    setPresetName('auto'); // clears the recovery
    next = await rematch(() => assert.ok(reportSustainedOverload()), 'medium');
    assert.equal(next.world, battle, 'a governor step High -> Medium keeps the cached battlefield');
    assert.equal(next.built, 0);
    next = await rematch(() => assert.ok(reportSustainedOverload()), 'low');
    assert.equal(next.world, battle, 'Medium -> Low keeps it too');
    assert.equal(next.built, 0);
    next = await rematch(() => assert.ok(reportSustainedOverload()), 'ultralow');
    assert.notEqual(next.world, battle, 'a step into Ultra Low builds the light battlefield');
    assert.equal(next.built, 1);
    await turn();
    assert.ok(released.includes(battle.group.name), 'and releases the full one');
    const light = next.world;
    next = await rematch(() => assert.ok(reportSustainedRecovery()), 'low');
    assert.notEqual(next.world, light, 'a step out of Ultra Low builds the full battlefield again');
    assert.equal(next.built, 1);
  } finally {
    console.info = info;
    setPresetName('auto');
  }
}

console.log('worldBuildPresetClass.selftest: a cached battlefield is reused only under the build class it was built for (rebuilt and released otherwise: a dormant one at once, one on screen once replaced; a prefetch is no stale hit); the class is what the build captures, so governor and recovery steps between High, Medium and Low keep it, and Ultra Low rebuilds it PASS');
