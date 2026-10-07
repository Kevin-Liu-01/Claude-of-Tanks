/**
 * The shrubs kept out of the solids (the scenery lane, b12; Fjord, gauntlet wave 74: foliage cards passing through a
 * boulder). The vegetation plants its bushes and its understorey before the props place their boulders, so a block can
 * land inside a shrub. Cosmetic only, as the ground cover's seal is (groundCoverClearance.ts): a shrub whose core stands
 * in a solid footprint (a boulder's hull, a structure's band) takes a zero scale in its instance and draws nothing. Its
 * cover disc, the spotting's record, stays, so the simulation and the collision manifests are untouched, and the
 * instance keeps its slot (the bushes' fade registry addresses slots).
 */
import type * as THREE from 'three';
import type { GroundCoverBlocked } from './groundCoverClearance.ts';

/** The share of a shrub's crown radius that must stand clear: its core, where the cards are dense. */
export const SHRUB_CORE = 0.45;

/**
 * Zero the instances of every shrub mesh (userData.bush, userData.understorey) under root whose core the predicate
 * finds blocked. Returns the number of shrubs cleared. Construction only: run once, before the world renders.
 */
export function clearShrubsFromSolids(root: THREE.Object3D, blocked: GroundCoverBlocked, core = SHRUB_CORE): number {
  let cleared = 0;
  root.traverse((object) => {
    const mesh = object as THREE.InstancedMesh;
    if (!mesh.isInstancedMesh || !(object.userData.bush || object.userData.understorey)) return;
    const geometry = mesh.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const unitRadius = Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.z), Math.abs(box.max.z));
    const unitHeight = Math.max(0.1, box.max.y);
    const m = mesh.instanceMatrix.array;
    let changed = false;
    for (let index = 0; index < mesh.count; index++) {
      const at = index * 16;
      const sx = Math.hypot(m[at], m[at + 1], m[at + 2]), sz = Math.hypot(m[at + 8], m[at + 9], m[at + 10]);
      const sy = Math.hypot(m[at + 4], m[at + 5], m[at + 6]);
      if (sx === 0 && sz === 0) continue;
      const radius = unitRadius * Math.min(sx, sz) * core;
      if (!blocked(m[at + 12], m[at + 13], m[at + 14], unitHeight * sy, radius)) continue;
      // the basis to zero, the translation kept: the shrub draws nothing where it stood
      for (let k = 0; k < 12; k++) m[at + k] = 0;
      changed = true;
      cleared++;
    }
    if (changed) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  });
  return cleared;
}
