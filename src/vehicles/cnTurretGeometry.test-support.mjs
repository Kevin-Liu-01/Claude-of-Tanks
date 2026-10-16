// Release 227 CN track test support: built parts with their roles, contact between parts, and a nearest-surface grid for
// clearance sweeps. Pure geometry over Float64Array triangle soups (turret-local metres); no fleet builder imported here.
import * as THREE from 'three';

/** Ericson's closest point on triangle T[o..o+8] to p. */
export function closestOnTriangle(T, o, px, py, pz) {
  const ax = T[o], ay = T[o + 1], az = T[o + 2], bx = T[o + 3], by = T[o + 4], bz = T[o + 5], cx = T[o + 6], cy = T[o + 7], cz = T[o + 8];
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az, apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return [ax, ay, az];
  const bpx = px - bx, bpy = py - by, bpz = pz - bz, d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return [bx, by, bz];
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [ax + v * abx, ay + v * aby, az + v * abz]; }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz, d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return [cx, cy, cz];
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [ax + w * acx, ay + w * acy, az + w * acz]; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return [bx + w * (cx - bx), by + w * (cy - by), bz + w * (cz - bz)]; }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return [ax + abx * v + acx * w, ay + aby * v + acy * w, az + abz * v + acz * w];
}

function segmentCrosses(T, o, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const e1x = T[o + 3] - T[o], e1y = T[o + 4] - T[o + 1], e1z = T[o + 5] - T[o + 2], e2x = T[o + 6] - T[o], e2y = T[o + 7] - T[o + 1], e2z = T[o + 8] - T[o + 2];
  const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x, det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-14) return false;
  const inv = 1 / det, tx = ax - T[o], ty = ay - T[o + 1], tz = az - T[o + 2], u = (tx * px + ty * py + tz * pz) * inv;
  if (u < 0 || u > 1) return false;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < 0 || u + v > 1) return false;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv; return t >= 0 && t <= 1;
}

/** A part from the factory's part census: its triangles (owner-local) and box. */
export function censusPart(bucket, g) {
  const p = g.attributes.position, idx = g.index, n = idx ? idx.count : p.count, tri = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) { const k = idx ? idx.getX(i) : i; tri[i * 3] = p.getX(k); tri[i * 3 + 1] = p.getY(k); tri[i * 3 + 2] = p.getZ(k); }
  const box = new THREE.Box3(); const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) box.expandByPoint(v.set(tri[i * 3], tri[i * 3 + 1], tri[i * 3 + 2]));
  return { bucket, role: g.userData?.chineseModernization?.role ?? null,
    era: Array.isArray(g.userData?.eraHitFaceVertexStarts) || g.userData?.seatRole === 'era', tri, box };
}

function samplesOf(P) {
  if (P.samples) return P.samples;
  const out = Array.from(P.tri);
  for (let t = 0; t < P.tri.length; t += 9) for (const [u, v, w] of [[1 / 3, 1 / 3, 1 / 3], [.5, .5, 0], [0, .5, .5], [.5, 0, .5]])
    for (let k = 0; k < 3; k++) out.push(P.tri[t + k] * u + P.tri[t + 3 + k] * v + P.tri[t + 6 + k] * w);
  return (P.samples = Float64Array.from(out));
}
function crosses(A, B) {
  for (let a = 0; a < A.tri.length; a += 9) for (const [i, j] of [[0, 3], [3, 6], [6, 0]]) {
    const ax = A.tri[a + i], ay = A.tri[a + i + 1], az = A.tri[a + i + 2], bx = A.tri[a + j], by = A.tri[a + j + 1], bz = A.tri[a + j + 2];
    if (Math.max(ax, bx) < B.box.min.x || Math.min(ax, bx) > B.box.max.x || Math.max(ay, by) < B.box.min.y || Math.min(ay, by) > B.box.max.y
      || Math.max(az, bz) < B.box.min.z || Math.min(az, bz) > B.box.max.z) continue;
    for (let t = 0; t < B.tri.length; t += 9) if (segmentCrosses(B.tri, t, ax, ay, az, bx, by, bz)) return true;
  }
  return false;
}
/** The gap between two parts (0 when an edge of one passes through a face of the other), capped at `cap`. */
export function partGap(A, B, cap = .05) {
  if (crosses(A, B) || crosses(B, A)) return 0;
  let best = cap;
  for (const [P, Q] of [[A, B], [B, A]]) {
    const S = samplesOf(P);
    for (let i = 0; i < S.length; i += 3) {
      const x = S[i], y = S[i + 1], z = S[i + 2];
      if (x < Q.box.min.x - best || x > Q.box.max.x + best || y < Q.box.min.y - best || y > Q.box.max.y + best || z < Q.box.min.z - best || z > Q.box.max.z + best) continue;
      for (let t = 0; t < Q.tri.length; t += 9) { const c = closestOnTriangle(Q.tri, t, x, y, z); const d = Math.hypot(c[0] - x, c[1] - y, c[2] - z); if (d < best) best = d; }
    }
  }
  return best;
}

/** Nearest-surface lookups against a fixed triangle soup within `rq` (cells of `cell` m). */
export class SurfaceGrid {
  constructor(tris, { cell = .05, rq = .06 } = {}) {
    this.tris = tris; this.cell = cell; this.rq = rq; this.map = new Map();
    const c = (v) => Math.floor(v / cell);
    for (let t = 0; t < tris.length / 9; t++) {
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      for (let k = 0; k < 3; k++) { const x = tris[t * 9 + k * 3], y = tris[t * 9 + k * 3 + 1], z = tris[t * 9 + k * 3 + 2];
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      for (let i = c(x0 - rq); i <= c(x1 + rq); i++) for (let j = c(y0 - rq); j <= c(y1 + rq); j++) for (let k = c(z0 - rq); k <= c(z1 + rq); k++) {
        const key = (i + 2000) * 16000000 + (j + 2000) * 4000 + (k + 2000);
        let arr = this.map.get(key); if (!arr) this.map.set(key, arr = []); arr.push(t);
      }
    }
  }
  /** Distance from p to the nearest surface, or rq when none is within rq. */
  distance(x, y, z) {
    const c = this.cell, arr = this.map.get((Math.floor(x / c) + 2000) * 16000000 + (Math.floor(y / c) + 2000) * 4000 + (Math.floor(z / c) + 2000));
    let best = this.rq; if (!arr) return best;
    for (const t of arr) { const r = closestOnTriangle(this.tris, t * 9, x, y, z); const d = Math.hypot(r[0] - x, r[1] - y, r[2] - z); if (d < best) best = d; }
    return best;
  }
}

/** Triangles of meshes in the frame `frameInv` (Matrix4: frame inverse world). */
export function meshTriangles(meshes, frameInv) {
  const out = [], a = new THREE.Vector3(), m = new THREE.Matrix4();
  for (const mesh of meshes) {
    m.copy(frameInv).multiply(mesh.matrixWorld);
    const p = mesh.geometry.attributes.position, idx = mesh.geometry.index, n = idx ? idx.count : p.count;
    for (let i = 0; i < n; i++) { a.fromBufferAttribute(p, idx ? idx.getX(i) : i).applyMatrix4(m); out.push(a.x, a.y, a.z); }
  }
  return new Float64Array(out);
}
/** Vertices (and triangle centroids) of meshes in the frame `frameInv`, optionally filtered. */
export function meshPoints(meshes, frameInv, keep = () => true) {
  const out = [], a = new THREE.Vector3(), m = new THREE.Matrix4();
  for (const mesh of meshes) {
    m.copy(frameInv).multiply(mesh.matrixWorld);
    const p = mesh.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { a.fromBufferAttribute(p, i).applyMatrix4(m); if (keep(a)) out.push(a.x, a.y, a.z); }
  }
  return new Float64Array(out);
}
