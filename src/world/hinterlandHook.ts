// src/world/hinterlandHook.ts — where a terrain build takes the Hinterland from (HL-3, the horizons stream, 2026-10-13;
// B-architecture §7.1). Import-free, as horizonRingHook.ts is: terrain.ts is in the match host Worker's static graph
// (createHeightField), and the Hinterland is client-only visual (hostFleet.selftest fences src/world/hinterland/ out).
// The world build (map.ts) supplies the Hinterland it started in its worker when the map migrates (its file's block, or
// a lab draft under ?hinterland=1); the terrain build then builds it in place of the old ring, last, as it does the ring.

/** What a terrain build hands the Hinterland's builder. */
export interface HinterlandBuildContext {
  /** The engine context (lights, cascades, the renderer). */
  engineCtx: unknown;
  /** The battlefield's height field. */
  heightField: unknown;
  /** The battlefield's ground (its splat sheets, their means and the road tint), carried on past the edge (horizons-240). */
  ground?: unknown;
}

export interface HinterlandSupply {
  readonly request: { readonly mapId: string; readonly terrainVariant: string | null };
  /** The worker has not answered yet. */
  readonly pending: boolean;
  /**
   * Build the Hinterland's scene object (a group that fills when the worker's answer is in, so the battle never waits
   * for it). Yields between its slices; returns the group.
   */
  buildSteps(context: HinterlandBuildContext): Generator<void, unknown, void>;
}

/**
 * One supply a map and trench variant (battle-spikes-253): a world build that starts while another runs supplies its own
 * beside the other's. A single slot handed the later build's to both, and the earlier migrated map's terrain build,
 * finding none of its own, built the old ring in its Hinterland's place (horizonRingHook.ts, the same law).
 */
const supplied = new Map<string, HinterlandSupply>();
const supplyKey = (mapId: string | undefined, trenches: boolean): string => `${mapId}|${trenches}`;

/** The world build's supply (null withdraws every supply). */
export function supplyHinterland(supply: HinterlandSupply | null): void {
  if (!supply) { supplied.clear(); return; }
  supplied.set(supplyKey(supply.request.mapId, supply.request.terrainVariant === 'assault-trenches'), supply);
}

/** Withdraw a supply when its world build ends — only if it is still the one supplied. */
export function withdrawHinterland(supply: HinterlandSupply): void {
  const key = supplyKey(supply.request.mapId, supply.request.terrainVariant === 'assault-trenches');
  if (supplied.get(key) === supply) supplied.delete(key);
}

/** The supply for a terrain build of this config (its map and trench variant), else null: the old ring. */
export function hinterlandSupplyFor(cfg: { readonly id?: string; readonly assaultTrenches?: boolean } | null): HinterlandSupply | null {
  return cfg ? supplied.get(supplyKey(cfg.id, !!cfg.assaultTrenches)) ?? null : null;
}
