// src/world/hinterland/wire.ts — the Hinterland's worker answer as transferable arrays (HL-3, the horizons stream,
// 2026-10-13): the height pyramid's levels, the surface atlas, and the outland plan (its trees and buildings packed into
// float arrays, its settlements, roads and verticals as plain records), with the few spec facts the page's builder reads.
import type { HinterlandBuild } from './pipeline.ts';
import type { HinterlandBuilding, HinterlandRoad, HinterlandSettlement, HinterlandTree, HinterlandVertical } from './outland.ts';
import type { HinterlandLevel, HinterlandPyramid } from './pyramid.ts';
import type { HinterlandSurfaceLevel } from './surface.ts';
import type { HinterlandOutlandGeometry, HinterlandShapeArrays } from './outlandGeometry.ts';

export const HINTERLAND_TREE_STRIDE = 8; // x, z, height, crown, tone, leaf, species index, form index
export const HINTERLAND_BUILDING_STRIDE = 7; // x, z, yaw, width, depth, kind index, settlement
export const HINTERLAND_FORMS: readonly HinterlandTree['form'][] = Object.freeze(['columnar', 'broad', 'pollard', 'conifer']);

export interface HinterlandWire {
  mapId: string;
  regionId: string;
  kit: string | null;
  season: string;
  fogDensity: number;
  canopyM: number;
  levels: { texelM: number; halfM: number; n: number; heights: Float32Array }[];
  /** Per level the land's surface (surface.ts: sRGB albedo and a flags byte), when baked. */
  surface: HinterlandSurfaceLevel[] | null;
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

/** Pack a build (the worker's side). */
export function packHinterlandPlan(
  build: HinterlandBuild, surface: HinterlandWire['surface'] = null, outland: HinterlandOutlandGeometry | null = null,
): { wire: HinterlandWire; transfer: ArrayBuffer[] } {
  const { plan, pyramid, spec } = build;
  const species: string[] = [];
  const trees = new Float32Array(plan.trees.length * HINTERLAND_TREE_STRIDE);
  plan.trees.forEach((t, i) => {
    let s = species.indexOf(t.species);
    if (s < 0) { s = species.length; species.push(t.species); }
    trees.set([t.x, t.z, t.heightM, t.crownM, t.tone, t.leaf, s, HINTERLAND_FORMS.indexOf(t.form)], i * HINTERLAND_TREE_STRIDE);
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
    mapId: spec.mapId, regionId: spec.region.id, kit: spec.kit, season: spec.season, fogDensity: spec.fogDensity,
    canopyM: spec.region.vegetation.canopyM, levels, surface, outland, trees, species, buildings, buildingKinds,
    settlements: plan.settlements, roads: plan.roads, verticals: plan.verticals, ms: build.ms, evaluated: pyramid.evaluated,
  };
  const transfer = [trees.buffer as ArrayBuffer, buildings.buffer as ArrayBuffer, ...levels.map((l) => l.heights.buffer as ArrayBuffer)];
  if (surface) for (const s of surface) transfer.push(s.rgba.buffer as ArrayBuffer);
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
export function wireBuildings(wire: HinterlandWire): HinterlandBuilding[] {
  const out: HinterlandBuilding[] = [];
  for (let i = 0; i < wire.buildings.length; i += HINTERLAND_BUILDING_STRIDE) {
    const b = wire.buildings;
    out.push({ x: b[i], z: b[i + 1], yaw: b[i + 2], width: b[i + 3], depth: b[i + 4], kind: wire.buildingKinds[b[i + 5]], settlement: b[i + 6] });
  }
  return out;
}

/** A copy of a wire (the kept answer for a rematch: the transfer leaves the original's buffers detached). */
export function copyHinterlandWire(wire: HinterlandWire): HinterlandWire {
  return {
    ...wire,
    levels: wire.levels.map((l) => ({ ...l, heights: l.heights.slice() })),
    surface: wire.surface ? wire.surface.map((s) => ({ ...s, rgba: s.rgba.slice() })) : null,
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
