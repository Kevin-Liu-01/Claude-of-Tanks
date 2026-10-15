// src/world/maps/regional/yards.ts — the yards round a kit's houses (regional-buildings lane, 2026-10-03; the
// coordinator's village-density ruling: keep every house body as it is and place the yards, walls, gates, sheds and
// gardens in the free ground around it, clear of the roads, the other plots, the objective discs and the spawn pads,
// skipping an element where it does not fit).
//
// planYard reads the placed world and plans, for one house, a yard on its freest side: up to 8 m deep and as long as
// that side of the plot, its ground clear of the road frontage (ROAD_FRONTAGE_CLEARANCE from the carriageway's centre),
// every other plot, the hard solids and the larger destructibles already standing, the objective discs and the spawn
// pads, dry and level. The yard is enclosed on its three open sides by fence or wall modules with a gate in the outer
// run; an outbuilding stands in one far corner and the kitchen-garden beds in the other. Every module, the outbuilding
// and the beds are checked on their own and left out where they do not fit. The planner is pure (numbers in,
// placements out): props.ts places the modules as destructibles, builds the outbuilding with the kit and merges the
// beds as dressing.
import { PartSink, rgb, shade, type RegionalParts, type Rgb, type Vec3 } from './geometry.ts';
import { bloomDisc, mound, ridge } from './dressing.ts';
import { ROAD_FRONTAGE_CLEARANCE } from '../../roadBuildingFrontage.ts';
import { MATCH_OBJECTIVE_LAYOUTS } from '../../../sim/matchObjectiveLayouts.ts';
import { matchPlacementAnchors } from '../../../sim/matchPlacement.ts';
import { ASSAULT_TRENCH, planAssaultTrenchLines } from '../../../sim/assaultLines.ts';
import type { YardStyle } from './types.ts';

/** A placed plot (props buildingFeatures): centre, size along its local x and z, yaw. */
export interface YardPlot { x: number; z: number; w: number; d: number; rot: number; kind?: string }
/** A hard solid's world box (props obstacles). */
export interface YardSolid { min: ArrayLike<number>; max: ArrayLike<number> }
/** A destructible already standing (props records). */
export interface YardDestructible { x: number; z: number; r: number; kind: string }
/** The layout's footprints a yard keeps off: discs [x, z, r] and oriented rectangles. */
export interface YardKeepOut {
  discs: ReadonlyArray<readonly [number, number, number]>;
  rects: ReadonlyArray<{ x: number; z: number; ux: number; uz: number; halfAlong: number; halfAcross: number }>;
}
export interface YardGround {
  roadDist(x: number, z: number): number;
  water(x: number, z: number): number;
  normalY(x: number, z: number): number;
}
export interface YardWorld {
  ground: YardGround;
  plots: readonly YardPlot[];
  solids: readonly YardSolid[];
  destructibles: readonly YardDestructible[];
  keepOut: YardKeepOut;
}
export interface YardPlacement { x: number; z: number; yaw: number }
export interface YardPlan {
  side: '+x' | '-x' | '+z' | '-z';
  /** a side yard along the street (a flank of the plot), its gate onto the street; false: a back yard */
  street: boolean;
  depth: number;
  length: number;
  /** the enclosure's modules (the gate's gap left out) */
  modules: YardPlacement[];
  gate: YardPlacement | null;
  /** the outbuilding's centre, yaw (its door, local +z, faces into the yard) and footprint */
  shed: (YardPlacement & { w: number; d: number }) | null;
  /** the kitchen garden's centre, yaw (rows along its local x) and size */
  garden: (YardPlacement & { w: number; d: number }) | null;
}

/** The spawn pads' flat (terrain.ts levels a pad out to 22 m) and a berth. */
const SPAWN_CLEAR = 24;

/**
 * The layout footprints a yard keeps off (the maps lane's clearances, as the field works read them, without running
 * the match placement on the half-built world): the spawn pads, the authored objective targets (the zone-control
 * discs, the kickoff, the middle and the two bases, each with a 3 m margin), the Frontline Assault sectors and their
 * trench lines, the aprons and the bridge decks with their approaches.
 */
export function yardKeepOut(
  mapId: string,
  spawns: { player: { x: number; z: number; yaw?: number }; enemies: ReadonlyArray<{ x: number; z: number; yaw?: number }> },
  hardstands: ReadonlyArray<{ x: number; z: number; width: number; length: number; yawDeg?: number }>,
  bridgeDecks: ReadonlyArray<{ x: number; z: number; ux: number; uz: number; halfLength: number; halfWidth: number; approachM: number }>,
): YardKeepOut {
  const M = 3;
  const discs: Array<[number, number, number]> = [];
  const rects: Array<{ x: number; z: number; ux: number; uz: number; halfAlong: number; halfAcross: number }> = [];
  for (const p of [spawns.player, ...spawns.enemies]) discs.push([p.x, p.z, SPAWN_CLEAR]);
  const { alpha, bravo } = matchPlacementAnchors({ player: spawns.player, enemies: spawns.enemies });
  const mx = (alpha.x + bravo.x) * 0.5, mz = (alpha.z + bravo.z) * 0.5;
  const al = Math.hypot(bravo.x - alpha.x, bravo.z - alpha.z) || 1;
  const ux = (bravo.x - alpha.x) / al, uz = (bravo.z - alpha.z) / al;
  const layout = MATCH_OBJECTIVE_LAYOUTS[mapId];
  for (const zone of layout?.zones ?? [-105, 0, 105].map((o) => ({ x: mx + uz * o, z: mz - ux * o }))) discs.push([zone.x, zone.z, 30 + M]);
  const kickoff = layout?.kickoff ?? { x: mx, z: mz };
  discs.push([kickoff.x, kickoff.z, 12 + M], [mx, mz, 30 + M], [alpha.x, alpha.z, 18 + M], [bravo.x, bravo.z, 18 + M]);
  for (const line of planAssaultTrenchLines(alpha, bravo).lines) {
    discs.push([line.x, line.z, 30 + M]);
    rects.push({ x: line.x, z: line.z, ux: line.lx, uz: line.lz, halfAlong: line.halfLengthM + ASSAULT_TRENCH.endRampM + M,
      halfAcross: ASSAULT_TRENCH.floorHalfWidthM + ASSAULT_TRENCH.wallRunM + M });
  }
  for (const strip of hardstands) {
    const a = (strip.yawDeg ?? 0) * Math.PI / 180;
    rects.push({ x: strip.x, z: strip.z, ux: Math.sin(a), uz: Math.cos(a), halfAlong: strip.length * 0.5 + M, halfAcross: strip.width * 0.5 + M });
  }
  for (const deck of bridgeDecks) {
    rects.push({ x: deck.x, z: deck.z, ux: deck.ux, uz: deck.uz, halfAlong: deck.halfLength + deck.approachM + M, halfAcross: deck.halfWidth + M });
  }
  return { discs, rects };
}

/** How deep a yard may run (m), the fewest metres worth enclosing, and its gap off the house wall. */
const YARD_MAX = 8, YARD_MIN = 3, YARD_GAP = 0.3;
/** The map square a yard stays inside (terrain.ts plays 466 m; the border band beyond). */
const SQUARE = 460;
/** An outbuilding's footprint (the kit builds its shed at this plot). */
export const YARD_SHED = { w: 3.2, d: 2.6, h: 3.2 } as const;
/** A destructible this large blocks a yard's ground (smaller yard clutter may stand inside it). */
const BLOCKING_R = 1.1;

const SIDES = [
  { side: '+z', n: [0, 1], t: [1, 0], wide: true },
  { side: '-z', n: [0, -1], t: [-1, 0], wide: true },
  { side: '+x', n: [1, 0], t: [0, -1], wide: false },
  { side: '-x', n: [-1, 0], t: [0, 1], wide: false },
] as const;

/** Plot-local (lx, lz) to world: the building's frame turned by its yaw about Y. */
function toWorld(p: YardPlot, lx: number, lz: number): [number, number] {
  const c = Math.cos(p.rot), s = Math.sin(p.rot);
  return [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
}
/** World to plot-local. */
function toLocal(p: YardPlot, x: number, z: number): [number, number] {
  const c = Math.cos(p.rot), s = Math.sin(p.rot), dx = x - p.x, dz = z - p.z;
  return [dx * c - dz * s, dx * s + dz * c];
}
function insidePlot(p: YardPlot, x: number, z: number, margin: number): boolean {
  const [lx, lz] = toLocal(p, x, z);
  return Math.abs(lx) <= p.w / 2 + margin && Math.abs(lz) <= p.d / 2 + margin;
}

/** Whether a world point is free ground for a yard element (`roadClear`: its distance from a carriageway's centre). */
function pointClear(world: YardWorld, house: YardPlot, x: number, z: number, roadClear: number, solidMargin: number,
  destructibleR: number): boolean {
  if (Math.max(Math.abs(x), Math.abs(z)) > SQUARE) return false;
  const g = world.ground;
  if (g.roadDist(x, z) < roadClear) return false;
  if (g.water(x, z) > 0.05 || g.normalY(x, z) < 0.9) return false;
  for (const p of world.plots) if (p !== house && insidePlot(p, x, z, 0.8)) return false;
  for (const s of world.solids) {
    if (x < s.min[0] - solidMargin || x > s.max[0] + solidMargin || z < s.min[2] - solidMargin || z > s.max[2] + solidMargin) continue;
    // the house's own records (its contact box) stand round its plot
    if (insidePlot(house, (s.min[0] + s.max[0]) / 2, (s.min[2] + s.max[2]) / 2, 0.6)) continue;
    return false;
  }
  for (const d of world.destructibles) {
    if (d.r < destructibleR) continue;
    if (Math.hypot(x - d.x, z - d.z) < d.r + 0.3) return false;
  }
  for (const [cx, cz, r] of world.keepOut.discs) if (Math.hypot(x - cx, z - cz) < r) return false;
  for (const r of world.keepOut.rects) {
    const dx = x - r.x, dz = z - r.z;
    if (Math.abs(dx * r.ux + dz * r.uz) < r.halfAlong && Math.abs(-dx * r.uz + dz * r.ux) < r.halfAcross) return false;
  }
  return true;
}

/** Whether a rectangle (centre, axes, half sizes, world) is free ground, sampled at ~0.9 m and on its corners. */
function rectClear(world: YardWorld, house: YardPlot, cx: number, cz: number, ax: readonly [number, number],
  bx: readonly [number, number], ha: number, hb: number, roadClear: number, destructibleR: number): boolean {
  const na = Math.max(1, Math.ceil(ha * 2 / 0.9)), nb = Math.max(1, Math.ceil(hb * 2 / 0.9));
  for (let i = 0; i <= na; i++) for (let j = 0; j <= nb; j++) {
    const a = -ha + 2 * ha * i / na, b = -hb + 2 * hb * j / nb;
    if (!pointClear(world, house, cx + ax[0] * a + bx[0] * b, cz + ax[1] * a + bx[1] * b, roadClear, 0.3, destructibleR)) return false;
  }
  return true;
}

/**
 * Plan one house's yard (null when no side has the free ground for one). `rng` is the yards' own stream; `seg` is the
 * enclosure module's length (props: a wall's or a fence's).
 */
export function planYard(house: YardPlot, world: YardWorld, style: YardStyle, rng: () => number, seg: number,
  body?: { minX: number; maxX: number; minZ: number; maxZ: number }): YardPlan | null {
  const c = Math.cos(house.rot), s = Math.sin(house.rot);
  const dirW = (l: readonly [number, number]): [number, number] => [l[0] * c + l[1] * s, -l[0] * s + l[1] * c];
  // a side's run along the house: its length, its wall's distance from the plot centre and the shift of its middle
  // (the kit's solid body where the plot carries one, so the yard starts at the walls; the plot's edges otherwise)
  const b = body ?? { minX: -house.w / 2, maxX: house.w / 2, minZ: -house.d / 2, maxZ: house.d / 2 };
  const sideOf = (sd: typeof SIDES[number]) => ({
    length: sd.wide ? b.maxX - b.minX : b.maxZ - b.minZ,
    offset: (sd.wide ? (sd.n[1] > 0 ? b.maxZ : -b.minZ) : (sd.n[0] > 0 ? b.maxX : -b.minX)) + YARD_GAP,
    shift: sd.wide ? [(b.minX + b.maxX) / 2, 0] as const : [0, (b.minZ + b.maxZ) / 2] as const,
  });
  // each side's deepest clear yard
  const options: Array<{ k: number; depth: number }> = [];
  SIDES.forEach((sd, k) => {
    const { length, offset, shift } = sideOf(sd);
    const n = dirW(sd.n), t = dirW(sd.t);
    // a churchyard keeps off the church's front (+z, its door's side: the approach)
    if (style.keepFront && sd.side === '+z') return;
    for (let depth = YARD_MAX; depth >= YARD_MIN; depth -= 1) {
      const [ox, oz] = toWorld(house, shift[0] + sd.n[0] * (offset + depth / 2), shift[1] + sd.n[1] * (offset + depth / 2));
      if (!rectClear(world, house, ox, oz, t, n, length / 2, depth / 2, ROAD_FRONTAGE_CLEARANCE, BLOCKING_R)) continue;
      options.push({ k, depth });
      break;
    }
  });
  if (!options.length) return null;
  // the side that faces the road (its ground 2 m out comes nearest a carriageway), the back opposite it, and the two
  // flanks: a yard on a flank stands along the street between the house and its neighbour and shows from the road,
  // so it wins where it has room (4 m), then the back, then whatever side is clear
  const near = SIDES.map((sd) => {
    const { offset, shift } = sideOf(sd);
    const [x, z] = toWorld(house, shift[0] + sd.n[0] * (offset + 2), shift[1] + sd.n[1] * (offset + 2));
    return world.ground.roadDist(x, z);
  });
  const front = near.indexOf(Math.min(...near)), back = front ^ 1;
  const flank = (k: number) => k !== front && k !== back;
  const deepest = (list: typeof options) => list.reduce((a, b) => (b.depth > a.depth ? b : a));
  const flanks = options.filter((o) => flank(o.k) && o.depth >= 4);
  const backs = options.filter((o) => o.k === back);
  const { k, depth } = flanks.length ? deepest(flanks) : backs.length ? backs[0] : deepest(options);
  const onFlank = flank(k);
  const sd = SIDES[k];
  const { length, offset, shift } = sideOf(sd);
  const n = dirW(sd.n), t = dirW(sd.t);
  const at = (a: number, d: number): [number, number] => toWorld(house, shift[0] + sd.t[0] * a + sd.n[0] * (offset + d),
    shift[1] + sd.t[1] * a + sd.n[1] * (offset + d));
  const yawAlong = (d: readonly [number, number]) => Math.atan2(d[0], d[1]);
  const plan: YardPlan = { side: sd.side, street: onFlank, depth, length, modules: [], gate: null, shed: null, garden: null };
  // the enclosure: the outer run along the yard's far edge, the two end runs back to the house wall; the gate takes the
  // outer run's middle module (or the one beside it)
  const outerN = Math.max(1, Math.round(length / seg)), endN = Math.max(1, Math.round(depth / seg));
  // every yard has its way in: a flank yard's gate opens onto the street (the middle of the end run nearer the road);
  // a back yard's in its outer run's middle module, or on a short run one of its end modules
  const streetEnd = onFlank
    ? (world.ground.roadDist(...at(-length / 2, depth / 2)) < world.ground.roadDist(...at(length / 2, depth / 2)) ? -1 : 1) : 0;
  const gateAt = onFlank ? -1 : outerN >= 3 ? Math.floor(outerN / 2) + (rng() < 0.5 ? 0 : outerN % 2 === 0 ? -1 : 0) : rng() < 0.5 ? 0 : outerN - 1;
  const endGateAt = onFlank ? Math.floor(endN / 2) : -1;
  const free = (x: number, z: number) => pointClear(world, house, x, z, ROAD_FRONTAGE_CLEARANCE, 0.15, 0);
  for (let i = 0; i < outerN; i++) {
    const a = -length / 2 + (i + 0.5) * length / outerN;
    const [x, z] = at(a, depth);
    if (!free(x, z)) continue;
    if (i === gateAt) { if (style.gate) plan.gate = { x, z, yaw: yawAlong(t) }; continue; }
    plan.modules.push({ x, z, yaw: yawAlong(t) });
  }
  for (const end of [-1, 1]) for (let i = 0; i < endN; i++) {
    const b = (i + 0.5) * depth / endN;
    const [x, z] = at(end * length / 2, b);
    if (!free(x, z)) continue;
    if (end === streetEnd && i === endGateAt) { if (style.gate) plan.gate = { x, z, yaw: yawAlong(n) }; continue; }
    plan.modules.push({ x, z, yaw: yawAlong(n) });
  }
  // the outbuilding in one far corner, its door to the yard; the beds toward the other end
  const corner = rng() < 0.5 ? -1 : 1;
  const [sw, sdp] = style.shedSize ?? [YARD_SHED.w, YARD_SHED.d];
  if (style.shed && depth >= sdp + 1.2 && length >= sw + 3.0) {
    const a = corner * (length / 2 - sw / 2 - 0.45), b = depth - sdp / 2 - 0.45;
    const [x, z] = at(a, b);
    if (rectClear(world, house, x, z, t, n, sw / 2 + 0.3, sdp / 2 + 0.3, ROAD_FRONTAGE_CLEARANCE, 0)) {
      plan.shed = { x, z, yaw: yawAlong([-n[0], -n[1]]), w: sw, d: sdp };
    }
  }
  if (style.garden || style.graves) {
    const room = length - (plan.shed ? sw + 1.2 : 0.8);
    const gw = Math.min(4.2, room - 0.4), gd = Math.min(3.2, depth - 1.1);
    if (gw >= 1.8 && gd >= 1.4) {
      const a = plan.shed ? -corner * (length / 2 - gw / 2 - 0.5) : (rng() - 0.5) * (length - gw - 1.0);
      const b = 0.6 + gd / 2 + rng() * Math.max(0, depth - gd - 1.1);
      const [x, z] = at(a, b);
      if (rectClear(world, house, x, z, t, n, gw / 2 + 0.2, gd / 2 + 0.2, ROAD_FRONTAGE_CLEARANCE, 0)) {
        plan.garden = { x, z, yaw: yawAlong(n), w: gw, d: gd };
      }
    }
  }
  return plan;
}

const SOIL: readonly Rgb[] = [0x4a3a2a, 0x54402e, 0x3f3226].map(rgb);
const CROP: readonly Rgb[] = [0x4f6b2e, 0x5f7f34, 0x6b8a3a, 0x3e5a2a, 0x7a8a3e].map(rgb);
/** a cabbage's waxy blue-green */
const CABBAGE: Rgb = rgb(0x7f9a74);

/** A kitchen garden's make by its country (props lane A, #18b, 2026-10-14; WORKLIST.md #18: "Kitchen gardens by kit
 *  (beds, wattle edging, bean poles, cold frames)"). */
type GardenStyle = 'german' | 'dutch' | 'slavic' | 'french' | 'med' | 'monsoon' | 'japan' | 'american';
const GARDEN_STYLE: Readonly<Record<string, GardenStyle>> = Object.freeze({
  verdant: 'slavic', winter: 'slavic', steppe: 'slavic',
  frontier: 'german', reservoir: 'german', urban: 'german', foundry: 'german', railyard: 'german', alpine: 'german',
  polders: 'dutch', coastal: 'french', autumn: 'french',
  orchard: 'med', saltwind: 'med', cliffbridge: 'med', ruinspires: 'med', oasis: 'med', desert: 'med',
  monsoon: 'monsoon', mangrove: 'monsoon', delta: 'monsoon', caldera: 'japan', longleaf: 'american',
});
const WATTLE: Rgb = rgb(0x6a5a44), CANE: Rgb = rgb(0x9a8a62), BAMBOO: Rgb = rgb(0x8a8a50), PANE: Rgb = rgb(0xa8b8bc);
const BOX_HEDGE: Rgb = rgb(0x2f4a26), KERB: Rgb = rgb(0x8a8478), GOURD: Rgb = rgb(0x8aa040), BLOOM: Rgb = rgb(0xe8b820);

/**
 * The kitchen garden (dressing): a bed of dug soil, rows of crops along its width (cabbage and potato rows as low green
 * ridges with gaps, a row of beans on canes), centred on the origin, its rows along local x — edged and furnished as its
 * country keeps one: board edging and a cold frame (Germany, the Netherlands), a woven wattle hurdle and sunflowers at
 * its edge (the Russian and Polish villages), a low box hedge and glass cloches (France), a stone kerb and tomatoes up
 * cane frames (the Mediterranean), a mud bund and a bamboo arbour hung with gourds (the monsoon belt), the rows on
 * raised soil ridges under a cucumber frame (Japan), hills of maize and staked tomatoes (Louisiana, 1941).
 */
export function gardenParts(w: number, d: number, look: () => number, drop = 0, mapId?: string): RegionalParts {
  const sink = new PartSink([look() * 5.3, look() * 3.1]);
  const dec = { decor: true } as const;
  const style = (mapId && GARDEN_STYLE[mapId]) || 'german';
  const soil = SOIL[Math.floor(look() * SOIL.length) % SOIL.length];
  // the dug ground a few centimetres over the yard's; on a slope the bed is raised to its high side, its soil carried
  // down to the ground (`drop`); a monsoon bed stands a hand higher inside its bund
  const bedTop = style === 'monsoon' ? 0.12 : 0.05;
  sink.span('structureWood', -w / 2, -0.12 - drop, -d / 2, w / 2, bedTop, d / 2, { ...dec, colour: soil });
  edging(sink, style, w, d, drop, bedTop, soil, look);
  const X: Vec3 = [1, 0, 0], Z: Vec3 = [0, 0, 1];
  // the end kept for the garden's furniture (a cold frame, the cloches, an arbour), when the bed is long enough
  const keep = w >= 3.2 && style !== 'slavic' && style !== 'american' ? 1.4 : 0;
  const x0 = -w / 2 + 0.3, x1 = w / 2 - 0.2 - keep;
  const rows = Math.max(2, Math.floor((d - 0.3) / 0.55));
  for (let r = 0; r < rows; r++) {
    const z = -d / 2 + 0.3 + (d - 0.6) * (r + 0.5) / rows;
    const crop = CROP[Math.floor(look() * CROP.length) % CROP.length];
    const kind = look();
    // (Japan) every row on its own raised ridge of soil
    if (style === 'japan') ridge(sink, [x0 - 0.1, bedTop, z], [x1 + 0.1, bedTop, z], 0.42, 0.14, shade(soil, 1.08), dec);
    const base = bedTop + (style === 'japan' ? 0.12 : 0);
    if (kind < 0.18) {
      // beans on canes (a German bean row, a slavic one up its poles, the Mediterranean tomatoes up cane A-frames, a
      // Louisiana corn hill): a line of canes and the leaves climbing up them, thinning toward the tops
      if (style === 'american') { cornHills(sink, x0, x1, z, base, crop, look); continue; }
      const frame = style === 'med' || style === 'japan';
      let last = x0;
      for (let x = x0; x < x1; x += 0.45) {
        if (frame) {
          // two canes crossed over the row, tied at the top
          for (const s of [-1, 1]) sink.member('structureWood', [x, base, z + s * 0.28], [x, base + 1.45, z - s * 0.04], 0.03, 0.03, [s, 0, 0], { ...dec, colour: style === 'japan' ? BAMBOO : CANE, exposed: true });
        } else sink.span('structureWood', x - 0.015, base, z - 0.015, x + 0.015, 1.5, z + 0.015, { ...dec, colour: rgb(0x8a7a5a) });
        last = x;
      }
      if (frame) sink.member('structureWood', [x0 - 0.1, base + 1.4, z], [last + 0.1, base + 1.4, z], 0.03, 0.03, [0, 1, 0], { ...dec, colour: CANE, exposed: true });
      // (a single leafy ridge up the canes read as a green wall) the plants climbing each cane in clumps of leaves, the
      // clumps smaller toward its top, a low ridge of leaves along the row's foot
      const leaf = shade(crop, 0.85 + look() * 0.2);
      ridge(sink, [x0 - 0.08, base, z], [last + 0.08, base, z], frame ? 0.42 : 0.3, 0.32, shade(leaf, 0.9), dec);
      for (let x = x0; x <= last + 1e-6; x += 0.45) {
        for (const [y, r] of [[0.45, 0.17], [0.85, 0.15], [1.2, 0.12]] as const) {
          mound(sink, [x + (look() - 0.5) * 0.08, base + y - r * 0.6, z + (look() - 0.5) * 0.1], X, Z, r, r * 0.9, r * 1.5, shade(leaf, 0.85 + look() * 0.3), dec, look() * 6, 4);
        }
      }
      if (style === 'med') {
        // the tomatoes ripening on them
        for (let x = x0 + 0.2; x < last; x += 0.5 + look() * 0.3) mound(sink, [x, base + 0.5 + look() * 0.5, z + (look() - 0.5) * 0.3], X, Z, 0.05, 0.05, 0.08, rgb(0xb83020), dec, 0, 4);
      }
      continue;
    }
    if (kind < 0.5) {
      // (wave 199: "cabbages as flat green cubes on a plank tray") cabbages: a head every 0.4-0.5 m, each a pale
      // blue-green mound with the dark outer leaves at its foot, now and then one cut
      for (let x = x0 + 0.02; x < x1 - 0.05; x += 0.42 + look() * 0.1) {
        if (look() < 0.1) continue;
        const rr = 0.13 + look() * 0.05;
        mound(sink, [x, base, z], X, Z, rr * 1.25, rr * 1.25, rr * 0.55, shade(CABBAGE, 0.72), dec, look() * 6);
        mound(sink, [x, base + 0.02, z], X, Z, rr * 0.75, rr * 0.75, rr * 1.05, shade(CABBAGE, 1.05 + look() * 0.15), dec, look() * 6, 4);
      }
      continue;
    }
    // a ridge of leafy crop (potatoes, beets, carrots) in two or three runs, gaps where a plant failed or was cut: each run
    // a low rounded ridge, darker at its foot
    let x = x0 - 0.1;
    while (x < x1 - 0.2) {
      const run = Math.min(x1 - x, 0.8 + look() * 1.6);
      const h = 0.16 + look() * 0.14;
      ridge(sink, [x, base, z], [x + run, base, z], 0.34, h * 1.2, shade(crop, 0.85 + look() * 0.3), dec);
      x += run + 0.15 + look() * 0.35;
    }
  }
  furnish(sink, style, w, d, bedTop, keep, look);
  return sink.finish();
}

/** The bed's edge as its country keeps it. */
function edging(sink: PartSink, style: GardenStyle, w: number, d: number, drop: number, top: number, soil: Rgb, look: () => number): void {
  const dec = { decor: true } as const;
  const sides: Array<[Vec3, Vec3]> = [[[-w / 2, 0, -d / 2], [w / 2, 0, -d / 2]], [[w / 2, 0, -d / 2], [w / 2, 0, d / 2]],
    [[w / 2, 0, d / 2], [-w / 2, 0, d / 2]], [[-w / 2, 0, d / 2], [-w / 2, 0, -d / 2]]];
  if (style === 'german' || style === 'dutch' || drop > 0.12) {
    // boards round it (wave 199 read a level bed's lone edging as "a plank tray": these stand a hand over the soil)
    const board = shade(rgb(0x7a6a52), 0.8 + look() * 0.3), up = top + 0.08;
    for (const sz of [-1, 1]) sink.span('structureWood', -w / 2 - 0.03, -drop - 0.05, sz * d / 2 - 0.03, w / 2 + 0.03, up, sz * d / 2 + 0.03, { ...dec, colour: board });
    for (const sx of [-1, 1]) sink.span('structureWood', sx * w / 2 - 0.03, -drop - 0.05, -d / 2 + 0.03, sx * w / 2 + 0.03, up, d / 2 - 0.03, { ...dec, colour: board });
    if (style === 'german' || style === 'dutch') return;
  }
  if (style === 'slavic') {
    // a wattle hurdle: stakes a stride apart, two bands of withies woven between them
    for (const [a, b] of sides) {
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.max(2, Math.round(len / 0.45));
      for (let k = 0; k <= n; k++) {
        const t = k / n, x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t;
        sink.span('structureWood', x - 0.02, -0.1, z - 0.02, x + 0.02, 0.42 + look() * 0.06, z + 0.02, { ...dec, colour: shade(WATTLE, 0.85 + look() * 0.2) });
      }
      for (const y of [0.14, 0.3]) sink.member('structureWood', [a[0], y, a[2]], [b[0], y, b[2]], 0.09, 0.03, [0, 1, 0], { ...dec, colour: shade(WATTLE, 1.1), exposed: true });
    }
    return;
  }
  if (style === 'med') {
    // a kerb of rough stones laid end to end, a gap now and then
    for (const [a, b] of sides) {
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.max(2, Math.round(len / 0.34));
      for (let k = 0; k < n; k++) {
        if (look() < 0.08) continue;
        const t0 = (k + 0.06) / n, t1 = (k + 0.94) / n, h = 0.12 + look() * 0.08;
        const xa = a[0] + (b[0] - a[0]) * t0, za = a[2] + (b[2] - a[2]) * t0, xb = a[0] + (b[0] - a[0]) * t1, zb = a[2] + (b[2] - a[2]) * t1;
        sink.span('structureWood', Math.min(xa, xb) - 0.07, -0.08, Math.min(za, zb) - 0.07, Math.max(xa, xb) + 0.07, h, Math.max(za, zb) + 0.07, { ...dec, colour: shade(KERB, 0.8 + look() * 0.35) });
      }
    }
    return;
  }
  if (style === 'french') {
    // a low box hedge clipped round it
    for (const [a, b] of sides) ridge(sink, [a[0], 0, a[2]], [b[0], 0, b[2]], 0.26, 0.32, shade(BOX_HEDGE, 0.9 + look() * 0.2), dec);
    return;
  }
  if (style === 'monsoon') {
    // a bund of the same mud round the raised bed
    for (const [a, b] of sides) ridge(sink, [a[0], 0, a[2]], [b[0], 0, b[2]], 0.34, 0.24, shade(soil, 0.9), dec);
  }
}

/** Louisiana's corn hills: maize stalks in hills along the row, their strap leaves a ridge up them. */
function cornHills(sink: PartSink, x0: number, x1: number, z: number, base: number, crop: Rgb, look: () => number): void {
  const dec = { decor: true } as const;
  let last = x0;
  for (let x = x0; x < x1; x += 0.6) {
    const h = 1.6 + look() * 0.5;
    sink.span('structureWood', x - 0.02, base, z - 0.02, x + 0.02, base + h, z + 0.02, { ...dec, colour: rgb(0x7a8a4a) });
    sink.span('structureWood', x - 0.01, base + h, z - 0.06, x + 0.01, base + h + 0.18, z + 0.06, { ...dec, colour: rgb(0xb8a060) });
    last = x;
  }
  // the strap leaves off each stalk, in two tiers
  const X: Vec3 = [1, 0, 0], Z: Vec3 = [0, 0, 1];
  for (let x = x0; x <= last + 1e-6; x += 0.6) {
    for (const [y, r] of [[0.55, 0.32], [1.05, 0.26]] as const) mound(sink, [x, base + y, z], X, Z, r, r * 0.55, 0.22, shade(crop, 0.85 + look() * 0.25), dec, look() * 6, 4);
  }
}

/** The garden's furniture at its far end, by its country. */
function furnish(sink: PartSink, style: GardenStyle, w: number, d: number, top: number, keep: number, look: () => number): void {
  const dec = { decor: true } as const;
  const X: Vec3 = [1, 0, 0], Z: Vec3 = [0, 0, 1];
  if (style === 'slavic') {
    // sunflowers along the back edge, their heads turned to the yard
    for (let x = -w / 2 + 0.4; x < w / 2 - 0.3; x += 0.9 + look() * 0.6) {
      const h = 1.7 + look() * 0.5, z = d / 2 - 0.18;
      sink.span('structureWood', x - 0.025, top, z - 0.025, x + 0.025, top + h, z + 0.025, { ...dec, colour: rgb(0x5a7a34) });
      for (const y of [0.6, 1.1]) mound(sink, [x, top + h * (y / 1.8), z], X, Z, 0.14, 0.08, 0.05, rgb(0x4a6a2c), dec, look() * 6, 4);
      bloomDisc(sink, [x, top + h, z - 0.05], [0, -0.2, -1], 0.17, BLOOM, dec, look());
      bloomDisc(sink, [x, top + h, z - 0.06], [0, -0.2, -1], 0.09, rgb(0x3a2614), dec);
    }
    return;
  }
  if (!keep) return;
  const cx = w / 2 - keep / 2 - 0.15;
  if (style === 'german' || style === 'dutch') {
    // a cold frame: a box of boards, its back higher than its front, its light (a glazed sash) laid on it
    const fw = Math.min(keep - 0.1, 1.2), fd = Math.min(d - 0.4, 0.8), frame = rgb(0x6a5a42);
    const xa = cx - fw / 2, xb = cx + fw / 2, za = -fd / 2, zb = fd / 2, lo = top + 0.22, hi = top + 0.42;
    sink.span('structureWood', xa, top - 0.05, za - 0.03, xb, lo, za, { ...dec, colour: frame });
    sink.span('structureWood', xa, top - 0.05, zb, xb, hi, zb + 0.03, { ...dec, colour: frame });
    for (const x of [xa, xb]) sink.polygon('structureWood', [[x, top - 0.05, za], [x, top - 0.05, zb], [x, hi, zb], [x, lo, za]], { ...dec, colour: frame });
    for (const x of [xb, xa]) sink.polygon('structureWood', [[x, top - 0.05, zb], [x, top - 0.05, za], [x, lo, za], [x, hi, zb]], { ...dec, colour: frame });
    sink.polygon('structureWood', [[xa, lo + 0.01, za], [xb, lo + 0.01, za], [xb, hi + 0.01, zb], [xa, hi + 0.01, zb]], { ...dec, colour: PANE });
    // its sash bars
    for (const t of [0.33, 0.66]) { const x = xa + (xb - xa) * t; sink.member('structureWood', [x, lo + 0.02, za], [x, hi + 0.02, zb], 0.03, 0.02, [0, 1, 0], { ...dec, colour: frame, exposed: true }); }
    return;
  }
  if (style === 'french') {
    // glass cloches over the young plants, in a row
    for (let z = -d / 2 + 0.35; z < d / 2 - 0.3; z += 0.5) mound(sink, [cx + (look() - 0.5) * 0.2, top, z], X, Z, 0.17, 0.17, 0.3, PANE, dec, look() * 6);
    return;
  }
  if (style === 'med') {
    // the well's stone basin at the garden's end, water dark in it
    const bw = Math.min(keep - 0.2, 0.9);
    sink.span('structureWood', cx - bw / 2, top - 0.05, -0.35, cx + bw / 2, top + 0.45, 0.35, { ...dec, colour: KERB });
    sink.span('structureWood', cx - bw / 2 + 0.08, top + 0.45, -0.27, cx + bw / 2 - 0.08, top + 0.46, 0.27, { ...dec, colour: rgb(0x1e2a26) });
    return;
  }
  if (style === 'monsoon' || style === 'japan') {
    // a bamboo arbour (the gourds hung from it) or a cucumber frame: four posts, their rails, a grid over them
    const aw = keep - 0.1, ad = Math.min(d - 0.3, 1.8), h = style === 'monsoon' ? 1.9 : 1.5, col = BAMBOO;
    const xa = cx - aw / 2, xb = cx + aw / 2, za = -ad / 2, zb = ad / 2;
    for (const x of [xa, xb]) for (const z of [za, zb]) sink.member('structureWood', [x, top - 0.1, z], [x, top + h, z], 0.05, 0.05, [1, 0, 0], { ...dec, colour: col, exposed: true });
    for (const z of [za, zb]) sink.member('structureWood', [xa, top + h, z], [xb, top + h, z], 0.04, 0.04, [0, 1, 0], { ...dec, colour: col, exposed: true });
    for (let k = 0; k <= 3; k++) { const x = xa + (xb - xa) * (k / 3); sink.member('structureWood', [x, top + h + 0.04, za], [x, top + h + 0.04, zb], 0.03, 0.03, [0, 1, 0], { ...dec, colour: col, exposed: true }); }
    // the vine over it and up a post
    ridge(sink, [xa + 0.1, top + h + 0.04, 0], [xb - 0.1, top + h + 0.04, 0], ad * 0.9, 0.18, shade(GOURD, 0.75), dec);
    ridge(sink, [xa, top, za], [xa, top + h, za + 0.01], 0.2, 0.15, shade(GOURD, 0.7), dec);
    if (style === 'monsoon') for (let k = 0; k < 4; k++) mound(sink, [xa + 0.2 + look() * (aw - 0.4), top + h - 0.35, za + 0.2 + look() * (ad - 0.4)], X, Z, 0.08, 0.08, 0.28, shade(GOURD, 1.1), dec, look() * 6, 4);
  }
}

const IRON: Rgb = rgb(0x1e1c1a);

/**
 * A churchyard's graves (dressing, in the area the planner keeps for a yard's beds): rows of graves, each a low kerbed
 * bed with its marker at the head — a slab with a shouldered top, a stone cross on a plinth, or an iron cross — and an
 * empty plot here and there; the paths between the rows left as the yard's ground. The stone takes the kit's masonry.
 */
export function graveParts(w: number, d: number, look: () => number, drop = 0, _mapId?: string): RegionalParts {
  const sink = new PartSink([look() * 5.3, look() * 3.1]);
  const dec = { decor: true } as const;
  const rows = Math.max(1, Math.floor((d - 0.4) / 2.1)), per = Math.max(1, Math.floor((w - 0.4) / 1.15));
  for (let r = 0; r < rows; r++) {
    const z = -d / 2 + 0.2 + (d - 0.4) * (r + 0.5) / rows;
    for (let k = 0; k < per; k++) {
      if (look() < 0.12) continue; // an empty plot in the row
      const x = -w / 2 + 0.2 + (w - 0.4) * (k + 0.5) / per;
      // the bed: a low stone kerb round a mound of earth
      sink.span('stone', x - 0.36, -0.05 - drop, z - 0.9, x + 0.36, 0.1, z + 0.75, dec);
      sink.span('structureWood', x - 0.3, 0.05, z - 0.84, x + 0.3, 0.14, z + 0.66, { ...dec, colour: shade(SOIL[k % SOIL.length], 0.9) });
      const kind = look(), rise = (look() - 0.5) * 0.12, hz = z - 0.92;
      if (kind < 0.55) {
        // a slab headstone, a shoulder cut at its top
        const hw = 0.24 + look() * 0.1, hh = 0.55 + look() * 0.35;
        sink.span('stone', x - hw, -0.05 - drop, hz - 0.07, x + hw, hh, hz + 0.07, dec);
        sink.span('stone', x - hw * 0.7, hh, hz - 0.06, x + hw * 0.7, hh + 0.08, hz + 0.06, dec);
      } else if (kind < 0.8) {
        // a stone cross on a plinth
        sink.span('stone', x - 0.2, -0.05 - drop, hz - 0.12, x + 0.2, 0.25, hz + 0.12, dec);
        sink.span('stone', x - 0.05, 0.25, hz - 0.05, x + 0.05, 1.05 + rise, hz + 0.05, dec);
        sink.span('stone', x - 0.22, 0.72, hz - 0.05, x + 0.22, 0.82, hz + 0.05, dec);
      } else {
        // an iron cross
        sink.span('structureMetal', x - 0.025, -drop, hz - 0.025, x + 0.025, 1.0, hz + 0.025, { ...dec, colour: IRON });
        sink.span('structureMetal', x - 0.18, 0.7, hz - 0.02, x + 0.18, 0.74, hz + 0.02, { ...dec, colour: IRON });
      }
    }
  }
  return sink.finish();
}
