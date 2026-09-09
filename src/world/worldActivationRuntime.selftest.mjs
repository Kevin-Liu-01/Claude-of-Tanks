import assert from 'node:assert/strict';
import { Group } from 'three';
import { createWorldActivationRuntime } from './worldActivationRuntime.ts';
import { createBattleAtmosphereAccess } from '../engine/battleAtmosphereAccess.ts';
import { createBattleAtmosphereRuntime } from '../engine/battleAtmosphereRuntime.ts';

function group(childCount = 3) {
  return {
    visible: true,
    children: Array.from({ length: childCount }, () => ({ visible: true, children: [] })),
  };
}

function world(mapId, childCount = 3) {
  return {
    mapId,
    group: group(childCount),
    config: { sky: { preset: mapId } },
    raycast: (origin, direction, maxDistance) => ({ origin, direction, maxDistance, mapId }),
  };
}

const builtWorld = world('built', 2);
const cachedWorld = world('desert', 3);
const listeners = new Set();
const coordinator = {
  cache: new Map([['desert', cachedWorld]]),
  resourceLimits: { pedestalVisuals: 2, worldScenes: 2 },
  stats: {
    requested: 0, completed: 0, joined: 0, promoted: 0, cancelled: 0,
    skippedCapacity: 0, lastMap: null, lastMs: 0, active: null,
  },
  lastRelease: { id: 'old', objects: 1, geometries: 1, materials: 1, textures: 1 },
  loadModule: async () => ({ createMapAsync: async () => builtWorld }),
  enforceCacheBudgetCalls: 0,
  enforceCacheBudget() { this.enforceCacheBudgetCalls += 1; },
  beginBuild(mapId, onProgress) {
    assert.equal(mapId, 'built');
    if (onProgress) listeners.add(onProgress);
    return {
      promise: Promise.resolve(builtWorld),
      listeners,
      fraction: 1,
      label: 'Ready',
      stageTimings: { terrain: 8 },
    };
  },
  async prefetch(mapId) { return this.cache.get(mapId) ?? null; },
  cancelledTo: undefined,
  cancelBackgroundExcept(mapId) { this.cancelledTo = mapId; },
};

const events = [];
const minimapUrls = [];
let clock = 0;
let colliderSerial = 0;
const runtimeOptions = {
  initialMapId: 'verdant',
  coordinator,
  swapSceneWorld: (previous, next) => events.push(['swap', previous, next]),
  setSceneWorldActive: (root, active) => events.push(['dormant', root, active]),
  ensureCloudTextures: () => events.push(['clouds']),
  ensureCloudTexturesChunked: async (yieldFrame) => {
    events.push(['cloudChunks']);
    await yieldFrame();
  },
  awaitInitialCloudWarm: async () => events.push(['initialClouds']),
  applySkyPreset: (skyConfig) => events.push(['sky', skyConfig.preset]),
  applySkyPresentation: (skyConfig) => events.push(['skyPresentation', skyConfig.preset]),
  setSun: (skyConfig) => events.push(['sun', skyConfig.preset]),
  getFogDensity: () => 0.0012,
  onFogDensityChanged: (density) => events.push(['fog', density]),
  canCreateCollider: () => true,
  createCollider: (activeWorld) => ({ mapId: activeWorld.mapId, serial: ++colliderSerial }),
  placeGarage: () => events.push(['garage']),
  isMinimapReady: () => true,
  buildMinimap: (activeWorld, textured) => events.push(['minimap', activeWorld.mapId, textured]),
  loadMinimapAsset: async (activeWorld, url) => {
    minimapUrls.push([activeWorld.mapId, url]);
    return true;
  },
  compilePrograms: (root) => events.push(['compile', root]),
  linkerBreathingSlices: function* () { yield; },
  updateShadowFrustums: () => events.push(['frustums']),
  warmShadowFrame: () => events.push(['shadow']),
  nextFrame: async () => events.push(['frame']),
  baseUrl: '/game/',
  now: () => ++clock,
  publishActivationTrace: (trace) => events.push(['trace', trace]),
  publishMinimapTrace: (trace) => events.push(['minimapTrace', trace.state]),
};
const runtime = createWorldActivationRuntime(runtimeOptions);

assert.equal(runtime.current, null);
assert.equal(runtime.pendingMapId, 'verdant');
assert.equal(runtime.raycast('o', 'd', 5), null);

await runtime.ensure('desert', null, { precompile: false });
assert.equal(runtime.current, cachedWorld);
assert.equal(runtime.pendingMapId, 'desert');
assert.deepEqual(runtime.collider, { mapId: 'desert', serial: 1 });
assert.equal(runtime.servicesMapId, 'desert');
assert.equal(coordinator.cancelledTo, 'desert');
assert.equal(coordinator.enforceCacheBudgetCalls, 1);
assert.deepEqual(runtime.raycast('o', 'd', 5), {
  origin: 'o', direction: 'd', maxDistance: 5, mapId: 'desert',
});
await runtime.queueMinimap();
assert.deepEqual(minimapUrls.at(-1), ['desert', '/game/minimaps/desert.webp?v=north-up-v7']);
assert.ok(events.some(([kind, preset]) => kind === 'sky' && preset === 'desert'));
assert.ok(!events.some(([kind]) => kind === 'compile'), 'fast activation skips pre-atmosphere programs');
assert.ok(!events.some(([kind]) => kind === 'shadow'), 'fast activation skips exhaustive shadow warm');

runtime.setDormant(true);
assert.equal(runtime.dormant, true);
assert.deepEqual(events.at(-1), ['dormant', cachedWorld.group, false]);
runtime.setDormant(false);
assert.equal(runtime.dormant, false);
assert.deepEqual(events.at(-1), ['dormant', cachedWorld.group, true]);

const progress = () => undefined;
await runtime.ensure('built', progress);
assert.equal(runtime.current, builtWorld);
assert.equal(listeners.has(progress), false, 'foreground progress listener is released after build');
assert.equal(coordinator.cancelledTo, 'built');
assert.ok(events.some(([kind]) => kind === 'compile'));
assert.equal(events.filter(([kind]) => kind === 'shadow').length, 2,
  'shadow submissions are split across the exact child cohorts');
assert.ok(builtWorld.group.children.every((child) => child.visible),
  'temporary warm visibility is completely restored');
assert.equal(runtime.lastRelease.id, 'old');

runtime.activate(cachedWorld, { services: false });
assert.equal(runtime.collider, null);
assert.equal(runtime.switchMap('desert'), cachedWorld);
runtime.setPendingMapId('winter');
assert.equal(runtime.pendingMapId, 'winter');
runtime.enforceCacheBudget();
assert.equal(coordinator.enforceCacheBudgetCalls, 4);

const bakedSkies = events.filter(([kind]) => kind === 'sky').length;
runtime.setDormant(true);
runtime.invalidateSkyPresentation(); // the Garage now shows another map's sky
runtime.setDormant(false);
assert.deepEqual(events.slice(-4), [
  ['skyPresentation', 'desert'], ['fog', 0.0012], ['sun', 'desert'],
  ['dormant', cachedWorld.group, true],
], 'resuming the same battlefield restores its atmosphere before revealing it');
assert.equal(events.filter(([kind]) => kind === 'sky').length, bakedSkies,
  'restoring a Garage-overridden sky must reuse the existing battlefield PMREM');
const afterRestore = events.length;
runtime.setDormant(false);
assert.equal(events.length, afterRestore, 'an unchanged live sky does no repeated work');
runtime.invalidateSkyPresentation();
runtime.activate(cachedWorld, { services: false });
assert.equal(events.filter(([kind]) => kind === 'skyPresentation').length, 2,
  'covered same-map activation also restores the Garage-overridden atmosphere');
runtime.invalidateSkyPresentation();
runtime.activate(builtWorld, { services: false });
assert.equal(events.filter(([kind]) => kind === 'sky').length, bakedSkies + 1,
  'changing battlefield still bakes its new environment exactly once');
runtime.setDormant(false);
assert.equal(events.filter(([kind]) => kind === 'skyPresentation').length, 2,
  'a full sky activation clears the old presentation invalidation');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function traceHarness(overrides = {}) {
  let time = 100;
  const traces = [];
  const instance = createWorldActivationRuntime({
    ...runtimeOptions,
    now: () => time,
    publishActivationTrace: (trace) => traces.push(trace),
    ...overrides,
  });
  return { runtime: instance, traces, setTime: (next) => { time = next; } };
}

const expectedStages = ['build', 'present', 'compile', 'shadowWarm', 'clouds', 'activate'];
const buildGate = deferred();
const cloudGate = deferred();
const cloudEntered = deferred();
const pending = traceHarness({
  coordinator: {
    ...coordinator,
    beginBuild: () => ({ promise: buildGate.promise, stageTimings: { terrain: 12 } }),
  },
  awaitInitialCloudWarm: () => {
    cloudEntered.resolve();
    return cloudGate.promise;
  },
});
const pendingEntry = pending.runtime.ensure('built', null, { precompile: false });
assert.equal(pending.traces.length, 1, 'activation publishes before the world promise settles');
assert.deepEqual(pending.traces[0], {
  id: 'built', cached: false, status: 'pending', startedAt: 100,
  stageIntervals: [{ stage: 'build', startTime: 100 }],
});
pending.setTime(125);
buildGate.resolve(builtWorld);
await cloudEntered.promise;
const cloudPendingTrace = pending.traces.at(-1);
assert.equal(cloudPendingTrace.status, 'pending');
assert.deepEqual(cloudPendingTrace.stageIntervals.at(-1), { stage: 'clouds', startTime: 125 });
assert.equal(cloudPendingTrace.build, 25);
assert.deepEqual(cloudPendingTrace.buildDetail, { terrain: 12 });
assert.deepEqual(pending.traces[0].stageIntervals, [{ stage: 'build', startTime: 100 }],
  'published snapshots do not acquire later stage boundaries');
pending.setTime(170);
cloudGate.resolve();
assert.equal(await pendingEntry, builtWorld);
const completeTrace = pending.traces.at(-1);
assert.equal(completeTrace.status, 'complete');
assert.equal(completeTrace.startedAt, 100);
assert.equal(completeTrace.endedAt, 170);
assert.equal(completeTrace.totalMs, 70);
assert.equal(pending.traces.length, expectedStages.length + 2,
  'start, every stage boundary, and terminal completion are published');
assert.deepEqual(completeTrace.stageIntervals.map(({ stage }) => stage), expectedStages);
for (const [index, interval] of completeTrace.stageIntervals.entries()) {
  assert.equal(completeTrace[interval.stage], Math.round(interval.endTime - interval.startTime),
    'legacy flat duration matches the timestamped interval');
  if (index) assert.equal(interval.startTime, completeTrace.stageIntervals[index - 1].endTime);
}
assert.deepEqual(cloudPendingTrace.stageIntervals.at(-1), { stage: 'clouds', startTime: 125 },
  'a pending receipt remains pending after completion');

const failedBuildGate = deferred();
const failedListeners = new Set();
const failedStageTimings = { heightField: 9 };
const failedBuild = traceHarness({
  coordinator: {
    ...coordinator,
    beginBuild: (_mapId, onProgress) => {
      failedListeners.add(onProgress);
      return {
        promise: failedBuildGate.promise, stageTimings: failedStageTimings,
        listeners: failedListeners,
      };
    },
  },
});
const buildFailure = new Error('terrain transfer failed');
const failedBuildEntry = failedBuild.runtime.ensure('built', progress);
failedBuild.setTime(143);
failedStageTimings.terrain = 34;
failedBuildGate.reject(buildFailure);
await assert.rejects(failedBuildEntry, (error) => error === buildFailure,
  'the original build failure remains the rejection');
assert.equal(failedListeners.has(progress), false, 'failure still releases the progress listener');
assert.deepEqual(failedBuild.traces.at(-1), {
  id: 'built', cached: false, status: 'failed', startedAt: 100, endedAt: 143,
  stageIntervals: [{ stage: 'build', startTime: 100, endTime: 143 }],
  build: 43, buildDetail: { heightField: 9, terrain: 34 }, totalMs: 43,
  error: { name: 'Error', message: 'terrain transfer failed' },
});

const failureTraces = [];
const cloudFailure = new TypeError('cloud warm failed');
const failingTelemetry = traceHarness({
  awaitInitialCloudWarm: async () => { throw cloudFailure; },
  publishActivationTrace: (trace) => {
    failureTraces.push(trace);
    throw new Error('telemetry sink failed');
  },
});
await assert.rejects(failingTelemetry.runtime.ensure('desert', null, { precompile: false }),
  (error) => error === cloudFailure, 'a telemetry failure cannot mask the original activation error');
assert.equal(failureTraces.at(-1).status, 'failed');
assert.equal(failureTraces.at(-1).stageIntervals.at(-1).stage, 'clouds');
assert.deepEqual(failureTraces.at(-1).error, { name: 'TypeError', message: 'cloud warm failed' });

const successfulTelemetryFailure = traceHarness({
  publishActivationTrace: () => { throw new Error('telemetry sink failed'); },
});
assert.equal(await successfulTelemetryFailure.runtime.ensure('desert', null, { precompile: false }),
  cachedWorld, 'a telemetry failure cannot turn successful activation into a rejection');

const unreadableFailure = Object.defineProperty(new Error('hidden'), 'message', {
  get() { throw new Error('message getter failed'); },
});
const unreadable = traceHarness({ awaitInitialCloudWarm: async () => { throw unreadableFailure; } });
await assert.rejects(unreadable.runtime.ensure('desert', null, { precompile: false }),
  (error) => error === unreadableFailure, 'error formatting cannot replace the thrown value');
assert.deepEqual(unreadable.traces.at(-1).error, {
  name: 'Error', message: 'Unprintable activation error',
});

for (const version of [undefined, 'capture-fixture']) {
  const urls = [];
  const instance = createWorldActivationRuntime({
    ...runtimeOptions,
    minimapAssetVersion: version,
    loadMinimapAsset: async (activeWorld, url) => { urls.push([activeWorld.mapId, url]); return true; },
  });
  const oasisWorld = world('oasis');
  instance.activate(oasisWorld);
  await instance.queueMinimap();
  assert.deepEqual(urls, [['oasis', `/game/minimaps/oasis.webp?v=${version || 'north-up-v7-oasis-shoreline-v2'}`]],
    'actual activation loads the refreshed Oasis raster, coalescing the prepared request');
  instance.activate(cachedWorld);
  await instance.queueMinimap();
  assert.deepEqual(urls.at(-1), ['desert', `/game/minimaps/desert.webp?v=${version || 'north-up-v7'}`],
    'other map cache keys and explicit capture/test revisions stay unchanged');
}

// Compose the real world and selected-atmosphere owners. These spies count
// full-preset/bake *requests*, not GPU duration or actual native PMREM work.
function coveredAtmosphereHarness(load) {
  const activity = [];
  const worlds = new Map(['verdant', 'winter', 'desert'].map((id, index) => [id, {
    ...world(id), group: new Group(),
    config: { sky: Object.freeze({ sunIntensity: 3 + index, fogDensity: .001 + index * .0001 }) },
  }]));
  const instance = traceHarness({
    coordinator: { ...coordinator, cache: worlds },
    applySkyPreset: (preset) => activity.push(['bake', preset]),
    applySkyPresentation: (preset) => activity.push(['presentation', preset]),
    setSun: () => {}, onFogDensityChanged: () => {},
  }).runtime;
  const module = { createBattleAtmosphereRuntime };
  const atmosphere = createBattleAtmosphereAccess(() => ({
    getWorldRoot: () => instance.current?.group ?? null,
    getAuthoredPreset: () => instance.current.config.sky,
    applyPreset: (preset) => {
      activity.push(['bake', preset]);
      instance.markEnvironmentPrepared(instance.current);
    },
  }), load ?? (() => Promise.resolve(module)));
  return { instance, worlds, atmosphere, module, activity,
    bakes: () => activity.filter(([kind]) => kind === 'bake') };
}
const coveredOptions = { precompile: false, services: false, atmosphere: 'covered-battle' };
function assertSingleSelectedBake(h, seed) {
  assert.equal(h.bakes().length, 1, 'covered entry requests exactly one final selected IBL');
  if (seed === 3) assert.equal(h.bakes()[0][1].skyIntensity, .05, 'that one request is moonlight, not intermediate daylight');
  else assert.deepEqual(h.bakes()[0][1], h.instance.current.config.sky, 'day/legacy authority keeps the exact authored preset');
}

for (const mapId of ['verdant', 'winter']) for (const seed of [3, 13, undefined]) {
  const h = coveredAtmosphereHarness();
  try {
    await h.instance.ensure(mapId, null, coveredOptions);
    // The synchronous solo start calls these between ensure and final warm.
    h.instance.switchMap(mapId);
    h.instance.setDormant(false);
    assert.equal(h.bakes().length, 0, 'first/same-map start must not bake before its selected atmosphere');
    await h.atmosphere.prepare(seed, mapId);
    assertSingleSelectedBake(h, seed);
    await h.atmosphere.prepare(seed, mapId);
    assertSingleSelectedBake(h, seed);
    await h.instance.ensure(mapId, null, { precompile: false, services: false });
    assertSingleSelectedBake(h, seed);

    h.atmosphere.reset(); // Existing Garage restoration is intentionally unchanged.
    assert.deepEqual(h.bakes().at(-1)[1], h.worlds.get(mapId).config.sky);
    h.instance.setDormant(true);
    h.instance.invalidateSkyPresentation();
    const resetBakeCount = h.bakes().length;
    // A successful night→Garage reset already restored the authored IBL.
    // Ordinary Studio/capture recovery must not bake that same target again.
    await h.instance.ensure(mapId, null, { precompile: false, services: false });
    assert.equal(h.bakes().length, resetBakeCount, 'completed reset clears deferral before ordinary same-map activation');
    h.instance.setDormant(true);
    h.instance.invalidateSkyPresentation();
    h.activity.length = 0;
    await h.instance.ensure(mapId, null, coveredOptions);
    assert.equal(h.bakes().length, 0, 'cached rematch does not pay an intermediate environment bake');
    assert.equal(h.activity.filter(([kind]) => kind === 'presentation').length, 1, 'cached Garage sky is still restored');
    await h.atmosphere.prepare(seed, mapId);
    assertSingleSelectedBake(h, seed);
  } finally { h.atmosphere.current?.dispose(); }
}

// Omit the covered intent: the real former daytime-then-night sequence must
// fail the one-bake oracle. Ordinary callers keep that authored activation.
{
  const h = coveredAtmosphereHarness();
  try {
    await h.instance.ensure('winter', null, { precompile: false, services: false });
    assert.deepEqual(h.bakes()[0][1], h.worlds.get('winter').config.sky);
    await h.atmosphere.prepare(3, 'winter');
    assert.equal(h.bakes().length, 2);
    assert.throws(() => assertSingleSelectedBake(h, 3), /exactly one/);
  } finally { h.atmosphere.current?.dispose(); }
}

// A stale lazy atmosphere must not overwrite ordinary capture/Studio recovery
// or a newer map selection after its world has already activated.
for (const recovery of ['ordinary-ensure', 'ordinary-activate', 'ordinary-resume', 'new-selection']) {
  const gate = deferred(), h = coveredAtmosphereHarness(() => gate.promise);
  await h.instance.ensure('winter', null, coveredOptions);
  h.instance.markEnvironmentPrepared(null);
  h.instance.markEnvironmentPrepared(h.worlds.get('desert'));
  const stale = h.atmosphere.prepare(3, 'winter');
  let latest;
  if (recovery === 'new-selection') {
    await h.instance.ensure('desert', null, coveredOptions);
    latest = h.atmosphere.prepare(13, 'desert');
  } else {
    h.atmosphere.reset();
    if (recovery === 'ordinary-ensure') await h.instance.ensure('winter', null, { precompile: false, services: false });
    else if (recovery === 'ordinary-activate') h.instance.activate(h.worlds.get('winter'), { services: false });
    else {
      h.instance.setDormant(true);
      h.instance.invalidateSkyPresentation();
      h.instance.switchMap('winter'); // Same-map shot/capture path.
      h.instance.setDormant(false);
    }
  }
  gate.resolve(h.module);
  try {
    await Promise.all([stale, latest]);
    assertSingleSelectedBake(h, 13);
    assert.deepEqual(h.bakes()[0][1], h.instance.current.config.sky,
      'neither a cancelled night nor the superseded map may replace the final authored environment');
    if (recovery !== 'new-selection') {
      await h.instance.ensure('winter', null, { precompile: false, services: false });
      assert.equal(h.bakes().length, 1, 'ordinary recovery clears its deferred environment only once');
    }
  } finally { h.atmosphere.current?.dispose(); }
}

{
  const h = coveredAtmosphereHarness();
  for (const invalid of [{ atmosphere: 'covered-battle' }, { ...coveredOptions, compilePrograms: true }]) {
    await assert.rejects(h.instance.ensure('winter', null, invalid), /must precede combat program warming/);
  }
  assert.equal(h.instance.current, null);
  assert.equal(h.activity.length, 0, 'invalid early warm intent cannot change sky or scene ownership');
}

console.log('worldActivationRuntime.selftest: activation, services, warm, sky restoration, dormancy, traces and single selected battle IBL/recovery passed');
