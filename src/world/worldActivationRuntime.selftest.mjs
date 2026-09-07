import assert from 'node:assert/strict';
import { createWorldActivationRuntime } from './worldActivationRuntime.ts';

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
assert.deepEqual(minimapUrls.at(-1), ['desert', '/game/minimaps/desert.webp?v=north-up-v5']);
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

console.log('worldActivationRuntime.selftest: activation, services, warm, dormancy, partial and failure traces passed');
