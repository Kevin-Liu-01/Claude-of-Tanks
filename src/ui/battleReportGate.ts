/**
 * battleReportGate.ts — when the end-of-battle report may render (2026-11-02 audit F4). DOM-free, Node-runnable.
 *
 * state.ts emits battle:ended in the very sim step the verdict lands, but the result presentation decides the verdict's
 * close afterwards (a final-kill replay, a camera beat, or the report at once): rendering the report synchronously
 * buried the still-playing replay under the full-screen panel (r6 critical). The report's stats accumulate on
 * battle:ended; its rendering waits here.
 *
 *   idle      nothing buffered
 *   deciding  a report is buffered and the screen is free: render after one animation frame and a macrotask (the frame
 *             that arms the verdict's close runs first), or after DECIDE_FALLBACK_MS when frames are throttled
 *   held      a presentation (a replay, an ending beat) or the Settings menu owns the screen: wait for it to end, then
 *             decide again, so a verdict whose close is armed only after a mid-battle replay or after the menu closes
 *             (the result presentation is not updated while either runs) still takes the screen before the report
 *
 * battle:presented (the result presentation's report hand-off, after the end overlay exists) renders a held report at
 * once. A watchdog of MAX_WAIT_MS from the latest presentation hold guarantees a stuck presentation never eats the
 * report. The menu's hold has no watchdog: the player holds it, the result presentation does not advance under it, and
 * a report rendered under the menu would have the verdict's replay or camera beat armed over it once the menu closes
 * (U22, round 2); its close decides again. Every scheduled callback carries the gate's generation, and clear() cancels
 * them, so a stale decision from one battle can never decide the next battle's report.
 */

export type ReportGateState = 'idle' | 'deciding' | 'held';
/** What holds the report: a presentation (a replay, an ending beat) or the Settings menu. */
export type ReportHold = 'presentation' | 'menu';

type TimerHandle = ReturnType<typeof setTimeout>;

interface ReportGateTimers {
  nextFrame(callback: () => void): number;
  cancelFrame(handle: number): void;
  setTimer(callback: () => void, ms: number): TimerHandle;
  clearTimer(handle: TimerHandle): void;
}

interface ReportGateOptions<R> {
  /** What owns the screen now, or null when the report may render (the battle input owner, battleInputOwner.ts). */
  holdReason(): ReportHold | null;
  render(result: R): void;
  timers?: ReportGateTimers;
  decideFallbackMs?: number;
  maxWaitMs?: number;
}

export interface BattleReportGate<R> {
  readonly state: ReportGateState;
  /** The hold while held, else null. */
  readonly hold: ReportHold | null;
  readonly pending: R | null;
  /** battle:ended: buffer the report and decide. */
  ended(result: R): void;
  /** The input owner changed: a hold begins, or one ended and the gate decides again. */
  ownerChanged(): void;
  /** battle:presented: the verdict's close is over and the end overlay exists. */
  presented(): void;
  /** hideStats / reset: drop the buffered report and every scheduled decision. */
  clear(): void;
}

export const REPORT_DECIDE_FALLBACK_MS = 600;
export const REPORT_MAX_WAIT_MS = 16000;

const defaultTimers = (): ReportGateTimers => ({
  nextFrame: (callback) => (typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame(callback)
    : Number(setTimeout(callback, 16))),
  cancelFrame: (handle) => {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle);
    else clearTimeout(handle);
  },
  setTimer: (callback, ms) => setTimeout(callback, ms),
  clearTimer: (handle) => clearTimeout(handle),
});

export function createBattleReportGate<R>({
  holdReason,
  render,
  timers = defaultTimers(),
  decideFallbackMs = REPORT_DECIDE_FALLBACK_MS,
  maxWaitMs = REPORT_MAX_WAIT_MS,
}: ReportGateOptions<R>): BattleReportGate<R> {
  let state: ReportGateState = 'idle';
  let heldFor: ReportHold | null = null;
  let pending: { result: R } | null = null;
  let generation = 0;
  let frame: number | null = null;
  let macrotask: TimerHandle | null = null;
  let fallback: TimerHandle | null = null;
  let watchdog: TimerHandle | null = null;

  const cancelDecision = (): void => {
    if (frame !== null) { timers.cancelFrame(frame); frame = null; }
    if (macrotask !== null) { timers.clearTimer(macrotask); macrotask = null; }
    if (fallback !== null) { timers.clearTimer(fallback); fallback = null; }
  };
  const cancelAll = (): void => {
    cancelDecision();
    if (watchdog !== null) { timers.clearTimer(watchdog); watchdog = null; }
  };

  const flush = (): void => {
    if (!pending) return;
    const { result } = pending;
    pending = null;
    state = 'idle';
    heldFor = null;
    generation++;
    cancelAll();
    render(result);
  };

  const armWatchdog = (): void => {
    if (watchdog !== null) timers.clearTimer(watchdog);
    const mine = generation;
    watchdog = timers.setTimer(() => {
      watchdog = null;
      if (mine === generation) flush();
    }, maxWaitMs);
  };

  const disarmWatchdog = (): void => {
    if (watchdog !== null) { timers.clearTimer(watchdog); watchdog = null; }
  };

  // a presentation hold runs on the watchdog (re-armed for each one); the menu's hold waits for its close
  const hold = (reason: ReportHold): void => {
    if (state === 'held' && heldFor === reason) return;
    cancelDecision();
    state = 'held';
    heldFor = reason;
    if (reason === 'presentation') armWatchdog();
    else disarmWatchdog();
  };

  const decide = (): void => {
    if (!pending || state !== 'deciding') return;
    cancelDecision();
    const reason = holdReason();
    if (reason) hold(reason);
    else flush();
  };

  const openDecision = (): void => {
    state = 'deciding';
    heldFor = null;
    cancelDecision();
    // the deciding window is bounded by its own fallback; a watchdog the menu disarmed comes back for it
    if (watchdog === null) armWatchdog();
    const mine = generation;
    // one full frame first (the main loop's end flow, which arms the verdict's close, runs inside the next animation
    // frame), then a macrotask so the decision runs after that frame's synchronous work completes
    frame = timers.nextFrame(() => {
      frame = null;
      if (mine !== generation) return;
      macrotask = timers.setTimer(() => {
        macrotask = null;
        if (mine === generation) decide();
      }, 0);
    });
    // rAF-throttled fallback (hidden tab): decide anyway — a throttled tab renders no replay frames either
    fallback = timers.setTimer(() => {
      fallback = null;
      if (mine === generation) decide();
    }, decideFallbackMs);
  };

  return {
    get state() { return state; },
    get hold() { return heldFor; },
    get pending() { return pending ? pending.result : null; },
    ended(result) {
      generation++;
      cancelAll();
      pending = { result };
      const reason = holdReason();
      if (reason) { state = 'deciding'; hold(reason); return; }
      openDecision();
    },
    ownerChanged() {
      if (!pending) return;
      const reason = holdReason();
      if (reason) {
        if (state === 'deciding' || (state === 'held' && heldFor !== reason)) hold(reason);
      } else if (state === 'held') {
        openDecision();
      }
    },
    presented() {
      // a held report renders now; a deciding one renders at its decision (after the frame that presented it)
      if (pending && state === 'held') flush();
    },
    clear() {
      generation++;
      cancelAll();
      pending = null;
      state = 'idle';
      heldFor = null;
    },
  };
}
