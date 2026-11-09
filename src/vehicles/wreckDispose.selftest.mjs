// wreckDispose.selftest.mjs — a wrecked visual's dispose undoes the gun's crumple (2026-11-08 implicit-state-machine
// sweep, round 8 s5-02). Copyright © 2026 Kevin B. Liu.
//
// setDestroyed swaps each gun mesh's geometry for a bent copy (tankFactoryCore planLiveCrumple: 269's cutAtKink cut,
// then the kink) and keeps the originals beside them; resetDestroyed puts the originals back and disposes the copies
// (resetLiveCrumple). dispose() never did: the copies are in neither the visual's disposables nor the owned-fitting set,
// and releaseBattleGeometry hands a pooled mesh back only while it still holds the pooled geometry. So every wreck a
// visual was disposed in kept its bent gun's buffers and three's per-geometry binding state: an MP match's end
// (battlePresentation dispose on every actor, wrecks and all), a Studio actor's removal. Solo escaped only because it
// resets before it disposes. The wreck owner's dispose move (wreckLifecycle.ts) now undoes the crumple too.
//
// On the wreckGunBend harness (the battle bot's build: LOW geometry, static batches, the 'dual' merge): a plain kill and
// a late cook-off upgrade, then dispose with no reset; then the solo order. Every bent copy fires 'dispose' once and no
// gun mesh still holds one. The undo runs before the battle pool's release (battleGeometrySharing.ts): a gun piece drawn
// from the pool (the Merkava 4's merged gun stock, shared with a twin build alive beside it) holds its own geometry
// again after dispose, never the pool's (undone after the release, the pool's copy went back on it and the visual's
// own source was never handed back for its owned walk).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';

installCanvasFixture();
const { createTank, ensureTankBuilder, battleStaticDrawMerge, battleGeometryQuality } = await import('./fleetFactory.ts');
const { getSpec } = await import('./specs.ts');
const { createTankState } = await import('../sim/movement.ts');

/** A battle bot's build (wreckGunBend.selftest.mjs), synced once alive. */
async function battleVisual(id) {
  await ensureTankBuilder(id);
  const visual = createTank(id, null, { camoSeed: 4242, quality: 'high', geometryQuality: battleGeometryQuality(false, 'desktop'),
    batchStatic: true, battleDetailLod: true, eraVisualBindingReceipt: false, staticDrawMerge: battleStaticDrawMerge(id) });
  const state = createTankState(getSpec(id), new THREE.Vector3(), 0);
  visual.syncFromState(state, 1 / 60, 60);
  const gunG = visual.root.getObjectByName('rig_gun');
  assert.ok(gunG, `${id}: rig_gun`);
  const alive = new Map();
  gunG.traverse((object) => { if (object.isMesh) alive.set(object, object.geometry); });
  return { visual, state, gunG, alive };
}

/** The gun's bent copies now on its meshes, each counting its 'dispose' events. */
function bentCopies(gunG, alive, disposed) {
  const copies = new Set();
  for (const [mesh, live] of alive) {
    if (mesh.geometry === live || copies.has(mesh.geometry)) continue;
    const copy = mesh.geometry;
    copies.add(copy);
    disposed.set(copy, 0);
    copy.addEventListener('dispose', () => disposed.set(copy, disposed.get(copy) + 1));
  }
  return copies;
}

/** Every gun piece that drew the pool's geometry holds its own again (the pool hands each mesh its source back). */
function assertPoolHandedBack(label, alive, pooled) {
  const held = [];
  for (const [mesh, live] of alive) if (pooled.has(live) && pooled.has(mesh.geometry)) held.push(mesh.name || '(unnamed)');
  assert.deepEqual(held, [], `${label}: no gun piece keeps the battle pool's geometry after dispose`);
}

function assertUndone(label, gunG, copies, disposed) {
  assert.ok(copies.size > 0, `${label}: the wreck bent the gun (the case is live)`);
  const kept = [];
  gunG.traverse((object) => { if (object.isMesh && copies.has(object.geometry)) kept.push(object.name || '(unnamed)'); });
  assert.deepEqual(kept, [], `${label}: no gun mesh still holds a bent copy after dispose`);
  const counts = [...copies].map((copy) => disposed.get(copy));
  assert.deepEqual(counts.filter((count) => count !== 1), [],
    `${label}: every bent copy is disposed exactly once (${counts.filter((c) => c === 0).length} of ${copies.size} leaked)`);
  assert.equal(gunG.userData.wreckBend, undefined, `${label}: the bend record goes with the crumple`);
}

let pooledBent = 0;
for (const id of ['gepard_1a2', 'm1a1', 'merkava4']) {
  // ---- a network peer's wreck at match end: setDestroyed, then dispose with no reset (battlePresentation dispose)
  {
    const { visual, state, gunG, alive } = await battleVisual(id);
    // a twin alive beside it: the battle pool's entries are the geometries both draw
    const twin = await battleVisual(id);
    const pooled = new Set();
    twin.gunG.traverse((object) => { if (object.isMesh) pooled.add(object.geometry); });
    visual.setDestroyed({ pop: false, ageS: 0 });
    visual.syncFromState(state, 1 / 60, 60);
    const disposed = new Map();
    const copies = bentCopies(gunG, alive, disposed);
    for (const [mesh, live] of alive) if (pooled.has(live) && mesh.geometry !== live) pooledBent++;
    visual.dispose();
    assertUndone(`${id} plain wreck, disposed`, gunG, copies, disposed);
    assertPoolHandedBack(`${id} plain wreck, disposed`, alive, pooled);
    twin.visual.dispose();
    // the owner's dispose latch: a second dispose and a late reset or wreck do nothing more
    visual.dispose();
    visual.resetDestroyed();
    visual.setDestroyed({ pop: true, ageS: 0 });
    assertUndone(`${id} plain wreck, after a second dispose and late calls`, gunG, copies, disposed);
  }
  // ---- a plain wreck upgraded by its late cook-off cause (resetLiveCrumple then planLiveCrumple), then disposed
  {
    const { visual, state, gunG, alive } = await battleVisual(id);
    visual.setDestroyed({ pop: false, ageS: 0 });
    const disposed = new Map();
    const plainCopies = bentCopies(gunG, alive, disposed);
    visual.setDestroyed({ pop: true, ageS: 0, lateCause: true });
    visual.syncFromState(state, 1 / 60, 60);
    const cookoffCopies = bentCopies(gunG, alive, disposed);
    visual.dispose();
    assertUndone(`${id} cook-off upgrade, disposed`, gunG, new Set([...plainCopies, ...cookoffCopies]), disposed);
  }
  // ---- the solo order (state.ts releaseParkedTank: reset, then dispose) stays one dispose per copy
  {
    const { visual, state, gunG, alive } = await battleVisual(id);
    visual.setDestroyed({ pop: true, ageS: 0 });
    visual.syncFromState(state, 1 / 60, 60);
    const disposed = new Map();
    const copies = bentCopies(gunG, alive, disposed);
    visual.resetDestroyed();
    for (const [mesh, live] of alive) assert.equal(mesh.geometry, live, `${id}: the rematch puts ${mesh.name} back`);
    visual.dispose();
    assertUndone(`${id} reset then disposed`, gunG, copies, disposed);
  }
}
assert.ok(pooledBent > 0, 'a gun piece drawn from the battle pool was bent (the release-order case is live)');
console.log('wreckDispose.selftest: a wreck disposed without a reset (an MP match end, a Studio removal) disposes its bent gun copies, once each');
