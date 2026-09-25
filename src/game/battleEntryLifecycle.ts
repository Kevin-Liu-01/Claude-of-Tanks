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
  /** `extended`: the budget passed once and the wait continues for another budget; `stalled`: that passed too. */
  phase: 'extended' | 'stalled';
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
}

export interface BattleEntryLifecycle {
  run<T>(task: () => Promise<T>, busyValue: T): Promise<T>;
  coverRendering(): void;
  uncoverRendering(): void;
  noteBattleFrame(): void;
  primeReveal(): Promise<RevealReceipt>;
  readonly pending: boolean;
  readonly renderingCovered: boolean;
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
}: BattleEntryLifecycleOptions): BattleEntryLifecycle {
  if (typeof nextFrame !== 'function' || typeof wakeFrameLoop !== 'function' || typeof now !== 'function'
    || typeof getRevealContext !== 'function' || typeof onReveal !== 'function' || typeof onSlowReveal !== 'function') {
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

  return {
    async run<T>(task: () => Promise<T>, busyValue: T): Promise<T> {
      if (pending) return busyValue;
      if (typeof task !== 'function') throw new TypeError('battle entry task must be callable');
      pending = true;
      try {
        return await task();
      } finally {
        renderingCovered = false;
        pending = false;
      }
    },

    coverRendering() {
      if (renderingCovered) return;
      renderingCovered = true;
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
      let phase: SlowRevealReceipt['phase'] | null = null;
      while (presentedBattleFrameSerial < firstRequiredSerial) {
        const waitedMs = now() - startedAt;
        if (phase === null && waitedMs > budgetMs) {
          phase = 'extended';
          onSlowReveal({ budgetMs, waitedMs: Math.round(waitedMs), phase });
        } else if (phase === 'extended' && waitedMs > budgetMs * 2) {
          phase = 'stalled';
          onSlowReveal({ budgetMs, waitedMs: Math.round(waitedMs), phase });
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

    get pending() { return pending; },
    get renderingCovered() { return renderingCovered; },
  };
}
