// src/world/maps/regional/tselina.ts — the Virgin Lands kit (Tarkhan Steppe: a sovkhoz grain station on the Sary-Arka
// grain steppe of Akmola and Kustanai oblasts, ploughed from 1954 by the tselina campaign). The built world of the
// campaign's state farms, put up to standard designs on open steppe: the slip-formed concrete grain elevator by the rail
// siding (a bank of silos under the top gallery, the working tower with its head house, the drive-through intake), the
// conveyor gallery up to the wagon bin; the machine-tractor station's brick garages behind steel gates and its open
// implement sheds, the repair shop under a glazed roof monitor, the long grain stores; the settlers' houses — whitewashed
// saman (adobe) or white silicate brick on a brick plinth under low asbestos-cement sheet roofs, the gable to the street,
// the glazed veranda at the back, window frames painted blue or green in white board surrounds — and the two-family
// brick houses of the estate's streets; the club with its portico, pediment and star; the Rozhnovsky water tower of welded
// steel; the boiler house's banded steel stack; the fuel store's tanks on their saddles and the brigades' living wagons
// on sledge runners; the reed-thatched or sheet-roofed sheep barns (koshary) of the steppe herds; a shelled house.
import {
  PartSink, alongPlot, faceBox, facePanel, pick, plotAxes, rgb, shade,
  type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3,
} from './geometry.ts';
import { buildHouse, emitRoof, roofGeometry, wallPolygon, windowRhythm, type HouseDialect, type Opening, type RoofSpec } from './house.ts';
import { doorUnit, paneBucket, windowUnit, type WindowStyle } from './openings.ts';
import { bench, tvAerial } from './dressing.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';

/** Window frames, shutters and doors: the settlements' blue, turquoise, green and sky blue, a brown. */
const PAINTS: readonly Rgb[] = [0x3f6f9a, 0x4a8a96, 0x4f7d4a, 0x6a9ab8, 0x2f5a7a, 0x6e4a36].map(rgb);
const WHITE = rgb(0xd8d4c8), PLANK = rgb(0x7a6048), CHAR = rgb(0x2a2622);
/** Roof sheet liveries: galvanised, weathered galvanised, green and oxide-red paint. */
const SHEET: readonly Rgb[] = [0x9aa0a0, 0x868c8c, 0x5a7a52, 0x7a3e30].map(rgb);
/** The MTS's steel gates and the machinery's paint. */
const GATE: readonly Rgb[] = [0x4f6e58, 0x5a6e7a, 0x6a7468].map(rgb);
const MACHINE: readonly Rgb[] = [0x5e6e46, 0x46607a, 0x8a3a2c, 0x7a7a6a].map(rgb);
const STEEL = rgb(0x7c8282), STEEL_DARK = rgb(0x464b4c), SILVER = rgb(0xaeb0aa), RED = rgb(0xa8382c), TRACK = rgb(0x2e2c2a);

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
  // the wicket door in one leaf
  faceBox(sink, 'dark', face, u - w / 4, y + 0.95, go + 0.034, 0.78, 1.8, 0.01, { decor: true });
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

/** A crawler tractor (the Virgin Lands' DT-54) parked with its nose toward +x of its frame: dressing. */
function crawlerTractor(sink: PartSink, x: number, z: number, yaw: number, colour: Rgb): void {
  const dec = { decor: true } as const;
  sink.placed(yaw, x, 0, z, () => {
    for (const s of [-1, 1]) {
      sink.span('structureMetal', -1.55, 0, s * 0.92 - 0.22, 1.55, 0.7, s * 0.92 + 0.22, { ...dec, colour: TRACK });
      for (const t of [-1.15, -0.4, 0.4, 1.15]) sink.cylinder('structureMetal', [t, 0.36, s * 0.92 - 0.24], 'z', 0.48, 0.3, 8, { ...dec, colour: shade(TRACK, 1.5) });
    }
    sink.span('structureMetal', -0.55, 0.55, -0.6, 1.55, 1.4, 0.6, { ...dec, colour });
    sink.span('structureMetal', 1.45, 0.55, -0.62, 1.62, 1.3, 0.62, { ...dec, colour: shade(colour, 0.6) });
    sink.span('structureMetal', -1.5, 0.55, -0.72, -0.5, 1.55, 0.72, { ...dec, colour: shade(colour, 0.9) });
    sink.span('glass', -1.45, 1.55, -0.7, -0.55, 2.15, 0.7, dec);
    sink.span('structureMetal', -1.55, 2.15, -0.78, -0.45, 2.25, 0.78, { ...dec, colour: shade(colour, 0.85) });
    sink.cylinder('structureMetal', [1.0, 1.4, 0.3], 'y', 0.85, 0.055, 6, { ...dec, colour: rgb(0x1e1e1e) });
  });
}

// ---------------------------------------------------------------------------------------------------------- houses

/**
 * The settler's house: a single storey of whitewashed saman (or white silicate brick) on a brick plinth, its gable to
 * the street with three windows in board surrounds, a low gable of asbestos sheet (or painted sheet) with painted verge
 * boards and a boarded gable, the brick stack, and across the back gable the glazed veranda (boarded below, small panes
 * above) with its door to the yard side.
 */
function settlerHouse(ctx: RegionalBuildContext): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), rng = st.rng, look = st.look;
  const W = clamp(ctx.info.w - 0.6, 4.6, 6.6), total = Math.max(7.0, ctx.info.d - 0.5);
  const D = clamp(total - 2.0, 5.4, 8.4), vD = clamp(total - D, 1.6, 2.2);
  const z0 = -(D + vD) / 2, zb = z0 + vD + D / 2;
  const brick = rng() < 0.3;
  const wall: RegionalBucket = brick ? 'stone' : 'plaster';
  const sheet = rng() < 0.32, livery = pick(rng, SHEET);
  const roof = sheetRoof('gable', 21 + rng() * 7, sheet);
  const openings: Opening[] = [
    ...windowRhythm('front', 0, W, { w: 0.86, h: 1.2, sill: 0.85, spacing: 1.55, margin: 0.75, max: 3 }),
    ...windowRhythm('left', 0, D, { w: 0.86, h: 1.2, sill: 0.85, spacing: 2.3, margin: 1.1, max: 2 }),
    ...windowRhythm('right', 0, D, { w: 0.86, h: 1.2, sill: 0.85, spacing: 2.3, margin: 1.1, max: 2 }),
  ];
  const plinth = 0.5, wallH = 2.55 + rng() * 0.2;
  sink.placed(0, 0, 0, zb, () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: plinth, out: 0.05, bucket: 'stone' }, storeys: [{ h: wallH, wall }],
      roof, roofColour: sheet ? livery : undefined, gableBucket: rng() < 0.5 ? 'wood' : wall, openings,
      chimneys: [{ x: (rng() - 0.5) * 0.6, z: -D * 0.15, sx: 0.5, sz: 0.62, above: 0.7, bucket: 'stone', cap: 'slab' }],
      gutters: null, verge: { colour: rng() < 0.5 ? WHITE : st.paint, bucket: 'structureWood' },
      spall: brick ? undefined : null,
    }, dialect(st));
    // the attic vent in the street gable: a louvred board hatch
    const gf: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
    const ventY = frame.eaveY + (frame.roof.ridgeY - frame.eaveY) * 0.38;
    faceBox(sink, 'dark', gf, 0, ventY, 0.01, 0.55, 0.42, 0.02, { decor: true });
    faceBox(sink, 'structureWood', gf, 0, ventY, 0.03, 0.72, 0.6, 0.04, { colour: st.paint, decor: true }, { back: true });
    // the television aerial on the ridge
    tvAerial(sink, frame, (look() - 0.5) * D * 0.5, look);
  });
  // the veranda across the back gable, built in a frame turned a quarter: its local +x runs out to -z (away from the
  // house), its shed roof rising toward the house wall
  const vW = clamp(W * 0.82, 3.0, W - 0.3), vx = (W - vW) / 2 * (rng() < 0.5 ? -1 : 1);
  const vH = 2.25, vPlinth = 0.45;
  const vRoof = sheetRoof('shed', 12, sheet, 0.25, 0.2);
  const door: 'front' | 'back' = rng() < 0.5 ? 'front' : 'back';
  const veranda: Opening[] = [
    { face: door, storey: 0, kind: 'door', u: (door === 'front' ? -1 : 1) * (vD / 2 - 0.62), w: 0.82, y0: 0, h: 1.95 },
    ...windowRhythm('right', 0, vW, { w: 0.6, h: 0.95, sill: 1.0, spacing: 0.7, margin: 0.3 }),
    ...windowRhythm(door === 'front' ? 'back' : 'front', 0, vD, { w: 0.6, h: 0.95, sill: 1.0, spacing: 0.7, margin: 0.3, max: 2 }),
  ];
  const glazed: WindowStyle = { frame: WHITE, frameWidth: 0.06, frameOut: 0.04, bars: 'cross', surround: null, sill: { bucket: 'structureWood', out: 0.05, colour: st.paint }, shutters: null };
  sink.placed(Math.PI / 2, vx, 0, z0 + vD / 2, () => {
    const vf = buildHouse(sink, {
      w: vD, d: vW, plinth: { h: vPlinth, out: 0.03, bucket: 'stone' }, storeys: [{ h: vH, wall: 'wood' }],
      roof: vRoof, roofColour: sheet ? livery : undefined, openings: veranda, chimneys: [], gutters: null, verge: null, reveal: 0.05, spall: null,
    }, {
      window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, glazed, rng, 0.35),
      door: (s, face, o, y0, frame) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: st.paint, frame: { bucket: 'structureWood', width: 0.08, out: 0.03, colour: WHITE }, steps: { bucket: 'stone' }, leafKind: 'panel',
      }, frame.floors[o.storey] + o.y0),
    });
    shedGables(sink, vD, vW, vf.eaveY, Math.tan(12 * Math.PI / 180), 'wood');
    // the board skirt below the glazing, a rail and its battens (the veranda's lower half), on the outer face
    const outer: Face = { origin: [vD / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: vW };
    faceBox(sink, 'structureWood', outer, 0, vPlinth + 0.92, 0.04, vW, 0.08, 0.06, { colour: WHITE, decor: true }, 'ends');
  });
  // a bench under the street windows
  if (look() < 0.6) bench(sink, { origin: [0, 0, zb + D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W }, (look() - 0.5) * (W - 2), 1.4, PLANK);
  return sink.finish();
}

/**
 * The two-family house of the estate's streets: one long storey of silicate brick (or render) under a low hip or gable of
 * asbestos sheet, its gable to the street, the two flats' entrance porches with their gabled hoods along one long side,
 * two stacks.
 */
function twoFamilyHouse(ctx: RegionalBuildContext): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), rng = st.rng, look = st.look;
  const plot = plotAxes(ctx.info);
  // in the plot's long frame: L along z (the ridge), the porches on the +x... side toward the plot's +z when turned
  const L = clamp(plot.d - 1.2, 9.0, 14.5), Wb = clamp(plot.w - 3.0, 6.0, 8.2), porch = 1.5;
  const shift = Math.min(0.75, Math.max(0, (plot.w - Wb) / 2 - porch - 0.1));
  const wall: RegionalBucket = rng() < 0.55 ? 'stone' : 'plaster';
  const sheet = rng() < 0.25, livery = pick(rng, SHEET);
  const roof = sheetRoof(rng() < 0.45 ? 'hip' : 'gable', 20 + rng() * 6, sheet, 0.5, 0.45);
  const porchAt = [-L * 0.28, L * 0.28];
  const openings: Opening[] = [
    ...windowRhythm('front', 0, Wb, { w: 1.1, h: 1.35, sill: 0.85, spacing: 2.0, margin: 1.0, max: 3 }),
    ...windowRhythm('back', 0, Wb, { w: 1.1, h: 1.35, sill: 0.85, spacing: 2.0, margin: 1.0, max: 3 }),
    ...windowRhythm('left', 0, L, { w: 1.1, h: 1.35, sill: 0.85, spacing: 2.4, margin: 1.2, avoid: porchAt.map((u): [number, number] => [u - 1.3, u + 1.3]) }),
    ...windowRhythm('right', 0, L, { w: 1.1, h: 1.35, sill: 0.85, spacing: 2.4, margin: 1.2 }),
  ];
  alongPlot(sink, plot.turned, () => {
    sink.placed(0, shift, 0, 0, () => {
      const frame = buildHouse(sink, {
        w: Wb, d: L, plinth: { h: 0.55, out: 0.06, bucket: 'stone' }, storeys: [{ h: 2.8, wall }],
        roof, roofColour: sheet ? livery : undefined, gableBucket: wall, openings,
        chimneys: porchAt.map((z) => ({ x: (rng() - 0.5) * 0.6, z: z * 0.8, sx: 0.55, sz: 0.62, above: 0.75, bucket: 'stone' as const, cap: 'slab' as const })),
        gutters: null, verge: roof.kind === 'gable' ? { colour: WHITE, bucket: 'structureWood' } : null, spall: wall === 'plaster' ? 'stone' : undefined,
      }, dialect(st));
      // the porches on the left face (-x of the house), each a small gabled box with the flat's door
      for (const u of porchAt) {
        sink.placed(-Math.PI / 2, -Wb / 2 - porch / 2, 0, u, () => {
          buildHouse(sink, {
            w: 2.2, d: porch, plinth: { h: 0.55, out: 0.04, bucket: 'stone' }, storeys: [{ h: 2.3, wall }],
            roof: sheetRoof('gable', 28, sheet, 0.2, 0.25), roofColour: sheet ? livery : undefined, gableBucket: 'wood',
            openings: [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 0.9, y0: 0, h: 2.0 }],
            chimneys: [], gutters: null, verge: { colour: WHITE, bucket: 'structureWood' }, spall: null,
          }, dialect(st));
        });
      }
      tvAerial(sink, frame, (look() - 0.5) * L * 0.4, look);
    });
  }, 1);
  return sink.finish();
}

/**
 * The sovkhoz club: one storey of ochre render with white pilasters and cornice on a brick plinth, the portico of four
 * columns under a pediment carrying the red star, tall windows down the sides, a sign board over the door, a sheet roof.
 */
const club: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), rng = st.rng, look = st.look;
  const W = clamp(ctx.info.w - 1.0, 6.4, 10), total = Math.max(7.2, ctx.info.d - 0.7);
  const P = clamp(total * 0.24, 1.6, 2.6), D = total - P;
  const z0 = -total / 2, zb = z0 + D / 2;
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
  sink.placed(0, 0, 0, zb, () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: plinth, out: 0.06, bucket: 'stone' }, storeys: [{ h: wallH, wall: 'plaster3' }],
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
    // white pilasters at the corners and the cornice band under the eaves
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      sink.quoin('plaster', sx * (W / 2 - 0.26), plinth, sz * (D / 2 - 0.26), sx * (W / 2 + 0.06), eaveY - 0.3, sz * (D / 2 + 0.06), sx, sz, { decor: true });
    }
    sink.band('plaster', -W / 2 - 0.08, eaveY - 0.32, -D / 2 - 0.08, W / 2 + 0.08, eaveY, D / 2 + 0.08, { decor: true });
  });
  // the portico: its floor, two steps, four columns, the entablature, the pediment and its roof
  const pz0 = z0 + D, pz1 = pz0 + P, pw = W - 0.4;
  sink.span('stone', -pw / 2, -0.4, pz0, pw / 2, plinth, pz1);
  const front: Face = { origin: [0, 0, pz1], u: [1, 0, 0], out: [0, 0, 1], width: pw };
  for (let k = 0; k < 2; k++) {
    const top = plinth * (2 - k) / 3;
    faceBox(sink, 'stone', front, 0, (top - 0.3) / 2, 0.17 + k * 0.34, 3.2, top + 0.3, 0.34, { decor: true });
  }
  const colZ = pz1 - 0.38, colX = (pw / 2 - 0.45);
  for (const x of [-colX, -colX / 3, colX / 3, colX]) {
    sink.cylinder('plaster', [x, plinth, colZ], 'y', eaveY - plinth - 0.45, 0.22, 10, {}, 0.19);
    sink.span('plaster', x - 0.3, eaveY - 0.5, colZ - 0.3, x + 0.3, eaveY - 0.42, colZ + 0.3, { decor: true });
  }
  sink.span('plaster', -pw / 2 - 0.1, eaveY - 0.45, pz0, pw / 2 + 0.1, eaveY, pz1 + 0.05);
  const pr = sheetRoof('gable', pitch, sheet, 0.4, 0.25);
  const prg = roofGeometry(W, P, eaveY, pr);
  sink.placed(0, 0, 0, pz0 + P / 2, () => emitRoof(sink, prg, pr, sheet ? livery : undefined));
  const pediment: Face = { origin: [0, 0, pz1 + 0.05], u: [1, 0, 0], out: [0, 0, 1], width: W };
  wallPolygon(sink, 'plaster', pediment, [[-W / 2 + 0.05, eaveY], [W / 2 - 0.05, eaveY], [0, prg.ridgeY - 0.05]], 0.3);
  // the red star in the pediment (a five-pointed polygon fanned from its centre) and the sign board over the door
  const sy = eaveY + (prg.ridgeY - eaveY) * 0.42, sr = Math.min(0.62, (prg.ridgeY - eaveY) * 0.3);
  const star: Vec3[] = [[0, sy, pz1 + 0.09]];
  for (let k = 0; k <= 10; k++) {
    const a = Math.PI / 2 + (k % 10) * Math.PI / 5, r = k % 2 ? sr * 0.42 : sr;
    star.push([Math.cos(a) * r, sy + Math.sin(a) * r, pz1 + 0.09]);
  }
  sink.polygon('structureMetal', star, { colour: RED, decor: true });
  const doorFace: Face = { origin: [0, 0, z0 + D], u: [1, 0, 0], out: [0, 0, 1], width: W };
  faceBox(sink, 'structureWood', doorFace, 0, plinth + 2.95, 0.04, 2.4, 0.46, 0.05, { colour: RED, decor: true });
  faceBox(sink, 'structureWood', doorFace, 0, plinth + 2.95, 0.07, 2.0, 0.12, 0.02, { colour: WHITE, decor: true, fine: true });
  // the flagstaff at the portico's corner
  if (look() < 0.7) {
    const fx = W / 2 - 0.3, fz = pz1 + 0.5;
    sink.cylinder('structureMetal', [fx, -0.2, fz], 'y', 7.7, 0.05, 6, { colour: STEEL_DARK, decor: true }, 0.035);
    sink.span('structureMetal', fx + 0.03, 6.4, fz - 0.02, fx + 1.45, 7.3, fz + 0.02, { colour: RED, decor: true });
  }
  return sink.finish();
};

// ---------------------------------------------------------------------------------------------------------- the grain

/**
 * The grain elevator: a bank of slip-formed concrete silos in two rows on a common base, the top gallery along the bank,
 * the working tower at one end rising a storey above it with its windows in vertical stair strips and a head house on top,
 * the drive-through intake beside the tower. Plots 16 m wide and more carry it; a smaller warehouse plot is a store.
 */
const elevator = (ctx: RegionalBuildContext): RegionalParts => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const halfX = ctx.info.w / 2 - 0.3, halfZ = ctx.info.d / 2 - 0.3;
  const r = clamp((halfX - 0.4) / 2.05, 2.4, 3.2);
  const towerW = clamp(2 * r + 2.4, 6.5, 2 * halfX - 4.2), towerD = clamp(r * 2.4, 6.0, 8.5);
  const n = clamp(Math.floor((2 * halfZ - towerD) / (2 * r)), 2, 5);
  const bankL = n * 2 * r, total = bankL + towerD;
  const zt0 = -total / 2, zt1 = zt0 + towerD, zb1 = zt1 + bankL;
  const Hs = 24 + rng() * 5, Ht = Hs + 9 + rng() * 4;
  // the base slab and the silos, the cores between them
  sink.span('plaster2', -2 * r - 0.35, -0.5, zt1 - 0.2, 2 * r + 0.35, 1.0, zb1 + 0.35);
  for (const sx of [-1, 1]) for (let k = 0; k < n; k++) sink.cylinder('plaster2', [sx * r, 1.0, zt1 + r + k * 2 * r], 'y', Hs - 1.0, r, 16, {});
  sink.span('plaster2', -r * 0.75, 1.0, zt1 + r, r * 0.75, Hs, zb1 - r);
  // the top gallery along the bank, its roof and its window band
  const gw = Math.min(2.2, r * 0.8), gh = 3.0;
  sink.span('plaster2', -gw, Hs, zt1, gw, Hs + gh, zb1 - 0.4);
  sink.span('roof', -gw - 0.25, Hs + gh, zt1, gw + 0.25, Hs + gh + 0.18, zb1 - 0.15);
  for (const sx of [-1, 1]) {
    const side: Face = sx > 0 ? { origin: [gw, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: bankL } : { origin: [-gw, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: bankL };
    for (let z = zt1 + 1.6; z < zb1 - 1.4; z += 2.1) {
      const u = sx > 0 ? -z : z;
      facePanel(sink, paneBucket(look, 0.15), side, u, Hs + gh * 0.55, 0.012, 1.3, 0.8, { decor: true, window: side.out });
    }
  }
  // the working tower, its window strips, the floor bands and the head house
  const tx = towerW / 2;
  sink.span('plaster2', -tx, -0.5, zt0, tx, Ht, zt1 + 0.2);
  sink.span('plaster2', -tx - 0.12, Ht, zt0 - 0.12, tx + 0.12, Ht + 0.7, zt1 + 0.32);
  const hw = Math.min(tx - 0.8, 2.6), hz = (zt0 + zt1) / 2;
  sink.span('plaster2', -hw, Ht + 0.7, hz - 2.0, hw, Ht + 4.6, hz + 2.0);
  sink.span('roof', -hw - 0.2, Ht + 4.6, hz - 2.2, hw + 0.2, Ht + 4.8, hz + 2.2);
  const towerFaces: Face[] = [
    { origin: [0, 0, zt0], u: [-1, 0, 0], out: [0, 0, -1], width: towerW },
    { origin: [tx, 0, (zt0 + zt1) / 2], u: [0, 0, -1], out: [1, 0, 0], width: towerD },
    { origin: [-tx, 0, (zt0 + zt1) / 2], u: [0, 0, 1], out: [-1, 0, 0], width: towerD },
  ];
  for (const f of towerFaces) {
    const cols = f.width > 7 ? [-f.width * 0.22, f.width * 0.22] : [0];
    for (const u of cols) for (let y = 4.0; y < Ht - 2.5; y += 3.4) facePanel(sink, paneBucket(look, 0.12), f, u, y, 0.012, 0.75, 1.1, { decor: true, window: f.out });
    for (let u = -f.width / 2 + 0.9; u < f.width / 2 - 0.6; u += 1.5) facePanel(sink, paneBucket(look, 0.2), f, u, Ht - 1.4, 0.012, 1.0, 1.0, { decor: true, window: f.out });
    for (let y = 6.6; y < Ht - 3; y += 6.8) faceBox(sink, 'plaster2', f, 0, y, 0.04, f.width + 0.08, 0.22, 0.08, { decor: true, shade: 0.88 }, 'ends');
  }
  // the drive-through intake against the tower's side, its gate closed by a structural leaf
  const ix0 = tx, ix1 = Math.min(halfX, tx + 4.2);
  if (ix1 - ix0 > 2.5) {
    sink.span('plaster2', ix0 - 0.2, -0.4, zt0, ix1, 5.0, zt1);
    sink.span('roof', ix0 - 0.2, 5.0, zt0 - 0.2, ix1 + 0.25, 5.2, zt1 + 0.2);
    const gate: Face = { origin: [(ix0 + ix1) / 2, 0, zt0], u: [-1, 0, 0], out: [0, 0, -1], width: ix1 - ix0 };
    faceBox(sink, 'structureMetal', gate, 0, 2.0, 0.03, Math.min(3.0, ix1 - ix0 - 0.6), 3.8, 0.06, { colour: pick(rng, GATE) });
  }
  // dressing: the slip-form rings and stains down the silos, the spouts at the bank's end, the lightning mast and the
  // red plaque on the tower's crown
  for (const sx of [-1, 1]) for (let k = 0; k < n; k++) {
    const z = zt1 + r + k * 2 * r;
    for (let y = 4.5; y < Hs - 1; y += 4.6) sink.cylinder('plaster2', [sx * r, y, z], 'y', 0.16, r + 0.03, 16, { decor: true, shade: 0.82 }, r + 0.03, false);
  }
  for (const sx of [-1, 1]) sink.member('structureMetal', [sx * r * 0.55, 1.2, zb1 - 0.3], [sx * r * 0.55, Hs - 0.5, zb1 - 0.3], 0.22, 0.22, [0, 0, 1], { colour: STEEL, decor: true, exposed: true }, 0);
  sink.cylinder('structureMetal', [0, Ht + 4.8, hz], 'y', 6.0, 0.05, 5, { colour: STEEL_DARK, decor: true }, 0.03);
  faceBox(sink, 'structureMetal', towerFaces[0], 0, Ht - 3.6, 0.05, Math.min(3.6, towerW - 1.2), 1.0, 0.06, { colour: RED, decor: true });
  return sink.finish();
};

/**
 * The machine-tractor station's repair shop: a hall of silicate brick under a low gable of asbestos sheet, a glazed
 * monitor along the ridge, steel gates in both gables, a band of steel-framed windows down the long sides.
 */
const workshop = (ctx: RegionalBuildContext): RegionalParts => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), rng = st.rng, look = st.look;
  const W = clamp(ctx.info.w - 0.8, 9, 18), D = clamp(ctx.info.d - 1.0, 14, 30);
  const H = 5.6 + rng() * 0.8, gate = pick(rng, GATE);
  const steel: WindowStyle = { frame: STEEL_DARK, frameWidth: 0.06, frameOut: 0.04, bars: 'six', surround: null, sill: { bucket: 'plaster2', out: 0.08 }, shutters: null };
  const openings: Opening[] = [
    { face: 'front', storey: 0, kind: 'gate', u: 0, w: Math.min(4.2, W * 0.4), y0: 0, h: 4.4 },
    { face: 'back', storey: 0, kind: 'gate', u: 0, w: Math.min(4.2, W * 0.4), y0: 0, h: 4.4 },
    ...windowRhythm('left', 0, D, { w: 2.2, h: 2.0, sill: 2.3, spacing: 3.2, margin: 1.4 }),
    ...windowRhythm('right', 0, D, { w: 2.2, h: 2.0, sill: 2.3, spacing: 3.2, margin: 1.4 }),
  ];
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.3, out: 0.05, bucket: 'plaster2' }, storeys: [{ h: H, wall: 'stone' }],
    roof: sheetRoof('gable', 12, false, 0.45, 0.3), gableBucket: 'stone', openings, chimneys: [], gutters: null, verge: null, reveal: 0.22,
  }, { ...dialect(st, gate), window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, steel, rng, 0.3) });
  // the monitor along the ridge: a box of glazing under its own low gable
  const mw = Math.min(2.6, W * 0.24), my0 = frame.roof.ridgeY - 0.25, mh = 1.25, md = D * 0.72;
  sink.span('structureMetal', -mw / 2, my0, -md / 2, mw / 2, my0 + mh, md / 2, { colour: STEEL });
  const mr: RoofSpec = { kind: 'gable', pitchDeg: 12, eave: 0.3, verge: 0.25, thickness: 0.08, bucket: 'roof', ridge: 'saddle' };
  emitRoof(sink, roofGeometry(mw, md, my0 + mh, mr), mr);
  for (const sx of [-1, 1]) {
    const f: Face = sx > 0 ? { origin: [mw / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: md } : { origin: [-mw / 2, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: md };
    for (let u = -md / 2 + 0.9; u < md / 2 - 0.6; u += 1.6) facePanel(sink, paneBucket(look, 0.15), f, u, my0 + mh * 0.55, 0.012, 1.3, 0.75, { decor: true, window: f.out });
  }
  // a brick stack at one gable (the smithy's forge)
  const sz = (rng() < 0.5 ? -1 : 1) * (D / 2 - 1.2);
  sink.span('stone', W / 2 - 1.6, 0, sz - 0.5, W / 2 - 0.6, frame.roof.ridgeTopY + 2.2, sz + 0.5);
  return sink.finish();
};

/**
 * The grain store (zernosklad): a long low building of whitewashed saman or silicate brick under a gable of asbestos
 * sheet, plank double doors down both long sides each with its loading step, louvred vents in the gables.
 */
const grainStore = (ctx: RegionalBuildContext): RegionalParts => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), rng = st.rng;
  const W = clamp(ctx.info.w - 0.8, 8, 16), D = clamp(ctx.info.d - 0.8, 14, 30);
  const wall: RegionalBucket = rng() < 0.5 ? 'stone' : 'plaster';
  const doors: Opening[] = [];
  for (const face of ['left', 'right'] as const) {
    const n = Math.max(2, Math.floor(D / 7));
    for (let k = 0; k < n; k++) doors.push({ face, storey: 0, kind: 'door', u: -D / 2 + D * (k + 0.5) / n, w: 2.0, y0: 0, h: 2.4 });
  }
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.6, out: 0.05, bucket: 'plaster2' }, storeys: [{ h: 3.4, wall }],
    roof: sheetRoof('gable', 20, false, 0.6, 0.4), gableBucket: wall, openings: doors, chimneys: [], gutters: null, verge: null,
    spall: wall === 'plaster' ? null : undefined,
  }, {
    window: () => {},
    door: (s, face, o, y0) => {
      const r = s.recess, go = r > 0 ? -r + 0.03 : 0.015;
      for (const side of [-1, 1]) faceBox(s, 'structureWood', face, o.u + side * o.w / 4, y0 + o.y0 + o.h / 2, go, o.w / 2 - 0.03, o.h, 0.05, { colour: PLANK, decor: true });
      faceBox(s, 'plaster2', face, o.u, 0.3, 0.45, o.w + 0.8, 0.6, 0.9, { decor: true });
    },
  });
  for (const f of [frame.faces.front, frame.faces.back]) {
    const vy = frame.eaveY + (frame.roof.ridgeY - frame.eaveY) * 0.4;
    faceBox(sink, 'dark', f, 0, vy, 0.01, 1.2, 0.7, 0.02, { decor: true });
    for (let k = 0; k < 4; k++) faceBox(sink, 'structureWood', f, 0, vy - 0.27 + k * 0.18, 0.04, 1.2, 0.07, 0.06, { colour: PLANK, decor: true, fine: true });
  }
  return sink.finish();
};

/** The warehouse plots: the elevator on the widest (16 m and more), else the repair shop or a grain store. */
const warehouse: RegionalBuilder = (ctx) => (ctx.info.w >= 16 ? elevator(ctx) : ctx.rng() < 0.5 ? workshop(ctx) : grainStore(ctx));

/**
 * The conveyor gallery: the intake pit's shed where the lorries tip, the enclosed belt gallery rising on two steel
 * trestles to the wagon-loading bin, a concrete box on legs over the siding side, its spout.
 */
const conveyor: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const plot = plotAxes(ctx.info);
  const L = clamp(plot.d - 0.6, 12, 26), half = L / 2;
  alongPlot(sink, plot.turned, () => {
    // along z: the intake at +z, the bin tower at -z
    const binS = clamp(plot.w - 1.4, 3.0, 4.2), binH = 13 + rng() * 2;
    const z0 = -half + binS / 2;
    sink.span('plaster2', -binS / 2, -0.4, z0 - binS / 2, binS / 2, binH, z0 + binS / 2);
    sink.span('plaster2', -binS / 2 - 0.15, binH, z0 - binS / 2 - 0.15, binS / 2 + 0.15, binH + 0.3, z0 + binS / 2 + 0.15);
    const shedL = Math.min(4.5, L * 0.22), zi = half - shedL / 2;
    const sw = clamp(plot.w - 0.8, 3.0, 4.6);
    sink.span('plaster2', -sw / 2, -0.4, zi - shedL / 2, sw / 2, 3.2, zi + shedL / 2);
    sink.span('roof', -sw / 2 - 0.25, 3.2, zi - shedL / 2 - 0.2, sw / 2 + 0.25, 3.36, zi + shedL / 2 + 0.25);
    faceBox(sink, 'dark', { origin: [0, 0, zi + shedL / 2], u: [1, 0, 0], out: [0, 0, 1], width: sw }, 0, 1.4, 0.01, sw - 1.0, 2.4, 0.02, { decor: true });
    // the gallery: an inclined box from the intake roof up into the bin, on two trestle bents
    const a: Vec3 = [-1.0, 2.9, zi - shedL / 2 + 0.6], b: Vec3 = [-1.0, binH - 2.2, z0 + binS / 2 - 0.4];
    const livery = rgb(0x8e9490);
    sink.member('structureMetal', a, b, 1.9, 2.0, [1, 0, 0], { colour: livery, exposed: true }, 0);
    for (const t of [0.34, 0.68]) {
      const z = a[2] + (b[2] - a[2]) * t, y = a[1] + (b[1] - a[1]) * t - 1.0;
      for (const x of [-0.9, 0.9]) sink.span('structureMetal', x - 0.14, -0.3, z - 0.14, x + 0.14, y, z + 0.14, { colour: STEEL_DARK });
      sink.span('structureMetal', -1.1, y - 0.3, z - 0.12, 1.1, y, z + 0.12, { colour: STEEL_DARK });
      sink.member('structureMetal', [-0.9, 0.4, z], [0.9, y - 0.4, z], 0.1, 0.1, [0, 0, 1], { colour: STEEL_DARK, decor: true, exposed: true }, 0);
    }
    // the window strip down the gallery's side
    const len = Math.hypot(b[1] - a[1], b[2] - a[2]), dy = (b[1] - a[1]) / len, dz = (b[2] - a[2]) / len;
    for (let s = 1.2; s < len - 0.8; s += 1.6) {
      const y = a[1] + dy * s + 0.3, z = a[2] + dz * s;
      sink.quad('dark', [1.01, y - 0.3, z + 0.5], [1.01, y - 0.3, z - 0.5], [1.01, y + 0.3, z - 0.5], [1.01, y + 0.3, z + 0.5], { decor: true });
    }
    // the bin's spout and its ladder (dressing)
    sink.member('structureMetal', [binS / 2, binH * 0.45, z0], [binS / 2 + 1.0, binH * 0.3, z0], 0.35, 0.35, [0, 0, 1], { colour: STEEL, decor: true, exposed: true }, 0);
    for (const dz of [-0.25, 0.25]) sink.member('structureMetal', [-binS / 2 - 0.12, 0.2, z0 + dz], [-binS / 2 - 0.12, binH, z0 + dz], 0.04, 0.04, [-1, 0, 0], { colour: STEEL_DARK, decor: true, exposed: true }, 0);
  });
  return sink.finish();
};

// ---------------------------------------------------------------------------------------------------------- the MTS

/**
 * The MTS garage: a long block of silicate brick under a shed roof of asbestos sheet, a row of steel gates down its
 * front, one standing open on the dark of the bay (the bay closed for the collision a step inside), a crawler tractor
 * parked on the apron in front of it.
 */
const mtsGarage: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), rng = st.rng, look = st.look;
  const plot = plotAxes(ctx.info);
  const apron = plot.w >= 9.5 ? 3.6 : 0;
  const W = clamp(plot.w - 0.6 - apron, 5.5, 9.5), L = clamp(plot.d - 0.6, 10, 26);
  const cx = -(plot.w / 2) + 0.3 + W / 2;
  const gate = pick(rng, GATE), H = 4.6;
  const bays = Math.max(2, Math.floor(L / 4.6)), bay = L / bays;
  const open = Math.floor(rng() * bays);
  alongPlot(sink, plot.turned, () => {
    sink.placed(0, cx, 0, 0, () => {
      const openings: Opening[] = [];
      for (let k = 0; k < bays; k++) openings.push({ face: 'right', storey: 0, kind: k === open ? 'door' : 'gate', u: -L / 2 + bay * (k + 0.5), w: Math.min(3.4, bay - 1.0), y0: 0, h: 3.6 });
      for (const o of windowRhythm('left', 0, L, { w: 1.6, h: 0.9, sill: 2.6, spacing: 3.0, margin: 1.2 })) openings.push({ ...o, kind: 'loft' });
      const roof = sheetRoof('shed', 6, false, 0.5, 0.35);
      const frame = buildHouse(sink, {
        w: W, d: L, plinth: { h: 0.25, out: 0.04, bucket: 'plaster2' }, storeys: [{ h: H, wall: 'stone' }],
        roof, gableBucket: 'stone', openings, chimneys: [], gutters: null, verge: null, reveal: 0.2,
      }, {
        ...dialect(st, gate),
        door: (s, face, o, y0) => {
          if (o.kind === 'gate') { steelGate(s, face, o.u, y0 + o.y0, o.w, o.h, gate); return; }
          // the open bay: the dark of the garage at the reveal's back (structural: it closes the bay for the collision), its
          // leaf slid back along the wall beside it
          faceBox(s, 'dark', face, o.u, y0 + o.y0 + o.h / 2, -s.recess + 0.03, o.w, o.h, 0.04, {});
          faceBox(s, 'structureMetal', face, o.u + o.w * 0.75, y0 + o.y0 + o.h / 2, 0.08, o.w * 0.5, o.h, 0.06, { colour: gate, decor: true });
        },
      });
      shedGables(sink, W, L, frame.eaveY, Math.tan(6 * Math.PI / 180), 'stone');
    });
    // the tractor on the apron, nosing out of the open bay
    if (apron > 0) crawlerTractor(sink, cx + W / 2 + apron / 2 + 0.1, -L / 2 + bay * (open + 0.5), 0, pick(look, MACHINE));
  });
  return sink.finish();
};

/**
 * The implement shed (naves): a long lean-to open along its front on steel posts, a brick back wall and gable ends, a
 * shed roof of asbestos sheet falling to the front; the seed drills under it.
 */
const implementShed: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const plot = plotAxes(ctx.info);
  const W = clamp(plot.w - 0.5, 4.5, 8), L = clamp(plot.d - 0.5, 6, 18);
  const hBack = 3.9, hFront = 3.1, wall: RegionalBucket = rng() < 0.6 ? 'stone' : 'plaster2';
  alongPlot(sink, plot.turned, () => {
    // the back wall along -x, the gable ends part way forward, the posts along +x
    sink.span(wall, -W / 2, -0.3, -L / 2, -W / 2 + 0.32, hBack, L / 2);
    const posts = Math.max(2, Math.round(L / 3.6) + 1);
    for (let k = 0; k < posts; k++) {
      const z = -L / 2 + 0.2 + (L - 0.4) * k / (posts - 1);
      sink.span('structureMetal', W / 2 - 0.35, -0.3, z - 0.1, W / 2 - 0.15, hFront, z + 0.1, { colour: STEEL_DARK });
    }
    sink.span('structureMetal', W / 2 - 0.4, hFront - 0.25, -L / 2, W / 2 - 0.1, hFront, L / 2, { colour: STEEL_DARK });
    const tanP = (hBack - hFront) / (W - 0.2);
    const roof: RoofSpec = { kind: 'shed', pitchDeg: Math.atan(tanP) * 180 / Math.PI, eave: 0.4, verge: 0.3, thickness: 0.1, bucket: 'roof', ridge: null };
    emitRoof(sink, roofGeometry(W, L, hFront, roof), roof);
    // the gable ends part way forward, their tops under the slope (roofGeometry: the underside at x is hFront + (W/2 - x) tanP)
    const yAt = (x: number) => hFront + (W / 2 - x) * tanP - 0.02, xe = W * 0.1;
    wallPolygon(sink, wall, { origin: [0, 0, L / 2], u: [1, 0, 0], out: [0, 0, 1], width: W },
      [[-W / 2, -0.3], [xe, -0.3], [xe, yAt(xe)], [-W / 2, yAt(-W / 2)]], 0.32);
    wallPolygon(sink, wall, { origin: [0, 0, -L / 2], u: [-1, 0, 0], out: [0, 0, -1], width: W },
      [[-xe, -0.3], [W / 2, -0.3], [W / 2, yAt(-W / 2)], [-xe, yAt(xe)]], 0.32);
    // the seed drills: a hopper on its wheels and drawbar, in the shed's shade (dressing)
    for (const z of [-L * 0.22, L * 0.22]) {
      if (look() < 0.25) continue;
      const c = pick(look, MACHINE);
      sink.span('structureMetal', -1.1, 0.75, z - 1.6, 0.3, 1.35, z + 1.6, { colour: c, decor: true });
      for (const sz of [-1, 1]) sink.cylinder('structureMetal', [-0.4, 0.55, z + sz * 1.75], 'z', 0.12, 0.55, 10, { colour: STEEL_DARK, decor: true });
      sink.member('structureMetal', [0.3, 0.6, z], [1.6, 0.45, z], 0.1, 0.1, [0, 1, 0], { colour: STEEL_DARK, decor: true, exposed: true }, 0);
    }
  });
  return sink.finish();
};

// ---------------------------------------------------------------------------------------------------------- water, fire, fuel

/**
 * The Rozhnovsky water tower: a welded steel column on a concrete pad, the tank wider than it on a conical floor under a
 * low cone, the ladder up the column, the hatch rail; the pump house of brick at its foot where the plot allows.
 */
const rozhnovsky: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const half = Math.min(ctx.info.w, ctx.info.d) / 2;
  const R = clamp(half * 0.22, 0.55, 0.85), Rt = clamp(half - 0.5, 1.6, 2.4);
  const H = clamp(ctx.info.h + 3, 14, 20), Ht = 3.2 + rng() * 0.6;
  const paint = rng() < 0.5 ? SILVER : pick(rng, [rgb(0x8aa4b0), rgb(0x9a9a8e)]);
  sink.span('plaster2', -R - 0.5, -0.4, -R - 0.5, R + 0.5, 0.35, R + 0.5);
  sink.cylinder('structureMetal', [0, 0.35, 0], 'y', H - 0.35, R, 12, { colour: shade(paint, 0.94) });
  sink.cylinder('structureMetal', [0, H, 0], 'y', 1.0, R, 14, { colour: shade(paint, 0.86) }, Rt, false);
  sink.cylinder('structureMetal', [0, H + 1.0, 0], 'y', Ht, Rt, 14, { colour: paint });
  sink.cylinder('structureMetal', [0, H + 1.0 + Ht, 0], 'y', 1.0, Rt + 0.06, 14, { colour: shade(paint, 0.9) }, 0.28);
  sink.cylinder('structureMetal', [0, H + 2.0 + Ht, 0], 'y', 0.35, 0.22, 8, { colour: STEEL_DARK, decor: true });
  // the ladder up the column and the rail round the tank's roof (dressing)
  for (const dx of [-0.22, 0.22]) sink.member('structureMetal', [dx, 0.4, R + 0.18], [dx, H + 0.9, R + 0.18], 0.04, 0.04, [0, 0, 1], { colour: STEEL_DARK, decor: true, exposed: true }, 0);
  for (let y = 0.8; y < H + 0.8; y += 0.4) sink.member('structureMetal', [-0.22, y, R + 0.18], [0.22, y, R + 0.18], 0.03, 0.03, [0, 0, 1], { colour: STEEL_DARK, decor: true, exposed: true, fine: true }, 0);
  const ry = H + 1.0 + Ht + 0.55;
  for (let k = 0; k < 8; k++) {
    const a0 = k * Math.PI / 4, a1 = (k + 1) * Math.PI / 4, rr = Rt * 0.62;
    sink.member('structureMetal', [Math.cos(a0) * rr, ry, Math.sin(a0) * rr], [Math.cos(a1) * rr, ry, Math.sin(a1) * rr], 0.035, 0.035, [0, 1, 0], { colour: STEEL_DARK, decor: true, exposed: true, fine: true }, 0);
  }
  // rust weeping from the tank's seams (a darker band round its floor)
  sink.cylinder('structureMetal', [0, H + 0.95, 0], 'y', 0.3, Rt + 0.02, 14, { colour: rgb(0x7a5a44), decor: true }, Rt + 0.02, false);
  // the pump house of brick at the foot
  if (half >= 2.4) {
    const px0 = R + 0.3, px1 = Math.min(half - 0.15, px0 + 1.9);
    if (px1 - px0 > 1.2) {
      sink.span('stone', px0, -0.3, -1.1, px1, 2.3, 1.1);
      const pr: RoofSpec = { kind: 'shed', pitchDeg: 8, eave: 0.2, verge: 0.15, thickness: 0.07, bucket: 'roof', ridge: null };
      sink.placed(0, (px0 + px1) / 2, 0, 0, () => {
        emitRoof(sink, roofGeometry(px1 - px0, 2.2, 2.3, pr), pr);
        shedGables(sink, px1 - px0, 2.2, 2.3, Math.tan(8 * Math.PI / 180), 'stone');
      });
      faceBox(sink, 'structureWood', { origin: [px1, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: 2.2 }, 0, 0.95, 0.02, 0.8, 1.8, 0.04, { colour: pick(rng, PAINTS), decor: true });
    }
  }
  return sink.finish();
};

/** The boiler house's stack: a banded steel chimney on a concrete foundation block, its ladder and cleaning door. */
const boilerStack: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const base = clamp(Math.min(ctx.info.w, ctx.info.d) - 0.6, 2.0, 3.0);
  const H = 20 + rng() * 6, r0 = 0.56, r1 = 0.46;
  sink.span('plaster2', -base / 2, -0.4, -base / 2, base / 2, 1.1, base / 2);
  sink.cylinder('structureMetal', [0, 1.1, 0], 'y', H - 4.2, r0, 12, { colour: rgb(0x55595a) }, r1 + 0.03);
  // the aviation bands: red and white in turn at the crown
  for (let k = 0; k < 4; k++) {
    sink.cylinder('structureMetal', [0, H - 3.1 + k * 0.78, 0], 'y', 0.78, r1 + 0.02, 12, { colour: k % 2 ? rgb(0xd8d6d0) : RED }, r1, k === 3);
  }
  const f: Face = { origin: [0, 0, base / 2], u: [1, 0, 0], out: [0, 0, 1], width: base };
  faceBox(sink, 'structureMetal', f, 0, 0.75, 0.02, 0.6, 0.6, 0.04, { colour: STEEL_DARK, decor: true });
  for (const dx of [-0.18, 0.18]) sink.member('structureMetal', [dx, 1.2, r0 + 0.14], [dx, H - 0.4, r1 + 0.14], 0.035, 0.035, [0, 0, 1], { colour: STEEL_DARK, decor: true, exposed: true }, 0);
  // soot at the mouth
  sink.cylinder('structureMetal', [0, H + 0.02, 0], 'y', 0.12, r1 + 0.03, 12, { colour: rgb(0x1e1c1a), decor: true }, r1 + 0.03, false);
  return sink.finish();
};

/** The fuel store: horizontal tanks on concrete saddles in a row, the pump kiosk and its dispenser. */
function fuelDepot(ctx: RegionalBuildContext): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const plot = plotAxes(ctx.info);
  const W = clamp(plot.w - 0.6, 5, 9), L = clamp(plot.d - 0.6, 10, 20);
  alongPlot(sink, plot.turned, () => {
    const r = clamp(W * 0.17, 1.0, 1.4), tankL = clamp(W - 1.2, 4.5, 7.5);
    const n = Math.max(2, Math.min(4, Math.floor((L - 3.2) / (2 * r + 0.9))));
    const pitch = 2 * r + 0.9;
    const zs = -L / 2 + 0.4 + r;
    for (let k = 0; k < n; k++) {
      const z = zs + k * pitch, c = shade(SILVER, 0.92 + rng() * 0.12);
      for (const x of [-tankL * 0.3, tankL * 0.3]) sink.span('plaster2', x - 0.35, -0.3, z - r * 0.8, x + 0.35, r * 0.75, z + r * 0.8);
      sink.cylinder('structureMetal', [-tankL / 2, r + 0.3, z], 'x', tankL, r, 14, { colour: c });
      // the dome ends and the filler's manhole (dressing)
      sink.cylinder('structureMetal', [tankL / 2, r + 0.3, z], 'x', 0.25, r * 0.98, 14, { colour: shade(c, 0.95), decor: true }, r * 0.7);
      sink.cylinder('structureMetal', [-tankL / 2 - 0.25, r + 0.3, z], 'x', 0.25, r * 0.7, 14, { colour: shade(c, 0.95), decor: true }, r * 0.98);
      sink.cylinder('structureMetal', [tankL * 0.18, 2 * r + 0.28, z], 'y', 0.22, 0.28, 8, { colour: shade(c, 0.85), decor: true });
      sink.member('structureMetal', [-tankL * 0.3, r * 0.4, z + r * 0.8], [-tankL * 0.3, r * 0.4, z + pitch - r * 0.8], 0.12, 0.12, [0, 1, 0], { colour: STEEL_DARK, decor: true, exposed: true }, 0);
    }
    // the kiosk at the row's end and its dispenser
    const kz = zs + n * pitch - r + 1.6;
    if (kz + 1.2 < L / 2) {
      sink.span('stone', -1.2, -0.3, kz - 1.0, 1.2, 2.4, kz + 1.0);
      const kr: RoofSpec = { kind: 'shed', pitchDeg: 8, eave: 0.25, verge: 0.2, thickness: 0.07, bucket: 'roof', ridge: null };
      sink.placed(0, 0, 0, kz, () => emitRoof(sink, roofGeometry(2.4, 2.0, 2.4, kr), kr));
      sink.span('structureMetal', 1.4, 0, kz - 0.3, 1.9, 1.6, kz + 0.3, { colour: RED, decor: true });
      faceBox(sink, 'structureWood', { origin: [0, 0, kz + 1.0], u: [1, 0, 0], out: [0, 0, 1], width: 2.4 }, -0.4, 0.95, 0.02, 0.8, 1.9, 0.04, { colour: pick(look, PAINTS), decor: true });
    }
  });
  return sink.finish();
}

/** The brigade's living wagons (vagonchiki): plank or sheet boxes on sledge runners, their doors and steps, stove pipes. */
function wagons(ctx: RegionalBuildContext): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const plot = plotAxes(ctx.info);
  const W = clamp(plot.w - 0.6, 4.5, 9), L = clamp(plot.d - 0.6, 8, 20);
  alongPlot(sink, plot.turned, () => {
    const rows = W >= 6.4 ? 2 : 1, per = Math.max(1, Math.min(3, Math.floor((L + 1.2) / 6.6)));
    const wl = Math.min(6.0, (L - (per - 1) * 1.0) / per), ww = 2.5, wh = 2.4;
    for (let i = 0; i < rows; i++) for (let k = 0; k < per; k++) {
      if (rows * per > 2 && rng() < 0.12) continue;
      const x = rows === 2 ? (i ? 1 : -1) * (W / 2 - ww / 2 - 0.2) : 0, z = -L / 2 + wl / 2 + k * (wl + 1.0);
      const c = pick(rng, [rgb(0x5a7a52), rgb(0x46607a), rgb(0x8a6a3a), rgb(0x7a3e30), rgb(0x9aa0a0)]);
      // the runners, the body on them, its gently arched roof in two slopes
      for (const sx of [-1, 1]) sink.span('structureWood', x + sx * (ww / 2 - 0.3) - 0.12, -0.2, z - wl / 2 - 0.3, x + sx * (ww / 2 - 0.3) + 0.12, 0.3, z + wl / 2 + 0.3, { colour: PLANK });
      sink.span('structureMetal', x - ww / 2, 0.3, z - wl / 2, x + ww / 2, 0.3 + wh, z + wl / 2, { colour: c });
      const roof: RoofSpec = { kind: 'gable', pitchDeg: 12, eave: 0.1, verge: 0.12, thickness: 0.06, bucket: 'structureMetal', ridge: null };
      sink.placed(0, x, 0, z, () => emitRoof(sink, roofGeometry(ww, wl, 0.3 + wh, roof), roof, shade(c, 0.85)));
      const end: Face = { origin: [x, 0, z + wl / 2], u: [1, 0, 0], out: [0, 0, 1], width: ww };
      faceBox(sink, 'structureWood', end, -0.5, 1.3, 0.02, 0.75, 1.75, 0.04, { colour: shade(c, 0.7), decor: true });
      for (let s = 0; s < 2; s++) faceBox(sink, 'structureWood', end, -0.5, 0.12 + s * 0.15, 0.25 + (1 - s) * 0.25, 0.8, 0.06, 0.28, { colour: PLANK, decor: true });
      const side: Face = { origin: [x + ww / 2, 0, z], u: [0, 0, -1], out: [1, 0, 0], width: wl };
      for (const u of [-wl * 0.25, wl * 0.25]) facePanel(sink, paneBucket(look, 0.5), side, u, 1.75, 0.015, 0.7, 0.6, { decor: true, window: [1, 0, 0] });
      sink.cylinder('structureMetal', [x - ww * 0.25, 0.3 + wh, z - wl * 0.3], 'y', 0.9, 0.07, 6, { colour: rgb(0x2a2a2a), decor: true });
    }
  });
  return sink.finish();
}

/** The container plots: the fuel store or the brigade's wagons. */
const containerRow: RegionalBuilder = (ctx) => (ctx.rng() < 0.5 ? fuelDepot(ctx) : wagons(ctx));

// ---------------------------------------------------------------------------------------------------------- farm

/**
 * The sheep barn (koshara): a long low building of whitewashed saman under reed thatch or asbestos sheet, small high
 * windows down the sides, the wide plank doors in its gables, ventilation boxes on the ridge.
 */
const koshara: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), rng = st.rng;
  const plot = plotAxes(ctx.info);
  const W = clamp(plot.w - 0.5, 6, 11), L = clamp(plot.d - 0.5, 9, 22);
  const reed = rng() < 0.45;
  const roof: RoofSpec = reed
    ? { kind: 'gable', pitchDeg: 32, eave: 0.55, verge: 0.4, thickness: 0.32, bucket: 'straw', ridge: 'round' }
    : sheetRoof('gable', 18, false, 0.5, 0.35);
  const openings: Opening[] = [
    { face: 'front', storey: 0, kind: 'door', u: 0, w: 2.4, y0: 0, h: 2.3 },
    { face: 'back', storey: 0, kind: 'door', u: 0, w: 2.4, y0: 0, h: 2.3 },
  ];
  for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, 0, L, { w: 0.6, h: 0.45, sill: 1.7, spacing: 2.2, margin: 1.0 })) openings.push({ ...o, kind: 'loft' });
  alongPlot(sink, plot.turned, () => {
    const frame = buildHouse(sink, {
      w: W, d: L, plinth: { h: 0.3, out: 0.06, bucket: 'stone' }, storeys: [{ h: 2.5, wall: 'plaster' }],
      roof, gableBucket: reed ? 'wood' : 'plaster', openings, chimneys: [], gutters: null, verge: null, spall: null,
    }, {
      ...dialect({ ...st, litShare: 0 }),
      door: (s, face, o, y0) => {
        // plank double doors, closed (their leaves structural, so a hull cannot drive into the barn)
        const r = s.recess, go = r > 0 ? -r + 0.03 : 0.015;
        for (const side of [-1, 1]) faceBox(s, 'structureWood', face, o.u + side * o.w / 4, y0 + o.y0 + o.h / 2, go, o.w / 2 - 0.03, o.h, 0.05, { colour: PLANK });
        faceBox(s, 'structureWood', face, o.u, y0 + o.y0 + o.h * 0.5, go + 0.04, o.w - 0.1, 0.12, 0.03, { colour: shade(PLANK, 0.8), decor: true, fine: true });
      },
    });
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
 * The small store (a shed, a cellar head, the yard's outbuilding): saman or brick under a shed or low gable roof of
 * sheet, a plank door, a vent; on a yard's small plot it builds to that plot.
 */
const store: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), rng = st.rng;
  const W = clamp(ctx.info.w - 0.5, 2.0, 7.0), D = clamp(ctx.info.d - 0.5, 1.8, 9.0);
  const wall: RegionalBucket = rng() < 0.45 ? 'stone' : 'plaster';
  const sheet = rng() < 0.55, livery = pick(rng, SHEET);
  const h = Math.min(W, D) < 3 ? 2.1 : 2.5;
  const shed = rng() < 0.55;
  const roof = shed ? sheetRoof('shed', 9, sheet, 0.3, 0.2) : sheetRoof('gable', 20, sheet, 0.3, 0.25);
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: (rng() - 0.5) * Math.max(0, W - 1.6) * 0.6, w: 0.85, y0: 0, h: 1.85 }];
  if (D > 3.4) openings.push({ face: 'left', storey: 0, kind: 'loft', u: 0, w: 0.5, y0: 1.5, h: 0.4 });
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.25, out: 0.04, bucket: 'stone' }, storeys: [{ h, wall }],
    roof, roofColour: sheet ? livery : undefined, gableBucket: shed ? wall : 'wood', openings, chimneys: [], gutters: null, verge: null,
    spall: wall === 'plaster' ? null : undefined, reveal: 0.1,
  }, dialect({ ...st, litShare: 0 }));
  if (shed) shedGables(sink, W, D, frame.eaveY, Math.tan(9 * Math.PI / 180), wall);
  return sink.finish();
};

/**
 * A shelled house: the saman walls broken to stubs, the roof gone but for a few rafters and sheets fallen in, the brick
 * stove and its stack standing in the ruin.
 */
const ruinedHouse: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = clamp(ctx.info.w - 0.6, 4.5, 8), D = clamp(ctx.info.d - 0.6, 6, 10), t = 0.4;
  sink.span('stone', -W / 2 - 0.05, -0.4, -D / 2 - 0.05, W / 2 + 0.05, 0.45, D / 2 + 0.05);
  for (const [x0, z0, x1, z1] of [[-W / 2, -D / 2, W / 2, -D / 2 + t], [-W / 2, D / 2 - t, W / 2, D / 2], [-W / 2, -D / 2 + t, -W / 2 + t, D / 2 - t], [W / 2 - t, -D / 2 + t, W / 2, D / 2 - t]] as const) {
    const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    for (let k = 0; k < 4; k++) {
      if (rng() < 0.28) continue;
      const a = k / 4, b = (k + 1) / 4, top = 0.45 + 0.3 + rng() * 2.1;
      if (along) sink.span('plaster', x0 + (x1 - x0) * a, 0.45, z0, x0 + (x1 - x0) * b, top, z1);
      else sink.span('plaster', x0, 0.45, z0 + (z1 - z0) * a, x1, top, z0 + (z1 - z0) * b);
    }
  }
  // the stove and its stack, scorched
  sink.span('stone', -0.8, 0.45, -0.7, 0.7, 1.8, 0.8);
  sink.span('stone', -0.35, 1.8, -0.25, 0.3, 4.4 + rng() * 0.6, 0.35);
  // fallen rafters and roof sheets
  for (let k = 0; k < 5; k++) {
    const a: Vec3 = [(rng() - 0.5) * W * 0.8, 0.5, (rng() - 0.5) * D * 0.8];
    const b: Vec3 = [a[0] + (rng() - 0.5) * 3.2, 0.5 + rng() * 1.6, a[2] + (rng() - 0.5) * 3.2];
    sink.member('structureWood', a, b, 0.14, 0.12, [0, 1, 0], { colour: k % 2 ? CHAR : PLANK, decor: true, exposed: true });
  }
  // sheets of the roof fallen in, lying across the rubble (thin slabs, seen from either side)
  for (let k = 0; k < 3; k++) {
    const x = (rng() - 0.5) * W * 0.6, z = (rng() - 0.5) * D * 0.6, rise = 0.25 + rng() * 0.6;
    const a: Vec3 = [x - 0.85, 0.5, z], b: Vec3 = [x + 0.85, 0.5 + rise, z];
    const len = Math.hypot(1.7, rise), up: Vec3 = [-rise / len, 1.7 / len, 0];
    sink.member('roof', a, b, 1.1, 0.03, up, { decor: true, exposed: true }, 0);
  }
  return sink.finish();
};

export const TSELINA_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  cottage: settlerHouse,
  farmhouse: twoFamilyHouse,
  cornershop: club,
  warehouse,
  gantry: conveyor,
  depot: mtsGarage,
  shed: implementShed,
  watertower: rozhnovsky,
  stack: boilerStack,
  containerRow,
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
    sourced: { plaster: false, wood: true },
    tones: {
      plaster: whitewash,
      // slip-formed concrete: a warm light grey
      plaster2: (_h, s, l) => [0.1, Math.min(1, s * 0.16), Math.min(1, l * 1.06 + 0.06)],
      // the clubs' and offices' ochre distemper
      plaster3: (_h, s, l) => [0.115, Math.min(1, s * 2.4 + 0.14), Math.min(1, l * 1.1 + 0.12)],
      straw: (h, s, l) => [h - 0.012, Math.min(1, s * 0.55), Math.min(1, l * 0.82)],
    },
  },
  builders: TSELINA_BUILDERS,
  weather: {
    plaster: [[1, 1, 1], [1.0, 0.97, 0.92], [0.95, 0.95, 0.93], [1.02, 0.99, 0.9]],
    stone: [[1, 1, 1], [0.95, 0.94, 0.9], [1.0, 0.98, 0.94], [0.9, 0.89, 0.86]],
    roof: [[1, 1, 1], [0.92, 0.9, 0.86], [0.84, 0.83, 0.8], [1.04, 1.02, 0.98]],
    // a dry continental climate: little rising damp, lichen rather than moss
    damp: 0.4, moss: 0.15, mossTint: [1.0, 0.92, 0.7],
  },
  wear: 0.25,
  // the settlers' yards: a picket fence round the kitchen garden (ogorod), a gate, the shed in its corner (yards.ts)
  yard: { kinds: ['cottage', 'farmhouse'], fence: 'fencepicket', gate: 'gate', shed: 'granary', shedSize: [3.6, 3.0], garden: true },
});
