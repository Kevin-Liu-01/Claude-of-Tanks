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
 * build (map.ts) supplies it for its own build and withdraws it when the build ends; the terrain build takes it here,
 * so the hook is the one place the ring comes from — supplied, or built where it stands.
 */
interface HorizonRingSupply {
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

let supplied: HorizonRingSupply | null = null;

/** The world build's supply for the terrain build it runs (null withdraws it). */
export function supplyHorizonRing(supply: HorizonRingSupply | null): void {
  supplied = supply;
}

/** Withdraw a supply when its world build ends — only if it is still the one supplied (a later build's stays). */
export function withdrawHorizonRing(supply: HorizonRingSupply): void {
  if (supplied === supply) supplied = null;
}

/** The supply for a terrain build of this config (its map and its trench variant), else null. */
export function horizonRingSupplyFor(cfg: { readonly id?: string; readonly assaultTrenches?: boolean } | null): HorizonRingSupply | null {
  if (!supplied || !cfg) return null;
  const { mapId, terrainVariant } = supplied.request;
  return mapId === cfg.id && (terrainVariant === 'assault-trenches') === !!cfg.assaultTrenches ? supplied : null;
}
