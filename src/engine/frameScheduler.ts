/**
 * Cooperative scheduling primitives for boot, loading, and visible idle work.
 *
 * Visible work yields to animation callbacks; paint-sensitive callers also
 * leave the pre-paint microtask checkpoint. Opaque-loading work mixes task and
 * paint-sensitive frame yields. Neither acknowledges an actually displayed frame.
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

/** Milliseconds a visible document may take to deliver one animation callback before the wait is reported. */
export const PAINT_WAIT_BUDGET_MS = 1000;

/** Entry resilience (2026-09-25): a visible paint wait that outran its budget, reported once per phase. */
export interface PaintStallEvent {
  /** `extended`: the budget passed once and the wait continues for another budget; `continued`: that passed too and loading goes on without the frame. */
  phase: 'extended' | 'continued';
  waitedMs: number;
}
type PaintStallListener = (event: PaintStallEvent) => void;
const paintStallListeners = new Set<PaintStallListener>();

/** Observe visible paint waits that outrun their budget (the entry beacon subscribes once). */
export function onPaintStall(listener: PaintStallListener): () => void {
  paintStallListeners.add(listener);
  return () => { paintStallListeners.delete(listener); };
}

function reportPaintStall(event: PaintStallEvent): void {
  for (const listener of paintStallListeners) {
    try { listener(event); } catch (_) { /* an observer never breaks loading */ }
  }
}

function defaultTaskYield(): Promise<void> {
  const host = globalThis as typeof globalThis & {
    scheduler?: { yield?: () => Promise<void> };
  };
  if (typeof host.scheduler?.yield === 'function') return host.scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Resolve at an animation callback (before paint), with a bounded fallback for
 * hidden or embedded documents where requestAnimationFrame may never fire.
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

/** A timeout may keep a hidden document moving, but cannot certify a visible frame. */
function waitForPaintOpportunity(): Promise<void> {
  return new Promise((resolve, reject) => {
    const paintDocument = typeof document === 'undefined' ? null : document;
    const hasFrame = typeof requestAnimationFrame === 'function';
    const visible = (): boolean => !!paintDocument && !paintDocument.hidden;
    let done = false;
    let frame: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let timerRevision = 0;
    let requiresFrame = false;
    let extended = false;
    const cleanup = (): boolean => {
      if (done) return false;
      done = true;
      if (timer !== null) clearTimeout(timer);
      if (frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
      paintDocument?.removeEventListener('visibilitychange', visibilityChanged);
      return true;
    };
    const finish = (): void => { if (cleanup()) resolve(); };
    // Entry resilience (2026-09-25): a visible document whose animation
    // callback has not arrived within the budget used to reject the wait, which
    // failed the whole entry on a busy GPU. The first miss extends the wait by
    // one more budget and reports it; the second reports again and continues
    // without the frame — loading is a rendering opportunity, not a proof.
    const deadline = (): void => {
      if (done) return;
      if (hasFrame && visible()) {
        if (!extended) {
          extended = true;
          reportPaintStall({ phase: 'extended', waitedMs: PAINT_WAIT_BUDGET_MS });
          armDeadline();
          return;
        }
        reportPaintStall({ phase: 'continued', waitedMs: PAINT_WAIT_BUDGET_MS * 2 });
      }
      finish();
    };
    const armDeadline = (): void => {
      if (timer !== null) clearTimeout(timer);
      requiresFrame = hasFrame && visible();
      const revision = ++timerRevision;
      timer = setTimeout(() => {
        if (revision === timerRevision) deadline();
      }, requiresFrame ? PAINT_WAIT_BUDGET_MS : 34);
    };
    function visibilityChanged(): void {
      if (done) return;
      if (!visible()) finish();
      // A hidden-start wait that becomes visible must not take its old 34ms
      // fallback as a paint. It gets the same bounded real-frame requirement.
      else if (!requiresFrame && hasFrame) armDeadline();
    }
    try {
      paintDocument?.addEventListener('visibilitychange', visibilityChanged);
      armDeadline();
      if (hasFrame) frame = requestAnimationFrame(finish);
    } catch (error) {
      if (cleanup()) reject(error);
    }
  });
}

/**
 * Require a genuine animation callback while visible, then leave its pre-paint
 * microtask checkpoint. The task is a rendering opportunity, not a GPU/display
 * acknowledgement. Hidden/no-rAF hosts retain a bounded fallback; a visible
 * document with no arriving rAF waits one extended budget, reports the stall
 * through onPaintStall, and then continues (2026-09-25) instead of rejecting.
 */
export async function nextPaintFrame(): Promise<void> {
  await waitForPaintOpportunity();
  await defaultTaskYield();
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
 * frame at every checkpoint. Periodic default frame waits also cross a following
 * task so loading cannot resume in that frame's pre-paint microtask checkpoint.
 * This is a rendering opportunity, not a displayed-frame acknowledgement;
 * explicit frame ports retain their supplied contract.
 */
export function createOpaqueLoadingYielder(
  budgetMs = 12,
  paintEveryMs = 80,
  options: FrameSchedulerOptions = {},
): WorkYielder {
  const now = options.now ?? defaultNow;
  const yieldFrame = options.yieldFrame ?? nextPaintFrame;
  const yieldTask = options.yieldTask ?? defaultTaskYield;
  let sliceStart = now();
  let lastPaint = sliceStart;

  return async (force = false) => {
    const checkpoint = now();
    // Other preparation jobs can consume the paint interval while this job
    // awaits a task. A fresh task slice must not hide an overdue frame request.
    const paintDue = checkpoint - lastPaint >= paintEveryMs;
    if (!force && !paintDue && checkpoint - sliceStart < budgetMs) return;
    if (paintDue) {
      await yieldFrame();
      lastPaint = now();
    } else {
      await yieldTask();
    }
    sliceStart = now();
  };
}
