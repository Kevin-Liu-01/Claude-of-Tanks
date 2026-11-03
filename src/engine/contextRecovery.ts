/** Context loss is recoverable; only an explicit user action may reload a match. */
export interface ContextRecoveryOwner {
  onLost?(): void;
  /**
   * (2026-11-02 audit R3) `signal` aborts when a newer loss (or the renderer's dispose) supersedes this restoration:
   * the owner checks it after every await and stops there. A restoration starts only after the previous one settled,
   * so two owner restorations never run at once.
   */
  onRestored?(signal: AbortSignal): boolean | void | Promise<boolean | void>;
}
export type RecoveryNotice = 'waiting' | 'restoring' | 'delayed' | 'failed' | 'ready';
/**
 * The recovery machine's declared state (2026-11-02 audit R3): 'live' → lost → restoring → live | failed; a new loss
 * from any state goes back to 'lost'; 'disposed' is final. Published so other owners (the black-world guard's H4)
 * read it instead of inferring it from a timer.
 */
export type RecoveryState = 'live' | 'lost' | 'restoring' | 'failed' | 'disposed';
/** The outcome of a restore requested through {@link ContextRecovery.request}. */
export type RecoveryOutcome = 'ready' | 'failed' | 'disposed';

export interface LoseContextControl {
  loseContext(): void;
  restoreContext(): void;
}

export interface ContextRecovery {
  readonly state: RecoveryState;
  lost(event: { preventDefault(): void }): void;
  restored(): void;
  /**
   * Ask for a lose/restore cycle (the black-world guard's H4): the context is lost now and restored after
   * `restoreAfterMs`; the promise settles with the outcome of the restoration that follows.
   */
  request(control: LoseContextControl, restoreAfterMs?: number): Promise<RecoveryOutcome>;
  dispose(): void;
}

/**
 * How long a restoration waits for the superseded one to settle before it starts anyway (the old one is aborted and
 * stops at its next checkpoint; the bound only keeps an old await that never settles from blocking recovery).
 */
export const SUPERSEDED_SETTLE_MS = 3000;

export function createContextRecovery({
  owner, beforeRestore, beforeLost, notice, recordLoss,
  schedule = (callback: () => void) => setTimeout(callback, 10_000),
  cancel = (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
  later = (callback: () => void, ms: number) => { const handle = setTimeout(callback, ms); return () => clearTimeout(handle); },
}: {
  owner(): ContextRecoveryOwner | undefined;
  beforeRestore(): void;
  /**
   * (2026-11-02 audit R3) runs first on every loss, before the owner's onLost: the context-resource lifetime's
   * generation bump (contextResourceLifetime.ts noteLost), so its order against the owner is code, not listener order.
   */
  beforeLost?(event: unknown): void;
  notice(state: RecoveryNotice): void;
  recordLoss(): void;
  schedule?(callback: () => void): ReturnType<typeof setTimeout>;
  cancel?(timer: ReturnType<typeof setTimeout>): void;
  /** A one-shot timer; returns its cancel. */
  later?(callback: () => void, ms: number): () => void;
}): ContextRecovery {
  let generation = 0;
  let state: RecoveryState = 'live';
  let timer: ReturnType<typeof setTimeout> | undefined;
  // the running owner restoration, and the signal that supersedes it
  let running: Promise<unknown> | null = null;
  let abort: AbortController | null = null;
  let waiters: Array<(outcome: RecoveryOutcome) => void> = [];
  const clear = () => { if (timer !== undefined) cancel(timer); timer = undefined; };
  const deadline = (current: number) => {
    clear();
    timer = schedule(() => { if ((state === 'lost' || state === 'restoring') && current === generation) notice('delayed'); });
  };
  const settleWaiters = (outcome: RecoveryOutcome) => {
    const settled = waiters;
    waiters = [];
    for (const resolve of settled) resolve(outcome);
  };
  const supersede = () => { abort?.abort(); abort = null; };
  return {
    get state() { return state; },
    lost(event) {
      event.preventDefault();
      if (state === 'disposed') return;
      generation++;
      state = 'lost';
      supersede();
      try { beforeLost?.(event); } catch { /* the lifetime guard is best effort */ }
      try { recordLoss(); } catch { /* recovery is still possible without stored relief */ }
      try { owner()?.onLost?.(); } catch { /* the cover and explicit reload remain available */ }
      notice('waiting');
      deadline(generation);
    },
    restored() {
      if (state !== 'lost') return;
      state = 'restoring';
      const current = generation;
      notice('restoring');
      deadline(current);
      const fail = () => {
        if (current !== generation) return;
        clear();
        state = 'failed';
        notice('failed');
        settleWaiters('failed');
      };
      try { beforeRestore(); } catch { fail(); return; }
      const controller = new AbortController();
      abort = controller;
      // the previous restoration (already aborted by the loss that superseded it) settles before this one starts, or
      // SUPERSEDED_SETTLE_MS passes
      const previous = running ? new Promise<void>((resolve) => {
        const stop = later(resolve, SUPERSEDED_SETTLE_MS);
        running!.then(() => { stop(); resolve(); });
      }) : Promise.resolve();
      const run = previous.then(() => {
        if (current !== generation || controller.signal.aborted) return false;
        const restore = owner()?.onRestored;
        return restore ? restore(controller.signal) : false;
      });
      const settled: Promise<unknown> = run.then(() => undefined, () => undefined).then(() => {
        if (running === settled) running = null;
      });
      running = settled;
      run.then((handled) => {
        if (current !== generation) return;
        if (handled === false) { fail(); return; }
        clear();
        state = 'live';
        if (abort === controller) abort = null;
        notice('ready');
        settleWaiters('ready');
      }).catch(fail);
    },
    request(control, restoreAfterMs = 120) {
      if (state === 'disposed') return Promise.resolve('disposed');
      const outcome = new Promise<RecoveryOutcome>((resolve) => { waiters.push(resolve); });
      control.loseContext();
      later(() => {
        if (state === 'disposed') return;
        try { control.restoreContext(); } catch { /* the recovery notice owns a context that never returns */ }
      }, restoreAfterMs);
      return outcome;
    },
    dispose() {
      generation++;
      state = 'disposed';
      supersede();
      clear();
      settleWaiters('disposed');
    },
  };
}
