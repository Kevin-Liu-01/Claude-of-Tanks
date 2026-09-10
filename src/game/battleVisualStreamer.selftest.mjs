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

function constructionFixture({ bakeFails = false, factoryFails = false, stepMs = [30, 7, 3], createSteps } = {}) {
  const scene = new THREE.Scene(), ent = { specId: 'test' }, game = { tanks: [ent] };
  let clock = 0, created = 0, canceled = 0;
  const timings = [];
  const streamer = createBattleVisualStreamer({ game, scene,
    renderer: { initTexture() {} }, anisotropy: 1,
    async ensureTankBuilders() {},
    nextStagedBake() { return ent.visual ? null : { ent, quality: 'ai' }; },
    ensureStagedVisualsSteps() {
      if (createSteps) return createSteps({ ent, scene, advance(ms) { clock += ms; } });
      return (function* () {
        created++; let complete = false;
        try {
          clock += stepMs[0]; yield;
          if (factoryFails) throw Error('factory failed');
          clock += stepMs[1]; yield;
          clock += stepMs[2];
          ent.visual = { root: new THREE.Group(), setVisible() {}, prewarmBurn() {} };
          scene.add(ent.visual.root);
          complete = true;
          return true;
        } finally { if (!complete) canceled++; }
      })();
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
  assert.equal(f.timings[0].buildMs, 40, 'build non-await elapsed receipt excludes scheduled waits');
  assert.equal(f.timings[0].buildYieldMs, 200);
  assert.equal(f.timings[0].buildCheckpointCount, 2);
  assert.equal(f.timings[0].buildStartedAt, 100);
  assert.equal(f.timings[0].buildFinishedAt, 340);
  assert.equal(f.timings[0].firstBuildStepMs, 30);
  assert.equal(f.timings[0].maxBuildStepMs, 30);
  assert.equal(f.timings[0].maxBuildStepIndex, 0, 'step indexes are zero-based');
  assert.equal(f.timings[0].maxBuildStepStartedAt, 100);
  assert.equal(f.timings[0].maxBuildStepFinishedAt, 130);
  assert.equal(f.canceled, 0);
}
for (const stepMs of [[3.125, 30.25, 7.5], [3.125, 7.5, 30.25], [3.125, 3.125, 3.125]]) {
  const f = constructionFixture({ stepMs });
  let waits = 0;
  assert.equal(await f.streamer.stream(null, async () => { waits++; f.wait(); }), 1);
  const timing = f.timings[0], index = stepMs.indexOf(Math.max(...stepMs));
  assert.equal(timing.firstBuildStepMs, stepMs[0]);
  assert.equal(timing.maxBuildStepMs, stepMs[index], 'next timing stays unrounded and excludes waits');
  assert.equal(timing.maxBuildStepIndex, index, 'completion next is measured; ties retain the first occurrence');
  assert.equal(timing.maxBuildStepStartedAt, 100 + index * 100 + stepMs.slice(0, index).reduce((a, b) => a + b, 0));
  assert.equal(timing.maxBuildStepFinishedAt - timing.maxBuildStepStartedAt, stepMs[index]);
  assert.equal(timing.buildFinishedAt - timing.buildStartedAt, 200 + stepMs.reduce((a, b) => a + b, 0));
  assert.equal(waits, 6, 'diagnostic iteration adds no scheduler calls');
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
  assert.equal(f.timings[0].buildFinishedAt, failAt === 2 ? 30 : 37,
    'a rejected wait publishes its exact build-stop timestamp after IteratorClose');
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
  assert.equal(f.timings[0].buildFinishedAt, 30);
}

for (const mode of ['complete', 'throw-next', 'reject-wait', 'throw-return']) {
  const events = [], original = new Error(mode), cleanup = new Error('cleanup');
  let nextReads = 0, nextCalls = 0, returnCalls = 0, waits = 0;
  let rejectWait;
  const f = constructionFixture({ createSteps({ ent, advance }) {
    const source = {
      [Symbol.iterator]() { events.push('iterator'); return this; },
      get next() {
        nextReads++;
        return function (...args) {
          assert.equal(this, source, 'next preserves the underlying receiver');
          assert.equal(args.length, 0, 'next preserves for-of argument count');
          nextCalls++;
          advance(12.25);
          if (mode === 'throw-next') throw original;
          if (mode === 'complete') {
            ent.visual = { root: new THREE.Group(), setVisible() {}, prewarmBurn() {} };
            return { done: true, value: true };
          }
          queueMicrotask(() => events.push('microtask'));
          return { done: false, get value() { events.push('value'); return undefined; } };
        };
      },
      return(...args) {
        assert.equal(this, source, 'return preserves the underlying receiver');
        assert.equal(args.length, 0, 'IteratorClose forwards zero arguments');
        returnCalls++;
        advance(2.5);
        if (mode === 'throw-return') throw cleanup;
        return { done: true, value: false };
      },
    };
    return source;
  } });
  const pending = f.streamer.stream(null, () => {
    waits++;
    if (waits === 2 && mode !== 'complete') {
      events.push('wait');
      assert.deepEqual(events, ['iterator', 'value', 'wait'], 'next result reaches its existing yielder without an added async hop');
      if (mode === 'reject-wait') return new Promise((_resolve, reject) => { rejectWait = reject; });
      return Promise.reject(original);
    }
    return Promise.resolve();
  });
  if (mode === 'reject-wait') {
    for (let turn = 0; turn < 12 && !rejectWait; turn++) await Promise.resolve();
    assert.equal(typeof rejectWait, 'function');
    assert.equal(returnCalls, 0, 'held waits keep the original unfinished iterator alive');
    assert.equal(f.timings[0].maxBuildStepMs, 12.25, 'completed next timing is visible while the scheduler wait is held');
    assert.equal(f.timings[0].buildFinishedAt, undefined, 'a suspended build is not marked finished');
    rejectWait(original);
  }
  if (mode === 'complete') assert.equal(await pending, 1);
  else await assert.rejects(pending, error => error === original, 'cleanup cannot replace the original construction/wait error');
  assert.equal(nextReads, 1, 'GetIterator caches the underlying next method once');
  assert.equal(nextCalls, 1);
  assert.equal(returnCalls, ['reject-wait', 'throw-return'].includes(mode) ? 1 : 0,
    'only abandoned yielded iterators are closed, never completed or throwing next calls');
  const timing = f.timings[0];
  assert.equal(timing.firstBuildStepMs, 12.25, 'terminal and throwing next durations are retained');
  assert.equal(timing.maxBuildStepMs, 12.25, 'IteratorClose cleanup is outside the measured next call');
  assert.equal(timing.maxBuildStepIndex, 0);
  assert.equal(timing.maxBuildStepStartedAt, 0);
  assert.equal(timing.maxBuildStepFinishedAt, 12.25);
  assert.equal(timing.buildFinishedAt, returnCalls ? 14.75 : 12.25);
}

for (const mode of ['current', 'pooled', 'malformed']) {
  const core = { startedAt: 0, materialsStartedAt: 1, materialsFinishedAt: 2,
    authoredStartedAt: 3, authoredFinishedAt: 4, bindMergeFinishedAt: 5, finishedAt: 9,
    setupMs: 2, unrelatedRows: new Array(100).fill('do not copy') };
  if (mode === 'pooled') { core.startedAt = -100; core.finishedAt = -91; }
  if (mode === 'malformed') core.setupMs = NaN;
  const f = constructionFixture({ createSteps: function* ({ ent, advance }) {
    advance(9);
    const root = new THREE.Group();
    root.userData.coreBuildTiming = core;
    ent.visual = { root, setVisible() {}, prewarmBurn() {} };
    return true;
  } });
  assert.equal(await f.streamer.stream(null, async () => {}), 1);
  const copied = f.timings[0].coreBuildTiming;
  if (mode === 'current') {
    const { unrelatedRows, ...expected } = core;
    assert.deepEqual(copied, expected, 'only bounded current-build fields enter the visual timing receipt');
    assert.notEqual(copied, core, 'the timing receipt is detached from mutable visual metadata');
  } else assert.equal(copied, undefined, `${mode} core metadata cannot masquerade as this iterator's construction`);
}
console.log('battleVisualStreamer.selftest: cooperative construction, exact iterator/non-await/wait receipts, cancellation, default compile, exact uploads, hidden reveal and player deferral passed');
