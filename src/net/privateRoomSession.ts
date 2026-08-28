import { createLobby } from './lobby.ts';
import { LobbyHostRuntime } from './lobbyRuntime.js';
import {
  createWebRTCPeer,
  type MatchTransport,
  type RtcSignal,
  type WebRtcPeerSession,
} from './webrtcPeer.ts';
import { MatchClientRuntime } from './matchRuntime.js';
import { maybeCreateAdverseNetworkTransport } from './adverseNetworkTransport.js';
import {
  RtcIceLease,
  type RtcIceLeaseConfiguration,
} from './rtcIceLease.ts';

type Unsubscribe = () => void;
type RoomCommand = Record<string, unknown>;

interface RoomPlayer {
  id?: string;
  name?: string;
  specId?: string;
  equipment?: string[];
  camo?: string;
  team?: string;
}

interface RoomPeer {
  peerId: string;
  player?: RoomPlayer;
  sessionId?: string;
}

interface RoomInfo {
  roomCode: string;
  peerId: string;
  hostId?: string;
  maxPlayers?: number;
  mode?: string;
  peers?: RoomPeer[];
}

interface SignalPayload extends Partial<RoomPeer> {
  roomCode?: string;
  fromPeerId?: string;
  fromSessionId?: string;
  reason?: string;
  signal?: RtcSignal;
  peers?: RoomPeer[];
}

interface SignalingEvent {
  type: string;
  payload?: SignalPayload;
}

interface SignalingPort {
  onEvent(listener: (message: SignalingEvent) => void): Unsubscribe;
  sendSignal(peerId: string, signal: RtcSignal, toSessionId: string): unknown;
  restartRoomSession(reason: string): Promise<unknown>;
  setEventPollInterval?(intervalMs: number): void;
  close(reason: string): void;
}

interface LobbyState {
  [key: string]: unknown;
}

interface RoomState {
  players?: RoomPlayer[];
}

interface LobbyHostPort {
  onState(listener: (state: LobbyState) => void): Unsubscribe;
  attachPeer(options: {
    peerId: string;
    transport: MatchTransport;
    player: { name: string };
  }): void;
  detachPeer(peerId: string, reason: string): void;
  command(peerId: string, command: RoomCommand): unknown;
  releaseTransports(): unknown;
  close(reason: string): void;
}

interface MatchHostPort {
  detachPeer?(peerId: string, reason: string): void;
  rejoinPeer(options: {
    peerId: string;
    transport: MatchTransport;
    player: { name: string };
    metadata: { mode: string };
  }): void;
}

interface MatchClientPort {
  roomState?: RoomState;
  errors: unknown[];
  closed: boolean;
  connected: boolean;
  transport: MatchTransport;
  onConnection(listener: (connected: boolean) => void): Unsubscribe;
  onRoomState(listener: (state: RoomState) => void): Unsubscribe;
  connect(metadata: { mode: string; phase: string }): void;
  submitRoomCommand(command: RoomCommand): unknown;
  reconnectTransport(
    transport: MatchTransport,
    metadata: { mode: string; phase: string },
  ): void;
  replaceTransport(transport: MatchTransport): void;
  beginMatchHandshake(metadata: { mode: string }): void;
  close(reason: string): void;
}

export interface PrivateRoomAdapter {
  onState(listener: (state: RoomState) => void): Unsubscribe;
  submit(command: RoomCommand): unknown;
  readonly errors: unknown[];
  readonly closed: boolean;
}

interface SessionPeer extends WebRtcPeerSession {
  sessionId: string;
}

export interface PrivateRoomHostOptions {
  signaling?: SignalingPort;
  roomInfo?: RoomInfo;
  hostName?: string;
  hostSpecId?: string | null;
  hostEquipment?: string[];
  hostCamo?: string;
  mapId?: string;
  gameMode?: string;
  teamSize?: number;
  iceServers?: RTCIceServer[];
  relayOnly?: boolean;
  iceExpiresInSeconds?: number;
  refreshIceConfiguration?: (() => Promise<RtcIceLeaseConfiguration>) | null;
  RTCPeerConnectionImpl?: typeof RTCPeerConnection | null;
  isVehicleAllowed?: (specId: string) => boolean;
  isCamoAllowed?: (camo: string) => boolean;
  isMapAllowed?: (mapId: string) => boolean;
  onStart?: ((state: LobbyState) => void) | null;
  onError?: ((error: unknown) => void) | null;
}

export interface PrivateRoomClientOptions {
  signaling?: SignalingPort;
  roomInfo?: RoomInfo;
  iceServers?: RTCIceServer[];
  relayOnly?: boolean;
  iceExpiresInSeconds?: number;
  refreshIceConfiguration?: (() => Promise<RtcIceLeaseConfiguration>) | null;
  RTCPeerConnectionImpl?: typeof RTCPeerConnection | null;
  onError?: ((error: unknown) => void) | null;
  onClose?: ((reason: string) => void) | null;
  onConnectionState?: ((state: RTCPeerConnectionState) => void) | null;
  disconnectedRebuildDelayMs?: number;
  failedRebuildDelayMs?: number;
  connectTimeoutMs?: number;
  initialRebuildDelaysMs?: number[];
}

const createTypedLobby = createLobby as unknown as (options: {
  roomCode: string;
  hostId: string;
  hostName?: string;
  hostSpecId: string | null;
  hostEquipment: string[];
  hostCamo: string;
  maxPlayers: number;
  mode: string;
  mapId: string;
  gameMode: string;
  teamSize: number;
}) => LobbyState;

const TypedLobbyHostRuntime = LobbyHostRuntime as unknown as new (options: {
  lobby: LobbyState;
  isVehicleAllowed: (specId: string) => boolean;
  isCamoAllowed: (camo: string) => boolean;
  isMapAllowed: (mapId: string) => boolean;
  onStart: ((state: LobbyState) => void) | null;
}) => LobbyHostPort;

const TypedMatchClientRuntime = MatchClientRuntime as unknown as new (options: {
  transport: MatchTransport;
  playerId: string;
}) => MatchClientPort;

const wrapAdverseTransport = maybeCreateAdverseNetworkTransport as unknown as (
  transport: MatchTransport,
) => MatchTransport;

function errorCode(error: unknown, fallback: string): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) return fallback;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && code ? code : fallback;
}

/**
 * Compose signaling, one WebRTC peer per remote participant, and canonical
 * lobby policy for a browser-hosted LAN/private room.
 */
export class PrivateRoomHostSession {
  readonly signaling: SignalingPort;
  readonly roomInfo: RoomInfo;
  private readonly iceLease: RtcIceLease;
  readonly RTCPeerConnectionImpl: typeof RTCPeerConnection | null;
  readonly isVehicleAllowed: (specId: string) => boolean;
  readonly isCamoAllowed: (camo: string) => boolean;
  readonly isMapAllowed: (mapId: string) => boolean;
  readonly onError: ((error: unknown) => void) | null;
  readonly peers = new Map<string, SessionPeer>();
  readonly lobby: LobbyState;
  readonly runtime: LobbyHostPort;
  matchRuntime: MatchHostPort | null = null;
  private readonly unsubscribeSignal: Unsubscribe;

  constructor({
    signaling,
    roomInfo,
    hostName,
    hostSpecId = null,
    hostEquipment = [],
    hostCamo = 'factory',
    mapId = 'random',
    gameMode = 'standard',
    teamSize = 2,
    iceServers = [],
    relayOnly = false,
    iceExpiresInSeconds,
    refreshIceConfiguration = null,
    RTCPeerConnectionImpl = null,
    isVehicleAllowed = () => true,
    isCamoAllowed = () => true,
    isMapAllowed = () => true,
    onStart = null,
    onError = null,
  }: PrivateRoomHostOptions = {}) {
    if (!signaling || !roomInfo || !roomInfo.peerId || !roomInfo.roomCode) {
      throw new TypeError('signaling and created room info are required');
    }
    this.signaling = signaling;
    this.roomInfo = roomInfo;
    this.iceLease = new RtcIceLease({
      iceServers,
      relayOnly,
      expiresInSeconds: iceExpiresInSeconds,
    }, { refresh: refreshIceConfiguration });
    this.RTCPeerConnectionImpl = RTCPeerConnectionImpl;
    this.isVehicleAllowed = isVehicleAllowed;
    this.isCamoAllowed = isCamoAllowed;
    this.isMapAllowed = isMapAllowed;
    this.onError = onError;
    this.lobby = createTypedLobby({
      roomCode: roomInfo.roomCode,
      hostId: roomInfo.peerId,
      hostName,
      hostSpecId,
      hostEquipment,
      hostCamo,
      maxPlayers: roomInfo.maxPlayers || 14,
      mode: roomInfo.mode || 'private',
      gameMode,
      mapId,
      teamSize,
    });
    this.runtime = new TypedLobbyHostRuntime({
      lobby: this.lobby,
      isVehicleAllowed,
      isCamoAllowed,
      isMapAllowed,
      onStart,
    });
    this.unsubscribeSignal = signaling.onEvent((message) => this.#event(message));
    for (const peer of roomInfo.peers || []) {
      if (peer.peerId === roomInfo.peerId) continue;
      this.#joinPeer(peer).catch((error) => this.#fail(error));
    }
  }

  #fail(error: unknown): void {
    if (this.onError) this.onError(error);
  }

  #event(message: SignalingEvent): void {
    const payload = message?.payload;
    if (!payload || payload.roomCode !== this.roomInfo.roomCode) return;
    if (message.type === 'peer_joined') {
      if (!payload.peerId) return;
      this.#joinPeer(payload as RoomPeer).catch((error) => this.#fail(error));
    } else if (message.type === 'room_signal') {
      const session = payload.fromPeerId ? this.peers.get(payload.fromPeerId) : null;
      if (session && payload.signal && payload.fromSessionId === session.sessionId) {
        session.handleSignal(payload.signal).catch((error) => this.#fail(error));
      }
    } else if (message.type === 'peer_left') {
      if (!payload.peerId) return;
      const session = this.peers.get(payload.peerId);
      // Remove the canonical room seat before closing the RTC channels. Their
      // close callback is intentionally treated as recoverable transport loss.
      this.matchRuntime?.detachPeer?.(payload.peerId, 'peer_left');
      this.runtime.detachPeer(payload.peerId, 'peer_left');
      if (session) session.close('peer_left');
      this.peers.delete(payload.peerId);
    } else if (message.type === 'signaling_resumed') {
      // The durable room response is the source of truth after a socket gap.
      // Reconcile peers that may have joined while this host instance could
      // not receive pub/sub or mailbox wake-ups.
      for (const peer of payload.peers || []) {
        if (peer.peerId === this.roomInfo.peerId) continue;
        this.#joinPeer(peer).catch((error) => this.#fail(error));
      }
    }
  }

  async #joinPeer({ peerId, player, sessionId: rawSessionId }: RoomPeer): Promise<void> {
    const sessionId = String(rawSessionId || '');
    const existing = this.peers.get(peerId);
    if (existing && existing.sessionId === sessionId) {
      if (['new', 'connecting', 'connected'].includes(existing.connectionState)) return;
      if (['disconnected', 'failed'].includes(existing.connectionState)) {
        existing.restartIce();
        return;
      }
      // A bounded initial-connect timeout leaves a closed peer in the map
      // until the durable signaling member resumes. Rebuild it here instead
      // of trying to restart a closed RTCPeerConnection.
    }
    if (existing) {
      existing.close('peer_replaced');
      this.peers.delete(peerId);
    }
    if (this.iceLease.needsRefresh()) await this.iceLease.refreshIfNeeded();
    const ice = this.iceLease.current();
    const session = createWebRTCPeer({
      role: 'host',
      iceServers: ice.iceServers,
      relayOnly: ice.relayOnly,
      RTCPeerConnectionImpl: this.RTCPeerConnectionImpl,
      onSignal: (signal) => this.signaling.sendSignal(peerId, signal, sessionId),
    }) as SessionPeer;
    session.sessionId = sessionId;
    this.peers.set(peerId, session);
    await session.start();
    const transport = await session.transportReady;
    const cleanPlayer = { name: player && player.name || 'Player' };
    if (this.matchRuntime) {
      try {
        this.matchRuntime.rejoinPeer({
          peerId,
          transport,
          player: cleanPlayer,
          metadata: { mode: this.roomInfo.mode || 'private' },
        });
      } catch (error) {
        session.close(errorCode(error, 'room_rejoin_failed'));
        this.peers.delete(peerId);
        throw error;
      }
    } else {
      this.runtime.attachPeer({ peerId, transport, player: cleanPlayer });
    }
  }

  command(command: RoomCommand): unknown {
    return this.runtime.command(this.roomInfo.peerId, command);
  }

  /** Release open remote channels for AuthoritativeMatchRuntime attachment. */
  takeMatchChannels(): unknown {
    // Keep rendezvous listening after handoff. Gameplay never traverses this
    // socket, but a browser that reloads after a round needs it to establish
    // a fresh WebRTC channel into the still-live room.
    return this.runtime.releaseTransports();
  }

  bindMatchRuntime(runtime: MatchHostPort | null): void {
    this.matchRuntime = runtime || null;
  }

  close(reason = 'host_closed'): void {
    if (this.unsubscribeSignal) this.unsubscribeSignal();
    this.runtime.close(reason);
    for (const session of this.peers.values()) session.close(reason);
    this.peers.clear();
    this.signaling.close(reason);
  }
}

export class PrivateRoomClientSession {
  readonly signaling: SignalingPort;
  readonly roomInfo: RoomInfo & { hostId: string };
  readonly onError: ((error: unknown) => void) | null;
  readonly onClose: ((reason: string) => void) | null;
  private readonly iceLease: RtcIceLease;
  readonly RTCPeerConnectionImpl: typeof RTCPeerConnection | null;
  readonly onConnectionState: ((state: RTCPeerConnectionState) => void) | null;
  readonly disconnectedRebuildDelayMs: number;
  readonly failedRebuildDelayMs: number;
  readonly connectTimeoutMs: number;
  readonly initialRebuildDelaysMs: number[];
  recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  replacePromise: Promise<PrivateRoomAdapter | void> | null = null;
  runtimeConnectionUnsubscribe: Unsubscribe | null = null;
  runtimeConnectedOnce = false;
  suppressRuntimeDisconnect = false;
  closed = false;
  runtime: MatchClientPort | null = null;
  hostSessionId: string;
  peer: WebRtcPeerSession;
  readonly unsubscribeSignal: Unsubscribe;
  readonly ready: Promise<PrivateRoomAdapter>;

  constructor({
    signaling,
    roomInfo,
    iceServers = [],
    relayOnly = false,
    iceExpiresInSeconds,
    refreshIceConfiguration = null,
    RTCPeerConnectionImpl = null,
    onError = null,
    onClose = null,
    onConnectionState = null,
    disconnectedRebuildDelayMs = 8_000,
    failedRebuildDelayMs = 2_000,
    connectTimeoutMs = 60_000,
    initialRebuildDelaysMs = [250, 1_000],
  }: PrivateRoomClientOptions = {}) {
    if (!signaling || !roomInfo || !roomInfo.peerId || !roomInfo.hostId) {
      throw new TypeError('signaling and joined room info are required');
    }
    this.signaling = signaling;
    this.roomInfo = roomInfo as RoomInfo & { hostId: string };
    this.onError = onError;
    this.onClose = typeof onClose === 'function' ? onClose : null;
    this.iceLease = new RtcIceLease({
      iceServers,
      relayOnly,
      expiresInSeconds: iceExpiresInSeconds,
    }, { refresh: refreshIceConfiguration });
    this.RTCPeerConnectionImpl = RTCPeerConnectionImpl;
    this.onConnectionState = typeof onConnectionState === 'function' ? onConnectionState : null;
    if (!Number.isFinite(disconnectedRebuildDelayMs) || disconnectedRebuildDelayMs < 0 ||
        !Number.isFinite(failedRebuildDelayMs) || failedRebuildDelayMs < 0 ||
        !Number.isFinite(connectTimeoutMs) || connectTimeoutMs <= 0) {
      throw new TypeError('RTC rebuild delays must be non-negative milliseconds');
    }
    if (!Array.isArray(initialRebuildDelaysMs) || initialRebuildDelaysMs.some(
      (delay) => !Number.isFinite(delay) || delay < 0,
    )) throw new TypeError('initial RTC rebuild delays must be non-negative milliseconds');
    this.disconnectedRebuildDelayMs = disconnectedRebuildDelayMs;
    this.failedRebuildDelayMs = failedRebuildDelayMs;
    this.connectTimeoutMs = connectTimeoutMs;
    this.initialRebuildDelaysMs = [...initialRebuildDelaysMs];
    this.hostSessionId = String(
      roomInfo.peers?.find((peer) => peer.peerId === roomInfo.hostId)?.sessionId || '',
    );
    this.peer = this.#createPeer();
    this.unsubscribeSignal = signaling.onEvent((message: SignalingEvent) => {
      const payload = message?.payload;
      if (message && message.type === 'room_signal' && payload?.signal &&
          payload.roomCode === roomInfo.roomCode &&
          payload.fromPeerId === roomInfo.hostId &&
          payload.fromSessionId === this.hostSessionId) {
        this.peer.handleSignal(payload.signal).catch((error) => {
          if (this.onError) this.onError(error);
        });
      } else if (message && message.type === 'peer_joined' && payload &&
                 payload.roomCode === roomInfo.roomCode &&
                 payload.peerId === roomInfo.hostId) {
        const nextSessionId = String(payload.sessionId || '');
        if (nextSessionId && nextSessionId !== this.hostSessionId) {
          this.hostSessionId = nextSessionId;
          this.#replacePeer().catch((error) => {
            if (this.onError) this.onError(error);
          });
        } else if (['failed', 'disconnected'].includes(this.peer.connectionState)) {
          this.peer.restartIce();
        }
      } else if (message && message.type === 'room_closed' && payload &&
                 payload.roomCode === roomInfo.roomCode) {
        this.#close(payload.reason || 'room_closed', true);
      } else if (message && message.type === 'signaling_resumed' && payload &&
                 payload.roomCode === roomInfo.roomCode) {
        const host = payload.peers?.find((peer) => peer.peerId === roomInfo.hostId);
        const nextSessionId = String(host?.sessionId || '');
        if (nextSessionId && nextSessionId !== this.hostSessionId) {
          this.hostSessionId = nextSessionId;
          this.#replacePeer().catch((error) => {
            if (this.onError) this.onError(error);
          });
        } else if (this.peer.connectionState !== 'connected') {
          this.peer.restartIce();
        }
      }
    });
    this.ready = this.#bindInitialPeer(this.peer).catch(
      (error) => this.#recoverInitialPeer(error),
    );
  }

  #createPeer(): WebRtcPeerSession {
    const ice = this.iceLease.current();
    return createWebRTCPeer({
      role: 'client',
      iceServers: ice.iceServers,
      relayOnly: ice.relayOnly,
      RTCPeerConnectionImpl: this.RTCPeerConnectionImpl,
      connectTimeoutMs: this.connectTimeoutMs,
      onSignal: (signal) => this.signaling.sendSignal(
        this.roomInfo.hostId,
        signal,
        this.hostSessionId,
      ),
      onConnectionStateChange: (state) => this.#connectionStateChanged(state),
    });
  }

  #connectionStateChanged(state: RTCPeerConnectionState): void {
    if (this.closed) return;
    this.onConnectionState?.(state);
    if (state === 'connected') {
      if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
      this.recoveryTimer = null;
      return;
    }
    if (!this.runtime || (state !== 'failed' && state !== 'disconnected')) return;
    const delayMs = state === 'failed'
      ? this.failedRebuildDelayMs : this.disconnectedRebuildDelayMs;
    this.#schedulePeerReplacement(this.peer, delayMs);
  }

  #schedulePeerReplacement(peer: WebRtcPeerSession, delayMs: number): void {
    if (this.closed || this.recoveryTimer || this.replacePromise) return;
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = null;
      if (this.closed || this.peer !== peer || this.replacePromise) return;
      // A disconnected ICE agent may recover during its grace period. A
      // closed match transport cannot reopen even when the browser leaves the
      // aggregate PeerConnection state at "connected"; that case reaches this
      // owner through the runtime connection listener below.
      if (!this.runtime?.closed && peer.connectionState === 'connected') return;
      this.#replacePeer({ renewSignaling: true }).catch((error) => {
        if (this.onError) this.onError(error);
      });
    }, delayMs);
  }

  #bindInitialPeer(peer: WebRtcPeerSession): Promise<PrivateRoomAdapter> {
    return peer.transportReady.then((transport) => {
      if (this.closed || this.peer !== peer) {
        transport.close('rtc_generation_replaced');
        throw Object.assign(new Error('RTC generation was replaced'), {
          code: 'rtc_generation_replaced',
        });
      }
      return this.#attachInitialTransport(transport);
    });
  }

  #attachInitialTransport(transport: MatchTransport): PrivateRoomAdapter {
    if (this.runtime) return this.#roomAdapter();
    // Once RTC is established, pub/sub remains the fast path and the
    // durable mailbox only needs a low-frequency closure/rejoin safety net.
    if (typeof this.signaling.setEventPollInterval === 'function') {
      this.signaling.setEventPollInterval(2_000);
    }
    const client = new TypedMatchClientRuntime({
      transport,
      playerId: this.roomInfo.peerId,
    });
    this.runtimeConnectionUnsubscribe?.();
    this.runtimeConnectedOnce = false;
    this.runtimeConnectionUnsubscribe = client.onConnection((connected) => {
      if (this.closed || this.suppressRuntimeDisconnect) return;
      if (connected) {
        this.runtimeConnectedOnce = true;
        if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
        this.recoveryTimer = null;
        return;
      }
      // Data channels are independently observable and can close before the
      // aggregate PeerConnection state changes (or while it stays connected).
      // Once this runtime completed a handshake, a close is terminal for that
      // transport generation and must rotate the signaling/RTC epoch.
      if (this.runtimeConnectedOnce) {
        this.#schedulePeerReplacement(this.peer, this.failedRebuildDelayMs);
      }
    });
    client.connect({ mode: this.roomInfo.mode || 'private', phase: 'lobby' });
    this.runtime = client;
    return this.#roomAdapter();
  }

  #roomAdapter(): PrivateRoomAdapter {
    const client = this.runtime;
    if (!client) throw new Error('room runtime is unavailable');
    return {
      onState: (listener: (state: RoomState) => void) => client.onRoomState(listener),
      submit: (command: RoomCommand) => client.submitRoomCommand(command),
      get errors() { return client.errors; },
      get closed() { return client.closed; },
    };
  }

  async #recoverInitialPeer(initialError: unknown): Promise<PrivateRoomAdapter> {
    let error = initialError;
    for (const delayMs of this.initialRebuildDelaysMs) {
      if (this.closed) throw error;
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (this.closed) throw error;
      try {
        const replacement = await this.#replacePeer({ renewSignaling: true });
        if (!replacement) throw new Error('initial RTC replacement did not attach a room');
        return replacement;
      } catch (nextError) {
        error = nextError;
      }
    }
    throw error;
  }

  #replacePeer({ renewSignaling = false }: { renewSignaling?: boolean } = {}):
    Promise<PrivateRoomAdapter | void> {
    if (this.replacePromise) return this.replacePromise;
    const replacement = this.#replacePeerNow(renewSignaling).finally(() => {
      if (this.replacePromise === replacement) this.replacePromise = null;
    });
    this.replacePromise = replacement;
    return replacement;
  }

  async #replacePeerNow(renewSignaling: boolean): Promise<PrivateRoomAdapter | void> {
    const previous = this.runtime?.roomState?.players?.find(
      (player) => player.id === this.roomInfo.peerId,
    ) || null;
    const oldPeer = this.peer;
    if (this.iceLease.needsRefresh()) await this.iceLease.refreshIfNeeded();
    const nextPeer = this.#createPeer();
    this.peer = nextPeer;
    this.suppressRuntimeDisconnect = true;
    try { oldPeer.close('host_session_replaced'); }
    finally { this.suppressRuntimeDisconnect = false; }
    if (renewSignaling) await this.signaling.restartRoomSession('rtc_session_rebuild');
    const transport = await nextPeer.transportReady;
    if (this.peer !== nextPeer || this.closed) {
      transport.close('rtc_generation_replaced');
      throw Object.assign(new Error('RTC generation was replaced'), {
        code: 'rtc_generation_replaced',
      });
    }
    if (!this.runtime) return this.#attachInitialTransport(transport);
    this.runtime.reconnectTransport(transport, {
      mode: this.roomInfo.mode || 'private',
      phase: 'lobby',
    });
    if (previous?.specId) {
      this.runtime.submitRoomCommand({ type: 'select_vehicle', specId: previous.specId });
    }
    if (Array.isArray(previous?.equipment)) {
      this.runtime.submitRoomCommand({ type: 'select_equipment', equipment: previous.equipment });
    }
    if (previous?.camo) {
      this.runtime.submitRoomCommand({ type: 'select_camo', camo: previous.camo });
    }
    if (previous?.team) {
      this.runtime.submitRoomCommand({ type: 'set_team', team: previous.team });
    }
  }

  async submit(command: RoomCommand): Promise<unknown> {
    await this.ready;
    if (!this.runtime) throw new Error('room runtime is unavailable');
    return this.runtime.submitRoomCommand(command);
  }

  async takeMatchTransport(): Promise<MatchTransport> {
    await this.ready;
    if (!this.runtime) throw new Error('room runtime is unavailable');
    return this.runtime.transport;
  }

  async takeMatchClient(): Promise<MatchClientPort> {
    await this.ready;
    if (!this.runtime) throw new Error('room runtime is unavailable');
    if (!this.runtime.connected) {
      const wrapped = wrapAdverseTransport(this.runtime.transport);
      // Re-establish message ownership at the protocol phase boundary even
      // when QA does not wrap the transport. The lobby UI may have released
      // its final subscription while this long-lived MatchClientRuntime keeps
      // the same RTC object; a fresh binding guarantees WELCOME has a runtime
      // listener before HELLO leaves the browser.
      this.runtime.replaceTransport(wrapped);
    }
    this.runtime.beginMatchHandshake({ mode: this.roomInfo.mode || 'private' });
    return this.runtime;
  }

  #close(reason: string, notifyOwner: boolean): void {
    if (this.closed) return;
    this.closed = true;
    if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
    this.recoveryTimer = null;
    this.runtimeConnectionUnsubscribe?.();
    this.runtimeConnectionUnsubscribe = null;
    if (this.unsubscribeSignal) this.unsubscribeSignal();
    if (this.runtime && !this.runtime.closed) this.runtime.close(reason);
    this.peer.close(reason);
    this.signaling.close(reason);
    if (notifyOwner) this.onClose?.(reason);
  }

  close(reason = 'client_closed'): void {
    this.#close(reason, false);
  }
}
