// worldBuildRecordPhases.selftest.mjs — (2026-11-02 audit R1) the world build coordinator's records and releases.
// 1. A build record is one phase (background → foreground | cancelled; foreground → background once its last demand is let
//    go, round 2 U26; nothing leaves cancelled): a promoted build is never cancelled by a later speculation sweep while it
//    is demanded, and a cancelled one is never promoted.
// 2. A prefetch of a map whose cancelled build is still settling starts the fresh build (it waits for the old one) instead
//    of being skipped until the old one settles.
// 3. The paced release reads its keep list at every slice: a world cached while a release runs keeps the resources it
//    shares with the released world (the list was a snapshot taken when the release began).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWorldBuildCoordinator } from './worldBuildCoordinator.ts';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const microtasks = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
const turn = () => new Promise((resolve) => setImmediate(resolve));

function coordinatorWith({ createMapAsync, sleep, now, getGarageActivity, scene = new THREE.Scene() }) {
  return createWorldBuildCoordinator({
    engineContext: {}, scene, renderer: { renderLists: { dispose() {} } }, deviceTier: 'desktop',
    getCurrentWorld: () => null,
    getGarageActivity: getGarageActivity ?? (() => ({ phase: 'garage', transitionActive: false, lastActivityAt: 0 })),
    releaseShadowMaterial() {},
    loadModule: async () => ({ createMapAsync }),
    now: now ?? (() => 0),
    sleep: sleep ?? (() => Promise.resolve()),
    foregroundYielder: () => async () => {},
    backgroundYielder: () => async () => {},
    resourceLimits: { pedestalVisuals: 4, worldScenes: 4 },
  });
}

// ---- 1. one phase, one move table
{
  const gate = deferred();
  let builds = 0;
  const coordinator = coordinatorWith({
    async createMapAsync(_engine, { mapId }, progress) {
      builds++;
      await progress('Surveying terrain', 0.1);
      await gate.promise;
      await progress('Sealing the battlefield', 0.96);
      return { group: new THREE.Group(), mapId };
    },
  });
  const speculative = coordinator.prefetch('fjord', { intent: true });
  await turn();
  const demand = coordinator.beginBuild('fjord');
  coordinator.cancelBackgroundExcept();
  gate.resolve();
  const world = await demand.promise;
  assert.equal(await speculative, world, 'a promoted build is never cancelled by a later speculation sweep');
  assert.equal(coordinator.stats.cancelled, 0);
  assert.equal(builds, 1);
}

// ---- 2. a prefetch after a cancellation starts the fresh build
{
  const sleeps = [];
  let builds = 0;
  const coordinator = coordinatorWith({
    // a passive prefetch waits for the Garage's lull: the test owns each 120 ms poll
    getGarageActivity: () => ({ phase: 'battle', transitionActive: false, lastActivityAt: 0 }),
    sleep: () => { const wait = deferred(); sleeps.push(wait); return wait.promise; },
    async createMapAsync(_engine, { mapId }, progress) {
      builds++;
      await progress('Surveying terrain', 0.1);
      return { group: new THREE.Group(), mapId, serial: builds };
    },
  });
  const first = coordinator.prefetch('delta');
  await turn();
  coordinator.cancelBackgroundExcept();
  const second = coordinator.prefetch('delta', { intent: true });
  assert.ok(second, 'the prefetch of a map whose cancelled build is still settling is accepted, not skipped');
  assert.equal(await first, null, 'the cancelled prefetch settles empty');
  const world = await second;
  assert.ok(world && coordinator.cache.get('delta') === world, 'the fresh build lands in the cache');
  for (const wait of sleeps) wait.resolve();
}

// ---- 3. the paced release keeps what a world cached during it shares
{
  let clock = 0;
  const scene = new THREE.Scene();
  const shared = new THREE.MeshBasicMaterial();
  const disposedShared = [];
  shared.addEventListener('dispose', () => disposedShared.push(clock));
  const gate = deferred();
  const coordinator = coordinatorWith({
    scene,
    now: () => (clock += 10),
    async createMapAsync(_engine, { mapId }, progress) {
      await progress('Surveying terrain', 0.1);
      await gate.promise;
      const group = new THREE.Group();
      group.add(new THREE.Mesh(new THREE.BoxGeometry(), shared));
      return { group, mapId };
    },
  });
  // the dormant battlefield: a hundred geometries (several 48-disposal slices) and the material the next world shares
  const dormant = new THREE.Group();
  for (let i = 0; i < 100; i++) dormant.add(new THREE.Mesh(new THREE.BoxGeometry(), shared));
  coordinator.cache.set('old', { group: dormant });
  const next = coordinator.beginBuild('new');
  await turn();
  assert.equal(coordinator.releaseCached('old'), true);
  assert.equal(disposedShared.length, 0, 'the first slice disposes geometry only');
  gate.resolve();
  await microtasks();
  assert.ok(coordinator.cache.has('new'), 'the next world is cached while the release still runs');
  // the paced release chains its slices on setTimeout(slice, 0) (clamped to >= 1 ms): wait on that timer queue for the
  // release itself, with a cap, rather than a fixed count of check-phase turns (flaky under load: integration review r1)
  let waits = 0;
  while (coordinator.lastRelease?.id !== 'old' && waits < 200) { await new Promise((resolve) => setTimeout(resolve, 0)); waits++; }
  assert.ok(coordinator.lastRelease?.id === 'old', `the release finished (after ${waits} timer turns)`);
  assert.deepEqual(disposedShared, [], 'the material the newly cached world shares is kept');
  assert.equal(coordinator.lastRelease.geometries, 100);
  await next.promise;
}

console.log('worldBuildRecordPhases.selftest: one build phase with one move table, a prefetch after a cancellation starts the fresh build, the paced release keeps what a world cached meanwhile shares PASS');
