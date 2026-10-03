import { matchRulesetFor, type MatchRuleset, type TeamArrangement } from '../../sim/matchRuleset.ts';
import { normalizeGameMode } from '../../sim/matchModes.ts';
interface Seat { playerId: string; team: 'alpha' | 'bravo' | 'spectator'; specId: string }
interface Bot { playerId: string; name: string; team: 'alpha' | 'bravo'; specId: string }
/** Asymmetric modes seal one unambiguous role allocation before authority spawn and WELCOME. */
export function arrangeModeRoster<S extends Seat>(mode: string, arrangement: TeamArrangement | null | undefined, seats: S[], bots: Bot[]): void {
  const rules = matchRulesetFor(normalizeGameMode(mode), null, arrangement ?? null);
  if (!rules.juggernaut && !rules.infection && rules.aerial !== 'gunship') return;
  const players = seats.filter(seat => seat.team !== 'spectator');
  if (!players.length) return;
  bots.length = 0;
  const bossPlayer = rules.juggernaut?.team === 'alpha' ? players[0] : null;
  for (const seat of players) seat.team = bossPlayer ? (seat === bossPlayer ? 'alpha' : 'bravo') : 'alpha';
  const { hostile: count, friendly: friendlyCount } = modeBotCounts(rules, !!bossPlayer, players.length);
  for (let i = 0; i < Math.min(Math.max(0,42 - players.length - friendlyCount), count); i++) bots.push({
    playerId: `mode-bravo-${i}`, name: rules.juggernaut && !bossPlayer ? 'Juggernaut' : rules.infection ? 'Patient Zero' : `Hostile ${i + 1}`,
    team: 'bravo', specId: players[i % players.length]!.specId,
  });
  const friendlySlots = Math.min(42 - players.length - bots.length, friendlyCount);
  for (let i = 0; i < friendlySlots; i++) bots.push({
    playerId: `mode-alpha-${i}`, name: `Ally ${i + 1}`, team: 'alpha', specId: players[i % players.length]!.specId,
  });
}

function modeBotCounts(rules: MatchRuleset, bossPlayer: boolean, players: number): { hostile: number; friendly: number } {
  let hostile = rules.enemies ?? 12;
  if (rules.juggernaut) hostile = bossPlayer ? Math.max(1, hostile - players + 1) : 1;
  else if (rules.infection) hostile = 1;
  const friendly = rules.aerial === 'gunship' ? (rules.allies??4) : bossPlayer ? 0 : Math.max(0, (rules.allies ?? 0) + 1 - players);
  return { hostile, friendly };
}
