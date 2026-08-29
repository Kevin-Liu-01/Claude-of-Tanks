// Shared garage/matchmaking eligibility and pure candidate ordering.
//
// The vehicle registry intentionally contains legacy, QA and generic-source
// entries that remain useful to the tech tree and developer tools. They are
// not part of the curated production garage or its bot roster. Keeping both
// predicates here prevents local development mode from widening live matches.

import {
  DEV_FLEET_ACTIVE,
  PRODUCTION_HIDDEN_TANK_IDS,
} from '../vehicles/rosterPolicy.ts';
import { BOT_TANK_IDS } from '../vehicles/specs.js';

// Compatibility export for existing tests/tools. The policy itself lives with
// the vehicle registry so every carousel and battle path shares one source.
export const GARAGE_HIDDEN_TANK_IDS = PRODUCTION_HIDDEN_TANK_IDS;

export interface MatchCandidate {
  specId: string;
  spec?: { era?: string | null } | null;
}

export const isGarageVisibleTankId = (id: unknown): id is string =>
  typeof id === 'string' && (DEV_FLEET_ACTIVE || !GARAGE_HIDDEN_TANK_IDS.has(id));

/** Every vehicle exposed by the production catalog is eligible for bot seats. */
export const isBotTankId = (id: unknown): id is string =>
  typeof id === 'string' && BOT_TANK_IDS.includes(id);

/**
 * Curate a pre-shuffled entity pool for a player match.
 *
 * Same-era vehicles always rank ahead of cross-era fallbacks. Within an era,
 * the seeded shuffle remains authoritative so every production vehicle can
 * eventually reach a bot seat. Team assignment balances the resulting tiers.
 * Development and reference-only records remain barred.
 */
export function rankMatchCandidates<T extends MatchCandidate>(
  candidates: readonly (T | null | undefined)[] | null | undefined,
  player: T,
): T[] {
  const playerEra = player?.spec?.era ?? null;
  return (candidates || [])
    .filter((ent): ent is T =>
      !!ent && ent !== player && isBotTankId(ent.specId))
    .map((ent, shuffleIndex) => ({
      ent,
      shuffleIndex,
      sameEra: !playerEra || (ent.spec && ent.spec.era === playerEra),
    }))
    .sort((a, b) =>
      (a.sameEra === b.sameEra ? 0 : a.sameEra ? -1 : 1) ||
      (a.shuffleIndex - b.shuffleIndex))
    .map((row) => row.ent);
}
