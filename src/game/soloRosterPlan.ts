/**
 * soloRosterPlan.ts — the loading plan's view of a sortie: which spec nations the enemy side fills from
 * first and how many non-player seats the battle fields. Pure ruleset/campaign/arrangement reads, so the
 * garage composition root (main.ts planRoster / planCamoOverrides) can plan a roster without statically
 * importing the solo battle authority (docs/SYSTEMS.md boot contract, tools/boot-static-closure.selftest.mjs).
 * game/state.ts seats the battle from the same plan.
 */
import { normalizeGameMode } from '../sim/matchModes.ts';
import { isWaveMode, matchRulesetFor, type MatchRuleset } from '../sim/matchRuleset.ts';
import { campaignEnemyNations, campaignRulesetInput } from './campaignOperations.ts';
import { enemyNationSpecNations, readTeamArrangement } from './teamArrangement.ts';

/** Spec nations the enemy side fills from first: the operation's formation, else the arranged nation. */
export function battleEnemyNations(ruleset: MatchRuleset, campaignOperationId: string | null | undefined): readonly string[] {
  const campaign = campaignEnemyNations(campaignOperationId);
  return campaign.length ? campaign : enemyNationSpecNations(ruleset.enemyNation);
}

/** How many non-player vehicles a battle fields and how many seats the formation leads with. */
export function battleRosterPlan(
  ruleset: MatchRuleset,
  campaignOperationId: string | null | undefined,
  randomBattle: boolean,
): { nations: readonly string[]; slots: number | null; formationLead: number | null } {
  const nations = battleEnemyNations(ruleset, campaignOperationId);
  // team arrangement (2026-09-15): the co-op modes size their own field — allied bots plus the enemy pool
  // sides (2026-09-18): the symmetric modes field both sides at once and the tier-balanced split seats
  // them; only the wave modes keep exactly `enemies` seats for the named nation
  if (randomBattle && ruleset.allies != null && ruleset.enemies != null) {
    return { nations, slots: ruleset.allies + ruleset.enemies, formationLead: isWaveMode(ruleset.mode) ? ruleset.enemies : null };
  }
  return { nations, slots: null, formationLead: null };
}

/** The loading plan's view of a sortie (main.ts planRoster / planCamoOverrides), from the stored arrangement. */
export function soloRosterPlan(gameMode: string | null | undefined, campaignOperationId: string | null | undefined, randomBattle = true) {
  const mode = normalizeGameMode(gameMode);
  const ruleset = matchRulesetFor(mode, campaignRulesetInput(campaignOperationId), readTeamArrangement(mode));
  return battleRosterPlan(ruleset, campaignOperationId, randomBattle);
}
