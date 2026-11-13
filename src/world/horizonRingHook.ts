// The horizon ring that terrain meshes are built with. maps/horizon.ts installs itself here when it loads, so
// terrain.ts never imports it: the authority's height field (createHeightField in the match host Worker and the
// dedicated server) would otherwise carry the whole visual horizon, its border farmsteads and every regional building
// kit (2026-10-08: 1.9 MB of the host Worker's 7.07 MB; hostFleet.selftest). map.ts, the visual world, imports the
// horizon before it builds terrain; a receipt that builds terrain meshes imports it the same way.
import type { buildHorizonRingSteps, horizonRingGeometrySteps, HorizonRingPipeline } from './maps/horizon.ts';

export interface HorizonRing {
  readonly HORIZON_SEGMENTS: number;
  readonly buildHorizonRingSteps: typeof buildHorizonRingSteps;
  /** The ring's geometry pipeline (2026-10-08, the time-to-battle lane): what the ring worker runs off the page. */
  readonly horizonRingGeometrySteps: typeof horizonRingGeometrySteps;
}

let installed: HorizonRing | null = null;

export function installHorizonRing(ring: HorizonRing): void {
  installed = ring;
}

export function horizonRing(): HorizonRing {
  if (!installed) throw new Error('terrain meshes need the horizon ring: import src/world/maps/horizon.ts before building them');
  return installed;
}

/**
 * The ring's pipeline computed away from the terrain build (2026-10-08, the time-to-battle lane): the horizon ring
 * worker's, or the kept ring of a rematch on the same map (horizonRingPrefetch.ts startHorizonRingBuild). The world
 * build (map.ts) hands it to its own terrain build (TerrainStreamOptions.horizonRingSupply); without one the terrain
 * builds the ring where it stands. (2026-11-02 audit R1: a process-wide slot keyed by map and trench variant handed one
 * build's ring to another build of the same map, receipts and a cancel-and-rebuild that skipped the predecessor wait.)
 */
export interface HorizonRingSupply {
  readonly request: { readonly mapId: string; readonly terrainVariant: string | null; readonly vista: boolean; readonly debugColors: boolean };
  /** The worker has not answered yet. */
  readonly pending: boolean;
  /** Resolves once the worker has answered, failed or been disposed; never rejects. */
  settled(): Promise<void>;
  /** The pipeline, once; null when there is none (build it where it stands). */
  take(): HorizonRingPipeline | null;
  /** Keep a pipeline built where it stood for a rematch. */
  remember(pipeline: HorizonRingPipeline): void;
}
