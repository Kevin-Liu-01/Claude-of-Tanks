// The matchmaking tier: the solo battle's tier-balanced sides (game/state.ts), the roster planner's tier targets
// (game/rosterState.ts, sim/teamNations.ts through the nation index) and the fleet balance audit read it.
// Owner 2026-10-26 (258, after the approved 257 capability re-tier): matchmaking follows the tier the game shows, each
// vehicle's column in its national tree (src/techTree/tiers.ts, generated with the trees), so a tank fights at the tier it
// shows. The separate matchmaking table this file held until 257 is in git history (release 251: da91dae207).

import { displayTier } from '../techTree/tiers.ts';

/** Numeric matchmaking tier: the shown tier; a developer row no tree draws defaults to VI. */
export function tankTier(id: string): number {
  return displayTier(id) || 6;
}
