import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBattleVisualStreamer } from './battleVisualStreamer.ts';

const scene = new THREE.Scene();
const entities = [{ specId: 'alpha' }, { specId: 'bravo' }];
const game = { tanks: entities };
const staged = [...entities];
const builderRequests = [];
const timings = [];
const yieldFlags = [];
const initializedTextures = [];
const compiled = [];
const primed = [];
let restored = 0;
let clock = 0;

const createVisual = (entity) => {
  const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ map: texture })));
  scene.add(root);
  entity.visual = {
    root,
    syncFromState() {},
    setVisible(visible) { root.visible = visible; },
    prewarmBurn() {},
  };
};

const streamer = createBattleVisualStreamer({
  game,
  scene,
  renderer: { initTexture(texture) { initializedTextures.push(texture); } },
  anisotropy: 4,
  async ensureTankBuilders(ids) { builderRequests.push([...ids]); },
  nextStagedBake(_game, predicate) {
    const entity = staged.find((candidate) => !candidate.visual && (!predicate || predicate(candidate)));
    return entity ? { ent: entity, quality: 'opening' } : null;
  },
  ensureStagedVisuals(_game, _count, predicate) {
    const entity = staged.find((candidate) => !candidate.visual && (!predicate || predicate(candidate)));
    if (entity) createVisual(entity);
  },
  getSpec(specId) { return { id: specId }; },
  async prebakeSharedTextures(_spec, _anisotropy, _quality, tick) { await tick(); },
  armorAimOverlay: {
    prime(entity) { primed.push(entity.specId); },
    warm() { return () => { restored += 1; }; },
  },
  forwardProgramWarm: { compile(root) { compiled.push(root); } },
  recordTiming(timing) { timings.push(timing); },
  now: () => { clock += 2; return clock; },
});

const built = await streamer.stream(
  () => true,
  async (covered) => { yieldFlags.push(covered); },
  null,
  true,
);
assert.equal(built, 2);
assert.deepEqual(builderRequests, [['alpha', 'bravo']],
  'all exact builders resolve concurrently before procedural construction');
assert.deepEqual(primed, ['alpha', 'bravo']);
assert.equal(compiled.length, 2);
assert.equal(restored, 2);
assert.equal(initializedTextures.length, 2);
assert.equal(timings.length, 2);
assert.ok(timings.every((timing) => timing.totalMs > 0 && timing.compileMs > 0));
assert.ok(timings.every((timing) => timing.preUploadYieldMs > 0));
assert.ok(timings.every((timing) => timing.textureUploadMs > 0));
assert.ok(timings.every((timing) => timing.postCompileYieldMs > 0));
assert.ok(entities.every((entity) => entity.visual.root.parent === null));
assert.ok(entities.every((entity) => entity.visual.root.userData.battleVisibilityDetached));
assert.ok(yieldFlags.includes(true) && yieldFlags.includes(undefined));

const empty = await streamer.stageRootTextureUploads(null);
assert.deepEqual(empty, { textures: 0, totalMs: 0 });

console.log('battleVisualStreamer.selftest: parallel builders, exact uploads, and hidden reveal passed');
