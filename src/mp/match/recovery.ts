/**
 * Connection recovery policy (v1 "Client smoothness" watchdog rules kept):
 * the match is `live` while accepted authority keeps arriving; 5 s without
 * it is `stalled` (the transport is asked for a fresh socket once); the
 * transport's own reconnects show as `reconnecting`; 60 s after the first
 * loss without recovery the match is `failed`; an explicit leave is `left`.
 * A pure state machine: the client owns the side effects.
 */
import type { TransportState } from '../transport/transport.ts';

export type ConnectionPhase =
  | 'idle' | 'connecting' | 'handshaking' | 'live' | 'stalled' | 'reconnecting' | 'failed' | 'left' | 'closed';

export interface RecoveryOptions {
  stallMs?: number;
  graceMs?: number;
}

export interface RecoveryInput {
  nowMs: number;
  transportState: TransportState;
  /** A WELCOME has been accepted on the current socket. */
  welcomed: boolean;
  /** Local time of the last accepted snapshot on the current socket (null before the first). */
  lastAuthorityAtMs: number | null;
  /** Local time the current socket opened (the stall clock starts here before the first snapshot). */
  openedAtMs: number | null;
  /**
   * The last local time this tab's own tasks were seen starved (a long task, or a loop yielding with scheduler.yield,
   * whose continuations run ahead of the data channel's message tasks): the stall clock restarts there. Null or absent:
   * never starved.
   */
  starvedAtMs?: number | null;
}

export interface RecoveryStep {
  phase: ConnectionPhase;
  changed: boolean;
  /** Ask the transport for a fresh socket (once per stall). */
  requestReconnect: boolean;
  /** The grace ran out: close the transport and end the match presentation. */
  fail: boolean;
  /** Milliseconds since the first loss of authority, 0 while live. */
  outageMs: number;
}

export class ConnectionRecovery {
  readonly stallMs: number;
  readonly graceMs: number;
  private phase: ConnectionPhase = 'idle';
  private lostAtMs: number | null = null;
  private reconnectRequested = false;
  private stalls = 0;
  private recoveries = 0;

  constructor({ stallMs = 5_000, graceMs = 60_000 }: RecoveryOptions = {}) {
    this.stallMs = stallMs;
    this.graceMs = graceMs;
  }

  get current(): ConnectionPhase { return this.phase; }
  get stallCount(): number { return this.stalls; }
  get recoveryCount(): number { return this.recoveries; }
  get outageStartedAtMs(): number | null { return this.lostAtMs; }

  /** The owner left or disposed: terminal. */
  end(phase: 'left' | 'closed' | 'failed'): void {
    this.phase = phase;
  }

  update(input: RecoveryInput): RecoveryStep {
    const previous = this.phase;
    let requestReconnect = false;
    let fail = false;
    if (previous === 'failed' || previous === 'left' || previous === 'closed') {
      return { phase: previous, changed: false, requestReconnect, fail, outageMs: this.outageMs(input.nowMs) };
    }
    let next: ConnectionPhase = previous;
    if (input.transportState === 'closed') {
      next = 'failed';
      fail = true;
    } else if (input.transportState === 'idle' || input.transportState === 'connecting') {
      next = 'connecting';
      if (previous === 'live' || previous === 'stalled') this.lostAtMs ??= input.nowMs;
    } else if (input.transportState === 'reconnecting') {
      next = 'reconnecting';
      this.lostAtMs ??= input.nowMs;
    } else {
      // WELCOME alone does not prove a stalled authority resumed: only an
      // accepted snapshot on this socket makes the match live again.
      // 2026-10-15 (the MP stream): a stall is authority missing while this tab could have read it. Every main rejoin of
      // the §7 side-by-side opened a second link 7 s in: its roster painting (6-7 s, yielding with scheduler.yield)
      // starved the channel's message tasks, the frames ran on, and 5 s without an accepted snapshot read as a dead host.
      const progressMs = Math.max(input.lastAuthorityAtMs ?? input.openedAtMs ?? input.nowMs, input.starvedAtMs ?? -Infinity);
      if (input.nowMs - progressMs >= this.stallMs) {
        next = 'stalled';
        if (this.lostAtMs === null) {
          this.lostAtMs = input.nowMs;
          this.stalls++;
        }
        if (!this.reconnectRequested) {
          this.reconnectRequested = true;
          requestReconnect = true;
        }
      } else if (!input.welcomed || input.lastAuthorityAtMs === null) {
        next = 'handshaking';
        if (previous === 'live' || previous === 'stalled' || previous === 'reconnecting') this.lostAtMs ??= input.nowMs;
      } else {
        next = 'live';
        if (this.lostAtMs !== null && previous !== 'live') this.recoveries++;
        this.lostAtMs = null;
        this.reconnectRequested = false;
      }
    }
    if (next !== 'failed' && this.lostAtMs !== null && input.nowMs - this.lostAtMs >= this.graceMs) {
      next = 'failed';
      fail = true;
    }
    this.phase = next;
    return { phase: next, changed: next !== previous, requestReconnect, fail, outageMs: this.outageMs(input.nowMs) };
  }

  private outageMs(nowMs: number): number {
    return this.lostAtMs === null ? 0 : Math.max(0, nowMs - this.lostAtMs);
  }
}
