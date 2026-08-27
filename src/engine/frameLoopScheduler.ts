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
  requestFrame?(callback: FrameCallback): number;
  cancelFrame?(id: number): void;
  now?(): number;
  setRecurring?(callback: () => void, intervalMs: number): unknown;
  clearRecurring?(handle: unknown): void;
  documentState?: DocumentState;
  inputTarget?: InputTarget;
}

export interface FrameLoopScheduler {
  schedule(): void;
  restart(): void;
  dispose(): void;
}

const INPUT_EVENTS = Object.freeze([
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
  requestFrame = (callback) => requestAnimationFrame(callback),
  cancelFrame = (id) => cancelAnimationFrame(id),
  now = () => performance.now(),
  setRecurring = (callback, intervalMs) => setInterval(callback, intervalMs),
  clearRecurring = (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
  documentState = document,
  inputTarget = window,
}: FrameLoopSchedulerOptions): FrameLoopScheduler {
  let lastTickWallMs = -Infinity;
  let frameQueued = false;
  let frameId: number | null = null;
  let disposed = false;

  const runTick = (timestampMs: number) => {
    lastTickWallMs = now();
    tick(timestampMs);
  };

  const schedule = () => {
    if (disposed || frameQueued) return;
    frameQueued = true;
    frameId = requestFrame((timestampMs) => {
      frameId = null;
      frameQueued = false;
      runTick(timestampMs);
    });
  };

  const restart = () => {
    if (disposed) return;
    if (frameId !== null) cancelFrame(frameId);
    frameId = null;
    frameQueued = false;
    schedule();
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
    if (!isBootComplete() || !documentState.hidden) return;
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
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frameId !== null) cancelFrame(frameId);
      frameId = null;
      frameQueued = false;
      clearRecurring(timerHandle);
      for (const eventName of INPUT_EVENTS) {
        inputTarget.removeEventListener(eventName, rescueFromInput);
      }
    },
  };
}
