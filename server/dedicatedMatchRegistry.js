import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { AuthoritativeMatchRuntime } from '../src/net/matchRuntime.js';
import { createAuthoritativeMatch } from '../src/sim/authoritativeMatch.js';
import { createDedicatedWorldCollision } from './dedicatedWorldCollision.js';

const MATCH_ID_RE = /^[a-zA-Z0-9_-]{6,64}$/;
const PLAYER_ID_RE = /^[a-zA-Z0-9_-]{1,48}$/;

function hashToken(token) {
  return createHash('sha256').update(String(token)).digest();
}

function tokenMatches(expected, received) {
  const actual = hashToken(received);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function randomToken() {
  return randomBytes(24).toString('base64url');
}

function randomMatchId() {
  return randomBytes(12).toString('base64url');
}

function createDedicatedSimulation(options) {
  return createAuthoritativeMatch({
    ...options,
    worldCollision: createDedicatedWorldCollision(options.mapId),
  });
}

/** In-memory lifecycle for dedicated authoritative matches. */
export class DedicatedMatchRegistry {
  constructor({
    simulationFactory = createDedicatedSimulation,
    runtimeFactory = (simulation) => new AuthoritativeMatchRuntime({ simulation }),
    tokenFactory = randomToken,
  } = {}) {
    this.simulationFactory = simulationFactory;
    this.runtimeFactory = runtimeFactory;
    this.tokenFactory = tokenFactory;
    this.matches = new Map();
    this.closed = false;
  }

  createMatch({ matchId = randomMatchId(), players, mapId = 'verdant', seed = 6000 } = {}) {
    if (this.closed) throw new Error('match registry is closed');
    const id = String(matchId);
    if (!MATCH_ID_RE.test(id) || this.matches.has(id)) throw new Error('invalid or duplicate match id');
    if (!Array.isArray(players) || players.length < 2 || players.length > 14) {
      throw new TypeError('dedicated matches require 2-14 players');
    }
    const playerRecords = new Map();
    const tickets = [];
    for (const player of players) {
      const playerId = String(player && player.id || '');
      if (!PLAYER_ID_RE.test(playerId) || playerRecords.has(playerId)) {
        throw new TypeError('match player ids must be safe and unique');
      }
      const token = String(this.tokenFactory());
      if (token.length < 24) throw new Error('token factory returned a weak token');
      playerRecords.set(playerId, {
        player: { ...player, id: playerId },
        tokenHash: hashToken(token),
        connected: false,
      });
      tickets.push({ matchId: id, playerId, token });
    }
    const simulation = this.simulationFactory({ players, mapId, seed });
    const runtime = this.runtimeFactory(simulation);
    const record = {
      id,
      mapId,
      seed,
      players: playerRecords,
      simulation,
      runtime,
      createdAtMs: Date.now(),
      finishedAtMs: null,
    };
    this.matches.set(id, record);
    return { matchId: id, tickets };
  }

  authenticate({ matchId, playerId, token } = {}) {
    const match = this.matches.get(String(matchId));
    const player = match && match.players.get(String(playerId));
    if (!match || !player || !tokenMatches(player.tokenHash, token)) return null;
    return { match, player };
  }

  attach({ matchId, playerId, token, transport } = {}) {
    const authenticated = this.authenticate({ matchId, playerId, token });
    if (!authenticated) throw Object.assign(new Error('match authentication failed'), {
      code: 'match_auth_failed',
    });
    const { match, player } = authenticated;
    // A reconnect atomically replaces the stale channel while keeping the
    // authoritative entity and match clock intact.
    match.runtime.detachPeer(playerId, 'reconnected');
    match.runtime.attachPeer({
      peerId: playerId,
      transport,
      metadata: { mode: 'dedicated', specId: player.player.specId },
    });
    player.connected = true;
    if (typeof transport.onClose === 'function') {
      transport.onClose(() => { player.connected = false; });
    }
    return match;
  }

  advance(elapsedMs) {
    if (this.closed) return 0;
    let steps = 0;
    const now = Date.now();
    for (const match of [...this.matches.values()]) {
      steps += match.runtime.advance(elapsedMs);
      if (match.simulation.result && match.finishedAtMs == null) match.finishedAtMs = now;
      // Keep a completed match alive briefly for its final snapshots and
      // reconnecting results clients, then reclaim all channels/state.
      if (match.finishedAtMs != null && now - match.finishedAtMs > 30_000) {
        this.removeMatch(match.id, 'match_expired');
      }
    }
    return steps;
  }

  removeMatch(matchId, reason = 'match_removed') {
    const match = this.matches.get(String(matchId));
    if (!match) return false;
    this.matches.delete(match.id);
    match.runtime.close(reason);
    return true;
  }

  stats() {
    let connectedPlayers = 0;
    for (const match of this.matches.values()) {
      for (const player of match.players.values()) if (player.connected) connectedPlayers++;
    }
    return { matches: this.matches.size, connectedPlayers };
  }

  close(reason = 'registry_closed') {
    if (this.closed) return;
    this.closed = true;
    for (const match of [...this.matches.values()]) this.removeMatch(match.id, reason);
  }
}
