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
import { PartSink, faceBox, rgb, shade, type EmitOptions, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';
import { bar } from './kit.ts';
import type { LandmarkBuilder, LandmarkBuildContext } from './types.ts';
import { finishLandmark, piece } from './pieces.ts';
import { buildHouse, type HouseFrame, type Opening } from '../maps/regional/house.ts';
import { gateUnit, windowUnit } from '../maps/regional/openings.ts';

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
/**
 * A sheet-iron house in the house grammar (props census #3, lane B 2026-10-14): painted sheet walls with their openings
 * cut (a door or sliding gate, framed windows, open ports as `loft` openings: no unit, the dark of the house behind),
 * a gable roof with thickness, the sheet's laps down the long sides. Placed with its floor at `at`; `then` dresses it in
 * its own frame.
 */
function sheetHouse(sink: PartSink, ctx: LandmarkBuildContext, at: Vec3, w: number, d: number, h: number, rise: number, openings: Opening[],
  paint: Rgb, then?: (frame: HouseFrame) => void, eave = 0.3): void {
  sink.placed(0, at[0], at[1], at[2], () => {
    sink.paint = paint;
    try {
      const frame = buildHouse(sink, {
        w, d, plinth: null, storeys: [{ h, wall: 'structureMetal' }],
        roof: { kind: 'gable', pitchDeg: Math.atan2(rise, w / 2) * 180 / Math.PI, eave, verge: eave, thickness: 0.07, bucket: 'roof', ridge: 'saddle' },
        gableBucket: 'structureMetal', openings, chimneys: [], gutters: null, verge: null, reveal: 0.1,
      }, {
        window: (s, face, o, y0) => {
          if (o.kind === 'loft') return;
          windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { frame: shade(paint, 0.6), frameWidth: 0.05, frameOut: 0.03, bars: 'cross', surround: null, sill: null, shutters: null }, ctx.variant, 0.12);
        },
        door: (s, face, o, y0) => gateUnit(s, face, o.u, y0 + o.y0, o.w, o.h, shade(paint, 0.85), { bucket: 'structureMetal', width: o.w > 1.5 ? 0.12 : 0.08, out: 0.04, colour: shade(paint, 0.6) }),
      });
      for (const name of ['left', 'right'] as const) {
        const f = frame.faces[name];
        for (let u = -f.width / 2 + 1.7; u < f.width / 2 - 0.5; u += 1.7) faceBox(sink, 'structureMetal', f, u, h / 2, -0.02, 0.04, h, 0.06, { colour: shade(paint, 0.82), decor: true, fine: true }, 'caps');
      }
      then?.(frame);
    } finally { sink.paint = null; }
  });
}

/**
 * A framed corrugated-iron engine house (props census #3, lane B 2026-10-14; the judges on the winding house: "span
 * walls, triangle gables and zero-thickness roof quads, glass quads stuck on and the door and rope holes painted on"):
 * the house grammar's body of painted sheet on its footing, its sliding door, windows and the rope ports cut through
 * the front, the roof with thickness and its ridge vent, the sheet's laps. Returns the floor's height.
 */
function shed(sink: PartSink, cx: number, cz: number, w: number, d: number, eaveH: number, ridgeH: number, paint: Rgb, ctx: LandmarkBuildContext,
  ports: readonly number[] = []): number {
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  // (seated on the highest ground under it, its footing down past the lowest: plan.ts drapes)
  const gl = (lx: number, lz: number) => ctx.ground?.(lx, lz) ?? 0;
  const gs = [gl(x0, z0), gl(x1, z0), gl(x0, z1), gl(x1, z1), gl(cx, cz)], lo = Math.min(...gs), hi = Math.max(...gs);
  const y = hi;
  sink.span('stone', x0 - 0.2, Math.min(lo - 0.8, -0.6), z0 - 0.2, x1 + 0.2, y + 0.3, z1 + 0.2);
  const wallH = eaveH - 0.3, doorH = Math.min(eaveH - 0.4, 3.6) - 0.3;
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'gate', u: 0, w: 2.4, y0: 0, h: doorH }];
  for (const u of ports) openings.push({ face: 'front', storey: 0, kind: 'loft', u, w: 0.6, y0: 3.7, h: 0.6 });
  const bays = Math.max(1, Math.round(d / 5));
  for (const face of ['left', 'right'] as const) {
    for (let k = 0; k < bays; k++) openings.push({ face, storey: 0, kind: 'window', u: -d / 2 + (k + 0.5) * d / bays, w: 1.2, y0: eaveH * 0.55 - 0.3, h: 1.0 });
  }
  sheetHouse(sink, ctx, [cx, y + 0.3, cz], w, d, wallH, ridgeH - eaveH, openings, paint, (frame) => {
    const rt = frame.roof.ridgeTopY;
    sink.span('structureMetal', -0.3, rt - 0.05, -d * 0.35, 0.3, rt + 0.35, d * 0.35, { colour: shade(paint, 0.9), decor: true });
    sink.span('structureMetal', -0.5, rt + 0.35, -d * 0.35 - 0.1, 0.5, rt + 0.42, d * 0.35 + 0.1, { colour: shade(paint, 0.8), decor: true });
  }, 0.35);
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

/** Where a headframe's shaft stands in its frame (the piece centred on its footprint): see plan.ts. (The map-content lane's
 * R6: 3 m further forward than it stood, the winding house set 6 m further back behind it.) */
export function headframeShaftZ(height: number): number { return 0.25 * height + 7; }

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
  // the shaft collar: a concrete ring round the open shaft (props census #3, lane B 2026-10-14: was a block with the shaft
  // painted on its top), its timber sets lining the shaft's mouth, the dark of the shaft below them, the skip at the top
  const cb = Math.min(gLo - 0.8, -0.6);
  sink.span('stone', -2.6, cb, zs - 2.6, 2.6, g0 + 1.2, zs - 1.5);
  sink.span('stone', -2.6, cb, zs + 1.5, 2.6, g0 + 1.2, zs + 2.6);
  sink.span('stone', -2.6, cb, zs - 1.5, -1.0, g0 + 1.2, zs + 1.5);
  sink.span('stone', 1.0, cb, zs - 1.5, 2.6, g0 + 1.2, zs + 1.5);
  sink.span('structureMetal', -1.0, g0 - 2.5, zs - 1.5, 1.0, g0 - 2.4, zs + 1.5, { colour: SHAFT, decor: true });
  for (const [x, z, w2, d2] of [[0, zs - 1.45, 2.0, 0.12], [0, zs + 1.45, 2.0, 0.12], [-0.95, zs, 0.12, 2.9], [0.95, zs, 0.12, 2.9]] as const) {
    sink.span('structureWood', x - w2 / 2, g0 - 1.2, z - d2 / 2, x + w2 / 2, g0 + 1.26, z + d2 / 2, { colour: rgb(0x4a3a2c), decor: true });
  }
  // the skip landed on its keps, the two beams across the shaft's mouth from collar to collar
  for (const kz of [zs - 0.75, zs + 0.15]) sink.span('structureWood', -1.05, g0 + 1.2, kz - 0.08, 1.05, g0 + 1.3, kz + 0.08, { colour: rgb(0x4a3a2c), decor: true });
  sink.span('structureMetal', -0.6, g0 + 1.3, zs - 0.9, 0.6, g0 + 3.2, zs + 0.3, { colour: shade(OXIDE, 1.2), decor: true });
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
  // the winding house set back behind the struts (its own footing) and the ropes rising from its drums to the sheaves
  // (the map-content lane's R6, gauntlet wave 358a: "the real layout sets the winding-engine house back from the
  // headframe with ropes rising to the sheaves"; it stood 3 m behind the struts' feet, pressed against the frame)
  const hz1 = az - 9, hd = 10;
  const hy = shed(sink, 0, hz1 - hd / 2, 9, hd, 6.0, 8.0, IRON_SHEET, ctx, [-0.9, 0.9]);
  const R = Math.min(2.0, Hh * 0.085), hubY = H + 0.3 + R + 0.4;
  for (const sx of [-1, 1]) {
    const c: Vec3 = [sx * 0.9, hubY, zs - 0.2];
    for (const dz of [-1.1, 1.1]) bar(sink, 'structureMetal', [sx * 0.9, H + 0.3, zs - 0.2 + dz], [sx * 0.9, hubY, zs - 0.2], 0.16, legOpts);
    piece(sink, { name: `sheave-${sx < 0 ? 'l' : 'r'}`, kind: 'lattice', at: 'breached', fall: 'flat' }, (s) => sheave(s, c, R, 6, IRON, 0.12));
    bar(sink, 'structureMetal', [sx * 0.9, hubY + R, zs - 0.2], [sx * 0.9, hy + 4.2, hz1 - 0.4], 0.05, { colour: IRON, decor: true });
    bar(sink, 'structureMetal', [sx * 0.9, hubY - R * 0.2, zs + R * 0.9], [sx * 0.9, g0 + 1.3, zs + 0.6], 0.05, { colour: IRON, decor: true });
  }
  // (the map-content lane's R6, gauntlet wave 358a: "no mullock heaps, rails, timber stacks, tracks or fences round the
  // shaft"; "clutter concentrated at the works") the shaft yard on the collar's open side: the skip road (rails on their
  // sleepers, laid on the ground) out from the collar with a side-tipping skip standing on it, the stack of mine timber
  // beside it on its dunnage, the drums of the winder's oil; all dressing, so the yard's ground stays the hulls' (the
  // waste rock the map lays beside the collar is its own scree: copperMesa.ts)
  {
    const rz = zs, x0 = -2.7, x1 = -9.5, gauge = 0.6, TIMBER = rgb(0x6a5644);
    for (let x = x0 - 0.3; x > x1; x -= 0.65) {
      const g = gl(x, rz);
      sink.span('structureWood', x - 0.09, g - 0.06, rz - 0.55, x + 0.09, g + 0.06, rz + 0.55, { colour: shade(TIMBER, 0.7), decor: true, fine: true });
    }
    for (const dz of [-gauge / 2, gauge / 2]) {
      const ga = gl(x0, rz + dz), gb = gl(x1, rz + dz);
      bar(sink, 'structureMetal', [x0, ga + 0.1, rz + dz], [x1, gb + 0.1, rz + dz], 0.06, { colour: RUST, decor: true });
    }
    const kx = -6.0, gk = gl(kx, rz);
    sink.span('structureMetal', kx - 0.75, gk + 0.12, rz - 0.42, kx + 0.75, gk + 0.3, rz + 0.42, { colour: IRON, decor: true });
    for (const wx of [kx - 0.45, kx + 0.45]) for (const dz of [-gauge / 2, gauge / 2]) {
      sink.cylinder('structureMetal', [wx, gk + 0.22, rz + dz - 0.04], 'z', 0.08, 0.2, 8, { colour: IRON, decor: true });
    }
    sink.span('structureMetal', kx - 0.8, gk + 0.3, rz - 0.55, kx + 0.8, gk + 1.25, rz + 0.55, { colourAt: rusting(STEEL, gk + 0.3, gk + 1.25, 0.6), decor: true });
    sink.span('structureMetal', kx - 0.7, gk + 1.1, rz - 0.45, kx + 0.7, gk + 1.22, rz + 0.45, { colour: ORE, decor: true });
    // the mine timber, square sets in a stack on its dunnage
    const tx = -6.5, tz = zs + 3.4, gt = Math.min(gl(tx - 1.6, tz), gl(tx + 1.6, tz));
    for (let row = 0; row < 3; row++) for (let k = 0; k < 5 - row; k++) {
      const z = tz - 1.0 + (k + row * 0.5) * 0.42;
      sink.span('structureWood', tx - 1.6, gt + 0.12 + row * 0.36, z - 0.17, tx + 1.6, gt + 0.46 + row * 0.36, z + 0.17, { colour: shade(TIMBER, 0.9 + 0.1 * ((k + row) % 2)), decor: true });
    }
    for (const dx of [-1.2, 1.2]) sink.span('structureWood', tx + dx - 0.1, gt - 0.05, tz - 1.3, tx + dx + 0.1, gt + 0.12, tz + 1.0, { colour: shade(TIMBER, 0.6), decor: true });
    // the winder's oil drums
    for (const [dx, dz] of [[0, 0], [0.62, 0.1], [0.3, 0.6]]) {
      const x = -5.2 + dx, z = zs - 3.6 + dz;
      sink.cylinder('structureMetal', [x, gl(x, z) - 0.02, z], 'y', 0.88, 0.29, 10, { colour: dz > 0.5 ? rgb(0x7a2a1e) : IRON, decor: true });
    }
  }
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
  // the hopper (props census #3, lane B 2026-10-14; the judges: "a plain box on a pyramid of four quads, a box on top for
  // a head house, the walkway's floor coplanar with the hopper's lid"): its plate walls stiffened by angles every metre
  // and a belt at mid height, the hips of its pyramid bottom angle-ribbed down to the rack-and-pinion gate
  sink.span('structureMetal', -hw, boxY, -hd, hw, top, hd, { colourAt: rusting(STEEL, boxY, top, 0.4) });
  hopperStiffeners(sink, -hw, hw, -hd, hd, boxY, top, shade(STEEL, 0.78));
  const g = 0.7, gy = clearY;
  const rimP: Vec3[] = [[-hw, boxY, hd], [hw, boxY, hd], [hw, boxY, -hd], [-hw, boxY, -hd]];
  const gateP: Vec3[] = [[-g, gy, g], [g, gy, g], [g, gy, -g], [-g, gy, -g]];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    sink.quad('structureMetal', gateP[i], gateP[j], rimP[j], rimP[i], { colour: shade(STEEL, 0.72) });
    bar(sink, 'structureMetal', [gateP[i][0] * 1.04, gateP[i][1], gateP[i][2] * 1.04], [rimP[i][0] * 1.01, rimP[i][1], rimP[i][2] * 1.01], 0.09, { colour: shade(STEEL, 0.6), decor: true });
  }
  // the gate: its frame under the throat, the slide in its guides, the rack and the hand wheel on its pinion
  sink.span('structureMetal', -g - 0.1, gy - 0.25, -g - 0.1, g + 0.1, gy, g + 0.1, { colour: IRON, decor: true });
  sink.span('structureMetal', -g + 0.05, gy - 0.6, -g + 0.05, g - 0.05, gy - 0.25, g - 0.05, { colour: shade(IRON, 0.8), decor: true });
  for (const sz of [-1, 1]) sink.span('structureMetal', -g - 0.25, gy - 0.32, sz * g - 0.05, g + 0.95, gy - 0.22, sz * g + 0.05, { colour: IRON, decor: true });
  sink.span('structureMetal', g + 0.1, gy - 0.2, -0.06, g + 1.0, gy - 0.12, 0.06, { colour: shade(IRON, 1.3), decor: true, fine: true });
  sheave(sink, [g + 1.0, gy - 0.16, 0], 0.32, 4, shade(IRON, 1.2), 0.05, { decor: true });
  // the head house on the hopper's lid where the conveyor delivers: the house grammar's sheet walls and roof, its door
  // to the walkway over the ladder, the conveyor's port in its front, a window on its side
  const hhW = W * 0.7, hhD = D * 0.8, hhH = Ht - top;
  sheetHouse(sink, ctx, [0, top, 0], hhW, hhD, hhH, 1.1, [
    { face: 'back', storey: 0, kind: 'door', u: -hhW / 2 + 0.6, w: 0.8, y0: 0, h: 1.9 },
    { face: 'front', storey: 0, kind: 'loft', u: 0, w: 1.1, y0: 0.7, h: 1.0 },
    { face: 'right', storey: 0, kind: 'window', u: 0, w: 0.9, y0: 1.0, h: 0.7 },
  ], IRON_SHEET);
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
    bar(sink, 'structureMetal', [a[0], top + 0.5, a[2]], [b[0], top + 0.5, b[2]], 0.04, { colour: YELLOW, decor: true, fine: true });
    // the posts: one at the corner, others every metre and a half along the side
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]), k = Math.max(1, Math.round(len / 1.5));
    for (let j = 0; j < k; j++) {
      const t = j / k, px = a[0] + (b[0] - a[0]) * t, pz = a[2] + (b[2] - a[2]) * t;
      bar(sink, 'structureMetal', [px, top - 0.02, pz], [px, top + 1.0, pz], 0.05, { colour: YELLOW, decor: true });
    }
  });
  // the walkway: a grating ring round the lid (never over it), on brackets, its toe boards
  const grate = shade(IRON, 1.15), wy0 = top - 0.1;
  for (const [x0, z0, x1, z1] of [[-hw - 0.5, -hd - 0.5, hw + 0.5, -hd], [-hw - 0.5, hd, hw + 0.5, hd + 0.5], [-hw - 0.5, -hd, -hw, hd], [hw, -hd, hw + 0.5, hd]] as const) {
    sink.span('structureMetal', x0, wy0, z0, x1, top - 0.02, z1, { colour: grate, decor: true });
  }
  for (const [x0, z0, x1, z1] of [[-hw - 0.5, -hd - 0.5, hw + 0.5, -hd - 0.47], [-hw - 0.5, hd + 0.47, hw + 0.5, hd + 0.5], [-hw - 0.5, -hd - 0.47, -hw - 0.47, hd + 0.47], [hw + 0.47, -hd - 0.47, hw + 0.5, hd + 0.47]] as const) {
    sink.span('structureMetal', x0, top - 0.02, z0, x1, top + 0.12, z1, { colour: YELLOW, decor: true, fine: true });
  }
  for (const sx of [-1, 1]) for (const z of [-hd + 0.3, hd - 0.3]) bar(sink, 'structureMetal', [sx * hw, top - 0.6, z], [sx * (hw + 0.45), wy0, z], 0.06, { colour: OXIDE, decor: true });
  // ore spilt under the gate (dressing): a low heap and its strays on the ground
  const gc = gl(0, 0);
  sink.cylinder('structureMetal', [0.1, gc - 0.05, 0.05], 'y', 0.45, 1.6, 7, { colour: ORE, decor: true }, 0.55, false, 0.3);
  sink.cylinder('structureMetal', [0.9, gl(0.9, -0.9) - 0.05, -0.9], 'y', 0.25, 0.7, 6, { colour: shade(ORE, 0.9), decor: true }, 0.2, false, 0.7);
  return { parts: sink.finish() };
};

/** A plate box's stiffening: angles up its walls every metre or so, a belt round it at mid height, a cap angle at its lid. */
function hopperStiffeners(sink: PartSink, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, colour: Rgb): void {
  const o = { colour, decor: true };
  const ym = (y0 + y1) / 2, t = 0.1;
  for (const [ax, az, bx, bz] of [[x0, z1, x1, z1], [x1, z0, x0, z0], [x1, z1, x1, z0], [x0, z0, x0, z1]] as const) {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(len / 1.1));
    const alongX = az === bz, out = alongX ? Math.sign(az - (z0 + z1) / 2) : Math.sign(ax - (x0 + x1) / 2);
    for (let k = 1; k < n; k++) {
      const f = k / n, x = ax + (bx - ax) * f, z = az + (bz - az) * f;
      if (alongX) sink.span('structureMetal', x - 0.05, y0 + 0.05, Math.min(z, z + out * t), x + 0.05, y1 - 0.05, Math.max(z, z + out * t), o);
      else sink.span('structureMetal', Math.min(x, x + out * t), y0 + 0.05, z - 0.05, Math.max(x, x + out * t), y1 - 0.05, z + 0.05, o);
    }
    for (const y of [ym, y1 - 0.07]) {
      if (alongX) sink.span('structureMetal', x0 - t, y - 0.07, Math.min(az, az + out * t * 1.2), x1 + t, y + 0.07, Math.max(az, az + out * t * 1.2), o);
      else sink.span('structureMetal', Math.min(ax, ax + out * t * 1.2), y - 0.07, z0, Math.max(ax, ax + out * t * 1.2), y + 0.07, z1, o);
    }
  }
}

// ----------------------------------------------------------------------------------------------------------- conveyor

/**
 * The inclined conveyor gallery: a clad box truss rising along +z from the tail house to the head tower, borne on
 * two-legged bents footed on the ground under them. Props census #3 (lane B 2026-10-14; the judges: "two box spans for
 * the end houses, a dark band painted down the gallery for its windows, the head tower's legs with girts and no
 * bracing"): the gallery's sheet below and above a glazed band of framed lights between mullions, its posts outside
 * the sheet at the panel points, a pitched roof with its fascia; the tail house and the head house cut sheet houses
 * (door, windows), the head house's discharge chute and the ladder up inside the tower to its floor hatch; the head
 * tower X-braced. The bents'
 * feet and the end houses are its movement record (a hull passes under the gallery between them).
 */
export const conveyor: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const L = num(ctx, 'length', 20), W = num(ctx, 'width', 2), headH = num(ctx, 'head', 6), tailH = num(ctx, 'tail', 2), gh = 2.2;
  const g = (lx: number, lz: number) => ctx.ground?.(lx, lz) ?? 0;
  const z0 = -L / 2 + 2.5, z1 = L / 2 - 2.5, hw = W / 2;
  const yT = g(0, z0) + tailH, yH = g(0, z1) + headH;
  const yAt = (z: number) => yT + (yH - yT) * ((z - z0) / (z1 - z0));
  const movement: SimpleCollisionShape[] = [];
  // the tail house round the gallery's foot: a sheet house on its footing, its door on the side, a window opposite
  const gT = g(0, z0), tailTop = gT + tailH + gh + 0.6;
  footing(sink, ctx, 0, z0, 2.0, 2.0, 0.3, gT);
  sheetHouse(sink, ctx, [0, gT + 0.3, z0 - 0.4], 4.0, 3.2, tailTop - gT - 0.3, 0.7, [
    { face: 'left', storey: 0, kind: 'door', u: 0.3, w: 0.9, y0: 0, h: 2.0 },
    { face: 'right', storey: 0, kind: 'window', u: 0, w: 0.9, y0: 1.2, h: 0.8 },
  ], IRON_SHEET);
  movement.push({ kind: 'obb', cx: 0, cz: z0 - 0.4, hw: 2.0, hl: 1.6, yaw: 0, y0: gT - 0.3, y1: tailTop + 0.2 });
  // the head tower: four legs on their footings, girts and X braces in every panel
  const hgz = g(0, z1);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    footing(sink, ctx, sx * 1.6, z1 + sz * 1.6, 0.4, 0.4, 0.3, g(sx * 1.6, z1 + sz * 1.6));
    bar(sink, 'structureMetal', [sx * 1.6, g(sx * 1.6, z1 + sz * 1.6) + 0.3, z1 + sz * 1.6], [sx * 1.6, yH, z1 + sz * 1.6], 0.3, { colour: OXIDE });
  }
  const ring = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const;
  let yPrev = hgz + 0.6;
  for (let y = hgz + 3; y < yH + 0.1; y += 3) {
    const yy = Math.min(y, yH - 0.15);
    for (let k = 0; k < 4; k++) {
      const a = ring[k], b = ring[(k + 1) % 4];
      bar(sink, 'structureMetal', [a[0] * 1.6, yy, z1 + a[1] * 1.6], [b[0] * 1.6, yy, z1 + b[1] * 1.6], 0.12, { colour: OXIDE, decor: true });
      bar(sink, 'structureMetal', [a[0] * 1.6, yPrev, z1 + a[1] * 1.6], [b[0] * 1.6, yy, z1 + b[1] * 1.6], 0.07, { colour: OXIDE, decor: true, fine: true });
      bar(sink, 'structureMetal', [b[0] * 1.6, yPrev, z1 + b[1] * 1.6], [a[0] * 1.6, yy, z1 + a[1] * 1.6], 0.07, { colour: OXIDE, decor: true, fine: true });
    }
    yPrev = yy;
  }
  // the head house on the tower: the gallery enters its back, the discharge chute leaves its front; the ladder climbs
  // inside the tower to the hatch in its floor (all inside the piece's footprint, plan.ts)
  const hhH = gh + 1.4;
  sink.span('structureMetal', -2.3, yH - 0.2, z1 - 1.7, 2.3, yH, z1 + 2.3, { colour: shade(OXIDE, 0.8) });
  sheetHouse(sink, ctx, [0, yH, z1 + 0.3], 4.4, 3.8, hhH, 0.9, [
    { face: 'right', storey: 0, kind: 'window', u: 0, w: 1.0, y0: 1.4, h: 0.9 },
    { face: 'left', storey: 0, kind: 'window', u: 0, w: 1.0, y0: 1.4, h: 0.9 },
    { face: 'front', storey: 0, kind: 'window', u: 1.1, w: 0.8, y0: 1.8, h: 0.7 },
  ], IRON_SHEET);
  movement.push({ kind: 'obb', cx: 0, cz: z1, hw: 1.9, hl: 1.9, yaw: 0, y0: hgz - 0.3, y1: yH + hhH + 1.0 });
  bar(sink, 'structureMetal', [0, yH + 0.7, z1 + 2.0], [0, Math.max(hgz + 1.2, yH - 1.6), z1 + 3.0], 0.6, { colour: shade(STEEL, 0.9), decor: true });
  const lg = g(1.0, z1 + 1.0);
  sink.span('structureMetal', 0.6, yH - 0.22, z1 + 0.6, 1.4, yH - 0.18, z1 + 1.4, { colour: IRON, decor: true });
  for (const x of [0.75, 1.25]) bar(sink, 'structureMetal', [x, lg - 0.05, z1 + 1.0], [x, yH - 0.2, z1 + 1.0], 0.05, { colour: IRON, decor: true });
  for (let y = lg + 0.35; y < yH - 0.3; y += 0.35) bar(sink, 'structureMetal', [0.75, y, z1 + 1.0], [1.25, y, z1 + 1.0], 0.03, { colour: IRON, decor: true, fine: true });
  // the gallery: segments between the bents, each a clad box truss on the incline
  // (the map-content lane's R6, the coordinator's ruling of 2026-10-11 on Copper Mesa's long sight lines: a gallery is
  // sheet cladding on a light truss, and a hull's gunner sees and shoots under it and through its sheets) a segment whose
  // underside stands more than 3 m over the ground under it is dressing that still casts its shadow: no shell or sight
  // record (the layout raster, which has no underside, read the elevated galleries as walls from the ground up); the
  // segments near the tail, low over the ground, and the head tower and tail house stay solid
  const bents = Math.max(1, Math.round((z1 - z0) / 12));
  const corner = (z: number, sx: number, up: number): Vec3 => [sx * hw, yAt(z) + up, z];
  const sill = gh * 0.48, head = gh * 0.82, frameC = shade(GALV, 0.6);
  for (let k = 0; k < bents; k++) {
    const a = z0 + ((z1 - z0) * k) / bents, b = z0 + ((z1 - z0) * (k + 1)) / bents;
    const under = Math.min(yAt(a) - Math.max(g(-hw, a), g(hw, a)), yAt(b) - Math.max(g(-hw, b), g(hw, b)), yAt((a + b) / 2) - g(0, (a + b) / 2));
    const clad: EmitOptions = under > 3 ? { decor: true, shadow: true } : {};
    const side = (sx: number) => {
      const band = (y0: number, y1: number, opts: EmitOptions, inset = 0, glass = false) => {
        const p: Vec3[] = [corner(a, sx, y0), corner(b, sx, y0), corner(b, sx, y1), corner(a, sx, y1)].map((v) => [v[0] - sx * inset, v[1], v[2]] as Vec3);
        sink.polygon(glass ? 'glass' : 'structureMetal', sx > 0 ? [p[1], p[0], p[3], p[2]] : p, opts);
      };
      band(0, sill, { colourAt: rusting(GALV, yAt(a), yAt(a) + gh, 0.4), ...clad });
      band(head, gh, { colourAt: rusting(GALV, yAt(a), yAt(a) + gh, 0.4), ...clad });
      // the lights: glass set back 6 cm behind the band's sill and head rails and its mullions
      band(sill, head, { decor: true }, 0.06, true);
      for (const y of [sill, head]) {
        const ra = corner(a, sx, y), rb = corner(b, sx, y);
        bar(sink, 'structureMetal', [ra[0] + sx * 0.02, ra[1], ra[2]], [rb[0] + sx * 0.02, rb[1], rb[2]], 0.07, { colour: frameC, decor: true });
      }
      const n = Math.max(2, Math.round((b - a) / 3));
      for (let i = 1; i < n; i++) {
        const z = a + ((b - a) * i) / n, m0 = corner(z, sx, sill), m1 = corner(z, sx, head);
        bar(sink, 'structureMetal', [m0[0] - sx * 0.01, m0[1], z], [m1[0] - sx * 0.01, m1[1], z], 0.06, { colour: frameC, decor: true, fine: true });
      }
      // the truss's posts outside the sheet at the panel points
      const np = Math.max(2, Math.round((b - a) / 6));
      for (let i = 0; i <= np; i++) {
        const z = a + ((b - a) * i) / np, p0 = corner(z, sx, -0.1), p1 = corner(z, sx, gh);
        bar(sink, 'structureMetal', [p0[0] + sx * 0.08, p0[1], z], [p1[0] + sx * 0.08, p1[1], z], 0.12, { colour: OXIDE, decor: true });
      }
    };
    side(1); side(-1);
    // (the integrity check, 2026-10-12: the roof faced down and the floor up) the roof's two slopes face up and out over
    // the eaves, the fascia down each side, the eaves' undersides; the floor faces down
    const o = 0.18, rise = 0.28;
    const ridge = (z: number): Vec3 => [0, yAt(z) + gh + rise, z];
    const eaveP = (z: number, sx: number): Vec3 => [sx * (hw + o), yAt(z) + gh - 0.02, z];
    for (const sx of [-1, 1]) {
      const q: Vec3[] = [eaveP(a, sx), eaveP(b, sx), ridge(b), ridge(a)];
      sink.polygon('structureMetal', sx > 0 ? [q[1], q[0], q[3], q[2]] : q, { colour: shade(GALV, 0.85), ...clad });
      const f: Vec3[] = [[sx * (hw + o), yAt(a) + gh - 0.16, a], [sx * (hw + o), yAt(b) + gh - 0.16, b], eaveP(b, sx), eaveP(a, sx)];
      sink.polygon('structureMetal', sx > 0 ? [f[1], f[0], f[3], f[2]] : f, { colour: shade(GALV, 0.7), decor: true });
      const u: Vec3[] = [[sx * hw, yAt(a) + gh - 0.02, a], [sx * hw, yAt(b) + gh - 0.02, b], [sx * (hw + o), yAt(b) + gh - 0.16, b], [sx * (hw + o), yAt(a) + gh - 0.16, a]];
      sink.polygon('structureMetal', sx > 0 ? u : [u[1], u[0], u[3], u[2]], { colour: shade(GALV, 0.45), decor: true });
    }
    sink.quad('structureMetal', corner(a, -1, 0), corner(a, 1, 0), corner(b, 1, 0), corner(b, -1, 0), { colour: shade(GALV, 0.5), ...clad });
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

