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
import { PartSink, rgb, shade, type RegionalParts, type Rgb } from './geometry.ts';
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
  if (style.garden) {
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
/** (b35) The plants' tones: cabbage heads pale and blue-green, their outer leaves darker, beans and potato haulm green. */
const CABBAGE: readonly Rgb[] = [0x9db27a, 0x8faa70, 0xa6b884].map(rgb);
const CABBAGE_LEAF: readonly Rgb[] = [0x5f8a58, 0x55804f, 0x6a9160].map(rgb);
const BEAN_LEAF: readonly Rgb[] = [0x4b7a31, 0x568436, 0x426f2c].map(rgb);
const HAULM: readonly Rgb[] = [0x5c8237, 0x517832, 0x678c3e].map(rgb);
type V3 = [number, number, number];

/**
 * The kitchen garden (dressing): a bed of dug soil edged with boards, rows of crops along its width, centred on the
 * origin, its rows along local x.
 *
 * (b35, the scenery lane; gauntlet wave 241 on Verdant's gardens: "green cubes on poles", "smooth green boxes") The
 * crops are plants: a cabbage row's heads — each a rounded head (a six-sided double cone, faceted) in a rosette of
 * three outer leaves spread low round it; a potato row's leafy haulm in clumps along a hilled ridge; a bean row's
 * canes, each twined by its vine (a thin stem spiralling up it) with heart-shaped leaves alternating round it all the
 * way up. A leaf is a kite drawn on both faces; the plants sample one place of the bed's print (a tone, no grain).
 * Within a bed's few hundred triangles (yards.selftest).
 */
export function gardenParts(w: number, d: number, look: () => number, drop = 0): RegionalParts {
  const sink = new PartSink([look() * 5.3, look() * 3.1]);
  const dec = { decor: true } as const;
  const plant = { decor: true, density: 0.04 } as const;
  const soil = SOIL[Math.floor(look() * SOIL.length) % SOIL.length];
  const pick = (list: readonly Rgb[]) => list[Math.floor(look() * list.length) % list.length];
  // on a slope the bed is raised to its high side, its soil and board edging carried down to the ground (`drop`)
  sink.span('structureWood', -w / 2, -0.12 - drop, -d / 2, w / 2, 0.05, d / 2, { ...dec, colour: soil });
  const board = shade(rgb(0x7a6a52), 0.8 + look() * 0.3);
  for (const sz of [-1, 1]) sink.span('structureWood', -w / 2 - 0.03, -drop, sz * d / 2 - 0.03, w / 2 + 0.03, 0.12, sz * d / 2 + 0.03, { ...dec, colour: board });
  for (const sx of [-1, 1]) sink.span('structureWood', sx * w / 2 - 0.03, -drop, -d / 2 + 0.03, sx * w / 2 + 0.03, 0.12, d / 2 - 0.03, { ...dec, colour: board });
  // a leaf from its base out along `a` (radians round y), `len` long and `wid` wide, tipped up `rise`, both faces: a
  // kite (a bean's, a heart narrowing to its tip) or an oval (a cabbage's or a potato's, broad and blunt)
  const leaf = (bx: number, by: number, bz: number, a: number, len: number, wid: number, rise: number, colour: Rgb, oval = false) => {
    const ca = Math.cos(a), sa = Math.sin(a), cr = Math.cos(rise), sr = Math.sin(rise);
    // (the leaf curls up toward its tip: the far points rise a little more than its plane)
    const at = (t: number, side: number): V3 => [bx + ca * cr * len * t - sa * side, by + sr * len * t + (oval ? 0.12 * len * t * t : 0), bz + sa * cr * len * t + ca * side];
    const pts: V3[] = oval
      ? [at(0, 0), at(0.42, wid / 2), at(0.9, wid * 0.3), at(0.9, -wid * 0.3), at(0.42, -wid / 2)]
      : [at(0, 0), at(0.42, wid / 2), at(1, 0), at(0.42, -wid / 2)];
    sink.polygon('structureWood', pts, { ...plant, colour });
    sink.polygon('structureWood', [...pts].reverse(), { ...plant, colour });
  };
  // a triangle wound to face away from `c`
  const tri = (a: V3, b: V3, e: V3, c: V3, colour: Rgb) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = e[0] - a[0], vy = e[1] - a[1], vz = e[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const mx = (a[0] + b[0] + e[0]) / 3 - c[0], my = (a[1] + b[1] + e[1]) / 3 - c[1], mz = (a[2] + b[2] + e[2]) / 3 - c[2];
    sink.polygon('structureWood', nx * mx + ny * my + nz * mz >= 0 ? [a, b, e] : [a, e, b], { ...plant, colour });
  };
  const rows = Math.max(2, Math.floor((d - 0.3) / 0.55));
  let beans = false;
  for (let r = 0; r < rows; r++) {
    const z = -d / 2 + 0.3 + (d - 0.6) * (r + 0.5) / rows;
    const kind = look();
    // (one row of beans to a bed: a second bean draw is a cabbage row)
    if (kind < 0.18 && !beans) {
      beans = true;
      // beans on canes: each cane twined by its vine, heart-shaped leaves alternating round it up to its top
      // (the scenery lane, b30: a vine a cane, daylight between them; b35: leaves, not clumps)
      for (let x = -w / 2 + 0.3; x < w / 2 - 0.2; x += 0.6) {
        const top = 1.2 + look() * 0.25, phase = look() * Math.PI * 2, tone = pick(BEAN_LEAF);
        sink.span('structureWood', x - 0.012, 0.05, z - 0.012, x + 0.012, top, z + 0.012, { ...dec, colour: rgb(0x8a7a5a) });
        // the stem: a thin spiral twined once round the cane up to its leaves' top
        const a1 = phase + Math.PI * 1.5;
        sink.member('structureWood', [x + Math.cos(phase) * 0.025, 0.06, z + Math.sin(phase) * 0.025], [x + Math.cos(a1) * 0.025, top - 0.1, z + Math.sin(a1) * 0.025],
          0.012, 0.012, [Math.cos(a1), 0, Math.sin(a1)], { ...plant, colour: shade(tone, 0.8) }, 0);
        // the leaves: broad hearts held out on short stalks in pairs, the pairs turning round the cane all the way up,
        // smaller toward the top
        const pairs = 8;
        for (let k = 0; k < pairs; k++) {
          const t = (k + 0.5) / pairs, y = 0.2 + (top - 0.32) * t;
          for (const side of [0, 1]) {
            const a = phase + k * 1.3 + side * 2.7 + (look() - 0.5) * 0.4;
            leaf(x + Math.cos(a) * 0.03, y + side * 0.05, z + Math.sin(a) * 0.03, a, (0.22 + look() * 0.05) * (1 - t * 0.3), 0.19 * (1 - t * 0.25),
              0.05 + look() * 0.3, shade(tone, 0.85 + look() * 0.3));
          }
        }
      }
      continue;
    }
    if (kind < 0.6) {
      // cabbages: a head every 0.4 m or so in a rosette of three outer leaves, the odd one cut
      for (let x = -w / 2 + 0.32; x < w / 2 - 0.28; x += 0.44 + look() * 0.08) {
        if (look() < 0.1) continue;
        const R = 0.1 + look() * 0.035, H = 0.18 + look() * 0.05, cx = x + (look() - 0.5) * 0.05, cz = z + (look() - 0.5) * 0.05;
        const head = shade(pick(CABBAGE), 0.9 + look() * 0.2), outer = pick(CABBAGE_LEAF), turn = look() * Math.PI * 2;
        // the head: six sides, its belly a little below half its height, its shoulder drawn in, a blunt crown
        const c: V3 = [cx, 0.05 + H * 0.45, cz], top: V3 = [cx, 0.05 + H, cz], foot: V3 = [cx, 0.06, cz];
        const ring = (y: number, r: number, twist: number): V3[] => Array.from({ length: 6 }, (_, i) => {
          const a = turn + twist + (i / 6) * Math.PI * 2;
          return [cx + Math.cos(a) * r, 0.05 + y, cz + Math.sin(a) * r];
        });
        const belly = ring(H * 0.42, R, 0), shoulder = ring(H * 0.8, R * 0.66, Math.PI / 6);
        for (let i = 0; i < 6; i++) {
          const j = (i + 1) % 6;
          tri(belly[i], belly[j], foot, c, shade(head, 0.8));
          tri(belly[i], belly[j], shoulder[i], c, head);
          tri(belly[j], shoulder[j], shoulder[i], c, head);
          tri(shoulder[i], shoulder[j], top, c, shade(head, 1.08));
        }
        // three broad outer leaves spread low round it, curling up at their edges
        for (let k = 0; k < 3; k++) {
          const a = turn + 0.5 + (k / 3) * Math.PI * 2 + (look() - 0.5) * 0.4;
          leaf(cx + Math.cos(a) * R * 0.45, 0.07, cz + Math.sin(a) * R * 0.45, a, R * 1.9 + look() * 0.04, R * 1.9, 0.28 + look() * 0.22,
            shade(outer, 0.85 + look() * 0.3), true);
        }
      }
      continue;
    }
    // potatoes: a hilled ridge, the haulm in leafy clumps along it, a gap where a plant failed
    // (the ridge a hilled bank of soil, sloping sides and a rounded crown, not a plank)
    const ridgeTone = shade(soil, 0.9 + look() * 0.2), x0 = -w / 2 + 0.2;
    sink.prism('structureWood', [[x0, 0.05, z - 0.15], [x0, 0.05, z + 0.15], [x0, 0.12, z + 0.07], [x0, 0.14, z], [x0, 0.12, z - 0.07]].reverse() as V3[],
      [1, 0, 0], w - 0.4, { ...dec, colour: ridgeTone });
    for (let x = -w / 2 + 0.3; x < w / 2 - 0.25; x += 0.33 + look() * 0.08) {
      if (look() < 0.12) continue;
      const tone = shade(pick(HAULM), 0.85 + look() * 0.3), spin = look() * Math.PI * 2;
      for (let k = 0; k < 3; k++) {
        const a = spin + (k / 3) * Math.PI * 2;
        leaf(x, 0.11, z, a, 0.2 + look() * 0.08, 0.15, 0.55 + look() * 0.35, shade(tone, 0.9 + look() * 0.2), true);
      }
    }
  }
  return sink.finish();
}
