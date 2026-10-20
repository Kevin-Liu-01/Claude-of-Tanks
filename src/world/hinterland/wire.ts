// src/world/hinterland/wire.ts — the Hinterland's worker answer as transferable arrays (HL-3, the horizons stream,
// 2026-10-13): the height pyramid's levels, the surface atlas, and the outland plan (its trees and buildings packed into
// float arrays, its settlements, roads and verticals as plain records), with the few spec facts the page's builder reads.
import type { HinterlandBuild } from './pipeline.ts';
import type { HinterlandRoad, HinterlandSettlement, HinterlandTree, HinterlandVertical } from './outland.ts';
import type { HinterlandLevel, HinterlandPyramid } from './pyramid.ts';
import type { HinterlandSurfaceLevel } from './surface.ts';
import type { HinterlandOutlandGeometry, HinterlandShapeArrays } from './outlandGeometry.ts';

/** The surface's edge offsets' encoding (surface.ts, material.ts): (s + HL_EDGE_OFFSET_M) × HL_EDGE_SCALE in 16 bits
 * (±256 m at 1/128 m); 65535 is "no edge". Here, where both sides read it without the page importing the field. */
export const HL_EDGE_OFFSET_M = 256;
export const HL_EDGE_SCALE = 128;
export const HINTERLAND_TREE_STRIDE = 9; // x, z, height, crown, tone, leaf, species index, form index, ground height
const HINTERLAND_BUILDING_STRIDE = 7; // x, z, yaw, width, depth, kind index, settlement
export const HINTERLAND_FORMS: readonly HinterlandTree['form'][] = Object.freeze(['columnar', 'broad', 'pollard', 'conifer']);
/** A tree with the drawn land's height under it before the woods' canopy rose (the worker's list). */
export type HinterlandGroundedTree = HinterlandTree & { y: number; woods?: boolean };

export interface HinterlandWire {
  mapId: string;
  regionId: string;
  kit: string | null;
  season: string;
  fogDensity: number;
  /** The region's air (regions.ts far.air): the far haze's scale, 1 by default, under it in clear mountain air. */
  air?: number;
  /** The region's rock for the steep faces' strata (material.ts): its linear albedo, whether its ledges hold snow, the
   * slope (deg) past which bare rock shows, and the beds' dip (deg). */
  rock?: { rgb: [number, number, number]; snowy: boolean; slopeDeg: number; dipDeg: number };
  canopyM: number;
  levels: { texelM: number; halfM: number; n: number; heights: Float32Array }[];
  /** Per level the land's surface (surface.ts: sRGB albedo and a flags byte, the fields' edge offsets), when baked. */
  surface: HinterlandSurfaceLevel[] | null;
  /** The land-use grid's heading as (cos, sin) — the frame of the surface's edge offsets; null without fields. */
  landRot: [number, number] | null;
  /** The outland's buildings, verticals and trees as geometry (outlandGeometry.ts), when built. */
  outland: HinterlandOutlandGeometry | null;
  trees: Float32Array;
  species: string[];
  buildings: Float32Array;
  buildingKinds: string[];
  settlements: HinterlandSettlement[];
  roads: HinterlandRoad[];
  verticals: HinterlandVertical[];
  ms: HinterlandBuild['ms'];
  evaluated: number;
}

/** The wire's rock from a geology (sRGB hex to linear). */
function rockOf(g: HinterlandBuild['field']['spec']['geology']): NonNullable<HinterlandWire['rock']> {
  const lin = (v: number): number => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return { rgb: [lin((g.rockHex >> 16) & 255), lin((g.rockHex >> 8) & 255), lin(g.rockHex & 255)], snowy: g.snow.lineM <= -100, // (regions.ts hinterlandSnowCovered: the page's side keeps the regions out)
    slopeDeg: g.rockSlopeDeg, dipDeg: g.strata.dipDeg };
}

/** Pack a build (the worker's side). */
export function packHinterlandPlan(
  build: HinterlandBuild, surface: HinterlandWire['surface'] = null, outland: HinterlandOutlandGeometry | null = null,
  allTrees: readonly HinterlandGroundedTree[] | null = null,
): { wire: HinterlandWire; transfer: ArrayBuffer[] } {
  const { plan, pyramid, spec } = build;
  const species: string[] = [];
  // (the plan's trees, or the worker's list: the plan's and the woods' with the ground each stands on)
  const list: readonly (HinterlandTree & { y?: number })[] = allTrees ?? plan.trees;
  const trees = new Float32Array(list.length * HINTERLAND_TREE_STRIDE);
  list.forEach((t, i) => {
    let s = species.indexOf(t.species);
    if (s < 0) { s = species.length; species.push(t.species); }
    trees.set([t.x, t.z, t.heightM, t.crownM, t.tone, t.leaf, s, HINTERLAND_FORMS.indexOf(t.form), t.y ?? NaN], i * HINTERLAND_TREE_STRIDE);
  });
  const buildingKinds: string[] = [];
  const buildings = new Float32Array(plan.buildings.length * HINTERLAND_BUILDING_STRIDE);
  plan.buildings.forEach((b, i) => {
    let k = buildingKinds.indexOf(b.kind);
    if (k < 0) { k = buildingKinds.length; buildingKinds.push(b.kind); }
    buildings.set([b.x, b.z, b.yaw, b.width, b.depth, k, b.settlement], i * HINTERLAND_BUILDING_STRIDE);
  });
  const levels = pyramid.levels.map((l) => ({ texelM: l.texelM, halfM: l.halfM, n: l.n, heights: l.heights }));
  const wire: HinterlandWire = {
    mapId: spec.mapId, regionId: spec.region.id, kit: spec.kit, season: spec.season, fogDensity: spec.fogDensity, air: spec.region.far.air ?? 1,
    rock: rockOf(build.field.spec.geology),
    canopyM: spec.region.vegetation.canopyM, levels, surface, outland, trees, species, buildings, buildingKinds,
    landRot: build.field.landUse && build.field.landUse.strength > 0 ? [Math.cos(build.field.landUse.heading), Math.sin(build.field.landUse.heading)] : null,
    settlements: plan.settlements, roads: plan.roads, verticals: plan.verticals, ms: build.ms, evaluated: pyramid.evaluated,
  };
  const transfer = [trees.buffer as ArrayBuffer, buildings.buffer as ArrayBuffer, ...levels.map((l) => l.heights.buffer as ArrayBuffer)];
  if (surface) for (const s of surface) { transfer.push(s.rgba.buffer as ArrayBuffer); if (s.edges) transfer.push(s.edges.buffer as ArrayBuffer); }
  if (outland) {
    for (const a of [outland.buildings, outland.nearTrees, outland.farTrees]) if (a) transfer.push(a.position.buffer as ArrayBuffer, a.normal.buffer as ArrayBuffer, a.color.buffer as ArrayBuffer);
    transfer.push(outland.nearIndex.buffer as ArrayBuffer);
  }
  return { wire, transfer };
}

/** The wire's pyramid (the page's side). */
export function wirePyramid(wire: HinterlandWire): HinterlandPyramid {
  const levels: HinterlandLevel[] = wire.levels.map((l) => ({ texelM: l.texelM, halfM: l.halfM, n: l.n, heights: l.heights }));
  return { levels, evaluated: wire.evaluated, ms: wire.ms.bake };
}

/** The wire's trees and buildings unpacked (receipts and the tools). */
export function wireTrees(wire: HinterlandWire): HinterlandTree[] {
  const out: HinterlandTree[] = [];
  for (let i = 0; i < wire.trees.length; i += HINTERLAND_TREE_STRIDE) {
    const t = wire.trees;
    out.push({ x: t[i], z: t[i + 1], heightM: t[i + 2], crownM: t[i + 3], tone: t[i + 4], leaf: t[i + 5], species: wire.species[t[i + 6]], form: HINTERLAND_FORMS[t[i + 7]] });
  }
  return out;
}

/** A copy of a wire (the kept answer for a rematch: the transfer leaves the original's buffers detached). */
export function copyHinterlandWire(wire: HinterlandWire): HinterlandWire {
  return {
    ...wire,
    levels: wire.levels.map((l) => ({ ...l, heights: l.heights.slice() })),
    surface: wire.surface ? wire.surface.map((s) => ({ ...s, rgba: s.rgba.slice(), edges: s.edges ? s.edges.slice() : null })) : null,
    outland: wire.outland ? {
      ...wire.outland, buildings: copyShapes(wire.outland.buildings), nearTrees: copyShapes(wire.outland.nearTrees),
      farTrees: copyShapes(wire.outland.farTrees), nearIndex: wire.outland.nearIndex.slice(),
    } : null,
    trees: wire.trees.slice(), buildings: wire.buildings.slice(),
  };
}

function copyShapes(a: HinterlandShapeArrays | null): HinterlandShapeArrays | null {
  return a ? { position: a.position.slice(), normal: a.normal.slice(), color: a.color.slice() } : null;
}
