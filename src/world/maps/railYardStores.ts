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
function merged(parts: BG[]): BG {
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!g) throw new Error('railYardStores: pieces do not merge');
  return g;
}

const FLANGE = rgb(0x6e5538), FLANGE_DARK = rgb(0x4a3a28), BARREL = rgb(0x8a7454), CABLE = rgb(0x1d1d1e), HOLE = rgb(0x121110),
  CREOSOTE = rgb(0x2c2520), CREOSOTE_WORN = rgb(0x4b4239);

/**
 * A cable drum of flange radius `radius` standing on its flanges at the origin (its axle along x before `yaw`), from
 * the old drum's four UV-jitter draws `v`: how much cable is left, the flanges' tone, the loose end's lie.
 */
export function cableDrum(radius: number, yaw: number, v: readonly number[]): BG {
  const [left, tone, lie, salt] = v;
  const W = radius * 1.1, R = radius, parts: BG[] = [];
  const axle = (g: BG) => { g.rotateZ(Math.PI / 2); g.translate(0, R, 0); return g; };
  const flangeTone = tone < 0.5 ? FLANGE : FLANGE_DARK;
  for (const sx of [-1, 1]) {
    const f = axle(new THREE.CylinderGeometry(R, R, 0.07, 18, 1, false));
    f.translate(sx * (W / 2 - 0.035), 0, 0);
    parts.push(paint(f, flangeTone, 0.3, 61 + sx));
    // the arbor hole: a dark boss on the flange's outer face
    const hole = axle(new THREE.CylinderGeometry(0.09, 0.09, 0.012, 8, 1, false));
    hole.translate(sx * (W / 2 + 0.002), 0, 0);
    parts.push(paint(hole, HOLE, 0.1, 63));
  }
  const barrelR = R * 0.48;
  parts.push(paint(axle(new THREE.CylinderGeometry(barrelR, barrelR, W - 0.14, 12, 1, true)), BARREL, 0.3, 64));
  // the cable wound on: a full reel to most of the flange, or part paid out down toward the barrel
  const wound = barrelR + (R * 0.9 - barrelR) * (left < 0.7 ? 1 : 0.35);
  parts.push(paint(axle(new THREE.CylinderGeometry(wound, wound, W - 0.16, 16, 1, false)), CABLE, 0.15, 65));
  // the loose end: off the top of the winding, over and down to the ground in four runs
  const a = (lie - 0.5) * 1.2, ex = (lie - 0.5) * (W - 0.4);
  const pts = [[ex, R + wound, 0], [ex, R + wound * 0.6, wound * 0.9], [ex + Math.sin(a) * 0.3, 0.35, wound + 0.45], [ex + Math.sin(a) * 0.8, 0.04, wound + 1.2 + salt * 0.6]];
  for (let k = 0; k + 1 < pts.length; k++) {
    const p = new THREE.Vector3(...pts[k]), q = new THREE.Vector3(...pts[k + 1]), d = q.clone().sub(p), len = d.length();
    const seg = new THREE.CylinderGeometry(0.025, 0.025, len + 0.02, 5, 1, true);
    seg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    seg.translate((p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2);
    parts.push(paint(seg, CABLE, 0.15, 66 + k));
  }
  const g = merged(parts);
  g.rotateY(yaw);
  return g;
}

/**
 * A stack of creosoted sleepers on the ground at the origin: four courses of five sleepers (2.6 x 0.25 x 0.15 m) laid
 * close, each course across the one under it, the top course part taken; from the old stack's draws `v` (its UV
 * jitter): the stack's turn, how much of the top course is left, each sleeper's wear.
 */
export function sleeperStack(v: readonly number[]): BG {
  const turn = v[0] * Math.PI, keep = 2 + Math.floor(v[1] * 4), salt = Math.floor(v[2] * 1e6);
  const parts: BG[] = [];
  const L = 2.6, H = 0.15, D = 0.25, gap = 0.08, per = 5, span = per * D + (per - 1) * gap;
  for (let course = 0; course < 4; course++) {
    const across = course % 2 === 1, n = course === 3 ? keep : per;
    for (let k = 0; k < n; k++) {
      const off = -span / 2 + D / 2 + k * (D + gap);
      const s = new THREE.BoxGeometry(across ? D : L, H, across ? L : D);
      const lift = H / 2 + course * H;
      // a sleeper's ends a hand out of line, its tone worn grey where it has lain in the weather
      const jog = (hash(course * 7 + k, salt) - 0.5) * 0.12;
      s.translate(across ? off : jog, lift, across ? jog : off);
      parts.push(paint(s, hash(course * 7 + k, salt + 1) < 0.3 ? CREOSOTE_WORN : CREOSOTE, 0.35, salt + course * 7 + k));
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
/** A rail-section member from a to b (0.07 x 0.15), painted. */
function railMember(a: readonly number[], b: readonly number[], tone: readonly number[], salt: number): BG {
  const p = new THREE.Vector3(a[0], a[1], a[2]), q = new THREE.Vector3(b[0], b[1], b[2]), d = q.clone().sub(p), len = d.length();
  const g = new THREE.BoxGeometry(0.07, len, 0.15);
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
    // the spring buffer: its housing on the beam, the plunger, the head toward the track
    const h = new THREE.CylinderGeometry(0.15, 0.15, 0.2, 10, 1, false);
    h.rotateX(Math.PI / 2); h.translate(side * 0.875, beamY, -0.25 + lean);
    parts.push(paint(h, BUFFER_BLACK, 0.2, 78 + side));
    const plunger = new THREE.CylinderGeometry(0.09, 0.09, 0.2, 8, 1, false);
    plunger.rotateX(Math.PI / 2); plunger.translate(side * 0.875, beamY, -0.45 + lean);
    parts.push(paint(plunger, frame, 0.2, 80 + side));
    const head = new THREE.CylinderGeometry(0.22, 0.22, 0.04, 12, 1, false);
    head.rotateX(Math.PI / 2); head.translate(side * 0.875, beamY, -0.57 + lean);
    parts.push(paint(head, BUFFER_BLACK, 0.2, 82 + side));
  }
  // the back tie and the beam in its red and white bands
  parts.push(railMember([-0.72, 0.6, 0.95], [0.72, 0.6, 0.95], frame, 84));
  const bands = 7, W = 2.3;
  for (let k = 0; k < bands; k++) {
    const x0 = -W / 2 + (k * W) / bands, x1 = -W / 2 + ((k + 1) * W) / bands;
    parts.push(block(x0, x1, beamY - 0.19, beamY + 0.19, -0.15 + lean, 0.15 + lean, k % 2 ? BEAM_WHITE : BEAM_RED, 86 + k));
  }
  return merged(parts);
}
