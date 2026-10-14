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

let supplied: HinterlandSupply | null = null;

/** The world build's supply (null withdraws it). */
export function supplyHinterland(supply: HinterlandSupply | null): void {
  supplied = supply;
}

/** Withdraw a supply when its world build ends — only if it is still the one supplied. */
export function withdrawHinterland(supply: HinterlandSupply): void {
  if (supplied === supply) supplied = null;
}

/** The supply for a terrain build of this config (its map and trench variant), else null: the old ring. */
export function hinterlandSupplyFor(cfg: { readonly id?: string; readonly assaultTrenches?: boolean } | null): HinterlandSupply | null {
  if (!supplied || !cfg) return null;
  const { mapId, terrainVariant } = supplied.request;
  return mapId === cfg.id && (terrainVariant === 'assault-trenches') === !!cfg.assaultTrenches ? supplied : null;
}
