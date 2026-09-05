import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWorldBuildCoordinator } from './worldBuildCoordinator.ts';
import { registerWorldDestructibles, notifyShellSweep } from './destructibles.ts';
import { readFileSync } from 'node:fs';

let clock = 2000;
let moduleLoads = 0;
let mapBuilds = 0;
const progress = [];
const scene = new THREE.Scene();
const registryChecks = [];
const disposedBindings = [];
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
        const unregister = registerWorldDestructibles({
          key: mapId,
          isActive: () => { registryChecks.push(mapId); return group.visible; },
          sweep() {}, impact() {},
        });
        return { group, dispose() { disposedBindings.push(mapId); unregister(); } };
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
assert.deepEqual(disposedBindings, ['verdant'], 'eviction releases external callbacks exactly once');
// Retaining one global closure per visited map defeats the two-world cache
// even when GPU disposal receipts look healthy. Exercise the real registry.
for (let index = 0; index < 30; index++) {
  await coordinator.beginBuild(`lifetime-${index}`).promise;
  coordinator.enforceCacheBudget();
  registryChecks.length = 0;
  notifyShellSweep(0, 0, 0, 1, 1, 1);
  assert.deepEqual(registryChecks, [...coordinator.cache.keys()],
    'dispatch inspects only resident worlds, not all thirty historical builds');
}
const beforeRepeatedEnforce = disposedBindings.length;
coordinator.enforceCacheBudget();
assert.equal(disposedBindings.length, beforeRepeatedEnforce, 'cached dormancy does not release bindings');
const propsSource = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
const mapSource = readFileSync(new URL('./map.ts', import.meta.url), 'utf8');
assert.match(propsSource, /const registerDestructibles = \(\): \(\(\) => void\) => registerWorldDestructibles\(/,
  'partially constructed props expose a deferred registration, not a global retained closure');
assert.match(mapSource, /const unregisterDestructibles = props\.registerDestructibles\(\);\s*return \{\s*mapId: config\.id,\s*dispose: unregisterDestructibles,/,
  'only completed assembly installs external bindings and returns their exact disposer');

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

console.log('worldBuildCoordinator.selftest: join, promotion, residency and eviction passed');
