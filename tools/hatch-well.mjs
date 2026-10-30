// Open hatches over capped rings (owner 2026-10-28: "fix all the issues where there is no space under hatches of
// cupolas on t72s and so on"). An open lid stands up beside its cupola or hatch ring; the opening it swung off must be a
// well, not the ring's closed top. This finds each open lid on a rigid owner (the turret with its gun at rest, or the hull
// without its running gear) and reads what lies under the footprint it would close over. First-party tooling:
// Kevin B. Liu (NOTICE.md).
//
// - Parts: each mesh's triangles grouped by shared vertex positions (0.1 mm), so every authored part is its own group.
// - An open LID is a thin plate (its thinnest principal extent <= LID_MAX_THICK_M, the other two LID_MIN_M..LID_MAX_M) at
//   least LID_MIN_TILT_DEG off flat, its lowest edge (the hinge) on something within HINGE_REACH_M.
// - Folded down about its hinge to either side it covers a footprint; a ray cast straight down there from above the
//   hinge meets the first surface. CAPPED: that surface stands within CAP_BAND_M of the hinge on a part that is not the
//   lid itself (the ring's closed top); WELL: it lies WELL_MIN_M or more under the hinge on that side.
// - A lid is reported CAPPED only when neither side opens into a well.
import * as THREE from 'three';
import { meshesUnder } from '../src/vehicles/gunHullClearance.test-support.mjs';

const RUNNING_GEAR = /track|wheel|sprocket|idler|roller|bogie|suspension|gear|tread|link/i;
export const LID_MAX_THICK_M = 0.10, LID_MIN_M = 0.25, LID_MAX_M = 0.95, LID_MIN_TILT_DEG = 55;
// armour add-ons (ERA, screens) are neither lids nor rings; a rotating weapon station's own drum is no crew hatch ring
const NOT_LID = /ExternalArmor|Era|era_|Cage|Slat|Skirt|Mudguard/i, NOT_RING = /ExternalArmor|Era|era_|Cage|Slat|_yaw|Rws|Remote|Station/i;
const HINGE_REACH_M = 0.08, CAP_BAND_M = 0.035, WELL_MIN_M = 0.06;

/** Parts of the owner's meshes in its own frame: { tri: Float64Array (9 per triangle), mesh, bucket }. */
function ownerParts(frame, meshes) {
  const inv = new THREE.Matrix4().copy(frame.matrixWorld).invert(), m = new THREE.Matrix4(), a = new THREE.Vector3();
  const parts = [];
  for (const mesh of meshes) {
    m.copy(inv).multiply(mesh.matrixWorld);
    const g = mesh.geometry, p = g.attributes.position, idx = g.index, { start, count } = g.drawRange;
    const n = Math.min(idx ? idx.count : p.count, start + count);
    const xyz = [], keyOf = [];
    for (let i = start; i < n; i++) {
      a.fromBufferAttribute(p, idx ? idx.getX(i) : i).applyMatrix4(m);
      xyz.push(a.x, a.y, a.z);
      keyOf.push(`${Math.round(a.x * 1e4)},${Math.round(a.y * 1e4)},${Math.round(a.z * 1e4)}`);
    }
    const tris = Math.floor(keyOf.length / 3), parent = Int32Array.from({ length: tris }, (_, i) => i);
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const owner = new Map();
    for (let t = 0; t < tris; t++) for (let v = 0; v < 3; v++) {
      const k = keyOf[t * 3 + v], o = owner.get(k);
      if (o === undefined) owner.set(k, t); else { const ra = find(o), rb = find(t); if (ra !== rb) parent[ra] = rb; }
    }
    const groups = new Map();
    for (let t = 0; t < tris; t++) { const r = find(t); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(t); }
    for (const list of groups.values()) {
      const tri = new Float64Array(list.length * 9);
      list.forEach((t, j) => { for (let k = 0; k < 9; k++) tri[j * 9 + k] = xyz[t * 9 + k]; });
      parts.push({ tri, mesh: mesh.name || '' });
    }
  }
  return parts;
}

/** Principal axes of a part's surface (area-weighted triangle centroids): centre, axes (largest first), extents. */
function principal(tri) {
  let w = 0; const c = [0, 0, 0], C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], pts = [];
  for (let o = 0; o < tri.length; o += 9) {
    const ux = tri[o + 3] - tri[o], uy = tri[o + 4] - tri[o + 1], uz = tri[o + 5] - tri[o + 2];
    const vx = tri[o + 6] - tri[o], vy = tri[o + 7] - tri[o + 1], vz = tri[o + 8] - tri[o + 2];
    const area = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2 + 1e-12;
    for (let v = 0; v < 3; v++) pts.push([tri[o + v * 3], tri[o + v * 3 + 1], tri[o + v * 3 + 2], area / 3]);
  }
  for (const [x, y, z, a] of pts) { c[0] += x * a; c[1] += y * a; c[2] += z * a; w += a; }
  for (let k = 0; k < 3; k++) c[k] /= w;
  for (const [x, y, z, a] of pts) { const d = [x - c[0], y - c[1], z - c[2]]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j] * a / w; }
  // Jacobi eigen-decomposition of the 3x3 covariance
  const A = C.map((r) => [...r]), V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 30; sweep++) for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
    if (Math.abs(A[p][q]) < 1e-14) continue;
    const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), cs = 1 / Math.sqrt(t * t + 1), sn = t * cs;
    for (let k = 0; k < 3; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = cs * akp - sn * akq; A[k][q] = sn * akp + cs * akq; }
    for (let k = 0; k < 3; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = cs * apk - sn * aqk; A[q][k] = sn * apk + cs * aqk; }
    for (let k = 0; k < 3; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = cs * vkp - sn * vkq; V[k][q] = sn * vkp + cs * vkq; }
  }
  const axes = [0, 1, 2].map((i) => ({ val: A[i][i], dir: [V[0][i], V[1][i], V[2][i]] })).sort((a, b) => b.val - a.val).map((e) => e.dir);
  const ext = axes.map((d) => { let lo = Infinity, hi = -Infinity; for (const [x, y, z] of pts) { const s = x * d[0] + y * d[1] + z * d[2]; lo = Math.min(lo, s); hi = Math.max(hi, s); } return hi - lo; });
  return { c, axes, ext, pts };
}

/** First surface under (x, z) from height `fromY`, skipping `skip` (a part): { y, part } or null. */
function downHit(parts, x, z, fromY, skip) {
  let best = null;
  for (const part of parts) {
    if (part === skip) continue;
    const t = part.tri;
    for (let o = 0; o < t.length; o += 9) {
      const ax = t[o], az = t[o + 2], bx = t[o + 3], bz = t[o + 5], cx = t[o + 6], cz = t[o + 8];
      const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(den) < 1e-12) continue;
      const w0 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / den, w1 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / den, w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const y = w0 * t[o + 1] + w1 * t[o + 4] + w2 * t[o + 7];
      if (y <= fromY && (!best || y > best.y)) best = { y, part };
    }
  }
  return best;
}

/** A round ring or drum (a cupola, a hatch ring): plan extents RING_MIN_M..RING_MAX_M, within RING_ROUND of each other,
 * no taller than RING_MAX_H_M. Its plan centre, radius and top. */
const RING_MIN_M = 0.30, RING_MAX_M = 1.20, RING_ROUND = 1.25, RING_MAX_H_M = 0.55;
function ringOf(part) {
  const t = part.tri; let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let o = 0; o < t.length; o += 3) {
    x0 = Math.min(x0, t[o]); x1 = Math.max(x1, t[o]); y0 = Math.min(y0, t[o + 1]); y1 = Math.max(y1, t[o + 1]); z0 = Math.min(z0, t[o + 2]); z1 = Math.max(z1, t[o + 2]);
  }
  const w = x1 - x0, d = z1 - z0, h = y1 - y0;
  if (w < RING_MIN_M || d < RING_MIN_M || w > RING_MAX_M || d > RING_MAX_M || Math.max(w, d) / Math.min(w, d) > RING_ROUND || h > RING_MAX_H_M) return null;
  return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, r: (w + d) / 4, top: y1, bottom: y0 };
}

/** The open lids on one owner, each paired with the cupola or hatch ring it opens off, and what lies in that ring:
 * WELL (the first surface down the ring's axis lies WELL_MIN_M or more under its top), CAPPED (within CAP_BAND_M of it). */
export function openLids(tank, ownerName) {
  tank.root.updateMatrixWorld(true);
  const hull = tank.root.getObjectByName('rig_hull'), turret = tank.root.getObjectByName('rig_turret');
  const frame = ownerName === 'turret' ? turret : hull;
  if (!frame) return [];
  let meshes = ownerName === 'turret' ? meshesUnder(turret) : meshesUnder(hull, turret ? [turret] : []);
  meshes = meshes.filter((m) => { for (let p = m; p && p !== frame; p = p.parent) if (RUNNING_GEAR.test(p.name || '')) return false; return true; });
  const parts = ownerParts(frame, meshes), rings = [], lids = [];
  for (const part of parts) { if (NOT_RING.test(part.mesh)) continue; const r = ringOf(part); if (r) rings.push({ ...r, part }); }
  for (const part of parts) {
    if (part.tri.length < 9 * 4 || NOT_LID.test(part.mesh)) continue;
    const { c, axes, ext } = principal(part.tri);
    const [, , nrm] = axes, [e0, e1, thick] = ext;
    if (thick > LID_MAX_THICK_M || e0 < LID_MIN_M || e1 < LID_MIN_M || e0 > LID_MAX_M) continue;
    const tilt = Math.acos(Math.min(1, Math.abs(nrm[1]))) * 180 / Math.PI;
    if (tilt < LID_MIN_TILT_DEG) continue;
    let minY = Infinity; const t = part.tri;
    for (let o = 1; o < t.length; o += 3) minY = Math.min(minY, t[o]);
    let hx = 0, hz = 0, hn = 0;
    for (let o = 0; o < t.length; o += 3) if (t[o + 1] < minY + 0.02) { hx += t[o]; hz += t[o + 2]; hn++; }
    hx /= hn; hz /= hn;
    // the ring it opens off: round, its top near the hinge, its rim within reach of the hinge in plan
    const ring = rings.filter((r) => r.part !== part && Math.abs(r.top - minY) <= 0.20 && Math.hypot(r.x - hx, r.z - hz) <= r.r + 0.35)
      .sort((a, b) => Math.hypot(a.x - hx, a.z - hz) - a.r - (Math.hypot(b.x - hx, b.z - hz) - b.r))[0];
    if (!ring) continue;
    const probes = [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]].map(([fx, fz]) => {
      const hit = downHit(parts, ring.x + fx * ring.r, ring.z + fz * ring.r, ring.top + 0.03, part);   // from just over the ring's top: gear on it is not its opening
      return hit ? ring.top - hit.y : null;
    });
    const drop = Math.min(...probes.filter((v) => v !== null));
    lids.push({
      owner: ownerName, mesh: part.mesh, centre: c.map((v) => +v.toFixed(3)), size: [+e0.toFixed(3), +e1.toFixed(3), +thick.toFixed(3)],
      tiltDeg: +tilt.toFixed(1), hinge: [+hx.toFixed(3), +minY.toFixed(3), +hz.toFixed(3)],
      ring: { x: +ring.x.toFixed(3), z: +ring.z.toFixed(3), r: +ring.r.toFixed(3), top: +ring.top.toFixed(3), mesh: ring.part.mesh },
      dropM: Number.isFinite(drop) ? +drop.toFixed(3) : null,
      verdict: drop >= WELL_MIN_M ? 'well' : drop <= CAP_BAND_M ? 'capped' : 'shallow',
    });
  }
  return lids;
}
