/**
 * workerCalls.ts — the worker-client pattern's plumbing (2026-11-02 audit R6, src/workerClientHealth.ts), for a client
 * that does not hand-write its own (improve-271 plans 017 and 031, and the surface paint prefetch): docs/DECISIONS.md
 * "each worker task has a bounded deadline and an equivalent local fallback, so a browser that neither starts the worker
 * nor reports an error cannot strand boot or battle entry".
 *
 * Each call names its own fallback (`fail`). The worker is abandoned, and every call it holds fails, when it reports an
 * error, when a reply cannot be read, or when it stays silent past the deadline while it holds a call. Silence runs from
 * its last message, or from the call that found it idle: for a serial worker that is R6's "from dispatch" (its next job
 * starts when its last reply leaves), and a worker that streams a long answer is never silent. An abandoned worker is
 * terminated and never posted to again; the next call starts a fresh one under R6's count, the one rule (Main,
 * 2026-11-11): `maxFailures` failures in a row leave the client unavailable and a finished call starts the count again.
 * A worker that failed before it ever answered, or one that could not be started, is one failure like any other;
 * whether a failed chunk may be fetched again is the lazy-chunk loader's call, not a worker client's.
 *
 * The client still writes `new Worker(new URL('./x.ts', import.meta.url))` itself (the bundler finds workers by that
 * text; tools/viteSharedWorkers.selftest.mjs) and hands this module the factory. Presentation only: timers are allowed.
 */

import { createWorkerClientHealth, MAX_CONSECUTIVE_WORKER_FAILURES, type WorkerClientHealth } from './workerClientHealth.ts';

export interface WorkerCallPort {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror?: ((event: MessageEvent) => void) | null;
}

/** The deadline's clock (receipts inject one, so no receipt waits wall-clock seconds). */
export interface WorkerCallTimers {
  set(callback: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface WorkerCall<R> {
  /** One of the worker's messages for this call; true when it was the call's last. */
  reply(data: R): boolean;
  /** The worker failed, went silent or was disposed: the call's own fallback runs here. */
  fail(error: Error): void;
}

export interface WorkerCallsOptions<R> {
  /** For error messages ("decor worker"). */
  name: string;
  /** Start a worker (null or a throw: no worker; every call takes its fallback). */
  spawn(): WorkerCallPort | null;
  /** The call a message belongs to. */
  idOf(data: R): number | undefined;
  /** How long a worker holding a call may stay silent once it has answered (ms). */
  silenceMs: number;
  /** The same before its first message, while it loads its code (ms; `silenceMs` by default). */
  firstSilenceMs?: number;
  /** R6's failures in a row before the client is unavailable (MAX_CONSECUTIVE_WORKER_FAILURES by default; 1: the first
   *  failure is final). */
  maxFailures?: number;
  timers?: WorkerCallTimers;
}

export interface WorkerCalls<R> {
  /** Start the worker ahead of its first call (it loads its code meanwhile); false when none runs. */
  warm(): boolean;
  /** Post a call; false when no worker takes it (none could start, or the post threw): run the fallback now. */
  post(id: number, message: unknown, transfer: Transferable[] | undefined, call: WorkerCall<R>): boolean;
  /** A worker runs or may still start. */
  readonly available: boolean;
  /** A worker runs. */
  readonly running: boolean;
  /** Terminate the worker and fail every call it holds with `error`; nothing starts again. */
  dispose(error: Error): void;
  /** R6's count for this client. */
  readonly health: WorkerClientHealth;
}

const DEFAULT_TIMERS: WorkerCallTimers = {
  set: (callback, ms) => {
    const handle = globalThis.setTimeout(callback, ms);
    // (Node, the receipts) a pending deadline never holds the process open
    (handle as { unref?: () => void }).unref?.();
    return handle;
  },
  clear: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
};

export function createWorkerCalls<R>(options: WorkerCallsOptions<R>): WorkerCalls<R> {
  const timers = options.timers ?? DEFAULT_TIMERS;
  const health = createWorkerClientHealth(options.maxFailures ?? MAX_CONSECUTIVE_WORKER_FAILURES);
  const pending = new Map<number, WorkerCall<R>>();
  let worker: WorkerCallPort | null = null;
  let heard = false;
  let timer: unknown = null;

  const disarm = (): void => {
    if (timer === null) return;
    timers.clear(timer);
    timer = null;
  };
  const arm = (): void => {
    disarm();
    if (pending.size && worker) timer = timers.set(onSilence, heard ? options.silenceMs : options.firstSilenceMs ?? options.silenceMs);
  };
  function onSilence(): void {
    timer = null;
    abandon(new Error(`${options.name} went silent`));
  }
  function abandon(error: Error): void {
    const dead = worker;
    disarm();
    worker = null;
    if (dead) {
      dead.onmessage = dead.onerror = null;
      if ('onmessageerror' in dead) dead.onmessageerror = null;
      try { dead.terminate(); } catch { /* already gone */ }
      health.failed();
    }
    if (!pending.size) return;
    const calls = [...pending.values()];
    pending.clear();
    for (const call of calls) call.fail(error);
  }
  function receive(owned: WorkerCallPort, data: R): void {
    if (worker !== owned) return;
    heard = true;
    const id = options.idOf(data);
    const call = id === undefined ? undefined : pending.get(id);
    if (call && id !== undefined) {
      let done: boolean;
      try { done = call.reply(data); } catch (error) {
        pending.delete(id);
        call.fail(error instanceof Error ? error : new Error(String(error)));
        done = false;
      }
      if (done) { pending.delete(id); health.succeeded(); }
    }
    if (worker === owned) arm();
  }
  function start(): WorkerCallPort | null {
    if (worker) return worker;
    if (health.state === 'unavailable') return null;
    let owned: WorkerCallPort | null = null;
    try { owned = options.spawn(); } catch { owned = null; }
    if (!owned) { health.failed(); return null; }
    const port = owned;
    worker = port;
    heard = false;
    port.onmessage = (event) => receive(port, event.data as R);
    port.onerror = (event) => {
      if (worker === port) abandon(new Error(`${options.name} failed: ${event?.message || 'error'}`));
    };
    port.onmessageerror = () => { if (worker === port) abandon(new Error(`${options.name} reply could not be read`)); };
    return port;
  }

  return {
    warm: () => start() !== null,
    post(id, message, transfer, call) {
      const port = start();
      if (!port) return false;
      pending.set(id, call);
      try {
        if (transfer) port.postMessage(message, transfer); else port.postMessage(message);
      } catch {
        pending.delete(id);
        return false;
      }
      if (timer === null) arm();
      return true;
    },
    get available() { return worker !== null || health.state === 'available'; },
    get running() { return worker !== null; },
    health,
    dispose(error) {
      health.close();
      abandon(error);
    },
  };
}
