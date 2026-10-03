// src/world/maps/regional/mekong.ts — the Mekong kit (Mangrove Reach: the Cà Mau shrimp-farm coast). Stilt houses
// (nhà sàn) of weathered planks or woven palm on posts above the creek banks, under nipa-palm thatch or corrugated
// iron, with a front veranda, a rail and a ladder; ground houses of rendered brick painted pale blue, green or yellow
// under sheet roofs with a columned porch; open boat shelters and shrimp-pond guard huts on stilts; tin-roofed market
// halls; a collapsed stilt house where the shelling found it.
import { PartSink, faceBox, pick, rgb, shade, type Face, type RegionalBucket, type RegionalParts, type Rgb } from './geometry.ts';
import { buildHouse, emitRoof, roofGeometry, windowRhythm, type HouseDialect, type Opening, type RoofSpec } from './house.ts';
import { doorUnit, windowUnit, type WindowStyle } from './openings.ts';
import { BAMBOO_MAT, RUSTED, WEATHERED_PLANK, boardWall, ladder, stilts, veranda } from './vernacular.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';

const SHUTTER: readonly Rgb[] = [0x4f7a9a, 0x5a8a62, 0x8a5a3e, 0x6a8a9a].map(rgb);

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

const nipa = (pitch: number): RoofSpec => ({ kind: 'gable', pitchDeg: pitch, eave: 0.6, verge: 0.4, thickness: 0.26, bucket: 'straw', ridge: 'round' });
const tole = (pitch: number, kind: RoofSpec['kind'] = 'gable'): RoofSpec => ({ kind, pitchDeg: pitch, eave: 0.5, verge: 0.35, thickness: 0.06, bucket: 'roof', ridge: 'saddle' });

/** Board-shuttered window openings (no glass in the stilt houses): a dark opening, a frame, a propped shutter. */
function shutterWindow(sink: PartSink, face: Face, u: number, y: number, w: number, h: number, colour: Rgb): void {
  faceBox(sink, 'dark', face, u, y + h / 2, 0.005, w, h, 0.02, { decor: true });
  faceBox(sink, 'structureWood', face, u, y + h + 0.05, 0.04, w + 0.16, 0.1, 0.06, { colour: shade(colour, 0.8), decor: true });
  faceBox(sink, 'structureWood', face, u, y - 0.05, 0.04, w + 0.16, 0.1, 0.06, { colour: shade(colour, 0.8), decor: true });
  // the top-hung shutter propped open on a stick
  const leaf = { colour, decor: true };
  sink.member('structureWood', [face.origin[0] + face.u[0] * (u - w / 2), y + h + 0.02, face.origin[2] + face.u[2] * (u - w / 2)],
    [face.origin[0] + face.u[0] * (u + w / 2), y + h + 0.02, face.origin[2] + face.u[2] * (u + w / 2)], 0.05, 0.04, face.out, { ...leaf, exposed: true });
  faceBox(sink, 'structureWood', face, u, y + h - 0.1, 0.38, w, 0.035, 0.62, leaf);
}

/** The stilt house: plank or mat walls on a deck over posts, nipa or sheet roof, veranda, ladder. */
function stiltHouse(ctx: RegionalBuildContext, opts: { lift?: number } = {}): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(4.6, Math.min(6.4, ctx.info.w - 0.8)), D = Math.max(6.0, Math.min(9.0, ctx.info.d - 1.8));
  const lift = opts.lift ?? 1.3 + rng() * 0.5;
  const post = pick(rng, WEATHERED_PLANK);
  const mat = rng() < 0.35;
  const wallColour = mat ? BAMBOO_MAT : pick(rng, WEATHERED_PLANK);
  const thatched = rng() < 0.6;
  stilts(sink, W, D, lift, shade(post, 0.85));
  // the back half of the under-floor boarded in for nets, tools and the boat engine (it also keeps the cover the
  // base house gave: an open stilt house is a window under its floor)
  sink.span('structureWood', -W / 2 + 0.12, -0.25, -D / 2 + 0.12, W / 2 - 0.12, lift + 0.06, -D * 0.04, { colour: shade(wallColour, 0.72) });
  const wallH = 2.5, top = lift + 0.16 + wallH;
  sink.placed(0, 0, lift + 0.16, 0, () => {
    // the house body: a structural wall box behind board dressing
    sink.span('structureWood', -W / 2, 0, -D / 2, W / 2, wallH, D / 2, { colour: shade(wallColour, 0.9) });
    const faces: Face[] = [
      { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W }, { origin: [W / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D },
      { origin: [0, 0, -D / 2], u: [-1, 0, 0], out: [0, 0, -1], width: W }, { origin: [-W / 2, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: D },
    ];
    if (ctx.tier !== 'mobile') for (const f of faces) boardWall(sink, f, -f.width / 2 + 0.05, f.width / 2 - 0.05, 0.05, wallH - 0.05, wallColour);
    // the door on the veranda front, shuttered openings on the sides
    doorUnit(sink, faces[0], W * 0.18, 0, 0.85, 1.9, { leaf: shade(wallColour, 0.8), frame: { bucket: 'structureWood', width: 0.08, out: 0.06, colour: shade(post, 0.8) }, steps: null, leafKind: 'plank' }, 0);
    const shutter = pick(rng, SHUTTER);
    shutterWindow(sink, faces[0], -W * 0.22, 0.9, 0.8, 0.7, shutter);
    for (const f of [faces[1], faces[3]]) for (const u of [-D * 0.22, D * 0.22]) if (rng() < 0.8) shutterWindow(sink, f, u, 0.9, 0.75, 0.65, shutter);
  });
  const roof = thatched ? nipa(30 + rng() * 6) : tole(20 + rng() * 6);
  emitRoof(sink, roofGeometry(W, D, top, roof), roof);
  const front: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
  veranda(sink, front, lift, top - 0.05, W, 1.3, post, { bucket: thatched ? 'straw' : 'roof' });
  ladder(sink, { ...front, origin: [0, 0, D / 2 + 1.3] }, W * 0.3, 0, lift + 0.16, shade(post, 0.9));
  return sink.finish();
}

/** The ground house: rendered brick painted pale, a sheet roof, a columned porch, shutters. */
function groundHouse(ctx: RegionalBuildContext): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(5.6, Math.min(8, ctx.info.w - 0.4)), D = Math.max(7.2, Math.min(11, ctx.info.d - 0.4));
  const wall: RegionalBucket = ctx.wallBucket === 'stone' ? 'plaster2' : ctx.wallBucket as RegionalBucket;
  const shutter = pick(rng, SHUTTER);
  const style: WindowStyle = {
    frame: shade(shutter, 1.05), frameWidth: 0.07, frameOut: 0.05, bars: 'none',
    surround: { bucket: 'plaster', width: 0.12, out: 0.04 }, sill: { bucket: 'plaster', out: 0.08 },
    shutters: { colour: shutter, kind: 'louvred', closed: 0.5 },
  };
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.6, y0: 0, h: 2.3 }];
  for (const face of ['front', 'left', 'right'] as const) {
    const width = face === 'front' ? W : D;
    for (const o of windowRhythm(face, 0, width, { w: 0.9, h: 1.2, sill: 0.9, spacing: 2.2, margin: 0.9, avoid: face === 'front' ? [[-1.0, 1.0]] : [] })) openings.push(o);
  }
  const dialect: HouseDialect = {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, style, rng, 0.5),
    door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: shutter, frame: { bucket: 'plaster', width: 0.14, out: 0.05 }, steps: { bucket: 'stone' }, leafKind: 'panel' }, y0 + o.y0),
  };
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.55, out: 0.08, bucket: 'stone' }, storeys: [{ h: 3.0, wall }],
    roof: tole(22 + rng() * 6, rng() < 0.4 ? 'hip' : 'gable'), gableBucket: wall, openings, chimneys: [], gutters: null, verge: null,
  }, dialect);
  const post = rgb(0xd6d0c2);
  veranda(sink, frame.faces.front, 0.55, frame.eaveY - 0.1, W, 2.0, post, { bucket: 'roof' }, false);
  return sink.finish();
}

/** An open shelter on stilts: posts, a deck and a roof (boat sheds, pond guard huts). */
function shelter(ctx: RegionalBuildContext, opts: { deck?: boolean; walls?: 0 | 1 | 2 } = {}): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(3.6, Math.min(7, ctx.info.w - 0.8)), D = Math.max(5, Math.min(11, ctx.info.d - 0.8));
  const post = pick(rng, WEATHERED_PLANK);
  const lift = opts.deck ? 0.9 : 0;
  if (opts.deck) stilts(sink, W, D, lift, shade(post, 0.85), { brace: false });
  const top = lift + 2.6;
  for (const sx of [-1, 1]) for (let k = 0, n = Math.max(2, Math.round(D / 2.6) + 1); k < n; k++) {
    const x = sx * (W / 2 - 0.12), z = -D / 2 + 0.12 + (D - 0.24) * k / (n - 1);
    sink.span('structureWood', x - 0.08, lift, z - 0.08, x + 0.08, top, z + 0.08, { colour: post });
  }
  const thatched = rng() < 0.5;
  const roof = thatched ? nipa(28) : tole(18);
  emitRoof(sink, roofGeometry(W, D, top, roof), roof);
  // plank or woven-mat walls: the back (1), the back and both sides (2); the front stays open to the creek or yard
  if (opts.walls) {
    const sheet = rng() < 0.5 ? BAMBOO_MAT : shade(post, 0.9);
    sink.span('structureWood', -W / 2 + 0.1, lift, -D / 2 + 0.06, W / 2 - 0.1, top - 0.12, -D / 2 + 0.14, { colour: sheet });
    if (opts.walls > 1) {
      for (const sx of [-1, 1]) sink.span('structureWood', sx * (W / 2 - 0.14) - 0.04, lift, -D / 2 + 0.14, sx * (W / 2 - 0.14) + 0.04, top - 0.12, D / 2 - 0.3, { colour: sheet });
    }
  }
  return sink.finish();
}

/** A tin-roofed market hall: open sides, concrete posts, a long sheet roof, stall counters. */
const marketHall: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(6, Math.min(10, ctx.info.w - 0.6)), D = Math.max(10, Math.min(20, ctx.info.d - 0.6));
  sink.span('stone', -W / 2, -0.3, -D / 2, W / 2, 0.25, D / 2);
  const top = 3.4;
  for (const sx of [-1, 0, 1]) for (let k = 0, n = Math.max(2, Math.round(D / 3.5) + 1); k < n; k++) {
    const x = sx * (W / 2 - 0.2), z = -D / 2 + 0.2 + (D - 0.4) * k / (n - 1);
    sink.span('plaster', x - 0.14, 0.25, z - 0.14, x + 0.14, top + (sx === 0 ? 1.4 : 0), z + 0.14);
  }
  const roof = tole(16);
  emitRoof(sink, roofGeometry(W, D, top, roof), roof, rng() < 0.5 ? pick(rng, RUSTED) : undefined);
  // the stall platforms: fixed counters of plank on block (they stand as the base hall's walls stood: cover)
  for (const side of [-1, 1]) for (let z = -D / 2 + 1.2; z < D / 2 - 1; z += 2.4) {
    sink.span('structureWood', side * (W / 2 - 1.3) - 0.5, 0.25, z - 1.0, side * (W / 2 - 1.3) + 0.5, 1.15, z + 1.0, { colour: pick(rng, WEATHERED_PLANK) });
  }
  return sink.finish();
};

/** A collapsed stilt house: posts leaning, the deck broken, the roof sheets down. */
const collapsed: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(4.6, ctx.info.w - 1.0), D = Math.max(6, ctx.info.d - 2.0);
  const post = shade(pick(rng, WEATHERED_PLANK), 0.75);
  for (let k = 0; k < 7; k++) {
    const x = (rng() - 0.5) * W, z = (rng() - 0.5) * D, h = 0.6 + rng() * 1.8;
    sink.member('structureWood', [x, -0.3, z], [x + (rng() - 0.5) * 0.8, h, z + (rng() - 0.5) * 0.8], 0.16, 0.16, [1, 0, 0], { colour: post, exposed: true });
  }
  for (let k = 0; k < 4; k++) {
    const a = rng() * Math.PI, x = (rng() - 0.5) * W * 0.6, z = (rng() - 0.5) * D * 0.6;
    sink.member('roof', [x - Math.cos(a) * 1.6, 0.2 + rng() * 0.5, z - Math.sin(a) * 1.6], [x + Math.cos(a) * 1.6, 0.3 + rng() * 0.9, z + Math.sin(a) * 1.6], 1.6, 0.05, [0, 1, 0], { decor: true, exposed: true });
  }
  sink.span('straw', -W * 0.3, -0.1, -D * 0.25, W * 0.3, 0.45, D * 0.25, { decor: true });
  return sink.finish();
};

export const MEKONG_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  cottage: (ctx) => stiltHouse(ctx),
  farmhouse: (ctx) => groundHouse(ctx),
  // boat shelters walled at the back, stores and rice houses walled on three sides (they keep the cover of the base
  // sheds), the depot a rendered shophouse
  boatshed: (ctx) => shelter(ctx, { walls: 1 }),
  granary: (ctx) => shelter(ctx, { deck: true, walls: 2 }),
  woodshed: (ctx) => shelter(ctx, { walls: 2 }),
  marketRow: marketHall,
  depot: (ctx) => groundHouse(ctx),
  ruin: collapsed,
});

export const MEKONG_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'mekong',
  region: 'Cà Mau peninsula (Mekong delta coast): stilt houses of plank and palm under nipa thatch and corrugated iron',
  surfaces: {
    roof: { kind: 'sheet', tint: [0.62, 0.64, 0.65] },
    stone: { kind: 'block', tint: [0.62, 0.61, 0.58] },
    sourced: { plaster: false, wood: true },
    tones: {
      plaster: (_h, s, l) => [0.12, Math.min(1, s * 0.3 + 0.05), Math.min(1, l * 1.18 + 0.08)],
      plaster2: (_h, s, l) => [0.53, Math.min(1, s * 0.4 + 0.12), Math.min(1, l * 1.15 + 0.1)],
      plaster3: (_h, s, l) => [0.3, Math.min(1, s * 0.4 + 0.1), Math.min(1, l * 1.12 + 0.08)],
      straw: (h, s, l) => [h - 0.025, Math.min(1, s * 0.45), Math.min(1, l * 0.78)],
    },
  },
  builders: MEKONG_BUILDERS,
});
