// src/vehicles/ghillieDrape.ts — a camouflage suit's net drawn up over the loads stowed on its deck (tank-accessories
// round 5, 2026-10-08).
//
// Wave 253 on the Leopard 2A4: "the net lies flat at deck level under the crates, bedrolls and bag, so the load sits on
// top of the mesh"; "the net is a flat grid ... laid at deck level that stops short of the tall stowage"; the
// coordinator: "stowage sits under a draped net or on top of a rolled one, never in the same plane as a flat grid". The
// suit is laid before the decor stows its loads (ghillieSuit.ts builds against the bare armour), so once the decor has
// seated them (decorations.ts, its load boxes) the roof and deck nets are drawn up over each load and fall back to the
// deck round it, and the garnish tied to that cloth rides with it. The suit marks which of its vertices and cards lie on
// roof and deck carriers (GHILLIE_TOP_VERTICES, GHILLIE_TOP_CARDS); the drapes on its flanks are left as they hang.
// Kept free of the suit's builders so the decor can call it without importing the fleet.
import * as THREE from 'three';

/** userData key on a suit's net mesh: how many of its leading vertices lie on roof and deck carriers. */
export const GHILLIE_TOP_VERTICES = 'ghillieTopVertices';
/** userData key on a suit's garnish mesh: [cards on roof and deck carriers, vertices per card]. */
export const GHILLIE_TOP_CARDS = 'ghillieTopCards';

/** The net's loft over a load it is drawn over, and how fast it falls back to the deck past the load's edge. */
const LOAD_LOFT_M = 0.014;
const LOAD_FALL_K = 2.6;

/** The cloth height a load holds up at (x, z), or -Infinity. */
function heldUp(x: number, z: number, y: number, loads: readonly THREE.Box3[]): number {
  let best = -Infinity;
  for (const b of loads) {
    // only cloth at or above the load's foot is drawn over it (not a drape hanging below a bustle basket)
    if (y < b.min.y - 0.06) continue;
    const dx = Math.max(b.min.x - x, 0, x - b.max.x), dz = Math.max(b.min.z - z, 0, z - b.max.z);
    const d2 = dx * dx + dz * dz;
    if (d2 > 0.25) continue;
    best = Math.max(best, b.max.y + LOAD_LOFT_M - LOAD_FALL_K * d2);
  }
  return best;
}

/**
 * Draw a suit's roof and deck nets (and the garnish tied to them) under `group` up over the given loads (boxes in the
 * group's frame). Returns how many net vertices moved.
 */
export function drapeGhillieOverLoads(group: THREE.Object3D, loads: readonly THREE.Box3[]): number {
  if (!loads.length) return 0;
  let moved = 0;
  for (const child of group.children) {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !/_ghillie_/.test(mesh.name || '')) continue;
    const pos = mesh.geometry?.attributes?.position as THREE.BufferAttribute | undefined;
    if (!pos) continue;
    const topVerts = mesh.userData[GHILLIE_TOP_VERTICES] as number | undefined;
    const topCards = mesh.userData[GHILLIE_TOP_CARDS] as readonly [number, number] | undefined;
    let changed = false;
    if (typeof topVerts === 'number') {
      for (let i = 0; i < Math.min(topVerts, pos.count); i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const h = heldUp(x, z, y, loads);
        if (h > y) { pos.setY(i, h); moved++; changed = true; }
      }
    } else if (topCards) {
      const [cards, per] = topCards;
      for (let c = 0; c < cards; c++) {
        const k = c * per;
        if (k >= pos.count) break;
        // a card rides with the cloth at its stem (its first vertex)
        const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
        const lift = heldUp(x, z, y, loads) - y + 0.002;
        if (lift <= 0) continue;
        for (let v = k; v < Math.min(pos.count, k + per); v++) pos.setY(v, pos.getY(v) + lift);
        changed = true;
      }
    }
    if (!changed) continue;
    pos.needsUpdate = true;
    if (typeof topVerts === 'number') mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  }
  return moved;
}
