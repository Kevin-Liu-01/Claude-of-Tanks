// src/world/maps/saarWorks.ts — Ironworks' blast-furnace line (the map-revival lane, 2026-10-06; the map's
// `props.extraKits: ['saar']`, dressed from maps/mapKits.ts dressMapExtras).
//
// Völklingen's furnaces stand in one row: the ore and coke bunkers along the row's front, fed from the high-line (the
// Hochbahn) that runs over them, each furnace's skip rising from its bunkers to the throat. Ironworks' recorded works
// (TOWN_PLANS.foundry) had one casting house, the blast furnace block at (-74, -29); the line puts two more furnaces
// beside it, the three side by side along the block's own width, so the bunkers line up into one front:
//   - foundry.ts adds the two (props.townPlanAdditions, FURNACE_LINE_ADDITIONS below): each replayed like the recorded
//     block, from the block's own stream at its pose, so its base, its footprint and its saar-kit build are the block's
//     kind and no recorded building moves;
//   - this kit lays the high-line over the bunkers, level along the whole front and out past both ends on steel
//     trestles, and the receiving yard's ore and coke heaps beyond its western end.
// The trestle bents outside the furnaces' plots ('trestle') and the heaps ('ore-heap') block like any solid (each a
// convex footprint in both collision sinks); the deck, girders, rails and the bents' bracing are dressing. Everything draws from streams of its
// own (never the props placement stream) and stands only where it clears the records placed before it.
import * as THREE from 'three';
import { PartSink, hashSeed, rgb, shade, streamFrom, type Rgb, type Vec3 } from './regional/geometry.ts';
import { getDeviceTier } from '../../engine/quality.ts';
import { sampleObbGround } from '../propPlacement.ts';
import { cloneCollisionRecord, collisionFootprintContainsPoint, convexHull2, setConvexShape, type CollisionRecord } from '../collision.ts';

interface WorksContext {
  L: { roads?: ReadonlyArray<ReadonlyArray<readonly [number, number]>> };
  heightField: Parameters<typeof sampleObbGround>[0] & { getHeightAt(x: number, z: number): number; _roadDist(x: number, z: number): number };
  buckets: Record<string, THREE.BufferGeometry[] | undefined>;
  obstacles?: CollisionRecord[];
  colliders?: CollisionRecord[];
}

/** The recorded blast furnace block (TOWN_PLANS.foundry: factory, plan index 0): its centre, yaw and base stream. */
const BLOCK = { x: -74, z: -29, rot: 0.436332313, rng: 1831567815 } as const;
/** The furnaces' spacing along the block's width (its base is 11.9 m wide: 3.1 m between the plots). */
const SPACING = 15;
/** The block's local axes in the world: across the plot (its width, the line) and along it (the bunkers at +z). */
const UX: readonly [number, number] = [Math.cos(BLOCK.rot), -Math.sin(BLOCK.rot)];
const UZ: readonly [number, number] = [Math.sin(BLOCK.rot), Math.cos(BLOCK.rot)];
const at = (u: number, v: number): [number, number] => [BLOCK.x + UX[0] * u + UZ[0] * v, BLOCK.z + UX[1] * u + UZ[1] * v];

/** The two furnaces the line adds, one each side of the block (props.townPlanAdditions). */
export const FURNACE_LINE_ADDITIONS = Object.freeze([-1, 1].map((side) => {
  const [x, z] = at(side * SPACING, 0);
  return Object.freeze({ structure: 'factory', planIndex: 0, wall: 'stone', rng: BLOCK.rng, x: +x.toFixed(4), z: +z.toFixed(4), rot: BLOCK.rot });
}));

/**
 * The saar kit's furnace unit on the block's base (maps/regional/saar.ts blastFurnace on an 11.9 x 19.4 m plot, filled
 * 0.1 m in): the bunkers' centre line across the plot and the bins' top over the plot's base, and the plot's half width.
 */
const BUNKER_V = 8.07, BIN_TOP = 7.0, PLOT_HALF = 5.95;
/** The high-line: its deck over the bins (clear of each skip's foot), its reach past the line's ends. */
const DECK_Y = 9.2, DECK_HALF = 1.9, WEST_U = -30, EAST_U = 24, BENT_STEP = 6;
const STEEL = rgb(0x3a3532), OXIDE = rgb(0x6a3f2e), RAIL = rgb(0x5c544c);
/** The receiving yard's heaps beyond the high-line's western end: ore red-brown, coke near black. */
const ORE = rgb(0x6b3a26), COKE = rgb(0x1f1d1c), SLAG = rgb(0x2b2825);
const HEAPS: ReadonlyArray<{ x: number; z: number; r: number; l: number; colour: Rgb }> = [
  // (round 4, wave 223: long windrows side by side under the line's end, not cones)
  { x: -121, z: -24, r: 3.6, l: 8.5, colour: ORE }, { x: -130, z: -26, r: 3.4, l: 8.0, colour: COKE },
  { x: -139, z: -22, r: 3.2, l: 7.5, colour: ORE },
];

/** The slag tipped beyond the line's eastern end: on the ore berm's nose and its southern flank, clear of the casting
 * yard's objective ground. */
const SLAG_HEAPS: ReadonlyArray<{ x: number; z: number; r: number; l: number }> = [
  // (round 4, wave 223: "real slag tips are long flat-topped banks with tipping lines, not cones")
  // (each seated where its whole length keeps 5 m off the roads and the aprons: one over the berm's nose, one on the
  // berm's south-western flank)
  { x: -32, z: -41, r: 3.4, l: 8.0 }, { x: -77, z: -65, r: 3.8, l: 9.5 },
];
/**
 * The saar kit's furnace unit (maps/regional/saar.ts blastFurnace on the block's base): the dust catcher's centre beside
 * the casting house (across, along the plot) and its top over the plot's base; the gas main's line and height.
 */
const CATCHER_U = -4.25, CATCHER_V = -2.94, CATCHER_TOP = 12.3;
/** The main behind the stoves (their back at -9.6 across the plot), its branches past the left stove's flank. */
const MAIN_V = -10.7, MAIN_Y = 14.6, MAIN_R = 0.75, BRANCH_U = -5.7, BRANCH_R = 0.4;
const MAIN_WEST = -26, MAIN_EAST = 24, TRESTLE_STEP = 7.5, WASHER_R = 1.9, WASHER_H = 11;
const GAS = rgb(0x4a4440);

function push(ctx: WorksContext, sink: PartSink): void {
  const parts = sink.finish();
  for (const [bucket, list] of Object.entries(parts)) for (const g of list) (ctx.buckets[bucket] ??= []).push(g);
}

/** Does every footprint placed so far keep `pad` metres off each of these world points (records' own shapes)? */
function pointsClear(records: readonly CollisionRecord[], points: ReadonlyArray<readonly [number, number]>, pad: number): boolean {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of points) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  return !records.some((r) => !r.dead && r.max[0] > x0 - pad && r.min[0] < x1 + pad && r.max[2] > z0 - pad && r.min[2] < z1 + pad
    && points.some(([x, z]) => collisionFootprintContainsPoint(r, x, z, pad)));
}

/** A solid convex footprint (world xz points) between two heights, in both collision sinks. */
function solid(ctx: WorksContext, points: ReadonlyArray<readonly [number, number]>, y0: number, y1: number, kind: string): void {
  const record = setConvexShape({ min: [0, y0, 0], max: [0, y1, 0], kind } as CollisionRecord, convexHull2(points.map(([x, z]) => [x, z])));
  ctx.obstacles?.push(record);
  ctx.colliders?.push(cloneCollisionRecord(record));
}

/** The furnace plot (its line position: -SPACING, 0 or SPACING) under the deck at `u`, or null between the plots. */
const plotAt = (u: number): number | null => [-SPACING, 0, SPACING].find((c) => Math.abs(u - c) <= PLOT_HALF - 0.3) ?? null;
/** A furnace's base as props.ts seats it (the lowest support under its 11.9 x 19.4 m footprint, + 0.05). */
const PLOT_HALF_D = 9.7;
function plotBase(hf: WorksContext['heightField'], c: number): number {
  const [x, z] = at(c, 0);
  return sampleObbGround(hf, x, z, PLOT_HALF, PLOT_HALF_D, BLOCK.rot).y + 0.05;
}

/**
 * The high-line over the bunker front: two plate girders under the deck, the cross ties and the two rails on it, level
 * the whole length DECK_Y over the highest furnace base. Over a furnace's plot it stands on that furnace's bins (posts,
 * dressing); between the plots and past the ends, on steel trestle bents to the ground, each bent a solid.
 */
function dressHighLine(ctx: WorksContext, sink: PartSink, mobile: boolean): void {
  const hf = ctx.heightField;
  // the deck level over the highest of the three bunker fronts (each furnace seats on its own ground)
  const bases = new Map([-SPACING, 0, SPACING].map((c) => [c, plotBase(hf, c)] as const));
  const deck = Math.max(...bases.values()) + DECK_Y;
  // the line frame: u along the line, v across it, y up (the sink places u, v in the world through the block's axes)
  sink.placed(BLOCK.rot, BLOCK.x, 0, BLOCK.z, () => {
    // (the sink's placement rotates its local x and z the way three's rotateY does: the block's own frame)
    for (const s of [-1, 1]) {
      sink.span('structureMetal', WEST_U, deck - 1.1, BUNKER_V + s * DECK_HALF - 0.15, EAST_U, deck - 0.05, BUNKER_V + s * DECK_HALF + 0.15, { colour: OXIDE });
      // the girders' bottom flanges
      sink.span('structureMetal', WEST_U, deck - 1.18, BUNKER_V + s * DECK_HALF - 0.32, EAST_U, deck - 1.1, BUNKER_V + s * DECK_HALF + 0.32, { colour: shade(OXIDE, 0.8), decor: true });
    }
    // the deck's ties and the rails
    for (let u = WEST_U + 0.3; u < EAST_U; u += mobile ? 1.6 : 0.8) {
      sink.span('structureWood', u - 0.12, deck - 0.05, BUNKER_V - DECK_HALF - 0.3, u + 0.12, deck + 0.1, BUNKER_V + DECK_HALF + 0.3, { colour: shade(rgb(0x4a3a2c), 0.8), decor: true });
    }
    for (const r of [-0.7175, 0.7175]) {
      sink.span('structureMetal', WEST_U, deck + 0.1, BUNKER_V + r - 0.04, EAST_U, deck + 0.24, BUNKER_V + r + 0.04, { colour: RAIL, decor: true });
    }
    // the handrail along the outer edge (the bunker side is open to the chutes)
    if (!mobile) {
      for (let u = WEST_U; u <= EAST_U; u += 2) sink.member('structureMetal', [u, deck + 0.1, BUNKER_V + DECK_HALF + 0.25], [u, deck + 1.1, BUNKER_V + DECK_HALF + 0.25], 0.05, 0.05, [0, 0, 1], { colour: STEEL, decor: true, exposed: true }, 0);
      sink.member('structureMetal', [WEST_U, deck + 1.1, BUNKER_V + DECK_HALF + 0.25], [EAST_U, deck + 1.1, BUNKER_V + DECK_HALF + 0.25], 0.06, 0.06, [0, 1, 0], { colour: STEEL, decor: true, exposed: true }, 0);
    }
  });
  // the bents: every BENT_STEP metres along the line, each pair of legs under the girders
  for (let u = WEST_U + 1; u <= EAST_U - 1; u += BENT_STEP) {
    const plotC = plotAt(u), plot = plotC !== null;
    const [cx, cz] = at(u, BUNKER_V);
    const ground = Math.min(...[-1, 1].map((s) => hf.getHeightAt(...at(u, BUNKER_V + s * DECK_HALF))));
    const foot = plot ? bases.get(plotC)! + BIN_TOP : ground - 0.3;
    // a bent between the plots or past the ends keeps clear of every footprint placed before it (the furnaces' own)
    const legs = [-1, 1].flatMap((s) => [[-0.25, s * DECK_HALF - 0.25], [0.25, s * DECK_HALF + 0.25], [0, s * DECK_HALF]] as const)
      .map(([du, dv]) => at(u + du, BUNKER_V + dv));
    if (!plot && !pointsClear(ctx.obstacles ?? [], [...legs, [cx, cz]], 0.2)) continue;
    sink.placed(BLOCK.rot, BLOCK.x, 0, BLOCK.z, () => {
      for (const s of [-1, 1]) {
        sink.span('structureMetal', u - 0.22, foot, BUNKER_V + s * DECK_HALF - 0.22, u + 0.22, deck - 1.1, BUNKER_V + s * DECK_HALF + 0.22, { colour: STEEL, decor: plot });
      }
      if (!plot) {
        // the bent's cross bracing: a strut under the girders and an X between the legs
        sink.span('structureMetal', u - 0.12, deck - 1.6, BUNKER_V - DECK_HALF, u + 0.12, deck - 1.25, BUNKER_V + DECK_HALF, { colour: STEEL, decor: true });
        const h = deck - 1.6 - foot;
        if (h > 2.5) {
          for (const s of [-1, 1]) {
            sink.member('structureMetal', [u, foot + 0.6, BUNKER_V - s * DECK_HALF], [u, foot + h * 0.92, BUNKER_V + s * DECK_HALF], 0.12, 0.12, [1, 0, 0], { colour: STEEL, decor: true, exposed: true }, 0);
          }
        }
      }
    });
    if (!plot) {
      const corners = [[-0.25, -DECK_HALF - 0.25], [0.25, -DECK_HALF - 0.25], [0.25, DECK_HALF + 0.25], [-0.25, DECK_HALF + 0.25]]
        .map(([du, dv]) => at(u + du, BUNKER_V + dv));
      solid(ctx, corners, foot, deck, 'trestle');
    }
  }
}

/**
 * The gas main along the line behind its row of stoves: one pipe the whole length on steel trestles, a branch from it to
 * each furnace's dust catcher past the stoves' outer flank, an expansion loop over each gap between the furnaces; at the
 * east end it turns down into the gas washer (a riveted steel tower), at the west end down to the floor's corner.
 * The trestles and the washer are solids (each a convex footprint in both sinks), the pipes dressing.
 */
function dressGasMain(ctx: WorksContext, sink: PartSink, mobile: boolean): void {
  const hf = ctx.heightField;
  const base = Math.max(...[-SPACING, 0, SPACING].map((c) => plotBase(hf, c)));
  const y = base + MAIN_Y;
  const [wx, wz] = at(MAIN_EAST, MAIN_V);
  const ring8 = (cx: number, cz: number, r: number) => [0, 1, 2, 3, 4, 5, 6, 7].map((k) => { const a = k / 8 * Math.PI * 2; return [cx + Math.cos(a) * r, cz + Math.sin(a) * r] as const; });
  const washerOk = pointsClear(ctx.obstacles ?? [], [[wx, wz], ...ring8(wx, wz, WASHER_R)], 0.3);
  const washerBase = Math.min(...ring8(wx, wz, WASHER_R).map(([x, z]) => hf.getHeightAt(x, z))) - 0.3;
  const east = washerOk ? MAIN_EAST : SPACING + PLOT_HALF + 3;
  sink.placed(BLOCK.rot, BLOCK.x, 0, BLOCK.z, () => {
    sink.cylinder('structureMetal', [MAIN_WEST, y, MAIN_V], 'x', east - MAIN_WEST, MAIN_R, 10, { colour: GAS, decor: true, uvAxial: true }, MAIN_R, true);
    // the flanges' bands along it
    if (!mobile) for (let u = MAIN_WEST + 2; u < east - 1; u += 4) sink.cylinder('structureMetal', [u, y, MAIN_V], 'x', 0.18, MAIN_R + 0.08, 10, { colour: shade(GAS, 0.8), decor: true }, MAIN_R + 0.08, false);
    for (const c of [-SPACING, 0, SPACING]) {
      // the branch: forward past the left stove's flank, down beside it, across into the dust catcher
      const ub = c + BRANCH_U;
      sink.member('structureMetal', [ub, y, MAIN_V], [ub, y, CATCHER_V], BRANCH_R * 2, BRANCH_R * 2, [1, 0, 0], { colour: GAS, decor: true, exposed: true }, 0);
      sink.member('structureMetal', [ub, y, CATCHER_V], [ub, base + CATCHER_TOP, CATCHER_V], BRANCH_R * 2, BRANCH_R * 2, [1, 0, 0], { colour: GAS, decor: true, exposed: true }, 0);
      sink.member('structureMetal', [ub, base + CATCHER_TOP, CATCHER_V], [c + CATCHER_U, base + CATCHER_TOP, CATCHER_V], BRANCH_R * 2, BRANCH_R * 2, [0, 1, 0], { colour: GAS, decor: true, exposed: true }, 0);
    }
    for (const g of [-SPACING / 2, SPACING / 2]) {
      // the expansion loop over the gap
      for (const s of [-1, 1]) sink.member('structureMetal', [g + s * 1.3, y, MAIN_V], [g + s * 1.3, y + 2.6, MAIN_V], MAIN_R * 1.6, MAIN_R * 1.6, [0, 0, 1], { colour: GAS, decor: true, exposed: true }, 0);
      sink.cylinder('structureMetal', [g - 1.3 - MAIN_R * 0.8, y + 2.6, MAIN_V], 'x', 2.6 + MAIN_R * 1.6, MAIN_R, 10, { colour: GAS, decor: true, uvAxial: true }, MAIN_R, true);
    }
    // the west end: down to the floor's corner
    sink.member('structureMetal', [MAIN_WEST, y, MAIN_V], [MAIN_WEST, hf.getHeightAt(...at(MAIN_WEST, MAIN_V)) + 0.4, MAIN_V], MAIN_R * 1.6, MAIN_R * 1.6, [0, 0, 1], { colour: GAS, decor: true, exposed: true }, 0);
    if (washerOk) {
      // the east end: down into the washer's top, a riveted steel tower with its cone and its hood
      sink.member('structureMetal', [MAIN_EAST, y, MAIN_V], [MAIN_EAST, washerBase + WASHER_H + 1.4, MAIN_V], MAIN_R * 1.6, MAIN_R * 1.6, [0, 0, 1], { colour: GAS, decor: true, exposed: true }, 0);
    }
  });
  // the trestles under the main: every TRESTLE_STEP metres where they clear the records, each a solid
  for (let u = MAIN_WEST + 3; u < east - 1; u += TRESTLE_STEP) {
    const [cx, cz] = at(u, MAIN_V);
    const foot = Math.min(...[-1, 1].map((s) => hf.getHeightAt(...at(u, MAIN_V + s * 1.0)))) - 0.3;
    const legs = [-1, 1].flatMap((s) => [[-0.3, s * 1.0 - 0.3], [0.3, s * 1.0 + 0.3]] as const).map(([du, dv]) => at(u + du, MAIN_V + dv));
    if (!pointsClear(ctx.obstacles ?? [], [...legs, [cx, cz]], 0.2)) continue;
    sink.placed(BLOCK.rot, BLOCK.x, 0, BLOCK.z, () => {
      for (const s of [-1, 1]) sink.span('structureMetal', u - 0.22, foot, MAIN_V + s * 1.0 - 0.22, u + 0.22, y - MAIN_R, MAIN_V + s * 1.0 + 0.22, { colour: STEEL });
      sink.span('structureMetal', u - 0.12, y - MAIN_R - 0.4, MAIN_V - 1.0, u + 0.12, y - MAIN_R, MAIN_V + 1.0, { colour: STEEL, decor: true });
      if (!mobile) for (const s of [-1, 1]) sink.member('structureMetal', [u, foot + 0.6, MAIN_V - s * 1.0], [u, y - MAIN_R - 0.5, MAIN_V + s * 1.0], 0.1, 0.1, [1, 0, 0], { colour: STEEL, decor: true, exposed: true }, 0);
    });
    solid(ctx, [[-0.3, -1.3], [0.3, -1.3], [0.3, 1.3], [-0.3, 1.3]].map(([du, dv]) => at(u + du, MAIN_V + dv)), foot, y, 'trestle');
  }
  if (washerOk) {
    sink.placed(BLOCK.rot, BLOCK.x, 0, BLOCK.z, () => {
      sink.cylinder('structureMetal', [MAIN_EAST, washerBase, MAIN_V], 'y', WASHER_H, WASHER_R, 12, { colour: GAS, uvAxial: true });
      sink.cylinder('structureMetal', [MAIN_EAST, washerBase + WASHER_H, MAIN_V], 'y', 1.4, WASHER_R, 12, { colour: shade(GAS, 0.9), decor: true }, 0.6, true);
      if (!mobile) for (let yy = washerBase + 1.2; yy < washerBase + WASHER_H; yy += 1.4) sink.cylinder('structureMetal', [MAIN_EAST, yy, MAIN_V], 'y', 0.14, WASHER_R + 0.06, 12, { colour: shade(GAS, 0.75), decor: true }, WASHER_R + 0.06, false);
    });
    solid(ctx, ring8(wx, wz, WASHER_R + 0.06), washerBase, washerBase + WASHER_H + 1.4, 'gas-washer');
  }
}

/**
 * A heap of ore or coke at a yard's scale, the rail yard's stockpile form (mapKits.ts makeCoalStockpile): a faceted
 * mound on the ground in the vertex-coloured baked bucket, each facet's corners counter-clockwise seen from outside.
 * Returns the mound's footprint (its rim, world xz).
 */
function heap(ctx: WorksContext, x: number, z: number, r: number, l: number, colour: Rgb, look: () => number): { hull: Array<[number, number]>; crest: [Vec3, Vec3] } {
  const hf = ctx.heightField, n = 10, height = r * 0.62;
  // the footprint the battle meets: the first draft's rim, from its own draws in their order (so the heap's solid and
  // every later draw of the works' look stream keep their seats)
  const hull: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = i * Math.PI * 2 / n, w = 0.9 + look() * 0.2;
    hull.push([x + Math.cos(a) * r * w, z + Math.sin(a) * l * w]);
    look();
  }
  look(); look();
  for (let i = 0; i < n; i++) look();
  // the tip as a long bank (round 4, gauntlet wave 223: "real slag tips are long flat-topped banks with tipping lines,
  // not cones", and round 3's pale skirt of fines ringed every heap in "chalk outlines"): a flat top along its length
  // where the tipping track runs, the flanks at the angle of repose in tipped lumps, the tipping face steep at one end,
  // the other end its ramp; its foot set into the ground, no skirt; from a stream of its own
  const v = streamFrom(hashSeed('saar-clinker', x, z));
  const along = l >= r, L = Math.max(r, l), B = Math.min(r, l);
  const ux = along ? 0 : 1, uz = along ? 1 : 0, wx = along ? 1 : 0, wz = along ? 0 : 1;
  const tip = v() < 0.5 ? 1 : -1, K = 10;
  const rows: Vec3[][] = [];
  for (let k = 0; k <= K; k++) {
    const t = -L + (2 * L * k) / K, e = Math.sqrt(Math.max(0, 1 - (t / L) ** 2));
    // (the tipping face's end stands steep: the outline squared off toward it)
    const ee = t * tip > 0 ? Math.pow(e, 0.55) : e;
    const half = B * ee * (0.9 + v() * 0.14), shoulder = half * (0.62 + v() * 0.08), topHalf = half * (0.3 + v() * 0.06);
    const cx = x + ux * t, cz = z + uz * t, hTop = height * Math.sqrt(ee) * (0.95 + v() * 0.08), crown = hf.getHeightAt(cx, cz) + hTop;
    const row: Vec3[] = [];
    for (const [o, part] of [[-half, 0], [-shoulder, 1], [-topHalf, 2], [topHalf, 2], [shoulder, 1], [half, 0]] as const) {
      const jx = part ? (v() - 0.5) * 0.35 : 0, px = cx + wx * o + ux * jx, pz = cz + wz * o + uz * jx;
      const ground = hf.getHeightAt(px, pz);
      row.push([px, part === 0 ? ground - 0.25 : part === 1 ? Math.max(ground + 0.2, crown - hTop * (0.38 + v() * 0.12)) : crown, pz]);
    }
    rows.push(row);
  }
  const A: Vec3 = rows[tip > 0 ? 2 : K - 2][2].map((c, i) => (c + rows[tip > 0 ? 2 : K - 2][3][i]) / 2) as unknown as Vec3;
  const B2: Vec3 = rows[tip > 0 ? K - 3 : 3][2].map((c, i) => (c + rows[tip > 0 ? K - 3 : 3][3][i]) / 2) as unknown as Vec3;
  const positions: number[] = [], colors: number[] = [], uvs: number[] = [];
  const tri = (a: Vec3, b: Vec3, c: Vec3, tone: Rgb): void => {
    for (const p of [a, b, c]) { positions.push(p[0], p[1], p[2]); colors.push(tone[0], tone[1], tone[2]); uvs.push(p[0] * 0.5, p[2] * 0.5); }
  };
  // (a strip's quad laid so its face looks up and out: the order flips when the bank runs along x)
  const quad = (p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, tone: Rgb): void => {
    if (along) { tri(p0, p1, p2, tone); tri(p0, p2, p3, tone); } else { tri(p0, p2, p1, tone); tri(p0, p3, p2, tone); }
  };
  for (let k = 0; k < K; k++) {
    for (let j = 0; j < 5; j++) {
      const k0 = 0.78 + v() * 0.26, tone = shade(colour, j === 2 ? k0 * 0.92 : k0);
      quad(rows[k][j], rows[k + 1][j], rows[k + 1][j + 1], rows[k][j + 1], tone);
    }
  }
  const crest: [Vec3, Vec3] = [A, B2];
  const geometry = new THREE.BufferGeometry();
  geometry.name = 'saar-yard-heap';
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  (ctx.buckets.baked ??= []).push(geometry);
  return { hull, crest };
}

/** The receiving yard's ore and coke heaps beyond the high-line's western end, and the slag by the line's casting side:
 * each a solid where it clears the records. */
function dressHeaps(ctx: WorksContext, look: () => number, sink?: PartSink): void {
  const hf = ctx.heightField;
  for (const h of [...HEAPS, ...SLAG_HEAPS.map((s) => ({ ...s, colour: SLAG }))]) {
    // (a heap keeps 5 m between its rim and the nearest road line or apron: the layout brief's 3.5 m core and a margin)
    if (hf._roadDist(h.x, h.z) < Math.max(h.r, h.l) + 5) continue;
    // (its rim's box, r along x and l along z as heap() lays it, half a metre off every record placed so far)
    const ex = h.r + 0.5, ez = h.l + 0.5;
    if ((ctx.obstacles ?? []).some((o) => !o.dead && o.max[0] > h.x - ex && o.min[0] < h.x + ex && o.max[2] > h.z - ez && o.min[2] < h.z + ez)) continue;
    const { hull, crest } = heap(ctx, h.x, h.z, h.r, h.l, h.colour, look);
    const low = Math.min(...hull.map(([x, z]) => hf.getHeightAt(x, z))) - 0.1;
    solid(ctx, hull, low, hf.getHeightAt(h.x, h.z) + h.r * 0.62, 'ore-heap');
    // the tipping track along a slag heap's crest: its two rails on their sleepers (dressing)
    if (h.colour === SLAG && sink) {
      const [a, b] = crest, dx = b[0] - a[0], dz = b[2] - a[2], len = Math.hypot(dx, dz) || 1, nx = -dz / len * 0.72, nz = dx / len * 0.72;
      for (const s of [-1, 1]) sink.member('structureMetal', [a[0] + nx * s, a[1] + 0.12, a[2] + nz * s], [b[0] + nx * s, b[1] + 0.12, b[2] + nz * s], 0.07, 0.12, [0, 1, 0], { colour: STEEL, decor: true, exposed: true }, 0);
      for (let t = 0.05; t < 1; t += 0.12) sink.member('structureWood', [a[0] + dx * t - nx * 1.4, a[1] + (b[1] - a[1]) * t + 0.04, a[2] + dz * t - nz * 1.4], [a[0] + dx * t + nx * 1.4, a[1] + (b[1] - a[1]) * t + 0.04, a[2] + dz * t + nz * 1.4], 0.22, 0.1, [0, 1, 0], { colour: [0.2, 0.16, 0.12], decor: true }, 0);
    }
  }
}

/**
 * The rail kit's two western yard lines (mapKits.ts RAIL_YARD_LINES at x -66 and -57) ran straight across the furnace
 * line's floor and its banks and through the casting houses (the recorded block's corner on PR #9's head too). Here they
 * stop at buffer stops either side of the works: at the ore berm's southern foot, and north of the works street, so
 * no track runs over the cut, the plots or the street. A yard span whose middle falls in a gap lays nothing; its seeded
 * draws still advance, so the rest of the yard's dressing keeps its seat (mapKits.ts layRailSpan).
 */
export const SAAR_YARD_GAPS: ReadonlyArray<{ x: number; z0: number; z1: number }> = [
  { x: -66, z0: -86, z1: 12 }, { x: -57, z0: -80, z1: 12 },
];

/** Ironworks' furnace line: the high-line over the bunker front, the gas main and its washer, the yards' heaps. */
export function dressSaarWorks(ctx: WorksContext): void {
  const mobile = getDeviceTier() === 'mobile';
  const look = streamFrom(hashSeed('saar-works', BLOCK.x, BLOCK.z));
  const sink = new PartSink([look() * 5, look() * 5]);
  dressHighLine(ctx, sink, mobile);
  dressGasMain(ctx, sink, mobile);
  dressHeaps(ctx, look, sink);
  push(ctx, sink);
}
