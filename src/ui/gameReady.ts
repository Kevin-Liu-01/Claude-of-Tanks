// gameReady.ts — one wait for "the game is playable" (2026-11-02 audit F5). Copyright © 2026 Kevin B. Liu.
//
// Four Garage features (the featured gallery, the hotspots, Deploy's sheet, the camo swatch painter) each polled
// `window.__GAME_READY` on their own timer and never stopped when the boot did not finish. They share this one wait, on
// the product's boot latch (src/app/bootReadiness.ts, audit S3), not its harness mirror window.__GAME_READY, which only
// tools read. Round 2: the wait rides the latch's ready edge, so nothing polls (the round-1 waiter polled the latch every
// 120 ms, then every second for the rest of a stalled boot's session).
//
// The declared state is read, never settled, by `state`: ready (the latch settled), failed (the capability gate halted
// the boot on purpose, __COT_BOOT_HALTED: no waiter will ever run, and none registers) or waiting. Reading it runs
// nothing, so a caller that reads it while its own waiter is registered cannot re-enter itself (round 2, Q11: the round-1
// getter ran the waiters inline, and two callouts presses loaded the hotspots twice). A boot that stops on an uncaught
// error never settles the latch: its waiters stay registered with nothing scheduled for them, while index.html's recovery
// replaces the document or shows its reload, the one way on. If that boot still finishes, they run then.

import { isBootReady, whenBootReady } from '../app/bootReadiness.ts';

export type GameReadyState = 'waiting' | 'ready' | 'failed';

export interface GameReadyWaiter {
  /** The boot's state now. Reading it runs nothing. */
  readonly state: GameReadyState;
  /** Run `callback` once the game is playable (now, when it already is); never when the boot failed. Returns a cancel. */
  whenReady(callback: () => void): () => void;
}

interface GameReadyOptions {
  isReady(): boolean;
  hasFailed(): boolean;
  /** The latch's ready edge: runs `callback` once when the boot settles, and returns a cancel (bootReadiness.whenReady). */
  onReady(callback: () => void): () => void;
}

export function createGameReadyWaiter({ isReady, hasFailed, onReady }: GameReadyOptions): GameReadyWaiter {
  const stateNow = (): GameReadyState => (isReady() ? 'ready' : hasFailed() ? 'failed' : 'waiting');
  return {
    get state() { return stateNow(); },
    whenReady(callback) {
      const state = stateNow();
      if (state === 'ready') { callback(); return () => {}; }
      if (state === 'failed') return () => {};
      return onReady(callback);
    },
  };
}

interface BootFlags { __COT_BOOT_HALTED?: string }

/** The page's one waiter: the boot latch's ready edge, and its deliberate halt as the failed state. */
export const gameReady: GameReadyWaiter = createGameReadyWaiter({
  isReady: isBootReady,
  hasFailed: () => typeof window !== 'undefined' && !!(window as unknown as BootFlags).__COT_BOOT_HALTED,
  onReady: whenBootReady,
});
