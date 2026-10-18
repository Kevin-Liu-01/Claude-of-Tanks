// src/world/maps/regional/marketKits.ts — the market plots of the monsoon-belt kits, member-built (props census #23, the
// looks lane 2026-10-15): the Kohima bazaar's stall and its row of booths, the Cà Mau chợ stall and market hall, the
// Jamuna char bazaar. Each dresses the stall kit (marketStalls.ts) the region's way; each kit file keeps one
// re-pointing line (or a one-line body) for its plot kind.
import { PartSink, alongPlot, pick, plotAxes, rgb, shade, type RegionalParts, type Rgb } from './geometry.ts';
import { BAMBOO_MAT, RUSTED, WEATHERED_PLANK } from './vernacular.ts';
import { boothRow, marketShed, openStall, type StallDress } from './marketStalls.ts';
import type { RegionalBuildContext } from './types.ts';

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const uvOffset = (ctx: RegionalBuildContext): [number, number] => [ctx.rng() * 7.31, ctx.rng() * 5.17];
const TIN: readonly Rgb[] = [0x8a3a2e, 0x7a3428, 0x4f6a4a, 0x5a7a52].map(rgb);
const PLASTIC: readonly Rgb[] = [0xc0392b, 0x2e6fb8, 0x3a9a5a, 0xd8a028].map(rgb);
const WILLOW: readonly Rgb[] = [0x8a7550, 0x9a8460, 0x7a6644].map(rgb);

/**
 * The Kohima bazaar's stall (kit:kohima/market; the judges: "a flat board slab wall under a mono-pitch board roof on four
 * posts"): sawn posts on a raised plank floor on its stilts, plates, a sheet roof falling to the street with its laps,
 * the boarded back, a counter on legs with the hill's produce and Naga cone baskets, a beam scale, the plank shutter
 * propped up over the front as the awning.
 */
export function kohimaStall(ctx: RegionalBuildContext): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const W = clamp(ctx.info.w - 0.6, 4.2, 6.2), D = clamp(ctx.info.d - 0.6, 3.4, 4.8);
  const plank = pick(rng, WEATHERED_PLANK);
  const d: StallDress = {
    post: 'timber', timber: shade(plank, 0.85), cover: 'sheet', coverColour: pick(rng, TIN), back: 'boards', backColour: plank, floor: 'deck',
    counter: 'plank', shutter: shade(plank, 1.05), mobile: ctx.tier === 'mobile', look, eased: true,
    goods: { produce: [0x6a8a3a, 0xb0802a, 0x8a3a2a, 0x9a8a5a, 0xc8b04a].map(rgb), baskets: WILLOW, sacks: rgb(0xa8946a), cones: true, scale: true },
  };
  openStall(sink, d, W, D, { shedRoof: true });
  return sink.finish();
}

/**
 * The Kohima bazaar row (kit:kohima/marketRow; the judges: "plank boxes with a painted-on dark opening"): two or three
 * open booths under one sheet roof along the plot, each framed in sawn posts on a plank floor on stilts, boarded at the
 * back and between, its counter of goods across the front, its shelves on the back, its shutter propped up as the
 * awning, its signboard; a fascia and a gutter along the front. (The looks lane, 227; the r2 sweep: 94 % plain boxes)
 * Kohima's stalls in the eased dress: the sawn boards and timbers with their arrises eased, the deck's planks in a run
 * with their joints sunk.
 */
export function kohimaBazaarRow(ctx: RegionalBuildContext): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const L = clamp(ctx.info.w - 0.6, 6, 14), D = clamp(ctx.info.d - 1.0, 3.4, 5.4), n = Math.max(2, Math.min(4, Math.floor(L / 3.2)));
  const plank = pick(rng, WEATHERED_PLANK);
  const d: StallDress = {
    post: 'timber', timber: shade(plank, 0.85), cover: 'sheet', coverColour: pick(rng, TIN), back: 'boards', backColour: plank, floor: 'deck',
    counter: 'plank', shutter: shade(plank, 1.05), mobile: ctx.tier === 'mobile', look, eased: true,
    goods: { produce: [0x6a8a3a, 0xb0802a, 0x8a3a2a, 0xd8d0b0].map(rgb), baskets: WILLOW, sacks: rgb(0xa8946a), cones: false, scale: true },
  };
  boothRow(sink, d, L, D, n, [0x2e4a3a, 0x6a2a24, 0x2a3a5a, 0x5a4a2a].map(rgb));
  return sink.finish();
}

/**
 * The Cà Mau market stall (kit:mekong/market; the judges: "a plank platform that is one dark slab, four bamboo post
 * boxes, a nipa slab"): a plank deck on bearers and stilts over the mud with its step, bamboo posts lashed at their
 * joints under a nipa thatch on its rafters, a woven back, a bamboo machan counter of fish baskets and fruit, the leaf
 * hats hung on the posts, the bananas hung from the plate.
 */
export function mekongChoStall(ctx: RegionalBuildContext): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant;
  const W = clamp(ctx.info.w - 0.6, 4.2, 6.2), D = clamp(ctx.info.d - 0.6, 3.4, 4.8);
  const d: StallDress = {
    post: 'bamboo', timber: shade(BAMBOO_MAT, 0.9), cover: 'nipa', back: 'woven', backColour: BAMBOO_MAT, floor: 'deck', floorColour: shade(pick(look, WEATHERED_PLANK), 1.05),
    counter: 'machan', shutter: null, mobile: ctx.tier === 'mobile', look,
    goods: { produce: [0x5a7a3a, 0xc0902a, 0x8a3a2a, 0xd8a028, 0xb84a2a].map(rgb), baskets: [...WILLOW, ...PLASTIC], hats: true, bananas: true, scale: false },
  };
  openStall(sink, d, W, D);
  return sink.finish();
}

/**
 * The Cà Mau market hall (kit:mekong/marketRow; the judges: "post boxes meeting the sheet, plank counter boxes as walls,
 * no beams, trusses or purlins"): a concrete floor with its kerb and drain, chamfered concrete posts on their footings,
 * the tie beams, king posts, struts and purlins under the corrugated gable with its ridge cap and laps, gutters and
 * downpipes, bulbs on their flexes; the tiled stall counters down both sides with fish, fruit and baskets.
 */
export function mekongMarketHall(ctx: RegionalBuildContext, rusted: readonly Rgb[] = RUSTED): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const plot = plotAxes(ctx.info);
  const W = clamp(plot.w - 0.6, plot.turned ? 4.4 : 6, 10), L = clamp(plot.d - 0.6, plot.turned ? 6 : 10, 20);
  const d: StallDress = {
    post: 'concrete', timber: rgb(0x6a5a48), cover: 'sheet', coverColour: rng() < 0.5 ? pick(rng, rusted) : rgb(0x9aa0a2), back: null, backColour: rgb(0x8a8a86),
    floor: 'concrete', counter: 'tiled', shutter: null, mobile: ctx.tier === 'mobile', look,
    goods: { produce: [0x9aa6b0, 0xc0902a, 0x8a3a2a, 0x5a7a3a, 0xb8c0c4].map(rgb), baskets: PLASTIC, scale: true },
  };
  alongPlot(sink, plot.turned, () => marketShed(sink, d, W, L));
  return sink.finish();
}

/**
 * The Jamuna char bazaar (kit:bengal/marketRow; the judges: "solid sheet boxes with a painted dark faceBox for the shop
 * opening"): an earthen plinth with its worn lip and steps, bamboo posts lashed to the plates, knee-braced, the tie
 * beams, king posts and purlins under a tin gable with its ridge cap and laps; the booths down both sides, each a machan
 * counter of rice sacks, lentils, spices and baskets with a beam scale.
 */
export function bengalBazaar(ctx: RegionalBuildContext): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const plot = plotAxes(ctx.info);
  const W = clamp(plot.w - 0.6, plot.turned ? 4.4 : 6, 10), L = clamp(plot.d - 0.6, plot.turned ? 6 : 9, 20);
  const d: StallDress = {
    post: 'bamboo', timber: shade(BAMBOO_MAT, 0.88), cover: 'sheet', coverColour: pick(rng, RUSTED), back: null, backColour: BAMBOO_MAT, floor: 'earth',
    floorColour: [0.62, 0.52, 0.4], counter: 'machan', shutter: null, mobile: ctx.tier === 'mobile', look,
    goods: { produce: [0xc8a23a, 0xb8452e, 0x8a5a2a, 0xd8d0b0, 0x6a7a3a].map(rgb), baskets: WILLOW, sacks: rgb(0xb8a074), scale: true },
  };
  alongPlot(sink, plot.turned, () => marketShed(sink, d, W, L));
  return sink.finish();
}
