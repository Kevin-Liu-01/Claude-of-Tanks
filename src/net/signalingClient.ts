import type { RuntimeValue } from '../runtimeTypes.ts';
import { normalizeRoomCode } from './protocol.ts';

type Unsubscribe = () => void;
type Timer = ReturnType<typeof setTimeout>;
type PollTimer = ReturnType<typeof setInterval>;
type SignalingState = 'idle' | 'connecting' | 'open' | 'closed' | 'reconnecting';
type SocketEventType = 'open' | 'message' | 'error' | 'close';

interface SocketEvent {
  data?: RuntimeValue;
  error?: RuntimeValue;
}

interface SignalingSocket {
  [eventHandler: `on${string}`]: RuntimeValue;
  readonly readyState: number | string;
  send(value: string): void;
  close(code?: number, reason?: string): void;
  addEventListener?(type: string, listener: (event: SocketEvent) => void): void;
  removeEventListener?(type: string, listener: (event: SocketEvent) => void): void;
}

type SignalingSocketFactory = (url: string) => SignalingSocket;

interface PendingRequest {
  resolve(value: RuntimeValue): void;
  reject(reason: RuntimeValue): void;
  timer: Timer;
}

export interface SignalingPlayer {
  id: string;
  name: string;
}

export interface SignalingEvent {
  type: string;
  requestId?: string;
  payload?: RuntimeValue;
  [key: string]: RuntimeValue;
}

export interface SignalingRoomInfo extends Record<string, RuntimeValue> {
  roomCode: string;
  peerId: string;
  hostId: string;
  mode?: string;
}

export interface RoomSignalingClientOptions {
  url?: RuntimeValue;
  WebSocketImpl?: RuntimeValue;
  connectTimeoutMs?: number;
  requestTimeoutMs?: number;
  eventPollIntervalMs?: number;
  eventPollTimeoutMs?: number;
  reconnectDelaysMs?: number[];
  sessionId?: RuntimeValue;
}

export interface CreateSignalingRoomOptions {
  player?: RuntimeValue;
  maxPlayers?: number;
  mode?: RuntimeValue;
}

export interface JoinSignalingRoomOptions {
  roomCode?: RuntimeValue;
  player?: RuntimeValue;
}

interface QueuedSignalMessage {
  type: 'room_signal';
  payload: {
    roomCode: string;
    toPeerId: string;
    toSessionId: string;
    signal: RuntimeValue;
  };
}

const MAX_SIGNAL_BYTES = 128 * 1024;
const MAX_QUEUED_EVENTS = 64;
const MAX_QUEUED_SIGNALS = 256;
const STORE_RETRY_DELAYS_MS = [250, 750];
const ROOM_REQUEST_RETRY_DELAYS_MS = [250, 750, 1_500, 3_000];
const DEFAULT_RECONNECT_DELAYS_MS = [250, 500, 1_000, 2_000, 4_000, 8_000, 15_000, 30_000];
const RETRYABLE_STORE_ERRORS = new Set([
  'signaling_store_unavailable',
  'redis_ready_timeout',
  'redis_connection_ended',
]);
const RETRYABLE_CONNECTION_ERRORS = new Set([
  'signaling_closed',
  'signaling_connection_closed',
  'signaling_connection_failed',
  'signaling_connect_timeout',
  'signaling_request_timeout',
]);

function isRecord(value: RuntimeValue): value is Record<string, RuntimeValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function codedError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function errorCode(error: RuntimeValue, fallback: string): string {
  if (!isRecord(error) || typeof error.code !== 'string' || !error.code) return fallback;
  return error.code;
}

function isSignalingSocket(value: RuntimeValue): value is SignalingSocket {
  return isRecord(value) &&
    (typeof value.readyState === 'number' || typeof value.readyState === 'string') &&
    typeof value.send === 'function' && typeof value.close === 'function';
}

function websocketFactory(injected: RuntimeValue): SignalingSocketFactory {
  const Ctor = injected || globalThis.WebSocket;
  if (typeof Ctor !== 'function') throw new Error('WebSocket is unavailable');
  return (url: string) => {
    const socket: RuntimeValue = Reflect.construct(Ctor, [url]);
    if (!isSignalingSocket(socket)) {
      throw new TypeError('WebSocket must expose readyState and implement send() and close()');
    }
    return socket;
  };
}

function createSessionId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID().replace(/-/g, '');
  }
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const words = new Uint32Array(4);
    globalThis.crypto.getRandomValues(words);
    return [...words].map((word) => word.toString(16).padStart(8, '0')).join('');
  }
  throw new Error('secure randomness is unavailable for signaling session identity');
}

function cleanSessionId(value: RuntimeValue): string {
  const id = String(value || '').trim();
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(id)) throw new TypeError('invalid signaling session id');
  return id;
}

function addListener(
  target: SignalingSocket,
  type: SocketEventType,
  listener: (event: SocketEvent) => void,
): Unsubscribe {
  if (typeof target.addEventListener === 'function') {
    target.addEventListener(type, listener);
    return () => target.removeEventListener?.(type, listener);
  }
  const key: `on${string}` = `on${type}`;
  const previous = target[key];
  target[key] = listener;
  return () => {
    if (target[key] === listener) target[key] = previous || null;
  };
}

function socketIsOpen(socket: SignalingSocket | null): socket is SignalingSocket {
  return !!socket && (socket.readyState === 1 || socket.readyState === 'open');
}

function socketMayClose(socket: SignalingSocket | null): socket is SignalingSocket {
  if (!socket) return false;
  return typeof socket.readyState === 'number'
    ? socket.readyState < 2
    : socket.readyState === 'connecting' || socket.readyState === 'open';
}

function cleanPlayer(player: RuntimeValue): SignalingPlayer {
  const record = isRecord(player) ? player : {};
  const id = String(record.id || '').trim();
  const name = String(record.name || '').trim().replace(/\s+/g, ' ').slice(0, 24);
  if (!/^[a-zA-Z0-9_-]{1,48}$/.test(id) || !name) {
    throw new TypeError('signaling player requires a safe id and name');
  }
  return { id, name };
}

function readRoomInfo(
  value: RuntimeValue,
  fallbackRoomCode = '',
  requireHost = false,
): SignalingRoomInfo {
  if (!isRecord(value)) throw codedError('invalid_room_response', 'room response must be an object');
  const roomCode = normalizeRoomCode(value.roomCode || fallbackRoomCode);
  const peerId = String(value.peerId || '').trim();
  const hostId = String(value.hostId || (requireHost ? '' : peerId)).trim();
  if (roomCode.length !== 6 || !peerId || !hostId) {
    throw codedError('invalid_room_response', 'room response is missing canonical identity');
  }
  return {
    ...value,
    roomCode,
    peerId,
    hostId,
    ...(typeof value.mode === 'string' ? { mode: value.mode } : {}),
  };
}

function eventPayload(message: SignalingEvent): Record<string, RuntimeValue> | null {
  return isRecord(message.payload) ? message.payload : null;
}

function unrefTimer(timer: Timer | PollTimer): void {
  if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
    const unref = (timer as { unref?: RuntimeValue }).unref;
    if (typeof unref === 'function') unref.call(timer);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Rendezvous only: gameplay never traverses this signaling socket. */
export class RoomSignalingClient {
  readonly url: string;
  readonly createSocket: SignalingSocketFactory;
  readonly connectTimeoutMs: number;
  readonly requestTimeoutMs: number;
  eventPollIntervalMs: number;
  readonly eventPollTimeoutMs: number;
  readonly reconnectDelaysMs: number[];
  sessionId: string;
  socket: SignalingSocket | null = null;
  requestSeq = 0;
  readonly pending = new Map<string, PendingRequest>();
  readonly listeners = new Set<(message: SignalingEvent) => void>();
  readonly eventQueue: SignalingEvent[] = [];
  state: SignalingState = 'idle';
  roomCode: string | null = null;
  peerId: string | null = null;
  hostId: string | null = null;
  player: SignalingPlayer | null = null;
  private connectPromise: Promise<void> | null = null;
  private pollTimer: PollTimer | null = null;
  private pollInFlight: Promise<void> | null = null;
  private roomAuthenticated = false;
  private manualClose = false;
  private reconnectAttempt = 0;
  private reconnectTimer: Timer | null = null;
  private resumePromise: Promise<boolean> | null = null;
  private readonly signalQueue: QueuedSignalMessage[] = [];

  get queuedSignalCount(): number {
    return this.signalQueue.length;
  }

  constructor({
    url,
    WebSocketImpl = null,
    connectTimeoutMs = 5000,
    requestTimeoutMs = 30000,
    eventPollIntervalMs = 500,
    eventPollTimeoutMs = 10_000,
    reconnectDelaysMs = DEFAULT_RECONNECT_DELAYS_MS,
    sessionId = null,
  }: RoomSignalingClientOptions = {}) {
    const endpoint = String(url || '').trim();
    if (!endpoint) throw new TypeError('signaling URL is required');
    if (!/^wss?:\/\//i.test(endpoint)) throw new TypeError('signaling URL must use ws or wss');
    if (!Number.isFinite(connectTimeoutMs) || connectTimeoutMs <= 0) {
      throw new TypeError('signaling connection timeout must be positive');
    }
    if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) {
      throw new TypeError('signaling request timeout must be positive');
    }
    this.url = endpoint;
    this.createSocket = websocketFactory(WebSocketImpl);
    this.connectTimeoutMs = connectTimeoutMs;
    this.requestTimeoutMs = requestTimeoutMs;
    if (!Number.isFinite(eventPollIntervalMs) || eventPollIntervalMs < 10) {
      throw new TypeError('signaling event poll interval must be at least 10 ms');
    }
    this.eventPollIntervalMs = eventPollIntervalMs;
    if (!Number.isFinite(eventPollTimeoutMs) || eventPollTimeoutMs < 100) {
      throw new TypeError('signaling event poll timeout must be at least 100 ms');
    }
    this.eventPollTimeoutMs = eventPollTimeoutMs;
    if (!Array.isArray(reconnectDelaysMs) || reconnectDelaysMs.length === 0 ||
        reconnectDelaysMs.some((entry) => !Number.isFinite(entry) || entry < 0)) {
      throw new TypeError('signaling reconnect delays must be a non-empty array of milliseconds');
    }
    this.reconnectDelaysMs = [...reconnectDelaysMs];
    this.sessionId = cleanSessionId(sessionId || createSessionId());
  }

  connect(): Promise<void> {
    if (this.state === 'open') return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;
    this.state = 'connecting';
    const socket = this.createSocket(this.url);
    this.socket = socket;
    this.connectPromise = new Promise<void>((resolve, reject) => {
      let settled = false;
      let timer: Timer | null = null;
      let removeOpen: Unsubscribe = () => {};
      let removeError: Unsubscribe = () => {};
      const cleanupConnect = () => {
        if (timer) clearTimeout(timer);
        removeOpen();
        removeError();
      };
      const fail = (error: RuntimeValue, closeSocket = true) => {
        if (settled) return;
        settled = true;
        cleanupConnect();
        if (this.socket === socket) {
          this.state = 'closed';
          this.connectPromise = null;
        }
        if (closeSocket && socketMayClose(socket)) {
          try {
            socket.close(1000, 'connection_failed');
          } catch {
            // The socket failed between the ready-state check and close.
          }
        }
        reject(error);
      };
      removeOpen = addListener(socket, 'open', () => {
        if (settled || this.socket !== socket) return;
        settled = true;
        cleanupConnect();
        this.state = 'open';
        this.connectPromise = null;
        resolve();
      });
      addListener(socket, 'message', (event) => {
        if (this.socket === socket) this.#receive(event.data);
      });
      removeError = addListener(socket, 'error', () => {
        fail(codedError(
          'signaling_connection_failed',
          'Cannot reach the signaling server. Check its address and availability.',
        ));
      });
      addListener(socket, 'close', () => {
        if (!settled) {
          fail(codedError(
            'signaling_connection_closed',
            'The signaling server closed before the connection was ready.',
          ), false);
          return;
        }
        if (this.socket === socket) {
          this.socket = null;
          this.#closed('signaling_closed', true);
        }
      });
      timer = setTimeout(() => {
        const seconds = Math.max(1, Math.ceil(this.connectTimeoutMs / 1000));
        fail(codedError(
          'signaling_connect_timeout',
          `The signaling server did not respond within ${seconds} seconds.`,
        ));
      }, this.connectTimeoutMs);
    });
    return this.connectPromise;
  }

  #send(value: RuntimeValue): void {
    const socket = this.socket;
    if (this.state !== 'open' || !socketIsOpen(socket)) {
      throw codedError('signaling_closed', 'signaling socket is not open');
    }
    const encoded = JSON.stringify(value);
    if (encoded.length * 2 > MAX_SIGNAL_BYTES) throw new Error('signaling message is too large');
    try {
      socket.send(encoded);
    } catch {
      throw codedError('signaling_closed', 'signaling socket closed during send');
    }
  }

  #request(
    type: string,
    payload: RuntimeValue,
    timeoutMs = this.requestTimeoutMs,
  ): Promise<RuntimeValue> {
    const requestId = `${++this.requestSeq}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(codedError('signaling_request_timeout', `signaling request timed out: ${type}`));
      }, timeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      try {
        this.#send({ type, requestId, payload });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(error);
      }
    });
  }

  async #requestWithStoreRetry(type: string, payload: RuntimeValue): Promise<RuntimeValue> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.#request(type, payload);
      } catch (error) {
        if (!RETRYABLE_STORE_ERRORS.has(errorCode(error, '')) ||
            attempt >= STORE_RETRY_DELAYS_MS.length || this.state !== 'open') throw error;
        await delay(STORE_RETRY_DELAYS_MS[attempt]);
      }
    }
  }

  async #requestRoom(type: string, payload: RuntimeValue): Promise<RuntimeValue> {
    for (let attempt = 0; ; attempt++) {
      try {
        await this.connect();
        return await this.#requestWithStoreRetry(type, payload);
      } catch (error) {
        if (!RETRYABLE_CONNECTION_ERRORS.has(errorCode(error, '')) ||
            attempt >= ROOM_REQUEST_RETRY_DELAYS_MS.length || this.manualClose) throw error;
        this.#discardSocket('room_request_retry');
        await delay(ROOM_REQUEST_RETRY_DELAYS_MS[attempt]);
      }
    }
  }

  #dispatch(message: SignalingEvent): void {
    // Durable mailboxes can outlive one RTCPeerConnection generation. Never
    // feed an offer, answer, or ICE candidate addressed to an older page
    // session into the replacement peer created after a reload/rebuild.
    const payload = eventPayload(message);
    if (message.type === 'room_signal' && payload?.toSessionId !== this.sessionId) return;
    if (this.listeners.size === 0) {
      if (this.eventQueue.length >= MAX_QUEUED_EVENTS) this.eventQueue.shift();
      this.eventQueue.push(message);
      return;
    }
    for (const listener of [...this.listeners]) listener(message);
  }

  #receive(raw: RuntimeValue): void {
    let parsed: RuntimeValue;
    try {
      parsed = JSON.parse(String(raw));
    } catch {
      this.close('invalid_signaling_payload');
      return;
    }
    if (!isRecord(parsed) || typeof parsed.type !== 'string') return;
    const message: SignalingEvent = { ...parsed, type: parsed.type };
    const requestId = parsed.requestId == null ? '' : String(parsed.requestId);
    if (requestId && this.pending.has(requestId)) {
      const pending = this.pending.get(requestId);
      if (!pending) return;
      this.pending.delete(requestId);
      clearTimeout(pending.timer);
      if (message.type === 'error') {
        const payload = eventPayload(message);
        pending.reject(codedError(
          String(payload?.code || 'signaling_error'),
          String(payload?.message || 'signaling error'),
        ));
      } else {
        pending.resolve(message.payload);
      }
      return;
    }
    this.#dispatch(message);
  }

  #rejectPending(reason: string): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(codedError(reason, reason));
    }
    this.pending.clear();
  }

  #closed(reason: string, unexpected = false): void {
    this.state = 'closed';
    this.connectPromise = null;
    this.roomAuthenticated = false;
    this.#rejectPending(reason);
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    if (unexpected && !this.manualClose && this.roomCode && this.player) {
      this.#scheduleReconnect(reason);
    }
  }

  #discardSocket(reason: string): void {
    const socket = this.socket;
    this.socket = null;
    this.state = 'closed';
    this.connectPromise = null;
    this.roomAuthenticated = false;
    this.#rejectPending(reason);
    if (socketMayClose(socket)) {
      try {
        socket.close(1000, String(reason).slice(0, 120));
      } catch {
        // The socket failed between the ready-state check and close.
      }
    }
  }

  #scheduleReconnect(reason = 'signaling_closed'): void {
    if (this.manualClose || this.reconnectTimer || this.resumePromise ||
        !this.roomCode || !this.player) return;
    const delayMs = this.reconnectDelaysMs[
      Math.min(this.reconnectAttempt, this.reconnectDelaysMs.length - 1)
    ];
    this.reconnectAttempt++;
    this.state = 'reconnecting';
    this.#dispatch({
      type: 'signaling_state',
      payload: {
        state: 'reconnecting',
        reason,
        attempt: this.reconnectAttempt,
        delayMs,
      },
    });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.#resumeRoom();
    }, delayMs);
    unrefTimer(this.reconnectTimer);
  }

  #resumeRoom(): Promise<boolean> {
    if (this.manualClose || !this.roomCode || !this.player) return Promise.resolve(false);
    if (this.resumePromise) return this.resumePromise;
    const roomCode = this.roomCode;
    const player = this.player;
    let retryReason: string | null = null;
    const operation = (async (): Promise<boolean> => {
      try {
        await this.connect();
        const raw = await this.#requestWithStoreRetry('room_join', {
          roomCode,
          player,
          sessionId: this.sessionId,
        });
        const result = readRoomInfo(raw, roomCode, true);
        this.roomCode = result.roomCode;
        this.peerId = result.peerId;
        this.hostId = result.hostId;
        this.roomAuthenticated = true;
        this.reconnectAttempt = 0;
        this.#startEventPolling();
        const queued = this.signalQueue.splice(0);
        for (let index = 0; index < queued.length; index++) {
          try {
            this.#send(queued[index]);
          } catch (error) {
            this.signalQueue.unshift(...queued.slice(index));
            throw error;
          }
        }
        this.#dispatch({
          type: 'signaling_resumed',
          payload: {
            ...result,
            roomCode: result.roomCode,
            peerId: this.peerId,
            hostId: this.hostId,
          },
        });
        return true;
      } catch (error) {
        this.#discardSocket('room_resume_retry');
        if (errorCode(error, '') === 'room_not_found') {
          this.#dispatch({
            type: 'room_closed',
            payload: { roomCode, reason: 'expired' },
          });
          this.roomCode = null;
          this.peerId = null;
          this.hostId = null;
          this.player = null;
          this.signalQueue.length = 0;
          return false;
        }
        retryReason = errorCode(error, 'resume_failed');
        return false;
      }
    })();
    this.resumePromise = operation.then((resumed) => {
      this.resumePromise = null;
      if (!resumed && retryReason && !this.manualClose) this.#scheduleReconnect(retryReason);
      return resumed;
    }, (error: RuntimeValue) => {
      this.resumePromise = null;
      if (!this.manualClose) this.#scheduleReconnect(errorCode(error, 'resume_failed'));
      return false;
    });
    return this.resumePromise;
  }

  /** Rotate the page's RTC epoch and re-announce membership after terminal ICE loss. */
  restartRoomSession(reason = 'rtc_recovery'): Promise<boolean> {
    if (this.manualClose || !this.roomCode || !this.player) {
      return Promise.reject(codedError('room_resume_unavailable', 'join or create a room first'));
    }
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.reconnectAttempt = 0;
    // Signals queued before the RTC epoch rotates contain SDP/ICE from the
    // dead peer connection. Re-labeling and flushing them under the new
    // signaling session would poison the replacement negotiation.
    this.signalQueue.length = 0;
    this.sessionId = cleanSessionId(createSessionId());
    this.#dispatch({
      type: 'signaling_state',
      payload: { state: 'reconnecting', reason, attempt: 1, delayMs: 0 },
    });
    this.#discardSocket(reason);
    return this.#resumeRoom();
  }

  #startEventPolling(): void {
    if (this.pollTimer || !this.roomAuthenticated || !this.roomCode || !this.peerId) return;
    const poll = () => {
      if (this.state !== 'open' || !this.roomCode || !this.peerId || this.pollInFlight) return;
      const roomCode = this.roomCode;
      const attempt = this.#request('room_poll', { roomCode }, this.eventPollTimeoutMs)
        .then((result) => {
          if (isRecord(result) && result.roomCode &&
              normalizeRoomCode(result.roomCode) !== roomCode) {
            throw codedError('signaling_poll_mismatch', 'signaling poll returned another room');
          }
        })
        .catch((error: RuntimeValue) => {
          if (this.manualClose || !this.roomCode || this.state !== 'open') return;
          const reason = errorCode(error, 'signaling_poll_failed');
          this.#discardSocket(reason);
          this.#scheduleReconnect(reason);
        })
        .finally(() => {
          if (this.pollInFlight === attempt) this.pollInFlight = null;
        });
      this.pollInFlight = attempt;
    };
    this.pollTimer = setInterval(poll, this.eventPollIntervalMs);
    unrefTimer(this.pollTimer);
    poll();
  }

  setEventPollInterval(intervalMs: number): void {
    if (!Number.isFinite(intervalMs) || intervalMs < 10) {
      throw new TypeError('signaling event poll interval must be at least 10 ms');
    }
    this.eventPollIntervalMs = intervalMs;
    if (!this.pollTimer) return;
    clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.#startEventPolling();
  }

  async createRoom({
    player,
    maxPlayers = 14,
    mode = 'private',
  }: CreateSignalingRoomOptions = {}): Promise<SignalingRoomInfo> {
    this.manualClose = false;
    const clean = cleanPlayer(player);
    const raw = await this.#requestRoom('room_create', {
      player: clean,
      sessionId: this.sessionId,
      maxPlayers,
      mode,
    });
    const result = readRoomInfo(raw);
    this.roomCode = result.roomCode;
    this.peerId = result.peerId;
    this.hostId = result.hostId;
    this.player = clean;
    this.roomAuthenticated = true;
    this.manualClose = false;
    this.#startEventPolling();
    return result;
  }

  async joinRoom({
    roomCode,
    player,
  }: JoinSignalingRoomOptions = {}): Promise<SignalingRoomInfo> {
    this.manualClose = false;
    const code = normalizeRoomCode(roomCode);
    if (code.length !== 6) throw new TypeError('room code must be 6 characters');
    const clean = cleanPlayer(player);
    const raw = await this.#requestRoom('room_join', {
      roomCode: code,
      player: clean,
      sessionId: this.sessionId,
    });
    const result = readRoomInfo(raw, code, true);
    this.roomCode = code;
    this.peerId = result.peerId;
    this.hostId = result.hostId;
    this.player = clean;
    this.roomAuthenticated = true;
    this.manualClose = false;
    this.#startEventPolling();
    return { ...result, roomCode: code };
  }

  sendSignal(toPeerId: RuntimeValue, signal: RuntimeValue, toSessionId: RuntimeValue = ''): boolean {
    if (!this.roomCode || !this.peerId) throw new Error('join or create a room first');
    const target = String(toPeerId || '').trim();
    if (!target) throw new TypeError('target peer is required');
    const message: QueuedSignalMessage = {
      type: 'room_signal',
      payload: {
        roomCode: this.roomCode,
        toPeerId: target,
        toSessionId: String(toSessionId || ''),
        signal,
      },
    };
    if (!this.roomAuthenticated || this.state !== 'open' || !socketIsOpen(this.socket)) {
      if (this.signalQueue.length >= MAX_QUEUED_SIGNALS) this.signalQueue.shift();
      this.signalQueue.push(message);
      this.#scheduleReconnect('signal_queued');
      return false;
    }
    this.#send(message);
    return true;
  }

  onEvent(listener: (message: SignalingEvent) => void): Unsubscribe {
    if (typeof listener !== 'function') throw new TypeError('signaling event listener is required');
    this.listeners.add(listener);
    const queued = this.eventQueue.splice(0);
    for (const message of queued) listener(message);
    return () => this.listeners.delete(listener);
  }

  close(reason = 'client_closed'): void {
    this.manualClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.signalQueue.length = 0;
    const socket = this.socket;
    if (socketMayClose(socket)) {
      try {
        if (this.roomCode && this.peerId && this.state === 'open') {
          this.#send({ type: 'room_leave', payload: { roomCode: this.roomCode } });
        }
      } finally {
        socket.close(1000, String(reason).slice(0, 120));
      }
    }
    this.eventQueue.length = 0;
    this.roomCode = null;
    this.peerId = null;
    this.hostId = null;
    this.player = null;
    this.#closed(reason, false);
  }
}
