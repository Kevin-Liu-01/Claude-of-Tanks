// src/world/maps/regional/bengal.ts — the Bengal kit (Jade River Delta: a market village on a char of the braided
// Jamuna). Homesteads raised on earthen plinths (bhiti) above the flood line: houses walled and roofed with corrugated
// iron sheet — galvanised, rust-streaked or painted — under four-slope (char-chala) or two-slope roofs, with a bamboo
// veranda and plank shutters; the bazaar's long tin sheds on posts with shuttered stalls; brick shops with a flat roof
// and a signboard; a whitewashed mosque with small domes and a slender minaret; round clay-and-bamboo rice granaries
// (gola) under conical thatch; the river ghat's boat sheds.
import { PartSink, faceBox, pick, rgb, type Face, type RegionalBucket, type RegionalParts, type Rgb } from './geometry.ts';
import { buildHouse, emitRoof, roofGeometry, windowRhythm, type HouseDialect, type Opening, type RoofSpec } from './house.ts';
import { doorUnit, windowUnit, type WindowStyle } from './openings.ts';
import { BAMBOO_MAT, GALVANISED, PAINTED_SHEET, RUSTED, WEATHERED_PLANK, sheetWall, veranda } from './vernacular.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';

const SHUTTERS: readonly Rgb[] = [0x3f6f9a, 0x4f8a62, 0x8a4a3a, 0x6a5a46].map(rgb);

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

/** The livery of one sheet: galvanised, rusted or painted. */
function sheetColour(rng: () => number): Rgb {
  const roll = rng();
  return roll < 0.45 ? pick(rng, GALVANISED) : roll < 0.75 ? pick(rng, RUSTED) : pick(rng, PAINTED_SHEET);
}

/** The tin house: an earthen plinth, sheet walls on a timber frame, plank shutters, a char-chala sheet roof, a veranda. */
function tinHouse(ctx: RegionalBuildContext, opts: { big?: boolean } = {}): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(4.8, Math.min(opts.big ? 8 : 6.6, ctx.info.w - 0.6)), D = Math.max(6.4, Math.min(opts.big ? 11 : 9, ctx.info.d - 0.6));
  const plinth = 0.7 + rng() * 0.5;
  // the bhiti: a raised earth platform a step wider than the house (rendered in mud plaster)
  sink.span('plaster3', -W / 2 - 1.2, -0.4, -D / 2 - 1.2, W / 2 + 1.2, plinth, D / 2 + 1.2);
  const wallH = 2.5, walls = sheetColour(rng), frame = pick(rng, WEATHERED_PLANK);
  sink.placed(0, 0, plinth, 0, () => {
    // the structural shell is the sheet wall itself (corrugated tile under the livery)
    sink.span('structureMetal', -W / 2, 0, -D / 2, W / 2, wallH, D / 2, { colour: walls });
    const faces: Face[] = [
      { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W }, { origin: [W / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D },
      { origin: [0, 0, -D / 2], u: [-1, 0, 0], out: [0, 0, -1], width: W }, { origin: [-W / 2, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: D },
    ];
    // timber frame strips at the corners and wall plate, patched sheets of other liveries
    for (const f of faces) {
      for (const u of [-f.width / 2 + 0.06, f.width / 2 - 0.06]) faceBox(sink, 'structureWood', f, u, wallH / 2, 0.03, 0.1, wallH, 0.05, { colour: frame, decor: true });
      faceBox(sink, 'structureWood', f, 0, wallH - 0.06, 0.03, f.width, 0.12, 0.05, { colour: frame, decor: true });
      if (rng() < 0.5) {
        // drawn on every tier so the phones' roof and veranda match the desktop ones
        const pu = (rng() - 0.5) * (f.width - 1.4), pw = 0.9 + rng() * 0.6, ph = 1.1 + rng() * 0.9, livery = sheetColour(rng);
        if (ctx.tier !== 'mobile') sheetWall(sink, f, pu - pw / 2, pu + pw / 2, 0.1, 0.1 + ph, livery, true);
      }
    }
    const shutter = pick(rng, SHUTTERS);
    doorUnit(sink, faces[0], W * 0.15, 0, 0.9, 1.95, { leaf: shutter, frame: { bucket: 'structureWood', width: 0.09, out: 0.05, colour: frame }, steps: null, leafKind: 'plank' }, 0);
    for (const [f, us] of [[faces[0], [-W * 0.25]], [faces[1], [-D * 0.2, D * 0.2]], [faces[3], [0]]] as const) {
      for (const u of us) {
        faceBox(sink, 'dark', f, u, 1.3, 0.005, 0.7, 0.7, 0.02, { decor: true });
        faceBox(sink, 'structureWood', f, u - 0.36, 1.3, 0.04, 0.34, 0.74, 0.04, { colour: shutter, decor: true });
        faceBox(sink, 'structureWood', f, u + 0.36, 1.3, 0.04, 0.34, 0.74, 0.04, { colour: shutter, decor: true });
      }
    }
  });
  // the roof: four-slope char-chala (or two-slope), sheet with its own livery
  const roof: RoofSpec = { kind: rng() < 0.6 ? 'hip' : 'gable', pitchDeg: 24 + rng() * 6, eave: 0.55, verge: 0.55, thickness: 0.06, bucket: 'structureMetal', ridge: 'saddle' };
  emitRoof(sink, roofGeometry(W, D, plinth + wallH, roof), roof, sheetColour(rng));
  veranda(sink, { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W }, plinth, plinth + wallH - 0.1, W, 1.5, rgb(0x9a8a62), { bucket: 'structureMetal', colour: sheetColour(rng) }, false);
  return sink.finish();
}

/** The bazaar shed: a long sheet roof on posts over two rows of shuttered stalls. */
const bazaar: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(6, Math.min(10, ctx.info.w - 0.6)), D = Math.max(9, Math.min(20, ctx.info.d - 0.6));
  sink.span('plaster3', -W / 2 - 0.5, -0.3, -D / 2 - 0.5, W / 2 + 0.5, 0.5, D / 2 + 0.5);
  const top = 3.2;
  for (const sx of [-1, 1]) for (let k = 0, n = Math.max(2, Math.round(D / 3) + 1); k < n; k++) {
    const x = sx * (W / 2 - 0.15), z = -D / 2 + 0.15 + (D - 0.3) * k / (n - 1);
    sink.span('structureWood', x - 0.09, 0.5, z - 0.09, x + 0.09, top, z + 0.09, { colour: BAMBOO_MAT });
  }
  // the stall boxes along the spine, shutters half open
  for (let z = -D / 2 + 1.3; z < D / 2 - 1.0; z += 2.6) for (const side of [-1, 1]) {
    const x = side * 0.9;
    sink.span('structureMetal', x - 0.8, 0.5, z - 1.15, x + 0.8, 2.6, z + 1.15, { colour: sheetColour(rng) });
    faceBox(sink, 'dark', { origin: [x + side * 0.8, 0, z], u: [0, 0, -side], out: [side, 0, 0], width: 2.3 }, 0, 1.55, 0.005, 1.9, 1.6, 0.02, { decor: true });
  }
  const roof: RoofSpec = { kind: 'gable', pitchDeg: 18, eave: 0.6, verge: 0.4, thickness: 0.06, bucket: 'roof', ridge: 'saddle' };
  emitRoof(sink, roofGeometry(W, D, top, roof), roof);
  return sink.finish();
};

/** A brick shop: two storeys, a flat roof with a parapet, a rolling shutter and a painted signboard. */
const brickShop: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(6, Math.min(9, ctx.info.w - 0.6)), D = Math.max(7, Math.min(10, ctx.info.d - 0.6));
  const rendered = rng() < 0.5;
  const wall: RegionalBucket = rendered ? 'plaster' : 'stone';
  const style: WindowStyle = { frame: rgb(0x4a5a6a), frameWidth: 0.06, frameOut: 0.04, bars: 'two', surround: null, sill: { bucket: 'plaster', out: 0.08 }, shutters: null };
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'gate', u: 0, w: W - 1.6, y0: 0, h: 2.6 }];
  for (const face of ['front', 'left', 'right'] as const) {
    for (const o of windowRhythm(face, 1, face === 'front' ? W : D, { w: 1.1, h: 1.3, sill: 0.9, spacing: 2.2, margin: 0.9 })) openings.push(o);
  }
  const dialect: HouseDialect = {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, style, rng, 0.5),
    door: (s, face, o, y0) => {
      // the rolling shutter: a ribbed steel curtain half raised over a dark shopfront
      faceBox(s, 'dark', face, o.u, y0 + o.h / 2, 0.005, o.w, o.h, 0.02, { decor: true });
      faceBox(s, 'structureMetal', face, o.u, y0 + o.h * 0.78, 0.04, o.w, o.h * 0.44, 0.05, { colour: pick(rng, GALVANISED), decor: true });
    },
  };
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.4, out: 0.05, bucket: 'stone' }, storeys: [{ h: 3.2, wall }, { h: 3.0, wall }],
    roof: { kind: 'flat', pitchDeg: 0, eave: 0.12, verge: 0.12, thickness: 0.2, bucket: 'plaster', parapet: 0.8 }, gableBucket: wall,
    openings, chimneys: [], gutters: null, verge: null,
  }, dialect);
  faceBox(sink, 'structureWood', frame.faces.front, 0, 3.0, 0.05, W - 0.8, 0.6, 0.05, { colour: pick(rng, PAINTED_SHEET), decor: true });
  return sink.finish();
};

/** The village mosque: a whitewashed hall, three small domes, a slender minaret at one corner. */
const mosque: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const W = Math.max(6, Math.min(8.5, ctx.info.w - 0.4)), D = Math.max(7.5, Math.min(10, ctx.info.d - 0.4));
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.4, y0: 0, h: 2.6 }];
  for (const u of [-W * 0.3, W * 0.3]) openings.push({ face: 'front', storey: 0, kind: 'door', u, w: 1.0, y0: 0, h: 2.3 });
  for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, 0, D, { w: 0.9, h: 1.6, sill: 0.9, spacing: 2.4, margin: 1.0 })) openings.push(o);
  const dialect: HouseDialect = {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { frame: rgb(0x3e6a5a), frameWidth: 0.06, frameOut: 0.04, bars: 'two', surround: { bucket: 'plaster', width: 0.14, out: 0.06, lintel: 0.24 }, sill: null, shutters: null }, ctx.rng, 0.4),
    door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: rgb(0x3e6a5a), frame: { bucket: 'plaster', width: 0.18, out: 0.08, arch: true }, steps: { bucket: 'stone' }, leafKind: 'panel' }, y0 + o.y0),
  };
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.6, out: 0.1, bucket: 'stone' }, storeys: [{ h: 4.0, wall: 'plaster' }],
    roof: { kind: 'flat', pitchDeg: 0, eave: 0.15, verge: 0.15, thickness: 0.22, bucket: 'plaster', parapet: 0.6 }, gableBucket: 'plaster',
    openings, chimneys: [], gutters: null, verge: null,
  }, dialect);
  const top = frame.eaveY + 0.22;
  for (const [x, r] of [[-W * 0.3, 0.9], [0, 1.3], [W * 0.3, 0.9]] as const) {
    sink.cylinder('plaster', [x, top, 0], 'y', 0.4, r, 12, {});
    const prof = [1.0, 0.98, 0.9, 0.74, 0.5, 0.2];
    let y = top + 0.4;
    for (let k = 0; k + 1 < prof.length; k++) { sink.cylinder('plaster', [x, y, 0], 'y', r * 0.26, r * prof[k], 12, {}, r * prof[k + 1], k === prof.length - 2); y += r * 0.26; }
    sink.cylinder('structureMetal', [x, y, 0], 'y', 0.5, 0.05, 6, { colour: rgb(0xb8933e), decor: true }, 0.02);
  }
  // the minaret at the front corner
  const mx = W / 2 + 0.2, mz = D / 2 + 0.2;
  sink.cylinder('plaster', [mx, 0, mz], 'y', 11.5, 0.75, 10, {}, 0.55);
  sink.cylinder('plaster', [mx, 8.6, mz], 'y', 0.3, 1.05, 10, { decor: true });
  sink.cylinder('plaster', [mx, 11.5, mz], 'y', 1.3, 0.55, 10, {}, 0.05);
  return sink.finish();
};

/** The gola: a round rice granary of clay-plastered bamboo on a plinth, under a conical thatch. */
const gola: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const R = Math.max(1.4, Math.min(2.1, Math.min(ctx.info.w, ctx.info.d) / 2 - 0.4));
  sink.cylinder('plaster3', [0, -0.3, 0], 'y', 0.9, R + 0.4, 12, {});
  sink.cylinder('plaster3', [0, 0.6, 0], 'y', 2.0, R, 12, {}, R * 1.08);
  sink.cylinder('straw', [0, 2.55, 0], 'y', 2.2, R * 1.35, 12, {}, 0.12);
  return sink.finish();
};

/** A boat shed at the ghat: a sheet roof on bamboo posts, open sides. */
const ghatShed: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(4, Math.min(8, ctx.info.w - 0.6)), D = Math.max(6, Math.min(12, ctx.info.d - 0.6));
  const top = 2.8;
  for (const sx of [-1, 1]) for (let k = 0, n = Math.max(2, Math.round(D / 2.6) + 1); k < n; k++) {
    const x = sx * (W / 2 - 0.12), z = -D / 2 + 0.12 + (D - 0.24) * k / (n - 1);
    sink.span('structureWood', x - 0.08, -0.3, z - 0.08, x + 0.08, top, z + 0.08, { colour: BAMBOO_MAT });
  }
  const roof: RoofSpec = { kind: 'gable', pitchDeg: 20, eave: 0.5, verge: 0.3, thickness: 0.06, bucket: 'structureMetal', ridge: 'saddle' };
  emitRoof(sink, roofGeometry(W, D, top, roof), roof, sheetColour(rng));
  return sink.finish();
};

/** A storm-wrecked tin house: the plinth, a few posts, the sheets torn and down. */
const wrecked: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(4.8, ctx.info.w - 1.0), D = Math.max(6.4, ctx.info.d - 1.0);
  sink.span('plaster3', -W / 2 - 1, -0.4, -D / 2 - 1, W / 2 + 1, 0.8, D / 2 + 1);
  for (let k = 0; k < 6; k++) {
    const x = (rng() - 0.5) * W, z = (rng() - 0.5) * D;
    sink.member('structureWood', [x, 0.8, z], [x + (rng() - 0.5) * 0.6, 0.8 + 0.8 + rng() * 1.6, z + (rng() - 0.5) * 0.6], 0.12, 0.12, [1, 0, 0], { colour: pick(rng, WEATHERED_PLANK), exposed: true });
  }
  for (let k = 0; k < 6; k++) {
    const a = rng() * Math.PI, x = (rng() - 0.5) * W * 0.7, z = (rng() - 0.5) * D * 0.7;
    sink.member('structureMetal', [x - Math.cos(a), 0.85 + rng() * 0.3, z - Math.sin(a)], [x + Math.cos(a), 0.9 + rng() * 1.2, z + Math.sin(a)], 0.9, 0.04, [0, 1, 0], { colour: sheetColour(rng), decor: true, exposed: true });
  }
  return sink.finish();
};

/**
 * A bazaar stall (the base market plot): a raised earthen platform, bamboo posts carrying a tin roof that falls to the
 * lane, a tin back wall, a plank counter with sacks of rice and lentils and baskets of produce.
 */
const bazaarStall: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(4.5, Math.min(6.4, ctx.info.w - 0.4)), D = Math.max(3.6, Math.min(5.0, ctx.info.d - 0.4));
  const floor = 0.35, back = 2.95, front = 2.4;
  sink.span('plaster3', -W / 2 - 0.25, -0.3, -D / 2 - 0.25, W / 2 + 0.25, floor, D / 2 + 0.25);
  for (const [x, z, h] of [[-1, -1, back], [1, -1, back], [-1, 1, front], [1, 1, front]] as const) {
    sink.span('structureWood', x * (W / 2 - 0.15) - 0.07, floor, z * (D / 2 - 0.15) - 0.07, x * (W / 2 - 0.15) + 0.07, h, z * (D / 2 - 0.15) + 0.07, { colour: BAMBOO_MAT });
  }
  sink.span('structureMetal', -W / 2 + 0.08, floor, -D / 2 + 0.08, W / 2 - 0.08, back - 0.12, -D / 2 + 0.16, { colour: sheetColour(rng) });
  // the tin roof falls from the back wall to the lane: a shed laid along the stall's depth (local +x low = world +z)
  const roof: RoofSpec = { kind: 'shed', pitchDeg: Math.atan2(back - front, D) * 180 / Math.PI, eave: 0.35, verge: 0.3, thickness: 0.05, bucket: 'structureMetal', ridge: null };
  sink.placed(-Math.PI / 2, 0, 0, 0, () => emitRoof(sink, roofGeometry(D, W, front, roof), roof, sheetColour(rng)));
  sink.span('structureWood', -W / 2 + 0.35, floor, D / 2 - 1.0, W / 2 - 0.35, floor + 0.8, D / 2 - 0.45, { colour: pick(rng, WEATHERED_PLANK) });
  // the goods: jute sacks on the counter and the floor, flat baskets of produce
  const jute = rgb(0xa08a62), produce: readonly Rgb[] = [0x8a3a2a, 0xc0902a, 0x5a7a3a, 0xb8b0a0].map(rgb);
  for (let k = 0, n = 3 + Math.floor(rng() * 3); k < n; k++) {
    const x = -W / 2 + 0.7 + rng() * (W - 1.4), onCounter = rng() < 0.5;
    const y0 = onCounter ? floor + 0.8 : floor, z = onCounter ? D / 2 - 0.72 : -D / 2 + 0.7 + rng() * 0.8;
    sink.span('structureWood', x - 0.22, y0, z - 0.16, x + 0.22, y0 + 0.42 + rng() * 0.16, z + 0.16, { colour: jute, decor: true });
  }
  for (let k = 0; k < 3; k++) {
    const x = -W / 2 + 0.8 + k * (W - 1.6) / 2;
    sink.cylinder('structureWood', [x, floor + 0.8, D / 2 - 0.72], 'y', 0.12, 0.28, 8, { colour: pick(rng, produce), decor: true });
  }
  return sink.finish();
};

export const BENGAL_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  cottage: (ctx) => tinHouse(ctx),
  farmhouse: (ctx) => tinHouse(ctx, { big: true }),
  marketRow: bazaar,
  fishery: bazaar,
  // the base market plot: a tin bazaar stall (gauntlet wave 15: the delta's streets still showed the generic stall)
  market: bazaarStall,
  cornershop: brickShop,
  depot: brickShop,
  chapel: mosque,
  granary: gola,
  boatshed: ghatShed,
  woodshed: ghatShed,
  ruin: wrecked,
});

export const BENGAL_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'bengal',
  region: 'Jamuna chars (Sirajganj, Bogura): homesteads of corrugated iron on earthen plinths, a tin bazaar, a village mosque',
  surfaces: {
    roof: { kind: 'sheet', tint: [0.60, 0.62, 0.63] },
    stone: { kind: 'brick', tint: [0.62, 0.32, 0.24] },
    sourced: { plaster: false, wood: true },
    tones: {
      plaster: (_h, s, l) => [0.12, Math.min(1, s * 0.25), Math.min(1, l * 1.25 + 0.1)],
      plaster2: (_h, s, l) => [0.1, Math.min(1, s * 0.4 + 0.08), Math.min(1, l * 1.1 + 0.05)],
      plaster3: (_h, s, l) => [0.075, Math.min(1, s * 0.6 + 0.18), Math.min(1, l * 0.78)],
      straw: (h, s, l) => [h - 0.015, Math.min(1, s * 0.55), Math.min(1, l * 0.82)],
    },
  },
  builders: BENGAL_BUILDERS,
});

export type { RegionalParts };
