/**
 * The ruleset a room's match plays by (lane mp/ui-sync-check, 2026-09-30): the room's game mode bent by the
 * arrangement its admin chose — sides, wave size and step, enemy nation, score target, respawn, Mars gravity and
 * caches — and, for a Frontline room, the campaign operation's clock and difficulty. It is the table the lobby's
 * rule card promises (`playMenu.ts` ruleLineCopy → `matchRulesetFor(mode, null, arrangement)`) and the one solo play
 * applies (`game/state.ts`). Until this module the browser host and the LAN helper's in-process match booted
 * `matchRulesetFor(mode)` alone: a lobby's "First to 100" played to 750, a Horde room's wave size and enemy
 * nation were ignored. Pure and DOM-free; the host Worker chunk imports it.
 */
import { matchRulesetFor, normalizeTeamArrangement } from '../../sim/matchRuleset.ts';
import type { MatchRuleset, TeamArrangement } from '../../sim/matchRuleset.ts';
import { normalizeGameMode } from '../../sim/matchModes.ts';
import { campaignRulesetInput } from '../../game/campaignOperations.ts';

/** The match ruleset for a room's mode, arrangement and campaign operation (unknown values fall back to the mode's own table). */
export function hostRulesetFor(mode: unknown, arrangement: TeamArrangement | null | undefined, campaignOperationId: string | null | undefined): MatchRuleset {
  const id = normalizeGameMode(mode);
  const campaign = id === 'frontline_assault' ? campaignRulesetInput(campaignOperationId ?? null) : null;
  return matchRulesetFor(id, campaign, normalizeTeamArrangement(id, arrangement ?? null));
}
