/**
 * WebSocket implementation of the transport contract: binary frames only,
 * reconnect with backoff (250 ms doubling to 8 s, ±20 % jitter, one 60 s
 * window) carrying a resume token, `bufferedAmount` as the backpressure
 * signal and a sustained-backpressure close.
 *
 * The socket is constructed through a factory so Node (its global WebSocket,
 * or `ws`) and browsers use the same code; timers, the clock and the random
 * source are injectable so the receipts run the whole state machine without
 * waiting on real time.
 */
import {
  BackpressureGate, DEFAULT_BACKPRESSURE, DEFAULT_RECONNECT, Listeners, RECONNECTABLE_CLOSE_REASONS,
  TRANSPORT_CLOSE, createTransportStats, reconnectDelayMs,
} from './transport.ts';
import type {
  BackpressurePolicy, ReconnectPolicy, Transport, TransportCloseReason, TransportState, TransportStateChange,
  TransportStats, Unsubscribe,
} from './transport.ts';

/** The subset of the WebSocket API the transport touches (browser, Node's global, `ws`). */
export interface SocketLike {
  readyState: number;
  binaryType: string;
  bufferedAmount?: number;
  send(data: Uint8Array): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: string, listener: (event: SocketEvent) => void): void;
  removeEventListener(type: string, listener: (event: SocketEvent) => void): void;
}

export interface SocketEvent {
  data?: unknown;
  code?: number;
  reason?: string;
  error?: unknown;
  message?: string;
}

export type SocketFactory = (url: string) => SocketLike;
type TimerHandle = unknown;

export interface WebSocketTransportOptions {
  url: string;
  /** Rides the reconnect URL (`?resume=`) so the endpoint can route the new socket to the same match. */
  resumeToken?: string | null;
  createSocket?: SocketFactory;
  backpressure?: Partial<BackpressurePolicy>;
  reconnect?: Partial<ReconnectPolicy>;
  /** false: an unsolicited close ends the transport instead of starting the backoff. */
  autoReconnect?: boolean;
  /** Incoming frames above this size are rejected (the wire's MAX_MESSAGE_BYTES). */
  maxFrameBytes?: number;
  clock?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
  random?: () => number;
}

const SOCKET_OPEN = 1;
const NORMAL_CLOSURE = 1000;
const ABNORMAL_CLOSURE = 1006;
const DEFAULT_MAX_FRAME_BYTES = 64 * 1024;

function defaultSocketFactory(url: string): SocketLike {
  const WebSocketCtor = (globalThis as { WebSocket?: new (url: string) => SocketLike }).WebSocket;
  if (typeof WebSocketCtor !== 'function') throw new Error('WebSocket is unavailable in this runtime');
  return new WebSocketCtor(url);
}

function frameBytes(data: unknown): Uint8Array | null {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return null;
}

/** The reconnect URL: the original endpoint plus the resume token and the attempt ordinal. */
export function resumeUrl(url: string, resumeToken: string | null | undefined, attempt: number): string {
  if (attempt < 1 || !resumeToken) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}resume=${encodeURIComponent(resumeToken)}&attempt=${attempt}`;
}

export class WebSocketTransport implements Transport {
  readonly kind = 'websocket';
  readonly stats: TransportStats = createTransportStats();
  readonly backpressure: BackpressurePolicy;
  readonly reconnectPolicy: ReconnectPolicy;
  private readonly url: string;
  private resumeToken: string | null;
  private readonly createSocket: SocketFactory;
  private readonly autoReconnect: boolean;
  private readonly maxFrameBytes: number;
  private readonly clock: () => number;
  private readonly setTimer: (callback: () => void, delayMs: number) => TimerHandle;
  private readonly clearTimer: (handle: TimerHandle) => void;
  private readonly random: () => number;
  private readonly gate: BackpressureGate;
  private readonly frameListeners = new Listeners<Uint8Array>();
  private readonly stateListeners = new Listeners<TransportStateChange>();
  private currentState: TransportState = 'idle';
  private socket: SocketLike | null = null;
  private generation = 0;
  private attempt = 0;
  private lostAtMs: number | null = null;
  private retryTimer: TimerHandle | null = null;
  private attemptTimer: TimerHandle | null = null;
  private lastErrorDetail = '';
  private readonly detachSocket: Array<() => void> = [];

  constructor({
    url,
    resumeToken = null,
    createSocket = defaultSocketFactory,
    backpressure = {},
    reconnect = {},
    autoReconnect = true,
    maxFrameBytes = DEFAULT_MAX_FRAME_BYTES,
    clock = () => (typeof performance === 'object' ? performance.now() : Date.now()),
    setTimer = (callback, delayMs) => setTimeout(callback, delayMs),
    clearTimer = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    random = Math.random,
  }: WebSocketTransportOptions) {
    if (typeof url !== 'string' || !/^wss?:\/\//.test(url)) throw new TypeError('transport url must use ws:// or wss://');
    this.url = url;
    this.resumeToken = resumeToken;
    this.createSocket = createSocket;
    this.backpressure = { ...DEFAULT_BACKPRESSURE, ...backpressure };
    this.reconnectPolicy = { ...DEFAULT_RECONNECT, ...reconnect };
    this.autoReconnect = autoReconnect;
    this.maxFrameBytes = maxFrameBytes;
    this.clock = clock;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.random = random;
    this.gate = new BackpressureGate(this.backpressure);
  }

  get state(): TransportState { return this.currentState; }

  get bufferedBytes(): number {
    return this.socket && this.currentState === 'open' ? Number(this.socket.bufferedAmount) || 0 : 0;
  }

  /** The token a later reconnect presents (the seat token by default; a server-issued one when the room gives one). */
  setResumeToken(token: string | null): void { this.resumeToken = token; }

  onFrame(listener: (frame: Uint8Array) => void): Unsubscribe { return this.frameListeners.add(listener); }

  onState(listener: (change: TransportStateChange) => void): Unsubscribe { return this.stateListeners.add(listener); }

  open(): void {
    if (this.currentState !== 'idle' && this.currentState !== 'closed') return;
    this.attempt = 0;
    this.lostAtMs = null;
    this.connect();
  }

  send(frame: Uint8Array): boolean {
    if (this.currentState !== 'open' || !this.socket) return false;
    const nowMs = this.clock();
    if (!this.gate.admit(this.bufferedBytes, frame.byteLength, nowMs)) {
      this.stats.framesDropped++;
      if (this.gate.exhausted(nowMs)) this.close(TRANSPORT_CLOSE.BACKPRESSURE, 'unsent bytes stayed above the ceiling');
      return false;
    }
    try {
      this.socket.send(frame);
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
    this.dropSocket(NORMAL_CLOSURE, detail || reason);
    this.scheduleReconnect(reason, detail);
  }

  close(reason: TransportCloseReason = TRANSPORT_CLOSE.CLIENT, detail = ''): void {
    if (this.currentState === 'closed') return;
    this.cancelTimers();
    this.dropSocket(NORMAL_CLOSURE, detail || reason);
    this.transition('closed', { reason, detail });
    this.frameListeners.clear();
  }

  // ------------------------------------------------------------ internals

  private connect(): void {
    this.cancelTimers();
    const generation = ++this.generation;
    const attempt = this.attempt;
    const url = resumeUrl(this.url, this.resumeToken, attempt);
    let socket: SocketLike;
    try {
      socket = this.createSocket(url);
    } catch (error) {
      this.lastErrorDetail = error instanceof Error ? error.message : 'socket construction failed';
      this.transition('connecting', { attempt });
      this.failAttempt(TRANSPORT_CLOSE.NETWORK, this.lastErrorDetail);
      return;
    }
    socket.binaryType = 'arraybuffer';
    this.socket = socket;
    this.attachSocket(socket, generation);
    this.transition('connecting', { attempt });
    this.attemptTimer = this.setTimer(() => {
      this.attemptTimer = null;
      if (this.generation !== generation || this.currentState !== 'connecting') return;
      this.dropSocket(NORMAL_CLOSURE, 'connect timeout');
      this.failAttempt(TRANSPORT_CLOSE.TIMEOUT, 'the connection did not open in time');
    }, this.reconnectPolicy.attemptTimeoutMs);
    if (socket.readyState === SOCKET_OPEN) this.handleOpen(generation);
  }

  private attachSocket(socket: SocketLike, generation: number): void {
    const guard = (handler: (event: SocketEvent) => void) => (event: SocketEvent) => {
      if (this.generation === generation && this.socket === socket) handler(event);
    };
    const onOpen = guard(() => this.handleOpen(generation));
    const onMessage = guard((event) => this.handleMessage(event.data));
    const onError = guard((event) => {
      const error = event.error ?? event.message;
      this.lastErrorDetail = error instanceof Error ? error.message : typeof error === 'string' ? error : 'socket error';
    });
    const onClose = guard((event) => this.handleClose(event.code ?? ABNORMAL_CLOSURE, event.reason || ''));
    socket.addEventListener('open', onOpen);
    socket.addEventListener('message', onMessage);
    socket.addEventListener('error', onError);
    socket.addEventListener('close', onClose);
    this.detachSocket.push(() => {
      socket.removeEventListener('open', onOpen);
      socket.removeEventListener('message', onMessage);
      socket.removeEventListener('error', onError);
      socket.removeEventListener('close', onClose);
    });
  }

  private handleOpen(generation: number): void {
    if (this.generation !== generation || this.currentState !== 'connecting') return;
    if (this.attemptTimer !== null) { this.clearTimer(this.attemptTimer); this.attemptTimer = null; }
    const resumed = this.attempt > 0;
    const attempt = this.attempt;
    this.attempt = 0;
    this.lostAtMs = null;
    this.gate.reset();
    this.stats.opens++;
    this.transition('open', { attempt, resumed });
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

  private handleClose(code: number, reason: string): void {
    this.releaseSocket();
    if (this.currentState === 'closed') return;
    const detail = reason || this.lastErrorDetail || `socket closed (${code})`;
    if (this.currentState === 'connecting') {
      this.failAttempt(TRANSPORT_CLOSE.NETWORK, detail, code);
      return;
    }
    // An unsolicited close: the owner ends a deliberate server close itself
    // (it saw the wire CLOSE first), so everything reaching here is a lost link.
    this.scheduleReconnect(TRANSPORT_CLOSE.NETWORK, detail, code);
  }

  /** A connect attempt failed: schedule the next one or give up. */
  private failAttempt(reason: TransportCloseReason, detail: string, code?: number): void {
    if (this.attempt === 0 && !this.autoReconnect) {
      this.close(reason, detail);
      return;
    }
    this.scheduleReconnect(reason, detail, code);
  }

  private scheduleReconnect(reason: TransportCloseReason, detail: string, code?: number): void {
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
    this.transition('reconnecting', { reason, detail, attempt: this.attempt, code });
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

  private dropSocket(code: number, reason: string): void {
    const socket = this.socket;
    this.releaseSocket();
    if (!socket) return;
    try { socket.close(code, reason.slice(0, 120)); } catch { /* already closed */ }
  }

  private releaseSocket(): void {
    for (const detach of this.detachSocket) detach();
    this.detachSocket.length = 0;
    this.socket = null;
    this.generation++;
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
