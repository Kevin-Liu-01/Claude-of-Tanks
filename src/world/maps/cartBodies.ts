// src/world/maps/cartBodies.ts — the map-vehicles lane's carts and sleds (P3, 2026-10-06).
//
// The battlefield's three small transport roles (props.ts places a handcart, a haycart and a sled where the inhabit
// pass seats one) built as the real types each map's place and year used: a charrette à bras in Lorraine, a
// Leiterwagen in the Eifel, a rickshaw on Suzhou Creek, a riyakā in the Aso caldera, a bullock cart at Kohima, a
// Studebaker farm wagon in Louisiana, a Hornschlitten on the Mont-Cenis, a komatik on the DEW Line, the Apollo 17 hand
// tool carrier at Taurus-Littrow. They are made the way their builders made them — wooden wheels on iron tyres
// (felloe, spokes, nave), plank beds on sills and stakes, ladder sides, shafts, a drawbar or a pole — and carry their
// loads (hay, sacks, firewood, canisters, a fuel drum), in the vehicle toolkit (vehicleMesh.ts): one indexed geometry
// per role and map, vertex-coloured, occluded and weathered like the vehicles and drawn by the vehicle material, its
// painted parts wearing each copy's own colour through the paint mask.
//
// Local frame: +Z is the pulling end (the shafts, the drawbar, the handles; a wheelbarrow's wheel), +Y up, the
// ground y = 0, centred on x = 0. Each builder stands its cart as it is left: on its wheels and a prop leg, tipped
// forward onto its shafts, its drawbar on the ground. The wrecked state is the same cart smashed: a wheel off and lying
// flat, the bed fallen onto that side, the load spilled, boards loose (a sled rolled onto its side).
//
// Deterministic and renderer-free: no Math.random, no clock.

import { VehicleMesh, linearHex, material, valueNoise, type Vec3, type VehicleMaterial } from './vehicleMesh.ts';
import { wheel as tyredWheel, RUBBER, TYRE_WALL } from './vehicleCoachwork.ts';

type Mat = VehicleMaterial;

// ---------------------------------------------------------------------------------------------------- materials

/** Natural wood (sRGB): a third of the copy's own colour (its livery list) reaches it, so the copies' timber differs. */
function woodMat(hex: number, rough = 0.88): Mat { return material('wood', linearHex(hex), rough, 0, 0.3, 1); }
/** Paint that takes the copy's colour (the paint mask). */
const PAINT_WOOD = material('paint', [0.78, 0.78, 0.76], 0.72, 0, 1, 1);
const PAINT_STEEL = material('paint', [0.78, 0.78, 0.76], 0.5, 0.15, 1, 1);
const DRUM_PAINT = material('paint', [0.78, 0.78, 0.76], 0.45, 0.2, 1, 0.35);
/** A fixed colour (no instance tint). */
function fixed(hex: number, rough = 0.6, metal = 0, role: 'paint' | 'steel' | 'wood' | 'canvas' | 'cargo' = 'paint'): Mat {
  return material(role, linearHex(hex), rough, metal, 0, 1);
}
const IRON = material('steel', [0.032, 0.03, 0.028], 0.6, 0.45, 0, 1);
const IRON_WORN = material('steel', [0.05, 0.047, 0.044], 0.5, 0.55, 0, 1);
const PLATE_STEEL = material('steel', [0.085, 0.074, 0.064], 0.62, 0.4, 0, 1);
const GALV = material('steel', [0.30, 0.31, 0.31], 0.42, 0.72, 0, 0.8);
const ALU = material('chrome', [0.52, 0.53, 0.54], 0.3, 0.9, 0, 0.3);
const GOLD_FOIL = material('chrome', [0.55, 0.36, 0.08], 0.28, 0.9, 0, 0.2);
const BLACK_PLASTIC = material('trim', [0.03, 0.03, 0.031], 0.55, 0, 0, 0.6);
// round 5 (wave 278: the airfield bottle cart "three identical, spotless glossy-blue capsules… no valves, caps, chains or
// scuffs"): the gases' own colours (oxygen blue, propane red, acetylene white), matte and worn, the brass valves, the
// steel caps, the chain over them, the scuffed paint
const GAS_OXYGEN = material('paint', linearHex(0x2f4f7a), 0.78, 0.05, 0, 0.6);
const GAS_PROPANE = material('paint', linearHex(0x8a2a24), 0.78, 0.05, 0, 0.6);
const GAS_ACETYLENE = material('paint', linearHex(0xd6d2c6), 0.78, 0.05, 0, 0.6);
const GAS_BAND = material('paint', linearHex(0xe2ded2), 0.7, 0, 0, 0.6);
const GAS_SCUFF = material('paint', linearHex(0x3a3630), 0.85, 0.1, 0, 0.5);
const BRASS = material('chrome', linearHex(0xa8863e), 0.35, 0.8, 0, 0.4);
/** Round 5 (wave 278: the Breton cart "spotless uniform flat blue… no mud, chipping or scuffing"): paint worn to the grey
 *  wood at the edges and corners. */
const PAINT_CHIP = material('wood', linearHex(0x8a8274), 0.9, 0, 0, 1);
// round 4 (wave 260: the Glacier Pass hay "a blotchy green-and-tan pattern that reads as a camouflage tarpaulin"): the
// straw a warm tan, never olive, and the heap's three shades close (its texture is the straw laid over it, not patches)
const HAY_A = material('cargo', linearHex(0xb39a62), 0.97, 0, 0, 0.5);
const HAY_B = material('cargo', linearHex(0xab925a), 0.97, 0, 0, 0.5);
const HAY_C = material('cargo', linearHex(0xa48b55), 0.97, 0, 0, 0.5);
// (wave 211: "a smooth yellow lozenge with faint streaks") the hay sledge's load in five shades, the pale sunlit straw
// and the dark of the heap's folds among the three (only the sledge takes them: every other hay load stands)
const HAY_PALE = material('cargo', linearHex(0xcbb581), 0.95, 0, 0, 0.5);
const HAY_DARK = material('cargo', linearHex(0x7d6941), 0.97, 0, 0, 0.5);
// round 3 (wave 234: the wrack as "a smooth, glossy black dome… a tarp-wrapped boulder or a whale"): olive-brown and
// matte, its fronds a little wetter
// round 4 (wave 260: the Breton cart's wrack "one rounded olive sack"): wet wrack is near-black brown, its fronds a
// little olive where the light catches them
const SEAWEED_A = material('cargo', linearHex(0x3a2f1c), 0.82, 0, 0, 0.4);
const SEAWEED_B = material('cargo', linearHex(0x47391f), 0.8, 0, 0, 0.4);
const BURLAP = material('canvas', linearHex(0x8a7c62), 0.96, 0, 0, 1);
const BURLAP_DARK = material('canvas', linearHex(0x6f624b), 0.96, 0, 0, 1);
const WOVEN_PP = material('canvas', linearHex(0xcfcabb), 0.85, 0, 0, 1);
const OILCLOTH = material('canvas', [0.022, 0.021, 0.02], 0.45, 0, 0, 0.6);
const DUCK = material('canvas', linearHex(0xcfc6ad), 0.92, 0, 0, 1);
const MAT_WEAVE = material('canvas', linearHex(0x8a7448), 0.95, 0, 0, 1);
const STRAW_BALE = material('cargo', linearHex(0xbcab78), 0.96, 0, 0, 0.6);
const TWINE = material('cargo', linearHex(0x6a5a38), 0.9, 0, 0, 0.6);
// round 2 (waves 152-153: crates as "untextured dark-grey boxes", sacks as "smooth cylinders", seaweed as "a primitive
// blob", cans "merely placed, not loaded"): crate pine fresher than the carts' wood, the dark inside between its boards,
// webbing straps, wet kelp
const CRATE_PINE = material('wood', linearHex(0x9c7a4e), 0.86, 0, 0.3, 1);
const CRATE_PINE_OLD = material('wood', linearHex(0x7a6044), 0.88, 0, 0.3, 1);
const CRATE_INSIDE = material('wood', linearHex(0x2c241a), 0.9, 0, 0.3, 1);
// round 3 (wave 234: crates "spotless and unlashed"): boards gone grey, the shipper's stencil, the grime of the road
const CRATE_PINE_GREY = material('wood', linearHex(0x857d6a), 0.9, 0, 0.3, 1);
const CRATE_STENCIL = material('paint', linearHex(0x1e1b16), 0.8, 0, 0, 0.6);
const CRATE_GRIME = material('paint', linearHex(0x3a2f24), 0.92, 0, 0, 0.4);
const STRAP = material('cargo', linearHex(0x2c2b27), 0.7, 0, 0, 0.6);
const KELP_A = material('cargo', linearHex(0x4a3a20), 0.66, 0, 0, 0.4);
const KELP_B = material('cargo', linearHex(0x2a2312), 0.7, 0, 0, 0.4);
const BARK = material('wood', linearHex(0x5a4a3a), 0.95, 0, 0, 1);
const LOG_END = material('wood', linearHex(0xb08a5e), 0.9, 0, 0, 1);
const UHMW = material('trim', linearHex(0xdedbd2), 0.5, 0, 0, 0.6);
const COMPOSITE = material('paint', linearHex(0xe2e2dc), 0.55, 0, 0, 0.8);
const SAND = material('cargo', linearHex(0x9c8a6c), 0.98, 0, 0, 0.4);
const COAL = material('cargo', [0.022, 0.021, 0.02], 0.7, 0, 0, 0.3);

// ---------------------------------------------------------------------------------------------------- the sink

interface Ctx {
  readonly mesh: VehicleMesh;
  readonly coarse: boolean;
  /** Per-model salt for the boards' shades and the loads' noise. */
  readonly seed: number;
  /** The model's wood shades. */
  readonly woods: readonly Mat[];
  /** A snowbound map (VehicleClimate snow): snow on the decks and loads, a drift against the runners (all dressing). */
  readonly snow?: boolean;
  /** Round 3: where the runners' tracks lie (cartRunners reads them; the props press them into the ground). */
  runners?: RunnerTrack[];
}

/** A sled's runners and the track they press (model space): the runner lines' x, from z0 (far behind) to z1 (ahead). */
export interface RunnerTrack { readonly xs: readonly number[]; readonly z0: number; readonly z1: number; readonly width: number }

function hash01(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 13), 0x297a2d39);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The k-th board's shade. */
function woodOf(c: Ctx, k: number): Mat { return c.woods[Math.floor(hash01(k, c.seed) * c.woods.length) % c.woods.length]; }

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: Vec3): Vec3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A flat quad facing `n` (its winding follows the normal). */
function face4(mesh: VehicleMesh, p: Vec3[], n: Vec3, m: Mat): void {
  if (dot(cross(sub(p[1], p[0]), sub(p[2], p[0])), n) < 0) p = [p[0], p[3], p[2], p[1]];
  const v = p.map((q) => mesh.vert(q[0], q[1], q[2], n[0], n[1], n[2], m));
  mesh.tri(v[0], v[1], v[2]);
  mesh.tri(v[0], v[2], v[3]);
}

/**
 * A squared timber or flat bar from a to b: `w` across, `d` deep, its depth turned toward `up`. Four faces, the ends
 * capped unless they are buried (`open`).
 */
function beam(mesh: VehicleMesh, a: Vec3, b: Vec3, w: number, d: number, m: Mat, open = false, up: Vec3 = [0, 1, 0]): void {
  const t = unit(sub(b, a));
  let u = up;
  if (Math.abs(dot(t, u)) > 0.97) u = Math.abs(t[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
  const s = unit(cross(u, t)), v = cross(t, s);
  const at = (p: Vec3, cs: number, cv: number): Vec3 => [
    p[0] + s[0] * cs * w / 2 + v[0] * cv * d / 2, p[1] + s[1] * cs * w / 2 + v[1] * cv * d / 2, p[2] + s[2] * cs * w / 2 + v[2] * cv * d / 2,
  ];
  const ring: [number, number][] = [[1, -1], [1, 1], [-1, 1], [-1, -1]];
  for (let k = 0; k < 4; k++) {
    const [s0, v0] = ring[k], [s1, v1] = ring[(k + 1) % 4];
    const n: Vec3 = unit([s[0] * (s0 + s1) + v[0] * (v0 + v1), s[1] * (s0 + s1) + v[1] * (v0 + v1), s[2] * (s0 + s1) + v[2] * (v0 + v1)]);
    face4(mesh, [at(a, s0, v0), at(a, s1, v1), at(b, s1, v1), at(b, s0, v0)], n, m);
  }
  if (!open) {
    face4(mesh, ring.map(([cs, cv]) => at(a, cs, cv)), [-t[0], -t[1], -t[2]], m);
    face4(mesh, ring.map(([cs, cv]) => at(b, cs, cv)), t, m);
  }
}

/** A round bar (pole, rung, tube) from a to b; `caps` closes the ends. */
function rod(c: Ctx, a: Vec3, b: Vec3, r: number, m: Mat, caps = false, segs?: number): void {
  c.mesh.tube([a, b], r, segs ?? (c.coarse ? 5 : 7), m, { caps });
}

/** A bent round bar through `path` (a tube with its frames carried round the bends). */
function bentRod(c: Ctx, path: readonly Vec3[], r: number, m: Mat, caps = true): void {
  c.mesh.tube(path, r, c.coarse ? 5 : 7, m, { caps });
}

/** A board: a box with its arrises eased (desktop). */
function board(c: Ctx, x: number, y: number, z: number, w: number, h: number, d: number, m: Mat): void {
  c.mesh.box(x, y, z, w, h, d, m, c.coarse ? 0 : 0.004);
}

/** Points along a quadratic Bézier (a bent shaft, a runner's curl). */
function bezier(a: Vec3, b: Vec3, cpt: Vec3, n: number): Vec3[] {
  const out: Vec3[] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * cpt[0] + t * t * b[0], u * u * a[1] + 2 * u * t * cpt[1] + t * t * b[1],
      u * u * a[2] + 2 * u * t * cpt[2] + t * t * b[2]]);
  }
  return out;
}

/** A squared section swept along a path (a bent shaft or runner), its corners crisp. */
function squareSweep(c: Ctx, path: readonly Vec3[], w: number, d: number, m: Mat, up?: Vec3): void {
  c.mesh.sweep(path, [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]], () => m,
    { closedSection: true, caps: true, creases: [0, 1, 2, 3], up });
}

// ---------------------------------------------------------------------------------------------------- wheels

interface SpokeWheelSpec {
  /** Outer radius (over the tyre) and the tyre's width. */
  readonly r: number;
  readonly w: number;
  /** The rim: a wooden felloe of this depth, or a steel rim (bicycle, pram, cast). */
  readonly rim: 'felloe' | 'steel';
  readonly felloe?: number;
  readonly spokes: number;
  /** Spoke thickness (m); thin steel wire spokes go below 1 cm. */
  readonly spoke?: number;
  /** The nave (hub): radius and length along the axle. */
  readonly nave: number;
  readonly naveL: number;
  readonly tyre: 'iron' | 'rubber' | 'bicycle';
  /** How far the rim plane stands outboard of the spokes' roots (a dished wheel). */
  readonly dish?: number;
  /** Paint on the spokes and felloe (a painted wheel) instead of the wood. */
  readonly painted?: boolean;
  /** A fixed colour for felloe, spokes and nave (sRGB). */
  readonly hex?: number;
}

/**
 * A spoked wheel at the origin, its outer face toward +x: the tyre (an iron band, a solid rubber tyre or a bicycle
 * tyre), the felloe or a steel rim, the spokes from the nave (dished out to the rim) and the nave with its iron hoop.
 */
function spokeWheel(c: Ctx, s: SpokeWheelSpec): void {
  const mesh = c.mesh;
  const segs = c.coarse ? 12 : s.r > 0.35 ? 22 : 18;
  const timber = s.hex !== undefined ? fixed(s.hex, 0.7, 0, 'wood') : s.painted ? PAINT_WOOD : woodOf(c, 7);
  const tyreT = s.tyre === 'iron' ? 0.011 : s.tyre === 'rubber' ? 0.045 : 0.035;
  const rt = s.r - tyreT;
  const dish = s.dish ?? 0;
  mesh.push().translate(dish, 0, 0);
  if (s.tyre === 'iron') {
    mesh.lathe([[rt, -s.w * 0.5], [s.r, -s.w * 0.5], [s.r, s.w * 0.5], [rt, s.w * 0.5]], segs, () => IRON_WORN, { creases: [1, 2] });
  } else {
    const w = s.tyre === 'bicycle' ? s.w * 0.8 : s.w;
    const prof: [number, number][] = c.coarse
      ? [[rt, -w * 0.45], [s.r - tyreT * 0.25, -w * 0.5], [s.r, 0], [s.r - tyreT * 0.25, w * 0.5], [rt, w * 0.45]]
      : [[rt, -w * 0.45], [s.r - tyreT * 0.35, -w * 0.52], [s.r - tyreT * 0.06, -w * 0.32], [s.r, 0], [s.r - tyreT * 0.06, w * 0.32],
        [s.r - tyreT * 0.35, w * 0.52], [rt, w * 0.45]];
    mesh.lathe(prof, segs, (k) => (k === 0 || k === prof.length - 2 ? TYRE_WALL : RUBBER));
  }
  let rimIn: number;
  if (s.rim === 'felloe') {
    const f = s.felloe ?? s.r * 0.12, fw = s.w * 0.9;
    rimIn = rt - f;
    mesh.lathe([[rimIn, -fw / 2], [rt, -fw / 2], [rt, fw / 2], [rimIn, fw / 2], [rimIn, -fw / 2]], segs, () => timber, { creases: [1, 2, 3] });
  } else {
    // a steel rim: a shallow channel the tyre sits in
    const rw = s.w * 0.62;
    rimIn = rt - 0.018;
    mesh.lathe([[rimIn, -rw / 2], [rt + 0.004, -rw / 2], [rt + 0.004, rw / 2], [rimIn, rw / 2], [rimIn, -rw / 2]], segs,
      () => (s.hex !== undefined ? timber : s.painted ? PAINT_STEEL : IRON_WORN), { creases: [1, 2, 3] });
  }
  mesh.pop();
  // spokes: from the nave out to the rim, leaning to the dish
  const root = s.nave * 0.9, L = rimIn - root + 0.01;
  const tilt = Math.atan2(dish, L);
  const th = s.spoke ?? Math.max(0.026, s.r * 0.07);
  const steelSpokes = s.rim === 'steel' && th < 0.012;
  for (let k = 0; k < s.spokes; k++) {
    mesh.push().rotateX((k / s.spokes) * Math.PI * 2 + 0.13).translate(0, root, 0).rotateZ(-tilt);
    if (steelSpokes) beam(mesh, [0, 0, 0], [0, L, 0], th, th, s.painted ? PAINT_STEEL : GALV, true, [1, 0, 0]);
    else beam(mesh, [0, 0, 0], [0, L, 0], th * 0.8, th * 1.15, timber, true, [1, 0, 0]);
    mesh.pop();
  }
  // the nave: a turned barrel with an iron hoop at either end (a steel hub: a plain barrel)
  const n = s.nave, h = s.naveL / 2;
  const hub = s.rim === 'steel' ? (s.painted ? PAINT_STEEL : IRON_WORN) : timber;
  mesh.lathe([[0.0001, -h], [n * 0.7, -h], [n * 0.92, -h * 0.6], [n, -h * 0.15], [n, h * 0.2], [n * 0.86, h * 0.68], [n * 0.62, h],
    [0.0001, h]], c.coarse ? 8 : 12, (k) => (s.rim === 'felloe' && (k === 0 || k === 5 || k === 6) ? IRON : hub));
}

/** A pneumatic tyre on a pressed steel disc (a barrow, a car-wheeled cart, a trailer), outer face toward +x. */
function tyreWheel(c: Ctx, r: number, w: number, rim = 0.55): void {
  tyredWheel(c.mesh, 0, 0, 0, 1, { r, w, rim, style: 'disc', coarse: c.coarse });
}

/** A cast-iron wheel (works trolleys, a tip cart): a plain iron tyre on six or eight flat spokes, a boss. */
function castWheel(c: Ctx, r: number, w: number, spokes: number, m: Mat = IRON_WORN): void {
  const mesh = c.mesh, segs = c.coarse ? 12 : 18;
  mesh.lathe([[r - 0.035, -w / 2], [r, -w / 2], [r, w / 2], [r - 0.035, w / 2], [r - 0.035, -w / 2]], segs, () => m, { creases: [1, 2, 3] });
  for (let k = 0; k < spokes; k++) {
    mesh.push().rotateX((k / spokes) * Math.PI * 2);
    beam(mesh, [0, r * 0.18, 0], [0, r - 0.03, 0], w * 0.3, Math.max(0.02, r * 0.11), m, true, [1, 0, 0]);
    mesh.pop();
  }
  mesh.lathe([[0.0001, -w * 0.7], [r * 0.2, -w * 0.7], [r * 0.22, 0], [r * 0.2, w * 0.7], [0.0001, w * 0.7]], c.coarse ? 8 : 10, () => m);
}

// ---------------------------------------------------------------------------------------------------- loads

/**
 * A loaf of loose stuff over a bed (hay, seaweed, fodder, a tarp bundle): centred at (x, y0, z), `hw` and `hl` its half
 * width and length on the bed, `h` its height, `belly` how far it bulges out over its base, lumpy with noise; two or
 * three shades in streaks. Open underneath (it sits on the bed or the ground).
 */
interface LoafOptions {
  belly?: number; lump?: number; ends?: number; seed?: number; low?: boolean; folds?: number;
  /** Round 4: how fine the shades break across the surface (1: broad patches, the cloth's; 4: a straw's speckle). */
  grain?: number;
  /**
   * Round 4 (wave 260: the wrack "resting on the bed like a beanbag"): a load held in a box, its sides `hw` either side
   * of the heap's axis and its ends at z0 and z1: under the boards' top `y` the heap is drawn in within them, over it
   * the heap swells out to its own width (the load heaped over the boards).
   */
  waist?: { readonly y: number; readonly hw: number; readonly z0: number; readonly z1: number };
}

/**
 * The heap surface `loaf` lays, as a function: its point at zn (-1..1 along its length) and th (0..pi round from its
 * right foot over the crown to its left), written into `out`. `folds` (round 3, 2026-10-07) creases a tarp across its
 * length: that many soft ridges, the cloth hanging in folds over what it covers.
 */
function loafShape(c: Ctx, x: number, y0: number, z: number, hw: number, hl: number, h: number,
  o: LoafOptions = {}): (zn: number, th: number, out: Vec3) => Vec3 {
  const belly = o.belly ?? 0.12, lump = o.lump ?? 0.07, q = o.ends ?? 4, seed = c.seed + (o.seed ?? 0);
  const p = 2.6, folds = o.folds ?? 0;
  return (zn, th, out) => {
    const end = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(zn), q)), 1 / q);
    const ct = Math.cos(th), st = Math.sin(th);
    const sx = Math.sign(ct) * Math.pow(Math.abs(ct), 2 / p), sy = Math.pow(st, 2 / p);
    const bulge = 1 + belly * 4 * sy * (1 - sy);
    const px = x + hw * sx * bulge * end, pz = z + hl * zn, py = y0 + h * sy * Math.pow(end, 0.6);
    let n = 1 + lump * (2 * valueNoise(px * 3.1, py * 3.1, pz * 3.1, seed) - 1) + lump * 0.5 * (2 * valueNoise(px * 9, py * 9, pz * 9, seed + 5) - 1);
    if (folds) n += 0.05 * Math.pow(Math.abs(Math.sin((zn + 1) * folds * Math.PI * 0.5 + 0.7 * valueNoise(th * 2.0, zn, 0.3, seed + 13))), 3) * sy;
    out[0] = x + (px - x) * n; out[1] = y0 + (py - y0) * (0.96 + 0.08 * (n - 1) / Math.max(1e-6, lump) * lump); out[2] = z + (pz - z) * (0.97 + 0.03 * n);
    const w = o.waist;
    if (w) {
      const u = Math.min(1, Math.max(0, (out[1] - (w.y - 0.1)) / 0.18)), t = u * u * (3 - 2 * u);
      const dx = out[0] - x, held = Math.sign(dx) * Math.min(Math.abs(dx), w.hw);
      out[0] = x + held + (dx - held) * t;
      out[2] = Math.min(w.z1, Math.max(w.z0, out[2])) + (out[2] - Math.min(w.z1, Math.max(w.z0, out[2]))) * t;
    }
    return out;
  };
}

function loaf(c: Ctx, x: number, y0: number, z: number, hw: number, hl: number, h: number, mats: readonly Mat[],
  o: LoafOptions = {}): void {
  // the same grid on every tier (by the heap's size, not the tier): its lumps fall on the same points, so the coarse
  // solid the collision is taken from bounds the desktop heap exactly
  const nu = o.low ? 6 : Math.max(8, Math.min(26, Math.round((2 * hl) / 0.17)));
  const nv = o.low ? 6 : Math.max(8, Math.min(22, Math.round((Math.PI * hw) / 0.19)));
  const seed = c.seed + (o.seed ?? 0);
  const at = loafShape(c, x, y0, z, hw, hl, h, o);
  c.mesh.grid(nu, nv, (i, j, out) => { at(-1 + (2 * i) / nu, (j / nv) * Math.PI, out as Vec3); },
    (i, j) => mats[Math.floor(Math.min(0.999, valueNoise(i * 0.22 * (o.grain ?? 1), j * 0.75 * (o.grain ?? 1), 0.5, seed + 9) * 1.15) * mats.length)], { flip: true });
}

/**
 * A coat of long strands laid flush on a heap's surface (round 3, wave 234: hay as "a smooth olive-yellow capsule",
 * "a faceted, low-poly blob with spiky straw cards"; the wrack as "a smooth, glossy black dome"): `count` strands 1.2 cm
 * proud of it, combed along its length (a few degrees off), each in `segs` pieces bent over its curve, tapering to
 * its ends, a shade from `mats` each, the coat thicker on the crown and the flanks a viewer sees; dressing (out of the
 * collision and the footprint). The texture the vertex colours alone cannot give, from geometry.
 */
function strawCoat(c: Ctx, at: (zn: number, th: number, out: Vec3) => Vec3, hl: number, count: number,
  mats: readonly Mat[], salt: number, o: { segs?: number; len?: [number, number]; width?: [number, number]; spread?: number; thMin?: number } = {}): void {
  if (c.coarse) return;
  const segs = o.segs ?? 2, [l0, l1] = o.len ?? [0.22, 0.55], [w0, w1] = o.width ?? [0.022, 0.045], spread = o.spread ?? 0.22;
  // round 4: a held load's coat starts over its boards (`thMin`: where its surface rises past them)
  const th0 = o.thMin ?? 0.14;
  const S: Vec3 = [0, 0, 0], A0: Vec3 = [0, 0, 0], A1: Vec3 = [0, 0, 0], B0: Vec3 = [0, 0, 0], B1: Vec3 = [0, 0, 0];
  const e = 0.01;
  // outboard: drawn, but out of the body box the fit reads and out of the collision solid (the cart's fit and footprint
  // stand as the heap alone gives them)
  c.mesh.outboard(() => {
    for (let k = 0; k < count; k++) {
      const r1 = hash01(k, salt), r2 = hash01(k, salt + 1), r3 = hash01(k, salt + 2), r4 = hash01(k, salt + 3);
      // round the heap: the crown and the flanks (a cosine-weighted spread off the feet)
      const th = th0 + (Math.PI - 2 * th0) * (0.5 - 0.5 * Math.cos(Math.PI * r1));
      const zn0 = -0.92 + 1.84 * r2, len = l0 + (l1 - l0) * r3, dzn = len / hl, dth = (r4 - 0.5) * spread;
      const w = w0 + (w1 - w0) * hash01(k, salt + 4), m = mats[(k * 7 + Math.floor(r3 * 13)) % mats.length];
      const pts: { p: Vec3; a: Vec3; n: Vec3 }[] = [];
      for (let s = 0; s <= segs; s++) {
        const lo = o.thMin ?? 0.05;
        const t = s / segs, zn = Math.max(-0.97, Math.min(0.97, zn0 + dzn * (t - 0.5))), tt = Math.max(lo, Math.min(Math.PI - lo, th + dth * (t - 0.5)));
        at(zn, tt, S); at(zn + e, tt, A0); at(zn - e, tt, A1); at(zn, tt + e, B0); at(zn, tt - e, B1);
        const along = sub(A0, A1), round = sub(B0, B1);
        let nrm = unit(cross(along, round));
        // outward: away from the heap's long axis
        if (nrm[0] * Math.cos(tt) + nrm[1] * Math.sin(tt) < 0) nrm = [-nrm[0], -nrm[1], -nrm[2]];
        const across = unit(cross(nrm, unit(along)));
        const taper = Math.sin(Math.PI * (0.15 + 0.7 * t)) * 0.5 + 0.5;
        const half = (w / 2) * taper;
        pts.push({ p: [S[0] + nrm[0] * 0.012, S[1] + nrm[1] * 0.012, S[2] + nrm[2] * 0.012], a: [across[0] * half, across[1] * half, across[2] * half], n: nrm });
        if (s === segs) break;
      }
      for (let s = 0; s + 1 < pts.length; s++) {
        const p = pts[s], q = pts[s + 1];
        const n = unit([p.n[0] + q.n[0], p.n[1] + q.n[1], p.n[2] + q.n[2]]);
        face4(c.mesh, [[p.p[0] - p.a[0], p.p[1] - p.a[1], p.p[2] - p.a[2]], [p.p[0] + p.a[0], p.p[1] + p.a[1], p.p[2] + p.a[2]],
          [q.p[0] + q.a[0], q.p[1] + q.a[1], q.p[2] + q.a[2]], [q.p[0] - q.a[0], q.p[1] - q.a[1], q.p[2] - q.a[2]]], n, m);
      }
    }
  });
}

/** A load of loose hay: forkfuls heaped over the bed, straw hanging in wisps round its foot. */
function hayLoad(c: Ctx, x: number, y0: number, z: number, hw: number, hl: number, h: number, mats: readonly Mat[], belly = 0.18,
  lump = 0.11, strands = 0, ends = 3, strandOptions: { segs?: number } = {}): void {
  // round 4 (wave 260: "a blotchy… camouflage" pattern): the heap itself in three close shades, the straw over it
  // carrying the contrast
  loaf(c, x, y0, z, hw, hl, h, [HAY_A, HAY_B, HAY_C], { belly, lump, ends, grain: 2 });
  if (c.coarse) return;
  // round 4 (wave 260: "its outline is still a smooth dome"): short tufts pulled up out of the heap along its crown
  // and shoulders, so its outline breaks
  heapTufts(c, loafShape(c, x, y0, z, hw, hl, h, { belly, lump, ends }), Math.max(12, Math.round((hw + hl) * 13)), mats,
    c.seed + 4093, Math.max(0.08, Math.min(0.17, h * 0.14)));
  // wisps: thin straw tongues hanging from the heap's skirt (two-sided)
  const n = Math.max(14, Math.round((hw + hl) * 26));
  for (let k = 0; k < n; k++) {
    const t = (k + hash01(k, c.seed + 77) * 0.8) / n;
    const a = t * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    const ex = Math.sign(ca) * Math.pow(Math.abs(ca), 0.6), ez = Math.sign(sa) * Math.pow(Math.abs(sa), 0.6);
    const px = x + hw * (1 + belly * 0.45) * ex, pz = z + hl * 0.96 * ez, py = y0 + h * (0.14 + 0.12 * hash01(k, c.seed + 83));
    const size = Math.max(0.35, Math.min(1, h / 1.6));
    const len = (0.08 + 0.3 * Math.pow(hash01(k, c.seed + 79), 1.6)) * size, wd = (0.015 + 0.03 * hash01(k, c.seed + 81)) * Math.sqrt(size);
    const out: Vec3 = unit([ex, 0, ez]), side: Vec3 = [-out[2], 0, out[0]];
    const top0: Vec3 = [px - side[0] * wd, py, pz - side[2] * wd], top1: Vec3 = [px + side[0] * wd, py, pz + side[2] * wd];
    const lean = (hash01(k, c.seed + 85) - 0.5) * len * 0.8;
    const tip: Vec3 = [px + out[0] * len * 0.3 + side[0] * lean, py - len, pz + out[2] * len * 0.3 + side[2] * lean];
    const tipA: Vec3 = [tip[0] - side[0] * wd * 0.3, tip[1], tip[2] - side[2] * wd * 0.3], tipB: Vec3 = [tip[0] + side[0] * wd * 0.3, tip[1], tip[2] + side[2] * wd * 0.3];
    const m = mats[k % mats.length];
    const n1 = unit(cross(sub(top1, top0), sub(tipA, top0)));
    c.mesh.dressing(() => {
      face4(c.mesh, [top0, top1, tipB, tipA], n1, m);
      face4(c.mesh, [top0, tipA, tipB, top1], [-n1[0], -n1[1], -n1[2]], m);
    });
  }
  if (!strands) return;
  // round 3 (wave 234): the heap's straw itself, strands combed along the load over the crown and the flanks
  strawCoat(c, loafShape(c, x, y0, z, hw, hl, h, { belly, lump, ends }), hl, strands, mats, c.seed + 4021, strandOptions);
}

/**
 * Tufts pulled up out of a heap (round 4, wave 260): `count` little sheaves of three blades standing out of its
 * surface along the crown and the shoulders (th within 0.35..2.8), each leaning out along the surface's own normal and
 * splayed, `len` long: the heap's outline breaks against the sky (dressing, two-sided blades).
 */
function heapTufts(c: Ctx, at: (zn: number, th: number, out: Vec3) => Vec3, count: number, mats: readonly Mat[], salt: number,
  len: number): void {
  if (c.coarse) return;
  const P: Vec3 = [0, 0, 0], A: Vec3 = [0, 0, 0], B: Vec3 = [0, 0, 0];
  c.mesh.dressing(() => {
    for (let k = 0; k < count; k++) {
      const zn = -0.88 + 1.76 * hash01(k, salt), th = 0.35 + 2.45 * hash01(k, salt + 3);
      at(zn, th, P); at(zn, th + 0.05, A); at(zn + 0.05, th, B);
      const nrm = unit(cross(sub(A, P), sub(B, P)));
      const n = nrm[1] < 0 ? [-nrm[0], -nrm[1], -nrm[2]] as Vec3 : nrm;
      for (let b = 0; b < 3; b++) {
        const l = len * (0.55 + 0.6 * hash01(k * 3 + b, salt + 7)), w = 0.012 + 0.012 * hash01(k * 3 + b, salt + 9);
        const sx = (hash01(k * 3 + b, salt + 11) - 0.5) * 0.9, sz = (hash01(k * 3 + b, salt + 13) - 0.5) * 0.9;
        const dir = unit([n[0] + sx, n[1] + 0.25, n[2] + sz]);
        const tip: Vec3 = [P[0] + dir[0] * l, P[1] + dir[1] * l, P[2] + dir[2] * l];
        const side = unit(cross(dir, [0, 1, 0.001]));
        const a0: Vec3 = [P[0] - side[0] * w, P[1] - side[1] * w, P[2] - side[2] * w], a1: Vec3 = [P[0] + side[0] * w, P[1] + side[1] * w, P[2] + side[2] * w];
        // both faces shaded as the heap's own surface there (a blade lit edge-on reads as a black thorn)
        const m = mats[(k + b) % mats.length];
        const v0 = c.mesh.vert(a0[0], a0[1], a0[2], n[0], n[1], n[2], m), v1 = c.mesh.vert(a1[0], a1[1], a1[2], n[0], n[1], n[2], m);
        const v2 = c.mesh.vert(tip[0], tip[1], tip[2], n[0], n[1], n[2], m);
        c.mesh.tri(v0, v1, v2);
        c.mesh.tri(v0, v2, v1);
      }
    }
  });
}

/**
 * A load's spill on the ground about a cart (round 4, wave 260: "no ropes, stakes or spill"): `wisps` loose strands
 * lying flat (two pieces bent at the middle, tapering, one face up) in `tangles` dropped forkfuls, in a band round the
 * rectangle x0..x1, z0..z1 out to `reach`; at `groundY`, the ground's height in the cart's level frame (a wheeled cart
 * stands 3 cm into it, a sled 8). Outboard and desktop only: it neither fits, collides nor casts.
 */
interface SpillSpec {
  readonly x0: number; readonly x1: number; readonly z0: number; readonly z1: number; readonly reach: number; readonly groundY: number;
  readonly wisps: number; readonly len: readonly [number, number]; readonly width: readonly [number, number];
  /** The tangles the wisps lie in (each wisp within `spread` of one), so they read as dropped forkfuls. */
  readonly tangles: number; readonly spread: number;
  readonly mats: readonly Mat[]; readonly salt: number;
}

function groundSpill(c: Ctx, o: SpillSpec): void {
  if (c.coarse) return;
  const w = o.x1 - o.x0, l = o.z1 - o.z0, perimeter = 2 * (w + l);
  // a point of the band: round the rectangle's sides, its ends and its corners, out from it by up to `reach`
  const place = (k: number, salt: number): [number, number] => {
    let u = hash01(k, salt) * perimeter;
    const out = 0.04 + o.reach * Math.pow(hash01(k, salt + 1), 1.5), along = (hash01(k, salt + 2) - 0.5) * 0.3;
    if (u < l) return [o.x1 + out, o.z0 + u];
    u -= l;
    if (u < l) return [o.x0 - out, o.z0 + u];
    u -= l;
    if (u < w) return [o.x0 + u + along, o.z0 - out];
    u -= w;
    return [o.x0 + u + along, o.z1 + out];
  };
  const up: Vec3 = [0, 1, 0];
  c.mesh.outboard(() => {
    for (let k = 0; k < o.wisps; k++) {
      const [cx, cz] = place(k % o.tangles, o.salt), ra = hash01(k, o.salt + 1) * Math.PI * 2, rr = o.spread * Math.sqrt(hash01(k, o.salt + 2));
      const px = cx + Math.cos(ra) * rr, pz = cz + Math.sin(ra) * rr;
      const ang = hash01(k, o.salt + 3) * Math.PI * 2, bend = (hash01(k, o.salt + 5) - 0.5) * 1.1;
      const len = o.len[0] + (o.len[1] - o.len[0]) * hash01(k, o.salt + 7), wd = o.width[0] + (o.width[1] - o.width[0]) * hash01(k, o.salt + 9);
      const y = o.groundY + 0.005 + 0.004 * hash01(k, o.salt + 11), m = o.mats[k % o.mats.length];
      // its three stations: the middle, and the two ends turned by half the bend either way
      const a0 = ang - bend / 2, a2 = ang + bend / 2, h = len / 2;
      const P: Vec3[] = [[px - Math.cos(a0) * h, y, pz - Math.sin(a0) * h], [px, y + 0.003, pz], [px + Math.cos(a2) * h, y, pz + Math.sin(a2) * h]];
      const dirs = [a0, ang, a2], half = [wd * 0.3, wd * 0.5, wd * 0.2];
      const L: Vec3[] = [], R: Vec3[] = [];
      for (let s = 0; s < 3; s++) {
        const nx = -Math.sin(dirs[s]) * half[s], nz = Math.cos(dirs[s]) * half[s];
        L.push([P[s][0] + nx, P[s][1], P[s][2] + nz]); R.push([P[s][0] - nx, P[s][1], P[s][2] - nz]);
      }
      face4(c.mesh, [L[0], R[0], R[1], L[1]], up, m);
      face4(c.mesh, [L[1], R[1], R[2], L[2]], up, m);
    }
  });
}

/** A filled sack lying on its side, its length along z: a slumped pillow. */
function sack(c: Ctx, x: number, y: number, z: number, w: number, h: number, l: number, yaw: number, m: Mat): void {
  c.mesh.push().translate(x, y, z).rotateY(yaw);
  loaf(c, 0, 0, 0, w / 2, l / 2, h, [m], { belly: 0.22, lump: 0.06, ends: 2.4, seed: Math.round((x * 13 + z * 7) * 10), low: true });
  // (round 2) its neck gathered and tied at one end, the cloth bunched into a tuft; the seam along its back
  if (!c.coarse) c.mesh.dressing(() => {
    c.mesh.push().translate(0, h * 0.4, l / 2 - 0.03).rotateX(Math.PI / 2);
    c.mesh.lathe([[w * 0.2, 0], [w * 0.08, 0.05], [w * 0.1, 0.085], [w * 0.15, 0.115], [0.0001, 0.13]], 7, () => m);
    c.mesh.pop();
    c.mesh.push().translate(0, h * 0.4, l / 2 + 0.02).rotateX(Math.PI / 2);
    c.mesh.lathe([[w * 0.09, -0.012], [w * 0.09, 0.012]], 7, () => TWINE);
    c.mesh.pop();
    c.mesh.box(0, h * 0.985, 0, 0.014, 0.012, l * 0.7, TWINE, 0);
  });
  c.mesh.pop();
}

/** A row of split logs or round billets along z (firewood). */
function firewood(c: Ctx, x: number, y: number, z: number, w: number, l: number, layers: number): void {
  const r = 0.07, per = Math.max(1, Math.floor(w / (r * 2.1)));
  for (let ly = 0; ly < layers; ly++) for (let k = 0; k < per - (ly % 2); k++) {
    const px = x - w / 2 + r * 1.05 + k * r * 2.1 + (ly % 2) * r * 1.05;
    const py = y + r + ly * r * 1.8, len = l * (0.9 + 0.1 * hash01(k + ly * 7, c.seed + 3));
    c.mesh.push().translate(px, py, z + (hash01(k, ly + c.seed) - 0.5) * 0.08).rotateY(Math.PI / 2);
    c.mesh.lathe([[0.0001, -len / 2], [r * 0.95, -len / 2], [r, -len / 2 + 0.01], [r, len / 2 - 0.01], [r * 0.95, len / 2], [0.0001, len / 2]],
      c.coarse ? 5 : 7, (s) => (s === 0 || s === 4 ? LOG_END : BARK));
    c.mesh.pop();
  }
}

/** A plastic or steel canister standing (20 l), its handle up. */
function canister(c: Ctx, x: number, y: number, z: number, yaw: number, m: Mat): void {
  c.mesh.push().translate(x, y, z).rotateY(yaw);
  c.mesh.box(0, 0.17, 0, 0.17, 0.34, 0.27, m, c.coarse ? 0 : 0.02);
  c.mesh.box(0, 0.355, -0.02, 0.03, 0.03, 0.15, m, 0);
  c.mesh.lathe([[0.0001, -0.02], [0.022, -0.02], [0.022, 0.02], [0.0001, 0.02]], 6, () => m);
  c.mesh.pop();
}

/** A drum standing upright (205 l), rolling hoops proud of the shell. */
function drum(c: Ctx, x: number, y: number, z: number, r: number, h: number, m: Mat): void {
  c.mesh.push().translate(x, y + h / 2, z).rotateZ(Math.PI / 2);
  const hh = h / 2;
  c.mesh.lathe([[0.0001, -hh], [r * 0.95, -hh], [r, -hh + 0.015], [r, -h * 0.17], [r * 1.025, -h * 0.16], [r, -h * 0.15], [r, h * 0.15],
    [r * 1.025, h * 0.16], [r, h * 0.17], [r, hh - 0.015], [r * 0.95, hh], [0.0001, hh]], c.coarse ? 12 : 16, () => m);
  c.mesh.pop();
}

/** A crate (a slatted box). */
function crate(c: Ctx, x: number, y: number, z: number, w: number, h: number, d: number, yaw: number): void {
  c.mesh.push().translate(x, y, z).rotateY(yaw);
  const salt = Math.round((x * 13 + z * 7 + y * 5) * 10);
  const m = hash01(salt, c.seed + 41) < 0.5 ? CRATE_PINE : CRATE_PINE_OLD;
  if (c.coarse) { board(c, 0, h / 2, 0, w, h, d, m); c.mesh.pop(); return; }
  // (round 2) a slatted crate: three boards a side with gaps showing its dark inside, corner posts, a lid of three (square
  // edges: the crates are many and small)
  const box = (bx: number, by: number, bz: number, bw: number, bh: number, bd: number, bm: Mat) => c.mesh.box(bx, by, bz, bw, bh, bd, bm, 0);
  // (round 3) each board its own age: most of the crate's pine, some the other, a few gone grey
  let boardNo = 0;
  const age = (): Mat => {
    const a = hash01(salt + 7 * boardNo++, c.seed + 43);
    return a < 0.16 ? CRATE_PINE_GREY : a < 0.34 ? (m === CRATE_PINE ? CRATE_PINE_OLD : CRATE_PINE) : m;
  };
  box(0, h / 2, 0, w - 0.024, h - 0.012, d - 0.024, CRATE_INSIDE);
  const rows = 3, sh = h / rows - 0.022;
  for (let k = 0; k < rows; k++) {
    const yy = (k + 0.5) * (h / rows);
    for (const sz of [-1, 1]) box(0, yy, sz * (d / 2 - 0.006), w - 0.05, sh, 0.012, age());
    for (const sx of [-1, 1]) box(sx * (w / 2 - 0.006), yy, 0, 0.012, sh, d - 0.05, age());
  }
  for (let k = 0; k < 3; k++) box(0, h - 0.006, -d / 2 + (k + 0.5) * (d / 3), w - 0.02, 0.012, d / 3 - 0.018, age());
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(sx * (w / 2 - 0.018), h / 2, sz * (d / 2 - 0.018), 0.036, h, 0.036, m);
  // (round 3) the road's grime along each side's foot, the shipper's stencil on the middle board of one end
  c.mesh.dressing(() => {
    const g = 0.05 + 0.05 * hash01(salt, c.seed + 47), f = 0.004;
    for (const sz of [-1, 1]) {
      const zf = sz * (d / 2 + 0.002);
      face4(c.mesh, [[-w / 2 + 0.01, f, zf], [w / 2 - 0.01, f, zf], [w / 2 - 0.01, g, zf], [-w / 2 + 0.01, g * 0.7, zf]], [0, 0, sz], CRATE_GRIME);
    }
    for (const sx of [-1, 1]) {
      const xf = sx * (w / 2 + 0.002);
      face4(c.mesh, [[xf, f, -d / 2 + 0.01], [xf, f, d / 2 - 0.01], [xf, g * 0.8, d / 2 - 0.01], [xf, g, -d / 2 + 0.01]], [sx, 0, 0], CRATE_GRIME);
    }
    if (hash01(salt, c.seed + 49) < 0.8) {
      const sx = hash01(salt, c.seed + 51) < 0.5 ? 1 : -1, xs = sx * (w / 2 + 0.003), n: Vec3 = [sx, 0, 0];
      const mark = (z0: number, z1: number, y0: number, y1: number) =>
        face4(c.mesh, [[xs, h * y0, d * z0], [xs, h * y0, d * z1], [xs, h * y1, d * z1], [xs, h * y1, d * z0]], n, CRATE_STENCIL);
      mark(-0.3, 0.1, 0.45, 0.58); mark(0.15, 0.3, 0.45, 0.58); mark(-0.3, 0.02, 0.38, 0.41);
    }
  });
  c.mesh.pop();
}

/**
 * A lashing over a stack of crates (round 3, wave 234: "unlashed"): a rope from the deck on one side up over the stack's
 * shoulders and across its top, down to the deck on the other, at z. `layers` lists each tier's half-width and top from
 * the bottom up (narrowing), `baseY` the deck under it (dressing; desktop).
 */
function lashStack(c: Ctx, z: number, baseY: number, layers: readonly (readonly [number, number])[], r = 0.013): void {
  if (c.coarse) return;
  const e = r + 0.004, half: Vec3[] = [[layers[0][0] + 0.05, baseY + 0.01, z]];
  layers.forEach(([hw, top], i) => {
    half.push([hw + e, top - 0.03, z]);
    const next = layers[i + 1];
    if (next) half.push([next[0] + e, top + e, z]);
  });
  const [hwTop, top] = layers[layers.length - 1];
  half.push([hwTop - 0.015, top + e, z]);
  const path: Vec3[] = [...half.map(([px, py, pz]) => [-px, py, pz] as Vec3), ...half.slice().reverse()];
  c.mesh.dressing(() => bentRod(c, path, r, ROPE, true));
}

/** An open plastic produce crate (slotted sides), its vegetables showing over the rim. */
function produceCrate(c: Ctx, w: number, h: number, d: number, m: Mat): void {
  c.mesh.box(0, 0.02, 0, w, 0.04, d, m, 0);
  for (const sx of [-1, 1]) c.mesh.box(sx * (w / 2 - 0.01), h / 2, 0, 0.02, h, d, m, 0);
  for (const sz of [-1, 1]) c.mesh.box(0, h / 2, sz * (d / 2 - 0.01), w - 0.04, h, 0.02, m, 0);
  loaf(c, 0, h * 0.55, 0, w / 2 - 0.03, d / 2 - 0.03, h * 0.6, [fixed(0x5a7a34, 0.8, 0, 'cargo'), fixed(0x6a8a3c, 0.8, 0, 'cargo')],
    { belly: 0, lump: 0.12, ends: 2.6, low: true });
}

/** Small square bales (a 1980s baler's), stacked in courses with each course turned. */
function bales(c: Ctx, x0: number, x1: number, z0: number, z1: number, y: number, courses: number): void {
  const bw = 0.46, bh = 0.36, bl = 0.9;
  for (let k = 0; k < courses; k++) {
    const along = k % 2 === 0;
    const cw = along ? bw : bl, cl = along ? bl : bw;
    const nx = Math.max(1, Math.floor((x1 - x0) / cw)), nz = Math.max(1, Math.floor((z1 - z0) / cl));
    const inset = k === courses - 1 ? 1 : 0;
    for (let i = inset; i < nx - inset; i++) for (let j = 0; j < nz - inset; j++) {
      const px = x0 + (i + 0.5) * ((x1 - x0) / nx), pz = z0 + (j + 0.5) * ((z1 - z0) / nz) + (inset ? cl * 0.25 : 0);
      const jx = (hash01(i + k * 11, j + c.seed) - 0.5) * 0.04;
      c.mesh.box(px + jx, y + bh / 2 + k * bh, pz, cw * 0.97, bh * 0.98, cl * 0.97, STRAW_BALE, c.coarse ? 0 : 0.035);
      if (!c.coarse) for (const t of [-0.25, 0.25]) {
        c.mesh.dressing(() => {
          const tx = along ? 0 : t * cl, tz = along ? t * cl : 0;
          c.mesh.box(px + jx + (along ? 0 : tx), y + bh / 2 + k * bh, pz + (along ? tz : 0), along ? cw * 0.985 : 0.012, bh + 0.006,
            along ? 0.012 : cl * 0.985, TWINE, 0);
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------------- the assembly

interface WheelPlace { readonly x: number; readonly y: number; readonly z: number; readonly side: 1 | -1; readonly r: number;
  readonly halfWidth: number; readonly emit: () => void }

interface Assembly {
  readonly wheels: readonly WheelPlace[];
  /** Everything that rides on the axles (frame, bed, shafts, fittings), in the level frame. */
  readonly body: () => void;
  readonly load?: () => void;
  /** Turned about the axle line (y, z) by `pitch` (+ nose down): a cart tipped onto its shafts. */
  readonly rest?: { readonly y: number; readonly z: number; readonly pitch: number };
  /** Loose boards the wreck scatters (their size). */
  readonly debris?: { readonly w: number; readonly l: number };
  /** Round 4: what lies on the ground about it (the load's spill), in the level frame, intact or wrecked (desktop). */
  readonly ground?: () => void;
}

/** The pitch (+ nose down) that brings `tip` (in the level frame) to the ground, turning about the axle (y, z). */
function restPitch(axleY: number, axleZ: number, tip: readonly [number, number]): number {
  const dy = tip[0] - axleY, dz = tip[1] - axleZ;
  // y(θ) = axleY + dy cosθ - dz sinθ = 0
  let lo = -0.6, hi = 0.8;
  for (let k = 0; k < 50; k++) {
    const mid = (lo + hi) / 2;
    if (axleY + dy * Math.cos(mid) - dz * Math.sin(mid) > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

function emitWheel(c: Ctx, w: WheelPlace): void {
  c.mesh.push().translate(w.x, w.y, w.z).scale(w.side, 1, 1);
  w.emit();
  c.mesh.pop();
}

/**
 * Stand a cart up (intact), or smash it: the left wheel nearest the pulling end off and lying flat beside it, the bed
 * fallen onto that side about the far wheel's hub (a four-wheeler pitched onto its broken corner as well), the load
 * slumped toward the low side, two boards loose on the ground.
 */
function assemble(c: Ctx, a: Assembly, wrecked: boolean): void {
  const mesh = c.mesh;
  if (!wrecked) {
    for (const w of a.wheels) emitWheel(c, w);
    mesh.push();
    if (a.rest) mesh.translate(0, a.rest.y, a.rest.z).rotateX(a.rest.pitch).translate(0, -a.rest.y, -a.rest.z);
    a.body();
    a.load?.();
    mesh.pop();
    a.ground?.();
    return;
  }
  const lefts = a.wheels.filter((w) => w.side < 0);
  const lost = lefts.reduce<WheelPlace | null>((best, w) => (!best || w.z > best.z ? w : best), null);
  const keep = a.wheels.filter((w) => w !== lost);
  const pivot = keep.find((w) => w.side > 0 && (!lost || Math.abs(w.z - lost.z) < 0.4)) ?? keep[0];
  const span = Math.max(0.3, pivot ? pivot.x - (lost?.x ?? -pivot.x) : 0.6);
  const drop = lost ? lost.y * 0.85 : 0.2;
  const roll = Math.asin(Math.min(0.9, drop / span));
  const four = a.wheels.length >= 4;
  for (const w of keep) {
    if (w === pivot || !four) emitWheel(c, w);
    else emitWheel(c, w);
  }
  if (lost) {
    // the lost wheel lies flat beside the bed, its outer face up
    mesh.push().translate(lost.x - lost.r * 0.75, lost.halfWidth, lost.z + lost.r * 0.35).rotateZ(Math.PI / 2).rotateX(0.4);
    lost.emit();
    mesh.pop();
  }
  mesh.push();
  if (pivot) mesh.translate(pivot.x, pivot.y, pivot.z).rotateZ(roll);
  if (four && lost) mesh.rotateX(Math.asin(Math.min(0.5, drop * 0.5 / Math.max(0.5, Math.abs(lost.z - (keep.find((w) => w.side < 0)?.z ?? 0))))));
  if (pivot) mesh.translate(-pivot.x, -pivot.y, -pivot.z);
  if (a.rest) mesh.translate(0, a.rest.y, a.rest.z).rotateX(a.rest.pitch * 0.6).translate(0, -a.rest.y, -a.rest.z);
  a.body();
  if (a.load) {
    mesh.push().translate(-0.12, -0.05, 0).scale(1.12, 0.62, 1.04);
    a.load();
    mesh.pop();
  }
  mesh.pop();
  // two boards loose on the ground by the fallen side (inside the cart's own reach)
  const d = a.debris ?? { w: 0.14, l: 1.1 };
  const x0 = lost ? lost.x - lost.r * 0.35 : -0.25, z0 = lost?.z ?? 0;
  for (let k = 0; k < 2; k++) {
    mesh.push().translate(x0 - k * 0.22, 0.012 + k * 0.026, z0 + (k ? 0.4 : -0.3)).rotateY(0.5 + k * 1.2);
    board(c, 0, 0, 0, d.w, 0.024, Math.min(d.l, 0.9), woodOf(c, 50 + k));
    mesh.pop();
  }
  a.ground?.();
}

// ---------------------------------------------------------------------------------------------------- the families

interface Common {
  /** Natural wood shades (sRGB), board by board. */
  readonly wood: readonly number[];
}

/** A two-wheeled push or pull handcart: the French charrette à bras, the Dutch handkar, the British GS handcart. */
interface CharretteSpec extends Common {
  readonly kind: 'charrette';
  readonly bedL: number;
  readonly bedW: number;
  readonly sideH: number;
  readonly wheelR: number;
  readonly spokes: number;
  /** The arms' reach ahead of the bed (the handles, joined by a cross bar). */
  readonly arms: number;
  readonly tyre: 'iron' | 'rubber';
  /** Which parts wear the copy's colour. */
  readonly painted: 'body' | 'wheels' | 'none';
  readonly load: 'sacks' | 'crates' | 'firewood' | 'cans' | 'empty';
  /** Level on a prop leg, or tipped forward onto the arms' ends. */
  readonly rest: 'prop' | 'arms';
}

function charrette(c: Ctx, s: CharretteSpec): Assembly {
  const R = s.wheelR, axleZ = -0.08, hl = s.bedL / 2, hw = s.bedW / 2;
  const frameY = R + 0.07, floorY = frameY + 0.05;
  const panel = s.painted === 'body' ? PAINT_WOOD : null;
  const wheelX = hw + 0.08;
  const wheel: SpokeWheelSpec = { r: R, w: 0.05, rim: 'felloe', felloe: R * 0.13, spokes: s.spokes, nave: 0.065, naveL: 0.2,
    tyre: s.tyre, dish: 0.025, painted: s.painted === 'wheels' };
  const wheels: WheelPlace[] = [1, -1].map((side) => ({ x: side * wheelX, y: R, z: axleZ, side: side as 1 | -1, r: R, halfWidth: 0.1,
    emit: () => spokeWheel(c, wheel) }));
  const tipZ = hl + s.arms, tipY = frameY + 0.02;
  const body = () => {
    // the arms: two long timbers from the tail to the handle bar, the bed's frame
    // the arms: two long timbers from the tail to the handle bar, the bed's frame; ahead of the bed they are the
    // handles, thin wood a hull brushes aside (dressing: no collision, no part of the footprint)
    const armAt = (z: number): Vec3 => [0, lerp(frameY, tipY, (z + hl + 0.04) / (tipZ + hl + 0.04)), z];
    for (const sx of [-1, 1]) {
      const xAt = (z: number) => sx * lerp(hw - 0.04, hw - 0.07, (z + hl + 0.04) / (tipZ + hl + 0.04));
      const a0 = armAt(-hl - 0.04), a1 = armAt(hl), a2 = armAt(tipZ);
      beam(c.mesh, [xAt(-hl - 0.04), a0[1], a0[2]], [xAt(hl), a1[1], a1[2]], 0.055, 0.075, woodOf(c, 1 + sx));
      c.mesh.dressing(() => beam(c.mesh, [xAt(hl), a1[1], a1[2]], [xAt(tipZ), a2[1], a2[2]], 0.055, 0.075, woodOf(c, 1 + sx)));
    }
    c.mesh.dressing(() => rod(c, [-(hw - 0.06), tipY, tipZ - 0.05], [hw - 0.06, tipY, tipZ - 0.05], 0.022, woodOf(c, 4), true));
    // the axle: an iron bar under its bed block
    rod(c, [-wheelX - 0.08, R, axleZ], [wheelX + 0.08, R, axleZ], 0.022, IRON, true);
    board(c, 0, R + 0.04, axleZ, s.bedW + 0.02, 0.06, 0.1, woodOf(c, 5));
    // the floor: boards along the bed
    const nb = Math.max(3, Math.round(s.bedW / 0.15));
    for (let k = 0; k < nb; k++) {
      const x = -hw + (k + 0.5) * (s.bedW / nb);
      board(c, x, floorY, 0, s.bedW / nb - 0.008, 0.024, s.bedL, panel ?? woodOf(c, 10 + k));
    }
    // the sides: two boards on three stakes a side, a headboard, a low tailboard
    for (const sx of [-1, 1]) {
      for (const z of [-hl + 0.05, 0, hl - 0.05]) board(c, sx * (hw + 0.012), floorY + s.sideH / 2, z, 0.04, s.sideH + 0.03, 0.045, woodOf(c, 20));
      for (let b = 0; b < 2; b++) {
        board(c, sx * (hw - 0.012), floorY + 0.012 + (b + 0.5) * (s.sideH / 2), 0, 0.022, s.sideH / 2 - 0.012, s.bedL, panel ?? woodOf(c, 22 + b + sx));
      }
    }
    board(c, 0, floorY + 0.012 + s.sideH / 2, hl - 0.012, s.bedW - 0.03, s.sideH, 0.022, panel ?? woodOf(c, 26));
    board(c, 0, floorY + 0.012 + s.sideH * 0.22, -hl + 0.012, s.bedW - 0.03, s.sideH * 0.44, 0.022, panel ?? woodOf(c, 27));
    // iron corner straps (desktop)
    if (!c.coarse) {
      c.mesh.dressing(() => {
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          c.mesh.box(sx * (hw + 0.002), floorY + s.sideH * 0.5, sz * (hl - 0.02), 0.006, s.sideH * 0.9, 0.035, IRON, 0);
        }
      });
    }
    // the prop: a leg under the bed's front, or nothing (the cart rests on its arms)
    if (s.rest === 'prop') {
      for (const sx of [-1, 1]) beam(c.mesh, [sx * (hw - 0.05), frameY - 0.02, hl - 0.12], [sx * (hw - 0.02), 0.0, hl - 0.05], 0.045, 0.045, woodOf(c, 28));
    }
  };
  // round 5 (wave 278: "spotless uniform flat blue… no chipping or scuffing"): a painted body worn back to the grey
  // wood along the sides' top edges, the corners and the floor's lip, where hands and loads rub (dressing)
  const wear = panel && !c.coarse ? () => c.mesh.dressing(() => {
    for (const sx of [-1, 1]) {
      const x = sx * (hw + 0.0005), n: Vec3 = [sx, 0, 0], yTop = floorY + 0.012 + s.sideH;
      for (let k = 0; k < 6; k++) {
        const z0 = -hl + 0.1 + (k / 6) * (s.bedL - 0.2) + hash01(k, c.seed + 401 + sx) * 0.12, len = 0.06 + 0.14 * hash01(k, c.seed + 403 + sx);
        const d = 0.012 + 0.03 * hash01(k, c.seed + 405 + sx);
        face4(c.mesh, [[x, yTop - d, z0], [x, yTop - d * 0.4, z0 + len], [x, yTop, z0 + len], [x, yTop, z0]], n, PAINT_CHIP);
      }
      for (const end of [-1, 1]) {
        const z = end * (hl - 0.004), w = 0.05 + 0.04 * hash01(end + 2, c.seed + 407 + sx);
        face4(c.mesh, [[x, floorY + 0.03, z - end * w], [x, floorY + 0.03, z], [x, yTop - 0.02, z], [x, yTop - 0.06, z - end * w * 0.6]], n, PAINT_CHIP);
      }
    }
  }) : null;
  const load = s.load === 'empty' ? undefined : () => {
    const y = floorY + 0.012;
    wear?.();
    if (s.load === 'sacks') {
      sack(c, -hw * 0.45, y, 0.05, hw * 0.85, 0.24, s.bedL * 0.55, 0.06, BURLAP);
      sack(c, hw * 0.45, y, -0.1, hw * 0.85, 0.24, s.bedL * 0.5, -0.05, BURLAP_DARK);
      sack(c, 0.02, y + 0.2, -0.02, hw * 0.9, 0.22, s.bedL * 0.48, 0.3, BURLAP);
    } else if (s.load === 'crates') {
      crate(c, -hw * 0.45, y, -hl * 0.4, hw * 0.85, 0.32, 0.42, 0.05);
      crate(c, hw * 0.45, y, -hl * 0.35, hw * 0.85, 0.32, 0.42, -0.04);
      crate(c, 0, y + 0.32, -hl * 0.38, hw * 0.9, 0.3, 0.42, 0.12);
      for (const dz of [-0.1, 0.1]) lashStack(c, -hl * 0.38 + dz, y, [[hw * 0.875, y + 0.32], [hw * 0.47, y + 0.62]]);
    } else if (s.load === 'firewood') {
      firewood(c, 0, y, -0.05, s.bedW * 0.86, s.bedL * 0.7, 3);
    } else {
      for (let k = 0; k < 4; k++) canister(c, (k % 2 ? 1 : -1) * hw * 0.42, y, (k < 2 ? -1 : 1) * hl * 0.3, 0.1 * k, k % 3 ? IRON_WORN : fixed(0x4a5a3a, 0.6, 0.2, 'steel'));
    }
  };
  const rest = s.rest === 'arms' ? { y: R, z: axleZ, pitch: restPitch(R, axleZ, [tipY - 0.03, tipZ]) } : undefined;
  return { wheels, body, load, rest, debris: { w: 0.13, l: s.bedL * 0.8 } };
}

/** A four-wheeled hand ladder wagon (Leiterwagen, wóz), or its plank-sided 1980s cousin (Bollerwagen). */
interface LeiterwagenSpec extends Common {
  readonly kind: 'leiterwagen';
  readonly bedL: number;
  readonly bedW: number;
  readonly sides: 'ladder' | 'boards';
  readonly sideH: number;
  readonly flare: number;
  readonly wheelF: number;
  readonly wheelR: number;
  readonly tyre: 'iron' | 'rubber';
  readonly painted: 'wheels' | 'body' | 'none';
  readonly load: 'sacks' | 'firewood' | 'cans' | 'empty';
}

function leiterwagen(c: Ctx, s: LeiterwagenSpec): Assembly {
  const hl = s.bedL / 2, hw = s.bedW / 2;
  const floorY = Math.max(s.wheelF, s.wheelR) + 0.09;
  const zF = hl - 0.17, zR = -hl + 0.2;
  const track = hw + 0.075;
  const steelRim = s.tyre === 'rubber';
  const spec = (r: number): SpokeWheelSpec => ({ r, w: 0.04, rim: steelRim ? 'steel' : 'felloe', felloe: r * 0.16, spokes: steelRim ? 10 : 8,
    spoke: steelRim ? 0.009 : undefined, nave: steelRim ? 0.035 : 0.045, naveL: 0.12, tyre: s.tyre, painted: s.painted === 'wheels' });
  const wheels: WheelPlace[] = [];
  for (const side of [1, -1] as const) {
    wheels.push({ x: side * track, y: s.wheelF, z: zF, side, r: s.wheelF, halfWidth: 0.06, emit: () => spokeWheel(c, spec(s.wheelF)) });
    wheels.push({ x: side * track, y: s.wheelR, z: zR, side, r: s.wheelR, halfWidth: 0.06, emit: () => spokeWheel(c, spec(s.wheelR)) });
  }
  const panel = s.painted === 'body' ? PAINT_WOOD : null;
  const tip: Vec3 = [0, 0.03, hl + 0.95];
  const body = () => {
    // running gear: axles on their blocks, the front one on a bolster turning on its king pin, the reach between
    for (const [z, r] of [[zF, s.wheelF], [zR, s.wheelR]] as const) {
      rod(c, [-track - 0.05, r, z], [track + 0.05, r, z], 0.014, IRON, true);
      board(c, 0, (r + floorY) / 2 - 0.01, z, s.bedW * 0.92, floorY - r - 0.02, 0.06, woodOf(c, 3));
    }
    beam(c.mesh, [0, floorY - 0.05, zR - 0.06], [0, floorY - 0.05, zF + 0.04], 0.05, 0.04, woodOf(c, 4));
    // the drawbar: hinged at the front axle, down to the ground ahead, a T handle
    c.mesh.dressing(() => {
      beam(c.mesh, [0, s.wheelF - 0.01, zF + 0.04], tip, 0.035, 0.03, woodOf(c, 5));
      rod(c, [-0.17, tip[1] + 0.015, tip[2] - 0.02], [0.17, tip[1] + 0.015, tip[2] - 0.02], 0.016, woodOf(c, 6), true);
    });
    if (!c.coarse) rod(c, [0, s.wheelF - 0.01, zF + 0.02], [0, s.wheelF - 0.01, zF + 0.12], 0.02, IRON, true);
    // the floor
    const nb = 3;
    for (let k = 0; k < nb; k++) board(c, -hw + (k + 0.5) * (s.bedW / nb), floorY, 0, s.bedW / nb - 0.006, 0.02, s.bedL, panel ?? woodOf(c, 10 + k));
    if (s.sides === 'ladder') {
      for (const sx of [-1, 1]) {
        const lo: Vec3 = [sx * hw, floorY + 0.02, 0], hi: Vec3 = [sx * (hw + s.flare), floorY + s.sideH, 0];
        rod(c, [lo[0], lo[1], -hl - 0.05], [lo[0], lo[1], hl + 0.05], 0.018, woodOf(c, 14 + sx), true);
        rod(c, [hi[0], hi[1], -hl - 0.07], [hi[0], hi[1], hl + 0.07], 0.02, woodOf(c, 16 + sx), true);
        const rungs = Math.max(5, Math.round(s.bedL / 0.13));
        for (let k = 0; k <= rungs; k++) {
          const z = -hl + 0.02 + (k / rungs) * (s.bedL - 0.04);
          rod(c, [lo[0], lo[1], z], [hi[0], hi[1], z], 0.008, woodOf(c, 18), false, 4);
        }
        // the stakes holding the ladders out, at the axles
        for (const z of [zF, zR]) beam(c.mesh, [sx * (hw - 0.01), floorY - 0.05, z], [hi[0] * 0.98, hi[1] - 0.02, z], 0.025, 0.03, woodOf(c, 19));
      }
      // short end ladders
      for (const sz of [-1, 1]) {
        board(c, 0, floorY + s.sideH * 0.3, sz * (hl + 0.01), s.bedW + s.flare * 0.8, 0.05, 0.02, woodOf(c, 22));
        board(c, 0, floorY + s.sideH * 0.75, sz * (hl + 0.01), s.bedW + s.flare * 1.6, 0.04, 0.02, woodOf(c, 23));
      }
    } else {
      for (const sx of [-1, 1]) for (let b = 0; b < 2; b++) {
        board(c, sx * (hw + 0.01), floorY + 0.01 + (b + 0.5) * (s.sideH / 2), 0, 0.02, s.sideH / 2 - 0.01, s.bedL + 0.02, panel ?? woodOf(c, 24 + b));
      }
      for (const sz of [-1, 1]) board(c, 0, floorY + 0.01 + s.sideH / 2, sz * (hl + 0.0), s.bedW, s.sideH, 0.02, panel ?? woodOf(c, 26));
      if (!c.coarse) c.mesh.dressing(() => {
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.mesh.box(sx * (hw + 0.022), floorY + s.sideH / 2, sz * (hl - 0.02), 0.005, s.sideH, 0.03, IRON, 0);
      });
    }
  };
  const load = s.load === 'empty' ? undefined : () => {
    const y = floorY + 0.01;
    if (s.load === 'sacks') {
      sack(c, 0, y, -0.12, s.bedW * 0.86, 0.22, s.bedL * 0.42, 0.04, BURLAP);
      sack(c, 0.02, y, 0.3, s.bedW * 0.8, 0.2, s.bedL * 0.3, -0.12, BURLAP_DARK);
    } else if (s.load === 'firewood') {
      firewood(c, 0, y, 0, s.bedW * 0.9, s.bedL * 0.8, 3);
    } else {
      for (let k = 0; k < 4; k++) canister(c, (k % 2 ? 0.09 : -0.09), y, -hl * 0.6 + k * hl * 0.4, 0.05 * k, k % 2 ? fixed(0x3e4a34, 0.6, 0.2, 'steel') : IRON_WORN);
    }
  };
  return { wheels, body, load, debris: { w: 0.1, l: s.bedL * 0.7 } };
}

/** A wheelbarrow: the wooden box barrow on a wooden wheel, or the contractor's steel tub on a pneumatic tyre. */
interface BarrowSpec extends Common {
  readonly kind: 'barrow';
  readonly style: 'wood' | 'steel';
  readonly wheelR: number;
  readonly trayL: number;
  readonly trayW: number;
  readonly trayD: number;
  /** The steel tub's colour (the copy's), or galvanised. */
  readonly tub: 'painted' | 'galvanised';
  readonly load: 'sand' | 'bricks' | 'firewood' | 'coal' | 'empty';
}

function barrow(c: Ctx, s: BarrowSpec): Assembly {
  const R = s.wheelR, wheelZ = 0.62;
  const gripZ = -0.95, gripY = 0.5, legZ = -0.32;
  const armX = (z: number) => lerp(0.075, 0.29, Math.max(0, Math.min(1, (wheelZ - z) / (wheelZ - gripZ))));
  const armY = (z: number) => lerp(R, gripY, (wheelZ - z) / (wheelZ - gripZ));
  const wheels: WheelPlace[] = [{ x: 0, y: R, z: wheelZ, side: 1, r: R, halfWidth: 0.05, emit: () => {
    if (s.style === 'wood') spokeWheel(c, { r: R, w: 0.045, rim: 'felloe', felloe: R * 0.18, spokes: 8, nave: 0.04, naveL: 0.1, tyre: 'iron' });
    else { c.mesh.push().translate(-0.005, 0, 0); tyreWheel(c, R, 0.085, 0.5); c.mesh.pop(); }
  } }];
  const trayZ = 0.06, tl = s.trayL / 2;
  const body = () => {
    const arm = s.style === 'wood' ? woodOf(c, 1) : PAINT_STEEL;
    for (const sx of [-1, 1]) {
      if (s.style === 'wood') {
        beam(c.mesh, [sx * armX(wheelZ + 0.06), armY(wheelZ + 0.06), wheelZ + 0.06], [sx * armX(gripZ), armY(gripZ), gripZ], 0.045, 0.055, arm);
      } else {
        bentRod(c, [[sx * 0.07, R, wheelZ], [sx * armX(trayZ + tl), armY(trayZ + tl) - 0.05, trayZ + tl * 0.6],
          [sx * armX(legZ), armY(legZ) - 0.04, legZ], [sx * armX(gripZ + 0.1), armY(gripZ + 0.1), gripZ + 0.1], [sx * armX(gripZ), armY(gripZ), gripZ]],
        0.017, IRON_WORN);
        bentRod(c, [[sx * armX(gripZ + 0.14), armY(gripZ + 0.14), gripZ + 0.14], [sx * armX(gripZ - 0.02), armY(gripZ - 0.02), gripZ - 0.02]], 0.021, BLACK_PLASTIC);
      }
      // the legs
      const top: Vec3 = [sx * armX(legZ), armY(legZ) - 0.03, legZ];
      if (s.style === 'wood') beam(c.mesh, top, [sx * (armX(legZ) + 0.03), 0, legZ - 0.03], 0.04, 0.045, woodOf(c, 2));
      else bentRod(c, [top, [sx * (armX(legZ) + 0.02), 0.06, legZ - 0.02], [sx * (armX(legZ) + 0.02), 0.0, legZ + 0.06]], 0.013, IRON_WORN);
    }
    // the axle
    rod(c, [-0.085, R, wheelZ], [0.085, R, wheelZ], 0.012, IRON, true);
    if (s.style === 'wood') {
      // the box: a floor on the arms, sides flaring out, the front board raked forward
      const fy = armY(trayZ) + 0.04;
      const bw = 0.42, tw = s.trayW, d = s.trayD;
      for (let k = 0; k < 3; k++) board(c, -bw / 2 + (k + 0.5) * (bw / 3), fy, trayZ - 0.03, bw / 3 - 0.006, 0.02, s.trayL * 0.8, woodOf(c, 10 + k));
      for (const sx of [-1, 1]) {
        c.mesh.push().translate(sx * (bw / 2 + (tw - bw) / 4), fy + d / 2, trayZ - 0.04).rotateZ(-sx * Math.atan2((tw - bw) / 2, d));
        for (let b = 0; b < 2; b++) board(c, 0, (b - 0.5) * d * 0.5, 0, 0.02, d * 0.48, s.trayL * 0.82, woodOf(c, 14 + b + sx));
        c.mesh.pop();
      }
      c.mesh.push().translate(0, fy + d / 2, trayZ + tl * 0.82).rotateX(0.62);
      board(c, 0, 0, 0, tw * 0.95, d * 1.12, 0.02, woodOf(c, 18));
      c.mesh.pop();
      board(c, 0, fy + d * 0.4, trayZ - tl * 0.84, tw * 0.9, d * 0.8, 0.02, woodOf(c, 19));
    } else {
      steelTub(c, trayZ, armY(trayZ) + 0.03, s.trayL, s.trayW, s.trayD, s.tub === 'painted' ? PAINT_STEEL : GALV);
      // the front stays from the axle up to the tub's lip
      for (const sx of [-1, 1]) rod(c, [sx * 0.07, R, wheelZ - 0.01], [sx * s.trayW * 0.28, armY(trayZ) + s.trayD * 0.75, trayZ + tl * 0.72], 0.009, IRON_WORN);
    }
  };
  const load = s.load === 'empty' ? undefined : () => {
    const y = armY(trayZ) + (s.style === 'wood' ? 0.06 : 0.05);
    if (s.load === 'firewood') firewood(c, 0, y, trayZ - 0.03, s.trayW * 0.7, s.trayL * 0.75, 2);
    else if (s.load === 'bricks') {
      for (let k = 0; k < 6; k++) c.mesh.box(((k % 3) - 1) * 0.13, y + 0.035 + Math.floor(k / 3) * 0.07, trayZ - 0.05 + (k % 2) * 0.05, 0.12, 0.065, 0.24,
        fixed(0x8a4a32, 0.9, 0, 'cargo'), 0);
    } else loaf(c, 0, y, trayZ - 0.02, s.trayW * 0.36, s.trayL * 0.38, s.trayD * 0.75, s.load === 'coal' ? [COAL] : [SAND],
      { belly: 0, lump: 0.05, ends: 2.2 });
  };
  return { wheels, body, load, debris: { w: 0.1, l: 0.7 } };
}

/** A pressed steel barrow tub: the rim a rounded oblong, the floor a smaller one set back, the front raked forward. */
function steelTub(c: Ctx, z: number, y: number, L: number, W: number, D: number, m: Mat): void {
  const nu = c.coarse ? 16 : 28, nv = c.coarse ? 3 : 5;
  const ring = (t: number, hw: number, hl: number, cr: number, out: Vec3) => {
    // a rounded rectangle traced by angle (superellipse), t in [0, 1)
    const a = t * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), e = 2 / cr;
    out[0] = hw * Math.sign(ca) * Math.pow(Math.abs(ca), e);
    out[2] = hl * Math.sign(sa) * Math.pow(Math.abs(sa), e);
  };
  const at = (inset: number) => (i: number, j: number, out: Vec3) => {
    const v = j / nv, tmp: Vec3 = [0, 0, 0], bot: Vec3 = [0, 0, 0];
    ring(i / nu, W / 2 - inset, L / 2 - inset, 3.2, tmp);
    ring(i / nu, W * 0.26 - inset, L * 0.24 - inset, 2.6, bot);
    const front = Math.max(0, Math.sin((i / nu) * Math.PI * 2));
    const zt = tmp[2] + front * L * 0.06, zb = bot[2] - L * 0.12;
    const bulge = Math.sin(v * Math.PI) * 0.025;
    out[0] = lerp(bot[0], tmp[0], v) * (1 + bulge);
    out[1] = y + lerp(0, D, Math.pow(v, 0.9)) + inset * 0.6;
    out[2] = z + lerp(zb, zt, v) * (1 + bulge);
  };
  c.mesh.grid(nu, nv, at(0), () => m, { closeU: true, flip: true });
  c.mesh.grid(nu, nv, at(0.006), () => m, { closeU: true });
  // the floors (outer and inner), fans from the centre
  for (const [inset, up] of [[0, -1], [0.006, 1]] as const) {
    const p: Vec3 = [0, 0, 0];
    const centre: Vec3 = [0, y + inset * 0.6, z - L * 0.12];
    const pts: Vec3[] = [];
    for (let i = 0; i < nu; i++) { at(inset)(i, 0, p); pts.push([p[0], p[1], p[2]]); }
    const cv = c.mesh.vert(centre[0], centre[1], centre[2], 0, up, 0, m);
    const rv = pts.map((q) => c.mesh.vert(q[0], q[1], q[2], 0, up, 0, m));
    for (let i = 0; i < nu; i++) {
      const a = rv[i], b = rv[(i + 1) % nu];
      if (up > 0) c.mesh.tri(cv, b, a); else c.mesh.tri(cv, a, b);
    }
  }
  // the rolled lip
  const lip: Vec3[] = [];
  const p: Vec3 = [0, 0, 0];
  for (let i = 0; i < nu; i++) { at(0.003)(i, nv, p); lip.push([p[0], p[1] + 0.004, p[2]]); }
  c.mesh.tube(lip, 0.011, c.coarse ? 4 : 6, m, { closed: true });
}

/** An ironworks tipping cart: a riveted steel tub on two cast wheels, flat-iron arms back to the grips, prop legs. */
interface TipCartSpec extends Common {
  readonly kind: 'tipcart';
  readonly wheelR: number;
  readonly tubL: number;
  readonly tubW: number;
  readonly tubD: number;
  readonly load: 'coal' | 'sand' | 'empty';
}

function tipcart(c: Ctx, s: TipCartSpec): Assembly {
  const R = s.wheelR, wx = s.tubW / 2 + 0.075;
  const wheels: WheelPlace[] = [1, -1].map((side) => ({ x: side * wx, y: R, z: 0.12, side: side as 1 | -1, r: R, halfWidth: 0.06,
    emit: () => castWheel(c, R, 0.06, 6) }));
  const tubY = R + 0.02, hl = s.tubL / 2, hw = s.tubW / 2;
  const body = () => {
    rod(c, [-wx - 0.05, R, 0.12], [wx + 0.05, R, 0.12], 0.02, IRON, true);
    // the tub: a floor, the sides, the front raked out for tipping, the back upright
    const m = PLATE_STEEL;
    const fl = tubY + 0.01;
    board(c, 0, fl, 0.02, s.tubW - 0.02, 0.012, s.tubL * 0.7, m);
    for (const sx of [-1, 1]) {
      // the side plates: trapezoids (the front edge raked)
      const p0: Vec3 = [sx * hw, fl, -hl * 0.7 + 0.02], p1: Vec3 = [sx * hw, fl, hl * 0.7 + 0.02];
      const p2: Vec3 = [sx * hw, fl + s.tubD, hl + 0.06], p3: Vec3 = [sx * hw, fl + s.tubD, -hl * 0.72];
      face4(c.mesh, [p0, p1, p2, p3], [sx, 0, 0], m);
      face4(c.mesh, [[p0[0] - sx * 0.006, p0[1], p0[2]], [p1[0] - sx * 0.006, p1[1], p1[2]], [p2[0] - sx * 0.006, p2[1], p2[2]],
        [p3[0] - sx * 0.006, p3[1], p3[2]]], [-sx, 0, 0], m);
      // the top edge angle and the rivet rows
      beam(c.mesh, [sx * (hw + 0.01), fl + s.tubD, -hl * 0.72 - 0.01], [sx * (hw + 0.01), fl + s.tubD, hl + 0.07], 0.025, 0.025, IRON);
      if (!c.coarse) c.mesh.dressing(() => {
        for (let k = 0; k < 7; k++) c.mesh.box(sx * (hw + 0.004), fl + 0.03, -hl * 0.6 + k * hl * 0.2, 0.008, 0.016, 0.016, IRON, 0);
      });
    }
    // the raked front and the upright back
    const front: Vec3[] = [[-hw, fl, hl * 0.7 + 0.02], [hw, fl, hl * 0.7 + 0.02], [hw, fl + s.tubD, hl + 0.06], [-hw, fl + s.tubD, hl + 0.06]];
    face4(c.mesh, front, unit([0, -0.3, 1]), m);
    face4(c.mesh, front.map((q) => [q[0], q[1], q[2] - 0.006] as Vec3), unit([0, 0.3, -1]), m);
    const back: Vec3[] = [[-hw, fl, -hl * 0.7 + 0.02], [hw, fl, -hl * 0.7 + 0.02], [hw, fl + s.tubD, -hl * 0.72], [-hw, fl + s.tubD, -hl * 0.72]];
    face4(c.mesh, back, [0, 0, -1], m);
    face4(c.mesh, back.map((q) => [q[0], q[1], q[2] + 0.006] as Vec3), [0, 0, 1], m);
    // the frame: two flat-iron rails under the tub running back into the arms, a cross stay, the legs
    for (const sx of [-1, 1]) {
      beam(c.mesh, [sx * (hw - 0.08), tubY - 0.03, hl * 0.62], [sx * (hw - 0.02), tubY + 0.18, -hl - 0.75], 0.022, 0.05, IRON);
      beam(c.mesh, [sx * (hw - 0.03), tubY + 0.17, -hl - 0.62], [sx * (hw - 0.02), tubY + 0.19, -hl - 0.8], 0.04, 0.04, woodOf(c, 3));
      beam(c.mesh, [sx * (hw - 0.05), tubY + 0.02, -hl * 0.55], [sx * (hw - 0.02), 0, -hl * 0.62], 0.03, 0.03, IRON);
    }
    beam(c.mesh, [-hw + 0.05, tubY + 0.08, -hl - 0.35], [hw - 0.05, tubY + 0.08, -hl - 0.35], 0.03, 0.03, IRON);
  };
  const load = s.load === 'empty' ? undefined : () => loaf(c, 0, tubY + 0.02, 0.05, hw * 0.88, hl * 0.66, s.tubD * 0.95,
    s.load === 'coal' ? [COAL] : [SAND], { belly: 0.02, lump: 0.08, ends: 2.4 });
  return { wheels, body, load, debris: { w: 0.05, l: 0.9 } };
}

/** A station platform barrow: a slatted deck on a channel frame, two big iron wheels amidships, a handle frame. */
interface TrolleySpec extends Common {
  readonly kind: 'trolley';
  readonly deckL: number;
  readonly deckW: number;
  readonly load: 'crates' | 'sacks' | 'cans' | 'empty';
}

function trolley(c: Ctx, s: TrolleySpec): Assembly {
  const R = 0.24, hl = s.deckL / 2, hw = s.deckW / 2, deckY = R + 0.12;
  const wx = hw - 0.13;
  const wheels: WheelPlace[] = [1, -1].map((side) => ({ x: side * wx, y: R, z: -0.1, side: side as 1 | -1, r: R, halfWidth: 0.05,
    emit: () => castWheel(c, R, 0.05, 8) }));
  const frame = PAINT_STEEL;
  const body = () => {
    rod(c, [-wx - 0.04, R, -0.1], [wx + 0.04, R, -0.1], 0.018, IRON, true);
    for (const sx of [-1, 1]) {
      beam(c.mesh, [sx * (hw - 0.02), deckY - 0.04, -hl], [sx * (hw - 0.02), deckY - 0.04, hl], 0.04, 0.08, frame);
      // the axle hangers
      beam(c.mesh, [sx * wx, deckY - 0.08, -0.1], [sx * wx, R, -0.1], 0.03, 0.05, frame);
    }
    for (const z of [-hl + 0.03, -0.1, hl - 0.03]) beam(c.mesh, [-hw + 0.02, deckY - 0.05, z], [hw - 0.02, deckY - 0.05, z], 0.05, 0.05, frame);
    const ns = Math.round(s.deckW / 0.1);
    for (let k = 0; k < ns; k++) board(c, -hw + (k + 0.5) * (s.deckW / ns), deckY + 0.012, 0, s.deckW / ns - 0.012, 0.024, s.deckL - 0.02, woodOf(c, 10 + k));
    // the end legs and the castor end
    for (const sx of [-1, 1]) {
      beam(c.mesh, [sx * (hw - 0.04), deckY - 0.06, hl - 0.06], [sx * (hw - 0.05), 0, hl - 0.08], 0.035, 0.035, frame);
      // (round 2, wave 152: "only one wheel at the rear corner") a castor at each rear corner in its fork
      beam(c.mesh, [sx * (hw - 0.04), deckY - 0.06, -hl + 0.06], [sx * (hw - 0.05), 0.2, -hl + 0.08], 0.035, 0.035, frame);
      c.mesh.push().translate(sx * (hw - 0.05), 0.09, -hl + 0.08).scale(sx, 1, 1);
      castWheel(c, 0.09, 0.04, 5);
      c.mesh.pop();
      for (const fx of [-0.032, 0.032]) beam(c.mesh, [sx * (hw - 0.05) + fx, 0.2, -hl + 0.08], [sx * (hw - 0.05) + fx, 0.09, -hl + 0.08], 0.008, 0.04, frame);
    }
    // the handle frame: corner pillars, a rail, the bent handle
    for (const sx of [-1, 1]) {
      beam(c.mesh, [sx * (hw - 0.03), deckY, hl - 0.03], [sx * (hw - 0.03), deckY + 0.68, hl - 0.03], 0.035, 0.035, frame);
      beam(c.mesh, [sx * (hw - 0.03), deckY, -hl + 0.03], [sx * (hw - 0.03), deckY + 0.16, -hl + 0.03], 0.03, 0.03, frame);
    }
    c.mesh.dressing(() => {
      rod(c, [-hw + 0.03, deckY + 0.36, hl - 0.03], [hw - 0.03, deckY + 0.36, hl - 0.03], 0.012, IRON, true);
      bentRod(c, [[-hw + 0.03, deckY + 0.66, hl - 0.03], [-hw + 0.08, deckY + 0.76, hl + 0.06], [hw - 0.08, deckY + 0.76, hl + 0.06],
        [hw - 0.03, deckY + 0.66, hl - 0.03]], 0.016, IRON);
    });
  };
  const load = s.load === 'empty' ? undefined : () => {
    const y = deckY + 0.024;
    if (s.load === 'crates') {
      crate(c, -hw * 0.45, y, -hl * 0.45, hw * 0.85, 0.38, 0.5, 0.04);
      crate(c, hw * 0.45, y, -hl * 0.4, hw * 0.85, 0.34, 0.46, -0.06);
      crate(c, 0, y, hl * 0.2, hw * 1.6, 0.3, 0.42, 0.02);
      crate(c, 0.02, y + 0.38, -hl * 0.42, hw * 0.9, 0.3, 0.4, 0.15);
      for (const dz of [-0.09, 0.09]) lashStack(c, -hl * 0.42 + dz, y, [[hw * 0.875, y + 0.38], [hw * 0.5, y + 0.68]]);
      lashStack(c, hl * 0.2, y, [[hw * 0.8, y + 0.3]]);
    } else if (s.load === 'sacks') {
      for (let k = 0; k < 3; k++) sack(c, 0, y + (k === 2 ? 0.2 : 0), -hl * 0.4 + k * hl * 0.4 - (k === 2 ? hl * 0.6 : 0), hw * 1.5, 0.22, 0.5, 0.05 * k, k % 2 ? BURLAP : BURLAP_DARK);
    } else {
      for (let k = 0; k < 3; k++) {
        c.mesh.push().translate(0, y, -hl * 0.5 + k * 0.38).rotateZ(Math.PI / 2);
        c.mesh.lathe([[0.0001, 0], [0.15, 0], [0.16, 0.02], [0.16, 0.5], [0.1, 0.6], [0.05, 0.62], [0.05, 0.66], [0.0001, 0.66]].map(([r, h]) => [r, h] as [number, number]),
          c.coarse ? 8 : 12, () => GALV);
        c.mesh.pop();
      }
    }
  };
  return { wheels, body, load, debris: { w: 0.1, l: 1.0 } };
}

/** A barrow-boy's cart on car wheels (the souk's arabiya): a plank deck on one axle, two arms and a cross bar. */
interface TyreCartSpec extends Common {
  readonly kind: 'tyrecart';
  readonly deckL: number;
  readonly deckW: number;
  readonly wheelR: number;
  readonly painted: boolean;
  readonly load: 'crates' | 'sacks' | 'cans' | 'empty';
}

function tyrecart(c: Ctx, s: TyreCartSpec): Assembly {
  const R = s.wheelR, hl = s.deckL / 2, hw = s.deckW / 2, deckY = R + 0.16, wx = hw + 0.06;
  const wheels: WheelPlace[] = [1, -1].map((side) => ({ x: side * wx, y: R, z: -0.08, side: side as 1 | -1, r: R, halfWidth: 0.09,
    emit: () => tyreWheel(c, R, 0.14, 0.55) }));
  const panel = s.painted ? PAINT_WOOD : null;
  const tipZ = hl + 0.55;
  const body = () => {
    rod(c, [-wx + 0.04, R, -0.08], [wx - 0.04, R, -0.08], 0.02, IRON, true);
    for (const sx of [-1, 1]) {
      beam(c.mesh, [sx * (hw - 0.05), deckY - 0.05, -hl], [sx * (hw - 0.09), deckY - 0.03, tipZ], 0.05, 0.065, woodOf(c, 1 + sx));
      beam(c.mesh, [sx * (hw - 0.05), deckY - 0.08, -0.08], [sx * (wx - 0.06), R, -0.08], 0.04, 0.04, IRON);
    }
    rod(c, [-(hw - 0.08), deckY - 0.03, tipZ - 0.05], [hw - 0.08, deckY - 0.03, tipZ - 0.05], 0.02, woodOf(c, 4), true);
    const nb = Math.round(s.deckW / 0.15);
    for (let k = 0; k < nb; k++) board(c, -hw + (k + 0.5) * (s.deckW / nb), deckY, 0, s.deckW / nb - 0.008, 0.026, s.deckL, panel ?? woodOf(c, 10 + k));
    for (const sx of [-1, 1]) {
      board(c, sx * (hw - 0.01), deckY + 0.07, 0, 0.022, 0.11, s.deckL, panel ?? woodOf(c, 20));
    }
    board(c, 0, deckY + 0.07, -hl + 0.01, s.deckW, 0.11, 0.022, panel ?? woodOf(c, 21));
    // the prop under the front
    beam(c.mesh, [0, deckY - 0.04, hl - 0.06], [0, 0, hl - 0.02], 0.05, 0.05, woodOf(c, 22));
  };
  const load = s.load === 'empty' ? undefined : () => {
    const y = deckY + 0.013;
    if (s.load === 'crates') {
      for (let k = 0; k < 4; k++) crate(c, (k % 2 ? 1 : -1) * hw * 0.45, y + (k > 1 ? 0.3 : 0), -0.2 + (k > 1 ? 0.05 : 0), hw * 0.82, 0.28, 0.4, 0.06 * k);
      for (const dz of [-0.09, 0.08]) lashStack(c, -0.17 + dz, y, [[hw * 0.87, y + 0.58]]);
    } else if (s.load === 'sacks') {
      sack(c, -hw * 0.42, y, -0.05, hw * 0.8, 0.26, s.deckL * 0.5, 0.04, BURLAP);
      sack(c, hw * 0.42, y, 0.0, hw * 0.8, 0.24, s.deckL * 0.46, -0.06, BURLAP_DARK);
    } else {
      for (let k = 0; k < 4; k++) canister(c, (k % 2 ? 1 : -1) * hw * 0.4, y, (k < 2 ? -1 : 1) * hl * 0.32, 0.08 * k, [fixed(0x2f6f9a), fixed(0xd8d4c8), fixed(0x3a8a5a)][k % 3]);
    }
  };
  return { wheels, body, load, debris: { w: 0.14, l: s.deckL * 0.7 } };
}

/** The Japanese riyakā: a steel tube frame and deck on two bicycle wheels, a U handle ahead. */
interface RiyakaSpec extends Common {
  readonly kind: 'riyaka';
  readonly deckL: number;
  readonly deckW: number;
  readonly load: 'crates' | 'sacks' | 'empty';
}

function riyaka(c: Ctx, s: RiyakaSpec): Assembly {
  const R = 0.31, hl = s.deckL / 2, hw = s.deckW / 2, deckY = R + 0.09, wx = hw + 0.06;
  const wheels: WheelPlace[] = [1, -1].map((side) => ({ x: side * wx, y: R, z: -0.05, side: side as 1 | -1, r: R, halfWidth: 0.05,
    emit: () => spokeWheel(c, { r: R, w: 0.042, rim: 'steel', spokes: c.coarse ? 12 : 18, spoke: 0.0045, nave: 0.025, naveL: 0.1,
      tyre: 'bicycle' }) }));
  const tube = PAINT_STEEL;
  const body = () => {
    rod(c, [-wx - 0.03, R, -0.05], [wx + 0.03, R, -0.05], 0.011, IRON, true);
    // the frame: a rectangle, cross tubes, the axle hangers
    bentRod(c, [[-hw, deckY, -hl], [hw, deckY, -hl], [hw, deckY, hl], [-hw, deckY, hl], [-hw, deckY, -hl]], 0.013, tube, false);
    for (const z of [-hl * 0.5, -0.05, hl * 0.5]) rod(c, [-hw, deckY - 0.01, z], [hw, deckY - 0.01, z], 0.01, tube);
    for (const sx of [-1, 1]) {
      beam(c.mesh, [sx * hw, deckY - 0.01, -0.05], [sx * (wx - 0.035), R, -0.05], 0.022, 0.012, tube, false, [0, 0, 1]);
      // low side rails
      for (const z of [-hl + 0.02, 0, hl - 0.02]) rod(c, [sx * hw, deckY, z], [sx * hw, deckY + 0.16, z], 0.009, tube);
      rod(c, [sx * hw, deckY + 0.16, -hl + 0.02], [sx * hw, deckY + 0.16, hl - 0.02], 0.01, tube, true);
      // mudguards over the wheels
      const guard: Vec3[] = [];
      for (let k = 0; k <= 6; k++) {
        const a = -0.9 + (k / 6) * 1.8;
        guard.push([sx * wx, R + Math.cos(a) * (R + 0.04), -0.05 + Math.sin(a) * (R + 0.04)]);
      }
      c.mesh.sweep(guard, [[-0.035, 0], [0.035, 0], [0.035, 0.004], [-0.035, 0.004]], () => tube, { closedSection: true, creases: [0, 1, 2, 3] });
    }
    // the deck: checker plate
    board(c, 0, deckY + 0.006, 0, s.deckW - 0.02, 0.006, s.deckL - 0.02, GALV);
    // the U handle ahead, at hip height when the cart is level
    bentRod(c, [[-hw + 0.04, deckY, hl], [-hw + 0.06, deckY + 0.1, hl + 0.25], [-0.2, deckY + 0.16, hl + 0.5], [0.2, deckY + 0.16, hl + 0.5],
      [hw - 0.06, deckY + 0.1, hl + 0.25], [hw - 0.04, deckY, hl]], 0.014, tube);
    // the stand
    bentRod(c, [[-0.18, deckY, hl - 0.05], [-0.2, 0.0, hl - 0.02], [0.2, 0.0, hl - 0.02], [0.18, deckY, hl - 0.05]], 0.011, tube);
  };
  const load = s.load === 'empty' ? undefined : () => {
    const y = deckY + 0.01;
    if (s.load === 'crates') {
      // two produce crates and a rice sack
      for (let k = 0; k < 2; k++) {
        c.mesh.push().translate((k - 0.5) * 0.36, y, -0.28).rotateY(0.04 * k);
        produceCrate(c, 0.33, 0.24, 0.5, k ? fixed(0x2f5f9a, 0.55, 0, 'cargo') : fixed(0xc8a83a, 0.55, 0, 'cargo'));
        c.mesh.pop();
      }
      sack(c, 0.0, y, 0.25, s.deckW * 0.62, 0.2, s.deckL * 0.36, 1.45, WOVEN_PP);
    } else {
      sack(c, 0, y, -0.1, s.deckW * 0.7, 0.22, s.deckL * 0.42, 0.04, WOVEN_PP);
    }
  };
  return { wheels, body, load, debris: { w: 0.04, l: 0.9 } };
}

/** The Dhaka thela: a heavy plank platform on two rubber-tyred wheels, its pushing bar behind. */
interface ThelaSpec extends Common {
  readonly kind: 'thela';
  readonly deckL: number;
  readonly deckW: number;
  readonly load: 'sacks' | 'crates' | 'empty';
}

function thela(c: Ctx, s: ThelaSpec): Assembly {
  const R = 0.36, hl = s.deckL / 2, hw = s.deckW / 2, deckY = R + 0.2, wx = hw - 0.1;
  const wheels: WheelPlace[] = [1, -1].map((side) => ({ x: side * wx, y: R, z: 0.05, side: side as 1 | -1, r: R, halfWidth: 0.06,
    emit: () => spokeWheel(c, { r: R, w: 0.05, rim: 'steel', spokes: c.coarse ? 12 : 20, spoke: 0.006, nave: 0.04, naveL: 0.14, tyre: 'rubber' }) }));
  const panel = PAINT_WOOD;
  const body = () => {
    rod(c, [-wx - 0.06, R, 0.05], [wx + 0.06, R, 0.05], 0.022, IRON, true);
    for (const sx of [-1, 1]) {
      beam(c.mesh, [sx * (hw - 0.06), deckY - 0.06, -hl - 0.32], [sx * (hw - 0.06), deckY - 0.06, hl], 0.07, 0.09, woodOf(c, 1 + sx));
      beam(c.mesh, [sx * wx, deckY - 0.1, 0.05], [sx * wx, R, 0.05], 0.05, 0.05, IRON);
      // the legs that stand it level
      beam(c.mesh, [sx * (hw - 0.07), deckY - 0.1, hl - 0.1], [sx * (hw - 0.06), 0, hl - 0.08], 0.05, 0.05, woodOf(c, 3));
    }
    rod(c, [-hw + 0.04, deckY - 0.06, -hl - 0.3], [hw - 0.04, deckY - 0.06, -hl - 0.3], 0.025, woodOf(c, 5), true);
    const nb = Math.round(s.deckL / 0.2);
    for (let k = 0; k < nb; k++) board(c, 0, deckY, -hl + (k + 0.5) * (s.deckL / nb), s.deckW, 0.035, s.deckL / nb - 0.012, k % 4 === 0 ? panel : woodOf(c, 10 + k));
    for (const sx of [-1, 1]) board(c, sx * (hw - 0.015), deckY + 0.04, 0, 0.03, 0.06, s.deckL, panel);
  };
  const load = s.load === 'empty' ? undefined : () => {
    const y = deckY + 0.018;
    if (s.load === 'sacks') {
      // four in two rows, the fifth lying across them (round 2: it hung over bare deck)
      for (let k = 0; k < 5; k++) sack(c, k === 4 ? 0 : (k % 2 ? 1 : -1) * hw * 0.42, y + (k === 4 ? 0.2 : 0),
        k === 4 ? -hl * 0.3 : -hl * 0.6 + Math.floor(k / 2) * hl * 0.6, hw * 0.85, 0.24, 0.62, k === 4 ? Math.PI / 2 - 0.1 : 0.05 * k,
        k % 2 ? fixed(0xd8d2be, 0.95, 0, 'canvas') : BURLAP);
    } else {
      for (let k = 0; k < 4; k++) crate(c, 0, y + Math.floor(k / 2) * 0.3, -hl * 0.4 + (k % 2) * hl * 0.6, s.deckW * 0.8, 0.28, 0.5, 0.04 * k);
      for (const zc of [-hl * 0.4, hl * 0.2]) lashStack(c, zc, y, [[s.deckW * 0.41, y + 0.58]]);
    }
  };
  return { wheels, body, load, debris: { w: 0.18, l: s.deckW } };
}

/** A pulled rickshaw (Shanghai, the 1930s): two big wheels, a lacquered seat under a folding oilcloth hood, shafts. */
interface RickshawSpec extends Common {
  readonly kind: 'rickshaw';
}

function rickshaw(c: Ctx, _s: RickshawSpec): Assembly {
  const R = 0.46, wx = 0.49, axleZ = 0;
  const wheels: WheelPlace[] = [1, -1].map((side) => ({ x: side * wx, y: R, z: axleZ, side: side as 1 | -1, r: R, halfWidth: 0.07,
    emit: () => spokeWheel(c, { r: R, w: 0.04, rim: 'felloe', felloe: 0.035, spokes: c.coarse ? 12 : 16, spoke: 0.02, nave: 0.05, naveL: 0.15,
      tyre: 'rubber', hex: 0x2a1a12 }) }));
  const lac = PAINT_WOOD, dark = fixed(0x1a1412, 0.4, 0, 'paint');
  const seatY = 0.78, sz0 = -0.34, sz1 = 0.18;
  const tip: Vec3 = [0, 0.66, 1.92];
  const body = () => {
    rod(c, [-wx - 0.02, R, axleZ], [wx + 0.02, R, axleZ], 0.016, IRON, true);
    // the shafts: from behind the seat, forward and slightly up, joined by a cross bar at their ends
    for (const sx of [-1, 1]) {
      const path = bezier([sx * 0.33, 0.58, -0.42], [sx * 0.27, tip[1], tip[2]], [sx * 0.31, 0.6, 0.6], c.coarse ? 4 : 8);
      squareSweep(c, path, 0.04, 0.05, dark);
      // the spring and the axle hanger
      beam(c.mesh, [sx * 0.33, 0.57, -0.06], [sx * wx * 0.95, R + 0.02, axleZ], 0.03, 0.03, IRON);
    }
    rod(c, [-0.28, tip[1] + 0.02, tip[2] - 0.03], [0.28, tip[1] + 0.02, tip[2] - 0.03], 0.02, dark, true);
    // the seat box, the cushion, the back
    board(c, 0, (0.6 + seatY) / 2, (sz0 + sz1) / 2, 0.72, seatY - 0.6, sz1 - sz0, lac);
    c.mesh.box(0, seatY + 0.045, (sz0 + sz1) / 2 + 0.02, 0.66, 0.09, sz1 - sz0 - 0.04, fixed(0x5a1f1a, 0.8, 0, 'canvas'), c.coarse ? 0 : 0.03);
    c.mesh.push().translate(0, seatY + 0.3, sz0 + 0.02).rotateX(-0.2);
    c.mesh.box(0, 0, 0, 0.66, 0.6, 0.06, fixed(0x5a1f1a, 0.8, 0, 'canvas'), c.coarse ? 0 : 0.025);
    c.mesh.pop();
    // the side panels (arm rests) sweeping down to the footboard brackets
    for (const sx of [-1, 1]) {
      const p0: Vec3 = [sx * 0.37, 0.6, sz0 - 0.04], p1: Vec3 = [sx * 0.37, 0.6, sz1 + 0.02], p2: Vec3 = [sx * 0.37, seatY + 0.28, sz1 - 0.08],
        p3: Vec3 = [sx * 0.37, seatY + 0.42, sz0 - 0.04];
      face4(c.mesh, [p0, p1, p2, p3], [sx, 0, 0], lac);
      face4(c.mesh, [[p0[0] - sx * 0.02, p0[1], p0[2]], [p1[0] - sx * 0.02, p1[1], p1[2]], [p2[0] - sx * 0.02, p2[1], p2[2]], [p3[0] - sx * 0.02, p3[1], p3[2]]], [-sx, 0, 0], lac);
      beam(c.mesh, [sx * 0.37, seatY + 0.3, sz1 - 0.06], [sx * 0.37, seatY + 0.43, sz0 - 0.05], 0.03, 0.03, dark);
      // the mudguard over the wheel
      const guard: Vec3[] = [];
      for (let k = 0; k <= 8; k++) {
        const a = -1.05 + (k / 8) * 2.0;
        guard.push([sx * wx, R + Math.cos(a) * (R + 0.05), axleZ + Math.sin(a) * (R + 0.05)]);
      }
      c.mesh.sweep(guard, [[-0.05, 0], [0.05, 0], [0.05, 0.006], [-0.05, 0.006]], () => dark, { closedSection: true, creases: [0, 1, 2, 3] });
      // the lamp
      if (!c.coarse) {
        c.mesh.box(sx * 0.4, seatY + 0.12, sz1 + 0.03, 0.06, 0.1, 0.06, fixed(0x8a6a2a, 0.35, 0.8, 'steel'), 0.008);
        c.mesh.box(sx * 0.4, seatY + 0.12, sz1 + 0.062, 0.04, 0.06, 0.004, fixed(0xd8c890, 0.2, 0, 'paint'), 0);
      }
    }
    // the footboard on its brackets
    board(c, 0, 0.42, 0.48, 0.6, 0.03, 0.34, lac);
    for (const sx of [-1, 1]) beam(c.mesh, [sx * 0.28, 0.43, 0.36], [sx * 0.3, 0.6, 0.12], 0.025, 0.025, IRON);
    // the hood: a folding oilcloth bellows on its bows, pivoting at the back of the arm rests
    const pv: Vec3 = [0, seatY + 0.3, sz0 + 0.06];
    const ra = 0.4, rr = 0.66;
    const nb = c.coarse ? 6 : 12, na = c.coarse ? 6 : 10;
    // the bows fan from the pivots: a = 0 points ahead, pi/2 up, pi astern
    const a0 = Math.PI * 1.06, a1 = Math.PI * 0.3;
    const hood = (inset: number) => (i: number, j: number, out: Vec3) => {
      const b = -Math.PI / 2 + (j / nb) * Math.PI, a = lerp(a0, a1, i / na);
      const r = rr - inset;
      out[0] = (ra - inset) * Math.sin(b);
      out[1] = pv[1] + r * Math.cos(b) * Math.sin(a);
      out[2] = pv[2] + r * Math.cos(b) * Math.cos(a);
    };
    c.mesh.grid(na, nb, hood(0), () => OILCLOTH, {});
    c.mesh.grid(na, nb, hood(0.008), () => OILCLOTH, { flip: true });
    if (!c.coarse) {
      for (const t of [0.0, 0.34, 0.67, 1.0]) {
        const a = lerp(a0, a1, t), bow: Vec3[] = [];
        for (let j = 0; j <= 8; j++) {
          const b = -Math.PI / 2 + (j / 8) * Math.PI;
          bow.push([(ra + 0.006) * Math.sin(b), pv[1] + (rr + 0.006) * Math.cos(b) * Math.sin(a), pv[2] + (rr + 0.006) * Math.cos(b) * Math.cos(a)]);
        }
        c.mesh.dressing(() => bentRod(c, bow, 0.008, dark, false));
      }
    }
  };
  const rest = { y: R, z: axleZ, pitch: restPitch(R, axleZ, [tip[1] - 0.02, tip[2] - 0.03]) };
  return { wheels, body, rest, debris: { w: 0.05, l: 1.4 } };
}

/** Sarajevo, the siege: an old pram's chassis carrying the water canisters home, a cord to pull it by. */
interface CanTrolleySpec extends Common {
  readonly kind: 'cantrolley';
}

function cantrolley(c: Ctx, _s: CanTrolleySpec): Assembly {
  const R = 0.12, hl = 0.42, hw = 0.24, deckY = R + 0.08;
  const wheels: WheelPlace[] = [];
  for (const side of [1, -1] as const) for (const z of [-hl + 0.05, hl - 0.05]) {
    wheels.push({ x: side * (hw + 0.03), y: R, z, side, r: R, halfWidth: 0.03,
      emit: () => spokeWheel(c, { r: R, w: 0.028, rim: 'steel', spokes: c.coarse ? 8 : 12, spoke: 0.004, nave: 0.018, naveL: 0.05, tyre: 'rubber' }) });
  }
  const tube = fixed(0x3a3c3e, 0.5, 0.5, 'steel');
  const colours = [fixed(0xe8e6de, 0.55, 0, 'paint'), fixed(0xd8b030, 0.5, 0, 'paint'), fixed(0x2f5f9a, 0.5, 0, 'paint'), fixed(0xe0ddd2, 0.55, 0, 'paint'),
    fixed(0x3a6a4a, 0.5, 0, 'paint'), fixed(0xe8e6de, 0.55, 0, 'paint')];
  const body = () => {
    for (const z of [-hl + 0.05, hl - 0.05]) rod(c, [-hw - 0.04, R, z], [hw + 0.04, R, z], 0.008, IRON, true);
    bentRod(c, [[-hw, deckY, -hl], [hw, deckY, -hl], [hw, deckY, hl], [-hw, deckY, hl], [-hw, deckY, -hl]], 0.011, tube, false);
    for (const sx of [-1, 1]) for (const z of [-hl + 0.05, hl - 0.05]) rod(c, [sx * hw, deckY, z], [sx * (hw + 0.02), R, z], 0.008, tube);
    board(c, 0, deckY + 0.01, 0, hw * 2, 0.018, hl * 2, woodOf(c, 3));
    // the pull: a cord from the front rail, lying on the ground
    if (!c.coarse) c.mesh.dressing(() => bentRod(c, [[0, deckY, hl], [0.04, 0.12, hl + 0.25], [0.12, 0.01, hl + 0.55], [0.3, 0.01, hl + 0.75]], 0.007, TWINE, true));
  };
  const load = () => {
    for (let k = 0; k < 6; k++) canister(c, (k % 2 ? 1 : -1) * 0.11, deckY + 0.02, -0.28 + Math.floor(k / 2) * 0.28, (k % 3 - 1) * 0.08, colours[k]);
    // (round 2, wave 152: "no straps... merely placed, not loaded") two webbing straps over the cans to the deck rails
    if (!c.coarse) c.mesh.dressing(() => {
      for (const z of [-0.24, 0.24]) {
        const top = deckY + 0.375, lo = deckY + 0.004;
        beam(c.mesh, [-hw - 0.005, lo, z], [-0.205, top, z], 0.04, 0.005, STRAP);
        beam(c.mesh, [-0.205, top, z], [0.205, top, z], 0.04, 0.005, STRAP);
        beam(c.mesh, [0.205, top, z], [hw + 0.005, lo, z], 0.04, 0.005, STRAP);
      }
    });
  };
  return { wheels, body, load, debris: { w: 0.05, l: 0.4 } };
}

/** A drum truck (the DEW Line's fuel drums): two wheels, a cradle, a nose plate, a drum stood on it. */
interface DrumTruckSpec extends Common {
  readonly kind: 'drumtruck';
}

function drumtruck(c: Ctx, _s: DrumTruckSpec): Assembly {
  const R = 0.16, wx = 0.27;
  const wheels: WheelPlace[] = [1, -1].map((side) => ({ x: side * wx, y: R, z: -0.2, side: side as 1 | -1, r: R, halfWidth: 0.06,
    emit: () => tyreWheel(c, R, 0.075, 0.55) }));
  const frame = fixed(0xb8341f, 0.5, 0.2, 'paint');
  const body = () => {
    rod(c, [-wx - 0.02, R, -0.2], [wx + 0.02, R, -0.2], 0.014, IRON, true);
    for (const sx of [-1, 1]) {
      bentRod(c, [[sx * 0.2, 0.03, 0.0], [sx * 0.21, R, -0.16], [sx * 0.21, 0.55, -0.2], [sx * 0.2, 1.05, -0.24], [sx * 0.16, 1.32, -0.3]], 0.016, frame);
    }
    rod(c, [-0.17, 1.3, -0.29], [0.17, 1.3, -0.29], 0.016, frame, true);
    // the cradle bands round the drum's back and the chime hook
    for (const y of [0.3, 0.72]) {
      const band: Vec3[] = [];
      for (let k = 0; k <= 8; k++) { const a = Math.PI + (k / 8) * Math.PI; band.push([Math.cos(a) * 0.31, y, 0.12 + Math.sin(a) * 0.31]); }
      bentRod(c, band, 0.011, frame, true);
    }
    // the nose plate
    board(c, 0, 0.01, 0.13, 0.42, 0.012, 0.3, IRON_WORN);
  };
  const load = () => drum(c, 0, 0.016, 0.13, 0.29, 0.88, DRUM_PAINT);
  return { wheels, body, load, debris: { w: 0.04, l: 0.6 } };
}

/** An aircraft servicing cart (Hostomel): a low four-wheeled frame cradling gas cylinders, a tow bar on the ground. */
interface BottleCartSpec extends Common {
  readonly kind: 'bottlecart';
}

function bottlecart(c: Ctx, _s: BottleCartSpec): Assembly {
  // (round 2, wave 152: "wheels far too small under the three heavy cylinders") 42 cm pneumatics under the cradles
  const R = 0.21, hl = 0.72, hw = 0.36, frameY = R + 0.12;
  const wheels: WheelPlace[] = [];
  for (const side of [1, -1] as const) for (const z of [-hl + 0.16, hl - 0.16]) {
    wheels.push({ x: side * (hw + 0.06), y: R, z, side, r: R, halfWidth: 0.06, emit: () => tyreWheel(c, R, 0.1, 0.55) });
  }
  const frame = PAINT_STEEL;
  const body = () => {
    for (const z of [-hl + 0.16, hl - 0.16]) rod(c, [-hw - 0.08, R, z], [hw + 0.08, R, z], 0.016, IRON, true);
    for (const sx of [-1, 1]) beam(c.mesh, [sx * hw, frameY, -hl], [sx * hw, frameY, hl], 0.05, 0.07, frame);
    for (const z of [-hl, -hl * 0.4, hl * 0.4, hl]) beam(c.mesh, [-hw, frameY, z], [hw, frameY, z], 0.04, 0.05, frame);
    for (const sx of [-1, 1]) for (const z of [-hl + 0.16, hl - 0.16]) beam(c.mesh, [sx * hw, frameY - 0.03, z], [sx * (hw + 0.02), R, z], 0.03, 0.04, frame);
    // the cradles
    for (const z of [-hl * 0.55, hl * 0.55]) {
      for (const sx of [-1, 0, 1]) beam(c.mesh, [sx * 0.24, frameY + 0.04, z], [sx * 0.24, frameY + 0.13, z], 0.03, 0.03, frame);
    }
    // the tow bar and ring, on the ground ahead
    beam(c.mesh, [0, R + 0.02, hl - 0.08], [0, 0.03, hl + 0.55], 0.04, 0.04, frame);
    c.mesh.push().translate(0, 0.02, hl + 0.6).rotateZ(Math.PI / 2);
    c.mesh.lathe([[0.05, -0.015], [0.065, -0.015], [0.065, 0.015], [0.05, 0.015], [0.05, -0.015]], 8, () => IRON, { creases: [1, 2, 3] });
    c.mesh.pop();
  };
  const load = () => {
    const gases = [GAS_OXYGEN, GAS_PROPANE, GAS_OXYGEN];
    for (let b = 0; b < 3; b++) {
      const x = -0.24 + b * 0.24, gas = gases[b], h = 0.72;
      c.mesh.push().translate(x, frameY + 0.17, 0).rotateY(Math.PI / 2);
      // the shoulder's white band (the gas's name stencilled on it), the neck to the valve (round 5)
      c.mesh.lathe([[0.0001, -h], [0.08, -h], [0.11, -h + 0.04], [0.115, -h + 0.12], [0.115, h - 0.22], [0.115, h - 0.12], [0.1, h - 0.03], [0.06, h],
        [0.03, h + 0.02], [0.03, h + 0.08], [0.0001, h + 0.08]], c.coarse ? 10 : 14,
        (k) => (k >= 7 ? BRASS : k === 4 ? (gas === GAS_OXYGEN ? GAS_BAND : GAS_ACETYLENE) : gas));
      c.mesh.pop();
      if (c.coarse) continue;
      c.mesh.dressing(() => {
        // the valve's hand wheel and outlet, and on the end bottles the ventilated steel cap screwed over it (the lathe's
        // turn lays the bottle's valve end toward -z)
        const nz = -(h + 0.11);
        if (b !== 1) {
          c.mesh.push().translate(x, frameY + 0.17, nz - 0.02).rotateY(-Math.PI / 2);
          c.mesh.lathe([[0.07, -0.06], [0.075, -0.04], [0.075, 0.07], [0.055, 0.1], [0.0001, 0.1]], 10, () => GALV);
          c.mesh.pop();
        } else {
          beam(c.mesh, [x - 0.05, frameY + 0.17, nz + 0.02], [x + 0.05, frameY + 0.17, nz + 0.02], 0.025, 0.025, BRASS);
          c.mesh.push().translate(x, frameY + 0.22, nz + 0.02).rotateZ(Math.PI / 2);
          c.mesh.lathe([[0.045, -0.006], [0.045, 0.006], [0.0001, 0.006]], 10, () => IRON_WORN);
          c.mesh.pop();
        }
        // scuffs: worn patches down to dark primer on the flanks a hand grips and the ground rubs
        for (let k = 0; k < 5; k++) {
          const a = (hash01(k, b * 7 + 3) - 0.5) * 2.4 + (k % 2 ? Math.PI : 0), zc = (hash01(k, b * 7 + 5) - 0.5) * 1.1;
          const w = 0.03 + 0.05 * hash01(k, b * 7 + 9), l = 0.05 + 0.12 * hash01(k, b * 7 + 11), r = 0.119;
          const p = (da: number, dz: number): Vec3 => [x + Math.sin(a + da) * r, frameY + 0.17 + Math.cos(a + da) * r, zc + dz];
          face4(c.mesh, [p(-w / r, -l / 2), p(w / r, -l / 2), p(w / r, l / 2), p(-w / r, l / 2)], [Math.sin(a), Math.cos(a), 0], GAS_SCUFF);
        }
      });
    }
    if (c.coarse) return;
    // the chain over the three, hooked to the frame either side, at both cradles
    c.mesh.dressing(() => {
      for (const z of [-hl * 0.55, hl * 0.55]) {
        const path: Vec3[] = [[-hw, frameY + 0.03, z]];
        for (let k = 0; k <= 12; k++) {
          const t = k / 12, x = -0.36 + t * 0.72, bx = Math.round((x + 0.24) / 0.24) * 0.24 - 0.24;
          const dx = Math.max(-0.12, Math.min(0.12, x - bx));
          path.push([x, frameY + 0.17 + Math.sqrt(Math.max(0, 0.124 * 0.124 - dx * dx)) * 0.98 + 0.004, z]);
        }
        path.push([hw, frameY + 0.03, z]);
        bentRod(c, path, 0.007, IRON_WORN, false);
      }
    });
  };
  return { wheels, body, load, debris: { w: 0.04, l: 0.9 } };
}

/** Apollo 17's hand tool carrier: an aluminium frame on three legs, the geology tools in their holsters. */
interface ToolCarrierSpec extends Common {
  readonly kind: 'toolcarrier';
}

function toolcarrier(c: Ctx, _s: ToolCarrierSpec): Assembly {
  const top = 0.74;
  const body = () => {
    // the frame: a tray, its posts, the tripod
    bentRod(c, [[-0.22, top, -0.15], [0.22, top, -0.15], [0.22, top, 0.15], [-0.22, top, 0.15], [-0.22, top, -0.15]], 0.012, ALU, false);
    for (const [x, z] of [[-0.22, 0.15], [0.22, 0.15]] as const) rod(c, [x, top, z], [x * 1.4, 0, z + 0.12], 0.012, ALU, true);
    rod(c, [0, top, -0.15], [0, 0, -0.42], 0.012, ALU, true);
    rod(c, [-0.2, top - 0.3, 0.17], [0.2, top - 0.3, 0.17], 0.009, ALU, true);
    // the sample bag dispenser and a gold-wrapped box on top
    board(c, 0.07, top + 0.08, 0, 0.18, 0.14, 0.22, fixed(0x9a9a92, 0.6, 0.1, 'paint'));
    board(c, -0.12, top + 0.05, 0.02, 0.12, 0.09, 0.16, GOLD_FOIL);
    // the tools: a scoop and tongs standing in holsters, a rake
    rod(c, [-0.2, 0.08, 0.13], [-0.25, 1.1, 0.16], 0.01, ALU, true);
    board(c, -0.195, 0.05, 0.13, 0.08, 0.04, 0.1, ALU);
    rod(c, [0.19, 0.1, 0.12], [0.24, 1.05, 0.17], 0.008, ALU, true);
    rod(c, [0.2, 0.1, 0.1], [0.255, 1.03, 0.15], 0.008, ALU, true);
    rod(c, [0.02, 0.05, -0.17], [0.0, 1.0, -0.2], 0.009, ALU, true);
    board(c, 0.02, 0.04, -0.17, 0.18, 0.03, 0.03, ALU);
  };
  return { wheels: [], body, debris: { w: 0.03, l: 0.6 } };
}

/** A Mars EVA cart: two wide mesh wheels, a composite tray of sample cases, a T-handle resting ahead. */
interface EvaCartSpec extends Common {
  readonly kind: 'evacart';
}

function evacart(c: Ctx, _s: EvaCartSpec): Assembly {
  const R = 0.36, wx = 0.42;
  const wheels: WheelPlace[] = [1, -1].map((side) => ({ x: side * wx, y: R, z: -0.15, side: side as 1 | -1, r: R, halfWidth: 0.08,
    emit: () => {
      c.mesh.lathe([[R - 0.02, -0.07], [R, -0.065], [R, 0.065], [R - 0.02, 0.07]], c.coarse ? 14 : 22, () => ALU, { creases: [1, 2] });
      if (!c.coarse) for (let k = 0; k < 18; k++) {
        c.mesh.push().rotateX((k / 18) * Math.PI * 2);
        c.mesh.dressing(() => c.mesh.box(0, R + 0.004, 0, 0.13, 0.008, 0.03, fixed(0x8a8a86, 0.4, 0.8, 'steel'), 0));
        c.mesh.pop();
      }
      for (let k = 0; k < 6; k++) {
        c.mesh.push().rotateX((k / 6) * Math.PI * 2);
        beam(c.mesh, [0, 0.05, 0], [0, R - 0.02, 0], 0.02, 0.03, ALU, true, [1, 0, 0]);
        c.mesh.pop();
      }
      c.mesh.lathe([[0.0001, -0.07], [0.06, -0.07], [0.06, 0.07], [0.0001, 0.07]], 10, () => ALU);
    } }));
  const body = () => {
    rod(c, [-wx, R, -0.15], [wx, R, -0.15], 0.02, ALU, true);
    c.mesh.box(0, R + 0.16, -0.12, 0.66, 0.26, 0.95, COMPOSITE, c.coarse ? 0 : 0.03);
    board(c, -0.15, R + 0.36, -0.3, 0.28, 0.16, 0.3, fixed(0xd8641e, 0.5, 0, 'paint'));
    board(c, 0.14, R + 0.34, 0.05, 0.3, 0.12, 0.36, fixed(0x8c8f92, 0.45, 0.2, 'paint'));
    for (const sx of [-1, 1]) rod(c, [sx * 0.25, R + 0.06, 0.34], [sx * 0.05, 0.06, 1.0], 0.016, ALU, true);
    rod(c, [-0.22, 0.05, 1.02], [0.22, 0.05, 1.02], 0.02, BLACK_PLASTIC, true);
    rod(c, [0, R + 0.03, -0.55], [0, 0, -0.62], 0.016, ALU, true);
  };
  return { wheels, body, debris: { w: 0.08, l: 0.7 } };
}

/**
 * A two-wheeled farm cart: the Breton charrette, the Andalusian carro under its tilt, the Norwegian kjerre, the
 * Dalmatian and Saharan donkey carts (car wheels), the bullock cart of Assam and the Mekong under its mat hood.
 */
interface Cart2Spec extends Common {
  readonly kind: 'cart2';
  readonly bedL: number;
  readonly bedW: number;
  readonly sideH: number;
  readonly sides: 'boards' | 'rails' | 'ladder';
  readonly wheelR: number;
  readonly spokes: number;
  readonly tyre: 'iron' | 'pneumatic';
  /** The shafts' reach ahead of the bed (two shafts), or a single pole to the yoke (the bullock cart). */
  readonly shafts: number;
  readonly pole?: boolean;
  readonly canopy?: 'tilt' | 'chhai';
  readonly load: 'hay' | 'seaweed' | 'sacks' | 'firewood' | 'crates' | 'empty';
  readonly painted: 'body' | 'wheels' | 'none';
  /** Tipped onto the shafts (or the pole's yoke), or held level on a prop. */
  readonly rest: 'shafts' | 'prop';
}

function cart2(c: Ctx, s: Cart2Spec): Assembly {
  const R = s.wheelR, hl = s.bedL / 2, hw = s.bedW / 2;
  const axleZ = -0.05;
  const frameY = s.tyre === 'pneumatic' ? R + 0.16 : R + 0.08;
  const floorY = frameY + 0.06;
  const wx = s.tyre === 'pneumatic' ? hw + 0.1 : hw + 0.11;
  const panel = s.painted === 'body' ? PAINT_WOOD : null;
  const wheels: WheelPlace[] = [1, -1].map((side) => ({ x: side * wx, y: R, z: axleZ, side: side as 1 | -1, r: R, halfWidth: s.tyre === 'pneumatic' ? 0.1 : 0.16,
    emit: () => (s.tyre === 'pneumatic' ? tyreWheel(c, R, 0.15, 0.6)
      : spokeWheel(c, { r: R, w: 0.07, rim: 'felloe', felloe: R * 0.11, spokes: s.spokes, nave: R * 0.14, naveL: 0.3, tyre: 'iron', dish: 0.04,
        painted: s.painted === 'wheels' })) }));
  const tipZ = hl + s.shafts;
  const tipY = frameY + 0.04;
  const body = () => {
    rod(c, [-wx - 0.12, R, axleZ], [wx + 0.12, R, axleZ], 0.03, IRON, true);
    board(c, 0, (R + frameY) / 2, axleZ, s.bedW + 0.04, frameY - R + 0.04, 0.12, woodOf(c, 3));
    if (s.pole) {
      // the bullock cart: the frame's two sides converge into the pole, the yoke across its end
      for (const sx of [-1, 1]) beam(c.mesh, [sx * (hw - 0.03), frameY, -hl], [sx * (hw - 0.05), frameY, hl * 0.6], 0.07, 0.08, woodOf(c, 1 + sx));
      for (const sx of [-1, 1]) beam(c.mesh, [sx * (hw - 0.05), frameY, hl * 0.6], [sx * 0.03, frameY + 0.02, hl + 0.6], 0.06, 0.075, woodOf(c, 1 + sx));
      c.mesh.dressing(() => {
        beam(c.mesh, [0, frameY + 0.02, hl + 0.55], [0, tipY, tipZ], 0.08, 0.08, woodOf(c, 4));
        rod(c, [-0.75, tipY + 0.07, tipZ - 0.12], [0.75, tipY + 0.07, tipZ - 0.12], 0.045, woodOf(c, 5), true);
        for (const sx of [-1, 1]) for (const dx of [0.28, 0.5]) rod(c, [sx * dx, tipY + 0.07, tipZ - 0.12], [sx * dx, tipY - 0.2, tipZ - 0.12], 0.012, woodOf(c, 6), true);
      });
    } else {
      for (const sx of [-1, 1]) {
        beam(c.mesh, [sx * (hw - 0.04), frameY, -hl - 0.05], [sx * (hw - 0.04), frameY, hl], 0.065, 0.085, woodOf(c, 1 + sx));
        // the shafts carry the frame forward and close in toward the beast's flanks (dressing, as a cart's handles)
        c.mesh.dressing(() => beam(c.mesh, [sx * (hw - 0.04), frameY, hl - 0.1], [sx * Math.min(hw - 0.04, 0.34), tipY, tipZ], 0.055, 0.07, woodOf(c, 2 + sx)));
      }
      c.mesh.dressing(() => rod(c, [-Math.min(hw, 0.38), frameY + 0.01, hl + 0.25], [Math.min(hw, 0.38), frameY + 0.01, hl + 0.25], 0.025, woodOf(c, 5), true));
    }
    // the floor across the frame
    const nb = Math.max(4, Math.round(s.bedL / 0.2));
    for (let k = 0; k < nb; k++) {
      board(c, 0, floorY, -hl + (k + 0.5) * (s.bedL / nb), s.bedW + 0.02, 0.03, s.bedL / nb - 0.012, panel ?? woodOf(c, 10 + k));
    }
    if (s.sides === 'boards') {
      for (const sx of [-1, 1]) {
        for (const z of [-hl + 0.06, -hl / 3, hl / 3, hl - 0.06]) board(c, sx * (hw + 0.015), floorY + s.sideH / 2, z, 0.05, s.sideH + 0.06, 0.05, woodOf(c, 20));
        for (let b = 0; b < 3; b++) board(c, sx * (hw - 0.012), floorY + 0.015 + (b + 0.5) * (s.sideH / 3), 0, 0.024, s.sideH / 3 - 0.012, s.bedL, panel ?? woodOf(c, 22 + b + sx));
      }
      board(c, 0, floorY + 0.015 + s.sideH / 2, hl - 0.012, s.bedW - 0.03, s.sideH, 0.024, panel ?? woodOf(c, 26));
      board(c, 0, floorY + 0.015 + s.sideH / 2, -hl + 0.012, s.bedW - 0.03, s.sideH, 0.024, panel ?? woodOf(c, 27));
    } else if (s.sides === 'rails') {
      for (const sx of [-1, 1]) {
        const n = Math.max(5, Math.round(s.bedL / 0.32));
        for (let k = 0; k <= n; k++) rod(c, [sx * (hw - 0.02), floorY, -hl + 0.04 + (k / n) * (s.bedL - 0.08)], [sx * (hw + 0.02), floorY + s.sideH, -hl + 0.04 + (k / n) * (s.bedL - 0.08)],
          0.016, woodOf(c, 20 + k), true);
        rod(c, [sx * (hw + 0.02), floorY + s.sideH, -hl - 0.03], [sx * (hw + 0.02), floorY + s.sideH, hl + 0.03], 0.028, woodOf(c, 24), true);
        rod(c, [sx * (hw + 0.0), floorY + s.sideH * 0.5, -hl], [sx * (hw + 0.0), floorY + s.sideH * 0.5, hl], 0.018, woodOf(c, 25), true);
      }
    } else {
      // ladders (ridelles) flaring out over the wheels
      for (const sx of [-1, 1]) {
        const lo: Vec3 = [sx * hw, floorY + 0.03, 0], hi: Vec3 = [sx * (hw + 0.28), floorY + s.sideH, 0];
        rod(c, [lo[0], lo[1], -hl - 0.1], [lo[0], lo[1], hl + 0.1], 0.03, woodOf(c, 20 + sx), true);
        rod(c, [hi[0], hi[1], -hl - 0.2], [hi[0], hi[1], hl + 0.2], 0.032, woodOf(c, 22 + sx), true);
        const n = Math.round(s.bedL / 0.22);
        for (let k = 0; k <= n; k++) {
          const z = -hl + (k / n) * s.bedL;
          rod(c, [lo[0], lo[1], z], [hi[0], hi[1], z], 0.013, woodOf(c, 24), false, 4);
        }
      }
    }
    if (s.canopy === 'tilt') {
      // the carro's toldo: canvas over hoops
      const n = c.coarse ? 6 : 10, hoopTop = floorY + s.sideH + 0.85, z0 = -hl + 0.05, z1 = hl - 0.25;
      c.mesh.grid(4, n, (i, j, out) => {
        const a = Math.PI * (j / n);
        out[0] = (hw + 0.03) * Math.cos(a);
        out[1] = floorY + s.sideH * 0.6 + (hoopTop - floorY - s.sideH * 0.6) * Math.sin(a);
        out[2] = lerp(z0, z1, i / 4);
      }, () => DUCK, {});
      c.mesh.grid(4, n, (i, j, out) => {
        const a = Math.PI * (j / n);
        out[0] = (hw + 0.022) * Math.cos(a);
        out[1] = floorY + s.sideH * 0.6 + (hoopTop - floorY - s.sideH * 0.6 - 0.008) * Math.sin(a);
        out[2] = lerp(z0, z1, i / 4);
      }, () => DUCK, { flip: true });
    } else if (s.canopy === 'chhai') {
      // the bullock cart's mat hood: woven bamboo over the rear of the bed, on bent canes
      const n = c.coarse ? 6 : 10, top = floorY + s.sideH + 0.62, z0 = -hl - 0.05, z1 = hl * 0.3;
      const at = (inset: number) => (i: number, j: number, out: Vec3) => {
        const a = Math.PI * (j / n);
        out[0] = (hw + 0.05 - inset) * Math.cos(a);
        out[1] = floorY + s.sideH * 0.5 + (top - floorY - s.sideH * 0.5 - inset) * Math.pow(Math.sin(a), 0.7);
        out[2] = lerp(z0, z1, i / 3);
      };
      c.mesh.grid(3, n, at(0), () => MAT_WEAVE, {});
      c.mesh.grid(3, n, at(0.01), () => MAT_WEAVE, { flip: true });
      if (!c.coarse) for (let k = 0; k <= 3; k++) {
        const hoop: Vec3[] = [];
        for (let j = 0; j <= 8; j++) { const p: Vec3 = [0, 0, 0]; at(-0.008)(k, (j / 8) * n, p); hoop.push(p); }
        c.mesh.dressing(() => bentRod(c, hoop, 0.01, woodOf(c, 40), false));
      }
    }
    if (s.rest === 'prop') {
      // a prop under the shafts holds the cart level
      beam(c.mesh, [0, tipY - 0.02, tipZ - 0.45], [0, 0, tipZ - 0.4], 0.06, 0.06, woodOf(c, 30));
      rod(c, [-0.3, tipY - 0.04, tipZ - 0.45], [0.3, tipY - 0.04, tipZ - 0.45], 0.03, woodOf(c, 31), true);
    }
  };
  const load = s.load === 'empty' ? undefined : () => {
    const y = floorY + 0.015;
    if (s.load === 'hay' || s.load === 'seaweed') {
      const over = s.sides === 'ladder' ? 0.3 : 0.12;
      // round 4 (wave 260): the straw laid over the heap carries its texture (five shades, combed along the load)
      if (s.load === 'hay') hayLoad(c, 0, y, -0.04, hw + over, hl + 0.1, s.sideH + 0.75, [HAY_A, HAY_B, HAY_C, HAY_PALE, HAY_DARK], 0.16, 0.11, 360);
      else {
        // (round 2, wave 153: "a single smooth untextured dark-grey ellipsoid") wrack heaped wet, its fronds over the
        // sides; round 4 (wave 260: "one rounded olive sack with no ropes, stakes or spill, resting on the bed like a
        // beanbag"): the wrack fills the box and heaps over its boards, held by stakes standing up out of them with a
        // rail along their heads and two ropes over it; fronds and kelp stalks hang over every side, and what fell as
        // it was forked up lies on the ground about the wheels (`ground`)
        const top = y + s.sideH, hwW = hw + 0.05, hlW = hl + 0.1, wh = s.sideH + 0.5;
        const shape: LoafOptions = { belly: 0.08, lump: 0.2, ends: 3, waist: { y: top, hw: hw - 0.045, z0: -hl + 0.045, z1: hl - 0.045 } };
        const heap = loafShape(c, 0, y, -0.04, hwW, hlW, wh, shape);
        loaf(c, 0, y, -0.04, hwW, hlW, wh, [SEAWEED_A, SEAWEED_B, KELP_A], { ...shape, grain: 2.5 });
        // where the heap's flank rises clear of the boards (its coat and its ropes start there)
        const P: Vec3 = [0, 0, 0];
        let lo = 0, hi = Math.PI / 2;
        for (let k = 0; k < 24; k++) { const mid = (lo + hi) / 2; if (heap(0, mid, P)[1] < top + 0.03) lo = mid; else hi = mid; }
        const thTop = hi;
        strawCoat(c, heap, hlW, 260, [KELP_A, KELP_B, SEAWEED_B], c.seed + 4051, { len: [0.22, 0.62], width: [0.04, 0.09], spread: 1.6, thMin: thTop });
        for (const zn of [-0.42, 0.4]) ropeOver(c, heap, zn, top - 0.07, 0.011, thTop);
        if (!c.coarse) {
          // the stakes up out of the side boards, leaning out a little, a rail along their heads (outboard: the fit
          // and the footprint stand as the box gives them)
          const zs = [-hl + 0.06, -hl / 3, hl / 3, hl - 0.06], headY = top + 0.24;
          c.mesh.outboard(() => {
            for (const sx of [-1, 1]) {
              for (const z of zs) beam(c.mesh, [sx * (hw + 0.015), top + 0.01, z], [sx * (hw + 0.04), headY, z], 0.042, 0.042, woodOf(c, 20));
              rod(c, [sx * (hw + 0.045), headY - 0.035, zs[0] - 0.04], [sx * (hw + 0.045), headY - 0.035, zs[3] + 0.04], 0.022, woodOf(c, 21), true, 5);
            }
          });
          c.mesh.dressing(() => {
            // fronds over the boards: from the heap's flank out over the top and down the outside, round all four sides
            const n = 36;
            for (let k = 0; k < n; k++) {
              const drop = 0.22 + 0.5 * Math.pow(hash01(k, c.seed + 65), 0.8), w = 0.05 + 0.07 * hash01(k, c.seed + 63), m = k % 3 ? KELP_A : KELP_B;
              let p: Vec3[], across: Vec3, out: Vec3;
              if (k < 28) {
                const side = k % 2 ? 1 : -1, z = -hl + 0.12 + ((k >> 1) / 14) * (2 * hl - 0.24) + (hash01(k, c.seed + 61) - 0.5) * 0.1;
                p = [[side * (hw - 0.02), top + 0.14, z], [side * (hw + 0.07), top + 0.03, z + 0.02], [side * (hw + 0.085), top - drop * 0.5, z + 0.04],
                  [side * (hw + 0.065), top - drop, z + 0.05]];
                across = [0, 0, 1]; out = [side, 0.5, 0];
              } else {
                const end = k % 2 ? 1 : -1, x = (hash01(k, c.seed + 67) - 0.5) * (2 * hw - 0.24);
                p = [[x, top + 0.14, end * (hl - 0.02)], [x + 0.02, top + 0.03, end * (hl + 0.065)], [x + 0.04, top - drop * 0.5, end * (hl + 0.08)],
                  [x + 0.05, top - drop, end * (hl + 0.06)]];
                across = [1, 0, 0]; out = [0, 0.5, end];
              }
              for (let i = 0; i + 1 < p.length; i++) {
                const a = p[i], b = p[i + 1], wa = w * (1 - 0.2 * i) / 2, wb = w * (0.8 - 0.2 * i) / 2;
                const q: Vec3[] = [[a[0] - across[0] * wa, a[1], a[2] - across[2] * wa], [a[0] + across[0] * wa, a[1], a[2] + across[2] * wa],
                  [b[0] + across[0] * wb, b[1], b[2] + across[2] * wb], [b[0] - across[0] * wb, b[1], b[2] - across[2] * wb]];
                face4(c.mesh, q, out, m);
                face4(c.mesh, [q[0], q[3], q[2], q[1]], [-out[0], -out[1], -out[2]], m);
              }
            }
            // kelp stalks thrown over the heap: from its crown down its flank, over the boards and hanging
            for (let k = 0; k < 10; k++) {
              const sx = k % 2 ? 1 : -1, zn = -0.75 + 1.5 * hash01(k, c.seed + 71), drop = 0.3 + 0.45 * hash01(k, c.seed + 73);
              const t0 = 1.15 + 0.45 * hash01(k, c.seed + 75), t1 = thTop + 0.08, path: Vec3[] = [];
              for (let s2 = 0; s2 <= 3; s2++) {
                const tt = t0 + (t1 - t0) * (s2 / 3), th = sx > 0 ? tt : Math.PI - tt;
                heap(zn, th, P);
                path.push([P[0] + Math.cos(th) * 0.016, P[1] + Math.sin(th) * 0.016, P[2]]);
              }
              const ze = path[3][2];
              path.push([sx * (hw + 0.075), top + 0.025, ze + 0.02], [sx * (hw + 0.095), top - drop, ze + 0.05]);
              c.mesh.tube(path, 0.011, 4, SEAWEED_B, { caps: false });
            }
          });
        }
      }
    } else if (s.load === 'sacks') {
      for (let k = 0; k < 6; k++) sack(c, (k % 2 ? 1 : -1) * hw * 0.48, y + (k > 3 ? 0.26 : 0), -hl * 0.55 + Math.floor((k % 4) / 2) * hl * 0.9 + (k > 3 ? hl * 0.2 : 0),
        hw * 0.86, 0.26, 0.66, 0.05 * k, k % 2 ? BURLAP : BURLAP_DARK);
    } else if (s.load === 'firewood') {
      firewood(c, 0, y, 0, s.bedW * 0.9, s.bedL * 0.85, 4);
    } else {
      for (let k = 0; k < 4; k++) crate(c, (k % 2 ? 1 : -1) * hw * 0.45, y + (k > 1 ? 0.34 : 0), -hl * 0.3 + (k > 1 ? hl * 0.1 : 0), hw * 0.85, 0.32, 0.5, 0.05 * k);
      for (const dz of [-0.1, 0.1]) lashStack(c, -hl * 0.25 + dz, y, [[hw * 0.88, y + 0.66]]);
    }
  };
  const rest = s.rest === 'shafts' ? { y: R, z: axleZ, pitch: restPitch(R, axleZ, [s.pole ? tipY - 0.25 : tipY - 0.035, tipZ]) } : undefined;
  // round 4 (wave 260: "no ropes, stakes or spill"): what fell as the load was forked up, on the ground about the wheels
  const wrack = s.load === 'seaweed';
  const ground = wrack || s.load === 'hay' ? () => groundSpill(c, {
    x0: -wx - 0.12, x1: wx + 0.12, z0: -hl - 0.05, z1: hl, reach: 0.65, groundY: 0.03,
    wisps: wrack ? 30 : 18, len: wrack ? [0.25, 0.6] : [0.12, 0.32], width: wrack ? [0.035, 0.07] : [0.012, 0.026],
    tangles: wrack ? 5 : 4, spread: wrack ? 0.2 : 0.16,
    mats: wrack ? [KELP_B, SEAWEED_A, KELP_A] : [HAY_PALE, HAY_A, HAY_DARK], salt: c.seed + 5003,
  }) : undefined;
  return { wheels, body, load, rest, debris: { w: 0.18, l: s.bedL * 0.7 }, ground };
}

/**
 * A four-wheeled farm wagon: the ladder hay wagon (the Russian voz, the Polish drabiniasty, the German Leiterwagen,
 * the Lorraine chariot), the American box wagon on its spring seat, the yard's flat dray.
 */
interface Wagon4Spec extends Common {
  readonly kind: 'wagon4';
  readonly bedL: number;
  readonly bedW: number;
  readonly body: 'ladder' | 'box' | 'flat';
  readonly sideH: number;
  readonly flare: number;
  readonly wheelF: number;
  readonly wheelR: number;
  readonly spokesF: number;
  readonly spokesR: number;
  readonly track: number;
  /** A pole raised against the front, a pole lying ahead, two shafts lying ahead (a single horse). */
  readonly hitch: 'pole-up' | 'pole-down' | 'pole-rest' | 'shafts';
  readonly load: 'hay' | 'crates' | 'barrels' | 'sacks' | 'empty';
  readonly painted: 'box' | 'none';
  /** The running gear's own colour (a Studebaker's red), or the wood. */
  readonly gear?: number;
  readonly wheelHex?: number;
  readonly seat?: boolean;
}

function wagon4(c: Ctx, s: Wagon4Spec): Assembly {
  const hl = s.bedL / 2, hw = s.bedW / 2, tw = s.track / 2;
  const zF = hl - 0.5, zR = -hl + 0.55;
  const bolsterY = Math.max(s.wheelF, s.wheelR) + 0.1;
  const floorY = bolsterY + 0.1;
  const gear = s.gear !== undefined ? fixed(s.gear, 0.65, 0, 'paint') : null;
  const wheelSpec = (r: number, n: number): SpokeWheelSpec => ({ r, w: 0.065, rim: 'felloe', felloe: r * 0.11, spokes: n, nave: r * 0.17, naveL: 0.3,
    tyre: 'iron', dish: 0.035, hex: s.wheelHex });
  const wheels: WheelPlace[] = [];
  for (const side of [1, -1] as const) {
    wheels.push({ x: side * tw, y: s.wheelF, z: zF, side, r: s.wheelF, halfWidth: 0.16, emit: () => spokeWheel(c, wheelSpec(s.wheelF, s.spokesF)) });
    wheels.push({ x: side * tw, y: s.wheelR, z: zR, side, r: s.wheelR, halfWidth: 0.16, emit: () => spokeWheel(c, wheelSpec(s.wheelR, s.spokesR)) });
  }
  const panel = s.painted === 'box' ? PAINT_WOOD : null;
  const g = (k: number) => gear ?? woodOf(c, k);
  const body = () => {
    // the running gear: axles in their beds, bolsters, the reach, the hounds bracing both axles
    for (const [z, r] of [[zF, s.wheelF], [zR, s.wheelR]] as const) {
      rod(c, [-tw - 0.1, r, z], [tw + 0.1, r, z], 0.028, IRON, true);
      board(c, 0, (r + bolsterY) / 2 + 0.02, z, s.track - 0.12, bolsterY - r + 0.04, 0.12, g(3));
      board(c, 0, bolsterY + 0.05, z, s.bedW + 0.14, 0.1, 0.12, g(4));
      // the hounds: thin diagonal braces (dressing: a stepped run of collision boxes would only blur the axle's)
      c.mesh.dressing(() => {
        for (const sx of [-1, 1]) beam(c.mesh, [sx * (tw - 0.1), r + 0.03, z], [sx * 0.05, bolsterY - 0.03, z + (z > 0 ? -0.55 : 0.55)], 0.05, 0.05, g(5));
      });
      // the stakes standing in the bolster ends
      if (s.body !== 'flat') for (const sx of [-1, 1]) beam(c.mesh, [sx * (hw + 0.07), bolsterY, z], [sx * (hw + 0.07 + s.flare * 0.9), floorY + s.sideH, z], 0.05, 0.05, g(6));
    }
    beam(c.mesh, [0, bolsterY - 0.04, zR - 0.3], [0, bolsterY - 0.04, zF + 0.1], 0.08, 0.07, g(7));
    // the hitch
    // the hitch (shafts, or a pole with its braces) is dressing: no collision, no part of the footprint
    c.mesh.dressing(() => {
      if (s.hitch === 'shafts') {
        for (const sx of [-1, 1]) beam(c.mesh, [sx * (tw - 0.2), s.wheelF + 0.02, zF + 0.05], [sx * 0.34, 0.035, zF + 2.0], 0.06, 0.065, woodOf(c, 8 + sx));
        rod(c, [-0.36, 0.22, zF + 1.05], [0.36, 0.22, zF + 1.05], 0.022, woodOf(c, 9), true);
      } else {
        const up = s.hitch === 'pole-up';
        // pole-rest: the tip on the ground, its front corner reaching exactly as far ahead as the raised pole's did, so
        // the wagon's fit (the body box the role's box takes) and its footprint stand: a beam's front corner lies |t.y|
        // of its half-depth ahead of its end, so the resting tip sits that much short of the raised pole's corner
        const root: Vec3 = [0, s.wheelF + 0.02, zF + 0.1], raised: Vec3 = [0, s.wheelF + 2.0, zF + 1.25];
        const lean = (tip: Vec3) => Math.abs(unit(sub(tip, root))[1]) * 0.045;
        const reach = raised[2] + lean(raised);
        let restZ = reach;
        for (let k = 0; k < 6; k++) restZ = reach - lean([0, 0.045, restZ]);
        const end: Vec3 = up ? raised : s.hitch === 'pole-rest' ? [0, 0.045, restZ] : [0, 0.05, zF + 2.4];
        beam(c.mesh, [0, s.wheelF + 0.02, zF + 0.1], end, 0.08, 0.09, g(10));
        for (const sx of [-1, 1]) beam(c.mesh, [sx * (tw - 0.15), s.wheelF, zF], [sx * 0.04, lerp(s.wheelF, end[1], 0.25), lerp(zF, end[2], 0.25)], 0.04, 0.045, g(11));
        if (s.hitch === 'pole-down') rod(c, [-0.45, 0.12, zF + 1.55], [0.45, 0.12, zF + 1.55], 0.03, woodOf(c, 12), true);
      }
    });
    // the bed: two sills and the floor
    for (const sx of [-1, 1]) beam(c.mesh, [sx * (hw - 0.05), floorY - 0.06, -hl], [sx * (hw - 0.05), floorY - 0.06, hl], 0.08, 0.09, woodOf(c, 13 + sx));
    const nb = Math.max(4, Math.round(s.bedW / 0.18));
    for (let k = 0; k < nb; k++) board(c, -hw + (k + 0.5) * (s.bedW / nb), floorY, 0, s.bedW / nb - 0.008, 0.03, s.bedL, panel ?? woodOf(c, 16 + k));
    if (s.body === 'ladder') {
      for (const sx of [-1, 1]) {
        const lo: Vec3 = [sx * hw, floorY + 0.04, 0], hi: Vec3 = [sx * (hw + s.flare), floorY + s.sideH, 0];
        rod(c, [lo[0], lo[1], -hl - 0.15], [lo[0], lo[1], hl + 0.15], 0.035, woodOf(c, 20 + sx), true);
        rod(c, [hi[0], hi[1], -hl - 0.3], [hi[0], hi[1], hl + 0.3], 0.038, woodOf(c, 22 + sx), true);
        const n = Math.round(s.bedL / 0.24);
        for (let k = 0; k <= n; k++) {
          const z = -hl + (k / n) * s.bedL;
          rod(c, [lo[0], lo[1], z], [hi[0], hi[1], z], 0.014, woodOf(c, 24), false, 4);
        }
      }
      // the end ladders, upright
      for (const sz of [-1, 1]) {
        for (const x of [-hw * 0.6, 0, hw * 0.6]) rod(c, [x, floorY, sz * (hl + 0.02)], [x * 1.4, floorY + s.sideH * 0.9, sz * (hl + 0.08)], 0.018, woodOf(c, 26), true);
        rod(c, [-hw - s.flare * 0.7, floorY + s.sideH * 0.85, sz * (hl + 0.07)], [hw + s.flare * 0.7, floorY + s.sideH * 0.85, sz * (hl + 0.07)], 0.022, woodOf(c, 27), true);
      }
    } else if (s.body === 'box') {
      // the double box: three boards a side, cleats, the end gates, iron corner straps
      for (const sx of [-1, 1]) {
        for (let b = 0; b < 3; b++) board(c, sx * (hw + 0.012), floorY + 0.02 + (b + 0.5) * (s.sideH / 3), 0, 0.025, s.sideH / 3 - 0.01, s.bedL + 0.02, panel ?? woodOf(c, 28 + b));
        for (const z of [-hl + 0.1, -hl / 3, hl / 3, hl - 0.1]) board(c, sx * (hw + 0.03), floorY + s.sideH / 2, z, 0.02, s.sideH, 0.06, panel ?? woodOf(c, 31));
      }
      for (const sz of [-1, 1]) board(c, 0, floorY + 0.02 + s.sideH / 2, sz * (hl + 0.01), s.bedW + 0.05, s.sideH, 0.025, panel ?? woodOf(c, 32));
      if (!c.coarse) c.mesh.dressing(() => {
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.mesh.box(sx * (hw + 0.026), floorY + s.sideH / 2, sz * (hl - 0.03), 0.006, s.sideH * 0.95, 0.05, IRON, 0);
      });
      if (s.seat) {
        // the spring seat across the box's front
        for (const sx of [-1, 1]) beam(c.mesh, [sx * (hw - 0.05), floorY + s.sideH, hl - 0.45], [sx * (hw - 0.08), floorY + s.sideH + 0.18, hl - 0.48], 0.03, 0.05, IRON);
        board(c, 0, floorY + s.sideH + 0.21, hl - 0.48, s.bedW - 0.06, 0.05, 0.36, woodOf(c, 34));
        board(c, 0, floorY + s.sideH + 0.42, hl - 0.68, s.bedW - 0.06, 0.32, 0.04, woodOf(c, 35));
      }
    } else {
      // the dray's flat deck: low side rails and stake pockets
      for (const sx of [-1, 1]) {
        board(c, sx * (hw + 0.02), floorY + 0.06, 0, 0.04, 0.12, s.bedL, woodOf(c, 36));
        for (const z of [-hl + 0.15, 0, hl - 0.15]) board(c, sx * (hw + 0.02), floorY + 0.2, z, 0.05, 0.4, 0.05, woodOf(c, 37));
      }
    }
  };
  const load = s.load === 'empty' ? undefined : () => {
    const y = floorY + 0.015;
    if (s.load === 'hay') {
      hayLoad(c, 0, y, 0, hw + s.flare + 0.14, hl + 0.28, s.sideH + 0.85, [HAY_A, HAY_B, HAY_C, HAY_PALE, HAY_DARK], 0.2, 0.11, 420);
    } else if (s.load === 'sacks') {
      for (let k = 0; k < 8; k++) sack(c, (k % 2 ? 1 : -1) * hw * 0.48, y + (k > 5 ? 0.27 : 0), -hl * 0.7 + Math.floor((k % 6) / 2) * hl * 0.65, hw * 0.86, 0.27, 0.68, 0.05 * k,
        k % 2 ? BURLAP : BURLAP_DARK);
    } else if (s.load === 'barrels') {
      for (let k = 0; k < 6; k++) {
        const x = (k % 2 ? 1 : -1) * hw * 0.48, z = -hl * 0.6 + Math.floor(k / 2) * hl * 0.6;
        c.mesh.push().translate(x, y, z).rotateZ(Math.PI / 2);
        c.mesh.lathe([[0.0001, 0], [0.24, 0], [0.26, 0.04], [0.3, 0.38], [0.26, 0.72], [0.24, 0.76], [0.0001, 0.76]].map(([r, h]) => [r, h] as [number, number]),
          c.coarse ? 10 : 14, (q) => (q === 0 || q === 5 ? woodOf(c, 60) : woodOf(c, 61 + (k % 2))));
        c.mesh.pop();
        c.mesh.push().translate(x, y, z).rotateZ(Math.PI / 2);
        if (!c.coarse) for (const h of [0.12, 0.64]) c.mesh.lathe([[0.27 + (h > 0.4 ? 0 : -0.01), h - 0.02], [0.285, h - 0.02], [0.285, h + 0.02], [0.27, h + 0.02]], 14, () => IRON);
        c.mesh.pop();
      }
    } else {
      for (let k = 0; k < 6; k++) crate(c, (k % 2 ? 1 : -1) * hw * 0.48, y + (k > 3 ? 0.4 : 0), -hl * 0.55 + Math.floor((k % 4) / 2) * hl * 0.8, hw * 0.85, 0.4, 0.6, 0.04 * k);
      for (const dz of [-0.14, 0.14]) lashStack(c, -hl * 0.55 + dz, y, [[hw * 0.91, y + 0.8]]);
      lashStack(c, hl * 0.25, y, [[hw * 0.91, y + 0.4]]);
    }
  };
  return { wheels, body, load, debris: { w: 0.2, l: s.bedL * 0.6 } };
}

/** A single-axle farm trailer of the 1980s: a steel chassis, a plank deck in red drop sides, small square bales. */
interface TrailerSpec extends Common {
  readonly kind: 'trailer';
  readonly deckL: number;
  readonly deckW: number;
  readonly load: 'bales' | 'empty';
}

function trailer(c: Ctx, s: TrailerSpec): Assembly {
  const R = 0.4, hl = s.deckL / 2, hw = s.deckW / 2, deckY = R + 0.42, wx = hw - 0.12;
  const wheels: WheelPlace[] = [1, -1].map((side) => ({ x: side * wx, y: R, z: -0.15, side: side as 1 | -1, r: R, halfWidth: 0.13,
    emit: () => tyreWheel(c, R, 0.24, 0.5) }));
  const chassis = fixed(0x2c2e2c, 0.6, 0.3, 'steel');
  const sides = PAINT_STEEL;
  const body = () => {
    rod(c, [-wx + 0.1, R, -0.15], [wx - 0.1, R, -0.15], 0.035, IRON, true);
    for (const sx of [-1, 1]) {
      beam(c.mesh, [sx * 0.45, deckY - 0.12, -hl + 0.05], [sx * 0.45, deckY - 0.12, hl], 0.08, 0.14, chassis);
      beam(c.mesh, [sx * 0.45, deckY - 0.2, -0.15], [sx * (wx - 0.15), R, -0.15], 0.07, 0.1, chassis);
      // the drawbar's A frame closing ahead to the eye
      beam(c.mesh, [sx * 0.45, deckY - 0.14, hl - 0.05], [sx * 0.03, 0.52, hl + 0.95], 0.07, 0.1, chassis);
      // mudguards
      const guard: Vec3[] = [];
      for (let k = 0; k <= 6; k++) { const a = -1.0 + (k / 6) * 2.0; guard.push([sx * wx, R + Math.cos(a) * (R + 0.07), -0.15 + Math.sin(a) * (R + 0.07)]); }
      c.mesh.sweep(guard, [[-0.15, 0], [0.15, 0], [0.15, 0.006], [-0.15, 0.006]], () => chassis, { closedSection: true, creases: [0, 1, 2, 3] });
    }
    for (const z of [-hl + 0.1, -0.15, hl * 0.5]) beam(c.mesh, [-hw + 0.05, deckY - 0.06, z], [hw - 0.05, deckY - 0.06, z], 0.06, 0.07, chassis);
    // the eye and the jack stand
    c.mesh.push().translate(0, 0.52, hl + 1.0).rotateZ(Math.PI / 2);
    c.mesh.lathe([[0.03, -0.02], [0.06, -0.02], [0.06, 0.02], [0.03, 0.02], [0.03, -0.02]], 8, () => IRON, { creases: [1, 2, 3] });
    c.mesh.pop();
    rod(c, [0.05, 0.55, hl + 0.7], [0.05, 0.0, hl + 0.7], 0.03, chassis, true);
    board(c, 0.05, 0.01, hl + 0.7, 0.16, 0.02, 0.16, IRON_WORN);
    // the deck and the drop sides
    const nb = Math.round(s.deckW / 0.16);
    for (let k = 0; k < nb; k++) board(c, -hw + (k + 0.5) * (s.deckW / nb), deckY, 0, s.deckW / nb - 0.006, 0.035, s.deckL, woodOf(c, 10 + k));
    for (const sx of [-1, 1]) board(c, sx * (hw + 0.012), deckY + 0.2, 0, 0.022, 0.38, s.deckL, sides);
    for (const sz of [-1, 1]) board(c, 0, deckY + 0.2, sz * (hl + 0.012), s.deckW + 0.05, 0.38, 0.022, sides);
    if (!c.coarse) c.mesh.dressing(() => {
      for (const sx of [-1, 1]) for (let k = 0; k <= 4; k++) c.mesh.box(sx * (hw + 0.026), deckY + 0.2, -hl + (k / 4) * s.deckL, 0.006, 0.38, 0.04, chassis, 0);
    });
    // the ladder at the front (bale stacks), the lamps
    for (const sx of [-1, 1]) rod(c, [sx * (hw - 0.05), deckY, hl - 0.03], [sx * (hw - 0.05), deckY + 1.25, hl - 0.03], 0.022, chassis, true);
    for (let k = 1; k <= 3; k++) rod(c, [-hw + 0.05, deckY + k * 0.4, hl - 0.03], [hw - 0.05, deckY + k * 0.4, hl - 0.03], 0.016, chassis, true);
    if (!c.coarse) for (const sx of [-1, 1]) c.mesh.box(sx * (hw - 0.12), deckY - 0.1, -hl - 0.02, 0.14, 0.07, 0.03, fixed(0x8a1a12, 0.3, 0, 'paint'), 0.006);
  };
  const load = s.load === 'empty' ? undefined : () => bales(c, -hw + 0.02, hw - 0.02, -hl + 0.02, hl - 0.06, deckY + 0.018, 3);
  return { wheels, body, load, debris: { w: 0.16, l: s.deckL * 0.5 } };
}

// the wave-161 sled pass (2026-10-07): on a snowbound map a sled sits in the snow it was drawn through — two grooves
// pressed by its runners out behind it, snow lodged on its deck and settled on its load; a load is lashed down
const SNOW_LYING = material('cargo', linearHex(0xe6ecf0), 0.92, 0, 0, 0.7);
const MUTED_CANVAS = fixed(0x6a6650, 0.92, 0, 'canvas');
const OLIVE_CAN = fixed(0x4b5132, 0.62, 0.15, 'steel');
const ROPE = material('cargo', linearHex(0x7a6a48), 0.9, 0, 0, 0.6);

/**
 * The runners' grooves in the snow, recorded: a pressed track under each runner, out behind the tail and a little ahead.
 * Round 3 (wave 234: "pristine snow with no runner track, sinkage or drift"): no longer a flat strip in the sled's own
 * frame (buried uphill and in the air downhill on a tilted sled); the props press it into the ground itself, conformed
 * to it (vehicleContactShadow.ts buildRunnerTracks), from the layout cartRunners reads here.
 */
function runnerGrooves(c: Ctx, xs: readonly number[], z0: number, z1: number, width: number): void {
  c.runners?.push({ xs: [...xs], z0, z1, width });
}

/** How far a sled's runners lie sunk in the snow they stand in (props.ts seats a runner cart this much deeper, m). */
export const RUNNER_SNOW_SINK_M = 0.05;
/** Snow pressed up beside a runner: a shade off the fresh snow (compacted, in its own shadow). */
const SNOW_COMPACT = material('cargo', linearHex(0xc8d2dc), 0.94, 0, 0, 0.7);

/**
 * The snow a sunk runner pushed up along both its faces (round 4, wave 260: "a pale flat disc… no runner sink,
 * compaction or drift lip"; it replaces the windward drift that read as a pasted ellipse): a low lumpy lip each side,
 * tucked against the runner under the snow's surface, cresting 2-4 cm over it a few centimetres out and running out
 * under it 13 cm out, tapering at both ends of the runner's run. The sled stands RUNNER_SNOW_SINK_M deeper than a
 * cart's 3 cm (props.ts), so the snow's surface lies at y = 0.08 in its frame (dressing; snowbound maps, desktop).
 */
function runnerLips(c: Ctx, xs: readonly number[], halfThick: number, z0: number, z1: number): void {
  if (!c.snow || c.coarse) return;
  const ground = 0.03 + RUNNER_SNOW_SINK_M, nu = 10;
  const across: ReadonlyArray<readonly [number, number]> = [[0.004, -0.012], [0.03, 0.03], [0.07, 0.022], [0.13, -0.014]];
  for (const x of xs) for (const side of [-1, 1] as const) {
    const seed = 1301 + Math.round(x * 100) + side * 7;
    // i runs along z, j outward: i x j points up on the +x side, down on the -x side
    c.mesh.dressing(() => c.mesh.grid(nu, across.length - 1, (i, j, out) => {
      const u = i / nu, taper = Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, u))), 0.5);
      const [off, rise] = across[j];
      const lump = 0.7 + 0.6 * valueNoise(u * 5.1, j * 1.3, 0.5, seed);
      out[0] = x + side * (halfThick + off);
      out[1] = ground + (rise > 0 ? rise * lump * taper : rise);
      out[2] = z0 + (z1 - z0) * u;
    }, () => SNOW_COMPACT, { flip: side < 0 }));
  }
}

/**
 * Snow lying on a heap in patches (round 5): `count` lumpy pads sat on its surface near the crown (th about pi/2) and a
 * little down its flanks, each `r0`..`r1` across and up to `depth` thick, lifted clear of the straw coat (dressing).
 */
function snowPatches(c: Ctx, at: (zn: number, th: number, out: Vec3) => Vec3, count: number, r0: number, r1: number, depth: number,
  salt: number): void {
  if (!c.snow || c.coarse) return;
  const P: Vec3 = [0, 0, 0];
  for (let k = 0; k < count; k++) {
    const zn = -0.78 + 1.56 * ((k + 0.5) / count) + (hash01(k, salt) - 0.5) * 0.12;
    const th = Math.PI / 2 + (hash01(k, salt + 1) - 0.5) * 0.9;
    at(zn, th, P);
    const r = r0 + (r1 - r0) * hash01(k, salt + 3), d = depth * (0.55 + 0.45 * hash01(k, salt + 5));
    c.mesh.dressing(() => {
      c.mesh.push().translate(P[0], P[1] - d * 0.35, P[2]).rotateY(hash01(k, salt + 7) * Math.PI).rotateZ((th - Math.PI / 2) * 0.8);
      loaf(c, 0, 0, 0, r, r * (0.7 + 0.5 * hash01(k, salt + 9)), d, [SNOW_LYING], { belly: 0.2, lump: 0.35, ends: 1.8, low: true, seed: salt + k * 31 });
      c.mesh.pop();
    });
  }
}

/** A stack's lashing: ropes over a box-shaped load from the deck on one side, over its top and down the other. */
function lashBox(c: Ctx, x: number, y0: number, top: number, w: number, zs: readonly number[]): void {
  if (c.coarse) return;
  for (const z of zs) {
    const path: Vec3[] = [[x - w / 2 - 0.015, y0 + 0.01, z], [x - w / 2 - 0.02, top - 0.05, z], [x - w / 2 + 0.06, top + 0.015, z],
      [x + w / 2 - 0.06, top + 0.015, z], [x + w / 2 + 0.02, top - 0.05, z], [x + w / 2 + 0.015, y0 + 0.01, z]];
    c.mesh.dressing(() => bentRod(c, path, 0.012, ROPE, false));
  }
}

/** Snow settled on a surface: a few uneven drifts lying on it, lumpy and thin, never one smooth lid (dressing). */
function snowCover(c: Ctx, x: number, y: number, z: number, hw: number, hl: number, depth: number): void {
  if (!c.snow || c.coarse) return;
  const salt = Math.round((x * 31 + y * 17 + z * 13) * 10);
  for (let k = 0; k < 5; k++) {
    const u = hash01(k, c.seed + salt + 7) - 0.5, v = hash01(k, c.seed + salt + 11) - 0.5, size = 0.25 + 0.35 * hash01(k, c.seed + salt + 13);
    c.mesh.dressing(() => loaf(c, x + u * hw * 1.3, y - 0.012 * k, z + v * hl * 1.5, hw * size, hl * size * 0.8, depth * (0.6 + 0.6 * size),
      [SNOW_LYING], { belly: 0, lump: 0.32, ends: 1.6, seed: 401 + k * 37 + salt }));
  }
}

/**
 * A rope over a heap at zn (round 3: "ropes over the load"): over its surface 1.5 cm proud from foot to foot, its ends
 * down to the frame at `footY` (dressing).
 */
function ropeOver(c: Ctx, at: (zn: number, th: number, out: Vec3) => Vec3, zn: number, footY: number, r = 0.012, th0 = 0.04): void {
  if (c.coarse) return;
  const path: Vec3[] = [], P: Vec3 = [0, 0, 0], Q: Vec3 = [0, 0, 0];
  for (let k = 0; k <= 12; k++) {
    const th = th0 + (k / 12) * (Math.PI - 2 * th0);
    at(zn, th, P); at(zn, th + 0.02, Q);
    // outward from the heap's axis by the rope's radius and a little more
    const ox = Math.cos(th), oy = Math.sin(th);
    path.push([P[0] + ox * (r + 0.012), P[1] + oy * (r + 0.012), P[2]]);
  }
  const first = path[0], last = path[path.length - 1];
  path.unshift([first[0], footY, first[2]]); path.push([last[0], footY, last[2]]);
  c.mesh.outboard(() => bentRod(c, path, r, ROPE, false));
}

/** A hay sledge (Podhale, January): long curled runners, posts, a ladder rack under its hay, shafts on the snow. */
interface SledgeSpec extends Common {
  readonly kind: 'sledge';
  readonly bedL: number;
  readonly bedW: number;
  readonly load: 'hay' | 'firewood' | 'empty';
}

function sledge(c: Ctx, s: SledgeSpec): Assembly {
  const hl = s.bedL / 2, rw = s.bedW / 2, bedY = 0.42;
  const body = () => {
    for (const sx of [-1, 1]) {
      // the runner: flat along the snow, curled up and back at the front
      const curl = bezier([sx * rw, 0.06, hl * 0.55], [sx * rw, 0.55, hl + 0.15], [sx * rw, 0.04, hl + 0.32], c.coarse ? 4 : 7);
      const path: Vec3[] = [[sx * rw, 0.06, -hl], ...curl];
      squareSweep(c, path, 0.07, 0.1, woodOf(c, 1 + sx));
      if (!c.coarse) c.mesh.dressing(() => squareSweep(c, path.map((p) => [p[0], p[1] - 0.052, p[2]] as Vec3).slice(0, -2), 0.06, 0.006, IRON_WORN));
      // the posts (knees) and the sill
      for (let k = 0; k < 4; k++) {
        const z = -hl + 0.15 + (k / 3) * (s.bedL * 0.72);
        beam(c.mesh, [sx * rw, 0.1, z], [sx * (rw - 0.02), bedY - 0.04, z], 0.06, 0.06, woodOf(c, 3));
      }
      beam(c.mesh, [sx * (rw - 0.02), bedY - 0.02, -hl], [sx * (rw - 0.02), bedY - 0.02, hl * 0.78], 0.08, 0.07, woodOf(c, 4 + sx));
      // ladder rack (wave 211: its rails "stick out like wings"): low and leaning only a little, inside the heap's
      // flanks, as long as the heap, its staves showing where the hay thins at the ends
      const lo: Vec3 = [sx * (rw - 0.02), bedY + 0.04, 0], hi: Vec3 = [sx * (rw + 0.14), bedY + 0.46, 0];
      rod(c, [hi[0], hi[1], -hl * 0.92], [hi[0], hi[1], hl * 0.68], 0.03, woodOf(c, 6 + sx), true);
      const n = Math.round(s.bedL / 0.26);
      for (let k = 0; k <= n; k++) {
        const z = -hl * 0.92 + (k / n) * (hl * 1.6);
        rod(c, [lo[0], lo[1], z], [hi[0], hi[1], z], 0.013, woodOf(c, 8), false, 4);
      }
      // the shafts lying ahead on the snow (dressing)
      c.mesh.dressing(() => beam(c.mesh, [sx * (rw - 0.05), bedY - 0.06, hl * 0.7], [sx * 0.36, 0.04, hl + 1.25], 0.055, 0.065, woodOf(c, 9 + sx)));
    }
    for (let k = 0; k < 4; k++) board(c, 0, bedY - 0.06, -hl + 0.15 + (k / 3) * (s.bedL * 0.72), s.bedW + 0.06, 0.06, 0.07, woodOf(c, 12));
    const nb = Math.round(s.bedW / 0.17);
    for (let k = 0; k < nb; k++) board(c, -rw + (k + 0.5) * (s.bedW / nb), bedY + 0.02, -hl * 0.1, s.bedW / nb - 0.01, 0.026, s.bedL * 0.9, woodOf(c, 14 + k));
  };
  const load = s.load === 'empty' ? undefined : () => {
    if (s.load === 'hay') {
      // (waves 161, 211: "a giant potato", "a smooth yellow lozenge") forkfuls heaped high over the rack, lumpy and
      // boxy-ended, five shades of straw, tufts pulled proud; the binding pole lies along its crown, bowed down at both
      // ends by the ropes to the runners; snow lies over its crown, not in a dollop
      const y0 = bedY + 0.04, z0 = -hl * 0.1, hhw = rw + 0.3, hhl = hl * 0.95, h = 1.05, q = 2.4;
      hayLoad(c, 0, y0, z0, hhw, hhl, h, [HAY_A, HAY_B, HAY_C, HAY_PALE, HAY_DARK], 0.12, 0.22, 420, q);
      // round 3 (wave 234): two ropes over the load besides the pole's
      const heap = loafShape(c, 0, y0, z0, hhw, hhl, h, { belly: 0.12, lump: 0.22, ends: q });
      for (const zn of [-0.42, 0.38]) ropeOver(c, heap, zn, bedY + 0.02);
      const crown = (zn: number) => y0 + h * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(zn), q)), 0.6 / q);
      if (!c.coarse) c.mesh.dressing(() => {
        const pole: Vec3[] = [];
        for (let k = 0; k <= 8; k++) { const zn = -0.97 + (k / 8) * 1.94; pole.push([0, crown(zn) + 0.03, z0 + zn * hhl]); }
        bentRod(c, pole, 0.045, woodOf(c, 20), true);
        for (const end of [-1, 1]) {
          const tip = pole[end < 0 ? 0 : pole.length - 1];
          for (const sx of [-1, 1]) rod(c, tip, [sx * rw * 0.9, 0.12, z0 + end * (hhl + 0.08)], 0.014, ROPE, false);
        }
      });
      // the snow on the crown (round 5, wave 278: "a smooth, milky, semi-transparent dome like a glass cover"): patches
      // of it lying on the hay where it settled, thick on the crown and thinning down the flanks, the straw showing
      // between them, each a lumpy pad above the straw coat
      if (c.snow && !c.coarse) snowPatches(c, heap, 14, 0.12, 0.3, 0.09, 2111);
    } else {
      firewood(c, 0, bedY + 0.04, -hl * 0.1, s.bedW * 0.95, s.bedL * 0.8, 4);
      lashBox(c, 0, bedY + 0.02, bedY + 0.04 + 0.518, s.bedW * 0.95, [-hl * 0.1 - s.bedL * 0.22, -hl * 0.1 + s.bedL * 0.22]);
    }
  };
  // (wave 260: "two ruler-straight hairlines") the troughs a hand wide, out 5 m behind it (the props bend them)
  runnerGrooves(c, [-rw, rw], -hl - 5.0, hl + 0.2, 0.14);
  runnerLips(c, [-rw, rw], 0.04, -hl, hl * 0.75);
  return { wheels: [], body, load, debris: { w: 0.16, l: 1.4 } };
}

/** A hand sled: the Alpine and Podhale horn sled (Hornschlitten, rogal) and the Inuit komatik. */
interface SledSpec extends Common {
  readonly kind: 'sled';
  readonly style: 'horn' | 'komatik';
  readonly len: number;
  readonly width: number;
  readonly load: 'hay' | 'firewood' | 'gear' | 'empty';
}

function sled(c: Ctx, s: SledSpec): Assembly {
  const hl = s.len / 2, rw = s.width / 2 - 0.03;
  if (s.style === 'horn') {
    // (wave 161: "stubby legs") the deck on slender splayed stanchions a hand's breadth higher, the rail meeting the horn
    const deckY = 0.38;
    const body = () => {
      for (const sx of [-1, 1]) {
        // the runner rises at the front into the horn the driver steers by
        // (wave 211: "no runners along the snow", "freestanding C-shaped horns") a deeper runner standing proud of the
        // snow, sweeping up without a break into its horn
        const front = bezier([sx * rw, 0.05, hl * 0.35], [sx * (rw - 0.04), 1.08, hl * 0.72], [sx * rw, 0.0, hl * 1.08], c.coarse ? 5 : 9);
        const horn = bezier(front[front.length - 1], [sx * (rw - 0.06), 1.16, hl * 0.48], [sx * (rw - 0.05), 1.22, hl * 0.66], c.coarse ? 2 : 3);
        const path: Vec3[] = [[sx * rw, 0.05, -hl], ...front, ...horn.slice(1)];
        squareSweep(c, path, 0.055, 0.1, woodOf(c, 1 + sx), [0, 0, 1]);
        if (!c.coarse) c.mesh.dressing(() => beam(c.mesh, [sx * rw, 0.006, -hl], [sx * rw, 0.006, hl * 0.4], 0.045, 0.008, IRON_WORN));
        // (wave 211: "on table legs") stanchions raked in from the runner to the deck rail, a stringer along them
        for (let k = 0; k < 3; k++) {
          const z = -hl + 0.15 + k * hl * 0.55;
          beam(c.mesh, [sx * (rw + 0.005), 0.09, z - 0.04], [sx * (rw - 0.04), deckY - 0.03, z + 0.03], 0.03, 0.036, woodOf(c, 3));
        }
        beam(c.mesh, [sx * (rw - 0.012), 0.2, -hl + 0.1], [sx * (rw - 0.018), 0.2, -hl + 0.2 + 2 * hl * 0.55], 0.025, 0.03, woodOf(c, 5));
        beam(c.mesh, [sx * (rw - 0.035), deckY - 0.02, -hl + 0.04], [sx * (rw - 0.03), deckY - 0.02, hl * 0.49], 0.045, 0.045, woodOf(c, 4 + sx));
      }
      // the cross bars between the horns (low, and the handle across their tops), the stanchions' cross pieces, the slats
      rod(c, [-rw + 0.03, 0.62, hl * 0.82], [rw - 0.03, 0.62, hl * 0.82], 0.018, woodOf(c, 6), true);
      rod(c, [-rw + 0.06, 1.17, hl * 0.6], [rw - 0.06, 1.17, hl * 0.6], 0.02, woodOf(c, 7), true);
      for (let k = 0; k < 3; k++) {
        const z = -hl + 0.15 + k * hl * 0.55 + 0.01;
        rod(c, [-rw + 0.02, deckY - 0.12, z], [rw - 0.02, deckY - 0.12, z], 0.014, woodOf(c, 8), true);
      }
      const n = Math.round(hl * 1.4 / 0.13);
      for (let k = 0; k <= n; k++) board(c, 0, deckY + 0.015, -hl + 0.07 + k * 0.13, s.width - 0.02, 0.022, 0.09, woodOf(c, 10 + k));
    };
    const load = s.load === 'empty' ? undefined : () => {
      if (s.load === 'hay') {
        // round 3 (wave 234: "a smooth olive-yellow capsule… no straw texture, overhang, ropes or binding pole"): the heap
        // overhangs the deck, coated in straw, two ropes over it and a binding pole along its crown tied fore and aft
        // (the heap's reach as before: the sled's fit in its role's box, and so its footprint, stand)
        const hy = deckY + 0.03, hz = -hl * 0.25, hhw = rw + 0.12, hhl = hl * 0.62, hh = 0.62;
        hayLoad(c, 0, hy, hz, hhw, hhl, hh, [HAY_A, HAY_B, HAY_PALE, HAY_DARK], 0.15, 0.11, 170, 3, { segs: 1 });
        const heap = loafShape(c, 0, hy, hz, hhw, hhl, hh, { belly: 0.15, lump: 0.11, ends: 3 });
        for (const zn of [-0.45, 0.3]) ropeOver(c, heap, zn, deckY + 0.01, 0.01);
        if (!c.coarse) c.mesh.outboard(() => {
          const pole: Vec3[] = [], P: Vec3 = [0, 0, 0];
          for (let k = 0; k <= 6; k++) { heap(-0.95 + (k / 6) * 1.9, Math.PI / 2, P); pole.push([0, P[1] + 0.035, P[2]]); }
          bentRod(c, pole, 0.03, woodOf(c, 21), true);
          for (const end of [0, pole.length - 1]) rod(c, pole[end], [0, deckY + 0.01, pole[end][2] + (end ? 0.1 : -0.1)], 0.01, ROPE, false);
        });
        snowCover(c, 0, deckY + 0.6, -hl * 0.25, rw * 0.7, hl * 0.5, 0.06);
      } else {
        // a shorter stack, the slats open ahead of it and behind (wave 161: "no snow on the deck")
        firewood(c, 0, deckY + 0.03, -hl * 0.22, s.width * 0.92, hl * 0.98, 3);
        // round 5 (wave 278: "no snow or lashing on its log load"): two ropes over the stack to the deck rails, and the
        // snow on the top logs (it lay sunk under them)
        lashBox(c, 0, deckY + 0.02, deckY + 0.03 + 0.392, s.width * 0.92, [-hl * 0.22 - hl * 0.3, -hl * 0.22 + hl * 0.3]);
        snowCover(c, 0, deckY + 0.43, -hl * 0.22, rw * 0.72, hl * 0.42, 0.08);
      }
    };
    // snow lodged on the open slats ahead of the load and behind it
    snowCover(c, 0, deckY + 0.03, hl * 0.33, rw * 0.85, hl * 0.12, 0.04);
    snowCover(c, 0, deckY + 0.03, -hl * 0.85, rw * 0.85, hl * 0.1, 0.035);
    runnerGrooves(c, [-rw, rw], -hl - 4.6, hl * 0.6, 0.12);
    runnerLips(c, [-rw, rw], 0.028, -hl, hl * 0.4);
    // round 4 (wave 260): straw dropped about it and along its track, clear of the snow its runners pushed up
    const ground = s.load === 'hay' ? () => groundSpill(c, {
      x0: -rw - 0.15, x1: rw + 0.15, z0: -hl, z1: hl * 0.5, reach: 0.5, groundY: 0.03 + RUNNER_SNOW_SINK_M,
      wisps: 16, len: [0.12, 0.3], width: [0.012, 0.024], tangles: 4, spread: 0.14, mats: [HAY_PALE, HAY_A, HAY_DARK], salt: c.seed + 5011,
    }) : undefined;
    return { wheels: [], body, load, debris: { w: 0.08, l: 0.9 }, ground };
  }
  // the komatik: plank runners on edge with turned-up noses, plastic shoes, cross slats lashed on, a handle frame
  const top = 0.19;
  const body = () => {
    for (const sx of [-1, 1]) {
      const n = c.coarse ? 4 : 10;
      // (wave 211: "block-like runner tips") the board's nose curls up and thins to a rounded tip, its stations closing
      // up toward it
      const outline = (u: number): [number, number, number] => {
        // z, bottom, top of the runner board at parameter u from the tail (0) to the nose (1)
        const t = 1 - Math.pow(1 - u, 1.5), z = -hl + t * s.len;
        const rise = Math.max(0, (t - 0.72) / 0.28);
        const b = 0.3 * rise * rise, tp = top + 0.14 * Math.pow(rise, 1.6);
        return [z, b, Math.max(b + 0.035, tp)];
      };
      // (round 3) the board's four faces outward: i runs toward the nose (+z), so a side face (j up) faces -x and a
      // top or shoe face (j across from the outside) faces -sx up; each was flipped the other way
      c.mesh.grid(n * 2, 1, (i, j, out) => {
        const [z, b, t] = outline(i / (n * 2));
        out[0] = sx * rw + sx * 0.0175; out[1] = j ? t : b; out[2] = z;
      }, () => woodOf(c, 1 + sx), { flip: sx > 0 });
      c.mesh.grid(n * 2, 1, (i, j, out) => {
        const [z, b, t] = outline(i / (n * 2));
        out[0] = sx * rw - sx * 0.0175; out[1] = j ? t : b; out[2] = z;
      }, () => woodOf(c, 1 + sx), { flip: sx < 0 });
      c.mesh.grid(n * 2, 1, (i, j, out) => {
        const [z, , t] = outline(i / (n * 2));
        out[0] = sx * rw + (j ? -1 : 1) * sx * 0.0175; out[1] = t; out[2] = z;
      }, () => woodOf(c, 1 + sx), { flip: sx > 0 });
      c.mesh.grid(n * 2, 1, (i, j, out) => {
        const [z, b] = outline(i / (n * 2));
        out[0] = sx * rw + (j ? -1 : 1) * sx * 0.022; out[1] = b - 0.012; out[2] = z;
      }, () => UHMW, { flip: sx < 0 });
    }
    const slats = Math.round((s.len * 0.82) / 0.115);
    for (let k = 0; k < slats; k++) {
      const z = -hl + 0.06 + k * 0.115;
      board(c, 0, top + 0.013, z, s.width + 0.06, 0.024, 0.07, woodOf(c, 10 + k));
      if (!c.coarse) c.mesh.dressing(() => {
        for (const sx of [-1, 1]) c.mesh.box(sx * rw, top - 0.02, z, 0.045, 0.05, 0.02, TWINE, 0);
      });
    }
    // the handle frame at the tail
    for (const sx of [-1, 1]) beam(c.mesh, [sx * (rw - 0.02), top, -hl + 0.08], [sx * (rw - 0.04), top + 0.62, -hl - 0.02], 0.035, 0.035, woodOf(c, 30));
    rod(c, [-rw + 0.02, top + 0.6, -hl - 0.015], [rw - 0.02, top + 0.6, -hl - 0.015], 0.02, woodOf(c, 31), true);
    rod(c, [-rw + 0.02, top + 0.3, -hl + 0.035], [rw - 0.02, top + 0.3, -hl + 0.035], 0.015, woodOf(c, 32), true);
  };
  const load = s.load === 'empty' ? undefined : () => {
    if (s.load === 'gear') {
      // a lashed load (wave 161: "toy blocks"): a plank box, a muted canvas tarp bundle folded over its gear, an olive
      // jerrycan; ropes over all three to the slats, snow on top
      board(c, 0, top + 0.2, -hl * 0.4, s.width * 0.8, 0.34, 0.5, woodOf(c, 40));
      if (!c.coarse) c.mesh.dressing(() => {
        for (let k = 1; k < 4; k++) c.mesh.box(0, top + 0.03 + k * 0.085, -hl * 0.4 - 0.252, s.width * 0.8 + 0.004, 0.008, 0.006, fixed(0x3a3226, 0.9), 0);
        for (const sx of [-1, 1]) c.mesh.box(sx * (s.width * 0.4 - 0.03), top + 0.2, -hl * 0.4 - 0.253, 0.04, 0.34, 0.008, woodOf(c, 41), 0);
      });
      // round 3 (wave 234: "tarps need folds and lashing; matte"): the cloth hangs in folds over what it covers
      loaf(c, 0, top + 0.025, hl * 0.22, rw * 0.9, hl * 0.34, 0.32, [MUTED_CANVAS], { belly: 0.1, lump: 0.09, ends: 2.5, folds: 4 });
      canister(c, rw * 0.5, top + 0.025, hl * 0.62, 0.1, OLIVE_CAN);
      // (wave 211: "stiff hoops standing in for lashings") ropes pulled down tight over the box's corners and over the
      // tarp's own curve, tied off at the slats' ends
      if (!c.coarse) c.mesh.dressing(() => {
        const bw = s.width * 0.4 + 0.012, bh = top + 0.38;
        for (const z of [-hl * 0.55, -hl * 0.25]) bentRod(c, [[-rw, top + 0.02, z], [-bw, bh - 0.03, z], [-bw + 0.03, bh, z], [bw - 0.03, bh, z],
          [bw, bh - 0.03, z], [rw, top + 0.02, z]], 0.011, ROPE, false);
        for (const z of [hl * 0.08, hl * 0.36]) {
          const arch: Vec3[] = [[-rw, top + 0.02, z]];
          for (let k = 0; k <= 10; k++) {
            const th = Math.PI - (k / 10) * Math.PI, ct = Math.cos(th), st = Math.sin(th);
            arch.push([Math.sign(ct) * Math.pow(Math.abs(ct), 2 / 2.6) * rw * 0.93, top + 0.03 + Math.pow(st, 2 / 2.6) * 0.33, z]);
          }
          arch.push([rw, top + 0.02, z]);
          bentRod(c, arch, 0.011, ROPE, false);
        }
      });
      snowCover(c, 0, top + 0.33, hl * 0.22, rw * 0.6, hl * 0.22, 0.05);
      snowCover(c, 0, top + 0.37, -hl * 0.4, s.width * 0.3, 0.2, 0.04);
    } else firewood(c, 0, top + 0.025, 0, s.width * 0.9, s.len * 0.7, 2);
  };
  runnerGrooves(c, [-rw, rw], -hl - 5.0, hl + 0.3, 0.13);
  runnerLips(c, [-rw, rw], 0.022, -hl, hl * 0.78);
  return { wheels: [], body, load, debris: { w: 0.07, l: 0.8 } };
}

/** A sled smashed: heeled over onto one runner and slewed, its load spilled beside it. */
function wreckSled(c: Ctx, a: Assembly, halfWidth: number, spill = 1.9): void {
  c.mesh.push().translate(halfWidth, 0, 0).rotateZ(-0.55).rotateY(0.18).translate(-halfWidth, 0, 0);
  a.body();
  c.mesh.pop();
  if (a.load) {
    c.mesh.push().translate(halfWidth * spill, 0, 0.1).scale(1.15, 0.5, 1.05);
    a.load();
    c.mesh.pop();
  }
  a.ground?.();
}

// ---------------------------------------------------------------------------------------------------- dispatch

export type CartModel = CharretteSpec | LeiterwagenSpec | BarrowSpec | TipCartSpec | TrolleySpec | TyreCartSpec | RiyakaSpec | ThelaSpec
  | RickshawSpec | CanTrolleySpec | DrumTruckSpec | BottleCartSpec | ToolCarrierSpec | EvaCartSpec | Cart2Spec | Wagon4Spec | TrailerSpec
  | SledgeSpec | SledSpec;

interface CartBuildOptions {
  readonly coarse: boolean;
  readonly wrecked: boolean;
  readonly seed: number;
  readonly snow?: boolean;
}

function assembly(c: Ctx, m: CartModel): Assembly {
  switch (m.kind) {
    case 'charrette': return charrette(c, m);
    case 'leiterwagen': return leiterwagen(c, m);
    case 'barrow': return barrow(c, m);
    case 'tipcart': return tipcart(c, m);
    case 'trolley': return trolley(c, m);
    case 'tyrecart': return tyrecart(c, m);
    case 'riyaka': return riyaka(c, m);
    case 'thela': return thela(c, m);
    case 'rickshaw': return rickshaw(c, m);
    case 'cantrolley': return cantrolley(c, m);
    case 'drumtruck': return drumtruck(c, m);
    case 'bottlecart': return bottlecart(c, m);
    case 'toolcarrier': return toolcarrier(c, m);
    case 'evacart': return evacart(c, m);
    case 'cart2': return cart2(c, m);
    case 'wagon4': return wagon4(c, m);
    case 'trailer': return trailer(c, m);
    case 'sledge': return sledge(c, m);
    case 'sled': return sled(c, m);
  }
}

/** Build a cart or sled into the mesh, intact or wrecked. */
export function buildCart(mesh: VehicleMesh, m: CartModel, o: CartBuildOptions): void {
  const c: Ctx = { mesh, coarse: o.coarse, seed: o.seed, woods: m.wood.map((hex) => woodMat(hex)), snow: o.snow };
  const a = assembly(c, m);
  if (!o.wrecked || a.wheels.length) { assemble(c, a, o.wrecked); return; }
  // the hay sledge's spill lies a little closer since its heap sits within the rack (the wave-161 pass)
  wreckSled(c, a, m.kind === 'sled' ? m.width / 2 : m.kind === 'sledge' ? m.bedW / 2 + 0.3 : 0.3, m.kind === 'sledge' ? 1.6 : 1.9);
}

/** A sled's runner tracks (model space; null for a wheeled cart): what its builder records (runnerGrooves). */
export function cartRunners(m: CartModel): RunnerTrack | null {
  const c: Ctx = { mesh: new VehicleMesh(), coarse: true, seed: 0, woods: m.wood.map((hex) => woodMat(hex)), runners: [] };
  assembly(c, m);
  return c.runners?.[0] ?? null;
}

/** The cart's wheels (axle z, centre height, radius): the spray zones its weathering darkens. */
export function cartWheels(m: CartModel): { z: number; y: number; r: number }[] {
  const c: Ctx = { mesh: new VehicleMesh(), coarse: true, seed: 0, woods: m.wood.map((hex) => woodMat(hex)) };
  return assembly(c, m).wheels.filter((w) => w.side > 0).map((w) => ({ z: w.z, y: w.y, r: w.r }));
}

