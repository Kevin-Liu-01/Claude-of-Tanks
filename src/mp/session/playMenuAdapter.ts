/**
 * The Play menu's Multiplayer v2 room connection (charter §8: v2 ships behind
 * `?mp=v2` on the same site). `src/ui/playMenu.ts` stays the entry boundary
 * and keeps driving v1's `PrivateRoomConnectionRuntime` contract — connect,
 * observe, close, forget, current, connecting — so this module implements
 * that contract over a `RoomClient`: the menu renders the v1 `SerializedLobby`
 * shape (`roomToLobby`), sends the same commands (`set_ready`, `set_team`,
 * `select_vehicle`, `set_map`, `start`, …), and hands the match off through
 * `onHostStart` for every seat once the room's `match_start` arrives. The
 * connection carries `inviteVersion: 2`, so invite links stamp `v=2` and the
 * start reaches the v2 session owner instead of v1. Node-runnable: no DOM; the
 * v1 modules are imported for their types only.
 */
import { RoomClient } from '../room/roomClient.ts';
import type { RoomClientOptions, StorageLike } from '../room/roomClient.ts';
import { RoomError, normalizeRoomCode } from '../room/protocol.ts';
import type { RoomChatEntry, RoomMatchStartPayload, RoomMode, RoomSnapshot } from '../room/protocol.ts';
import { roomToLobby } from '../room/roomPolicy.ts';
import type {
  PrivateRoomConnection, PrivateRoomConnectionOptions, PrivateRoomConnectionRuntime, PrivateRoomConnectRequest,
} from '../../net/privateRoomConnectionRuntime.ts';
import type { SerializedLobby } from '../../net/lobby.ts';

type Unsubscribe = () => void;
type RoomCommand = Record<string, unknown>;

/** Marks a menu session object as a v2 one (main.ts routes the start on it). */
export const MULTIPLAYER_V2_SESSION: unique symbol = Symbol.for('cot.mp.v2.session');

/** What the menu (and the browser session owner) receives as `connection.session`. */
export interface V2RoomSession {
  readonly [MULTIPLAYER_V2_SESSION]: true;
  readonly roomInfo: { roomCode: string; peerId: string; hostId: string; hostName: string; mode: RoomMode };
  readonly client: RoomClient;
  /** The newest lobby the room published, in the v1 shape the menu renders. */
  readonly lobby: SerializedLobby;
  readonly lastMatchStart: RoomMatchStartPayload | null;
  /** A policy command; rejections carry the room's code (`RoomError`). */
  command(command: RoomCommand): Promise<Record<string, unknown>>;
  /** The same as `command` (v1 clients submit, hosts command; a v2 seat does both). */
  submit(command: RoomCommand): Promise<Record<string, unknown>>;
  chat(text: string): Promise<void>;
  onLobby(listener: (lobby: SerializedLobby, room: RoomSnapshot) => void): Unsubscribe;
  onChat(listener: (entry: RoomChatEntry) => void): Unsubscribe;
  /** The room is gone for this seat (kicked, expired, resume denied, left, transport exhausted). */
  onClosed(listener: (reason: string) => void): Unsubscribe;
  /** Explicit leave (the seat goes, an admin migrates at once) and release. */
  close(reason?: string): void;
}

export interface V2RoomConnection {
  readonly generation: number;
  readonly role: 'host' | 'client';
  readonly mode: RoomMode;
  readonly roomInfo: V2RoomSession['roomInfo'];
  readonly session: V2RoomSession;
  readonly inviteVersion: 2;
  /** v1's ICE surface the menu reads for its "direct only" note: a v2 room never relays. */
  readonly ice: { iceServers: never[]; relayOnly: false; relayAvailable: true; source: 'lan' };
  readonly runtime: { onState(listener: (state: SerializedLobby) => void): Unsubscribe };
}

export interface RoomConnectionAdapterOptions extends PrivateRoomConnectionOptions {
  /** Private capabilities (localStorage in the browser, a memory map headless). */
  storage?: StorageLike | null;
  clientBuild?: string;
  /** Receipts inject a client bound to an in-process host or a scripted transport. */
  createRoomClient?: (options: RoomClientOptions) => RoomClient;
}

export interface RoomConnectionAdapter extends PrivateRoomConnectionRuntime {
  /** The v2 view of `current` (same object, typed). */
  readonly currentV2: V2RoomConnection | null;
}

export function isMultiplayerV2Session(value: unknown): value is V2RoomSession {
  return !!value && typeof value === 'object' && (value as Record<PropertyKey, unknown>)[MULTIPLAYER_V2_SESSION] === true;
}

/** `roomToLobby` produces the v1 wire shape; the menu renders it without a second validation. */
export function lobbyOf(room: RoomSnapshot): SerializedLobby {
  return roomToLobby(room) as unknown as SerializedLobby;
}

function connectFailure(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function validateConnectRequest(request: PrivateRoomConnectRequest): void {
  const validKind = request?.kind === 'create' || request?.kind === 'join';
  const validTeamSize = Number.isSafeInteger(request?.teamSize) && request.teamSize >= 1 && request.teamSize <= 14;
  const complete = validKind && Boolean(request.mode) && Boolean(request.player?.id) && Boolean(request.player?.name)
    && Boolean(request.selection?.specId) && Boolean(request.selection?.mapId) && validTeamSize;
  if (!complete) throw new TypeError('room connect request is incomplete');
  if (!String(request.signalUrl ?? '').trim()) throw connectFailure('signaling_unavailable', 'no room host is configured for this deployment');
  if (request.kind === 'join' && normalizeRoomCode(request.roomCode).length !== 6) throw connectFailure('invalid_room_code', 'Enter a six-character room code');
}

/**
 * Own one room acquisition for the Play menu, v2 style. A superseded attempt
 * (the menu closed or switched modes while connecting) disposes its client
 * instead of publishing a stale lobby; a connected room keeps one state
 * observation, hands the match off, and survives `forget()` unchanged so the
 * session owner that took the connection keeps the seat, the capability and
 * the socket.
 */
export function createRoomConnectionAdapter({
  storage = null,
  clientBuild = 'dev',
  createRoomClient = (options) => new RoomClient(options),
  loadIce,
  isVehicleAllowed,
  isCamoAllowed,
  isMapAllowed,
  onHostStart = () => {},
  onClientClose = () => {},
  onClose,
  onStatus = () => {},
  onError = () => {},
}: RoomConnectionAdapterOptions): RoomConnectionAdapter {
  void loadIce; void isVehicleAllowed; void isCamoAllowed; void isMapAllowed; // the room host applies the policy guards
  const required = [onHostStart, onClientClose, onStatus, onError, createRoomClient];
  if (required.some((entry) => typeof entry !== 'function')) throw new TypeError('room connection adapter requires every lifecycle port');
  if (onClose !== undefined && typeof onClose !== 'function') throw new TypeError('onClose must be a function');

  let generation = 0;
  let pending: { generation: number; client: RoomClient } | null = null;
  let current: V2RoomConnection | null = null;
  /** After `forget()` the session owner holds the room; the menu's onClose stays silent. */
  let released: V2RoomConnection | null = null;
  let unsubscribeObservation: Unsubscribe | null = null;

  const clearObservation = () => { unsubscribeObservation?.(); unsubscribeObservation = null; };

  const buildConnection = (client: RoomClient, room: RoomSnapshot, mode: RoomMode, attemptGeneration: number): V2RoomConnection => {
    let lobby = lobbyOf(room);
    let lastMatchStart: RoomMatchStartPayload | null = client.matchStart;
    const lobbyListeners = new Set<(lobby: SerializedLobby, room: RoomSnapshot) => void>();
    const closedListeners = new Set<(reason: string) => void>();
    const subscriptions: Unsubscribe[] = [];
    const hostName = () => room.players.find((player) => player.id === room.adminId)?.name ?? '';
    const roomInfo = {
      get roomCode() { return room.roomCode; },
      peerId: client.playerId,
      get hostId() { return room.adminId; },
      get hostName() { return hostName(); },
      mode,
    };
    const session: V2RoomSession = {
      [MULTIPLAYER_V2_SESSION]: true,
      roomInfo,
      client,
      get lobby() { return lobby; },
      get lastMatchStart() { return lastMatchStart; },
      command: (command) => client.command(command),
      submit: (command) => client.command(command),
      chat: (text) => client.chat(text),
      onLobby: (listener) => { lobbyListeners.add(listener); return () => { lobbyListeners.delete(listener); }; },
      onChat: (listener) => client.onChat(listener),
      onClosed: (listener) => { closedListeners.add(listener); return () => { closedListeners.delete(listener); }; },
      close: (reason = 'room_connection_closed') => close(reason),
    };
    const connection: V2RoomConnection = {
      generation: attemptGeneration,
      get role() { return room.adminId === client.playerId ? 'host' : 'client'; },
      mode,
      roomInfo,
      session,
      inviteVersion: 2,
      ice: { iceServers: [], relayOnly: false, relayAvailable: true, source: 'lan' },
      runtime: { onState: (listener) => session.onLobby((next) => listener(next)) },
    };
    subscriptions.push(client.onState((next) => {
      room = next;
      lobby = lobbyOf(next);
      for (const listener of lobbyListeners) listener(lobby, next);
    }));
    subscriptions.push(client.onMatchStart((payload) => {
      lastMatchStart = payload;
      if (current === connection || released === connection) onHostStart(lobby, connection as unknown as PrivateRoomConnection);
    }));
    subscriptions.push(client.onPhase(({ phase }) => {
      if (phase === 'reconnecting') onStatus({ state: 'reconnecting' });
      else if (phase === 'joined') onStatus({ state: 'connected' });
    }));
    subscriptions.push(client.onClosed(({ reason }) => {
      for (const unsubscribe of subscriptions.splice(0)) unsubscribe();
      for (const listener of closedListeners) listener(reason);
      if (released === connection) { released = null; return; }
      if (current !== connection) return;
      generation++;
      clearObservation();
      current = null;
      if (onClose) onClose(reason);
      else onClientClose(reason);
    }));
    return connection;
  };

  const close = (reason = 'room_connection_closed', { transportAlreadyClosed = false }: { transportAlreadyClosed?: boolean } = {}) => {
    void reason; // v1's contract names a reason for its presentation; a v2 leave is the seat's explicit departure
    generation++;
    clearObservation();
    const attempt = pending;
    pending = null;
    if (attempt) attempt.client.dispose();
    const connected = current;
    current = null;
    released = null;
    if (!connected) return;
    const client = connected.session.client;
    if (transportAlreadyClosed) { client.dispose(); return; }
    void client.leave().finally(() => client.dispose());
  };

  const connect = async (request: PrivateRoomConnectRequest): Promise<PrivateRoomConnection | null> => {
    validateConnectRequest(request);
    if (pending || current) throw new Error('a room connection already owns this menu');
    const attemptGeneration = ++generation;
    const client = createRoomClient({
      endpoint: String(request.signalUrl).trim(),
      player: { id: request.player.id, name: request.player.name },
      storage,
      clientBuild,
    });
    const attempt = { generation: attemptGeneration, client };
    pending = attempt;
    onStatus({ state: 'connecting' });
    const mode: RoomMode = request.mode === 'lan' ? 'lan' : 'private';
    const selection = { specId: request.selection.specId, equipment: [...(request.selection.equipment || [])], camo: request.selection.camo || 'factory' };
    try {
      const room = request.kind === 'create'
        ? await client.create({
          mode, selection,
          settings: { teamSize: request.teamSize, mapId: request.selection.mapId, gameMode: request.selection.gameMode || 'standard' },
        })
        : await client.join({ roomCode: normalizeRoomCode(request.roomCode), selection });
      if (pending !== attempt || generation !== attemptGeneration) { client.dispose(); return null; }
      const connection = buildConnection(client, room, room.mode, attemptGeneration);
      current = connection;
      pending = null;
      onStatus({ state: 'connected' });
      return connection as unknown as PrivateRoomConnection;
    } catch (error) {
      const canceled = pending !== attempt || generation !== attemptGeneration;
      if (pending === attempt) pending = null;
      client.dispose();
      if (canceled) return null;
      onError(error);
      throw error instanceof RoomError ? Object.assign(error, { code: error.code }) : error;
    }
  };

  return {
    connect,
    observe(listener) {
      if (typeof listener !== 'function') throw new TypeError('room state listener is required');
      clearObservation();
      const observed = current;
      if (!observed) return () => {};
      const guarded = (state: SerializedLobby) => { if (current === observed) listener(state); };
      unsubscribeObservation = observed.runtime.onState(guarded);
      guarded(observed.session.lobby);
      return () => { if (current === observed) clearObservation(); };
    },
    close,
    forget() {
      // The session owner took the connection: keep the seat, the capability and the socket alive.
      if (current) released = current;
      generation++;
      clearObservation();
      const attempt = pending;
      pending = null;
      if (attempt) attempt.client.dispose();
      current = null;
    },
    get current() { return current as unknown as PrivateRoomConnection | null; },
    get currentV2() { return current; },
    get connecting() { return pending !== null; },
  };
}
