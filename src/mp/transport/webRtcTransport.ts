/**
 * WebRTC implementation of the transport contract (P2 client lane, 2026-09-28; docs/MULTIPLAYER-V2.md §13): one
 * reliable ordered RTCDataChannel named `match` from a peer to the hosting commander's browser. Signaling goes through
 * a `Signaler` the room client fulfils (`room_signal` offer / answer / candidates relayed by the Room Durable Object,
 * addressed to the signaler's CURRENT host with its generation); ICE servers come from the same credential source v1
 * uses (`src/net/iceConfig.ts` over `api/ice.ts`), resolved lazily per connection; `bufferedBytes` is the channel's
 * bufferedAmount under the shared backpressure policy; `reconnect()` is a fresh offer to the current host, so a host
 * migration only changes the target (`retarget()` fires the pending attempt at once instead of waiting out the backoff);
 * close reasons map to TRANSPORT_CLOSE; the selected candidate pair's types (host / srflx / prflx / relay) are read from
 * the connection's stats for the status model.
 *
 * DOM and WebRTC types stay behind an injectable factory (`createPeerConnection`), so the receipt runs in Node with a
 * scripted double; the shapes below are the structural subsets the transport touches.
 */
import {
  BackpressureGate, DEFAULT_BACKPRESSURE, DEFAULT_RECONNECT, Listeners, RECONNECTABLE_CLOSE_REASONS,
  TRANSPORT_CLOSE, createTransportStats, reconnectDelayMs,
} from './transport.ts';
import type {
  BackpressurePolicy, ReconnectPolicy, Transport, TransportCloseReason, TransportState, TransportStateChange,
  TransportStats, Unsubscribe,
} from './transport.ts';

// ------------------------------------------------------------ structural WebRTC shapes

export interface RtcIceServerLike {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** What v1's `loadIceConfiguration` resolves: the servers and whether only relays may be used. */
export interface RtcIceConfig {
  iceServers: RtcIceServerLike[];
  relayOnly: boolean;
}

export interface RtcSessionDescriptionLike {
  type: string;
  sdp?: string;
}

export interface RtcIceCandidateInitLike {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

export interface RtcIceCandidateLike extends RtcIceCandidateInitLike {
  toJSON?(): RtcIceCandidateInitLike;
}

export interface RtcDataChannelLike {
  readonly label: string;
  readonly readyState: string;
  readonly bufferedAmount: number;
  binaryType: string;
  onopen: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  send(data: Uint8Array): void;
  close(): void;
}

export interface RtcStatsLike {
  type?: string;
  id?: string;
  state?: string;
  nominated?: boolean;
  selectedCandidatePairId?: string;
  localCandidateId?: string;
  remoteCandidateId?: string;
  candidateType?: string;
  currentRoundTripTime?: number;
}

export interface RtcStatsReportLike {
  forEach(callback: (value: RtcStatsLike) => void): void;
}

export interface RtcPeerConnectionLike {
  readonly connectionState: string;
  onicecandidate: ((event: { candidate: RtcIceCandidateLike | null }) => void) | null;
  onconnectionstatechange: ((event: unknown) => void) | null;
  ondatachannel: ((event: { channel: RtcDataChannelLike }) => void) | null;
  createDataChannel(label: string, init?: { ordered?: boolean; maxRetransmits?: number }): RtcDataChannelLike;
  createOffer(): Promise<RtcSessionDescriptionLike>;
  createAnswer(): Promise<RtcSessionDescriptionLike>;
  setLocalDescription(description: RtcSessionDescriptionLike): Promise<void>;
  setRemoteDescription(description: RtcSessionDescriptionLike): Promise<void>;
  addIceCandidate(candidate: RtcIceCandidateInitLike): Promise<void>;
  getStats?(): Promise<RtcStatsReportLike>;
  close(): void;
}

export type RtcPeerConnectionFactory = (config: RtcIceConfig) => RtcPeerConnectionLike;

// ------------------------------------------------------------ signaling

/** One signal as the room relays it (mirrors `RoomSignalPayload` structurally; the transport never imports the room layer). */
export interface RtcSignalPayload {
  to: string;
  generation: number;
  kind: 'offer' | 'answer' | 'candidate';
  sdp?: string;
  candidate?: RtcIceCandidateInitLike;
}

export interface RtcRelayedSignal extends RtcSignalPayload {
  from: string;
}

export interface RtcSignalTarget {
  hostId: string;
  generation: number;
}

/** The room client as the transport (and the host acceptor) see it. */
export interface Signaler {
  /** The host to reach right now (the room's newest election); null while the room names none. */
  target(): RtcSignalTarget | null;
  sendSignal(payload: RtcSignalPayload): boolean;
  onSignal(listener: (signal: RtcRelayedSignal) => void): Unsubscribe;
}

export const RTC_MATCH_CHANNEL_LABEL = 'match';

/** ICE candidate types as the stats name them. */
export type RtcCandidateType = 'host' | 'srflx' | 'prflx' | 'relay' | 'unknown';

export interface RtcCandidatePairTypes {
  local: RtcCandidateType;
  remote: RtcCandidateType;
  /** Either side relays: the traffic crosses a TURN server. */
  viaTurn: boolean;
  rttMs: number | null;
}

function candidateTypeOf(value: unknown): RtcCandidateType {
  return value === 'host' || value === 'srflx' || value === 'prflx' || value === 'relay' ? value : 'unknown';
}

/** The selected (nominated, succeeded) candidate pair's local and remote types from a stats report; null before a pair is selected. */
export function selectedCandidateTypes(report: RtcStatsReportLike): RtcCandidatePairTypes | null {
  const byId = new Map<string, RtcStatsLike>();
  let selectedPairId: string | null = null;
  const pairs: RtcStatsLike[] = [];
  report.forEach((entry) => {
    if (entry.id) byId.set(entry.id, entry);
    if (entry.type === 'transport' && entry.selectedCandidatePairId) selectedPairId = entry.selectedCandidatePairId;
    if (entry.type === 'candidate-pair') pairs.push(entry);
  });
  const pair = (selectedPairId ? byId.get(selectedPairId) : null)
    ?? pairs.find((entry) => entry.state === 'succeeded' && entry.nominated)
    ?? pairs.find((entry) => entry.state === 'succeeded') ?? null;
  if (!pair) return null;
  const local = candidateTypeOf(pair.localCandidateId ? byId.get(pair.localCandidateId)?.candidateType : undefined);
  const remote = candidateTypeOf(pair.remoteCandidateId ? byId.get(pair.remoteCandidateId)?.candidateType : undefined);
  const rtt = pair.currentRoundTripTime;
  return { local, remote, viaTurn: local === 'relay' || remote === 'relay', rttMs: typeof rtt === 'number' && Number.isFinite(rtt) ? rtt * 1000 : null };
}

/** The candidate a browser hands `onicecandidate`, as the room relays it (its JSON form, never the live object). */
export function candidateInit(candidate: RtcIceCandidateLike): RtcIceCandidateInitLike {
  const json = typeof candidate.toJSON === 'function' ? candidate.toJSON() : candidate;
  return { candidate: String(json.candidate ?? ''), sdpMid: json.sdpMid ?? null, sdpMLineIndex: json.sdpMLineIndex ?? null };
}

function defaultPeerConnectionFactory(config: RtcIceConfig): RtcPeerConnectionLike {
  const Ctor = (globalThis as { RTCPeerConnection?: new (configuration: Record<string, unknown>) => RtcPeerConnectionLike }).RTCPeerConnection;
  if (typeof Ctor !== 'function') throw new Error('RTCPeerConnection is unavailable in this runtime');
  return new Ctor({
    iceServers: config.iceServers,
    iceTransportPolicy: config.relayOnly ? 'relay' : 'all',
    bundlePolicy: 'max-bundle',
  });
}

function frameBytes(data: unknown): Uint8Array | null {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return null;
}

type TimerHandle = unknown;
const DEFAULT_MAX_FRAME_BYTES = 64 * 1024;
/** Candidates the host sends before its answer arrives wait here (never more than a handful). */
const MAX_PENDING_CANDIDATES = 64;

export interface WebRtcTransportOptions {
  signaler: Signaler;
  /** ICE servers, resolved per connection (v1's `loadIceConfiguration` with its credential lease) or given once. */
  ice?: RtcIceConfig | (() => Promise<RtcIceConfig> | RtcIceConfig);
  createPeerConnection?: RtcPeerConnectionFactory;
  backpressure?: Partial<BackpressurePolicy>;
  reconnect?: Partial<ReconnectPolicy>;
  /** false: a lost channel ends the transport instead of starting the backoff. */
  autoReconnect?: boolean;
  /** Incoming frames above this size are rejected (the wire's MAX_MESSAGE_BYTES). */
  maxFrameBytes?: number;
  clock?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
  random?: () => number;
}

interface ActiveConnection {
  link: number;
  target: RtcSignalTarget;
  pc: RtcPeerConnectionLike;
  channel: RtcDataChannelLike | null;
  remoteDescribed: boolean;
  pendingCandidates: RtcIceCandidateInitLike[];
}

const NO_ICE: RtcIceConfig = Object.freeze({ iceServers: [], relayOnly: false });

export class WebRtcTransport implements Transport {
  readonly kind = 'webrtc';
  readonly stats: TransportStats = createTransportStats();
  readonly backpressure: BackpressurePolicy;
  readonly reconnectPolicy: ReconnectPolicy;
  private readonly signaler: Signaler;
  private readonly ice: () => Promise<RtcIceConfig>;
  private readonly createPeerConnection: RtcPeerConnectionFactory;
  private readonly autoReconnect: boolean;
  private readonly maxFrameBytes: number;
  private readonly clock: () => number;
  private readonly setTimer: (callback: () => void, delayMs: number) => TimerHandle;
  private readonly clearTimer: (handle: TimerHandle) => void;
  private readonly random: () => number;
  private readonly gate: BackpressureGate;
  private readonly frameListeners = new Listeners<Uint8Array>();
  private readonly stateListeners = new Listeners<TransportStateChange>();
  private readonly unsubscribeSignals: Unsubscribe;
  private currentState: TransportState = 'idle';
  private connection: ActiveConnection | null = null;
  private link = 0;
  private attempt = 0;
  private lostAtMs: number | null = null;
  private retryTimer: TimerHandle | null = null;
  private attemptTimer: TimerHandle | null = null;
  private lastErrorDetail = '';
  private pairTypes: RtcCandidatePairTypes | null = null;
  private staleSignalCount = 0;
  private signalsSent = 0;
  private candidatesSent = 0;
  private candidatesReceived = 0;

  constructor({
    signaler,
    ice = NO_ICE,
    createPeerConnection = defaultPeerConnectionFactory,
    backpressure = {},
    reconnect = {},
    autoReconnect = true,
    maxFrameBytes = DEFAULT_MAX_FRAME_BYTES,
    clock = () => (typeof performance === 'object' ? performance.now() : Date.now()),
    setTimer = (callback, delayMs) => setTimeout(callback, delayMs),
    clearTimer = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    random = Math.random,
  }: WebRtcTransportOptions) {
    if (!signaler || typeof signaler.sendSignal !== 'function' || typeof signaler.onSignal !== 'function' || typeof signaler.target !== 'function') {
      throw new TypeError('a signaler with target(), sendSignal() and onSignal() is required');
    }
    this.signaler = signaler;
    this.ice = typeof ice === 'function' ? async () => ice() : async () => ice;
    this.createPeerConnection = createPeerConnection;
    this.backpressure = { ...DEFAULT_BACKPRESSURE, ...backpressure };
    this.reconnectPolicy = { ...DEFAULT_RECONNECT, ...reconnect };
    this.autoReconnect = autoReconnect;
    this.maxFrameBytes = maxFrameBytes;
    this.clock = clock;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.random = random;
    this.gate = new BackpressureGate(this.backpressure);
    this.unsubscribeSignals = signaler.onSignal((signal) => this.receiveSignal(signal));
  }

  get state(): TransportState { return this.currentState; }

  get bufferedBytes(): number {
    const channel = this.connection?.channel;
    return channel && this.currentState === 'open' ? Number(channel.bufferedAmount) || 0 : 0;
  }

  /** The host and generation the current (or last) connection was offered to. */
  get target(): RtcSignalTarget | null { return this.connection?.target ?? null; }
  /** The selected candidate pair's types once the connection's stats named them (null before). */
  get candidatePair(): RtcCandidatePairTypes | null { return this.pairTypes; }
  get candidateType(): RtcCandidateType | null { return this.pairTypes?.local ?? null; }
  get viaTurn(): boolean { return this.pairTypes?.viaTurn ?? false; }
  /** Signals refused for a stale generation or an unexpected sender (diagnostics). */
  get staleSignals(): number { return this.staleSignalCount; }
  get signalStats(): { sent: number; candidatesSent: number; candidatesReceived: number; stale: number } {
    return { sent: this.signalsSent, candidatesSent: this.candidatesSent, candidatesReceived: this.candidatesReceived, stale: this.staleSignalCount };
  }

  onFrame(listener: (frame: Uint8Array) => void): Unsubscribe { return this.frameListeners.add(listener); }

  onState(listener: (change: TransportStateChange) => void): Unsubscribe { return this.stateListeners.add(listener); }

  open(): void {
    if (this.currentState !== 'idle' && this.currentState !== 'closed') return;
    this.attempt = 0;
    this.lostAtMs = null;
    this.connect();
  }

  send(frame: Uint8Array): boolean {
    const channel = this.connection?.channel;
    if (this.currentState !== 'open' || !channel) return false;
    const nowMs = this.clock();
    if (!this.gate.admit(this.bufferedBytes, frame.byteLength, nowMs)) {
      this.stats.framesDropped++;
      if (this.gate.exhausted(nowMs)) this.close(TRANSPORT_CLOSE.BACKPRESSURE, 'unsent bytes stayed above the ceiling');
      return false;
    }
    try {
      channel.send(frame);
    } catch (error) {
      this.stats.framesDropped++;
      this.lastErrorDetail = error instanceof Error ? error.message : 'send failed';
      return false;
    }
    this.stats.framesSent++;
    this.stats.bytesSent += frame.byteLength;
    return true;
  }

  reconnect(reason: TransportCloseReason, detail = ''): void {
    if (this.currentState === 'closed' || this.currentState === 'idle') return;
    this.dropConnection();
    this.scheduleReconnect(reason, detail);
  }

  /**
   * The room elected a new host (or the signaler's target changed): offer to it now. While reconnecting the pending
   * attempt fires at once; an open or connecting link to another host is dropped and re-offered without the backoff.
   */
  retarget(detail = 'host changed'): void {
    if (this.currentState === 'closed' || this.currentState === 'idle') return;
    const target = this.signaler.target();
    const current = this.connection?.target ?? null;
    const sameHost = !!target && !!current && current.hostId === target.hostId && current.generation === target.generation;
    if (this.currentState === 'reconnecting') {
      this.cancelTimers();
      this.connect();
      return;
    }
    if (sameHost) return;
    this.dropConnection();
    this.lostAtMs ??= this.clock();
    this.attempt++;
    this.stats.reconnects++;
    this.transition('reconnecting', { reason: TRANSPORT_CLOSE.NETWORK, detail, attempt: this.attempt, retryDelayMs: 0 });
    this.connect();
  }

  close(reason: TransportCloseReason = TRANSPORT_CLOSE.CLIENT, detail = ''): void {
    if (this.currentState === 'closed') return;
    this.cancelTimers();
    this.dropConnection();
    this.transition('closed', { reason, detail });
    this.frameListeners.clear();
    this.unsubscribeSignals();
  }

  // ------------------------------------------------------------ internals

  private connect(): void {
    this.cancelTimers();
    const link = ++this.link;
    const attempt = this.attempt;
    const target = this.signaler.target();
    this.transition('connecting', { attempt });
    this.attemptTimer = this.setTimer(() => {
      this.attemptTimer = null;
      if (this.link !== link || this.currentState !== 'connecting') return;
      this.dropConnection();
      this.failAttempt(TRANSPORT_CLOSE.TIMEOUT, 'the data channel did not open in time');
    }, this.reconnectPolicy.attemptTimeoutMs);
    if (!target) {
      this.failAttempt(TRANSPORT_CLOSE.NETWORK, 'the room names no host');
      return;
    }
    void this.ice().then((config) => {
      if (this.link !== link || this.currentState !== 'connecting') return;
      this.offer(link, target, config);
    }, (error: unknown) => {
      if (this.link !== link || this.currentState !== 'connecting') return;
      this.lastErrorDetail = error instanceof Error ? error.message : 'ice configuration failed';
      // Host candidates still work on a LAN: never let the credential service block a connection.
      this.offer(link, target, NO_ICE);
    });
  }

  private offer(link: number, target: RtcSignalTarget, config: RtcIceConfig): void {
    let pc: RtcPeerConnectionLike;
    try {
      pc = this.createPeerConnection(config);
    } catch (error) {
      this.lastErrorDetail = error instanceof Error ? error.message : 'peer connection construction failed';
      this.failAttempt(TRANSPORT_CLOSE.NETWORK, this.lastErrorDetail);
      return;
    }
    const connection: ActiveConnection = { link, target, pc, channel: null, remoteDescribed: false, pendingCandidates: [] };
    this.connection = connection;
    const guard = <T>(handler: (event: T) => void) => (event: T) => { if (this.connection === connection && this.link === link) handler(event); };
    pc.onicecandidate = guard((event: { candidate: RtcIceCandidateLike | null }) => {
      if (!event.candidate) return;
      const init = candidateInit(event.candidate);
      if (!init.candidate) return;
      if (this.signaler.sendSignal({ to: target.hostId, generation: target.generation, kind: 'candidate', candidate: init })) this.candidatesSent++;
    });
    pc.onconnectionstatechange = guard(() => {
      const state = pc.connectionState;
      if (state === 'failed' || state === 'closed') this.handleClose(`peer connection ${state}`);
    });
    let channel: RtcDataChannelLike;
    try {
      channel = pc.createDataChannel(RTC_MATCH_CHANNEL_LABEL, { ordered: true });
    } catch (error) {
      this.lastErrorDetail = error instanceof Error ? error.message : 'data channel construction failed';
      this.dropConnection();
      this.failAttempt(TRANSPORT_CLOSE.NETWORK, this.lastErrorDetail);
      return;
    }
    channel.binaryType = 'arraybuffer';
    connection.channel = channel;
    channel.onopen = guard(() => this.handleOpen(link));
    channel.onmessage = guard((event: { data: unknown }) => this.handleMessage(event.data));
    channel.onerror = guard((event: unknown) => {
      const error = (event as { error?: unknown })?.error;
      this.lastErrorDetail = error instanceof Error ? error.message : 'data channel error';
    });
    channel.onclose = guard(() => this.handleClose('data channel closed'));
    if (channel.readyState === 'open') this.handleOpen(link);
    void pc.createOffer().then((offer) => {
      if (this.connection !== connection) return;
      return pc.setLocalDescription(offer).then(() => {
        if (this.connection !== connection) return;
        const sdp = offer.sdp ?? '';
        if (!sdp) throw new Error('the offer carries no sdp');
        if (!this.signaler.sendSignal({ to: target.hostId, generation: target.generation, kind: 'offer', sdp })) {
          throw new Error('the room refused the offer');
        }
        this.signalsSent++;
      });
    }).catch((error: unknown) => {
      if (this.connection !== connection || this.link !== link) return;
      this.lastErrorDetail = error instanceof Error ? error.message : 'offer failed';
      this.dropConnection();
      this.failAttempt(TRANSPORT_CLOSE.NETWORK, this.lastErrorDetail);
    });
  }

  private receiveSignal(signal: RtcRelayedSignal): void {
    const connection = this.connection;
    if (!connection || signal.from !== connection.target.hostId || signal.generation !== connection.target.generation) {
      this.staleSignalCount++;
      return;
    }
    if (signal.kind === 'answer') {
      if (connection.remoteDescribed || !signal.sdp) { this.staleSignalCount++; return; }
      connection.remoteDescribed = true;
      void connection.pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp }).then(() => {
        if (this.connection !== connection) return;
        const queued = connection.pendingCandidates.splice(0);
        for (const candidate of queued) void connection.pc.addIceCandidate(candidate).catch(() => { /* a stale candidate */ });
      }).catch((error: unknown) => {
        if (this.connection !== connection) return;
        this.lastErrorDetail = error instanceof Error ? error.message : 'answer rejected';
        this.dropConnection();
        this.failAttempt(TRANSPORT_CLOSE.NETWORK, this.lastErrorDetail);
      });
      return;
    }
    if (signal.kind === 'candidate' && signal.candidate) {
      this.candidatesReceived++;
      if (!connection.remoteDescribed) {
        if (connection.pendingCandidates.length < MAX_PENDING_CANDIDATES) connection.pendingCandidates.push(signal.candidate);
        return;
      }
      void connection.pc.addIceCandidate(signal.candidate).catch(() => { /* a stale candidate */ });
      return;
    }
    // An offer never reaches a peer: the peer offers, the host answers.
    this.staleSignalCount++;
  }

  private handleOpen(link: number): void {
    if (this.link !== link || this.currentState !== 'connecting') return;
    if (this.attemptTimer !== null) { this.clearTimer(this.attemptTimer); this.attemptTimer = null; }
    const resumed = this.attempt > 0;
    const attempt = this.attempt;
    this.attempt = 0;
    this.lostAtMs = null;
    this.gate.reset();
    this.stats.opens++;
    this.pairTypes = null;
    this.transition('open', { attempt, resumed });
    this.readCandidatePair(link);
  }

  /** The selected pair's types arrive shortly after the channel opens (a stats round trip); a double may name them at once. */
  private readCandidatePair(link: number): void {
    const pc = this.connection?.pc;
    if (!pc || typeof pc.getStats !== 'function') return;
    void pc.getStats().then((report) => {
      if (this.link !== link || this.currentState !== 'open') return;
      this.pairTypes = selectedCandidateTypes(report);
    }).catch(() => { /* stats are diagnostics */ });
  }

  private handleMessage(data: unknown): void {
    if (this.currentState !== 'open') return;
    const bytes = frameBytes(data);
    if (!bytes || bytes.byteLength > this.maxFrameBytes) {
      this.stats.framesRejected++;
      return;
    }
    this.stats.framesReceived++;
    this.stats.bytesReceived += bytes.byteLength;
    this.frameListeners.emit(bytes);
  }

  private handleClose(detail: string): void {
    this.dropConnection();
    if (this.currentState === 'closed') return;
    const reason = this.lastErrorDetail ? `${detail}: ${this.lastErrorDetail}` : detail;
    if (this.currentState === 'connecting') {
      this.failAttempt(TRANSPORT_CLOSE.NETWORK, reason);
      return;
    }
    // An unsolicited close: the owner ends a deliberate host close itself (it saw the wire CLOSE first).
    this.scheduleReconnect(TRANSPORT_CLOSE.NETWORK, reason);
  }

  private failAttempt(reason: TransportCloseReason, detail: string): void {
    if (this.attempt === 0 && !this.autoReconnect) {
      this.close(reason, detail);
      return;
    }
    this.scheduleReconnect(reason, detail);
  }

  private scheduleReconnect(reason: TransportCloseReason, detail: string): void {
    if (this.currentState === 'closed') return;
    if (!this.autoReconnect || !RECONNECTABLE_CLOSE_REASONS.has(reason)) {
      this.close(reason, detail);
      return;
    }
    const nowMs = this.clock();
    this.lostAtMs ??= nowMs;
    if (nowMs - this.lostAtMs >= this.reconnectPolicy.windowMs) {
      this.close(TRANSPORT_CLOSE.EXHAUSTED, `no connection for ${Math.round(nowMs - this.lostAtMs)} ms`);
      return;
    }
    this.attempt++;
    this.stats.reconnects++;
    const delayMs = reconnectDelayMs(this.reconnectPolicy, this.attempt, this.random());
    this.transition('reconnecting', { reason, detail, attempt: this.attempt, retryDelayMs: delayMs });
    this.retryTimer = this.setTimer(() => {
      this.retryTimer = null;
      if (this.currentState !== 'reconnecting') return;
      const elapsedMs = this.clock() - (this.lostAtMs ?? this.clock());
      if (elapsedMs >= this.reconnectPolicy.windowMs) {
        this.close(TRANSPORT_CLOSE.EXHAUSTED, `no connection for ${Math.round(elapsedMs)} ms`);
        return;
      }
      this.connect();
    }, delayMs);
  }

  private dropConnection(): void {
    const connection = this.connection;
    this.connection = null;
    this.link++;
    this.pairTypes = null;
    if (!connection) return;
    const { pc, channel } = connection;
    if (channel) {
      channel.onopen = null; channel.onmessage = null; channel.onerror = null; channel.onclose = null;
      try { channel.close(); } catch { /* already closed */ }
    }
    pc.onicecandidate = null; pc.onconnectionstatechange = null; pc.ondatachannel = null;
    try { pc.close(); } catch { /* already closed */ }
  }

  private cancelTimers(): void {
    if (this.retryTimer !== null) { this.clearTimer(this.retryTimer); this.retryTimer = null; }
    if (this.attemptTimer !== null) { this.clearTimer(this.attemptTimer); this.attemptTimer = null; }
  }

  private transition(state: TransportState, change: Omit<TransportStateChange, 'state' | 'previous'>): void {
    const previous = this.currentState;
    if (previous === state && state !== 'reconnecting' && state !== 'connecting') return;
    this.currentState = state;
    this.stateListeners.emit({ state, previous, ...change });
  }
}
