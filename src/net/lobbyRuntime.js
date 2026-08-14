import {
  MESSAGE_TYPES,
  createEnvelope,
  isSequenceNewer,
  nextSequence,
  validateEnvelope,
} from './protocol.js';
import {
  addLobbyPlayer,
  applyLobbyCommand,
  removeLobbyPlayer,
  serializeLobby,
} from './lobby.js';

function errorPayload(error) {
  return {
    code: typeof error.code === 'string' ? error.code : 'invalid_lobby_command',
    message: error instanceof Error ? error.message : 'invalid lobby command',
  };
}

/** Host-owned lobby command module, independent from signaling and transport. */
export class LobbyHostRuntime {
  constructor({ lobby, isVehicleAllowed = () => true, onStart = null } = {}) {
    if (!lobby || !(lobby.players instanceof Map)) throw new TypeError('canonical lobby is required');
    this.lobby = lobby;
    this.isVehicleAllowed = isVehicleAllowed;
    this.onStart = onStart;
    this.peers = new Map();
    this.closed = false;
  }

  attachPeer({ peerId, transport, player } = {}) {
    if (this.closed) throw new Error('lobby runtime is closed');
    const id = String(peerId || '');
    if (!id || this.peers.has(id)) throw new Error('invalid or duplicate lobby peer');
    if (id !== this.lobby.hostId && !this.lobby.players.has(id)) {
      addLobbyPlayer(this.lobby, { ...player, id });
    }
    const peer = {
      id,
      transport,
      sendSeq: 0,
      lastRecvSeq: null,
      unsubscribeMessage: null,
      unsubscribeClose: null,
    };
    peer.unsubscribeMessage = transport.onMessage((message) => this.#receive(peer, message));
    peer.unsubscribeClose = typeof transport.onClose === 'function'
      ? transport.onClose((reason) => this.detachPeer(id, reason))
      : null;
    this.peers.set(id, peer);
    this.broadcast();
    return () => this.detachPeer(id, 'detached');
  }

  #send(peer, type, payload) {
    const accepted = peer.transport.send(createEnvelope(type, payload, {
      seq: peer.sendSeq,
      ack: peer.lastRecvSeq == null ? 0 : peer.lastRecvSeq,
      tick: this.lobby.revision,
    }));
    peer.sendSeq = nextSequence(peer.sendSeq);
    if (!accepted) peer.transport.close('backpressure_limit');
    return accepted;
  }

  #receive(peer, raw) {
    try {
      const message = validateEnvelope(raw);
      if (peer.lastRecvSeq != null && !isSequenceNewer(message.seq, peer.lastRecvSeq)) return;
      peer.lastRecvSeq = message.seq;
      if (message.type === MESSAGE_TYPES.LOBBY_COMMAND) {
        this.command(peer.id, message.payload);
      } else if (message.type === MESSAGE_TYPES.PING) {
        this.#send(peer, MESSAGE_TYPES.PONG, message.payload);
      } else if (message.type === MESSAGE_TYPES.LEAVE) {
        this.detachPeer(peer.id, 'client_leave');
      } else {
        throw Object.assign(new Error(`unexpected lobby message: ${message.type}`), {
          code: 'unexpected_message',
        });
      }
    } catch (error) {
      this.#send(peer, MESSAGE_TYPES.ERROR, errorPayload(error));
    }
  }

  command(playerId, command) {
    const before = this.lobby.phase;
    applyLobbyCommand(this.lobby, playerId, command, {
      isVehicleAllowed: this.isVehicleAllowed,
    });
    this.broadcast();
    if (before !== this.lobby.phase && this.onStart) this.onStart(serializeLobby(this.lobby));
    return this.lobby;
  }

  broadcast() {
    const state = serializeLobby(this.lobby);
    for (const peer of this.peers.values()) this.#send(peer, MESSAGE_TYPES.LOBBY_STATE, state);
    return state;
  }

  detachPeer(peerId, reason = 'left') {
    const peer = this.peers.get(String(peerId));
    if (!peer) return false;
    this.peers.delete(peer.id);
    if (peer.unsubscribeMessage) peer.unsubscribeMessage();
    if (peer.unsubscribeClose) peer.unsubscribeClose();
    removeLobbyPlayer(this.lobby, peer.id);
    if (!this.closed) this.broadcast();
    void reason;
    return true;
  }

  /** Stop lobby listeners without closing channels, for match-runtime handoff. */
  releaseTransports() {
    const released = [];
    for (const peer of this.peers.values()) {
      if (peer.unsubscribeMessage) peer.unsubscribeMessage();
      if (peer.unsubscribeClose) peer.unsubscribeClose();
      released.push({ peerId: peer.id, transport: peer.transport });
    }
    this.peers.clear();
    this.closed = true;
    return released;
  }

  close(reason = 'lobby_closed') {
    if (this.closed) return;
    this.closed = true;
    for (const peer of this.peers.values()) {
      if (peer.unsubscribeMessage) peer.unsubscribeMessage();
      if (peer.unsubscribeClose) peer.unsubscribeClose();
      peer.transport.close(reason);
    }
    this.peers.clear();
  }
}

export class LobbyClientRuntime {
  constructor({ transport } = {}) {
    if (!transport || typeof transport.send !== 'function') throw new TypeError('transport is required');
    this.transport = transport;
    this.sendSeq = 0;
    this.lastRecvSeq = null;
    this.state = null;
    this.errors = [];
    this.listeners = new Set();
    this.closed = false;
    this.unsubscribeMessage = transport.onMessage((message) => this.#receive(message));
    this.unsubscribeClose = typeof transport.onClose === 'function'
      ? transport.onClose(() => { this.closed = true; })
      : null;
  }

  #send(type, payload) {
    const accepted = this.transport.send(createEnvelope(type, payload, {
      seq: this.sendSeq,
      ack: this.lastRecvSeq == null ? 0 : this.lastRecvSeq,
      tick: this.state ? this.state.revision : 0,
    }));
    this.sendSeq = nextSequence(this.sendSeq);
    return accepted;
  }

  #receive(raw) {
    try {
      const message = validateEnvelope(raw);
      if (this.lastRecvSeq != null && !isSequenceNewer(message.seq, this.lastRecvSeq)) return;
      this.lastRecvSeq = message.seq;
      if (message.type === MESSAGE_TYPES.LOBBY_STATE) {
        if (!this.state || message.payload.revision >= this.state.revision) {
          this.state = message.payload;
          for (const listener of [...this.listeners]) listener(this.state);
        }
      } else if (message.type === MESSAGE_TYPES.ERROR) {
        this.errors.push(message.payload);
      }
    } catch (error) {
      this.errors.push(errorPayload(error));
    }
  }

  submit(command) { return this.#send(MESSAGE_TYPES.LOBBY_COMMAND, command); }

  onState(listener) {
    this.listeners.add(listener);
    if (this.state) queueMicrotask(() => listener(this.state));
    return () => this.listeners.delete(listener);
  }

  releaseTransport() {
    if (this.unsubscribeMessage) this.unsubscribeMessage();
    if (this.unsubscribeClose) this.unsubscribeClose();
    this.closed = true;
    return this.transport;
  }

  close(reason = 'lobby_client_closed') {
    if (this.closed) return;
    this.#send(MESSAGE_TYPES.LEAVE, { reason });
    this.releaseTransport();
    this.transport.close(reason);
  }
}
