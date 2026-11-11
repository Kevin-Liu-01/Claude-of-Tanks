// src/world/hinterlandHook.ts — where a terrain build takes the Hinterland from (HL-3, the horizons stream, 2026-10-13;
// B-architecture §7.1). Import-free, as horizonRingHook.ts is: terrain.ts is in the match host Worker's static graph
// (createHeightField), and the Hinterland is client-only visual (hostFleet.selftest fences src/world/hinterland/ out).
// The world build (map.ts) supplies the Hinterland it started in its worker when the map migrates (its file's block, or
// a lab draft under ?hinterland=1); the terrain build then builds it in place of the old ring, last, as it does the ring.
// (2026-11-02 audit R1) The build hands its supply to its own terrain build (TerrainStreamOptions.hinterlandSupply): the
// process-wide slot keyed by map and trench variant handed one build's Hinterland to another build of the same map.

/** What a terrain build hands the Hinterland's builder. */
export interface HinterlandBuildContext {
  /** The engine context (lights, cascades, the renderer). */
  engineCtx: unknown;
  /** The battlefield's height field. */
  heightField: unknown;
  /** The battlefield's ground (its splat sheets, their means and the road tint), carried on past the edge (horizons-240). */
  ground?: unknown;
  /**
   * (2026-11-02 audit R1) The old ring in the land's place, built if the worker fails after the root was handed over (a
   * failure known before then never reaches the land: the terrain builds the ring itself).
   */
  fallback?: () => Iterator<unknown, unknown, void>;
}

export interface HinterlandSupply {
  readonly request: { readonly mapId: string; readonly terrainVariant: string | null };
  /** The worker has not answered yet. */
  readonly pending: boolean;
  /** The worker failed: no land will come (the terrain builds the old ring instead). */
  readonly failed: boolean;
  /**
   * Build the Hinterland's scene object (a group that fills when the worker's answer is in, so the battle never waits
   * for it). Yields between its slices; returns the group.
   */
  buildSteps(context: HinterlandBuildContext): Generator<void, unknown, void>;
}
