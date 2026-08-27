type FrameCallback = (timestampMs: number) => void;
type InputListener = () => void;

interface DocumentState {
  readonly hidden: boolean;
  hasFocus(): boolean;
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
  requestFrame?(callback: FrameCallback): number;
  cancelFrame?(id: number): void;
  now?(): number;
  setDelayed?(callback: () => void, delayMs: number): unknown;
  clearDelayed?(handle: unknown): void;
  setRecurring?(callback: () => void, intervalMs: number): unknown;
  clearRecurring?(handle: unknown): void;
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
  let idleHandle: unknown = null;
  let disposed = false;
  const idleDelayMs = Math.max(100, Math.min(5000, idleIntervalMs));
  const stats = {
    animationTicks: 0,
    idleTicks: 0,
    inputWakeups: 0,
    queued: 'none' as 'animation' | 'idle' | 'none',
  };

  const runTick = (timestampMs: number) => {
    lastTickWallMs = now();
    tick(timestampMs);
  };

  const scheduleAnimation = () => {
    if (disposed || frameQueued) return;
    frameQueued = true;
    stats.queued = 'animation';
    frameId = requestFrame((timestampMs) => {
      frameId = null;
      frameQueued = false;
      stats.queued = 'none';
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
    // A wake is always immediate. The resulting tick chooses idle cadence
    // again only after input/phase owners have had a chance to mutate state.
    scheduleAnimation();
  };

  const rescueFromTimer = () => {
    if (!isBootComplete()) return;
    const timestampMs = now();
    if (timestampMs - lastTickWallMs > 200 &&
        documentState.hasFocus() && documentState.hidden) {
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
    const timestampMs = now();
    if (timestampMs - lastTickWallMs > 100) runTick(timestampMs);
  };

  const timerHandle = setRecurring(rescueFromTimer, 100);
  const passiveOptions = { passive: true } as const;
  for (const eventName of INPUT_EVENTS) {
    inputTarget.addEventListener(eventName, rescueFromInput, passiveOptions);
  }

  return {
    schedule,
    restart,
    stats,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelQueued();
      clearRecurring(timerHandle);
      for (const eventName of INPUT_EVENTS) {
        inputTarget.removeEventListener(eventName, rescueFromInput);
      }
    },
  };
}
