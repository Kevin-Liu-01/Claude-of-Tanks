/**
 * The battle-pacing gate's roster (server/battlePacing.selftest.mjs, tools/pacing-trace.mjs): the deterministic
 * era-matched bot fill the private-room handoff of the first multiplayer produced for a default room — one idle
 * human, the other seats filled from the production catalog by a seed. The gate's 5-8 minute bands were measured
 * over exactly this roster, so the fill stays byte-identical here as the gate's fixture after that stack left the
 * tree (docs/MULTIPLAYER-V2.md §13.10). Rooms themselves plan their bots in src/mp/room/roomPolicy.ts.
 */
import { getSpec, PRODUCTION_TANK_IDS } from '../src/vehicles/specs.ts';
import { isBotTankId } from '../src/game/matchmaking.ts';

export interface PacingLobby {
  matchSeed: number;
  teamSize: number;
  players: ReadonlyArray<{ id: string; name: string; specId: string; team: 'alpha' | 'bravo' | 'spectator' }>;
}

export interface PacingPlayer {
  id: string;
  name: string;
  specId: string;
  team: 'alpha' | 'bravo';
  camo?: string;
  equipment?: string[] | null;
  bot?: boolean;
  difficulty?: 'easy' | 'normal' | 'hard';
  ready?: boolean;
  connected?: boolean;
  isHost?: boolean;
}

/** The handoff's seeded unit generator (also src/mp/room/roomPolicy.ts): the same seed picks the same roster. */
function seededUnit(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value |= 0;
    value = (value + 0x6D2B79F5) | 0;
    let out = Math.imul(value ^ (value >>> 15), 1 | value);
    out = (out + Math.imul(out ^ (out >>> 7), 61 | out)) ^ out;
    return ((out ^ (out >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fill a standard (non co-op) room's empty seats with era-matched bots, deterministically from the match seed. */
export function buildPacingRoster(lobby: PacingLobby): PacingPlayer[] {
  const humans: PacingPlayer[] = lobby.players
    .filter((player) => player.team !== 'spectator')
    .map((player) => ({ id: player.id, name: player.name, specId: player.specId, team: player.team as 'alpha' | 'bravo', bot: false }));
  const teamSize = Math.max(1, Math.min(7, Number(lobby.teamSize) || 1));
  const counts = {
    alpha: humans.filter((player) => player.team === 'alpha').length,
    bravo: humans.filter((player) => player.team === 'bravo').length,
  };
  if (counts.alpha > teamSize || counts.bravo > teamSize) throw new Error('human roster exceeds the selected team size');
  const referenceEra = humans[0]?.specId ? getSpec(humans[0].specId)?.era : null;
  const eraPool = PRODUCTION_TANK_IDS.filter((id) => isBotTankId(id) && (!referenceEra || getSpec(id)?.era === referenceEra));
  let pool = eraPool.length ? eraPool : PRODUCTION_TANK_IDS.filter(isBotTankId);
  const random = seededUnit(lobby.matchSeed ^ 0x5b07f11);
  const shuffle = (list: string[]): string[] => {
    const copy = list.slice();
    for (let index = copy.length - 1; index > 0; index--) {
      const target = Math.floor(random() * (index + 1));
      [copy[index], copy[target]] = [copy[target], copy[index]];
    }
    return copy;
  };
  pool = shuffle(pool);
  const players = humans.slice();
  let poolIndex = 0;
  for (const team of ['alpha', 'bravo'] as const) {
    for (let index = counts[team]; index < teamSize; index++) {
      players.push({
        id: `bot-${team}-${index}-${(lobby.matchSeed >>> 0).toString(36)}`,
        name: `Bot ${team === 'alpha' ? 'A' : 'B'}${index + 1}`,
        specId: pool[poolIndex++ % pool.length],
        camo: 'auto',
        team,
        equipment: null,
        bot: true,
        difficulty: 'normal',
        ready: true,
        connected: true,
        isHost: false,
      });
    }
  }
  return players;
}
