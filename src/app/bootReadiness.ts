/**
 * The boot's ready latch (2026-11-02 audit S3).
 *
 * Product code used to read `window.__GAME_READY`, the flag the harnesses wait on, to decide when the Garage's
 * decorative work (the featured gallery, the hotspots, Deploy's sheet, the camo swatch painter) and the Studio may
 * start. A harness flag that drives product behaviour is two contracts in one value: a tool that writes or stubs it
 * changes what the game does, and the game cannot change what "ready" means without breaking every receipt.
 *
 * This module is the product's latch. main.ts settles it once, at the end of the boot; product code reads `ready` or
 * waits with `whenReady`. `window.__GAME_READY` is its harness mirror, written here and nowhere else, and read only by
 * tools (tools/game-readiness.mjs); `window.__COT_BOOT_READY` is the mirror index.html's inline scripts read. The
 * latch says the boot finished loading; whether the entry gate still waits on the player is the app lifecycle's 'boot'
 * state (src/game/appLifecycle.ts), which main.ts derives from this latch and the gate. Pure: no DOM.
 */

export interface BootReadiness {
  /** The boot finished loading (main.ts settled the latch). */
  readonly ready: boolean;
  /** Run `callback` once the boot is ready: now, when it already is. Returns a cancel for a callback still waiting. */
  whenReady(callback: () => void): () => void;
  /** main.ts, once, at the end of the boot: settles the latch, writes the harness mirror, runs the waiters. */
  markReady(): void;
}

interface BootReadinessOptions {
  /** Called once when the latch settles, before the waiters run (the page's `window.__GAME_READY` mirror). */
  mirror?(): void;
  /** Where a waiter's own error goes (it never stops the boot or the other waiters). */
  report?(error: unknown): void;
}

export function createBootReadiness({ mirror, report = (error) => console.error('[boot] a ready waiter failed', error) }:
  BootReadinessOptions = {}): BootReadiness {
  let ready = false;
  const waiters = new Set<() => void>();
  const run = (callback: () => void): void => {
    try { callback(); } catch (error) { report(error); }
  };
  return {
    get ready() { return ready; },
    whenReady(callback) {
      if (ready) { run(callback); return () => {}; }
      // a wrapper per call: the same callback registered twice runs twice, as two polls did
      const waiter = (): void => run(callback);
      waiters.add(waiter);
      return () => { waiters.delete(waiter); };
    },
    markReady() {
      if (ready) return;
      ready = true;
      mirror?.();
      const settled = [...waiters];
      waiters.clear();
      for (const waiter of settled) waiter();
    },
  };
}

type PageMirrors = typeof globalThis & { __GAME_READY?: boolean; __COT_BOOT_READY?: boolean };

/**
 * The page's one latch. Its two page mirrors: `__COT_BOOT_READY` for the inline boot watchdog and chunk recovery in
 * index.html (they run before the module graph and cannot import this), and `__GAME_READY` for the harnesses.
 */
export const bootReadiness: BootReadiness = createBootReadiness({
  mirror: () => {
    const page = globalThis as PageMirrors;
    page.__COT_BOOT_READY = true;
    page.__GAME_READY = true;
  },
});

/** The boot finished loading. */
export function isBootReady(): boolean {
  return bootReadiness.ready;
}

/** Run `callback` once the boot finished loading (now, when it has). Returns a cancel. */
export function whenBootReady(callback: () => void): () => void {
  return bootReadiness.whenReady(callback);
}
