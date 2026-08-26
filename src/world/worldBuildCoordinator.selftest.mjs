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

console.log('worldBuildCoordinator.selftest: join, promotion, residency and eviction passed');
