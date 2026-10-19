/**
 * soloRosterPlan.ts — the loading plan's view of a sortie: which spec nations the enemy side fills from
 * first, how many non-player seats the battle fields and how TEAM NATIONS seats them. Pure ruleset/campaign/arrangement
 * reads, so the garage composition root (main.ts planRoster / planCamoOverrides) can plan a roster without statically
 * importing the solo battle authority (docs/SYSTEMS.md boot contract, tools/boot-static-closure.selftest.mjs).
 * game/state.ts seats the battle from the same plan.
 */
import { normalizeGameMode } from '../sim/matchModes.ts';
import { isWaveMode, matchRulesetFor, rulesetAllyCap, type MatchRuleset } from '../sim/matchRuleset.ts';
import { isCountryId, type CountryId } from '../sim/teamNations.ts';
import { campaignEnemyNations, campaignOperationById, campaignRulesetInput } from './campaignOperations.ts';
import { enemyNationSpecNations, readTeamArrangement } from './teamArrangement.ts';

/** Spec nations the enemy side fills from first: the operation's formation, else the arranged nation (MONO only). */
export function battleEnemyNations(ruleset: MatchRuleset, campaignOperationId: string | null | undefined): readonly string[] {
  const campaign = campaignEnemyNations(campaignOperationId);
  if (campaign.length) return campaign;
  return ruleset.teamNations === 'random' ? [] : enemyNationSpecNations(ruleset.enemyNation);
}

/**
 * MONO-NATION's seats (sim/teamNations.ts pickNationalSides): the allied bots and the enemy seats, the operation's
 * country (the story fixes it) and the arranged enemy country (null: AUTO).
 */
export interface SoloNationalPlan {
  readonly alliedSeats: number;
  readonly enemySeats: number;
  readonly campaignEnemy: CountryId | null;
  readonly arrangedEnemy: CountryId | null;
}

/** What the roster picker does with a battle's nations: MONO's plan, RANDOM ('random'), or the legacy pool (null). */
export type SoloNationalMode = SoloNationalPlan | 'random' | null;

/** How many non-player vehicles a battle fields, how many seats the formation leads with, and the TEAM NATIONS plan. */
export function battleRosterPlan(
  ruleset: MatchRuleset,
  campaignOperationId: string | null | undefined,
  randomBattle: boolean,
): { nations: readonly string[]; slots: number | null; formationLead: number | null; national: SoloNationalMode } {
  const nations = battleEnemyNations(ruleset, campaignOperationId);
  // team arrangement (2026-09-15): the co-op modes size their own field — allied bots plus the enemy pool
  // sides (2026-09-18): the symmetric modes field both sides at once and the tier-balanced split seats
  // them; only the wave modes keep exactly `enemies` seats for the named nation
  const sized = randomBattle && ruleset.allies != null && ruleset.enemies != null;
  const slots = sized ? ruleset.allies! + ruleset.enemies! : null;
  const formationLead = sized && isWaveMode(ruleset.mode) ? ruleset.enemies : null;
  let national: SoloNationalMode = null;
  if (randomBattle) {
    if (ruleset.teamNations === 'random') national = 'random';
    else {
      const field = slots ?? 13;
      const alliedSeats = Math.min(rulesetAllyCap(ruleset, 6), Math.max(0, field - 1));
      const operation = campaignOperationById(campaignOperationId);
      national = Object.freeze({
        alliedSeats, enemySeats: Math.max(1, field - alliedSeats),
        campaignEnemy: operation && isCountryId(operation.enemy) ? operation.enemy : null,
        arrangedEnemy: isCountryId(ruleset.enemyNation) ? ruleset.enemyNation : null,
      });
    }
  }
  return { nations, slots, formationLead, national };
}

/** The loading plan's view of a sortie (main.ts planRoster / planCamoOverrides), from the stored arrangement. */
export function soloRosterPlan(gameMode: string | null | undefined, campaignOperationId: string | null | undefined, randomBattle = true) {
  const mode = normalizeGameMode(gameMode);
  const ruleset = matchRulesetFor(mode, campaignRulesetInput(campaignOperationId), readTeamArrangement(mode));
  return battleRosterPlan(ruleset, campaignOperationId, randomBattle);
}
