// The Garage reveal path's one slicer (garage-env-276, the cold first visit). Copyright © 2026 Kevin B. Liu.
//
// A switch's work (the kit pieces, the tree groves, the skyline, the structures, the horizon pieces, the surface prints,
// the ground layers, the warm's texture uploads) runs until GARAGE_SLICE_MS of the thread is spent, then yields. Paced at
// one item a timer tick or a frame instead, a switch waited on the number of items rather than their cost: main's own
// Urban switch spent 27 frames uploading one texture each (450 of 912 ms, notes ab10/switch/A-desktop).

/** A slice's budget: the work runs until it is spent, then the frame gets the thread. */
export const GARAGE_SLICE_MS = 6;

/** Yields the thread to the event loop: a message task where there is one (no nested-timer clamp), a timer otherwise. */
export function nextGarageTask(): Promise<void> {
  if (typeof MessageChannel === 'function' && typeof document !== 'undefined') {
    return new Promise<void>((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => { channel.port1.close(); resolve(); };
      channel.port2.postMessage(0);
    });
  }
  return new Promise<void>((resolve) => { setTimeout(resolve, 0); });
}

/** Yields until the next animation frame (the uploads: the frame that draws them comes first); a task without frames. */
export function nextGarageFrame(): Promise<void> {
  if (typeof requestAnimationFrame !== 'function') return nextGarageTask();
  return new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); });
}

export interface GarageSlicer {
  /** Whether this slice's budget is spent: the caller yields (and asks whether it is still wanted) only then. */
  due(): boolean;
  /** Yields, then starts a fresh slice. */
  yield(): Promise<void>;
  /** Starts a fresh slice without yielding (after an await that already gave the thread away). */
  restart(): void;
}

export function createGarageSlicer(wait: () => Promise<void> = nextGarageTask, budgetMs = GARAGE_SLICE_MS): GarageSlicer {
  let startedAt = performance.now();
  return {
    due: () => performance.now() - startedAt >= budgetMs,
    async yield() { await wait(); startedAt = performance.now(); },
    restart() { startedAt = performance.now(); },
  };
}
