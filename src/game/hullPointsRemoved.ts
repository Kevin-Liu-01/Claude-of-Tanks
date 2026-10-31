/** A resolved hit's damage as every readout and total counts it; no fleet or UI imports. */
export interface HullPointsHit {
  /** The hull points the target lost to the hit (sim/damage.ts settleHullPoints, carried over the wire as is). */
  readonly hpRemoved?: number;
  readonly damage?: number;
}
/**
 * The damage a hit dealt: the hull points its target lost to it, its points before less its points after (owner
 * 2026-10-31, "the amount u took off the enemy"), so a kill reads what the hull had left and never the roll past it.
 * The sim stamps it where the hit resolves; nothing here works it out. A staged event with no hpRemoved (the Studio's,
 * the HUD editor's preview) reads as its damage.
 */
export function hullPointsRemoved(hit: HullPointsHit): number {
  const value = hit.hpRemoved ?? hit.damage;
  return Number.isFinite(value) ? Math.max(0, value!) : 0;
}
