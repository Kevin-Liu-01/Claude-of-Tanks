/**
 * Cooperative scheduling primitives for boot, loading, and visible idle work.
 *
 * Visible work yields on a real animation frame so the browser can present
 * progress. Work hidden by an opaque loader usually yields only the current
 * task, but still guarantees a painted frame at a bounded cadence.
 */

export type WorkYielder = (force?: boolean) => Promise<void>;
type Clock = () => number;
type AsyncYield = () => Promise<void>;

export interface FrameSchedulerOptions {
  now?: Clock;
  yieldFrame?: AsyncYield;
  yieldTask?: AsyncYield;
}

const defaultNow: Clock = () => performance.now();

function defaultTaskYield(): Promise<void> {
  const host = globalThis as typeof globalThis & {
    scheduler?: { yield?: () => Promise<void> };
  };
  if (typeof host.scheduler?.yield === 'function') return host.scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Resolve after a presentable frame, with a bounded fallback for hidden or
 * embedded documents where requestAnimationFrame may never fire.
 */
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(finish);
    setTimeout(finish, 34);
  });
}

/** Yield visible work whenever it exhausts its current frame budget. */
export function createFrameBudgetYielder(
  budgetMs = 12,
  options: FrameSchedulerOptions = {},
): WorkYielder {
  const now = options.now ?? defaultNow;
  const yieldFrame = options.yieldFrame ?? nextFrame;
  let sliceStart = now();
  return async (force = false) => {
    if (!force && now() - sliceStart < budgetMs) return;
    await yieldFrame();
    sliceStart = now();
  };
}

/**
 * Yield work hidden by an opaque loader without paying for a full animation
 * frame at every checkpoint. A real paint is still guaranteed periodically.
 */
export function createOpaqueLoadingYielder(
  budgetMs = 12,
  paintEveryMs = 80,
  options: FrameSchedulerOptions = {},
): WorkYielder {
  const now = options.now ?? defaultNow;
  const yieldFrame = options.yieldFrame ?? nextFrame;
  const yieldTask = options.yieldTask ?? defaultTaskYield;
  let sliceStart = now();
  let lastPaint = sliceStart;

  return async (force = false) => {
    const checkpoint = now();
    if (!force && checkpoint - sliceStart < budgetMs) return;
    if (checkpoint - lastPaint >= paintEveryMs) {
      await yieldFrame();
      lastPaint = now();
    } else {
      await yieldTask();
    }
    sliceStart = now();
  };
}
