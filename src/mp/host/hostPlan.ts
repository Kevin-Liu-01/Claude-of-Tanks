import { arrangeModeRoster } from './modeRoster.ts';
/**
 * The boot plan of a peer-to-peer match as the hosting seat derives it (P2 client lane): the room's `match_start`
 * names the match, the map, the mode and the seed but not the roster it planned, so the host reads the room snapshot
 * it holds at that moment — the state the room broadcast right before the start — the way `planStart` in
 * roomPolicy.ts read it: every connected player with a vehicle (spectators seated as spectators), bots on the empty
 * slots per team unless the mode is co-operative, the same ids, names and vehicle choice. A room that hands the plan
 * itself (`match_start.plan`, an addendum P1 may adopt) wins over the derivation. Pure and DOM-free.
 */
import { isCoopGameMode } from '../room/roomPolicy.ts';
import type { RoomMatchStartPayload, RoomSnapshot } from '../room/protocol.ts';
import type { HostBootBot, HostBootSeat } from './hostProtocol.ts';

export interface HostBootPlan {
  seats: HostBootSeat[];
  bots: HostBootBot[];
}

const DEFAULT_BOT_SPEC = 'm1a2';

function botSpecFor(seats: readonly HostBootSeat[], team: 'alpha' | 'bravo', fallback: string): string {
  const counts = new Map<string, number>();
  for (const seat of seats) if (seat.team === team) counts.set(seat.specId, (counts.get(seat.specId) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [specId, count] of counts) if (count > bestCount) { best = specId; bestCount = count; }
  return best ?? seats[0]?.specId ?? fallback;
}

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
export function planFromMatchStart(matchStart: RoomMatchStartPayload): HostBootPlan | null {
  const plan = (matchStart as { plan?: unknown }).plan;
  if (!plan || typeof plan !== 'object') return null;
  const { seats, bots } = plan as { seats?: unknown; bots?: unknown };
  if (!Array.isArray(seats) || !seats.every(isSeat) || (bots !== undefined && (!Array.isArray(bots) || !bots.every(isBot)))) return null;
  return { seats: seats.map((seat) => ({ ...seat, equipment: seat.equipment ? [...seat.equipment] : [] })), bots: Array.isArray(bots) ? bots.map((bot) => ({ ...bot })) : [] };
}

/** The roster as the room froze it at the start, read from the snapshot the room broadcast before `match_start`. */
export function planFromRoom(room: RoomSnapshot, { botSpecFallback = DEFAULT_BOT_SPEC }: { botSpecFallback?: string } = {}): HostBootPlan {
  const seats: HostBootSeat[] = [];
  for (const player of room.players) {
    if (!player.connected) continue;
    if (player.team !== 'spectator' && !player.specId) continue;
    seats.push({ seat: player.seat, playerId: player.id, name: player.name, team: player.team, specId: player.specId ?? botSpecFallback, equipment: player.equipment.slice() });
  }
  const bots: HostBootBot[] = [];
  if (room.settings.botsFill && !isCoopGameMode(room.settings.gameMode)) {
    for (const team of ['alpha', 'bravo'] as const) {
      const humans = seats.filter((seat) => seat.team === team).length;
      for (let index = humans; index < room.settings.teamSize; index++) {
        bots.push({ playerId: `bot-${team}-${index + 1}`, name: `Bot ${bots.length + 1}`, team, specId: botSpecFor(seats, team, botSpecFallback) });
      }
    }
  }
  arrangeModeRoster(room.settings.gameMode, room.settings.arrangement, seats, bots);
  return { seats, bots };
}

/** The plan the host boots with: the room's own when it sent one, else the derivation. Throws when the host's own seat is missing. */
export function planHostBoot(room: RoomSnapshot, matchStart: RoomMatchStartPayload, hostId: string): HostBootPlan {
  const plan = planFromMatchStart(matchStart) ?? planFromRoom(room);
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
