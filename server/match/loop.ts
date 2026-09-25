/**
 * Drift-corrected fixed-step scheduler. Wall-clock time is used only to decide
 * how many ticks are due; the tick callback receives the tick index and the
 * fixed step length, never a clock reading. A stall longer than the catch-up
 * window drops the backlog (counted) instead of fast-forwarding the match.
 */
import { createHistogram, type Histogram } from './metrics.ts';

export interface FixedStepLoopOptions {
  tickMs?: number;
  /** Ticks run per wake-up at most; more than this is a stall and the backlog is dropped. */
  maxCatchUpTicks?: number;
  now?: () => number;
  /** Clock for measuring tick cost; stays the real clock when `now` is a fake one. */
  measure?: () => number;
  /** Timer seam for tests (defaults to setTimeout). Returns a cancel function. */
  schedule?: (callback: () => void, delayMs: number) => () => void;
  onTick: (tick: number, dtS: number) => void;
  onError?: (error: unknown) => void;
}

export interface FixedStepLoop {
  readonly tick: number;
  readonly running: boolean;
  readonly tickMs: number;
  readonly tickCost: Histogram;
  readonly stats: { droppedTicks: number; stalls: number; wakeups: number; lateWakeupMaxMs: number };
  start(): void;
  stop(): void;
  /** Run every tick due at `nowMs` (manual driving for tests). Returns the ticks run. */
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
  onTick,
  onError,
}: FixedStepLoopOptions): FixedStepLoop {
  if (!(tickMs > 0) || !Number.isFinite(tickMs)) throw new TypeError('tickMs must be positive');
  if (!Number.isInteger(maxCatchUpTicks) || maxCatchUpTicks < 1 || maxCatchUpTicks > 60) {
    throw new TypeError('maxCatchUpTicks must be 1..60');
  }
  const dtS = tickMs / 1000;
  const tickCost = createHistogram(2048);
  const stats = { droppedTicks: 0, stalls: 0, wakeups: 0, lateWakeupMaxMs: 0 };
  let tick = 0;
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
    if (due > maxCatchUpTicks) {
      // a stall: keep the phase, drop the backlog beyond the window
      stats.stalls++;
      stats.droppedTicks += due - maxCatchUpTicks;
      originMs += (due - maxCatchUpTicks) * tickMs;
      due = maxCatchUpTicks;
    }
    let ran = 0;
    while (ran < due && running) {
      runTick();
      ran++;
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

  return {
    get tick() { return tick; },
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
