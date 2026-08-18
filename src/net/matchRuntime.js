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
  normalizeRoomChatText,
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
const MAX_ROOM_CHAT_HISTORY = 48;
const ROOM_CHAT_COOLDOWN_MS = 650;
const ROOM_CHAT_BURST_WINDOW_MS = 10_000;
const ROOM_CHAT_BURST_LIMIT = 8;
const SEQUENCE_RANGE = 0x80000000;

function sequenceDistance(latest, previous) {
  if (!Number.isSafeInteger(latest) || !Number.isSafeInteger(previous)) return null;
  return (latest - previous + SEQUENCE_RANGE) % SEQUENCE_RANGE;
}

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
    roomController = null,
    chatClock = defaultClock,
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
    if (roomController && (typeof roomController.state !== 'function' ||
        typeof roomController.command !== 'function')) {
      throw new TypeError('roomController must implement state() and command()');
    }
    this.roomController = roomController;
    if (typeof chatClock !== 'function') throw new TypeError('chatClock must be a function');
    this.chatClock = chatClock;
    this.chatSequence = 0;
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
    this.roomRound = Number(roomController?.state()?.round) || 0;
    this.roundPending = false;
    this.roundFinished = false;
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
      lastInputEnvelopeSeq: null,
      lastRecvSeq: null,
      sendSeq: 0,
      welcomed: false,
      ready: false,
      pendingRoundReady: false,
      fireQueued: false,
      actionBitsQueued: 0,
      actionBitsHeld: 0,
      lastSnapshotAckTick: null,
      lastKeyframeTick: -Infinity,
      chatLastAtMs: -Infinity,
      chatWindowStartMs: -Infinity,
      chatWindowCount: 0,
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

  /** Reattach a browser that refreshed while a persistent room is waiting. */
  rejoinPeer({ peerId, transport, player = null, metadata = null } = {}) {
    const id = String(peerId || '').trim();
    if (!id) throw new TypeError('peerId is required');
    if (!this.roomController?.rejoin) {
      throw new ProtocolError('room_rejoin_unavailable', 'this room cannot accept a returning player');
    }
    if (this.peers.has(id)) this.detachPeer(id, 'peer_replaced');
    this.roomController.rejoin(id, player || {});
    const detach = this.attachPeer({ peerId: id, transport, metadata });
    this.#broadcastRoomState();
    return detach;
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
    if (!this.closed && this.roomController?.remove) {
      this.roomController.remove(id, reason);
      this.#broadcastRoomState();
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
      if (message.type === MESSAGE_TYPES.INPUT) {
        if (peer.lastInputEnvelopeSeq != null &&
            !isSequenceNewer(message.seq, peer.lastInputEnvelopeSeq)) return;
        peer.lastInputEnvelopeSeq = message.seq;
      } else {
        if (peer.lastRecvSeq != null && !isSequenceNewer(message.seq, peer.lastRecvSeq)) return;
        peer.lastRecvSeq = message.seq;
      }
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
          if (this.roomController) {
            this.#send(peer, MESSAGE_TYPES.ROOM_STATE, this.roomController.state());
          }
          break;
        case MESSAGE_TYPES.ROOM_COMMAND:
          if (!peer.welcomed) {
            throw new ProtocolError('hello_required', 'hello must precede room commands');
          }
          this.#receiveRoomCommand(peer, message.payload);
          break;
        case MESSAGE_TYPES.ROOM_CHAT_COMMAND:
          this.#receiveRoomChat(peer, message.payload);
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
          if (this.roundPending) {
            peer.pendingRoundReady = true;
          } else if (!peer.ready) {
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

  #receiveRoomCommand(peer, command) {
    if (!this.roomController) {
      throw new ProtocolError('room_unavailable', 'this match has no persistent room');
    }
    const beforeRound = Number(this.roomController.state()?.round) || 0;
    const state = this.roomController.command(peer.id, command);
    const next = state || this.roomController.state();
    const nextRound = Number(next?.round) || 0;
    if (next?.phase === 'starting' && nextRound > beforeRound) {
      this.roomRound = nextRound;
      this.roundPending = true;
      this.roundFinished = false;
      this.matchStarted = false;
      this.accumulatorMs = 0;
      for (const entry of this.peers.values()) {
        entry.pendingRoundReady = false;
        this.#resetPeerForRound(entry);
      }
    }
    this.#broadcastRoomState(next);
  }

  #receiveRoomChat(peer, payload) {
    if (!this.roomController) {
      throw new ProtocolError('room_unavailable', 'chat is only available in a room');
    }
    const text = normalizeRoomChatText(payload?.text);
    const nowMs = Number(this.chatClock());
    if (!Number.isFinite(nowMs)) {
      throw new ProtocolError('invalid_clock', 'room chat clock is unavailable');
    }
    if (nowMs - peer.chatLastAtMs < ROOM_CHAT_COOLDOWN_MS) {
      throw new ProtocolError('chat_rate_limited', 'wait a moment before sending again');
    }
    if (nowMs - peer.chatWindowStartMs >= ROOM_CHAT_BURST_WINDOW_MS) {
      peer.chatWindowStartMs = nowMs;
      peer.chatWindowCount = 0;
    }
    if (peer.chatWindowCount >= ROOM_CHAT_BURST_LIMIT) {
      throw new ProtocolError('chat_rate_limited', 'too many messages; pause before sending again');
    }
    const room = this.roomController.state();
    const sender = room?.players?.find((player) => String(player.id) === peer.id);
    if (!sender) throw new ProtocolError('unknown_player', 'chat sender is not in this room');
    peer.chatLastAtMs = nowMs;
    peer.chatWindowCount++;
    const message = {
      id: `${Number(room.round) || 0}:${this.chatSequence}`,
      sequence: this.chatSequence,
      round: Number(room.round) || 0,
      senderId: peer.id,
      senderName: String(sender.name || 'Player').slice(0, 32),
      team: sender.team === 'alpha' || sender.team === 'bravo' ? sender.team : 'spectator',
      text,
      serverTimeMs: Math.max(0, Math.round(this.timeMs)),
    };
    this.chatSequence = nextSequence(this.chatSequence);
    for (const entry of this.peers.values()) {
      if (entry.welcomed) this.#send(entry, MESSAGE_TYPES.ROOM_CHAT, message);
    }
  }

  #resetPeerForRound(peer) {
    peer.ready = false;
    peer.input = null;
    peer.lastInputSeq = null;
    peer.lastInputEnvelopeSeq = null;
    peer.fireQueued = false;
    peer.actionBitsQueued = 0;
    peer.actionBitsHeld = 0;
    peer.lastSnapshotAckTick = null;
    peer.lastKeyframeTick = -Infinity;
    peer.snapshotHistory.clear();
    if (this.roomController?.metadataFor) {
      peer.metadata = { ...(peer.metadata || {}), ...this.roomController.metadataFor(peer.id) };
    }
  }

  #broadcastRoomState(state = null) {
    if (!this.roomController) return null;
    const next = state || this.roomController.state();
    for (const peer of this.peers.values()) {
      if (peer.welcomed) this.#send(peer, MESSAGE_TYPES.ROOM_STATE, next);
    }
    return next;
  }

  /** Install the next authority simulation after the host loads its battlefield. */
  replaceSimulation(simulation, { round = this.roomRound } = {}) {
    if (this.closed) throw new Error('match runtime is closed');
    if (!Number.isSafeInteger(round) || round < 1) throw new TypeError('round must be positive');
    const roomState = this.roomController?.state?.();
    if (roomState && (roomState.phase !== 'starting' || Number(roomState.round) !== round)) {
      throw new ProtocolError('round_mismatch', 'room is not starting the requested round');
    }
    this.simulation = validateSimulation(simulation);
    this.roomRound = round;
    this.roundPending = false;
    this.roundFinished = false;
    this.matchStarted = false;
    this.accumulatorMs = 0;
    for (const peer of this.peers.values()) {
      const readyEarly = peer.pendingRoundReady;
      this.#resetPeerForRound(peer);
      peer.pendingRoundReady = false;
      if (readyEarly) {
        peer.ready = true;
        if (typeof this.simulation.onPeerReady === 'function') {
          this.simulation.onPeerReady({ peerId: peer.id, metadata: peer.metadata });
        }
      }
    }
    return this.simulation;
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
    if (input.fire) peer.fireQueued = true;
    peer.actionBitsQueued |= input.actionBits & ~peer.actionBitsHeld;
    peer.actionBitsHeld = input.actionBits;
    // Action bits are rising-edge intents, not held movement state. Keep them
    // exclusively in the deduplicated queue so redundant delivery cannot
    // consume a repair or medical kit twice before its acknowledgement lands.
    peer.input = input.actionBits ? { ...input, actionBits: 0 } : input;
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
      if (this.roundPending) {
        this.accumulatorMs -= this.tickMs;
        this.stats.steps++;
        steps++;
        continue;
      }
      if (!this.matchStarted) {
        const requiredIds = Array.isArray(this.simulation.requiredPeerIds)
          ? this.simulation.requiredPeerIds.filter((id) => this.peers.has(String(id)))
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
        if (this.matchStarted && this.roomController?.markPlaying) {
          this.roomController.markPlaying();
          this.#broadcastRoomState();
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
        if (!this.roundFinished && this.simulation.result) {
          this.roundFinished = true;
          if (this.roomController?.finish) {
            this.roomController.finish({
              result: this.simulation.result,
              reason: this.simulation.resultReason || null,
            });
            this.#broadcastRoomState();
          }
        }
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
      if (this.roomController) {
        snapshot.meta = { ...(snapshot.meta || {}), roomRound: this.roomRound };
      }
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
    this.inputSendSeq = 0;
    this.inputSeq = 0;
    this.lastSubmittedInputSeq = null;
    this.lastAckedInputSeq = null;
    this.pendingFireAckSeq = null;
    this.lastRequestedFire = false;
    this.pendingActionAckSeqs = new Map();
    this.inputPacketsSubmitted = 0;
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
    this.roomListeners = new Set();
    this.roomChatListeners = new Set();
    this.roomChatHistory = [];
    this.roomState = null;
    this.roomRound = 0;
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

  /** Swap wrappers around the same open channel during lobby→match handoff. */
  replaceTransport(transport) {
    if (this.closed || this.connected) return false;
    if (!transport || typeof transport.send !== 'function' ||
        typeof transport.onMessage !== 'function') {
      throw new TypeError('transport must implement send() and onMessage()');
    }
    if (this.unsubscribeMessage) this.unsubscribeMessage();
    if (this.unsubscribeClose) this.unsubscribeClose();
    this.transport = transport;
    this.unsubscribeMessage = transport.onMessage((message) => this.#receive(message));
    this.unsubscribeClose = typeof transport.onClose === 'function'
      ? transport.onClose(() => {
        this.connected = false;
        this.closed = true;
        for (const listener of [...this.connectionListeners]) listener(false);
      })
      : null;
    return true;
  }

  #send(type, payload) {
    if (this.closed) return false;
    const inputLane = type === MESSAGE_TYPES.INPUT;
    const sequence = inputLane ? this.inputSendSeq : this.sendSeq;
    const envelope = createEnvelope(type, payload, {
      seq: sequence,
      ack: this.lastRecvSeq == null ? 0 : this.lastRecvSeq,
      tick: this.clientTick,
    });
    if (inputLane) this.inputSendSeq = nextSequence(this.inputSendSeq);
    else this.sendSeq = nextSequence(this.sendSeq);
    return inputLane && typeof this.transport.sendInput === 'function'
      ? this.transport.sendInput(envelope)
      : this.transport.send(envelope);
  }

  #acknowledgeInput(rawSequence) {
    const acknowledged = Number(rawSequence);
    if (!Number.isSafeInteger(acknowledged) || acknowledged < 0) return;
    if (this.lastAckedInputSeq == null ||
        isSequenceNewer(acknowledged, this.lastAckedInputSeq)) {
      this.lastAckedInputSeq = acknowledged;
    }
    const covers = (sequence) => sequence === acknowledged ||
      isSequenceNewer(acknowledged, sequence);
    if (this.pendingFireAckSeq != null && covers(this.pendingFireAckSeq)) {
      this.pendingFireAckSeq = null;
    }
    for (const [bit, sequence] of this.pendingActionAckSeqs) {
      if (covers(sequence)) this.pendingActionAckSeqs.delete(bit);
    }
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
        this.#acknowledgeInput(message.payload.ackInputSeq);
        const snapshot = this.assembler.accept(message.payload);
        if (!snapshot) {
          this.lastSnapshotTick = 0;
          this.missingSnapshotBaselines++;
          return;
        }
        if (this.roomRound > 0 && Number(snapshot.meta?.roomRound) !== this.roomRound) {
          this.assembler.clear();
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
        case MESSAGE_TYPES.ROOM_STATE:
          if (!message.payload || !Array.isArray(message.payload.players) ||
              !Number.isSafeInteger(Number(message.payload.round)) ||
              !Number.isSafeInteger(Number(message.payload.revision))) {
            throw new ProtocolError('invalid_room_state', 'room state is malformed');
          }
          if (!this.roomState || Number(message.payload.revision) >= Number(this.roomState.revision)) {
            const nextRound = Number(message.payload.round) || 0;
            if (message.payload.phase === 'starting' && nextRound > this.roomRound) {
              this.resetForRound(nextRound);
            }
            this.roomState = message.payload;
            for (const listener of [...this.roomListeners]) listener(this.roomState);
          }
          break;
        case MESSAGE_TYPES.ROOM_CHAT: {
          const payload = message.payload;
          const text = normalizeRoomChatText(payload?.text);
          const senderId = String(payload?.senderId || '');
          const senderName = String(payload?.senderName || '').trim().slice(0, 32);
          const sequence = Number(payload?.sequence);
          const round = Number(payload?.round);
          const serverTimeMs = Number(payload?.serverTimeMs);
          if (!/^[a-zA-Z0-9_-]{1,48}$/.test(senderId) || !senderName ||
              !Number.isSafeInteger(sequence) || sequence < 0 ||
              !Number.isSafeInteger(round) || round < 0 ||
              !Number.isFinite(serverTimeMs) || serverTimeMs < 0) {
            throw new ProtocolError('invalid_room_chat', 'room chat payload is malformed');
          }
          const chat = {
            id: String(payload.id || `${round}:${sequence}`).slice(0, 64),
            sequence,
            round,
            senderId,
            senderName,
            team: payload.team === 'alpha' || payload.team === 'bravo'
              ? payload.team : 'spectator',
            text,
            serverTimeMs,
          };
          this.roomChatHistory.push(chat);
          if (this.roomChatHistory.length > MAX_ROOM_CHAT_HISTORY) this.roomChatHistory.shift();
          for (const listener of [...this.roomChatListeners]) listener(chat);
          break;
        }
        case MESSAGE_TYPES.LOBBY_STATE:
          // Before the first match, browser-hosted rooms use the lightweight
          // lobby runtime on this same reliable channel. Accept its state so
          // the client object can survive the lobby→match handoff (and later
          // be reused by a refreshed player rejoining the persistent room).
          if (!message.payload || !Array.isArray(message.payload.players) ||
              !Number.isSafeInteger(Number(message.payload.revision))) {
            throw new ProtocolError('invalid_lobby_state', 'lobby state is malformed');
          }
          if (!this.roomState || Number(message.payload.revision) >= Number(this.roomState.revision)) {
            this.roomState = message.payload;
            for (const listener of [...this.roomListeners]) listener(this.roomState);
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
    if (normalized.fire && !this.lastRequestedFire && this.pendingFireAckSeq == null) {
      this.pendingFireAckSeq = submittedInputSeq;
    }
    this.lastRequestedFire = normalized.fire;
    for (let bit = 1; bit <= 0x8000; bit *= 2) {
      if ((normalized.actionBits & bit) !== 0 && !this.pendingActionAckSeqs.has(bit)) {
        this.pendingActionAckSeqs.set(bit, submittedInputSeq);
      }
    }
    normalized.fire = normalized.fire || this.pendingFireAckSeq != null;
    for (const bit of this.pendingActionAckSeqs.keys()) normalized.actionBits |= bit;
    this.inputSeq = nextSequence(this.inputSeq);
    this.clientTick = Math.max(this.clientTick, clientTick);
    const sent = this.#send(MESSAGE_TYPES.INPUT, normalized);
    if (sent) {
      this.lastSubmittedInputSeq = submittedInputSeq;
      this.inputPacketsSubmitted++;
    }
    return sent;
  }

  readyForMatch() {
    if (this.closed) return false;
    // READY is idempotent at authority. Permit a caller to retransmit it
    // until a countdown/playing snapshot confirms the barrier released.
    // WebRTC control is reliable, but a retry also closes the tiny
    // lobby-to-match listener handoff race and makes simulated links robust.
    const sent = this.#send(MESSAGE_TYPES.READY, { loaded: true });
    if (sent) this.readySent = true;
    return sent;
  }

  submitRoomCommand(command) {
    if (this.closed || !command || typeof command !== 'object') return false;
    return this.#send(this.connected ? MESSAGE_TYPES.ROOM_COMMAND : MESSAGE_TYPES.LOBBY_COMMAND, command);
  }

  sendRoomChat(text) {
    if (this.closed || !this.connected) return false;
    try {
      return this.#send(MESSAGE_TYPES.ROOM_CHAT_COMMAND, {
        text: normalizeRoomChatText(text),
      });
    } catch (error) {
      this.errors.push(safeErrorPayload(error));
      return false;
    }
  }

  /** Send the match HELLO after the lobby host has entered handoff mode. */
  beginMatchHandshake(metadata = null) {
    if (this.closed || this.connected) return this.connected;
    // The unreliable state lane can beat WELCOME/ROOM_STATE across the RTC
    // handoff. Adopt the canonical starting round from the lobby now, before
    // any snapshot can be assembled, so the later ROOM_STATE cannot clear a
    // baseline that authority has already seen acknowledged.
    const pendingRound = Number(this.roomState?.round);
    if (this.roomState?.phase === 'starting' &&
        Number.isSafeInteger(pendingRound) && pendingRound > this.roomRound) {
      this.resetForRound(pendingRound);
    }
    // LobbyHostRuntime and AuthoritativeMatchRuntime each own an independent
    // outbound sequence. The authority starts at zero, so the client must not
    // compare its WELCOME against the lobby sender's final watermark.
    this.lastRecvSeq = null;
    // Lobby command errors have already been presented in the lobby and do
    // not describe the health of the new match protocol phase.
    this.errors.length = 0;
    this.handshakeSent = false;
    return this.connect(metadata);
  }

  resetForRound(round) {
    if (!Number.isSafeInteger(round) || round < 1) return false;
    this.roomRound = round;
    this.buffer.clear();
    this.assembler.clear();
    this.pendingEventBatches.length = 0;
    this.lastSnapshotTick = 0;
    this.lastSnapshotPacketTick = null;
    this.lastAckedInputSeq = null;
    this.pendingFireAckSeq = null;
    this.lastRequestedFire = false;
    this.pendingActionAckSeqs.clear();
    this.readySent = false;
    return true;
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

  onRoomState(listener) {
    this.roomListeners.add(listener);
    if (this.roomState) queueMicrotask(() => listener(this.roomState));
    return () => this.roomListeners.delete(listener);
  }

  onRoomChat(listener) {
    this.roomChatListeners.add(listener);
    return () => this.roomChatListeners.delete(listener);
  }

  getRoomChatHistory() {
    return this.roomChatHistory.slice();
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
      inputPacketsSubmitted: this.inputPacketsSubmitted,
      lastAckedInputSeq: this.lastAckedInputSeq,
      inputAckLag: this.lastSubmittedInputSeq == null || this.lastAckedInputSeq == null
        ? null
        : sequenceDistance(this.lastSubmittedInputSeq, this.lastAckedInputSeq),
      pendingInputEdges: (this.pendingFireAckSeq == null ? 0 : 1) +
        this.pendingActionAckSeqs.size,
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
    this.roomListeners.clear();
    this.roomChatListeners.clear();
    this.roomChatHistory.length = 0;
    if (typeof this.transport.close === 'function') this.transport.close(reason);
  }
}
