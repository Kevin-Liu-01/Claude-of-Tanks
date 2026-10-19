/**
 * ambientRounds.ts — rounds in flight that are not shells (lane ac130-fx-228 r2, 2026-10-19; the owner: "get rid of the
 * old ones we dont want to use the old ones anymore").
 *
 * The frontline backdrop's AA guns (world/frontlineAtmosphere.ts) fire presentation-only rounds that no authority
 * tracks. They used to draw through a September tracer shader of their own; now their source registers here and the
 * effects runtime draws its rounds each frame through the projectile tracers (projectileTracers.ts `ambient`), the one
 * tracer look of the game. Pure: no three, no DOM; one source at a time (one battle's backdrop).
 */

/** One round this frame: its head (world m), its unit direction, its speed (m/s), how far it has flown from its muzzle
 *  (m), its strength (0..1: its own burn-out) and whether it is Soviet-lineage ammunition (a green-yellow trace). */
export type AmbientRoundDraw = (hx: number, hy: number, hz: number, dx: number, dy: number, dz: number, speedMps: number,
  travelledM: number, k: number, east: boolean) => void;

interface AmbientRoundSource {
  /** draw every round in flight now through `draw` (no allocation: the caller hoists `draw`) */
  drawRounds(draw: AmbientRoundDraw): void;
}

let current: AmbientRoundSource | null = null;

/** Register the backdrop's rounds (null: none); returns the unregister, which leaves a later source in place. */
export function setAmbientRoundSource(source: AmbientRoundSource | null): () => void {
  current = source;
  return () => { if (current === source) current = null; };
}

/** The registered source, if any (the effects runtime's frame). */
export function ambientRoundSource(): AmbientRoundSource | null {
  return current;
}
