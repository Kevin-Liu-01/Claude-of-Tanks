// src/world/landmarks/mineWorks.ts (props census #3, lane B 2026-10-14: the headframe, ore bin and conveyor moved here as they
// were from mining.ts, the industrial yard's; the ore cars stay there) — was mining.ts — a mine's works (the map-content lane, 2026-10-09; owner: "some maps like whiteout
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
import { finishLandmark, piece } from './pieces.ts';

const OXIDE = rgb(0x6e3328), GALV = rgb(0xa4a8a5), IRON_SHEET = rgb(0x8f7a68), RUST = rgb(0x6e3a24);
const STEEL = rgb(0x5f6466), IRON = rgb(0x2c2d2e), ORE = rgb(0x7a4a32), YELLOW = rgb(0xc8a83a);
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
  // (the buildings stream, 2026-10-12, the integrity check: each slope and its underside were wound toward each other,
  // so a view from above saw the dark underside through the culled slope and a view from below the sheet's top) the
  // slopes face up and out, their undersides down
  sink.quad('roof', [cx, ridge + 0.05, z1 + o], [cx, ridge + 0.05, z0 - o], [x0 - o, eave - 0.15, z0 - o], [x0 - o, eave - 0.15, z1 + o]);
  sink.quad('roof', [cx, ridge + 0.05, z0 - o], [cx, ridge + 0.05, z1 + o], [x1 + o, eave - 0.15, z1 + o], [x1 + o, eave - 0.15, z0 - o]);
  // the roof's undersides (seen from below at the eaves)
  sink.quad('structureMetal', [cx, ridge - 0.02, z0 - o], [cx, ridge - 0.02, z1 + o], [x0 - o, eave - 0.17, z1 + o], [x0 - o, eave - 0.17, z0 - o], { colour: shade(paint, 0.5), decor: true });
  sink.quad('structureMetal', [cx, ridge - 0.02, z1 + o], [cx, ridge - 0.02, z0 - o], [x1 + o, eave - 0.17, z0 - o], [x1 + o, eave - 0.17, z1 + o], { colour: shade(paint, 0.5), decor: true });
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
  const rail = (s: PartSink, x0: number, z0: number, x1: number, z1: number) => {
    for (const [a, b] of [[[x0, z0], [x1, z0]], [[x1, z0], [x1, z1]], [[x1, z1], [x0, z1]], [[x0, z1], [x0, z0]]] as const) {
      bar(s, 'structureMetal', [a[0], H + 1.3, a[1]], [b[0], H + 1.3, b[1]], 0.05, { colour: IRON, decor: true });
      for (const t of [0, 0.5]) bar(s, 'structureMetal', [a[0] + (b[0] - a[0]) * t, H + 0.3, a[1] + (b[1] - a[1]) * t], [a[0] + (b[0] - a[0]) * t, H + 1.3, a[1] + (b[1] - a[1]) * t], 0.05, { colour: IRON, decor: true });
    }
  };
  // (props lane A, E12: an open frame, read as members — landmarks/damage.ts; the deck's rail comes off at the first
  // damage, the sheaves when the headframe is breached; landmarks/pieces.ts)
  piece(sink, { name: 'deck-rail', kind: 'lattice', at: 'damaged', fall: 'drop' }, (s) => rail(s, -half - 0.55, zs - half - 0.55, half + 0.55, zs + half + 0.55));
  // the winding house behind the struts (its own footing) and the ropes down to its drums
  const hz1 = az - 3, hd = 10;
  const hy = shed(sink, 0, hz1 - hd / 2, 9, hd, 6.0, 8.0, IRON_SHEET, ctx);
  const R = Math.min(2.0, Hh * 0.085), hubY = H + 0.3 + R + 0.4;
  for (const sx of [-1, 1]) {
    const c: Vec3 = [sx * 0.9, hubY, zs - 0.2];
    for (const dz of [-1.1, 1.1]) bar(sink, 'structureMetal', [sx * 0.9, H + 0.3, zs - 0.2 + dz], [sx * 0.9, hubY, zs - 0.2], 0.16, legOpts);
    piece(sink, { name: `sheave-${sx < 0 ? 'l' : 'r'}`, kind: 'lattice', at: 'breached', fall: 'flat' }, (s) => sheave(s, c, R, 6, IRON, 0.12));
    bar(sink, 'structureMetal', [sx * 0.9, hubY + R, zs - 0.2], [sx * 0.9, hy + 4.2, hz1 - 0.4], 0.05, { colour: IRON, decor: true });
    bar(sink, 'structureMetal', [sx * 0.9, hubY - R * 0.2, zs + R * 0.9], [sx * 0.9, g0 + 1.3, zs + 0.6], 0.05, { colour: IRON, decor: true });
  }
  for (const sx of [-1, 1]) sink.quad('structureMetal', [sx * 0.9 - 0.3, hy + 4.0, hz1 + 0.04], [sx * 0.9 + 0.3, hy + 4.0, hz1 + 0.04], [sx * 0.9 + 0.3, hy + 4.6, hz1 + 0.04], [sx * 0.9 - 0.3, hy + 4.6, hz1 + 0.04], { colour: SHAFT, decor: true });
  // the ladder up the front leg's outer side, from the collar to the sheave deck: two stiles bracketed to the leg, the
  // rungs between them (the connectivity sweep, 217: the rungs hung 7 cm off the leg's front, inside the ore bin)
  const lx = half + 0.34, lz0 = zs + half - 0.5, lz1 = zs + half;
  for (const lz of [lz0, lz1]) bar(sink, 'structureMetal', [lx, g0 + 1.2, lz], [lx, H, lz], 0.05, { colour: IRON, decor: true });
  for (let y = g0 + 3.0; y < H - 0.6; y += 3.0) bar(sink, 'structureMetal', [lx, y, lz1], [half, y, lz1], 0.05, { colour: IRON, decor: true });
  for (let y = g0 + 1.6; y < H; y += 0.4) bar(sink, 'structureMetal', [lx, y, lz0], [lx, y, lz1], 0.03, { colour: IRON, decor: true, fine: true });
  // the ore bin on the legs' front and its chute, its two front legs footed on the ground
  sink.span('structureMetal', -1.8, g0 + 5.5, zs + half, 1.8, g0 + 9.0, zs + half + 2.6, { colourAt: rusting(STEEL, g0 + 5.5, g0 + 9.0, 0.45) });
  sink.polygon('structureMetal', [[-1.8, g0 + 5.5, zs + half + 2.6], [1.8, g0 + 5.5, zs + half + 2.6], [0.8, g0 + 4.2, zs + half + 3.4], [-0.8, g0 + 4.2, zs + half + 3.4]], { colour: shade(STEEL, 0.8), decor: true });
  for (const sx of [-1, 1]) {
    const gb = gl(sx * 1.6, zs + half + 2.4);
    sink.span('stone', sx * 1.6 - 0.35, Math.min(gb - 0.8, -0.6), zs + half + 2.05, sx * 1.6 + 0.35, gb + 0.4, zs + half + 2.75);
    bar(sink, 'structureMetal', [sx * 1.6, gb + 0.4, zs + half + 2.4], [sx * 1.6, g0 + 5.5, zs + half + 2.4], 0.22, legOpts);
  }
  return { parts: finishLandmark(sink) };
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
  // (the integrity check, 2026-10-12: the slopes faced down into the house, open from above) wound to face up and out
  sink.quad('roof', [0, Ht + 1.1, hd * 0.8 + 0.3], [0, Ht + 1.1, -hd * 0.8 - 0.3], [-hw * 0.7 - 0.3, Ht, -hd * 0.8 - 0.3], [-hw * 0.7 - 0.3, Ht, hd * 0.8 + 0.3]);
  sink.quad('roof', [0, Ht + 1.1, -hd * 0.8 - 0.3], [0, Ht + 1.1, hd * 0.8 + 0.3], [hw * 0.7 + 0.3, Ht, hd * 0.8 + 0.3], [hw * 0.7 + 0.3, Ht, -hd * 0.8 - 0.3]);
  sink.polygon('structureMetal', [[-hw * 0.7, Ht, hd * 0.8], [hw * 0.7, Ht, hd * 0.8], [0, Ht + 1.1, hd * 0.8]], { colour: IRON_SHEET });
  sink.polygon('structureMetal', [[hw * 0.7, Ht, -hd * 0.8], [-hw * 0.7, Ht, -hd * 0.8], [0, Ht + 1.1, -hd * 0.8]], { colour: IRON_SHEET });
  // the ladder up the back-left leg's outer side to the walkway (its stiles from the ground to the walkway's floor, a
  // bracket to the leg every 2.4 m) and the walkway round the hopper's top, its rail on posts (the connectivity sweep,
  // 217: the rungs hung 4.5 cm off the leg, the rail a metre over the walkway on nothing)
  const lx = -hw - 0.16, lz0 = -hd + 0.05, lz1 = -hd + 0.55, lg = gl(lx, (lz0 + lz1) / 2);
  for (const lz of [lz0, lz1]) bar(sink, 'structureMetal', [lx, Math.min(lg, gl(lx, lz)) - 0.05, lz], [lx, top - 0.08, lz], 0.05, { colour: IRON, decor: true });
  for (let y = lg + 2.4; y < top - 0.6; y += 2.4) bar(sink, 'structureMetal', [lx, y, -hd + 0.3], [-hw + 0.3, y, -hd + 0.3], 0.05, { colour: IRON, decor: true });
  for (let y = lg + 0.4; y < top - 0.2; y += 0.4) bar(sink, 'structureMetal', [lx, y, lz0], [lx, y, lz1], 0.03, { colour: IRON, decor: true, fine: true });
  const corners: Array<[number, number]> = [[-hw - 0.5, -hd - 0.5], [hw + 0.5, -hd - 0.5], [hw + 0.5, hd + 0.5], [-hw - 0.5, hd + 0.5]];
  corners.forEach(([ax, az], i) => {
    const [bx, bz] = corners[(i + 1) % 4];
    const a: Vec3 = [Math.sign(ax) * (Math.abs(ax) - 0.03), top + 1.0, Math.sign(az) * (Math.abs(az) - 0.03)], b: Vec3 = [Math.sign(bx) * (Math.abs(bx) - 0.03), top + 1.0, Math.sign(bz) * (Math.abs(bz) - 0.03)];
    bar(sink, 'structureMetal', a, b, 0.05, { colour: YELLOW, decor: true });
    // the posts: one at the corner, others every metre and a half along the side
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]), k = Math.max(1, Math.round(len / 1.5));
    for (let j = 0; j < k; j++) {
      const t = j / k, px = a[0] + (b[0] - a[0]) * t, pz = a[2] + (b[2] - a[2]) * t;
      bar(sink, 'structureMetal', [px, top - 0.02, pz], [px, top + 1.0, pz], 0.05, { colour: YELLOW, decor: true });
    }
  });
  sink.span('structureMetal', -hw - 0.5, top - 0.1, -hd - 0.5, hw + 0.5, top, hd + 0.5, { colour: IRON, decor: true });
  // ore spilt under the gate (dressing), lying on the ground
  const gc = gl(0, 0) + 0.03;
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
    // (the integrity check, 2026-10-12: the roof faced down and the floor up, both open from outside) the roof wound to
    // face up, the floor down
    sink.quad('structureMetal', corner(b, -1, gh), corner(b, 1, gh), corner(a, 1, gh), corner(a, -1, gh), { colour: shade(GALV, 0.85) });
    sink.quad('structureMetal', corner(a, -1, 0), corner(a, 1, 0), corner(b, 1, 0), corner(b, -1, 0), { colour: shade(GALV, 0.5) });
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

