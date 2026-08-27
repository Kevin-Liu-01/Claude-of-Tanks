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
const runtime = createWorldActivationRuntime({
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
});

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
assert.deepEqual(minimapUrls.at(-1), ['desert', '/game/minimaps/desert.webp?v=spawn-oriented-v2']);
assert.ok(events.some(([kind, preset]) => kind === 'sky' && preset === 'desert'));
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

console.log('worldActivationRuntime.selftest: activation, services, warm, dormancy and trace passed');
