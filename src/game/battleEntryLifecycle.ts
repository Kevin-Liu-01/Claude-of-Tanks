interface RevealReceipt {
  primed: true;
  frameSerial: number;
  waitMs: number;
  [key: string]: unknown;
}

interface BattleEntryLifecycleOptions {
  nextFrame: () => Promise<unknown>;
  now?: () => number;
  revealTimeoutMs?: number;
  getRevealContext?: () => Record<string, unknown>;
  onReveal?: (receipt: RevealReceipt) => void;
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
  now = () => performance.now(),
  revealTimeoutMs = 1500,
  getRevealContext = () => ({}),
  onReveal = () => {},
}: BattleEntryLifecycleOptions): BattleEntryLifecycle {
  if (typeof nextFrame !== 'function' || typeof now !== 'function'
    || typeof getRevealContext !== 'function' || typeof onReveal !== 'function') {
    throw new TypeError('battle entry lifecycle requires frame, clock, and receipt ports');
  }
  if (!Number.isFinite(revealTimeoutMs) || revealTimeoutMs <= 0) {
    throw new TypeError('battle entry reveal timeout must be positive and finite');
  }

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

    coverRendering() { renderingCovered = true; },
    uncoverRendering() { renderingCovered = false; },

    noteBattleFrame() { presentedBattleFrameSerial += 1; },

    async primeReveal() {
      const firstRequiredSerial = presentedBattleFrameSerial + 1;
      const startedAt = now();
      renderingCovered = false;
      while (presentedBattleFrameSerial < firstRequiredSerial) {
        if (now() - startedAt > revealTimeoutMs) {
          throw new Error('Battlefield did not present before the loading screen exit.');
        }
        await nextFrame();
      }
      const receipt: RevealReceipt = {
        primed: true,
        frameSerial: presentedBattleFrameSerial,
        waitMs: Math.round(now() - startedAt),
        ...getRevealContext(),
      };
      onReveal(receipt);
      return receipt;
    },

    get pending() { return pending; },
    get renderingCovered() { return renderingCovered; },
  };
}
