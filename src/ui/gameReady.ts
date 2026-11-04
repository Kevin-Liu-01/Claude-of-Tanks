// gameReady.ts — one wait for "the game is playable" (2026-11-02 audit F5). Copyright © 2026 Kevin B. Liu.
//
// Four Garage features (the featured gallery, the hotspots, Deploy's sheet, the camo swatch painter) each polled
// `window.__GAME_READY` on their own timer and never stopped when the boot did not finish. They now share one waiter with
// a declared state: waiting (one shared poll, slowing down after a while), ready (every waiter ran once), or failed (the
// boot halted on purpose: the capability gate's __COT_BOOT_HALTED, after which no poll runs). The probe is the one place
// that reads the boot's flag, so moving it onto a published lifecycle later is a change here alone.

export type GameReadyState = 'waiting' | 'ready' | 'failed';

export interface GameReadyWaiter {
  readonly state: GameReadyState;
  /** Run `callback` once the game is playable (now, when it already is); never when the boot failed. Returns a cancel. */
  whenReady(callback: () => void): () => void;
}

interface GameReadyOptions {
  isReady(): boolean;
  hasFailed(): boolean;
  schedule(callback: () => void, delayMs: number): unknown;
  cancel(handle: unknown): void;
  pollMs?: number;
  /** After this long waiting, poll at `slowPollMs` instead (a stalled boot keeps one slow poll, not four fast ones). */
  slowAfterMs?: number;
  slowPollMs?: number;
}

export function createGameReadyWaiter({
  isReady,
  hasFailed,
  schedule,
  cancel,
  pollMs = 120,
  slowAfterMs = 30_000,
  slowPollMs = 1_000,
}: GameReadyOptions): GameReadyWaiter {
  let state: GameReadyState = 'waiting';
  const waiters = new Set<() => void>();
  let timer: unknown = null;
  let waitedMs = 0;

  const settle = (): void => {
    if (state !== 'waiting') return;
    if (isReady()) {
      state = 'ready';
      const ready = [...waiters];
      waiters.clear();
      for (const callback of ready) callback();
    } else if (hasFailed()) {
      state = 'failed';
      waiters.clear();
    }
  };
  const poll = (): void => {
    timer = null;
    settle();
    if (state !== 'waiting' || !waiters.size) return;
    const delay = waitedMs >= slowAfterMs ? slowPollMs : pollMs;
    waitedMs += delay;
    timer = schedule(poll, delay);
  };

  return {
    get state() { settle(); return state; },
    whenReady(callback) {
      settle();
      if (state === 'ready') { callback(); return () => {}; }
      if (state === 'failed') return () => {};
      waiters.add(callback);
      if (timer === null) {
        waitedMs += pollMs;
        timer = schedule(poll, pollMs);
      }
      return () => {
        waiters.delete(callback);
        if (!waiters.size && timer !== null) { cancel(timer); timer = null; }
      };
    },
  };
}

interface BootFlags { __GAME_READY?: boolean; __COT_BOOT_HALTED?: string }

/** The page's one waiter: the boot's ready flag, and its deliberate halt as the failed state. */
export const gameReady: GameReadyWaiter = createGameReadyWaiter({
  isReady: () => typeof window !== 'undefined' && (window as unknown as BootFlags).__GAME_READY === true,
  hasFailed: () => typeof window !== 'undefined' && !!(window as unknown as BootFlags).__COT_BOOT_HALTED,
  schedule: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  cancel: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
});
