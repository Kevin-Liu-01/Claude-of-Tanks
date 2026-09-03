import type { RuntimeValue } from '../runtimeTypes.ts';
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
  type MessageType,
  type NormalizedPlayerInput,
  type ProtocolEnvelope,
} from './protocol.ts';
import { TransportClosedError } from './loopbackTransport.ts';
import {
  SnapshotAssembler,
  SnapshotBuffer,
  createSnapshotDelta,
  type SampledSnapshotFrame,
  type WorldSnapshot,
} from './snapshot.ts';

type Unsubscribe = () => void;
type MatchEvent = Record<string, RuntimeValue>;
type ProtocolPayload = ProtocolEnvelope['payload'];

// Never let an RTT sample move the presentation timeline in one frame. A
// bounded 50 ms/s slew corrects normal clock drift quickly while limiting the
// extra visual displacement to less than one millisecond per 60 Hz frame.
const SERVER_CLOCK_SLEW_MS_PER_MS = 0.05;
const SERVER_CLOCK_MAX_SLEW_WINDOW_MS = 250;

export interface MatchTransport {
  readonly kind?: string;
  readonly readyState?: string;
  readonly bufferedAmount?: number;
  readonly stats?: RuntimeValue;
  send(message: RuntimeValue): boolean;
  sendInput?(message: RuntimeValue): boolean;
  sendState?(message: RuntimeValue): boolean;
  onMessage(listener: (message: RuntimeValue) => void): Unsubscribe;
  onClose?(listener: (reason: string) => void): Unsubscribe;
  close?(reason?: string): void;
}

export interface MatchRoomPlayer {
  id?: string;
  name?: string;
  team?: string;
  specId?: string | null;
  equipment?: string[];
  camo?: string;
}

export interface MatchRoomState {
  phase?: string;
  round?: number;
  revision?: number;
  players?: MatchRoomPlayer[];
}

export interface RoomController {
  state(): MatchRoomState;
  command(peerId: string, command: Record<string, RuntimeValue>): MatchRoomState | null | undefined;
  rejoin?(peerId: string, player: Record<string, RuntimeValue>): RuntimeValue;
  disconnect?(peerId: string, reason?: string): RuntimeValue;
  remove?(peerId: string, reason?: string): RuntimeValue;
  metadataFor?(peerId: string): Record<string, RuntimeValue>;
  markPlaying?(): RuntimeValue;
  finish?(outcome: { result: RuntimeValue; reason: RuntimeValue }): RuntimeValue;
}

export interface SimulationStepContext {
  dt: number;
  tick: number;
  timeMs: number;
  inputs: Map<string, NormalizedPlayerInput | null>;
}

export interface MatchSimulation {
  requiredPeerIds?: RuntimeValue[];
  result?: RuntimeValue;
  resultReason?: RuntimeValue;
  step(context: SimulationStepContext): RuntimeValue;
  snapshot(options: {
    tick: number;
    serverTimeMs: number;
    viewerId: string;
    ackInputSeq: number | null;
  }): WorldSnapshot;
  onPeerJoin?(options: { peerId: string; metadata: Record<string, RuntimeValue> | null }): RuntimeValue;
  onPeerLeave?(options: { peerId: string; reason: string }): RuntimeValue;
  onPeerReady?(options: { peerId: string; metadata: Record<string, RuntimeValue> | null }): RuntimeValue;
  onMatchReady?(options: { tick: number; timeMs: number }): RuntimeValue;
  afterSnapshotBroadcast?(): RuntimeValue;
}

export interface AuthoritativeMatchStats {
  steps: number;
  snapshots: number;
  droppedCatchUpMs: number;
  backlogHighWaterMs: number;
  longStallCatchUpFrames: number;
  invalidMessages: number;
  staleInputs: number;
  futureInputs: number;
  snapshotKeyframes: number;
  snapshotDeltas: number;
  snapshotEntityRows: number;
  reliableEventBatches: number;
  reliableEvents: number;
  roomStateFanoutBatches: number;
  roomStateFanoutPeers: number;
}

interface MatchPeer {
  id: string;
  transport: MatchTransport;
  metadata: Record<string, RuntimeValue> | null;
  input: NormalizedPlayerInput | null;
  lastInputSeq: number | null;
  lastInputEnvelopeSeq: number | null;
  lastRecvSeq: number | null;
  sendSeq: number;
  welcomed: boolean;
  ready: boolean;
  pendingRoundReady: boolean;
  fireQueued: boolean;
  actionBitsQueued: number;
  actionBitsHeld: number;
  lastSnapshotAckTick: number | null;
  lastKeyframeTick: number;
  chatLastAtMs: number;
  chatWindowStartMs: number;
  chatWindowCount: number;
  snapshotHistory: Map<number, WorldSnapshot>;
  unsubscribeMessage: Unsubscribe | null;
  unsubscribeClose: Unsubscribe | null;
}

interface EventBatch {
  tick: number;
  events: MatchEvent[];
}

export interface RoomChatMessage extends Record<string, RuntimeValue> {
  id: string;
  sequence: number;
  round: number;
  senderId: string;
  senderName: string;
  team: 'alpha' | 'bravo' | 'spectator';
  text: string;
  serverTimeMs: number;
}

export interface AuthoritativeMatchOptions {
  simulation?: RuntimeValue;
  tickHz?: number;
  snapshotHz?: number;
  maxCatchUpTicks?: number;
  maxBacklogTicks?: number;
  longStallCatchUpTicks?: number;
  maxInputLeadTicks?: number;
  roomController?: RoomController | null;
  chatClock?: () => number;
  scheduleRoomStateFanout?: ((callback: () => void) => RuntimeValue) | null;
  roomStateFanoutBatchSize?: number;
  keyframeIntervalTicks?: number;
  snapshotHistoryCapacity?: number;
}

export interface MatchClientOptions {
  transport?: MatchTransport;
  playerId?: string;
  interpolationDelayMs?: number;
  maxExtrapolationMs?: number;
  pingIntervalMs?: number;
  clock?: () => number;
}

export interface MatchClientStats extends Record<string, RuntimeValue> {
  connected: boolean;
  rttMs: number | null;
  rttJitterMs: number;
  serverOffsetMs: number;
  serverOffsetTargetMs: number;
  snapshotPacketsReceived: number;
  estimatedMissingSnapshots: number;
  estimatedSnapshotLoss: number;
  missingSnapshotBaselines: number;
  transportBufferedBytes: number;
  pendingEventBatches: number;
  inputPacketsSubmitted: number;
  lastAckedInputSeq: number | null;
  inputAckLag: number | null;
  pendingInputEdges: number;
  buffer: ReturnType<SnapshotBuffer['getStats']>;
  transport: RuntimeValue;
}

function isRecord(value: RuntimeValue): value is Record<string, RuntimeValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateRate(tickHz: number, snapshotHz: number): void {
  if (!Number.isInteger(tickHz) || tickHz < 10 || tickHz > 120) {
    throw new TypeError('tickHz must be an integer between 10 and 120');
  }
  if (!Number.isInteger(snapshotHz) || snapshotHz < 1 || snapshotHz > tickHz ||
      tickHz % snapshotHz !== 0) {
    throw new TypeError('snapshotHz must divide tickHz');
  }
}

function isMatchSimulation(simulation: RuntimeValue): simulation is MatchSimulation {
  return isRecord(simulation) && typeof simulation.step === 'function' &&
    typeof simulation.snapshot === 'function';
}

function validateSimulation(simulation: RuntimeValue): MatchSimulation {
  if (!isMatchSimulation(simulation)) {
    throw new TypeError('simulation must implement step() and snapshot()');
  }
  return simulation;
}

function safeErrorPayload(error: RuntimeValue): { code: string; message: string } {
  return {
    code: isRecord(error) && typeof error.code === 'string' ? error.code : 'invalid_message',
    message: error instanceof Error ? error.message : 'invalid message',
  };
}

function defaultClock(): number {
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

function sequenceDistance(latest: RuntimeValue, previous: RuntimeValue): number | null {
  if (!Number.isSafeInteger(latest) || !Number.isSafeInteger(previous)) return null;
  return (Number(latest) - Number(previous) + SEQUENCE_RANGE) % SEQUENCE_RANGE;
}

function validateEventBatch(payload: RuntimeValue): EventBatch {
  if (!isRecord(payload) || !Number.isSafeInteger(payload.tick) || Number(payload.tick) < 0 ||
      !Array.isArray(payload.events) || payload.events.length > MAX_EVENTS_PER_BATCH ||
      payload.events.some((event) => !isRecord(event))) {
    throw new ProtocolError('invalid_event_batch', 'event batch must include a valid tick and events');
  }
  return { tick: Number(payload.tick), events: payload.events as MatchEvent[] };
}

function validateRoomState(payload: RuntimeValue, { requireRound = true } = {}): MatchRoomState {
  if (!isRecord(payload) || !Array.isArray(payload.players) ||
      payload.players.some((player) => !isRecord(player)) ||
      !Number.isSafeInteger(Number(payload.revision)) ||
      (requireRound && !Number.isSafeInteger(Number(payload.round)))) {
    throw new ProtocolError(
      requireRound ? 'invalid_room_state' : 'invalid_lobby_state',
      `${requireRound ? 'room' : 'lobby'} state is malformed`,
    );
  }
  return payload as MatchRoomState;
}

function validateAuthoritativeTiming(
  tickHz: number,
  snapshotHz: number,
  maxCatchUpTicks: number,
  maxBacklogTicks: number,
  longStallCatchUpTicks: number,
  keyframeIntervalTicks: number,
  snapshotHistoryCapacity: number,
): void {
  validateRate(tickHz, snapshotHz);
  if (!Number.isInteger(maxCatchUpTicks) || maxCatchUpTicks < 1 || maxCatchUpTicks > 12) {
    throw new TypeError('maxCatchUpTicks must be between 1 and 12');
  }
  if (!Number.isInteger(maxBacklogTicks) || maxBacklogTicks < maxCatchUpTicks ||
      maxBacklogTicks > tickHz * 10) {
    throw new TypeError('maxBacklogTicks must cover catch-up and at most ten seconds');
  }
  if (!Number.isInteger(longStallCatchUpTicks) || longStallCatchUpTicks < 1 ||
      longStallCatchUpTicks > maxCatchUpTicks) {
    throw new TypeError('longStallCatchUpTicks must be within the catch-up window');
  }
  if (!Number.isInteger(keyframeIntervalTicks) || keyframeIntervalTicks < tickHz / snapshotHz) {
    throw new TypeError('keyframeIntervalTicks must cover at least one snapshot interval');
  }
  if (!Number.isInteger(snapshotHistoryCapacity) || snapshotHistoryCapacity < 2) {
    throw new TypeError('snapshotHistoryCapacity must be at least two');
  }
}

function validateAuthoritativeRoom(
  roomController: RoomController | null,
  chatClock: () => number,
  scheduleRoomStateFanout: AuthoritativeMatchOptions['scheduleRoomStateFanout'],
  roomStateFanoutBatchSize: number,
): void {
  if (roomController && (typeof roomController.state !== 'function' ||
      typeof roomController.command !== 'function')) {
    throw new TypeError('roomController must implement state() and command()');
  }
  if (typeof chatClock !== 'function') throw new TypeError('chatClock must be a function');
  if (scheduleRoomStateFanout != null && typeof scheduleRoomStateFanout !== 'function') {
    throw new TypeError('scheduleRoomStateFanout must be a function');
  }
  if (!Number.isInteger(roomStateFanoutBatchSize) || roomStateFanoutBatchSize < 1 ||
      roomStateFanoutBatchSize > 8) {
    throw new TypeError('roomStateFanoutBatchSize must be between 1 and 8');
  }
}

/**
 * Server/host-owned fixed-step match module. A browser host, dedicated Node
 * process, and solo loopback session all call this exact interface.
 */
export class AuthoritativeMatchRuntime {
  simulation: MatchSimulation;
  readonly roomController: RoomController | null;
  readonly chatClock: () => number;
  readonly scheduleRoomStateFanout: ((callback: () => void) => RuntimeValue) | null;
  readonly roomStateFanoutBatchSize: number;
  private roomStateFanoutGeneration = 0;
  private chatSequence = 0;
  readonly tickHz: number;
  readonly snapshotHz: number;
  readonly tickMs: number;
  readonly snapshotEveryTicks: number;
  readonly maxCatchUpTicks: number;
  readonly maxBacklogTicks: number;
  readonly longStallCatchUpTicks: number;
  readonly maxInputLeadTicks: number;
  readonly keyframeIntervalTicks: number;
  readonly snapshotHistoryCapacity: number;
  tick = 0;
  timeMs = 0;
  accumulatorMs = 0;
  readonly peers = new Map<string, MatchPeer>();
  closed = false;
  matchStarted = false;
  roomRound: number;
  roundPending = false;
  roundFinished = false;
  readonly stats: AuthoritativeMatchStats;

  constructor({
    simulation,
    tickHz = MATCH_TICK_HZ,
    snapshotHz = SNAPSHOT_HZ,
    maxCatchUpTicks = 4,
    maxBacklogTicks = maxCatchUpTicks,
    longStallCatchUpTicks = maxCatchUpTicks,
    maxInputLeadTicks = 120,
    roomController = null,
    chatClock = defaultClock,
    scheduleRoomStateFanout = null,
    roomStateFanoutBatchSize = 2,
    keyframeIntervalTicks = tickHz * 2,
    snapshotHistoryCapacity = Math.max(64,
      Math.ceil(keyframeIntervalTicks * snapshotHz / tickHz) * 2),
  }: AuthoritativeMatchOptions = {}) {
    validateAuthoritativeTiming(
      tickHz,
      snapshotHz,
      maxCatchUpTicks,
      maxBacklogTicks,
      longStallCatchUpTicks,
      keyframeIntervalTicks,
      snapshotHistoryCapacity,
    );
    this.simulation = validateSimulation(simulation);
    validateAuthoritativeRoom(
      roomController,
      chatClock,
      scheduleRoomStateFanout,
      roomStateFanoutBatchSize,
    );
    this.roomController = roomController;
    this.chatClock = chatClock;
    this.scheduleRoomStateFanout = scheduleRoomStateFanout;
    this.roomStateFanoutBatchSize = roomStateFanoutBatchSize;
    this.tickHz = tickHz;
    this.snapshotHz = snapshotHz;
    this.tickMs = 1000 / tickHz;
    this.snapshotEveryTicks = tickHz / snapshotHz;
    this.maxCatchUpTicks = maxCatchUpTicks;
    this.maxBacklogTicks = maxBacklogTicks;
    this.longStallCatchUpTicks = longStallCatchUpTicks;
    this.maxInputLeadTicks = maxInputLeadTicks;
    this.keyframeIntervalTicks = keyframeIntervalTicks;
    this.snapshotHistoryCapacity = snapshotHistoryCapacity;
    this.roomRound = Number(roomController?.state()?.round) || 0;
    this.stats = {
      steps: 0,
      snapshots: 0,
      droppedCatchUpMs: 0,
      backlogHighWaterMs: 0,
      longStallCatchUpFrames: 0,
      invalidMessages: 0,
      staleInputs: 0,
      futureInputs: 0,
      snapshotKeyframes: 0,
      snapshotDeltas: 0,
      snapshotEntityRows: 0,
      reliableEventBatches: 0,
      reliableEvents: 0,
      roomStateFanoutBatches: 0,
      roomStateFanoutPeers: 0,
    };
  }

  attachPeer({
    peerId,
    transport,
    metadata = null,
  }: {
    peerId?: string;
    transport?: MatchTransport;
    metadata?: Record<string, RuntimeValue> | null;
  } = {}): Unsubscribe {
    if (this.closed) throw new Error('match runtime is closed');
    const id = String(peerId || '').trim();
    if (!id) throw new TypeError('peerId is required');
    if (this.peers.has(id)) throw new Error(`peer already attached: ${id}`);
    if (!transport || typeof transport.send !== 'function' ||
        typeof transport.onMessage !== 'function') {
      throw new TypeError('transport must implement send() and onMessage()');
    }
    const peer: MatchPeer = {
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
      snapshotHistory: new Map<number, WorldSnapshot>(),
      unsubscribeMessage: null,
      unsubscribeClose: null,
    };
    peer.unsubscribeMessage = transport.onMessage((message) => this.#receive(peer, message));
    if (typeof transport.onClose === 'function') {
      peer.unsubscribeClose = transport.onClose((reason) => this.detachPeer(id, reason, {
        retainRoomSeat: true,
      }));
    }
    this.peers.set(id, peer);
    if (typeof this.simulation.onPeerJoin === 'function') {
      this.simulation.onPeerJoin({ peerId: id, metadata });
    }
    return () => this.detachPeer(id, 'detached');
  }

  /** Reattach a browser that refreshed while a persistent room is waiting. */
  rejoinPeer({
    peerId,
    transport,
    player = null,
    metadata = null,
  }: {
    peerId?: string;
    transport?: MatchTransport;
    player?: Record<string, RuntimeValue> | null;
    metadata?: Record<string, RuntimeValue> | null;
  } = {}): Unsubscribe {
    const id = String(peerId || '').trim();
    if (!id) throw new TypeError('peerId is required');
    if (!this.roomController?.rejoin) {
      throw new ProtocolError('room_rejoin_unavailable', 'this room cannot accept a returning player');
    }
    if (this.peers.has(id)) this.detachPeer(id, 'peer_replaced', { retainRoomSeat: true });
    this.roomController.rejoin(id, player || {});
    const detach = this.attachPeer({ peerId: id, transport, metadata });
    this.#broadcastRoomState();
    return detach;
  }

  /** Replay packets that arrived during an ordered lobby-to-match handoff. */
  acceptPeerMessage(peerId: string, raw: RuntimeValue): boolean {
    const peer = this.peers.get(String(peerId));
    if (!peer || this.closed) return false;
    this.#receive(peer, raw);
    return true;
  }

  detachPeer(
    peerId: string,
    reason = 'left',
    { retainRoomSeat = false }: { retainRoomSeat?: boolean } = {},
  ): boolean {
    const id = String(peerId);
    const peer = this.peers.get(id);
    if (!peer) return false;
    this.peers.delete(id);
    if (peer.unsubscribeMessage) peer.unsubscribeMessage();
    if (peer.unsubscribeClose) peer.unsubscribeClose();
    if (typeof this.simulation.onPeerLeave === 'function') {
      this.simulation.onPeerLeave({ peerId: id, reason });
    }
    if (!this.closed && retainRoomSeat && this.roomController?.disconnect) {
      this.roomController.disconnect(id, reason);
      this.#broadcastRoomState();
    } else if (!this.closed && this.roomController?.remove) {
      this.roomController.remove(id, reason);
      this.#broadcastRoomState();
    }
    return true;
  }

  #send(peer: MatchPeer, type: MessageType, payload: RuntimeValue): boolean {
    if (!peer || peer.transport.readyState === 'closed') return false;
    const envelope = createEnvelope(type, payload, {
      seq: peer.sendSeq,
      ack: peer.lastRecvSeq == null ? 0 : peer.lastRecvSeq,
      tick: this.tick,
    });
    peer.sendSeq = nextSequence(peer.sendSeq);
    let accepted: boolean;
    try {
      accepted = type === MESSAGE_TYPES.SNAPSHOT &&
        typeof peer.transport.sendState === 'function'
        ? peer.transport.sendState(envelope)
        : peer.transport.send(envelope);
    } catch (error) {
      // A transport may enter closing state between the tick's readiness check
      // and the send. That is a peer departure, not an authority failure.
      if (!(error instanceof TransportClosedError)) throw error;
      this.detachPeer(peer.id, 'transport_closed', { retainRoomSeat: true });
      return false;
    }
    if (!accepted && typeof peer.transport.close === 'function') {
      peer.transport.close('backpressure_limit');
      this.detachPeer(peer.id, 'backpressure_limit', { retainRoomSeat: true });
    }
    return accepted;
  }

  #receive(peer: MatchPeer, raw: RuntimeValue): void {
    try {
      const message = validateEnvelope(raw);
      if (!this.#acceptPeerSequence(peer, message)) return;
      this.#dispatchPeerMessage(peer, message);
    } catch (error) {
      this.stats.invalidMessages++;
      this.#send(peer, MESSAGE_TYPES.ERROR, safeErrorPayload(error));
    }
  }

  #acceptPeerSequence(peer: MatchPeer, message: ProtocolEnvelope): boolean {
    // A malformed or unexpectedly reordered pre-handshake packet must not
    // advance the reliable sequence watermark past HELLO. This lets the
    // legitimate handshake recover instead of poisoning the session.
    if (!peer.welcomed && message.type !== MESSAGE_TYPES.HELLO &&
        message.type !== MESSAGE_TYPES.LEAVE) {
      throw new ProtocolError('hello_required', 'hello must precede match traffic');
    }
    if (message.type === MESSAGE_TYPES.INPUT) {
      if (peer.lastInputEnvelopeSeq != null &&
          !isSequenceNewer(message.seq, peer.lastInputEnvelopeSeq)) return false;
      peer.lastInputEnvelopeSeq = message.seq;
      return true;
    }
    if (peer.lastRecvSeq != null && !isSequenceNewer(message.seq, peer.lastRecvSeq)) return false;
    peer.lastRecvSeq = message.seq;
    return true;
  }

  #dispatchPeerMessage(peer: MatchPeer, message: ProtocolEnvelope): void {
    switch (message.type) {
      case MESSAGE_TYPES.HELLO:
        this.#receiveHello(peer, message.payload);
        return;
      case MESSAGE_TYPES.ROOM_COMMAND:
        this.#receiveRoomCommand(peer, message.payload);
        return;
      case MESSAGE_TYPES.ROOM_CHAT_COMMAND:
        this.#receiveRoomChat(peer, message.payload);
        return;
      case MESSAGE_TYPES.INPUT:
        this.#receiveInput(peer, message.payload);
        return;
      case MESSAGE_TYPES.READY:
        this.#receiveReady(peer);
        return;
      case MESSAGE_TYPES.PING:
        this.#receivePing(peer, message.payload);
        return;
      case MESSAGE_TYPES.LEAVE:
        this.detachPeer(peer.id, 'client_leave');
        return;
      default:
        throw new ProtocolError('unexpected_message',
          `${message.type} is not accepted from a client during a match`);
    }
  }

  #receiveHello(peer: MatchPeer, payload: ProtocolPayload): void {
    if (peer.welcomed) return;
    if (!isRecord(payload) || String(payload.playerId || '') !== peer.id) {
      throw new ProtocolError('identity_mismatch', 'hello player id does not match transport identity');
    }
    if (payload.metadata != null && !isRecord(payload.metadata)) {
      throw new ProtocolError('invalid_metadata', 'hello metadata must be an object');
    }
    peer.metadata = { ...(peer.metadata || {}), ...(payload.metadata || {}) };
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
  }

  #receiveReady(peer: MatchPeer): void {
    if (this.roundPending) {
      peer.pendingRoundReady = true;
      return;
    }
    if (peer.ready) return;
    peer.ready = true;
    this.simulation.onPeerReady?.({ peerId: peer.id, metadata: peer.metadata });
  }

  #receivePing(peer: MatchPeer, rawPayload: ProtocolPayload): void {
    const payload = isRecord(rawPayload) ? rawPayload : null;
    this.#recordSnapshotAck(peer, payload?.snapshotAckTick);
    this.#send(peer, MESSAGE_TYPES.PONG, {
      clientTimeMs: Number(payload?.clientTimeMs) || 0,
      serverTimeMs: this.timeMs,
    });
  }

  #receiveRoomCommand(peer: MatchPeer, command: RuntimeValue): void {
    if (!this.roomController) {
      throw new ProtocolError('room_unavailable', 'this match has no persistent room');
    }
    const beforeRound = Number(this.roomController.state()?.round) || 0;
    if (!isRecord(command)) {
      throw new ProtocolError('invalid_room_command', 'room command must be an object');
    }
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

  #receiveRoomChat(peer: MatchPeer, payload: RuntimeValue): void {
    if (!this.roomController) {
      throw new ProtocolError('room_unavailable', 'chat is only available in a room');
    }
    const text = normalizeRoomChatText(isRecord(payload) ? payload.text : undefined);
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

  #resetPeerForRound(peer: MatchPeer): void {
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

  #broadcastRoomState(state: MatchRoomState | null = null): MatchRoomState | null {
    if (!this.roomController) return null;
    this.roomStateFanoutGeneration++;
    const next = state || this.roomController.state();
    for (const peer of this.peers.values()) {
      if (peer.welcomed) this.#send(peer, MESSAGE_TYPES.ROOM_STATE, next);
    }
    return next;
  }

  /**
   * A result can return a full 7v7 room to waiting in the same task as the
   * final authoritative tick. Sending that DOM-facing state to every browser
   * synchronously made the host pay all peers' room UI work before its next
   * frame. Keep the host/current first peers immediate, then yield between
   * small reliable batches. A newer room revision cancels the remaining old
   * fanout so a fast rematch can never be overwritten by stale waiting state.
   */
  #broadcastRoomStateDeferred(state: MatchRoomState | null = null): MatchRoomState | null {
    if (!this.roomController || !this.scheduleRoomStateFanout) {
      return this.#broadcastRoomState(state);
    }
    const next = state || this.roomController.state();
    const peers = [...this.peers.values()].filter((peer) => peer.welcomed);
    const schedule = this.scheduleRoomStateFanout;
    const generation = ++this.roomStateFanoutGeneration;
    let cursor = 0;
    const pump = () => {
      if (this.closed || generation !== this.roomStateFanoutGeneration) return;
      const end = Math.min(peers.length, cursor + this.roomStateFanoutBatchSize);
      for (; cursor < end; cursor++) {
        this.#send(peers[cursor], MESSAGE_TYPES.ROOM_STATE, next);
        this.stats.roomStateFanoutPeers++;
      }
      this.stats.roomStateFanoutBatches++;
      if (cursor < peers.length) schedule(pump);
    };
    pump();
    return next;
  }

  /** Install the next authority simulation after the host loads its battlefield. */
  replaceSimulation(
    simulation: RuntimeValue,
    { round = this.roomRound }: { round?: number } = {},
  ): MatchSimulation {
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

  #receiveInput(peer: MatchPeer, payload: RuntimeValue): void {
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

  #recordSnapshotAck(peer: MatchPeer, rawTick: RuntimeValue): void {
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
   * Advance authority by wall-clock delta. Normal frame gaps catch up inside
   * the short window. A separately bounded long-stall backlog may be retained
   * and drained gradually so one blocked render neither deletes match time nor
   * fast-forwards the complete simulation in one rubber-banding burst.
   */
  advance(elapsedMs: number): number {
    if (this.closed) return 0;
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
      throw new TypeError('elapsedMs must be non-negative');
    }
    this.#accumulateElapsed(elapsedMs);
    const stepLimit = this.#catchUpStepLimit();
    let steps = 0;
    while (this.accumulatorMs + 1e-9 >= this.tickMs && steps < stepLimit) {
      this.#advanceTick();
      steps++;
    }
    return steps;
  }

  #accumulateElapsed(elapsedMs: number): void {
    const maxAccumulated = this.tickMs * this.maxBacklogTicks;
    const nextAccumulated = this.accumulatorMs + elapsedMs;
    if (nextAccumulated > maxAccumulated) {
      this.stats.droppedCatchUpMs += nextAccumulated - maxAccumulated;
      this.accumulatorMs = maxAccumulated;
    } else {
      this.accumulatorMs = nextAccumulated;
    }
    this.stats.backlogHighWaterMs = Math.max(
      this.stats.backlogHighWaterMs,
      this.accumulatorMs,
    );
  }

  #catchUpStepLimit(): number {
    const longStall = this.accumulatorMs > this.tickMs * this.maxCatchUpTicks;
    if (longStall) this.stats.longStallCatchUpFrames++;
    return longStall ? this.longStallCatchUpTicks : this.maxCatchUpTicks;
  }

  #advanceTick(): void {
    this.tick++;
    this.timeMs = this.tick * this.tickMs;
    const roundPending = this.roundPending;
    if (!roundPending) {
      this.#tryStartMatch();
      if (this.matchStarted) this.#stepMatch();
    }
    this.accumulatorMs -= this.tickMs;
    this.stats.steps++;
    if (!roundPending && this.tick % this.snapshotEveryTicks === 0) {
      this.#broadcastSnapshots();
    }
  }

  #tryStartMatch(): void {
    if (this.matchStarted) return;
    const requiredIds = Array.isArray(this.simulation.requiredPeerIds)
      ? this.simulation.requiredPeerIds
        .map((id) => String(id))
        .filter((id) => this.peers.has(id))
      : [...this.peers.values()]
        .filter((peer) => !peer.metadata?.spectator)
        .map((peer) => peer.id);
    this.matchStarted = requiredIds.length > 0
      ? requiredIds.every((id) => {
        const peer = this.peers.get(id);
        return !!peer && peer.welcomed && peer.ready;
      })
      : [...this.peers.values()].some((peer) => peer.welcomed && peer.ready);
    if (!this.matchStarted) return;
    this.simulation.onMatchReady?.({ tick: this.tick, timeMs: this.timeMs });
    if (this.roomController?.markPlaying) {
      this.roomController.markPlaying();
      this.#broadcastRoomState();
    }
  }

  #stepMatch(): void {
    this.simulation.step({
      dt: 1 / this.tickHz,
      tick: this.tick,
      timeMs: this.timeMs,
      inputs: this.#collectInputs(),
    });
    if (this.roundFinished || !this.simulation.result) return;
    this.roundFinished = true;
    if (this.roomController?.finish) {
      this.roomController.finish({
        result: this.simulation.result,
        reason: this.simulation.resultReason || null,
      });
      this.#broadcastRoomStateDeferred();
    }
  }

  #collectInputs(): Map<string, NormalizedPlayerInput | null> {
    const inputs = new Map<string, NormalizedPlayerInput | null>();
    for (const peer of this.peers.values()) {
      const currentInput = peer.input;
      const needsEdgeMerge = currentInput !== null && (
        (peer.fireQueued && !currentInput.fire) ||
        (peer.actionBitsQueued & ~currentInput.actionBits) !== 0
      );
      const input = needsEdgeMerge && currentInput
        ? {
          ...currentInput,
          fire: peer.fireQueued || currentInput.fire,
          actionBits: peer.actionBitsQueued | currentInput.actionBits,
        }
        : currentInput;
      inputs.set(peer.id, input);
      peer.fireQueued = false;
      peer.actionBitsQueued = 0;
      if (peer.input?.actionBits) peer.input = { ...peer.input, actionBits: 0 };
    }
    return inputs;
  }

  #broadcastSnapshots(): void {
    for (const peer of this.peers.values()) {
      if (peer.welcomed) this.#broadcastSnapshotToPeer(peer);
    }
    this.simulation.afterSnapshotBroadcast?.();
  }

  #broadcastSnapshotToPeer(peer: MatchPeer): void {
    const snapshot = this.simulation.snapshot({
      tick: this.tick,
      serverTimeMs: this.timeMs,
      viewerId: peer.id,
      ackInputSeq: peer.lastInputSeq == null ? null : peer.lastInputSeq,
    });
    if (this.roomController) {
      snapshot.meta = { ...(snapshot.meta || {}), roomRound: this.roomRound };
    }
    // One-shot events use the reliable lane; snapshots are replaceable and
    // may be coalesced under backpressure without erasing combat chronology.
    const reliableEvents = Array.isArray(snapshot.events)
      ? snapshot.events.filter(isRecord)
      : [];
    snapshot.events = [];
    const acknowledged = peer.lastSnapshotAckTick == null
      ? null
      : peer.snapshotHistory.get(peer.lastSnapshotAckTick) || null;
    const needsKeyframe = !acknowledged ||
      this.tick - peer.lastKeyframeTick >= this.keyframeIntervalTicks;
    const packet = createSnapshotDelta(snapshot, needsKeyframe ? null : acknowledged);
    this.#rememberSnapshot(peer, snapshot);
    this.#recordSnapshotEncoding(peer, needsKeyframe, packet.entities.length);
    this.#send(peer, MESSAGE_TYPES.SNAPSHOT, packet);
    this.stats.snapshots++;
    this.#sendReliableEvents(peer, snapshot.tick, reliableEvents);
  }

  #rememberSnapshot(peer: MatchPeer, snapshot: WorldSnapshot): void {
    peer.snapshotHistory.set(snapshot.tick, snapshot);
    while (peer.snapshotHistory.size > this.snapshotHistoryCapacity) {
      const oldestTick = peer.snapshotHistory.keys().next().value;
      if (oldestTick == null) return;
      peer.snapshotHistory.delete(oldestTick);
    }
  }

  #recordSnapshotEncoding(peer: MatchPeer, keyframe: boolean, entityRows: number): void {
    if (keyframe) {
      peer.lastKeyframeTick = this.tick;
      this.stats.snapshotKeyframes++;
    } else {
      this.stats.snapshotDeltas++;
    }
    this.stats.snapshotEntityRows += entityRows;
  }

  #sendReliableEvents(peer: MatchPeer, tick: number, events: MatchEvent[]): void {
    if (!events.length) return;
    this.#send(peer, MESSAGE_TYPES.EVENT, { tick, events });
    this.stats.reliableEventBatches++;
    this.stats.reliableEvents += events.length;
  }

  close(reason = 'host_closed'): void {
    if (this.closed) return;
    this.closed = true;
    this.roomStateFanoutGeneration++;
    for (const peer of [...this.peers.values()]) {
      if (typeof peer.transport.close === 'function') peer.transport.close(reason);
      this.detachPeer(peer.id, reason);
    }
  }
}

/** Client-side match module: input upload, clock sync, and snapshot sampling. */
export class MatchClientRuntime {
  transport: MatchTransport;
  readonly playerId: string;
  readonly buffer: SnapshotBuffer;
  readonly assembler: SnapshotAssembler;
  readonly pingIntervalMs: number;
  readonly clock: () => number;
  sendSeq = 0;
  inputSendSeq = 0;
  inputSeq = 0;
  lastSubmittedInputSeq: number | null = null;
  lastAckedInputSeq: number | null = null;
  pendingFireAckSeq: number | null = null;
  lastRequestedFire = false;
  readonly pendingActionAckSeqs = new Map<number, number>();
  inputPacketsSubmitted = 0;
  lastRecvSeq: number | null = null;
  clientTick = 0;
  lastSnapshotTick = 0;
  missingSnapshotBaselines = 0;
  snapshotPacketsReceived = 0;
  estimatedMissingSnapshots = 0;
  lastSnapshotPacketTick: number | null = null;
  snapshotEveryTicks = 3;
  serverOffsetMs = 0;
  serverOffsetTargetMs = 0;
  rttMs: number | null = null;
  rttJitterMs = 0;
  lastRttSampleMs: number | null = null;
  lastPingAtMs = -Infinity;
  connected = false;
  closed = false;
  readonly errors: RuntimeValue[] = [];
  private readonly eventListeners = new Set<(event: MatchEvent) => void>();
  private readonly pendingEventBatches: EventBatch[] = [];
  private readonly connectionListeners = new Set<(connected: boolean) => void>();
  private readonly roomListeners = new Set<(state: MatchRoomState) => void>();
  private readonly roomChatListeners = new Set<(message: RoomChatMessage) => void>();
  private readonly roomChatHistory: RoomChatMessage[] = [];
  roomState: MatchRoomState | null = null;
  roomRound = 0;
  handshakeSent = false;
  readySent = false;
  private unsubscribeMessage: Unsubscribe | null;
  private unsubscribeClose: Unsubscribe | null;
  private _lastUpdateNowMs: number | undefined;

  constructor({
    transport,
    playerId,
    interpolationDelayMs = 100,
    maxExtrapolationMs = 250,
    pingIntervalMs = 1000,
    clock = defaultClock,
  }: MatchClientOptions = {}) {
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
  connect(metadata: Record<string, RuntimeValue> | null = null): boolean {
    if (this.closed || this.handshakeSent) return false;
    const sent = this.#send(MESSAGE_TYPES.HELLO, {
      playerId: this.playerId,
      metadata,
    });
    if (sent) this.handshakeSent = true;
    return sent;
  }

  /** Swap wrappers around the same open channel during lobby→match handoff. */
  replaceTransport(transport: MatchTransport): boolean {
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

  /** Rebind a replacement peer connection after signaling/ICE recovery. */
  reconnectTransport(
    transport: MatchTransport,
    metadata: Record<string, RuntimeValue> | null = null,
  ): boolean {
    if (!transport || typeof transport.send !== 'function' ||
        typeof transport.onMessage !== 'function') {
      throw new TypeError('transport must implement send() and onMessage()');
    }
    if (this.unsubscribeMessage) this.unsubscribeMessage();
    if (this.unsubscribeClose) this.unsubscribeClose();
    this.transport = transport;
    this.connected = false;
    this.closed = false;
    this.handshakeSent = false;
    this.readySent = false;
    this.sendSeq = 0;
    this.inputSendSeq = 0;
    this.lastRecvSeq = null;
    this.errors.length = 0;
    this.unsubscribeMessage = transport.onMessage((message) => this.#receive(message));
    this.unsubscribeClose = typeof transport.onClose === 'function'
      ? transport.onClose(() => {
        this.connected = false;
        this.closed = true;
        for (const listener of [...this.connectionListeners]) listener(false);
      })
      : null;
    return this.connect({ ...metadata, resumed: true });
  }

  #send(type: MessageType, payload: RuntimeValue): boolean {
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

  #acknowledgeInput(rawSequence: RuntimeValue): void {
    const acknowledged = Number(rawSequence);
    if (!Number.isSafeInteger(acknowledged) || acknowledged < 0) return;
    if (this.lastAckedInputSeq == null ||
        isSequenceNewer(acknowledged, this.lastAckedInputSeq)) {
      this.lastAckedInputSeq = acknowledged;
    }
    const covers = (sequence: number) => sequence === acknowledged ||
      isSequenceNewer(acknowledged, sequence);
    if (this.pendingFireAckSeq != null && covers(this.pendingFireAckSeq)) {
      this.pendingFireAckSeq = null;
    }
    for (const [bit, sequence] of this.pendingActionAckSeqs) {
      if (covers(sequence)) this.pendingActionAckSeqs.delete(bit);
    }
  }

  #receive(raw: RuntimeValue): void {
    try {
      const message = validateEnvelope(raw);
      if (message.type === MESSAGE_TYPES.SNAPSHOT) {
        this.#receiveSnapshot(message);
        return;
      }
      if (!this.#acceptServerSequence(message)) return;
      this.#dispatchServerMessage(message);
    } catch (error) {
      this.errors.push(safeErrorPayload(error));
    }
  }

  #receiveSnapshot(message: ProtocolEnvelope): void {
    // Snapshot delivery may use an unordered/no-retransmit lane. Its tick is
    // the ordering authority; reliable control uses a separate watermark.
    const payload = message.payload;
    if (!isRecord(payload) || payload.tick !== message.tick) {
      throw new ProtocolError(
        'snapshot_tick_mismatch',
        'snapshot envelope tick does not match payload',
      );
    }
    this.clientTick = Math.max(this.clientTick, message.tick);
    this.#recordSnapshotPacket(message.tick);
    this.#acknowledgeInput(payload.ackInputSeq);
    const snapshot = this.assembler.accept(payload);
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
  }

  #recordSnapshotPacket(tick: number): void {
    if (this.lastSnapshotPacketTick != null && tick <= this.lastSnapshotPacketTick) return;
    if (this.lastSnapshotPacketTick != null) {
      const steps = Math.max(1, Math.round(
        (tick - this.lastSnapshotPacketTick) / this.snapshotEveryTicks,
      ));
      this.estimatedMissingSnapshots += Math.max(0, steps - 1);
    }
    this.lastSnapshotPacketTick = tick;
    this.snapshotPacketsReceived++;
  }

  #acceptServerSequence(message: ProtocolEnvelope): boolean {
    // WELCOME is the explicit lobby→match authority boundary and establishes
    // a fresh sequence watermark even if a final lobby packet arrived first.
    const matchWelcome = message.type === MESSAGE_TYPES.WELCOME &&
      this.handshakeSent && !this.connected;
    if (!matchWelcome && this.lastRecvSeq != null &&
        !isSequenceNewer(message.seq, this.lastRecvSeq)) return false;
    this.lastRecvSeq = message.seq;
    this.clientTick = Math.max(this.clientTick, message.tick);
    return true;
  }

  #dispatchServerMessage(message: ProtocolEnvelope): void {
    switch (message.type) {
      case MESSAGE_TYPES.WELCOME:
        this.#receiveWelcome(message.payload);
        return;
      case MESSAGE_TYPES.PONG:
        this.#receivePong(message.payload);
        return;
      case MESSAGE_TYPES.EVENT:
        this.#receiveEventBatch(message.payload);
        return;
      case MESSAGE_TYPES.ROOM_STATE:
        this.#receiveRoomState(message.payload);
        return;
      case MESSAGE_TYPES.ROOM_CHAT:
        this.#receiveRoomChatMessage(message.payload);
        return;
      case MESSAGE_TYPES.LOBBY_STATE:
        this.#receiveLobbyState(message.payload);
        return;
      case MESSAGE_TYPES.ERROR:
        this.errors.push(message.payload);
        return;
      default:
        return;
    }
  }

  #receiveWelcome(rawPayload: ProtocolPayload): void {
    if (!isRecord(rawPayload)) {
      throw new ProtocolError('invalid_welcome', 'welcome payload is malformed');
    }
    const serverTick = Number(rawPayload.serverTick);
    const tickHz = Number(rawPayload.tickHz);
    const snapshotHz = Number(rawPayload.snapshotHz);
    const serverTimeMs = Number(rawPayload.serverTimeMs);
    if (!Number.isSafeInteger(serverTick) || serverTick < 0 ||
        !Number.isFinite(serverTimeMs)) {
      throw new ProtocolError('invalid_welcome', 'welcome timing is malformed');
    }
    this.connected = true;
    this.clientTick = serverTick;
    if (Number.isFinite(tickHz) && Number.isFinite(snapshotHz) &&
        tickHz > 0 && snapshotHz > 0) {
      this.snapshotEveryTicks = Math.max(1, Math.round(tickHz / snapshotHz));
    }
    this.serverOffsetMs = serverTimeMs - this.clock();
    this.serverOffsetTargetMs = this.serverOffsetMs;
    this._lastUpdateNowMs = undefined;
    for (const listener of [...this.connectionListeners]) listener(true);
  }

  #receivePong(rawPayload: ProtocolPayload): void {
    const now = this.clock();
    const payload = isRecord(rawPayload) ? rawPayload : null;
    const sent = Number(payload?.clientTimeMs);
    const server = Number(payload?.serverTimeMs);
    if (!Number.isFinite(now) || !Number.isFinite(sent) ||
        !Number.isFinite(server) || now < sent) return;
    const rtt = now - sent;
    if (this.lastRttSampleMs != null) {
      const variation = Math.abs(rtt - this.lastRttSampleMs);
      this.rttJitterMs += (variation - this.rttJitterMs) * 0.2;
    }
    this.lastRttSampleMs = rtt;
    this.rttMs = this.rttMs == null ? rtt : this.rttMs + (rtt - this.rttMs) * 0.2;
    const sample = server - (sent + now) * 0.5;
    this.serverOffsetTargetMs += (sample - this.serverOffsetTargetMs) * 0.15;
  }

  #receiveEventBatch(rawPayload: ProtocolPayload): void {
    const batch = validateEventBatch(rawPayload);
    if (this.pendingEventBatches.length >= MAX_PENDING_EVENT_BATCHES) {
      throw new ProtocolError(
        'event_backlog_overflow',
        'reliable event backlog exceeded its limit',
      );
    }
    this.pendingEventBatches.push(batch);
    for (const event of batch.events) {
      for (const listener of [...this.eventListeners]) listener(event);
    }
  }

  #receiveRoomState(rawPayload: ProtocolPayload): void {
    const state = validateRoomState(rawPayload);
    if (this.roomState && Number(state.revision) < Number(this.roomState.revision)) return;
    const nextRound = Number(state.round) || 0;
    if (state.phase === 'starting' && nextRound > this.roomRound) {
      this.resetForRound(nextRound);
    }
    this.publishRoomState(state);
  }

  #receiveLobbyState(rawPayload: ProtocolPayload): void {
    // The same client survives the browser lobby→match authority handoff.
    const state = validateRoomState(rawPayload, { requireRound: false });
    if (this.roomState && Number(state.revision) < Number(this.roomState.revision)) return;
    this.publishRoomState(state);
  }

  private publishRoomState(state: MatchRoomState): void {
    this.roomState = state;
    for (const listener of [...this.roomListeners]) listener(state);
  }

  #receiveRoomChatMessage(rawPayload: ProtocolPayload): void {
    if (!isRecord(rawPayload)) {
      throw new ProtocolError('invalid_room_chat', 'room chat payload is malformed');
    }
    const text = normalizeRoomChatText(rawPayload.text);
    const senderId = String(rawPayload.senderId || '');
    const senderName = String(rawPayload.senderName || '').trim().slice(0, 32);
    const sequence = Number(rawPayload.sequence);
    const round = Number(rawPayload.round);
    const serverTimeMs = Number(rawPayload.serverTimeMs);
    if (!/^[a-zA-Z0-9_-]{1,48}$/.test(senderId) || !senderName ||
        !Number.isSafeInteger(sequence) || sequence < 0 ||
        !Number.isSafeInteger(round) || round < 0 ||
        !Number.isFinite(serverTimeMs) || serverTimeMs < 0) {
      throw new ProtocolError('invalid_room_chat', 'room chat payload is malformed');
    }
    const chat: RoomChatMessage = {
      id: String(rawPayload.id || `${round}:${sequence}`).slice(0, 64),
      sequence,
      round,
      senderId,
      senderName,
      team: rawPayload.team === 'alpha' || rawPayload.team === 'bravo'
        ? rawPayload.team : 'spectator',
      text,
      serverTimeMs,
    };
    this.roomChatHistory.push(chat);
    if (this.roomChatHistory.length > MAX_ROOM_CHAT_HISTORY) this.roomChatHistory.shift();
    for (const listener of [...this.roomChatListeners]) listener(chat);
  }

  submitInput(input: Record<string, RuntimeValue>, clientTick = this.clientTick): boolean {
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

  readyForMatch(): boolean {
    if (this.closed) return false;
    // READY is idempotent at authority. Permit a caller to retransmit it
    // until a countdown/playing snapshot confirms the barrier released.
    // WebRTC control is reliable, but a retry also closes the tiny
    // lobby-to-match listener handoff race and makes simulated links robust.
    const sent = this.#send(MESSAGE_TYPES.READY, { loaded: true });
    if (sent) this.readySent = true;
    return sent;
  }

  submitRoomCommand(command: Record<string, RuntimeValue>): boolean {
    if (this.closed || !isRecord(command)) return false;
    return this.#send(this.connected ? MESSAGE_TYPES.ROOM_COMMAND : MESSAGE_TYPES.LOBBY_COMMAND, command);
  }

  sendRoomChat(text: RuntimeValue): boolean {
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
  beginMatchHandshake(metadata: Record<string, RuntimeValue> | null = null): boolean {
    if (this.closed) return false;
    // A browser rejoining an already-playing room connects directly to match
    // authority before the menu begins its covered world handoff. Its WELCOME
    // is already the correct protocol epoch; sending a second HELLO would be
    // ignored by the welcomed peer and would falsely mark this client offline.
    if (this.connected) return true;
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
    this.readySent = false;
    return this.connect({ ...metadata, phase: 'match' });
  }

  resetForRound(round: number): boolean {
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

  update(nowMs: number): SampledSnapshotFrame | null {
    if (!Number.isFinite(nowMs)) throw new TypeError('nowMs must be finite');
    if (this._lastUpdateNowMs != null && nowMs > this._lastUpdateNowMs) {
      const elapsedMs = Math.min(
        SERVER_CLOCK_MAX_SLEW_WINDOW_MS,
        nowMs - this._lastUpdateNowMs,
      );
      const maxStepMs = elapsedMs * SERVER_CLOCK_SLEW_MS_PER_MS;
      const offsetErrorMs = this.serverOffsetTargetMs - this.serverOffsetMs;
      this.serverOffsetMs += Math.max(-maxStepMs, Math.min(maxStepMs, offsetErrorMs));
    }
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

  onEvent(listener: (event: MatchEvent) => void): Unsubscribe {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /** Drain reliable event batches only after presentation has reached them. */
  drainEventsThrough(tick: number, target: MatchEvent[] = []): MatchEvent[] {
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

  onConnection(listener: (connected: boolean) => void): Unsubscribe {
    this.connectionListeners.add(listener);
    if (this.connected) queueMicrotask(() => listener(true));
    return () => this.connectionListeners.delete(listener);
  }

  onRoomState(listener: (state: MatchRoomState) => void): Unsubscribe {
    this.roomListeners.add(listener);
    const current = this.roomState;
    if (current) queueMicrotask(() => listener(current));
    return () => this.roomListeners.delete(listener);
  }

  onRoomChat(listener: (message: RoomChatMessage) => void): Unsubscribe {
    this.roomChatListeners.add(listener);
    return () => this.roomChatListeners.delete(listener);
  }

  getRoomChatHistory(): RoomChatMessage[] {
    return this.roomChatHistory.slice();
  }

  getStats(): MatchClientStats {
    const snapshotTotal = this.snapshotPacketsReceived + this.estimatedMissingSnapshots;
    return {
      connected: this.connected,
      rttMs: this.rttMs,
      rttJitterMs: this.rttJitterMs,
      serverOffsetMs: this.serverOffsetMs,
      serverOffsetTargetMs: this.serverOffsetTargetMs,
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

  close(reason = 'client_closed'): void {
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
