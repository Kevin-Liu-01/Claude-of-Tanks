// src/world/maps/wreckContact.ts — (the destructible-kits lane, 2026-10-11) every member of a wreck resting on something.
//
// The kit-connectivity receipt (kitConnectivity.selftest.mjs on partContact.ts; the buildings and landmarks lane's
// "monstrosity" sweep): every member of a light kit's wreck must reach the ground through members whose convex hulls
// come within 2 cm. A wreck rests each body on a height field of what lay before it (the r1 heap's quarter-metre cells,
// fractureSettle.ts's finer grid), and a cell holds the highest point round it: a body can come to rest a few
// centimetres over the face it lies on, or over a gap beside a ridge. This lowers each island of members resting on
// nothing (members touching one another but no chain to the ground) straight down until it meets the first face under
// it or the ground, lowest island first, so an island over another lands on it once that one has landed. Only islands
// move (a member already touching something keeps its place); positions only, deterministic.
import type * as THREE from 'three';
import { convexDistance } from '../partContact.ts';

export interface SeatOptions {
  /** Members within this of each other touch (partContact's 2 cm). */
  tolerance?: number;
  /** A member whose lowest point is within this of the ground stands on it. */
  groundY?: number;
  /** How far a landed island sinks into what it meets (m). */
  sink?: number;
  /** The ground under the wreck in its own frame (default flat at 0: a pillbox's bank, say). */
  ground?: (x: number, z: number) => number;
}

interface Member {
  /** welded position ids (into `coords`) */
  ids: number[];
  tris: number[];
  points: Float64Array;
  min: [number, number, number];
  max: [number, number, number];
}

const CELL = 0.25;
const cellKey = (i: number, j: number): number => (i + 4096) * 8192 + (j + 4096);

/** Lowers every island of a non-indexed wreck resting on nothing until it touches; returns the islands moved. */
export function seatFloatingParts(geometry: THREE.BufferGeometry, options: SeatOptions = {}): number {
  if (geometry.index) throw new Error('seatFloatingParts: a wreck is non-indexed');
  const tol = options.tolerance ?? 0.02, groundY = options.groundY ?? 0.03, sink = options.sink ?? 0.004;
  const ground = options.ground ?? (() => 0);
  const attribute = geometry.getAttribute('position') as THREE.BufferAttribute;
  const pos = attribute.array as Float32Array;
  const vertexCount = attribute.count, triCount = Math.floor(vertexCount / 3);
  // weld positions to ids (partContact's weld: 0.1 mm)
  const keyOf = (v: number): string => `${Math.round(pos[v * 3] * 1e4)},${Math.round(pos[v * 3 + 1] * 1e4)},${Math.round(pos[v * 3 + 2] * 1e4)}`;
  const ids = new Map<string, number>(), idOf = new Int32Array(vertexCount);
  const coords: number[] = [];
  for (let v = 0; v < vertexCount; v++) {
    const key = keyOf(v);
    let id = ids.get(key);
    if (id === undefined) { id = coords.length / 3; ids.set(key, id); coords.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); }
    idOf[v] = id;
  }
  const idCount = coords.length / 3;
  const parent = new Int32Array(idCount);
  for (let i = 0; i < idCount; i++) parent[i] = i;
  const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const live = new Uint8Array(idCount);
  for (let t = 0; t < triCount; t++) {
    const a = idOf[t * 3], b = idOf[t * 3 + 1], c = idOf[t * 3 + 2];
    if (a === b || b === c || a === c) continue;
    live[a] = live[b] = live[c] = 1;
    const ra = find(a), rb = find(b), rc = find(c);
    if (ra !== rb) parent[ra] = rb;
    const rb2 = find(rb);
    if (rc !== rb2) parent[rc] = rb2;
  }
  const memberOfRoot = new Map<number, number>(), members: Member[] = [];
  const memberOfId = new Int32Array(idCount).fill(-1);
  for (let id = 0; id < idCount; id++) {
    if (!live[id]) continue;
    const root = find(id);
    let m = memberOfRoot.get(root);
    if (m === undefined) {
      m = members.length; memberOfRoot.set(root, m);
      members.push({ ids: [], tris: [], points: new Float64Array(0), min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
    }
    members[m].ids.push(id);
    memberOfId[id] = m;
  }
  for (let t = 0; t < triCount; t++) {
    const a = idOf[t * 3], b = idOf[t * 3 + 1], c = idOf[t * 3 + 2];
    if (a === b || b === c || a === c) continue;
    members[memberOfId[a]].tris.push(t);
  }
  for (const m of members) {
    m.points = new Float64Array(m.ids.length * 3);
    m.ids.forEach((id, k) => {
      for (let axis = 0; axis < 3; axis++) {
        const value = coords[id * 3 + axis];
        m.points[k * 3 + axis] = value;
        if (value < m.min[axis]) m.min[axis] = value;
        if (value > m.max[axis]) m.max[axis] = value;
      }
    });
  }
  const n = members.length;
  const boundsGap = (a: Member, b: Member): number => {
    let gap = 0;
    for (let axis = 0; axis < 3; axis++) gap = Math.max(gap, a.min[axis] - b.max[axis], b.min[axis] - a.max[axis]);
    return gap;
  };
  const touches = (a: Member, b: Member): boolean => boundsGap(a, b) <= tol && convexDistance(a.points, b.points, tol) <= tol;
  const standsOnGround = (m: Member): boolean => {
    for (let k = 0; k < m.points.length; k += 3) if (m.points[k + 1] - ground(m.points[k], m.points[k + 2]) <= groundY) return true;
    return false;
  };
  // the grounded set: a flood from the members standing on the ground through touching members (each candidate pair is
  // tested once, when its grounded side is reached)
  const grounded = new Uint8Array(n), queue: number[] = [];
  for (let i = 0; i < n; i++) if (standsOnGround(members[i])) { grounded[i] = 1; queue.push(i); }
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const a = members[queue[cursor]];
    for (let j = 0; j < n; j++) if (!grounded[j] && touches(a, members[j])) { grounded[j] = 1; queue.push(j); }
  }
  const floating: number[] = [];
  for (let i = 0; i < n; i++) if (!grounded[i]) floating.push(i);
  if (!floating.length) return 0;
  // the islands: floating members touching one another
  const islandOf = new Int32Array(n).fill(-1), islands: number[][] = [];
  for (const f of floating) {
    if (islandOf[f] >= 0) continue;
    const island = [f], k = islands.length;
    islandOf[f] = k;
    for (let cursor = 0; cursor < island.length; cursor++) {
      for (const g of floating) {
        if (islandOf[g] < 0 && touches(members[island[cursor]], members[g])) { islandOf[g] = k; island.push(g); }
      }
    }
    islands.push(island);
  }
  // the supports: every grounded member's triangles by cell, and its points by cell
  const supportTris = new Map<number, number[]>(), supportPoints = new Map<number, number[]>();
  const triCorner = (t: number, k: number, axis: number): number => pos[(t * 3 + k) * 3 + axis];
  const addTri = (t: number): void => {
    const x0 = Math.min(triCorner(t, 0, 0), triCorner(t, 1, 0), triCorner(t, 2, 0));
    const x1 = Math.max(triCorner(t, 0, 0), triCorner(t, 1, 0), triCorner(t, 2, 0));
    const z0 = Math.min(triCorner(t, 0, 2), triCorner(t, 1, 2), triCorner(t, 2, 2));
    const z1 = Math.max(triCorner(t, 0, 2), triCorner(t, 1, 2), triCorner(t, 2, 2));
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) {
      for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
        const key = cellKey(i, j);
        let list = supportTris.get(key);
        if (!list) { list = []; supportTris.set(key, list); }
        list.push(t);
      }
    }
  };
  const addMember = (m: Member): void => {
    for (const t of m.tris) addTri(t);
    for (const id of m.ids) {
      const key = cellKey(Math.floor(coords[id * 3] / CELL), Math.floor(coords[id * 3 + 2] / CELL));
      let list = supportPoints.get(key);
      if (!list) { list = []; supportPoints.set(key, list); }
      list.push(id);
    }
  };
  for (let i = 0; i < n; i++) if (grounded[i]) addMember(members[i]);
  /** The height of triangle t over (x, z) when (x, z) lies inside its plan, else NaN (a face seen edge-on has none). */
  const heightOver = (t: number, x: number, z: number): number => {
    const ax = triCorner(t, 0, 0), az = triCorner(t, 0, 2), bx = triCorner(t, 1, 0), bz = triCorner(t, 1, 2);
    const cx = triCorner(t, 2, 0), cz = triCorner(t, 2, 2);
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(d) < 1e-10) return NaN;
    const l0 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
    const l1 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
    const l2 = 1 - l0 - l1;
    if (l0 < -1e-9 || l1 < -1e-9 || l2 < -1e-9) return NaN;
    return l0 * triCorner(t, 0, 1) + l1 * triCorner(t, 1, 1) + l2 * triCorner(t, 2, 1);
  };
  // each island from the lowest: down to the first face under any of its points, or the first of its faces over a
  // grounded point, or the ground; then it is a support for the islands over it
  const lowest = (island: number[]): number => Math.min(...island.map((i) => members[i].min[1]));
  islands.sort((a, b) => lowest(a) - lowest(b));
  let moved = 0;
  const inIsland = new Uint8Array(n);
  for (const island of islands) {
    let drop = Infinity;
    const islandTris: number[] = [];
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const i of island) {
      const m = members[i];
      islandTris.push(...m.tris);
      x0 = Math.min(x0, m.min[0]); x1 = Math.max(x1, m.max[0]); z0 = Math.min(z0, m.min[2]); z1 = Math.max(z1, m.max[2]);
      for (let k = 0; k < m.points.length; k += 3) {
        const x = m.points[k], y = m.points[k + 1], z = m.points[k + 2];
        drop = Math.min(drop, y - ground(x, z));
        for (const t of supportTris.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) {
          const h = heightOver(t, x, z);
          if (h === h && h <= y + 1e-6) drop = Math.min(drop, y - h);
        }
      }
    }
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) {
      for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
        for (const id of supportPoints.get(cellKey(i, j)) ?? []) {
          const x = coords[id * 3], y = coords[id * 3 + 1], z = coords[id * 3 + 2];
          if (x < x0 || x > x1 || z < z0 || z > z1) continue;
          for (const t of islandTris) {
            const h = heightOver(t, x, z);
            if (h === h && h >= y - 1e-6) drop = Math.min(drop, h - y);
          }
        }
      }
    }
    if (!(drop > 0) || !Number.isFinite(drop)) continue;
    const dy = drop + sink;
    for (const i of island) {
      const m = members[i];
      for (const id of m.ids) coords[id * 3 + 1] -= dy;
      for (let k = 1; k < m.points.length; k += 3) m.points[k] -= dy;
      m.min[1] -= dy; m.max[1] -= dy;
    }
    moved++;
    // the vertices follow their welded ids (a sliver of a degenerate triangle on them too)
    for (const i of island) inIsland[i] = 1;
    for (let v = 0; v < vertexCount; v++) {
      const m = memberOfId[idOf[v]];
      if (m >= 0 && inIsland[m]) pos[v * 3 + 1] = coords[idOf[v] * 3 + 1];
    }
    for (const i of island) { inIsland[i] = 0; addMember(members[i]); }
  }
  if (moved) {
    attribute.needsUpdate = true;
    geometry.boundingBox = null;
    geometry.boundingSphere = null;
  }
  return moved;
}
