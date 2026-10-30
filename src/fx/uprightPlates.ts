/**
 * uprightPlates.ts — no debris plate comes to rest standing on its edge (destruction-slabs 227 round 4).
 *
 * The owner, 2026-10-17: "for building destruction, these weird ugly boxes/surfaces still randomly come up ... its with
 * many buildings sometimes after shooting or impacts". The round-4 census found the last of them in the heaps: a body's
 * drawing is often more than one connected piece (a wall cell's skin and the dark interior plate behind it, a clump's
 * two faces at a corner, a set piece's gable and its eave boards), and a body that lies well on its box can still hold
 * one of those pieces bolt upright — a 3-12 m plate standing beside the ruin (airfield #0's tower, caldera #28's
 * warehouse, coastal #0's farmhouse, delta #9's and whiteout #3's dropped walls).
 *
 * `layUprightPlates` reads a resting drawing in world space, splits it into its connected pieces (corners welded at a
 * millimetre, as the slab check splits them), and lays every piece that is an upright plate — thin (a hand or less through), broad (1.6 m and more
 * each way in its plane), standing 1.4 m and more — on its broad side where it stood: turned about its middle so its
 * thin axis is vertical, then down onto the ground under it (the middle of the ground's spread under it, never over its old
 * foot, where the caller knows the ground; else its lowest point where its lowest point was). Nothing else moves.
 * Visual only: it rewrites the geometry of a drawing that no longer moves (a baked heap, a body put to rest); the
 * simulation, its records and the collision never see it. Deterministic: the same drawing lays the same way.
 *
 * (round 4, third pass; the census at d139fe6ee2 on three random seeds a face: airfield #0's tower baked a 3.8 x 2.8 m plate
 * into its heap 1.7 m up, 57 % of it over nothing; badlands #0's caravanserai a 4.5 m square one 1.2 m up in its yard)
 * `layPerchedPlates` reads drawings come to rest for flat plates perched — lying a metre and more over the ground with
 * a third of them and more over nothing within 0.8 m under them: no ground, no solid record, no body, no other drawn
 * piece — and lays each down: tilted off the edge of what holds it until its free side meets the ground (a slab leant
 * off the heap), or, held by nothing or steeper than 50 degrees so, lowered flat onto the ground under it.
 */
import * as THREE from 'three';
import type { RigidEnvironment, RigidWorld } from '../sim/rigidBody.ts';
import type { CollisionRecord } from '../world/collision.ts';
import { createMillimetreWeld } from './millimetreWeld.ts';

/** A plate: through it at most this (m); in its plane at least these (m, m², m up). */
const THIN_M = 0.6, SIDE_M = 1.6, AREA_M2 = 4, TALL_M = 1.4;
/** Upright: its thin axis within this of level (|y| of the unit normal). */
const UPRIGHT_NY = 0.5;

const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Quaternion(), _a = new THREE.Vector3(), _up = new THREE.Vector3();
const _inv = new THREE.Matrix4(), _nm = new THREE.Matrix3(), _nmInv = new THREE.Matrix3();

/** A symmetric 3×3's (xx xy xz yy yz zz) least eigenvector (Jacobi), unit, or null. */
function leastAxis(cv: readonly number[]): [number, number, number] | null {
  const a = [[cv[0]!, cv[1]!, cv[2]!], [cv[1]!, cv[3]!, cv[4]!], [cv[2]!, cv[4]!, cv[5]!]];
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 24; sweep++) {
    let off = 0;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) off += a[p]![q]! * a[p]![q]!;
    if (off < 1e-18) break;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) {
      if (Math.abs(a[p]![q]!) < 1e-20) continue;
      const theta = (a[q]![q]! - a[p]![p]!) / (2 * a[p]![q]!);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const cs = 1 / Math.sqrt(t * t + 1), sn = t * cs;
      for (let k = 0; k < 3; k++) { const akp = a[k]![p]!, akq = a[k]![q]!; a[k]![p] = cs * akp - sn * akq; a[k]![q] = sn * akp + cs * akq; }
      for (let k = 0; k < 3; k++) { const apk = a[p]![k]!, aqk = a[q]![k]!; a[p]![k] = cs * apk - sn * aqk; a[q]![k] = sn * apk + cs * aqk; }
      for (let k = 0; k < 3; k++) { const vkp = v[k]![p]!, vkq = v[k]![q]!; v[k]![p] = cs * vkp - sn * vkq; v[k]![q] = sn * vkp + cs * vkq; }
    }
  }
  let best = 0;
  for (let k = 1; k < 3; k++) if (a[k]![k]! < a[best]![best]!) best = k;
  const x = v[0]![best]!, y = v[1]![best]!, z = v[2]![best]!;
  const l = Math.hypot(x, y, z);
  return l > 1e-9 ? [x / l, y / l, z / l] : null;
}

/** The corners' welds (millimetreWeld.ts, perf-240: a string key a corner before). */
const weld = createMillimetreWeld();

function find(parent: Int32Array, i: number): number {
  while (parent[i] !== i) { parent[i] = parent[parent[i]!]!; i = parent[i]!; }
  return i;
}

/** A drawing's connected pieces (corners welded at a millimetre, as the slab check splits them): each piece's vertices. */
function piecesOf(w: Float64Array, count: number, index: THREE.BufferAttribute | null): Map<number, number[]> {
  const id = new Int32Array(count);
  let ids = 0;
  weld.begin(count);
  for (let i = 0; i < count; i++) {
    const k = weld.claim(w[i * 3]!, w[i * 3 + 1]!, w[i * 3 + 2]!, ids);
    id[i] = k < 0 ? ids++ : k;
  }
  const parent = new Int32Array(ids);
  for (let k = 0; k < ids; k++) parent[k] = k;
  const tris = index ? index.count / 3 : count / 3;
  const corner = (t: number, c: number): number => (index ? index.getX(t * 3 + c) : t * 3 + c);
  for (let t = 0; t < tris; t++) {
    const a = find(parent, id[corner(t, 0)]!), b = find(parent, id[corner(t, 1)]!);
    if (a !== b) parent[b] = a;
    const r = find(parent, a), c = find(parent, id[corner(t, 2)]!);
    if (r !== c) parent[c] = r;
  }
  const pieces = new Map<number, number[]>();
  for (let i = 0; i < count; i++) {
    const r = find(parent, id[i]!);
    let list = pieces.get(r);
    if (!list) { list = []; pieces.set(r, list); }
    list.push(i);
  }
  return pieces;
}

/** Where the building as drawn stands no more than this over the ground, its walls are buried there (clampPieceTops). */
const BURIED_M = 0.3;
/**
 * (round 4: the census's remnant piers standing 1-7 m over the building as it was drawn at their spot — a firestation's
 * steel stub, a stack's stump, a ruin's collapse stub over its banked heap) a standing remnant's pieces no taller than the
 * building was drawn where their tops stand: a piece whose top stands more than `marginM` over `topAt` there (world y; not
 * finite where the drawn form is not known: left alone) is squashed down about its foot to `marginM` over it. A piece
 * wholly over that height (a held storey's member: DESTRUCTION.md §3.4) is left alone — but for one standing where the
 * building as drawn reaches no higher than the ground (`groundAt`, within BURIED_M): a stub the ruin seated on a hillside
 * over walls the ground buried, as nothing was drawn there over the ground, is flattened to a point (2026-10-28, fjord
 * #6's naust cut into the shore: its net store's stub and a course of it stood 1.3-1.4 m over the building as drawn).
 * World-space geometry, in place.
 */
export function clampPieceTops(geometry: THREE.BufferGeometry, topAt: (x: number, z: number) => number, marginM = 0.5,
  groundAt: ((x: number, z: number) => number) | null = null): number {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!pos || pos.count < 4) return 0;
  const count = pos.count;
  const w = new Float64Array(count * 3);
  for (let i = 0; i < count; i++) { w[i * 3] = pos.getX(i); w[i * 3 + 1] = pos.getY(i); w[i * 3 + 2] = pos.getZ(i); }
  let squashed = 0;
  for (const list of piecesOf(w, count, geometry.getIndex()).values()) {
    let y0 = Infinity, y1 = -Infinity, tx = 0, tz = 0;
    for (const i of list) {
      const y = w[i * 3 + 1]!;
      if (y < y0) y0 = y;
      if (y > y1) { y1 = y; tx = w[i * 3]!; tz = w[i * 3 + 2]!; }
    }
    if (y1 - y0 < 1) continue;
    const drawn = topAt(tx, tz);
    if (!Number.isFinite(drawn)) continue;
    const cap = drawn + marginM;
    if (!(y1 > cap + 0.05)) continue;
    if (!(cap > y0 + 0.15)) {
      if (!groundAt || !(drawn <= groundAt(tx, tz) + BURIED_M)) continue;
      // (every vertex onto its first: its triangles collapse to a point, as a flattened span's)
      const f = list[0]! * 3;
      for (const i of list) pos.setXYZ(i, w[f]!, w[f + 1]!, w[f + 2]!);
      squashed++;
      continue;
    }
    const k = (cap - y0) / (y1 - y0);
    for (const i of list) pos.setY(i, y0 + (w[i * 3 + 1]! - y0) * k);
    squashed++;
  }
  if (!squashed) return 0;
  pos.needsUpdate = true;
  geometry.computeBoundingSphere();
  geometry.boundingBox = null;
  return squashed;
}

/**
 * Lay a resting drawing's upright plates on their broad sides (in place). `matrix` takes the geometry to the world
 * (null: it is already in world space). Returns how many pieces were laid.
 */
export function layUprightPlates(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4 | null = null,
  groundAt: ((x: number, z: number) => number) | null = null): number {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
  if (!pos || pos.count < 6) return 0;
  const nrm = geometry.getAttribute('normal') as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
  const count = pos.count;
  // world positions
  const w = new Float64Array(count * 3);
  for (let i = 0; i < count; i++) {
    _v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    if (matrix) _v.applyMatrix4(matrix);
    w[i * 3] = _v.x; w[i * 3 + 1] = _v.y; w[i * 3 + 2] = _v.z;
  }
  const pieces = piecesOf(w, count, geometry.getIndex());
  let laid = 0;
  const changed = new Uint8Array(count);
  const cv = [0, 0, 0, 0, 0, 0];
  for (const list of pieces.values()) {
    if (list.length < 4) continue;
    let mx = 0, my = 0, mz = 0, y0 = Infinity, y1 = -Infinity;
    for (const i of list) {
      mx += w[i * 3]!; my += w[i * 3 + 1]!; mz += w[i * 3 + 2]!;
      if (w[i * 3 + 1]! < y0) y0 = w[i * 3 + 1]!;
      if (w[i * 3 + 1]! > y1) y1 = w[i * 3 + 1]!;
    }
    if (y1 - y0 < TALL_M) continue;
    mx /= list.length; my /= list.length; mz /= list.length;
    cv.fill(0);
    for (const i of list) {
      const x = w[i * 3]! - mx, y = w[i * 3 + 1]! - my, z = w[i * 3 + 2]! - mz;
      cv[0] += x * x; cv[1] += x * y; cv[2] += x * z; cv[3] += y * y; cv[4] += y * z; cv[5] += z * z;
    }
    const ax = leastAxis(cv);
    if (!ax || Math.abs(ax[1]) >= UPRIGHT_NY) continue;
    // its spread through itself and across it (along level in its plane, and up its plane)
    _n.set(ax[0], ax[1], ax[2]);
    _a.set(-ax[2], 0, ax[0]).normalize();
    _up.crossVectors(_n, _a);
    let t0 = Infinity, t1 = -Infinity, u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const i of list) {
      const x = w[i * 3]! - mx, y = w[i * 3 + 1]! - my, z = w[i * 3 + 2]! - mz;
      const t = x * _n.x + y * _n.y + z * _n.z, u = x * _a.x + z * _a.z, v = x * _up.x + y * _up.y + z * _up.z;
      if (t < t0) t0 = t; if (t > t1) t1 = t; if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
    }
    const thick = t1 - t0, eu = u1 - u0, ev = v1 - v0;
    if (thick > THIN_M || eu < SIDE_M || ev < SIDE_M || eu * ev < AREA_M2 || thick > 0.12 * Math.min(eu, ev) + 0.05) continue;
    // turned about its middle so its thin axis stands vertical, then down to where its foot was
    _q.setFromUnitVectors(_n, _v.set(0, ax[1] >= 0 ? 1 : -1, 0));
    let ny0 = Infinity;
    for (const i of list) {
      _v.set(w[i * 3]! - mx, w[i * 3 + 1]! - my, w[i * 3 + 2]! - mz).applyQuaternion(_q);
      w[i * 3] = _v.x + mx; w[i * 3 + 1] = _v.y + my; w[i * 3 + 2] = _v.z + mz;
      if (w[i * 3 + 1]! < ny0) ny0 = w[i * 3 + 1]!;
    }
    // (round 4: airfield #0's dark plate, laid at the foot it stood on up on the heap, lay half over nothing 1.5 m up) where the
    // ground is known, onto the ground under where it now lies — the middle of its spread under the plate (a heap's mound, a
    // slope: half of it bedded in, half on it) — never higher than its old foot; else at its old foot
    let foot = y0;
    if (groundAt) {
      const every = Math.max(1, Math.floor(list.length / 48)), gs: number[] = [groundAt(mx, mz)];
      for (let k = 0; k < list.length; k += every) { const i = list[k]!; gs.push(groundAt(w[i * 3]!, w[i * 3 + 2]!)); }
      gs.sort((a, b) => a - b);
      const g = gs[gs.length >> 1]!;
      if (Number.isFinite(g)) foot = Math.min(y0, g);
    }
    const dy = foot - ny0 + 0.02;
    for (const i of list) { w[i * 3 + 1] = w[i * 3 + 1]! + dy; changed[i] = 1; }
    if (nrm) {
      if (matrix) { _nm.getNormalMatrix(matrix); _nmInv.copy(_nm).invert(); }
      for (const i of list) {
        _v.set(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
        if (matrix) _v.applyMatrix3(_nm);
        _v.applyQuaternion(_q);
        if (matrix) _v.applyMatrix3(_nmInv);
        _v.normalize();
        nrm.setXYZ(i, _v.x, _v.y, _v.z);
      }
    }
    laid++;
  }
  if (!laid) return 0;
  if (matrix) _inv.copy(matrix).invert();
  for (let i = 0; i < count; i++) {
    if (!changed[i]) continue;
    _v.set(w[i * 3]!, w[i * 3 + 1]!, w[i * 3 + 2]!);
    if (matrix) _v.applyMatrix4(_inv);
    pos.setXYZ(i, _v.x, _v.y, _v.z);
  }
  if (pos instanceof THREE.InterleavedBufferAttribute) pos.data.needsUpdate = true; else pos.needsUpdate = true;
  if (nrm) { if (nrm instanceof THREE.InterleavedBufferAttribute) nrm.data.needsUpdate = true; else nrm.needsUpdate = true; }
  geometry.computeBoundingSphere();
  geometry.boundingBox = null;
  return laid;
}

/** Perched (round 4, third pass): a flat plate (its thin axis within this of vertical) at rest this far or more over the
 *  ground at its middle, this share or more of its area over nothing within the band under it. (The slab check flags
 *  40 % over nothing a metre up, within 0.8 m: laid sooner.) */
const FLAT_NY = 0.8, PERCH_LIFT_M = 0.9, PERCH_SHARE = 0.3, PERCH_BAND_M = 0.8;
/** (destruction-slabs 227 round 6; the round-5 census's airfield #0 tower, R narrow, seed 1926340207: a 3.3 x 2.6 m plate
 *  of its heap lying tilted 1.1 m up with all of it over nothing, from its bake to the settled ruin — the slab check calls a
 *  plate tilted from 0.3 to 0.8 of its normal's rise, and floats it at any tilt; this pass read flat plates alone) a plate
 *  tilted this far or less from flat (its thin axis's rise) is judged too; one held by nothing is laid flat on the ground. */
const TILTED_NY = 0.3;
/** Tilted off its hold's edge onto the ground at most this steep (rad, 50 degrees); steeper, or held by nothing, it is
 *  lowered flat onto the ground under it. */
const TILT_MAX = 0.87;
/** The drawn tops' grid cell (m): a sample is held by a drawn top in its cell or the eight round it. */
const TOP_CELL_M = 0.25;
/** A piece of the plate's own body holds it only reaching this much lower than the plate's lowest point (m). */
const OWN_LOWER_M = 0.3;
/** A body's contact sphere holds a sample over it in plan, this far past its edge (m). (Round 5: 0.45 m past its edge,
 *  and a sphere beside the plate at its height held it — airfield #0's heap plate read 79 % held by the chunks lying and
 *  falling round it, the slab check 38 %.) */
const SPHERE_NEAR_M = 0.15;
/** A body moving faster than this (m/s) holds nothing up: it is falling past. */
const SPHERE_STILL_MPS = 1.5;

/** What holds a perched plate besides the drawings and the ground: the world's solid records and the pool's bodies. */
interface PlateHold {
  /** Ready for a region (world box): the records and the bodies' contact spheres round it. */
  prepare(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void;
  /** Whether a record or a body holds a point (world) within `bandM` under it. */
  held(x: number, y: number, z: number, bandM: number): boolean;
}

/** The records (a live one holds: the falling building's own standing walls with the rest) and the pool's bodies (their
 *  contact spheres) as a plate's hold. */
export function createPlateHold(environment: () => RigidEnvironment | null, world: RigidWorld | null): PlateHold {
  const found: CollisionRecord[] = [], recs: CollisionRecord[] = [], spheres: number[] = [];
  const q = new THREE.Quaternion(), v = new THREE.Vector3();
  return {
    prepare(x0, y0, z0, x1, y1, z1) {
      recs.length = 0; spheres.length = 0;
      const env = environment();
      if (env?.queryStatic) for (const r of env.queryStatic(x0 - 0.3, z0 - 0.3, x1 + 0.3, z1 + 0.3, found)) if (!r.crushed && !r.dead) recs.push(r);
      if (!world) return;
      for (let slot = 0; slot < world.capacity; slot++) {
        if (!world.active[slot]) continue;
        const sh = world.shape(slot);
        if (!sh) continue;
        if (!world.asleep[slot] && Math.hypot(world.vx[slot]!, world.vy[slot]!, world.vz[slot]!) > SPHERE_STILL_MPS) continue;
        const cx = world.px[slot]!, cy = world.py[slot]!, cz = world.pz[slot]!, r = sh.radius + SPHERE_NEAR_M;
        if (cx + r < x0 || cx - r > x1 || cz + r < z0 || cz - r > z1 || cy - sh.radius > y1 + 0.1 || cy + sh.radius < y0 - PERCH_BAND_M) continue;
        q.set(world.qx[slot]!, world.qy[slot]!, world.qz[slot]!, world.qw[slot]!);
        for (let k = 0; k < sh.sphereCount; k++) {
          v.set(sh.spheres[k * 4]!, sh.spheres[k * 4 + 1]!, sh.spheres[k * 4 + 2]!).applyQuaternion(q);
          spheres.push(cx + v.x, cy + v.y, cz + v.z, sh.spheres[k * 4 + 3]!);
        }
      }
    },
    held(x, y, z, bandM) {
      for (const rec of recs) {
        if (rec.max[1] >= y - bandM && rec.min[1] <= y + 0.05 && x >= rec.min[0] - 0.3 && x <= rec.max[0] + 0.3 && z >= rec.min[2] - 0.3
          && z <= rec.max[2] + 0.3) return true;
      }
      for (let k = 0; k < spheres.length; k += 4) {
        const sr = spheres[k + 3]!;
        // (under the sample: its top in the band under it, its middle below it)
        if (Math.hypot(spheres[k]! - x, spheres[k + 2]! - z) <= SPHERE_NEAR_M + sr && spheres[k + 1]! + sr >= y - bandM && spheres[k + 1]! <= y + 0.05) return true;
      }
      return false;
    },
  };
}

/** A drawing for layPerchedPlates: its geometry and the matrix to the world (null: in world space already). */
export interface PlateDrawing {
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4 | null;
  /** The rigid body it was drawn for (its meshes share it; absent: a drawing of its own). A body's pieces do not hold one
   *  another up: a piece of it holds a plate of it only reaching lower than the plate (a slab on its own stub). */
  body?: number;
  /** (round 5) Per vertex, the body it was drawn for: a merged heap, many bodies in one drawing (wins over `body`; a
   *  triangle of the plate's own body holds it only reaching lower than it). */
  bodyOf?: Int32Array;
  /** (round 5) Judge these pieces of it alone (a merged heap's watched plates), not every connected piece of it. */
  pieces?: readonly WatchedPlate[];
}

/** (round 5) A plate a drawing came to rest with, held when it was judged: its vertices and its triangles (non-indexed
 *  drawings: triangle t is vertices 3t..3t+2; an indexed one's corners through its index) and its body. What holds it can
 *  go later (the building's own walls, a storey's records, a body under it), so its drawing's owner judges it again. */
export interface WatchedPlate {
  verts: Int32Array;
  tris: Int32Array;
  body: number;
}

/** A drawing's vertices in world space. */
function worldPositions(d: PlateDrawing): Float64Array {
  const pos = d.geometry.getAttribute('position') as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
  if (!pos) return new Float64Array(0);
  const w = new Float64Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    _v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    if (d.matrix) _v.applyMatrix4(d.matrix);
    w[i * 3] = _v.x; w[i * 3 + 1] = _v.y; w[i * 3 + 2] = _v.z;
  }
  return w;
}

/** A drawing's connected pieces (as piecesOf) with each triangle's piece (its root). */
function piecesWithTriangles(w: Float64Array, count: number, index: THREE.BufferAttribute | null): { pieces: Map<number, number[]>; tri: Int32Array } {
  const id = new Int32Array(count);
  let ids = 0;
  weld.begin(count);
  for (let i = 0; i < count; i++) {
    const k = weld.claim(w[i * 3]!, w[i * 3 + 1]!, w[i * 3 + 2]!, ids);
    id[i] = k < 0 ? ids++ : k;
  }
  const parent = new Int32Array(ids);
  for (let k = 0; k < ids; k++) parent[k] = k;
  const tris = index ? index.count / 3 : count / 3;
  const corner = (t: number, c: number): number => (index ? index.getX(t * 3 + c) : t * 3 + c);
  for (let t = 0; t < tris; t++) {
    const a = find(parent, id[corner(t, 0)]!), b = find(parent, id[corner(t, 1)]!);
    if (a !== b) parent[b] = a;
    const r = find(parent, a), c = find(parent, id[corner(t, 2)]!);
    if (r !== c) parent[c] = r;
  }
  const pieces = new Map<number, number[]>();
  for (let i = 0; i < count; i++) {
    const r = find(parent, id[i]!);
    let list = pieces.get(r);
    if (!list) { list = []; pieces.set(r, list); }
    list.push(i);
  }
  const tri = new Int32Array(tris);
  for (let t = 0; t < tris; t++) tri[t] = find(parent, id[corner(t, 0)]!);
  return { pieces, tri };
}

const _pq = new THREE.Quaternion(), _pa = new THREE.Vector3(), _pe1 = new THREE.Vector3(), _pe2 = new THREE.Vector3(), _pc = new THREE.Vector3();
const _UPV = new THREE.Vector3(0, 1, 0);

/** (perf-240) A drawing's triangles in a plan grid: each listed in every cell its plan box meets (start/tris, by cell), and
 *  those a laid plate moved since (`moved`: read by every query, where they are now). */
interface PlanGrid {
  x0: number; z0: number; cell: number; nx: number; nz: number; start: Int32Array; tris: Int32Array; seen: Uint32Array; stamp: number;
  moved: number[];
}
const PLAN_CELL_M = 4, PLAN_CELLS_MAX = 256;
function planGridOf(ww: Float64Array, n: number, index: THREE.BufferAttribute | null): PlanGrid {
  const box = new Float64Array(n * 4);
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let t = 0; t < n; t++) {
    const a = index ? index.getX(t * 3) : t * 3, b = index ? index.getX(t * 3 + 1) : t * 3 + 1, c = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    const lx = Math.min(ww[a * 3]!, ww[b * 3]!, ww[c * 3]!), hx = Math.max(ww[a * 3]!, ww[b * 3]!, ww[c * 3]!);
    const lz = Math.min(ww[a * 3 + 2]!, ww[b * 3 + 2]!, ww[c * 3 + 2]!), hz = Math.max(ww[a * 3 + 2]!, ww[b * 3 + 2]!, ww[c * 3 + 2]!);
    // (a triangle off the finite plane stamps nothing: left out)
    if (!(Number.isFinite(lx) && Number.isFinite(hx) && Number.isFinite(lz) && Number.isFinite(hz))) { box[t * 4] = NaN; continue; }
    box[t * 4] = lx; box[t * 4 + 1] = lz; box[t * 4 + 2] = hx; box[t * 4 + 3] = hz;
    if (lx < x0) x0 = lx; if (lz < z0) z0 = lz; if (hx > x1) x1 = hx; if (hz > z1) z1 = hz;
  }
  if (!(x1 >= x0 && z1 >= z0)) return { x0: 0, z0: 0, cell: 1, nx: 0, nz: 0, start: new Int32Array(1), tris: new Int32Array(0), seen: new Uint32Array(n), stamp: 0, moved: [] };
  const cell = Math.max(PLAN_CELL_M, (x1 - x0) / PLAN_CELLS_MAX, (z1 - z0) / PLAN_CELLS_MAX);
  const nx = Math.floor((x1 - x0) / cell) + 1, nz = Math.floor((z1 - z0) / cell) + 1;
  const start = new Int32Array(nx * nz + 1);
  for (let pass = 0; pass < 2; pass++) {
    const fill = pass === 1 ? new Int32Array(start[nx * nz]!) : null;
    const at = pass === 1 ? start.slice(0, nx * nz) : null;
    for (let t = 0; t < n; t++) {
      if (Number.isNaN(box[t * 4]!)) continue;
      const i0 = Math.floor((box[t * 4]! - x0) / cell), k0 = Math.floor((box[t * 4 + 1]! - z0) / cell);
      const i1 = Math.floor((box[t * 4 + 2]! - x0) / cell), k1 = Math.floor((box[t * 4 + 3]! - z0) / cell);
      for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
        if (fill) fill[at![k * nx + i]!++] = t; else start[k * nx + i + 1]!++;
      }
    }
    if (fill) return { x0, z0, cell, nx, nz, start, tris: fill, seen: new Uint32Array(n), stamp: 0, moved: [] };
    for (let c = 0; c < nx * nz; c++) start[c + 1] = start[c + 1]! + start[c]!;
  }
  throw new Error('unreachable');
}
/** A laid plate's triangles onto its drawing's grid's moved list (no grid yet: it is built where they are now). */
function planGridMoved(g: PlanGrid | null, tris: ArrayLike<number>): void {
  if (g) for (let q = 0; q < tris.length; q++) g.moved.push(tris[q]!);
}
let planHits = new Int32Array(256);
/** The triangles whose plan box may meet [x0, x1] x [z0, z1] (as built, or moved since), each once, into planHits; their
 *  count. */
function planGridQuery(g: PlanGrid, x0: number, z0: number, x1: number, z1: number): number {
  g.stamp = (g.stamp + 1) >>> 0;
  if (g.stamp === 0) { g.seen.fill(0); g.stamp = 1; }
  let count = 0;
  const hit = (t: number): void => {
    if (g.seen[t] === g.stamp) return;
    g.seen[t] = g.stamp;
    if (count === planHits.length) { const grown = new Int32Array(count * 2); grown.set(planHits); planHits = grown; }
    planHits[count++] = t;
  };
  for (let m = 0; m < g.moved.length; m++) hit(g.moved[m]!);
  if (!g.nx || !(x1 >= g.x0) || !(z1 >= g.z0)) return count;
  const i0 = Math.max(0, Math.floor((x0 - g.x0) / g.cell)), i1 = Math.min(g.nx - 1, Math.floor((x1 - g.x0) / g.cell));
  const k0 = Math.max(0, Math.floor((z0 - g.z0) / g.cell)), k1 = Math.min(g.nz - 1, Math.floor((z1 - g.z0) / g.cell));
  for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
    const c = k * g.nx + i;
    for (let m = g.start[c]!; m < g.start[c + 1]!; m++) hit(g.tris[m]!);
  }
  return count;
}

/**
 * Lay the perched flat plates of drawings come to rest (in place): `edit` are laid, `also` hold them (their drawn tops)
 * and stay as they are; `hold` reads the records and bodies (null: the drawings and the ground alone). Returns how many
 * plates were laid. Visual only and deterministic, as layUprightPlates.
 */
export function layPerchedPlates(edit: readonly PlateDrawing[], also: readonly PlateDrawing[], groundAt: (x: number, z: number) => number,
  hold: PlateHold | null = null, watch: Array<WatchedPlate & { e: number }> | null = null): number {
  const all = [...edit, ...also];
  const worlds: Array<Float64Array | null> = all.map(() => null);
  const worldOf = (k: number): Float64Array => (worlds[k] ??= worldPositions(all[k]!));
  // each drawing's pieces (each triangle's root) and every piece's lowest point, as drawn when first asked (a body's own)
  type Split = { pieces: Map<number, number[]>; tri: Int32Array; low: Map<number, number> };
  const split: Array<Split | null> = all.map(() => null);
  const splitOf = (k: number): Split => {
    let sp = split[k];
    if (!sp) {
      const ww = worldOf(k), g = all[k]!.geometry;
      const { pieces, tri } = piecesWithTriangles(ww, ww.length / 3, g.getIndex());
      const low = new Map<number, number>();
      for (const [r, l] of pieces) { let m = Infinity; for (const i of l) if (ww[i * 3 + 1]! < m) m = ww[i * 3 + 1]!; low.set(r, m); }
      sp = split[k] = { pieces, tri, low };
    }
    return sp;
  };
  // (perf-240) a drawing scanned for a second plate is read through its plan grid (planGridOf), made then; a plate of it laid
  // after puts its triangles on the grid's moved list
  const scans = new Int32Array(all.length);
  const grids: Array<PlanGrid | null> = all.map(() => null);
  let laid = 0;
  const cv = [0, 0, 0, 0, 0, 0];
  for (let e = 0; e < edit.length; e++) {
    const d = edit[e]!;
    const pos = d.geometry.getAttribute('position') as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
    if (!pos || pos.count < 6) continue;
    const w = worldOf(e);
    const index = d.geometry.getIndex();
    const corner = (t: number, c: number): number => (index ? index.getX(t * 3 + c) : t * 3 + c);
    const changed = new Uint8Array(pos.count);
    let any = false;
    // the pieces judged: a watched drawing's own (round 5: a merged heap's plates held when they baked), else every
    // connected piece of it, each with its triangles
    type Candidate = { root: number; list: number[] | Int32Array; tris: number[] | Int32Array; body: number | undefined };
    const candidates: Candidate[] = [];
    if (d.pieces) for (const p of d.pieces) candidates.push({ root: -1, list: p.verts, tris: p.tris, body: p.body });
    else {
      const { pieces, tri } = splitOf(e);
      const trisOf = new Map<number, number[]>();
      for (let t = 0; t < tri.length; t++) { let l = trisOf.get(tri[t]!); if (!l) trisOf.set(tri[t]!, l = []); l.push(t); }
      for (const [root, list] of pieces) candidates.push({ root, list, tris: trisOf.get(root) ?? [], body: d.body });
    }
    for (const { root, list, tris: pieceTris, body: plateBody } of candidates) {
      if (list.length < 4) continue;
      let mx = 0, my = 0, mz = 0, x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      for (const i of list) {
        const x = w[i * 3]!, y = w[i * 3 + 1]!, z = w[i * 3 + 2]!;
        mx += x; my += y; mz += z;
        if (x < x0) x0 = x; if (y < y0) y0 = y; if (z < z0) z0 = z; if (x > x1) x1 = x; if (y > y1) y1 = y; if (z > z1) z1 = z;
      }
      mx /= list.length; my /= list.length; mz /= list.length;
      // lifted: its lowest point over the ground at its middle (the slab check's lift)
      if (!(y0 - groundAt((x0 + x1) / 2, (z0 + z1) / 2) >= PERCH_LIFT_M)) continue;
      cv.fill(0);
      for (const i of list) {
        const x = w[i * 3]! - mx, y = w[i * 3 + 1]! - my, z = w[i * 3 + 2]! - mz;
        cv[0] += x * x; cv[1] += x * y; cv[2] += x * z; cv[3] += y * y; cv[4] += y * z; cv[5] += z * z;
      }
      const ax = leastAxis(cv);
      if (!ax || Math.abs(ax[1]) < TILTED_NY) continue;
      const level = Math.abs(ax[1]) >= FLAT_NY;
      // a plate: thin through it, broad both ways in its plane
      _n.set(ax[0], ax[1], ax[2]);
      _a.set(1, 0, 0).cross(_n);
      if (_a.lengthSq() < 0.01) _a.set(0, 0, 1).cross(_n);
      _a.normalize();
      _up.crossVectors(_n, _a);
      let t0 = Infinity, t1 = -Infinity, u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (const i of list) {
        const x = w[i * 3]! - mx, y = w[i * 3 + 1]! - my, z = w[i * 3 + 2]! - mz;
        const t = x * _n.x + y * _n.y + z * _n.z, u = x * _a.x + y * _a.y + z * _a.z, v = x * _up.x + y * _up.y + z * _up.z;
        if (t < t0) t0 = t; if (t > t1) t1 = t; if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
      }
      const thick = t1 - t0, eu = u1 - u0, ev = v1 - v0;
      // (an open piece the slab check reads facet by facet — airfield #0's chunk, its top and bottom 0.5 m apart, no sides —
      // is judged whole here: thin as a hand or as half a metre, it lies perched all the same)
      if (thick > THIN_M || eu < SIDE_M || ev < SIDE_M || eu * ev < AREA_M2) continue;
      // its surface sampled by area (the slab check's reading), each sample held or over nothing
      const samples: number[] = [];
      for (let ti = 0; ti < pieceTris.length; ti++) {
        const t = pieceTris[ti]!;
        const a = corner(t, 0), b = corner(t, 1), c = corner(t, 2);
        _pe1.set(w[b * 3]! - w[a * 3]!, w[b * 3 + 1]! - w[a * 3 + 1]!, w[b * 3 + 2]! - w[a * 3 + 2]!);
        _pe2.set(w[c * 3]! - w[a * 3]!, w[c * 3 + 1]! - w[a * 3 + 1]!, w[c * 3 + 2]! - w[a * 3 + 2]!);
        const area = 0.5 * _pc.crossVectors(_pe1, _pe2).length();
        if (!(area > 1e-4)) continue;
        const ks = Math.max(1, Math.min(24, Math.round(area / 0.25)));
        for (let k = 0; k < ks; k++) {
          let u = ((k + 0.5) * 0.618034) % 1, v = ((k + 0.5) * 0.754878) % 1;
          if (u + v > 1) { u = 1 - u; v = 1 - v; }
          samples.push(w[a * 3]! + _pe1.x * u + _pe2.x * v, w[a * 3 + 1]! + _pe1.y * u + _pe2.y * v, w[a * 3 + 2]! + _pe1.z * u + _pe2.z * v, area / ks);
        }
      }
      if (!samples.length) continue;
      // what is drawn under it: every other piece's tops in the band under it, on a grid over its plan
      const gx0 = x0 - TOP_CELL_M, gz0 = z0 - TOP_CELL_M;
      const nx = Math.max(1, Math.ceil((x1 - x0) / TOP_CELL_M) + 3), nz = Math.max(1, Math.ceil((z1 - z0) / TOP_CELL_M) + 3);
      const yLo = y0 - PERCH_BAND_M - 0.05, yHi = y1 + 0.05;
      const tops = new Float32Array(nx * nz).fill(-Infinity);
      const stamp = (x: number, y: number, z: number): void => {
        if (y < yLo || y > yHi) return;
        const i = Math.floor((x - gx0) / TOP_CELL_M), k = Math.floor((z - gz0) / TOP_CELL_M);
        if (i < 0 || k < 0 || i >= nx || k >= nz) return;
        if (y > tops[k * nx + i]!) tops[k * nx + i] = y;
      };
      const gx1 = gx0 + nx * TOP_CELL_M, gz1 = gz0 + nz * TOP_CELL_M;
      for (let k = 0; k < all.length; k++) {
        const ww = worldOf(k);
        const g = all[k]!.geometry, idx = g.getIndex();
        const n = Math.floor((idx ? idx.count : ww.length / 3) / 3);
        // (round 4, fourth pass; the census's airfield #0 tower at a fourth seed: a clump's skin and the dark interior plate
        // behind it, both 1.7 m up, each read as holding the other) a piece of the plate's own body holds it only reaching
        // lower than it (a slab on its own stub), never its twin beside it
        // (round 5: a merged heap carries its bodies per vertex) its own body's triangles hold it only reaching lower
        const bodyOfK = all[k]!.bodyOf;
        const ownBody = !bodyOfK && (k === e || (plateBody !== undefined && all[k]!.body === plateBody));
        const own = ownBody ? splitOf(k) : null;
        // (perf-240) a drawing's second scan on reads the triangles its plan grid finds meeting the plate's grid: the only
        // ones the plan test below lets through (one off the finite plane stamps nothing either way); the tops keep each
        // cell's highest, whatever the order
        const grid = ++scans[k]! > 1 ? (grids[k] ??= planGridOf(ww, n, idx)) : null;
        const count = grid ? planGridQuery(grid, gx0, gz0, gx1, gz1) : n;
        for (let m = 0; m < count; m++) {
          const t = grid ? planHits[m]! : m;
          if (own && !(own.low.get(own.tri[t]!)! < y0 - OWN_LOWER_M)) continue;
          const a = idx ? idx.getX(t * 3) : t * 3, b = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, c = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
          const ax_ = ww[a * 3]!, ay = ww[a * 3 + 1]!, az = ww[a * 3 + 2]!, bx = ww[b * 3]!, by = ww[b * 3 + 1]!, bz = ww[b * 3 + 2]!;
          const cx = ww[c * 3]!, cy = ww[c * 3 + 1]!, cz = ww[c * 3 + 2]!;
          if (bodyOfK && (plateBody === undefined ? k === e : bodyOfK[a] === plateBody) && !(Math.min(ay, by, cy) < y0 - OWN_LOWER_M)) continue;
          if (Math.max(ax_, bx, cx) < gx0 || Math.min(ax_, bx, cx) > gx1 || Math.max(az, bz, cz) < gz0 || Math.min(az, bz, cz) > gz1) continue;
          if (Math.max(ay, by, cy) < yLo || Math.min(ay, by, cy) > yHi) continue;
          stamp(ax_, ay, az); stamp(bx, by, bz); stamp(cx, cy, cz);
          stamp((ax_ + bx) / 2, (ay + by) / 2, (az + bz) / 2); stamp((bx + cx) / 2, (by + cy) / 2, (bz + cz) / 2); stamp((cx + ax_) / 2, (cy + ay) / 2, (cz + az) / 2);
          stamp((ax_ + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3);
          // the cells whose middles it covers in plan, at its height there
          const det = (bz - cz) * (ax_ - cx) + (cx - bx) * (az - cz);
          if (Math.abs(det) < 1e-9) continue;
          const i0 = Math.max(0, Math.floor((Math.min(ax_, bx, cx) - gx0) / TOP_CELL_M)), i1 = Math.min(nx - 1, Math.floor((Math.max(ax_, bx, cx) - gx0) / TOP_CELL_M));
          const k0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - gz0) / TOP_CELL_M)), k1 = Math.min(nz - 1, Math.floor((Math.max(az, bz, cz) - gz0) / TOP_CELL_M));
          for (let kk = k0; kk <= k1; kk++) for (let ii = i0; ii <= i1; ii++) {
            const px = gx0 + (ii + 0.5) * TOP_CELL_M, pz = gz0 + (kk + 0.5) * TOP_CELL_M;
            const l1 = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / det, l2 = ((cz - az) * (px - cx) + (ax_ - cx) * (pz - cz)) / det, l3 = 1 - l1 - l2;
            if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
            stamp(px, l1 * ay + l2 * by + l3 * cy, pz);
          }
        }
      }
      hold?.prepare(x0, y0, z0, x1, y1, z1);
      let total = 0, free = 0, hw = 0, hx = 0, hz = 0, fw = 0, fx = 0, fz = 0, hy = 0;
      const heldFlags: boolean[] = [];
      for (let s = 0; s < samples.length; s += 4) {
        const x = samples[s]!, y = samples[s + 1]!, z = samples[s + 2]!, wt = samples[s + 3]!;
        total += wt;
        let held = groundAt(x, z) >= y - PERCH_BAND_M;
        if (!held) {
          const ci = Math.floor((x - gx0) / TOP_CELL_M), ck = Math.floor((z - gz0) / TOP_CELL_M);
          for (let dk = -1; dk <= 1 && !held; dk++) for (let di = -1; di <= 1 && !held; di++) {
            const i = ci + di, k = ck + dk;
            if (i >= 0 && k >= 0 && i < nx && k < nz && tops[k * nx + i]! >= y - PERCH_BAND_M) held = true;
          }
        }
        if (!held && hold) held = hold.held(x, y, z, PERCH_BAND_M);
        heldFlags.push(held);
        if (held) { hw += wt; hx += x * wt; hz += z * wt; hy += y * wt; } else { free += wt; fx += x * wt; fz += z * wt; fw += wt; }
      }
      if (!(total > 0) || free < PERCH_SHARE * total) {
        // (round 5) held now: its owner judges it again when what holds it may have gone
        if (watch && total > 0 && plateBody !== undefined) watch.push({ e, verts: Int32Array.from(list), tris: Int32Array.from(pieceTris), body: plateBody });
        continue;
      }
      // laid down: tilted off the edge of what holds it until its free side meets the ground, else lowered flat
      let tilted = false;
      if (hw >= 0.1 * total) {
        hx /= hw; hz /= hw; hy /= hw; fx /= fw; fz /= fw;
        let dx = fx - hx, dz = fz - hz;
        const dl = Math.hypot(dx, dz);
        if (dl > 0.05) {
          dx /= dl; dz /= dl;
          let edge = -Infinity;
          for (let s = 0, j = 0; s < samples.length; s += 4, j++) if (heldFlags[j]) edge = Math.max(edge, samples[s]! * dx + samples[s + 2]! * dz);
          let far = -Infinity;
          for (const i of list) far = Math.max(far, w[i * 3]! * dx + w[i * 3 + 2]! * dz);
          const L = far - edge;
          const hp = hx * dx + hz * dz;
          const px = hx + dx * (edge - hp), pz = hz + dz * (edge - hp), py = hy;
          // (turned about the edge until its lowest corner over the ground meets it: bisected, at most TILT_MAX)
          _pa.set(dz, 0, -dx);
          const clearance = (th: number): number => {
            _pq.setFromAxisAngle(_pa, th);
            let m = Infinity;
            for (const i of list) {
              _v.set(w[i * 3]! - px, w[i * 3 + 1]! - py, w[i * 3 + 2]! - pz).applyQuaternion(_pq);
              const c = _v.y + py - groundAt(_v.x + px, _v.z + pz);
              if (c < m) m = c;
            }
            return m;
          };
          let theta = Infinity;
          if (L >= 0.4 && clearance(TILT_MAX) <= 0.02) {
            let lo = 0, hi = TILT_MAX;
            for (let it = 0; it < 14; it++) { const mid = (lo + hi) / 2; if (clearance(mid) > 0.02) lo = mid; else hi = mid; }
            theta = hi;
          }
          if (theta <= TILT_MAX) {
            _pq.setFromAxisAngle(_pa, theta);
            for (const i of list) {
              _v.set(w[i * 3]! - px, w[i * 3 + 1]! - py, w[i * 3 + 2]! - pz).applyQuaternion(_pq);
              w[i * 3] = _v.x + px; w[i * 3 + 1] = _v.y + py; w[i * 3 + 2] = _v.z + pz;
              changed[i] = 1;
            }
            planGridMoved(grids[e], pieceTris);
            const nrm = d.geometry.getAttribute('normal') as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
            if (nrm) {
              if (d.matrix) { _nm.getNormalMatrix(d.matrix); _nmInv.copy(_nm).invert(); }
              for (const i of list) {
                _v.set(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
                if (d.matrix) _v.applyMatrix3(_nm);
                _v.applyQuaternion(_pq);
                if (d.matrix) _v.applyMatrix3(_nmInv);
                _v.normalize();
                nrm.setXYZ(i, _v.x, _v.y, _v.z);
              }
              if (nrm instanceof THREE.InterleavedBufferAttribute) nrm.data.needsUpdate = true; else nrm.needsUpdate = true;
            }
            tilted = true;
          }
        }
      }
      if (!tilted && !level) {
        // (round 6) a tilted plate held by nothing turns flat about its middle first (lowered as it lies, it would stand on
        // its low edge in the ground)
        _v.set(ax[0], ax[1], ax[2]);
        if (_v.y < 0) _v.negate();
        _pq.setFromUnitVectors(_v.normalize(), _UPV);
        for (const i of list) {
          _pc.set(w[i * 3]! - mx, w[i * 3 + 1]! - my, w[i * 3 + 2]! - mz).applyQuaternion(_pq);
          w[i * 3] = _pc.x + mx; w[i * 3 + 1] = _pc.y + my; w[i * 3 + 2] = _pc.z + mz;
          changed[i] = 1;
        }
        planGridMoved(grids[e], pieceTris);
        const nrm = d.geometry.getAttribute('normal') as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
        if (nrm) {
          if (d.matrix) { _nm.getNormalMatrix(d.matrix); _nmInv.copy(_nm).invert(); }
          for (const i of list) {
            _pc.set(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
            if (d.matrix) _pc.applyMatrix3(_nm);
            _pc.applyQuaternion(_pq);
            if (d.matrix) _pc.applyMatrix3(_nmInv);
            _pc.normalize();
            nrm.setXYZ(i, _pc.x, _pc.y, _pc.z);
          }
          if (nrm instanceof THREE.InterleavedBufferAttribute) nrm.data.needsUpdate = true; else nrm.needsUpdate = true;
        }
        y0 = Infinity;
        for (const i of list) if (w[i * 3 + 1]! < y0) y0 = w[i * 3 + 1]!;
      }
      if (!tilted) {
        const every = Math.max(1, Math.floor(list.length / 48)), gs: number[] = [groundAt(mx, mz)];
        for (let k = 0; k < list.length; k += every) { const i = list[k]!; gs.push(groundAt(w[i * 3]!, w[i * 3 + 2]!)); }
        gs.sort((a, b) => a - b);
        const g = gs[gs.length >> 1]!;
        if (!Number.isFinite(g) || !(g < y0)) continue;
        const dy = g + 0.02 - y0;
        for (const i of list) { w[i * 3 + 1] = w[i * 3 + 1]! + dy; changed[i] = 1; }
        planGridMoved(grids[e], pieceTris);
      }
      // (its lowest point as laid: what its body's other pieces read of it)
      let low = Infinity;
      for (const i of list) if (w[i * 3 + 1]! < low) low = w[i * 3 + 1]!;
      if (root >= 0) split[e]?.low.set(root, low);
      any = true;
      laid++;
    }
    if (!any) continue;
    if (d.matrix) _inv.copy(d.matrix).invert();
    for (let i = 0; i < pos.count; i++) {
      if (!changed[i]) continue;
      _v.set(w[i * 3]!, w[i * 3 + 1]!, w[i * 3 + 2]!);
      if (d.matrix) _v.applyMatrix4(_inv);
      pos.setXYZ(i, _v.x, _v.y, _v.z);
    }
    if (pos instanceof THREE.InterleavedBufferAttribute) pos.data.needsUpdate = true; else pos.needsUpdate = true;
    d.geometry.computeBoundingSphere();
    d.geometry.boundingBox = null;
  }
  return laid;
}
