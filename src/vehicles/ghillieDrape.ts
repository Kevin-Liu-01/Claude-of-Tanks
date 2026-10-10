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
/**
 * userData key on a field suit's net and garnish meshes (ghillieSuit.ts fieldClearanceM): the suit's own clearance test
 * of an owner-local point (cloth for the net, garnish for the cards). What the decor draws up over its loads is held to
 * it again: a lifted triangle or card it refuses is cut away.
 */
export const GHILLIE_FIELD_OK = 'ghillieFieldOk';

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

/** A net's roof and deck vertices before the draw (x, y, z runs) and how far each was drawn up, for its garnish. */
interface NetLift {
  readonly pts: Float32Array;
  readonly lift: Float32Array;
  /** Its triangles (every three vertices) by the plan cells their boxes cover. */
  readonly cells: Map<number, number[]>;
}

const LIFT_CELL_M = 0.1;

/**
 * How far the net was drawn up under (x, y, z): over the net's triangle under it in plan (the one lying nearest its
 * height), its corners' lifts at that point; past the net's edge, its nearest corner's; null with no net within 20 cm.
 */
function liftNear(net: NetLift, x: number, y: number, z: number): number | null {
  let best: number | null = null, bestDy = Infinity, nearD = Infinity, nearLift: number | null = null;
  const cx = Math.floor(x / LIFT_CELL_M), cz = Math.floor(z / LIFT_CELL_M), p = net.pts;
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
    for (const t of net.cells.get((cx + i + 2048) * 4096 + (cz + j + 2048)) ?? []) {
      const a = t * 9, ax = p[a], ay = p[a + 1], az = p[a + 2], bx = p[a + 3], by = p[a + 4], bz = p[a + 5], qx = p[a + 6], qy = p[a + 7], qz = p[a + 8];
      for (let k = 0; k < 3; k++) {
        const d = Math.hypot(p[a + k * 3] - x, p[a + k * 3 + 2] - z);
        if (d < nearD && d < 0.2) { nearD = d; nearLift = net.lift[t * 3 + k]; }
      }
      if (Math.abs(i) > 1 || Math.abs(j) > 1) continue;
      const den = (bz - qz) * (ax - qx) + (qx - bx) * (az - qz);
      if (Math.abs(den) < 1e-12) continue;
      const l0 = ((bz - qz) * (x - qx) + (qx - bx) * (z - qz)) / den, l1 = ((qz - az) * (x - qx) + (ax - qx) * (z - qz)) / den;
      const l2 = 1 - l0 - l1;
      if (l0 < -1e-6 || l1 < -1e-6 || l2 < -1e-6) continue;
      const dy = Math.abs(l0 * ay + l1 * by + l2 * qy - y);
      if (dy < bestDy) { bestDy = dy; best = l0 * net.lift[t * 3] + l1 * net.lift[t * 3 + 1] + l2 * net.lift[t * 3 + 2]; }
    }
  }
  return best ?? nearLift;
}

/**
 * Draw a suit's roof and deck nets (and the garnish tied to them) under `group` up over the given loads (boxes in the
 * group's frame). Returns how many net vertices moved.
 */
export function drapeGhillieOverLoads(group: THREE.Object3D, loads: readonly THREE.Box3[]): number {
  if (!loads.length) return 0;
  let moved = 0;
  const lifts = new Map<string, NetLift>();
  const finish = (mesh: THREE.Mesh, normals: boolean): void => {
    (mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    if (normals) mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  };
  // the nets first: each roof and deck vertex drawn up over the loads, its lift kept for the garnish tied near it
  for (const child of group.children) {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !/_ghillie_/.test(mesh.name || '')) continue;
    const pos = mesh.geometry?.attributes?.position as THREE.BufferAttribute | undefined;
    const topVerts = mesh.userData[GHILLIE_TOP_VERTICES] as number | undefined;
    if (!pos || typeof topVerts !== 'number') continue;
    const n = Math.min(topVerts, pos.count) - (Math.min(topVerts, pos.count) % 3);
    const net: NetLift = { pts: new Float32Array(n * 3), lift: new Float32Array(n), cells: new Map() };
    const lifted = new Uint8Array(pos.count);
    let changed = false;
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      net.pts[i * 3] = x; net.pts[i * 3 + 1] = y; net.pts[i * 3 + 2] = z;
      const h = heldUp(x, z, y, loads);
      if (h > y) { pos.setY(i, h); net.lift[i] = h - y; lifted[i] = 1; moved++; changed = true; }
    }
    for (let t = 0; t < n / 3; t++) {
      const a = t * 9;
      const x0 = Math.min(net.pts[a], net.pts[a + 3], net.pts[a + 6]), x1 = Math.max(net.pts[a], net.pts[a + 3], net.pts[a + 6]);
      const z0 = Math.min(net.pts[a + 2], net.pts[a + 5], net.pts[a + 8]), z1 = Math.max(net.pts[a + 2], net.pts[a + 5], net.pts[a + 8]);
      for (let cx = Math.floor(x0 / LIFT_CELL_M); cx <= Math.floor(x1 / LIFT_CELL_M); cx++) {
        for (let cz = Math.floor(z0 / LIFT_CELL_M); cz <= Math.floor(z1 / LIFT_CELL_M); cz++) {
          const key = (cx + 2048) * 4096 + (cz + 2048);
          const cell = net.cells.get(key);
          if (cell) cell.push(t); else net.cells.set(key, [t]);
        }
      }
    }
    // the rest of the net (the drapes) is drawn as it hangs
    for (let i = n; i < Math.min(topVerts, pos.count); i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), h = heldUp(x, z, y, loads);
      if (h > y) { pos.setY(i, h); lifted[i] = 1; moved++; changed = true; }
    }
    lifts.set(mesh.name.replace(/_net$/, ''), net);
    if (changed) { recheckLifted(mesh, 3, lifted); finish(mesh, true); }
  }
  // then the garnish: a card rides with the cloth at its stem. A field suit's card (ghillieSuit.ts fieldClearanceM) is
  // drawn up vertex by vertex as far as the net under it was (2026-10-10, the netting lane: lifted whole to the loads'
  // own height at its root, a card whose root row stood a few centimetres off the cloth, a long bough tilted up, sank
  // into the net drawn up under it, and a card over a load's edge stood off the net falling away beside it); the older
  // suits' cards keep the lift at their first vertex
  for (const child of group.children) {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !/_ghillie_/.test(mesh.name || '')) continue;
    const pos = mesh.geometry?.attributes?.position as THREE.BufferAttribute | undefined;
    const topCards = mesh.userData[GHILLIE_TOP_CARDS] as readonly [number, number] | undefined;
    if (!pos || !topCards || typeof mesh.userData[GHILLIE_TOP_VERTICES] === 'number') continue;
    const net = mesh.userData.fieldSuit ? lifts.get((mesh.name || '').replace(/_leaves$/, '')) : undefined;
    const [cards, per] = topCards;
    const lifted = new Uint8Array(pos.count);
    let changed = false;
    for (let c = 0; c < cards; c++) {
      const k = c * per;
      if (k >= pos.count) break;
      const end = Math.min(pos.count, k + per);
      if (net) {
        // the root row's middle (its far corner is vertex 7 of a folded card's 24 and vertex 1 of a flat card's 12,
        // vehicleFoliage.ts FoliageCardBuffer.push): the lift for any of its vertices past the net's edge
        const far = Math.min(end - 1, k + (per >= 24 ? 7 : 1));
        const root = liftNear(net, (pos.getX(k) + pos.getX(far)) / 2, (pos.getY(k) + pos.getY(far)) / 2, (pos.getZ(k) + pos.getZ(far)) / 2) ?? 0;
        for (let v = k; v < end; v++) {
          const lift = liftNear(net, pos.getX(v), pos.getY(v), pos.getZ(v)) ?? root;
          if (lift <= 1e-4) continue;
          pos.setY(v, pos.getY(v) + lift);
          lifted[v] = 1;
          changed = true;
        }
        continue;
      }
      const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
      const lift = heldUp(x, z, y, loads) - y + 0.002;
      if (lift <= 0) continue;
      for (let v = k; v < end; v++) pos.setY(v, pos.getY(v) + lift);
      changed = true;
    }
    if (changed) { recheckLifted(mesh, per, lifted); finish(mesh, false); }
  }
  return moved;
}

/**
 * A field suit's blocks (a net's triangles, `block` 3, or the garnish's cards) with a lifted vertex its own clearance
 * test refuses are cut away (GHILLIE_FIELD_OK), the carriers' counts kept to what is left.
 */
function recheckLifted(mesh: THREE.Mesh, block: number, lifted: Uint8Array): void {
  const ok = mesh.userData[GHILLIE_FIELD_OK] as ((p: readonly number[]) => boolean) | undefined;
  if (typeof ok !== 'function' || mesh.geometry.index) return;
  const pos = mesh.geometry.attributes.position as THREE.BufferAttribute;
  dropBlocks(mesh, block, (v) => lifted[v] === 1 && !ok([pos.getX(v), pos.getY(v), pos.getZ(v)]));
}

/** How far a smoke grenade's line is kept clear of a field suit (m), its half-width at the mouth and its spread. */
const SMOKE_LINE_REACH_M = 1.6;
const SMOKE_LINE_BASE_M = 0.1;
const SMOKE_LINE_SLOPE = 0.08;

/** Whether p lies in a tube along one of the [px, py, pz, dx, dy, dz] rows. */
function onSmokeLine(rows: readonly number[], x: number, y: number, z: number): boolean {
  for (let i = 0; i < rows.length; i += 6) {
    const wx = x - rows[i], wy = y - rows[i + 1], wz = z - rows[i + 2];
    const along = wx * rows[i + 3] + wy * rows[i + 4] + wz * rows[i + 5];
    if (along < -0.05 || along > SMOKE_LINE_REACH_M) continue;
    const lx = wx - rows[i + 3] * along, ly = wy - rows[i + 4] * along, lz = wz - rows[i + 5] * along;
    if (Math.hypot(lx, ly, lz) < SMOKE_LINE_BASE_M + Math.max(0, along) * SMOKE_LINE_SLOPE) return true;
  }
  return false;
}

/** Whether a smoke line (row i of `rows`, its reach) passes through the triangle a, b, c (Moller-Trumbore). */
function lineCrosses(rows: readonly number[], i: number, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): boolean {
  const ox = rows[i], oy = rows[i + 1], oz = rows[i + 2], dx = rows[i + 3], dy = rows[i + 4], dz = rows[i + 5];
  const e1x = b.x - a.x, e1y = b.y - a.y, e1z = b.z - a.z, e2x = c.x - a.x, e2y = c.y - a.y, e2z = c.z - a.z;
  const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-12) return false;
  const inv = 1 / det, tx = ox - a.x, ty = oy - a.y, tz = oz - a.z;
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < 0 || u > 1) return false;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < 0 || u + v > 1) return false;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t >= -0.05 && t <= SMOKE_LINE_REACH_M;
}

/** Keep only the vertices `keep` marks (in whole triangles or cards) of a non-indexed geometry's every attribute. */
function keepVertices(geometry: THREE.BufferGeometry, keep: Uint8Array): void {
  for (const [name, attr] of Object.entries(geometry.attributes)) {
    const a = attr as THREE.BufferAttribute, size = a.itemSize, src = a.array as Float32Array;
    const out = new Float32Array(keep.reduce((n, k) => n + k, 0) * size);
    let o = 0;
    for (let v = 0; v < a.count; v++) if (keep[v]) for (let c = 0; c < size; c++) out[o++] = src[v * size + c];
    geometry.setAttribute(name, new THREE.BufferAttribute(out, size, a.normalized));
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

/**
 * Cut away a suit mesh's blocks of `block` vertices (a net's triangles, the garnish's cards) with a vertex `hit` marks,
 * keeping its roof-and-deck counts (GHILLIE_TOP_VERTICES, GHILLIE_TOP_CARDS) to what is left. Returns the blocks cut.
 */
function dropBlocks(mesh: THREE.Mesh, block: number, hit: (v: number) => boolean,
  crossed?: (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => boolean): number {
  const pos = mesh.geometry.attributes.position as THREE.BufferAttribute;
  const topVerts = mesh.userData[GHILLIE_TOP_VERTICES] as number | undefined;
  const topCards = mesh.userData[GHILLIE_TOP_CARDS] as readonly [number, number] | undefined;
  const keep = new Uint8Array(pos.count).fill(1);
  let gone = 0, goneTop = 0;
  const ta = new THREE.Vector3(), tb = new THREE.Vector3(), tc = new THREE.Vector3();
  for (let b = 0; b + block <= pos.count; b += block) {
    let bad = false;
    for (let v = b; v < b + block && !bad; v++) bad = hit(v);
    // a block's faces as well as its corners (a card wider than the line it spans)
    for (let t = b; crossed && t + 2 < b + block && !bad; t += 3) {
      bad = crossed(ta.fromBufferAttribute(pos, t), tb.fromBufferAttribute(pos, t + 1), tc.fromBufferAttribute(pos, t + 2));
    }
    if (!bad) continue;
    keep.fill(0, b, b + block);
    gone++;
    if (typeof topVerts === 'number' ? b < topVerts : topCards ? b / block < topCards[0] : false) goneTop++;
  }
  if (!gone) return 0;
  // a net's scraps left by the cut (fewer than eight triangles welded together) go with it
  if (block === 3) {
    const tris = pos.count / 3, parent = Int32Array.from({ length: tris }, (_, i) => i);
    const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const owner = new Map<string, number>();
    for (let t = 0; t < tris; t++) {
      if (!keep[t * 3]) continue;
      for (let k = 0; k < 3; k++) {
        const v = t * 3 + k, key = `${pos.getX(v).toFixed(4)},${pos.getY(v).toFixed(4)},${pos.getZ(v).toFixed(4)}`;
        const other = owner.get(key);
        if (other === undefined) owner.set(key, t); else parent[find(t)] = find(other);
      }
    }
    const size = new Map<number, number>();
    for (let t = 0; t < tris; t++) if (keep[t * 3]) { const r = find(t); size.set(r, (size.get(r) ?? 0) + 1); }
    for (let t = 0; t < tris; t++) {
      if (!keep[t * 3] || (size.get(find(t)) ?? 0) >= 8) continue;
      keep.fill(0, t * 3, t * 3 + 3);
      gone++;
      if (typeof topVerts === 'number' && t * 3 < topVerts) goneTop++;
    }
  }
  keepVertices(mesh.geometry, keep);
  if (typeof topVerts === 'number') mesh.userData[GHILLIE_TOP_VERTICES] = topVerts - goneTop * block;
  else if (topCards) mesh.userData[GHILLIE_TOP_CARDS] = [topCards[0] - goneTop, topCards[1]];
  return gone;
}

/**
 * The netting lane (2026-10-10): a field suit (ghillieSuit.ts fieldClearanceM) under `group` gives way to smoke
 * dischargers seated after it was laid (the decor's banks are gameplay fittings): its cloth triangles and garnish cards
 * in a grenade's line of fire, rows [px, py, pz, dx, dy, dz] in the group's frame, are cut away. Returns how many
 * triangles and cards went.
 */
export function clearGhillieForSmoke(group: THREE.Object3D, rows: readonly number[]): number {
  if (!rows.length) return 0;
  let removed = 0;
  for (const child of group.children) {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.userData.fieldSuit || !/_ghillie_/.test(mesh.name || '') || mesh.geometry?.index) continue;
    const pos = mesh.geometry.attributes.position as THREE.BufferAttribute | undefined;
    if (!pos) continue;
    const topCards = mesh.userData[GHILLIE_TOP_CARDS] as readonly [number, number] | undefined;
    // whole triangles of a net, whole cards of the garnish
    const block = typeof mesh.userData[GHILLIE_TOP_VERTICES] === 'number' ? 3 : topCards ? topCards[1] : 3;
    removed += dropBlocks(mesh, block, (v) => onSmokeLine(rows, pos.getX(v), pos.getY(v), pos.getZ(v)), (a, b, c) => {
      for (let i = 0; i < rows.length; i += 6) if (lineCrosses(rows, i, a, b, c)) return true;
      return false;
    });
  }
  return removed;
}
