// Release 227: the main gun's clearance over its own hull, measured densely for any turreted vehicle (the CN lane's
// cnClearance check 1, generalised). Every visible mesh under rig_gun (the recoiling parts at recoil 0 and 0.135 m) is
// sampled every 15 mm and posed at a turret yaw and gun pitch; its distance is the true 3D distance to the nearest hull
// surface (every visible hull mesh outside rig_turret, nets included), not a vertical gap to upward faces
// (profiles/bradleyGunClearance.test-support.mjs). Gun samples inside the turret are not measured: those more than 6.5 cm
// inside the plan outline of the turret's body below the trunnion at their bearing (the turret covers them at every yaw).
// They are the breech and the mantlet's rear, which drop toward the hull roof at elevation through the ring opening and
// under the turret front (the T-72B3 turrets' gun mesh runs 1.07 m behind the trunnion; the procedural hull roof is
// closed there); nothing there can be seen. tools/gun-depression-sweep.mjs reads it to publish a gunPitchByYawDeg curve;
// nationalGunClearance.selftest.mjs asserts the curves with it. Pure geometry over Float64Array triangle soups.
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { getSpec } from './specs.ts';
import { minimumMechanicalGunPitch } from '../sim/gunPitchLimits.ts';

/** The clearance the gun keeps from its hull at every legal pose (cnClearance check 1). */
export const GUN_HULL_KEEP_M = .025;
/** The recoiling parts are measured in battery and at this stroke. */
const GUN_RECOIL_STROKES_M = [0, .135];
const DEG = Math.PI / 180;

/** Ericson's closest point on triangle T[o..o+8] to p, written into out. */
function closestOnTriangle(T, o, px, py, pz, out) {
  const ax = T[o], ay = T[o + 1], az = T[o + 2], bx = T[o + 3], by = T[o + 4], bz = T[o + 5], cx = T[o + 6], cy = T[o + 7], cz = T[o + 8];
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az, apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) { out[0] = ax; out[1] = ay; out[2] = az; return out; }
  const bpx = px - bx, bpy = py - by, bpz = pz - bz, d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) { out[0] = bx; out[1] = by; out[2] = bz; return out; }
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); out[0] = ax + v * abx; out[1] = ay + v * aby; out[2] = az + v * abz; return out; }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz, d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) { out[0] = cx; out[1] = cy; out[2] = cz; return out; }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); out[0] = ax + w * acx; out[1] = ay + w * acy; out[2] = az + w * acz; return out; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); out[0] = bx + w * (cx - bx); out[1] = by + w * (cy - by); out[2] = bz + w * (cz - bz); return out;
  }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  out[0] = ax + abx * v + acx * w; out[1] = ay + aby * v + acy * w; out[2] = az + abz * v + acz * w; return out;
}

/** Nearest-surface lookups against a fixed triangle soup within `rq`: a dense index of `cell`-metre cells over the soup's
 * box, each listing the triangles whose box (grown by rq) reaches it; `nearest` names the last query's triangle. */
class SurfaceGrid {
  constructor(tris, { cell = .05, rq = .065 } = {}) {
    this.tris = tris; this.cell = cell; this.rq = rq; this.nearest = -1; this.q = [0, 0, 0];
    const n = tris.length / 9, box = new Float64Array(n * 6), lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) {
      const a = tris[t * 9 + k], b = tris[t * 9 + 3 + k], c = tris[t * 9 + 6 + k];
      box[t * 6 + k] = Math.min(a, b, c) - rq; box[t * 6 + 3 + k] = Math.max(a, b, c) + rq;
      lo[k] = Math.min(lo[k], box[t * 6 + k]); hi[k] = Math.max(hi[k], box[t * 6 + 3 + k]);
    }
    if (!n) lo.fill(0), hi.fill(0);
    this.lo = lo; this.dims = [0, 1, 2].map((k) => Math.max(1, Math.ceil((hi[k] - lo[k]) / cell) + 1));
    const [nx, ny, nz] = this.dims, cells = nx * ny * nz;
    if (cells > 2e7) throw new RangeError(`surface grid of ${cells} cells`);
    const count = new Int32Array(cells + 1), span = (t, visit) => {
      const i0 = Math.floor((box[t * 6] - lo[0]) / cell), i1 = Math.floor((box[t * 6 + 3] - lo[0]) / cell);
      const j0 = Math.floor((box[t * 6 + 1] - lo[1]) / cell), j1 = Math.floor((box[t * 6 + 4] - lo[1]) / cell);
      const k0 = Math.floor((box[t * 6 + 2] - lo[2]) / cell), k1 = Math.floor((box[t * 6 + 5] - lo[2]) / cell);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) visit((i * ny + j) * nz + k);
    };
    for (let t = 0; t < n; t++) span(t, (c) => count[c + 1]++);
    for (let c = 0; c < cells; c++) count[c + 1] += count[c];
    const fill = count.slice(0, cells), list = new Int32Array(count[cells]);
    for (let t = 0; t < n; t++) span(t, (c) => { list[fill[c]++] = t; });
    this.start = count; this.list = list;
  }
  /** Distance from p to the nearest surface, or rq when none is within rq (this.nearest: its triangle, or -1). */
  distance(x, y, z) {
    const c = this.cell, [nx, ny, nz] = this.dims, i = Math.floor((x - this.lo[0]) / c), j = Math.floor((y - this.lo[1]) / c), k = Math.floor((z - this.lo[2]) / c);
    let best = this.rq; this.nearest = -1;
    if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return best;
    const cellIndex = (i * ny + j) * nz + k, end = this.start[cellIndex + 1];
    for (let e = this.start[cellIndex]; e < end; e++) {
      const t = this.list[e], r = closestOnTriangle(this.tris, t * 9, x, y, z, this.q), d = Math.hypot(r[0] - x, r[1] - y, r[2] - z);
      if (d < best) { best = d; this.nearest = t; }
    }
    return best;
  }
}

/** Dense surface samples of a triangle soup: every point of every triangle lies within h of a sample (rows parallel to
 * each triangle's longest edge, so a long sliver costs its area). */
function densePoints(tri, h) {
  const out = [];
  for (let t = 0; t < tri.length; t += 9) {
    let best = -1, k = 0;
    for (let e = 0; e < 3; e++) {
      const i = t + e * 3, j = t + ((e + 1) % 3) * 3, l = Math.hypot(tri[j] - tri[i], tri[j + 1] - tri[i + 1], tri[j + 2] - tri[i + 2]);
      if (l > best) { best = l; k = e; }
    }
    const ia = t + k * 3, ib = t + ((k + 1) % 3) * 3, ic = t + ((k + 2) % 3) * 3;
    const ax = tri[ia], ay = tri[ia + 1], az = tri[ia + 2], bx = tri[ib], by = tri[ib + 1], bz = tri[ib + 2], cx = tri[ic], cy = tri[ic + 1], cz = tri[ic + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az, wx = cx - ax, wy = cy - ay, wz = cz - az;
    const area2 = Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx), height = best > 1e-12 ? area2 / best : 0;
    const ns = Math.max(1, Math.ceil(height / h));
    for (let r = 0; r <= ns; r++) {
      const s = r / ns, p0x = ax + s * (cx - ax), p0y = ay + s * (cy - ay), p0z = az + s * (cz - az);
      const p1x = bx + s * (cx - bx), p1y = by + s * (cy - by), p1z = bz + s * (cz - bz);
      const m = Math.max(1, Math.ceil((1 - s) * best / h));
      for (let q = 0; q <= m; q++) { const f = q / m; out.push(p0x + f * (p1x - p0x), p0y + f * (p1y - p0y), p0z + f * (p1z - p0z)); }
    }
  }
  return new Float64Array(out);
}

/** The visible, non-shadow meshes under obj, none of them under an excluded node. */
function meshesUnder(obj, exclude = []) {
  const out = [];
  obj.traverse((o) => {
    if (!o.isMesh || /Shadow/.test(o.name) || o.userData.shadowOnly || o.userData.authoredShadowProxy) return;
    for (let p = o; p; p = p.parent) if (exclude.includes(p) || p.visible === false) return;
    out.push(o);
  });
  return out;
}
/** Triangles of meshes in the frame `frameInv` (frame inverse world), and each mesh's first triangle index. */
function meshTriangles(meshes, frameInv) {
  const out = [], starts = [], a = new THREE.Vector3(), m = new THREE.Matrix4();
  for (const mesh of meshes) {
    starts.push([out.length / 9, mesh]);
    m.copy(frameInv).multiply(mesh.matrixWorld);
    const p = mesh.geometry.attributes.position, idx = mesh.geometry.index, { start, count } = mesh.geometry.drawRange;
    const n = Math.min(idx ? idx.count : p.count, start + count);
    for (let i = start; i < n; i++) { a.fromBufferAttribute(p, idx ? idx.getX(i) : i).applyMatrix4(m); out.push(a.x, a.y, a.z); }
  }
  return { tri: new Float64Array(out), starts };
}
/** The triangles with a vertex (or box) inside the cylinder r <= reach round (cx, cz), y in [y0, y1]. */
function annulus(soup, cx, cz, reach, y0, y1) {
  const out = [], starts = []; let s = 0;
  const { tri } = soup;
  for (let t = 0; t < tri.length; t += 9) {
    while (s < soup.starts.length && soup.starts[s][0] * 9 <= t) { starts.push([out.length / 9, soup.starts[s][1]]); s++; }
    let lo = Infinity, hi = -Infinity, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let k = 0; k < 9; k += 3) {
      lo = Math.min(lo, tri[t + k + 1]); hi = Math.max(hi, tri[t + k + 1]);
      x0 = Math.min(x0, tri[t + k]); x1 = Math.max(x1, tri[t + k]); z0 = Math.min(z0, tri[t + k + 2]); z1 = Math.max(z1, tri[t + k + 2]);
    }
    if (hi < y0 || lo > y1 || Math.hypot(Math.max(x0 - cx, 0, cx - x1), Math.max(z0 - cz, 0, cz - z1)) > reach) continue;
    for (let k = 0; k < 9; k++) out.push(tri[t + k]);
  }
  return { tri: new Float64Array(out), starts };
}
/** The plan outline (turret frame, round the yaw axis) of the turret's body at or below `topY`, gun excluded: per
 * 1-degree bearing the farthest turret surface sample (2 cm), the smallest of that bearing and its two neighbours; 0
 * where a bearing has none. */
function turretOutline(turret, gun, topY) {
  const inv = new THREE.Matrix4().copy(turret.matrixWorld).invert(), { tri } = meshTriangles(meshesUnder(turret, [gun]), inv);
  const low = [];
  for (let t = 0; t < tri.length; t += 9) if (Math.min(tri[t + 1], tri[t + 4], tri[t + 7]) <= topY) for (let k = 0; k < 9; k++) low.push(tri[t + k]);
  const pts = densePoints(Float64Array.from(low), .02), reach = new Float64Array(360);
  for (let i = 0; i < pts.length; i += 3) {
    if (pts[i + 1] > topY) continue;
    const b = Math.floor(((Math.atan2(pts[i], pts[i + 2]) / DEG) + 360) % 360) % 360;
    reach[b] = Math.max(reach[b], Math.hypot(pts[i], pts[i + 2]));
  }
  return Float64Array.from(reach, (_, b) => Math.min(reach[(b + 359) % 360], reach[b], reach[(b + 1) % 360]));
}

/**
 * Build `id` (seed 4242, high quality, the geometry receipt's build) and measure its main gun over its hull. `distance(yaw,
 * pitch, stop, parts)` is the gun's smallest distance to the hull at that turret yaw and gun pitch (radians, pitch
 * positive up), every recoiling sample at each stroke; it returns as soon as it falls below `stop`. `parts` is 'all'
 * (default), 'barrel' (the recoiling parts) or 'mount' (the gun's fixed parts: mantlet, boot, sights). `part` names the
 * hull mesh nearest at the last call's minimum. `suit: false` leaves out the hull's camouflage suit (meshes named
 * *_ghillie_*), which ghillieSuit.ts cuts to the gun's own published stops. Dispose the probe when done.
 */
export function gunHullProbe(id, { suit = true } = {}) {
  const spec = getSpec(id);
  const tank = createTank(id, null, { proceduralOnly: true, quality: 'high', geometryReceipt: true, camoSeed: 4242 });
  tank.root.updateMatrixWorld(true);
  const turret = tank.root.getObjectByName('rig_turret'), gun = tank.root.getObjectByName('rig_gun'), recoil = tank.root.getObjectByName('rig_recoil');
  if (!turret || !gun || spec.armor?.turretless) { tank.dispose(); throw new Error(`${id}: no turret-borne gun to measure`); }
  // the poses below rebuild the turret's and the gun's local matrices from yaw and pitch alone
  if (gun.parent !== turret || gun.quaternion.angleTo(new THREE.Quaternion()) > 1e-9 || turret.quaternion.angleTo(new THREE.Quaternion()) > 1e-9
    || turret.scale.distanceTo(new THREE.Vector3(1, 1, 1)) > 1e-9
    || gun.scale.distanceTo(new THREE.Vector3(1, 1, 1)) > 1e-9) { tank.dispose(); throw new Error(`${id}: the gun is not a level, unscaled child of the turret`); }
  const hull = turret.parent, gInv = new THREE.Matrix4().copy(gun.matrixWorld).invert(), hInv = new THREE.Matrix4().copy(hull.matrixWorld).invert();
  const recoiling = new Set(); recoil?.traverse((o) => recoiling.add(o));
  const gunMeshes = meshesUnder(gun);
  const fixedTri = meshTriangles(gunMeshes.filter((m) => !recoiling.has(m)), gInv).tri, recoilTri = meshTriangles(gunMeshes.filter((m) => recoiling.has(m)), gInv).tri;
  const fixed = densePoints(fixedTri, .015), moving = densePoints(recoilTri, .015);
  // the gun's reach from the turret axis: its farthest point from the trunnion plus the trunnion's own offset
  let reach = 0;
  for (const T of [fixedTri, recoilTri]) for (let i = 0; i < T.length; i += 3) reach = Math.max(reach, Math.hypot(T[i], T[i + 1], T[i + 2]));
  reach += gun.position.length();
  const ring = turret.position, outline = turretOutline(turret, gun, gun.position.y);
  const hullMeshes = meshesUnder(hull, [turret]).filter((m) => suit || !/_ghillie_/.test(m.name));
  const soup = annulus(meshTriangles(hullMeshes, hInv), ring.x, ring.z, reach + .30, ring.y - .60, ring.y + .90);
  const grid = new SurfaceGrid(soup.tri, { cell: .05, rq: .065 });
  const partOf = (t) => { let name = null; for (const [s, mesh] of soup.starts) { if (s > t) break; name = mesh.name || mesh.parent?.name || '?'; } return name; };
  const unit = new THREE.Vector3(1, 1, 1), pq = new THREE.Quaternion(), e = new THREE.Euler(), P = new THREE.Matrix4(), v = new THREE.Vector3();
  const sources = { all: [[fixed, 0], ...GUN_RECOIL_STROKES_M.map((back) => [moving, back])] };
  sources.barrel = sources.all.slice(1); sources.mount = sources.all.slice(0, 1);
  // The gun's samples posed at one pitch in the turret's frame, those inside the turret dropped: they do not depend on the
  // yaw, so the scan's pitches are posed once (a small least-recently-used cache).
  const posedCache = new Map();
  const posed = (pitch, parts) => {
    const key = `${parts}:${pitch}`;
    let r = posedCache.get(key);
    if (r) { posedCache.delete(key); posedCache.set(key, r); return r; }
    P.compose(gun.position, pq.setFromEuler(e.set(-pitch, 0, 0)), unit);
    const xyz = [], src = [];
    sources[parts].forEach(([pts, back], g) => {
      for (let i = 0; i < pts.length; i += 3) {
        v.set(pts[i], pts[i + 1], pts[i + 2] - back).applyMatrix4(P);
        if (Math.hypot(v.x, v.z) < outline[Math.floor(((Math.atan2(v.x, v.z) / DEG) + 360) % 360) % 360] - grid.rq) continue;
        xyz.push(v.x, v.y, v.z); src.push(g, i);
      }
    });
    r = { xyz: Float32Array.from(xyz), src: Int32Array.from(src) };
    posedCache.set(key, r);
    if (posedCache.size > 40) posedCache.delete(posedCache.keys().next().value);
    return r;
  };
  let nearestTri = -1, witness = null;
  const distance = (yaw, pitch, stop = 0, parts = 'all') => {
    const { xyz, src } = posed(pitch, parts), c = Math.cos(yaw), s = Math.sin(yaw);
    let best = Infinity, at = -1; nearestTri = -1;
    for (let i = 0; i < xyz.length; i += 3) {
      const x = xyz[i], z = xyz[i + 2], d = grid.distance(ring.x + c * x + s * z, ring.y + xyz[i + 1], ring.z - s * x + c * z);
      if (d < best) { best = d; nearestTri = grid.nearest; at = i / 3; if (best < stop) break; }
    }
    witness = at < 0 ? null : [...sources[parts][src[at * 2]], src[at * 2 + 1]];
    return best;
  };
  return {
    id, spec, distance,
    /** The hull mesh nearest at the last call's minimum (null when nothing came within the grid's reach). */
    get part() { return nearestTri < 0 ? null : partOf(nearestTri); },
    /** The gun sample at the last call's minimum, in the gun's frame at rest (metres; z forward of the trunnion), and its
     * recoil stroke. */
    get witness() { return witness && { gun: [0, 1, 2].map((k) => +witness[0][witness[2] + k].toFixed(3)), stroke: witness[1] }; },
    depression: (spec.gunDepressionDeg ?? 0) * DEG, elevation: (spec.gunElevationDeg ?? 14) * DEG, outline,
    samples: fixed.length / 3 + moving.length / 3 * GUN_RECOIL_STROKES_M.length,
    dispose: () => tank.dispose(),
  };
}

/**
 * The gun's worst clearance over the hull at every whole degree of turret yaw, at that yaw's published depression stop,
 * at level (when the stop lies below it) and at full elevation. `curveSpec` supplies gunDepressionDeg and
 * gunPitchByYawDeg (pass the bare depression for the negative control); `partsAt(absoluteYawDeg)` picks the gun's parts
 * measured at a yaw (probe.distance), or null to pass the yaw by. Returns { d, yd (signed), pitch, part, parts }; stops
 * early below `stop`.
 */
export function gunHullSweep(probe, curveSpec, { stop = 0, partsAt = () => 'all' } = {}) {
  let worst = { d: Infinity };
  for (let yd = -179; yd <= 180; yd++) {
    const yaw = yd * DEG, lo = minimumMechanicalGunPitch(curveSpec, yaw), parts = partsAt(Math.abs(yd));
    if (!parts) continue;
    for (const pitch of lo < 0 ? [lo, 0, probe.elevation] : [lo, probe.elevation]) {
      const d = probe.distance(yaw, pitch, stop, parts);
      if (d < worst.d) worst = { d, yd, pitch, part: probe.part, parts };
      if (worst.d < stop) return worst;
    }
  }
  return worst;
}
