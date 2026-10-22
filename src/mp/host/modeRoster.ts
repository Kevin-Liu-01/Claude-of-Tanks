import { matchRulesetFor, type TeamArrangement } from '../../sim/matchRuleset.ts';
import { normalizeGameMode } from '../../sim/matchModes.ts';
import { planRoomBots, type PlanBot } from '../room/roomBots.ts';
interface Seat { playerId: string; team: 'alpha' | 'bravo' | 'spectator'; specId: string }
/**
 * Asymmetric modes seal one unambiguous role allocation before authority spawn and WELCOME: the room's bot planner
 * (room/roomBots.ts planRoomBots) seats them, TEAM NATIONS included; other modes leave `bots` as they are.
 */
export function arrangeModeRoster<S extends Seat>(mode: string, arrangement: TeamArrangement | null | undefined, seats: S[], bots: PlanBot[], seed = 0): void {
  const rules = matchRulesetFor(normalizeGameMode(mode), null, arrangement ?? null);
  if (!rules.juggernaut && !rules.infection && rules.aerial !== 'gunship') return;
  if (!seats.some((seat) => seat.team !== 'spectator')) return;
  planRoomBots({ gameMode: mode, arrangement, teamSize: 0, botsFill: false }, seats, bots, seed);
}
