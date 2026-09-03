import type { RuntimeValue } from '../runtimeTypes.ts';
type FrameCallback = (timestampMs: number) => void;
type InputListener = () => void;

interface DocumentState {
  readonly hidden: boolean;
  hasFocus(): boolean;
  addEventListener?(type: 'visibilitychange', listener: InputListener): void;
  removeEventListener?(type: 'visibilitychange', listener: InputListener): void;
}

interface InputTarget {
  addEventListener(
    type: string,
    listener: InputListener,
    options?: AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: InputListener,
    options?: EventListenerOptions,
  ): void;
}

export interface FrameLoopSchedulerOptions {
  tick: FrameCallback;
  isBootComplete(): boolean;
  /** True only while a visible phase has no frame-rate work to perform. */
  shouldUseIdleCadence?(): boolean;
  /** Watchdog cadence for an otherwise event-driven visible phase. */
  idleIntervalMs?: number;
  /** Upper bound for presented animation ticks. Simulation remains fixed-step. */
  maximumFrameRate?: number;
  requestFrame?(callback: FrameCallback): number;
  cancelFrame?(id: number): void;
  now?(): number;
  setDelayed?(callback: () => void, delayMs: number): RuntimeValue;
  clearDelayed?(handle: RuntimeValue): void;
  setRecurring?(callback: () => void, intervalMs: number): RuntimeValue;
  clearRecurring?(handle: RuntimeValue): void;
  documentState?: DocumentState;
  inputTarget?: InputTarget;
}

export interface FrameLoopScheduler {
  schedule(): void;
  restart(): void;
  dispose(): void;
  readonly stats: {
    animationTicks: number;
    idleTicks: number;
    inputWakeups: number;
    frameRateLimitedCallbacks: number;
    backgroundSuspensions: number;
    queued: 'animation' | 'idle' | 'none';
  };
}

const INPUT_EVENTS = Object.freeze([
  'pointerdown',
  'touchstart',
  'mousedown',
  'mouseup',
  'mousemove',
  'keydown',
  'keyup',
  'wheel',
]);

/**
 * Owns the browser frame clock and hidden-pane recovery policy.
 *
 * Every path funnels through the same tick callback and timestamp latch, while
 * the queued-rAF bit guarantees that recovery input cannot create a second
 * live render loop when animation frames resume.
 */
export function createFrameLoopScheduler({
  tick,
  isBootComplete,
  shouldUseIdleCadence = () => false,
  idleIntervalMs = 1000,
  maximumFrameRate = 60,
  requestFrame = (callback) => requestAnimationFrame(callback),
  cancelFrame = (id) => cancelAnimationFrame(id),
  now = () => performance.now(),
  setDelayed = (callback, delayMs) => setTimeout(callback, delayMs),
  clearDelayed = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  setRecurring = (callback, intervalMs) => setInterval(callback, intervalMs),
  clearRecurring = (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
  documentState = document,
  inputTarget = window,
}: FrameLoopSchedulerOptions): FrameLoopScheduler {
  let lastTickWallMs = -Infinity;
  let frameQueued = false;
  let frameId: number | null = null;
  let idleHandle: RuntimeValue = null;
  let disposed = false;
  let backgroundSuspended = false;
  let nextAnimationTickMs = -Infinity;
  const idleDelayMs = Math.max(100, Math.min(5000, idleIntervalMs));
  const animationIntervalMs = Number.isFinite(maximumFrameRate) && maximumFrameRate > 0
    ? 1000 / Math.min(240, maximumFrameRate)
    : 0;
  // Browser rAF timestamps can land fractionally before the nominal display
  // boundary. This tolerance keeps a 59.94/60 Hz panel from being mistaken
  // for a 30 Hz target while still rejecting the intermediate callback on a
  // 120 Hz / ProMotion display.
  const animationToleranceMs = animationIntervalMs > 0
    ? Math.min(0.75, animationIntervalMs * 0.08)
    : 0;
  const stats = {
    animationTicks: 0,
    idleTicks: 0,
    inputWakeups: 0,
    frameRateLimitedCallbacks: 0,
    backgroundSuspensions: 0,
    queued: 'none' as 'animation' | 'idle' | 'none',
  };

  // Focus is the reliable discriminator for this app: embedded Codex panes
  // can report `hidden` while they are visibly focused, whereas an occluded
  // browser window can remain `visible` after the user switches apps. In both
  // ordinary tab switches and window blur, no presentation work is useful.
  const isBackgrounded = () => !documentState.hasFocus();

  const runTick = (timestampMs: number) => {
    lastTickWallMs = now();
    tick(timestampMs);
  };

  const scheduleAnimation = () => {
    if (disposed || frameQueued) return;
    if (isBackgrounded()) {
      if (!backgroundSuspended) stats.backgroundSuspensions += 1;
      backgroundSuspended = true;
      nextAnimationTickMs = -Infinity;
      return;
    }
    frameQueued = true;
    stats.queued = 'animation';
    frameId = requestFrame((timestampMs) => {
      frameId = null;
      frameQueued = false;
      stats.queued = 'none';
      if (isBackgrounded()) {
        if (!backgroundSuspended) stats.backgroundSuspensions += 1;
        backgroundSuspended = true;
        nextAnimationTickMs = -Infinity;
        return;
      }
      backgroundSuspended = false;
      if (animationIntervalMs > 0 &&
          timestampMs + animationToleranceMs < nextAnimationTickMs) {
        stats.frameRateLimitedCallbacks += 1;
        scheduleAnimation();
        return;
      }
      if (animationIntervalMs > 0) {
        if (!Number.isFinite(nextAnimationTickMs)) {
          nextAnimationTickMs = timestampMs + animationIntervalMs;
        } else {
          const behindMs = timestampMs - nextAnimationTickMs;
          const intervals = behindMs >= 0
            ? Math.floor(behindMs / animationIntervalMs) + 1
            : 1;
          nextAnimationTickMs += intervals * animationIntervalMs;
        }
      }
      stats.animationTicks += 1;
      runTick(timestampMs);
    });
  };

  const schedule = () => {
    if (disposed || frameQueued) return;
    if (!shouldUseIdleCadence()) {
      scheduleAnimation();
      return;
    }
    frameQueued = true;
    stats.queued = 'idle';
    idleHandle = setDelayed(() => {
      idleHandle = null;
      frameQueued = false;
      stats.queued = 'none';
      stats.idleTicks += 1;
      runTick(now());
    }, idleDelayMs);
  };

  const cancelQueued = () => {
    if (frameId !== null) cancelFrame(frameId);
    if (idleHandle !== null) clearDelayed(idleHandle);
    frameId = null;
    idleHandle = null;
    frameQueued = false;
    stats.queued = 'none';
  };

  const restart = () => {
    if (disposed) return;
    cancelQueued();
    nextAnimationTickMs = -Infinity;
    // A wake is always immediate. The resulting tick chooses idle cadence
    // again only after input/phase owners have had a chance to mutate state.
    scheduleAnimation();
  };

  const rescueFromTimer = () => {
    if (!isBootComplete()) return;
    const timestampMs = now();
    if (timestampMs - lastTickWallMs > 200 &&
        documentState.hasFocus() && documentState.hidden) {
      backgroundSuspended = false;
      runTick(timestampMs);
    }
  };

  const rescueFromInput = () => {
    if (!isBootComplete()) return;
    if (idleHandle !== null) {
      stats.inputWakeups += 1;
      restart();
    }
    if (!documentState.hidden) return;
    if (!documentState.hasFocus()) return;
    backgroundSuspended = false;
    const timestampMs = now();
    if (timestampMs - lastTickWallMs > 100) runTick(timestampMs);
  };

  const onVisibilityChange = () => {
    if (disposed) return;
    if (isBackgrounded()) {
      if (!backgroundSuspended) stats.backgroundSuspensions += 1;
      backgroundSuspended = true;
      nextAnimationTickMs = -Infinity;
      cancelQueued();
      return;
    }
    backgroundSuspended = false;
    restart();
  };

  const onWindowBlur = () => {
    if (disposed) return;
    if (!backgroundSuspended) stats.backgroundSuspensions += 1;
    backgroundSuspended = true;
    nextAnimationTickMs = -Infinity;
    cancelQueued();
  };

  const onWindowFocus = () => {
    if (disposed) return;
    backgroundSuspended = false;
    restart();
  };

  const timerHandle = setRecurring(rescueFromTimer, 100);
  const passiveOptions = { passive: true } as const;
  for (const eventName of INPUT_EVENTS) {
    inputTarget.addEventListener(eventName, rescueFromInput, passiveOptions);
  }
  inputTarget.addEventListener('blur', onWindowBlur);
  inputTarget.addEventListener('focus', onWindowFocus);
  documentState.addEventListener?.('visibilitychange', onVisibilityChange);

  return {
    schedule,
    restart,
    stats,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelQueued();
      clearRecurring(timerHandle);
      documentState.removeEventListener?.('visibilitychange', onVisibilityChange);
      for (const eventName of INPUT_EVENTS) {
        inputTarget.removeEventListener(eventName, rescueFromInput);
      }
      inputTarget.removeEventListener('blur', onWindowBlur);
      inputTarget.removeEventListener('focus', onWindowFocus);
    },
  };
}
