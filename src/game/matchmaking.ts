// Shared garage/matchmaking eligibility and pure candidate ordering.
//
// The vehicle registry intentionally contains legacy, QA and generic-source
// entries that remain useful to the tech tree and developer tools. They are
// not part of the curated garage carousel and must never leak into a normal
// player match. Keeping the exclusion policy here gives the garage and the
// battle picker one source of truth.

import {
  DEV_FLEET_ACTIVE,
  PRODUCTION_HIDDEN_TANK_IDS,
} from '../vehicles/rosterPolicy.js';

// Compatibility export for existing tests/tools. The policy itself lives with
// the vehicle registry so every carousel and battle path shares one source.
export const GARAGE_HIDDEN_TANK_IDS = PRODUCTION_HIDDEN_TANK_IDS;

export interface MatchCandidate {
  specId: string;
  spec?: { era?: string | null } | null;
}

export const isGarageVisibleTankId = (id: unknown): id is string =>
  typeof id === 'string' && (DEV_FLEET_ACTIVE || !GARAGE_HIDDEN_TANK_IDS.has(id));

/**
 * Curate a pre-shuffled entity pool for a player match.
 *
 * Same-era vehicles always rank ahead of cross-era fallbacks. Within an era,
 * the closest tier ranks first; stable sort preserves the seeded shuffle for
 * equally suitable candidates, so successive battles still feel varied.
 * Hidden/non-garage registry entries are removed before ranking.
 */
export function rankMatchCandidates<T extends MatchCandidate>(
  candidates: readonly (T | null | undefined)[] | null | undefined,
  player: T,
  tierOf: (specId: string) => number,
): T[] {
  const playerEra = player?.spec?.era ?? null;
  const playerTier = tierOf(player.specId);
  return (candidates || [])
    .filter((ent): ent is T =>
      !!ent && ent !== player && isGarageVisibleTankId(ent.specId))
    .map((ent, shuffleIndex) => ({
      ent,
      shuffleIndex,
      sameEra: !playerEra || (ent.spec && ent.spec.era === playerEra),
      tierDelta: Math.abs(tierOf(ent.specId) - playerTier),
    }))
    .sort((a, b) =>
      (a.sameEra === b.sameEra ? 0 : a.sameEra ? -1 : 1) ||
      (a.tierDelta - b.tierDelta) ||
      (a.shuffleIndex - b.shuffleIndex))
    .map((row) => row.ent);
}
