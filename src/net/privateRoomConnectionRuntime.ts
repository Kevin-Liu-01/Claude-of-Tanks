import type { RuntimeValue } from '../runtimeTypes.ts';
import {
  serializeLobby,
  readSerializedLobby,
  type LobbyState as LobbyModel,
  type SerializedLobby,
} from './lobby.ts';
import { RoomSignalingClient } from './signalingClient.ts';
import {
  PrivateRoomClientSession,
  PrivateRoomHostSession,
  type PrivateRoomAdapter,
  type PrivateRoomClientOptions,
  type PrivateRoomHostOptions,
} from './privateRoomSession.ts';
import type { IceConfiguration } from './iceConfig.ts';

type Unsubscribe = () => void;
type LobbyState = SerializedLobby;

interface RoomPlayerIdentity {
  id: string;
  name: string;
}

interface RoomSelection {
  specId: string;
  mapId: string;
  gameMode?: string;
  equipment: string[];
  camo: string;
}

interface RoomInfo {
  roomCode: string;
  peerId: string;
  hostId?: string;
  mode?: string;
}

type SignalingLike = Pick<
  RoomSignalingClient,
  'connect' | 'createRoom' | 'joinRoom' | 'close' | 'onEvent' | 'sendSignal' |
  'restartRoomSession' | 'setEventPollInterval'
>;

interface RoomStateRuntime {
  onState(listener: (state: LobbyState) => void): Unsubscribe;
}

type HostSessionLike = Pick<
  PrivateRoomHostSession,
  'roomInfo' | 'lobby' | 'runtime' | 'command' | 'close'
>;

type ClientSessionLike = Pick<
  PrivateRoomClientSession,
  'roomInfo' | 'ready' | 'submit' | 'close'
>;

interface ConnectionAdapters {
  createSignaling(url: string): SignalingLike;
  createHostSession(options: PrivateRoomHostOptions): HostSessionLike;
  createClientSession(options: PrivateRoomClientOptions): ClientSessionLike;
  serializeLobby(lobby: LobbyModel): LobbyState;
}

export interface PrivateRoomConnectRequest {
  kind: 'create' | 'join';
  mode: string;
  signalUrl: string;
  roomCode?: string;
  player: RoomPlayerIdentity;
  selection: RoomSelection;
  teamSize: number;
  maxPlayers?: number;
}

interface PrivateRoomConnectionBase {
  readonly generation: number;
  readonly mode: string;
  readonly signaling: SignalingLike;
  readonly roomInfo: RoomInfo;
  readonly ice: IceConfiguration;
  readonly runtime: RoomStateRuntime;
}

export interface PrivateRoomHostConnection extends PrivateRoomConnectionBase {
  readonly role: 'host';
  readonly session: HostSessionLike;
}

export interface PrivateRoomClientConnection extends PrivateRoomConnectionBase {
  readonly role: 'client';
  readonly session: ClientSessionLike;
}

export type PrivateRoomConnection = PrivateRoomHostConnection | PrivateRoomClientConnection;

interface PrivateRoomConnectionOptions {
  loadIce(mode: string): Promise<IceConfiguration>;
  isVehicleAllowed(specId: string): boolean;
  isCamoAllowed(camo: string): boolean;
  isMapAllowed(mapId: string): boolean;
  onHostStart?(state: LobbyState, connection: PrivateRoomConnection): void;
  onClientClose?(reason: string): void;
  onClose?(reason: string): void;
  onStatus?(status: { state: 'connecting' | 'reconnecting' | 'connected' }): void;
  onError?(error: RuntimeValue): void;
}

interface ConnectionAttempt {
  generation: number;
  signaling: SignalingLike;
  session: HostSessionLike | ClientSessionLike | null;
  disposed: boolean;
}

interface AcquiredRoom {
  roomInfo: RoomInfo;
  ice: IceConfiguration;
}

export interface PrivateRoomConnectionRuntime {
  connect(request: PrivateRoomConnectRequest): Promise<PrivateRoomConnection | null>;
  observe(listener: (state: LobbyState) => void): Unsubscribe;
  close(reason?: string, options?: { transportAlreadyClosed?: boolean }): void;
  forget(): void;
  readonly current: PrivateRoomConnection | null;
  readonly connecting: boolean;
}

const DEFAULT_ADAPTERS: ConnectionAdapters = {
  createSignaling: (url) => new RoomSignalingClient({ url }),
  createHostSession: (options) => new PrivateRoomHostSession(options),
  createClientSession: (options) => new PrivateRoomClientSession(options),
  serializeLobby,
};

function observeClientRoom(adapter: PrivateRoomAdapter): RoomStateRuntime {
  return {
    onState: (listener) => adapter.onState((state) => listener(readSerializedLobby(state))),
  };
}

function validateConnectRequest(request: PrivateRoomConnectRequest): void {
  const validKind = request?.kind === 'create' || request?.kind === 'join';
  const validTeamSize = Number.isSafeInteger(request?.teamSize)
    && request.teamSize >= 1
    && request.teamSize <= 7;
  const complete = validKind
    && Boolean(request.mode)
    && Boolean(request.signalUrl)
    && Boolean(request.player?.id)
    && Boolean(request.player?.name)
    && Boolean(request.selection?.specId)
    && Boolean(request.selection?.mapId)
    && validTeamSize;
  if (!complete) throw new TypeError('private room connect request is incomplete');
}

/**
 * Own one private/LAN room acquisition generation.
 *
 * The menu may disappear or switch modes while signaling, TURN discovery, or
 * the initial peer connection is still pending. Closing this owner invalidates
 * that generation immediately; any late result is disposed instead of
 * publishing a stale lobby back into the UI. Once connected, the same owner
 * retains the state subscription and exact teardown order through handoff.
 */
export function createPrivateRoomConnectionRuntime({
  loadIce,
  isVehicleAllowed,
  isCamoAllowed,
  isMapAllowed,
  onHostStart = () => {},
  onClientClose = () => {},
  onClose,
  onStatus = () => {},
  onError = (error) => console.error('[private-room]', error),
}: PrivateRoomConnectionOptions, adapters: ConnectionAdapters = DEFAULT_ADAPTERS):
PrivateRoomConnectionRuntime {
  const required = [loadIce, isVehicleAllowed, isCamoAllowed, isMapAllowed,
    onHostStart, onClientClose, onError, adapters.createSignaling,
    adapters.createHostSession, adapters.createClientSession, adapters.serializeLobby];
  if (required.some((entry) => typeof entry !== 'function')) {
    throw new TypeError('private room connection requires every lifecycle port');
  }
  if ((onClose !== undefined && typeof onClose !== 'function') ||
      typeof onStatus !== 'function') throw new TypeError('room lifecycle callbacks must be functions');

  let generation = 0;
  let pending: ConnectionAttempt | null = null;
  let current: PrivateRoomConnection | null = null;
  let releasedGeneration: number | null = null;
  let unsubscribeState: Unsubscribe | null = null;

  const clearObservation = () => {
    unsubscribeState?.();
    unsubscribeState = null;
  };

  const generationIsLive = (value: number): boolean => generation === value;

  const disposeAttempt = (attempt: ConnectionAttempt, reason: string) => {
    if (attempt.disposed) return;
    attempt.disposed = true;
    if (attempt.session) attempt.session.close(reason);
    else attempt.signaling.close(reason);
  };

  const disposePending = (reason: string) => {
    const attempt = pending;
    pending = null;
    if (attempt) disposeAttempt(attempt, reason);
  };

  const close = (
    reason = 'room_connection_closed',
    { transportAlreadyClosed = false }: { transportAlreadyClosed?: boolean } = {},
  ) => {
    generation++;
    releasedGeneration = null;
    clearObservation();
    if (transportAlreadyClosed) {
      if (pending) pending.disposed = true;
      pending = null;
    } else disposePending(reason);
    const connected = current;
    current = null;
    if (connected && !transportAlreadyClosed) connected.session.close(reason);
  };

  const forget = () => {
    // Reopening a retained lobby repeats this handoff after current is already
    // null. Keep the exact terminal lease until close or a new acquisition.
    if (current) releasedGeneration = current.generation;
    generation++;
    clearObservation();
    disposePending('room_connection_forgotten');
    current = null;
  };

  const attemptIsCurrent = (attempt: ConnectionAttempt): boolean =>
    generationIsLive(attempt.generation) && pending === attempt;

  const clearCurrentGeneration = (value: number): void => {
    const connected = current;
    if (connected && connected.generation === value) current = null;
  };

  const sessionClosed = (attempt: ConnectionAttempt, reason: string, client: boolean) => {
    const released = releasedGeneration === attempt.generation;
    if (attempt.disposed || (!released && (!generationIsLive(attempt.generation) ||
        (pending !== attempt && current?.generation !== attempt.generation)))) return;
    // The session has already closed its resources. Retire ownership before
    // callbacks can synchronously retry or an old ready promise can publish.
    attempt.disposed = true;
    releasedGeneration = null;
    generation++;
    clearObservation();
    if (pending === attempt) pending = null;
    clearCurrentGeneration(attempt.generation);
    if (onClose) onClose(reason);
    else if (client) onClientClose(reason);
  };

  const reportError = (attempt: ConnectionAttempt, error: RuntimeValue) => {
    if (generationIsLive(attempt.generation) && !attempt.disposed) onError(error);
  };

  const acquireRoom = async (
    request: PrivateRoomConnectRequest,
    attempt: ConnectionAttempt,
  ): Promise<AcquiredRoom | null> => {
    const { signaling } = attempt;
    const iceRequest = loadIce(request.mode);
    let roomInfo: RoomInfo;
    let ice: IceConfiguration;
    if (request.kind === 'join') {
      [, ice] = await Promise.all([signaling.connect(), iceRequest]);
      if (!attemptIsCurrent(attempt)) {
        disposeAttempt(attempt, 'room_connection_superseded');
        return null;
      }
      roomInfo = await signaling.joinRoom({
        roomCode: request.roomCode,
        player: request.player,
      });
    } else {
      [roomInfo, ice] = await Promise.all([
        signaling.createRoom({
          player: request.player,
          mode: request.mode,
          maxPlayers: request.maxPlayers || 14,
        }),
        iceRequest,
      ]);
    }
    if (attemptIsCurrent(attempt)) return { roomInfo, ice };
    disposeAttempt(attempt, 'room_connection_superseded');
    return null;
  };

  const connectHost = (
    request: PrivateRoomConnectRequest,
    attempt: ConnectionAttempt,
    acquired: AcquiredRoom,
    actualMode: string,
  ): PrivateRoomHostConnection => {
    let deferredStart: LobbyState | null = null;
    let hostSession: HostSessionLike | null = null;
    let connection: PrivateRoomHostConnection | null = null;
    const start = (state: LobbyState) => {
      if (!hostSession || !connection) {
        deferredStart = state;
        return;
      }
      if (current === connection && generationIsLive(attempt.generation)) {
        onHostStart(state, connection);
      }
    };
    hostSession = adapters.createHostSession({
      signaling: attempt.signaling,
      roomInfo: acquired.roomInfo,
      hostName: request.player.name,
      hostSpecId: request.selection.specId,
      hostEquipment: [...(request.selection.equipment || [])],
      hostCamo: request.selection.camo,
      mapId: request.selection.mapId,
      gameMode: request.selection.gameMode || 'standard',
      teamSize: request.teamSize,
      iceServers: acquired.ice.iceServers,
      relayOnly: acquired.ice.relayOnly,
      iceExpiresInSeconds: acquired.ice.expiresInSeconds,
      refreshIceConfiguration: () => loadIce(actualMode),
      isVehicleAllowed,
      isCamoAllowed,
      isMapAllowed,
      onStart: start,
      onError: (error) => reportError(attempt, error),
      onClose: (reason) => sessionClosed(attempt, reason, false),
    });
    attempt.session = hostSession;
    connection = {
      generation: attempt.generation,
      role: 'host',
      mode: actualMode,
      signaling: attempt.signaling,
      session: hostSession,
      roomInfo: acquired.roomInfo,
      ice: acquired.ice,
      runtime: hostSession.runtime,
    };
    current = connection;
    pending = null;
    onStatus({ state: 'connected' });
    if (deferredStart) onHostStart(deferredStart, connection);
    return connection;
  };

  const replayClientSelection = async (
    session: ClientSessionLike,
    selection: RoomSelection,
  ): Promise<void> => {
    await Promise.resolve(session.submit({
      type: 'select_vehicle', specId: selection.specId,
    }));
    await Promise.resolve(session.submit({
      type: 'select_equipment', equipment: [...(selection.equipment || [])],
    }));
    await Promise.resolve(session.submit({
      type: 'select_camo', camo: selection.camo,
    }));
  };

  const connectClient = async (
    request: PrivateRoomConnectRequest,
    attempt: ConnectionAttempt,
    acquired: AcquiredRoom,
    actualMode: string,
  ): Promise<PrivateRoomClientConnection | null> => {
    let clientSession: ClientSessionLike | null = null;
    clientSession = adapters.createClientSession({
      signaling: attempt.signaling,
      roomInfo: acquired.roomInfo,
      iceServers: acquired.ice.iceServers,
      relayOnly: acquired.ice.relayOnly,
      iceExpiresInSeconds: acquired.ice.expiresInSeconds,
      refreshIceConfiguration: () => loadIce(actualMode),
      onError: (error) => reportError(attempt, error),
      onClose: (reason) => sessionClosed(attempt, reason, true),
      onConnectionState: (state) => {
        if (!generationIsLive(attempt.generation) || attempt.disposed) return;
        if (state === 'connected') onStatus({ state: 'connected' });
        else if (state === 'failed' || state === 'disconnected') {
          onStatus({ state: 'reconnecting' });
        }
      },
    });
    attempt.session = clientSession;
    const runtime = observeClientRoom(await clientSession.ready);
    if (!attemptIsCurrent(attempt)) {
      disposeAttempt(attempt, 'room_connection_superseded');
      return null;
    }
    const connection: PrivateRoomClientConnection = {
      generation: attempt.generation,
      role: 'client',
      mode: actualMode,
      signaling: attempt.signaling,
      session: clientSession,
      roomInfo: acquired.roomInfo,
      ice: acquired.ice,
      runtime,
    };
    current = connection;
    pending = null;
    await replayClientSelection(clientSession, request.selection);
    if (current !== connection || !generationIsLive(attempt.generation)) {
      disposeAttempt(attempt, 'room_connection_superseded');
      return null;
    }
    onStatus({ state: 'connected' });
    return connection;
  };

  const connect = async (
    request: PrivateRoomConnectRequest,
  ): Promise<PrivateRoomConnection | null> => {
    validateConnectRequest(request);
    if (pending || current) throw new Error('a private room connection already owns this menu');

    const attemptGeneration = ++generation;
    releasedGeneration = null;
    const signaling = adapters.createSignaling(request.signalUrl);
    const attempt: ConnectionAttempt = {
      generation: attemptGeneration,
      signaling,
      session: null,
      disposed: false,
    };
    pending = attempt;
    onStatus({ state: 'connecting' });
    try {
      // A cold invite must have its ICE/TURN generation ready before joining
      // announces the peer to the host. Previously both operations started at
      // once; a slow first /api/ice response let the host send its offer and
      // candidates before the client session installed a signaling listener.
      // Warm the WebSocket concurrently, then join only when RTC construction
      // can begin immediately. Hosts retain the faster parallel create path:
      // nobody can discover their new room code until this operation returns.
      const acquired = await acquireRoom(request, attempt);
      if (!acquired) return null;
      const actualMode = acquired.roomInfo.mode || request.mode;
      const ownsHostSeat = request.kind === 'create'
        || acquired.roomInfo.hostId === acquired.roomInfo.peerId;
      if (ownsHostSeat) return connectHost(request, attempt, acquired, actualMode);
      return await connectClient(request, attempt, acquired, actualMode);
    } catch (error) {
      const canceled = !generationIsLive(attemptGeneration) || attempt.disposed;
      if (pending === attempt) pending = null;
      clearCurrentGeneration(attemptGeneration);
      disposeAttempt(
        attempt,
        canceled ? 'room_connection_superseded' : 'connection_failed',
      );
      if (canceled) return null;
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
      const guarded = (state: LobbyState) => {
        if (current === observed && generationIsLive(observed.generation)) listener(state);
      };
      unsubscribeState = observed.runtime.onState(guarded);
      if (observed.role === 'host') {
        guarded(adapters.serializeLobby(observed.session.lobby));
      }
      return () => {
        if (current !== observed) return;
        clearObservation();
      };
    },
    close,
    forget,
    get current() { return current; },
    get connecting() { return pending !== null; },
  };
}
