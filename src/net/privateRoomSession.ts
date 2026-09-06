import type { RuntimeValue } from '../runtimeTypes.ts';
import {
  createLobby,
  type LobbyState,
  type SerializedLobby,
} from './lobby.ts';
import {
  LobbyHostRuntime,
  type ReleasedLobbyTransport,
} from './lobbyRuntime.ts';
import {
  createWebRTCPeer,
  type MatchTransport,
  type RtcSignal,
  type WebRtcPeerSession,
} from './webrtcPeer.ts';
import {
  MatchClientRuntime,
  type MatchRoomState,
  type MatchTransport as RuntimeMatchTransport,
} from './matchRuntime.ts';
import { snapshotPresentationProfile } from './snapshotPresentationProfile.ts';
import {
  maybeCreateAdverseNetworkTransport,
} from './adverseNetworkTransport.ts';
import {
  RtcIceLease,
  type RtcIceLeaseConfiguration,
} from './rtcIceLease.ts';
import {
  RoomSignalingClient,
  type SignalingEvent,
} from './signalingClient.ts';
import { classifyPrivateRoomFailure } from './roomFailure.ts';

type Unsubscribe = () => void;
type RoomCommand = Record<string, RuntimeValue>;
type SignalPrimitive = string | number | boolean | null | undefined;
type SignalValue = SignalPrimitive | SignalRecord | SignalValue[];
interface SignalRecord { [key: string]: SignalValue }

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

type SignalingPort = Pick<
  RoomSignalingClient,
  'onEvent' | 'sendSignal' | 'restartRoomSession' | 'setEventPollInterval' | 'close'
>;

type RoomState = MatchRoomState;

interface MatchHostPort {
  detachPeer?(peerId: string, reason: string): void;
  rejoinPeer(options: {
    peerId: string;
    transport: MatchTransport;
    player: { name: string };
    metadata: { mode: string };
  }): void;
}

type MatchRuntimeTransport = RuntimeMatchTransport;

interface MatchClientPort {
  roomState?: RoomState | null;
  errors: RuntimeValue[];
  closed: boolean;
  connected: boolean;
  transport: MatchRuntimeTransport;
  onConnection(listener: (connected: boolean) => void): Unsubscribe;
  onRoomState(listener: (state: RoomState) => void): Unsubscribe;
  connect(metadata: { mode: string; phase: string }): void;
  submitRoomCommand(command: RoomCommand): RuntimeValue;
  reconnectTransport(
    transport: MatchRuntimeTransport,
    metadata: { mode: string; phase: string },
  ): void;
  replaceTransport(transport: MatchRuntimeTransport): void;
  beginMatchHandshake(metadata: { mode: string }): void;
  close(reason: string): void;
}

export interface PrivateRoomAdapter {
  onState(listener: (state: RoomState) => void): Unsubscribe;
  submit(command: RoomCommand): RuntimeValue;
  readonly errors: RuntimeValue[];
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
  onStart?: ((state: SerializedLobby) => void) | null;
  onError?: ((error: RuntimeValue) => void) | null;
  onClose?: ((reason: string) => void) | null;
}

export interface PrivateRoomClientOptions {
  signaling?: SignalingPort;
  roomInfo?: RoomInfo;
  iceServers?: RTCIceServer[];
  relayOnly?: boolean;
  iceExpiresInSeconds?: number;
  refreshIceConfiguration?: (() => Promise<RtcIceLeaseConfiguration>) | null;
  RTCPeerConnectionImpl?: typeof RTCPeerConnection | null;
  onError?: ((error: RuntimeValue) => void) | null;
  onClose?: ((reason: string) => void) | null;
  onConnectionState?: ((state: RTCPeerConnectionState) => void) | null;
  disconnectedRebuildDelayMs?: number;
  failedRebuildDelayMs?: number;
  connectTimeoutMs?: number;
  initialRebuildDelaysMs?: number[];
  recoveryTimeoutMs?: number;
}

function isRecord(value: RuntimeValue): value is SignalRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readIceCandidate(value: SignalValue): RTCIceCandidateInit | undefined {
  if (!isRecord(value)) return undefined;
  const candidate: RTCIceCandidateInit = {};
  if (typeof value.candidate === 'string') candidate.candidate = value.candidate;
  if (typeof value.sdpMid === 'string' || value.sdpMid === null) candidate.sdpMid = value.sdpMid;
  if (typeof value.sdpMLineIndex === 'number' && Number.isInteger(value.sdpMLineIndex)) {
    candidate.sdpMLineIndex = value.sdpMLineIndex;
  } else if (value.sdpMLineIndex === null) {
    candidate.sdpMLineIndex = null;
  }
  if (typeof value.usernameFragment === 'string' || value.usernameFragment === null) {
    candidate.usernameFragment = value.usernameFragment;
  }
  return candidate;
}

function isSessionDescriptionType(value: SignalValue): value is RTCSdpType {
  return value === 'answer' || value === 'offer' || value === 'pranswer' || value === 'rollback';
}

function readSessionDescription(value: SignalValue): RTCSessionDescriptionInit | undefined {
  if (!isRecord(value) || !isSessionDescriptionType(value.type)) return undefined;
  if (value.sdp !== undefined && typeof value.sdp !== 'string') return undefined;
  return { type: value.type, ...(value.sdp === undefined ? {} : { sdp: value.sdp }) };
}

function readRtcSignal(value: RuntimeValue): RtcSignal | undefined {
  if (!isRecord(value)) return undefined;
  if (value.kind === 'restart') return { kind: 'restart' };
  if (value.kind === 'ice') {
    const candidate = readIceCandidate(value.candidate);
    return candidate ? { kind: 'ice', candidate } : undefined;
  }
  if (value.kind === 'description') {
    const description = readSessionDescription(value.description);
    return description ? { kind: 'description', description } : undefined;
  }
  return undefined;
}

function readRoomPeer(value: RuntimeValue): RoomPeer | null {
  if (!isRecord(value) || typeof value.peerId !== 'string' || !value.peerId) return null;
  const rawPlayer = isRecord(value.player) ? value.player : null;
  const player = rawPlayer ? {
    ...(typeof rawPlayer.id === 'string' ? { id: rawPlayer.id } : {}),
    ...(typeof rawPlayer.name === 'string' ? { name: rawPlayer.name } : {}),
    ...(typeof rawPlayer.specId === 'string' ? { specId: rawPlayer.specId } : {}),
    ...(Array.isArray(rawPlayer.equipment) && rawPlayer.equipment.every(
      (entry) => typeof entry === 'string',
    ) ? { equipment: rawPlayer.equipment } : {}),
    ...(typeof rawPlayer.camo === 'string' ? { camo: rawPlayer.camo } : {}),
    ...(typeof rawPlayer.team === 'string' ? { team: rawPlayer.team } : {}),
  } : undefined;
  return {
    peerId: value.peerId,
    ...(player ? { player } : {}),
    ...(typeof value.sessionId === 'string' ? { sessionId: value.sessionId } : {}),
  };
}

function readSignalPayload(value: RuntimeValue): SignalPayload | null {
  if (!isRecord(value)) return null;
  const peers = Array.isArray(value.peers)
    ? value.peers.map(readRoomPeer).filter((peer): peer is RoomPeer => peer !== null)
    : undefined;
  const signal = readRtcSignal(value.signal);
  return {
    ...(typeof value.roomCode === 'string' ? { roomCode: value.roomCode } : {}),
    ...(typeof value.peerId === 'string' ? { peerId: value.peerId } : {}),
    ...(typeof value.fromPeerId === 'string' ? { fromPeerId: value.fromPeerId } : {}),
    ...(typeof value.fromSessionId === 'string' ? { fromSessionId: value.fromSessionId } : {}),
    ...(typeof value.sessionId === 'string' ? { sessionId: value.sessionId } : {}),
    ...(typeof value.reason === 'string' ? { reason: value.reason } : {}),
    ...(isRecord(value.player) && typeof value.player.name === 'string'
      ? { player: { name: value.player.name } } : {}),
    ...(signal ? { signal } : {}),
    ...(peers ? { peers } : {}),
  };
}

function errorCode(error: RuntimeValue, fallback: string): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) return fallback;
  const code = (error as { code?: RuntimeValue }).code;
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
  readonly onError: ((error: RuntimeValue) => void) | null;
  readonly onClose: ((reason: string) => void) | null;
  closed = false;
  private readonly peerGenerations = new Map<string, object>();
  readonly peers = new Map<string, SessionPeer>();
  readonly lobby: LobbyState;
  readonly runtime: LobbyHostRuntime;
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
    onClose = null,
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
    this.onClose = onClose;
    this.lobby = createLobby({
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
    this.runtime = new LobbyHostRuntime({
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

  #fail(error: RuntimeValue): void {
    if (!this.closed && this.onError) this.onError(error);
  }

  #peerJoined(payload: SignalPayload): void {
    if (!payload.peerId) return;
    this.#joinPeer({ ...payload, peerId: payload.peerId }).catch((error) => this.#fail(error));
  }

  #roomSignal(payload: SignalPayload): void {
    const session = payload.fromPeerId ? this.peers.get(payload.fromPeerId) : null;
    if (session && payload.signal && payload.fromSessionId === session.sessionId) {
      session.handleSignal(payload.signal).catch((error) => this.#fail(error));
    }
  }

  #peerLeft(payload: SignalPayload): void {
    if (!payload.peerId) return;
    const session = this.peers.get(payload.peerId);
    this.peerGenerations.delete(payload.peerId);
    // Remove the canonical room seat before closing the RTC channels. Their
    // close callback is intentionally treated as recoverable transport loss.
    this.matchRuntime?.detachPeer?.(payload.peerId, 'peer_left');
    this.runtime.detachPeer(payload.peerId, 'peer_left');
    if (session) session.close('peer_left');
    this.peers.delete(payload.peerId);
  }

  #signalingResumed(payload: SignalPayload): void {
    // The durable room response is the source of truth after a socket gap.
    // Reconcile peers that may have joined while this host instance could
    // not receive pub/sub or mailbox wake-ups.
    if (payload.peers) {
      const present = new Set(payload.peers.map((peer) => peer.peerId));
      for (const peerId of this.peers.keys()) {
        if (!present.has(peerId)) this.#peerLeft({ peerId });
      }
    }
    for (const peer of payload.peers || []) {
      if (peer.peerId === this.roomInfo.peerId) continue;
      this.#joinPeer(peer).catch((error) => this.#fail(error));
    }
  }

  #event(message: SignalingEvent): void {
    if (this.closed) return;
    const payload = readSignalPayload(message?.payload);
    if (!payload || payload.roomCode !== this.roomInfo.roomCode) return;
    if (message.type === 'peer_joined') this.#peerJoined(payload);
    else if (message.type === 'room_signal') this.#roomSignal(payload);
    else if (message.type === 'peer_left') this.#peerLeft(payload);
    else if (message.type === 'signaling_resumed') this.#signalingResumed(payload);
    else if (message.type === 'room_closed') this.#close(payload.reason || 'room_closed', true);
  }

  async #joinPeer({ peerId, player, sessionId: rawSessionId }: RoomPeer): Promise<void> {
    if (this.closed) return;
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
    const generation = {};
    this.peerGenerations.set(peerId, generation);
    if (this.iceLease.needsRefresh()) await this.iceLease.refreshIfNeeded();
    if (this.closed || this.peerGenerations.get(peerId) !== generation) return;
    const ice = this.iceLease.current();
    const session: SessionPeer = Object.assign(createWebRTCPeer({
      role: 'host',
      iceServers: ice.iceServers,
      relayOnly: ice.relayOnly,
      RTCPeerConnectionImpl: this.RTCPeerConnectionImpl,
      onSignal: (signal) => this.signaling.sendSignal(peerId, signal, sessionId),
    }), { sessionId });
    // Negotiation/signaling can fail before this function reaches the await.
    // Keep the original promise rejectable for its owner without an orphaned
    // rejection when terminal cleanup closes an as-yet-unbound peer.
    void session.transportReady.catch(() => {});
    this.peers.set(peerId, session);
    await session.start();
    const transport = await session.transportReady;
    if (this.closed || this.peers.get(peerId) !== session ||
        this.peerGenerations.get(peerId) !== generation) {
      session.close('peer_replaced');
      return;
    }
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

  command(command: RoomCommand): RuntimeValue {
    return this.runtime.command(this.roomInfo.peerId, command);
  }

  /** Release open remote channels for AuthoritativeMatchRuntime attachment. */
  takeMatchChannels(): ReleasedLobbyTransport[] {
    // Keep rendezvous listening after handoff. Gameplay never traverses this
    // socket, but a browser that reloads after a round needs it to establish
    // a fresh WebRTC channel into the still-live room.
    return this.runtime.releaseTransports();
  }

  bindMatchRuntime(runtime: MatchHostPort | null): void {
    this.matchRuntime = runtime || null;
  }

  #close(reason: string, notifyOwner: boolean): void {
    if (this.closed) return;
    this.closed = true;
    this.peerGenerations.clear();
    if (this.unsubscribeSignal) this.unsubscribeSignal();
    this.runtime.close(reason);
    for (const session of this.peers.values()) session.close(reason);
    this.peers.clear();
    this.signaling.close(reason);
    if (notifyOwner) this.onClose?.(reason);
  }

  close(reason = 'host_closed'): void { this.#close(reason, false); }
}

export class PrivateRoomClientSession {
  readonly signaling: SignalingPort;
  readonly roomInfo: RoomInfo & { hostId: string };
  readonly onError: ((error: RuntimeValue) => void) | null;
  readonly onClose: ((reason: string) => void) | null;
  private readonly iceLease: RtcIceLease;
  readonly RTCPeerConnectionImpl: typeof RTCPeerConnection | null;
  readonly onConnectionState: ((state: RTCPeerConnectionState) => void) | null;
  readonly disconnectedRebuildDelayMs: number;
  readonly failedRebuildDelayMs: number;
  readonly connectTimeoutMs: number;
  readonly initialRebuildDelaysMs: number[];
  readonly recoveryTimeoutMs: number;
  private recoveryDeadlineTimer: ReturnType<typeof setTimeout> | null = null;
  recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  replacePromise: Promise<PrivateRoomAdapter | void> | null = null;
  runtimeConnectionUnsubscribe: Unsubscribe | null = null;
  private runtimeRoomUnsubscribe: Unsubscribe | null = null;
  private runtimeAuthorityUnsubscribe: Unsubscribe | null = null;
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
    recoveryTimeoutMs = 60_000,
  }: PrivateRoomClientOptions = {}) {
    if (!signaling || !roomInfo || !roomInfo.peerId || !roomInfo.hostId) {
      throw new TypeError('signaling and joined room info are required');
    }
    this.signaling = signaling;
    this.roomInfo = { ...roomInfo, hostId: roomInfo.hostId };
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
        !Number.isFinite(connectTimeoutMs) || connectTimeoutMs <= 0 ||
        !Number.isFinite(recoveryTimeoutMs) || recoveryTimeoutMs <= 0) {
      throw new TypeError('RTC rebuild delays must be non-negative milliseconds');
    }
    if (!Array.isArray(initialRebuildDelaysMs) || initialRebuildDelaysMs.some(
      (delay) => !Number.isFinite(delay) || delay < 0,
    )) throw new TypeError('initial RTC rebuild delays must be non-negative milliseconds');
    this.disconnectedRebuildDelayMs = disconnectedRebuildDelayMs;
    this.failedRebuildDelayMs = failedRebuildDelayMs;
    this.connectTimeoutMs = connectTimeoutMs;
    this.recoveryTimeoutMs = recoveryTimeoutMs;
    this.initialRebuildDelaysMs = [...initialRebuildDelaysMs];
    this.hostSessionId = String(
      roomInfo.peers?.find((peer) => peer.peerId === roomInfo.hostId)?.sessionId || '',
    );
    this.peer = this.#createPeer();
    this.unsubscribeSignal = signaling.onEvent((message) => this.#event(message));
    this.ready = this.#bindInitialPeer(this.peer)
      .catch((error) => this.#recoverInitialPeer(error))
      .catch((error) => {
        this.#close(classifyPrivateRoomFailure(error).code, true);
        throw error;
      });
  }

  #fail(error: RuntimeValue): void {
    if (!this.closed && this.onError) this.onError(error);
  }

  #beginRecovery(): void {
    if (this.closed || this.recoveryDeadlineTimer) return;
    this.recoveryDeadlineTimer = setTimeout(() => {
      this.recoveryDeadlineTimer = null;
      this.#close('rtc_recovery_exhausted', true);
    }, this.recoveryTimeoutMs);
  }

  #finishRecovery(): void {
    if (this.recoveryDeadlineTimer) clearTimeout(this.recoveryDeadlineTimer);
    this.recoveryDeadlineTimer = null;
  }

  #replaceForSession(nextSessionId: string, restartDisconnectedOnly: boolean): void {
    if (nextSessionId && nextSessionId !== this.hostSessionId) {
      this.hostSessionId = nextSessionId;
      this.#replacePeer().catch((error) => this.#fail(error));
      return;
    }
    const recoverable = restartDisconnectedOnly
      ? ['failed', 'disconnected'].includes(this.peer.connectionState)
      : this.peer.connectionState !== 'connected';
    if (recoverable) this.peer.restartIce();
  }

  #event(message: SignalingEvent): void {
    if (this.closed) return;
    const payload = readSignalPayload(message?.payload);
    if (!payload || payload.roomCode !== this.roomInfo.roomCode) return;
    if (message.type === 'room_signal') {
      if (payload.signal && payload.fromPeerId === this.roomInfo.hostId &&
          payload.fromSessionId === this.hostSessionId) {
        this.peer.handleSignal(payload.signal).catch((error) => this.#fail(error));
      }
      return;
    }
    if (message.type === 'peer_joined' && payload.peerId === this.roomInfo.hostId) {
      this.#replaceForSession(String(payload.sessionId || ''), true);
      return;
    }
    if (message.type === 'room_closed') {
      this.#close(payload.reason || 'room_closed', true);
      return;
    }
    if (message.type === 'peer_left' && payload.peerId === this.roomInfo.hostId) {
      this.#close('host_left', true);
      return;
    }
    if (message.type === 'signaling_resumed') {
      const host = payload.peers?.find((peer) => peer.peerId === this.roomInfo.hostId);
      if (payload.peers && !host) {
        this.#close('host_left', true);
        return;
      }
      this.#replaceForSession(String(host?.sessionId || ''), false);
    }
  }

  #createPeer(): WebRtcPeerSession {
    const ice = this.iceLease.current();
    const peer = createWebRTCPeer({
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
      onConnectionStateChange: (state) => {
        if (this.peer === peer) this.#connectionStateChanged(state);
      },
    });
    void peer.transportReady.catch(() => {});
    return peer;
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
    if (this.closed || (!this.runtime?.closed && peer.connectionState === 'connected')) return;
    this.#beginRecovery();
    if (this.recoveryTimer || this.replacePromise) return;
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = null;
      if (this.closed || this.peer !== peer || this.replacePromise) return;
      // A disconnected ICE agent may recover during its grace period. A
      // closed match transport cannot reopen even when the browser leaves the
      // aggregate PeerConnection state at "connected"; that case reaches this
      // owner through the runtime connection listener below.
      if (!this.runtime?.closed && peer.connectionState === 'connected') return;
      this.#replacePeer({ renewSignaling: true }).catch((error) => {
        this.#fail(error);
        if (!this.closed) this.#schedulePeerReplacement(this.peer, this.failedRebuildDelayMs);
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
    const client = new MatchClientRuntime({
      transport,
      playerId: this.roomInfo.peerId,
      ...snapshotPresentationProfile(this.roomInfo.mode),
    });
    this.runtimeConnectionUnsubscribe?.();
    this.runtimeRoomUnsubscribe?.();
    this.runtimeAuthorityUnsubscribe?.();
    this.runtimeConnectedOnce = false;
    this.runtimeConnectionUnsubscribe = client.onConnection((connected) => {
      if (this.closed || this.suppressRuntimeDisconnect) return;
      if (connected) {
        this.runtimeConnectedOnce = true;
        if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
        this.recoveryTimer = null;
        this.#finishRecovery();
        return;
      }
      // Data channels are independently observable and can close before the
      // aggregate PeerConnection state changes (or while it stays connected).
      // A lobby transport has no match WELCOME yet. Its data-lane closure is
      // equally terminal for that generation and must not freeze room entry.
      this.#schedulePeerReplacement(this.peer, this.failedRebuildDelayMs);
    });
    this.runtimeRoomUnsubscribe = client.onRoomState(() => this.#finishRecovery());
    this.runtimeAuthorityUnsubscribe = client.onAuthorityProgress(() => this.#finishRecovery());
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

  async #recoverInitialPeer(initialError: RuntimeValue): Promise<PrivateRoomAdapter> {
    this.#beginRecovery();
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
    if (this.closed) return;
    this.#beginRecovery();
    const previous = this.runtime?.roomState?.players?.find(
      (player) => player.id === this.roomInfo.peerId,
    ) || null;
    const oldPeer = this.peer;
    if (this.iceLease.needsRefresh()) await this.iceLease.refreshIfNeeded();
    if (this.closed) return;
    const nextPeer = this.#createPeer();
    this.peer = nextPeer;
    this.suppressRuntimeDisconnect = true;
    try { oldPeer.close('host_session_replaced'); }
    finally { this.suppressRuntimeDisconnect = false; }
    if (renewSignaling) {
      try { await this.signaling.restartRoomSession('rtc_session_rebuild'); }
      catch (error) {
        nextPeer.close('rtc_signaling_failed');
        throw error;
      }
    }
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

  async submit(command: RoomCommand): Promise<RuntimeValue> {
    await this.ready;
    if (!this.runtime) throw new Error('room runtime is unavailable');
    return this.runtime.submitRoomCommand(command);
  }

  async takeMatchTransport(): Promise<MatchRuntimeTransport> {
    await this.ready;
    if (!this.runtime) throw new Error('room runtime is unavailable');
    return this.runtime.transport;
  }

  async takeMatchClient(): Promise<MatchClientPort> {
    await this.ready;
    if (!this.runtime) throw new Error('room runtime is unavailable');
    if (!this.runtime.connected) {
      const wrapped = maybeCreateAdverseNetworkTransport(this.runtime.transport);
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
    this.#finishRecovery();
    if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
    this.recoveryTimer = null;
    this.runtimeConnectionUnsubscribe?.();
    this.runtimeConnectionUnsubscribe = null;
    this.runtimeRoomUnsubscribe?.();
    this.runtimeRoomUnsubscribe = null;
    this.runtimeAuthorityUnsubscribe?.();
    this.runtimeAuthorityUnsubscribe = null;
    if (this.unsubscribeSignal) this.unsubscribeSignal();
    this.runtime?.close(reason);
    this.peer.close(reason);
    this.signaling.close(reason);
    if (notifyOwner) this.onClose?.(reason);
  }

  close(reason = 'client_closed'): void {
    this.#close(reason, false);
  }
}
