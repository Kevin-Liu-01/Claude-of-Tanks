// src/world/landmarks/mining.ts — a mine's works (the map-content lane, 2026-10-09; owner: "some maps like whiteout
// crossing and mesa mines look unfinished and so empty"): the steel poppet headframe over its shaft with the winding
// house behind it, the truck-loading ore bin on its legs, the inclined conveyor gallery on its bents from a tail house to
// a head tower, and a string of side-tipping ore cars behind a little diesel on a narrow-gauge spur.
//
// Reference: the Mount Lyell Mining and Railway Company's works at Queenstown, Tasmania, as they stood in the 1970s: the
// North Lyell and Prince Lyell shafts' steel headframes (some 20 m to the sheaves) with their corrugated-iron winding
// houses, the ore bins and the conveyors that carried the ore from the crusher to the concentrator, and the 3 ft 6 in
// gauge cars of the company's railway. Paint: red oxide on the steel, galvanised and rusting corrugated iron.
//
// Each piece is drawn in its own frame (x across, y up, z out of its front, ground at y = 0) into the regional part sink,
// so it merges into the props' material buckets: no draw call of its own. Lattice, ropes, rails and rungs are dressing;
// the legs, the bodies and the footings are structure.
import type { SimpleCollisionShape } from '../collision.ts';
import { PartSink, rgb, shade, type EmitOptions, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';
import { bar } from './kit.ts';
import type { LandmarkBuilder, LandmarkBuildContext } from './types.ts';

const OXIDE = rgb(0x6e3328), GALV = rgb(0xa4a8a5), IRON_SHEET = rgb(0x8f7a68), RUST = rgb(0x6e3a24);
const STEEL = rgb(0x5f6466), IRON = rgb(0x2c2d2e), ORE = rgb(0x7a4a32), TIMBER = rgb(0x6a5644), CREAM = rgb(0xd6cfbd), YELLOW = rgb(0xc8a83a);
const SHAFT = rgb(0x0d0c0b);

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];
const lerp = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const num = (ctx: LandmarkBuildContext, key: string, min: number): number => Math.max(min, Number(ctx.params[key]));
const rusting = (base: Rgb, y0: number, y1: number, k = 0.3) => (p: Vec3): Rgb => {
  const t = Math.min(1, Math.max(0, (p[1] - y0) / Math.max(0.01, y1 - y0)));
  return lerp(lerp(base, RUST, k), base, Math.sqrt(t));
};

function footing(sink: PartSink, ctx: LandmarkBuildContext, x: number, z: number, hw: number, hd: number, top = 0.4, y = 0): void {
  sink.span('stone', x - hw, y - 0.6 - ctx.groundFall, z - hd, x + hw, y + top, z + hd);
}

/** A gabled corrugated-iron shed: walls from y 0 to `eave`, the ridge along z, a door on its front (+z) end. */
function shed(sink: PartSink, cx: number, cz: number, w: number, d: number, eaveH: number, ridgeH: number, paint: Rgb, ctx: LandmarkBuildContext): number {
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  // (seated on the highest ground under it, its footing down past the lowest: plan.ts drapes)
  const gl = (lx: number, lz: number) => ctx.ground?.(lx, lz) ?? 0;
  const gs = [gl(x0, z0), gl(x1, z0), gl(x0, z1), gl(x1, z1), gl(cx, cz)], lo = Math.min(...gs), hi = Math.max(...gs);
  const y = hi, eave = y + eaveH, ridge = y + ridgeH;
  sink.span('stone', x0 - 0.2, Math.min(lo - 0.8, -0.6), z0 - 0.2, x1 + 0.2, y + 0.3, z1 + 0.2);
  sink.span('structureMetal', x0, y + 0.3, z0, x1, eave, z1, { colourAt: rusting(paint, y + 0.3, eave, 0.35) });
  // the gables (front and back) and the roof's two slopes, the eaves overhanging
  const o = 0.35;
  sink.polygon('structureMetal', [[x0, eave, z1], [x1, eave, z1], [cx, ridge, z1]], { colour: paint });
  sink.polygon('structureMetal', [[x1, eave, z0], [x0, eave, z0], [cx, ridge, z0]], { colour: paint });
  sink.quad('roof', [x0 - o, eave - 0.15, z1 + o], [x0 - o, eave - 0.15, z0 - o], [cx, ridge + 0.05, z0 - o], [cx, ridge + 0.05, z1 + o]);
  sink.quad('roof', [x1 + o, eave - 0.15, z0 - o], [x1 + o, eave - 0.15, z1 + o], [cx, ridge + 0.05, z1 + o], [cx, ridge + 0.05, z0 - o]);
  // the roof's undersides (seen from below at the eaves)
  sink.quad('structureMetal', [x0 - o, eave - 0.17, z0 - o], [x0 - o, eave - 0.17, z1 + o], [cx, ridge - 0.02, z1 + o], [cx, ridge - 0.02, z0 - o], { colour: shade(paint, 0.5), decor: true });
  sink.quad('structureMetal', [x1 + o, eave - 0.17, z1 + o], [x1 + o, eave - 0.17, z0 - o], [cx, ridge - 0.02, z0 - o], [cx, ridge - 0.02, z1 + o], { colour: shade(paint, 0.5), decor: true });
  // the door and a window on each long side
  sink.quad('structureMetal', [cx - 1.2, y + 0.32, z1 + 0.03], [cx + 1.2, y + 0.32, z1 + 0.03], [cx + 1.2, y + Math.min(eaveH - 0.4, 3.6), z1 + 0.03], [cx - 1.2, y + Math.min(eaveH - 0.4, 3.6), z1 + 0.03], { colour: shade(paint, 0.55), decor: true });
  const wy = y + eaveH * 0.55;
  for (let k = 0; k < Math.max(1, Math.round(d / 5)); k++) {
    const z = z0 + (k + 0.5) * d / Math.max(1, Math.round(d / 5));
    sink.quad('glass', [x1 + 0.03, wy, z + 0.6], [x1 + 0.03, wy, z - 0.6], [x1 + 0.03, wy + 1.0, z - 0.6], [x1 + 0.03, wy + 1.0, z + 0.6], { decor: true });
    sink.quad('glass', [x0 - 0.03, wy, z - 0.6], [x0 - 0.03, wy, z + 0.6], [x0 - 0.03, wy + 1.0, z + 0.6], [x0 - 0.03, wy + 1.0, z - 0.6], { decor: true });
  }
  // the sheet's laps (fine vertical battens) down the long sides
  for (const x of [x0 - 0.02, x1 + 0.02]) for (let z = z0 + 0.9; z < z1 - 0.4; z += 0.9) {
    sink.span('structureMetal', x - 0.02, y + 0.3, z - 0.02, x + 0.02, eave, z + 0.02, { colour: shade(paint, 0.82), decor: true, fine: true });
  }
  return y;
}

/** A spoked wheel in the yz plane (a sheave, a car's wheel): rim, spokes and hub, centred at c, radius r. */
function sheave(sink: PartSink, c: Vec3, r: number, spokes: number, colour: Rgb, rimT: number, opts: EmitOptions = {}): void {
  const seg = 16, rim: Vec3[] = [];
  for (let k = 0; k < seg; k++) { const a = (k / seg) * Math.PI * 2; rim.push([c[0], c[1] + Math.sin(a) * r, c[2] + Math.cos(a) * r]); }
  for (let k = 0; k < seg; k++) bar(sink, 'structureMetal', rim[k], rim[(k + 1) % seg], rimT, { colour, ...opts });
  for (let k = 0; k < spokes; k++) bar(sink, 'structureMetal', c, rim[Math.round((k / spokes) * seg) % seg], rimT * 0.5, { colour, decor: true, ...opts });
  sink.cylinder('structureMetal', [c[0] - 0.25, c[1], c[2]], 'x', 0.5, r * 0.14, 8, { colour, decor: true, ...opts });
}

// ------------------------------------------------------------------------------------------------------------ headframe

/** Where a headframe's shaft stands in its frame (the piece centred on its footprint): see plan.ts. */
export function headframeShaftZ(height: number): number { return 0.25 * height + 4; }

/**
 * The steel poppet headframe: four legs over the shaft collar, braced back by two raking struts toward the winding house,
 * the girts and the cross bracing, the sheave deck and its railing at the top with the two sheave wheels, the ropes
 * running down to the winding house; the ore bin on the legs' front with its chute; the winding house behind.
 */
export const headframe: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const Hh = num(ctx, 'height', 12), zs = headframeShaftZ(Hh), half = 1.6, paint = String(ctx.params.paint) === 'black' ? IRON : OXIDE;
  const legOpts = { colour: paint };
  // (on falling ground — plan.ts drapes — the frame stands on its collar at the highest ground under it, the struts and
  // the bin's legs foot on the ground under them, the winding house on its own footing)
  const gl = (lx: number, lz: number) => ctx.ground?.(lx, lz) ?? 0;
  const cg = [gl(-2.6, zs - 2.6), gl(2.6, zs - 2.6), gl(-2.6, zs + 2.6), gl(2.6, zs + 2.6), gl(0, zs)];
  const g0 = Math.max(...cg), gLo = Math.min(...cg), H = g0 + Hh;
  // the shaft collar: a concrete block, the dark shaft between its timbers
  sink.span('stone', -2.6, Math.min(gLo - 0.8, -0.6), zs - 2.6, 2.6, g0 + 1.2, zs + 2.6);
  sink.quad('structureMetal', [-1.0, g0 + 1.22, zs + 1.5], [1.0, g0 + 1.22, zs + 1.5], [1.0, g0 + 1.22, zs - 1.5], [-1.0, g0 + 1.22, zs - 1.5], { colour: SHAFT, decor: true });
  // the four legs and the raking struts
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bar(sink, 'structureMetal', [sx * half, g0 + 1.2, zs + sz * half], [sx * half, H, zs + sz * half], 0.32, legOpts);
  const az = zs - 0.5 * Hh;
  for (const sx of [-1, 1]) {
    const ga = gl(sx * 2.4, az);
    sink.span('stone', sx * 2.4 - 0.55, Math.min(ga - 0.8, -0.6), az - 0.55, sx * 2.4 + 0.55, ga + 0.4, az + 0.55);
    bar(sink, 'structureMetal', [sx * 2.4, ga + 0.4, az], [sx * half, H - 0.8, zs - half], 0.3, legOpts);
    bar(sink, 'structureMetal', [sx * 2.4, ga + 0.4, az], [sx * half, g0 + Hh * 0.45, zs - half], 0.16, { ...legOpts, decor: true });
  }
  // the girts round the legs and the cross bracing on the sides (fine)
  for (let y = g0 + 4; y < H - 0.5; y += 3.5) {
    for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]] as const) {
      bar(sink, 'structureMetal', [a[0] * half, y, zs + a[1] * half], [b[0] * half, y, zs + b[1] * half], 0.14, { ...legOpts, decor: true });
      bar(sink, 'structureMetal', [a[0] * half, y - 3.5 + 0.2, zs + a[1] * half], [b[0] * half, y, zs + b[1] * half], 0.07, { ...legOpts, decor: true, fine: true });
    }
  }
  // the sheave deck and its railing, the two sheaves on their bearers
  sink.span('structureMetal', -half - 0.6, H, zs - half - 0.6, half + 0.6, H + 0.3, zs + half + 0.6, { colour: shade(paint, 0.8) });
  const rail = (x0: number, z0: number, x1: number, z1: number) => {
    for (const [a, b] of [[[x0, z0], [x1, z0]], [[x1, z0], [x1, z1]], [[x1, z1], [x0, z1]], [[x0, z1], [x0, z0]]] as const) {
      bar(sink, 'structureMetal', [a[0], H + 1.3, a[1]], [b[0], H + 1.3, b[1]], 0.05, { colour: IRON, decor: true });
      for (const t of [0, 0.5]) bar(sink, 'structureMetal', [a[0] + (b[0] - a[0]) * t, H + 0.3, a[1] + (b[1] - a[1]) * t], [a[0] + (b[0] - a[0]) * t, H + 1.3, a[1] + (b[1] - a[1]) * t], 0.05, { colour: IRON, decor: true });
    }
  };
  rail(-half - 0.55, zs - half - 0.55, half + 0.55, zs + half + 0.55);
  // the winding house behind the struts (its own footing) and the ropes down to its drums
  const hz1 = az - 3, hd = 10;
  const hy = shed(sink, 0, hz1 - hd / 2, 9, hd, 6.0, 8.0, IRON_SHEET, ctx);
  const R = Math.min(2.0, Hh * 0.085), hubY = H + 0.3 + R + 0.4;
  for (const sx of [-1, 1]) {
    const c: Vec3 = [sx * 0.9, hubY, zs - 0.2];
    for (const dz of [-1.1, 1.1]) bar(sink, 'structureMetal', [sx * 0.9, H + 0.3, zs - 0.2 + dz], [sx * 0.9, hubY, zs - 0.2], 0.16, legOpts);
    sheave(sink, c, R, 6, IRON, 0.12);
    bar(sink, 'structureMetal', [sx * 0.9, hubY + R, zs - 0.2], [sx * 0.9, hy + 4.2, hz1 - 0.4], 0.05, { colour: IRON, decor: true });
    bar(sink, 'structureMetal', [sx * 0.9, hubY - R * 0.2, zs + R * 0.9], [sx * 0.9, g0 + 1.3, zs + 0.6], 0.05, { colour: IRON, decor: true });
  }
  for (const sx of [-1, 1]) sink.quad('structureMetal', [sx * 0.9 - 0.3, hy + 4.0, hz1 + 0.04], [sx * 0.9 + 0.3, hy + 4.0, hz1 + 0.04], [sx * 0.9 + 0.3, hy + 4.6, hz1 + 0.04], [sx * 0.9 - 0.3, hy + 4.6, hz1 + 0.04], { colour: SHAFT, decor: true });
  // the ladder up the front leg
  for (let y = g0 + 1.6; y < H; y += 0.4) bar(sink, 'structureMetal', [half - 0.1, y, zs + half + 0.25], [half - 0.6, y, zs + half + 0.25], 0.03, { colour: IRON, decor: true, fine: true });
  // the ore bin on the legs' front and its chute, its two front legs footed on the ground
  sink.span('structureMetal', -1.8, g0 + 5.5, zs + half, 1.8, g0 + 9.0, zs + half + 2.6, { colourAt: rusting(STEEL, g0 + 5.5, g0 + 9.0, 0.45) });
  sink.polygon('structureMetal', [[-1.8, g0 + 5.5, zs + half + 2.6], [1.8, g0 + 5.5, zs + half + 2.6], [0.8, g0 + 4.2, zs + half + 3.4], [-0.8, g0 + 4.2, zs + half + 3.4]], { colour: shade(STEEL, 0.8), decor: true });
  for (const sx of [-1, 1]) {
    const gb = gl(sx * 1.6, zs + half + 2.4);
    sink.span('stone', sx * 1.6 - 0.35, Math.min(gb - 0.8, -0.6), zs + half + 2.05, sx * 1.6 + 0.35, gb + 0.4, zs + half + 2.75);
    bar(sink, 'structureMetal', [sx * 1.6, gb + 0.4, zs + half + 2.4], [sx * 1.6, g0 + 5.5, zs + half + 2.4], 0.22, legOpts);
  }
  return { parts: sink.finish() };
};

// ------------------------------------------------------------------------------------------------------------- ore bin

/**
 * The truck-loading ore bin: the steel hopper on six legs, its pyramid bottom down to the gate over the drive-through
 * bay, the head house on its top where the conveyor delivers, the ladder up a leg. The bay stays open: a hull drives
 * under the hopper between the legs.
 */
export const oreBin: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const W = num(ctx, 'width', 5), D = num(ctx, 'depth', 4), clear = num(ctx, 'clearance', 4.2), H = Math.max(clear + 5, num(ctx, 'height', 8));
  // (on falling ground — plan.ts drapes — the hopper clears the highest ground under it, each leg foots on its own)
  const gl = (lx: number, lz: number) => ctx.ground?.(lx, lz) ?? 0;
  const hw = W / 2, hd = D / 2;
  let g0 = 0;
  for (const sx of [-1, 0, 1]) for (const sz of [-1, 0, 1]) g0 = Math.max(g0, gl(sx * hw, sz * hd));
  const clearY = g0 + clear, boxY = clearY + 2.2, top = g0 + H - 2.2, Ht = g0 + H;
  for (const sx of [-1, 1]) for (const z of [-hd + 0.3, 0, hd - 0.3]) {
    const g = gl(sx * (hw - 0.3), z);
    sink.span('stone', sx * (hw - 0.3) - 0.45, Math.min(g - 0.8, -0.6), z - 0.45, sx * (hw - 0.3) + 0.45, g + 0.4, z + 0.45);
    bar(sink, 'structureMetal', [sx * (hw - 0.3), g + 0.4, z], [sx * (hw - 0.3), boxY, z], 0.38, { colour: OXIDE });
  }
  // the bracing between the legs along each side (above a hull's height)
  for (const sx of [-1, 1]) for (const [za, zb] of [[-hd + 0.3, 0], [0, hd - 0.3]]) {
    bar(sink, 'structureMetal', [sx * (hw - 0.3), clearY - 0.5, za], [sx * (hw - 0.3), boxY, zb], 0.12, { colour: OXIDE, decor: true });
  }
  // the hopper and its pyramid bottom
  sink.span('structureMetal', -hw, boxY, -hd, hw, top, hd, { colourAt: rusting(STEEL, boxY, top, 0.4) });
  const g = 0.7, gy = clearY;
  const rimP: Vec3[] = [[-hw, boxY, hd], [hw, boxY, hd], [hw, boxY, -hd], [-hw, boxY, -hd]];
  const gateP: Vec3[] = [[-g, gy, g], [g, gy, g], [g, gy, -g], [-g, gy, -g]];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    sink.quad('structureMetal', gateP[i], gateP[j], rimP[j], rimP[i], { colour: shade(STEEL, 0.72) });
  }
  sink.span('structureMetal', -g - 0.1, gy - 0.6, -g - 0.1, g + 0.1, gy, g + 0.1, { colour: IRON, decor: true });
  // the head house on top (the conveyor's delivery), its gable roof
  sink.span('structureMetal', -hw * 0.7, top, -hd * 0.8, hw * 0.7, Ht, hd * 0.8, { colourAt: rusting(IRON_SHEET, top, Ht, 0.3) });
  sink.quad('roof', [-hw * 0.7 - 0.3, Ht, hd * 0.8 + 0.3], [-hw * 0.7 - 0.3, Ht, -hd * 0.8 - 0.3], [0, Ht + 1.1, -hd * 0.8 - 0.3], [0, Ht + 1.1, hd * 0.8 + 0.3]);
  sink.quad('roof', [hw * 0.7 + 0.3, Ht, -hd * 0.8 - 0.3], [hw * 0.7 + 0.3, Ht, hd * 0.8 + 0.3], [0, Ht + 1.1, hd * 0.8 + 0.3], [0, Ht + 1.1, -hd * 0.8 - 0.3]);
  sink.polygon('structureMetal', [[-hw * 0.7, Ht, hd * 0.8], [hw * 0.7, Ht, hd * 0.8], [0, Ht + 1.1, hd * 0.8]], { colour: IRON_SHEET });
  sink.polygon('structureMetal', [[hw * 0.7, Ht, -hd * 0.8], [-hw * 0.7, Ht, -hd * 0.8], [0, Ht + 1.1, -hd * 0.8]], { colour: IRON_SHEET });
  // the ladder up the back-left leg and the walkway round the hopper's top
  for (let y = gl(-hw, -hd) + 0.8; y < top; y += 0.4) bar(sink, 'structureMetal', [-hw + 0.05, y, -hd + 0.6], [-hw + 0.05, y, -hd + 0.15], 0.03, { colour: IRON, decor: true, fine: true });
  for (const [a, b] of [[[-hw - 0.5, -hd - 0.5], [hw + 0.5, -hd - 0.5]], [[hw + 0.5, -hd - 0.5], [hw + 0.5, hd + 0.5]], [[hw + 0.5, hd + 0.5], [-hw - 0.5, hd + 0.5]], [[-hw - 0.5, hd + 0.5], [-hw - 0.5, -hd - 0.5]]] as const) {
    bar(sink, 'structureMetal', [a[0], top + 1.0, a[1]], [b[0], top + 1.0, b[1]], 0.05, { colour: YELLOW, decor: true });
  }
  sink.span('structureMetal', -hw - 0.5, top - 0.1, -hd - 0.5, hw + 0.5, top, hd + 0.5, { colour: IRON, decor: true });
  // ore spilt under the gate (dressing)
  const gc = gl(0, 0) + 0.06;
  sink.polygon('structureMetal', [[-1.6, gc, 1.4], [1.6, gc, 1.4], [1.4, gc, -1.5], [-1.5, gc, -1.3]], { colour: ORE, decor: true });
  return { parts: sink.finish() };
};

// ----------------------------------------------------------------------------------------------------------- conveyor

/**
 * The inclined conveyor gallery: a clad box truss rising along +z from the tail house to the head tower, borne on
 * two-legged bents footed on the ground under them; its windows' strip down each side; a walkway's railing on the roof
 * edge. The bents' feet and the end houses are its movement record (a hull passes under the gallery between them).
 */
export const conveyor: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const L = num(ctx, 'length', 20), W = num(ctx, 'width', 2), headH = num(ctx, 'head', 6), tailH = num(ctx, 'tail', 2), gh = 2.2;
  const g = (lx: number, lz: number) => ctx.ground?.(lx, lz) ?? 0;
  const z0 = -L / 2 + 2.5, z1 = L / 2 - 2.5, hw = W / 2;
  const yT = g(0, z0) + tailH, yH = g(0, z1) + headH;
  const yAt = (z: number) => yT + (yH - yT) * ((z - z0) / (z1 - z0));
  const movement: SimpleCollisionShape[] = [];
  // the tail house round the gallery's foot and the head tower under its top
  const tailTop = g(0, z0) + tailH + gh + 0.6;
  footing(sink, ctx, 0, z0, 2.0, 2.0, 0.3, g(0, z0));
  sink.span('structureMetal', -2.0, g(0, z0) + 0.3, z0 - 2.0, 2.0, tailTop, z0 + 1.2, { colourAt: rusting(IRON_SHEET, g(0, z0), tailTop, 0.35) });
  sink.span('structureMetal', -2.2, tailTop, z0 - 2.2, 2.2, tailTop + 0.2, z0 + 1.4, { colour: shade(IRON_SHEET, 0.7) });
  movement.push({ kind: 'obb', cx: 0, cz: z0 - 0.4, hw: 2.0, hl: 1.6, yaw: 0, y0: g(0, z0) - 0.3, y1: tailTop + 0.2 });
  const hgz = g(0, z1);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    footing(sink, ctx, sx * 1.6, z1 + sz * 1.6, 0.4, 0.4, 0.3, g(sx * 1.6, z1 + sz * 1.6));
    bar(sink, 'structureMetal', [sx * 1.6, g(sx * 1.6, z1 + sz * 1.6) + 0.3, z1 + sz * 1.6], [sx * 1.6, yH, z1 + sz * 1.6], 0.3, { colour: OXIDE });
  }
  for (let y = hgz + 3; y < yH - 0.5; y += 3) {
    for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]] as const) {
      bar(sink, 'structureMetal', [a[0] * 1.6, y, z1 + a[1] * 1.6], [b[0] * 1.6, y, z1 + b[1] * 1.6], 0.12, { colour: OXIDE, decor: true });
    }
  }
  sink.span('structureMetal', -2.2, yH, z1 - 1.6, 2.2, yH + gh + 1.4, z1 + 2.2, { colourAt: rusting(IRON_SHEET, yH, yH + gh + 1.4, 0.3) });
  sink.span('structureMetal', -2.4, yH + gh + 1.4, z1 - 1.8, 2.4, yH + gh + 1.6, z1 + 2.4, { colour: shade(IRON_SHEET, 0.7) });
  movement.push({ kind: 'obb', cx: 0, cz: z1, hw: 1.9, hl: 1.9, yaw: 0, y0: hgz - 0.3, y1: yH + gh + 1.6 });
  // the gallery: segments between the bents, each a clad box on the incline
  const bents = Math.max(1, Math.round((z1 - z0) / 12));
  const corner = (z: number, sx: number, up: number): Vec3 => [sx * hw, yAt(z) + up, z];
  for (let k = 0; k < bents; k++) {
    const a = z0 + ((z1 - z0) * k) / bents, b = z0 + ((z1 - z0) * (k + 1)) / bents;
    const side = (sx: number) => {
      const p: Vec3[] = [corner(a, sx, 0), corner(b, sx, 0), corner(b, sx, gh), corner(a, sx, gh)];
      sink.polygon('structureMetal', sx > 0 ? [p[1], p[0], p[3], p[2]] : p, { colourAt: rusting(GALV, yAt(a), yAt(a) + gh, 0.4) });
      // the windows' strip (a dark band)
      const q: Vec3[] = [corner(a, sx * 1.01, gh * 0.55), corner(b, sx * 1.01, gh * 0.55), corner(b, sx * 1.01, gh * 0.8), corner(a, sx * 1.01, gh * 0.8)];
      sink.polygon('structureMetal', sx > 0 ? [q[1], q[0], q[3], q[2]] : q, { colour: IRON, decor: true });
    };
    side(1); side(-1);
    sink.quad('structureMetal', corner(a, -1, gh), corner(a, 1, gh), corner(b, 1, gh), corner(b, -1, gh), { colour: shade(GALV, 0.85) });
    sink.quad('structureMetal', corner(b, -1, 0), corner(b, 1, 0), corner(a, 1, 0), corner(a, -1, 0), { colour: shade(GALV, 0.5) });
    // the chords along the bottom (the truss under the cladding)
    for (const sx of [-1, 1]) bar(sink, 'structureMetal', [sx * (hw + 0.08), yAt(a) - 0.1, a], [sx * (hw + 0.08), yAt(b) - 0.1, b], 0.16, { colour: OXIDE, decor: true });
  }
  // the bents between the segments: two legs, the cross beam under the gallery and a brace
  for (let k = 1; k < bents; k++) {
    const z = z0 + ((z1 - z0) * k) / bents, y = yAt(z) - 0.2;
    for (const sx of [-1, 1]) {
      const x = sx * (hw + 0.35), gy = g(x, z);
      footing(sink, ctx, x, z, 0.4, 0.4, 0.3, gy);
      bar(sink, 'structureMetal', [x, gy + 0.3, z], [x, y, z], 0.28, { colour: OXIDE });
      movement.push({ kind: 'circle', cx: x, cz: z, r: 0.45, y0: gy - 0.3, y1: y });
    }
    bar(sink, 'structureMetal', [-(hw + 0.5), y, z], [hw + 0.5, y, z], 0.24, { colour: OXIDE });
    const ga = g(-(hw + 0.35), z), gb = g(hw + 0.35, z);
    bar(sink, 'structureMetal', [-(hw + 0.35), ga + 2.5, z], [hw + 0.35, y - 0.3, z], 0.08, { colour: OXIDE, decor: true, fine: true });
    bar(sink, 'structureMetal', [hw + 0.35, gb + 2.5, z], [-(hw + 0.35), y - 0.3, z], 0.08, { colour: OXIDE, decor: true, fine: true });
  }
  return { parts: sink.finish(), movement };
};

// ------------------------------------------------------------------------------------------------------------ ore cars

/**
 * A narrow-gauge spur with its ore cars: the ballast bed, the sleepers and the rails along z, a string of side-tipping
 * V-skip cars on their frames and wheels, and the little four-wheeled diesel at the head (+z).
 */
export const oreCars: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const n = Math.round(num(ctx, 'cars', 1)), gauge = num(ctx, 'gauge', 0.6), pitch = 3.0;
  const len = n * pitch + 4.6, z0 = -len / 2;
  // (the track lies on the ground in short lengths — plan.ts drapes — and each car and the diesel stand level on it)
  const gl = (lx: number, lz: number) => ctx.ground?.(lx, lz) ?? 0;
  const zA = z0 - 1.5, zB = -z0 + 1.5, segs = Math.max(2, Math.ceil((zB - zA) / 3));
  const track = (z: number) => gl(0, z);
  for (let k = 0; k < segs; k++) {
    const a = zA + ((zB - zA) * k) / segs, b = zA + ((zB - zA) * (k + 1)) / segs, ga = track(a), gb = track(b);
    sink.span('stone', -1.2, Math.min(ga, gb) - 0.4, a, 1.2, Math.max(ga, gb) + 0.2, b, { decor: true });
    for (const sx of [-1, 1]) bar(sink, 'structureMetal', [sx * gauge / 2, ga + 0.38, a], [sx * gauge / 2, gb + 0.38, b], 0.08, { colour: IRON, decor: true });
  }
  for (let z = zA + 0.3; z <= zB - 0.3; z += 0.7) { const g = track(z); sink.span('structureWood', -0.95, g + 0.2, z - 0.1, 0.95, g + 0.32, z + 0.1, { colour: TIMBER, decor: true, fine: true }); }
  // the cars
  for (let k = 0; k < n; k++) {
    const cz = z0 + 1.2 + (k + 0.5) * pitch, tone = lerp(ORE, RUST, ctx.variant() * 0.6);
    const rail = Math.max(track(cz - 1.0), track(cz + 1.0), track(cz)) + 0.42;
    sink.span('structureMetal', -0.75, rail + 0.35, cz - 1.15, 0.75, rail + 0.6, cz + 1.15, { colour: IRON });
    // the V-skip: two sloped sides meeting at a keel, the end plates, the ore heaped in it
    const yk = rail + 0.75, yt = rail + 1.75, w = 0.95;
    sink.quad('structureMetal', [w, yt, cz - 1.0], [w, yt, cz + 1.0], [0, yk, cz + 1.0], [0, yk, cz - 1.0], { colour: tone });
    sink.quad('structureMetal', [-w, yt, cz + 1.0], [-w, yt, cz - 1.0], [0, yk, cz - 1.0], [0, yk, cz + 1.0], { colour: tone });
    for (const e of [-1, 1]) {
      const pts: Vec3[] = [[-w, yt, cz + e * 1.0], [0, yk, cz + e * 1.0], [w, yt, cz + e * 1.0]];
      sink.polygon('structureMetal', e > 0 ? pts : [...pts].reverse(), { colour: shade(tone, 0.8) });
    }
    sink.span('structureMetal', -0.12, rail + 0.6, cz - 0.9, 0.12, yk + 0.02, cz + 0.9, { colour: IRON });
    sink.polygon('structureMetal', [[-w + 0.1, yt - 0.05, cz + 0.9], [w - 0.1, yt - 0.05, cz + 0.9], [w - 0.1, yt - 0.05, cz - 0.9], [-w + 0.1, yt - 0.05, cz - 0.9]], { colour: ORE, decor: true });
    // the wheels down to the rails and the couplers
    for (const wz of [-0.7, 0.7]) for (const sx of [-1, 1]) {
      const g = track(cz + wz) + 0.42;
      sink.cylinder('structureMetal', [sx * gauge / 2 - (sx > 0 ? 0 : 0.1), g + 0.22, cz + wz], 'x', 0.1, 0.22, 8, { colour: IRON, decor: true });
      bar(sink, 'structureMetal', [sx * gauge / 2 - 0.05, g + 0.22, cz + wz], [sx * gauge / 2 - 0.05, rail + 0.36, cz + wz], 0.08, { colour: IRON, decor: true });
    }
    sink.span('structureMetal', -0.1, rail + 0.38, cz + 1.15, 0.1, rail + 0.52, cz + 1.5, { colour: IRON, decor: true });
  }
  // the diesel at the head: frame, hood, cab, its stack
  const lz = -z0 - 2.0, rail = Math.max(track(lz - 1.6), track(lz + 1.6), track(lz)) + 0.42;
  sink.span('structureMetal', -0.85, rail + 0.3, lz - 1.6, 0.85, rail + 0.65, lz + 1.6, { colour: IRON });
  sink.span('structureMetal', -0.6, rail + 0.65, lz - 0.2, 0.6, rail + 1.6, lz + 1.5, { colourAt: rusting(YELLOW, rail + 0.65, rail + 1.6, 0.3) });
  sink.span('structureMetal', -0.8, rail + 0.65, lz - 1.55, 0.8, rail + 2.4, lz - 0.3, { colourAt: rusting(YELLOW, rail + 0.65, rail + 2.4, 0.25) });
  sink.span('structureMetal', -0.9, rail + 2.4, lz - 1.65, 0.9, rail + 2.5, lz - 0.2, { colour: IRON });
  for (const sx of [-1, 1]) sink.quad('glass', [sx * 0.81, rail + 1.6, lz - (sx > 0 ? 1.4 : 0.45)], [sx * 0.81, rail + 1.6, lz - (sx > 0 ? 0.45 : 1.4)],
    [sx * 0.81, rail + 2.2, lz - (sx > 0 ? 0.45 : 1.4)], [sx * 0.81, rail + 2.2, lz - (sx > 0 ? 1.4 : 0.45)], { decor: true });
  sink.cylinder('structureMetal', [0.3, rail + 1.6, lz + 0.9], 'y', 0.7, 0.07, 6, { colour: IRON, decor: true });
  for (const wz of [-0.9, 0.9]) for (const sx of [-1, 1]) {
    const g = track(lz + wz) + 0.42;
    sink.cylinder('structureMetal', [sx * gauge / 2 - (sx > 0 ? 0 : 0.1), g + 0.3, lz + wz], 'x', 0.1, 0.3, 8, { colour: IRON, decor: true });
  }
  // the ore spilt along the track (dressing)
  const gsp = track(z0 + 3.6) + 0.22;
  sink.polygon('structureMetal', [[-1.1, gsp, z0 + 2], [1.0, gsp, z0 + 2.4], [1.1, gsp, z0 + 5.2], [-0.9, gsp, z0 + 4.8]], { colour: lerp(ORE, CREAM, 0.1), decor: true });
  // the movement record: the cars' and the diesel's run from the lowest ground under the track to the tops (on a slope the
  // derived contact band, the solids under 1.8 m over the base, can miss cars standing higher up it)
  let top = 0;
  for (let z = z0; z <= -z0; z += 1.5) top = Math.max(top, track(z) + 0.42 + 2.5);
  const movement: SimpleCollisionShape[] = [{ kind: 'obb', cx: 0, cz: (z0 + 0.05 + (-z0 - 0.4)) / 2, hw: 0.95, hl: (-z0 - 0.4 - (z0 + 0.05)) / 2, yaw: 0, y0: -0.3, y1: top }];
  return { parts: sink.finish(), movement };
};
