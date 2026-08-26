import { normalizeRoomCode } from './protocol.js';

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

function codedError(code, message) {
  return Object.assign(new Error(message), { code });
}

function websocketConstructor(injected) {
  const Ctor = injected || globalThis.WebSocket;
  if (typeof Ctor !== 'function') throw new Error('WebSocket is unavailable');
  return Ctor;
}

function createSessionId() {
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

function cleanSessionId(value) {
  const id = String(value || '').trim();
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(id)) throw new TypeError('invalid signaling session id');
  return id;
}

function addListener(target, type, listener) {
  if (typeof target.addEventListener === 'function') {
    target.addEventListener(type, listener);
    return () => target.removeEventListener(type, listener);
  }
  target[`on${type}`] = listener;
  return () => { if (target[`on${type}`] === listener) target[`on${type}`] = null; };
}

function cleanPlayer(player) {
  const id = String(player && player.id || '').trim();
  const name = String(player && player.name || '').trim().replace(/\s+/g, ' ').slice(0, 24);
  if (!/^[a-zA-Z0-9_-]{1,48}$/.test(id) || !name) {
    throw new TypeError('signaling player requires a safe id and name');
  }
  return { id, name };
}

/** Rendezvous only: gameplay never traverses this signaling socket. */
export class RoomSignalingClient {
  constructor({
    url,
    WebSocketImpl = null,
    connectTimeoutMs = 5000,
    requestTimeoutMs = 30000,
    eventPollIntervalMs = 500,
    reconnectDelaysMs = DEFAULT_RECONNECT_DELAYS_MS,
    sessionId = null,
  } = {}) {
    if (!url) throw new TypeError('signaling URL is required');
    if (!/^wss?:\/\//i.test(url)) throw new TypeError('signaling URL must use ws or wss');
    if (!Number.isFinite(connectTimeoutMs) || connectTimeoutMs <= 0) {
      throw new TypeError('signaling connection timeout must be positive');
    }
    this.url = url;
    this.WebSocketImpl = websocketConstructor(WebSocketImpl);
    this.connectTimeoutMs = connectTimeoutMs;
    this.requestTimeoutMs = requestTimeoutMs;
    if (!Number.isFinite(eventPollIntervalMs) || eventPollIntervalMs < 10) {
      throw new TypeError('signaling event poll interval must be at least 10 ms');
    }
    this.eventPollIntervalMs = eventPollIntervalMs;
    if (!Array.isArray(reconnectDelaysMs) || reconnectDelaysMs.length === 0 ||
        reconnectDelaysMs.some((delay) => !Number.isFinite(delay) || delay < 0)) {
      throw new TypeError('signaling reconnect delays must be a non-empty array of milliseconds');
    }
    this.reconnectDelaysMs = [...reconnectDelaysMs];
    this.sessionId = cleanSessionId(sessionId || createSessionId());
    this.socket = null;
    this.requestSeq = 0;
    this.pending = new Map();
    this.listeners = new Set();
    this.eventQueue = [];
    this.state = 'idle';
    this.roomCode = null;
    this.peerId = null;
    this.hostId = null;
    this.player = null;
    this._connectPromise = null;
    this._pollTimer = null;
    this._roomAuthenticated = false;
    this._manualClose = false;
    this._reconnectAttempt = 0;
    this._reconnectTimer = null;
    this._resumePromise = null;
    this._signalQueue = [];
  }

  connect() {
    if (this.state === 'open') return Promise.resolve();
    if (this._connectPromise) return this._connectPromise;
    this.state = 'connecting';
    const socket = new this.WebSocketImpl(this.url);
    this.socket = socket;
    this._connectPromise = new Promise((resolve, reject) => {
      let settled = false;
      let timer = null;
      let removeOpen = () => {};
      let removeError = () => {};
      const cleanupConnect = () => {
        if (timer) clearTimeout(timer);
        removeOpen();
        removeError();
      };
      const fail = (error, closeSocket = true) => {
        if (settled) return;
        settled = true;
        cleanupConnect();
        if (this.socket === socket) {
          this.state = 'closed';
          this._connectPromise = null;
        }
        if (closeSocket && socket.readyState < 2) {
          try { socket.close(1000, 'connection_failed'); } catch (_) { /* already failed */ }
        }
        reject(error);
      };
      removeOpen = addListener(socket, 'open', () => {
        if (settled || this.socket !== socket) return;
        settled = true;
        cleanupConnect();
        this.state = 'open';
        this._connectPromise = null;
        resolve();
      });
      addListener(socket, 'message', (event) => {
        if (this.socket === socket) this.#receive(event.data);
      });
      removeError = addListener(socket, 'error', () => {
        const error = new Error('Cannot reach the signaling server. Check its address and availability.');
        error.code = 'signaling_connection_failed';
        fail(error);
      });
      addListener(socket, 'close', () => {
        if (!settled) {
          const error = new Error('The signaling server closed before the connection was ready.');
          error.code = 'signaling_connection_closed';
          fail(error, false);
          return;
        }
        if (this.socket === socket) {
          this.socket = null;
          this.#closed('signaling_closed', true);
        }
      });
      timer = setTimeout(() => {
        const seconds = Math.max(1, Math.ceil(this.connectTimeoutMs / 1000));
        const error = new Error(`The signaling server did not respond within ${seconds} seconds.`);
        error.code = 'signaling_connect_timeout';
        fail(error);
      }, this.connectTimeoutMs);
    });
    return this._connectPromise;
  }

  #send(value) {
    if (this.state !== 'open' || !this.socket) throw new Error('signaling socket is not open');
    const encoded = JSON.stringify(value);
    if (encoded.length * 2 > MAX_SIGNAL_BYTES) throw new Error('signaling message is too large');
    this.socket.send(encoded);
  }

  #request(type, payload) {
    const requestId = `${++this.requestSeq}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(codedError('signaling_request_timeout', `signaling request timed out: ${type}`));
      }, this.requestTimeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      this.#send({ type, requestId, payload });
    });
  }

  async #requestWithStoreRetry(type, payload) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.#request(type, payload);
      } catch (error) {
        if (!RETRYABLE_STORE_ERRORS.has(error?.code) ||
            attempt >= STORE_RETRY_DELAYS_MS.length || this.state !== 'open') throw error;
        await new Promise((resolve) => setTimeout(resolve, STORE_RETRY_DELAYS_MS[attempt]));
      }
    }
  }

  async #requestRoom(type, payload) {
    for (let attempt = 0; ; attempt++) {
      try {
        await this.connect();
        return await this.#requestWithStoreRetry(type, payload);
      } catch (error) {
        if (!RETRYABLE_CONNECTION_ERRORS.has(error?.code) ||
            attempt >= ROOM_REQUEST_RETRY_DELAYS_MS.length || this._manualClose) throw error;
        this.#discardSocket('room_request_retry');
        await new Promise((resolve) => setTimeout(resolve, ROOM_REQUEST_RETRY_DELAYS_MS[attempt]));
      }
    }
  }

  #dispatch(message) {
    if (this.listeners.size === 0) {
      if (this.eventQueue.length >= MAX_QUEUED_EVENTS) this.eventQueue.shift();
      this.eventQueue.push(message);
      return;
    }
    for (const listener of [...this.listeners]) listener(message);
  }

  #receive(raw) {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch (_) {
      this.close('invalid_signaling_payload');
      return;
    }
    if (!message || typeof message !== 'object' || typeof message.type !== 'string') return;
    if (message.requestId && this.pending.has(String(message.requestId))) {
      const pending = this.pending.get(String(message.requestId));
      this.pending.delete(String(message.requestId));
      clearTimeout(pending.timer);
      if (message.type === 'error') {
        const error = new Error(String(message.payload && message.payload.message || 'signaling error'));
        error.code = String(message.payload && message.payload.code || 'signaling_error');
        pending.reject(error);
      } else pending.resolve(message.payload);
      return;
    }
    this.#dispatch(message);
  }

  #closed(reason, unexpected = false) {
    this.state = 'closed';
    this._connectPromise = null;
    this._roomAuthenticated = false;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(codedError(reason, reason));
    }
    this.pending.clear();
    if (this._pollTimer) clearInterval(this._pollTimer);
    this._pollTimer = null;
    if (unexpected && !this._manualClose && this.roomCode && this.player) {
      this.#scheduleReconnect(reason);
    }
  }

  #discardSocket(reason) {
    const socket = this.socket;
    this.socket = null;
    this.state = 'closed';
    this._connectPromise = null;
    this._roomAuthenticated = false;
    if (socket && socket.readyState < 2) {
      try { socket.close(1000, String(reason).slice(0, 120)); } catch (_) { /* already failed */ }
    }
  }

  #scheduleReconnect(reason = 'signaling_closed') {
    if (this._manualClose || this._reconnectTimer || this._resumePromise ||
        !this.roomCode || !this.player) return;
    const delay = this.reconnectDelaysMs[
      Math.min(this._reconnectAttempt, this.reconnectDelaysMs.length - 1)
    ];
    this._reconnectAttempt++;
    this.state = 'reconnecting';
    this.#dispatch({
      type: 'signaling_state',
      payload: { state: 'reconnecting', reason, attempt: this._reconnectAttempt, delayMs: delay },
    });
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this.#resumeRoom();
    }, delay);
    if (typeof this._reconnectTimer.unref === 'function') this._reconnectTimer.unref();
  }

  #resumeRoom() {
    if (this._manualClose || !this.roomCode || !this.player) return Promise.resolve(false);
    if (this._resumePromise) return this._resumePromise;
    const roomCode = this.roomCode;
    const player = this.player;
    this._resumePromise = (async () => {
      try {
        await this.connect();
        const result = await this.#requestWithStoreRetry('room_join', {
          roomCode,
          player,
          sessionId: this.sessionId,
        });
        const code = normalizeRoomCode(result?.roomCode || roomCode);
        if (code.length !== 6 || !result?.peerId || !result?.hostId) {
          throw codedError('invalid_room_resume', 'invalid room resume response');
        }
        this.roomCode = code;
        this.peerId = String(result.peerId);
        this.hostId = String(result.hostId);
        this._roomAuthenticated = true;
        this._reconnectAttempt = 0;
        this.#startEventPolling();
        const queued = this._signalQueue.splice(0);
        for (const message of queued) this.#send(message);
        this.#dispatch({
          type: 'signaling_resumed',
          payload: { ...result, roomCode: code, peerId: this.peerId, hostId: this.hostId },
        });
        return null;
      } catch (error) {
        this.#discardSocket('room_resume_retry');
        if (error?.code === 'room_not_found') {
          this.#dispatch({
            type: 'room_closed',
            payload: { roomCode, reason: 'expired' },
          });
          this.roomCode = null;
          this.peerId = null;
          this.hostId = null;
          this.player = null;
          this._signalQueue.length = 0;
          return false;
        }
        return error;
      }
    })().then((error) => {
      this._resumePromise = null;
      if (error && !this._manualClose) this.#scheduleReconnect(error.code || 'resume_failed');
      return error == null;
    }, (error) => {
      this._resumePromise = null;
      if (!this._manualClose) this.#scheduleReconnect(error?.code || 'resume_failed');
      return false;
    });
    return this._resumePromise;
  }

  /** Rotate the page's RTC epoch and re-announce membership after terminal ICE loss. */
  restartRoomSession(reason = 'rtc_recovery') {
    if (this._manualClose || !this.roomCode || !this.player) {
      return Promise.reject(codedError('room_resume_unavailable', 'join or create a room first'));
    }
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    this._reconnectTimer = null;
    this._reconnectAttempt = 0;
    this.sessionId = cleanSessionId(createSessionId());
    this.#dispatch({
      type: 'signaling_state',
      payload: { state: 'reconnecting', reason, attempt: 1, delayMs: 0 },
    });
    this.#discardSocket(reason);
    return this.#resumeRoom();
  }

  #startEventPolling() {
    if (this._pollTimer || !this._roomAuthenticated || !this.roomCode || !this.peerId) return;
    this._pollTimer = setInterval(() => {
      if (this.state !== 'open' || !this.roomCode || !this.peerId) return;
      try { this.#send({ type: 'room_poll', payload: { roomCode: this.roomCode } }); }
      catch (_) { /* socket close handling owns recovery */ }
    }, this.eventPollIntervalMs);
    if (typeof this._pollTimer.unref === 'function') this._pollTimer.unref();
  }

  setEventPollInterval(intervalMs) {
    if (!Number.isFinite(intervalMs) || intervalMs < 10) {
      throw new TypeError('signaling event poll interval must be at least 10 ms');
    }
    this.eventPollIntervalMs = intervalMs;
    if (!this._pollTimer) return;
    clearInterval(this._pollTimer);
    this._pollTimer = null;
    this.#startEventPolling();
  }

  async createRoom({ player, maxPlayers = 14, mode = 'private' } = {}) {
    this._manualClose = false;
    const clean = cleanPlayer(player);
    const result = await this.#requestRoom('room_create', {
      player: clean,
      sessionId: this.sessionId,
      maxPlayers,
      mode,
    });
    const code = normalizeRoomCode(result && result.roomCode);
    if (code.length !== 6 || !result.peerId) throw new Error('invalid room_create response');
    this.roomCode = code;
    this.peerId = String(result.peerId);
    this.hostId = String(result.hostId || result.peerId);
    this.player = clean;
    this._roomAuthenticated = true;
    this._manualClose = false;
    this.#startEventPolling();
    return { ...result, roomCode: code, peerId: this.peerId };
  }

  async joinRoom({ roomCode, player } = {}) {
    this._manualClose = false;
    const code = normalizeRoomCode(roomCode);
    if (code.length !== 6) throw new TypeError('room code must be 6 characters');
    const clean = cleanPlayer(player);
    const result = await this.#requestRoom('room_join', {
      roomCode: code,
      player: clean,
      sessionId: this.sessionId,
    });
    if (!result || !result.peerId || !result.hostId) throw new Error('invalid room_join response');
    this.roomCode = code;
    this.peerId = String(result.peerId);
    this.hostId = String(result.hostId);
    this.player = clean;
    this._roomAuthenticated = true;
    this._manualClose = false;
    this.#startEventPolling();
    return { ...result, roomCode: code, peerId: this.peerId };
  }

  sendSignal(toPeerId, signal) {
    if (!this.roomCode || !this.peerId) throw new Error('join or create a room first');
    const target = String(toPeerId || '').trim();
    if (!target) throw new TypeError('target peer is required');
    const message = {
      type: 'room_signal',
      payload: { roomCode: this.roomCode, toPeerId: target, signal },
    };
    if (!this._roomAuthenticated || this.state !== 'open') {
      if (this._signalQueue.length >= MAX_QUEUED_SIGNALS) this._signalQueue.shift();
      this._signalQueue.push(message);
      this.#scheduleReconnect('signal_queued');
      return false;
    }
    this.#send(message);
    return true;
  }

  onEvent(listener) {
    if (typeof listener !== 'function') throw new TypeError('signaling event listener is required');
    this.listeners.add(listener);
    const queued = this.eventQueue.splice(0);
    for (const message of queued) listener(message);
    return () => this.listeners.delete(listener);
  }

  close(reason = 'client_closed') {
    this._manualClose = true;
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    this._reconnectTimer = null;
    this._signalQueue.length = 0;
    if (this.socket && this.socket.readyState < 2) {
      try {
        if (this.roomCode && this.peerId && this.state === 'open') {
          this.#send({ type: 'room_leave', payload: { roomCode: this.roomCode } });
        }
      } finally {
        this.socket.close(1000, String(reason).slice(0, 120));
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
