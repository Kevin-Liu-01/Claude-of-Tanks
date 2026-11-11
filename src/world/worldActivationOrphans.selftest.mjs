// worldActivationOrphans.selftest.mjs — (2026-11-02 audit R1, round 2 U26) what an activation leaves behind once a later
// request supersedes it. The real activation runtime over the real build coordinator (a fake map module that builds in
// STEPS paced slices, a loading pace and a Garage the test owns, the real phase residency):
// 1. an orphaned foreground build (its entry's sibling failed and the Garage was restored while it built) is speculative
//    again: the next entry on another battlefield cancels it, so the mobile tier never runs two builds at once (before,
//    foreground builds never cancelled: the orphan took loading-pace slices beside the next entry's build), and its
//    ensure settles superseded, never with the cancelled build's error;
// 2. the retry on the same battlefield joins that orphaned build (one build, not a fresh one);
// 3. behind the live Garage the orphan waits out the Garage's presses as any speculative build does, finishes in a lull,
//    and is cached hidden for a retry;
// 4. a request superseded while its warm waits (the covered entry's cloud bake) hides its world at once (before, the
//    battlefield stayed drawn over the Garage until the cloud wait ended);
// 5. the cache readers go through the class owner: whether a world would be reused, with no side effect, and the resident
//    worlds by build id (main.ts hasCachedWorld and the probes' getWorldCacheIds read the raw cache keys before);
// 6. the one trace slot holds the newest request's trace: a superseded request settling after a later one published never
//    overwrites it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createWorldActivationRuntime } from './worldActivationRuntime.ts';
import { createPhaseSceneResidency } from '../engine/phaseSceneResidency.ts';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve)); };
const settle = (promise) => promise.then((world) => ({ world }), (error) => ({ error }));
const STEPS = 8;

function harness({ worldScenes = 1 } = {}) {
  const scene = new THREE.Scene();
  const garageRoot = new THREE.Group();
  garageRoot.name = 'garage';
  scene.add(garageRoot);
  const residency = createPhaseSceneResidency({ scene, garageRoots: [garageRoot] });
  const steps = new Map(), starts = new Map(), gates = new Map(), disposed = [], traces = [];
  let clock = 0;
  const garage = { phase: 'garage', transitionActive: false, lastActivityAt: 0 };
  const sleeps = [];
  let pace = deferred();
  let cloudGate = null;
  let buildClass = 'full';
  const runtime = createWorldActivationRuntime({
    initialMapId: 'alpha',
    coordinatorDependencies: {
      engineContext: {}, scene, renderer: { renderLists: { dispose() {} } }, deviceTier: 'mobile',
      getGarageActivity: () => garage,
      releaseShadowMaterial() {},
      loadModule: async () => ({
        async createMapAsync(_engine, { mapId }, progress) {
          starts.set(mapId, (starts.get(mapId) ?? 0) + 1);
          for (let step = 0; step < STEPS; step++) {
            await progress('Surveying terrain', step / STEPS);
            steps.set(mapId, (steps.get(mapId) ?? 0) + 1);
            if (step === 0 && gates.has(mapId)) await gates.get(mapId).promise;
          }
          const group = new THREE.Group();
          group.name = mapId;
          scene.add(group);
          return { mapId, group, config: { sky: { preset: mapId } }, raycast: () => null, dispose() { disposed.push(mapId); } };
        },
      }),
      now: () => clock,
      // the Garage's lull polls wait on the test (the Garage stays busy until lull())
      sleep: () => { const wait = deferred(); sleeps.push(wait); return wait.promise; },
      // every slice of every build waits for the next pump: the loading pace
      foregroundYielder: () => () => pace.promise,
      backgroundYielder: () => () => pace.promise,
      resourceLimits: { pedestalVisuals: 1, worldScenes },
      buildClass: () => buildClass,
    },
    swapSceneWorld: (previous, next) => residency.swapWorld(previous, next),
    setSceneWorldActive: (root, active) => residency.setWorldActive(root, active),
    ensureCloudTextures() {},
    awaitInitialCloudWarm: async () => { if (cloudGate) await cloudGate.promise; },
    applySkyPreset() {}, applySkyPresentation() {}, setSun() {},
    getFogDensity: () => 0, onFogDensityChanged() {},
    canCreateCollider: () => false, createCollider: () => null,
    placeGarage() {}, isMinimapReady: () => false, buildMinimap() {}, loadMinimapAsset: async () => false,
    compilePrograms() {}, linkerBreathingSlices: function* () {},
    updateShadowFrustums() {}, warmShadowFrame() {},
    nextFrame: () => Promise.resolve(),
    now: () => clock,
    publishActivationTrace: (trace) => traces.push(`${trace.id}:${trace.status}`),
  });
  return {
    runtime, steps, starts, disposed, traces,
    drawn: () => scene.children.filter((child) => child !== garageRoot && child.visible).map((child) => child.name).sort(),
    gate(mapId) { const gate = deferred(); gates.set(mapId, gate); return gate; },
    /** One loading slice for every build waiting on the pace. */
    async pump(times = 1) {
      for (let i = 0; i < times; i++) { const slice = pace; pace = deferred(); slice.resolve(); await flush(); }
    },
    /** A press in the Garage just now: no lull. */
    busy() { garage.lastActivityAt = clock; },
    async lull() { clock += 5000; for (const wait of sleeps.splice(0)) wait.resolve(); await flush(); },
    holdClouds() { cloudGate = deferred(); },
    releaseClouds() { const gate = cloudGate; cloudGate = null; gate?.resolve(); },
    setClass(next) { buildClass = next; },
  };
}

/** An entry on `mapId` whose sibling task failed part way through its build: the Garage is restored (setDormant(true)). */
async function orphanEntry(h, mapId) {
  const orphan = settle(h.runtime.ensure(mapId, null, { precompile: false, atmosphere: 'covered-battle' }));
  await flush();
  await h.pump(2);
  assert.ok((h.steps.get(mapId) ?? 0) >= 1, `${mapId} builds at the loading pace`);
  h.busy();
  h.runtime.setDormant(true);
  await h.pump(1); // the slice in flight finishes
  return { orphan }; // (wrapped: an async function returning the promise would wait for it)
}

// ---- 1. the next entry on another battlefield cancels the orphaned build (mobile: one world, one build peak)
{
  const h = harness({ worldScenes: 1 });
  const { orphan } = await orphanEntry(h, 'bravo');
  const before = h.steps.get('bravo');
  const charlie = settle(h.runtime.ensure('charlie', null, { precompile: false, atmosphere: 'covered-battle' }));
  await flush();
  for (let i = 0; i < STEPS + 2; i++) await h.pump(1);
  const { world } = await charlie;
  assert.ok(world && h.runtime.current === world, 'the next entry presents its battlefield');
  assert.equal(h.steps.get('bravo'), before,
    'the orphaned build takes no slice beside the next entry\'s build (before: it kept building, two builds at once on mobile)');
  const settled = await orphan;
  assert.equal(settled.error?.name, 'WorldActivationSuperseded',
    'the orphaned ensure settles superseded, not with the cancelled build\'s error (callers decide by supersession)');
  assert.ok(!h.runtime.cache.has('bravo'), 'the cancelled orphan is never cached');
  assert.deepEqual(h.drawn(), ['charlie'], 'only the battlefield presented draws');
}

// ---- 2. the retry on the same battlefield joins the orphaned build
{
  const h = harness({ worldScenes: 1 });
  const { orphan } = await orphanEntry(h, 'bravo');
  const retry = settle(h.runtime.ensure('bravo', null, { precompile: false, atmosphere: 'covered-battle' }));
  await flush();
  for (let i = 0; i < STEPS + 2; i++) await h.pump(1);
  const { world } = await retry;
  assert.ok(world && h.runtime.current === world, 'the retry presents the battlefield');
  assert.equal(h.starts.get('bravo'), 1, 'one build of it: the retry joined the orphaned build');
  assert.equal((await orphan).error?.name, 'WorldActivationSuperseded', 'the first entry still settles superseded');
}

// ---- 3. behind the live Garage the orphan waits out the Garage's presses, finishes in a lull, cached hidden
{
  const h = harness({ worldScenes: 2 });
  const { orphan } = await orphanEntry(h, 'bravo');
  const held = h.steps.get('bravo');
  await h.pump(4);
  assert.equal(h.steps.get('bravo'), held,
    'while the Garage is busy the orphaned build takes no loading-pace slice behind it (it yields as a speculative build)');
  await h.lull();
  for (let i = 0; i < STEPS + 2; i++) await h.pump(1);
  assert.equal((await orphan).error?.name, 'WorldActivationSuperseded', 'it never presents');
  assert.ok(h.runtime.cache.has('bravo'), 'finished in the Garage\'s lull, it is cached for a retry');
  assert.equal(h.runtime.current, null, 'not current');
  assert.deepEqual(h.drawn(), [], 'and nothing of it draws under the Garage');
}

// ---- 4. superseded while its warm waits on the cloud bake: hidden at once, not when the wait ends
{
  const h = harness({ worldScenes: 2 });
  h.holdClouds();
  const entry = settle(h.runtime.ensure('bravo', null, { precompile: false, atmosphere: 'covered-battle' }));
  await flush();
  for (let i = 0; i < STEPS + 2; i++) await h.pump(1);
  assert.deepEqual(h.drawn(), ['bravo'], 'the covered warm lifted the battlefield and waits on the cloud bake');
  h.runtime.setDormant(true); // the entry failed: the Garage is restored
  assert.deepEqual(h.drawn(), [],
    'the Garage restore hides the superseded battlefield at once, while its cloud wait still runs (before: drawn over the Garage)');
  h.releaseClouds();
  assert.equal((await entry).error?.name, 'WorldActivationSuperseded');
  assert.deepEqual(h.drawn(), [], 'and it stays hidden');
}

// ---- 5. the cache readers through the class owner
{
  const h = harness({ worldScenes: 2 });
  const entry = h.runtime.ensure('verdant', null, { precompile: false });
  await flush();
  for (let i = 0; i < STEPS + 2; i++) await h.pump(1);
  const verdant = await entry;
  assert.equal(h.runtime.isReusable('verdant'), true, 'a world of the class in effect is reusable');
  assert.equal(h.runtime.isReusable('bravo'), false, 'an uncached battlefield is not');
  h.setClass('light'); // a step into Ultra Low
  assert.equal(h.runtime.isReusable('verdant'), false, 'a world built under another class is not: an ensure would rebuild it');
  assert.equal(h.runtime.cache.get('verdant'), verdant, 'and asking retires nothing (the query has no side effect)');
  h.busy();
  h.runtime.prefetch('verdant'); // the class owner retires the on-screen world and starts its fresh build
  await flush();
  assert.ok([...h.runtime.cache.keys()].some((key) => key.startsWith('verdant~')), 'the on-screen world is kept under a retired key');
  assert.deepEqual(h.runtime.residentIds(), ['verdant'], 'the resident worlds by build id: the retired one under its own');
  const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
  assert.match(main, /hasCachedWorld: \(mapId: string\) => worldRuntime\.isReusable\(mapId\),/,
    'the solo load trace asks the class owner whether the world is reused');
  assert.match(main, /getWorldCacheIds: \(\) => worldRuntime\.residentIds\(\),/, 'the probes\' census reads the resident ids');
  assert.doesNotMatch(main, /worldRuntime\.cache\b/, 'main.ts reads no raw cache keys');
}

// ---- 6. the trace slot holds the newest request's trace
{
  const h = harness({ worldScenes: 2 });
  const alphaGate = h.gate('alpha');
  const alpha = settle(h.runtime.ensure('alpha', null, { precompile: false }));
  await flush();
  await h.pump(1);
  const bravo = h.runtime.ensure('bravo', null, { precompile: false });
  await flush();
  for (let i = 0; i < STEPS + 2; i++) await h.pump(1);
  await bravo;
  assert.equal(h.traces.at(-1), 'bravo:complete', 'the presented request\'s trace');
  alphaGate.resolve();
  for (let i = 0; i < STEPS + 2; i++) await h.pump(1);
  assert.equal((await alpha).error?.name, 'WorldActivationSuperseded');
  assert.equal(h.traces.at(-1), 'bravo:complete',
    'the superseded request settling later never overwrites the newer request\'s trace (before: alpha:failed landed last)');
}

console.log('worldActivationOrphans.selftest: an orphaned build is speculative again (cancelled by the next entry on another battlefield, joined by a retry on its own, yielding to the Garage), a superseded warm hides its world at once, the cache readers ask the class owner, the trace slot keeps the newest request PASS');
