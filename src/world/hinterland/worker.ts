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
import { packHinterlandPlan, type HinterlandWire } from './wire.ts';
import { bakeHinterlandSurface } from './surface.ts';

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
  const surface = bakeHinterlandSurface(build.field, build.pyramid.levels);
  build.ms.surface = performance.now() - t0;
  build.ms.total += build.ms.surface;
  return packHinterlandPlan(build, surface);
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
