// liveCombatWarm.selftest.mjs — the combat warms that run between a revealed battle's frames restore everything before
// every yield (2026-10-19, black-screen-228 RC3; game/battleWarmRuntime.ts, engine/deploymentShadowWarm.ts).
//  - The opening and destruction volleys hid the effect root across yields (every live particle gone for the warm's
//    length) and then fx.resetAll() wiped live craters, trails and drones. Live, they spawn nothing: the effect root's
//    programs compile in place, its visibility untouched, nothing reset. Covered and Garage warms keep the volleys.
//  - The hidden-variant compile restored the field of view in its finally but not the cascade fit: the frames between
//    its scope steps rendered with cascades fitted for 20 or 8 degrees.
//  - The depth-program warm held the far cascade at a 520 m box and froze its siblings across yields.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCombatOpeningWarmSteps, createCombatRareWarmSteps } from './battleWarmRuntime.ts';
import { warmDepthProgramSteps } from '../engine/depthProgramWarm.ts';

function stubContext({ phase = 'battle' } = {}) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 4000);
  const group = new THREE.Group();
  group.name = 'fx';
  const live = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial());
  live.name = 'live-dust';
  group.add(live);
  scene.add(group);
  const record = { spawns: 0, resets: 0, initialized: [], initOptions: [], fits: [] };
  const spawn = () => { record.spawns++; };
  const fx = {
    group, warmTextures() {}, muzzleFlash: spawn, impact: spawn, dust: spawn, exhaust: spawn, warmStructures: spawn,
    destruction: spawn, propBreak: spawn, propCrush: spawn, armorScar() {}, clearVehicleDecals() {}, update() {},
    resetAll() { record.resets++; },
  };
  let openingReady = false, rareReady = false, destructionWarmed = false;
  const gl = { isContextLost: () => false };
  const context = {
    game: { phase, tanks: [], shells: [], player: null }, fx, camera, scene,
    post: { prepareSoftParticles() {} },
    renderer: { info: { programs: [] }, getContext: () => gl, initTexture() {} },
    world: () => null, warmRender() {}, anisotropy: 1,
    deploymentShadowWarm: { *warmDepthProgramSteps() { yield; } },
    forwardProgramWarm: {
      *initializeSteps(root, _stats, options) { record.initialized.push(root.name); record.initOptions.push(options ?? null); yield; yield; },
      compile() {}, *linkerBreathingSlices() {},
    },
    lighting: { updateFrustums() { record.fits.push(camera.fov); } },
    scratch1: new THREE.Vector3(), scratch2: new THREE.Vector3(), scratch3: new THREE.Vector3(),
    ensureStagedVisuals: () => true, prebakeBurntSteps: function* () {}, warmWreckTextures() {},
    *createIsolatedForwardWarmBatches() { yield { label: 'fx', objects: 1, ms: 0 }; },
    isOpeningReady: () => openingReady, isRareReady: () => rareReady,
    markOpeningReady() { openingReady = true; }, markRareReady() { rareReady = true; },
    isDestructionWarmed: () => destructionWarmed, setDestructionWarmed(value) { destructionWarmed = value; },
  };
  return { context, record, group, live, camera };
}

/** Drive a warm generator, checking every yield. */
function drive(steps, atYield) {
  let count = 0;
  for (let result = steps.next(); !result.done; result = steps.next()) { count++; atYield(count); }
  return count;
}

{
  // live (a revealed battle, cooperative): nothing hidden at any yield, no spawn, no reset, the root compiled in place
  const { context, record, group, live } = stubContext();
  const yields = drive(createCombatRareWarmSteps(context, { cooperative: true }), (n) => {
    assert.equal(group.visible, true, `yield ${n}: the effect root stays visible`);
    assert.equal(live.parent, group, `yield ${n}: live effects stay in place`);
    assert.equal(record.resets, 0, `yield ${n}: no live effect is reset`);
  });
  assert.ok(yields >= 4, `the live warm yields (${yields})`);
  assert.equal(record.spawns, 0, 'no warm volley spawns in a live battle');
  assert.equal(record.resets, 0);
  assert.deepEqual(record.initialized, ['fx', 'fx'], 'the opening and destruction programs compile on the effect root in place');
  // (round 2, eng D4) the idle pools' programs too: they sit hidden until they fire, and the warm marks them warmed
  assert.ok(record.initOptions.every((options) => options?.includeHidden === true), 'the live warm compiles the hidden idle pools as well');
  assert.equal(context.isOpeningReady(), true);
  assert.equal(context.isDestructionWarmed(), true);
  assert.equal(globalThis.__COMBAT_RARE_WARM_STEP, null, 'the live step label clears when the rare warm ends');
}

{
  // covered or Garage (not a live battle): the volleys run as before, under a hidden root restored at the end
  for (const [phase, execution] of [['garage', { cooperative: true }], ['battle', { cooperative: false }], ['battle', undefined]]) {
    const { context, record, group } = stubContext({ phase });
    drive(createCombatOpeningWarmSteps(context, execution), () => {});
    assert.ok(record.spawns > 0, `${phase}/${execution?.cooperative}: the opening volley spawns`);
    assert.equal(record.resets, 1, 'and resets what it spawned');
    assert.equal(group.visible, true, 'the root is restored');
  }
}

{
  // the hidden-variant scope renders: every yield sees cascades fitted to the live field of view
  const { context, record, camera } = stubContext();
  camera.fov = 55;
  camera.updateProjectionMatrix();
  context.isOpeningReady = () => true;
  context.isDestructionWarmed = () => true;
  const steps = createCombatRareWarmSteps(context, { cooperative: true });
  drive(steps, (n) => {
    assert.equal(camera.fov, 55, `yield ${n}: the live field of view`);
    if (record.fits.length) assert.equal(record.fits.at(-1), 55, `yield ${n}: the last cascade fit is the live one`);
  });
  assert.ok(record.fits.includes(20) && record.fits.includes(8), 'the scope variants still render at 20 and 8 degrees');
}

{
  // the depth-program warm: every yield sees the production far cascade and live sibling cascades
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const lights = [0, 1, 2].map(() => {
    const light = new THREE.DirectionalLight();
    light.castShadow = true;
    light.shadow.autoUpdate = true;
    return light;
  });
  const far = lights[2].shadow.camera;
  Object.assign(far, { left: -90, right: 110, top: 70, bottom: -60, near: 2, far: 900 });
  far.updateProjectionMatrix();
  lights[2].shadow.autoUpdate = false; // the rate-capped far cascade
  const world = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const child = new THREE.Group();
    child.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    world.add(child);
  }
  const actor = new THREE.Group();
  actor.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
  scene.add(world, actor, ...lights);
  const during = [];
  const warmRender = () => {
    during.push({ left: far.left, autoUpdate: lights.map((light) => light.shadow.autoUpdate), visible: world.visible && actor.visible });
  };
  const live = { left: far.left, right: far.right, top: far.top, bottom: far.bottom, near: far.near, far: far.far };
  let yields = 0;
  for (const _ of warmDepthProgramSteps({ lights, scene, warmRender, worldGroup: world })) {
    yields++;
    assert.deepEqual({ left: far.left, right: far.right, top: far.top, bottom: far.bottom, near: far.near, far: far.far }, live,
      `yield ${yields}: the far cascade's live box`);
    assert.deepEqual(lights.map((light) => light.shadow.autoUpdate), [true, true, false], `yield ${yields}: the live cascade cadence`);
    assert.ok(world.visible && actor.visible && world.children.every((child) => child.visible), `yield ${yields}: nothing hidden`);
  }
  assert.ok(yields >= 4);
  assert.ok(during.every((entry) => entry.left === -520 && entry.autoUpdate.every((on) => on === false)),
    'inside each warm render: the 520 m box, every cascade held');
  assert.ok(lights.every((light) => light.shadow.needsUpdate), 'every cascade draws a fresh live map once the warm ends');
}

console.log('liveCombatWarm.selftest: live opening/destruction warms spawn, hide and reset nothing; the scope warm fits live cascades and the depth warm restores the far box and its siblings before every yield');
