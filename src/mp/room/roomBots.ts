/**
 * Multiplayer bot seating (gameplay-modes-228): who fills a room's empty seats, on which side, in which vehicle. One pure
 * planner the room's start plan (roomPolicy.planStart: the rooms Worker and the LAN service) and the p2p host's own
 * derivation (host/hostPlan.planFromRoom) both call with the match seed, so they name the same bots; it replaces the
 * old rule that every bot cloned a human's pick (an empty side cloned the host's tank).
 *
 * - Symmetric modes fill each side to the room's team size (when the room fills with bots).
 * - The asymmetric modes (Juggernaut, Infected, AC-130) seal their role allocation (who is the boss, who the escorts).
 * - The co-operative modes (Endless Horde, Frontline Assault) seat their hostiles always — the Horde's pool, the
 *   defending formation — and the allied bots up to the mode's sortie when the room fills with bots (v2 seated none, so
 *   a room's waves came up empty forever).
 * - TEAM NATIONS: the host's room setting (room.settings.arrangement.teamNations). MONO-NATION seats each side from one
 *   country through sim/teamNations.ts (the side's humans' majority country; the enemy side one opposing country, the
 *   campaign operation's in the campaign); RANDOM seats any contemporary vehicle. At most
 *   TEAM_NATIONS_RULES.mpDistinctBotSpecsPerSide distinct bot vehicles per side (each one a profile every seat loads).
 * Bot ids stay `bot-<team>-<n>` / `mode-<team>-<n>`, never a vehicle id; duplicate picks are valid.
 */
import { NATION_INDEX } from '../../sim/nationIndex.generated.ts';
import { matchRulesetFor, TEAM_NATIONS_RULES, type MatchRuleset, type TeamArrangement } from '../../sim/matchRuleset.ts';
import { normalizeGameMode } from '../../sim/matchModes.ts';
import { campaignOperationCountry, ERA_NEIGHBOURS, isCountryId, pickNationalSides, type NationNote, type NationRow, type CountryId } from '../../sim/teamNations.ts';

interface PlanSeat { playerId: string; team: 'alpha' | 'bravo' | 'spectator'; specId: string }
export interface PlanBot { playerId: string; name: string; team: 'alpha' | 'bravo'; specId: string }

/** The room's TEAM NATIONS record for the plan (the lobby and the receipts read it). */
export interface RoomTeamNations {
  readonly teamNations: 'mono' | 'random';
  readonly allied: CountryId | null;
  readonly enemy: CountryId | null;
  readonly notes: readonly NationNote[];
}

interface RoomBotSettings {
  readonly gameMode: string;
  readonly arrangement: TeamArrangement | null | undefined;
  readonly campaignOperationId?: string | null;
  readonly teamSize: number;
  readonly botsFill: boolean;
}

/** The vehicles a room never seats in a match (the field limit, player included). */
const FIELD_LIMIT = 42;
const INDEX_ROWS: readonly NationRow[] = NATION_INDEX.map(([id, country, era, tier]) => Object.freeze({ id, country, era, tier }));
const ROW_BY_ID: ReadonlyMap<string, NationRow> = new Map(INDEX_ROWS.map((row) => [row.id, row]));
const rowOf = (specId: string): NationRow => ROW_BY_ID.get(specId) ?? { id: specId, country: null, era: null, tier: 6 };

function seededUnit(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** The index in a seeded order (the match seed): the planner's preference order within every band. */
function seededRows(seed: number): NationRow[] {
  const rng = seededUnit((seed ^ 0x6e617469) >>> 0);
  const rows = INDEX_ROWS.slice();
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [rows[i], rows[j]] = [rows[j]!, rows[i]!];
  }
  return rows;
}

/** RANDOM: any contemporary vehicle (the lead human's era band first), at most the budget of distinct ones per side. */
function randomSides(rows: readonly NationRow[], humans: readonly NationRow[], alpha: number, bravo: number): { alpha: string[]; bravo: string[] } {
  const era = humans.find((h) => h.era)?.era ?? 'modern';
  const band = ERA_NEIGHBOURS[era] ?? [era];
  const ordered = [...rows.filter((r) => band.includes(r.era ?? '')), ...rows.filter((r) => !band.includes(r.era ?? ''))];
  const budget = Math.max(1, TEAM_NATIONS_RULES.mpDistinctBotSpecsPerSide);
  let cursor = 0;
  const side = (count: number): string[] => {
    const distinct: string[] = [];
    const out: string[] = [];
    for (let k = 0; k < count; k++) {
      if (distinct.length < budget && cursor < ordered.length) { const id = ordered[cursor++]!.id; distinct.push(id); out.push(id); }
      else out.push(distinct[k % Math.max(1, distinct.length)] ?? ordered[0]!.id);
    }
    return out;
  };
  return { alpha: side(alpha), bravo: side(bravo) };
}

/**
 * The vehicles for `counts` bot seats per side, from the seats' humans and the room's settings, seeded by the match
 * seed. MONO-NATION through pickNationalSides; RANDOM through randomSides.
 */
function fillRoomBots(
  seats: readonly PlanSeat[],
  settings: Pick<RoomBotSettings, 'arrangement' | 'campaignOperationId' | 'gameMode'>,
  seed: number,
  counts: { readonly alpha: number; readonly bravo: number },
): { alpha: string[]; bravo: string[]; record: RoomTeamNations } {
  const rows = seededRows(seed);
  const alphaHumans = seats.filter((s) => s.team === 'alpha').map((s) => rowOf(s.specId));
  const bravoHumans = seats.filter((s) => s.team === 'bravo').map((s) => rowOf(s.specId));
  if (settings.arrangement?.teamNations === 'random') {
    const sides = randomSides(rows, [...alphaHumans, ...bravoHumans], counts.alpha, counts.bravo);
    return { ...sides, record: Object.freeze({ teamNations: 'random', allied: null, enemy: null, notes: [] }) };
  }
  const campaign = normalizeGameMode(settings.gameMode) === 'frontline_assault' ? campaignOperationCountry(settings.campaignOperationId) : null;
  const arranged = settings.arrangement?.enemyNation;
  const plan = pickNationalSides({
    rows, alliedHumans: alphaHumans, enemyHumans: bravoHumans, alliedSeats: counts.alpha, enemySeats: counts.bravo,
    campaignEnemy: campaign, arrangedEnemy: isCountryId(arranged) ? arranged : null, seed,
    rivalBlocWeight: TEAM_NATIONS_RULES.rivalBlocWeight, distinctPerSide: TEAM_NATIONS_RULES.mpDistinctBotSpecsPerSide,
    autoNeedsContemporaries: TEAM_NATIONS_RULES.autoEnemyNeedsContemporaries,
  });
  return {
    alpha: plan.allies.map((s) => s.id), bravo: plan.enemies.map((s) => s.id),
    record: Object.freeze({ teamNations: 'mono', allied: plan.allied, enemy: plan.enemy, notes: plan.notes }),
  };
}

/** The asymmetric modes' seat counts: hostiles (the hunters, the infected, the ground force) and friendlies. */
function modeBotCounts(rules: MatchRuleset, bossPlayer: boolean, players: number): { hostile: number; friendly: number } {
  let hostile = rules.enemies ?? 12;
  if (rules.juggernaut) hostile = bossPlayer ? Math.max(1, hostile - players + 1) : 1;
  else if (rules.infection) hostile = Math.max(3, hostile);
  const friendly = rules.aerial === 'gunship' ? (rules.allies ?? 4) : bossPlayer ? 0 : Math.max(0, (rules.allies ?? 0) + 1 - players);
  return { hostile, friendly };
}

/**
 * Seat a room's bots (and, in the asymmetric modes, seal the humans' sides): `seats` keeps its humans (their teams
 * rewritten by the asymmetric modes), `bots` is replaced. Returns the TEAM NATIONS record. Pure and DOM-free.
 */
export function planRoomBots<S extends PlanSeat>(
  settings: RoomBotSettings,
  seats: S[],
  bots: PlanBot[],
  seed: number,
): RoomTeamNations {
  const mode = normalizeGameMode(settings.gameMode);
  const rules = matchRulesetFor(mode, null, settings.arrangement ?? null);
  const players = seats.filter((seat) => seat.team !== 'spectator');
  bots.length = 0;
  const wave = mode === 'endless_horde' || mode === 'frontline_assault';
  const asymmetric = !!(rules.juggernaut || rules.infection || rules.aerial === 'gunship');
  // who sits where, and the bot seats per side
  const slots: { team: 'alpha' | 'bravo'; playerId: string; name: string }[] = [];
  if (asymmetric) {
    if (!players.length) return { teamNations: rules.teamNations, allied: null, enemy: null, notes: [] };
    const bossPlayer = rules.juggernaut?.team === 'alpha' ? players[0] : null;
    for (const seat of players) seat.team = bossPlayer ? (seat === bossPlayer ? 'alpha' : 'bravo') : 'alpha';
    const { hostile, friendly } = modeBotCounts(rules, !!bossPlayer, players.length);
    const hostiles = Math.min(Math.max(0, FIELD_LIMIT - players.length - friendly), hostile);
    for (let i = 0; i < hostiles; i++) slots.push({ team: 'bravo', playerId: `mode-bravo-${i}`,
      name: rules.juggernaut && !bossPlayer ? 'Juggernaut' : rules.infection ? `Infected ${i + 1}` : `Hostile ${i + 1}` });
    const friendlies = Math.min(FIELD_LIMIT - players.length - hostiles, friendly);
    for (let i = 0; i < friendlies; i++) slots.push({ team: 'alpha', playerId: `mode-alpha-${i}`, name: `Ally ${i + 1}` });
  } else if (wave) {
    // the co-op sortie: the hostile pool always (a wave needs its hostiles), the allied bots up to the mode's sortie
    const humans = players.filter((seat) => seat.team === 'alpha').length;
    const pool = Math.max(0, rules.enemies ?? 0);
    const allies = settings.botsFill ? Math.max(0, (rules.allies ?? 0) + 1 - humans) : 0;
    const hostiles = Math.min(pool, Math.max(0, FIELD_LIMIT - players.length));
    for (let i = 0; i < hostiles; i++) slots.push({ team: 'bravo', playerId: `mode-bravo-${i}`, name: mode === 'endless_horde' ? `Hostile ${i + 1}` : `Defender ${i + 1}` });
    const friendlies = Math.min(allies, Math.max(0, FIELD_LIMIT - players.length - hostiles));
    for (let i = 0; i < friendlies; i++) slots.push({ team: 'alpha', playerId: `mode-alpha-${i}`, name: `Ally ${i + 1}` });
  } else if (settings.botsFill) {
    for (const team of ['alpha', 'bravo'] as const) {
      const humans = seats.filter((seat) => seat.team === team).length;
      for (let index = humans; index < settings.teamSize; index++) {
        slots.push({ team, playerId: `bot-${team}-${index + 1}`, name: `Bot ${slots.length + 1}` });
      }
    }
  }
  const counts = { alpha: slots.filter((s) => s.team === 'alpha').length, bravo: slots.filter((s) => s.team === 'bravo').length };
  if (!slots.length) return { teamNations: rules.teamNations, allied: null, enemy: null, notes: [] };
  const fill = fillRoomBots(seats, settings, seed, counts);
  const next = { alpha: 0, bravo: 0 };
  for (const slot of slots) bots.push({ playerId: slot.playerId, name: slot.name, team: slot.team, specId: fill[slot.team][next[slot.team]++]! });
  return fill.record;
}
