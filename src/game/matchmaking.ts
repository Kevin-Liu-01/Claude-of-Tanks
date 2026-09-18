import type { RuntimeValue } from '../runtimeTypes.ts';
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
import { PRODUCTION_TANK_IDS } from '../vehicles/specs.ts';

// Compatibility export for existing tests/tools. The policy itself lives with
// the vehicle registry so every carousel and battle path shares one source.
export const GARAGE_HIDDEN_TANK_IDS = PRODUCTION_HIDDEN_TANK_IDS;

interface MatchCandidate {
  specId: string;
  spec?: { era?: string | null } | null;
}

/** Eras a roster may draw from around the player's: contemporaries only, never WW2 against modern. Campaign
 * formations (2026-09-14) and ordinary matchmaking (diversity r2, 2026-09-18) share the one table. */
export const ERA_NEIGHBOURS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  ww2: Object.freeze(['ww2']),
  'cold-war': Object.freeze(['cold-war', 'modern']),
  modern: Object.freeze(['modern', 'cold-war', 'next-generation']),
  'next-generation': Object.freeze(['next-generation', 'modern']),
});

export const isGarageVisibleTankId = (id: RuntimeValue): id is string =>
  typeof id === 'string' && (DEV_FLEET_ACTIVE || !GARAGE_HIDDEN_TANK_IDS.has(id));

/** Every vehicle exposed by the production catalog is eligible for bot seats. */
export const isBotTankId = (id: RuntimeValue): id is string =>
  typeof id === 'string' && PRODUCTION_TANK_IDS.includes(id);

/**
 * Curate a pre-shuffled entity pool for a player match.
 *
 * Fresh same-era vehicles rank first, then fresh vehicles of the player's
 * contemporary eras (`ERA_NEIGHBOURS`), then the vehicles that fought the last
 * two battles (`recent`) in the same order, and far eras always trail — so a
 * roster only repeats a vehicle once both catalogs are used up, and WW2 never
 * meets modern (matchmaking diversity r2, owner 2026-09-17/18: the eighteen other
 * next-generation hulls alone cannot fill thirteen seats twice, so a
 * next-generation player used to meet the same eighteen tanks forever). The
 * seeded shuffle remains authoritative inside each band so every production
 * vehicle can eventually reach a bot seat. Team assignment balances the
 * resulting tiers. Development and reference-only records remain barred.
 */
export function rankMatchCandidates<T extends MatchCandidate>(
  candidates: readonly (T | null | undefined)[] | null | undefined,
  player: T,
  recent: ReadonlySet<string> | null = null,
): T[] {
  const playerEra = player?.spec?.era ?? null;
  const neighbours = playerEra ? (ERA_NEIGHBOURS[playerEra] ?? [playerEra]) : null;
  // 0 = the player's era, 1 = a contemporary era, 2 = any other era
  const bandOf = (era: string | null | undefined): number =>
    !playerEra || era === playerEra ? 0 : era && neighbours!.includes(era) ? 1 : 2;
  return (candidates || [])
    .filter((ent): ent is T =>
      !!ent && ent !== player && isBotTankId(ent.specId))
    .map((ent, shuffleIndex) => {
      const band = bandOf(ent.spec?.era ?? null);
      const isRecent = !!recent && recent.has(ent.specId);
      // fresh own era 0 < fresh contemporary 1 < recent own era 2 < recent contemporary 3 < far eras 4/5
      return { ent, shuffleIndex, rank: band === 2 ? (isRecent ? 5 : 4) : band + (isRecent ? 2 : 0) };
    })
    .sort((a, b) => (a.rank - b.rank) || (a.shuffleIndex - b.shuffleIndex))
    .map((row) => row.ent);
}
