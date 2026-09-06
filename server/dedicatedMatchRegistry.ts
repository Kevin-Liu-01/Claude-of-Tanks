import type { RuntimeValue } from '../src/runtimeTypes.ts';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
// The full authored fleet registers through tankFactory's module graph. No
// visual is instantiated here, but loading this side-effect boundary ensures
// Node authority resolves the exact same specs/armor as the browser garage.
import '../src/vehicles/tankFactory.ts';
import {
  AuthoritativeMatchRuntime,
  type MatchTransport,
} from '../src/net/matchRuntime.ts';
import {
  createAuthoritativeMatch,
  type AuthoritativeMatch,
  type AuthoritativePlayerRecord,
} from '../src/sim/authoritativeMatch.ts';
import { createDedicatedWorldCollision } from './dedicatedWorldCollision.ts';

const MATCH_ID_RE = /^[a-zA-Z0-9_-]{6,64}$/;
const PLAYER_ID_RE = /^[a-zA-Z0-9_-]{1,48}$/;
const LOADING_GRACE_MS = 180_000;

export interface DedicatedSimulationOptions {
  players: AuthoritativePlayerRecord[];
  mapId: string;
  seed: number;
}

export interface DedicatedMatchTicket {
  matchId: string;
  playerId: string;
  token: string;
}

export interface DedicatedMatchCreateResult {
  matchId: string;
  tickets: DedicatedMatchTicket[];
}

export interface DedicatedMatchCreateOptions {
  matchId?: string;
  players?: AuthoritativePlayerRecord[];
  mapId?: string;
  seed?: number;
  metadata?: Record<string, RuntimeValue> | null;
}

export interface DedicatedMatchCredentials {
  matchId?: RuntimeValue;
  playerId?: RuntimeValue;
  token?: RuntimeValue;
}

export interface DedicatedMatchAttachOptions extends DedicatedMatchCredentials {
  transport?: MatchTransport;
}

export interface DedicatedPlayerState {
  player: AuthoritativePlayerRecord;
  tokenHash: Buffer;
  connected: boolean;
  connectionGeneration: number;
  unsubscribeClose: (() => void) | null;
}

export interface DedicatedMatchRecord {
  id: string;
  mapId: string;
  seed: number;
  metadata: Record<string, RuntimeValue> | null;
  players: Map<string, DedicatedPlayerState>;
  simulation: AuthoritativeMatch;
  runtime: AuthoritativeMatchRuntime;
  createdAtMs: number;
  finishedAtMs: number | null;
}

export interface DedicatedMatchRegistryOptions {
  simulationFactory?: (options: DedicatedSimulationOptions) => AuthoritativeMatch;
  runtimeFactory?: (simulation: AuthoritativeMatch) => AuthoritativeMatchRuntime;
  tokenFactory?: () => string;
  now?: () => number;
}

export interface DedicatedMatchAuthentication {
  match: DedicatedMatchRecord;
  player: DedicatedPlayerState;
}

export interface DedicatedMatchRegistryStats {
  matches: number;
  connectedPlayers: number;
}

function hashToken(token: RuntimeValue): Buffer {
  return createHash('sha256').update(String(token)).digest();
}

function tokenMatches(expected: Buffer, received: RuntimeValue): boolean {
  const actual = hashToken(received);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function randomToken(): string {
  return randomBytes(24).toString('base64url');
}

function randomMatchId(): string {
  return randomBytes(12).toString('base64url');
}

function createDedicatedSimulation(options: DedicatedSimulationOptions): AuthoritativeMatch {
  return createAuthoritativeMatch({
    ...options,
    worldCollision: createDedicatedWorldCollision(options.mapId),
  });
}

function createDedicatedRuntime(simulation: AuthoritativeMatch): AuthoritativeMatchRuntime {
  return new AuthoritativeMatchRuntime({ simulation });
}

/** In-memory lifecycle for dedicated authoritative matches. */
export class DedicatedMatchRegistry {
  readonly simulationFactory: (options: DedicatedSimulationOptions) => AuthoritativeMatch;
  readonly runtimeFactory: (simulation: AuthoritativeMatch) => AuthoritativeMatchRuntime;
  readonly tokenFactory: () => string;
  readonly now: () => number;
  readonly matches = new Map<string, DedicatedMatchRecord>();
  closed = false;

  constructor({
    simulationFactory = createDedicatedSimulation,
    runtimeFactory = createDedicatedRuntime,
    tokenFactory = randomToken,
    now = () => Date.now(),
  }: DedicatedMatchRegistryOptions = {}) {
    this.simulationFactory = simulationFactory;
    this.runtimeFactory = runtimeFactory;
    this.tokenFactory = tokenFactory;
    this.now = now;
  }

  createMatch({
    matchId = randomMatchId(), players, mapId = 'verdant', seed = 6000, metadata = null,
  }: DedicatedMatchCreateOptions = {}): DedicatedMatchCreateResult {
    if (this.closed) throw new Error('match registry is closed');
    const id = String(matchId);
    if (!MATCH_ID_RE.test(id) || this.matches.has(id)) throw new Error('invalid or duplicate match id');
    if (!Array.isArray(players) || players.length < 2 || players.length > 14) {
      throw new TypeError('dedicated matches require 2-14 players');
    }
    const playerRecords = new Map<string, DedicatedPlayerState>();
    const tickets: DedicatedMatchTicket[] = [];
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
        connectionGeneration: 0,
        unsubscribeClose: null,
      });
      tickets.push({ matchId: id, playerId, token });
    }
    const simulation = this.simulationFactory({ players, mapId, seed });
    const runtime = this.runtimeFactory(simulation);
    const record: DedicatedMatchRecord = {
      id,
      mapId,
      seed,
      metadata: metadata && typeof metadata === 'object' ? { ...metadata } : null,
      players: playerRecords,
      simulation,
      runtime,
      createdAtMs: this.now(),
      finishedAtMs: null,
    };
    this.matches.set(id, record);
    return { matchId: id, tickets };
  }

  authenticate({
    matchId,
    playerId,
    token,
  }: DedicatedMatchCredentials = {}): DedicatedMatchAuthentication | null {
    const match = this.matches.get(String(matchId));
    const player = match && match.players.get(String(playerId));
    if (!match || !player || !tokenMatches(player.tokenHash, token)) return null;
    return { match, player };
  }

  attach({
    matchId,
    playerId,
    token,
    transport,
  }: DedicatedMatchAttachOptions = {}): DedicatedMatchRecord {
    const authenticated = this.authenticate({ matchId, playerId, token });
    if (!authenticated) throw Object.assign(new Error('match authentication failed'), {
      code: 'match_auth_failed',
    });
    const { match, player } = authenticated;
    if (!transport || typeof transport.send !== 'function' ||
        typeof transport.onMessage !== 'function') {
      throw new TypeError('transport must implement send() and onMessage()');
    }
    const attachedPlayerId = player.player.id;
    player.unsubscribeClose?.();
    player.unsubscribeClose = null;
    const connectionGeneration = ++player.connectionGeneration;
    // A reconnect atomically replaces the stale channel while keeping the
    // authoritative entity and match clock intact.
    match.runtime.detachPeer(attachedPlayerId, 'reconnected');
    match.runtime.attachPeer({
      peerId: attachedPlayerId,
      transport,
      metadata: { mode: 'dedicated', specId: player.player.specId },
    });
    player.connected = true;
    if (typeof transport.onClose === 'function') {
      player.unsubscribeClose = transport.onClose(() => {
        if (player.connectionGeneration === connectionGeneration) player.connected = false;
      });
    }
    return match;
  }

  advance(elapsedMs: number): number {
    if (this.closed) return 0;
    let steps = 0;
    const now = this.now();
    for (const match of [...this.matches.values()]) {
      // A reserved player may never connect or finish loading. Reclaim that
      // unstarted operation without manufacturing a battle result or forfeit.
      if (!match.runtime.matchStarted && !match.simulation.result &&
          now - match.createdAtMs >= LOADING_GRACE_MS) {
        this.removeMatch(match.id, 'loading_expired');
        continue;
      }
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

  removeMatch(matchId: RuntimeValue, reason = 'match_removed'): boolean {
    const match = this.matches.get(String(matchId));
    if (!match) return false;
    this.matches.delete(match.id);
    for (const player of match.players.values()) {
      player.unsubscribeClose?.();
      player.unsubscribeClose = null;
      player.connected = false;
    }
    match.runtime.close(reason);
    return true;
  }

  stats(): DedicatedMatchRegistryStats {
    let connectedPlayers = 0;
    for (const match of this.matches.values()) {
      for (const player of match.players.values()) if (player.connected) connectedPlayers++;
    }
    return { matches: this.matches.size, connectedPlayers };
  }

  close(reason = 'registry_closed'): void {
    if (this.closed) return;
    this.closed = true;
    for (const match of [...this.matches.values()]) this.removeMatch(match.id, reason);
  }
}
