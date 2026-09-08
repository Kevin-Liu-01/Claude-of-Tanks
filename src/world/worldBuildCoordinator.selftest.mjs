import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWorldBuildCoordinator } from './worldBuildCoordinator.ts';
import { registerWorldDestructibles, notifyShellSweep } from './destructibles.ts';
import { readFileSync } from 'node:fs';
import { registerRetainedObject3DResources } from '../engine/resourceLifetime.ts';

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

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const nextTurn = () => new Promise(resolve => setImmediate(resolve));

async function boundedResult(promise) {
  let result;
  promise.then(value => { result = { value }; }, error => { result = { error }; });
  await nextTurn();
  assert.ok(result, 'controlled build settles without another timer or Garage return');
  return result;
}

function cancellationFixture(overrides = {}) {
  const scene = new THREE.Scene();
  const shadowReleases = [];
  let renderListReleases = 0;
  const coordinator = createWorldBuildCoordinator({
    engineContext: {}, scene,
    renderer: { renderLists: { dispose() { renderListReleases++; } } },
    deviceTier: 'desktop', getCurrentWorld: () => null,
    getGarageActivity: () => ({ phase: 'garage', transitionActive: false, lastActivityAt: 0 }),
    releaseShadowMaterial: material => shadowReleases.push(material),
    now: () => 5000,
    sleep: () => { throw new Error('fixture must explicitly own every deferred sleep'); },
    foregroundYielder: () => async () => {}, backgroundYielder: () => async () => {},
    loadModule: async () => ({ createMapAsync: async () => ({ group: new THREE.Group() }) }),
    ...overrides,
  });
  return { coordinator, scene, shadowReleases, get renderListReleases() { return renderListReleases; } };
}

async function cancelledLullSettles() {
  const sleep = deferred();
  let sleeps = 0, constructions = 0;
  const { coordinator } = cancellationFixture({
    getGarageActivity: () => ({ phase: 'battle', transitionActive: false, lastActivityAt: 0 }),
    sleep: duration => { assert.equal(duration, 120); sleeps++; return sleep.promise; },
    loadModule: async () => ({ async createMapAsync(_engine, _options, progress) {
      await progress('Surveying terrain', 0);
      constructions++;
      return { group: new THREE.Group() };
    } }),
  });
  const pending = coordinator.prefetch('lull-cancel');
  await nextTurn();
  assert.equal(sleeps, 1);
  coordinator.cancelBackgroundExcept();
  assert.deepEqual(await boundedResult(pending), { value: null });
  assert.equal(constructions, 0);
  assert.equal(coordinator.stats.cancelled, 1);
  assert.equal(coordinator.stats.active, null);
  sleep.resolve(); // The original timer may fire once; it must not restart the loop.
  await nextTurn();
  assert.equal(sleeps, 1);
  assert.equal(coordinator.cache.size, 0);
}

async function manyLullPollsKeepOneInterruptSubscription() {
  const races = new Map(), sleeps = [];
  const nativeRace = Promise.race;
  // Observe subscriptions while preserving actual native Promise.race and
  // deferred sleeps. Reusing the interrupt in a per-poll race fails this gate.
  Promise.race = function(inputs) {
    for (const promise of inputs) races.set(promise, (races.get(promise) ?? 0) + 1);
    return nativeRace.call(this, inputs);
  };
  try {
    const { coordinator } = cancellationFixture({
      getGarageActivity: () => ({ phase: 'battle', transitionActive: false, lastActivityAt: 0 }),
      sleep: () => { const wait = deferred(); sleeps.push(wait); return wait.promise; },
      loadModule: async () => ({ async createMapAsync(_engine, _options, progress) {
        await progress('Surveying terrain', 0);
        return { group: new THREE.Group() };
      } }),
    });
    const pending = coordinator.prefetch('many-polls');
    await nextTurn();
    for (let i = 0; i < 20; i++) {
      assert.equal(sleeps.length, i + 1);
      sleeps[i].resolve();
      await nextTurn();
    }
    assert.equal(races.size, 2, 'one poll promise and one interrupt, independent of poll count');
    assert.ok([...races.values()].every(count => count === 1));
    coordinator.cancelBackgroundExcept();
    assert.deepEqual(await boundedResult(pending), { value: null });
    sleeps.at(-1).resolve();
    await nextTurn();
    assert.equal(sleeps.length, 21, 'the final outstanding sleep cannot restart polling');
  } finally {
    Promise.race = nativeRace;
  }
}

async function cancelledBeforeModuleSkipsConstruction() {
  const module = deferred();
  let constructions = 0;
  const { coordinator } = cancellationFixture({ loadModule: () => module.promise });
  const pending = coordinator.prefetch('module-cancel', { intent: true });
  coordinator.cancelBackgroundExcept();
  module.resolve({ createMapAsync: async () => { constructions++; return { group: new THREE.Group() }; } });
  assert.deepEqual(await boundedResult(pending), { value: null });
  assert.equal(constructions, 0, 'canceled transfer never enters the map builder');
  assert.equal(coordinator.stats.cancelled, 1);
  assert.equal(coordinator.stats.completed, 0);
}

function trackedResources(label, disposals) {
  const geometry = new THREE.BoxGeometry();
  const texture = new THREE.DataTexture(new Uint8Array([1, 2, 3, 255]), 1, 1);
  const material = new THREE.MeshBasicMaterial({ map: texture });
  for (const [kind, resource] of Object.entries({ geometry, material, texture })) {
    resource.addEventListener('dispose', () => disposals.push(`${label}:${kind}`));
  }
  return { geometry, material, texture };
}

async function cancelledFinalYieldDisposesCompletedWorld() {
  const pacing = deferred(), disposals = [];
  const own = trackedResources('own', disposals);
  const attached = trackedResources('attached', disposals);
  const cached = trackedResources('cached', disposals);
  const offTree = trackedResources('offTree', disposals);
  let completedWorld, externalDisposals = 0;
  const f = cancellationFixture({
    foregroundYielder: () => () => pacing.promise,
    loadModule: async () => ({ async createMapAsync(_engine, _options, progress) {
      await progress('Sealing the battlefield', .96);
      const group = new THREE.Group();
      for (const resources of [own, attached, cached]) {
        group.add(new THREE.Mesh(resources.geometry, resources.material));
      }
      registerRetainedObject3DResources(group, {
        geometries: [offTree.geometry], materials: [offTree.material], textures: [offTree.texture],
      });
      f.scene.add(group);
      completedWorld = { group, dispose() { externalDisposals++; } };
      return completedWorld;
    } }),
  });
  const attachedRoot = new THREE.Mesh(attached.geometry, attached.material);
  f.scene.add(attachedRoot);
  const cachedWorld = { group: new THREE.Mesh(cached.geometry, cached.material) };
  f.coordinator.cache.set('unrelated-dormant', cachedWorld);
  const pending = f.coordinator.prefetch('final-cancel', { intent: true });
  await nextTurn();
  f.coordinator.cancelBackgroundExcept();
  pacing.resolve();
  assert.deepEqual(await boundedResult(pending), { value: null });
  assert.ok(completedWorld, 'final yield returns normally so completed ownership exists for disposal');
  assert.equal(completedWorld.group.parent, null);
  assert.equal(externalDisposals, 1);
  assert.deepEqual(disposals.sort(), ['offTree:geometry', 'offTree:material', 'offTree:texture',
    'own:geometry', 'own:material', 'own:texture'].sort());
  assert.deepEqual(new Set(f.shadowReleases), new Set([own.material, offTree.material]));
  assert.equal(f.renderListReleases, 1);
  assert.equal(f.scene.children.length, 1);
  assert.equal(attachedRoot.parent, f.scene);
  assert.equal(cachedWorld.group.parent, null, 'detached cached resources are preserved too');
  assert.deepEqual([...f.coordinator.cache.keys()], ['unrelated-dormant']);
  assert.equal(f.coordinator.stats.completed, 0);
  assert.equal(f.coordinator.stats.cancelled, 1);
  for (const resources of [attached, cached]) {
    resources.geometry.dispose(); resources.material.dispose(); resources.texture.dispose();
  }
}

async function cancelledLeaseReturnsLateGrant() {
  const lease = deferred();
  let released = 0;
  const f = cancellationFixture({
    acquireBackgroundWork: () => lease.promise,
    loadModule: async () => ({ async createMapAsync(_engine, _options, progress) {
      await progress('Surveying terrain', 0);
      return { group: new THREE.Group() };
    } }),
  });
  const pending = f.coordinator.prefetch('lease-cancel', { intent: true });
  await nextTurn();
  f.coordinator.cancelBackgroundExcept();
  assert.deepEqual(await boundedResult(pending), { value: null });
  lease.resolve({ release() { released++; } });
  await nextTurn();
  assert.equal(released, 1);
  assert.equal(f.coordinator.stats.cancelled, 1);
  assert.equal(f.coordinator.cache.size, 0);
}

async function sameIdDemandWaitsForDiscard() {
  const oldYield = deferred(), freshYield = deferred();
  const events = [], dispatched = [];
  let calls = 0;
  const f = cancellationFixture({
    foregroundYielder: () => () => (calls === 1 ? oldYield.promise : freshYield.promise),
    loadModule: async () => ({ async createMapAsync(_engine, { mapId }, progress) {
      const serial = ++calls;
      events.push(`start:${serial}`);
      await progress('Sealing the battlefield', .96);
      const group = new THREE.Group();
      f.scene.add(group);
      const unregister = registerWorldDestructibles({ key: mapId, isActive: () => true,
        sweep() { dispatched.push(serial); }, impact() {} });
      return { group, serial, dispose() { events.push(`dispose:${serial}`); unregister(); } };
    } }),
  });
  const oldPrefetch = f.coordinator.prefetch('same-id-cancel', { intent: true });
  const oldRequest = f.coordinator.beginBuild('same-id-cancel', null, { background: true });
  await nextTurn();
  f.coordinator.cancelBackgroundExcept();
  const replacement = f.coordinator.beginBuild('same-id-cancel');
  assert.notEqual(replacement.promise, oldRequest.promise);
  await nextTurn();
  assert.deepEqual(events, ['start:1'], 'fresh construction waits for old callback disposal');
  oldYield.resolve();
  assert.deepEqual(await boundedResult(oldPrefetch), { value: null });
  assert.deepEqual(events, ['start:1', 'dispose:1', 'start:2']);
  assert.equal(f.coordinator.stats.active, 'same-id-cancel', 'old finally cannot clear the fresh record');
  assert.equal(f.coordinator.stats.promoted, 0, 'a canceled record is never promoted');
  freshYield.resolve();
  const result = await boundedResult(replacement.promise);
  assert.equal(result.value.serial, 2);
  assert.equal(f.coordinator.cache.get('same-id-cancel'), result.value);
  assert.equal(f.coordinator.stats.active, null);
  assert.equal(f.scene.children.length, 1);
  notifyShellSweep(0, 0, 0, 1, 1, 1);
  assert.deepEqual(dispatched, [2], 'discarded completion cannot replace or remove the new callback');
  result.value.dispose();
}

async function genuineErrorsStayGenuine() {
  const failure = new Error('real map construction failed');
  const { coordinator } = cancellationFixture({
    loadModule: async () => ({ createMapAsync: async () => { throw failure; } }),
  });
  assert.deepEqual(await boundedResult(coordinator.beginBuild('failed').promise), { error: failure });
  assert.equal(coordinator.stats.cancelled, 0);
  assert.equal(coordinator.cache.size, 0);
  // Optional speculative prefetch keeps its existing null-on-failure API;
  // an explicit foreground request must still receive the original error.
  assert.deepEqual(await boundedResult(coordinator.prefetch('failed', { intent: true })), { value: null });
  assert.deepEqual(await boundedResult(coordinator.beginBuild('failed').promise), { error: failure });
  assert.equal(coordinator.stats.cancelled, 0);
}

await cancelledLullSettles();
await manyLullPollsKeepOneInterruptSubscription();
await cancelledBeforeModuleSkipsConstruction();
await cancelledFinalYieldDisposesCompletedWorld();
await cancelledLeaseReturnsLateGrant();
await sameIdDemandWaitsForDiscard();
await genuineErrorsStayGenuine();

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

console.log('worldBuildCoordinator.selftest: join, promotion, residency, eviction, intent pacing and cancellation ownership passed');
