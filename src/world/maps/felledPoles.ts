// src/world/maps/felledPoles.ts — the shelled road's felled telegraph poles (props lane A, family #21, 2026-10-15;
// WORKLIST.md #21 utility: the felled poles at the bunker r2 standard). props.ts placeFelledUtilityPoles keeps its old
// cylinders and box as the collision proxies (their drawn footprints, Lane C r2d) and the stream's draws, and draws
// this in their place, in their frames:
//   - the stump: the pole's butt standing out of the verge, its foot soil-stained, its top snapped in splinters;
//   - the length: the rest of the pole lying along the ground, its butt snapped to match, its top weathered over, the
//     step bolts up its side, the copper ground wire stapled down it, the bolt and the fresh wood where its arm sat;
//   - the crossarm knocked loose: the arm on its side, its pins and insulators (green glass on the old rural lines,
//     brown glaze, white porcelain on the newer — some broken, some gone), its two braces;
//   - the line it carried: a run of conductor torn down past the pole's top and left in a loose coil on the ground.
// The timber is dressed and treated (creosote-dark, weathered brown, or silvered on the arid maps), its fibres streaked
// and its seasoning checks dark along the grain. Vertex colour on the baked material; every look from the pole's own seed
// (where its stump stands), no placement stream read. The timber writer is timberForms.ts's.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash, hexLin, mix, stream, type Rgb, type V3 } from './craftMesh.ts';
import { Part, snapCap, stub, tube, type TimberPick, type TimberSpecies } from './timberForms.ts';

const C = hexLin;
type Tone = 'creosote' | 'weathered' | 'silvered';
const dressed = (bark: Rgb, dark: Rgb, sap: Rgb, heart: Rgb): TimberSpecies =>
  ({ bark, dark, sap, heart, ridge: 'smooth', amp: 0.004, sides: 12, stubs: [0, 0], windthrow: 0 });
const POLE: Readonly<Record<Tone, TimberSpecies>> = Object.freeze({
  creosote: dressed(C(0x3e3026), C(0x1a1410), C(0xa88a5e), C(0x8a6a42)),
  weathered: dressed(C(0x6a5c4c), C(0x30271f), C(0xb09468), C(0x8e7048)),
  silvered: dressed(C(0x8e877a), C(0x47413a), C(0xbaa47e), C(0x9a7e58)),
});
const ARID = new Set(['desert', 'oasis', 'badlands', 'copper_mesa', 'titan_gorge', 'saltwind', 'skybridge']);
const COLD = new Set(['winter', 'whiteout', 'fjord', 'alpine']);
type Insulator = 'glass' | 'brown' | 'porcelain';
/** The old rural lines' green glass; the brown glaze of the mountain and the works lines; white porcelain elsewhere. */
const INSULATOR: Readonly<Record<string, Insulator>> = Object.freeze({
  verdant: 'glass', winter: 'glass', steppe: 'glass', autumn: 'glass', frontier: 'glass', coastal: 'glass',
  railyard: 'glass', fjord: 'glass', alpine: 'brown', foundry: 'brown', urban: 'brown',
});
const GLASS = C(0x4e8a72), GLASS_PALE = C(0x8ac0a8), BROWN = C(0x5e3220), BROWN_GLAZE = C(0x8a4a2e);
const PORCELAIN = C(0xdedad0), PORCELAIN_SHADE = C(0xb0aca2);
const STEEL = C(0x5c5e60), STEEL_DARK = C(0x34363a), RUST = C(0x6a3e26), COPPER = C(0x6a4430), PATINA = C(0x4e7a66);
const ALUMINIUM = C(0x8c8e90), SOIL = C(0x2a221a);

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const crs = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

interface PoleLook { sp: TimberSpecies; pick: TimberPick; insulator: Insulator; copper: boolean; seed: number }

function lookOf(mapId: string, seed: number): PoleLook {
  const tone: Tone = ARID.has(mapId) ? 'silvered' : COLD.has(mapId) ? 'weathered' : hash(1, 2, seed) < 0.55 ? 'creosote' : 'weathered';
  const insulator = INSULATOR[mapId] ?? 'porcelain';
  const sp = POLE[tone];
  return { sp, pick: { species: sp, name: `pole-${tone}`, moss: 0, charred: false }, insulator, copper: insulator === 'glass', seed };
}

/** The dressed shaft's colour: its fibres streaked by side, its seasoning checks dark, its foot soil-stained. */
function shaft(look: PoleLook, checks: readonly number[], k: number, j: number, soil: number): Rgb {
  const { sp, seed } = look;
  let col = mix(sp.bark, sp.dark, 0.06 + hash(k, 3, seed) * 0.2 + hash(k, j, seed ^ 0x2b) * 0.08);
  if (checks.includes(k)) col = mix(col, sp.dark, 0.7);
  return soil > 0 ? mix(col, SOIL, Math.min(0.75, soil)) : col;
}

/** The stump in its proxy cylinder's frame: y from its seat (under the ground at y -0.45) to its snapped top near h/2. */
function buildStump(look: PoleLook, h: number): Part {
  const part = new Part(), s = stream(look.seed ^ 0x51), sides = 12;
  const ground = -0.45, y0 = Math.min(-h / 2, ground - 0.12), top = h / 2 - 0.1;
  const ys = [y0, ground + 0.04, ground + 0.3, (ground + 0.3 + top) / 2, top];
  const checks = [Math.floor(s() * sides), Math.floor(s() * sides)];
  const r = (y: number) => 0.17 - 0.04 * (y - y0) / (top - y0);
  const ids = tube(part, sides, ys.length, (j) => [0, ys[j], 0], [1, 0, 0], [0, 0, 1],
    (k, j) => r(ys[j]) * (checks.includes(k) ? 0.95 : 1),
    (k, j) => shaft(look, checks, k, j, j < 2 ? 0.6 : j === 2 ? 0.2 : 0));
  const ring = ids[ids.length - 1].map((i) => part.pos(i));
  snapCap(part, ring, [0, top, 0], [0, 1, 0], r(top), look.sp, look.pick, 0.35, look.seed ^ 0x6d);
  return part;
}

/**
 * The fallen length in its proxy cylinder's frame: its axis +Y, the snapped butt (0.15 m) at -len/2, the top (0.09 m) at
 * +len/2; `down` the ground's side across the axis (the pose seats the axis 0.11 m over the ground), the shaft's under
 * side laid straight along it.
 */
function buildLength(look: PoleLook, len: number, down: V3): Part[] {
  const wood = new Part(), steel = new Part(), wire = new Part(), s = stream(look.seed ^ 0x1e), sides = 12;
  const yb = -len / 2 + 0.06, yt = len / 2 - 0.04, yg = len / 2 - 0.34;
  const r = (y: number) => 0.15 - 0.06 * (y + len / 2) / len;
  const ys: number[] = [];
  const n = Math.max(6, Math.round(len / 0.9));
  for (let j = 0; j <= n; j++) ys.push(yb + (yg - 0.07 - yb) * j / n);
  ys.push(yg + 0.07, yt);
  const checks = [Math.floor(s() * sides), Math.floor(s() * sides)];
  // the axis sunk toward the ground by what the pose's 0.11 m leaves under a thinner section (its under side stays on it)
  const centre = (y: number): V3 => add([0, y, 0], scl(down, Math.max(-0.04, 0.11 - r(y))));
  // the angles about the axis from the ground's side (the tube's angle th: [cos th, 0, sin th]); the pole lies with its
  // bolts to its sides, its ground wire up, the arm's seat (fresher wood on the face it covered) to one side
  const thDown = Math.atan2(down[2], down[0]), thSeat = thDown + Math.PI / 2;
  const seatK = ((Math.round(thSeat / (Math.PI * 2) * sides) % sides) + sides) % sides;
  const ids = tube(wood, sides, ys.length, (j) => centre(ys[j]), [1, 0, 0], [0, 0, 1],
    (k, j) => r(ys[j]) * (checks.includes(k) ? 0.95 : 1),
    (k, j) => (Math.abs(ys[j] - yg) < 0.08 && Math.abs(k - seatK) <= 1 ? mix(look.sp.sap, look.sp.bark, 0.45) : shaft(look, checks, k, j, 0)));
  snapCap(wood, ids[0].map((i) => wood.pos(i)), centre(yb), [0, -1, 0], r(yb), look.sp, look.pick, 0.3, look.seed ^ 0x7b);
  // the top weathered over: a low cone of grey end grain
  const tip = wood.v(add(centre(yt), [0, 0.035, 0]), mix(look.sp.dark, C(0x8a8478), 0.5));
  const top = ids[ids.length - 1];
  for (let k = 0; k < sides; k++) wood.f(top[k], top[(k + 1) % sides], tip, [0, 1, 0]);
  // the step bolts, alternate sides from a metre up the old pole, and the arm's through-bolt
  const off = (y: number, th: number, out: number): V3 => add(centre(y), [Math.cos(th) * (r(y) + out), 0, Math.sin(th) * (r(y) + out)]);
  for (let y = yb + 1.1, i = 0; y < yt - 0.9; y += 0.42, i++) {
    const th = thDown + (i % 2 ? 1 : -1) * (Math.PI / 2 + 0.3) + (s() - 0.5) * 0.2;
    stub(steel, off(y, th, -0.02), unit([Math.cos(th), 0.12, Math.sin(th)]), 0.17, 0.011, 0.009, 4, mix(STEEL, RUST, s() * 0.6), STEEL_DARK);
  }
  for (const th of [thSeat, thSeat + Math.PI]) {
    stub(steel, off(yg, th, -0.02), [Math.cos(th), 0, Math.sin(th)], 0.06, 0.009, 0.009, 5, STEEL, STEEL_DARK);
  }
  // the ground wire stapled down the pole's back (up, as it lies)
  const a = off(yb + 0.25, thDown + Math.PI, 0.006), b = off(yt - 0.3, thDown + Math.PI, 0.006);
  stub(wire, a, unit(sub(b, a)), Math.hypot(...sub(b, a)), 0.004, 0.004, 3, look.copper ? mix(COPPER, PATINA, 0.4) : ALUMINIUM, STEEL_DARK);
  return [wood, steel, wire];
}

/** A box `h` half extents about `c`, its faces wound out, each corner its own tone. */
function block(part: Part, c: V3, h: V3, col: (face: number, corner: number) => Rgb): void {
  const faces: Array<[V3, V3, V3]> = [
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 1, 0], [0, 0, 1]], [[0, 1, 0], [1, 0, 0], [0, 0, 1]],
    [[0, -1, 0], [1, 0, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [1, 0, 0], [0, 1, 0]]];
  faces.forEach(([nrm, u, v], f) => {
    const q = (su: number, sv: number): V3 => [c[0] + (nrm[0] + u[0] * su + v[0] * sv) * h[0], c[1] + (nrm[1] + u[1] * su + v[1] * sv) * h[1],
      c[2] + (nrm[2] + u[2] * su + v[2] * sv) * h[2]];
    const ids = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([su, sv], k) => part.v(q(su, sv), col(f, k)));
    part.f(ids[0], ids[1], ids[2], nrm); part.f(ids[0], ids[2], ids[3], nrm);
  });
}

/** A body of revolution about +z from `base`: `profile` (radius, z) from the foot to the crown. */
function lathe(part: Part, base: V3, profile: ReadonlyArray<readonly [number, number]>, sides: number, col: (j: number, k: number) => Rgb): void {
  const rows = profile.map(([r, z], j) => Array.from({ length: sides }, (_, k) => {
    const th = (k / sides) * Math.PI * 2;
    return part.v(add(base, [Math.cos(th) * r, Math.sin(th) * r, z]), col(j, k));
  }));
  for (let j = 0; j + 1 < rows.length; j++) for (let k = 0; k < sides; k++) {
    const k1 = (k + 1) % sides, th = ((k + 0.5) / sides) * Math.PI * 2;
    const dr = profile[j][0] - profile[j + 1][0];
    const out: V3 = [Math.cos(th), Math.sin(th), dr * 4];
    part.f(rows[j][k], rows[j + 1][k], rows[j + 1][k1], out);
    part.f(rows[j][k], rows[j + 1][k1], rows[j][k1], out);
  }
}

/** The crossarm on its side in its proxy box's frame (1.4 x 0.10 x 0.09 about its centre): its pins along +z. */
function buildArm(look: PoleLook): Part[] {
  const wood = new Part(), steel = new Part(), glaze = new Part(), s = stream(look.seed ^ 0xa2);
  const { sp } = look;
  block(wood, [0, 0, 0], [0.7, 0.05, 0.045], (f, k) => (f < 2 ? mix(sp.sap, C(0x8a8478), 0.55) : mix(sp.bark, sp.dark, 0.08 + hash(f, k, look.seed) * 0.25)));
  const ins = look.insulator;
  const body = ins === 'glass' ? GLASS : ins === 'brown' ? BROWN : PORCELAIN;
  const lit = ins === 'glass' ? GLASS_PALE : ins === 'brown' ? BROWN_GLAZE : PORCELAIN_SHADE;
  // a pony insulator's skirt, drip ring, waist and crown
  const profile: Array<[number, number]> = [[0.012, 0], [0.046, 0.008], [0.05, 0.024], [0.036, 0.034], [0.034, 0.07], [0.026, 0.098], [0.001, 0.108]];
  for (const x of [-0.6, -0.25, 0.25, 0.6]) {
    const state = s();
    stub(steel, [x, 0, 0.04], [0, 0, 1], state < 0.15 ? 0.09 : 0.06, 0.012, 0.01, 5, mix(STEEL, RUST, s() * 0.5), STEEL_DARK);
    if (state < 0.15) continue;
    // a whole one, or (a quarter) its skirt and waist left on the pin, broken off above
    const kept = state < 0.4 ? profile.slice(0, 5) : profile;
    lathe(glaze, [x, 0, 0.05], kept, 8, (j, k) => mix(body, lit, (j === 2 ? 0.55 : 0.1) + hash(j, k, look.seed) * 0.15));
  }
  // its two braces, a V to where the pole stood
  for (const x of [-0.42, 0.42]) {
    const a: V3 = [x, -0.037, -0.045], b: V3 = [0, -0.037, -0.62];
    stub(steel, a, unit(sub(b, a)), Math.hypot(...sub(b, a)), 0.012, 0.012, 4, mix(STEEL, RUST, 0.3 + s() * 0.4), STEEL_DARK);
  }
  return [wood, steel, glaze];
}

/** The conductor torn down: a wandering run on from `from` along `ang`, then a loose coil, on the ground. World frame. */
function buildDownedWire(look: PoleLook, ground: (x: number, z: number) => number, from: readonly [number, number], heading: number): Part {
  const part = new Part(), s = stream(look.seed ^ 0x3e1), pts: V3[] = [];
  const lift = 0.025, run = 3.5 + s() * 2.5, steps = 16;
  let x = from[0], z = from[1], ang = heading + (s() - 0.5) * 0.6;
  for (let i = 0; i <= steps; i++) {
    pts.push([x, ground(x, z) + lift, z]);
    ang += (s() - 0.5) * 0.35; x += Math.cos(ang) * run / steps; z += Math.sin(ang) * run / steps;
  }
  const cr = 0.32 + s() * 0.18, cx = x + Math.cos(ang) * cr, cz = z + Math.sin(ang) * cr, a0 = ang + Math.PI;
  for (let i = 1; i <= 32; i++) {
    const t = (i / 16) * Math.PI * 2, rr = cr * (1 + 0.12 * Math.sin(i * 1.7) + (i > 16 ? 0.08 : 0));
    const px = cx + Math.cos(a0 + t) * rr, pz = cz + Math.sin(a0 + t) * rr;
    pts.push([px, ground(px, pz) + lift + (i > 16 ? 0.012 : 0), pz]);
  }
  const col = look.copper ? COPPER : ALUMINIUM, r = 0.0055, sides = 3;
  const rows = pts.map((p, i) => {
    const t = unit(sub(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)]));
    const side = unit(crs(t, [0, 1, 0])), up = crs(side, t);
    return Array.from({ length: sides }, (_, k) => {
      const th = (k / sides) * Math.PI * 2;
      return part.v(add(p, add(scl(side, Math.cos(th) * r), scl(up, Math.sin(th) * r))), look.copper && hash(i, k, look.seed) < 0.3 ? mix(col, PATINA, 0.5) : col);
    });
  });
  for (let i = 0; i + 1 < rows.length; i++) for (let k = 0; k < sides; k++) {
    const k1 = (k + 1) % sides, mid = scl(add(pts[i], pts[i + 1]), 0.5);
    const out = sub(scl(add(add(part.pos(rows[i][k]), part.pos(rows[i][k1])), add(part.pos(rows[i + 1][k]), part.pos(rows[i + 1][k1]))), 0.25), mid);
    part.f(rows[i][k], rows[i + 1][k], rows[i + 1][k1], out);
    part.f(rows[i][k], rows[i + 1][k1], rows[i][k1], out);
  }
  return part;
}

/** Where props.ts set one felled pole's proxies (their frames), and the ground. */
export interface FelledPoleSite {
  mapId: string;
  ground: (x: number, z: number) => number;
  /** the stump cylinder's centre, height and lean (rotateZ) */
  stump: { x: number; y: number; z: number; h: number; lean: number };
  /** the fallen length's centre, unit axis (from the stump's end toward its top) and length */
  fall: { x: number; y: number; z: number; axis: V3; len: number };
  /** the crossarm box's centre and turn */
  arm: { x: number; y: number; z: number; yaw: number };
}

const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _v = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0);

/** One felled pole's drawn debris (stump, length, crossarm, downed wire), in the world, on the baked family's attributes. */
export function felledPoleDebris(site: FelledPoleSite): THREE.BufferGeometry {
  const seed = Math.floor(hash(Math.round(site.stump.x * 64), Math.round(site.stump.z * 64), 0xfe11) * 0x7fffffff);
  const look = lookOf(site.mapId, seed);
  const parts: THREE.BufferGeometry[] = [];
  const stump = buildStump(look, site.stump.h).geometry();
  stump.rotateZ(site.stump.lean);
  stump.translate(site.stump.x, site.stump.y, site.stump.z);
  parts.push(stump);
  const { axis, len } = site.fall;
  _q.setFromUnitVectors(_y, _v.set(axis[0], axis[1], axis[2]));
  _qi.copy(_q).invert();
  // the world's down in the length's frame, across its axis
  _v.set(0, -1, 0).applyQuaternion(_qi);
  const down = unit([_v.x, 0, _v.z]);
  for (const p of buildLength(look, len, down)) {
    const g = p.geometry();
    g.applyQuaternion(_q);
    g.translate(site.fall.x, site.fall.y, site.fall.z);
    parts.push(g);
  }
  for (const p of buildArm(look)) {
    const g = p.geometry();
    g.rotateY(site.arm.yaw);
    g.translate(site.arm.x, site.arm.y, site.arm.z);
    parts.push(g);
  }
  const reach = len / 2 + 0.2;
  parts.push(buildDownedWire(look, site.ground, [site.fall.x + axis[0] * reach, site.fall.z + axis[2] * reach], Math.atan2(axis[2], axis[0])).geometry());
  const merged = mergeGeometries(parts, false)!;
  for (const g of parts) g.dispose();
  return merged;
}
