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
  constructor({ url, WebSocketImpl = null, requestTimeoutMs = 8000 } = {}) {
    if (!url) throw new TypeError('signaling URL is required');
    if (!/^wss?:\/\//i.test(url)) throw new TypeError('signaling URL must use ws or wss');
    this.url = url;
    this.WebSocketImpl = websocketConstructor(WebSocketImpl);
    this.requestTimeoutMs = requestTimeoutMs;
    this.socket = null;
    this.requestSeq = 0;
    this.pending = new Map();
    this.listeners = new Set();
    this.state = 'idle';
    this.roomCode = null;
    this.peerId = null;
  }

  connect() {
    if (this.state === 'open') return Promise.resolve();
    if (this._connectPromise) return this._connectPromise;
    this.state = 'connecting';
    this.socket = new this.WebSocketImpl(this.url);
    this._connectPromise = new Promise((resolve, reject) => {
      const removeOpen = addListener(this.socket, 'open', () => {
        removeOpen();
        this.state = 'open';
        resolve();
      });
      addListener(this.socket, 'message', (event) => this.#receive(event.data));
      addListener(this.socket, 'error', () => {
        if (this.state === 'connecting') reject(new Error('signaling connection failed'));
      });
      addListener(this.socket, 'close', () => this.#closed('signaling_closed'));
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
