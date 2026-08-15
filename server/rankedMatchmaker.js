import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { sanitizeLoadout } from '../src/game/equipment.js';
import { isGarageVisibleTankId } from '../src/game/matchmaking.js';
import { getSpec } from '../src/vehicles/specs.js';
import { uniquePlayerName } from '../src/net/playerNames.js';
import { RatingStore } from './ratingStore.js';

const TEAM_SIZES = new Set([1, 2, 3, 5, 7]);
const MAPS = ['verdant', 'desert', 'winter', 'urban', 'coastal', 'autumn', 'steppe', 'railyard'];
const QUEUE_TTL_MS = 10 * 60_000;
const MATCH_TTL_MS = 25 * 60_000;
const RESULT_TTL_MS = 2 * 60_000;

function hashToken(token) {
  return createHash('sha256').update(String(token)).digest();
}

function tokenMatches(expected, received) {
  const actual = hashToken(received);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function randomId(prefix) {
  return `${prefix}_${randomBytes(12).toString('base64url')}`;
}

function randomToken() {
  return randomBytes(24).toString('base64url');
}

function publicTicket(entry) {
  const base = {
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
  constructor({
    registry,
    ratings = new RatingStore(),
    now = () => Date.now(),
    ticketIdFactory = () => randomId('q'),
    ticketTokenFactory = randomToken,
    maxActivePlayers = 2048,
    maxEntries = 4096,
  } = {}) {
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
    this.entries = new Map();
    this.activeByPlayer = new Map();
    this.ratedMatches = new Map();
    this.matchSequence = 0;
  }

  createIdentity(input) { return this.ratings.createIdentity(input); }
  profile(playerId) { return this.ratings.profile(playerId); }
  leaderboard(limit) { return this.ratings.leaderboard(limit); }

  join({ playerId, identityToken, specId, equipment = [], teamSize = 1 } = {}) {
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
    const spec = getSpec(vehicleId);
    if (!spec) throw new TypeError('unknown ranked vehicle');
    const ticketId = String(this.ticketIdFactory());
    const ticketToken = String(this.ticketTokenFactory());
    if (!/^[a-zA-Z0-9_-]{8,64}$/.test(ticketId) || this.entries.has(ticketId)) {
      throw new Error('ticket factory returned an invalid id');
    }
    if (ticketToken.length < 24) throw new Error('ticket factory returned a weak token');
    const profile = this.ratings.profile(id);
    const entry = {
      id: ticketId,
      tokenHash: hashToken(ticketToken),
      playerId: id,
      name: profile.name,
      rating: profile.rating,
      specId: vehicleId,
      equipment: sanitizeLoadout(equipment, spec),
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

  poll(ticketId, ticketToken) {
    const entry = this.entries.get(String(ticketId));
    if (!entry || !tokenMatches(entry.tokenHash, ticketToken)) return null;
    return publicTicket(entry);
  }

  cancel(ticketId, ticketToken) {
    const entry = this.entries.get(String(ticketId));
    if (!entry || !tokenMatches(entry.tokenHash, ticketToken) || entry.status !== 'queued') return false;
    entry.status = 'cancelled';
    entry.completedAtMs = this.now();
    this.activeByPlayer.delete(entry.playerId);
    return true;
  }

  #matchGroup(group) {
    const ordered = group.slice().sort((a, b) => b.rating - a.rating ||
      a.queuedAtMs - b.queuedAtMs || a.playerId.localeCompare(b.playerId));
    const teams = { alpha: [], bravo: [] };
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
    const mapId = MAPS[this.matchSequence % MAPS.length];
    const seed = (0x6d2b79f5 ^ Math.imul(++this.matchSequence, 0x9e3779b1)) >>> 0;
    const roster = [];
    const rosterNames = [];
    for (const team of ['alpha', 'bravo']) {
      for (const entry of teams[team]) {
        const name = uniquePlayerName(entry.name, rosterNames);
        rosterNames.push(name);
        roster.push({
          id: entry.playerId,
          name,
          specId: entry.specId,
          equipment: entry.equipment,
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
      entry.status = 'matched';
      entry.matchedAtMs = this.now();
      entry.match = {
        ...ticketByPlayer.get(entry.playerId),
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

  pump() {
    const now = this.now();
    for (const entry of this.entries.values()) {
      if (entry.status === 'queued' && now - entry.queuedAtMs > QUEUE_TTL_MS) {
        entry.status = 'expired';
        entry.completedAtMs = now;
        this.activeByPlayer.delete(entry.playerId);
      } else if (entry.status === 'matched' && now - entry.matchedAtMs > MATCH_TTL_MS) {
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

  reconcile() {
    const now = this.now();
    for (const [matchId, tracked] of this.ratedMatches) {
      if (tracked.settled) continue;
      const match = this.registry.matches.get(matchId);
      if (!match?.simulation?.result) continue;
      const updates = this.ratings.recordTeamMatch({
        matchId,
        result: match.simulation.result,
        players: tracked.players,
      });
      const byPlayer = new Map((updates || []).map((entry) => [entry.playerId, entry]));
      for (const entry of tracked.entries) {
        entry.status = 'finished';
        entry.result = match.simulation.result;
        entry.profile = byPlayer.get(entry.playerId) || this.ratings.profile(entry.playerId);
        entry.completedAtMs = now;
        this.activeByPlayer.delete(entry.playerId);
      }
      tracked.settled = true;
    }
    this.pump();
  }

  stats() {
    let queuedPlayers = 0;
    for (const entry of this.entries.values()) if (entry.status === 'queued') queuedPlayers++;
    return { queuedPlayers, ratedMatches: this.ratedMatches.size };
  }
}
