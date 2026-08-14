import { normalizeRoomCode } from './protocol.js';

const MAX_SIGNAL_BYTES = 128 * 1024;

function websocketConstructor(injected) {
  const Ctor = injected || globalThis.WebSocket;
  if (typeof Ctor !== 'function') throw new Error('WebSocket is unavailable');
  return Ctor;
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
    requestTimeoutMs = 8000,
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
    this.socket = null;
    this.requestSeq = 0;
    this.pending = new Map();
    this.listeners = new Set();
    this.state = 'idle';
    this.roomCode = null;
    this.peerId = null;
    this._connectPromise = null;
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
        if (this.socket === socket) this.#closed('signaling_closed');
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
        reject(new Error(`signaling request timed out: ${type}`));
      }, this.requestTimeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      this.#send({ type, requestId, payload });
    });
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
    for (const listener of [...this.listeners]) listener(message);
  }

  #closed(reason) {
    if (this.state === 'closed') return;
    this.state = 'closed';
    this._connectPromise = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    this.pending.clear();
  }

  async createRoom({ player, maxPlayers = 14, mode = 'private' } = {}) {
    await this.connect();
    const result = await this.#request('room_create', {
      player: cleanPlayer(player),
      maxPlayers,
      mode,
    });
    const code = normalizeRoomCode(result && result.roomCode);
    if (code.length !== 6 || !result.peerId) throw new Error('invalid room_create response');
    this.roomCode = code;
    this.peerId = String(result.peerId);
    return { ...result, roomCode: code, peerId: this.peerId };
  }

  async joinRoom({ roomCode, player } = {}) {
    await this.connect();
    const code = normalizeRoomCode(roomCode);
    if (code.length !== 6) throw new TypeError('room code must be 6 characters');
    const result = await this.#request('room_join', {
      roomCode: code,
      player: cleanPlayer(player),
    });
    if (!result || !result.peerId || !result.hostId) throw new Error('invalid room_join response');
    this.roomCode = code;
    this.peerId = String(result.peerId);
    return { ...result, roomCode: code, peerId: this.peerId };
  }

  sendSignal(toPeerId, signal) {
    if (!this.roomCode || !this.peerId) throw new Error('join or create a room first');
    const target = String(toPeerId || '').trim();
    if (!target) throw new TypeError('target peer is required');
    this.#send({
      type: 'room_signal',
      payload: { roomCode: this.roomCode, toPeerId: target, signal },
    });
  }

  onEvent(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(reason = 'client_closed') {
    if (this.state === 'closed') return;
    if (this.socket && this.socket.readyState < 2) {
      try {
        if (this.roomCode && this.peerId && this.state === 'open') {
          this.#send({ type: 'room_leave', payload: { roomCode: this.roomCode } });
        }
      } finally {
        this.socket.close(1000, String(reason).slice(0, 120));
      }
    }
    this.#closed(reason);
  }
}
