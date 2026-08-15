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
import { SnapshotAssembler, SnapshotBuffer, createSnapshotDelta } from './snapshot.js';

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

const MAX_PENDING_EVENT_BATCHES = 256;
const MAX_EVENTS_PER_BATCH = 512;

function validateEventBatch(payload) {
  if (!payload || !Number.isSafeInteger(payload.tick) || payload.tick < 0 ||
      !Array.isArray(payload.events) || payload.events.length > MAX_EVENTS_PER_BATCH) {
    throw new ProtocolError('invalid_event_batch', 'event batch must include a valid tick and events');
  }
  return payload;
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
    keyframeIntervalTicks = tickHz * 2,
    snapshotHistoryCapacity = Math.max(64,
      Math.ceil(keyframeIntervalTicks * snapshotHz / tickHz) * 2),
  } = {}) {
    validateRate(tickHz, snapshotHz);
    if (!Number.isInteger(maxCatchUpTicks) || maxCatchUpTicks < 1 || maxCatchUpTicks > 12) {
      throw new TypeError('maxCatchUpTicks must be between 1 and 12');
    }
    if (!Number.isInteger(keyframeIntervalTicks) || keyframeIntervalTicks < tickHz / snapshotHz) {
      throw new TypeError('keyframeIntervalTicks must cover at least one snapshot interval');
    }
    if (!Number.isInteger(snapshotHistoryCapacity) || snapshotHistoryCapacity < 2) {
      throw new TypeError('snapshotHistoryCapacity must be at least two');
    }
    this.simulation = validateSimulation(simulation);
    this.tickHz = tickHz;
    this.snapshotHz = snapshotHz;
    this.tickMs = 1000 / tickHz;
    this.snapshotEveryTicks = tickHz / snapshotHz;
    this.maxCatchUpTicks = maxCatchUpTicks;
    this.maxInputLeadTicks = maxInputLeadTicks;
    this.keyframeIntervalTicks = keyframeIntervalTicks;
    this.snapshotHistoryCapacity = snapshotHistoryCapacity;
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
      snapshotKeyframes: 0,
      snapshotDeltas: 0,
      snapshotEntityRows: 0,
      reliableEventBatches: 0,
      reliableEvents: 0,
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
      actionBitsQueued: 0,
      lastSnapshotAckTick: null,
      lastKeyframeTick: -Infinity,
      snapshotHistory: new Map(),
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

  /** Replay packets that arrived during an ordered lobby-to-match handoff. */
  acceptPeerMessage(peerId, raw) {
    const peer = this.peers.get(String(peerId));
    if (!peer || this.closed) return false;
    this.#receive(peer, raw);
    return true;
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
    const accepted = type === MESSAGE_TYPES.SNAPSHOT &&
      typeof peer.transport.sendState === 'function'
      ? peer.transport.sendState(envelope)
      : peer.transport.send(envelope);
    if (!accepted && typeof peer.transport.close === 'function') {
      peer.transport.close('backpressure_limit');
      this.detachPeer(peer.id, 'backpressure_limit');
    }
    return accepted;
  }

  #receive(peer, raw) {
    try {
      const message = validateEnvelope(raw);
      // A malformed or unexpectedly reordered pre-handshake packet must not
      // advance the reliable sequence watermark past HELLO. This lets the
      // legitimate handshake recover instead of poisoning the session.
      if (!peer.welcomed && message.type !== MESSAGE_TYPES.HELLO &&
          message.type !== MESSAGE_TYPES.LEAVE) {
        throw new ProtocolError('hello_required', 'hello must precede match traffic');
      }
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
          this.#recordSnapshotAck(peer, message.payload && message.payload.snapshotAckTick);
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
    this.#recordSnapshotAck(peer, input.snapshotAckTick);
    peer.input = input;
    if (input.fire) peer.fireQueued = true;
    peer.actionBitsQueued |= input.actionBits;
  }

  #recordSnapshotAck(peer, rawTick) {
    const tick = Number(rawTick ?? 0);
    if (!Number.isSafeInteger(tick) || tick < 0 || tick > this.tick) {
      throw new ProtocolError('invalid_snapshot_ack', 'snapshot acknowledgement is invalid');
    }
    if (tick === 0) {
      peer.lastSnapshotAckTick = null;
      return;
    }
    if (peer.lastSnapshotAckTick == null || tick > peer.lastSnapshotAckTick) {
      peer.lastSnapshotAckTick = tick;
    }
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
        this.matchStarted = requiredIds.length > 0
          ? requiredIds.every((id) => {
            const peer = this.peers.get(id);
            return !!peer && peer.welcomed && peer.ready;
          })
          : [...this.peers.values()].some((peer) => peer.welcomed && peer.ready);
        if (this.matchStarted && typeof this.simulation.onMatchReady === 'function') {
          this.simulation.onMatchReady({ tick: this.tick, timeMs: this.timeMs });
        }
      }
      if (this.matchStarted) {
        const inputs = new Map();
        for (const peer of this.peers.values()) {
          const needsEdgeMerge = peer.input && (
            (peer.fireQueued && !peer.input.fire) ||
            (peer.actionBitsQueued & ~peer.input.actionBits) !== 0
          );
          const input = needsEdgeMerge
            ? {
              ...peer.input,
              fire: peer.fireQueued || peer.input.fire,
              actionBits: peer.actionBitsQueued | peer.input.actionBits,
            }
            : peer.input;
          inputs.set(peer.id, input);
          peer.fireQueued = false;
          peer.actionBitsQueued = 0;
          if (peer.input?.actionBits) peer.input = { ...peer.input, actionBits: 0 };
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
        ackInputSeq: peer.lastInputSeq == null ? null : peer.lastInputSeq,
      });
      // One-shot combat and lifecycle events must never ride the replaceable
      // snapshot lane. WebRTC state packets are intentionally unordered,
      // non-retransmitted, and coalesced under backpressure; keeping events
      // there made a dropped packet or one slow render frame erase kills,
      // destructibles, and match results permanently.
      const reliableEvents = Array.isArray(snapshot.events) ? snapshot.events : [];
      snapshot.events = [];
      const acknowledged = peer.lastSnapshotAckTick == null
        ? null
        : peer.snapshotHistory.get(peer.lastSnapshotAckTick) || null;
      const needsKeyframe = !acknowledged ||
        this.tick - peer.lastKeyframeTick >= this.keyframeIntervalTicks;
      const packet = createSnapshotDelta(snapshot, needsKeyframe ? null : acknowledged);
      peer.snapshotHistory.set(snapshot.tick, snapshot);
      while (peer.snapshotHistory.size > this.snapshotHistoryCapacity) {
        peer.snapshotHistory.delete(peer.snapshotHistory.keys().next().value);
      }
      if (needsKeyframe) {
        peer.lastKeyframeTick = this.tick;
        this.stats.snapshotKeyframes++;
      } else this.stats.snapshotDeltas++;
      this.stats.snapshotEntityRows += packet.entities.length;
      this.#send(peer, MESSAGE_TYPES.SNAPSHOT, packet);
      this.stats.snapshots++;
      if (reliableEvents.length) {
        this.#send(peer, MESSAGE_TYPES.EVENT, {
          tick: snapshot.tick,
          events: reliableEvents,
        });
        this.stats.reliableEventBatches++;
        this.stats.reliableEvents += reliableEvents.length;
      }
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
    this.buffer = new SnapshotBuffer({
      interpolationDelayMs,
      maxExtrapolationMs,
      immediateEntityId: this.playerId,
    });
    this.assembler = new SnapshotAssembler();
    this.pingIntervalMs = pingIntervalMs;
    this.clock = clock;
    this.sendSeq = 0;
    this.inputSeq = 0;
    this.lastSubmittedInputSeq = null;
    this.lastRecvSeq = null;
    this.clientTick = 0;
    this.lastSnapshotTick = 0;
    this.missingSnapshotBaselines = 0;
    this.snapshotPacketsReceived = 0;
    this.estimatedMissingSnapshots = 0;
    this.lastSnapshotPacketTick = null;
    this.snapshotEveryTicks = 3;
    this.serverOffsetMs = 0;
    this.rttMs = null;
    this.rttJitterMs = 0;
    this.lastRttSampleMs = null;
    this.lastPingAtMs = -Infinity;
    this.connected = false;
    this.closed = false;
    this.errors = [];
    this.eventListeners = new Set();
    this.pendingEventBatches = [];
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
      // Snapshot delivery may use an unordered/no-retransmit lane. Its tick is
      // the ordering authority; reliable control messages retain sequence
      // ordering independently so either lane can arrive first safely.
      if (message.type === MESSAGE_TYPES.SNAPSHOT) {
        if (!message.payload || message.payload.tick !== message.tick) {
          throw new ProtocolError('snapshot_tick_mismatch', 'snapshot envelope tick does not match payload');
        }
        this.clientTick = Math.max(this.clientTick, message.tick);
        if (this.lastSnapshotPacketTick == null || message.tick > this.lastSnapshotPacketTick) {
          if (this.lastSnapshotPacketTick != null) {
            const steps = Math.max(1, Math.round(
              (message.tick - this.lastSnapshotPacketTick) / this.snapshotEveryTicks,
            ));
            this.estimatedMissingSnapshots += Math.max(0, steps - 1);
          }
          this.lastSnapshotPacketTick = message.tick;
          this.snapshotPacketsReceived++;
        }
        const snapshot = this.assembler.accept(message.payload);
        if (!snapshot) {
          this.lastSnapshotTick = 0;
          this.missingSnapshotBaselines++;
          return;
        }
        if (this.buffer.push(snapshot, this.clock())) this.lastSnapshotTick = snapshot.tick;
        return;
      }
      if (this.lastRecvSeq != null && !isSequenceNewer(message.seq, this.lastRecvSeq)) return;
      this.lastRecvSeq = message.seq;
      this.clientTick = Math.max(this.clientTick, message.tick);
      switch (message.type) {
        case MESSAGE_TYPES.WELCOME:
          this.connected = true;
          this.clientTick = message.payload.serverTick;
          if (Number.isFinite(message.payload.tickHz) && Number.isFinite(message.payload.snapshotHz) &&
              message.payload.tickHz > 0 && message.payload.snapshotHz > 0) {
            this.snapshotEveryTicks = Math.max(1,
              Math.round(message.payload.tickHz / message.payload.snapshotHz));
          }
          this.serverOffsetMs = message.payload.serverTimeMs - this.clock();
          for (const listener of [...this.connectionListeners]) listener(true);
          break;
        case MESSAGE_TYPES.PONG: {
          const now = this.clock();
          const sent = Number(message.payload && message.payload.clientTimeMs);
          const server = Number(message.payload && message.payload.serverTimeMs);
          if (Number.isFinite(now) && Number.isFinite(sent) && Number.isFinite(server) && now >= sent) {
            const rtt = now - sent;
            if (this.lastRttSampleMs != null) {
              const variation = Math.abs(rtt - this.lastRttSampleMs);
              this.rttJitterMs += (variation - this.rttJitterMs) * 0.2;
            }
            this.lastRttSampleMs = rtt;
            this.rttMs = this.rttMs == null ? rtt : this.rttMs + (rtt - this.rttMs) * 0.2;
            const sample = server - (sent + now) * 0.5;
            this.serverOffsetMs += (sample - this.serverOffsetMs) * 0.15;
          }
          break;
        }
        case MESSAGE_TYPES.EVENT:
          {
            const batch = validateEventBatch(message.payload);
            if (this.pendingEventBatches.length >= MAX_PENDING_EVENT_BATCHES) {
              throw new ProtocolError('event_backlog_overflow', 'reliable event backlog exceeded its limit');
            }
            this.pendingEventBatches.push(batch);
            for (const event of batch.events) {
              for (const listener of [...this.eventListeners]) listener(event);
            }
          }
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
    const submittedInputSeq = this.inputSeq;
    const normalized = normalizePlayerInput({
      ...input,
      inputSeq: submittedInputSeq,
      clientTick,
      snapshotAckTick: this.lastSnapshotTick,
    });
    this.inputSeq = nextSequence(this.inputSeq);
    this.clientTick = Math.max(this.clientTick, clientTick);
    const sent = this.#send(MESSAGE_TYPES.INPUT, normalized);
    if (sent) this.lastSubmittedInputSeq = submittedInputSeq;
    return sent;
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
      this.#send(MESSAGE_TYPES.PING, {
        clientTimeMs: nowMs,
        snapshotAckTick: this.lastSnapshotTick,
      });
    }
    return this.buffer.sample(nowMs + this.serverOffsetMs);
  }

  onEvent(listener) {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /** Drain reliable event batches only after presentation has reached them. */
  drainEventsThrough(tick, target = []) {
    if (!Number.isSafeInteger(tick) || tick < 0) return target;
    target.length = 0;
    let consumed = 0;
    while (consumed < this.pendingEventBatches.length) {
      const batch = this.pendingEventBatches[consumed];
      if (batch.tick > tick) break;
      target.push(...batch.events);
      consumed++;
    }
    if (consumed > 0) this.pendingEventBatches.splice(0, consumed);
    return target;
  }

  onConnection(listener) {
    this.connectionListeners.add(listener);
    if (this.connected) queueMicrotask(() => listener(true));
    return () => this.connectionListeners.delete(listener);
  }

  getStats() {
    const snapshotTotal = this.snapshotPacketsReceived + this.estimatedMissingSnapshots;
    return {
      connected: this.connected,
      rttMs: this.rttMs,
      rttJitterMs: this.rttJitterMs,
      serverOffsetMs: this.serverOffsetMs,
      snapshotPacketsReceived: this.snapshotPacketsReceived,
      estimatedMissingSnapshots: this.estimatedMissingSnapshots,
      estimatedSnapshotLoss: snapshotTotal > 0
        ? this.estimatedMissingSnapshots / snapshotTotal
        : 0,
      missingSnapshotBaselines: this.missingSnapshotBaselines,
      buffer: this.buffer.getStats(),
      transport: this.transport.stats || null,
      transportBufferedBytes: Number(this.transport.bufferedAmount) || 0,
      pendingEventBatches: this.pendingEventBatches.length,
    };
  }

  close(reason = 'client_closed') {
    if (this.closed) return;
    this.#send(MESSAGE_TYPES.LEAVE, { reason });
    this.closed = true;
    this.connected = false;
    for (const listener of [...this.connectionListeners]) listener(false);
    if (this.unsubscribeMessage) this.unsubscribeMessage();
    if (this.unsubscribeClose) this.unsubscribeClose();
    this.pendingEventBatches.length = 0;
    if (typeof this.transport.close === 'function') this.transport.close(reason);
  }
}
