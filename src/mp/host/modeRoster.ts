import { matchRulesetFor, type TeamArrangement } from '../../sim/matchRuleset.ts';
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
  const count = rules.juggernaut ? (bossPlayer ? Math.max(1, (rules.enemies ?? 12) - players.length + 1) : 1)
    : rules.infection ? 1 : rules.enemies ?? 12;
  for (let i = 0; i < Math.min(42 - players.length, count); i++) bots.push({
    playerId: `mode-bravo-${i}`, name: rules.juggernaut && !bossPlayer ? 'Juggernaut' : rules.infection ? 'Patient Zero' : `Hostile ${i + 1}`,
    team: 'bravo', specId: players[i % players.length]!.specId,
  });
  const friendlyCount = bossPlayer || rules.aerial === 'gunship' ? 0 : Math.max(0, (rules.allies ?? 0) + 1 - players.length);
  const friendlySlots = Math.min(42 - players.length - bots.length, friendlyCount);
  for (let i = 0; i < friendlySlots; i++) bots.push({
    playerId: `mode-alpha-${i}`, name: `Ally ${i + 1}`, team: 'alpha', specId: players[i % players.length]!.specId,
  });
}
