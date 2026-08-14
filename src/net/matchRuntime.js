import {
  MATCH_TICK_HZ,
  MESSAGE_TYPES,
  PROTOCOL_VERSION,
  SNAPSHOT_HZ,
  ProtocolError,
  createEnvelope,
  isSequenceNewer,
  nextSequence,
  normalizePlayerInput,
  validateEnvelope,
} from './protocol.js';
import { SnapshotBuffer } from './snapshot.js';

function validateRate(tickHz, snapshotHz) {
  if (!Number.isInteger(tickHz) || tickHz < 10 || tickHz > 120) {
    throw new TypeError('tickHz must be an integer between 10 and 120');
  }
  if (!Number.isInteger(snapshotHz) || snapshotHz < 1 || snapshotHz > tickHz ||
      tickHz % snapshotHz !== 0) {
    throw new TypeError('snapshotHz must divide tickHz');
  }
}

function validateSimulation(simulation) {
  if (!simulation || typeof simulation.step !== 'function' ||
      typeof simulation.snapshot !== 'function') {
    throw new TypeError('simulation must implement step() and snapshot()');
  }
  return simulation;
}

function safeErrorPayload(error) {
  return {
    code: typeof error.code === 'string' ? error.code : 'invalid_message',
    message: error instanceof Error ? error.message : 'invalid message',
  };
}

function defaultClock() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : 0;
}

/**
 * Server/host-owned fixed-step match module. A browser host, dedicated Node
 * process, and solo loopback session all call this exact interface.
 */
export class AuthoritativeMatchRuntime {
  constructor({
    simulation,
    tickHz = MATCH_TICK_HZ,
    snapshotHz = SNAPSHOT_HZ,
    maxCatchUpTicks = 4,
    maxInputLeadTicks = 120,
  } = {}) {
    validateRate(tickHz, snapshotHz);
    if (!Number.isInteger(maxCatchUpTicks) || maxCatchUpTicks < 1 || maxCatchUpTicks > 12) {
      throw new TypeError('maxCatchUpTicks must be between 1 and 12');
    }
    this.simulation = validateSimulation(simulation);
    this.tickHz = tickHz;
    this.snapshotHz = snapshotHz;
    this.tickMs = 1000 / tickHz;
    this.snapshotEveryTicks = tickHz / snapshotHz;
    this.maxCatchUpTicks = maxCatchUpTicks;
    this.maxInputLeadTicks = maxInputLeadTicks;
    this.tick = 0;
    this.timeMs = 0;
    this.accumulatorMs = 0;
    this.peers = new Map();
    this.closed = false;
    this.matchStarted = false;
    this.stats = {
      steps: 0,
      snapshots: 0,
      droppedCatchUpMs: 0,
      invalidMessages: 0,
      staleInputs: 0,
      futureInputs: 0,
    };
  }

  attachPeer({ peerId, transport, metadata = null } = {}) {
    if (this.closed) throw new Error('match runtime is closed');
    const id = String(peerId || '').trim();
    if (!id) throw new TypeError('peerId is required');
    if (this.peers.has(id)) throw new Error(`peer already attached: ${id}`);
    if (!transport || typeof transport.send !== 'function' ||
        typeof transport.onMessage !== 'function') {
      throw new TypeError('transport must implement send() and onMessage()');
    }
    const peer = {
      id,
      transport,
      metadata,
      input: null,
      lastInputSeq: null,
      lastRecvSeq: null,
      sendSeq: 0,
      welcomed: false,
      ready: false,
      fireQueued: false,
      unsubscribeMessage: null,
      unsubscribeClose: null,
    };
    peer.unsubscribeMessage = transport.onMessage((message) => this.#receive(peer, message));
    if (typeof transport.onClose === 'function') {
      peer.unsubscribeClose = transport.onClose((reason) => this.detachPeer(id, reason));
    }
    this.peers.set(id, peer);
    if (typeof this.simulation.onPeerJoin === 'function') {
      this.simulation.onPeerJoin({ peerId: id, metadata });
    }
    return () => this.detachPeer(id, 'detached');
  }

  detachPeer(peerId, reason = 'left') {
    const id = String(peerId);
    const peer = this.peers.get(id);
    if (!peer) return false;
    this.peers.delete(id);
    if (peer.unsubscribeMessage) peer.unsubscribeMessage();
    if (peer.unsubscribeClose) peer.unsubscribeClose();
    if (typeof this.simulation.onPeerLeave === 'function') {
      this.simulation.onPeerLeave({ peerId: id, reason });
    }
    return true;
  }

  #send(peer, type, payload) {
    if (!peer || peer.transport.readyState === 'closed') return false;
    const envelope = createEnvelope(type, payload, {
      seq: peer.sendSeq,
      ack: peer.lastRecvSeq == null ? 0 : peer.lastRecvSeq,
      tick: this.tick,
    });
    peer.sendSeq = nextSequence(peer.sendSeq);
    const accepted = peer.transport.send(envelope);
    if (!accepted && typeof peer.transport.close === 'function') {
      peer.transport.close('backpressure_limit');
      this.detachPeer(peer.id, 'backpressure_limit');
    }
    return accepted;
  }

  #receive(peer, raw) {
    try {
      const message = validateEnvelope(raw);
      if (peer.lastRecvSeq != null && !isSequenceNewer(message.seq, peer.lastRecvSeq)) {
        return;
      }
      peer.lastRecvSeq = message.seq;
      switch (message.type) {
        case MESSAGE_TYPES.HELLO:
          if (peer.welcomed) break;
          if (!message.payload || String(message.payload.playerId || '') !== peer.id) {
            throw new ProtocolError('identity_mismatch', 'hello player id does not match transport identity');
          }
          peer.metadata = { ...(peer.metadata || {}), ...(message.payload.metadata || {}) };
          peer.welcomed = true;
          this.#send(peer, MESSAGE_TYPES.WELCOME, {
            protocolVersion: PROTOCOL_VERSION,
            peerId: peer.id,
            tickHz: this.tickHz,
            snapshotHz: this.snapshotHz,
            serverTick: this.tick,
            serverTimeMs: this.timeMs,
          });
          break;
        case MESSAGE_TYPES.INPUT:
          if (!peer.welcomed) {
            throw new ProtocolError('hello_required', 'hello must precede match input');
          }
          this.#receiveInput(peer, message.payload);
          break;
        case MESSAGE_TYPES.READY:
          if (!peer.welcomed) {
            throw new ProtocolError('hello_required', 'hello must precede match readiness');
          }
          if (!peer.ready) {
            peer.ready = true;
            if (typeof this.simulation.onPeerReady === 'function') {
              this.simulation.onPeerReady({ peerId: peer.id, metadata: peer.metadata });
            }
          }
          break;
        case MESSAGE_TYPES.PING:
          if (!peer.welcomed) {
            throw new ProtocolError('hello_required', 'hello must precede match ping');
          }
          this.#send(peer, MESSAGE_TYPES.PONG, {
            clientTimeMs: Number(message.payload && message.payload.clientTimeMs) || 0,
            serverTimeMs: this.timeMs,
          });
          break;
        case MESSAGE_TYPES.LEAVE:
          this.detachPeer(peer.id, 'client_leave');
          break;
        default:
          throw new ProtocolError('unexpected_message',
            `${message.type} is not accepted from a client during a match`);
      }
    } catch (error) {
      this.stats.invalidMessages++;
      this.#send(peer, MESSAGE_TYPES.ERROR, safeErrorPayload(error));
    }
  }

  #receiveInput(peer, payload) {
    const input = normalizePlayerInput(payload);
    if (peer.lastInputSeq != null && !isSequenceNewer(input.inputSeq, peer.lastInputSeq)) {
      this.stats.staleInputs++;
      return;
    }
    if (input.clientTick > this.tick + this.maxInputLeadTicks) {
      this.stats.futureInputs++;
      throw new ProtocolError('input_too_far_ahead', 'client input tick is too far ahead');
    }
    peer.lastInputSeq = input.inputSeq;
    peer.input = input;
    if (input.fire) peer.fireQueued = true;
  }

  /**
   * Advance authority by wall-clock delta. Long stalls are discarded beyond
   * the configured catch-up window so returning tabs cannot fast-forward.
   */
  advance(elapsedMs) {
    if (this.closed) return 0;
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
      throw new TypeError('elapsedMs must be non-negative');
    }
    const maxAccumulated = this.tickMs * this.maxCatchUpTicks;
    const nextAccumulated = this.accumulatorMs + elapsedMs;
    if (nextAccumulated > maxAccumulated) {
      this.stats.droppedCatchUpMs += nextAccumulated - maxAccumulated;
      this.accumulatorMs = maxAccumulated;
    } else {
      this.accumulatorMs = nextAccumulated;
    }

    let steps = 0;
    while (this.accumulatorMs + 1e-9 >= this.tickMs && steps < this.maxCatchUpTicks) {
      this.tick++;
      this.timeMs = this.tick * this.tickMs;
      if (!this.matchStarted) {
        const requiredIds = Array.isArray(this.simulation.requiredPeerIds)
          ? this.simulation.requiredPeerIds
          : [...this.peers.values()]
            .filter((peer) => !peer.metadata?.spectator)
            .map((peer) => peer.id);
        this.matchStarted = requiredIds.length > 0 && requiredIds.every((id) => {
          const peer = this.peers.get(id);
          return !!peer && peer.welcomed && peer.ready;
        });
        if (this.matchStarted && typeof this.simulation.onMatchReady === 'function') {
          this.simulation.onMatchReady({ tick: this.tick, timeMs: this.timeMs });
        }
      }
      if (this.matchStarted) {
        const inputs = new Map();
        for (const peer of this.peers.values()) {
          const input = peer.input && peer.fireQueued && !peer.input.fire
            ? { ...peer.input, fire: true }
            : peer.input;
          inputs.set(peer.id, input);
          peer.fireQueued = false;
        }
        this.simulation.step({
          dt: 1 / this.tickHz,
          tick: this.tick,
          timeMs: this.timeMs,
          inputs,
        });
      }
      this.accumulatorMs -= this.tickMs;
      this.stats.steps++;
      steps++;
      if (this.tick % this.snapshotEveryTicks === 0) this.#broadcastSnapshots();
    }
    return steps;
  }

  #broadcastSnapshots() {
    for (const peer of this.peers.values()) {
      if (!peer.welcomed) continue;
      const snapshot = this.simulation.snapshot({
        tick: this.tick,
        serverTimeMs: this.timeMs,
        viewerId: peer.id,
        ackInputSeq: peer.lastInputSeq == null ? 0 : peer.lastInputSeq,
      });
      this.#send(peer, MESSAGE_TYPES.SNAPSHOT, snapshot);
      this.stats.snapshots++;
    }
    if (typeof this.simulation.afterSnapshotBroadcast === 'function') {
      this.simulation.afterSnapshotBroadcast();
    }
  }

  close(reason = 'host_closed') {
    if (this.closed) return;
    this.closed = true;
    for (const peer of [...this.peers.values()]) {
      if (typeof peer.transport.close === 'function') peer.transport.close(reason);
      this.detachPeer(peer.id, reason);
    }
  }
}

/** Client-side match module: input upload, clock sync, and snapshot sampling. */
export class MatchClientRuntime {
  constructor({
    transport,
    playerId,
    interpolationDelayMs = 100,
    maxExtrapolationMs = 250,
    pingIntervalMs = 1000,
    clock = defaultClock,
  } = {}) {
    if (!transport || typeof transport.send !== 'function' ||
        typeof transport.onMessage !== 'function') {
      throw new TypeError('transport must implement send() and onMessage()');
    }
    this.transport = transport;
    this.playerId = String(playerId || '');
    this.buffer = new SnapshotBuffer({ interpolationDelayMs, maxExtrapolationMs });
    this.pingIntervalMs = pingIntervalMs;
    this.clock = clock;
    this.sendSeq = 0;
    this.inputSeq = 0;
    this.lastRecvSeq = null;
    this.clientTick = 0;
    this.serverOffsetMs = 0;
    this.lastPingAtMs = -Infinity;
    this.connected = false;
    this.closed = false;
    this.errors = [];
    this.eventListeners = new Set();
    this.connectionListeners = new Set();
    this.handshakeSent = false;
    this.readySent = false;
    this.unsubscribeMessage = transport.onMessage((message) => this.#receive(message));
    this.unsubscribeClose = typeof transport.onClose === 'function'
      ? transport.onClose(() => {
        this.connected = false;
        this.closed = true;
        for (const listener of [...this.connectionListeners]) listener(false);
      })
      : null;
  }

  /** Begin the protocol handshake after both transport sides are listening. */
  connect(metadata = null) {
    if (this.closed || this.handshakeSent) return false;
    const sent = this.#send(MESSAGE_TYPES.HELLO, {
      playerId: this.playerId,
      metadata,
    });
    if (sent) this.handshakeSent = true;
    return sent;
  }

  #send(type, payload) {
    if (this.closed) return false;
    const envelope = createEnvelope(type, payload, {
      seq: this.sendSeq,
      ack: this.lastRecvSeq == null ? 0 : this.lastRecvSeq,
      tick: this.clientTick,
    });
    this.sendSeq = nextSequence(this.sendSeq);
    return this.transport.send(envelope);
  }

  #receive(raw) {
    try {
      const message = validateEnvelope(raw);
      if (this.lastRecvSeq != null && !isSequenceNewer(message.seq, this.lastRecvSeq)) return;
      this.lastRecvSeq = message.seq;
      this.clientTick = Math.max(this.clientTick, message.tick);
      switch (message.type) {
        case MESSAGE_TYPES.WELCOME:
          this.connected = true;
          this.clientTick = message.payload.serverTick;
          this.serverOffsetMs = message.payload.serverTimeMs - this.clock();
          for (const listener of [...this.connectionListeners]) listener(true);
          break;
        case MESSAGE_TYPES.SNAPSHOT:
          this.buffer.push(message.payload);
          break;
        case MESSAGE_TYPES.PONG: {
          const now = this.clock();
          const sent = Number(message.payload && message.payload.clientTimeMs);
          const server = Number(message.payload && message.payload.serverTimeMs);
          if (Number.isFinite(now) && Number.isFinite(sent) && Number.isFinite(server) && now >= sent) {
            const sample = server - (sent + now) * 0.5;
            this.serverOffsetMs += (sample - this.serverOffsetMs) * 0.15;
          }
          break;
        }
        case MESSAGE_TYPES.EVENT:
          for (const listener of [...this.eventListeners]) listener(message.payload);
          break;
        case MESSAGE_TYPES.ERROR:
          this.errors.push(message.payload);
          break;
        default:
          break;
      }
    } catch (error) {
      this.errors.push(safeErrorPayload(error));
    }
  }

  submitInput(input, clientTick = this.clientTick) {
    const normalized = normalizePlayerInput({
      ...input,
      inputSeq: this.inputSeq,
      clientTick,
    });
    this.inputSeq = nextSequence(this.inputSeq);
    this.clientTick = Math.max(this.clientTick, clientTick);
    return this.#send(MESSAGE_TYPES.INPUT, normalized);
  }

  readyForMatch() {
    if (this.closed || this.readySent) return false;
    const sent = this.#send(MESSAGE_TYPES.READY, { loaded: true });
    if (sent) this.readySent = true;
    return sent;
  }

  update(nowMs) {
    if (!Number.isFinite(nowMs)) throw new TypeError('nowMs must be finite');
    this._lastUpdateNowMs = nowMs;
    if (this.connected && nowMs - this.lastPingAtMs >= this.pingIntervalMs) {
      this.lastPingAtMs = nowMs;
      this.#send(MESSAGE_TYPES.PING, { clientTimeMs: nowMs });
    }
    return this.buffer.sample(nowMs + this.serverOffsetMs);
  }

  onEvent(listener) {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onConnection(listener) {
    this.connectionListeners.add(listener);
    if (this.connected) queueMicrotask(() => listener(true));
    return () => this.connectionListeners.delete(listener);
  }

  close(reason = 'client_closed') {
    if (this.closed) return;
    this.#send(MESSAGE_TYPES.LEAVE, { reason });
    this.closed = true;
    this.connected = false;
    for (const listener of [...this.connectionListeners]) listener(false);
    if (this.unsubscribeMessage) this.unsubscribeMessage();
    if (this.unsubscribeClose) this.unsubscribeClose();
    if (typeof this.transport.close === 'function') this.transport.close(reason);
  }
}
