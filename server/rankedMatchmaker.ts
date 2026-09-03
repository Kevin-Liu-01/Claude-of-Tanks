import type { RuntimeValue } from '../src/runtimeTypes.ts';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  sanitizeLoadout,
  type EquipmentSpecLike,
} from '../src/game/equipment.ts';
import { isGarageVisibleTankId } from '../src/game/matchmaking.ts';
import { getSpec } from '../src/vehicles/specs.ts';
import { RANDOM_BATTLE_MAP_IDS } from '../src/world/maps/index.ts';
import { uniquePlayerName } from '../src/net/playerNames.ts';
import { networkCamoId } from '../src/vehicles/camoPolicy.ts';
import { DedicatedMatchRegistry } from './dedicatedMatchRegistry.ts';
import {
  RatingStore,
  type PublicRatingProfile,
  type RatedPlayer,
  type RatedResult,
  type RatingIdentity,
  type RatingLeaderboardEntry,
} from './ratingStore.ts';

const TEAM_SIZES = new Set([1, 2, 3, 5, 7]);
const QUEUE_TTL_MS = 10 * 60_000;
const MATCH_TTL_MS = 25 * 60_000;
const RESULT_TTL_MS = 2 * 60_000;

type RankedTicketStatus = 'queued' | 'matched' | 'finished' | 'cancelled' | 'expired';
type RankedTeam = 'alpha' | 'bravo';

export interface RankedRosterPlayer extends RatedPlayer {
  name: string;
  specId: string;
  equipment: string[];
  camo: string;
  rating: number;
}

export type PublicRankedRosterPlayer = Omit<RankedRosterPlayer, 'equipment'>;

export interface RankedMatchAssignment {
  matchId: string;
  playerId: string;
  token: string;
  mapId: string;
  roster: PublicRankedRosterPlayer[];
}

interface RankedQueueEntry {
  id: string;
  tokenHash: Buffer;
  playerId: string;
  name: string;
  rating: number;
  specId: string;
  equipment: string[];
  camo: string;
  teamSize: number;
  queuedAtMs: number;
  matchedAtMs?: number;
  status: RankedTicketStatus;
  match: RankedMatchAssignment | null;
  result: RatedResult | null;
  profile: PublicRatingProfile | null;
  completedAtMs: number | null;
}

interface TrackedRatedMatch {
  entries: RankedQueueEntry[];
  players: RatedPlayer[];
  settled: boolean;
}

export interface PublicRankedTicket {
  ticketId: string;
  status: RankedTicketStatus;
  queuedAtMs: number;
  teamSize: number;
  rating: number;
  match?: RankedMatchAssignment | null;
  result?: RatedResult | null;
  profile?: PublicRatingProfile | null;
}

export interface RankedJoinResult extends PublicRankedTicket {
  ticketToken: string;
}

export interface RankedJoinOptions {
  playerId?: RuntimeValue;
  identityToken?: RuntimeValue;
  specId?: RuntimeValue;
  equipment?: string[];
  camo?: RuntimeValue;
  teamSize?: RuntimeValue;
}

export interface RankedMatchmakerOptions {
  registry?: DedicatedMatchRegistry;
  ratings?: RatingStore;
  now?: () => number;
  ticketIdFactory?: () => string;
  ticketTokenFactory?: () => string;
  maxActivePlayers?: number;
  maxEntries?: number;
}

export interface RankedMatchmakerStats {
  queuedPlayers: number;
  ratedMatches: number;
}

function hashToken(token: RuntimeValue): Buffer {
  return createHash('sha256').update(String(token)).digest();
}

function tokenMatches(expected: Buffer, received: RuntimeValue): boolean {
  const actual = hashToken(received);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function randomId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('base64url')}`;
}

function randomToken(): string {
  return randomBytes(24).toString('base64url');
}

/** Ranked rotation consumes the same complete pool as every Random Battle. */
export function rankedBattleMapForSequence(sequence: RuntimeValue): string {
  const candidate = Number(sequence);
  const index = Number.isSafeInteger(candidate) && candidate >= 0 ? candidate : 0;
  return RANDOM_BATTLE_MAP_IDS[index % RANDOM_BATTLE_MAP_IDS.length];
}

function publicTicket(entry: RankedQueueEntry): PublicRankedTicket {
  const base: PublicRankedTicket = {
    ticketId: entry.id,
    status: entry.status,
    queuedAtMs: entry.queuedAtMs,
    teamSize: entry.teamSize,
    rating: entry.rating,
  };
  if (entry.status === 'matched') base.match = entry.match;
  if (entry.status === 'finished') {
    base.match = entry.match;
    base.result = entry.result;
    base.profile = entry.profile;
  }
  return base;
}

/** Bounded server-owned queue that emits authenticated dedicated-match tickets. */
export class RankedMatchmaker {
  readonly registry: DedicatedMatchRegistry;
  readonly ratings: RatingStore;
  readonly now: () => number;
  readonly ticketIdFactory: () => string;
  readonly ticketTokenFactory: () => string;
  readonly maxActivePlayers: number;
  readonly maxEntries: number;
  readonly entries = new Map<string, RankedQueueEntry>();
  readonly activeByPlayer = new Map<string, string>();
  readonly ratedMatches = new Map<string, TrackedRatedMatch>();
  matchSequence = 0;

  constructor({
    registry,
    ratings = new RatingStore(),
    now = () => Date.now(),
    ticketIdFactory = () => randomId('q'),
    ticketTokenFactory = randomToken,
    maxActivePlayers = 2048,
    maxEntries = 4096,
  }: RankedMatchmakerOptions = {}) {
    if (!registry || typeof registry.createMatch !== 'function') {
      throw new TypeError('dedicated match registry is required');
    }
    this.registry = registry;
    this.ratings = ratings;
    this.now = now;
    this.ticketIdFactory = ticketIdFactory;
    this.ticketTokenFactory = ticketTokenFactory;
    this.maxActivePlayers = Math.max(2, Math.min(10_000, Number(maxActivePlayers) || 2048));
    this.maxEntries = Math.max(this.maxActivePlayers, Math.min(20_000,
      Number(maxEntries) || 4096));
  }

  createIdentity(input: { name?: RuntimeValue }): RatingIdentity {
    return this.ratings.createIdentity(input);
  }

  profile(playerId: RuntimeValue): PublicRatingProfile | null {
    return this.ratings.profile(playerId);
  }

  leaderboard(limit: RuntimeValue): RatingLeaderboardEntry[] {
    return this.ratings.leaderboard(limit);
  }

  join({
    playerId,
    identityToken,
    specId,
    equipment = [],
    camo = 'factory',
    teamSize = 1,
  }: RankedJoinOptions = {}): RankedJoinResult {
    const id = String(playerId || '');
    if (!this.ratings.authenticate(id, identityToken)) {
      throw Object.assign(new Error('ranked identity authentication failed'), {
        code: 'ranked_auth_failed',
      });
    }
    if (this.activeByPlayer.has(id)) {
      throw Object.assign(new Error('player is already queued or matched'), {
        code: 'already_queued',
      });
    }
    this.pump();
    if (this.activeByPlayer.size >= this.maxActivePlayers || this.entries.size >= this.maxEntries) {
      throw Object.assign(new Error('ranked queue is at capacity'), { code: 'queue_full' });
    }
    const size = Number(teamSize);
    if (!TEAM_SIZES.has(size)) throw new TypeError('team size must be 1, 2, 3, 5, or 7');
    const vehicleId = String(specId || '');
    if (!isGarageVisibleTankId(vehicleId)) throw new TypeError('vehicle is unavailable in ranked play');
    const spec = getSpec(vehicleId) as EquipmentSpecLike | null | undefined;
    if (!spec) throw new TypeError('unknown ranked vehicle');
    const ticketId = String(this.ticketIdFactory());
    const ticketToken = String(this.ticketTokenFactory());
    if (!/^[a-zA-Z0-9_-]{8,64}$/.test(ticketId) || this.entries.has(ticketId)) {
      throw new Error('ticket factory returned an invalid id');
    }
    if (ticketToken.length < 24) throw new Error('ticket factory returned a weak token');
    const profile = this.ratings.profile(id);
    if (!profile) throw new Error('authenticated ranked profile is unavailable');
    const entry: RankedQueueEntry = {
      id: ticketId,
      tokenHash: hashToken(ticketToken),
      playerId: id,
      name: profile.name,
      rating: profile.rating,
      specId: vehicleId,
      equipment: sanitizeLoadout(equipment, spec),
      camo: String(networkCamoId(camo)),
      teamSize: size,
      queuedAtMs: this.now(),
      status: 'queued',
      match: null,
      result: null,
      profile: null,
      completedAtMs: null,
    };
    this.entries.set(ticketId, entry);
    this.activeByPlayer.set(id, ticketId);
    this.pump();
    return { ...publicTicket(entry), ticketToken };
  }

  poll(ticketId: RuntimeValue, ticketToken: RuntimeValue): PublicRankedTicket | null {
    const entry = this.entries.get(String(ticketId));
    if (!entry || !tokenMatches(entry.tokenHash, ticketToken)) return null;
    return publicTicket(entry);
  }

  cancel(ticketId: RuntimeValue, ticketToken: RuntimeValue): boolean {
    const entry = this.entries.get(String(ticketId));
    if (!entry || !tokenMatches(entry.tokenHash, ticketToken) || entry.status !== 'queued') return false;
    entry.status = 'cancelled';
    entry.completedAtMs = this.now();
    this.activeByPlayer.delete(entry.playerId);
    return true;
  }

  #matchGroup(group: RankedQueueEntry[]): void {
    const ordered = group.slice().sort((a, b) => b.rating - a.rating ||
      a.queuedAtMs - b.queuedAtMs || a.playerId.localeCompare(b.playerId));
    const teams: Record<RankedTeam, RankedQueueEntry[]> = { alpha: [], bravo: [] };
    let alphaRating = 0;
    let bravoRating = 0;
    for (const entry of ordered) {
      const alphaOpen = teams.alpha.length < entry.teamSize;
      const bravoOpen = teams.bravo.length < entry.teamSize;
      const team = !alphaOpen ? 'bravo' : !bravoOpen ? 'alpha'
        : alphaRating <= bravoRating ? 'alpha' : 'bravo';
      teams[team].push(entry);
      if (team === 'alpha') alphaRating += entry.rating;
      else bravoRating += entry.rating;
    }
    const mapId = rankedBattleMapForSequence(this.matchSequence);
    const seed = (0x6d2b79f5 ^ Math.imul(++this.matchSequence, 0x9e3779b1)) >>> 0;
    const roster: RankedRosterPlayer[] = [];
    const rosterNames: string[] = [];
    for (const team of ['alpha', 'bravo'] as const) {
      for (const entry of teams[team]) {
        const name = uniquePlayerName(entry.name, rosterNames);
        rosterNames.push(name);
        roster.push({
          id: entry.playerId,
          name,
          specId: entry.specId,
          equipment: entry.equipment,
          camo: entry.camo,
          team,
          rating: entry.rating,
        });
      }
    }
    const created = this.registry.createMatch({
      players: roster,
      mapId,
      seed,
      metadata: { mode: 'ranked' },
    });
    const ticketByPlayer = new Map(created.tickets.map((ticket) => [ticket.playerId, ticket]));
    const publicRoster = roster.map(({ equipment: _equipment, ...player }) => player);
    for (const entry of group) {
      const ticket = ticketByPlayer.get(entry.playerId);
      if (!ticket) throw new Error(`dedicated ticket missing for ${entry.playerId}`);
      entry.status = 'matched';
      entry.matchedAtMs = this.now();
      entry.match = {
        ...ticket,
        mapId,
        roster: publicRoster,
      };
    }
    this.ratedMatches.set(created.matchId, {
      entries: group.slice(),
      players: roster.map(({ id, team }) => ({ id, team })),
      settled: false,
    });
  }

  pump(): RankedMatchmakerStats {
    const now = this.now();
    for (const entry of this.entries.values()) {
      if (entry.status === 'queued' && now - entry.queuedAtMs > QUEUE_TTL_MS) {
        entry.status = 'expired';
        entry.completedAtMs = now;
        this.activeByPlayer.delete(entry.playerId);
      } else if (entry.status === 'matched' && entry.matchedAtMs != null &&
          now - entry.matchedAtMs > MATCH_TTL_MS) {
        entry.status = 'expired';
        entry.completedAtMs = now;
        this.activeByPlayer.delete(entry.playerId);
      } else if (entry.completedAtMs != null && now - entry.completedAtMs > RESULT_TTL_MS) {
        this.entries.delete(entry.id);
      }
    }
    for (const size of TEAM_SIZES) {
      const queued = [...this.entries.values()]
        .filter((entry) => entry.status === 'queued' && entry.teamSize === size)
        .sort((a, b) => a.queuedAtMs - b.queuedAtMs || a.playerId.localeCompare(b.playerId));
      const required = size * 2;
      while (queued.length >= required) {
        const oldest = queued[0];
        const waitMinutes = Math.max(0, (now - oldest.queuedAtMs) / 60_000);
        const band = Math.min(600, 150 + waitMinutes * 50);
        const candidates = queued.filter((entry) => Math.abs(entry.rating - oldest.rating) <= band);
        if (candidates.length < required) break;
        const group = candidates.slice(0, required);
        this.#matchGroup(group);
        for (const entry of group) queued.splice(queued.indexOf(entry), 1);
      }
    }
    for (const [matchId, tracked] of this.ratedMatches) {
      if (tracked.settled && tracked.entries.every((entry) => !this.entries.has(entry.id))) {
        this.ratedMatches.delete(matchId);
      }
    }
    return this.stats();
  }

  reconcile(): void {
    const now = this.now();
    for (const [matchId, tracked] of this.ratedMatches) {
      if (tracked.settled) continue;
      const match = this.registry.matches.get(matchId);
      if (!match?.simulation?.result) continue;
      const result = match.simulation.result;
      if (result !== 'alpha' && result !== 'bravo' && result !== 'draw') continue;
      const updates = this.ratings.recordTeamMatch({
        matchId,
        result,
        players: tracked.players,
      });
      const byPlayer = new Map((updates || []).map((entry) => [entry.playerId, entry]));
      for (const entry of tracked.entries) {
        entry.status = 'finished';
        entry.result = result;
        entry.profile = byPlayer.get(entry.playerId) || this.ratings.profile(entry.playerId);
        entry.completedAtMs = now;
        this.activeByPlayer.delete(entry.playerId);
      }
      tracked.settled = true;
    }
    this.pump();
  }

  stats(): RankedMatchmakerStats {
    let queuedPlayers = 0;
    for (const entry of this.entries.values()) if (entry.status === 'queued') queuedPlayers++;
    return { queuedPlayers, ratedMatches: this.ratedMatches.size };
  }
}
