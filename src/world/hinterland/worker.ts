// src/world/hinterland/worker.ts — the Hinterland's worker (HL-3, the horizons stream, 2026-10-13; B-architecture §4.1):
// the whole CPU pipeline off the page, in parallel with the battlefield's build — the map's config (worldBuildConfig,
// with the block the page selected), its height field (createHeightField, the generator the page's build drains), the
// field, the outland plan and the height pyramid (pipeline.ts) — answered as transferable arrays. The ring worker's
// pattern (horizonRingWorker.ts), which this replaces on a migrated map.
import { createHeightField } from '../terrain.ts';
import { worldBuildConfig } from '../worldBuildConfig.ts';
import { buildHinterland } from './pipeline.ts';
import { withSelectedHinterland } from './select.ts';
import { resolveHinterlandSpec } from './spec.ts';
import { packHinterlandPlan, type HinterlandGroundedTree, type HinterlandWire } from './wire.ts';
import { bakeHinterlandSurface, plantHinterlandWoods, raiseHinterlandCanopy } from './surface.ts';
import { buildHinterlandOutlandGeometry, HINTERLAND_NEAR_TREE_M } from './outlandGeometry.ts';
import { samplePyramid } from './pyramid.ts';
import { sightlineBlocker } from './outland.ts';

export interface HinterlandRequest {
  mapId: string;
  terrainVariant: string | null;
  fieldSeed: number;
  /** The page's query (its ?hinterland override): the worker selects the same block. */
  search: string;
  tier: 'desktop' | 'mobile';
}

export type HinterlandJob = HinterlandRequest & { id: number };
export type HinterlandReply =
  | { id: number; ok: true; wire: HinterlandWire; ms: number }
  | { id: number; ok: false; message: string };

/** The Hinterland for a request, packed (the worker's handler; a receipt calls it in process). */
export function buildHinterlandWire(request: HinterlandRequest): { wire: HinterlandWire; transfer: ArrayBuffer[] } {
  const cfg = withSelectedHinterland(worldBuildConfig(request.mapId, request.terrainVariant), request.search);
  const spec = resolveHinterlandSpec(cfg, request.tier);
  if (!spec) throw new Error(`hinterland: ${request.mapId} has no block for ${request.search || 'production'}`);
  const field = createHeightField(request.fieldSeed, cfg);
  const build = buildHinterland(spec, 1337, field, { tier: request.tier });
  const t0 = performance.now();
  const woods: Uint8Array[] = [];
  const surface = bakeHinterlandSurface(build.field, build.pyramid.levels, { woodsOut: woods, bases: build.bases });
  // the trees on the land before the woods' canopy rises: the plan's, and the woods' own where impostors can draw them
  const groundAt = (x: number, z: number): number => samplePyramid(build.pyramid, x, z);
  const trees: HinterlandGroundedTree[] = build.plan.trees.map((t) => ({ ...t, y: groundAt(t.x, t.z) }));
  if (request.tier !== 'mobile') {
    // (the woods keep the sightlines' long views open too, as the plan's rows do: outland.ts sightlineBlocker)
    const blocks = sightlineBlocker(build.plan.settlements, groundAt);
    const open = (t: { x: number; z: number; heightM: number; crownM: number }): boolean => !blocks || !blocks(t);
    trees.push(...plantHinterlandWoods(build.field, build.pyramid.levels, woods, groundAt, { withinM: HINTERLAND_NEAR_TREE_M }).filter(open));
  }
  // (the woods stand as a canopy over the land: the drawn heights rise by it, after the surface read their slopes; under
  // the woods' own trees it is their under-storey)
  raiseHinterlandCanopy(build.pyramid.levels, woods, spec.region.vegetation.canopyM, 1337, { treesWithinM: request.tier !== 'mobile' ? HINTERLAND_NEAR_TREE_M : 0 });
  build.ms.surface = performance.now() - t0;
  // the outland's buildings, verticals and trees on the drawn land (the page only wraps the arrays)
  const outland = buildHinterlandOutlandGeometry(build.plan, build.pyramid, spec.kit, trees);
  build.ms.outland = outland.stats.ms;
  build.ms.total += build.ms.surface + build.ms.outland;
  return packHinterlandPlan(build, surface, outland, trees);
}

declare const self: {
  onmessage: ((event: MessageEvent<HinterlandJob>) => void) | null;
  postMessage(reply: HinterlandReply, transfer?: ArrayBuffer[]): void;
};

if (typeof window === 'undefined' && typeof self !== 'undefined' && typeof (self as { postMessage?: unknown }).postMessage === 'function') {
  self.onmessage = ({ data }) => {
    const started = performance.now();
    try {
      const { wire, transfer } = buildHinterlandWire(data);
      self.postMessage({ id: data.id, ok: true, wire, ms: Math.round(performance.now() - started) }, transfer);
    } catch (error) {
      self.postMessage({ id: data.id, ok: false, message: error instanceof Error ? error.message : 'Hinterland failed' });
    }
  };
}
