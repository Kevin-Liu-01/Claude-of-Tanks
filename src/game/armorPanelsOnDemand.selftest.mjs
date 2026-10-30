// The armour paint's panels bake only for a battle that wants them (265; the world-reds lane and Main: every vehicle's
// panels baked at staging whatever the overlay's setting, off by default). The streamer's staging bakes a vehicle's
// panels only while armorPanelsWanted() says the overlay is on (off when not given); the overlay primes without baking,
// runs no frame share while it is off, and once it is on bakes every primed vehicle in the frames' share; bakePanels
// still bakes when asked. The control: the same staging with the overlay on does bake, and so does the frame share.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installCanvasFixture } from '../vehicles/canvasFixture.test-support.mjs';

const restoreCanvas = installCanvasFixture();
const { createBattleVisualStreamer } = await import('./battleVisualStreamer.ts');
const { createArmorAimOverlay } = await import('./armorAimOverlay.ts');

// ---- the streamer's staging: no bake while the overlay is off
{
  const scene = new THREE.Scene();
  const baked = [];
  let wanted = false;
  const streamerWith = (options) => createBattleVisualStreamer({
    game: { tanks: [] }, scene, renderer: { initTexture() {} }, anisotropy: 4,
    async ensureTankBuilders() {}, nextStagedBake: () => null, *ensureStagedVisualsSteps() { return true; },
    getSpec: (id) => ({ id }), async prebakeSharedTextures() {},
    armorAimOverlay: { prime() {}, async bakePanels(entity) { baked.push(entity.specId); }, warm: () => () => {} },
    forwardProgramWarm: { compile() {} },
    ...options,
  });
  const entity = (specId) => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    scene.add(root);
    return { specId, visual: { root, syncFromState() {}, setVisible(v) { root.visible = v; } } };
  };
  const streamer = streamerWith({ armorPanelsWanted: () => wanted });
  await streamer.stageBattleVisualReveal(entity('off'), async () => {});
  assert.deepEqual(baked, [], 'the overlay off: staging bakes no panels');
  await streamerWith({}).stageBattleVisualReveal(entity('unasked'), async () => {});
  assert.deepEqual(baked, [], 'and none when the streamer is not told');
  wanted = true;
  await streamer.stageBattleVisualReveal(entity('on'), async () => {});
  assert.deepEqual(baked, ['on'], 'the control: the overlay on, staging bakes them');
}

// ---- the overlay: primed without a bake, no frame share while off, every primed vehicle baked once it is on
{
  const { createTank, ensureTankBuilder, battleStaticDrawMerge } = await import('../vehicles/fleetFactory.ts');
  const { getSpec } = await import('../vehicles/specs.ts');
  const { createTankState } = await import('../sim/movement.ts');
  const ids = ['t72b3', 'leo2a6'];
  const targets = [];
  for (const id of ids) {
    await ensureTankBuilder(id);
    const spec = getSpec(id);
    const visual = createTank(id, null, { camoSeed: 7, quality: 'ai', geometryQuality: 'low', batchStatic: true,
      battleDetailLod: true, eraVisualBindingReceipt: false, staticDrawMerge: battleStaticDrawMerge(id) });
    const state = createTankState(spec, new THREE.Vector3(0, 0, 0), 0);
    visual.syncFromState(state, 1 / 30, 10);
    targets.push({ id, state, combat: null, visual, spec });
  }
  const overlay = createArmorAimOverlay();
  const frame = (enabled) => overlay.update({ enabled, scoped: false, targets: [], target: null, shellSpec: null,
    muzzle: new THREE.Vector3(), nowMs: 0 });
  const stats = (target) => target.visual.root.userData.armorPaintPanels;
  assert.ok(overlay.prime(targets[0]), 't72b3: primed');
  for (let i = 0; i < 30; i++) frame(false);
  assert.equal(stats(targets[0]), undefined, 'primed, the overlay off for 30 frames: no bake');
  // the control: the overlay on, the frames' share bakes it
  frame(true);
  assert.ok(stats(targets[0]), 'the overlay on: its bake starts on the next frame');
  for (let i = 0; i < 20000 && stats(targets[0]).baked === 0; i++) frame(true);
  assert.ok(stats(targets[0]).baked > 0, `the frames' share bakes it (${stats(targets[0]).baked} triangles)`);
  // asked directly (the streamer's staging with the overlay on), it bakes whatever the frames have done
  await overlay.bakePanels(targets[1], async () => {});
  assert.ok(stats(targets[1])?.baked > 0, `bakePanels still bakes when asked (${stats(targets[1])?.baked} triangles)`);
  overlay.dispose();
  for (const target of targets) target.visual.dispose();
}

restoreCanvas();
console.log('armorPanelsOnDemand selftest passed: no panel bake while the overlay is off (staging or frames), every primed vehicle baked once it is on, bakePanels on request');
