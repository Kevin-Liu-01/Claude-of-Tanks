// The horizon ring worker (2026-10-08, the time-to-battle lane; the owner: "going into games takes a long time"): the
// ring's geometry pipeline (maps/horizon.ts horizonRingGeometrySteps — the seating, the massifs, the escarpments, the
// continued ground, the relief bake, the colours: about 85 % of the ring's build and over a third of the terrain stage)
// run off the main thread while the terrain's chunks build there. The same config (worldBuildConfig), the same height
// field (createHeightField, the generator the page's build drains), the same function: the same arrays, transferred.
import { horizonRingGeometrySteps } from './maps/horizon.ts';
import { packHorizonRing, type HorizonRingWire } from './horizonRingWire.ts';
import { createHeightField } from './terrain.ts';
import { worldBuildConfig } from './worldBuildConfig.ts';

/** The ring a world build asks for: its map and variant, the height field's seed, the ring's seed, the tier's vista. */
export interface HorizonRingRequest {
  mapId: string;
  terrainVariant: string | null;
  fieldSeed: number;
  ringSeed: number;
  vista: boolean;
  debugColors: boolean;
}

export type HorizonRingJob = HorizonRingRequest & { id: number };

export type HorizonRingReply =
  | { id: number; ok: true; wire: HorizonRingWire; ms: number }
  | { id: number; ok: false; message: string };

/** The pipeline for a request, packed (the worker's handler; a receipt calls it in process). */
export function buildHorizonRingWire(request: HorizonRingRequest): { wire: HorizonRingWire; transfer: ArrayBuffer[] } {
  const cfg = worldBuildConfig(request.mapId, request.terrainVariant);
  const field = createHeightField(request.fieldSeed, cfg);
  const steps = horizonRingGeometrySteps(cfg, request.ringSeed, field, { vista: request.vista, debugColors: request.debugColors });
  let step = steps.next();
  while (!step.done) step = steps.next();
  return packHorizonRing(step.value);
}

declare const self: {
  onmessage: ((event: MessageEvent<HorizonRingJob>) => void) | null;
  postMessage(reply: HorizonRingReply, transfer?: ArrayBuffer[]): void;
};

// (a worker scope, or a receipt's stand-in `self`: never a page, whose window would take the handler)
if (typeof window === 'undefined' && typeof self !== 'undefined' && typeof (self as { postMessage?: unknown }).postMessage === 'function') {
  self.onmessage = ({ data }) => {
    const started = performance.now();
    try {
      const { wire, transfer } = buildHorizonRingWire(data);
      self.postMessage({ id: data.id, ok: true, wire, ms: Math.round(performance.now() - started) }, transfer);
    } catch (error) {
      self.postMessage({ id: data.id, ok: false, message: error instanceof Error ? error.message : 'Horizon ring failed' });
    }
  };
}
