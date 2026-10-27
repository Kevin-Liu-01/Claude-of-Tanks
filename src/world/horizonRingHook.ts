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

/**
 * One supply a map and trench variant (battle-spikes-253): a world build that starts while another runs (the Garage's
 * background build and a deploy's battle map) supplies its own beside the other's. A single slot handed the later build's
 * ring to both, and the earlier terrain build, finding no ring of its own, built it on the page (nav-perf's phone Garage
 * sweep: 100-376 ms steps on deploy).
 */
const supplied = new Map<string, HorizonRingSupply>();
const supplyKey = (mapId: string | undefined, trenches: boolean): string => `${mapId}|${trenches}`;

/** The world build's supply for the terrain build it runs (null withdraws every supply). */
export function supplyHorizonRing(supply: HorizonRingSupply | null): void {
  if (!supply) { supplied.clear(); return; }
  supplied.set(supplyKey(supply.request.mapId, supply.request.terrainVariant === 'assault-trenches'), supply);
}

/** Withdraw a supply when its world build ends — only if it is still the one supplied (a later build's stays). */
export function withdrawHorizonRing(supply: HorizonRingSupply): void {
  const key = supplyKey(supply.request.mapId, supply.request.terrainVariant === 'assault-trenches');
  if (supplied.get(key) === supply) supplied.delete(key);
}

/** The supply for a terrain build of this config (its map and its trench variant), else null. */
export function horizonRingSupplyFor(cfg: { readonly id?: string; readonly assaultTrenches?: boolean } | null): HorizonRingSupply | null {
  return cfg ? supplied.get(supplyKey(cfg.id, !!cfg.assaultTrenches)) ?? null : null;
}
