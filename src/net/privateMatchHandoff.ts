import { resolveMapId } from '../world/maps/index.ts';
import { VISIBLE_TANK_IDS, getSpec } from '../vehicles/specs.js';
import { isGarageVisibleTankId } from '../game/matchmaking.ts';
import { createAuthoritativeMatch } from '../sim/authoritativeMatch.js';
import { createLoopbackTransportPair } from './loopbackTransport.ts';
import {
  AuthoritativeMatchRuntime,
  MatchClientRuntime,
  type MatchRoomState,
  type RoomChatMessage,
} from './matchRuntime.ts';
import { maybeCreateAdverseNetworkTransport } from './adverseNetworkTransport.ts';
import {
  applyLobbyCommand,
  addLobbyPlayer,
  finishLobbyRound,
  markLobbyRoundPlaying,
  removeLobbyPlayer,
  serializeLobby,
  setLobbyPlayerConnected,
  type FinishLobbyRoundOptions,
  type LobbyState,
  type SerializedLobby,
} from './lobby.ts';

type Team = 'alpha' | 'bravo' | 'spectator';
type Unsubscribe = () => void;

export interface PrivateMatchPlayer {
  id: string;
  name: string;
  specId: string;
  team: Team;
  camo?: string;
  equipment?: string[] | null;
  bot?: boolean;
  difficulty?: string;
  ready?: boolean;
  connected?: boolean;
  isHost?: boolean;
}

export interface StartingPrivateLobby {
  phase: 'starting';
  mapId: string;
  matchSeed: number;
  players: PrivateMatchPlayer[];
  teamSize?: number;
  gameMode?: string;
  mode?: string;
  round?: number;
}

interface VehicleSpecView {
  era?: string;
}

interface MatchTransport {
  readonly readyState?: string;
  send(message: unknown): boolean;
  onMessage(listener: (message: unknown) => void): Unsubscribe;
  onClose?(listener: (reason: string) => void): Unsubscribe;
  close?(reason?: string): void;
}

interface MatchClientPort {
  connect(metadata?: Record<string, unknown>): void;
  readyForMatch(): boolean;
  onRoomState(listener: (state: MatchRoomState) => void): Unsubscribe;
  submitRoomCommand(command: Record<string, unknown>): unknown;
  onRoomChat(listener: (message: RoomChatMessage) => void): Unsubscribe;
  getRoomChatHistory(): RoomChatMessage[];
  sendRoomChat(text: string): unknown;
  submitInput(input: Record<string, unknown>, clientTick?: number): unknown;
  update(nowMs: number): unknown;
  close(reason?: string): void;
}

interface MatchSimulation {
  step(...args: unknown[]): unknown;
  snapshot(...args: unknown[]): unknown;
}

interface PersistentRoomController {
  state(): SerializedLobby;
  command(playerId: string, command: Record<string, unknown>): SerializedLobby;
  markPlaying(): void;
  finish(outcome: FinishLobbyRoundOptions): void;
  disconnect(playerId: string): void;
  remove(playerId: string, reason?: string): void;
  rejoin(playerId: string, player?: Partial<PrivateMatchPlayer>): SerializedLobby;
  metadataFor(playerId: string): Record<string, unknown>;
}

interface MatchAuthorityPort {
  readonly tick: number;
  attachPeer(options: {
    peerId: string;
    transport: MatchTransport;
    metadata?: Record<string, unknown>;
  }): Unsubscribe;
  acceptPeerMessage(peerId: string, message: unknown): boolean;
  replaceSimulation(simulation: MatchSimulation, options: { round: number }): MatchSimulation;
  advance(elapsedMs: number): number;
  close(reason?: string): void;
}

interface MatchChannelHandoff {
  peerId: string;
  transport: MatchTransport;
  pendingMessages?: unknown[];
  finishHandoff?(): void;
}

interface HostRoomSession {
  roomInfo: { peerId: string; mode?: string };
  lobby?: LobbyState;
  peers?: Map<string, { close?(reason?: string): void }>;
  isVehicleAllowed?(specId: string): boolean;
  isCamoAllowed?(camo: string): boolean;
  isMapAllowed?(mapId: string): boolean;
  takeMatchChannels(): Iterable<MatchChannelHandoff>;
  bindMatchRuntime?(runtime: MatchAuthorityPort): void;
  close?(reason?: string): void;
}

interface ClientRoomSession {
  roomInfo?: { peerId?: string; mode?: string };
  takeMatchClient?(): Promise<MatchClientPort>;
  takeMatchTransport?(): Promise<MatchTransport>;
  close?(reason?: string): void;
}

interface PrivateSimulationOptions {
  players: PrivateMatchPlayer[];
  mapId: string;
  seed: number;
  gameMode?: string;
  worldCollision: unknown;
  battleLimitS?: number;
}

type PrivateSimulationFactory = (options: PrivateSimulationOptions) => MatchSimulation;

const makeAuthoritativeSimulation = createAuthoritativeMatch as unknown as PrivateSimulationFactory;
const readVehicleSpec = getSpec as unknown as (id: string) => VehicleSpecView;

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

function validateStartingLobby(lobbyState: unknown): StartingPrivateLobby {
  if (!lobbyState || typeof lobbyState !== 'object') {
    throw new TypeError('a canonical starting lobby state is required');
  }
  const lobby = lobbyState as Partial<StartingPrivateLobby>;
  if (lobby.phase !== 'starting' || !Number.isSafeInteger(lobby.matchSeed) ||
      !Array.isArray(lobby.players) || typeof lobby.mapId !== 'string') {
    throw new TypeError('a canonical starting lobby state is required');
  }
  return lobby as StartingPrivateLobby;
}

/** Resolve a random lobby map identically on every peer before match handoff. */
export function resolvePrivateMatchMap(lobbyState: unknown): string {
  const lobby = validateStartingLobby(lobbyState);
  return resolveMapId(lobby.mapId, seededUnit(lobby.matchSeed));
}

/** Deterministically fill empty lobby slots with authority-owned bots. */
export function buildPrivateMatchPlayers(lobbyState: unknown): PrivateMatchPlayer[] {
  const lobby = validateStartingLobby(lobbyState);
  const horde = lobby.gameMode === 'endless_horde';
  const humans = lobby.players
    .filter((player) => player.team !== 'spectator')
    .map((player) => ({ ...player, team: horde ? 'alpha' : player.team, bot: false }));
  const teamSize = Math.max(1, Math.min(7, Number(lobby.teamSize) || 1));
  const counts = {
    alpha: humans.filter((player) => player.team === 'alpha').length,
    bravo: humans.filter((player) => player.team === 'bravo').length,
  };
  if (counts.alpha > teamSize || counts.bravo > teamSize) {
    throw new Error('human roster exceeds the selected team size');
  }
  const referenceEra = humans[0]?.specId ? readVehicleSpec(humans[0].specId)?.era : null;
  let pool = VISIBLE_TANK_IDS.filter((id) => isGarageVisibleTankId(id) &&
    (!referenceEra || readVehicleSpec(id)?.era === referenceEra));
  if (!pool.length) pool = VISIBLE_TANK_IDS.filter(isGarageVisibleTankId);
  const random = seededUnit(lobby.matchSeed ^ 0x5b07f11);
  pool = pool.slice();
  for (let index = pool.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [pool[index], pool[target]] = [pool[target], pool[index]];
  }
  const players = humans.slice();
  let poolIndex = 0;
  for (const team of ['alpha', 'bravo'] as const) {
    const targetSize = horde && team === 'alpha' ? counts.alpha : teamSize;
    for (let index = counts[team]; index < targetSize; index++) {
      const specId = pool[poolIndex++ % pool.length];
      players.push({
        id: `bot-${team}-${index}-${(lobby.matchSeed >>> 0).toString(36)}`,
        name: `Bot ${team === 'alpha' ? 'A' : 'B'}${index + 1}`,
        specId,
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

function createPersistentRoomController(
  session: HostRoomSession,
): PersistentRoomController | null {
  const lobby = session?.lobby;
  if (!lobby || !(lobby.players instanceof Map)) return null;
  return {
    state: () => serializeLobby(lobby),
    command(playerId: string, command: Record<string, unknown>) {
      applyLobbyCommand(lobby, playerId, command, {
        isVehicleAllowed: session.isVehicleAllowed || (() => true),
        isCamoAllowed: session.isCamoAllowed || (() => true),
        isMapAllowed: session.isMapAllowed || (() => true),
      });
      return serializeLobby(lobby);
    },
    markPlaying() { markLobbyRoundPlaying(lobby); },
    finish(outcome: FinishLobbyRoundOptions) { finishLobbyRound(lobby, outcome); },
    disconnect(playerId: string) {
      if (lobby.players.has(String(playerId))) {
        setLobbyPlayerConnected(lobby, String(playerId), false);
      }
    },
    remove(playerId: string, reason = 'left') {
      removeLobbyPlayer(lobby, playerId);
      const rtcPeer = session.peers?.get?.(String(playerId));
      rtcPeer?.close?.(reason);
      session.peers?.delete?.(String(playerId));
    },
    rejoin(playerId: string, player: Partial<PrivateMatchPlayer> = {}) {
      const id = String(playerId);
      const existing = lobby.players.get(id);
      if (!existing) {
        if (lobby.phase !== 'waiting') {
          throw Object.assign(new Error('This round no longer has a seat for that player.'), {
            code: 'room_seat_unavailable',
          });
        }
        addLobbyPlayer(lobby, { id, name: player.name || 'Player' });
      } else {
        setLobbyPlayerConnected(lobby, id, true);
      }
      return serializeLobby(lobby);
    },
    metadataFor(playerId: string) {
      const player = lobby.players.get(String(playerId));
      return player ? { spectator: player.team === 'spectator', team: player.team } : {};
    },
  };
}

export interface PrivateHostMatch {
  readonly kind: string;
  readonly role: 'host';
  readonly playerId: string;
  readonly mapId: string;
  readonly simulation: MatchSimulation;
  readonly host: MatchAuthorityPort;
  readonly client: MatchClientPort;
  ready(): boolean;
  onRoomState(listener: (state: MatchRoomState) => void): Unsubscribe;
  roomCommand(command: Record<string, unknown>): unknown;
  onRoomChat(listener: (message: RoomChatMessage) => void): Unsubscribe;
  getRoomChatHistory(): RoomChatMessage[];
  sendRoomChat(text: string): unknown;
  prepareRound(options: {
    lobbyState: unknown;
    worldCollision?: unknown;
  }): { mapId: string; simulation: MatchSimulation };
  advance(elapsedMs: number, input?: Record<string, unknown> | null): unknown;
  close(reason?: string): void;
}

export interface PrivateClientMatch {
  readonly kind: string;
  readonly role: 'client';
  readonly playerId: string;
  readonly mapId: string | null;
  readonly client: MatchClientPort;
  ready(): boolean;
  onRoomState(listener: (state: MatchRoomState) => void): Unsubscribe;
  roomCommand(command: Record<string, unknown>): unknown;
  onRoomChat(listener: (message: RoomChatMessage) => void): Unsubscribe;
  getRoomChatHistory(): RoomChatMessage[];
  sendRoomChat(text: string): unknown;
  update(nowMs: number): unknown;
  submitInput(input: Record<string, unknown>, clientTick: number): unknown;
  close(reason?: string): void;
}

export interface BeginPrivateHostMatchOptions {
  session?: HostRoomSession;
  lobbyState?: unknown;
  simulationFactory?: PrivateSimulationFactory;
  worldCollision?: unknown;
  battleLimitS?: number;
}

/**
 * Switch a browser-hosted room from lobby messages to authoritative match
 * messages without replacing its established WebRTC channels.
 */
export function beginPrivateHostMatch({
  session,
  lobbyState,
  simulationFactory = makeAuthoritativeSimulation,
  worldCollision = null,
  battleLimitS = undefined,
}: BeginPrivateHostMatchOptions = {}): PrivateHostMatch {
  const lobby = validateStartingLobby(lobbyState);
  if (!session || typeof session.takeMatchChannels !== 'function' ||
      !session.roomInfo || !session.roomInfo.peerId) {
    throw new TypeError('private host session is required');
  }
  const hostId = String(session.roomInfo.peerId);
  const mapId = resolvePrivateMatchMap(lobby);
  const players = buildPrivateMatchPlayers(lobby);
  if (battleLimitS !== undefined && (!Number.isFinite(battleLimitS) || battleLimitS <= 0)) {
    throw new TypeError('battleLimitS must be a positive finite number');
  }
  let simulation = simulationFactory({
    players,
    mapId,
    seed: lobby.matchSeed,
    gameMode: lobby.gameMode,
    worldCollision,
    ...(battleLimitS === undefined ? {} : { battleLimitS }),
  });
  const roomController = createPersistentRoomController(session);
  // Normal renderer delays still catch up inside the complete 100 ms window.
  // A browser/OS freeze can be longer: retain at most five seconds, then drain
  // it at one extra fixed tick per presented frame. That preserves match time
  // without a six-step fast-forward burst that snaps every remote tank.
  const host = new AuthoritativeMatchRuntime({
    simulation,
    roomController,
    maxCatchUpTicks: 6,
    maxBacklogTicks: 300,
    longStallCatchUpTicks: 2,
    // Room/result presentation is reliable but non-authoritative. On browser
    // hosts, yield between two-peer batches so a 7v7 result cannot make every
    // connected room UI update inside the final simulation/render task.
    scheduleRoomStateFanout: typeof window === 'undefined'
      ? null
      : (callback: () => void) => setTimeout(callback, 8),
    roomStateFanoutBatchSize: 2,
  });
  session.bindMatchRuntime?.(host);
  // The browser host's local player does not need an emulated network hop.
  // Keep the same protocol/runtime seam, but deliver its in-process envelopes
  // synchronously and zero-copy so host rendering never waits on microtasks.
  const localLink = createLoopbackTransportPair({ direct: true });
  let wallTimeMs = 0;
  const client = new MatchClientRuntime({
    transport: localLink.client,
    playerId: hostId,
    clock: () => wallTimeMs,
  });
  const playerById = new Map(lobby.players.map((player) => [player.id, player]));
  host.attachPeer({ peerId: hostId, transport: localLink.host,
    metadata: {
      mode: lobby.mode || 'private',
      spectator: playerById.get(hostId)?.team === 'spectator',
    } });
  for (const channel of session.takeMatchChannels()) {
    const player = playerById.get(channel.peerId);
    host.attachPeer({ peerId: channel.peerId, transport: channel.transport,
      metadata: { mode: lobby.mode || 'private', spectator: player?.team === 'spectator' } });
    // Authority is listening now; close the temporary inbox before replaying
    // it so every packet has exactly one owner and none can fall in a gap.
    channel.finishHandoff?.();
    for (const message of channel.pendingMessages || []) {
      host.acceptPeerMessage(channel.peerId, message);
    }
  }
  client.connect({ mode: lobby.mode || 'private' });

  return {
    kind: lobby.mode || 'private',
    role: 'host',
    playerId: hostId,
    mapId,
    get simulation() { return simulation; },
    host,
    client,
    ready() { return client.readyForMatch(); },
    onRoomState(listener: (state: MatchRoomState) => void) {
      return client.onRoomState(listener);
    },
    roomCommand(command: Record<string, unknown>) { return client.submitRoomCommand(command); },
    onRoomChat(listener: (message: RoomChatMessage) => void) {
      return client.onRoomChat(listener);
    },
    getRoomChatHistory() { return client.getRoomChatHistory(); },
    sendRoomChat(text: string) { return client.sendRoomChat(text); },
    prepareRound({
      lobbyState: nextLobby,
      worldCollision: nextCollision = null,
    }: { lobbyState: unknown; worldCollision?: unknown }) {
      const next = validateStartingLobby(nextLobby);
      const nextMapId = resolvePrivateMatchMap(next);
      simulation = simulationFactory({
        players: buildPrivateMatchPlayers(next),
        mapId: nextMapId,
        seed: next.matchSeed,
        gameMode: next.gameMode,
        worldCollision: nextCollision,
      });
      host.replaceSimulation(simulation, { round: Number(next.round) || 1 });
      return { mapId: nextMapId, simulation };
    },
    advance(elapsedMs: number, input: Record<string, unknown> | null = null) {
      if (input) client.submitInput(input, host.tick);
      host.advance(elapsedMs);
      wallTimeMs += elapsedMs;
      return client.update(wallTimeMs);
    },
    close(reason = 'private_match_closed') {
      client.close(reason);
      host.close(reason);
      session.close?.(reason);
    },
  };
}

/** Switch a joined peer's established WebRTC channel into match mode. */
export async function beginPrivateClientMatch({
  session,
  playerId,
  lobbyState,
}: {
  session?: ClientRoomSession;
  playerId?: string;
  lobbyState?: unknown;
} = {}): Promise<PrivateClientMatch> {
  if (!session || (typeof session.takeMatchClient !== 'function' &&
      typeof session.takeMatchTransport !== 'function')) {
    throw new TypeError('private client session is required');
  }
  const id = String(playerId || (session.roomInfo && session.roomInfo.peerId) || '');
  if (!id) throw new TypeError('playerId is required');
  let client;
  if (typeof session.takeMatchClient === 'function') {
    client = await session.takeMatchClient();
  } else {
    const takeMatchTransport = session.takeMatchTransport;
    if (!takeMatchTransport) throw new TypeError('private client transport is required');
    const transport = maybeCreateAdverseNetworkTransport(
      await takeMatchTransport.call(session),
    );
    client = new MatchClientRuntime({ transport, playerId: id });
    client.connect({ mode: session.roomInfo && session.roomInfo.mode || 'private' });
  }
  return {
    kind: session.roomInfo && session.roomInfo.mode || 'private',
    role: 'client',
    playerId: id,
    mapId: lobbyState ? resolvePrivateMatchMap(lobbyState) : null,
    client,
    ready() { return client.readyForMatch(); },
    onRoomState(listener: (state: MatchRoomState) => void) {
      return client.onRoomState(listener);
    },
    roomCommand(command: Record<string, unknown>) { return client.submitRoomCommand(command); },
    onRoomChat(listener: (message: RoomChatMessage) => void) {
      return client.onRoomChat(listener);
    },
    getRoomChatHistory() { return client.getRoomChatHistory(); },
    sendRoomChat(text: string) { return client.sendRoomChat(text); },
    update(nowMs: number) { return client.update(nowMs); },
    submitInput(input: Record<string, unknown>, clientTick: number) {
      return client.submitInput(input, clientTick);
    },
    close(reason = 'private_match_closed') {
      client.close(reason);
      session.close?.(reason);
    },
  };
}
