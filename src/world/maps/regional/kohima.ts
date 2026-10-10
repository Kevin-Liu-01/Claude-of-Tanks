// src/world/maps/regional/kohima.ts — the Naga Hills kit (Monsoon Ridge: Kohima, April–June 1944). The hill station's
// colonial bungalows of whitewashed timber and plaster on stone plinths under corrugated iron painted red or green, with
// deep verandas; the bazaar's timber shops under sheet roofs; the mission church of rough stone under a red tin roof;
// Angami Naga houses with low plank walls and great thatched roofs that sweep near the ground, crossed gable horns over
// the front; bamboo granaries on posts; and the battle's shells — bungalows broken to their plinths and chimneys.
import { PartSink, alongPlot, faceBox, pick, plotAxes, rgb, shade, type Face, type RegionalParts, type Rgb } from './geometry.ts';
import { buildHouse, emitRoof, roofGeometry, wallPolygon, windowRhythm, type HouseDialect, type Opening, type RoofSpec } from './house.ts';
import { doorUnit, windowUnit, type WindowStyle } from './openings.ts';
import { BAMBOO_MAT, WEATHERED_PLANK, boardWall, stilts, veranda } from './vernacular.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';

const TIN: readonly Rgb[] = [0x8a3a2e, 0x7a3428, 0x4f6a4a, 0x5a7a52].map(rgb);
const WHITE = rgb(0xd4cfc2), GREEN_TRIM = rgb(0x3f5f46);

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

const tin = (pitch: number, kind: RoofSpec['kind'] = 'gable'): RoofSpec => ({ kind, pitchDeg: pitch, eave: 0.6, verge: 0.6, thickness: 0.06, bucket: 'structureMetal', ridge: 'saddle' });

/** The bungalow: whitewash on a stone plinth, a hipped tin roof, a veranda on two sides, a stack. */
const bungalow: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  // the body set back from the plot's +z and -x sides by its two verandas' depth, so the verandas stay inside the plot
  const V = 2.2, W = Math.max(6, Math.min(11, ctx.info.w - 0.6 - V)), D = Math.max(7, Math.min(13, ctx.info.d - 0.6 - V));
  const roofColour = pick(rng, TIN);
  const style: WindowStyle = { frame: GREEN_TRIM, frameWidth: 0.07, frameOut: 0.05, bars: 'six', surround: null, sill: { bucket: 'plaster', out: 0.06 }, shutters: { colour: GREEN_TRIM, kind: 'louvred', closed: 0.2 } };
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.3, y0: 0, h: 2.4 }];
  for (const face of ['front', 'left', 'right', 'back'] as const) {
    for (const o of windowRhythm(face, 0, face === 'front' || face === 'back' ? W : D, { w: 1.0, h: 1.5, sill: 0.8, spacing: 2.4, margin: 1.0, avoid: face === 'front' ? [[-1.0, 1.0]] : [] })) openings.push(o);
  }
  const dialect: HouseDialect = {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, style, rng, 0.45),
    door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: GREEN_TRIM, frame: { bucket: 'structureWood', width: 0.1, out: 0.05, colour: WHITE }, transom: true, steps: { bucket: 'stone' }, leafKind: 'glazed' }, y0 + o.y0),
  };
  sink.placed(0, V / 2, 0, -V / 2, () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.75, out: 0.1, bucket: 'stone' }, storeys: [{ h: 3.3, wall: 'plaster' }],
      roof: tin(28, 'hip'), roofColour, gableBucket: 'plaster', openings,
      chimneys: [{ x: -W * 0.25, z: -D * 0.2, sx: 0.65, sz: 0.65, above: 0.9, bucket: 'stone', cap: 'slab' }], gutters: null, verge: null,
      // Assam-type walls: lime plaster on split-bamboo ekra between timber posts, no masonry under it to show
      spall: null,
    }, dialect);
    veranda(sink, frame.faces.front, 0.75, frame.eaveY - 0.2, W, V, WHITE, { bucket: 'structureMetal', colour: roofColour });
    veranda(sink, frame.faces.left, 0.75, frame.eaveY - 0.2, D, V, WHITE, { bucket: 'structureMetal', colour: roofColour });
  });
  return sink.finish();
};

/** One shop: plank walls on a low plinth, shutters across the shop front, a tin roof and its awning (`awning` deep). */
function shop(sink: PartSink, ctx: RegionalBuildContext, x: number, W: number, D: number, awning: number): void {
  const rng = ctx.rng;
  const plank = pick(rng, WEATHERED_PLANK), roofColour = pick(rng, TIN);
  sink.span('stone', x - W / 2 - 0.1, -0.3, -D / 2 - 0.1, x + W / 2 + 0.1, 0.45, D / 2 + 0.1);
  sink.span('structureWood', x - W / 2, 0.45, -D / 2, x + W / 2, 3.2, D / 2, { colour: shade(plank, 0.9) });
  const faces: Face[] = [{ origin: [x, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W }, { origin: [x + W / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D },
    { origin: [x, 0, -D / 2], u: [-1, 0, 0], out: [0, 0, -1], width: W }, { origin: [x - W / 2, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: D }];
  if (ctx.tier !== 'mobile') for (const f of faces) boardWall(sink, f, -f.width / 2 + 0.05, f.width / 2 - 0.05, 0.5, 3.15, plank);
  // the shop front: a wide dark opening, plank shutters hinged up as an awning
  faceBox(sink, 'dark', faces[0], 0, 1.65, 0.04, W - 1.2, 2.2, 0.02, { decor: true });
  faceBox(sink, 'structureWood', faces[0], 0, 2.95, awning / 2 + 0.05, W - 1.0, 0.06, awning, { colour: shade(plank, 1.1), decor: true });
  const roof = tin(26);
  sink.placed(0, x, 0, 0, () => emitRoof(sink, roofGeometry(W, D, 3.2, roof), roof, roofColour));
}

/** A bazaar shop: one shop on its plot. */
const bazaarShop: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const W = Math.max(5, Math.min(9, ctx.info.w - 0.6)), D = Math.max(6, Math.min(10, ctx.info.d - 0.6));
  shop(sink, ctx, 0, W, D, 1.3);
  return sink.finish();
};

/**
 * A bazaar row on the base market row's plot (12 x 5.2 m): two or three shops side by side along it under their own
 * tin gables, inside the plot (the single shop it replaces was 6 m deep on a 5.2 m plot).
 */
const bazaarRow: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const L = ctx.info.w - 0.6, D = Math.max(3.8, Math.min(10, ctx.info.d - 1.4));
  const n = Math.max(1, Math.min(3, Math.floor(L / 3.6)));
  const w = L / n - 0.25;
  for (let i = 0; i < n; i++) shop(sink, ctx, -L / 2 + (i + 0.5) * L / n, w, D, 0.9);
  return sink.finish();
};

/** The mission church: rough stone, a steep red tin roof, a timber porch and a small belfry over the gable. */
const church: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const W = Math.max(5.5, Math.min(8, ctx.info.w - 0.4)), D = Math.max(8, Math.min(12, ctx.info.d - 0.4));
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.4, y0: 0, h: 2.6 }];
  for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, 0, D, { w: 0.8, h: 1.9, sill: 1.2, spacing: 2.4, margin: 1.0 })) openings.push(o);
  const dialect: HouseDialect = {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { frame: WHITE, frameWidth: 0.06, frameOut: 0.05, bars: 'six', surround: { bucket: 'stone', width: 0.18, out: 0.06, lintel: 0.26 }, sill: { bucket: 'stone', out: 0.1 }, shutters: null }, ctx.rng, 0.3),
    door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: rgb(0x6a4b33), frame: { bucket: 'stone', width: 0.22, out: 0.07, arch: true }, steps: { bucket: 'stone' }, leafKind: 'plank' }, y0 + o.y0),
  };
  const roof = { ...tin(48), eave: 0.4, verge: 0.3 };
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.45, out: 0.08, bucket: 'stone' }, storeys: [{ h: 3.8, wall: 'stone' }], roof, roofColour: TIN[0], gableBucket: 'stone',
    openings, chimneys: [], gutters: null, verge: null,
  }, dialect);
  // the belfry: a timber box on the front gable with a pyramid cap and a cross
  const z = D / 2 - 0.6, top = frame.roof.ridgeTopY;
  sink.span('structureWood', -0.6, top - 0.8, z - 0.6, 0.6, top + 1.3, z + 0.6, { colour: WHITE });
  faceBox(sink, 'dark', { origin: [0, 0, z + 0.6], u: [1, 0, 0], out: [0, 0, 1], width: 1.2 }, 0, top + 0.6, 0.005, 0.6, 0.8, 0.02, { decor: true });
  sink.cylinder('structureMetal', [0, top + 1.3, z], 'y', 1.3, 1.0, 4, { colour: TIN[0] }, 0.04, true, Math.PI / 4);
  sink.span('structureWood', -0.04, top + 2.5, z - 0.04, 0.04, top + 3.3, z + 0.04, { colour: WHITE, decor: true });
  sink.span('structureWood', -0.25, top + 3.0, z - 0.04, 0.25, top + 3.08, z + 0.04, { colour: WHITE, decor: true });
  return sink.finish();
};

/** The Angami house: low plank walls on a stone terrace, a great thatch sweeping low, crossed horns on the front gable. */
const nagaHouse: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  // the Angami house is long and narrow: on a farmhouse plot (wider than deep) it lies along the plot (plotAxes), its
  // stone platform and the thatch inside it; across the plot (9 m deep) it reached 0.9 m past its +z side
  const plot = plotAxes(ctx.info);
  const W = Math.max(5.6, Math.min(8, plot.w - (plot.turned ? 2.0 : 1.6))), D = Math.max(7, Math.min(14, plot.d - (plot.turned ? 2.2 : 0.4)));
  const plank = pick(rng, WEATHERED_PLANK);
  alongPlot(sink, plot.turned, () => {
    sink.span('stone', -W / 2 - 0.8, -0.4, -D / 2 - 0.8, W / 2 + 0.8, 0.5, D / 2 + 0.8);
    sink.span('structureWood', -W / 2, 0.5, -D / 2, W / 2, 2.2, D / 2, { colour: shade(plank, 0.9) });
    const front: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
    if (ctx.tier !== 'mobile') boardWall(sink, front, -W / 2 + 0.05, W / 2 - 0.05, 0.55, 2.15, plank);
    doorUnit(sink, front, -W * 0.15, 0.5, 0.8, 1.6, { leaf: shade(plank, 0.75), frame: { bucket: 'structureWood', width: 0.12, out: 0.06, colour: shade(plank, 0.7) }, steps: null, leafKind: 'plank' });
    // the thatch: steep, deep eaves sweeping down to near a metre off the ground
    const roof: RoofSpec = { kind: 'gable', pitchDeg: 52, eave: plot.turned ? 0.9 : 1.3, verge: plot.turned ? 0.7 : 0.9, thickness: 0.4, bucket: 'straw', ridge: 'round', thatch: 'rows' };
    const rg = roofGeometry(W, D, 2.2, roof);
    emitRoof(sink, rg, roof);
    // the front gable boarded up under the thatch
    if (rg.gable) wallPolygon(sink, 'structureWood', front, rg.gable.map(([u, y]): [number, number] => [u * 0.98, y - 0.04]), 0.06, { colour: shade(plank, 0.82) });
    // the crossed horns (kika) over the front gable
    const z = D / 2 + roof.verge - 0.1, apex = rg.ridgeTopY;
    for (const side of [-1, 1]) {
      sink.member('structureWood', [side * 0.9, apex - 1.0, z], [-side * 0.55, apex + 1.4, z], 0.22, 0.12, [0, 0, 1], { colour: rgb(0x5a4636), decor: true, exposed: true });
    }
  });
  return sink.finish();
};

/** A bamboo granary on posts under a small thatch. */
const granary: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const W = Math.max(2.8, Math.min(4, ctx.info.w - 1)), D = Math.max(3.2, Math.min(5, ctx.info.d - 1.5));
  stilts(sink, W, D, 1.0, rgb(0x6a5a46), { brace: false });
  sink.span('structureWood', -W / 2 + 0.05, 1.16, -D / 2 + 0.05, W / 2 - 0.05, 2.9, D / 2 - 0.05, { colour: BAMBOO_MAT });
  const roof: RoofSpec = { kind: 'gable', pitchDeg: 48, eave: 0.5, verge: 0.4, thickness: 0.3, bucket: 'straw', ridge: 'round', thatch: 'rows' };
  emitRoof(sink, roofGeometry(W, D, 2.9, roof), roof);
  return sink.finish();
};

/** A shelled bungalow: the plinth, a standing chimney stack, wall stubs, the tin roof down in sheets. */
const shelled: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(6, ctx.info.w - 0.6), D = Math.max(7, ctx.info.d - 0.6);
  sink.span('stone', -W / 2, -0.4, -D / 2, W / 2, 0.75, D / 2);
  sink.span('stone', -W * 0.25 - 0.35, 0.75, -D * 0.2 - 0.35, -W * 0.25 + 0.35, 4.6 + rng(), -D * 0.2 + 0.35);
  for (let k = 0; k < 7; k++) {
    const side = k % 4, t = rng(), h = 0.4 + rng() * 2.0;
    const x = side < 2 ? (side === 0 ? -1 : 1) * (W / 2 - 0.15) : (t - 0.5) * W * 0.8;
    const z = side < 2 ? (t - 0.5) * D * 0.8 : (side === 2 ? -1 : 1) * (D / 2 - 0.15);
    sink.span('plaster', x - 0.18, 0.75, z - 0.18, x + 0.18, 0.75 + h, z + 0.18);
  }
  for (let k = 0; k < 5; k++) {
    const a = rng() * Math.PI, x = (rng() - 0.5) * W * 0.6, z = (rng() - 0.5) * D * 0.6;
    sink.member('structureMetal', [x - Math.cos(a) * 1.4, 0.8 + rng() * 0.3, z - Math.sin(a) * 1.4], [x + Math.cos(a) * 1.4, 1.0 + rng() * 1.4, z + Math.sin(a) * 1.4], 1.1, 0.04, [0, 1, 0], { colour: pick(rng, TIN), decor: true, exposed: true });
  }
  return sink.finish();
};

/**
 * The mission bell tower (the base tower plot; gauntlet wave 15 still saw a tiled European steeple there): a rough
 * stone base, a whitewashed timber belfry with louvred openings, a pyramid of painted tin and a cross.
 */
const bellTower: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const S = Math.max(2.8, Math.min(3.6, Math.min(ctx.info.w, ctx.info.d) - 0.3)), H = Math.max(7.5, Math.min(9.4, ctx.info.h));
  const base = H * 0.5, bel = H * 0.82;
  sink.span('stone', -S / 2, -0.4, -S / 2, S / 2, base, S / 2);
  sink.span('stone', -S / 2 - 0.12, base - 0.05, -S / 2 - 0.12, S / 2 + 0.12, base + 0.2, S / 2 + 0.12, { decor: true });
  const T = S - 0.5;
  sink.span('structureWood', -T / 2, base + 0.2, -T / 2, T / 2, bel, T / 2, { colour: WHITE });
  for (const f of [{ origin: [0, 0, T / 2], u: [1, 0, 0], out: [0, 0, 1], width: T }, { origin: [T / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: T },
    { origin: [0, 0, -T / 2], u: [-1, 0, 0], out: [0, 0, -1], width: T }, { origin: [-T / 2, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: T }] as Face[]) {
    faceBox(sink, 'dark', f, 0, bel - 0.85, 0.005, T * 0.5, 1.1, 0.02, { decor: true });
    for (let k = 0; k < 4; k++) faceBox(sink, 'structureWood', f, 0, bel - 1.3 + k * 0.28, 0.04, T * 0.52, 0.05, 0.06, { colour: GREEN_TRIM, decor: true });
  }
  const door: Face = { origin: [0, 0, S / 2], u: [1, 0, 0], out: [0, 0, 1], width: S };
  doorUnit(sink, door, 0, 0, 1.0, 2.1, { leaf: rgb(0x6a4b33), frame: { bucket: 'stone', width: 0.2, out: 0.06, arch: true }, steps: { bucket: 'stone' }, leafKind: 'plank' });
  sink.cylinder('structureMetal', [0, bel, 0], 'y', H - bel, T * 0.78, 4, { colour: TIN[0] }, 0.04, true, Math.PI / 4);
  sink.span('structureWood', -0.04, H - 0.05, -0.04, 0.04, H + 0.75, 0.04, { colour: WHITE, decor: true });
  sink.span('structureWood', -0.24, H + 0.45, -0.04, 0.24, H + 0.53, 0.04, { colour: WHITE, decor: true });
  return sink.finish();
};

/** A bazaar stall (the base market plot): timber posts under a painted tin roof, a plank counter of baskets. */
const bazaarStall: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(4.5, Math.min(6.4, ctx.info.w - 0.4)), D = Math.max(3.6, Math.min(5.0, ctx.info.d - 0.4));
  const floor = 0.3, back = 2.9, front = 2.35, post = pick(rng, WEATHERED_PLANK);
  sink.span('stone', -W / 2 - 0.2, -0.3, -D / 2 - 0.2, W / 2 + 0.2, floor, D / 2 + 0.2);
  for (const [x, z, h] of [[-1, -1, back], [1, -1, back], [-1, 1, front], [1, 1, front]] as const) {
    sink.span('structureWood', x * (W / 2 - 0.15) - 0.08, floor, z * (D / 2 - 0.15) - 0.08, x * (W / 2 - 0.15) + 0.08, h, z * (D / 2 - 0.15) + 0.08, { colour: post });
  }
  sink.span('structureWood', -W / 2 + 0.1, floor, -D / 2 + 0.08, W / 2 - 0.1, back - 0.12, -D / 2 + 0.18, { colour: shade(post, 0.85) });
  const roof: RoofSpec = { kind: 'shed', pitchDeg: Math.atan2(back - front, D) * 180 / Math.PI, eave: 0.35, verge: 0.3, thickness: 0.05, bucket: 'structureMetal', ridge: null };
  sink.placed(-Math.PI / 2, 0, 0, 0, () => emitRoof(sink, roofGeometry(D, W, front, roof), roof, pick(rng, TIN)));
  sink.span('structureWood', -W / 2 + 0.35, floor, D / 2 - 1.0, W / 2 - 0.35, floor + 0.85, D / 2 - 0.45, { colour: shade(post, 1.1) });
  const produce: readonly Rgb[] = [0x6a8a3a, 0xb0802a, 0x8a3a2a, 0x9a8a5a].map(rgb);
  for (let k = 0; k < 4; k++) {
    const x = -W / 2 + 0.75 + k * (W - 1.5) / 3;
    sink.cylinder('structureWood', [x, floor + 0.85, D / 2 - 0.72], 'y', 0.16, 0.26, 8, { colour: pick(rng, produce), decor: true }, 0.2);
  }
  return sink.finish();
};

export const KOHIMA_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  bathhouse: bungalow,
  farmhouse: nagaHouse,
  cornershop: bazaarShop,
  marketRow: bazaarRow,
  depot: bazaarShop,
  chapel: church,
  granary,
  woodshed: granary,
  ruin: shelled,
  // the base plots the first kit left: the steeple and the market stalls (gauntlet wave 15)
  tower: bellTower,
  market: bazaarStall,
});

export const KOHIMA_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'kohima',
  region: 'Kohima, Naga Hills (1944): colonial bungalows under painted tin, a bazaar, a mission church, Angami thatched houses',
  surfaces: {
    roof: { kind: 'sheet', tint: [0.56, 0.30, 0.24] },
    stone: { kind: 'rubble', tint: [0.55, 0.52, 0.47] },
    sourced: { plaster: false, wood: true },
    // (the facades lane, round 11; waves 319/320: the walls' procedural canvas read as "speckle", "sponge", "cork",
    // "camouflage noise": its 6 cm bumps shade as dots from the street, as Steinburg's did before round 8) the walls
    // painted as the region renders them (regionalSurfaces.ts paintLimewash), every family under the kit's and the map's
    // tones; the plaster photo set is off (its 2.4 m tile repeats a lichen motif down every wall)
    render: { kind: 'limewash', seed: 0x6b0a },
    tones: { straw: (h, s, l) => [h - 0.02, Math.min(1, s * 0.5), Math.min(1, l * 0.8)] },
  },
  builders: KOHIMA_BUILDERS,
  // the Angami yards: a bamboo fence round the vegetable terrace and the granary on posts, an open gap (yards.ts)
  yard: { kinds: ['farmhouse'], fence: 'fencewattle', gate: null, shed: 'granary', shedSize: [4.3, 4.1], garden: true },
});

export type { RegionalParts };
