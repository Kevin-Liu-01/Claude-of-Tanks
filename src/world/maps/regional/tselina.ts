// src/world/maps/regional/tselina.ts — the Virgin Lands kit (Tarkhan Steppe: a sovkhoz grain station on the Sary-Arka
// grain steppe of Akmola and Kustanai oblasts, ploughed from 1954 by the tselina campaign). The built world of the
// campaign's state farms, put up to standard designs on open steppe: the slip-formed concrete grain elevator by the rail
// siding (a bank of silos under the top gallery, the working tower with its head house, the drive-through intake), the
// conveyor gallery up to the wagon bin; the machine-tractor station's brick garages behind steel gates and its open
// implement sheds, the repair shop under a glazed roof monitor, the long grain stores; the settlers' houses — whitewashed
// saman (adobe) or white silicate brick on a brick plinth under low asbestos-cement sheet roofs, the gable to the street,
// the glazed veranda at the back, window frames painted blue or green in white board surrounds — and the two-family
// brick houses of the estate's streets; the club with its portico, pediment and star; the Rozhnovsky water tower of welded
// steel; the boiler house's banded steel stack; the reed-thatched or sheet-roofed sheep barns (koshary) of the steppe
// herds; a shelled house.
import {
  PartSink, faceBox, facePanel, facePoint, normalize3, pick, rgb, shade,
  type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3,
} from './geometry.ts';
import { buildHouse, emitRoof, holedBox, roofGeometry, wallPolygon, windowRhythm, type HouseDialect, type Opening, type RoofGeometry, type RoofSpec } from './house.ts';
import { doorUnit, paneBucket, windowUnit, type WindowStyle } from './openings.ts';
import { bench, mound, woodpile } from './dressing.ts';
import { recordFrameHouse, recordLattice } from './lattice.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';

/** Window frames, shutters and doors: the settlements' blue, turquoise, green and sky blue, a brown. */
const PAINTS: readonly Rgb[] = [0x3f6f9a, 0x4a8a96, 0x4f7d4a, 0x6a9ab8, 0x2f5a7a, 0x6e4a36].map(rgb);
const WHITE = rgb(0xd8d4c8), PLANK = rgb(0x7a6048), CHAR = rgb(0x2a2622);
/** Roof sheet liveries: galvanised, weathered galvanised, green and oxide-red paint. */
const SHEET: readonly Rgb[] = [0x9aa0a0, 0x868c8c, 0x5a7a52, 0x7a3e30].map(rgb);
/** The MTS's steel gates and the machinery's paint. */
const GATE: readonly Rgb[] = [0x4f6e58, 0x5a6e7a, 0x6a7468].map(rgb);
const MACHINE: readonly Rgb[] = [0x5e6e46, 0x46607a, 0x8a3a2c, 0x7a7a6a].map(rgb);
const STEEL = rgb(0x7c8282), STEEL_DARK = rgb(0x464b4c), SILVER = rgb(0xaeb0aa), RED = rgb(0xa8382c);

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

interface TselinaState {
  rng: () => number;
  /** the look stream (ctx.variant): dressing choices that must not move the build stream */
  look: () => number;
  paint: Rgb;
  window: WindowStyle;
  litShare: number;
}

function stateFor(ctx: RegionalBuildContext): TselinaState {
  const rng = ctx.rng;
  const paint = pick(rng, PAINTS);
  const carved = rng() < 0.6;
  return {
    rng, look: ctx.variant, paint,
    window: {
      frame: rng() < 0.55 ? paint : WHITE, frameWidth: 0.07, frameOut: 0.05, bars: rng() < 0.75 ? 'cross' : 'six',
      // the board surround (nalichnik) with its deeper head, painted white or in the frame's colour
      surround: carved ? { bucket: 'structureWood', width: 0.11, out: 0.035, lintel: 0.2, colour: rng() < 0.65 ? WHITE : paint } : null,
      sill: { bucket: 'structureWood', out: 0.07, colour: WHITE },
      shutters: rng() < 0.28 ? { colour: shade(paint, 0.92), kind: 'plank', closed: 0.08 } : null,
    },
    litShare: 0.45,
  };
}

/** A steel gate in a cut opening: one leaf panel at the back of the reveal (structural: it closes the shell), its ribs. */
function steelGate(sink: PartSink, face: Face, u: number, y: number, w: number, h: number, colour: Rgb): void {
  const r = sink.recess, go = r > 0 ? -r + 0.04 : 0.02;
  faceBox(sink, 'structureMetal', face, u, y + h / 2, go, w + 0.02, h, 0.06, { colour });
  const rib = shade(colour, 0.78);
  faceBox(sink, 'structureMetal', face, u, y + h / 2, go + 0.045, 0.06, h - 0.1, 0.03, { colour: rib, decor: true });
  for (const t of [0.22, 0.78]) faceBox(sink, 'structureMetal', face, u, y + h * t, go + 0.045, w - 0.16, 0.07, 0.03, { colour: rib, decor: true, fine: true });
  for (const t of [0.25, 0.75]) faceBox(sink, 'structureMetal', face, u - w / 2 + w * t, y + h / 2, go + 0.045, 0.06, h - 0.16, 0.03, { colour: rib, decor: true, fine: true });
  // (the props census, 2026-10-14: no painted wickets) the wicket door in one leaf: its angle-iron frame standing out of
  // the leaf, its own sheet set back inside it, two hinge knuckles and a handle
  const wu = u - w / 4, ww = Math.min(0.8, w / 2 - 0.3), wh = Math.min(1.85, h - 0.4), wy = y + 0.12, f = 0.05;
  const fc = { colour: shade(colour, 0.7), decor: true, fineSides: true } as const;
  for (const side of [-1, 1]) faceBox(sink, 'structureMetal', face, wu + side * (ww / 2 + f / 2), wy + wh / 2, go + 0.05, f, wh + 2 * f, 0.03, fc);
  faceBox(sink, 'structureMetal', face, wu, wy + wh + f / 2, go + 0.05, ww, f, 0.03, fc);
  faceBox(sink, 'structureMetal', face, wu, wy - f / 2, go + 0.05, ww, f, 0.03, fc);
  faceBox(sink, 'structureMetal', face, wu, wy + wh / 2, go + 0.036, ww - 0.01, wh - 0.01, 0.008, { colour: shade(colour, 1.05), decor: true });
  for (const t of [0.15, 0.85]) sink.cylinder('structureMetal', facePoint(face, wu - ww / 2 - f, wy + wh * t - 0.06, go + 0.07), 'y', 0.12, 0.02, 6, { colour: STEEL_DARK, decor: true, fine: true });
  faceBox(sink, 'structureMetal', face, wu + ww / 2 - 0.1, wy + wh * 0.5, go + 0.06, 0.04, 0.16, 0.04, { colour: STEEL_DARK, decor: true, fine: true });
}

function dialect(st: TselinaState, gate?: Rgb): HouseDialect {
  return {
    window: (sink, face, o, y0) => windowUnit(sink, face, o.u, y0 + o.y0, o.w, o.h,
      o.kind === 'loft' ? { ...st.window, shutters: null, surround: null, bars: 'two' } : st.window, st.rng, o.kind === 'loft' ? 0.1 : st.litShare),
    door: (sink, face, o, y0, frame) => {
      if (o.kind === 'gate') { steelGate(sink, face, o.u, y0 + o.y0, o.w, o.h, gate ?? shade(st.paint, 0.85)); return; }
      doorUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: st.rng() < 0.5 ? st.paint : PLANK, frame: { bucket: 'structureWood', width: 0.1, out: 0.04, colour: WHITE },
        steps: { bucket: 'stone' }, leafKind: 'plank',
      }, frame.floors[o.storey] + o.y0);
    },
  };
}

/** The asbestos-cement sheet roof (shifer), or a painted or galvanised sheet one. */
function sheetRoof(kind: RoofSpec['kind'], pitch: number, sheet: boolean, eave = 0.45, verge = 0.4): RoofSpec {
  return { kind, pitchDeg: pitch, eave, verge, thickness: sheet ? 0.06 : 0.1, bucket: sheet ? 'structureMetal' : 'roof', ridge: kind === 'shed' ? null : 'saddle' };
}

/** The two triangles a shed roof leaves open over the ±z walls of a w × d body (its slope rises toward -x). */
function shedGables(sink: PartSink, w: number, d: number, eaveY: number, tanP: number, bucket: RegionalBucket, colour?: Rgb): void {
  const rise = w * tanP;
  if (rise < 0.03) return;
  const opts = colour ? { colour } : {};
  const front: Face = { origin: [0, 0, d / 2], u: [1, 0, 0], out: [0, 0, 1], width: w };
  const back: Face = { origin: [0, 0, -d / 2], u: [-1, 0, 0], out: [0, 0, -1], width: w };
  wallPolygon(sink, bucket, front, [[-w / 2, eaveY], [w / 2, eaveY], [-w / 2, eaveY + rise]], 0.2, opts);
  wallPolygon(sink, bucket, back, [[-w / 2, eaveY], [w / 2, eaveY], [w / 2, eaveY + rise]], 0.2, opts);
}

/**
 * Brick pilasters down a long industrial face (gauntlet wave 106: "oversized grey block-grid placeholder walls"): a strip
 * of the kit's brick every `step` metres from the plinth to the eave, a little proud, skipping the openings, so a long
 * whitewashed wall reads as built bay by bay (dressing).
 */
function pilasters(sink: PartSink, face: Face, y0: number, y1: number, step: number, holes: Array<[number, number]> = []): void {
  const n = Math.max(1, Math.round((face.width - 0.6) / step));
  for (let k = 0; k <= n; k++) {
    const u = -face.width / 2 + 0.3 + (face.width - 0.6) * k / n;
    if (holes.some(([a, b]) => u > a - 0.4 && u < b + 0.4)) continue;
    faceBox(sink, 'stone', face, u, (y0 + y1) / 2, 0.06, 0.52, y1 - y0, 0.12, { decor: true }, 'caps');
  }
}

// ---------------------------------------------------------------------------------------------------------- the works' dressing

/** (dome-detail-275) The grain's colour (wheat), heaped where a lorry or a spout spilled it. */
const GRAIN = rgb(0xc4a462), EARTH = rgb(0x8a7458), RUST = rgb(0x7a4a32);
const DEC = { decor: true } as const;
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * (dome-detail-275) A steel rung ladder up a face: `foot` on the face at the bottom, `out` the face's unit normal, to
 * `y1`: two flat-bar rails `off` out on brackets back to the face every 3 m, the rungs (fine), and from `cage` up the
 * safety cage's hoops every 1.4 m (fine) and its three straps.
 */
function steelLadder(sink: PartSink, foot: Vec3, out: Vec3, y1: number, off: number, colour: Rgb, cage = Infinity): void {
  const s: Vec3 = [-out[2], 0, out[0]], y0 = foot[1];
  const P = (a: number, y: number, o: number): Vec3 => [foot[0] + s[0] * a + out[0] * o, y, foot[2] + s[2] * a + out[2] * o];
  const free = { colour, decor: true, exposed: true } as const, up: Vec3 = [0, 1, 0];
  for (const a of [-0.22, 0.22]) sink.member('structureMetal', P(a, y0, off), P(a, y1, off), 0.06, 0.05, out, free, 0);
  for (let y = y0 + 0.5; y < y1 - 0.2; y += 3.0) for (const a of [-0.22, 0.22]) sink.member('structureMetal', P(a, y, -0.03), P(a, y, off), 0.05, 0.04, up, free, 0);
  for (let y = y0 + 0.3; y < y1 - 0.05; y += 0.35) sink.member('structureMetal', P(-0.22, y, off + 0.025), P(0.22, y, off + 0.025), 0.03, 0.03, up, { colour, decor: true, fine: true }, 0);
  if (cage >= y1 - 1) return;
  const ring: Array<[number, number]> = [[-0.22, off], [-0.36, off + 0.24], [-0.22, off + 0.62], [0.22, off + 0.62], [0.36, off + 0.24], [0.22, off]];
  for (let y = cage; y < y1; y += 1.4) for (let k = 0; k + 1 < ring.length; k++) {
    sink.member('structureMetal', P(ring[k][0], y, ring[k][1]), P(ring[k + 1][0], y, ring[k + 1][1]), 0.045, 0.03, up, { colour, decor: true, fine: true }, 0);
  }
  for (const k of [1, 4]) sink.member('structureMetal', P(ring[k][0], cage, ring[k][1]), P(ring[k][0], y1, ring[k][1]), 0.05, 0.03, [s[0], 0, s[2]], free, 0);
  sink.member('structureMetal', P(0, cage, off + 0.62), P(0, y1, off + 0.62), 0.05, 0.03, out, free, 0);
}

/**
 * (dome-detail-275) An asbestos-sheet gable's wear (roofGeometry `rg`, its ridge along z): the sheets' laps in courses
 * down each slope, `patches` sheets a slope replaced in a fresher grey or gone dark with lichen.
 */
function sheetLaps(sink: PartSink, rg: RoofGeometry, look: () => number, patches: number, verge: number): void {
  for (const side of [-1, 1]) {
    const n = normalize3([side * rg.tanP, 1, 0]), step = Math.min(0.3, 1.45 / Math.max(1, rg.s));
    for (let t = 0.18; t < 1.05; t += step) {
      const x = side * rg.s * t, y = rg.topAt(x, 0);
      if (y !== null) sink.member('roof', [x, y, -rg.halfD - verge], [x, y, rg.halfD + verge], 0.07, 0.025, n, { decor: true, shade: 0.72, exposed: true }, 0);
    }
    for (let k = 0; k < patches; k++) {
      const x = side * rg.s * (0.28 + look() * 0.6), z = (look() - 0.5) * (2 * rg.halfD - 3), y = rg.topAt(x, z);
      if (y !== null) sink.member('roof', [x, y, z], [x, y, z + 1.15], 1.3, 0.018, n, { decor: true, shade: look() < 0.35 ? 0.6 : 1.18, exposed: true }, 0);
    }
  }
}

/** (dome-detail-275) A heap on the ground (spilled grain, a spoil or rubble heap): an eight-sided mound, darker at its foot. */
function heap(sink: PartSink, x: number, z: number, rx: number, rz: number, h: number, colour: Rgb, twist = 0, sides = 8): void {
  mound(sink, [x, -0.06, z], [1, 0, 0], [0, 0, 1], rx, rz, h, colour, DEC, twist, sides);
}

/** (dome-detail-275) A concrete footing under a post or leg: its block sunk into the ground, its top weathered to a bevel. */
function footing(sink: PartSink, x: number, z: number, s: number, top: number, bucket: RegionalBucket = 'plaster2'): void {
  sink.span(bucket, x - s / 2, -0.3, z - s / 2, x + s / 2, top - 0.06, z + s / 2, DEC);
  sink.span(bucket, x - s / 2 + 0.06, top - 0.06, z - s / 2 + 0.06, x + s / 2 - 0.06, top, z + s / 2 - 0.06, DEC);
}

// ---------------------------------------------------------------------------------------------------------- the lot

/**
 * The base geometry's measured footprint (ctx.bounds; the plot where it is empty). The coordinator's rule (2026-10-05,
 * Titan's pacing bisect: a kit barn 2.4 m short of its base warehouse opened a 5 m lane the bots drove through, the
 * battle median fell from 231 to 152 s): a kit building's main body fills it.
 */
interface Footprint { x0: number; x1: number; z0: number; z1: number; w: number; d: number; cx: number; cz: number }
function footprint(ctx: RegionalBuildContext): Footprint {
  const b = ctx.bounds;
  const ok = Number.isFinite(b.minX) && Number.isFinite(b.maxX) && b.maxX - b.minX > 0.5 && b.maxZ - b.minZ > 0.5;
  const x0 = ok ? b.minX : -ctx.info.w / 2, x1 = ok ? b.maxX : ctx.info.w / 2;
  const z0 = ok ? b.minZ : -ctx.info.d / 2, z1 = ok ? b.maxZ : ctx.info.d / 2;
  return { x0, x1, z0, z1, w: x1 - x0, d: z1 - z0, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
}
/**
 * Emit a body centred on the footprint in its own frame, its local z (a roof's ridge) along the footprint's long side:
 * on a lot longer in x it is turned a quarter (its local -x side then faces the lot's +z). `body` gets the frame's across
 * (W) and along (D) sizes.
 */
function onLot(sink: PartSink, fp: Footprint, body: (W: number, D: number, turned: boolean) => void, turn = fp.w > fp.d + 0.5): void {
  if (turn) sink.placed(Math.PI / 2, fp.cx, 0, fp.cz, () => body(fp.d, fp.w, true));
  else sink.placed(0, fp.cx, 0, fp.cz, () => body(fp.w, fp.d, false));
}

// ---------------------------------------------------------------------------------------------------------- houses

/**
 * The settler's house: a single storey of whitewashed saman (or white silicate brick) on a brick plinth, its gable to
 * the street (the lot's +z) with three windows in board surrounds, a low gable of asbestos sheet (or painted sheet) with
 * painted verge boards and a boarded gable, the brick stack, and across the back gable the glazed veranda (boarded
 * below, small panes above) with its door to the yard side; together they fill the lot.
 */
/** The porch bench (dressing.ts bench) with the two posts its back board stands on (2026-10-11, kitConnectivity). */
function porchBench(sink: PartSink, face: Face, u: number, length: number, wood: Rgb): void {
  bench(sink, face, u, length, wood);
  for (const side of [-1, 1]) faceBox(sink, 'structureWood', face, u + side * (length / 2 - 0.12), 0.66, 0.07, 0.05, 0.44, 0.05, { decor: true, colour: wood });
}

function settlerHouse(ctx: RegionalBuildContext): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), rng = st.rng, look = st.look;
  const fp = footprint(ctx);
  const W = Math.max(3.6, fp.w - 0.1), total = Math.max(5.6, fp.d - 0.1);
  const vD = clamp(total * 0.22, 1.5, 2.2), D = total - vD;
  const z0 = fp.cz - total / 2, zb = z0 + vD + D / 2;
  const brick = rng() < 0.18;
  const wall: RegionalBucket = brick ? 'stone' : 'plaster';
  const sheet = rng() < 0.32, livery = pick(rng, SHEET);
  // (gauntlet wave 106, round 2: "Western cottages") the settlers' standard houses sat under low four-slope roofs of
  // asbestos sheet as often as under gables, pitched low (18–24°)
  const hip = rng() < 0.5;
  const roof = sheetRoof(hip ? 'hip' : 'gable', 18 + rng() * 6, sheet, 0.4, 0.35);
  const openings: Opening[] = [
    ...windowRhythm('front', 0, W, { w: 0.86, h: 1.2, sill: 0.85, spacing: 1.55, margin: 0.75, max: 3 }),
    ...windowRhythm('left', 0, D, { w: 0.86, h: 1.2, sill: 0.85, spacing: 2.3, margin: 1.1, max: 2 }),
    ...windowRhythm('right', 0, D, { w: 0.86, h: 1.2, sill: 0.85, spacing: 2.3, margin: 1.1, max: 2 }),
  ];
  const plinth = 0.5, wallH = 2.55 + rng() * 0.2;
  sink.placed(0, fp.cx, 0, zb, () => {
    const frame = buildHouse(sink, {
      w: W - 0.1, d: D - 0.1, plinth: { h: plinth, out: 0.05, bucket: 'stone' }, storeys: [{ h: wallH, wall }],
      roof, roofColour: sheet ? livery : undefined, gableBucket: rng() < 0.5 ? 'wood' : wall, openings,
      chimneys: [{ x: (rng() - 0.5) * 0.6, z: -D * 0.15, sx: 0.5, sz: 0.62, above: 0.7, bucket: 'stone', cap: 'slab' }],
      gutters: null, verge: { colour: rng() < 0.5 ? WHITE : st.paint, bucket: 'structureWood' },
      spall: brick ? undefined : null,
    }, {
      ...dialect(st),
      // (props census #15, Lane C 2026-10-16: the vent was a dark plate in a board frame) the attic vent cut through
      // the street gable with its reveal
      gableOpenings: (face, poly) => {
        if (hip || face.out[2] <= 0) return [];
        const base = poly[0][1], vy = base + (Math.max(...poly.map(([, y]) => y)) - base) * 0.38;
        return [{ u0: -0.275, u1: 0.275, y0: vy - 0.21, y1: vy + 0.21 }];
      },
    });
    // the attic vent in the street gable: its louvre boards across the cut and its painted board frame (a hipped roof has
    // none)
    const gf: Face = { origin: [0, 0, (D - 0.1) / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
    if (!hip) {
      const ventY = frame.eaveY + (frame.roof.ridgeY - frame.eaveY) * 0.38;
      for (let k = 0; k < 3; k++) faceBox(sink, 'structureWood', gf, 0, ventY - 0.13 + k * 0.13, -0.06, 0.55, 0.05, 0.08, { colour: shade(st.paint, 0.8), decor: true, fine: true });
      for (const side of [-1, 1]) faceBox(sink, 'structureWood', gf, side * 0.32, ventY, 0.02, 0.09, 0.6, 0.04, { colour: st.paint, decor: true });
      for (const side of [-1, 1]) faceBox(sink, 'structureWood', gf, 0, ventY + side * 0.255, 0.02, 0.72, 0.09, 0.04, { colour: st.paint, decor: true });
    }
    // (2026-10-11, kitConnectivity: no TV aerial — the virgin-land settlements of the late 1950s had the wired radio, not
    // a television mast on every roof, and the aerial's elements are bars with two free ends)
    look();
    if (look() < 0.6) porchBench(sink, gf, (look() - 0.5) * Math.max(0, W - 2.4), 1.4, PLANK);
  });
  // the veranda across the whole back gable, built a quarter turned: its local +x runs out to -z (away from the house),
  // its shed roof rising toward the house wall
  const vH = 2.25, vPlinth = 0.45;
  const vRoof = sheetRoof('shed', 12, sheet, 0.25, 0.2);
  const door: 'front' | 'back' = rng() < 0.5 ? 'front' : 'back';
  const veranda: Opening[] = [
    { face: door, storey: 0, kind: 'door', u: (door === 'front' ? -1 : 1) * (vD / 2 - 0.62), w: 0.82, y0: 0, h: 1.95 },
    ...windowRhythm('right', 0, W, { w: 0.6, h: 0.95, sill: 1.0, spacing: 0.7, margin: 0.3 }),
    ...windowRhythm(door === 'front' ? 'back' : 'front', 0, vD, { w: 0.6, h: 0.95, sill: 1.0, spacing: 0.7, margin: 0.3, max: 2 }),
  ];
  const glazed: WindowStyle = { frame: WHITE, frameWidth: 0.06, frameOut: 0.04, bars: 'cross', surround: null, sill: { bucket: 'structureWood', out: 0.05, colour: st.paint }, shutters: null };
  sink.placed(Math.PI / 2, fp.cx, 0, z0 + vD / 2, () => {
    const vf = buildHouse(sink, {
      w: vD - 0.06, d: W - 0.06, plinth: { h: vPlinth, out: 0.03, bucket: 'stone' }, storeys: [{ h: vH, wall: 'wood' }],
      roof: vRoof, roofColour: sheet ? livery : undefined, openings: veranda, chimneys: [], gutters: null, verge: null, reveal: 0.1, spall: null,
    }, {
      window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, glazed, rng, 0.35),
      door: (s, face, o, y0, frame) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: st.paint, frame: { bucket: 'structureWood', width: 0.08, out: 0.03, colour: WHITE }, steps: { bucket: 'stone' }, leafKind: 'panel',
      }, frame.floors[o.storey] + o.y0),
    });
    shedGables(sink, vD - 0.06, W - 0.06, vf.eaveY, Math.tan(12 * Math.PI / 180), 'wood');
    const outer: Face = { origin: [(vD - 0.06) / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: W };
    faceBox(sink, 'structureWood', outer, 0, vPlinth + 0.92, 0.04, W - 0.06, 0.08, 0.06, { colour: WHITE, decor: true }, 'ends');
  });
  return sink.finish();
}

/**
 * The two-family house of the estate's streets: one long storey of silicate brick (or render) under a low hip or gable of
 * asbestos sheet, its gable to the street, and down one long side the glazed veranda that holds both flats' entrances
 * (their doors and steps), two stacks; house and veranda fill the lot.
 */
function twoFamilyHouse(ctx: RegionalBuildContext): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), rng = st.rng, look = st.look;
  const fp = footprint(ctx);
  const wall: RegionalBucket = rng() < 0.25 ? 'stone' : rng() < 0.5 ? 'plaster2' : 'plaster';
  const sheet = rng() < 0.25, livery = pick(rng, SHEET);
  const hip = rng() < 0.45;
  const pitch = 20 + rng() * 6;
  onLot(sink, fp, (Wl, L) => {
    // across the lot: the veranda (vD) on the house's left (-x) side, the house beside it
    const vD = clamp(Wl * 0.2, 1.6, 2.2), Wb = Wl - vD - 0.1;
    const xb = -Wl / 2 + vD + Wb / 2 + 0.05;
    const doors = [-L * 0.28, L * 0.28];
    const roof = sheetRoof(hip ? 'hip' : 'gable', pitch, sheet, 0.45, 0.4);
    const openings: Opening[] = [
      ...windowRhythm('front', 0, Wb, { w: 1.1, h: 1.35, sill: 0.85, spacing: 2.0, margin: 1.0, max: 3 }),
      ...windowRhythm('back', 0, Wb, { w: 1.1, h: 1.35, sill: 0.85, spacing: 2.0, margin: 1.0, max: 3 }),
      ...windowRhythm('right', 0, L, { w: 1.1, h: 1.35, sill: 0.85, spacing: 2.4, margin: 1.2 }),
    ];
    sink.placed(0, xb, 0, 0, () => {
      buildHouse(sink, {
        w: Wb - 0.12, d: L - 0.12, plinth: { h: 0.55, out: 0.06, bucket: 'stone' }, storeys: [{ h: 2.8, wall }],
        roof, roofColour: sheet ? livery : undefined, gableBucket: wall, openings,
        chimneys: doors.map((z) => ({ x: (rng() - 0.5) * 0.6, z: z * 0.8, sx: 0.55, sz: 0.62, above: 0.75, bucket: 'stone' as const, cap: 'slab' as const })),
        gutters: null, verge: roof.kind === 'gable' ? { colour: WHITE, bucket: 'structureWood' } : null, spall: wall === 'plaster' ? 'stone' : undefined,
      }, dialect(st));
      look(); // (no TV aerial: the settler house's note)
    });
    // the glazed veranda along the left side: boarded below, small panes above, the two doors and their steps, a shed
    // roof rising to the house wall
    const vf: Opening[] = [
      ...doors.map((u): Opening => ({ face: 'right', storey: 0, kind: 'door', u: -u, w: 0.9, y0: 0, h: 2.0 })),
      ...windowRhythm('right', 0, L, { w: 0.62, h: 0.95, sill: 1.0, spacing: 0.75, margin: 0.4, avoid: doors.map((u): [number, number] => [-u - 0.75, -u + 0.75]) }),
    ];
    const glazed: WindowStyle = { frame: WHITE, frameWidth: 0.06, frameOut: 0.04, bars: 'cross', surround: null, sill: { bucket: 'structureWood', out: 0.05, colour: st.paint }, shutters: null };
    sink.placed(Math.PI, -Wl / 2 + vD / 2, 0, 0, () => {
      const v = buildHouse(sink, {
        w: vD - 0.06, d: L - 0.06, plinth: { h: 0.5, out: 0.03, bucket: 'stone' }, storeys: [{ h: 2.3, wall: 'wood' }],
        roof: sheetRoof('shed', 12, sheet, 0.25, 0.2), roofColour: sheet ? livery : undefined, openings: vf, chimneys: [], gutters: null, verge: null,
        reveal: 0.1, spall: null,
      }, {
        window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, glazed, rng, 0.35),
        door: (s, face, o, y0, frame) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
          leaf: st.paint, frame: { bucket: 'structureWood', width: 0.08, out: 0.03, colour: WHITE }, steps: { bucket: 'stone' }, leafKind: 'panel',
        }, frame.floors[o.storey] + o.y0),
      });
      shedGables(sink, vD - 0.06, L - 0.06, v.eaveY, Math.tan(12 * Math.PI / 180), 'wood');
    });
  });
  return sink.finish();
}

/**
 * The sovkhoz club: one storey of ochre render with white pilasters and cornice on a brick plinth, the portico of four
 * columns under a pediment carrying the red star on the lot's +z, tall windows down the sides, a sign board over the door,
 * a sheet roof; body, portico and steps fill the lot.
 */
const club: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), rng = st.rng, look = st.look;
  const fp = footprint(ctx);
  const W = Math.max(5.4, fp.w - 0.12), total = Math.max(6.4, fp.d);
  const steps = 0.68, P = clamp(total * 0.22, 1.5, 2.4), D = total - P - steps - 0.12;
  const z0 = fp.cz - total / 2, zb = z0 + 0.06 + D / 2;
  const plinth = 0.6, wallH = 3.6 + rng() * 0.4;
  const sheet = rng() < 0.5, livery = pick(rng, [SHEET[2], SHEET[3], SHEET[0]]);
  const pitch = 22;
  const roof = sheetRoof('gable', pitch, sheet, 0.4, 0.25);
  const tall: WindowStyle = { frame: WHITE, frameWidth: 0.07, frameOut: 0.05, bars: 'six', surround: { bucket: 'plaster', width: 0.16, out: 0.05, lintel: 0.24 },
    sill: { bucket: 'plaster', out: 0.08 }, shutters: null };
  const openings: Opening[] = [
    { face: 'front', storey: 0, kind: 'door', u: 0, w: 1.4, y0: 0, h: 2.5 },
    ...windowRhythm('front', 0, W, { w: 1.0, h: 2.0, sill: 0.9, spacing: 2.4, margin: 0.9, avoid: [[-1.0, 1.0]] }),
    ...windowRhythm('left', 0, D, { w: 1.1, h: 2.1, sill: 0.95, spacing: 2.3, margin: 1.0 }),
    ...windowRhythm('right', 0, D, { w: 1.1, h: 2.1, sill: 0.95, spacing: 2.3, margin: 1.0 }),
  ];
  let eaveY = plinth + wallH;
  sink.placed(0, fp.cx, 0, zb, () => {
    const frame = buildHouse(sink, {
      w: W - 0.12, d: D, plinth: { h: plinth, out: 0.06, bucket: 'stone' }, storeys: [{ h: wallH, wall: 'plaster3' }],
      roof, roofColour: sheet ? livery : undefined, gableBucket: 'plaster3', openings,
      chimneys: [{ x: W * 0.28, z: -D * 0.25, sx: 0.5, sz: 0.5, above: 0.6, bucket: 'stone', cap: 'slab' }],
      gutters: null, verge: null, reveal: 0.18,
    }, {
      window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, tall, rng, 0.55),
      door: (s, face, o, y0, f) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: rgb(0x6e4a36), frame: { bucket: 'plaster', width: 0.2, out: 0.06 }, transom: true, steps: null, leafKind: 'panel',
      }, f.floors[o.storey] + o.y0),
    });
    eaveY = frame.eaveY;
    const Wb = W - 0.12;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      sink.quoin('plaster', sx * (Wb / 2 - 0.26), plinth, sz * (D / 2 - 0.26), sx * (Wb / 2 + 0.06), eaveY - 0.3, sz * (D / 2 + 0.06), sx, sz, { decor: true });
    }
    sink.band('plaster', -Wb / 2 - 0.08, eaveY - 0.32, -D / 2 - 0.08, Wb / 2 + 0.08, eaveY, D / 2 + 0.08, { decor: true });
  });
  // the portico: its floor the lot's width, the steps the rest of the lot, four columns, the entablature, the pediment
  const pz0 = z0 + 0.06 + D, pz1 = pz0 + P, pw = W;
  sink.span('stone', fp.cx - pw / 2, -0.4, pz0, fp.cx + pw / 2, plinth, pz1);
  for (let k = 0; k < 2; k++) {
    const top = plinth * (2 - k) / 3;
    sink.span('stone', fp.cx - pw / 2 + 0.3, -0.4, pz1 + k * steps / 2, fp.cx + pw / 2 - 0.3, top, pz1 + (k + 1) * steps / 2);
  }
  const colZ = pz1 - 0.38, colX = (pw / 2 - 0.55);
  for (const x of [-colX, -colX / 3, colX / 3, colX]) {
    sink.cylinder('plaster', [fp.cx + x, plinth, colZ], 'y', eaveY - plinth - 0.45, 0.22, 10, {}, 0.19);
    sink.span('plaster', fp.cx + x - 0.3, eaveY - 0.5, colZ - 0.3, fp.cx + x + 0.3, eaveY - 0.42, colZ + 0.3, { decor: true });
  }
  sink.span('plaster', fp.cx - pw / 2 + 0.05, eaveY - 0.45, pz0, fp.cx + pw / 2 - 0.05, eaveY, pz1 + 0.05);
  const pr = sheetRoof('gable', pitch, sheet, 0.4, 0.25);
  const prg = roofGeometry(W - 0.12, P, eaveY, pr);
  sink.placed(0, fp.cx, 0, pz0 + P / 2, () => emitRoof(sink, prg, pr, sheet ? livery : undefined));
  const pediment: Face = { origin: [fp.cx, 0, pz1 + 0.05], u: [1, 0, 0], out: [0, 0, 1], width: W };
  wallPolygon(sink, 'plaster', pediment, [[-W / 2 + 0.1, eaveY], [W / 2 - 0.1, eaveY], [0, prg.ridgeY - 0.05]], 0.3);
  // the red star in the pediment (a five-pointed polygon fanned from its centre) and the sign board over the door
  const sy = eaveY + (prg.ridgeY - eaveY) * 0.42, sr = Math.min(0.62, (prg.ridgeY - eaveY) * 0.3);
  const star: Vec3[] = [[fp.cx, sy, pz1 + 0.09]];
  for (let k = 0; k <= 10; k++) {
    const a = Math.PI / 2 + (k % 10) * Math.PI / 5, r = k % 2 ? sr * 0.42 : sr;
    star.push([fp.cx + Math.cos(a) * r, sy + Math.sin(a) * r, pz1 + 0.09]);
  }
  sink.polygon('structureMetal', star, { colour: RED, decor: true });
  const doorFace: Face = { origin: [fp.cx, 0, pz0], u: [1, 0, 0], out: [0, 0, 1], width: W };
  faceBox(sink, 'structureWood', doorFace, 0, plinth + 2.95, 0.04, 2.4, 0.46, 0.05, { colour: RED, decor: true });
  faceBox(sink, 'structureWood', doorFace, 0, plinth + 2.95, 0.07, 2.0, 0.12, 0.02, { colour: WHITE, decor: true, fine: true });
  if (look() < 0.7) {
    const fx = fp.cx + W / 2 - 0.25, fz = pz1 + steps - 0.25;
    sink.cylinder('structureMetal', [fx, -0.2, fz], 'y', 7.7, 0.05, 6, { colour: STEEL_DARK, decor: true }, 0.035);
    sink.span('structureMetal', fx + 0.03, 6.4, fz - 0.02, fx + 1.45, 7.3, fz + 0.02, { colour: RED, decor: true });
  }
  return sink.finish();
};

// ---------------------------------------------------------------------------------------------------------- the grain

/**
 * The grain elevator: the under-silo storey of concrete filling the lot (its doors and window band), on it the bank of
 * slip-formed silos in two rows and the top gallery along them, the working tower at one end rising past them with its
 * windows in vertical stair strips and a head house on top, the drive-through intake beside the tower. Lots 16 m wide and
 * more carry it; a smaller warehouse lot is a store.
 */
const elevator = (ctx: RegionalBuildContext): RegionalParts => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const fp = footprint(ctx);
  onLot(sink, fp, (Wl, Ll) => {
    const halfX = Wl / 2, halfZ = Ll / 2;
    const r = clamp((halfX - 0.3) / 2.05, 2.4, 3.4);
    const towerW = clamp(2 * r + 2.4, 6.5, Wl), towerD = clamp(r * 2.4, 6.0, 8.5);
    const n = clamp(Math.floor((Ll - towerD) / (2 * r)), 2, 5);
    const zt0 = -halfZ, zt1 = zt0 + towerD, zb1 = halfZ;
    const bankL = zb1 - zt1, pitch = bankL / n;
    const Hs = 24 + rng() * 5, Ht = Hs + 9 + rng() * 4, H0 = 3.6;
    // the under-silo storey over the whole lot, its plinth band
    sink.span('plaster2', -halfX, -0.5, -halfZ, halfX, H0, halfZ);
    sink.band('plaster2', -halfX - 0.05, H0 - 0.25, -halfZ - 0.05, halfX + 0.05, H0, halfZ + 0.05, { decor: true, shade: 0.9 });
    for (const sx of [-1, 1]) for (let k = 0; k < n; k++) sink.cylinder('plaster2', [sx * r, H0, zt1 + pitch * (k + 0.5)], 'y', Hs - H0, Math.min(r, pitch / 2), 16, {});
    sink.span('plaster2', -r * 0.75, H0, zt1 + pitch / 2, r * 0.75, Hs, zb1 - pitch / 2);
    // the top gallery along the bank, its roof and its window band
    const gw = Math.min(2.2, r * 0.8), gh = 3.0;
    sink.span('plaster2', -gw, Hs, zt1, gw, Hs + gh, zb1 - 0.4);
    sink.span('roof', -gw - 0.25, Hs + gh, zt1, gw + 0.25, Hs + gh + 0.18, zb1 - 0.15);
    for (const sx of [-1, 1]) {
      const side: Face = sx > 0 ? { origin: [gw, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: bankL } : { origin: [-gw, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: bankL };
      for (let z = zt1 + 1.6; z < zb1 - 1.4; z += 2.1) facePanel(sink, paneBucket(look, 0.15), side, sx > 0 ? -z : z, Hs + gh * 0.55, 0.012, 1.3, 0.8, { decor: true, window: side.out });
    }
    // the working tower over its end of the lot, the floor bands, the window strips, the head house
    const tx = towerW / 2;
    sink.span('plaster2', -tx, H0 - 0.2, zt0, tx, Ht, zt1 + 0.2);
    sink.span('plaster2', -tx - 0.12, Ht, zt0 - 0.12, tx + 0.12, Ht + 0.7, zt1 + 0.32);
    const hw = Math.min(tx - 0.8, 2.6), hz = (zt0 + zt1) / 2;
    sink.span('plaster2', -hw, Ht + 0.7, hz - 2.0, hw, Ht + 4.6, hz + 2.0);
    sink.span('roof', -hw - 0.2, Ht + 4.6, hz - 2.2, hw + 0.2, Ht + 4.8, hz + 2.2);
    const towerFaces: Face[] = [
      { origin: [0, 0, zt0], u: [-1, 0, 0], out: [0, 0, -1], width: towerW },
      { origin: [tx, 0, hz], u: [0, 0, -1], out: [1, 0, 0], width: towerD },
      { origin: [-tx, 0, hz], u: [0, 0, 1], out: [-1, 0, 0], width: towerD },
    ];
    for (const f of towerFaces) {
      const cols = f.width > 7 ? [-f.width * 0.22, f.width * 0.22] : [0];
      for (const u of cols) for (let y = H0 + 2.0; y < Ht - 2.5; y += 3.4) facePanel(sink, paneBucket(look, 0.12), f, u, y, 0.012, 0.75, 1.1, { decor: true, window: f.out });
      for (let u = -f.width / 2 + 0.9; u < f.width / 2 - 0.6; u += 1.5) facePanel(sink, paneBucket(look, 0.2), f, u, Ht - 1.4, 0.012, 1.0, 1.0, { decor: true, window: f.out });
      for (let y = H0 + 3.0; y < Ht - 3; y += 6.8) faceBox(sink, 'plaster2', f, 0, y, 0.04, f.width + 0.08, 0.22, 0.08, { decor: true, shade: 0.88 }, 'ends');
    }
    // the under-silo storey's faces: steel doors, the drive-through's gate under the tower, a band of small windows
    const lotFaces: Face[] = [
      { origin: [halfX, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: Ll }, { origin: [-halfX, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: Ll },
      { origin: [0, 0, halfZ], u: [1, 0, 0], out: [0, 0, 1], width: Wl },
    ];
    for (const f of lotFaces) {
      // (gauntlet wave 106, round 2) the slip-formed storey's pilasters, bay by bay, in its own concrete
      for (let u = -f.width / 2 + 2.6; u < f.width / 2 - 1.0; u += 5.2) faceBox(sink, 'plaster2', f, u, H0 / 2, 0.08, 0.5, H0 + 0.5, 0.16, { decor: true, shade: 0.86 }, 'caps');
      for (let u = -f.width / 2 + 1.2; u < f.width / 2 - 1.0; u += 2.6) facePanel(sink, 'dark', f, u, H0 - 0.9, 0.012, 1.1, 0.55, { decor: true });
      faceBox(sink, 'structureMetal', f, f.width * 0.2, 1.2, 0.03, 1.6, 2.4, 0.06, { colour: pick(look, GATE), decor: true });
    }
    faceBox(sink, 'structureMetal', towerFaces[0], 0, 1.9, 0.03, Math.min(3.4, towerW - 2), 3.4, 0.06, { colour: pick(rng, GATE), decor: true });
    // dressing: the slip-form rings round the silos, the spouts down the bank's end, the lightning mast, the red plaque
    for (const sx of [-1, 1]) for (let k = 0; k < n; k++) {
      const z = zt1 + pitch * (k + 0.5), rr = Math.min(r, pitch / 2);
      for (let y = H0 + 3.5; y < Hs - 1; y += 4.6) sink.cylinder('plaster2', [sx * r, y, z], 'y', 0.16, rr + 0.03, 16, { decor: true, shade: 0.82 }, rr + 0.03, false);
    }
    // (2026-10-11, kitConnectivity: the spouts stood 10-20 cm clear of the silos) each spout down the end silo's face, set
    // against its curve toward the bank's end and its middle
    {
      const rr = Math.min(r, pitch / 2), cz = zb1 - pitch / 2, dl = Math.hypot(0.42, 0.91);
      for (const sx of [-1, 1]) {
        // (the centreline 2 cm out from the silo's round: the sixteen-sided shaft lies up to 6 cm inside it between corners)
        const x = sx * (r - (0.42 / dl) * (rr + 0.02)), z = cz + (0.91 / dl) * (rr + 0.02);
        sink.member('structureMetal', [x, H0 + 0.2, z], [x, Hs - 0.5, z], 0.22, 0.22, [0, 0, 1], { colour: STEEL, decor: true, exposed: true }, 0);
      }
    }
    sink.cylinder('structureMetal', [0, Ht + 4.8, hz], 'y', 6.0, 0.05, 5, { colour: STEEL_DARK, decor: true }, 0.03);
    faceBox(sink, 'structureMetal', towerFaces[0], 0, Ht - 3.6, 0.05, Math.min(3.6, towerW - 1.2), 1.0, 0.06, { colour: RED, decor: true });
  });
  return sink.finish();
};

/**
 * The machine-tractor station's repair shop: a hall of silicate brick filling the lot under a low gable of asbestos
 * sheet, a glazed monitor along the ridge, steel gates in both gables, a band of steel-framed windows down the long sides.
 */
const workshop = (ctx: RegionalBuildContext): RegionalParts => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), rng = st.rng, look = st.look;
  const fp = footprint(ctx);
  const H = 5.6 + rng() * 0.8, gate = pick(rng, GATE);
  const steel: WindowStyle = { frame: STEEL_DARK, frameWidth: 0.06, frameOut: 0.04, bars: 'six', surround: null, sill: { bucket: 'plaster2', out: 0.08 }, shutters: null };
  onLot(sink, fp, (Wl, Ll) => {
    const W = Wl - 0.1, D = Ll - 0.1;
    const openings: Opening[] = [
      { face: 'front', storey: 0, kind: 'gate', u: 0, w: Math.min(4.2, W * 0.4), y0: 0, h: 4.4 },
      { face: 'back', storey: 0, kind: 'gate', u: 0, w: Math.min(4.2, W * 0.4), y0: 0, h: 4.4 },
      ...windowRhythm('left', 0, D, { w: 2.2, h: 2.0, sill: 2.3, spacing: 3.2, margin: 1.4 }),
      ...windowRhythm('right', 0, D, { w: 2.2, h: 2.0, sill: 2.3, spacing: 3.2, margin: 1.4 }),
    ];
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.3, out: 0.05, bucket: 'plaster2' }, storeys: [{ h: H, wall: 'plaster' }],
      roof: sheetRoof('gable', 12, false, 0.45, 0.3), gableBucket: 'plaster', openings, chimneys: [], gutters: null, verge: null, reveal: 0.22,
    }, { ...dialect(st, gate), window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, steel, rng, 0.3) });
    for (const name of ['left', 'right'] as const) {
      pilasters(sink, frame.faces[name], 0.3, frame.eaveY, 3.2, openings.filter((o) => o.face === name).map((o): [number, number] => [o.u - o.w / 2, o.u + o.w / 2]));
    }
    const mw = Math.min(2.6, W * 0.24), my0 = frame.roof.ridgeY - 0.25, mh = 1.25, md = D * 0.72;
    sink.span('structureMetal', -mw / 2, my0, -md / 2, mw / 2, my0 + mh, md / 2, { colour: STEEL });
    const mr: RoofSpec = { kind: 'gable', pitchDeg: 12, eave: 0.3, verge: 0.25, thickness: 0.08, bucket: 'roof', ridge: 'saddle' };
    emitRoof(sink, roofGeometry(mw, md, my0 + mh, mr), mr);
    for (const sx of [-1, 1]) {
      const f: Face = sx > 0 ? { origin: [mw / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: md } : { origin: [-mw / 2, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: md };
      for (let u = -md / 2 + 0.9; u < md / 2 - 0.6; u += 1.6) facePanel(sink, paneBucket(look, 0.15), f, u, my0 + mh * 0.55, 0.012, 1.3, 0.75, { decor: true, window: f.out });
    }
    const sz = (rng() < 0.5 ? -1 : 1) * (D / 2 - 1.2);
    sink.span('stone', W / 2 - 1.6, 0, sz - 0.5, W / 2 - 0.6, frame.roof.ridgeTopY + 2.2, sz + 0.5);
  });
  return sink.finish();
};

/**
 * The grain store (zernosklad): a long low building of whitewashed saman or silicate brick filling the lot under a gable
 * of asbestos sheet, plank double doors down both long sides, louvred vents in the gables. (The props census,
 * 2026-10-14: "the grain store with eaves, buttresses and ramps") The long walls stand against the grain's thrust on
 * brick buttresses between the doors, stepped back once and weathered at the top; the sheet roof oversails the walls
 * on its rafter feet with a fascia board and a gutter; each door is reached by a concrete ramp the lorries back up, its
 * kerbs either side.
 */
const grainStore = (ctx: RegionalBuildContext): RegionalParts => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), rng = st.rng, look = st.look;
  const fp = footprint(ctx);
  const wall: RegionalBucket = rng() < 0.3 ? 'plaster3' : 'plaster';
  onLot(sink, fp, (Wl, Ll) => {
    // (the body fills the lot, the coordinator's rule; the buttresses stand half a metre out of it)
    const W = Wl - 0.1, D = Ll - 0.1;
    const doors: Opening[] = [];
    for (const face of ['left', 'right'] as const) {
      const n = Math.max(2, Math.floor(D / 7));
      for (let k = 0; k < n; k++) doors.push({ face, storey: 0, kind: 'door', u: -D / 2 + D * (k + 0.5) / n, w: 2.0, y0: 0, h: 2.4 });
    }
    // (dome-detail-275) the lorries' gate in the back gable
    doors.push({ face: 'back', storey: 0, kind: 'door', u: 0, w: 2.8, y0: 0, h: 2.9 });
    const plinth = 0.6, wallH = 3.4;
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: plinth, out: 0.05, bucket: 'plaster2' }, storeys: [{ h: wallH, wall }],
      roof: sheetRoof('gable', 20, false, 0.6, 0.4), gableBucket: wall, openings: doors, chimneys: [],
      gutters: { colour: rgb(0x8a8e8c) }, verge: null, rafters: shade(PLANK, 0.8),
      spall: wall === 'plaster' ? null : undefined,
    }, {
      window: () => {},
      door: (s, face, o, y0) => {
        const r = s.recess, go = r > 0 ? -r + 0.03 : 0.015;
        for (const side of [-1, 1]) faceBox(s, 'structureWood', face, o.u + side * o.w / 4, y0 + o.y0 + o.h / 2, go, o.w / 2 - 0.03, o.h, 0.05, { colour: PLANK, decor: true });
        // (dome-detail-275) each leaf's ledges and its brace (a Z of planks), the cast lintel standing proud over the
        // opening, the sheet hood over it on two brackets
        const yb = y0 + o.y0, lc = shade(PLANK, 0.78);
        for (const side of [-1, 1]) {
          const uc = o.u + side * o.w / 4, lw = o.w / 2 - 0.12;
          for (const t of [0.12, 0.88]) faceBox(s, 'structureWood', face, uc, yb + o.h * t, go + 0.045, lw, 0.12, 0.04, { colour: lc, decor: true });
          s.member('structureWood', facePoint(face, uc - side * lw / 2, yb + o.h * 0.16, go + 0.025), facePoint(face, uc + side * lw / 2, yb + o.h * 0.84, go + 0.025), 0.1, 0.04, face.out, { colour: lc, decor: true }, 0);
        }
        faceBox(s, 'plaster2', face, o.u, yb + o.h + 0.14, 0.04, o.w + 0.5, 0.28, 0.08, { decor: true, shade: 0.88 });
        const hy = yb + o.h + 0.42, hc = shade(SHEET[1], 0.95);
        s.quad('structureMetal', facePoint(face, o.u - o.w / 2 - 0.3, hy, 0), facePoint(face, o.u - o.w / 2 - 0.3, hy - 0.18, 0.62), facePoint(face, o.u + o.w / 2 + 0.3, hy - 0.18, 0.62), facePoint(face, o.u + o.w / 2 + 0.3, hy, 0), { colour: hc, decor: true });
        s.quad('structureMetal', facePoint(face, o.u + o.w / 2 + 0.3, hy, 0), facePoint(face, o.u + o.w / 2 + 0.3, hy - 0.18, 0.62), facePoint(face, o.u - o.w / 2 - 0.3, hy - 0.18, 0.62), facePoint(face, o.u - o.w / 2 - 0.3, hy, 0), { colour: shade(hc, 0.6), decor: true });
        for (const side of [-1, 1]) s.member('structureMetal', facePoint(face, o.u + side * (o.w / 2 + 0.1), hy - 0.55, 0), facePoint(face, o.u + side * (o.w / 2 + 0.1), hy - 0.157, 0.55), 0.05, 0.05, [face.u[0] * side, 0, face.u[2] * side], { colour: STEEL_DARK, decor: true, exposed: true }, 0);
        // the ramp from the yard to the threshold (the plinth's height), its kerbs either side
        ramp(s, face, o.u, o.w + 0.6, plinth, o.face === 'back' ? 1.05 : 0.5, 'plaster2');
      },
      // (props census #15, Lane C 2026-10-16: each gable's vent was a dark plate under its slats) cut through the gable
      gableOpenings: (_face, poly) => {
        const base = poly[0][1], vy = base + (Math.max(...poly.map(([, y]) => y)) - base) * 0.4;
        return [{ u0: -0.6, u1: 0.6, y0: vy - 0.35, y1: vy + 0.35 }];
      },
    });
    // the buttresses: on the long walls, between the doors and at the ends, stepped back once and weathered
    for (const name of ['left', 'right'] as const) {
      const f = frame.faces[name], us: number[] = [];
      const ds = doors.filter((o) => o.face === name).map((o) => o.u);
      const edges = [-D / 2 + 0.35, ...ds.slice(1).map((u, k) => (u + ds[k]) / 2), D / 2 - 0.35];
      for (const u of edges) us.push(u);
      for (const u of us) {
        const h = plinth + wallH;
        faceBox(sink, 'stone', f, u, h * 0.3 - 0.15, 0.25, 0.64, h * 0.6 + 0.3, 0.5, {});
        faceBox(sink, 'stone', f, u, h * 0.72, 0.16, 0.56, h * 0.24, 0.32, {});
        // the weathering: a sloped cap shedding off the upper step
        const a = facePoint(f, u - 0.28, h * 0.84, 0.32), b = facePoint(f, u + 0.28, h * 0.84, 0.32);
        const c = facePoint(f, u + 0.28, h * 0.84 + 0.22, 0), d = facePoint(f, u - 0.28, h * 0.84 + 0.22, 0);
        sink.quad('stone', a, b, c, d, { decor: true });
        sink.polygon('stone', [facePoint(f, u - 0.28, h * 0.84, 0), a, d], { decor: true });
        sink.polygon('stone', [facePoint(f, u + 0.28, h * 0.84, 0), c, b], { decor: true });
      }
    }
    for (const f of [frame.faces.front, frame.faces.back]) {
      const vy = frame.eaveY + (frame.roof.ridgeY - frame.eaveY) * 0.4;
      for (let k = 0; k < 4; k++) faceBox(sink, 'structureWood', f, 0, vy - 0.27 + k * 0.18, -0.04, 1.2, 0.07, 0.08, { colour: PLANK, decor: true, fine: true });
    }
    // (dome-detail-275) the string course marking off each gable's triangle at the eaves
    for (const f of [frame.faces.front, frame.faces.back]) faceBox(sink, 'plaster2', f, 0, frame.eaveY - 0.1, 0.05, W + 0.1, 0.2, 0.1, { decor: true, shade: 0.88 }, 'ends');
    // (dome-detail-275) the splash and damp darkening the render a hand over the plinth between the doors and buttresses
    for (const name of ['left', 'right', 'front', 'back'] as const) {
      const f = frame.faces[name], stops = [-f.width / 2, ...doors.filter((o) => o.face === name).flatMap((o) => [o.u - o.w / 2 - 0.25, o.u + o.w / 2 + 0.25]), f.width / 2];
      for (let k = 0; k + 1 < stops.length; k += 2) if (stops[k + 1] - stops[k] > 0.3) faceBox(sink, wall, f, (stops[k] + stops[k + 1]) / 2, plinth + 0.22, 0.012, stops[k + 1] - stops[k], 0.44, 0.02, { decor: true, shade: 0.8 });
    }
    // (dome-detail-275) the roof: the sheets' laps down each slope, a few sheets replaced (fresher) or lichened (darker),
    // the ridge's three ventilators (a boarded box under a little gable each), the gable's number board
    const rg = frame.roof;
    sheetLaps(sink, rg, look, 3, 0.4);
    for (const z of [-D * 0.3, 0, D * 0.3]) {
      const top = rg.ridgeTopY - 0.05;
      sink.span('structureWood', -0.45, top - 0.35, z - 0.5, 0.45, top + 0.65, z + 0.5, { colour: shade(PLANK, 0.9), decor: true });
      for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) sink.span('structureWood', sx * 0.45, top + 0.12 + k * 0.17, z - 0.42, sx * 0.49, top + 0.2 + k * 0.17, z + 0.42, { colour: shade(PLANK, 0.65), decor: true, fine: true });
      const cap: RoofSpec = { kind: 'gable', pitchDeg: 28, eave: 0.14, verge: 0.14, thickness: 0.06, bucket: 'roof', ridge: null, decor: true };
      sink.placed(0, 0, 0, z, () => emitRoof(sink, roofGeometry(0.9, 1.0, top + 0.65, cap), cap));
    }
    const gf = frame.faces.front;
    faceBox(sink, 'structureWood', gf, W * 0.24, plinth + 2.7, 0.03, 1.5, 0.6, 0.04, { colour: WHITE, decor: true });
    faceBox(sink, 'structureWood', gf, W * 0.24, plinth + 2.7, 0.06, 1.1, 0.14, 0.02, { colour: RED, decor: true, fine: true });
    // (dome-detail-275) a portable belt loader parked along the front gable, its belt raised on its A-frame over its
    // wheels, a spill of grain at its foot
    if (look() < 0.75) {
      const P = (u: number, y: number, o: number) => facePoint(gf, u, y, o), c = pick(look, MACHINE), u0 = -W * 0.36, u1 = u0 + 5.2;
      sink.member('structureMetal', P(u0, 0.45, 0.38), P(u1, 2.9, 0.38), 0.42, 0.16, normalize3([gf.u[0] * -2.45, 5.2, gf.u[2] * -2.45]), { colour: c, decor: true, exposed: true }, 0.08);
      const um = u0 + 2.6;
      const yb = (u: number) => 0.45 + (u - u0) / 5.2 * 2.45 - 0.05;
      for (const o of [0.22, 0.54]) for (const du of [-0.7, 0.7]) {
        sink.member('structureMetal', P(um, 0.35, o), P(um + du, yb(um + du), o), 0.06, 0.06, gf.out, { colour: STEEL_DARK, decor: true, exposed: true }, 0);
      }
      sink.member('structureMetal', P(um, 0.35, 0.08), P(um, 0.35, 0.68), 0.06, 0.06, [0, 1, 0], { colour: STEEL_DARK, decor: true, exposed: true }, 0);
      // its head stayed back to the wall on a hook bar
      sink.member('structureMetal', P(u1 - 0.1, 2.82, 0.4), P(u1 - 0.1, 2.82, 0.0), 0.06, 0.06, [0, 1, 0], { colour: STEEL_DARK, decor: true, exposed: true }, 0);
      for (const o of [0.1, 0.66]) sink.cylinder('structureMetal', facePoint(gf, um, 0.35, o - 0.05), gf.out[2] !== 0 ? 'z' : 'x', 0.1, 0.35, 10, { colour: rgb(0x262626), decor: true });
      sink.member('structureMetal', P(u0 - 0.1, 0.0, 0.38), P(u0 + 0.2, 0.5, 0.38), 0.3, 0.3, [0, 1, 0], { colour: shade(c, 0.8), decor: true, exposed: true }, 0);
      const hp = P(u0 - 0.5, 0, 0.45);
      heap(sink, hp[0], hp[2], 0.6, 0.45, 0.2, GRAIN, look() * 2);
    }
  });
  return sink.finish();
};

/**
 * A loading ramp before a door on `face`: a concrete wedge `w` wide from the threshold at `h` down to the yard over
 * `h / slope` metres, its top sloping out, its sides and nose, and a low kerb along each side (dressing, as the step it
 * replaces).
 */
function ramp(sink: PartSink, face: Face, u: number, w: number, h: number, slope: number, bucket: RegionalBucket): void {
  const run = h / slope, P = (uu: number, y: number, o: number): Vec3 => facePoint(face, uu, y, o);
  const u0 = u - w / 2, u1 = u + w / 2, dec = { decor: true } as const;
  // the top, sloping down and out; the sides (triangles); the nose a few centimetres into the ground
  sink.quad(bucket, P(u0, h, 0), P(u0, -0.05, run), P(u1, -0.05, run), P(u1, h, 0), dec);
  sink.polygon(bucket, [P(u0, -0.05, 0), P(u0, -0.05, run), P(u0, h, 0)], dec);
  sink.polygon(bucket, [P(u1, -0.05, 0), P(u1, h, 0), P(u1, -0.05, run)], dec);
  for (const side of [-1, 1]) {
    const uk = side < 0 ? u0 + 0.08 : u1 - 0.08;
    sink.member(bucket, P(uk, h + 0.08, 0.02), P(uk, 0.06, run - 0.05), 0.16, 0.14, [0, 1, 0], dec, 0.04);
  }
}

/**
 * The warehouse lots: the widest (16 m and more) is the station's long grain store, laid along the lot's long side
 * (onLot), else the repair shop or a grain store. (2026-10-10, the facades lane's ruling on the Tarkhan landing: the
 * station's elevator is the landmark's, landmarks grainElevator on the siding, and this lot is its long store across the
 * track — one elevator, not two. The width is tested before any draw, so the store builds from the lot's own stream like
 * any store lot; the kit's elevator stays a builder of its own, `elevator`, for an authored site that asks for one.)
 */
const warehouse: RegionalBuilder = (ctx) => (ctx.info.w >= 16 ? grainStore(ctx) : ctx.rng() < 0.5 ? workshop(ctx) : grainStore(ctx));

/**
 * The conveyor gallery: the intake shed where the lorries tip at one end, the enclosed belt gallery rising on two steel
 * portal trestles as wide as the lot to the wagon-loading bin at the other end, its spout and ladder.
 */
const conveyor: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const fp = footprint(ctx);
  onLot(sink, fp, (Wl, Ll) => {
    const half = Ll / 2, hw = Wl / 2;
    // along z: the intake at +z, the bin tower at -z
    const binS = Math.min(Wl, 4.4), binH = 13 + rng() * 2;
    const z0 = -half + binS / 2;
    sink.span('plaster2', -hw, -0.4, -half, hw, 2.2, -half + binS);
    sink.span('plaster2', -binS / 2, 2.2, z0 - binS / 2, binS / 2, binH, z0 + binS / 2);
    sink.span('plaster2', -binS / 2 - 0.15, binH, z0 - binS / 2 - 0.15, binS / 2 + 0.15, binH + 0.3, z0 + binS / 2 + 0.15);
    recordLattice(sink, [{ foot: [0, 2.2, z0], head: [0, binH, z0] }], [], binS, 'regionalPlaster2', null, null); // (227, lane B co-hold: the bin tower a column that falls as its frame, latticeFall.ts)
    // (dome-detail-275) the bin tower's slip-formed concrete: its corner pilasters proud the full height, a floor band
    // every 3.2 m between them, the stair's strip of small windows up the +x and -z faces (each pane on a concrete sill
    // under a lintel), the cap's drip under its edge
    const binFaces: Face[] = [
      { origin: [0, 0, z0 + binS / 2], u: [1, 0, 0], out: [0, 0, 1], width: binS },
      { origin: [binS / 2, 0, z0], u: [0, 0, -1], out: [1, 0, 0], width: binS },
      { origin: [0, 0, z0 - binS / 2], u: [-1, 0, 0], out: [0, 0, -1], width: binS },
      { origin: [-binS / 2, 0, z0], u: [0, 0, 1], out: [-1, 0, 0], width: binS },
    ];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      sink.quoin('plaster2', sx * (binS / 2 - 0.32), 2.2, z0 + sz * (binS / 2 - 0.32), sx * (binS / 2 + 0.07), binH, z0 + sz * (binS / 2 + 0.07), sx, sz, { decor: true, shade: 0.92 });
    }
    for (const f of binFaces) {
      for (let y = 5.4; y < binH - 1.2; y += 3.2) faceBox(sink, 'plaster2', f, 0, y, 0.04, binS - 0.5, 0.2, 0.08, { decor: true, shade: 0.84 }, 'ends');
      faceBox(sink, 'plaster2', f, 0, binH - 0.08, 0.2, binS + 0.3, 0.16, 0.1, { decor: true, shade: 0.8 }, 'ends');
    }
    for (const f of [binFaces[1], binFaces[2]]) for (let y = 3.9; y < binH - 1.6; y += 3.2) {
      facePanel(sink, paneBucket(look, 0.12), f, 0, y, 0.012, 0.6, 0.9, { decor: true, window: f.out });
      faceBox(sink, 'plaster2', f, 0, y - 0.51, 0.06, 0.82, 0.1, 0.14, { decor: true, shade: 0.9 });
      faceBox(sink, 'plaster2', f, 0, y + 0.52, 0.03, 0.82, 0.14, 0.07, { decor: true, shade: 0.86 });
    }
    // (dome-detail-275) the head house on the cap where the belt's head pulley turns: its walls, a pane each side, a low
    // gable of sheet (a covering of its own, dressing over the tower's solid cap)
    {
      const hx = Math.min(1.5, binS / 2 - 0.5), hz0 = z0 - binS / 2 + 0.5, hz1 = z0 + binS / 2 - 0.2, hy = binH + 0.3, hh = 2.3;
      sink.span('plaster2', -hx, hy, hz0, hx, hy + hh, hz1, DEC);
      sink.band('plaster2', -hx - 0.05, hy + hh - 0.18, hz0 - 0.05, hx + 0.05, hy + hh, hz1 + 0.05, { decor: true, shade: 0.86 });
      const hr: RoofSpec = { ...sheetRoof('gable', 16, true, 0.3, 0.25), decor: true };
      sink.placed(0, 0, 0, (hz0 + hz1) / 2, () => emitRoof(sink, roofGeometry(2 * hx, hz1 - hz0, hy + hh, hr), hr, pick(look, SHEET)));
      const hf: Face[] = [{ origin: [hx, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: hz1 - hz0 }, { origin: [-hx, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: hz1 - hz0 }];
      for (const f of hf) facePanel(sink, paneBucket(look, 0.1), f, f.out[0] > 0 ? -(hz0 + hz1) / 2 : (hz0 + hz1) / 2, hy + 1.3, 0.012, 1.1, 0.7, { decor: true, window: f.out });
    }
    // (dome-detail-275) the drive-through's gate in the bin's base storey, the base's coping, its ladder to the roof
    {
      const bf: Face = { origin: [hw, 0, z0], u: [0, 0, -1], out: [1, 0, 0], width: binS };
      steelGate(sink, bf, 0, 0, Math.min(3.0, binS - 1.0), 1.95, pick(look, GATE));
      sink.band('plaster2', -hw - 0.06, 2.05, -half - 0.06, hw + 0.06, 2.3, -half + binS + 0.06, { decor: true, shade: 0.84 });
      steelLadder(sink, [-hw, 0, z0 + binS / 2 - 0.5], [-1, 0, 0], 3.1, 0.14, STEEL_DARK);
      // the tower's own ladder from the base roof to the cap, caged above head height
      steelLadder(sink, [-binS / 2, 2.2, z0 - 0.6], [-1, 0, 0], binH + 1.2, 0.16, STEEL_DARK, 4.6);
    }
    const shedL = Math.min(4.5, Ll * 0.22), zi = half - shedL / 2;
    // (props census #15, Lane C 2026-10-16: the intake's open front was a dark plate on a box) its front cut open, the
    // dark of the intake behind it
    holedBox(sink, 'plaster', -hw, zi - shedL / 2, hw, half, -0.4, 3.2, { front: [{ u0: -(Wl - 1.0) / 2, u1: (Wl - 1.0) / 2, y0: 0.2, y1: 2.6 }] }, 0.3, 0.3);
    recordFrameHouse(sink, 0, zi, Wl, shedL, 3.36, 'plaster'); // (227, lane B co-hold: the intake shed a house body, its own heap)
    sink.band('stone', -hw - 0.04, -0.1, zi - shedL / 2 - 0.04, hw + 0.04, 0.45, half + 0.04, { decor: true });
    sink.band('plaster2', -hw - 0.08, 2.95, zi - shedL / 2 - 0.08, hw + 0.08, 3.2, half + 0.08, { decor: true, shade: 0.9 });
    sink.span('roof', -hw - 0.25, 3.2, zi - shedL / 2 - 0.2, hw + 0.25, 3.36, half + 0.25);
    // (dome-detail-275) the intake: its corner pilasters, the steel lintel over the tipping bay on its bearing pads, the
    // sheet canopy over the mouth on two brackets, the concrete apron the lorries stand on and the grain they spill, the
    // steel door into the side and the dust cyclone on the roof with its duct to the gallery
    {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const zc = sz > 0 ? half : zi - shedL / 2;
        sink.quoin('plaster', sx * (hw - 0.3), 0.45, zc - sz * 0.3, sx * (hw + 0.05), 2.95, zc + sz * 0.05, sx, sz, DEC);
      }
      const mouth: Face = { origin: [0, 0, half], u: [1, 0, 0], out: [0, 0, 1], width: Wl };
      faceBox(sink, 'structureMetal', mouth, 0, 2.72, 0.05, Wl - 0.7, 0.24, 0.1, { colour: STEEL_DARK, decor: true });
      const cy = 3.0, cl = 0.55, cc = pick(look, SHEET);
      sink.quad('structureMetal', facePoint(mouth, -hw + 0.1, cy, 0), facePoint(mouth, -hw + 0.1, cy - 0.16, cl), facePoint(mouth, hw - 0.1, cy - 0.16, cl), facePoint(mouth, hw - 0.1, cy, 0), { colour: cc, decor: true });
      sink.quad('structureMetal', facePoint(mouth, hw - 0.1, cy, 0), facePoint(mouth, hw - 0.1, cy - 0.16, cl), facePoint(mouth, -hw + 0.1, cy - 0.16, cl), facePoint(mouth, -hw + 0.1, cy, 0), { colour: shade(cc, 0.7), decor: true });
      for (const sx of [-1, 1]) sink.member('structureMetal', facePoint(mouth, sx * (hw - 0.4), 2.55, 0), facePoint(mouth, sx * (hw - 0.4), cy - 0.17, cl - 0.05), 0.05, 0.05, [sx, 0, 0], { colour: STEEL_DARK, decor: true, exposed: true }, 0);
      sink.span('plaster2', -hw + 0.2, -0.1, half - 0.02, hw - 0.2, 0.06, half + 0.5, { decor: true, shade: 0.9 });
      heap(sink, -hw + 0.9 + look() * 0.6, half + 0.2, 0.55, 0.35, 0.16, GRAIN, look() * 3);
      if (look() < 0.6) heap(sink, hw - 0.7, half - 0.1, 0.4, 0.3, 0.12, shade(GRAIN, 0.92), look() * 3);
      const side: Face = { origin: [hw, 0, zi], u: [0, 0, -1], out: [1, 0, 0], width: shedL };
      steelGate(sink, side, 0.4, 0.45, 0.9, 1.95, pick(look, GATE));
      // the cyclone: a drum on a cone on three legs from the roof, the duct from its head to the gallery's side
      const cx = hw - 0.9, cz = zi + 0.6, ry = 3.36, r = 0.42;
      sink.revolve('structureMetal', [cx, ry + 0.75, cz], 'y', [[0, 0], [0.04, 0.07], [0.85, r], [1.75, r], [1.8, r + 0.04], [1.86, r + 0.04], [1.9, 0.12], [2.05, 0.12], [2.05, 0]], 12, { colour: SILVER, decor: true });
      for (let k = 0; k < 3; k++) {
        const a = k * Math.PI * 2 / 3 + 0.4;
        sink.member('structureMetal', [cx + Math.cos(a) * 0.55, ry, cz + Math.sin(a) * 0.55], [cx + Math.cos(a) * (r - 0.03), ry + 1.62, cz + Math.sin(a) * (r - 0.03)], 0.05, 0.05, [Math.cos(a), 0, Math.sin(a)], { colour: STEEL_DARK, decor: true, exposed: true }, 0);
      }
      const duct = { colour: shade(SILVER, 0.85), decor: true } as const;
      sink.pipe('structureMetal', [cx - r + 0.05, ry + 2.3, cz], [0.2, ry + 2.3, cz], 0.11, 8, duct);
      sink.pipe('structureMetal', [0.2, ry + 2.41, cz], [0.2, ry - 0.05, cz], 0.11, 8, { ...duct, caps: true });
    }
    const a: Vec3 = [-1.0, 2.9, zi - shedL / 2 + 0.6], b: Vec3 = [-1.0, binH - 2.2, z0 + binS / 2 - 0.4];
    // (the r2 sweep, boxShare 0.67: the gallery a plain box) the belt gallery under its own pitched sheet roof: its section
    // two metres wide, its walls 1.9 m to the eaves and the roof's ridge over them, run from the intake up to the bin
    const al = Math.hypot(b[1] - a[1], b[2] - a[2]), d: Vec3 = [0, (b[1] - a[1]) / al, (b[2] - a[2]) / al];
    const pv: Vec3 = [0, Math.abs(d[2]), -d[1] * Math.sign(d[2] || 1)];
    const pl = Math.hypot(pv[1], pv[2]) || 1, p: Vec3 = [0, pv[1] / pl, pv[2] / pl];
    {
      const prof: Array<[number, number]> = [[-1.0, -0.95], [1.0, -0.95], [1.0, 0.95], [0, 1.35], [-1.0, 0.95]];
      let pts: Vec3[] = prof.map(([X, Q]) => [X, a[1] + p[1] * Q, a[2] + p[2] * Q]);
      const e1 = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]], e2 = [pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]];
      const nn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      if (nn[0] * d[0] + nn[1] * d[1] + nn[2] * d[2] < 0) pts = pts.reverse();
      sink.prism('structureMetal', pts, d, al, { colour: rgb(0x8e9490) });
    }
    // (dome-detail-275) the gallery's frame: its bottom chords along the floor's edges, the posts between its sheets every
    // 1.5 m (each sheet a tone of its own as it weathered), the eave angles and the ridge roll
    {
      const G = (X: number, s: number, Q: number): Vec3 => [X, a[1] + d[1] * s + p[1] * Q, a[2] + d[2] * s + p[2] * Q];
      const chord = { colour: STEEL_DARK, decor: true, exposed: true } as const;
      for (const X of [-1.0, 1.0]) {
        sink.member('structureMetal', G(X * 1.06, 0, -1.08), G(X * 1.06, al, -1.08), 0.2, 0.26, [X, 0, 0], chord, 0.1);
        sink.member('structureMetal', G(X * 1.0, 0, 0.95), G(X * 1.0, al, 0.95), 0.1, 0.06, [X, 0, 0], { colour: shade(STEEL_DARK, 1.3), decor: true }, 0);
        for (let s = 0.75; s < al - 0.3; s += 1.5) {
          const c = shade(rgb(0x8e9490), 0.86 + look() * 0.2);
          sink.member('structureMetal', G(X, s, -0.95), G(X, s, 0.95), 0.08, 0.05, [X, 0, 0], { colour: c, decor: true }, 0);
        }
      }
      sink.member('structureMetal', G(0, 0, 1.33), G(0, al, 1.33), 0.16, 0.08, p, { colour: shade(STEEL_DARK, 1.2), decor: true, exposed: true }, 0.04);
    }
    // the portal trestles: a leg at each side of the lot, a crossbeam under the gallery, a brace
    const trestleZ: number[] = [];
    for (const t of [0.34, 0.68]) {
      const z = a[2] + (b[2] - a[2]) * t, y = a[1] + (b[1] - a[1]) * t - 1.0;
      trestleZ.push(z);
      // (the legs' arrises: a rolled section's flanges read as an octagon)
      for (const x of [-hw + 0.2, hw - 0.2]) sink.cylinder('structureMetal', [x, -0.3, z], 'y', y + 0.3, 0.15 / Math.cos(Math.PI / 8), 8, { colour: STEEL_DARK }, 0.15 / Math.cos(Math.PI / 8), true, Math.PI / 8);
      sink.span('structureMetal', -hw + 0.05, y - 0.3, z - 0.12, hw - 0.05, y, z + 0.12, { colour: STEEL_DARK });
      recordLattice(sink, [-1, 1].map((sx) => ({ foot: [sx * (hw - 0.2), -0.3, z] as Vec3, head: [sx * (hw - 0.2), y, z] as Vec3 })), [y], 0.3, 'structureMetal', STEEL_DARK, null, undefined, { stand: 0.85 }); // (227, lane B co-hold: each portal trestle its frame)
      sink.member('structureMetal', [-hw + 0.2, 0.4, z], [hw - 0.2, y - 0.4, z], 0.1, 0.1, [0, 0, 1], { colour: STEEL_DARK, decor: true, exposed: true }, 0);
      // (dome-detail-275) the second brace of the cross, a girt at mid height, the knee braces into the crossbeam, the
      // bearing stools the gallery's chords sit on, and the legs' footings
      sink.member('structureMetal', [hw - 0.2, 0.4, z], [-hw + 0.2, y - 0.4, z], 0.1, 0.1, [0, 0, 1], { colour: STEEL_DARK, decor: true, exposed: true }, 0);
      sink.member('structureMetal', [-hw + 0.2, y * 0.42, z], [hw - 0.2, y * 0.42, z], 0.12, 0.1, [0, 0, 1], { colour: STEEL_DARK, decor: true, exposed: true }, 0);
      for (const sx of [-1, 1]) {
        sink.member('structureMetal', [sx * (hw - 0.2), y - 1.0, z], [sx * (hw - 1.0), y - 0.28, z], 0.1, 0.1, [0, 0, 1], { colour: STEEL_DARK, decor: true, exposed: true }, 0);
        footing(sink, sx * (hw - 0.2), z, 0.7, 0.25);
        const s = (z - a[2]) / d[2], top = a[1] + d[1] * s + p[1] * -1.18 + 0.02;
        sink.span('structureMetal', sx * 1.06 - 0.12, y, z - 0.15, sx * 1.06 + 0.12, top, z + 0.15, { colour: STEEL_DARK, decor: true });
      }
    }
    // (dome-detail-275) the ties between the trestles at the girt, one down each side
    for (const sx of [-1, 1]) {
      const y0 = (a[1] + (b[1] - a[1]) * 0.34 - 1.0) * 0.42;
      sink.member('structureMetal', [sx * (hw - 0.2), y0, trestleZ[0]], [sx * (hw - 0.2), y0, trestleZ[1]], 0.1, 0.1, [sx, 0, 0], { colour: STEEL_DARK, decor: true, exposed: true }, 0);
    }
    const len = Math.hypot(b[1] - a[1], b[2] - a[2]), dy = (b[1] - a[1]) / len, dz = (b[2] - a[2]) / len;
    for (let s = 1.4; s < len - 0.8; s += 2.2) {
      const y = a[1] + dy * s + 0.25, z = a[2] + dz * s;
      // (the r2 sweep: the windows were dark plates on the gallery's side) each a louvred vent for the belt's dust: its
      // pressed-steel frame standing out of the sheet, three slats across it sloped down and out
      const fr = { colour: STEEL_DARK, decor: true } as const;
      for (const dyy of [-0.25, 0.25]) sink.span('structureMetal', 1.0, y + dyy - 0.03, z - 0.31, 1.12, y + dyy + 0.03, z + 0.31, fr);
      for (const dzz of [-0.31, 0.31]) sink.span('structureMetal', 1.0, y - 0.22, z + dzz - 0.03, 1.12, y + 0.22, z + dzz + 0.03, fr);
      for (const dyy of [-0.12, 0, 0.12]) sink.member('structureMetal', [1.03, y + dyy + 0.04, z - 0.28], [1.03, y + dyy + 0.04, z + 0.28], 0.11, 0.012,
        normalize3([1, 1.1, 0]), { colour: shade(STEEL_DARK, 1.2), decor: true, exposed: true }, 0);
    }
    sink.member('structureMetal', [binS / 2, binH * 0.45, z0], [binS / 2 + 1.0, binH * 0.3, z0], 0.35, 0.35, [0, 0, 1], { colour: STEEL, decor: true, exposed: true }, 0);
    // (dome-detail-275) the spout's slide gate at its root on the wall, the rust run down the concrete under it
    faceBox(sink, 'structureMetal', binFaces[1], 0, binH * 0.45 + 0.05, 0.2, 0.7, 0.6, 0.4, { colour: STEEL_DARK, decor: true });
    faceBox(sink, 'structureMetal', binFaces[1], 0.25, binH * 0.45 - 0.9, 0.012, 0.12, 1.4, 0.02, { colour: RUST, decor: true });
  });
  return sink.finish();
};

// ---------------------------------------------------------------------------------------------------------- the MTS

/**
 * The MTS garage: a long block of silicate brick filling the lot under a shed roof of asbestos sheet, rows of steel gates
 * down both long sides, one standing open on the dark of its bay (closed for the collision at the reveal's back).
 */
const mtsGarage: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), rng = st.rng;
  const fp = footprint(ctx);
  const gate = pick(rng, GATE), H = 4.6;
  // (gauntlet wave 106, round 2: "grey block-grid placeholder walls") whitewash or ochre render over the garages' brick
  const garageWall: RegionalBucket = rng() < 0.7 ? 'plaster' : 'plaster3';
  onLot(sink, fp, (Wl, Ll) => {
    const W = Wl - 0.1, L = Ll - 0.1;
    const bays = Math.max(2, Math.floor(L / 4.6)), bay = L / bays;
    const open = Math.floor(rng() * bays);
    const openings: Opening[] = [];
    for (const face of ['right', 'left'] as const) for (let k = 0; k < bays; k++) {
      openings.push({ face, storey: 0, kind: face === 'right' && k === open ? 'door' : 'gate', u: -L / 2 + bay * (k + 0.5), w: Math.min(3.4, bay - 1.0), y0: 0, h: 3.6 });
    }
    const roof = sheetRoof('shed', 6, false, 0.45, 0.3);
    // (the r2 sweep, boxShare 0.69: the house grammar's plinth and its water table are each one slab the whole plan wide)
    // the footing as a strip under each wall, its top weathered to a bevel, sunk to the frost
    const footT = 0.4, fy = 0.25;
    for (const [ax, az, bx, bz] of [[-W / 2, L / 2, W / 2, L / 2], [W / 2, L / 2, W / 2, -L / 2], [W / 2, -L / 2, -W / 2, -L / 2], [-W / 2, -L / 2, -W / 2, L / 2]] as const) {
      const ux = Math.sign(bx - ax), uz = Math.sign(bz - az), ox = uz, oz = -ux, ext = 0.04;
      const len = Math.hypot(bx - ax, bz - az) + 2 * ext;
      const P = (o: number, y: number): Vec3 => [ax - ux * ext + ox * o, y, az - uz * ext + oz * o];
      sink.prism('plaster2', [P(-footT + ext, -0.6), P(ext, -0.6), P(ext, fy - 0.06), P(ext - 0.05, fy), P(-footT + ext, fy)], [ux, 0, uz], len, {});
    }
    const frame = buildHouse(sink, {
      w: W, d: L, plinth: null, storeys: [{ h: H, wall: garageWall }],
      roof, gableBucket: garageWall, openings, chimneys: [], gutters: null, verge: null, reveal: 0.2,
    }, {
      ...dialect(st, gate),
      door: (s, face, o, y0) => {
        if (o.kind === 'gate') { steelGate(s, face, o.u, y0 + o.y0, o.w, o.h, gate); return; }
        faceBox(s, 'dark', face, o.u, y0 + o.y0 + o.h / 2, -s.recess + 0.03, o.w, o.h, 0.04, {});
        // (the r2 sweep: the open leaf lay on the wall, a plate) the leaf slid back on its track: the rail on its brackets
        // over the opening and the wall beside it, the leaf hung from it on two trolleys, a hand off the bricks, its frame
        // of angles round its sheet and its bottom guide
        const ly = y0 + o.y0, lu = o.u + o.w * 0.75, lw = o.w * 0.5, lo = 0.16, top = ly + o.h + 0.16;
        faceBox(s, 'structureMetal', face, o.u + o.w * 0.25, top, 0.12, o.w * 1.6, 0.1, 0.08, { colour: STEEL_DARK, decor: true });
        for (const du of [-0.7, 0, 0.7]) faceBox(s, 'structureMetal', face, o.u + o.w * (0.25 + du * 0.8), top, 0.04, 0.06, 0.06, 0.08, { colour: STEEL_DARK, decor: true });
        faceBox(s, 'structureMetal', face, lu, ly + o.h / 2, lo, lw - 0.06, o.h - 0.06, 0.03, { colour: gate, decor: true });
        for (const side of [-1, 1]) faceBox(s, 'structureMetal', face, lu + side * (lw / 2 - 0.03), ly + o.h / 2, lo + 0.015, 0.06, o.h, 0.06, { colour: shade(gate, 0.8), decor: true });
        for (const t of [0.04, 0.5, 0.96]) faceBox(s, 'structureMetal', face, lu, ly + o.h * t, lo + 0.015, lw, 0.06, 0.06, { colour: shade(gate, 0.8), decor: true });
        for (const du of [-lw * 0.3, lw * 0.3]) faceBox(s, 'structureMetal', face, lu + du, ly + o.h + 0.07, lo, 0.05, 0.14, 0.04, { colour: STEEL_DARK, decor: true, fine: true });
        faceBox(s, 'structureMetal', face, lu, ly + 0.03, 0.09, lw, 0.06, 0.06, { colour: STEEL_DARK, decor: true });
      },
    });
    shedGables(sink, W, L, frame.eaveY, Math.tan(6 * Math.PI / 180), garageWall);
    for (const name of ['left', 'right'] as const) {
      pilasters(sink, frame.faces[name], 0.25, frame.eaveY, bay, openings.filter((o) => o.face === name).map((o): [number, number] => [o.u - o.w / 2, o.u + o.w / 2]));
    }
    // (dome-detail-275) the bays' cast lintels over the gates on their bearings, the concrete apron the tractors stand on
    // before each row (its oil stains), the damp at the walls' foot between the gates
    const look = st.look;
    for (const name of ['left', 'right'] as const) {
      const f = frame.faces[name], own = openings.filter((o) => o.face === name);
      for (const o of own) faceBox(sink, 'plaster2', f, o.u, o.h + 0.17, 0.05, o.w + 0.6, 0.34, 0.1, { decor: true, shade: 0.88 });
      faceBox(sink, 'plaster2', f, 0, -0.02, 0.3, L - 0.2, 0.14, 0.55, { decor: true, shade: 0.9 }, 'ends');
      for (const o of own) if (look() < 0.6) faceBox(sink, 'plaster2', f, o.u + (look() - 0.5) * o.w * 0.6, 0.051, 0.3, 0.6 + look() * 0.6, 0.012, 0.35, { decor: true, shade: 0.5 });
      const stops = [-L / 2, ...own.flatMap((o) => [o.u - o.w / 2 - 0.15, o.u + o.w / 2 + 0.15]), L / 2];
      for (let k = 0; k + 1 < stops.length; k += 2) if (stops[k + 1] - stops[k] > 0.3) faceBox(sink, garageWall, f, (stops[k] + stops[k + 1]) / 2, 0.45, 0.012, stops[k + 1] - stops[k], 0.4, 0.02, { decor: true, shade: 0.8 });
    }
    // (dome-detail-275) the roof: its sheets' laps falling to the gates' side, a patched sheet or two; the low eave's
    // gutter and two downpipes; the high eave's fascia; the stove's pipe up through the sheets under its cap
    const rg = frame.roof, n = normalize3([rg.tanP, 1, 0]);
    for (let x = rg.s - 0.9; x > -rg.s; x -= 1.45) {
      const y = rg.topAt(x, 0);
      if (y !== null) sink.member('roof', [x, y, -rg.halfD - 0.3], [x, y, rg.halfD + 0.3], 0.07, 0.025, n, { decor: true, shade: 0.72, exposed: true }, 0);
    }
    for (let k = 0; k < 3; k++) {
      const x = (look() - 0.5) * (2 * rg.s - 1.6), z = (look() - 0.5) * (L - 3), y = rg.topAt(x, z);
      if (y !== null) sink.member('roof', [x, y, z], [x, y, z + 1.15], 1.3, 0.018, n, { decor: true, shade: look() < 0.4 ? 0.6 : 1.18, exposed: true }, 0);
    }
    const lowY = frame.eaveY - 0.45 * rg.tanP, gut = { colour: rgb(0x8a8e8c), decor: true } as const;
    sink.pipe('structureMetal', [W / 2 + 0.5, lowY - 0.08, -L / 2 - 0.25], [W / 2 + 0.5, lowY - 0.08, L / 2 + 0.25], 0.08, 6, { ...gut, caps: true });
    for (const z of [-L / 2 + 0.25, L / 2 - 0.25]) {
      sink.pipe('structureMetal', [W / 2 + 0.5, lowY - 0.08, z], [W / 2 + 0.06, lowY - 0.5, z], 0.05, 6, gut);
      sink.pipe('structureMetal', [W / 2 + 0.06, lowY - 0.48, z], [W / 2 + 0.06, 0.05, z], 0.05, 6, gut);
    }
    const highY = rg.topAt(-rg.s, 0) ?? frame.eaveY;
    sink.member('structureWood', [-W / 2 - 0.47, highY - 0.02, -L / 2 - 0.3], [-W / 2 - 0.47, highY - 0.02, L / 2 + 0.3], 0.24, 0.04, [-1, 0, 0], { colour: shade(PLANK, 0.85), decor: true, exposed: true }, 0);
    {
      const px = -W * 0.2, pz = (look() - 0.5) * L * 0.5, py = rg.topAt(px, pz) ?? frame.eaveY;
      sink.cylinder('structureMetal', [px, py - 0.3, pz], 'y', 1.7, 0.13, 8, { colour: STEEL_DARK, decor: true });
      sink.cylinder('structureMetal', [px, py + 1.38, pz], 'y', 0.22, 0.24, 8, { colour: STEEL_DARK, decor: true }, 0.05);
    }
    // (dome-detail-275) the gables: the station's red board with its white band over the front, on the back the fire
    // board (its red panel, the cone bucket, the hook, the axe and the shovel on their pegs) beside the sand box
    const gf = frame.faces.front, gb = frame.faces.back;
    faceBox(sink, 'structureWood', gf, 0, H * 0.72, 0.04, Math.min(4.2, W * 0.45), 0.7, 0.05, { colour: RED, decor: true });
    faceBox(sink, 'structureWood', gf, 0, H * 0.72, 0.075, Math.min(3.6, W * 0.38), 0.16, 0.02, { colour: WHITE, decor: true, fine: true });
    {
      const u = W * 0.25, fy = 1.35;
      faceBox(sink, 'structureWood', gb, u, fy, 0.03, 1.4, 1.5, 0.05, { colour: RED, decor: true });
      sink.cylinder('structureMetal', facePoint(gb, u - 0.4, fy + 0.15, 0.17), 'y', 0.4, 0.02, 8, { colour: RED, decor: true }, 0.14);
      sink.member('structureMetal', facePoint(gb, u + 0.05, fy - 0.6, 0.07), facePoint(gb, u + 0.05, fy + 0.65, 0.07), 0.04, 0.03, gb.out, { colour: STEEL_DARK, decor: true }, 0);
      sink.member('structureWood', facePoint(gb, u + 0.4, fy - 0.6, 0.07), facePoint(gb, u + 0.4, fy + 0.5, 0.07), 0.04, 0.03, gb.out, { colour: PLANK, decor: true }, 0);
      faceBox(sink, 'structureMetal', gb, u + 0.4, fy + 0.55, 0.09, 0.22, 0.14, 0.02, { colour: STEEL_DARK, decor: true });
      faceBox(sink, 'structureWood', gb, u + 1.25, 0.35, 0.35, 0.9, 0.7, 0.6, { colour: RED, decor: true });
    }
    for (let k = 0; k < 2 + Math.floor(look() * 3); k++) {
      const p = facePoint(gf, -W / 2 + 0.6 + k * 0.62, -0.02, 0.32);
      sink.cylinder('structureMetal', p, 'y', 0.88, 0.29, 10, { colour: pick(look, [rgb(0x4f6a48), rgb(0x8a3a2c), rgb(0x46607a), rgb(0x5a5a52)]), decor: true });
    }
  });
  return sink.finish();
};

/**
 * The implement shed (naves): a long lean-to filling the lot, open along its front on steel posts, a brick back wall and
 * gable ends, a shed roof of asbestos sheet falling to the front; the seed drills under it, the shed's dark depths behind
 * them closed for the collision two metres in.
 */
const implementShed: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const fp = footprint(ctx);
  const hBack = 3.9, hFront = 3.1, wall: RegionalBucket = rng() < 0.25 ? 'stone' : 'plaster';
  onLot(sink, fp, (Wl, Ll) => {
    const W = Wl - 0.1, L = Ll - 0.1;
    sink.span(wall, -W / 2, -0.3, -L / 2, -W / 2 + 0.32, hBack, L / 2);
    const posts = Math.max(2, Math.round(L / 3.6) + 1);
    const postZ: number[] = [];
    for (let k = 0; k < posts; k++) {
      const z = -L / 2 + 0.2 + (L - 0.4) * k / (posts - 1);
      postZ.push(z);
      sink.span('structureMetal', W / 2 - 0.3, -0.3, z - 0.1, W / 2 - 0.1, hFront, z + 0.1, { colour: STEEL_DARK });
    }
    sink.span('structureMetal', W / 2 - 0.35, hFront - 0.25, -L / 2, W / 2 - 0.05, hFront, L / 2, { colour: STEEL_DARK });
    const tanP = (hBack - hFront) / (W - 0.2);
    const roof: RoofSpec = { kind: 'shed', pitchDeg: Math.atan(tanP) * 180 / Math.PI, eave: 0.4, verge: 0.3, thickness: 0.1, bucket: 'roof', ridge: null };
    emitRoof(sink, roofGeometry(W, L, hFront, roof), roof);
    const yAt = (x: number) => hFront + (W / 2 - x) * tanP - 0.02;
    wallPolygon(sink, wall, { origin: [0, 0, L / 2], u: [1, 0, 0], out: [0, 0, 1], width: W }, [[-W / 2, -0.3], [W / 2 - 0.3, -0.3], [W / 2 - 0.3, yAt(W / 2 - 0.3)], [-W / 2, yAt(-W / 2)]], 0.32);
    wallPolygon(sink, wall, { origin: [0, 0, -L / 2], u: [-1, 0, 0], out: [0, 0, -1], width: W }, [[-W / 2 + 0.3, -0.3], [W / 2, -0.3], [W / 2, yAt(-W / 2)], [-W / 2 + 0.3, yAt(W / 2 - 0.3)]], 0.32);
    // the dark depths two metres in from the posts (structural: a hull does not drive through the shed)
    const xd = W / 2 - 2.2;
    if (xd > -W / 2 + 0.5) sink.span('dark', xd - 0.05, -0.3, -L / 2 + 0.3, xd + 0.05, hFront + (W / 2 - xd) * tanP - 0.05, L / 2 - 0.3);
    // (dome-detail-275) the walls built bay by bay: the back wall's brick pilasters, a row of small high vents under its
    // eave (each a dark slot on a sill under a lintel), the plinth's darker band round the three walls, the gable ends'
    // corner piers; the eave's fascia board along the back
    const back: Face = { origin: [-W / 2, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: L };
    const gableF: Face = { origin: [0, 0, L / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
    const gableB: Face = { origin: [0, 0, -L / 2], u: [-1, 0, 0], out: [0, 0, -1], width: W };
    pilasters(sink, back, 0, hBack - 0.05, 3.5);
    const bays = Math.max(2, Math.round((L - 0.6) / 3.5));
    for (let k = 0; k < bays; k++) {
      const u = -L / 2 + 0.3 + (L - 0.6) * (k + 0.5) / bays;
      faceBox(sink, 'dark', back, u, hBack - 0.85, 0.01, 0.9, 0.36, 0.02, DEC);
      faceBox(sink, 'plaster2', back, u, hBack - 1.08, 0.05, 1.1, 0.08, 0.12, { decor: true, shade: 0.9 });
      faceBox(sink, 'plaster2', back, u, hBack - 0.6, 0.03, 1.1, 0.12, 0.07, { decor: true, shade: 0.86 });
    }
    for (const f of [back, gableF, gableB]) faceBox(sink, 'plaster2', f, 0, 0.18, 0.04, f.width + 0.08, 0.5, 0.08, { decor: true, shade: 0.78 }, 'ends');
    for (const f of [gableF, gableB]) faceBox(sink, 'stone', f, (f === gableF ? -W / 2 + 0.3 : W / 2 - 0.3), (yAt(-W / 2) - 0.1) / 2, 0.06, 0.56, yAt(-W / 2) - 0.1, 0.12, DEC, 'caps');
    sink.member('structureWood', [-W / 2 - 0.42, yAt(-W / 2) + 0.12, -L / 2 - 0.3], [-W / 2 - 0.42, yAt(-W / 2) + 0.12, L / 2 + 0.3], 0.2, 0.04, [-1, 0, 0], { colour: shade(PLANK, 0.85), decor: true, exposed: true }, 0);
    // (dome-detail-275) the frame seen through the open front: a steel rafter from each post's head to the back wall, the
    // purlins along under the sheets, a knee brace each side of every post into the eave beam, the eave's fascia and
    // gutter, each post on its footing; the concrete floor run out to an apron past the posts
    const up = normalize3([tanP, 1, 0]);
    const frame = { colour: shade(STEEL_DARK, 1.15), decor: true, exposed: true } as const;
    for (const z of postZ) {
      sink.member('structureMetal', [W / 2 - 0.2, yAt(W / 2 - 0.2) - 0.22, z], [-W / 2 + 0.3, yAt(-W / 2 + 0.3) - 0.22, z], 0.1, 0.2, up, frame, 0);
      footing(sink, W / 2 - 0.2, z, 0.55, 0.12);
      for (const sz of [-1, 1]) {
        if (Math.abs(z + sz * 0.7) > L / 2 - 0.1) continue;
        sink.member('structureMetal', [W / 2 - 0.2, hFront - 1.0, z], [W / 2 - 0.2, hFront - 0.25, z + sz * 0.75], 0.08, 0.08, [1, 0, 0], frame, 0);
      }
    }
    for (const x of [W / 2 - 1.9, -W / 2 + 2.4, -W / 2 + 0.9]) {
      if (x < -W / 2 + 0.5) continue;
      sink.member('structureMetal', [x, yAt(x) - 0.12, -L / 2 + 0.3], [x, yAt(x) - 0.12, L / 2 - 0.3], 0.08, 0.1, up, frame, 0);
    }
    const ey = hFront - 0.4 * tanP;
    sink.member('structureWood', [W / 2 + 0.4, ey + 0.02, -L / 2 - 0.3], [W / 2 + 0.4, ey + 0.02, L / 2 + 0.3], 0.2, 0.04, [1, 0, 0], { colour: shade(PLANK, 0.85), decor: true, exposed: true }, 0);
    sink.pipe('structureMetal', [W / 2 + 0.48, ey - 0.14, -L / 2 - 0.25], [W / 2 + 0.48, ey - 0.14, L / 2 + 0.25], 0.07, 6, { colour: rgb(0x8a8e8c), decor: true, caps: true });
    sink.pipe('structureMetal', [W / 2 + 0.48, ey - 0.14, L / 2 + 0.2], [W / 2 + 0.48, 0.05, L / 2 + 0.2], 0.05, 6, { colour: rgb(0x8a8e8c), decor: true });
    sink.span('plaster2', xd + 0.05, -0.1, -L / 2 + 0.32, W / 2 + 0.4, 0.07, L / 2 - 0.32, { decor: true, shade: 0.86 });
    // (dome-detail-275) the asbestos sheets' laps down the slope, a few sheets replaced in a fresher grey, one darker
    // with lichen
    const top = (xx: number) => hFront + 0.1 + (W / 2 - xx) * tanP;
    for (let xx = W / 2 - 0.9; xx > -W / 2; xx -= 1.45) sink.member('roof', [xx, top(xx), -L / 2 - 0.3], [xx, top(xx), L / 2 + 0.3], 0.07, 0.025, up, { decor: true, shade: 0.72, exposed: true }, 0);
    for (let k = 0; k < 3; k++) {
      const xx = W / 2 - 0.2 - (0.5 + Math.floor(look() * 5)) * 1.45 + 0.72, zz = -L / 2 + 1 + look() * (L - 2.6);
      if (xx < -W / 2 + 0.6) continue;
      sink.member('roof', [xx, top(xx), zz], [xx, top(xx), zz + 1.15], 1.3, 0.018, up, { decor: true, shade: k === 2 ? 0.62 : 1.18, exposed: true }, 0);
    }
    // (dome-detail-275) under the roof: a seed drill (its hopper on two wheels, the coulters' discs in a row under it, the
    // drawbar's A to its hitch), a three-furrow plough on its frame, the oil drums by a gable
    const x = W / 2 - 1.15;
    for (const [k, z] of [-L * 0.24, L * 0.22].entries()) {
      if (look() < 0.2) continue;
      const c = pick(look, MACHINE);
      if (k === 0 || look() < 0.5) {
        const hl = Math.min(1.6, L * 0.12);
        sink.prism('structureMetal', [[x - 0.45, 0.72, z - hl], [x + 0.3, 0.72, z - hl], [x + 0.42, 1.32, z - hl], [x - 0.55, 1.32, z - hl]] as Vec3[], [0, 0, 1], 2 * hl, { colour: c, decor: true });
        sink.span('structureMetal', x - 0.6, 1.32, z - hl - 0.03, x + 0.46, 1.38, z + hl + 0.03, { colour: shade(c, 0.8), decor: true });
        for (const sz of [-1, 1]) {
          sink.cylinder('structureMetal', [x - 0.05, 0.6, z + (sz > 0 ? hl : -hl - 0.1)], 'z', 0.1, 0.6, 12, { colour: STEEL_DARK, decor: true });
          sink.cylinder('structureMetal', [x - 0.05, 0.6, z + (sz > 0 ? hl + 0.1 : -hl - 0.16)], 'z', 0.06, 0.13, 6, { colour: shade(c, 0.7), decor: true });
        }
        for (let t = -hl + 0.2; t < hl - 0.1; t += 0.3) sink.cylinder('structureMetal', [x + 0.05, 0.2, z + t - 0.01], 'z', 0.02, 0.2, 8, { colour: STEEL, decor: true });
        for (const sz of [-1, 1]) sink.member('structureMetal', [x + 0.25, 0.68, z + sz * hl * 0.8], [x + 1.0, 0.42, z], 0.07, 0.07, [0, 1, 0], { colour: c, decor: true, exposed: true }, 0);
        sink.member('structureMetal', [x + 1.0, 0.03, z], [x + 1.0, 0.45, z], 0.07, 0.07, [1, 0, 0], { colour: STEEL_DARK, decor: true, exposed: true }, 0);
      } else {
        // the plough: its beam on a long diagonal, three bodies down it, the gauge wheel and its stand
        const z0 = z - 1.4, z1 = z + 1.4;
        sink.member('structureMetal', [x - 0.3, 0.6, z0], [x + 0.4, 0.6, z1], 0.12, 0.14, [0, 1, 0], { colour: c, decor: true, exposed: true }, 0);
        for (let k2 = 0; k2 < 3; k2++) {
          const t = 0.2 + k2 * 0.3, bx = x - 0.3 + 0.7 * t, bz = z0 + 2.8 * t;
          sink.member('structureMetal', [bx, 0.0, bz], [bx, 0.6, bz], 0.07, 0.08, [1, 0, 0], { colour: shade(c, 0.8), decor: true, exposed: true }, 0);
          sink.prism('structureMetal', [[bx - 0.02, 0.0, bz - 0.35], [bx + 0.06, 0.0, bz + 0.1], [bx + 0.3, 0.35, bz + 0.1]] as Vec3[], [-1, 0, 0], 0.04, { colour: SILVER, decor: true });
        }
        sink.cylinder('structureMetal', [x + 0.35, 0.3, z1 - 0.05], 'x', 0.1, 0.3, 10, { colour: STEEL_DARK, decor: true });
        sink.member('structureMetal', [x + 0.4, 0.0, z0 + 0.1], [x - 0.3, 0.6, z0], 0.06, 0.06, [0, 0, 1], { colour: STEEL_DARK, decor: true, exposed: true }, 0);
      }
    }
    const dz = (look() < 0.5 ? -1 : 1) * (L / 2 - 0.75);
    for (let k = 0; k < 2 + Math.floor(look() * 2); k++) {
      const c = pick(look, [rgb(0x4f6a48), rgb(0x8a3a2c), rgb(0x46607a), rgb(0x5a5a52)]);
      sink.cylinder('structureMetal', [W / 2 - 1.0 + (k % 2) * 0.62, -0.02, dz - Math.sign(dz) * Math.floor(k / 2) * 0.62], 'y', 0.88, 0.29, 10, { colour: c, decor: true });
    }
  });
  return sink.finish();
};

// ---------------------------------------------------------------------------------------------------------- water, fire, fuel

/**
 * The Rozhnovsky water tower: a brick pump house filling the lot, from its roof the welded steel column, the tank wider
 * than it on a conical floor under a low cone, the ladder up the column, the rail round the roof.
 */
const rozhnovsky: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const fp = footprint(ctx);
  const half = Math.min(fp.w, fp.d) / 2;
  // (dome-detail-275) the column a third of the tank's width, as the standard BR towers' riser (it was a thin pole)
  const R = clamp(half * 0.3, 0.6, 0.95), Rt = clamp(half - 0.4, 1.6, 2.6);
  const H = clamp(ctx.info.h + 3, 14, 20), Ht = 3.2 + rng() * 0.6, hp = 2.6;
  const paint = rng() < 0.5 ? SILVER : pick(rng, [rgb(0x8aa4b0), rgb(0x9a9a8e)]);
  // (the props census, 2026-10-14: "the pump house rebuilt as a buildHouse body") the pump house: a house body of its
  // own on its brick plinth, whitewashed, its plank door cut into a reveal with its frame and step, a small barred window
  // in each side, the flat slab roof over a little eave; the column rises from the slab
  const door = pick(rng, PAINTS);
  const st = { ...stateFor(ctx), paint: door };
  sink.placed(0, fp.cx, 0, fp.cz, () => {
    const W = fp.w - 0.2, D = fp.d - 0.2;
    const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: W * 0.2, w: 0.85, y0: 0, h: 1.95 }];
    for (const face of ['right', 'left'] as const) openings.push({ face, storey: 0, kind: 'loft', u: 0, w: 0.6, y0: 1.05, h: 0.5 });
    buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.5, out: 0.05, bucket: 'stone' }, storeys: [{ h: hp - 0.5, wall: 'plaster' }],
      roof: { kind: 'flat', pitchDeg: 0, eave: 0.1, verge: 0.1, thickness: 0.25, bucket: 'plaster2' },
      gableBucket: 'plaster', openings, chimneys: [], gutters: null, verge: null, reveal: 0.25, spall: null,
    }, dialect(st));
    // (dome-detail-275) the pump house's cornice under the slab's edge, the slab's drip, the column's base ring on it
    sink.band('plaster', -W / 2 - 0.06, hp - 0.32, -D / 2 - 0.06, W / 2 + 0.06, hp - 0.12, D / 2 + 0.06, { decor: true, shade: 0.9 });
    const y0 = hp + 0.25;
    sink.revolve('structureMetal', [0, y0, 0], 'y', [[-0.02, R + 0.28], [0.08, R + 0.28], [0.08, R + 0.12], [0.3, R]], 20, { colour: shade(paint, 0.8), decor: true });
    // (dome-detail-275) the welded column, smooth, in plate courses a little each its own tone; its flanged joints
    const courses = Math.max(4, Math.round((H - y0) / 1.8));
    const cprof: Array<[number, number]> = Array.from({ length: courses + 1 }, (_, k) => [(H - y0) * k / courses, R] as [number, number]);
    const ctone = Array.from({ length: courses }, () => shade(paint, 0.86 + look() * 0.16));
    sink.revolve('structureMetal', [0, y0, 0], 'y', cprof, 20, { colour: paint, bandColour: (b) => ctone[b] ?? paint });
    for (const t of [0.34, 0.67]) sink.revolve('structureMetal', [0, y0 + (H - y0) * t, 0], 'y', [[0, R - 0.01], [0.03, R + 0.05], [0.11, R + 0.05], [0.14, R - 0.01]], 20, { colour: shade(paint, 0.78), decor: true });
    // (dome-detail-275) the tank, smooth: its conical floor from the column out to the wall, the wall in three plate
    // courses, the angle ring at its top, the roof's low cone up to the hatch's collar and lid
    const yT = H + 1.1, yR = yT + Ht, rise = (Rt - 0.42) * Math.tan(22 * Math.PI / 180);
    const tprof: Array<[number, number]> = [[0, R], [1.1, Rt], [1.1 + Ht / 3, Rt], [1.1 + Ht * 2 / 3, Rt], [1.1 + Ht, Rt],
      [1.1 + Ht + 0.02, Rt + 0.08], [1.1 + Ht + 0.12, Rt + 0.08], [1.1 + Ht + 0.14, Rt], [1.1 + Ht + 0.14 + rise, 0.42],
      [1.1 + Ht + 0.14 + rise + 0.32, 0.42], [1.1 + Ht + 0.14 + rise + 0.32, 0.48], [1.1 + Ht + 0.14 + rise + 0.42, 0.48], [1.1 + Ht + 0.14 + rise + 0.5, 0]];
    const ttone = [shade(paint, 0.82), shade(paint, 0.9 + look() * 0.1), shade(paint, 0.92 + look() * 0.1), shade(paint, 0.94 + look() * 0.08)];
    sink.revolve('structureMetal', [0, H, 0], 'y', tprof, 24, {
      colour: paint, bandColour: (b) => b < 4 ? ttone[b] : b < 7 ? shade(paint, 0.78) : b === 7 ? shade(paint, 0.86) : shade(STEEL_DARK, 1.3),
    });
    const roofY = (r: number) => yR + 0.14 + (Rt - r) * Math.tan(22 * Math.PI / 180);
    // the rust run down the wall from the angle ring's seams, the overflow pipe down the column to the slab
    for (let k = 0; k < 4; k++) {
      const a = look() * Math.PI * 2, len = 0.8 + look() * 1.6, c = Math.cos(a), s = Math.sin(a);
      sink.member('structureMetal', [c * Rt, yR, s * Rt], [c * Rt, yR - len, s * Rt], 0.1 + look() * 0.1, 0.008, [c, 0, s], { colour: mix(paint, RUST, 0.6), decor: true }, 0);
    }
    const ov = { colour: shade(paint, 0.7), decor: true } as const;
    sink.pipe('structureMetal', [-(R + 0.1), y0 - 0.02, 0], [-(R + 0.1), H + 0.06, 0], 0.06, 6, ov);
    sink.pipe('structureMetal', [-(R + 0.1), H + 0.04, 0], [-(R + 0.55), H + 0.55, 0], 0.06, 6, ov);
    // (dome-detail-275) the ladder: up the column caged above the pump house, out along the tank's floor, up its wall to
    // the roof's rail
    steelLadder(sink, [0, y0, R], [0, 0, 1], H - 0.02, 0.16, STEEL_DARK, y0 + 2.2);
    {
      const z0 = R + 0.16, z1 = Rt + 0.16, rail = { colour: STEEL_DARK, decor: true, exposed: true } as const;
      for (const x of [-0.22, 0.22]) sink.member('structureMetal', [x, H - 0.02, z0], [x, yT, z1], 0.06, 0.05, normalize3([0, -(Rt - R), 1.1]), rail, 0);
      const n = Math.max(2, Math.round(Math.hypot(1.1, Rt - R) / 0.35));
      for (let k = 1; k < n; k++) {
        const t = k / n;
        sink.member('structureMetal', [-0.22, H + 1.1 * t, z0 + (z1 - z0) * t], [0.22, H + 1.1 * t, z0 + (z1 - z0) * t], 0.03, 0.03, [0, 1, 0], { colour: STEEL_DARK, decor: true, fine: true }, 0);
      }
      steelLadder(sink, [0, yT, Rt], [0, 0, 1], yR + 1.0, 0.16, STEEL_DARK);
    }
    const ry = roofY(Rt * 0.62) + 1.0;
    // (2026-10-11, kitConnectivity: the rail floated 4 cm over the roof) on a post at each corner from the roof's cone
    for (let k = 0; k < 12; k++) {
      const a0 = k * Math.PI / 6, a1 = (k + 1) * Math.PI / 6, rr = Rt * 0.62;
      sink.member('structureMetal', [Math.cos(a0) * rr, ry, Math.sin(a0) * rr], [Math.cos(a1) * rr, ry, Math.sin(a1) * rr], 0.035, 0.035, [0, 1, 0], { colour: STEEL_DARK, decor: true, exposed: true, fine: true }, 0);
      sink.member('structureMetal', [Math.cos(a0) * rr, roofY(rr) - 0.04, Math.sin(a0) * rr], [Math.cos(a0) * rr, ry + 0.02, Math.sin(a0) * rr], 0.03, 0.03, [1, 0, 0], { colour: STEEL_DARK, decor: true, exposed: true, fine: true }, 0);
    }
    // (dome-detail-275) the roof's vent under its mushroom cap, the lightning rod off the hatch's lid
    {
      const vr = Rt * 0.45, vy = roofY(vr) - 0.03;
      sink.revolve('structureMetal', [-vr, vy, 0], 'y', [[0, 0.09], [0.4, 0.09], [0.4, 0.22], [0.5, 0.22], [0.58, 0]], 10, { colour: shade(paint, 0.85), decor: true });
      sink.cylinder('structureMetal', [0, yR + 0.14 + rise + 0.5, 0], 'y', 1.6, 0.025, 5, { colour: STEEL_DARK, decor: true }, 0.015);
    }
    recordLattice(sink, [{ foot: [0, hp + 0.25, 0], head: [0, H, 0] }], [], 2 * R, 'structureMetal', paint, { x0: -Rt, x1: Rt, y0: H, y1: H + 2 + Ht, z0: -Rt, z1: Rt, bucket: 'structureMetal', tint: paint }); // (227, lane B co-hold: the column falls as its frame, latticeFall.ts)
  });
  return sink.finish();
};

/** The boiler house's stack: a banded steel chimney on a concrete foundation block filling the lot, its ladder and door. */
const boilerStack: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const fp = footprint(ctx);
  const H = 20 + rng() * 6, r0 = 0.56, r1 = 0.46, hb = 1.4;
  sink.placed(0, fp.cx, 0, fp.cz, () => {
    sink.span('plaster2', -fp.w / 2, -0.4, -fp.d / 2, fp.w / 2, hb, fp.d / 2);
    // (dome-detail-275) the welded shell, smooth (geometry.ts revolve), tapering in plate courses about 1.6 m tall, each
    // course its own grey as it weathered and a rust-run course here and there; the red and white bands at the head, the
    // top course sooted; the lip's flare and the throat's dark inside
    const hTop = H - 3.1, courses = Math.max(6, Math.round((hTop - hb) / 1.6));
    const rAt = (y: number): number => y <= hTop ? r0 + (r1 + 0.03 - r0) * (y - hb) / (hTop - hb) : r1 + 0.02;
    const prof: Array<[number, number]> = [];
    for (let k = 0; k <= courses; k++) { const y = hb + (hTop - hb) * k / courses; prof.push([y - hb, rAt(y)]); }
    for (let k = 1; k <= 4; k++) prof.push([hTop + k * 0.78 - hb, r1 + 0.02]);
    const greys = Array.from({ length: courses }, () => {
      const t = look();
      return t < 0.14 ? mix(rgb(0x55595a), RUST, 0.35 + look() * 0.2) : shade(rgb(0x55595a), 0.9 + t * 0.2);
    });
    sink.revolve('structureMetal', [0, hb, 0], 'y', prof, 16, {
      colour: rgb(0x55595a),
      bandColour: (band) => band < courses ? greys[band] : band === courses + 3 ? shade(rgb(0xd8d6d0), 0.6) : (band - courses) % 2 ? rgb(0xd8d6d0) : RED,
    });
    sink.revolve('structureMetal', [0, H, 0], 'y', [[0, r1 + 0.02], [0.04, r1 + 0.09], [0.14, r1 + 0.09], [0.14, r1 - 0.03], [-0.3, r1 - 0.03], [-0.3, 0]], 16, { colour: rgb(0x2a2826), decor: true });
    // the stiffening rings at the platform, a third and two thirds up the shell
    const yPl = hTop - 0.4;
    for (const y of [hb + (hTop - hb) / 3, hb + (hTop - hb) * 2 / 3]) {
      const r = rAt(y);
      sink.revolve('structureMetal', [0, y, 0], 'y', [[0, r - 0.01], [0.04, r + 0.06], [0.12, r + 0.06], [0.16, r - 0.01]], 16, { colour: STEEL_DARK, decor: true });
    }
    // (dome-detail-275) the foot: the shell's base plate bolted down, the gussets round it, the foundation block's
    // top weathered to a bevel, the brick flue channel from the boiler house in under the skirt (its arched top, its
    // footing), the rust and soot on the concrete
    sink.span('plaster2', -fp.w / 2 + 0.12, hb, -fp.d / 2 + 0.12, fp.w / 2 - 0.12, hb + 0.08, fp.d / 2 - 0.12, { decor: true, shade: 0.92 });
    sink.revolve('structureMetal', [0, hb + 0.08, 0], 'y', [[-0.08, 0.98], [0.06, 0.98], [0.06, r0 - 0.01]], 16, { colour: shade(rgb(0x55595a), 0.85), decor: true });
    for (let k = 0; k < 8; k++) {
      const a = (k + 0.5) * Math.PI / 4, c = Math.cos(a), s = Math.sin(a), t: Vec3 = normalize3([-s, 0, c]);
      const g = (r: number, y: number): Vec3 => [c * r - t[0] * 0.02, y, s * r - t[2] * 0.02];
      sink.prism('structureMetal', [g(r0 - 0.02, hb + 0.14), g(0.94, hb + 0.14), g(r0 - 0.02, hb + 1.0)], t, 0.04, { colour: STEEL_DARK, decor: true });
    }
    {
      const fx0 = 0.55, fx1 = fp.w / 2 + 0.3, fy = hb + 0.08;
      sink.span('stone', fx0, fy, -0.45, fx1, fy + 0.85, 0.45, DEC);
      sink.cylinder('stone', [fx0, fy + 0.85, 0], 'x', fx1 - fx0, 0.45, 8, DEC, 0.45, true, -Math.PI / 2, Math.PI);
      sink.span('plaster2', fx0 + 0.05, fy - 0.02, -0.55, fx1 + 0.05, fy + 0.1, 0.55, { decor: true, shade: 0.8 });
    }
    const f: Face = { origin: [0, 0, fp.d / 2], u: [1, 0, 0], out: [0, 0, 1], width: fp.w };
    // (the r2 sweep: the stoke hole's door was a plate on the base) the cast-iron door in its frame: the frame's sides and
    // its lintel standing 15 cm out of the base round the leaf, the leaf's hinges and its latch bar
    faceBox(sink, 'structureMetal', f, 0, 0.75, 0.02, 0.6, 0.6, 0.04, { colour: STEEL_DARK, decor: true });
    for (const side of [-1, 1]) faceBox(sink, 'structureMetal', f, side * 0.36, 0.75, 0.075, 0.1, 0.84, 0.15, { colour: rgb(0x3a3c3c), decor: true });
    for (const dy of [-0.37, 0.37]) faceBox(sink, 'structureMetal', f, 0, 0.75 + dy, 0.075, 0.82, 0.1, 0.15, { colour: rgb(0x3a3c3c), decor: true });
    for (const dy of [-0.18, 0.18]) faceBox(sink, 'structureMetal', f, -0.25, 0.75 + dy, 0.05, 0.08, 0.06, 0.03, { colour: rgb(0x2a2a2a), decor: true, fine: true });
    faceBox(sink, 'structureMetal', f, 0.05, 0.75, 0.055, 0.42, 0.04, 0.03, { colour: rgb(0x2a2a2a), decor: true, fine: true });
    // the soot fanned up the block over the door and a rust run down from the skirt
    faceBox(sink, 'plaster2', f, 0, 1.15, 0.01, 0.9, 0.5, 0.02, { decor: true, shade: 0.55 });
    faceBox(sink, 'plaster2', f, 0.9, 0.7, 0.01, 0.16, 1.3, 0.02, { decor: true, shade: 0.7, tint: [1.08, 0.86, 0.72] });
    // (dome-detail-275) the ladder from the block to the platform, caged above head height; the platform on its four
    // brackets under the bands, its grating, its rail on posts
    steelLadder(sink, [0, hb + 0.08, r0], [0, 0, 1], yPl + 1.1, 0.16, STEEL_DARK, hb + 2.6);
    {
      const ri = rAt(yPl), ro = ri + 0.72;
      sink.revolve('structureMetal', [0, yPl, 0], 'y', [[0, ri], [0, ro], [0.07, ro], [0.07, ri]], 16, { colour: shade(STEEL_DARK, 1.2), decor: true });
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + Math.PI / 4, c = Math.cos(a), s = Math.sin(a), rb = rAt(yPl - 0.9);
        sink.member('structureMetal', [c * rb, yPl - 0.9, s * rb], [c * (ro - 0.08), yPl, s * (ro - 0.08)], 0.07, 0.07, [-s, 0, c], { colour: STEEL_DARK, decor: true, exposed: true }, 0);
      }
      const rail = { colour: STEEL_DARK, decor: true, exposed: true } as const;
      for (let k = 0; k < 8; k++) {
        const a0 = (k + 0.5) * Math.PI / 4, a1 = (k + 1.5) * Math.PI / 4, rr = ro - 0.05;
        sink.member('structureMetal', [Math.cos(a0) * rr, yPl + 0.05, Math.sin(a0) * rr], [Math.cos(a0) * rr, yPl + 1.05, Math.sin(a0) * rr], 0.04, 0.04, [Math.cos(a0), 0, Math.sin(a0)], rail, 0);
        sink.member('structureMetal', [Math.cos(a0) * rr, yPl + 1.05, Math.sin(a0) * rr], [Math.cos(a1) * rr, yPl + 1.05, Math.sin(a1) * rr], 0.045, 0.04, [0, 1, 0], rail, 0);
        sink.member('structureMetal', [Math.cos(a0) * rr, yPl + 0.55, Math.sin(a0) * rr], [Math.cos(a1) * rr, yPl + 0.55, Math.sin(a1) * rr], 0.035, 0.03, [0, 1, 0], { colour: STEEL_DARK, decor: true, fine: true }, 0);
      }
    }
    // the lightning rod off the lip, its strap down the shell's back to the block
    sink.cylinder('structureMetal', [0, H - 0.4, -(r1 + 0.05)], 'y', 2.2, 0.025, 5, { colour: STEEL_DARK, decor: true }, 0.015);
    sink.member('structureMetal', [0, hb + 0.08, -(r0 + 0.01)], [0, H - 0.4, -(r1 + 0.04)], 0.035, 0.012, [0, 0, -1], { colour: rgb(0x8a6a4a), decor: true, exposed: true }, 0);
  });
  return sink.finish();
};

// (the 225 gate, 2026-10-15: the steppe is 1958, before the ISO box; its container rows are the rail kit's period freight,
// maps/periodFreight.ts FREIGHT_MIX.steppe, as periodFreight.selftest names it: the kit's fuel store and living wagons that
// stood on those lots went with the rule)

// ---------------------------------------------------------------------------------------------------------- farm

/**
 * The sheep barn (koshara): a long low building of whitewashed saman filling the lot under reed thatch or asbestos sheet,
 * small high windows down the sides, the wide plank doors in its gables (closed), ventilation boxes on the ridge.
 */
const koshara: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), rng = st.rng, look = st.look;
  const fp = footprint(ctx);
  const reed = rng() < 0.45;
  onLot(sink, fp, (Wl, Ll) => {
    const W = Wl - 0.12, L = Ll - 0.12;
    const roof: RoofSpec = reed
      ? { kind: 'gable', pitchDeg: 32, eave: 0.5, verge: 0.35, thickness: 0.32, bucket: 'straw', ridge: 'round' }
      : sheetRoof('gable', 18, false, 0.45, 0.3);
    const openings: Opening[] = [
      { face: 'front', storey: 0, kind: 'door', u: 0, w: 2.4, y0: 0, h: 2.3 },
      { face: 'back', storey: 0, kind: 'door', u: 0, w: 2.4, y0: 0, h: 2.3 },
    ];
    for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, 0, L, { w: 0.6, h: 0.45, sill: 1.7, spacing: 2.2, margin: 1.0 })) openings.push({ ...o, kind: 'loft' });
    const frame = buildHouse(sink, {
      w: W, d: L, plinth: { h: 0.3, out: 0.06, bucket: 'stone' }, storeys: [{ h: 2.5, wall: 'plaster' }],
      roof, gableBucket: reed ? 'wood' : 'plaster', openings, chimneys: [], gutters: null, verge: null, spall: null,
    }, {
      ...dialect({ ...st, litShare: 0 }),
      door: (s, face, o, y0) => {
        const r = s.recess, go = r > 0 ? -r + 0.03 : 0.015;
        for (const side of [-1, 1]) faceBox(s, 'structureWood', face, o.u + side * o.w / 4, y0 + o.y0 + o.h / 2, go, o.w / 2 - 0.03, o.h, 0.05, { colour: PLANK });
        faceBox(s, 'structureWood', face, o.u, y0 + o.y0 + o.h * 0.5, go + 0.04, o.w - 0.1, 0.12, 0.03, { colour: shade(PLANK, 0.8), decor: true, fine: true });
        // (dome-detail-275) each leaf's brace; the door frame of rough posts on stones and the lintel log run into the
        // saman either side; the trodden, littered earth before the door
        const yb = y0 + o.y0, lc = shade(PLANK, 0.72);
        for (const side of [-1, 1]) {
          const uc = o.u + side * o.w / 4, lw = o.w / 2 - 0.14;
          s.member('structureWood', facePoint(face, uc - side * lw / 2, yb + 0.25, go + 0.03), facePoint(face, uc + side * lw / 2, yb + o.h - 0.25, go + 0.03), 0.11, 0.04, face.out, { colour: lc, decor: true }, 0);
          faceBox(s, 'structureWood', face, o.u + side * (o.w / 2 + 0.08), yb + o.h / 2 - 0.1, 0.06, 0.18, o.h + 0.2, 0.14, { colour: shade(PLANK, 0.66), decor: true });
        }
        s.member('structureWood', facePoint(face, o.u - o.w / 2 - 0.55, yb + o.h + 0.12, 0), facePoint(face, o.u + o.w / 2 + 0.55, yb + o.h + 0.12, 0), 0.24, 0.2, face.out, { colour: shade(PLANK, 0.6), decor: true, ends: true }, 0.04);
        s.quad('structureWood', facePoint(face, o.u - o.w / 2 - 0.2, 0.02, 0.02), facePoint(face, o.u - o.w / 2 - 0.45, 0.02, 0.58), facePoint(face, o.u + o.w / 2 + 0.45, 0.02, 0.58), facePoint(face, o.u + o.w / 2 + 0.2, 0.02, 0.02), { colour: shade(EARTH, 0.82), decor: true });
      },
    });
    // (dome-detail-275) the saman barn's wear and footing: the clay buttresses battered against the long walls between
    // the windows, each its own height; the slumped earth bank along the wall foot; the render spalled to the mud brick
    // in patches; a timber lintel over each small window; the dung heap by a gable door
    const dirt = { colour: EARTH, decor: true } as const;
    for (const name of ['left', 'right'] as const) {
      const f = frame.faces[name], wins = openings.filter((o) => o.face === name).map((o) => o.u);
      const gaps = wins.slice(1).map((u, k) => (u + wins[k]) / 2).filter((_, k) => k % 2 === 0);
      for (const u of gaps) {
        const h = 1.2 + look() * 0.6, b = 0.6 + look() * 0.2, w = 0.85;
        const P = (uu: number, y: number, o: number) => facePoint(f, uu, y, o);
        const pts: Vec3[] = [P(u - w / 2, -0.05, 0), P(u - w / 2, -0.05, b), P(u - w / 2, h * 0.35, b * 0.62), P(u - w / 2, h, 0.12), P(u - w / 2, h, 0)];
        sink.prism('plaster', [...pts].reverse(), f.u, w, { decor: true, shade: 0.92 });
      }
      for (let k = 0; k < 3; k++) {
        const u = (look() - 0.5) * (f.width - 2), y = 0.6 + look() * 1.4;
        faceBox(sink, 'plaster', f, u, y, 0.008, 0.5 + look() * 0.7, 0.3 + look() * 0.4, 0.012, { decor: true, shade: 0.8, tint: [1.0, 0.86, 0.66] });
      }
      for (const o of openings.filter((p) => p.face === name)) faceBox(sink, 'structureWood', f, o.u, 0.3 + o.y0 + o.h + 0.1, 0.03, o.w + 0.36, 0.14, 0.08, { colour: shade(PLANK, 0.66), decor: true });
    }
    for (const name of ['left', 'right', 'front', 'back'] as const) {
      const f = frame.faces[name], doorU = name === 'front' || name === 'back' ? [-1.6, 1.6] : null;
      const runs: Array<[number, number]> = doorU ? [[-f.width / 2, doorU[0]], [doorU[1], f.width / 2]] : [[-f.width / 2, f.width / 2]];
      for (const [u0, u1] of runs) {
        const pts: Vec3[] = [facePoint(f, u0, 0.34, 0.04), facePoint(f, u0, -0.05, 0.42), facePoint(f, u0, -0.05, 0.04)];
        sink.prism('structureWood', pts, f.u, u1 - u0, dirt);
      }
    }
    {
      const f = look() < 0.5 ? frame.faces.front : frame.faces.back, p = facePoint(f, (look() < 0.5 ? -1 : 1) * (f.width / 2 - 1.2), 0, 0.25);
      heap(sink, p[0], p[2], 0.75, 0.5, 0.45, rgb(0x4a3a2a), look() * 3);
    }
    if (!reed) sheetLaps(sink, frame.roof, look, 2, 0.3);
    // (dome-detail-275) the reed ridge's binding: pairs of crossed riders along it, a pole through their crooks
    if (reed) {
      const ry = frame.roof.ridgeTopY;
      for (let z = -L / 2 + 0.5; z < L / 2 - 0.3; z += 1.1) for (const sx of [-1, 1]) {
        sink.member('structureWood', [-sx * 0.55, ry - 0.42, z], [sx * 0.2, ry + 0.22, z], 0.07, 0.07, [0, 0, 1], { colour: shade(PLANK, 0.75), decor: true, exposed: true }, 0);
      }
      sink.member('structureWood', [0, ry + 0.05, -L / 2 - 0.2], [0, ry + 0.05, L / 2 + 0.2], 0.1, 0.1, [0, 1, 0], { colour: shade(PLANK, 0.7), decor: true, exposed: true }, 0);
    }
    for (const z of [-L * 0.25, L * 0.25]) {
      const top = frame.roof.ridgeTopY - (reed ? 0.25 : 0.05);
      sink.span('structureWood', -0.4, top - 0.3, z - 0.4, 0.4, top + 0.8, z + 0.4, { colour: shade(PLANK, 0.9) });
      const cap: RoofSpec = { kind: 'gable', pitchDeg: 28, eave: 0.12, verge: 0.12, thickness: 0.06, bucket: 'roof', ridge: null };
      sink.placed(0, 0, 0, z, () => emitRoof(sink, roofGeometry(0.8, 0.8, top + 0.8, cap), cap));
    }
  });
  return sink.finish();
};

/**
 * The small store (a shed, a cellar head, the yard's outbuilding): saman or brick filling its lot under a shed or low
 * gable roof of sheet, a plank door, a vent.
 */
const store: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), rng = st.rng;
  const fp = footprint(ctx);
  const wall: RegionalBucket = rng() < 0.3 ? 'stone' : 'plaster';
  const sheet = rng() < 0.55, livery = pick(rng, SHEET);
  const shed = rng() < 0.55;
  const W = Math.max(1.6, fp.w - 0.1), D = Math.max(1.6, fp.d - 0.1);
  const h = Math.min(W, D) < 3 ? 2.1 : 2.5;
  const roof = shed ? sheetRoof('shed', 9, sheet, 0.3, 0.2) : sheetRoof('gable', 20, sheet, 0.3, 0.25);
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: (rng() - 0.5) * Math.max(0, W - 1.6) * 0.6, w: 0.85, y0: 0, h: 1.85 }];
  if (D > 3.4) openings.push({ face: 'left', storey: 0, kind: 'loft', u: 0, w: 0.5, y0: 1.5, h: 0.4 });
  sink.placed(0, fp.cx, 0, fp.cz, () => {
    const frame = buildHouse(sink, {
      w: W - 0.08, d: D - 0.08, plinth: { h: 0.25, out: 0.04, bucket: 'stone' }, storeys: [{ h, wall }],
      roof, roofColour: sheet ? livery : undefined, gableBucket: shed ? wall : 'wood', openings, chimneys: [], gutters: null, verge: null,
      spall: wall === 'plaster' ? null : undefined, reveal: 0.1,
    }, dialect({ ...st, litShare: 0 }));
    if (shed) shedGables(sink, W - 0.08, D - 0.08, frame.eaveY, Math.tan(9 * Math.PI / 180), wall);
    // (dome-detail-275) the yard store's life: a board hood over the door on two brackets, the splash darkening the wall's
    // foot, the corner piers of brick (a saman store's), the woodpile stacked under the eaves of one side under its own
    // boards, a ladder leaning to the roof on the other
    const look = st.look, f = frame.faces, du = openings[0].u, dh = 0.25 + 1.85 + 0.22;
    const hood = shade(PLANK, 0.8);
    if (frame.eaveY - dh >= 0.15) {
      const fr = f.front;
      sink.quad('structureWood', facePoint(fr, du - 0.6, dh, 0), facePoint(fr, du - 0.6, dh - 0.12, 0.5), facePoint(fr, du + 0.6, dh - 0.12, 0.5), facePoint(fr, du + 0.6, dh, 0), { colour: hood, decor: true });
      sink.quad('structureWood', facePoint(fr, du + 0.6, dh, 0), facePoint(fr, du + 0.6, dh - 0.12, 0.5), facePoint(fr, du - 0.6, dh - 0.12, 0.5), facePoint(fr, du - 0.6, dh, 0), { colour: shade(hood, 0.6), decor: true });
      for (const side of [-1, 1]) sink.member('structureWood', facePoint(fr, du + side * 0.5, dh - 0.45, 0), facePoint(fr, du + side * 0.5, dh - 0.105, 0.46), 0.05, 0.05, [fr.u[0] * side, 0, fr.u[2] * side], { colour: shade(hood, 0.8), decor: true, exposed: true }, 0);
    }
    for (const name of ['front', 'back', 'left', 'right'] as const) {
      const fc = f[name], spans: Array<[number, number]> = name === 'front' ? [[-fc.width / 2, du - 0.6], [du + 0.6, fc.width / 2]] : [[-fc.width / 2, fc.width / 2]];
      for (const [u0, u1] of spans) if (u1 - u0 > 0.3) faceBox(sink, wall, fc, (u0 + u1) / 2, 0.45, 0.012, u1 - u0, 0.4, 0.02, { decor: true, shade: 0.8 });
    }
    if (wall === 'plaster') for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * (W - 0.08) / 2, z = sz * (D - 0.08) / 2;
      sink.quoin('stone', x - sx * 0.26, 0.25, z - sz * 0.26, x + sx * 0.04, frame.eaveY - 0.05, z + sz * 0.04, sx, sz, DEC);
    }
    // (dome-detail-275) an asbestos roof's laps and its patched sheets
    if (!sheet) {
      const rg = frame.roof;
      if (!shed) sheetLaps(sink, rg, look, 1, 0.25);
      else for (let x = rg.s - 0.6; x > -rg.s; x -= 1.2) {
        const y = rg.topAt(x, 0);
        if (y !== null) sink.member('roof', [x, y, -rg.halfD - 0.2], [x, y, rg.halfD + 0.2], 0.07, 0.025, normalize3([rg.tanP, 1, 0]), { decor: true, shade: 0.72, exposed: true }, 0);
      }
    }
    const pileSide = look() < 0.5 ? f.right : f.left;
    if (look() < 0.7) woodpile(sink, pileSide, -Math.min(1.2, pileSide.width / 2 - 0.5), Math.min(1.0, pileSide.width / 2 - 0.5), Math.min(1.2, h - 0.6), look);
    if (look() < 0.6) {
      const lf = pileSide === f.right ? f.left : f.right, lu = (look() - 0.5) * (lf.width - 1.4), top = frame.eaveY + 0.25, lc = shade(PLANK, 0.85);
      for (const side of [-1, 1]) sink.member('structureWood', facePoint(lf, lu + side * 0.22, 0, 0.55), facePoint(lf, lu + side * 0.22, top, 0.04), 0.06, 0.05, lf.out, { colour: lc, decor: true, exposed: true }, 0);
      for (let y = 0.3; y < top - 0.1; y += 0.32) {
        const o = 0.55 - (0.51 * y) / top;
        sink.member('structureWood', facePoint(lf, lu - 0.22, y, o), facePoint(lf, lu + 0.22, y, o), 0.04, 0.04, [0, 1, 0], { colour: lc, decor: true, fine: true }, 0);
      }
    }
  });
  return sink.finish();
};

/**
 * A shelled house: its plinth the lot, the saman walls broken to stubs along the lot's edges, the roof gone but for a
 * few rafters and sheets fallen in, the brick stove and its stack standing in the ruin.
 */
const ruinedHouse: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const fp = footprint(ctx);
  const W = Math.max(3, fp.w), D = Math.max(3, fp.d), t = 0.4;
  const segs: Array<{ along: boolean; x0: number; x1: number; z0: number; z1: number; top: number }> = [];
  sink.placed(0, fp.cx, 0, fp.cz, () => {
    sink.span('stone', -W / 2, -0.4, -D / 2, W / 2, 0.45, D / 2);
    for (const [x0, z0, x1, z1] of [[-W / 2, -D / 2, W / 2, -D / 2 + t], [-W / 2, D / 2 - t, W / 2, D / 2], [-W / 2, -D / 2 + t, -W / 2 + t, D / 2 - t], [W / 2 - t, -D / 2 + t, W / 2, D / 2 - t]] as const) {
      const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      for (let k = 0; k < 4; k++) {
        if (rng() < 0.28) continue;
        const a = k / 4, b = (k + 1) / 4, top = 0.75 + rng() * 2.1;
        if (along) sink.span('plaster', x0 + (x1 - x0) * a, 0.45, z0, x0 + (x1 - x0) * b, top, z1);
        else sink.span('plaster', x0, 0.45, z0 + (z1 - z0) * a, x1, top, z0 + (z1 - z0) * b);
        segs.push({ along, x0: along ? x0 + (x1 - x0) * a : x0, x1: along ? x0 + (x1 - x0) * b : x1, z0: along ? z0 : z0 + (z1 - z0) * a, z1: along ? z1 : z0 + (z1 - z0) * b, top });
      }
    }
    sink.span('stone', -0.8, 0.45, -0.7, 0.7, 1.8, 0.8);
    const stackTop = 4.4 + rng() * 0.6;
    sink.span('stone', -0.35, 1.8, -0.25, 0.3, stackTop, 0.35);
    // (dome-detail-275) each wall stub broken to a ragged crown: the saman blocks standing in steps above its cut, the
    // mud brick bared under the render's torn edge, the soot of the fire licking up its inner face; the fallen blocks
    // heaped at its foot inside and out
    for (const g of segs) {
      const len = g.along ? g.x1 - g.x0 : g.z1 - g.z0, n = Math.max(2, Math.round(len / 0.55));
      for (let k = 0; k < n; k++) {
        if (look() < 0.3) continue;
        const t0 = k / n, t1 = (k + 1) / n, h = 0.12 + look() * 0.42, inset = 0.03 + look() * 0.05;
        if (g.along) sink.span('plaster', g.x0 + (g.x1 - g.x0) * t0, g.top, g.z0 + inset, g.x0 + (g.x1 - g.x0) * t1, g.top + h, g.z1 - inset, { decor: true, tint: [1.0, 0.93, 0.82] });
        else sink.span('plaster', g.x0 + inset, g.top, g.z0 + (g.z1 - g.z0) * t0, g.x1 - inset, g.top + h, g.z0 + (g.z1 - g.z0) * t1, { decor: true, tint: [1.0, 0.93, 0.82] });
      }
      const bare = Math.min(0.45, (g.top - 0.45) * 0.4);
      if (g.along) sink.span('plaster', g.x0, g.top - bare, g.z0 - 0.012, g.x1, g.top, g.z1 + 0.012, { decor: true, shade: 0.86, tint: [1.0, 0.93, 0.82] });
      else sink.span('plaster', g.x0 - 0.012, g.top - bare, g.z0, g.x1 + 0.012, g.top, g.z1, { decor: true, shade: 0.86, tint: [1.0, 0.93, 0.82] });
      const cx = (g.x0 + g.x1) / 2, cz = (g.z0 + g.z1) / 2, inX = -Math.sign(cx) * (g.along ? 0 : 1), inZ = -Math.sign(cz) * (g.along ? 1 : 0);
      if (g.top > 1.2) {
        const sootH = (g.top - 0.45) * 0.45;
        if (g.along) sink.span('plaster', g.x0 + 0.05, g.top - sootH, cz + inZ * 0.21, g.x1 - 0.05, g.top - 0.02, cz + inZ * 0.215, { decor: true, shade: 0.64 });
        else sink.span('plaster', cx + inX * 0.21, g.top - sootH, g.z0 + 0.05, cx + inX * 0.215, g.top - 0.02, g.z1 - 0.05, { decor: true, shade: 0.64 });
      }
      const fall = Math.max(0.1, 2.9 - g.top) * 0.18;
      for (const inside of [false, true]) {
        if (look() < 0.35) continue;
        const off = inside ? 0.62 : -0.42, across = inside ? 0.45 + fall : 0.34, along = 0.5 + look() * 0.3, slide = (look() - 0.5) * len * 0.5;
        const hx = g.along ? cx + slide : cx + inX * off, hz = g.along ? cz + inZ * off : cz + slide;
        heap(sink, hx, hz, g.along ? along : across, g.along ? across : along, inside ? 0.2 + fall : 0.16, shade(rgb(0xb8a88c), 0.9 + look() * 0.15), look() * 3, 5);
      }
    }
    // (dome-detail-275) the Russian stove: its whitewash sooted round the fire's mouth (the arched dark of the hearth, its
    // iron shutter fallen against it), the step of the sleeping bench at its side, the stack's corbelled cap
    {
      const sf: Face = { origin: [0, 0, 0.8], u: [1, 0, 0], out: [0, 0, 1], width: 1.5 };
      faceBox(sink, 'plaster', sf, -0.05, 1.15, 0.015, 1.5, 1.3, 0.03, { decor: true, shade: 0.95 });
      faceBox(sink, 'dark', sf, -0.05, 1.15, 0.035, 0.5, 0.42, 0.02, DEC);
      sink.cylinder('dark', [-0.05, 1.36, 0.845], 'z', 0.01, 0.25, 8, DEC, 0.25, true, -Math.PI / 2, Math.PI);
      faceBox(sink, 'plaster', sf, -0.05, 1.7, 0.04, 0.9, 0.2, 0.02, { decor: true, shade: 0.45 });
      sink.member('structureMetal', facePoint(sf, 0.35, 0.45, 0.12), facePoint(sf, 0.4, 0.95, 0.05), 0.45, 0.02, normalize3([0, 0.2, 1]), { colour: STEEL_DARK, decor: true, exposed: true }, 0);
      sink.span('plaster', 0.7, 0.45, -0.7, 1.5, 1.05, 0.5, { decor: true, shade: 0.88 });
      sink.span('stone', -0.45, stackTop, -0.35, 0.4, stackTop + 0.12, 0.45, DEC);
      sink.span('stone', -0.3, stackTop + 0.12, -0.2, 0.25, stackTop + 0.3, 0.3, DEC);
    }
    // (2026-10-11, kitConnectivity: the fallen beams' raised ends hung in the air, a sheet 3 cm over the floor) the
    // beams lie on the floor or lean on the chimney block's top, every end on something; the sheets rest on the floor
    for (let k = 0; k < 5; k++) {
      // (a member's depth stands up from its line: the line 2 cm under the floor's top, so the beam lies on it)
      const a: Vec3 = [(rng() - 0.5) * W * 0.8, 0.43, (rng() - 0.5) * D * 0.8];
      const dx = (rng() - 0.5) * 3.2, rise = rng(), dz = (rng() - 0.5) * 3.2;
      const lean = k % 2 === 1;
      const b: Vec3 = lean ? [clamp(a[0] * 0.25, -0.7, 0.6), 1.78, clamp(a[2] * 0.25, -0.6, 0.7)]
        : [clamp(a[0] + dx, -W / 2 + 0.25, W / 2 - 0.25), 0.43 + rise * 0.02, clamp(a[2] + dz, -D / 2 + 0.25, D / 2 - 0.25)];
      sink.member('structureWood', a, b, 0.14, 0.12, [0, 1, 0], { colour: k % 2 ? CHAR : PLANK, decor: true, exposed: true });
    }
    for (let k = 0; k < 3; k++) {
      const x = (rng() - 0.5) * W * 0.6, z = (rng() - 0.5) * D * 0.6, rise = 0.25 + rng() * 0.6;
      const a: Vec3 = [x - 0.85, 0.46, z], b: Vec3 = [x + 0.85, 0.46 + rise, z];
      const len = Math.hypot(1.7, rise), up: Vec3 = [-rise / len, 1.7 / len, 0];
      sink.member('roof', a, b, 1.1, 0.03, up, { decor: true, exposed: true }, 0);
    }
  });
  return sink.finish();
};

const TSELINA_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  cottage: settlerHouse,
  farmhouse: twoFamilyHouse,
  cornershop: club,
  warehouse,
  // (no plan site asks for it: the station's elevator is the landmark's; see warehouse)
  elevator,
  gantry: conveyor,
  depot: mtsGarage,
  shed: implementShed,
  watertower: rozhnovsky,
  stack: boilerStack,
  barn: koshara,
  granary: store,
  ruin: ruinedHouse,
});

/** whitewash on saman: lime, cool and bright (the map's own render tone wins where it authors one) */
const whitewash = (_h: number, s: number, l: number): readonly [number, number, number] => [0.11, Math.min(1, s * 0.22), Math.min(1, l * 1.26 + 0.1)];

export const TSELINA_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'tselina',
  region: 'Virgin Lands sovkhozes of the Sary-Arka grain steppe (Akmola and Kustanai oblasts, from 1954): a concrete grain elevator, MTS sheds, saman and silicate-brick settlers\' houses under asbestos sheet, the club',
  surfaces: {
    roof: { kind: 'asbestos', tint: [0.63, 0.63, 0.6] },
    stone: { kind: 'brick', tint: [0.76, 0.73, 0.66] },
    // (buildings-270, the sourced-plaster class: under the photo set none of the map's render tones showed) the walls the
    // procedural limewash canvas, the primary family's tone measured on it against the reference photos (the whitewash: the map's tone, #e0dbcf against #e6e4dc)
    sourced: { plaster: false, wood: true },
    render: { kind: 'limewash', seed: 0x3e57 },
    tones: {
      plaster: whitewash,
      // slip-formed concrete: a warm light grey
      plaster2: (_h, s, l) => [0.1, Math.min(1, s * 0.12), Math.min(1, 0.5 + (l - 0.45) * 0.42)],
      // the clubs' and offices' ochre distemper
      plaster3: (_h, s, l) => [0.115, Math.min(1, s * 1.6 + 0.24), Math.min(1, 0.6 + (l - 0.45) * 0.5)],
      straw: (h, s, l) => [h - 0.012, Math.min(1, s * 0.55), Math.min(1, l * 0.82)],
    },
  },
  builders: TSELINA_BUILDERS,
  weather: {
    plaster: [[1, 1, 1], [1.0, 0.97, 0.92], [0.95, 0.95, 0.93], [1.02, 0.99, 0.9]],
    stone: [[1, 1, 1], [0.95, 0.94, 0.9], [1.0, 0.98, 0.94], [0.9, 0.89, 0.86]],
    roof: [[1, 1, 1], [0.92, 0.9, 0.86], [0.84, 0.83, 0.8], [1.04, 1.02, 0.98]],
    // a dry continental climate: little rising damp, lichen rather than moss
    mossTint: [1.0, 0.92, 0.7],
  },
  // the settlers' yards: a picket fence round the kitchen garden (ogorod), a gate, the shed in its corner (yards.ts)
  // (gauntlet wave 106, round 2: "Western cottages") wattle fences (pleten) round the settlers' yards, not white pickets;
  // (board fences turned the bots' battles a minute shorter on the pacing receipt's seeds — the wattle holds the band)
  // (the 225 gate, 2026-10-15: gateKit — each fence family hangs its own gate) the wattle yard's wattle hurdle gate
  yard: { kinds: ['cottage', 'farmhouse'], fence: 'fencewattle', gate: 'gatewattle', shed: 'granary', shedSize: [3.6, 3.0], garden: true },
});
