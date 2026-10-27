/**
 * workerRefusal.ts — the boot's real workers report a refusal, and the capability gate listens (2026-10-26, the boot
 * ABBA: the gate's own blob worker, started only to learn whether workers run, cost the boot screen 0.1–0.8 s under
 * load, deferred or not). A refusal is a worker whose constructor or first message threw, or that reported an error;
 * a worker that is merely slow is not one. Copyright (c) 2026 Kevin B. Liu. First-party; see NOTICE.md.
 */
let refused = false;
const listeners = new Set<() => void>();

/** A real worker could not start or failed: tell the gate once. */
export function reportWorkerRefused(): void {
  if (refused) return;
  refused = true;
  for (const listener of listeners) {
    try { listener(); } catch { /* one listener's failure never blocks another */ }
  }
  listeners.clear();
}

/** Call back on the first refusal (at once when one was already reported). */
export function onWorkerRefused(listener: () => void): void {
  if (refused) listener();
  else listeners.add(listener);
}
