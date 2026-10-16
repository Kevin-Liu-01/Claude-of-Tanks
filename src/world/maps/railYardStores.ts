// src/world/maps/railYardStores.ts — the rail yard's stores in their members (Lane C, #24 r2, 2026-10-14).
//
// The census graded the yard's cable drums and sleeper stacks 0: a drum was one solid cylinder, a stack six planks in a
// crib. A cable drum is a reel: two plank flanges with their arbor holes, the barrel between them, the cable wound on it
// (a reel part paid out shows the barrel's lagging) and its loose end run down to the ground; a sleeper stack is the
// permanent way's store, creosoted sleepers laid close in courses crossing each other, the top course part taken.
// Vertex-coloured for the props' baked bucket (the rolling stock's paint: no draw). Each takes the draws the old piece
// did (passed as unit values), so the yard's stream keeps its place.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bevelBox } from './bevelBox.ts';

type BG = THREE.BufferGeometry;
const _c = new THREE.Color();
function rgb(hex: number): [number, number, number] { _c.setHex(hex); return [_c.r, _c.g, _c.b]; }
function hash(i: number, salt: number): number {
  let h = Math.imul((i * 7919 + salt) ^ 0x9e3779b9, 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function paint(g: BG, tone: readonly number[], grain: number, salt: number): BG {
  const n = g.attributes.position.count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const s = 1 - grain * 0.5 + grain * hash(i, salt);
    c[i * 3] = tone[0] * s; c[i * 3 + 1] = tone[1] * s; c[i * 3 + 2] = tone[2] * s;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
function bleachTops(g: BG): BG {
  const n = g.attributes.normal, c = g.attributes.color;
  for (let i = 0; i < n.count; i++) if (n.getY(i) > 0.5) c.setXYZ(i, c.getX(i) * 1.45, c.getY(i) * 1.42, c.getZ(i) * 1.38);
  return g;
}
function merged(parts: BG[]): BG {
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!g) throw new Error('railYardStores: pieces do not merge');
  return g;
}

const FLANGE = rgb(0x6e5538), FLANGE_DARK = rgb(0x4a3a28), BARREL = rgb(0x8a7454), CABLE = rgb(0x1d1d1e), ARBOR = rgb(0x2e2a26),
  CREOSOTE = rgb(0x3a3027), CREOSOTE_WORN = rgb(0x5c5143);
const ARBOR_R = 0.09;

/** The geometry turned inside out: its faces wound and its normals pointing the other way (a bore's lining). */
function inward(g: BG): BG {
  const ix = g.index!, n = g.attributes.normal;
  for (let i = 0; i < ix.count; i += 3) { const b = ix.getX(i + 1); ix.setX(i + 1, ix.getX(i + 2)); ix.setX(i + 2, b); }
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return g;
}
/** A disc of radius `r` and `thick` (its axis y) with a hole of radius `hole` bored through it: its rim and two faces. */
function ringFlange(r: number, hole: number, thick: number, seg: number): BG {
  const rim = new THREE.CylinderGeometry(r, r, thick, seg, 1, true);
  const faces = [1, -1].map((s) => new THREE.RingGeometry(hole, r, seg, 1).rotateX(-s * Math.PI / 2).translate(0, s * thick / 2, 0));
  const g = mergeGeometries([rim, ...faces], false);
  rim.dispose(); for (const f of faces) f.dispose();
  if (!g) throw new Error('railYardStores: the flange does not merge');
  return g;
}

/**
 * A cable drum of flange radius `radius` standing on its flanges at the origin (its axle along x before `yaw`), from
 * the old drum's four UV-jitter draws `v`: how much cable is left, the flanges' tone, the loose end's lie.
 */
export function cableDrum(radius: number, yaw: number, v: readonly number[]): BG {
  const [left, tone, lie, salt] = v;
  const W = radius * 1.1, R = radius, parts: BG[] = [];
  const axle = (g: BG) => { g.rotateZ(Math.PI / 2); g.translate(0, R, 0); return g; };
  const flangeTone = tone < 0.5 ? FLANGE : FLANGE_DARK;
  // (props r2, Lane C 2026-10-16: the arbor holes were dark discs stuck on the flanges, painted plates) each flange a
  // plank disc with its arbor hole bored through, the hole lined by the steel arbor tube that runs the reel's width
  for (const sx of [-1, 1]) parts.push(paint(axle(ringFlange(R, ARBOR_R, 0.07, 18)).translate(sx * (W / 2 - 0.035), 0, 0), flangeTone, 0.3, 61 + sx));
  parts.push(paint(axle(inward(new THREE.CylinderGeometry(ARBOR_R, ARBOR_R, W + 0.01, 10, 1, true))), ARBOR, 0.15, 63));
  const barrelR = R * 0.48;
  parts.push(paint(axle(new THREE.CylinderGeometry(barrelR, barrelR, W - 0.14, 12, 1, true)), BARREL, 0.3, 64));
  // the cable wound on: a full reel to most of the flange, or part paid out down toward the barrel (its ends against
  // the flanges' inner faces, the arbor's way through it clear)
  const wound = barrelR + (R * 0.9 - barrelR) * (left < 0.7 ? 1 : 0.35);
  parts.push(paint(axle(new THREE.CylinderGeometry(wound, wound, W - 0.16, 16, 1, true)), CABLE, 0.15, 65));
  // the loose end: off the winding's front, hanging slack down the reel's face to the ground and lying there in a lazy
  // curve (a heavy cable's own weight: no straight runs), a metre or so out
  const a = (lie - 0.5) * 1.6, ex = (lie - 0.5) * (W - 0.4);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(ex, R + wound * 0.55, wound * 0.84),
    new THREE.Vector3(ex, R * 0.55, wound + 0.06),
    new THREE.Vector3(ex + Math.sin(a) * 0.12, 0.08, wound + 0.22),
    new THREE.Vector3(ex + Math.sin(a) * 0.45, 0.035, wound + 0.65 + salt * 0.25),
    new THREE.Vector3(ex + Math.sin(a) * 0.5 + (salt - 0.5) * 0.5, 0.035, wound + 1.0 + salt * 0.45),
  ], false, 'centripetal');
  parts.push(paint(new THREE.TubeGeometry(curve, 14, 0.03, 6, false), CABLE, 0.15, 66));
  const g = merged(parts);
  g.rotateY(yaw);
  return g;
}

/**
 * A stack of creosoted sleepers on the ground at the origin: the permanent way's square crib, seven courses of eight
 * sleepers (2.6 x 0.25 x 0.15 m) with a hand's gap between them, each course across the one under it so the stack is as
 * wide as a sleeper is long, the top course part taken; from the old stack's draws `v` (its UV jitter): the stack's turn,
 * how much of the top course is left, each sleeper's wear.
 */
export function sleeperStack(v: readonly number[]): BG {
  const turn = v[0] * Math.PI, keep = 3 + Math.floor(v[1] * 5), salt = Math.floor(v[2] * 1e6);
  const parts: BG[] = [];
  const L = 2.6, H = 0.15, D = 0.25, per = 8, gap = (L - per * D) / (per - 1), span = per * D + (per - 1) * gap, courses = 7;
  for (let course = 0; course < courses; course++) {
    const across = course % 2 === 1, n = course === courses - 1 ? keep : per;
    for (let k = 0; k < n; k++) {
      const off = -span / 2 + D / 2 + k * (D + gap);
      // (props r2, Lane C 2026-10-16: the stack was all sharp boxes) a sleeper's long arrises worn round by the years
      // in the track and the yard's handling: eased 2 cm
      const s = bevelBox(across ? D : L, H, across ? L : D, 0.02, 0.5);
      const lift = H / 2 + course * H;
      // a sleeper's ends a few centimetres out of line, its tone worn grey where it has lain in the weather
      const jog = (hash(course * 11 + k, salt) - 0.5) * 0.06;
      s.translate(across ? off : jog, lift, across ? jog : off);
      // (the top faces bleached grey by the sun and the rain)
      parts.push(bleachTops(paint(s, hash(course * 11 + k, salt + 1) < 0.4 ? CREOSOTE_WORN : CREOSOTE, 0.35, salt + course * 11 + k)));
    }
  }
  const g = merged(parts);
  g.rotateY(turn);
  return g;
}

const RAIL_STEEL = rgb(0x3d342d), RAIL_RUST = rgb(0x5a3b28), BEAM_RED = rgb(0xa1281f), BEAM_WHITE = rgb(0xdcd8cf),
  BUFFER_BLACK = rgb(0x1e1d1c), CONCRETE = rgb(0x8a867d);

/** A box from its extents, painted. */
function block(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, tone: readonly number[], salt: number): BG {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return paint(g, tone, 0.25, salt);
}
/** A flat-bottomed rail's section (a worn S 49: 0.15 m tall, its foot 0.125 m), across x, its height along z. */
const RAIL_SECTION: ReadonlyArray<readonly [number, number]> = (() => {
  // upright (w across, h up from the foot), counter-clockwise; laid with the foot toward +z
  const up: Array<[number, number]> = [[-0.0625, 0], [0.0625, 0], [0.0625, 0.011], [0.012, 0.03], [0.008, 0.04], [0.008, 0.105],
    [0.0335, 0.115], [0.0335, 0.15], [-0.0335, 0.15], [-0.0335, 0.115], [-0.008, 0.105], [-0.008, 0.04], [-0.012, 0.03], [-0.0625, 0.011]];
  return up.map(([w, h]) => [w, 0.075 - h] as [number, number]).reverse();
})();
/** The rail section run `len` along y (centred), flat-shaded sides and its two cut ends: indexed, like BoxGeometry. */
function railBar(len: number): BG {
  const S = RAIL_SECTION, n = S.length, pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const tri = (a: number, b: number, c: number, nx: number, ny: number, nz: number) => {
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const ux = pos[b * 3] - ax, uy = pos[b * 3 + 1] - ay, uz = pos[b * 3 + 2] - az, vx = pos[c * 3] - ax, vy = pos[c * 3 + 1] - ay, vz = pos[c * 3 + 2] - az;
    const d = (uy * vz - uz * vy) * nx + (uz * vx - ux * vz) * ny + (ux * vy - uy * vx) * nz;
    if (d >= 0) idx.push(a, b, c); else idx.push(a, c, b);
  };
  const vert = (x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number) => {
    pos.push(x, y, z); nor.push(nx, ny, nz); uv.push(u, v); return pos.length / 3 - 1;
  };
  let run = 0;
  for (let k = 0; k < n; k++) {
    const [u0, v0] = S[k], [u1, v1] = S[(k + 1) % n], du = u1 - u0, dv = v1 - v0, l = Math.hypot(du, dv) || 1;
    // (counter-clockwise in x, z: the outward normal is the edge turned clockwise)
    const nx = dv / l, nz = -du / l;
    const a = vert(u0, -len / 2, v0, nx, 0, nz, 0, run), b = vert(u1, -len / 2, v1, nx, 0, nz, 0, run + l);
    const c = vert(u1, len / 2, v1, nx, 0, nz, len, run + l), d = vert(u0, len / 2, v0, nx, 0, nz, len, run);
    tri(a, b, c, nx, 0, nz); tri(a, c, d, nx, 0, nz);
    run += l;
  }
  const faces = THREE.ShapeUtils.triangulateShape(S.map(([u, v]) => new THREE.Vector2(u, v)), []);
  for (const sy of [-1, 1]) {
    const base = pos.length / 3;
    for (const [u, v] of S) vert(u, sy * len / 2, v, 0, sy, 0, u, v);
    for (const [a, b, c] of faces) tri(base + a, base + b, base + c, 0, sy, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
/**
 * A member bent from old rail, from a to b: (props r2, Lane C 2026-10-16) the rail's own section, its head, web and
 * foot (it was a 0.07 x 0.15 box), the foot toward +z when it stands upright. Painted.
 */
function railMember(a: readonly number[], b: readonly number[], tone: readonly number[], salt: number): BG {
  const p = new THREE.Vector3(a[0], a[1], a[2]), q = new THREE.Vector3(b[0], b[1], b[2]), d = q.clone().sub(p), len = d.length();
  const g = railBar(len);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2);
  return paint(g, tone, 0.3, salt);
}

/**
 * A rail-built buffer stop (a Prellbock) standing on the ground at the origin, the track coming in along -z: on each
 * rail a post and a raking strut bent from old rail, tied along the ground and across the back, set in concrete feet;
 * the buffer beam across their heads in red and white, its two spring buffers toward the track at the buffers'
 * centres. From the old beam's four UV draws `v` (the rust, the beam's set). Painted, one geometry.
 */
export function bufferStopGeometry(v: readonly number[]): BG {
  const [rust, set] = v;
  const parts: BG[] = [];
  const frame = rust < 0.5 ? RAIL_STEEL : RAIL_RUST, beamY = 1.0, lean = (set - 0.5) * 0.04;
  for (const side of [-1, 1]) {
    const x = side * 0.72;
    parts.push(railMember([x, -0.15, 0.05], [x, beamY + 0.2, 0.05 + lean], frame, 70 + side));
    parts.push(railMember([x, -0.1, 1.65], [x, beamY + 0.1, 0.12 + lean], frame, 72 + side));
    parts.push(railMember([x, 0.04, 0.0], [x, 0.04, 1.7], frame, 74 + side));
    parts.push(block(x - 0.18, x + 0.18, -0.2, 0.06, 1.45, 1.85, CONCRETE, 76 + side));
    // the spring buffer, a wagon's own: its housing on the beam (with its flange), the plunger, the 45 cm head toward
    // the track
    const flange = block(side * 0.875 - 0.22, side * 0.875 + 0.22, beamY - 0.22, beamY + 0.22, -0.19 + lean, -0.15 + lean, BUFFER_BLACK, 77 + side);
    parts.push(flange);
    const h = new THREE.CylinderGeometry(0.17, 0.17, 0.35, 12, 1, false);
    h.rotateX(Math.PI / 2); h.translate(side * 0.875, beamY, -0.365 + lean);
    parts.push(paint(h, BUFFER_BLACK, 0.2, 78 + side));
    const plunger = new THREE.CylinderGeometry(0.1, 0.1, 0.14, 10, 1, false);
    plunger.rotateX(Math.PI / 2); plunger.translate(side * 0.875, beamY, -0.6 + lean);
    parts.push(paint(plunger, frame, 0.2, 80 + side));
    const head = new THREE.CylinderGeometry(0.225, 0.225, 0.05, 14, 1, false);
    head.rotateX(Math.PI / 2); head.translate(side * 0.875, beamY, -0.69 + lean);
    parts.push(paint(head, BUFFER_BLACK, 0.2, 82 + side));
  }
  // the back tie and the beam in its red and white bands; over the beam's middle, on its post, the stop board (the
  // German Sh 2: a red square in its white border, toward the track)
  parts.push(railMember([-0.72, 0.6, 0.95], [0.72, 0.6, 0.95], frame, 84));
  parts.push(block(-0.035, 0.035, beamY + 0.19, beamY + 0.95, 0.0 + lean, 0.07 + lean, frame, 94));
  parts.push(block(-0.32, 0.32, beamY + 0.42, beamY + 0.98, -0.02 + lean, 0.0 + lean, frame, 95));
  // (props r2, Lane C 2026-10-16: the red square was a plate stuck on the white board) the sign's face in one layer on
  // its steel back: the red square and its white border round it, flush, as the board is painted
  const zf0 = -0.03 + lean, zf1 = -0.02 + lean;
  parts.push(block(-0.25, 0.25, beamY + 0.49, beamY + 0.91, zf0, zf1, BEAM_RED, 97));
  parts.push(block(-0.31, 0.31, beamY + 0.43, beamY + 0.49, zf0, zf1, BEAM_WHITE, 96));
  parts.push(block(-0.31, 0.31, beamY + 0.91, beamY + 0.97, zf0, zf1, BEAM_WHITE, 98));
  for (const sx of [-1, 1]) parts.push(block(sx > 0 ? 0.25 : -0.31, sx > 0 ? 0.31 : -0.25, beamY + 0.49, beamY + 0.91, zf0, zf1, BEAM_WHITE, 99 + sx));
  const bands = 7, W = 2.3;
  for (let k = 0; k < bands; k++) {
    const x0 = -W / 2 + (k * W) / bands, x1 = -W / 2 + ((k + 1) * W) / bands;
    parts.push(block(x0, x1, beamY - 0.19, beamY + 0.19, -0.15 + lean, 0.15 + lean, k % 2 ? BEAM_WHITE : BEAM_RED, 86 + k));
  }
  return merged(parts);
}
