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
 *   once the INFRA-P11 backoff since the failure has passed (lazyImportRetry.ts: 2, 4, 8, 16 s, then terminal after five
 *   failures) and never while the browser is offline. Nothing in it can render unstyled: Chrome 151 fails it again at
 *   once, Chrome 156 and Node load it, so a transient failure no longer stands for the session.
 *
 * Openers (a surface the player opens from a trigger) keep the kit on top of this: the failure marks the trigger
 * (components/loadFailure.ts markLoadFailed) and the next press reloads once online (pressFailed), the one recovery that
 * always works and the one the player can see. The re-ask is for the callers with no trigger: builders, warms,
 * presentation attachments, notices, decorative paint.
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
   * The chunk: resolves at once when ready, shares the request in flight, and after a failure either asks again (see
   * the module comment) or rejects with the kept failure. The returned promise is handled, so a caller may drop it.
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
    const pending = Promise.resolve().then(load);
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
      terminal = isStylesheetFailure(reason) || importRetryDelayMs(failures, policy) === null;
    });
    return pending;
  };

  return {
    get state() { return state; },
    get value() { return value; },
    get error() { return error; },
    get terminal() { return terminal; },
    load(): Promise<T> {
      if (state === 'ready') return Promise.resolve(value as T);
      if (state === 'idle') return ask();
      if (state === 'loading' || terminal || !online()) return request!;
      const wait = importRetryDelayMs(failures, policy) ?? Infinity;
      return now() - failedAt < wait ? request! : ask();
    },
  };
}
