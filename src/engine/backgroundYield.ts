// The background pacing of work behind a live screen (battle-spikes-253; nav-perf's phone census, 2026-10-25: the next
// battle's world builds behind the Garage and its steps collided with presses). Its own module, loaded with the first
// background build (world/worldBuildCoordinator.ts), not with the boot's frame scheduler.
import { nextPaintFrame, type FrameSchedulerOptions, type WorkYielder } from './frameScheduler.ts';

const defaultNow = (): number => performance.now();

/**
 * (battle-spikes-253; nav-perf's phone census, 2026-10-25: the next battle's world builds behind the Garage and its
 * steps collided with presses) A press — a pointerdown or a keydown, seen in the capture phase before any handler —
 * holds background work until the press's paint (the animation callback after it and the task after that paint; a
 * press during the hold extends it to its own paint). Background yielders (createBackgroundYielder) wait it out, so the
 * press's handlers and its frame run first.
 */
let pressHold: Promise<void> | null = null;
let pressAgain = false;
let pressGateInstalled = false;
function installPressGate(): void {
  if (pressGateInstalled || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  pressGateInstalled = true;
  const untilPaint = (): Promise<void> => nextPaintFrame().then(() => {
    if (!pressAgain) return undefined;
    pressAgain = false;
    return untilPaint();
  });
  const hold = (): void => {
    if (pressHold) { pressAgain = true; return; }
    pressHold = untilPaint().catch(() => undefined).finally(() => { pressHold = null; });
  };
  window.addEventListener('pointerdown', hold, { capture: true, passive: true });
  window.addEventListener('keydown', hold, { capture: true, passive: true });
}

/** Whether the browser reports input waiting behind this task (navigator.scheduling.isInputPending, where it exists). */
function inputPending(): boolean {
  const host = typeof navigator === 'undefined' ? null
    : navigator as Navigator & { scheduling?: { isInputPending?: (options?: { includeContinuous?: boolean }) => boolean } };
  try { return host?.scheduling?.isInputPending?.({ includeContinuous: false }) === true; } catch { return false; }
}

/** A background-priority task (scheduler.postTask's 'background', where it exists; else a task). */
function backgroundTaskYield(): Promise<void> {
  const host = globalThis as typeof globalThis & {
    scheduler?: { postTask?: (callback: () => void, options: { priority: string }) => Promise<unknown> };
  };
  if (typeof host.scheduler?.postTask === 'function') {
    return host.scheduler.postTask(() => undefined, { priority: 'background' }).then(() => undefined);
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Background work behind a live screen (the Garage's next-battle world build): a slice ends at its budget, or early when
 * the browser reports input waiting; the next one waits out a press's hold and resumes as a background-priority task
 * between frames — never inside an animation callback, where a slice delays that frame's paint. Only the pacing: the
 * work and its order are the caller's.
 */
export function createBackgroundYielder(budgetMs = 4, options: FrameSchedulerOptions = {}): WorkYielder {
  installPressGate();
  const now = options.now ?? defaultNow;
  const yieldTask = options.yieldTask ?? backgroundTaskYield;
  let sliceStart = now();
  return async (force = false) => {
    if (!force && !pressHold && now() - sliceStart < budgetMs && !inputPending()) return;
    while (pressHold) await pressHold;
    await yieldTask();
    sliceStart = now();
  };
}

