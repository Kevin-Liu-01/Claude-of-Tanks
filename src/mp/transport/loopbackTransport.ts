/**
 * In-process transport pair with the WebSocket contract's semantics and an
 * injectable impairment per direction: one-way latency, jitter and loss. It
 * is the deterministic link the receipts and soaks drive: everything happens
 * on the caller's clock through `pump(nowMs)`, so a run replays exactly.
 *
 * Ordering follows a real WebSocket: a frame never overtakes the one sent
 * before it (jitter delays later frames, it does not reorder them), and a
 * lost frame is simply never delivered (the way a server's stale-snapshot
 * drop or a dead link looks to the receiver). A reconnect models a new socket
 * to the same server: in-flight frames of both directions are discarded, the
 * server endpoint sees `reconnecting` then `open { resumed: true }`, and the
 * client's owner re-runs its handshake.
 */
import {
  BackpressureGate, DEFAULT_BACKPRESSURE, Listeners, TRANSPORT_CLOSE, createTransportStats,
} from './transport.ts';
import type {
  BackpressurePolicy, Transport, TransportCloseReason, TransportState, TransportStateChange, TransportStats,
  Unsubscribe,
} from './transport.ts';

export interface LinkImpairment {
  /** One-way delay before a frame becomes deliverable. */
  latencyMs: number;
  /** Delay variation: ±jitterMs uniformly around latencyMs (never below 0). */
  jitterMs: number;
  /** Fraction of frames lost in [0, 1]. */
  loss: number;
  /**
   * Which frames the loss may take (all of them by default). An ordered socket
   * never loses a frame, but a sender drops a stale snapshot under
   * backpressure and a datagram transport loses inputs: a filter models those.
   */
  lossFilter?: ((frame: Uint8Array) => boolean) | null;
}

export interface LinkStats {
  queued: number;
  delivered: number;
  lost: number;
  /** Delay actually applied to the last delivered frame. */
  lastDelayMs: number;
  maxDelayMs: number;
}

export type LoopbackRole = 'client' | 'server';

export interface LoopbackPairOptions {
  /** The clock every delay is measured on (a receipt's virtual clock; performance.now by default). */
  clock?: () => number;
  clientToServer?: Partial<LinkImpairment>;
  serverToClient?: Partial<LinkImpairment>;
  /** Deterministic source for jitter and loss decisions. */
  random?: () => number;
  backpressure?: Partial<BackpressurePolicy>;
  /** Time between the client's open()/reconnect() and the link being open (0 = synchronous). */
  connectDelayMs?: number;
  reconnectDelayMs?: number;
  maxFrameBytes?: number;
}

interface QueuedFrame {
  sentMs: number;
  dueMs: number;
  /** null: a graceful close marker (the peer closes once everything sent before it has arrived). */
  bytes: Uint8Array | null;
  close?: { reason: TransportCloseReason; detail: string };
}

const NO_IMPAIRMENT: LinkImpairment = Object.freeze({ latencyMs: 0, jitterMs: 0, loss: 0, lossFilter: null });
const DEFAULT_MAX_FRAME_BYTES = 64 * 1024;

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
}

function normalizeImpairment(value: Partial<LinkImpairment> | undefined): LinkImpairment {
  const merged = { ...NO_IMPAIRMENT, ...value };
  if (!(merged.latencyMs >= 0) || !(merged.jitterMs >= 0) || !(merged.loss >= 0 && merged.loss <= 1)) {
    throw new TypeError('link impairment needs latencyMs >= 0, jitterMs >= 0 and loss in [0, 1]');
  }
  return merged;
}

/** One direction of the pair: a delay line with loss that preserves order. */
class Link {
  impairment: LinkImpairment;
  readonly stats: LinkStats = { queued: 0, delivered: 0, lost: 0, lastDelayMs: 0, maxDelayMs: 0 };
  private readonly random: () => number;
  private readonly queue: QueuedFrame[] = [];
  private lastDueMs = -Infinity;
  private bufferedBytes = 0;

  constructor(impairment: Partial<LinkImpairment> | undefined, random: () => number) {
    this.impairment = normalizeImpairment(impairment);
    this.random = random;
  }

  get unsentBytes(): number { return this.bufferedBytes; }

  /** Queue a frame; returns false when the impairment lost it. */
  push(bytes: Uint8Array, nowMs: number): boolean {
    const lossy = this.impairment.loss > 0 && (!this.impairment.lossFilter || this.impairment.lossFilter(bytes));
    if (lossy && this.random() < this.impairment.loss) {
      this.stats.lost++;
      return false;
    }
    const jitter = this.impairment.jitterMs > 0 ? (this.random() * 2 - 1) * this.impairment.jitterMs : 0;
    const dueMs = Math.max(this.lastDueMs, nowMs + Math.max(0, this.impairment.latencyMs + jitter));
    this.lastDueMs = dueMs;
    this.queue.push({ sentMs: nowMs, dueMs, bytes });
    this.bufferedBytes += bytes.byteLength;
    this.stats.queued++;
    return true;
  }

  /** A graceful close: the peer observes it after every frame sent before it (a FIN behind the data). */
  pushClose(nowMs: number, reason: TransportCloseReason, detail: string): void {
    const dueMs = Math.max(this.lastDueMs, nowMs + this.impairment.latencyMs);
    this.lastDueMs = dueMs;
    this.queue.push({ sentMs: nowMs, dueMs, bytes: null, close: { reason, detail } });
  }

  /** Frames due at `nowMs`, oldest first; a due close marker ends the drain through `onClose`. */
  drain(nowMs: number, deliver: (bytes: Uint8Array) => void, onClose: (reason: TransportCloseReason, detail: string) => void): number {
    let count = 0;
    while (this.queue.length && this.queue[0]!.dueMs <= nowMs) {
      const frame = this.queue.shift()!;
      if (!frame.bytes) {
        this.flush();
        onClose(frame.close!.reason, frame.close!.detail);
        break;
      }
      this.bufferedBytes -= frame.bytes.byteLength;
      this.stats.delivered++;
      this.stats.lastDelayMs = frame.dueMs - frame.sentMs;
      this.stats.maxDelayMs = Math.max(this.stats.maxDelayMs, this.stats.lastDelayMs);
      count++;
      deliver(frame.bytes);
    }
    return count;
  }

  /** Discard everything in flight (a dropped socket). */
  flush(): void {
    this.queue.length = 0;
    this.bufferedBytes = 0;
    this.lastDueMs = -Infinity;
  }

  get pending(): number { return this.queue.length; }
}

export class LoopbackTransport implements Transport {
  readonly kind = 'loopback';
  readonly role: LoopbackRole;
  readonly stats: TransportStats = createTransportStats();
  private readonly frameListeners = new Listeners<Uint8Array>();
  private readonly stateListeners = new Listeners<TransportStateChange>();
  private readonly gate: BackpressureGate;
  private currentState: TransportState = 'idle';
  private attempt = 0;
  private pair: LoopbackPairInternals | null = null;

  constructor(role: LoopbackRole, backpressure: BackpressurePolicy) {
    this.role = role;
    this.gate = new BackpressureGate(backpressure);
  }

  get state(): TransportState { return this.currentState; }

  get bufferedBytes(): number { return this.pair ? this.pair.linkFrom(this.role).unsentBytes : 0; }

  onFrame(listener: (frame: Uint8Array) => void): Unsubscribe { return this.frameListeners.add(listener); }

  onState(listener: (change: TransportStateChange) => void): Unsubscribe { return this.stateListeners.add(listener); }

  open(): void {
    if (!this.pair || (this.currentState !== 'idle' && this.currentState !== 'closed')) return;
    this.attempt = 0;
    if (this.role === 'server') {
      this.transition('open', { attempt: 0, resumed: false });
      return;
    }
    this.transition('connecting', { attempt: 0 });
    this.pair.scheduleConnect(this.pair.connectDelayMs);
  }

  send(frame: Uint8Array): boolean {
    if (!this.pair || this.currentState !== 'open') return false;
    const nowMs = this.pair.clock();
    const link = this.pair.linkFrom(this.role);
    if (!this.gate.admit(link.unsentBytes, frame.byteLength, nowMs)) {
      this.stats.framesDropped++;
      if (this.gate.exhausted(nowMs)) this.close(TRANSPORT_CLOSE.BACKPRESSURE, 'unsent bytes stayed above the ceiling');
      return false;
    }
    this.stats.framesSent++;
    this.stats.bytesSent += frame.byteLength;
    link.push(frame.slice(), nowMs);
    return true;
  }

  reconnect(reason: TransportCloseReason, detail = ''): void {
    if (!this.pair || this.currentState === 'closed' || this.currentState === 'idle') return;
    if (this.role === 'server') throw new TypeError('only the client endpoint reconnects');
    this.attempt++;
    this.stats.reconnects++;
    this.pair.dropConnection(reason, detail, this.attempt);
    this.pair.scheduleConnect(this.pair.reconnectDelayMs);
  }

  close(reason: TransportCloseReason = TRANSPORT_CLOSE.CLIENT, detail = ''): void {
    if (this.currentState === 'closed') return;
    const pair = this.pair;
    this.transition('closed', { reason, detail });
    this.frameListeners.clear();
    if (pair) pair.peerClosed(this.role, detail);
  }

  /** @internal pair wiring */
  attach(pair: LoopbackPairInternals): void { this.pair = pair; }

  /** @internal a frame arrived from the peer */
  deliver(bytes: Uint8Array, maxFrameBytes: number): void {
    if (this.currentState !== 'open') return;
    if (bytes.byteLength > maxFrameBytes) { this.stats.framesRejected++; return; }
    this.stats.framesReceived++;
    this.stats.bytesReceived += bytes.byteLength;
    this.frameListeners.emit(bytes);
  }

  /** @internal */
  transition(state: TransportState, change: Omit<TransportStateChange, 'state' | 'previous'>): void {
    const previous = this.currentState;
    if (previous === state && state !== 'reconnecting') return;
    this.currentState = state;
    if (state === 'open') { this.stats.opens++; this.gate.reset(); }
    this.stateListeners.emit({ state, previous, ...change });
  }

  /** @internal */
  get currentAttempt(): number { return this.attempt; }
}

interface LoopbackPairInternals {
  readonly clock: () => number;
  readonly connectDelayMs: number;
  readonly reconnectDelayMs: number;
  linkFrom(role: LoopbackRole): Link;
  scheduleConnect(delayMs: number): void;
  dropConnection(reason: TransportCloseReason, detail: string, attempt: number): void;
  peerClosed(role: LoopbackRole, detail: string): void;
}

export interface LoopbackPair {
  readonly client: LoopbackTransport;
  readonly server: LoopbackTransport;
  /** Deliver every frame and connection event due at `nowMs` (the pair's clock by default). Returns frames delivered. */
  pump(nowMs?: number): number;
  setImpairment(direction: 'clientToServer' | 'serverToClient', impairment: Partial<LinkImpairment>): void;
  readonly links: { readonly clientToServer: LinkStats; readonly serverToClient: LinkStats };
  /** Frames in flight in both directions. */
  readonly inFlight: number;
}

export function createLoopbackPair({
  clock = () => (typeof performance === 'object' ? performance.now() : Date.now()),
  clientToServer,
  serverToClient,
  random = seededRandom(0x6f0b),
  backpressure = {},
  connectDelayMs = 0,
  reconnectDelayMs = 250,
  maxFrameBytes = DEFAULT_MAX_FRAME_BYTES,
}: LoopbackPairOptions = {}): LoopbackPair {
  const policy = { ...DEFAULT_BACKPRESSURE, ...backpressure };
  const client = new LoopbackTransport('client', policy);
  const server = new LoopbackTransport('server', policy);
  const upLink = new Link(clientToServer, random);
  const downLink = new Link(serverToClient, random);
  let connectDueMs: number | null = null;

  const finishConnect = () => {
    connectDueMs = null;
    if (client.state !== 'connecting' && client.state !== 'reconnecting') return;
    if (server.state !== 'open' && server.state !== 'reconnecting') {
      // No server behind the endpoint: the client's attempt fails like a refused socket.
      client.transition('closed', { reason: TRANSPORT_CLOSE.NETWORK, detail: 'no server endpoint is open' });
      return;
    }
    const attempt = client.currentAttempt;
    const resumed = attempt > 0;
    client.transition('open', { attempt, resumed });
    if (resumed) server.transition('open', { attempt, resumed: true });
  };

  const internals: LoopbackPairInternals = {
    clock,
    connectDelayMs,
    reconnectDelayMs,
    linkFrom: (role) => (role === 'client' ? upLink : downLink),
    scheduleConnect(delayMs) {
      if (delayMs <= 0) { finishConnect(); return; }
      connectDueMs = clock() + delayMs;
    },
    dropConnection(reason, detail, attempt) {
      upLink.flush();
      downLink.flush();
      client.transition('reconnecting', { reason, detail, attempt });
      if (server.state === 'open') server.transition('reconnecting', { reason, detail, attempt });
    },
    peerClosed(role, detail) {
      connectDueMs = null;
      // The pair models one connection: either end closing closes the other's
      // socket, after the frames it sent before closing have been delivered.
      const peer = role === 'client' ? server : client;
      const toCloser = role === 'client' ? downLink : upLink;
      const toPeer = role === 'client' ? upLink : downLink;
      toCloser.flush();
      if (peer.state === 'closed' || peer.state === 'idle') { toPeer.flush(); return; }
      toPeer.pushClose(clock(), role === 'client' ? TRANSPORT_CLOSE.CLIENT : TRANSPORT_CLOSE.SERVER, detail);
    },
  };
  client.attach(internals);
  server.attach(internals);

  return {
    client,
    server,
    pump(nowMs = clock()) {
      if (connectDueMs !== null && nowMs >= connectDueMs) finishConnect();
      let delivered = 0;
      const closePeer = (peer: LoopbackTransport) => (reason: TransportCloseReason, detail: string) => {
        if (peer.state !== 'closed' && peer.state !== 'idle') peer.transition('closed', { reason, detail });
      };
      delivered += upLink.drain(nowMs, (bytes) => server.deliver(bytes, maxFrameBytes), closePeer(server));
      delivered += downLink.drain(nowMs, (bytes) => client.deliver(bytes, maxFrameBytes), closePeer(client));
      return delivered;
    },
    setImpairment(direction, impairment) {
      (direction === 'clientToServer' ? upLink : downLink).impairment = normalizeImpairment(impairment);
    },
    links: { clientToServer: upLink.stats, serverToClient: downLink.stats },
    get inFlight() { return upLink.pending + downLink.pending; },
  };
}
