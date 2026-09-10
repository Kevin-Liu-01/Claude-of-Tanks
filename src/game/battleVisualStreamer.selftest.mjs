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
const registered = [];
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
  *ensureStagedVisualsSteps(_game, _count, predicate) {
    const entity = staged.find((candidate) => !candidate.visual && (!predicate || predicate(candidate)));
    if (entity) {
      yield;
      yield;
      createVisual(entity);
    }
    return true;
  },
  getSpec(specId) { return { id: specId }; },
  async prebakeSharedTextures(_spec, _anisotropy, _quality, tick) { await tick(); },
  armorAimOverlay: {
    prime(entity) { primed.push(entity.specId); },
    warm() { return () => { restored += 1; }; },
  },
  forwardProgramWarm: { compile(root) { compiled.push(root); } },
  onVisualReady(entity) {
    assert.equal(entity.visual.root.parent, scene,
      'late emitter registration sees the staged scene-attached visual');
    assert.equal(compiled.includes(entity.visual.root), false,
      'late emitter registration precedes its forward-program warm');
    registered.push(entity.specId);
  },
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
assert.deepEqual(registered, ['alpha', 'bravo']);
assert.equal(restored, 2);
assert.equal(initializedTextures.length, 2);
assert.equal(timings.length, 2);
assert.ok(timings.every(t => t.buildCheckpointCount === 2 && t.buildYieldMs > 0 && t.buildMs >= 0));
assert.ok(timings.every((timing) => timing.totalMs > 0 && timing.compileMs > 0));
assert.ok(timings.every((timing) => timing.preUploadYieldMs > 0));
assert.ok(timings.every((timing) => timing.textureUploadMs > 0));
assert.ok(timings.every((timing) => timing.postCompileYieldMs > 0));
assert.ok(entities.every((entity) => entity.visual.root.parent === null));
assert.ok(entities.every((entity) => entity.visual.root.userData.battleVisibilityDetached));
assert.ok(yieldFlags.includes(true) && yieldFlags.includes(undefined));

const empty = await streamer.stageRootTextureUploads(null);
assert.deepEqual(empty, { textures: 0, totalMs: 0 });

// Early player staging still uploads, registers and prepares the real visual;
// only its pre-camouflage/pre-light program submission is deferred.
const player = { specId: 'early-player' };
createVisual(player);
const early = await streamer.stageBattleVisualReveal(player, async () => {}, false,
  { compilePrograms: false });
assert.equal(compiled.length, 2, 'explicit covered deferral submits no early player program');
assert.equal(early.compileMs, 0, 'a deferred compile is not reported as performed');
assert.equal(initializedTextures.length, 3, 'deferral preserves the exact player texture upload');
assert.deepEqual(registered, ['alpha', 'bravo', 'early-player']);
assert.deepEqual(primed, ['alpha', 'bravo', 'early-player']);
assert.equal(restored, 3, 'armor warm visibility is restored even without a program submission');
assert.strictEqual(player.visual.root.parent, scene);
assert.equal(player.visual.root.visible, true);
assert.equal(player.visual.root.userData.loadStaged, true);
const repeated = await streamer.stageBattleVisualReveal(player, async () => {});
assert.equal(repeated.totalMs, 0, 'staging remains idempotent; deployment owns the final scene compile');
assert.equal(compiled.length, 2);

function constructionFixture({ bakeFails = false, factoryFails = false } = {}) {
  const scene = new THREE.Scene(), ent = { specId: 'test' }, game = { tanks: [ent] };
  let clock = 0, created = 0, canceled = 0;
  const timings = [];
  const streamer = createBattleVisualStreamer({ game, scene,
    renderer: { initTexture() {} }, anisotropy: 1,
    async ensureTankBuilders() {},
    nextStagedBake() { return ent.visual ? null : { ent, quality: 'ai' }; },
    *ensureStagedVisualsSteps() {
      created++; let complete = false;
      try {
        clock += 30; yield;
        if (factoryFails) throw Error('factory failed');
        clock += 7; yield;
        clock += 3;
        ent.visual = { root: new THREE.Group(), setVisible() {}, prewarmBurn() {} };
        scene.add(ent.visual.root);
        complete = true;
        return true;
      } finally { if (!complete) canceled++; }
    },
    getSpec() { return {}; },
    async prebakeSharedTextures() { if (bakeFails) throw Error('prebake failed'); },
    armorAimOverlay: { prime() {}, warm() { return () => {}; } },
    forwardProgramWarm: { compile() {} },
    recordTiming(value) { timings.push(value); }, now: () => clock,
  });
  return { streamer, ent, scene, timings, wait() { clock += 100; },
    get created() { return created; }, get canceled() { return canceled; } };
}
{
  const f = constructionFixture();
  assert.equal(await f.streamer.stream(null, async () => f.wait()), 1);
  assert.equal(f.timings[0].buildMs, 40, 'build CPU receipt excludes scheduled waits');
  assert.equal(f.timings[0].buildYieldMs, 200);
  assert.equal(f.timings[0].buildCheckpointCount, 2);
  assert.equal(f.canceled, 0);
}
for (const failAt of [2, 3]) {
  const f = constructionFixture(); let calls = 0;
  await assert.rejects(f.streamer.stream(null, async () => {
    calls++; if (calls === failAt) throw Error('stale frame gate');
  }), /stale frame gate/);
  assert.equal(f.created, 1);
  assert.equal(f.canceled, 1, 'await rejection closes the actual construction iterator');
  assert.equal(f.ent.visual, undefined);
  assert.equal(f.scene.children.length, 0);
}
{
  const f = constructionFixture({ bakeFails: true });
  await assert.rejects(f.streamer.stream(null, async () => { throw Error('stale after bake'); }), /stale after bake/);
  assert.equal(f.created, 0, 'prebake fallback cannot begin construction past a rejected owner gate');
}
{
  const f = constructionFixture({ factoryFails: true });
  await assert.rejects(f.streamer.stream(null, async () => {}), /factory failed/);
  assert.equal(f.canceled, 1);
  assert.equal(f.ent.visual, undefined);
}
console.log('battleVisualStreamer.selftest: cooperative construction, accurate CPU/wait receipts, cancellation, default compile, exact uploads, hidden reveal and player deferral passed');
