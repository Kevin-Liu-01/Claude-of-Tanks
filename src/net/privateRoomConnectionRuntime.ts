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
  'createRoom' | 'joinRoom' | 'close' | 'onEvent' | 'sendSignal' |
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
  onError?(error: unknown): void;
}

interface ConnectionAttempt {
  generation: number;
  signaling: SignalingLike;
  session: HostSessionLike | ClientSessionLike | null;
  disposed: boolean;
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
  onError = (error) => console.error('[private-room]', error),
}: PrivateRoomConnectionOptions, adapters: ConnectionAdapters = DEFAULT_ADAPTERS):
PrivateRoomConnectionRuntime {
  const required = [loadIce, isVehicleAllowed, isCamoAllowed, isMapAllowed,
    onHostStart, onClientClose, onError, adapters.createSignaling,
    adapters.createHostSession, adapters.createClientSession, adapters.serializeLobby];
  if (required.some((entry) => typeof entry !== 'function')) {
    throw new TypeError('private room connection requires every lifecycle port');
  }

  let generation = 0;
  let pending: ConnectionAttempt | null = null;
  let current: PrivateRoomConnection | null = null;
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
    generation++;
    clearObservation();
    disposePending('room_connection_forgotten');
    current = null;
  };

  const connect = async (
    request: PrivateRoomConnectRequest,
  ): Promise<PrivateRoomConnection | null> => {
    if (!request || !['create', 'join'].includes(request.kind) ||
        !request.mode || !request.signalUrl || !request.player?.id ||
        !request.player?.name || !request.selection?.specId ||
        !request.selection?.mapId || !Number.isSafeInteger(request.teamSize) ||
        request.teamSize < 1 || request.teamSize > 7) {
      throw new TypeError('private room connect request is incomplete');
    }
    if (pending || current) throw new Error('a private room connection already owns this menu');

    const attemptGeneration = ++generation;
    const signaling = adapters.createSignaling(request.signalUrl);
    const attempt: ConnectionAttempt = {
      generation: attemptGeneration,
      signaling,
      session: null,
      disposed: false,
    };
    pending = attempt;
    let connection: PrivateRoomConnection | null = null;

    try {
      const roomRequest = request.kind === 'create'
        ? signaling.createRoom({
          player: request.player,
          mode: request.mode,
          maxPlayers: request.maxPlayers || 14,
        })
        : signaling.joinRoom({
          roomCode: request.roomCode,
          player: request.player,
        });
      const [roomInfo, ice] = await Promise.all([roomRequest, loadIce(request.mode)]);
      if (!generationIsLive(attemptGeneration) || pending !== attempt) {
        disposeAttempt(attempt, 'room_connection_superseded');
        return null;
      }

      const actualMode = roomInfo.mode || request.mode;
      const ownsHostSeat = request.kind === 'create' || roomInfo.hostId === roomInfo.peerId;
      if (ownsHostSeat) {
        let deferredStart: LobbyState | null = null;
        let hostSession: HostSessionLike | null = null;
        const start = (state: LobbyState) => {
          if (!hostSession || !connection) {
            deferredStart = state;
            return;
          }
          if (current === connection && generationIsLive(attemptGeneration)) {
            onHostStart(state, connection);
          }
        };
        hostSession = adapters.createHostSession({
          signaling,
          roomInfo,
          hostName: request.player.name,
          hostSpecId: request.selection.specId,
          hostEquipment: [...(request.selection.equipment || [])],
          hostCamo: request.selection.camo,
          mapId: request.selection.mapId,
          gameMode: request.selection.gameMode || 'standard',
          teamSize: request.teamSize,
          iceServers: ice.iceServers,
          relayOnly: ice.relayOnly,
          iceExpiresInSeconds: ice.expiresInSeconds,
          refreshIceConfiguration: () => loadIce(actualMode),
          isVehicleAllowed,
          isCamoAllowed,
          isMapAllowed,
          onStart: start,
          onError,
        });
        attempt.session = hostSession;
        connection = {
          generation: attemptGeneration,
          role: 'host',
          mode: actualMode,
          signaling,
          session: hostSession,
          roomInfo,
          ice,
          runtime: hostSession.runtime,
        };
        current = connection;
        pending = null;
        if (deferredStart) onHostStart(deferredStart, connection);
      } else {
        let clientSession: ClientSessionLike | null = null;
        const sessionClosed = (reason: string) => {
          if (!generationIsLive(attemptGeneration)) return;
          if (clientSession && (current?.session === clientSession || pending === attempt)) {
            onClientClose(reason);
          }
        };
        clientSession = adapters.createClientSession({
          signaling,
          roomInfo,
          iceServers: ice.iceServers,
          relayOnly: ice.relayOnly,
          iceExpiresInSeconds: ice.expiresInSeconds,
          refreshIceConfiguration: () => loadIce(actualMode),
          onError,
          onClose: sessionClosed,
        });
        attempt.session = clientSession;
        const runtime = observeClientRoom(await clientSession.ready);
        if (!generationIsLive(attemptGeneration) || pending !== attempt) {
          disposeAttempt(attempt, 'room_connection_superseded');
          return null;
        }
        connection = {
          generation: attemptGeneration,
          role: 'client',
          mode: actualMode,
          signaling,
          session: clientSession,
          roomInfo,
          ice,
          runtime,
        };
        current = connection;
        pending = null;
        // Reliable room commands are ordered. Replaying the complete garage
        // selection after the peer is ready makes a truly cold invite join
        // converge before the user can ready up.
        await Promise.resolve(clientSession.submit({
          type: 'select_vehicle', specId: request.selection.specId,
        }));
        await Promise.resolve(clientSession.submit({
          type: 'select_equipment', equipment: [...(request.selection.equipment || [])],
        }));
        await Promise.resolve(clientSession.submit({
          type: 'select_camo', camo: request.selection.camo,
        }));
      }
      return connection;
    } catch (error) {
      const canceled = !generationIsLive(attemptGeneration) || pending !== attempt;
      if (pending === attempt) pending = null;
      if (current?.generation === attemptGeneration) current = null;
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
