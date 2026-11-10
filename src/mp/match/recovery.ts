/**
 * Connection recovery policy (v1 "Client smoothness" watchdog rules kept):
 * the match is `live` while accepted authority keeps arriving; 5 s without
 * it is `stalled` (the transport is asked for a fresh socket once; before
 * a WELCOME, 5 s past holdAllowanceMs: from the host's notice, the hold it
 * announced plus a 3 s release margin, those two at most 33 s, or 33 s on a
 * newly elected host's link before any notice); the transport's own
 * reconnects show as `reconnecting`; 60 s after the first loss without
 * recovery the match is `failed`; an explicit leave is `left`.
 * A pure state machine: the client owns the side effects.
 */
import type { TransportState } from '../transport/transport.ts';

/**
 * The resume hold (2026-10-10; src/mp/host/matchHostCore.ts): a migrated host keeps its world still, and the HELLOs of
 * the seats it awaits unanswered, for at most this long after its boot. Both clocks read it here (audit M1,
 * 2026-11-02): the host's hold, and a seat's stall clock on a link to a newly elected host, which allows it before the
 * WELCOME (RecoveryInput.holdAllowanceMs). Before, one missing seat held the world for the whole 3 s after a 3.4-4.3 s
 * unprepared boot while every returning seat's 5 s stall clock ran from the election, so each could ask for a fresh
 * link during the hold and renegotiate while the world was still held.
 */
export const RESUME_HOLD_MS = 3_000;

/**
 * The longest an elected host's boot may run before it fails itself (matchHost.ts: its boot timeout's default) and
 * declines, so the room elects another seat (round 2 Q1).
 */
export const ELECTED_HOST_BOOT_MS = 30_000;

/**
 * How much longer than its stall clock a seat waits for the WELCOME on a link to a host the room just elected (round 2
 * Q1; RecoveryInput.holdAllowanceMs), until that host says how long it holds the seat's HELLO: the host's whole boot bound
 * and its resume hold. The link opens about the election, before the boot (peers re-offer the moment they hear it), and
 * the host answers no HELLO until its boot is done and its hold is over. A fixed RESUME_HOLD_MS held only while the boot
 * fit in the stall clock (5 s + 3 s against a 3.4-4.3 s unprepared boot plus up to 3 s of hold): a slower device's boot
 * pushed every held seat into a fresh link during the hold. Round 3 (B1/X6): a host that holds a HELLO says so at once
 * (wire HOLD: its runtime through the boot, matchHost.ts bootHoldNotice, and its core again in the hold, matchHostCore.ts
 * noticeHeld, with what is left), and the seat's allowance runs to what it announced (MatchClient receiveHold), on any
 * link (a kept host's, at the same generation, too); this bound only covers the time before that word, and caps it. A
 * host that died meanwhile is the room's to replace (its socket lease, its reports, the boot timeout's decline): the seat
 * follows the next election on a fresh link and clock.
 */
export const MIGRATION_WELCOME_ALLOWANCE_MS = ELECTED_HOST_BOOT_MS + RESUME_HOLD_MS;

/**
 * What a seat allows past the end of the hold its host announced (wire HOLD, MatchClient receiveHold), before its stall
 * clock runs (round 3 B1, review r1). The WELCOME that ends a hold leaves the host's Worker through the host's main thread
 * (matchHost.ts link_send to the peer's channel), and a long task there holds it back: a kept host loading its battle world
 * on a slow device, the case the 33 s bound was raised for (round 2 Q1). The stall clock alone left 5 s for it; this adds
 * a resume hold's length, within the MIGRATION_WELCOME_ALLOWANCE_MS cap. A host that overruns it is left 8 s after the end
 * it announced, not 33 s after the link opened.
 */
export const HOLD_RELEASE_MARGIN_MS = RESUME_HOLD_MS;

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
  /** Local time the current socket opened (the stall clock starts here before the WELCOME). */
  openedAtMs: number | null;
  /** Local time the WELCOME was accepted on the current socket (the stall clock starts here before the first snapshot). */
  welcomedAtMs?: number | null;
  /**
   * How much longer than `stallMs` the current socket may wait for its WELCOME, from its open: what its host announced it
   * holds the seat's HELLO for (wire HOLD, round 3 B1/X6: the time to the notice plus its holdMs and HOLD_RELEASE_MARGIN_MS,
   * those two at most MIGRATION_WELCOME_ALLOWANCE_MS), else MIGRATION_WELCOME_ALLOWANCE_MS on a link to a host the room
   * just elected (its boot and its resume hold may keep this seat's HELLO unanswered that long), 0 otherwise.
   */
  holdAllowanceMs?: number;
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
      // The clock's origin is the newest of: the last accepted snapshot, the WELCOME (a held seat is welcomed when the hold
      // ends), and the socket's open, plus the hold a newly elected host may keep it for (audit M1).
      const handshakeFromMs = input.openedAtMs === null ? input.nowMs : input.openedAtMs + Math.max(0, input.holdAllowanceMs ?? 0);
      const progressMs = Math.max(input.lastAuthorityAtMs ?? input.welcomedAtMs ?? handshakeFromMs, input.starvedAtMs ?? -Infinity);
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

/**
 * (2026-11-02 audit S3) The match connection's phases as a runtime list: the multiplayer harnesses import it
 * (tools/mp-states.mjs) instead of spelling the words; tools/mp-states.selftest.mjs pins it to ConnectionPhase.
 */
export const CONNECTION_PHASES = Object.freeze(['idle', 'connecting', 'handshaking', 'live', 'stalled', 'reconnecting', 'failed',
  'left', 'closed'] as const satisfies readonly ConnectionPhase[]);
