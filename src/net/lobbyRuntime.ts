import {
  MESSAGE_TYPES,
  createEnvelope,
  isSequenceNewer,
  nextSequence,
  validateEnvelope,
  type MessageType,
} from './protocol.ts';
import { GAME_MODE_IDS, type GameModeId } from '../sim/matchModes.ts';
import {
  LOBBY_PHASES,
  LOBBY_TEAMS,
  addLobbyPlayer,
  applyLobbyCommand,
  removeLobbyPlayer,
  serializeLobby,
  type AddLobbyPlayerOptions,
  type LobbyPhase,
  type LobbyPlayer,
  type LobbyState,
  type LobbyTeam,
  type SerializedLobby,
} from './lobby.ts';

type Unsubscribe = () => void;

export interface LobbyTransport {
  readonly readyState?: string;
  send(message: unknown): boolean;
  onMessage(listener: (message: unknown) => void): Unsubscribe;
  onClose?(listener: (reason: string) => void): Unsubscribe;
  close(reason?: string): void;
}

export interface ReleasedLobbyTransport {
  peerId: string;
  transport: LobbyTransport;
  pendingMessages: unknown[];
  finishHandoff: Unsubscribe;
}

export interface LobbyHostRuntimeOptions {
  lobby?: LobbyState;
  isVehicleAllowed?: (specId: string, player: LobbyPlayer, lobby: LobbyState) => boolean;
  isCamoAllowed?: (camo: string, player: LobbyPlayer, lobby: LobbyState) => boolean;
  isMapAllowed?: (mapId: string, lobby: LobbyState) => boolean;
  onStart?: ((state: SerializedLobby) => void) | null;
}

export interface LobbyClientRuntimeOptions {
  transport?: LobbyTransport;
}

export interface LobbyRuntimeError {
  code: string;
  message: string;
}

interface RuntimePeer {
  id: string;
  transport: LobbyTransport;
  sendSeq: number;
  lastRecvSeq: number | null;
  pendingHandoffMessages: unknown[];
  unsubscribeMessage: Unsubscribe | null;
  unsubscribeClose: Unsubscribe | null;
}

const MATCH_HANDOFF_TYPES = new Set<MessageType>([
  MESSAGE_TYPES.HELLO,
  MESSAGE_TYPES.READY,
  MESSAGE_TYPES.INPUT,
  MESSAGE_TYPES.PING,
  MESSAGE_TYPES.LEAVE,
]);
const MAX_PENDING_HANDOFF_MESSAGES = 64;
const LOBBY_PHASE_SET = new Set<string>(Object.values(LOBBY_PHASES));
const LOBBY_TEAM_SET = new Set<string>(Object.values(LOBBY_TEAMS));
const GAME_MODE_SET = new Set<string>(GAME_MODE_IDS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeUnsigned(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function invalidLobbyState(message: string): Error {
  return Object.assign(new Error(message), { code: 'invalid_lobby_state' });
}

function isLobbyPlayer(value: unknown): value is LobbyPlayer {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string' && value.id.length > 0 &&
    typeof value.name === 'string' && value.name.length > 0 &&
    typeof value.team === 'string' && LOBBY_TEAM_SET.has(value.team) &&
    (value.specId === null || typeof value.specId === 'string') &&
    Array.isArray(value.equipment) && value.equipment.every((entry) => typeof entry === 'string') &&
    typeof value.camo === 'string' &&
    typeof value.ready === 'boolean' &&
    typeof value.connected === 'boolean' &&
    typeof value.isHost === 'boolean' &&
    (value.rating === null || Number.isFinite(value.rating));
}

function isLobbyResult(value: unknown): boolean {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  return isSafeUnsigned(value.round) &&
    (value.result === null || typeof value.result === 'string') &&
    (value.reason === null || typeof value.reason === 'string');
}

function readSerializedLobby(value: unknown): SerializedLobby {
  if (!isRecord(value)) throw invalidLobbyState('lobby state must be an object');
  const players = value.players;
  const valid = typeof value.roomCode === 'string' && value.roomCode.length === 6 &&
    typeof value.mode === 'string' &&
    typeof value.gameMode === 'string' && GAME_MODE_SET.has(value.gameMode) &&
    typeof value.phase === 'string' && LOBBY_PHASE_SET.has(value.phase) &&
    typeof value.hostId === 'string' && value.hostId.length > 0 &&
    isSafeUnsigned(value.maxPlayers) &&
    isSafeUnsigned(value.maxSpectators) &&
    typeof value.allowTeamSwitch === 'boolean' &&
    typeof value.locked === 'boolean' &&
    typeof value.mapId === 'string' &&
    Number.isSafeInteger(value.teamSize) && Number(value.teamSize) >= 1 &&
    Number(value.teamSize) <= 7 &&
    isSafeUnsigned(value.revision) &&
    (value.matchSeed === null || isSafeUnsigned(value.matchSeed)) &&
    isSafeUnsigned(value.round) &&
    isLobbyResult(value.lastResult) &&
    Array.isArray(players) && players.every(isLobbyPlayer);
  if (!valid) throw invalidLobbyState('lobby state contains invalid fields');
  const ids = new Set(players.map((player) => player.id));
  if (ids.size !== players.length || !ids.has(value.hostId as string)) {
    throw invalidLobbyState('lobby state contains invalid player identity');
  }
  return value as unknown as SerializedLobby;
}

function errorPayload(error: unknown): LobbyRuntimeError {
  let code = 'invalid_lobby_command';
  let message = 'invalid lobby command';
  if (isRecord(error) && typeof error.code === 'string' && error.code) code = error.code;
  if (error instanceof Error) message = error.message;
  else if (isRecord(error) && typeof error.message === 'string') message = error.message;
  return { code, message };
}

function remoteErrorPayload(value: unknown): LobbyRuntimeError {
  if (!isRecord(value)) return errorPayload(value);
  return {
    code: typeof value.code === 'string' && value.code ? value.code : 'remote_lobby_error',
    message: typeof value.message === 'string' && value.message
      ? value.message : 'remote lobby error',
  };
}

/** Host-owned lobby command module, independent from signaling and transport. */
export class LobbyHostRuntime {
  readonly lobby: LobbyState;
  readonly isVehicleAllowed: NonNullable<LobbyHostRuntimeOptions['isVehicleAllowed']>;
  readonly isCamoAllowed: NonNullable<LobbyHostRuntimeOptions['isCamoAllowed']>;
  readonly isMapAllowed: NonNullable<LobbyHostRuntimeOptions['isMapAllowed']>;
  readonly onStart: ((state: SerializedLobby) => void) | null;
  readonly peers = new Map<string, RuntimePeer>();
  readonly listeners = new Set<(state: SerializedLobby) => void>();
  closed = false;

  constructor({
    lobby,
    isVehicleAllowed = () => true,
    isCamoAllowed = () => true,
    isMapAllowed = () => true,
    onStart = null,
  }: LobbyHostRuntimeOptions = {}) {
    if (!lobby || !(lobby.players instanceof Map)) throw new TypeError('canonical lobby is required');
    this.lobby = lobby;
    this.isVehicleAllowed = isVehicleAllowed;
    this.isCamoAllowed = isCamoAllowed;
    this.isMapAllowed = isMapAllowed;
    this.onStart = onStart;
  }

  attachPeer({
    peerId,
    transport,
    player,
  }: {
    peerId?: unknown;
    transport?: LobbyTransport;
    player?: AddLobbyPlayerOptions;
  } = {}): Unsubscribe {
    if (this.closed) throw new Error('lobby runtime is closed');
    const id = String(peerId || '');
    if (!id || this.peers.has(id)) throw new Error('invalid or duplicate lobby peer');
    if (!transport || typeof transport.send !== 'function' ||
        typeof transport.onMessage !== 'function' || typeof transport.close !== 'function') {
      throw new TypeError('lobby transport must implement send(), onMessage(), and close()');
    }
    if (id !== this.lobby.hostId && !this.lobby.players.has(id)) {
      addLobbyPlayer(this.lobby, { ...player, id });
    }
    const peer: RuntimePeer = {
      id,
      transport,
      sendSeq: 0,
      lastRecvSeq: null,
      pendingHandoffMessages: [],
      unsubscribeMessage: null,
      unsubscribeClose: null,
    };
    peer.unsubscribeMessage = transport.onMessage((message) => this.#receive(peer, message));
    peer.unsubscribeClose = typeof transport.onClose === 'function'
      ? transport.onClose((reason) => this.detachPeer(id, reason))
      : null;
    this.peers.set(id, peer);
    this.broadcast();
    return () => { this.detachPeer(id, 'detached'); };
  }

  #send(peer: RuntimePeer, type: MessageType, payload: unknown): boolean {
    const accepted = peer.transport.send(createEnvelope(type, payload, {
      seq: peer.sendSeq,
      ack: peer.lastRecvSeq == null ? 0 : peer.lastRecvSeq,
      tick: this.lobby.revision,
    }));
    peer.sendSeq = nextSequence(peer.sendSeq);
    if (!accepted) peer.transport.close('backpressure_limit');
    return accepted;
  }

  #receive(peer: RuntimePeer, raw: unknown): void {
    try {
      const message = validateEnvelope(raw);
      if (this.lobby.phase === LOBBY_PHASES.STARTING &&
          MATCH_HANDOFF_TYPES.has(message.type)) {
        if (peer.pendingHandoffMessages.length >= MAX_PENDING_HANDOFF_MESSAGES) {
          peer.transport.close('handoff_buffer_limit');
          this.detachPeer(peer.id, 'handoff_buffer_limit');
          return;
        }
        peer.pendingHandoffMessages.push(raw);
        return;
      }
      if (peer.lastRecvSeq != null && !isSequenceNewer(message.seq, peer.lastRecvSeq)) return;
      peer.lastRecvSeq = message.seq;
      if (message.type === MESSAGE_TYPES.HELLO) {
        this.broadcast();
      } else if (message.type === MESSAGE_TYPES.LOBBY_COMMAND) {
        this.command(peer.id, message.payload);
      } else if (message.type === MESSAGE_TYPES.PING) {
        this.#send(peer, MESSAGE_TYPES.PONG, message.payload);
      } else if (message.type === MESSAGE_TYPES.LEAVE) {
        this.detachPeer(peer.id, 'client_leave');
      } else {
        throw Object.assign(new Error(`unexpected lobby message: ${message.type}`), {
          code: 'unexpected_message',
        });
      }
    } catch (error) {
      this.#send(peer, MESSAGE_TYPES.ERROR, errorPayload(error));
    }
  }

  command(playerId: string, command: unknown): LobbyState {
    const before = this.lobby.phase;
    applyLobbyCommand(this.lobby, playerId, command, {
      isVehicleAllowed: this.isVehicleAllowed,
      isCamoAllowed: this.isCamoAllowed,
      isMapAllowed: this.isMapAllowed,
    });
    this.broadcast();
    if (before !== this.lobby.phase && this.onStart) this.onStart(serializeLobby(this.lobby));
    return this.lobby;
  }

  broadcast(): SerializedLobby {
    const state = serializeLobby(this.lobby);
    for (const peer of this.peers.values()) this.#send(peer, MESSAGE_TYPES.LOBBY_STATE, state);
    for (const listener of [...this.listeners]) listener(state);
    return state;
  }

  onState(listener: (state: SerializedLobby) => void): Unsubscribe {
    this.listeners.add(listener);
    queueMicrotask(() => listener(serializeLobby(this.lobby)));
    return () => this.listeners.delete(listener);
  }

  detachPeer(peerId: unknown, reason = 'left'): boolean {
    const peer = this.peers.get(String(peerId));
    if (!peer) return false;
    this.peers.delete(peer.id);
    peer.unsubscribeMessage?.();
    peer.unsubscribeClose?.();
    removeLobbyPlayer(this.lobby, peer.id);
    if (!this.closed) this.broadcast();
    void reason;
    return true;
  }

  releaseTransports(): ReleasedLobbyTransport[] {
    const released: ReleasedLobbyTransport[] = [];
    for (const peer of this.peers.values()) {
      peer.unsubscribeMessage?.();
      peer.unsubscribeClose?.();
      const pendingMessages = peer.pendingHandoffMessages.splice(0);
      const finishHandoff = peer.transport.onMessage((message) => {
        if (pendingMessages.length >= MAX_PENDING_HANDOFF_MESSAGES) {
          peer.transport.close('handoff_buffer_limit');
          return;
        }
        pendingMessages.push(message);
      });
      released.push({
        peerId: peer.id,
        transport: peer.transport,
        pendingMessages,
        finishHandoff,
      });
    }
    this.peers.clear();
    this.closed = true;
    return released;
  }

  close(reason = 'lobby_closed'): void {
    if (this.closed) return;
    this.closed = true;
    for (const peer of this.peers.values()) {
      peer.unsubscribeMessage?.();
      peer.unsubscribeClose?.();
      peer.transport.close(reason);
    }
    this.peers.clear();
  }
}

export class LobbyClientRuntime {
  readonly transport: LobbyTransport;
  sendSeq = 0;
  lastRecvSeq: number | null = null;
  state: SerializedLobby | null = null;
  readonly errors: LobbyRuntimeError[] = [];
  readonly listeners = new Set<(state: SerializedLobby) => void>();
  closed = false;
  private unsubscribeMessage: Unsubscribe | null;
  private unsubscribeClose: Unsubscribe | null;

  constructor({ transport }: LobbyClientRuntimeOptions = {}) {
    if (!transport || typeof transport.send !== 'function' ||
        typeof transport.onMessage !== 'function' || typeof transport.close !== 'function') {
      throw new TypeError('lobby transport must implement send(), onMessage(), and close()');
    }
    this.transport = transport;
    this.unsubscribeMessage = transport.onMessage((message) => this.#receive(message));
    this.unsubscribeClose = typeof transport.onClose === 'function'
      ? transport.onClose(() => { this.closed = true; })
      : null;
  }

  #send(type: MessageType, payload: unknown): boolean {
    const accepted = this.transport.send(createEnvelope(type, payload, {
      seq: this.sendSeq,
      ack: this.lastRecvSeq == null ? 0 : this.lastRecvSeq,
      tick: this.state ? this.state.revision : 0,
    }));
    this.sendSeq = nextSequence(this.sendSeq);
    return accepted;
  }

  #receive(raw: unknown): void {
    try {
      const message = validateEnvelope(raw);
      if (this.lastRecvSeq != null && !isSequenceNewer(message.seq, this.lastRecvSeq)) return;
      this.lastRecvSeq = message.seq;
      if (message.type === MESSAGE_TYPES.LOBBY_STATE) {
        const state = readSerializedLobby(message.payload);
        if (!this.state || state.revision >= this.state.revision) {
          this.state = state;
          for (const listener of [...this.listeners]) listener(state);
        }
      } else if (message.type === MESSAGE_TYPES.ERROR) {
        this.errors.push(remoteErrorPayload(message.payload));
      }
    } catch (error) {
      this.errors.push(errorPayload(error));
    }
  }

  submit(command: unknown): boolean {
    return this.#send(MESSAGE_TYPES.LOBBY_COMMAND, command);
  }

  onState(listener: (state: SerializedLobby) => void): Unsubscribe {
    this.listeners.add(listener);
    if (this.state) queueMicrotask(() => listener(this.state as SerializedLobby));
    return () => this.listeners.delete(listener);
  }

  releaseTransport(): LobbyTransport {
    this.unsubscribeMessage?.();
    this.unsubscribeClose?.();
    this.unsubscribeMessage = null;
    this.unsubscribeClose = null;
    this.closed = true;
    return this.transport;
  }

  close(reason = 'lobby_client_closed'): void {
    if (this.closed) return;
    this.#send(MESSAGE_TYPES.LEAVE, { reason });
    this.releaseTransport();
    this.transport.close(reason);
  }
}
