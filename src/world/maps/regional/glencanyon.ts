// src/world/maps/regional/glencanyon.ts — the Glen Canyon kit (Skybridge Chasm: Glen Canyon Dam above Lake Powell and
// Page, Arizona, the Bureau of Reclamation's construction town of 1957). The dam's works in the Bureau's 1960s manner:
// the powerhouse, a board-formed concrete hall between pilasters with its tall slot windows, the penstocks coming down
// to it from the anchor block, a steel catwalk truss broken between them; the control building of four storeys of
// concrete and ribbon glazing under a penthouse and a radio mast; the surge tower; the switchyard's lattice dead-end
// towers over the transformers; the transformer yards; the microwave relay tower; the gate-hoist houses; the penstock
// runs on their concrete saddles; the visitor centre with its round overlook, or the town's school; the Bureau's field
// offices of painted block and its steel warehouses; and Page itself: ranch houses of stucco and block under shallow
// shingled gables with their carports, the fire station with its hose tower, the water tower on its legs.
import { PartSink, faceBox, facePanel, normalize3, pick, rgb, shade, type EmitOptions, type RegionalBucket, type Rgb, type Vec3 } from './geometry.ts';
import { buildHouse, holedBox, recordBody, recordShaft, windowRhythm, type HouseDialect, type Opening } from './house.ts';
import { doorUnit, rollerDoor, windowUnit, type WindowStyle } from './openings.ts';
import { ruinHouse, type RuinHead } from './ruinGrammar.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';
import { sheetHall } from './hall.ts';
import { latticeFrame } from './lattice.ts';
import { yardPad } from './glencanyonPads.ts';

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
  // (the connectivity sweep: the beam ran through its columns between their girts, touching neither) girts across each
  // column's two faces at the chords' levels carry the beam
  for (const z of [z0, z1]) for (const y of [h - 0.15, h - 0.65]) for (const sz of [-1, 1]) {
    sink.member('structureMetal', [x - c, y, z + sz * c], [x + c, y, z + sz * c], 0.07, 0.07, [0, 1, 0], { colour, decor: true, exposed: true }, 0);
  }
  for (let k = 0; k < 3; k++) {
    const z = z0 + (z1 - z0) * (k + 0.5) / 3;
    // the string: a stack of discs on its rod hung from the bottom chord, the clamp and the bus tube along x (its discs
    // six-sided, Skybridge round 6: the switchyard inside the kit's 12,000-triangle budget with round 4's bushings)
    sink.member('structureMetal', [x, h - 0.65, z], [x, h - 1.96, z], 0.03, 0.03, [1, 0, 0], { colour: IRON, decor: true, exposed: true }, 0);
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
  // (props census #9) the tall slot windows cut through the hall's front between the pilasters, the glazing and its
  // steel transoms at the back of the cuts (they were laid on a solid span)
  const n = Math.max(1, Math.round(W / 4.4)), sw = (W - 0.7) / n - 1.5, rev = 0.36;
  const slots = sw > 0.6 ? Array.from({ length: n }, (_, k) => -W / 2 + 0.35 + (W - 0.7) * (k + 0.5) / n) : [];
  const front = holedBox(sink, CONCRETE, -W / 2, zb, W / 2, zf, -0.5, H, { front: slots.map((um) => ({ u0: um - sw / 2, u1: um + sw / 2, y0: 3.4, y1: H - 2.6 })) },
    0.42, rev).front;
  // (props census #9, E13) the hall in its storey bands for the damage reading
  recordBody(sink, 0, (zb + zf) / 2, W, hallD, H + 0.6, CONCRETE, false, true);
  for (let k = 0; k <= n; k++) {
    const u = -W / 2 + 0.35 + (W - 0.7) * k / n;
    faceBox(sink, CONCRETE, front, u, H / 2 + 0.1, 0.2, 0.7, H + 0.2, 0.4, { decor: true });
    if (k < n && slots.length) {
      const um = slots[k];
      faceBox(sink, 'glass', front, um, 3.4 + (H - 6.0) / 2, -rev + 0.02, sw, H - 6.0, 0.02, { decor: true });
      for (let m = 1; m < 6; m++) faceBox(sink, 'structureMetal', front, um, 3.4 + (H - 6.0) * m / 6, -rev + 0.05, sw, 0.07, 0.03, { colour: STEEL_GREY, decor: true, fine: true });
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
  recordBody(sink, 0, (ab0 + ab1) / 2, W - 3, ab1 - ab0, abH, CONCRETE);
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
    // (the connectivity sweep: the top chords hung 1.3 m over the bottom ones with nothing between them) the web: a
    // post at every panel point, the broken ends' included, and a diagonal down each panel, inside the chords' depth
    const n = Math.max(2, Math.round(Math.hypot(zb2 - za, yb - ya) / 1.6));
    for (const dx of [-0.9, 0.9]) {
      const xl = W * 0.38 + dx;
      for (let k = 0; k <= n; k++) {
        const t = k / n, z = za + (zb2 - za) * t, y = ya + (yb - ya) * t;
        sink.member('structureMetal', [xl + 0.02, y, z], [xl + 0.02, y + 1.45, z], 0.08, 0.08, [1, 0, 0], { colour: STEEL_GREY, decor: true, exposed: true }, 0);
        if (k === n) continue;
        const z2 = za + (zb2 - za) * (k + 1) / n, y2 = ya + (yb - ya) * (k + 1) / n;
        sink.member('structureMetal', [xl + 0.03, y + 0.04, z], [xl + 0.03, y2 + 1.38, z2], 0.06, 0.06, [1, 0, 0], { colour: STEEL_GREY, decor: true, exposed: true, fine: true }, 0);
      }
    }
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
    // (props census #9, E13) the drum on its base a shaft in bands for the damage reading
    recordShaft(sink, 0, 0, 2 * R, 4.1 + H + 2.2, 'structureMetal', true);
    // (the integrity check, 2026-10-12: the stiffener rings stood 6 cm off the shell on nothing, open top and bottom) each
    // ring closed against the shell: its top and bottom ledges reach in to the drum
    for (let y = 4.1 + 3.8; y < 4.1 + H - 1; y += 3.8) sink.cylinder('structureMetal', [0, y, 0], 'y', 0.22, R + 0.06, 24, { colour: shade(paint, 0.82), decor: true }, R + 0.06);
    sink.cylinder('structureMetal', [0, 4.1 + H, 0], 'y', 2.2, R + 0.15, 24, { colour: shade(paint, 0.92) }, 0.9);
    sink.cylinder('structureMetal', [0, 6.3 + H, 0], 'y', 1.0, 0.7, 8, { colour: IRON, decor: true }, 0.7);
    // the ladder and its cage up the east side (the connectivity sweep: the stiles stood a third of a metre off the drum
    // and the "rungs" were loose slats between them): the stiles from the base's top on standoff brackets to the shell
    // every 3 m, rungs between them, the cage's hoops from 2.4 m up joined by its straps, the stiles' grab ends over
    // the drum's head
    const xs = R + 0.32, top = 4.1 + H, cage = xs + 0.72;
    for (const dz of [-0.24, 0.24]) {
      sink.member('structureMetal', [xs, 4.1, dz], [xs, top + 1.1, dz], 0.05, 0.06, [1, 0, 0], { colour: IRON, decor: true, exposed: true }, 0);
      for (let y = 5.0; y < top; y += 3.0) sink.member('structureMetal', [R - 0.12, y, dz], [xs + 0.03, y, dz], 0.05, 0.05, [0, 1, 0], { colour: IRON, decor: true, exposed: true }, 0);
    }
    for (let y = 4.4; y < top + 0.9; y += 0.3) sink.member('structureMetal', [xs + 0.01, y, -0.25], [xs + 0.01, y, 0.25], 0.025, 0.025, [1, 0, 0], { colour: IRON, decor: true, exposed: true, fine: true }, 0);
    let lastHoop = 6.5;
    for (let y = 6.5; y <= top + 1.0; y += 1.5) {
      lastHoop = y;
      for (const sz of [-1, 1]) sink.member('structureMetal', [xs + 0.03, y, sz * 0.24], [cage, y, sz * 0.36], 0.012, 0.05, [0, 1, 0], { colour: IRON, decor: true, exposed: true }, 0);
      sink.member('structureMetal', [cage, y, -0.36], [cage, y, 0.36], 0.012, 0.05, [0, 1, 0], { colour: IRON, decor: true, exposed: true }, 0);
    }
    for (const z of [-0.34, 0, 0.34]) sink.member('structureMetal', [cage - 0.006, 6.5, z], [cage - 0.006, lastHoop + 0.05, z], 0.05, 0.012, [1, 0, 0], { colour: IRON, decor: true, exposed: true, fine: true }, 0);
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
    yardPad(sink, 'structureMetal', W, D, { colour: rgb(0x8e877a), decor: true }); // (looks r2 b-east: glencanyonPads.ts)
    const steel = GALV, h = 20 + rng() * 4;
    for (const sx of [-1, 1]) latticeTower(sink, sx * W * 0.28, -D / 2 + 2.6, 1.6, 0.6, h, steel);
    // the cross-arm between the towers and the line's insulator strings
    sink.member('structureMetal', [-W * 0.28, h - 0.4, -D / 2 + 2.6], [W * 0.28, h - 0.4, -D / 2 + 2.6], 0.5, 0.7, [0, 1, 0], { colour: steel, decor: true, exposed: true }, 0);
    // (kitConnectivity: the strings hung 10 cm under the arm, whose depth stands up from h - 0.4, and the outer two dropped
    // half a metre off their bus frames: each string now hangs from the arm over its frame and drops onto its beam's top chord)
    for (let k = 0; k < 3; k++) {
      const x = (k - 1) * W * 0.22;
      insulatorString(sink, [x, h - 0.38, -D / 2 + 2.6], 2.1);
      sink.member('structureMetal', [x, h - 2.48, -D / 2 + 2.6], [x, 9.47, -D / 2 + 7.6], 0.05, 0.05, [1, 0, 0], { colour: IRON, decor: true, exposed: true, fine: true }, 0);
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
    yardPad(sink, CONCRETE, W, D, { decor: true }); // (looks r2 b-east: glencanyonPads.ts)
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
    // the whip on the head platform (the connectivity sweep: it stood 0.2 m over the platform)
    sink.cylinder('structureMetal', [tx, H - 0.2, tz], 'y', 3.2, 0.06, 6, { colour: IRON, decor: true }, 0.03);
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
      // (props census #9) the glass wall to the view under the slab cut through the hall's front, the glazing and its
      // mullions at the back of the cut (they were laid on a solid span)
      const rev = 0.34;
      const f = holedBox(sink, CONCRETE, -W / 2, -D / 2, W / 2, D / 2 - 2.0, -0.5, H, { front: [{ u0: -(W - 1.0) / 2, u1: (W - 1.0) / 2, y0: 0.3, y1: H - 0.3 }] },
        0.4, rev).front;
      facePanel(sink, 'glass', f, 0, H / 2, -rev + 0.02, W - 1.0, H - 0.6, { decor: true });
      for (let u = -W / 2 + 0.5; u <= W / 2 - 0.5; u += 2.2) faceBox(sink, 'structureMetal', f, u, H / 2, -rev + 0.08, 0.12, H - 0.6, 0.1, { colour: rgb(0x4a4c4e), decor: true, fine: true });
      sink.span(CONCRETE, -W / 2 - 0.3, H, -D / 2 - 0.3, W / 2 + 1.5, H + 0.8, D / 2 + 1.0);
      faceBox(sink, 'structureWood', { origin: [0, 0, D / 2 + 1.0], u: [1, 0, 0], out: [0, 0, 1], width: W }, 0, H + 0.4, 0.015, W * 0.5, 0.3, 0.02, { colour: rgb(0x2e3a44), decor: true });
    });
    // the overlook drum at the east end and its roof ring
    const dr = Math.max(2.4, Math.min(4.2, (RR.x1 - (x0 + W / 2)) / 2 + 0.3)), dx = RR.x1 - dr - 0.35, dz = z0;
    // (props census #9) its band of windows a ribbon set back round the drum (ten panes were laid on its wall): the drum
    // below and above it, the glass 0.3 m in with the room's dark behind it, ten piers between the lights
    sink.cylinder(CONCRETE, [dx, -0.5, dz], 'y', 5.3, dr, 20, {});
    sink.cylinder(CONCRETE, [dx, 6.4, dz], 'y', 1.1, dr, 20, {});
    sink.cylinder('glass', [dx, 4.8, dz], 'y', 1.6, dr - 0.3, 20, { decor: true }, dr - 0.3, false);
    sink.cylinder('dark', [dx, 4.8, dz], 'y', 1.6, dr - 0.34, 20, { decor: true }, dr - 0.34, false);
    for (let k = 0; k < 10; k++) {
      const a = (k + 0.5) / 10 * Math.PI * 2;
      faceBox(sink, CONCRETE, { origin: [dx + Math.cos(a) * dr, 0, dz + Math.sin(a) * dr], u: [Math.sin(a), 0, -Math.cos(a)], out: [Math.cos(a), 0, Math.sin(a)], width: 2 },
        0, 5.6, -0.17, 0.32, 1.6, 0.34, {});
    }
    sink.cylinder(CONCRETE, [dx, 7.5, dz], 'y', 0.6, dr + 0.4, 20, { decor: true }, dr + 0.4);
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
  const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
  // the crane bay fills the old factory's reach (its bounds)
  const R = reach(ctx), W = Math.max(6, R.W - 0.8), D = Math.max(8, R.D - 0.8), H = 12 + rng() * 2;
  // (props census #13, lane B 2026-10-14; the judges: "a concrete span box, its bay doors dark plates with a sheet over
  // them, the clerestory glass laid on") the house grammar: the bay's concrete walls on their plinth, the two road
  // doors cut through the front with their roller curtains part raised in the reveals, the clerestory's lights cut along
  // both sides between the expressed columns, the flat roof behind its parapet; the monorail out over the front
  sink.placed(0, R.cx, 0, R.cz, () => {
    const openings: Opening[] = [];
    for (const u of [-W * 0.22, W * 0.22]) openings.push({ face: 'front', storey: 0, kind: 'gate', u, w: Math.min(3.6, W * 0.4), y0: 0, h: 6.0 });
    for (const face of ['right', 'left'] as const) for (let u = -D / 2 + 1.6; u < D / 2 - 1.2; u += 2.8) openings.push({ face, storey: 0, kind: 'window', u, w: 2.0, y0: H - 3.4, h: 1.6 });
    const dialect: HouseDialect = {
      window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { frame: STEEL_GREY, frameWidth: 0.06, frameOut: 0.03, bars: 'six', surround: null, sill: null, shutters: null }, look, 0.2),
      door: (s, face, o, y0) => rollerDoor(s, face, o.u, y0 + o.y0, o.w, o.h, 0.2 + look() * 0.5, STEEL_GREY, shade(STEEL_GREY, 0.7), mobile),
    };
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.3, out: 0.05, bucket: CONCRETE }, storeys: [{ h: H - 0.3, wall: CONCRETE }],
      roof: { kind: 'flat', pitchDeg: 0, eave: 0.2, verge: 0.2, thickness: 0.3, bucket: CONCRETE, parapet: 0.6 }, gableBucket: CONCRETE,
      openings, chimneys: [], gutters: null, verge: null, reveal: 0.3, spall: null,
    }, dialect);
    // the expressed frame: the columns between the lights, the band of the crane girder's line
    for (const name of ['right', 'left'] as const) {
      const f = frame.faces[name];
      for (let u = -D / 2; u <= D / 2 + 1e-6; u += 2.8) faceBox(sink, CONCRETE, f, Math.max(-D / 2 + 0.25, Math.min(D / 2 - 0.25, u)), (H - 0.3) / 2 + 0.3, 0.15, 0.5, H - 0.3, 0.3, { decor: true }, 'caps');
    }
    sink.band(CONCRETE, -W / 2 - 0.2, H - 3.9, -D / 2 - 0.2, W / 2 + 0.2, H - 3.6, D / 2 + 0.2, { decor: true });
    sink.span('structureMetal', -0.2, H - 1.6, D / 2 - 1.0, 0.2, H - 1.1, D / 2 + 2.4, { colour: rgb(0xc9a24a), decor: true });
    sink.span('structureMetal', -0.5, H - 2.4, D / 2 + 1.7, 0.5, H - 1.6, D / 2 + 2.2, { colour: rgb(0xc9a24a), decor: true });
  });
  return sink.finish();
};

/**
 * A penstock run (a gantry plot). Props census #3 (lane B 2026-10-14; the judges: "a capped tube on four blocks that
 * run up into it, a block at one end, the far end closed in the air"): the welded steel pipe between its anchor block
 * (stepped, the pipe through a flanged collar) and the thrust block where it dives under the ground, carried on ring
 * girders whose legs stand on rocker plates on low concrete piers; its girth seams, the expansion joint's sleeve and
 * flanges, the manway and the air valve; the catwalk along its side on brackets off the girders, a grating deck with
 * its toe board and a two-rail handrail.
 */
const penstockRun: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  // the run fills the old gantry's reach (its bounds, which stand off the plot's centre)
  const R = reach(ctx), L = Math.max(8, R.W - 0.4), r = Math.max(0.8, Math.min(2.0, R.D / 2 - 0.5)), y = r + 1.0;
  const paint = pick(rng, PENSTOCK), dark = shade(paint, 0.8);
  sink.placed(0, R.cx, 0, R.cz, () => {
    const xa = -L / 2 + 3.6, xb = L / 2 - 1.8;
    pipe(sink, 'structureMetal', [xa - 0.3, y, 0], [xb + 0.3, y, 0], r, 20, { colour: paint });
    // the anchor block, stepped down toward the run, the pipe through its flanged collar
    sink.span(CONCRETE, -L / 2, -0.4, -r - 0.6, -L / 2 + 2.2, y + r + 0.8, r + 0.6);
    sink.span(CONCRETE, -L / 2 + 2.2, -0.4, -r - 0.5, xa, y + r * 0.35, r + 0.5);
    sink.span(CONCRETE, -L / 2 + 2.1, y + r + 0.8, -r - 0.7, -L / 2 + 2.3, y + r + 0.9, r + 0.7, { decor: true, shade: 0.85 });
    pipe(sink, 'structureMetal', [xa, y, 0], [xa + 0.12, y, 0], r + 0.16, 20, { colour: dark, decor: true });
    // the thrust block at the far end, the pipe diving through it under the ground
    sink.span(CONCRETE, xb, -0.4, -r - 0.5, L / 2, y + r + 0.4, r + 0.5);
    sink.span(CONCRETE, xb - 0.1, y + r + 0.4, -r - 0.6, L / 2 + 0.1, y + r + 0.5, r + 0.6, { decor: true, shade: 0.85 });
    pipe(sink, 'structureMetal', [xb - 0.12, y, 0], [xb, y, 0], r + 0.16, 20, { colour: dark, decor: true });
    // the ring girders on their piers: the ring, its two legs to the rocker plates, the pier under them
    const py = y - r - 0.3, girders: number[] = [];
    for (let x = xa + 1.4; x < xb - 1.0; x += 4.6) girders.push(x);
    for (const x of girders) {
      sink.span(CONCRETE, x - 0.6, -0.4, -r - 0.25, x + 0.6, py, r + 0.25);
      pipe(sink, 'structureMetal', [x - 0.15, y, 0], [x + 0.15, y, 0], r + 0.2, 20, { colour: dark, decor: true });
      for (const sz of [-1, 1]) {
        sink.span('structureMetal', x - 0.3, py, sz * r * 0.92 - 0.2, x + 0.3, py + 0.1, sz * r * 0.92 + 0.2, { colour: IRON, decor: true });
        sink.member('structureMetal', [x, py + 0.1, sz * r * 0.92], [x, y - r * 0.35, sz * (r + 0.12)], 0.22, 0.3, [0, 0, sz], { colour: dark, decor: true, exposed: true }, 0);
      }
    }
    sink.dressing(ctx.tier === 'mobile', () => {
      // the girth seams, the expansion joint's sleeve and its flanges
      for (let x = xa + 2.4; x < xb - 0.3; x += 2.4) pipe(sink, 'structureMetal', [x - 0.02, y, 0], [x + 0.02, y, 0], r + 0.012, 20, { colour: shade(paint, 0.9), decor: true, fine: true });
      const xj = girders.length > 1 ? (girders[0] + girders[1]) / 2 : (xa + xb) / 2;
      pipe(sink, 'structureMetal', [xj - 0.35, y, 0], [xj + 0.35, y, 0], r + 0.07, 20, { colour: shade(paint, 0.88), decor: true });
      for (const dx of [-0.38, 0.38]) pipe(sink, 'structureMetal', [xj + dx - 0.04, y, 0], [xj + dx + 0.04, y, 0], r + 0.15, 20, { colour: dark, decor: true });
      // the manway's flanged neck and cover, the air valve near the anchor
      sink.cylinder('structureMetal', [L * 0.15, y + r - 0.1, 0], 'y', 0.42, 0.42, 10, { colour: shade(paint, 0.9), decor: true });
      sink.cylinder('structureMetal', [L * 0.15, y + r + 0.32, 0], 'y', 0.06, 0.52, 10, { colour: dark, decor: true });
      sink.cylinder('structureMetal', [xa + 0.9, y + r - 0.1, 0], 'y', 0.5, 0.12, 8, { colour: IRON, decor: true });
      sink.cylinder('structureMetal', [xa + 0.9, y + r + 0.4, 0], 'y', 0.18, 0.2, 8, { colour: IRON, decor: true });
    });
    // the catwalk along the +z side (on most runs): its deck on brackets off the girders, toe board, posts and rails
    if (look() < 0.7) {
      const dy = y - 0.35, z0 = r + 0.25, z1 = r + 0.95, x0 = xa + 0.4, x1 = xb - 0.3;
      sink.span('structureMetal', x0, dy - 0.05, z0, x1, dy, z1, { colour: shade(GALV, 0.8), decor: true });
      sink.dressing(ctx.tier === 'mobile', () => {
        for (let x = x0 + 0.3; x < x1; x += 0.3) sink.span('structureMetal', x - 0.01, dy, z0, x + 0.01, dy + 0.012, z1, { colour: shade(GALV, 0.6), decor: true, fine: true });
      });
      sink.span('structureMetal', x0, dy, z1 - 0.02, x1, dy + 0.12, z1, { colour: GALV, decor: true });
      for (const x of girders) sink.member('structureMetal', [x, y - 0.6, r + 0.15], [x, dy - 0.05, z1 - 0.1], 0.08, 0.08, [0, 0, 1], { colour: IRON, decor: true, exposed: true }, 0);
      for (let x = x0 + 0.05; x <= x1; x += Math.max(1.8, (x1 - x0) / Math.max(1, Math.round((x1 - x0) / 2.4)))) {
        sink.cylinder('structureMetal', [x, dy, z1 - 0.05], 'y', 1.05, 0.03, 5, { colour: GALV, decor: true });
      }
      for (const h of [0.55, 1.05]) sink.member('structureMetal', [x0, dy + h, z1 - 0.05], [x1, dy + h, z1 - 0.05], 0.04, 0.04, [0, 1, 0], { colour: GALV, decor: true, exposed: true }, 0);
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
    // (props census #13, lane B 2026-10-15; the judges: "no trim of any kind ... the entrance canopy a slab on two sticks,
    // the rooftop units blank boxes") each window's precast sill and, on the long fronts, its aluminium sunshade; the
    // parapet's metal coping; the downpipes from their scuppers; the canopy's fascia, its beam on the posts and their base
    // plates, the Bureau's name on the fascia; the rooftop units on their curbs with their louvres and fans
    const alu = { colour: ALUMINIUM, decor: true };
    for (const o of openings) {
      if (o.kind !== 'window') continue;
      const f = frame.faces[o.face], y = frame.bodies[o.storey].y0 + o.y0;
      faceBox(sink, CONCRETE, f, o.u, y - 0.05, 0.04, o.w + 0.2, 0.1, 0.12, { decor: true });
      if (o.face === 'front' || o.face === 'back') faceBox(sink, 'structureMetal', f, o.u, y + o.h + 0.2, 0.25, o.w + 0.4, 0.06, 0.5, alu);
    }
    const ex = W / 2 + 0.45, ez = D / 2 + 0.45, ctop = frame.eaveY + 0.25 + 0.3;
    for (const sz of [-1, 1]) sink.span('structureMetal', -ex - 0.04, ctop, sz > 0 ? ez - 0.26 : -ez - 0.04, ex + 0.04, ctop + 0.06, sz > 0 ? ez + 0.04 : -ez + 0.26, alu);
    for (const sx of [-1, 1]) sink.span('structureMetal', sx > 0 ? ex - 0.26 : -ex - 0.04, ctop, -ez + 0.26, sx > 0 ? ex + 0.04 : -ex + 0.26, ctop + 0.06, ez - 0.26, alu);
    for (const sx of [-1, 1]) {
      const x = sx * (W / 2 + 0.07), z = -D / 2 + 0.5;
      sink.cylinder('structureMetal', [x, 0.3, z], 'y', frame.eaveY - 0.3, 0.06, 6, { colour: STEEL_GREY, decor: true });
      sink.span('structureMetal', x - 0.12, frame.eaveY - 0.1, z - 0.14, x + 0.12, frame.eaveY + 0.2, z + 0.14, { colour: STEEL_GREY, decor: true });
    }
    sink.span(CONCRETE, -2.4, 2.9, D / 2, 2.4, 3.15, D / 2 + 2.6, { decor: true, shadow: true });
    sink.span('structureMetal', -2.45, 2.82, D / 2 + 2.6, 2.45, 3.22, D / 2 + 2.66, alu);
    for (const sx of [-1, 1]) sink.span('structureMetal', sx > 0 ? 2.4 : -2.46, 2.82, D / 2, sx > 0 ? 2.46 : -2.4, 3.22, D / 2 + 2.6, alu);
    sink.span('structureMetal', -2.25, 2.72, D / 2 + 2.22, 2.25, 2.9, D / 2 + 2.38, { colour: STEEL_GREY });
    for (const s of [-1, 1]) {
      sink.cylinder('structureMetal', [s * 2.1, 0, D / 2 + 2.3], 'y', 2.72, 0.07, 8, { colour: STEEL_GREY });
      sink.span('structureMetal', s * 2.1 - 0.15, 0, D / 2 + 2.15, s * 2.1 + 0.15, 0.04, D / 2 + 2.45, { colour: STEEL_GREY, decor: true });
    }
    // the name board on the fascia, its aluminium letters standing on it
    sink.span('structureMetal', -2.2, 2.86, D / 2 + 2.66, 2.2, 3.18, D / 2 + 2.78, { colour: rgb(0x2a3a4a), decor: true });
    const name = 'BUREAU OF RECLAMATION', pitch = 4.2 / name.length;
    for (let k = 0; k < name.length; k++) {
      if (name[k] === ' ') continue;
      sink.span('structureMetal', -2.1 + pitch * (k + 0.2), 2.93, D / 2 + 2.78, -2.1 + pitch * (k + 0.8), 3.11, D / 2 + 2.8, { colour: ALUMINIUM, decor: true, fine: true });
    }
    const top = frame.eaveY + 0.25;
    for (const [x, z] of [[-W * 0.25, 0], [W * 0.2, -D * 0.2]] as const) {
      sink.span(CONCRETE, x - 0.9, top, z - 0.7, x + 0.9, top + 0.15, z + 0.7, { decor: true });
      sink.span('structureMetal', x - 0.8, top + 0.15, z - 0.6, x + 0.8, top + 1.25, z + 0.6, { colour: rgb(0xb8b8b0), decor: true });
      for (let y = top + 0.3; y < top + 1.1; y += 0.12) for (const sz of [-1, 1]) {
        sink.span('structureMetal', x - 0.7, y, sz > 0 ? z + 0.6 : z - 0.62, x + 0.7, y + 0.03, sz > 0 ? z + 0.62 : z - 0.6, { colour: rgb(0x8a8a84), decor: true, fine: true });
      }
      sink.cylinder('structureMetal', [x + 0.35, top + 1.25, z], 'y', 0.08, 0.38, 10, { colour: rgb(0x4a4a48), decor: true });
    }
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
  // (props census #4, lane B 2026-10-14; the judges: "188 triangles: a span box, its roller doors a dark plate and a sheet
  // plate laid on it, a glass strip") the shared sheet hall (hall.ts): the Bureau's profiled steel on its slab, two roller
  // doors in cut openings under their drums onto the store's floor and frames, the lights under the eaves, a side door,
  // gutters, roof lights and the ridge vent; the dock along the front
  sink.placed(0, R.cx, 0, R.z0 + 0.2 + D / 2, () => {
    const dw = Math.min(3.8, W * 0.36);
    sheetHall(sink, { w: W, d: D, eave: H + 0.85, pitchDeg: 8, kerb: 1.1, livery, doorLivery: STEEL_GREY, trim: shade(livery, 0.7), doors: 'roller', doorW: dw, doorH: 4.4,
      open: 0.25 + rng() * 0.5, doorAt: [-W * 0.24, W * 0.24], backDoor: W * 0.3, sideDoor: null, clerestory: true, roofLights: true, ridgeVent: true, gutters: true,
      mobile: ctx.tier === 'mobile', roof: { bucket: 'structureMetal', colour: shade(livery, 1.02) } }, ctx.variant);
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
    // the carport (props census #3, lane B 2026-10-14; the judges: "a flat slab on two sticks"): its pad, three steel
    // posts along the outer edge to the fascia beam, the ledger on the house wall, the rafters across and the ribbed
    // sheet roof falling outward over them
    const x0 = W / 2, x1 = W / 2 + carport, sheet = pick(look, CAR_ROOF), hi = 2.75, lo = 2.55;
    sink.span(CONCRETE, x0, -0.2, -D / 2 - 0.1, x1 + 0.1, 0.06, D / 2 + 0.4, { decor: true, shade: 0.92 });
    for (const z of [-D / 2 + 0.3, 0, D / 2 + 0.1]) sink.cylinder('structureMetal', [x1 - 0.15, 0.06, z], 'y', lo - 0.2, 0.05, 8, { colour: WHITE });
    sink.span('structureMetal', x1 - 0.22, lo - 0.2, -D / 2 - 0.1, x1 - 0.08, lo, D / 2 + 0.4, { colour: WHITE });
    sink.span('structureWood', x0, hi - 0.2, -D / 2 - 0.1, x0 + 0.08, hi, D / 2 + 0.4, { colour: WHITE, decor: true });
    for (let z = -D / 2 + 0.2; z < D / 2 + 0.4; z += 1.2) sink.member('structureWood', [x0 + 0.08, hi - 0.1, z], [x1 - 0.08, lo - 0.1, z], 0.05, 0.14, [0, 1, 0], { colour: WHITE, decor: true }, 0);
    const slope = (hi - lo) / (x1 - x0);
    sink.quad('structureMetal', [x0, hi + 0.04, D / 2 + 0.45], [x1 + 0.1, lo - slope * 0.1 + 0.04, D / 2 + 0.45], [x1 + 0.1, lo - slope * 0.1 + 0.04, -D / 2 - 0.15], [x0, hi + 0.04, -D / 2 - 0.15], { colour: sheet, shadow: true });
    sink.quad('structureMetal', [x0, hi, -D / 2 - 0.15], [x1 + 0.1, lo - slope * 0.1, -D / 2 - 0.15], [x1 + 0.1, lo - slope * 0.1, D / 2 + 0.45], [x0, hi, D / 2 + 0.45], { colour: shade(sheet, 0.6), decor: true });
    for (let z = -D / 2; z < D / 2 + 0.4; z += 0.6) sink.member('structureMetal', [x0, hi + 0.06, z], [x1 + 0.1, lo - slope * 0.1 + 0.06, z], 0.03, 0.03, [0, 1, 0], { colour: shade(sheet, 0.9), decor: true, fine: true }, 0);
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
  // (props census #13, lane B 2026-10-14; the judges: "the apparatus doors dark plates with a red sheet laid over them")
  // the two apparatus bays cut through the front, their red doors in the reveals, part raised on one call in four
  const base = dialectOf(rng, ALU, rgb(0x8a2a22), 0.4, 'panel', ctx.variant);
  const dialect: HouseDialect = { ...base, door: (s, face, o, y0, fr) => (o.kind === 'gate'
    ? rollerDoor(s, face, o.u, y0 + o.y0, o.w, o.h, ctx.variant() < 0.25 ? 0.6 : 0, rgb(0xb8302a), GALV, ctx.tier === 'mobile')
    : base.door(s, face, o, y0, fr)) };
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.2, out: 0.05, bucket: CONCRETE }, storeys: [{ h: 5.0, wall: BLOCK }],
    roof: { kind: 'flat', pitchDeg: 0, eave: 0.3, verge: 0.3, thickness: 0.25, bucket: CONCRETE, parapet: 0.4 }, gableBucket: BLOCK,
    // (the side door toward the front: toward the back it stood inside the hose tower)
    openings: [{ face: 'right', storey: 0, kind: 'door', u: -D * 0.25, w: 0.95, y0: 0, h: 2.1 }, ...windowRhythm('left', 0, D, { w: 1.4, h: 1.0, sill: 1.4, spacing: 3.0, margin: 1.2 }),
      ...[-W * 0.24, W * 0.24].map((u): Opening => ({ face: 'front', storey: 0, kind: 'gate', u, w: Math.min(3.4, W * 0.4), y0: 0, h: 4.0 }))],
    chimneys: [], gutters: null, verge: null, reveal: 0.18,
    // the hose tower's corner: its faces are the walls there (they stood coplanar with the station's)
    abutted: [{ face: 'right', u0: D / 2 - 3.2, u1: D / 2 }, { face: 'back', u0: -W / 2, u1: -W / 2 + 3.2 }],
  }, dialect);
  const f = frame.faces.front;
  faceBox(sink, 'structureWood', f, 0, 4.55, 0.02, W * 0.6, 0.35, 0.03, { colour: WHITE, decor: true });
  // the hose tower in a back corner, a body of its own (props census #13, lane B 2026-10-15: a solid block that fell with
  // the bay): its drying stage's openings cut through all four faces under the cap, the louvres across them with their
  // ends in the jambs, the hoses' dark behind; and the siren on its pole
  const louvred: HouseDialect = {
    window: (s, face, o, y0) => {
      for (let y = y0 + o.y0 + 0.1; y < y0 + o.y0 + o.h - 0.1; y += 0.28) {
        faceBox(s, 'structureMetal', face, o.u, y, -0.12, o.w + 0.08, 0.05, 0.14, { colour: STEEL_GREY, decor: true });
      }
    },
    door: () => undefined,
  };
  sink.placed(0, W / 2 - 1.6, 0, -D / 2 + 1.6, () => buildHouse(sink, {
    w: 3.2, d: 3.2, plinth: { h: 0.2, out: 0.05, bucket: CONCRETE }, storeys: [{ h: 12.6, wall: BLOCK }],
    roof: { kind: 'flat', pitchDeg: 0, eave: 0.2, verge: 0.2, thickness: 0.4, bucket: CONCRETE },
    openings: (['front', 'right', 'back', 'left'] as const).map((face): Opening => ({ face, storey: 0, kind: 'loft', u: 0, w: 1.6, y0: 10.0, h: 1.8 })),
    chimneys: [], gutters: null, verge: null, reveal: 0.22, rafters: null, spall: null,
  }, louvred));
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
  const lb = P / 2 - 0.2, lt = tankR * 0.7, mobile = ctx.tier === 'mobile';
  // (props census #3, lane B 2026-10-14; the judges: "no diagonal tension rods, so the frame reads rickety; the legs
  // plunge to -0.4 m with no anchor piers; the tank shell has no seams, roof hatch or vent") the legs on concrete anchor
  // piers, girts and X tension rods in every panel (lattice.ts); the tank's seams, its roof hatch and vent finial; it
  // falls as its frame with the tank as its crown
  latticeFrame(sink, { foot: lb, head: lt, y0: 0.4, y1: legH, size: 0.2, girt: 0.09, brace: 0.035, panels: 3, bucket: 'structureMetal',
    colour: shade(paint, 0.85), pad: { bucket: 'stone', size: 0.75, top: 0.4 }, mobile },
    { x0: -tankR - 0.5, x1: tankR + 0.5, y0: legH, y1: legH + 0.4 + tankH + 1.0, z0: -tankR - 0.5, z1: tankR + 0.5, bucket: 'structureMetal', tint: paint });
  sink.cylinder('structureMetal', [0, legH, 0], 'y', 0.4, tankR * 0.7, 16, { colour: shade(paint, 0.9) }, tankR);
  sink.cylinder('structureMetal', [0, legH + 0.4, 0], 'y', tankH, tankR, 20, { colour: paint });
  sink.cylinder('structureMetal', [0, legH + 0.4 + tankH, 0], 'y', 1.0, tankR + 0.1, 20, { colour: shade(paint, 0.92) }, 0.15);
  sink.cylinder('structureMetal', [0, legH + 0.36, 0], 'y', 0.05, tankR + 0.5, 20, { colour: IRON, decor: true });
  // the town's name: a dark band round the tank's upper third
  sink.cylinder('structureMetal', [0, legH + 2.2, 0], 'y', 0.55, tankR + 0.012, 20, { colour: rgb(0x2f4f6a), decor: true }, tankR + 0.012, false);
  // (the connectivity sweep: the tank stood a third of a metre over its legs' heads) each leg runs on up its own line
  // onto the tank's shell, a metre past the bowl, as the columns of an elevated tank are welded to it
  const legRise = (legH + 1.4 - 0.4) / (legH - 0.4);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const at = (t: number): Vec3 => [sx * (lb + (lt - lb) * t), 0.4 + (legH - 0.4) * t, sz * (lb + (lt - lb) * t)];
    sink.member('structureMetal', at(0.97), at(legRise), 0.2, 0.2, [sx, 0, 0], { colour: shade(paint, 0.85), decor: true, exposed: true }, 0);
  }
  // the tank's seams, its roof hatch and the vent finial at the apex
  sink.dressing(mobile, () => {
    for (const y of [legH + 0.4 + tankH / 3, legH + 0.4 + 2 * tankH / 3]) sink.cylinder('structureMetal', [0, y, 0], 'y', 0.035, tankR + 0.01, 20, { colour: shade(paint, 0.82), decor: true, fine: true }, tankR + 0.01, false);
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4;
      sink.span('structureMetal', Math.cos(a) * (tankR + 0.005) - 0.015, legH + 0.4, Math.sin(a) * (tankR + 0.005) - 0.015, Math.cos(a) * (tankR + 0.005) + 0.015, legH + 0.4 + tankH, Math.sin(a) * (tankR + 0.005) + 0.015,
        { colour: shade(paint, 0.85), decor: true, fine: true });
    }
  });
  sink.span('structureMetal', tankR * 0.45 - 0.3, legH + 0.4 + tankH + 0.5, -0.3, tankR * 0.45 + 0.3, legH + 0.4 + tankH + 0.68, 0.3, { colour: shade(paint, 0.75), decor: true });
  sink.cylinder('structureMetal', [0, legH + 0.4 + tankH + 0.95, 0], 'y', 0.45, 0.12, 8, { colour: IRON, decor: true }, 0.12, true);
  sink.cylinder('structureMetal', [0, legH + 0.4 + tankH + 1.4, 0], 'y', 0.25, 0.28, 8, { colour: IRON, decor: true }, 0.04, true);
  // the riser up the middle into the bowl, the balcony's rail on its posts, and the ladder up the east side from the
  // ground to the balcony, braced to the legs' girts
  sink.cylinder('structureMetal', [0, -0.2, 0], 'y', legH + 0.3, 0.32, 10, { colour: shade(paint, 0.8), decor: true });
  const railR = tankR + 0.45;
  for (let k = 0; k < 16; k++) {
    const a = (k + 0.5) / 16 * Math.PI * 2;
    sink.cylinder('structureMetal', [Math.cos(a) * railR, legH + 0.4, Math.sin(a) * railR], 'y', 1.02, 0.025, 5, { colour: IRON, decor: true });
  }
  sink.cylinder('structureMetal', [0, legH + 1.38, 0], 'y', 0.05, railR + 0.02, 20, { colour: IRON, decor: true }, railR + 0.02, false);
  const lx = tankR + 0.2;
  for (const dz of [-0.22, 0.22]) {
    sink.member('structureMetal', [lx, 0, dz], [lx, legH + 0.38, dz], 0.05, 0.06, [1, 0, 0], { colour: IRON, decor: true, exposed: true }, 0);
    for (const y of [0.4 + (legH - 0.4) / 3, 0.4 + 2 * (legH - 0.4) / 3]) {
      const r = lb + (lt - lb) * (y - 0.4) / (legH - 0.4);
      sink.member('structureMetal', [r - 0.04, y, dz], [lx + 0.03, y, dz], 0.05, 0.05, [0, 1, 0], { colour: IRON, decor: true, exposed: true }, 0);
    }
  }
  for (let y = 0.3; y < legH + 0.3; y += 0.3) sink.member('structureMetal', [lx + 0.01, y, -0.23], [lx + 0.01, y, 0.23], 0.025, 0.025, [1, 0, 0], { colour: IRON, decor: true, exposed: true, fine: true }, 0);
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
  // (props census #7, lane B 2026-10-14; the judges: "block slices to random tops, a heap cone") the ruin grammar: the
  // ranch house's own block walls broken, its door and windows cut through, the chimney standing with its firebox, the
  // shingles down over the heaps, the rafters charred across them
  sink.placed(0, R.cx, 0, R.cz, () => {
    const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: -W * 0.18, w: 0.95, y0: 0, h: 2.05 },
      { face: 'front', storey: 0, kind: 'window', u: W * 0.2, w: Math.min(2.4, W * 0.35), y0: 0.8, h: 1.4 }];
    for (const face of ['right', 'left'] as const) openings.push({ face, storey: 0, kind: 'window', u: (rng() - 0.5) * 2, w: 1.1, y0: 1.0, h: 1.1 });
    const head = (): RuinHead => ({ a: 0.5 + rng() * 2.2, b: 0.5 + rng() * 2.2, at: rng(), dip: 0.3 + rng() * 0.4, ragged: 0.25 });
    ruinHouse(sink, {
      w: W, d: D, t, wall: BLOCK, plinth: { h: 0.3, out: 0.05, bucket: CONCRETE }, storeys: [2.55], openings,
      heads: { front: head(), right: head(), back: head(), left: head() }, stub: 0.4,
      lintel: { bucket: CONCRETE }, roof: { bucket: 'roof', piece: [0.9, 0.5, 0.03] }, timber: rgb(0x2e2925),
      chimney: { x: W * 0.2 + 0.3, z: -D * 0.2 + 0.3, w: 0.6, h: 4.2, bucket: BLOCK }, mobile: ctx.tier === 'mobile',
    }, rng, look);
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
    // (the facades lane, round 11; waves 319/320: the walls' procedural canvas read as "speckle", "sponge", "cork",
    // "camouflage noise": its 6 cm bumps shade as dots from the street, as Steinburg's did before round 8) the walls
    // painted as the region renders them (regionalSurfaces.ts paintLimeRender), every family under the kit's and the map's
    // tones
    render: { kind: 'limeRender', seed: 0x5e44 },
    tones: {
      // stucco in the town's pale colours, poured concrete a warm grey, painted concrete and block an off-white
      // (round 3, gauntlet wave 133: the poured concrete read "bright cream": sixty years of weather took it to a
      // middling buff-grey)
      plaster: (_h, s, l) => [0.09, Math.min(1, s * 0.6 + 0.12), Math.min(1, l * 1.1 + 0.12)],
      plaster2: (_h, s, l) => [0.08, Math.min(1, s * 0.18 + 0.02), Math.min(1, l * 0.88 + 0.07)],
      plaster3: (_h, s, l) => [0.11, Math.min(1, s * 0.25), Math.min(1, l * 1.2 + 0.16)],
    },
    // (Skybridge round 2: the dam's, the powerhouse's and the Bureau's concrete is poured; round 4, gauntlet waves 170-171,
    // "the board-form planks are still there": one pour, its lifts, ties, mottling and runoff, no boards)
    concrete: 'poured',
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
