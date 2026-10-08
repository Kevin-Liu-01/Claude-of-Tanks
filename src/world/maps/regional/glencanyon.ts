// src/world/maps/regional/glencanyon.ts — the Glen Canyon kit (Skybridge Chasm: Glen Canyon Dam above Lake Powell and
// Page, Arizona, the Bureau of Reclamation's construction town of 1957). The dam's works in the Bureau's 1960s manner:
// the powerhouse, a board-formed concrete hall between pilasters with its tall slot windows, the penstocks coming down
// to it from the anchor block, a steel catwalk truss broken between them; the control building of four storeys of
// concrete and ribbon glazing under a penthouse and a radio mast; the surge tower; the switchyard's lattice dead-end
// towers over the transformers; the transformer yards; the microwave relay tower; the gate-hoist houses; the penstock
// runs on their concrete saddles; the visitor centre with its round overlook, or the town's school; the Bureau's field
// offices of painted block and its steel warehouses; and Page itself: ranch houses of stucco and block under shallow
// shingled gables with their carports, the fire station with its hose tower, the water tower on its legs.
import { PartSink, faceBox, facePanel, normalize3, pick, rgb, shade, type EmitOptions, type Face, type RegionalBucket, type Rgb, type Vec3 } from './geometry.ts';
import { buildHouse, emitRoof, roofGeometry, windowRhythm, type HouseDialect, type Opening, type RoofSpec } from './house.ts';
import { doorUnit, windowUnit, type WindowStyle } from './openings.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';

/** Poured concrete (the plaster2 canvas under a concrete tone), painted concrete, block (the stone painter's CMU). */
const CONCRETE: RegionalBucket = 'plaster2', PAINTED: RegionalBucket = 'plaster3', BLOCK: RegionalBucket = 'stone', STUCCO: RegionalBucket = 'plaster';
const STEEL_GREEN = rgb(0x5d7a64), STEEL_GREY = rgb(0x8c9294), GALV = rgb(0xa6aaa7), IRON = rgb(0x3a3c3e);
const TRANSFORMER: readonly Rgb[] = [0x76827c, 0x7f8b8e, 0x6c7a72].map(rgb);
const PENSTOCK: readonly Rgb[] = [0x7f8a86, 0x6f7f7c, 0x8a8e88].map(rgb);
const PORCELAIN = rgb(0x7a4a32), ALUMINIUM = rgb(0xb8bdbd), WHITE = rgb(0xe4e2dc);
const DOOR_PAINT: readonly Rgb[] = [0x2f5f8a, 0x8a3a2c, 0x4d6f45, 0xc9a24a, 0x6a4a3a].map(rgb);
const CAR_ROOF: readonly Rgb[] = [0x9aa09c, 0xb8b4a8, 0x8a8478].map(rgb);

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** A pipe (or round member) from a to b of radius r: a prism of `seg` sides along any direction. */
function pipe(sink: PartSink, bucket: RegionalBucket, a: Vec3, b: Vec3, r: number, seg: number, opts: EmitOptions = {}): void {
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  if (len < 1e-3) return;
  const dir = normalize3(d);
  const ref: Vec3 = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const e1 = normalize3(cross3(dir, ref)), e2 = cross3(dir, e1);
  const pts: Vec3[] = [];
  for (let i = 0; i < seg; i++) {
    const t = i / seg * Math.PI * 2, c = Math.cos(t) * r, s = Math.sin(t) * r;
    pts.push([a[0] + e1[0] * c + e2[0] * s, a[1] + e1[1] * c + e2[1] * s, a[2] + e1[2] * c + e2[2] * s]);
  }
  sink.prism(bucket, pts, dir, len, opts);
}

/**
 * A four-legged steel lattice tower centred at (x, z): legs from a square of half side `b0` at the ground to `b1` at
 * `h`; girts and X-braces between them (dressing); the legs are structure unless `decor`.
 */
function latticeTower(sink: PartSink, x: number, z: number, b0: number, b1: number, h: number, colour: Rgb, decor = false, bay = 3.2): void {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    sink.member('structureMetal', [x + sx * b0, -0.3, z + sz * b0], [x + sx * b1, h, z + sz * b1], 0.16, 0.16, [sx, 0, 0], { colour, exposed: true, ...(decor ? { decor: true } : {}) }, 0);
  }
  const at = (y: number) => b0 + (b1 - b0) * y / h;
  for (let y0 = 0.4; y0 < h - 0.5; y0 += bay) {
    const y1 = Math.min(h, y0 + bay), r0 = at(y0), r1 = at(y1);
    for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]] as const) {
      sink.member('structureMetal', [x + ax * r1, y1, z + az * r1], [x + bx * r1, y1, z + bz * r1], 0.07, 0.07, [0, 1, 0], { colour, decor: true, exposed: true }, 0);
      sink.member('structureMetal', [x + ax * r0, y0, z + az * r0], [x + bx * r1, y1, z + bz * r1], 0.05, 0.05, [ax === bx ? ax : 0, 0, az === bz ? az : 0], { colour, decor: true, exposed: true, fine: true }, 0);
      sink.member('structureMetal', [x + bx * r0, y0, z + bz * r0], [x + ax * r1, y1, z + az * r1], 0.05, 0.05, [ax === bx ? ax : 0, 0, az === bz ? az : 0], { colour, decor: true, exposed: true, fine: true }, 0);
    }
  }
}

/**
 * A porcelain bushing standing from `base` (Skybridge round 4, gauntlet waves 170-171: "the switchyard bushings read as
 * chimneys" — the smooth 1.6 m brown columns): a slim core ringed by sheds, wide and thin, alternately larger and
 * smaller, under an aluminium terminal cap with its stud.
 */
function bushing(sink: PartSink, base: Vec3, height: number, s: number): void {
  // (the switchyard's structure keeps the kit's 12,000-triangle budget: four sheds of six sides, the cap a short drum)
  const core = 0.07 * s, sheds = 4;
  sink.cylinder('structureMetal', base, 'y', height, core, 6, { colour: PORCELAIN, decor: true });
  for (let k = 0; k < sheds; k++) {
    const y = base[1] + 0.12 + (height - 0.3) * (k / (sheds - 1)), r = (k % 2 ? 0.15 : 0.21) * s;
    sink.cylinder('structureMetal', [base[0], y, base[2]], 'y', 0.05, r, 6, { colour: PORCELAIN, decor: true, fine: true }, r * 0.82);
  }
  sink.cylinder('structureMetal', [base[0], base[1] + height, base[2]], 'y', 0.18, 0.12 * s, 6, { colour: ALUMINIUM, decor: true });
}

/** An insulator string hung from `top`: its rod and a stack of porcelain discs (the dead-end towers' strain strings). */
function insulatorString(sink: PartSink, top: Vec3, length: number): void {
  sink.member('structureMetal', top, [top[0], top[1] - length, top[2]], 0.03, 0.03, [1, 0, 0], { colour: IRON, decor: true, exposed: true }, 0);
  const discs = Math.max(4, Math.round(length / 0.26));
  for (let d = 0; d < discs; d++) {
    sink.cylinder('structureMetal', [top[0], top[1] - 0.15 - d * (length - 0.3) / (discs - 1), top[2]], 'y', 0.05, 0.14, 6, { colour: PORCELAIN, decor: true, fine: true }, 0.14);
  }
}

/** A power transformer at (x, z) turned `yaw`: the tank (structure), radiator banks, three bushings, the conservator. */
function transformer(sink: PartSink, x: number, z: number, yaw: number, s: number, colour: Rgb): void {
  sink.placed(yaw, x, 0, z, () => {
    const w = 3.2 * s, d = 2.6 * s, h = 3.1 * s;
    sink.span('plaster2', -w / 2 - 0.4, -0.3, -d / 2 - 0.4, w / 2 + 0.4, 0.25, d / 2 + 0.4);
    sink.span('structureMetal', -w / 2, 0.25, -d / 2, w / 2, 0.25 + h, d / 2, { colour });
    for (const side of [-1, 1]) {
      for (let k = 0; k < 6; k++) {
        const xx = -w / 2 + 0.3 + (w - 0.6) * k / 5;
        sink.span('structureMetal', xx - 0.04, 0.55, side * (d / 2) - (side < 0 ? 0.75 : 0), xx + 0.04, 0.25 + h * 0.86, side * (d / 2) + (side > 0 ? 0.75 : 0),
          { colour: shade(colour, 0.9), decor: true });
      }
    }
    for (let k = 0; k < 3; k++) {
      const bx = (k - 1) * w * 0.3;
      bushing(sink, [bx, 0.25 + h, -d * 0.2], 1.3 * s, s);
    }
    sink.cylinder('structureMetal', [-w / 2 + 0.2, 0.25 + h + 0.55, d * 0.25], 'x', w - 0.4, 0.38 * s, 10, { colour: shade(colour, 1.05), decor: true });
    for (const xx of [-w / 2 + 0.6, w / 2 - 0.6]) sink.span('structureMetal', xx - 0.05, 0.25 + h, d * 0.25 - 0.05, xx + 0.05, 0.25 + h + 0.3, d * 0.25 + 0.05, { colour: IRON, decor: true });
  });
}

/**
 * A steel bus structure across z at x (round 2, the gauntlet's wave 120: "chunky box-section goalpost gantries"): two
 * latticed columns (four angle chords each, braced), a latticed beam across their heads, three insulator strings of
 * porcelain discs hung from it and the aluminium bus tubes along x from each string.
 */
function busFrame(sink: PartSink, x: number, z0: number, z1: number, h: number, colour: Rgb): void {
  const c = 0.22;
  // (Skybridge round 6: the frames braced at the dead-end towers' 3.2 m bay and their strings' discs six-sided — the
  // switchyard back inside the kit's 12,000-triangle budget, 12,952 -> 11,656, with round 4's bushings and strain strings)
  for (const z of [z0, z1]) latticeTower(sink, x, z, c, c, h, colour, false, 3.2);
  // the beam: two chords and the web between them
  for (const dy of [0, -0.5]) sink.member('structureMetal', [x, h - 0.15 + dy, z0 - 0.3], [x, h - 0.15 + dy, z1 + 0.3], 0.07, 0.07, [0, 1, 0], { colour, decor: true, exposed: true }, 0);
  const n = Math.max(3, Math.round((z1 - z0 + 0.6) / 0.6));
  for (let k = 0; k < n; k++) {
    const za = z0 - 0.3 + (z1 - z0 + 0.6) * k / n, zb = z0 - 0.3 + (z1 - z0 + 0.6) * (k + 1) / n;
    sink.member('structureMetal', [x, h - 0.15, za], [x, h - 0.65, zb], 0.045, 0.045, [1, 0, 0], { colour, decor: true, exposed: true, fine: true }, 0);
  }
  for (let k = 0; k < 3; k++) {
    const z = z0 + (z1 - z0) * (k + 0.5) / 3;
    // the string: a stack of discs on its rod, the clamp and the bus tube along x
    sink.member('structureMetal', [x, h - 0.7, z], [x, h - 1.9, z], 0.03, 0.03, [1, 0, 0], { colour: IRON, decor: true, exposed: true }, 0);
    for (let d = 0; d < 6; d++) sink.cylinder('structureMetal', [x, h - 0.85 - d * 0.18, z], 'y', 0.05, 0.14, 6, { colour: PORCELAIN, decor: true }, 0.14);
    pipe(sink, 'structureMetal', [x - 2.6, h - 2.0, z], [x + 2.6, h - 2.0, z], 0.07, 6, { colour: ALUMINIUM, decor: true });
  }
}

/**
 * Chain-link along a polyline from `y0`, `h` high (dressing): posts every 2.5 m, a top and a bottom rail, the mesh's
 * wires as a fine grain of verticals every 0.3 m (near the camera only), and on each post an arm carrying three strands of barbed
 * wire.
 */
function fenceLine(sink: PartSink, pts: ReadonlyArray<readonly [number, number]>, y0 = 0, h = 2.2): void {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.1) continue;
    const ux = (x1 - x0) / len, uz = (z1 - z0) / len, n = Math.max(1, Math.round(len / 2.5));
    for (let k = 0; k <= n; k++) {
      const x = x0 + (x1 - x0) * k / n, z = z0 + (z1 - z0) * k / n;
      sink.cylinder('structureMetal', [x, y0, z], 'y', h + 0.45, 0.04, 5, { colour: GALV, decor: true });
    }
    for (const f of [0.03, 0.98]) sink.member('structureMetal', [x0, y0 + h * f, z0], [x1, y0 + h * f, z1], 0.03, 0.03, [0, 1, 0], { colour: GALV, decor: true, exposed: true }, 0);
    for (const dy of [0.15, 0.3, 0.45]) sink.member('structureMetal', [x0, y0 + h + dy, z0], [x1, y0 + h + dy, z1], 0.012, 0.012, [0, 1, 0], { colour: IRON, decor: true, exposed: true, fine: true }, 0);
    // the mesh: thin dark verticals every 0.3 m, a single quad each (both faces), near the camera only
    const m = Math.max(2, Math.round(len / 0.3));
    for (let k = 0; k < m; k++) {
      const x = x0 + (x1 - x0) * (k + 0.5) / m, z = z0 + (z1 - z0) * (k + 0.5) / m, w = 0.008;
      const a: Vec3 = [x - ux * w, y0 + 0.05, z - uz * w], b: Vec3 = [x + ux * w, y0 + 0.05, z + uz * w];
      const c: Vec3 = [x + ux * w, y0 + h, z + uz * w], d: Vec3 = [x - ux * w, y0 + h, z - uz * w];
      sink.quad('structureMetal', a, b, c, d, { colour: shade(GALV, 0.7), decor: true, fine: true });
      sink.quad('structureMetal', b, a, d, c, { colour: shade(GALV, 0.7), decor: true, fine: true });
    }
  }
}

/** The base's reach (ctx.bounds): its size, centre and edges. A kit body sized from it opens no lane beside it. */
function reach(ctx: RegionalBuildContext): { W: number; D: number; cx: number; cz: number; x0: number; x1: number; z0: number; z1: number } {
  const b = ctx.bounds;
  return { W: b.maxX - b.minX, D: b.maxZ - b.minZ, cx: (b.maxX + b.minX) / 2, cz: (b.maxZ + b.minZ) / 2, x0: b.minX, x1: b.maxX, z0: b.minZ, z1: b.maxZ };
}

/**
 * A works yard's perimeter, W x D about the local origin (round 2, the gauntlet's wave 120: the block walls read as "a
 * cinder-block pen"): a poured kerb 0.9 m high (structure: higher than a hull steps, HULL_STEP_UP_M 0.55, so a yard
 * standing where a solid building stood keeps its ground closed), the chain-link over it on steel posts with a top
 * rail and three strands of barbed wire on their arms (dressing), a shut steel gate in the front (+z) side centred at
 * `gx`.
 */
function yardWall(sink: PartSink, W: number, D: number, gx: number, gw: number, tier: RegionalBuildContext['tier']): void {
  const t = 0.3, h = 0.9, x0 = -W / 2, x1 = W / 2, z0 = -D / 2, z1 = D / 2;
  sink.span(CONCRETE, x0, -0.3, z0, x1, h, z0 + t);
  sink.span(CONCRETE, x0, -0.3, z0 + t, x0 + t, h, z1);
  sink.span(CONCRETE, x1 - t, -0.3, z0 + t, x1, h, z1);
  const ga = Math.max(x0 + t, gx - gw / 2), gb = Math.min(x1 - t, gx + gw / 2);
  if (ga - (x0 + t) > 0.2) sink.span(CONCRETE, x0 + t, -0.3, z1 - t, ga, h, z1);
  if (x1 - t - gb > 0.2) sink.span(CONCRETE, gb, -0.3, z1 - t, x1 - t, h, z1);
  // the gate: a steel frame of tube with its mesh, shut, from the ground to the fence's top
  sink.span('structureMetal', ga, 0.04, z1 - t / 2 - 0.04, gb, 3.0, z1 - t / 2 + 0.04, { colour: GALV });
  if (tier !== 'mobile') fenceLine(sink, [[ga, z1 - t / 2], [x0 + t / 2, z1 - t / 2], [x0 + t / 2, z0 + t / 2], [x1 - t / 2, z0 + t / 2], [x1 - t / 2, z1 - t / 2], [gb, z1 - t / 2]], h, 2.1);
}

/** Aluminium sash and steel windows of the Bureau's buildings and the town's houses. */
const ALU: WindowStyle = { frame: ALUMINIUM, frameWidth: 0.05, frameOut: 0.04, bars: 'cross', surround: null, sill: { bucket: 'plaster3', out: 0.06 }, shutters: null };
const RIBBON: WindowStyle = { frame: ALUMINIUM, frameWidth: 0.05, frameOut: 0.03, bars: 'two', surround: null, sill: null, shutters: null };

/**
 * A building's windows and doors. Its glazing is one choice for the whole building (gauntlet wave 107: panes chosen one
 * by one read as "blue glass and tan opaque panels in a checkerboard across the same floor"): drawn from the look
 * stream, curtained throughout with `lit` odds or clear glass throughout. Each pane still draws from the build stream,
 * so every draw after the windows stays where it was.
 */
function dialectOf(rng: () => number, style: WindowStyle, door: Rgb, lit = 0.35, leaf: 'panel' | 'plank' | 'glazed' = 'glazed', look?: () => number): HouseDialect {
  const share = look ? (look() < lit ? 1 : 0) : lit;
  return {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, o.kind === 'loft' ? { ...style, bars: 'none', sill: null } : style, rng, o.kind === 'loft' ? 0 : share),
    door: (s, face, o, y0, frame) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: door, frame: { bucket: 'plaster3', width: 0.1, out: 0.04 },
      steps: { bucket: 'plaster2' }, leafKind: leaf }, frame.floors[o.storey] + o.y0),
  };
}

/**
 * The powerhouse (an arcology plot): a board-formed concrete hall between pilasters, its tall slot windows, the parapet
 * and the roof gantry crane; behind it the anchor block and three penstocks coming down into the hall; a steel catwalk
 * truss from the anchor block to the hall roof, its middle span fallen (the map's broken high crossing).
 */
const powerhouse: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  // the hall, the anchor block and the penstocks fill the old arcology's reach (its bounds)
  const R = reach(ctx), PD = R.D;
  const W = Math.max(8, R.W - 0.8), hallD = Math.min(13, PD * 0.55), H = 16 + rng() * 2;
  sink.placed(0, R.cx, 0, R.cz, () => {
  const zf = PD / 2 - 0.15, zb = zf - hallD;
  sink.span(CONCRETE, -W / 2, -0.5, zb, W / 2, H, zf);
  const front: Face = { origin: [0, 0, zf], u: [1, 0, 0], out: [0, 0, 1], width: W };
  const n = Math.max(1, Math.round(W / 4.4));
  for (let k = 0; k <= n; k++) {
    const u = -W / 2 + 0.35 + (W - 0.7) * k / n;
    faceBox(sink, CONCRETE, front, u, H / 2 + 0.1, 0.2, 0.7, H + 0.2, 0.4, { decor: true });
    const sw = (W - 0.7) / n - 1.5;
    if (k < n && sw > 0.6) {
      const um = -W / 2 + 0.35 + (W - 0.7) * (k + 0.5) / n;
      faceBox(sink, 'glass', front, um, 3.4 + (H - 6.0) / 2, 0.012, sw, H - 6.0, 0.02, { decor: true });
      for (let m = 1; m < 6; m++) faceBox(sink, 'structureMetal', front, um, 3.4 + (H - 6.0) * m / 6, 0.03, sw, 0.07, 0.03, { colour: STEEL_GREY, decor: true, fine: true });
    }
  }
  // the fascia band and the parapet
  sink.band(CONCRETE, -W / 2 - 0.25, H - 1.2, zb - 0.25, W / 2 + 0.25, H + 0.6, zf + 0.25, { decor: true });
  // (round 3, gauntlet wave 133: the wall "meets bare orange sand with no plinth, apron or contact shadow") the dark
  // plinth band under the board-formed walls, as on the control building
  sink.band(PAINTED, -W / 2 - 0.14, -0.3, zb - 0.14, W / 2 + 0.14, 1.1, zf + 0.14, { decor: true, shade: 0.7 });
  // (gauntlet wave 107: the roof gantry crane read as "a yellow A-frame sitting on the rooftop with no rails, supports or
  // load context" and is gone; its livery's draw and its place's are kept, so every later draw holds)
  pick(rng, [rgb(0xc9a24a), STEEL_GREEN, rgb(0xb8302a)]);
  look();
  // the rooftop plant (round 2, the gauntlet's wave 120): the stair house, the ventilators' housings in a row along the
  // ridge line and the air handlers, behind the parapet (dressing)
  sink.span(CONCRETE, W * 0.22, H, zb + 1.2, W * 0.22 + 3.2, H + 3.0, zb + 4.6, { decor: true });
  for (let k = 0; k < 4; k++) {
    const x = -W * 0.32 + k * W * 0.16;
    sink.span('structureMetal', x - 0.7, H, (zb + zf) / 2 - 0.7, x + 0.7, H + 1.5, (zb + zf) / 2 + 0.7, { colour: STEEL_GREY, decor: true });
    sink.cylinder('structureMetal', [x, H + 1.5, (zb + zf) / 2], 'y', 0.5, 0.45, 10, { colour: shade(STEEL_GREY, 0.85), decor: true }, 0.25);
  }
  for (const sx of [-1, 1]) sink.span('structureMetal', sx * W * 0.12 - 1.6, H, zf - 3.4, sx * W * 0.12 + 1.6, H + 1.9, zf - 1.6, { colour: shade(GALV, 0.92), decor: true });
  // the anchor block and the penstocks
  const ab0 = -PD / 2 + 0.3, ab1 = ab0 + Math.max(2.8, Math.min(4.0, PD - hallD - 7));
  const abH = 9.5 + rng() * 2;
  sink.span(CONCRETE, -W / 2 + 1.5, -0.5, ab0, W / 2 - 1.5, abH, ab1);
  const paint = pick(rng, PENSTOCK);
  const pr = 1.55;
  for (const fx of [-0.3, 0, 0.3]) {
    const x = fx * W, a: Vec3 = [x, abH - 2.2, ab1 - 0.2], b: Vec3 = [x, pr + 0.6, zb + 0.3];
    pipe(sink, 'structureMetal', a, b, pr, 16, { colour: paint });
    // stiffener rings and the saddle piers under the run
    for (let k = 1; k < 5; k++) {
      const t = k / 5, p: Vec3 = [a[0], a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], q: Vec3 = [p[0], p[1] + (b[1] - a[1]) * 0.02, p[2] + (b[2] - a[2]) * 0.02];
      pipe(sink, 'structureMetal', p, q, pr + 0.08, 16, { colour: shade(paint, 0.85), decor: true });
      if (k % 2 === 0) sink.span(CONCRETE, x - 1.2, -0.3, p[2] - 0.6, x + 1.2, Math.max(0.4, p[1] - pr + 0.1), p[2] + 0.6);
    }
  }
  // the catwalk truss from the anchor block to the hall roof, its middle fallen
  const tz0 = ab1, tz1 = zb, ty0 = abH, ty1 = H;
  const span = (t0: number, t1: number) => {
    const za = tz0 + (tz1 - tz0) * t0, zb2 = tz0 + (tz1 - tz0) * t1, ya = ty0 + (ty1 - ty0) * t0, yb = ty0 + (ty1 - ty0) * t1;
    for (const dx of [-0.9, 0.9]) {
      sink.member('structureMetal', [W * 0.38 + dx, ya, za], [W * 0.38 + dx, yb, zb2], 0.14, 0.14, [1, 0, 0], { colour: STEEL_GREY, decor: true, exposed: true }, 0);
      sink.member('structureMetal', [W * 0.38 + dx, ya + 1.4, za], [W * 0.38 + dx, yb + 1.4, zb2], 0.1, 0.1, [1, 0, 0], { colour: STEEL_GREY, decor: true, exposed: true }, 0);
    }
    sink.member('structureMetal', [W * 0.38, ya - 0.05, za], [W * 0.38, yb - 0.05, zb2], 1.8, 0.06, [0, 1, 0], { colour: shade(STEEL_GREY, 0.8), decor: true, exposed: true }, 0);
  };
  span(0, 0.36);
  span(0.62, 1);
  });
  return sink.finish();
};

/**
 * The control building (a megatower plot): four storeys of board-formed concrete with ribbon windows between deep
 * spandrels, concrete fins on the entrance front, the penthouse, the radio mast, an entrance canopy with the Bureau's
 * name, the flagpole.
 */
const controlBuilding: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  // the building fills the old tower's reach (its bounds): its back on the back edge, its canopy to the front edge
  const R = reach(ctx);
  const W = Math.max(6, R.W - 0.8), D = Math.max(5, R.D - 4.6);
  sink.placed(0, R.cx, 0, R.z0 + 0.3 + D / 2, () => {
    const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 2.4, y0: 0, h: 2.6 }];
    for (let s = 0; s < 4; s++) for (const face of ['front', 'back', 'left', 'right'] as const) {
      const width = face === 'front' || face === 'back' ? W : D;
      for (const o of windowRhythm(face, s, width, { w: 2.0, h: s === 0 ? 2.2 : 1.6, sill: s === 0 ? 0.7 : 1.0, spacing: 2.4, margin: 1.2,
        avoid: s === 0 && face === 'front' ? [[-2.2, 2.2]] : [] })) openings.push(o);
    }
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.6, out: 0.1, bucket: CONCRETE }, storeys: [{ h: 4.2, wall: CONCRETE }, { h: 3.6, wall: CONCRETE }, { h: 3.6, wall: CONCRETE }, { h: 3.6, wall: CONCRETE }],
      roof: { kind: 'flat', pitchDeg: 0, eave: 0.3, verge: 0.3, thickness: 0.4, bucket: CONCRETE, parapet: 0.9 }, gableBucket: CONCRETE,
      openings, chimneys: [], gutters: null, verge: null, reveal: 0.35,
    }, dialectOf(rng, RIBBON, pick(rng, DOOR_PAINT), 0.15, 'glazed', ctx.variant));
    // (round 2, the gauntlet's wave 120: curtained ribbon windows read as "orange grid trim"; clear glass in most of
    // these buildings, and a dark plinth band under the board-formed walls)
    sink.band(PAINTED, -W / 2 - 0.14, -0.3, -D / 2 - 0.14, W / 2 + 0.14, 1.1, D / 2 + 0.14, { decor: true, shade: 0.7 });
    // the spandrel bands proud of the windows, and the fins on the entrance front
    for (let s = 1; s < 4; s++) {
      const y = frame.floors[s];
      sink.band(CONCRETE, -W / 2 - 0.12, y - 0.35, -D / 2 - 0.12, W / 2 + 0.12, y + 0.2, D / 2 + 0.12, { decor: true });
    }
    const f = frame.faces.front;
    for (let k = -3; k <= 3; k++) if (k !== 0 && Math.abs(k * 2.4) < W / 2 - 0.6) faceBox(sink, CONCRETE, f, k * 2.4, frame.eaveY / 2 + 2.1, 0.45, 0.3, frame.eaveY - 4.2, 0.9, { decor: true });
    // the penthouse, the mast and its antennas
    const top = frame.eaveY + 0.4;
    sink.span(CONCRETE, -W * 0.2, top, -D * 0.25, W * 0.15, top + 3.4, D * 0.15);
    const mx = W * 0.3, mz = -D * 0.3;
    for (const [dx, dz] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]] as const) sink.member('structureMetal', [mx + dx, top, mz + dz], [mx + dx * 0.3, top + 12, mz + dz * 0.3], 0.07, 0.07, [1, 0, 0], { colour: rgb(0xb8302a), decor: true, exposed: true }, 0);
    for (const y of [top + 7, top + 10.5]) sink.cylinder('structureMetal', [mx, y, mz + 0.2], 'z', 0.3, 0.6, 10, { colour: WHITE, decor: true }, 0.3);
    // the entrance canopy on its two columns, the name board along its fascia
    for (const s of [-1, 1]) sink.cylinder(CONCRETE, [s * 2.6, 0, D / 2 + 3.6], 'y', 3.3, 0.22, 10, {});
    sink.span(CONCRETE, -3.6, 3.3, D / 2, 3.6, 3.75, D / 2 + 4.2);
    faceBox(sink, 'structureWood', { origin: [0, 0, D / 2 + 4.2], u: [1, 0, 0], out: [0, 0, 1], width: 7.2 }, 0, 3.52, 0.015, 6.4, 0.22, 0.02, { colour: rgb(0x2e3a44), decor: true });
    sink.cylinder('structureMetal', [W / 2 - 1.0, 0, D / 2 + 3.9], 'y', 11, 0.07, 8, { colour: WHITE, decor: true }, 0.04);
  });
  return sink.finish();
};

/** The surge tower (a needletower plot): a steel drum on a concrete base, its vent cap, the ladder cage, the penstock in. */
const surgeTower: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  // the drum's base fills the old tower's reach across its narrow way; the valve house (back) and the stair landing
  // (front) fill it along the long way
  const RR = reach(ctx), Rb = Math.min(RR.W, RR.D) / 2 - 0.15;
  const R = Math.max(1.5, Math.min(8, Rb - 1.2)), H = 24 + rng() * 6;
  const paint = pick(rng, [rgb(0xa9b2ae), rgb(0x8fa29a), rgb(0xb8b8b0)]);
  sink.placed(0, RR.cx, 0, RR.cz, () => {
    const hd = RR.D / 2;
    sink.cylinder(CONCRETE, [0, -0.5, 0], 'y', 4.6, R + 1.2, 24, {}, R + 1.0);
    sink.cylinder('structureMetal', [0, 4.1, 0], 'y', H, R, 24, { colour: paint });
    for (let y = 4.1 + 3.8; y < 4.1 + H - 1; y += 3.8) sink.cylinder('structureMetal', [0, y, 0], 'y', 0.22, R + 0.06, 24, { colour: shade(paint, 0.82), decor: true }, R + 0.06, false);
    sink.cylinder('structureMetal', [0, 4.1 + H, 0], 'y', 2.2, R + 0.15, 24, { colour: shade(paint, 0.92) }, 0.9);
    sink.cylinder('structureMetal', [0, 6.3 + H, 0], 'y', 1.0, 0.7, 8, { colour: IRON, decor: true }, 0.7);
    // the ladder and its cage up the east side, a landing at the top
    for (const dz of [-0.25, 0.25]) sink.member('structureMetal', [R + 0.45, 4.6, dz], [R + 0.45, 4.1 + H, dz], 0.05, 0.05, [1, 0, 0], { colour: IRON, decor: true, exposed: true }, 0);
    for (let y = 5.4; y < 4.1 + H; y += 1.2) sink.member('structureMetal', [R + 0.15, y, -0.45], [R + 0.15, y, 0.45], 0.04, 0.6, [0, 1, 0], { colour: IRON, decor: true, exposed: true, fine: true }, 0);
    // the penstock coming in at the base through the valve house on the back edge
    const vb = -hd + 0.2, vf = Math.min(-R - 0.4, -Math.max(0.5, Rb - 1.0));
    pipe(sink, 'structureMetal', [0, 2.0, vb + 0.2], [0, 2.0, -R + 0.3], Math.min(1.3, R * 0.35), 14, { colour: pick(look, PENSTOCK) });
    if (vf - vb > 0.6) sink.span(BLOCK, -3.0, -0.3, vb, 3.0, 3.8, vf);
    // the stair landing on the front: a block stair tower to the base's top
    const sb = Math.max(0.5, Rb - 1.0), sf = hd - 0.2;
    if (sf - sb > 0.6) sink.span(BLOCK, -1.6, -0.3, sb, 1.6, 4.6, sf);
  });
  return sink.finish();
};

/**
 * The switchyard (a terracetower plot): a gravelled concrete pad, two lattice dead-end towers at the back carrying the
 * line out, H-frame bus structures, three transformers in a row, the control house, the fence.
 */
const switchyard: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  // the yard fills the old tower's reach (its bounds), walled round its edge
  const R = reach(ctx), W = Math.max(6, R.W - 0.3), D = Math.max(6, R.D - 0.3);
  sink.placed(0, R.cx, 0, R.cz, () => {
    // the pad: crushed rock over the yard (round 2: "a gravel pad"), the kerb round it
    sink.span('structureMetal', -W / 2, -0.4, -D / 2, W / 2, 0.08, D / 2, { colour: rgb(0x8e877a), decor: true });
    const steel = GALV, h = 20 + rng() * 4;
    for (const sx of [-1, 1]) latticeTower(sink, sx * W * 0.28, -D / 2 + 2.6, 1.6, 0.6, h, steel);
    // the cross-arm between the towers and the line's insulator strings
    sink.member('structureMetal', [-W * 0.28, h - 0.4, -D / 2 + 2.6], [W * 0.28, h - 0.4, -D / 2 + 2.6], 0.5, 0.7, [0, 1, 0], { colour: steel, decor: true, exposed: true }, 0);
    for (let k = 0; k < 3; k++) {
      const x = (k - 1) * W * 0.2;
      insulatorString(sink, [x, h - 0.5, -D / 2 + 2.6], 2.1);
      sink.member('structureMetal', [x, h - 2.6, -D / 2 + 2.6], [x, 9.4, -D / 2 + 7.6], 0.05, 0.05, [1, 0, 0], { colour: IRON, decor: true, exposed: true, fine: true }, 0);
    }
    for (const x of [-W * 0.22, 0, W * 0.22]) busFrame(sink, x, -D / 2 + 6.8, -D / 2 + 8.4, 9.6, steel);
    const tc = pick(rng, TRANSFORMER);
    for (let k = 0; k < 3; k++) transformer(sink, (k - 1) * W * 0.3, D * 0.14, 0, 1.0, shade(tc, 0.95 + look() * 0.1));
    // the control house of block in the front corner
    sink.placed(0, W / 2 - 4.0, 0, D / 2 - 3.2, () => {
      buildHouse(sink, {
        w: 6.4, d: 4.4, plinth: { h: 0.2, out: 0.05, bucket: CONCRETE }, storeys: [{ h: 3.2, wall: BLOCK }],
        roof: { kind: 'flat', pitchDeg: 0, eave: 0.2, verge: 0.2, thickness: 0.2, bucket: CONCRETE, parapet: 0.25 }, gableBucket: BLOCK,
        openings: [{ face: 'left', storey: 0, kind: 'door', u: 0.8, w: 0.95, y0: 0, h: 2.1 }, { face: 'left', storey: 0, kind: 'window', u: -1.0, w: 1.4, h: 1.0, y0: 1.1 }],
        chimneys: [], gutters: null, verge: null, reveal: 0.15,
      }, dialectOf(rng, ALU, pick(rng, DOOR_PAINT), 0.3, 'panel', ctx.variant));
    });
    yardWall(sink, W, D, -W * 0.18, 5.0, ctx.tier);
  });
  return sink.finish();
};

/** The transformer yard (a parking deck plot): two rows of transformers and breakers under their bus frames, a hut. */
const transformerYard: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  // the yard fills the old deck's reach (its bounds), walled round its edge
  const R = reach(ctx), W = Math.max(6, R.W - 0.3), D = Math.max(6, R.D - 0.3);
  sink.placed(0, R.cx, 0, R.cz, () => {
    sink.span(CONCRETE, -W / 2, -0.4, -D / 2, W / 2, 0.08, D / 2, { decor: true });
    const tc = pick(rng, TRANSFORMER);
    const cols = 3;
    for (let r = 0; r < 2; r++) for (let c = 0; c < cols; c++) {
      const x = -W / 2 + 4.0 + (W - 8.0) * c / (cols - 1), z = r === 0 ? -D * 0.18 : D * 0.16;
      if (r === 1 && c === cols - 1) continue;
      transformer(sink, x, z, r === 0 ? 0 : Math.PI, 0.9 + rng() * 0.15, shade(tc, 0.92 + look() * 0.12));
    }
    // the breakers (tanks on legs) and the bus frames over them
    for (let c = 0; c < cols; c++) {
      const x = -W / 2 + 4.0 + (W - 8.0) * c / (cols - 1);
      sink.cylinder('structureMetal', [x, 0.08, -D / 2 + 2.0], 'y', 2.4, 0.7, 10, { colour: GALV });
      busFrame(sink, x - 1.6, -D / 2 + 1.2, -D / 2 + 3.0, 8.0, GALV);
    }
    sink.placed(0, W / 2 - 3.6, 0, D / 2 - 3.0, () => {
      buildHouse(sink, {
        w: 5.6, d: 4.0, plinth: { h: 0.2, out: 0.05, bucket: CONCRETE }, storeys: [{ h: 3.0, wall: BLOCK }],
        roof: { kind: 'flat', pitchDeg: 0, eave: 0.2, verge: 0.2, thickness: 0.2, bucket: CONCRETE, parapet: 0.25 }, gableBucket: BLOCK,
        openings: [{ face: 'left', storey: 0, kind: 'door', u: 0.6, w: 0.95, y0: 0, h: 2.1 }], chimneys: [], gutters: null, verge: null, reveal: 0.15,
      }, dialectOf(rng, ALU, pick(rng, DOOR_PAINT), 0.3, 'panel', ctx.variant));
    });
    yardWall(sink, W, D, -W / 2 + 6.0, 5.0, ctx.tier);
  });
  return sink.finish();
};

/** The microwave relay tower (a broadcast tower plot): a tall lattice tower, its dishes and horn, the equipment hut. */
const relayTower: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  // the relay station fills the old tower's reach (its bounds): the tower and its hut inside a walled compound
  const R = reach(ctx), W = Math.max(6, R.W - 0.3), D = Math.max(6, R.D - 0.3);
  const H = 38 + rng() * 8, tx = -W * 0.15, tz = -D * 0.12;
  const steel = pick(rng, [GALV, rgb(0xb8302a)]);
  sink.placed(0, R.cx, 0, R.cz, () => {
    latticeTower(sink, tx, tz, Math.min(3.0, Math.min(W, D) * 0.18), 0.9, H, steel, false, 4.0);
    for (const y of [H * 0.72, H - 0.2]) sink.span('structureMetal', tx - 1.6, y - 0.1, tz - 1.6, tx + 1.6, y, tz + 1.6, { colour: steel, decor: true });
    for (let k = 0; k < 3; k++) {
      const yaw = k * 2.1 + look() * 0.6, y = H * (0.72 + (k % 2) * 0.1) + 1.4;
      sink.placed(yaw, tx, 0, tz, () => {
        sink.cylinder('structureMetal', [0, y, 1.3], 'z', 0.7, 1.4, 14, { colour: WHITE, decor: true }, 0.45);
        sink.member('structureMetal', [0, y, 0.5], [0, y, 1.3], 0.15, 0.15, [0, 1, 0], { colour: IRON, decor: true, exposed: true }, 0);
      });
    }
    sink.cylinder('structureMetal', [tx, H, tz], 'y', 3.0, 0.06, 6, { colour: IRON, decor: true }, 0.03);
    const hw = Math.min(7.0, W * 0.4), hd = Math.min(5.2, D * 0.35);
    sink.placed(0, W / 2 - hw / 2 - 1.0, 0, D / 2 - hd / 2 - 1.2, () => {
      buildHouse(sink, {
        w: hw, d: hd, plinth: { h: 0.2, out: 0.05, bucket: CONCRETE }, storeys: [{ h: 3.3, wall: BLOCK }],
        roof: { kind: 'flat', pitchDeg: 0, eave: 0.25, verge: 0.25, thickness: 0.2, bucket: CONCRETE, parapet: 0.25 }, gableBucket: BLOCK,
        openings: [{ face: 'left', storey: 0, kind: 'door', u: 0.6, w: 0.95, y0: 0, h: 2.1 }], chimneys: [], gutters: null, verge: null, reveal: 0.15,
      }, dialectOf(rng, ALU, pick(rng, DOOR_PAINT), 0.3, 'panel', ctx.variant));
      sink.span('structureMetal', -hw / 2 + 1.0, 3.55, -1.0, -hw / 2 + 2.2, 4.3, 0.2, { colour: rgb(0xc4c0b4), decor: true });
    });
    yardWall(sink, W, D, -W * 0.25, 4.2, ctx.tier);
  });
  return sink.finish();
};

/**
 * The visitor centre or the town's school (a civic hall plot). The visitor centre: a long low concrete hall under a
 * cantilevered roof slab, a glass wall to the view, the round overlook drum at one end, the flag plaza. The school: a
 * classroom wing of painted block under a shallow gable, a covered walk along it, the gym block.
 */
const civicHall: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  // both fill the old hall's reach (its bounds)
  const RR = reach(ctx), PW = RR.W, PD = RR.D;
  if (rng() < 0.5) {
    // the visitor centre: the hall on the back edge, the overlook drum at the east end, the plaza's planter on the front
    const W = Math.max(5, PW - 10), D = Math.max(5, Math.min(14, PD - 7)), H = 5.4;
    const x0 = RR.x0 + 0.4 + W / 2, z0 = RR.z0 + 0.3 + D / 2;
    sink.placed(0, x0, 0, z0, () => {
      sink.span(CONCRETE, -W / 2, -0.5, -D / 2, W / 2, H, D / 2 - 2.0);
      // the glass wall to the view under the slab, its mullions
      const f: Face = { origin: [0, 0, D / 2 - 2.0], u: [1, 0, 0], out: [0, 0, 1], width: W };
      facePanel(sink, 'glass', f, 0, H / 2, 0.02, W - 1.0, H - 0.6, { decor: true });
      for (let u = -W / 2 + 0.5; u <= W / 2 - 0.5; u += 2.2) faceBox(sink, 'structureMetal', f, u, H / 2, 0.06, 0.12, H - 0.6, 0.1, { colour: rgb(0x4a4c4e), decor: true, fine: true });
      sink.span(CONCRETE, -W / 2 - 0.3, H, -D / 2 - 0.3, W / 2 + 1.5, H + 0.8, D / 2 + 1.0);
      faceBox(sink, 'structureWood', { origin: [0, 0, D / 2 + 1.0], u: [1, 0, 0], out: [0, 0, 1], width: W }, 0, H + 0.4, 0.015, W * 0.5, 0.3, 0.02, { colour: rgb(0x2e3a44), decor: true });
    });
    // the overlook drum at the east end and its roof ring
    const dr = Math.max(2.4, Math.min(4.2, (RR.x1 - (x0 + W / 2)) / 2 + 0.3)), dx = RR.x1 - dr - 0.35, dz = z0;
    sink.cylinder(CONCRETE, [dx, -0.5, dz], 'y', 8.0, dr, 20, {});
    sink.cylinder(CONCRETE, [dx, 7.5, dz], 'y', 0.6, dr + 0.4, 20, { decor: true }, dr + 0.4);
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * Math.PI * 2;
      faceBox(sink, 'glass', { origin: [dx + Math.cos(a) * dr, 0, dz + Math.sin(a) * dr], u: [Math.sin(a), 0, -Math.cos(a)], out: [Math.cos(a), 0, Math.sin(a)], width: 2 }, 0, 5.6, 0.01, 1.6, 1.6, 0.02, { decor: true });
    }
    // the flag plaza: three poles and a low planter wall along the front edge
    for (let k = 0; k < 3; k++) sink.cylinder('structureMetal', [RR.cx - PW * 0.25 + k * 2.4, 0, RR.z1 - 1.6], 'y', 10, 0.07, 8, { colour: WHITE, decor: true }, 0.04);
    sink.span(CONCRETE, RR.x0 + 0.4, -0.2, RR.z1 - 0.8, RR.cx + PW * 0.1, 0.6, RR.z1 - 0.25);
    void look;
    return sink.finish();
  }
  // the school: a classroom wing on the back edge, the covered walk in front of it, the gym at the east end
  const gw = Math.min(10, Math.max(5, PW * 0.3)), gd = Math.max(6, PD - 0.6);
  const W = Math.max(6, PW - gw - 1.8), D = Math.max(5, Math.min(9.5, PD - 8));
  sink.placed(0, RR.x0 + 0.4 + W / 2, 0, RR.z0 + 0.4 + D / 2, () => {
    const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.8, y0: 0, h: 2.3 }];
    for (const o of windowRhythm('front', 0, W, { w: 2.4, h: 1.5, sill: 0.9, spacing: 3.2, margin: 1.4, avoid: [[-1.6, 1.6]] })) openings.push(o);
    for (const o of windowRhythm('back', 0, W, { w: 2.4, h: 1.5, sill: 0.9, spacing: 3.2, margin: 1.4 })) openings.push(o);
    buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.3, out: 0.05, bucket: CONCRETE }, storeys: [{ h: 3.6, wall: rng() < 0.5 ? BLOCK : PAINTED }],
      roof: { kind: 'gable', pitchDeg: 12, eave: 0.9, verge: 0.6, thickness: 0.12, bucket: 'roof', ridge: 'saddle' }, gableBucket: PAINTED,
      openings, chimneys: [], gutters: null, verge: { colour: WHITE, bucket: 'structureWood' }, reveal: 0.2,
    }, dialectOf(rng, ALU, pick(rng, DOOR_PAINT), 0.35, 'glazed', ctx.variant));
  });
  const walkZ = RR.z0 + 0.4 + D + 2.2;
  for (let x = RR.x0 + 1.3; x < RR.x0 + W; x += 3.2) sink.cylinder('structureMetal', [x, 0, walkZ], 'y', 2.8, 0.08, 8, { colour: STEEL_GREY });
  sink.span(CONCRETE, RR.x0 + 0.6, 2.8, walkZ - 2.4, RR.x0 + W + 0.2, 3.05, walkZ + 0.5, { decor: true, shadow: true });
  sink.placed(0, RR.x1 - gw / 2 - 0.4, 0, RR.cz, () => {
    buildHouse(sink, {
      w: gw, d: gd, plinth: { h: 0.3, out: 0.05, bucket: CONCRETE }, storeys: [{ h: 7.0, wall: BLOCK }],
      roof: { kind: 'flat', pitchDeg: 0, eave: 0.3, verge: 0.3, thickness: 0.3, bucket: CONCRETE, parapet: 0.4 }, gableBucket: BLOCK,
      openings: [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.8, y0: 0, h: 2.3 }, ...windowRhythm('left', 0, gd, { w: 2.0, h: 1.0, sill: 5.2, spacing: 3.0, margin: 1.4, kind: 'loft' })],
      chimneys: [], gutters: null, verge: null, reveal: 0.2,
    }, dialectOf(rng, ALU, pick(rng, DOOR_PAINT), 0.3, 'glazed', ctx.variant));
  });
  void look;
  return sink.finish();
};

/** The gate-hoist house (a factory plot): a concrete crane bay with high clerestories, roller doors, the monorail. */
const hoistHouse: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  // the crane bay fills the old factory's reach (its bounds)
  const R = reach(ctx), W = Math.max(6, R.W - 0.8), D = Math.max(8, R.D - 0.8), H = 12 + rng() * 2;
  sink.placed(0, R.cx, 0, R.cz, () => {
  sink.span(CONCRETE, -W / 2, -0.5, -D / 2, W / 2, H, D / 2);
  sink.band(CONCRETE, -W / 2 - 0.2, H - 0.8, -D / 2 - 0.2, W / 2 + 0.2, H + 0.5, D / 2 + 0.2, { decor: true });
  for (const side of [-1, 1]) {
    const f: Face = { origin: [side * W / 2, 0, 0], u: [0, 0, -side], out: [side, 0, 0], width: D };
    for (let u = -D / 2 + 1.6; u < D / 2 - 1.2; u += 2.8) faceBox(sink, 'glass', f, u, H - 2.6, 0.012, 2.0, 1.6, 0.02, { decor: true });
    for (let u = -D / 2; u <= D / 2; u += 2.8) faceBox(sink, CONCRETE, f, u, H / 2, 0.15, 0.5, H, 0.3, { decor: true });
  }
  const front: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
  for (const u of [-W * 0.22, W * 0.22]) {
    faceBox(sink, 'dark', front, u, 3.1, 0.005, 3.6, 6.0, 0.02, { decor: true });
    faceBox(sink, 'structureMetal', front, u, 3.1 + 1.6, 0.04, 3.6, 2.8, 0.05, { colour: STEEL_GREY, decor: true });
  }
  sink.span('structureMetal', -0.2, H - 1.6, D / 2 - 1.0, 0.2, H - 1.1, D / 2 + 2.4, { colour: rgb(0xc9a24a), decor: true });
  sink.span('structureMetal', -0.5, H - 2.4, D / 2 + 1.7, 0.5, H - 1.6, D / 2 + 2.2, { colour: rgb(0xc9a24a), decor: true });
  });
  return sink.finish();
};

/** A penstock run (a gantry plot): the steel pipe on concrete saddles, stiffener rings, the anchor block, a catwalk. */
const penstockRun: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  // the run fills the old gantry's reach (its bounds, which stand off the plot's centre)
  // (Skybridge round 7, gauntlet wave 259: "a huge featureless grey panelled cube ... about a quarter of the frame" — a
  // 4 m pipe on a 5.8 m block, beside the road: the steel pipe now 2.4-2.6 m across, up on its saddles so it reads as a
  // pipe, its stiffener rings and the expansion sleeve dark against the paint; the anchor block it comes out of battered
  // and no taller than the pipe's crown and a step, its footing the width the plot needs)
  const R = reach(ctx), L = Math.max(8, R.W - 0.4), r = Math.max(0.8, Math.min(1.3, R.D / 2 - 1.0)), y = r + 1.2;
  const paint = pick(rng, PENSTOCK);
  sink.placed(0, R.cx, 0, R.cz, () => {
  const x0 = -L / 2 + 3.4;
  pipe(sink, 'structureMetal', [x0, y, 0], [L / 2, y, 0], r, 20, { colour: paint });
  // the saddles: a pier under the pipe every 4.6 m, its cradle up to the pipe's waist
  for (let x = x0 + 1.6; x < L / 2 - 1; x += 4.6) {
    sink.span(CONCRETE, x - 0.55, -0.4, -r * 0.9, x + 0.55, y - r * 0.35, r * 0.9);
    sink.span(CONCRETE, x - 0.75, -0.4, -r * 1.05, x + 0.75, 0.25, r * 1.05);
  }
  // the stiffener rings, between the saddles, and the expansion sleeve past the anchor
  for (let x = x0 + 3.9; x < L / 2 - 0.5; x += 4.6) pipe(sink, 'structureMetal', [x - 0.09, y, 0], [x + 0.09, y, 0], r + 0.09, 20, { colour: shade(paint, 0.72), decor: true });
  pipe(sink, 'structureMetal', [x0 + 0.5, y, 0], [x0 + 1.1, y, 0], r + 0.14, 20, { colour: shade(paint, 0.62), decor: true });
  // the anchor block: battered, its section a trapezoid from its footing to a cap over the pipe's crown, the footing as
  // wide as the plot asks (a solid reach, so no lane opens beside it)
  const hw = Math.max(r + 0.9, Math.min(R.D / 2 - 0.4, 2.4)), top = y + r + 0.35, cap = Math.max(r + 0.4, hw - 0.7);
  sink.prism(CONCRETE, [[-L / 2, top, -cap], [-L / 2, top, cap], [-L / 2, -0.4, hw], [-L / 2, -0.4, -hw]], [1, 0, 0], 3.4);
  sink.span(CONCRETE, -L / 2 - 0.1, top - 0.05, -cap - 0.12, -L / 2 + 3.5, top + 0.22, cap + 0.12, { decor: true });
  // the manway on the pipe and its access ladder
  sink.cylinder('structureMetal', [L * 0.15, y + r - 0.1, 0], 'y', 0.5, 0.45, 10, { colour: shade(paint, 0.9), decor: true });
  for (const z of [r + 0.25, r + 0.65]) sink.member('structureMetal', [L * 0.15 - 0.4, 0, z], [L * 0.15 - 0.4, y + r, z], 0.05, 0.05, [1, 0, 0], { colour: IRON, decor: true, exposed: true }, 0);
  if (look() < 0.7) {
    for (let x = -L / 2 + 4.2; x < L / 2; x += 3.0) sink.cylinder('structureMetal', [x, 0, r + 0.4], 'y', y + 1.0, 0.04, 5, { colour: IRON, decor: true });
    sink.member('structureMetal', [-L / 2 + 4.2, y + 1.0, r + 0.4], [L / 2 - 0.2, y + 1.0, r + 0.4], 0.04, 0.04, [0, 1, 0], { colour: IRON, decor: true, exposed: true }, 0);
  }
  });
  return sink.finish();
};

/** The field office (a foundry office plot): two storeys of painted block, ribbon windows, an entrance canopy. */
const fieldOffice: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  // the office fills the old office's reach (its bounds): its back on the back edge, its canopy's posts to the front
  const R = reach(ctx), W = Math.max(6, R.W - 0.8), D = Math.max(5, R.D - 3.0);
  sink.placed(0, R.cx, 0, R.z0 + 0.3 + D / 2, () => {
    const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.8, y0: 0, h: 2.3 }];
    for (let s = 0; s < 2; s++) for (const face of ['front', 'back', 'left', 'right'] as const) {
      for (const o of windowRhythm(face, s, face === 'front' || face === 'back' ? W : D, { w: 2.2, h: 1.2, sill: 1.0, spacing: 2.8, margin: 1.0,
        avoid: s === 0 && face === 'front' ? [[-1.6, 1.6]] : [] })) openings.push(o);
    }
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.3, out: 0.05, bucket: CONCRETE }, storeys: [{ h: 3.4, wall: rng() < 0.5 ? BLOCK : PAINTED }, { h: 3.2, wall: rng() < 0.5 ? BLOCK : PAINTED }],
      roof: { kind: 'flat', pitchDeg: 0, eave: 0.45, verge: 0.45, thickness: 0.25, bucket: CONCRETE, parapet: 0.3 }, gableBucket: BLOCK,
      openings, chimneys: [], gutters: null, verge: null, reveal: 0.18,
    }, dialectOf(rng, RIBBON, pick(rng, DOOR_PAINT), 0.4, 'glazed', ctx.variant));
    sink.span(CONCRETE, -2.4, 2.9, D / 2, 2.4, 3.15, D / 2 + 2.6, { decor: true, shadow: true });
    for (const s of [-1, 1]) sink.cylinder('structureMetal', [s * 2.1, 0, D / 2 + 2.3], 'y', 2.9, 0.07, 8, { colour: STEEL_GREY });
    const top = frame.eaveY + 0.25;
    for (const [x, z] of [[-W * 0.25, 0], [W * 0.2, -D * 0.2]] as const) sink.span('structureMetal', x - 0.8, top, z - 0.6, x + 0.8, top + 1.1, z + 0.6, { colour: rgb(0xb8b8b0), decor: true });
  });
  return sink.finish();
};

/** The Bureau's steel warehouse (a warehouse plot): a portal-frame shed in profiled steel, low gable, roller doors. */
const steelWarehouse: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  // the shed fills the old warehouse's reach (its bounds): its back on the back edge, its dock to the front edge
  const R = reach(ctx), W = Math.max(8, R.W - 0.4), D = Math.max(10, R.D - 2.0), H = 5.6;
  const livery = pick(rng, [rgb(0xd8d2c0), rgb(0xb8c0bc), rgb(0xc9b896), rgb(0xa9b2ae)]);
  sink.placed(0, R.cx, 0, R.z0 + 0.2 + D / 2, () => {
    sink.span(CONCRETE, -W / 2 - 0.1, -0.4, -D / 2 - 0.1, W / 2 + 0.1, 0.25, D / 2 + 0.1);
    sink.span('structureMetal', -W / 2, 0.25, -D / 2, W / 2, H, D / 2, { colour: livery });
    const roof: RoofSpec = { kind: 'gable', pitchDeg: 8, eave: 0.4, verge: 0.3, thickness: 0.07, bucket: 'structureMetal', ridge: 'saddle' };
    const rg = roofGeometry(W, D, H, roof);
    emitRoof(sink, rg, roof, shade(livery, 1.02));
    if (rg.gable) for (const z of [D / 2, -D / 2]) {
      const pts: Vec3[] = rg.gable.map(([u, yy]) => [u, yy, z] as Vec3);
      sink.prism('structureMetal', z > 0 ? [...pts].reverse() : pts, [0, 0, z > 0 ? -1 : 1], 0.06, { colour: livery });
    }
    const f: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
    const dw = Math.min(3.8, W * 0.36);
    for (const u of [-W * 0.24, W * 0.24]) {
      faceBox(sink, 'dark', f, u, 2.45, 0.005, dw, 4.4, 0.02, { decor: true });
      faceBox(sink, 'structureMetal', f, u, 2.45 + 1.0, 0.03, dw, 2.4, 0.04, { colour: STEEL_GREY, decor: true });
    }
    for (const side of [-1, 1]) {
      const sf: Face = { origin: [side * W / 2, 0, 0], u: [0, 0, -side], out: [side, 0, 0], width: D };
      faceBox(sink, 'glass', sf, 0, H - 0.8, 0.012, D - 3, 0.6, 0.02, { decor: true });
    }
    sink.span(CONCRETE, -W / 2, -0.3, D / 2, W / 2, 1.1, D / 2 + 1.6);
  });
  return sink.finish();
};

/**
 * A Page ranch house at the origin facing +z: one storey of stucco or painted block under a shallow shingled gable,
 * a picture window, the front door with its stoop, a carport on steel posts beside it.
 */
function ranchHouse(sink: PartSink, rng: () => number, look: () => number, W: number, D: number, carport: number): void {
  const wall: RegionalBucket = rng() < 0.55 ? STUCCO : BLOCK;
  const door = pick(rng, DOOR_PAINT);
  const du = -W * 0.18;
  const openings: Opening[] = [
    { face: 'front', storey: 0, kind: 'door', u: du, w: 0.95, y0: 0, h: 2.05 },
    { face: 'front', storey: 0, kind: 'window', u: W * 0.2, w: 2.4, h: 1.4, y0: 0.8 },
  ];
  for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, 0, D, { w: 1.1, h: 1.1, sill: 1.0, spacing: 3.0, margin: 1.2, max: 2 })) openings.push(o);
  for (const o of windowRhythm('back', 0, W, { w: 1.1, h: 1.0, sill: 1.1, spacing: 3.0, margin: 1.2, max: 3 })) openings.push(o);
  buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.35, out: 0.04, bucket: CONCRETE }, storeys: [{ h: 2.55, wall }],
    roof: { kind: 'gable', pitchDeg: 17, eave: 0.55, verge: 0.4, thickness: 0.1, bucket: 'roof', ridge: 'saddle' }, gableBucket: wall,
    openings, chimneys: rng() < 0.4 ? [{ x: W * 0.3, z: -D * 0.15, sx: 0.5, sz: 0.5, above: 0.5, bucket: BLOCK, cap: 'slab' }] : [],
    gutters: rng() < 0.5 ? { colour: WHITE } : null, verge: { colour: WHITE, bucket: 'structureWood' }, reveal: 0.14, rafters: null,
  }, dialectOf(rng, ALU, door, 0.45, rng() < 0.5 ? 'panel' : 'glazed', look));
  if (carport > 2.4) {
    // the carport: a flat sheet roof on four steel posts against the house's side
    const cx = W / 2 + carport / 2;
    for (const sz of [-1, 1]) sink.cylinder('structureMetal', [W / 2 + carport - 0.2, 0, sz * (D / 2 - 0.4)], 'y', 2.5, 0.06, 8, { colour: WHITE });
    sink.span('structureMetal', W / 2, 2.5, -D / 2 - 0.1, W / 2 + carport, 2.62, D / 2 + 0.4, { colour: pick(look, CAR_ROOF), decor: true, shadow: true });
    void cx;
  }
}

/** Two Page ranch houses side by side down a depot plot (their fronts to +x, the plot's long side), carports between. */
const housePair: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  // the two houses fill the old depot's reach (its bounds, which stand off the plot's centre): each half its length,
  // the whole of its depth
  const R = reach(ctx), across = Math.max(6, R.W - 1.0), along = Math.max(5, R.D / 2 - 1.0);
  for (const sz of [-1, 1]) {
    // each house turned to face the plot's +x side (the street): its +z to world +x
    sink.placed(Math.PI / 2, R.cx, 0, R.cz + sz * R.D / 4, () => ranchHouse(sink, rng, look, along, across, 0));
  }
  return sink.finish();
};

/** One Page ranch house down a container row plot, its carport at one end. */
const houseSingle: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  // the house and its carport fill the old row's reach (its bounds)
  const R = reach(ctx), carport = Math.max(2.6, Math.min(3.6, R.W * 0.22));
  const W = Math.max(6, R.W - 0.6 - carport), D = Math.max(5, R.D - 0.8);
  sink.placed(0, R.x0 + 0.3 + W / 2, 0, R.cz, () => ranchHouse(sink, ctx.rng, ctx.variant, W, D, carport));
  return sink.finish();
};

/** The fire station (a fire station plot): the apparatus bay of block, two overhead doors, the hose tower, the siren. */
const fireStation: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  // the station fills the old station's reach (its bounds)
  const R = reach(ctx), W = Math.max(7, R.W - 0.8), D = Math.max(8, R.D - 0.8);
  sink.placed(0, R.cx, 0, R.cz, () => {
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.2, out: 0.05, bucket: CONCRETE }, storeys: [{ h: 5.0, wall: BLOCK }],
    roof: { kind: 'flat', pitchDeg: 0, eave: 0.3, verge: 0.3, thickness: 0.25, bucket: CONCRETE, parapet: 0.4 }, gableBucket: BLOCK,
    openings: [{ face: 'right', storey: 0, kind: 'door', u: D * 0.25, w: 0.95, y0: 0, h: 2.1 }, ...windowRhythm('left', 0, D, { w: 1.4, h: 1.0, sill: 1.4, spacing: 3.0, margin: 1.2 })],
    chimneys: [], gutters: null, verge: null, reveal: 0.18,
  }, dialectOf(rng, ALU, rgb(0x8a2a22), 0.4, 'panel', ctx.variant));
  const f = frame.faces.front;
  for (const u of [-W * 0.24, W * 0.24]) {
    faceBox(sink, 'dark', f, u, 2.1, 0.005, 3.4, 4.0, 0.02, { decor: true });
    faceBox(sink, 'structureMetal', f, u, 2.1, 0.03, 3.4, 4.0, 0.04, { colour: rgb(0xb8302a), decor: true });
    for (let k = 0; k < 4; k++) faceBox(sink, 'glass', f, u - 1.2 + k * 0.8, 2.9, 0.06, 0.6, 0.4, 0.01, { decor: true, fine: true });
  }
  faceBox(sink, 'structureWood', f, 0, 4.55, 0.02, W * 0.6, 0.35, 0.03, { colour: WHITE, decor: true });
  // the hose tower in a back corner and the siren on its pole
  sink.span(BLOCK, W / 2 - 3.2, -0.3, -D / 2, W / 2, 13.0, -D / 2 + 3.2);
  sink.span(CONCRETE, W / 2 - 3.4, 13.0, -D / 2 - 0.2, W / 2 + 0.2, 13.4, -D / 2 + 3.4);
  sink.cylinder('structureMetal', [-W / 2 + 1.0, 0, -D / 2 + 1.0], 'y', 9, 0.1, 8, { colour: STEEL_GREY, decor: true });
  sink.cylinder('structureMetal', [-W / 2 + 1.0, 9, -D / 2 + 1.0], 'y', 0.5, 0.35, 10, { colour: rgb(0xd8d2c4), decor: true });
  });
  return sink.finish();
};

/** Page's water tower (a water tower plot): a steel tank with a cone roof on four braced legs, ladder and rail. */
const waterTower: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant;
  const P = Math.max(3.6, Math.min(5.4, Math.min(ctx.info.w, ctx.info.d) - 0.2));
  const legH = Math.max(8, Math.min(11, ctx.info.h - 3.2)), tankR = P / 2 - 0.05, tankH = 3.0;
  const paint = pick(look, [rgb(0xe0dcd2), rgb(0xa9b8b0), rgb(0x9fb4c2)]);
  const lb = P / 2 - 0.2, lt = tankR * 0.7;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) sink.member('structureMetal', [sx * lb, -0.4, sz * lb], [sx * lt, legH, sz * lt], 0.2, 0.2, [sx, 0, 0], { colour: shade(paint, 0.85), exposed: true }, 0);
  for (const y of [legH * 0.35, legH * 0.7]) {
    const r = lb + (lt - lb) * y / legH;
    for (const [a, b] of [[[-r, -r], [r, -r]], [[r, -r], [r, r]], [[r, r], [-r, r]], [[-r, r], [-r, -r]]] as const) {
      sink.member('structureMetal', [a[0], y, a[1]], [b[0], y, b[1]], 0.09, 0.09, [0, 1, 0], { colour: shade(paint, 0.85), decor: true, exposed: true }, 0);
    }
  }
  sink.cylinder('structureMetal', [0, legH, 0], 'y', 0.4, tankR * 0.7, 16, { colour: shade(paint, 0.9) }, tankR);
  sink.cylinder('structureMetal', [0, legH + 0.4, 0], 'y', tankH, tankR, 20, { colour: paint });
  sink.cylinder('structureMetal', [0, legH + 0.4 + tankH, 0], 'y', 1.0, tankR + 0.1, 20, { colour: shade(paint, 0.92) }, 0.15);
  sink.cylinder('structureMetal', [0, legH + 0.36, 0], 'y', 0.05, tankR + 0.5, 20, { colour: IRON, decor: true });
  // the town's name: a dark band round the tank's upper third
  sink.cylinder('structureMetal', [0, legH + 2.2, 0], 'y', 0.55, tankR + 0.012, 20, { colour: rgb(0x2f4f6a), decor: true }, tankR + 0.012, false);
  return sink.finish();
};

/** A ruin: a ranch house burnt out to its block walls and chimney, or the rubble of a concrete shed. */
const ruin: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  // the ruin fills the old ruin's reach (its bounds)
  // (Skybridge round 7, gauntlet wave 259: "white toy-brick ruins", "clean white rubble blocks that look like foam"): a
  // burnt-out house of block — its walls broken low, a few stubs to the sill, the charred tops dark, the chimney stack
  // standing with its soot, the roof's rusted sheets and its burnt timbers down inside it, a scorch over the slab
  const R = reach(ctx), W = Math.max(5, R.W - 0.6), D = Math.max(6, R.D - 0.6), t = 0.22;
  sink.placed(0, R.cx, 0, R.cz, () => {
  sink.span(CONCRETE, -W / 2 - 0.05, -0.5, -D / 2 - 0.05, W / 2 + 0.05, 0.3, D / 2 + 0.05);
  sink.cylinder('dark', [0, 0.31, 0], 'y', 0.01, Math.min(W, D) * 0.34, 9, { decor: true }, Math.min(W, D) * 0.34, true, look());
  for (const [x0, z0, x1, z1, axis] of [[-W / 2, -D / 2, W / 2, -D / 2 + t, 'x'], [-W / 2, D / 2 - t, W / 2, D / 2, 'x'],
    [-W / 2, -D / 2 + t, -W / 2 + t, D / 2 - t, 'z'], [W / 2 - t, -D / 2 + t, W / 2, D / 2 - t, 'z']] as const) {
    const len = axis === 'x' ? x1 - x0 : z1 - z0, pieces = Math.max(3, Math.round(len / 1.6));
    for (let k = 0; k < pieces; k++) {
      if (rng() < 0.22) continue;
      const a = k / pieces, b = (k + 1) / pieces, top = 0.45 + rng() * rng() * 1.5;
      if (axis === 'x') {
        sink.span(BLOCK, x0 + len * a, 0.3, z0, x0 + len * b, top, z1);
        if (rng() < 0.5) sink.span('dark', x0 + len * a, top, z0 - 0.01, x0 + len * b, top + 0.03, z1 + 0.01, { decor: true });
      } else {
        sink.span(BLOCK, x0, 0.3, z0 + len * a, x1, top, z0 + len * b);
        if (rng() < 0.5) sink.span('dark', x0 - 0.01, top, z0 + len * a, x1 + 0.01, top + 0.03, z0 + len * b, { decor: true });
      }
    }
  }
  // the chimney stack and its soot
  sink.span(BLOCK, W * 0.2, 0.3, -D * 0.2, W * 0.2 + 0.9, 3.4, -D * 0.2 + 0.9);
  sink.span('dark', W * 0.2 - 0.01, 2.6, -D * 0.2 - 0.01, W * 0.2 + 0.91, 3.41, -D * 0.2 + 0.91, { decor: true });
  for (let k = 0; k < 4; k++) {
    const a: Vec3 = [(rng() - 0.5) * W * 0.7, 0.4, (rng() - 0.5) * D * 0.7], b: Vec3 = [a[0] + (rng() - 0.5) * 3, 0.4 + rng() * 0.8, a[2] + (rng() - 0.5) * 3];
    sink.member('structureWood', a, b, 0.14, 0.2, [0, 1, 0], { colour: rgb(0x2e2925), decor: true, exposed: true }, 0);
  }
  // the roof's sheets, down and rusted
  for (let k = 0; k < 3; k++) {
    const cx = (rng() - 0.5) * W * 0.6, cz = (rng() - 0.5) * D * 0.6, w = 1.6 + rng() * 1.4, d = 0.9 + rng() * 0.8;
    sink.span('structureMetal', cx - w / 2, 0.32, cz - d / 2, cx + w / 2, 0.36 + rng() * 0.25, cz + d / 2, { colour: shade(rgb(0x7a4a2e), 0.8 + look() * 0.4), decor: true });
  }
  sink.cylinder(CONCRETE, [0, 0.2, 0], 'y', 0.5, Math.min(W, D) * 0.3, 7, { decor: true }, Math.min(W, D) * 0.12, true, look());
  });
  return sink.finish();
};

export const GLENCANYON_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  arcology: powerhouse,
  megatower: controlBuilding,
  needletower: surgeTower,
  terracetower: switchyard,
  broadcasttower: relayTower,
  parkingdeck: transformerYard,
  civichall: civicHall,
  factory: hoistHouse,
  gantry: penstockRun,
  foundryoffice: fieldOffice,
  warehouse: steelWarehouse,
  depot: housePair,
  containerRow: houseSingle,
  firestation: fireStation,
  watertower: waterTower,
  ruin,
});

export const GLENCANYON_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'glencanyon',
  region: 'Glen Canyon Dam and Page, Arizona (the Bureau of Reclamation, 1957-66): board-formed concrete works, switchyards and penstocks, a ranch-house town',
  surfaces: {
    // the town's shingled gables; the Bureau's and the town's concrete block
    roof: { kind: 'shingle', tint: [0.46, 0.43, 0.40] },
    // (Skybridge round 7, gauntlet wave 259: the block walls and ruins read "white toy-brick", "foam": the block taken to a
    // dust-stained buff, as the town's painted and weathered block stands in the canyon country's dust)
    stone: { kind: 'block', tint: [0.72, 0.66, 0.58] },
    sourced: { plaster: false, wood: true },
    tones: {
      // stucco in the town's pale colours, poured concrete a warm grey, painted concrete and block an off-white
      // (round 3, gauntlet wave 133: the poured concrete read "bright cream": sixty years of weather took it to a
      // middling buff-grey)
      plaster: (_h, s, l) => [0.09, Math.min(1, s * 0.6 + 0.12), Math.min(1, l * 1.1 + 0.12)],
      plaster2: (_h, s, l) => [0.08, Math.min(1, s * 0.18 + 0.02), Math.min(1, l * 0.88 + 0.07)],
      plaster3: (_h, s, l) => [0.11, Math.min(1, s * 0.25), Math.min(1, l * 1.2 + 0.16)],
    },
    // (Skybridge round 2: the dam's, the powerhouse's and the Bureau's concrete is poured, board-formed, as at the dam)
    concrete: 'boardFormed',
  },
  builders: GLENCANYON_BUILDERS,
  // the desert's dry air; the stucco houses each their own pale colour (peach, sky, sand, mint) and the concrete stained
  weather: {
    plaster: [[1, 1, 1], [1.08, 0.98, 0.9], [0.92, 0.98, 1.06], [1.04, 1.02, 0.9], [0.94, 1.04, 0.98]],
    stone: [[1, 1, 1], [0.93, 0.9, 0.86], [1.02, 0.97, 0.9], [0.88, 0.84, 0.78]],
    roof: [[1, 1, 1], [0.86, 0.84, 0.82], [1.06, 1.0, 0.94], [0.9, 0.86, 0.8]],
    damp: 0.2, moss: 0.02,
  },
  wear: 0.18,
});
