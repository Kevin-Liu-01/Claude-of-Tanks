import { planRoomBots } from '../room/roomBots.ts';
/**
 * The boot plan of a peer-to-peer match as the hosting seat derives it (P2 client lane): the room's `match_start`
 * names the match, the map, the mode and the seed but not the roster it planned, so the host reads the room snapshot
 * it holds at that moment — the state the room broadcast right before the start — the way `planStart` in
 * roomPolicy.ts read it: every connected player with a vehicle (spectators seated as spectators), the bots the room's
 * planner seats (room/roomBots.ts, with the match seed: the symmetric fill, the asymmetric roles, the co-op hostiles),
 * the same ids, names and vehicles. A room that hands the plan
 * itself (`match_start.plan`, an addendum P1 may adopt) wins over the derivation. Pure and DOM-free.
 */
import type { RoomMatchStartPayload, RoomSnapshot } from '../room/protocol.ts';
import type { HostBootBot, HostBootSeat } from './hostProtocol.ts';
import { TANK_IDS, type TankIdResolver } from '../../vehicles/tankIdAliases.ts';

export interface HostBootPlan {
  seats: HostBootSeat[];
  bots: HostBootBot[];
}

const DEFAULT_BOT_SPEC = 'm1a1_abrams_hc';

function isSeat(value: unknown): value is HostBootSeat {
  if (!value || typeof value !== 'object') return false;
  const seat = value as Record<string, unknown>;
  return Number.isInteger(seat.seat) && typeof seat.playerId === 'string' && typeof seat.name === 'string' &&
    (seat.team === 'alpha' || seat.team === 'bravo' || seat.team === 'spectator') && typeof seat.specId === 'string';
}

function isBot(value: unknown): value is HostBootBot {
  if (!value || typeof value !== 'object') return false;
  const bot = value as Record<string, unknown>;
  return typeof bot.playerId === 'string' && typeof bot.name === 'string' && (bot.team === 'alpha' || bot.team === 'bravo') && typeof bot.specId === 'string';
}

/** A plan the room attached to the host's match_start, when it did and it is well-formed. */
export function planFromMatchStart(matchStart: RoomMatchStartPayload, tankIds: TankIdResolver = TANK_IDS): HostBootPlan | null {
  const plan = (matchStart as { plan?: unknown }).plan;
  if (!plan || typeof plan !== 'object') return null;
  const { seats, bots } = plan as { seats?: unknown; bots?: unknown };
  if (!Array.isArray(seats) || !seats.every(isSeat) || (bots !== undefined && (!Array.isArray(bots) || !bots.every(isBot)))) return null;
  return {
    seats: seats.map((seat) => ({ ...seat, specId: tankIds.resolveIncoming(seat.specId), equipment: seat.equipment ? [...seat.equipment] : [] })),
    bots: Array.isArray(bots) ? bots.map((bot) => ({ ...bot, specId: tankIds.resolveIncoming(bot.specId) })) : [],
  };
}

/** The roster as the room froze it at the start, read from the snapshot the room broadcast before `match_start`. */
export function planFromRoom(
  room: RoomSnapshot,
  { botSpecFallback = DEFAULT_BOT_SPEC, tankIds = TANK_IDS, seed = 0 }: { botSpecFallback?: string; tankIds?: TankIdResolver; seed?: number } = {},
): HostBootPlan {
  const seats: HostBootSeat[] = [];
  for (const player of room.players) {
    if (!player.connected) continue;
    if (player.team !== 'spectator' && !player.specId) continue;
    // A room seat's vehicle is this build's id (the MP build gate keeps rooms on one build); an id a rename retired
    // still names its vehicle (SSOT 2.19).
    const specId = player.specId ? tankIds.resolveIncoming(player.specId) : botSpecFallback;
    seats.push({ seat: player.seat, playerId: player.id, name: player.name, team: player.team, specId, equipment: player.equipment.slice() });
  }
  const bots: HostBootBot[] = [];
  // the room's own bot planner with the match seed: the same bots, vehicles and countries the room's planStart froze
  planRoomBots(room.settings, seats, bots, seed >>> 0);
  return { seats, bots };
}

/** The plan the host boots with: the room's own when it sent one, else the derivation. Throws when the host's own seat is missing. */
export function planHostBoot(room: RoomSnapshot, matchStart: RoomMatchStartPayload, hostId: string): HostBootPlan {
  const plan = planFromMatchStart(matchStart) ?? planFromRoom(room, { seed: matchStart.seed });
  if (!plan.seats.some((seat) => seat.playerId === hostId)) throw new Error('the host is not seated in the plan');
  return plan;
}

/** A roster entry as the WELCOME carried it (the migration fallback when no sealed configuration was retained). */
export interface RosterPlanEntry {
  seat: number;
  team: 0 | 1 | 2 | number;
  bot: boolean;
  playerId: string;
  name: string;
  specId: string;
}

const TEAM_NAMES = ['alpha', 'bravo', 'spectator'] as const;

/**
 * The plan from the authority's own roster (every seat, connected or not, and every bot) with the equipment the room
 * snapshot still names per player: what an elected host boots from when the old host's configuration blob never
 * arrived (a seat promoted within its first seconds).
 */
export function planFromRoster(roster: readonly RosterPlanEntry[], room: RoomSnapshot | null): HostBootPlan {
  const seats: HostBootSeat[] = [];
  const bots: HostBootBot[] = [];
  for (const entry of roster) {
    const team = TEAM_NAMES[entry.team] ?? 'alpha';
    if (entry.bot) {
      if (team !== 'spectator') bots.push({ playerId: entry.playerId, name: entry.name, team, specId: entry.specId });
      continue;
    }
    const player = room?.players.find((candidate) => candidate.id === entry.playerId) ?? null;
    seats.push({ seat: entry.seat, playerId: entry.playerId, name: entry.name, team, specId: entry.specId, equipment: player ? player.equipment.slice() : [] });
  }
  return { seats, bots };
}
