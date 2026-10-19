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
 * each way in its plane), standing 1.4 m and more — on its broad side where its foot stood: turned about its middle
 * so its thin axis is vertical, then lowered so its lowest point is where its lowest point was. Nothing else moves.
 * Visual only: it rewrites the geometry of a drawing that no longer moves (a baked heap, a body put to rest); the
 * simulation, its records and the collision never see it. Deterministic: the same drawing lays the same way.
 */
import * as THREE from 'three';

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

function find(parent: Int32Array, i: number): number {
  while (parent[i] !== i) { parent[i] = parent[parent[i]!]!; i = parent[i]!; }
  return i;
}

/** A drawing's connected pieces (corners welded at a millimetre, as the slab check splits them): each piece's vertices. */
function piecesOf(w: Float64Array, count: number, index: THREE.BufferAttribute | null): Map<number, number[]> {
  const weld = new Map<string, number>();
  const id = new Int32Array(count);
  let ids = 0;
  for (let i = 0; i < count; i++) {
    const key = `${Math.round(w[i * 3]! * 1000)},${Math.round(w[i * 3 + 1]! * 1000)},${Math.round(w[i * 3 + 2]! * 1000)}`;
    let k = weld.get(key);
    if (k === undefined) { k = ids++; weld.set(key, k); }
    id[i] = k;
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

/**
 * (round 4: the census's remnant piers standing 1-7 m over the building as it was drawn at their spot — a firestation's
 * steel stub, a stack's stump, a ruin's collapse stub over its banked heap) a standing remnant's pieces no taller than the
 * building was drawn where their tops stand: a piece whose top stands more than `marginM` over `topAt` there (world y; not
 * finite where the drawn form is not known: left alone) is squashed down about its foot to `marginM` over it. A piece
 * wholly over that height (a held storey's member: DESTRUCTION.md §3.4) is left alone. World-space geometry, in place.
 */
export function clampPieceTops(geometry: THREE.BufferGeometry, topAt: (x: number, z: number) => number, marginM = 0.5): number {
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
    if (!(y1 > cap + 0.05) || !(cap > y0 + 0.15)) continue;
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
export function layUprightPlates(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4 | null = null): number {
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
    const dy = y0 - ny0 + 0.02;
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
