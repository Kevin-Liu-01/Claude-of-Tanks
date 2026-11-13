// tools/whip-rods.mjs — the whip rods of one built tank, found by their geometry (267, Main 2026-10-31: "tag every
// remaining untagged whip rod with the antenna role ... finding them by geometry (thin tall rods on the roof)").
// A rod is one connected piece of a render node (corners welded by position, so caps join their tube) whose triangles
// lie along one axis: at least ROD_MIN_LENGTH_M long, within ROD_MAX_RADIUS_M of that axis, the axis within
// ROD_MAX_TILT_DEG of vertical, its foot at ROD_MIN_FOOT_Y_M or higher and its tip at ROD_MIN_TIP_Y_M or higher. A whip
// is a rod whose tip stands PROUD_MIN_M or more above every other surface within PROUD_REACH_M of it in plan (its own
// column aside: the collinear segments, tip and pot it is drawn in), or the mirror twin of one: rack uprights, slat
// bars, cage posts and discharger tubes end at a rail, a frame or a roof line beside them. A whip is tagged when the
// gate's body rule (tools/body-height-parts.mjs) sets it aside as an antenna: an antenna-tagged node, or the antenna
// seat role over all its triangles but a mount at its foot (MOUNT_M). NOT_WHIPS names the rods read and found not to be
// aerials. First-party tooling: Kevin B. Liu (NOTICE.md).
import { Matrix4, Vector3 } from 'three';
import { BODY_EXCLUDED_SEAT_ROLES, isAntennaTag, roofFittingTag } from './body-height-parts.mjs';

export const ROD_MIN_LENGTH_M = 0.5;
export const ROD_MAX_RADIUS_M = 0.04;
export const ROD_MAX_TILT_DEG = 50;
export const ROD_MIN_FOOT_Y_M = 0.8;
export const ROD_MIN_TIP_Y_M = 1.8;
export const PROUD_REACH_M = 0.5;
export const PROUD_MIN_M = 0.2;
export const MOUNT_M = 0.25;
const COLUMN_SLACK_M = 0.03;
const WELD_M = 1e-4;
const cutRoles = new Set(BODY_EXCLUDED_SEAT_ROLES);

/** Rods read in their builders and found not to be aerials: id -> [{ foot: [x, y, z] in the tank's frame (5 cm), why }]. */
export const NOT_WHIPS = Object.freeze({
  x1a2_carcara: Object.freeze([Object.freeze({ foot: [-0.06, 2.45, -0.32], why: "the commander's sight rod under its head (bernardiniX1.ts)" })]),
  challenger3_td: Object.freeze([Object.freeze({ foot: [-0.006, 2.011, -4.81], why: "the stern pole over the drums' cradle (challenger3Td.ts)" })]),
  challenger3_td_rws: Object.freeze([Object.freeze({ foot: [-0.006, 2.011, -4.81], why: "the stern pole over the drums' cradle (challenger3Td.ts)" })]),
  m60a3: Object.freeze([Object.freeze({ foot: [0.67, 2.682, -1.35],
    why: "the crosswind sensor's mast (pattonCast.ts), a sensor kept in the body" })]),
  merkava4_barak: Object.freeze([-1.025, 1.025].map((x) => Object.freeze({ foot: [x, 1.98, -3.57],
    why: "the basket's rear corner post under an aerial's collar (merkavaX.ts cageBar); the instanced aerials carry the role" }))),
});

/** The largest eigenvector of a symmetric 3x3 (power iteration; the rods' axis is far longer than their radius). */
function principalAxis(c) {
  let v = [0.3, 1, 0.2];
  for (let k = 0; k < 64; k++) {
    const w = [c[0] * v[0] + c[1] * v[1] + c[2] * v[2], c[1] * v[0] + c[3] * v[1] + c[4] * v[2], c[2] * v[0] + c[4] * v[1] + c[5] * v[2]];
    const n = Math.hypot(...w) || 1;
    v = w.map((x) => x / n);
  }
  return v[1] < 0 ? v.map((x) => -x) : v;
}

/** One render node's connected pieces: each { slots: triangle corner slots, points: Float64Array (its corners, x, y, z
 * in `root`'s frame), tris: Float64Array (9 per triangle, in `slots` order), box: [x0, y0, z0, x1, y1, z1] }. */
export function meshPieces(mesh, root) {
  const toRoot = new Matrix4().copy(root.matrixWorld).invert().multiply(mesh.matrixWorld);
  const position = mesh.geometry.getAttribute('position'), index = mesh.geometry.index;
  const n = index ? index.count : position.count, triangles = Math.floor(n / 3);
  const corner = (slot) => (index ? index.getX(slot) : slot);
  const key = new Map(), weld = new Int32Array(position.count), world = new Float64Array(position.count * 3), p = new Vector3();
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i);
    const k = `${Math.round(p.x / WELD_M)},${Math.round(p.y / WELD_M)},${Math.round(p.z / WELD_M)}`;
    if (!key.has(k)) key.set(k, key.size);
    weld[i] = key.get(k);
    p.applyMatrix4(toRoot);
    world[3 * i] = p.x; world[3 * i + 1] = p.y; world[3 * i + 2] = p.z;
  }
  const parent = new Int32Array(key.size).map((_, i) => i);
  const find = (a) => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
  for (let t = 0; t < triangles; t++) {
    const a = find(weld[corner(3 * t)]);
    for (let c = 1; c < 3; c++) { const b = find(weld[corner(3 * t + c)]); if (a !== b) parent[b] = a; }
  }
  const pieces = new Map();
  for (let t = 0; t < triangles; t++) {
    const r = find(weld[corner(3 * t)]);
    if (!pieces.has(r)) pieces.set(r, { slots: [], vertices: new Set() });
    const piece = pieces.get(r);
    piece.slots.push(3 * t);
    for (let c = 0; c < 3; c++) piece.vertices.add(corner(3 * t + c));
  }
  return [...pieces.values()].map(({ slots, vertices }) => {
    const points = new Float64Array(vertices.size * 3), tris = new Float64Array(slots.length * 9);
    const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    let j = 0;
    for (const i of vertices) {
      for (let a = 0; a < 3; a++) {
        const v = world[3 * i + a];
        points[j++] = v; box[a] = Math.min(box[a], v); box[a + 3] = Math.max(box[a + 3], v);
      }
    }
    slots.forEach((slot, s) => { for (let c = 0; c < 3; c++) for (let a = 0; a < 3; a++) tris[9 * s + 3 * c + a] = world[3 * corner(slot + c) + a]; });
    return { slots, points, tris, box };
  });
}

/** A piece's axis measure: { centre, axis, lo, hi, length, radius, tiltDeg, foot, tip } (foot and tip: the axis ends,
 * lower first; lo and hi: their axial coordinates from the centre). */
export function rodMeasure(points) {
  const m = [0, 0, 0], count = points.length / 3;
  for (let i = 0; i < points.length; i += 3) { m[0] += points[i]; m[1] += points[i + 1]; m[2] += points[i + 2]; }
  for (let a = 0; a < 3; a++) m[a] /= count;
  const c = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < points.length; i += 3) {
    const d = [points[i] - m[0], points[i + 1] - m[1], points[i + 2] - m[2]];
    c[0] += d[0] * d[0]; c[1] += d[0] * d[1]; c[2] += d[0] * d[2]; c[3] += d[1] * d[1]; c[4] += d[1] * d[2]; c[5] += d[2] * d[2];
  }
  const axis = principalAxis(c);
  let lo = Infinity, hi = -Infinity, radius = 0;
  for (let i = 0; i < points.length; i += 3) {
    const [s, r] = axial(points, i, m, axis);
    lo = Math.min(lo, s); hi = Math.max(hi, s); radius = Math.max(radius, r);
  }
  const end = (s) => [m[0] + s * axis[0], m[1] + s * axis[1], m[2] + s * axis[2]];
  return { centre: m, axis, lo, hi, length: hi - lo, radius, tiltDeg: Math.acos(Math.min(1, axis[1])) * 180 / Math.PI, foot: end(lo), tip: end(hi) };
}

/** Point `i` of `points` against an axis through `m`: [axial coordinate, distance from the axis]. */
function axial(points, i, m, axis) {
  const d0 = points[i] - m[0], d1 = points[i + 1] - m[1], d2 = points[i + 2] - m[2];
  const s = d0 * axis[0] + d1 * axis[1] + d2 * axis[2];
  return [s, Math.hypot(d0 - s * axis[0], d1 - s * axis[1], d2 - s * axis[2])];
}

export const isRod = (r) => r.length >= ROD_MIN_LENGTH_M && r.radius <= ROD_MAX_RADIUS_M && r.tiltDeg <= ROD_MAX_TILT_DEG
  && r.foot[1] >= ROD_MIN_FOOT_Y_M && r.tip[1] >= ROD_MIN_TIP_Y_M;

/** The highest point of triangle `t` (9 numbers from `i`) over the plan rectangle [x0, x1] x [z0, z1], or -Infinity:
 * the triangle clipped to it (a long rail's top counts over the rod beside it, not only at its far corners). */
function clippedTop(t, i, x0, x1, z0, z1) {
  let poly = [[t[i], t[i + 1], t[i + 2]], [t[i + 3], t[i + 4], t[i + 5]], [t[i + 6], t[i + 7], t[i + 8]]];
  for (const [a, bound, above] of [[0, x0, true], [0, x1, false], [2, z0, true], [2, z1, false]]) {
    const out = [];
    for (let k = 0; k < poly.length; k++) {
      const p = poly[k], q = poly[(k + 1) % poly.length];
      const inP = above ? p[a] >= bound : p[a] <= bound, inQ = above ? q[a] >= bound : q[a] <= bound;
      if (inP) out.push(p);
      if (inP !== inQ) { const s = (bound - p[a]) / (q[a] - p[a]); out.push([0, 1, 2].map((c) => p[c] + s * (q[c] - p[c]))); }
    }
    poly = out;
    if (!poly.length) return -Infinity;
  }
  return Math.max(...poly.map((p) => p[1]));
}

/** How far `rod`'s tip stands above every surface of `pieces` within PROUD_REACH_M of it in plan, the pieces of its own
 * column aside (every corner within its radius and COLUMN_SLACK_M of its axis line). */
export function proudness(rod, pieces) {
  const [tx, , tz] = rod.tip, x0 = tx - PROUD_REACH_M, x1 = tx + PROUD_REACH_M, z0 = tz - PROUD_REACH_M, z1 = tz + PROUD_REACH_M;
  let top = -Infinity;
  for (const piece of pieces) {
    const b = piece.box;
    if (b[0] > x1 || b[3] < x0 || b[2] > z1 || b[5] < z0 || b[4] <= top) continue;
    let column = true;
    for (let i = 0; i < piece.points.length && column; i += 3) if (axial(piece.points, i, rod.centre, rod.axis)[1] > rod.radius + COLUMN_SLACK_M) column = false;
    if (column) continue;
    for (let i = 0; i < piece.tris.length; i += 9) top = Math.max(top, clippedTop(piece.tris, i, x0, x1, z0, z1));
  }
  return rod.tip[1] - top;
}

/** Whether rods `a` and `b` (rodMeasures) are mirror twins: congruent, their feet mirrored across the centreline. */
export const mirrorTwins = (a, b) => Math.abs(a.length - b.length) <= 0.02 && Math.abs(a.radius - b.radius) <= 0.002
  && Math.abs(a.tiltDeg - b.tiltDeg) <= 2 && Math.abs(a.foot[0]) > 0.05 && Math.abs(a.foot[0] + b.foot[0]) <= 0.05
  && Math.abs(a.foot[1] - b.foot[1]) <= 0.03 && Math.abs(a.foot[2] - b.foot[2]) <= 0.05;

/** The NOT_WHIPS entry for `id` whose foot is `foot`'s, or null. */
export const notWhip = (id, foot) => (NOT_WHIPS[id] ?? []).find((n) => n.foot.every((v, a) => Math.abs(v - foot[a]) <= 0.05)) ?? null;

/** Every whip under `root` (its render nodes as `isRenderNode` names them): { mesh, path, tagged, tag, measure, proudM,
 * twin, triangles, slots }, `tagged` true when the body rule leaves the rod out as an antenna, its foot's mount aside.
 * `rods: true` lists every rod, `whip` saying which are whips. */
export function whipRods(root, { isRenderNode, rods: all = false }) {
  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverse((o) => { if (isRenderNode(o) && !o.isInstancedMesh) meshes.push({ mesh: o, pieces: meshPieces(o, root) }); });
  const every = meshes.flatMap(({ pieces }) => pieces), found = [];
  for (const { mesh: o, pieces } of meshes) {
    const tag = roofFittingTag(o, root) ?? (cutRoles.has(o.geometry.userData?.seatRole) ? `${o.geometry.userData.seatRole}:${o.name}` : null);
    const ranges = (o.userData?.seatRoleRanges ?? []).filter((r) => cutRoles.has(r.role));
    const inRange = (slot) => ranges.some((r) => slot >= r.start && slot < r.start + r.count);
    for (const piece of pieces) {
      const measure = rodMeasure(piece.points);
      if (!isRod(measure)) continue;
      const proudM = proudness(measure, every.filter((other) => other !== piece));
      let spanned = 0, mountTop = -Infinity;
      piece.slots.forEach((slot, s) => {
        if (inRange(slot)) { spanned++; return; }
        for (let c = 0; c < 3; c++) mountTop = Math.max(mountTop, axial(piece.tris, 9 * s + 3 * c, measure.centre, measure.axis)[0]);
      });
      const path = [];
      for (let p = o; p && p !== root; p = p.parent) path.unshift(p.name || p.type);
      found.push({ mesh: o, path: path.join('/'), tagged: tag ? isAntennaTag(tag) : spanned > 0 && mountTop - measure.lo <= MOUNT_M,
        tag: tag ?? (spanned ? `antennaSpan:${spanned}/${piece.slots.length}` : null), measure, proudM,
        triangles: piece.slots.length, slots: piece.slots });
    }
  }
  for (const rod of found) rod.whip = rod.proudM >= PROUD_MIN_M;
  for (const rod of found) rod.twin = !rod.whip && found.some((other) => other.whip && mirrorTwins(rod.measure, other.measure));
  for (const rod of found) rod.whip ||= rod.twin;
  return all ? found : found.filter((rod) => rod.whip);
}
