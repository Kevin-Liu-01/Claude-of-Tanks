import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWorldBuildCoordinator } from './worldBuildCoordinator.ts';

let clock = 2000;
let moduleLoads = 0;
let mapBuilds = 0;
const progress = [];
const scene = new THREE.Scene();
const coordinator = createWorldBuildCoordinator({
  engineContext: { id: 'engine' },
  scene,
  renderer: { renderLists: { dispose() {} } },
  deviceTier: 'mobile',
  getCurrentWorld: () => null,
  getGarageActivity: () => ({
    phase: 'garage', transitionActive: false, lastActivityAt: 0,
  }),
  releaseShadowMaterial() {},
  loadModule: async () => {
    moduleLoads++;
    return {
      async createMapAsync(_engine, { mapId }, onProgress) {
        mapBuilds++;
        await onProgress('Surveying terrain', 0.2);
        await onProgress('Building terrain meshes', 0.7);
        await onProgress('Sealing the battlefield', 1);
        const group = new THREE.Group();
        group.name = mapId;
        scene.add(group);
        return { group };
      },
    };
  },
  now: () => clock += 10,
  foregroundYielder: () => async () => {},
  backgroundYielder: () => async () => {},
  resourceLimits: { pedestalVisuals: 2, worldScenes: 2 },
});

const verdantA = coordinator.beginBuild('verdant', (fraction, label) => {
  progress.push([fraction, label]);
});
const verdantB = coordinator.beginBuild('verdant');
assert.equal(verdantA.promise, verdantB.promise, 'concurrent callers join one map build');
const verdant = await verdantA.promise;
assert.equal(moduleLoads, 1);
assert.equal(mapBuilds, 1);
assert.equal(verdant.group.visible, false, 'completed maps stay dormant until activation');
assert.equal(progress.at(-1)[0], 1);
assert.ok(verdantA.stageTimings.heightField >= 0);

const cached = coordinator.beginBuild('verdant');
assert.equal(await cached.promise, verdant, 'complete map scenes are reused exactly');
assert.equal(cached.label, 'Ready');

const desertPrefetch = coordinator.prefetch('desert', { intent: true });
const desertForeground = coordinator.beginBuild('desert');
assert.ok(desertPrefetch, 'an available residency slot accepts intent prefetch');
await Promise.all([desertPrefetch, desertForeground.promise]);
assert.equal(mapBuilds, 2, 'foreground entry promotes instead of duplicating an idle build');
assert.equal(coordinator.stats.joined, 1);
assert.equal(coordinator.stats.promoted, 1);
assert.equal(coordinator.stats.completed, 1);

const stalePrefetch = coordinator.prefetch('stale', { intent: true });
assert.equal(stalePrefetch, null,
  'mobile residency prevents speculative maps once the cache is full');
assert.equal(coordinator.stats.skippedCapacity, 1);

assert.equal(coordinator.cache.size, 2);
await coordinator.beginBuild('alpine').promise;
assert.equal(coordinator.cache.size, 3, 'foreground demand may temporarily exceed idle capacity');
coordinator.enforceCacheBudget();
assert.equal(coordinator.cache.size, 2);
assert.equal(coordinator.lastRelease.id, 'verdant');
assert.equal(verdant.group.parent, null, 'eviction detaches the released scene graph');

let grantBlockedLease;
let lateLeaseReleases = 0;
const promotionCoordinator = createWorldBuildCoordinator({
  engineContext: { id: 'engine' },
  scene: new THREE.Scene(),
  renderer: { renderLists: { dispose() {} } },
  deviceTier: 'desktop',
  getCurrentWorld: () => null,
  getGarageActivity: () => ({
    phase: 'garage', transitionActive: false, lastActivityAt: 0,
  }),
  releaseShadowMaterial() {},
  loadModule: async () => ({
    async createMapAsync(_engine, { mapId }, onProgress) {
      await onProgress('Surveying terrain', 0.2);
      const group = new THREE.Group();
      group.name = mapId;
      return { group };
    },
  }),
  acquireBackgroundWork: () => new Promise((resolve) => {
    grantBlockedLease = resolve;
  }),
  foregroundYielder: () => async () => {},
  backgroundYielder: () => async () => {},
  resourceLimits: { pedestalVisuals: 4, worldScenes: 4 },
});

const blockedPrefetch = promotionCoordinator.prefetch('fjord', { intent: true });
assert.ok(blockedPrefetch);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(typeof grantBlockedLease, 'function', 'prefetch waits for the optional Garage lane');
const promotedBuild = promotionCoordinator.beginBuild('fjord');
const promotedWorld = await promotedBuild.promise;
assert.equal(promotedWorld.group.name, 'fjord',
  'foreground promotion does not wait for a blocked background-work lane');
grantBlockedLease({ release() { lateLeaseReleases += 1; } });
await new Promise((resolve) => setImmediate(resolve));
assert.equal(lateLeaseReleases, 1, 'a lease granted after promotion is returned immediately');
await blockedPrefetch;

const intentLeases = [];
const intentYields = [];
let intentReleases = 0;
let cancelIntent = false;
const intentCoordinator = createWorldBuildCoordinator({
  engineContext: {},
  scene: new THREE.Scene(),
  renderer: { renderLists: { dispose() {} } },
  deviceTier: 'desktop',
  getCurrentWorld: () => null,
  getGarageActivity: () => ({
    phase: 'garage', transitionActive: false, lastActivityAt: 1000,
  }),
  releaseShadowMaterial() {},
  now: () => 1000,
  sleep: async () => assert.fail('explicit map intent does not wait for Garage inactivity'),
  loadModule: async () => ({
    async createMapAsync(_engine, _options, onProgress, slicing) {
      assert.equal(slicing.fineSlices, true, 'intent preserves fine-grained map construction');
      await onProgress('Surveying terrain', 0.2);
      await onProgress('Sealing the battlefield', 1);
      return { group: new THREE.Group() };
    },
  }),
  acquireBackgroundWork: async (kind, stillValid) => {
    assert.equal(stillValid(), true);
    intentLeases.push(kind);
    return { release() { intentReleases++; } };
  },
  foregroundYielder: () => async () => assert.fail('intent remains background work'),
  backgroundYielder: () => async (force) => {
    intentYields.push(force);
    if (cancelIntent) intentCoordinator.cancelBackgroundExcept(null);
  },
  resourceLimits: { pedestalVisuals: 4, worldScenes: 4 },
});
const intentWorld = await intentCoordinator.prefetch('fjord', { intent: true });
assert.ok(intentWorld, 'explicit map intent proceeds despite recent Garage activity');
assert.deepEqual(intentLeases, ['world-intent', 'world-intent']);
assert.deepEqual(intentYields, [true, true], 'each intent slice still forces a background yield');
assert.equal(intentReleases, 2, 'every background slice returns its work lease');
assert.equal(intentWorld.group.visible, false, 'intent construction does not activate its world');
cancelIntent = true;
assert.equal(await intentCoordinator.prefetch('alpine', { intent: true }), null,
  'a stale intent build still cancels at its next construction boundary');
assert.equal(intentCoordinator.cache.has('alpine'), false, 'cancelled intent is never cached');
assert.equal(intentCoordinator.stats.cancelled, 1);
assert.equal(intentReleases, 3, 'cancelled intent returns its final work lease');

console.log('worldBuildCoordinator.selftest: join, promotion, residency, intent pacing and cancellation passed');
