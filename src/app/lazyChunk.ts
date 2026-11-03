/**
 * lazyChunk.ts — the one failure policy for a lazily imported chunk (2026-11-02 audit R6). Copyright © 2026 Kevin B. Liu.
 *
 * A chunk's load is one declared state: idle -> loading -> ready | failed. A failure is kept, with its error, and nothing
 * asks again by itself (no timer, no `online` listener, no notice's Retry). What a later ask does depends on what failed,
 * by what a browser does with a chunk asked again (tools/offline-import-probe.mjs, components/loadFailure.ts):
 *
 * - its stylesheet (Vite's preload rejects with "Unable to preload CSS" before the module runs): terminal for the
 *   document. The failed <link> stands and never applies and Vite's preload never adds it again, so the chunk asked again
 *   would run unstyled. Every later ask gets the kept failure.
 * - anything else (the module, a modulepreload, an evaluation error): the next caller that needs the chunk asks again,
 *   at once after a first failure and then once the INFRA-P11 backoff since the last one has passed (lazyImportRetry.ts:
 *   2, 4, 8 s, then terminal at the fifth failure), never while the browser is offline. Nothing in it can render
 *   unstyled: Chrome 151 fails it again at once, Chrome 156 and Node load it, so a transient failure no longer stands
 *   for the session, and a caller that asks every frame asks a few times, not every frame.
 *
 * An opener (a surface the player opens from a trigger) declares itself (`opener: true`): any failure of its chunk is
 * terminal, and the kit takes it from there: the failure marks the trigger (components/loadFailure.ts markLoadFailed)
 * and the next press reloads once online (pressFailed), the one recovery that always works and the one the player can
 * see. The re-ask is for the callers with no trigger: builders, warms, presentation attachments, notices, decorative
 * paint.
 *
 * DOM-free and Node-runnable: the clock and the network probe default to the platform and are injectable.
 */
import { importRetryDelayMs, LAZY_IMPORT_RETRY, type ImportRetryPolicy } from './lazyImportRetry.ts';

export type LazyChunkState = 'idle' | 'loading' | 'ready' | 'failed';

export interface LazyChunkOptions {
  /** The re-ask budget (default LAZY_IMPORT_RETRY). */
  readonly retry?: ImportRetryPolicy;
  /** Milliseconds, monotonic (default performance.now, read at each call). */
  readonly now?: () => number;
  /** Whether the browser is online (default navigator.onLine; true where there is none). */
  readonly online?: () => boolean;
  /** An opener's chunk: any failure is terminal (its trigger's next press reloads the page, components/loadFailure.ts). */
  readonly opener?: boolean;
}

export interface LazyChunk<T> {
  readonly state: LazyChunkState;
  /** The loaded value once ready, else null. */
  readonly value: T | null;
  /** The kept failure while failed, else null. */
  readonly error: unknown;
  /** Failed for the rest of the document: its stylesheet did not arrive, or the re-ask budget is spent. */
  readonly terminal: boolean;
  /**
   * The chunk: the settled request once ready, the request in flight while loading, and after a failure either a new
   * ask (see the module comment) or the kept failure. The same promise until the state moves, and a handled one, so a
   * caller may drop it or ask every frame.
   */
  load(): Promise<T>;
}

/** Vite's preload could not add the chunk's stylesheet: asked again, the chunk would run unstyled. */
export function isStylesheetFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return /unable to preload css/i.test(message);
}

const platformNow = (): number => globalThis.performance?.now?.() ?? Date.now();
const platformOnline = (): boolean => (globalThis as { navigator?: { onLine?: boolean } }).navigator?.onLine !== false;

/** One chunk's load under the policy above. `load` runs at most once at a time, and only when a caller asks. */
export function createLazyChunk<T>(load: () => PromiseLike<T> | T, options: LazyChunkOptions = {}): LazyChunk<T> {
  if (typeof load !== 'function') throw new TypeError('a lazy chunk needs its loader');
  const policy = options.retry ?? LAZY_IMPORT_RETRY;
  const now = options.now ?? platformNow;
  const online = options.online ?? platformOnline;
  const opener = options.opener === true;
  let state: LazyChunkState = 'idle';
  let value: T | null = null;
  let error: unknown = null;
  let terminal = false;
  let failures = 0;
  let failedAt = 0;
  let request: Promise<T> | null = null;

  const ask = (): Promise<T> => {
    state = 'loading';
    error = null;
    let pending: Promise<T>;
    // the loader runs now (its import starts in this call); a synchronous throw is a failure like a rejection
    try { pending = Promise.resolve(load()); } catch (reason) { pending = Promise.reject(reason); }
    request = pending;
    // settles the state before any caller's handler runs (this handler is the first one attached)
    pending.then((loaded) => {
      state = 'ready';
      value = loaded;
      failures = 0;
    }, (reason: unknown) => {
      state = 'failed';
      error = reason;
      failures += 1;
      failedAt = now();
      terminal = opener || isStylesheetFailure(reason) || importRetryDelayMs(failures, policy) === null;
    });
    return pending;
  };

  return {
    get state() { return state; },
    get value() { return value; },
    get error() { return error; },
    get terminal() { return terminal; },
    load(): Promise<T> {
      if (state === 'idle') return ask();
      // ready, in flight, or a failure that stands: the same promise (a caller that asks every frame allocates nothing)
      if (state !== 'failed' || terminal || !online()) return request!;
      // at once after one failure; after n > 1 in a row, the backoff of n - 1 (the budget ends at the policy's maximum)
      const wait = failures === 1 ? 0 : importRetryDelayMs(failures - 1, policy) ?? Infinity;
      return now() - failedAt < wait ? request! : ask();
    },
  };
}
