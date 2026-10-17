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

// ---- Round 2 (2026-10-16): the seating, penetration and z-fight census, and the dense two-way sweeps.

/** Dense surface samples of a triangle soup: every vertex plus a barycentric grid with spacing <= h. */
export function densePoints(tri, h = .01) {
  const out = [];
  for (let t = 0; t < tri.length; t += 9) {
    const ax = tri[t], ay = tri[t + 1], az = tri[t + 2], bx = tri[t + 3], by = tri[t + 4], bz = tri[t + 5], cx = tri[t + 6], cy = tri[t + 7], cz = tri[t + 8];
    const l = Math.max(Math.hypot(bx - ax, by - ay, bz - az), Math.hypot(cx - ax, cy - ay, cz - az), Math.hypot(cx - bx, cy - by, cz - bz));
    const n = Math.max(1, Math.ceil(l / h));
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
      const u = i / n, v = j / n, w = 1 - u - v;
      out.push(ax * w + bx * u + cx * v, ay * w + by * u + cy * v, az * w + bz * u + cz * v);
    }
  }
  return new Float64Array(out);
}

/** Is p inside the closed soup B (ray parity along a slightly skewed +X ray)? */
export function insideClosed(B, x, y, z) {
  let n = 0; const dx = 1, dy = 1.3e-4, dz = 2.1e-4, T = B.tri;
  for (let t = 0; t < T.length; t += 9) {
    const e1x = T[t + 3] - T[t], e1y = T[t + 4] - T[t + 1], e1z = T[t + 5] - T[t + 2], e2x = T[t + 6] - T[t], e2y = T[t + 7] - T[t + 1], e2z = T[t + 8] - T[t + 2];
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x, det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-14) continue;
    const inv = 1 / det, tx = x - T[t], ty = y - T[t + 1], tz = z - T[t + 2], u = (tx * px + ty * py + tz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < 0 || u + v > 1) continue;
    if ((e2x * qx + e2y * qy + e2z * qz) * inv > 0) n++;
  }
  return n % 2 === 1;
}

/** How deep A's surface goes inside the closed part B: the largest distance from a dense sample of A lying inside B to
 * B's surface (0 when nothing of A is inside B). */
export function penetrationDepth(A, B, h = .008) {
  const S = A.dense ??= densePoints(A.tri, h), bx = B.box;
  let best = 0;
  for (let i = 0; i < S.length; i += 3) {
    const x = S[i], y = S[i + 1], z = S[i + 2];
    if (x <= bx.min.x || x >= bx.max.x || y <= bx.min.y || y >= bx.max.y || z <= bx.min.z || z >= bx.max.z) continue;
    if (!insideClosed(B, x, y, z)) continue;
    let d = Infinity;
    for (let t = 0; t < B.tri.length; t += 9) { const c = closestOnTriangle(B.tri, t, x, y, z); d = Math.min(d, Math.hypot(c[0] - x, c[1] - y, c[2] - z)); if (d <= best) break; }
    if (d > best) best = d;
  }
  return best;
}

function triFrame(T, t) {
  const ux = T[t + 3] - T[t], uy = T[t + 4] - T[t + 1], uz = T[t + 5] - T[t + 2], vx = T[t + 6] - T[t], vy = T[t + 7] - T[t + 1], vz = T[t + 8] - T[t + 2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const a = Math.hypot(nx, ny, nz);
  if (a < 1e-10) return null; nx /= a; ny /= a; nz /= a;
  return { nx, ny, nz, d: nx * T[t] + ny * T[t + 1] + nz * T[t + 2], area: a / 2 };
}
function inTriangle(T, t, px, py, pz, n) { // p (already on the plane) inside triangle t?
  const s = (ax, ay, az, bx, by, bz) => { const cx = (by - ay) * (pz - az) - (bz - az) * (py - ay), cy = (bz - az) * (px - ax) - (bx - ax) * (pz - az), cz = (bx - ax) * (py - ay) - (by - ay) * (px - ax); return cx * n.nx + cy * n.ny + cz * n.nz; };
  const a = s(T[t], T[t + 1], T[t + 2], T[t + 3], T[t + 4], T[t + 5]), b = s(T[t + 3], T[t + 4], T[t + 5], T[t + 6], T[t + 7], T[t + 8]), c = s(T[t + 6], T[t + 7], T[t + 8], T[t], T[t + 1], T[t + 2]);
  return (a > 1e-9 && b > 1e-9 && c > 1e-9) || (a < -1e-9 && b < -1e-9 && c < -1e-9);
}
/** Same-facing coplanar faces of two parts that overlap (z-fighting): area (m^2) of A's faces lying within `tol` of a
 * parallel, same-facing face of B with A's sample points inside B's triangle. Opposite-facing coplanar faces are two
 * parts resting face to face (both hidden) and do not count. */
export function coplanarOverlap(A, B, tol = .002, isHidden = () => false) {
  let area = 0; const T = A.tri, U = B.tri;
  const ub = []; for (let s = 0; s < U.length; s += 9) ub.push(triFrame(U, s));
  for (let t = 0; t < T.length; t += 9) {
    const f = triFrame(T, t); if (!f || f.area < 2e-5) continue;
    for (let s = 0, k = 0; s < U.length; s += 9, k++) {
      const g = ub[k]; if (!g) continue;
      if (f.nx * g.nx + f.ny * g.ny + f.nz * g.nz < .9995 || Math.abs(f.d - g.d) > tol) continue;
      // centroid and edge midpoints of A's face, inside B's face?
      let hits = 0;
      for (const [u, v, w] of [[1 / 3, 1 / 3, 1 / 3], [.5, .5, 0], [0, .5, .5], [.5, 0, .5], [.7, .15, .15], [.15, .7, .15], [.15, .15, .7]]) {
        const px = T[t] * u + T[t + 3] * v + T[t + 6] * w, py = T[t + 1] * u + T[t + 4] * v + T[t + 7] * w, pz = T[t + 2] * u + T[t + 5] * v + T[t + 8] * w;
        if (inTriangle(U, s, px, py, pz, g) && !isHidden(px, py, pz)) hits++;
      }
      if (hits) area += f.area * hits / 7;
    }
  }
  return area;
}

/** The seating census of tagged add-on parts against their owner's stock (one owner's census parts, owner-local):
 *  - FLOAT: every tagged part reaches untagged permanent stock through a chain of parts in contact (gap <= 2 mm); a
 *    chain passes from a reactive cassette only to that cassette's own pieces, never on to permanent parts, so parts
 *    touching only each other (or only ERA) float together;
 *  - ON-ERA: no tagged permanent part rests on ERA alone;
 *  - CROSS: no tagged part goes deeper into another part (untagged, or tagged with another role) than the pair's burial
 *    allowance, either way round (feet 6 mm, welded housing roots, struts ending 30 mm inside, a thin part's own radius);
 *  - ERA-OVERLAP: no two separate reactive cassettes cross, whatever their roles;
 *  - ZFIGHT: no visible same-facing coplanar overlap between faces of different materials (a face lying inside a third
 *    part touching either is hidden);
 *  - SLOT: no air slot under `slotM` (2 mm < gap < slotM) between two pieces of armour (shell, permanent external armour),
 *    at least one of them tagged, nor under `eraSlotM` between two separate reactive cassettes. A cassette's standoff
 *    over its own receiver (its seat pad fills the gap) is by design.
 * Returns the list of problems (strings). */
export function seatingCensus(parts, { allowance = () => .010, slotM = .015, eraSlotM = .010, family = (role) => role } = {}) {
  const problems = [], P = parts;
  const near = (a, b, e) => a.box.min.x - e <= b.box.max.x && a.box.max.x + e >= b.box.min.x && a.box.min.y - e <= b.box.max.y && a.box.max.y + e >= b.box.min.y
    && a.box.min.z - e <= b.box.max.z && a.box.max.z + e >= b.box.min.z;
  const vol = (p) => { const s = p.box.getSize(new THREE.Vector3()); return s.x * s.y * s.z; };
  const sameCassette = (a, b) => { const [small, big] = vol(a) < vol(b) ? [a, b] : [b, a]; return big.box.clone().expandByScalar(.015).containsPoint(small.box.getCenter(new THREE.Vector3())); };
  const armour = (p) => p.era || p.bucket === 'turret' || p.bucket === 'turretExternalArmor' || p.bucket === 'hullExternalArmor';
  const label = (p) => `${p.role ?? p.bucket}${p.era ? '/ERA' : ''}[${p.box.min.toArray().map((v) => v.toFixed(3))}..${p.box.max.toArray().map((v) => v.toFixed(3))}]`;
  const adj = new Map(P.map((p) => [p, []])), pairs = [];
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
    const A = P[i], B = P[j], tagged = Boolean(A.role || B.role);
    if (!near(A, B, tagged ? slotM : .003)) continue;
    const g = partGap(A, B, tagged ? slotM : .003);
    if (g <= .002) { adj.get(A).push(B); adj.get(B).push(A); }
    if (tagged) pairs.push([A, B, g]);
  }
  const hidden = (A, B, x, y, z) => [...adj.get(A), ...adj.get(B)].some((q) => q !== A && q !== B && q.box.containsPoint(new THREE.Vector3(x, y, z)) && insideClosed(q, x, y, z));
  for (const [A, B, g] of pairs) {
    const same = Boolean(A.role && B.role && family(A.role) === family(B.role)), cassettes = A.era && B.era;
    if (g === 0) {
      if (cassettes && !sameCassette(A, B)) problems.push(`ERA-OVERLAP ${label(A)} x ${label(B)}`);
      else if (!same && !cassettes) {
        const allow = Math.max(A.role ? allowance(A, B) : 0, B.role ? allowance(B, A) : 0), d = Math.max(penetrationDepth(A, B), penetrationDepth(B, A));
        if (d > allow + 1e-4) problems.push(`CROSS ${(d * 1000).toFixed(1)} mm (allowed ${(allow * 1000).toFixed(0)}) ${label(A)} x ${label(B)}`);
      }
    } else if (g > .002 && g < (cassettes ? eraSlotM : slotM) && armour(A) && armour(B) && (cassettes ? !sameCassette(A, B) : !(A.era || B.era)))
      problems.push(`SLOT ${(g * 1000).toFixed(1)} mm ${label(A)} ~ ${label(B)}`);
    if (g <= .002 && A.bucket !== B.bucket) {
      const a = Math.max(coplanarOverlap(A, B, .002, (x, y, z) => hidden(A, B, x, y, z)), coplanarOverlap(B, A, .002, (x, y, z) => hidden(A, B, x, y, z)));
      if (a > 2e-4) problems.push(`ZFIGHT ${(a * 1e4).toFixed(1)} cm2 ${label(A)} | ${label(B)}`);
    }
  }
  const seen = new Set(P.filter((p) => !p.role && !p.era)), queue = [...seen];
  while (queue.length) { const p = queue.shift(); for (const q of adj.get(p)) if (!seen.has(q) && (!p.era || (q.era && sameCassette(p, q)))) { seen.add(q); queue.push(q); } }
  for (const p of P.filter((q) => q.role)) {
    if (!seen.has(p)) problems.push(`FLOAT ${label(p)}: no chain of contacts to permanent stock`);
    else if (!p.era && adj.get(p).length && adj.get(p).every((q) => q.era)) problems.push(`ON-ERA ${label(p)}: rests on removable ERA alone`);
  }
  return problems;
}

// ---- M1 (2026-10-17): the sight fields. An aperture's field is its glass rectangle swept `depth` metres along its
// outward normal (+Z for every CN sight), its sides widening `azimuthDeg` each way, its bottom falling `downDeg` and its
// top rising `upDeg`. Only the parts a kit adds are tested against it.
const SIGHT_FIELD = { depth: 3.0, azimuthDeg: 8, downDeg: 2, upDeg: 8 };

/** The field of a forward-facing glass part (census part or box): {x0, x1, y0, y1, z} at its front face. */
export function sightField(glass, offset = [0, 0, 0]) {
  const b = glass.box ?? glass;
  return { x0: b.min.x + offset[0], x1: b.max.x + offset[0], y0: b.min.y + offset[1], y1: b.max.y + offset[1], z: b.max.z + offset[2] };
}

/** Is p inside the field f? */
export function inSightField(f, x, y, z, field = SIGHT_FIELD) {
  const d = z - f.z;
  if (d < 0 || d > field.depth) return false;
  const a = d * Math.tan(field.azimuthDeg * Math.PI / 180);
  return x >= f.x0 - a && x <= f.x1 + a && y >= f.y0 - d * Math.tan(field.downDeg * Math.PI / 180) && y <= f.y1 + d * Math.tan(field.upDeg * Math.PI / 180);
}

/** Every part whose box reaches the field's bounding region, with its worst sample's margin m (dense surface samples at
 * `h`): m >= 0 is an intrusion that deep inside the field's nearest side, bottom or top; m < 0 is a clearance of at least
 * -m (the largest side-wise violation of its closest sample). */
export function sightFieldApproach(parts, f, { h = .008, field = SIGHT_FIELD } = {}) {
  const out = [], tA = Math.tan(field.azimuthDeg * Math.PI / 180), tD = Math.tan(field.downDeg * Math.PI / 180), tE = Math.tan(field.upDeg * Math.PI / 180);
  const reach = field.depth * Math.max(tA, tE) + .05;
  for (const p of parts) {
    const b = p.box;
    if (b.max.z < f.z || b.min.z > f.z + field.depth || b.max.x < f.x0 - reach || b.min.x > f.x1 + reach || b.max.y < f.y0 - reach || b.min.y > f.y1 + reach) continue;
    const S = p.dense ??= densePoints(p.tri, h);
    let worst = -Infinity;
    for (let i = 0; i < S.length; i += 3) {
      const x = S[i], y = S[i + 1], z = S[i + 2], d = z - f.z;
      if (d < 0 || d > field.depth) continue;
      const m = Math.min(x - (f.x0 - d * tA), f.x1 + d * tA - x, y - (f.y0 - d * tD), f.y1 + d * tE - y);
      if (m > worst) worst = m;
    }
    if (Number.isFinite(worst)) out.push({ part: p, m: worst });
  }
  return out;
}

/** The parts with a point in the field, each with its worst intrusion (m). */
export function sightFieldIntrusions(parts, f, options) {
  return sightFieldApproach(parts, f, options).filter((a) => a.m >= 0).map((a) => ({ part: a.part, intrusion: a.m }));
}
