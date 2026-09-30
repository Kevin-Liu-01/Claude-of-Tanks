/**
 * The Play menu's room connection (Multiplayer v2, the only multiplayer since the
 * cutover of 2026-09-29 — docs/MULTIPLAYER-V2.md §13.10). `src/ui/playMenu.ts`
 * stays the entry boundary and drives this contract — connect, observe, close,
 * forget, current, connecting — over a `RoomClient`: the menu renders the
 * lobby shape `roomToLobby` produces, sends the room's commands (`set_ready`,
 * `set_team`, `select_vehicle`, `set_map`, `start`, …), and hands the match off
 * through `onHostStart` for every seat once the room's `match_start` arrives.
 * Node-runnable: no DOM.
 */
import { RoomClient } from '../room/roomClient.ts';
import type { TeamArrangement } from '../../sim/matchRuleset.ts';
import type { RoomClientOptions, StorageLike } from '../room/roomClient.ts';
import { normalizeRoomCode } from '../room/protocol.ts';
import type { RoomChatEntry, RoomMatchStartPayload, RoomMode, RoomSnapshot } from '../room/protocol.ts';
import { roomToLobby } from '../room/roomPolicy.ts';
import type { SerializedLobby } from '../../net/lobby.ts';

type Unsubscribe = () => void;
type RoomCommand = Record<string, unknown>;

/** Marks a menu session object as a room session (main.ts routes the start on it). */
export const MULTIPLAYER_V2_SESSION: unique symbol = Symbol.for('cot.mp.v2.session');

/** What the menu (and the browser session owner) receives as `connection.session`. */
export interface V2RoomSession {
  readonly [MULTIPLAYER_V2_SESSION]: true;
  readonly roomInfo: { roomCode: string; peerId: string; hostId: string; hostName: string; mode: RoomMode };
  readonly client: RoomClient;
  /** The newest lobby the room published, in the shape the menu renders. */
  readonly lobby: SerializedLobby;
  readonly lastMatchStart: RoomMatchStartPayload | null;
  /** A policy command; rejections carry the room's code (`RoomError`). */
  command(command: RoomCommand): Promise<Record<string, unknown>>;
  /** The same as `command` (kept for callers that distinguish a host's command from a seat's submission). */
  submit(command: RoomCommand): Promise<Record<string, unknown>>;
  chat(text: string): Promise<void>;
  onLobby(listener: (lobby: SerializedLobby, room: RoomSnapshot) => void): Unsubscribe;
  onChat(listener: (entry: RoomChatEntry) => void): Unsubscribe;
  /** The room is gone for this seat (kicked, expired, resume denied, left, transport exhausted). */
  onClosed(listener: (reason: string) => void): Unsubscribe;
  /** Explicit leave (the seat goes, an admin migrates at once) and release. */
  close(reason?: string): void;
}

export interface RoomConnection {
  readonly generation: number;
  /** The admin seat is the room's host for the menu's controls; it follows the room's `adminId` (a migration moves it). */
  readonly role: 'host' | 'client';
  readonly mode: RoomMode;
  readonly roomInfo: V2RoomSession['roomInfo'];
  readonly session: V2RoomSession;
  readonly runtime: { onState(listener: (state: SerializedLobby) => void): Unsubscribe };
}

export interface RoomConnectRequest {
  kind: 'create' | 'join';
  mode: 'private' | 'lan';
  /** The room host's ws:// or wss:// origin (src/mp/session/endpoint.ts). */
  roomsUrl: string;
  roomCode?: string;
  player: { id: string; name: string };
  selection: { specId: string; mapId: string; gameMode?: string; equipment: string[]; camo: string; arrangement?: TeamArrangement | null };
  teamSize: number;
}

export interface RoomConnectionOptions {
  /** Private capabilities (localStorage in the browser, a memory map headless). */
  storage?: StorageLike | null;
  clientBuild?: string;
  /** Receipts inject a client bound to an in-process host or a scripted transport. */
  createRoomClient?: (options: RoomClientOptions) => RoomClient;
  /** The room's `match_start` reached this seat: enter the match (every seat, the host included). */
  onHostStart?(state: SerializedLobby, connection: RoomConnection): void;
  /** The room is gone for the menu-owned seat (never after `forget()`: the session owner holds it then). */
  onClose?(reason: string): void;
  onStatus?(status: { state: 'connecting' | 'reconnecting' | 'connected' }): void;
  onError?(error: unknown): void;
}

export interface RoomConnectionRuntime {
  connect(request: RoomConnectRequest): Promise<RoomConnection | null>;
  observe(listener: (state: SerializedLobby) => void): Unsubscribe;
  close(reason?: string, options?: { transportAlreadyClosed?: boolean }): void;
  forget(): void;
  readonly current: RoomConnection | null;
  readonly connecting: boolean;
}

export function isMultiplayerV2Session(value: unknown): value is V2RoomSession {
  return !!value && typeof value === 'object' && (value as Record<PropertyKey, unknown>)[MULTIPLAYER_V2_SESSION] === true;
}

/** `roomToLobby` produces the lobby wire shape; the menu renders it without a second validation. */
export function lobbyOf(room: RoomSnapshot): SerializedLobby {
  return roomToLobby(room) as unknown as SerializedLobby;
}

function connectFailure(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function validateConnectRequest(request: RoomConnectRequest): void {
  const validKind = request?.kind === 'create' || request?.kind === 'join';
  const validTeamSize = Number.isSafeInteger(request?.teamSize) && request.teamSize >= 1 && request.teamSize <= 14;
  const complete = validKind && Boolean(request.mode) && Boolean(request.player?.id) && Boolean(request.player?.name)
    && Boolean(request.selection?.specId) && Boolean(request.selection?.mapId) && validTeamSize;
  if (!complete) throw new TypeError('room connect request is incomplete');
  if (!String(request.roomsUrl ?? '').trim()) throw connectFailure('room_unconfigured', 'no room host is configured for this deployment');
  if (request.kind === 'join' && normalizeRoomCode(request.roomCode).length !== 6) throw connectFailure('invalid_room_code', 'Enter a six-character room code');
}

/**
 * Own one room acquisition for the Play menu. A superseded attempt (the menu
 * closed or switched modes while connecting) disposes its client instead of
 * publishing a stale lobby; a connected room keeps one state observation,
 * hands the match off, and survives `forget()` unchanged so the session owner
 * that took the connection keeps the seat, the capability and the socket.
 */
export function createRoomConnectionAdapter({
  storage = null,
  clientBuild = 'dev',
  createRoomClient = (options) => new RoomClient(options),
  onHostStart = () => {},
  onClose = () => {},
  onStatus = () => {},
  onError = () => {},
}: RoomConnectionOptions = {}): RoomConnectionRuntime {
  const required = [onHostStart, onClose, onStatus, onError, createRoomClient];
  if (required.some((entry) => typeof entry !== 'function')) throw new TypeError('room connection adapter requires every lifecycle port');

  let generation = 0;
  let pending: { generation: number; client: RoomClient } | null = null;
  let current: RoomConnection | null = null;
  /** After `forget()` the session owner holds the room; the menu's onClose stays silent. */
  let released: RoomConnection | null = null;
  let unsubscribeObservation: Unsubscribe | null = null;

  const clearObservation = () => { unsubscribeObservation?.(); unsubscribeObservation = null; };

  const buildConnection = (client: RoomClient, room: RoomSnapshot, mode: RoomMode, attemptGeneration: number): RoomConnection => {
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
      close: (reason = 'room_connection_closed') => {
        void reason;
        // The menu's own seat closes through the menu; a released seat (the session owner's) leaves on its own.
        if (current === connection) { close(); return; }
        if (released === connection) released = null;
        leave(connection, false);
      },
    };
    const connection: RoomConnection = {
      generation: attemptGeneration,
      get role() { return room.adminId === client.playerId ? 'host' : 'client'; },
      mode,
      roomInfo,
      session,
      runtime: { onState: (listener) => session.onLobby((next) => listener(next)) },
    };
    subscriptions.push(client.onState((next) => {
      room = next;
      lobby = lobbyOf(next);
      for (const listener of lobbyListeners) listener(lobby, next);
    }));
    subscriptions.push(client.onMatchStart((payload) => {
      lastMatchStart = payload;
      if (current === connection || released === connection) onHostStart(lobby, connection);
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
      onClose(reason);
    }));
    return connection;
  };

  /** Leave the room on this connection's socket and release the client (or only release it when the socket is gone). */
  const leave = (connection: RoomConnection, transportAlreadyClosed: boolean) => {
    const client = connection.session.client;
    if (transportAlreadyClosed) { client.dispose(); return; }
    void client.leave().finally(() => client.dispose());
  };

  const close = (reason = 'room_connection_closed', { transportAlreadyClosed = false }: { transportAlreadyClosed?: boolean } = {}) => {
    void reason; // the menu names a reason for its presentation; a leave is the seat's explicit departure
    generation++;
    clearObservation();
    const attempt = pending;
    pending = null;
    if (attempt) attempt.client.dispose();
    const connected = current;
    current = null;
    released = null;
    if (connected) leave(connected, transportAlreadyClosed);
  };

  const connect = async (request: RoomConnectRequest): Promise<RoomConnection | null> => {
    validateConnectRequest(request);
    if (pending || current) throw new Error('a room connection already owns this menu');
    const attemptGeneration = ++generation;
    const client = createRoomClient({
      endpoint: String(request.roomsUrl).trim(),
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
          settings: { teamSize: request.teamSize, mapId: request.selection.mapId, gameMode: request.selection.gameMode || 'standard', arrangement: request.selection.arrangement },
        })
        : await client.join({ roomCode: normalizeRoomCode(request.roomCode), selection });
      if (pending !== attempt || generation !== attemptGeneration) { client.dispose(); return null; }
      const connection = buildConnection(client, room, room.mode, attemptGeneration);
      current = connection;
      pending = null;
      onStatus({ state: 'connected' });
      return connection;
    } catch (error) {
      const canceled = pending !== attempt || generation !== attemptGeneration;
      if (pending === attempt) pending = null;
      client.dispose();
      if (canceled) return null;
      onError(error);
      // The room's own refusal carries the room's code (RoomError); an unreachable host carries `room_unreachable`
      // (RoomConnectError): both reach the menu's classifier as `error.code`.
      throw error;
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
    get current() { return current; },
    get connecting() { return pending !== null; },
  };
}
