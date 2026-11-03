import type { RuntimeValue } from '../runtimeTypes.ts';
interface RevealReceipt {
  primed: true;
  frameSerial: number;
  waitMs: number;
  [key: string]: RuntimeValue;
}

/** Vehicles the default reveal budget was tuned for (the 7 v 7 field). */
const REVEAL_BUDGET_FIELD = 14;
/** Reveal budget the default field gets. */
const REVEAL_BUDGET_BASE_MS = 1500;
/** Extra reveal budget per vehicle past the default field (sides 2026-09-18: a 14 v 14 first frame outran 1.5 s). */
const REVEAL_BUDGET_PER_VEHICLE_MS = 120;

/**
 * The first battle frame compiles every new vehicle's programs and primes its shadows, so the time the
 * loading screen waits for it grows with the field: 1.5 s for 7 v 7, +120 ms per further vehicle
 * (14 v 14 → 3.18 s, a 42-vehicle field → 4.86 s).
 */
export function revealTimeoutForField(vehicles: number, base = REVEAL_BUDGET_BASE_MS): number {
  const count = Number.isFinite(vehicles) ? Math.max(0, Math.floor(vehicles)) : REVEAL_BUDGET_FIELD;
  return base + Math.max(0, count - REVEAL_BUDGET_FIELD) * REVEAL_BUDGET_PER_VEHICLE_MS;
}

/** Entry resilience (2026-09-25): a reveal that outran its budget, reported once per phase. */
interface SlowRevealReceipt {
  budgetMs: number;
  waitedMs: number;
  /**
   * `extended`: the budget passed once and the wait continues for another budget; `stalled`: that passed too;
   * `abandoned`: REVEAL_ABANDON_BUDGETS budgets of presentable time passed with no battle frame, or the battle left
   * the screen, and the reveal failed its entry (2026-11-02 audit F2).
   */
  phase: 'extended' | 'stalled' | 'abandoned';
}

/**
 * Budgets of presentable time (a visible document with a live graphics context) a reveal waits for its first battle
 * frame before it fails the entry into the Garage recovery. A frame owner that stopped presenting battle frames
 * used to hold the entry latch forever, so every later entry was refused as busy.
 */
export const REVEAL_ABANDON_BUDGETS = 10;

/** A reveal that can never complete: no battle frame within its ceiling, or its battle left the screen. */
export class BattleRevealAbandonedError extends Error {
  readonly code = 'battle_reveal_abandoned';
  readonly waitedMs: number;
  constructor(message: string, waitedMs: number) {
    super(message);
    this.name = 'BattleRevealAbandonedError';
    this.waitedMs = waitedMs;
  }
}

interface BattleEntryLifecycleOptions {
  nextFrame: () => Promise<RuntimeValue>;
  wakeFrameLoop?: () => void;
  now?: () => number;
  /** Milliseconds the reveal may wait for the first battle frame, or a port read at every reveal (the field size). */
  revealTimeoutMs?: number | (() => number);
  getRevealContext?: () => Record<string, RuntimeValue>;
  onReveal?: (receipt: RevealReceipt) => void;
  onSlowReveal?: (receipt: SlowRevealReceipt) => void;
  /** Accepted entry, before its task runs (the composition's per-entry invalidations: the scene watchdog's arm). */
  onEntry?: () => void;
  /** The battle a reveal waits for still owns the screen (false: it can never present a battle frame). */
  canReveal?: () => boolean;
  /** Time counts toward the reveal's abandon ceiling only while frames can present (visible, context live). */
  isPresentable?: () => boolean;
}

export interface BattleEntryLifecycle {
  run<T>(task: () => Promise<T>, busyValue: T): Promise<T>;
  coverRendering(): void;
  uncoverRendering(): void;
  noteBattleFrame(): void;
  primeReveal(): Promise<RevealReceipt>;
  /** Resolves when no entry is pending (now, or when the pending one settles). */
  whenSettled(): Promise<void>;
  /** Resolves when an entry's cover owns rendering (now, or at the next cover). */
  whenCovered(): Promise<void>;
  readonly pending: boolean;
  readonly renderingCovered: boolean;
  /** Accepted entries so far: the identity of "the entry", which nothing else (spectating, watchdogs) advances. */
  readonly entrySerial: number;
}

/**
 * Own the browser battle-entry critical section and its covered-frame barrier.
 * Every entry mode shares this state so a rematch, ranked handoff, and solo
 * transition cannot overlap or leave the render loop permanently covered.
 */
export function createBattleEntryLifecycle({
  nextFrame,
  wakeFrameLoop = () => {},
  now = () => performance.now(),
  revealTimeoutMs = 1500,
  getRevealContext = () => ({}),
  onReveal = () => {},
  onSlowReveal = () => {},
  onEntry = () => {},
  canReveal = () => true,
  isPresentable = () => true,
}: BattleEntryLifecycleOptions): BattleEntryLifecycle {
  if (typeof nextFrame !== 'function' || typeof wakeFrameLoop !== 'function' || typeof now !== 'function'
    || typeof getRevealContext !== 'function' || typeof onReveal !== 'function' || typeof onSlowReveal !== 'function'
    || typeof onEntry !== 'function' || typeof canReveal !== 'function' || typeof isPresentable !== 'function') {
    throw new TypeError('battle entry lifecycle requires frame, clock, and receipt ports');
  }
  const checkedTimeout = (value: RuntimeValue): number => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new TypeError('battle entry reveal timeout must be positive and finite');
    }
    return value;
  };
  if (typeof revealTimeoutMs !== 'function') checkedTimeout(revealTimeoutMs);
  const revealBudgetMs = (): number => checkedTimeout(typeof revealTimeoutMs === 'function' ? revealTimeoutMs() : revealTimeoutMs);

  let pending = false;
  let renderingCovered = false;
  let presentedBattleFrameSerial = 0;
  let entrySerial = 0;
  // Edge waiters (2026-11-02 audit F3: Battle Again waited on these by polling every 150 ms and 16 ms)
  const settledWaiters: Array<() => void> = [];
  const coveredWaiters: Array<() => void> = [];
  const release = (waiters: Array<() => void>): void => {
    for (const resolve of waiters.splice(0)) resolve();
  };

  return {
    async run<T>(task: () => Promise<T>, busyValue: T): Promise<T> {
      if (pending) return busyValue;
      if (typeof task !== 'function') throw new TypeError('battle entry task must be callable');
      pending = true;
      entrySerial += 1;
      try {
        onEntry();
        return await task();
      } finally {
        renderingCovered = false;
        pending = false;
        release(settledWaiters);
      }
    },

    coverRendering() {
      if (renderingCovered) return;
      renderingCovered = true;
      release(coveredWaiters);
      // Remote entry has no input event to cancel a settled Garage's idle
      // timer. Wake its existing frame owner only after the cover is owned.
      wakeFrameLoop();
    },
    uncoverRendering() { renderingCovered = false; },

    noteBattleFrame() { presentedBattleFrameSerial += 1; },

    async primeReveal() {
      const firstRequiredSerial = presentedBattleFrameSerial + 1;
      const startedAt = now();
      const budgetMs = revealBudgetMs();
      renderingCovered = false;
      // Entry resilience (2026-09-25): the budget is a wall-clock guess about
      // the player's GPU. Missing it used to throw and, on the network path,
      // fail the join while the peer kept waiting. Now the first miss extends
      // the wait by one more budget and reports it; a second miss reports a
      // stall; the reveal then continues with the frame that does arrive.
      // A truly black scene is still refused by the black-frame verdict.
      // (2026-11-02 audit F2) The wait has an exit: it fails the entry into its recovery when its battle left the
      // screen, or after REVEAL_ABANDON_BUDGETS budgets of presentable time with no battle frame. A hidden tab or a
      // lost context pauses that ceiling (the frames return with the page), never the beacons above.
      let phase: SlowRevealReceipt['phase'] | null = null;
      let presentableMs = 0;
      let sampledAt = startedAt;
      while (presentedBattleFrameSerial < firstRequiredSerial) {
        const at = now();
        const waitedMs = at - startedAt;
        if (isPresentable()) presentableMs += Math.max(0, at - sampledAt);
        sampledAt = at;
        if (phase === null && waitedMs > budgetMs) {
          phase = 'extended';
          onSlowReveal({ budgetMs, waitedMs: Math.round(waitedMs), phase });
        } else if (phase === 'extended' && waitedMs > budgetMs * 2) {
          phase = 'stalled';
          onSlowReveal({ budgetMs, waitedMs: Math.round(waitedMs), phase });
        }
        const left = !canReveal();
        if (left || presentableMs > budgetMs * REVEAL_ABANDON_BUDGETS) {
          onSlowReveal({ budgetMs, waitedMs: Math.round(waitedMs), phase: 'abandoned' });
          throw new BattleRevealAbandonedError(left
            ? 'The battle left the screen before its first frame.'
            : 'The battle did not present its first frame. Please try again.', Math.round(waitedMs));
        }
        await nextFrame();
      }
      const receipt: RevealReceipt = {
        primed: true,
        frameSerial: presentedBattleFrameSerial,
        waitMs: Math.round(now() - startedAt),
        budgetMs,
        ...(phase ? { slow: phase } : {}),
        ...getRevealContext(),
      };
      onReveal(receipt);
      return receipt;
    },

    whenSettled() {
      if (!pending) return Promise.resolve();
      return new Promise<void>((resolve) => { settledWaiters.push(resolve); });
    },
    whenCovered() {
      if (renderingCovered) return Promise.resolve();
      return new Promise<void>((resolve) => { coveredWaiters.push(resolve); });
    },

    get pending() { return pending; },
    get renderingCovered() { return renderingCovered; },
    get entrySerial() { return entrySerial; },
  };
}
