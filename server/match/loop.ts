/**
 * Drift-corrected fixed-step scheduler. Wall-clock time is used only to decide
 * how many ticks are due; the tick callback receives the tick index and the
 * fixed step length, never a clock reading. A stall longer than the catch-up
 * window drops the backlog (counted) instead of fast-forwarding the match.
 *
 * The tick stays on the wall's grid (267): after the catch-up window runs, the
 * dropped ticks are skipped, never simulated, so tick k is always due at
 * origin + k * tickMs. Every peer reads server time as tick * tickMs (the
 * actor's stamps, the clients' clocks, a migrated host's resume tick); a loop
 * that kept its ticks contiguous through a drop fell behind that time by the
 * drop, and the clients' controls ran up to seconds past the server's input
 * ring until their clocks slewed back. A client that stalls skips ahead the
 * same way (src/mp/match/inputStream.ts dueTicks).
 */
import { createHistogram, type Histogram } from './metrics.ts';

interface FixedStepLoopOptions {
  tickMs?: number;
  /** Ticks run per wake-up at most; more than this is a stall and the backlog is dropped. */
  maxCatchUpTicks?: number;
  now?: () => number;
  /** Clock for measuring tick cost; stays the real clock when `now` is a fake one. */
  measure?: () => number;
  /** Timer seam for tests (defaults to setTimeout). Returns a cancel function. */
  schedule?: (callback: () => void, delayMs: number) => () => void;
  /** The tick the loop resumes from (a migrated match continues the old host's tick timeline); 0 for a fresh match. */
  startTick?: number;
  onTick: (tick: number, dtS: number) => void;
  onError?: (error: unknown) => void;
}

export interface FixedStepLoop {
  readonly tick: number;
  /**
   * The timeline's time now, ms since tick 0 (tick * tickMs when stopped). Between wake-ups, and after a stall before the
   * loop has run, it is ahead of the last tick run: what the server answers when it reads its sockets first.
   */
  readonly timeMs: number;
  /** The tick due now on the timeline (the last tick run when stopped). */
  readonly dueTick: number;
  readonly running: boolean;
  readonly tickMs: number;
  readonly tickCost: Histogram;
  readonly stats: { droppedTicks: number; stalls: number; wakeups: number; lateWakeupMaxMs: number };
  start(): void;
  stop(): void;
  /** Run every tick due at `nowMs` (manual driving for tests). Returns the ticks run (a stall's skipped ticks are not). */
  advance(nowMs?: number): number;
}

export function createFixedStepLoop({
  tickMs = 1000 / 60,
  maxCatchUpTicks = 6,
  now = () => performance.now(),
  measure = () => performance.now(),
  schedule = (callback, delayMs) => {
    const timer = setTimeout(callback, delayMs);
    return () => clearTimeout(timer);
  },
  startTick = 0,
  onTick,
  onError,
}: FixedStepLoopOptions): FixedStepLoop {
  if (!(tickMs > 0) || !Number.isFinite(tickMs)) throw new TypeError('tickMs must be positive');
  if (!Number.isInteger(startTick) || startTick < 0) throw new TypeError('startTick must be a non-negative integer');
  if (!Number.isInteger(maxCatchUpTicks) || maxCatchUpTicks < 1 || maxCatchUpTicks > 60) {
    throw new TypeError('maxCatchUpTicks must be 1..60');
  }
  const dtS = tickMs / 1000;
  const tickCost = createHistogram(2048);
  const stats = { droppedTicks: 0, stalls: 0, wakeups: 0, lateWakeupMaxMs: 0 };
  let tick = startTick;
  let running = false;
  let originMs = 0;
  let cancel: (() => void) | null = null;

  function runTick(): void {
    const started = measure();
    try {
      onTick(tick + 1, dtS);
    } catch (error) {
      if (onError) onError(error);
      else throw error;
    }
    tick++;
    tickCost.push(measure() - started);
  }

  function advance(nowMs = now()): number {
    if (!running) return 0;
    // ticks whose scheduled time has passed (the epsilon keeps a wake-up exactly on
    // its target from rounding to "not yet due" and re-arming at the same instant)
    let due = Math.floor((nowMs - originMs) / tickMs + 1e-6) - tick;
    if (due <= 0) return 0;
    let skipped = 0;
    if (due > maxCatchUpTicks) {
      // a stall: the window runs on the inputs held so far, then the timeline skips the rest of the backlog
      stats.stalls++;
      skipped = due - maxCatchUpTicks;
      due = maxCatchUpTicks;
    }
    let ran = 0;
    while (ran < due && running) {
      runTick();
      ran++;
    }
    if (skipped && running) {
      stats.droppedTicks += skipped;
      tick += skipped;
    }
    return ran;
  }

  function arm(): void {
    if (!running) return;
    const target = originMs + (tick + 1) * tickMs;
    const delay = Math.max(0, target - now());
    cancel = schedule(() => {
      cancel = null;
      if (!running) return;
      const wake = now();
      stats.wakeups++;
      const late = wake - target;
      if (late > stats.lateWakeupMaxMs) stats.lateWakeupMaxMs = late;
      advance(wake);
      arm();
    }, delay);
  }

  const timeNow = (): number => (running ? Math.max(tick * tickMs, now() - originMs) : tick * tickMs);
  return {
    get tick() { return tick; },
    get timeMs() { return timeNow(); },
    get dueTick() { return Math.max(tick, Math.floor(timeNow() / tickMs + 1e-6)); },
    get running() { return running; },
    tickMs,
    tickCost,
    stats,
    start() {
      if (running) return;
      running = true;
      originMs = now() - tick * tickMs;
      arm();
    },
    stop() {
      running = false;
      if (cancel) cancel();
      cancel = null;
    },
    advance,
  };
}
