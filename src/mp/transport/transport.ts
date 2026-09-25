/**
 * Multiplayer v2 transport contract (charter §4). A transport moves opaque
 * binary frames between the match client and one server endpoint and reports
 * its state, its unsent bytes and its close reason; it knows nothing about the
 * wire schema. WebSocket is the production implementation; the loopback pair
 * is the deterministic in-process one the receipts and soaks drive. A
 * WebTransport or WebRTC-to-server implementation slots in behind the same
 * five calls without touching `src/mp/match`.
 *
 * Pure TypeScript: no DOM types are required at runtime, so the contract and
 * the loopback run unchanged in Node.
 */

export type Unsubscribe = () => void;

/** Lifecycle of one transport. `reconnecting` keeps the resume token and retries with backoff. */
export type TransportState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

/** Why a transport closed or is reconnecting (typed; free text goes in `detail`). */
export const TRANSPORT_CLOSE = Object.freeze({
  /** The local owner closed it (leave, dispose). Never reconnects. */
  CLIENT: 'client',
  /** The peer closed the connection deliberately (a wire CLOSE preceded it). Never reconnects. */
  SERVER: 'server',
  /** The link dropped without a deliberate close. Reconnects. */
  NETWORK: 'network',
  /** A connect attempt or the resume grace ran out of time. */
  TIMEOUT: 'timeout',
  /** Unsent bytes stayed above the ceiling for longer than the policy allows. */
  BACKPRESSURE: 'backpressure',
  /** The peer sent something the transport cannot carry (a text frame, an oversized frame). */
  PROTOCOL: 'protocol',
  /** Every reconnect attempt inside the window failed. */
  EXHAUSTED: 'exhausted',
  /** The owner asked for a fresh connection (authority stalled on an open socket). */
  STALLED: 'stalled',
} as const);
export type TransportCloseReason = typeof TRANSPORT_CLOSE[keyof typeof TRANSPORT_CLOSE];

/** Reasons after which a transport tries again on its own. */
export const RECONNECTABLE_CLOSE_REASONS: ReadonlySet<TransportCloseReason> = new Set<TransportCloseReason>([
  TRANSPORT_CLOSE.NETWORK, TRANSPORT_CLOSE.TIMEOUT, TRANSPORT_CLOSE.STALLED,
]);

export interface TransportStateChange {
  state: TransportState;
  previous: TransportState;
  /** Set on `reconnecting` and `closed`. */
  reason?: TransportCloseReason;
  detail?: string;
  /** 1-based attempt counter while reconnecting; the attempt that reached `open`. */
  attempt?: number;
  /** `open` after a successful reconnect (the owner must re-run its handshake). */
  resumed?: boolean;
  /** Raw close code from the underlying socket when there is one. */
  code?: number;
}

export interface TransportStats {
  framesSent: number;
  bytesSent: number;
  framesReceived: number;
  bytesReceived: number;
  /** Sends refused because the unsent-byte ceiling was reached. */
  framesDropped: number;
  /** Incoming frames refused (text frames, oversized frames). */
  framesRejected: number;
  /** Reconnect attempts started (successful or not). */
  reconnects: number;
  /** Times the transport reached `open`. */
  opens: number;
}

export function createTransportStats(): TransportStats {
  return {
    framesSent: 0, bytesSent: 0, framesReceived: 0, bytesReceived: 0,
    framesDropped: 0, framesRejected: 0, reconnects: 0, opens: 0,
  };
}

export interface Transport {
  readonly kind: string;
  readonly state: TransportState;
  /** Bytes accepted by `send` and not yet handed to the network (backpressure signal). */
  readonly bufferedBytes: number;
  readonly stats: Readonly<TransportStats>;
  /** Start connecting. Idempotent while connecting or open. */
  open(): void;
  /**
   * Queue one binary frame. Returns false when the transport is not open or
   * the frame would push `bufferedBytes` over the ceiling (the frame is
   * dropped and counted; the owner decides whether to resend).
   */
  send(frame: Uint8Array): boolean;
  /** Drop the current connection and reconnect with backoff, keeping the resume token. */
  reconnect(reason: TransportCloseReason, detail?: string): void;
  /** Close for good. `client` and `server` reasons never reconnect. */
  close(reason?: TransportCloseReason, detail?: string): void;
  onFrame(listener: (frame: Uint8Array) => void): Unsubscribe;
  onState(listener: (change: TransportStateChange) => void): Unsubscribe;
}

/** Backpressure policy shared by every implementation. */
export interface BackpressurePolicy {
  /** `send` refuses a frame that would leave more than this many bytes unsent. */
  maxBufferedBytes: number;
  /** Close with `backpressure` when sends have been refused continuously for this long. */
  sustainedMs: number;
}

export const DEFAULT_BACKPRESSURE: Readonly<BackpressurePolicy> = Object.freeze({
  // A client sends ≈ 3.4 KB/s of input and a few KB of chat; 64 KB unsent means
  // the link has been dead for many seconds, not that a burst is in flight.
  maxBufferedBytes: 64 * 1024,
  sustainedMs: 5_000,
});

/** Reconnect timing: 250 ms doubling to 8 s, ±jitterFraction, inside one window. */
export interface ReconnectPolicy {
  initialDelayMs: number;
  maxDelayMs: number;
  factor: number;
  /** Fraction of the delay randomized either way so a fleet of clients does not stampede. */
  jitterFraction: number;
  /** Give up (`exhausted`) once this much time has passed since the connection was lost. */
  windowMs: number;
  /** Fail one attempt that has not opened within this time. */
  attemptTimeoutMs: number;
}

export const DEFAULT_RECONNECT: Readonly<ReconnectPolicy> = Object.freeze({
  initialDelayMs: 250,
  maxDelayMs: 8_000,
  factor: 2,
  jitterFraction: 0.2,
  // The charter's reconnect grace: a seat survives 60 s of match time.
  windowMs: 60_000,
  attemptTimeoutMs: 8_000,
});

/** Delay before reconnect attempt `attempt` (1-based); `random` in [0, 1). */
export function reconnectDelayMs(policy: ReconnectPolicy, attempt: number, random = 0.5): number {
  const exponent = Math.max(0, attempt - 1);
  const nominal = Math.min(policy.maxDelayMs, policy.initialDelayMs * policy.factor ** exponent);
  const spread = nominal * policy.jitterFraction;
  return Math.max(0, Math.round(nominal + (random * 2 - 1) * spread));
}

/** Small typed emitter shared by the implementations (listeners may unsubscribe during emit). */
export class Listeners<T> {
  private readonly set = new Set<(value: T) => void>();

  add(listener: (value: T) => void): Unsubscribe {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function');
    this.set.add(listener);
    return () => { this.set.delete(listener); };
  }

  emit(value: T): void {
    if (this.set.size === 0) return;
    for (const listener of [...this.set]) listener(value);
  }

  clear(): void { this.set.clear(); }

  get size(): number { return this.set.size; }
}

/** Sustained-backpressure bookkeeping shared by the implementations. */
export class BackpressureGate {
  readonly policy: BackpressurePolicy;
  private refusedSinceMs: number | null = null;

  constructor(policy: BackpressurePolicy) {
    this.policy = policy;
  }

  /** True when the frame fits; records the first refusal time otherwise. */
  admit(bufferedBytes: number, frameBytes: number, nowMs: number): boolean {
    if (bufferedBytes + frameBytes <= this.policy.maxBufferedBytes) {
      this.refusedSinceMs = null;
      return true;
    }
    this.refusedSinceMs ??= nowMs;
    return false;
  }

  /** True once refusals have lasted longer than the policy allows. */
  exhausted(nowMs: number): boolean {
    return this.refusedSinceMs !== null && nowMs - this.refusedSinceMs >= this.policy.sustainedMs;
  }

  reset(): void { this.refusedSinceMs = null; }
}
