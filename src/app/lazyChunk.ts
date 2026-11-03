/**
 * lazyChunk.ts — the one failure policy for a lazily imported chunk (2026-11-02 audit R6). Copyright © 2026 Kevin B. Liu.
 *
 * A chunk's load is one declared state: idle -> loading -> ready | failed. A failure is kept, with its error, and nothing
 * asks again by itself (no timer, no `online` listener, no notice's Retry). What a later ask does depends on what failed,
 * by what a browser does with a chunk asked again (tools/offline-import-probe.mjs, components/loadFailure.ts):
 *
 * - its stylesheet (Vite's preload rejects with "Unable to preload CSS" before the module runs), in any part of the
 *   load: terminal for the document. The failed <link> stands and never applies and Vite's preload never adds it again,
 *   so the chunk asked again would run unstyled. Every later ask gets the kept failure. A loader of several parts settles
 *   them all with importAll (below), so a module of the load that failed first cannot hide its stylesheet's failure.
 * - a content-hashed chunk that answers 404 (lazyImportRetry.ts classifyChunkFailure 'missing': this document's
 *   deployment is gone): terminal, and the inline watchdog's reload action shows (index.html showRetry), the one way to
 *   the newest deployment. INFRA-P11's 33,875 asks of a removed chunk were this case.
 * - anything else (the module, a modulepreload, an evaluation error, a 5xx, a captive portal): the next caller that
 *   needs the chunk asks again, at once after a first failure and then once the INFRA-P11 backoff since the last one
 *   has passed (2, 4, 8 ... s, capped at the policy's maximum, one minute), never while the browser is offline, and at
 *   once when it is back online after a failure it saw offline. It never becomes terminal: a builder, a warm or a notice
 *   mends when the network does, as the fleet's loaders always did. Nothing in it can render unstyled: Chrome 151 fails
 *   it again at once, Chrome 156 and Node load it, and a caller that asks every frame asks once a minute at most.
 *
 * An opener (a surface the player opens from a trigger) declares itself (`opener: true`): any failure of its chunk is
 * terminal, and the kit takes it from there: the failure marks the trigger (components/loadFailure.ts markLoadFailed)
 * and the next press reloads once online (pressFailed), the one recovery that always works and the one the player can
 * see. The re-ask is for the callers with no trigger: builders, warms, presentation attachments, notices, decorative
 * paint.
 *
 * DOM-free and Node-runnable: the clock, the network probe, the 404 classifier and the reload surface default to the
 * platform and are injectable (outside a document nothing is classified: no probe request leaves a Node receipt).
 */
import { classifyChunkFailure, LAZY_IMPORT_RETRY, type ImportRetryPolicy } from './lazyImportRetry.ts';

export type LazyChunkState = 'idle' | 'loading' | 'ready' | 'failed';

export interface LazyChunkOptions {
  /** The re-ask backoff (default LAZY_IMPORT_RETRY: base 2 s, doubling, capped at one minute; its budget is not read). */
  readonly retry?: ImportRetryPolicy;
  /** Milliseconds, monotonic (default performance.now, read at each call). */
  readonly now?: () => number;
  /** Whether the browser is online (default navigator.onLine; true where there is none). */
  readonly online?: () => boolean;
  /** An opener's chunk: any failure is terminal (its trigger's next press reloads the page, components/loadFailure.ts). */
  readonly opener?: boolean;
  /** 'missing' when a failure is a removed hashed chunk (default classifyChunkFailure in a document, else 'transient'). */
  readonly classify?: (error: unknown) => PromiseLike<'missing' | 'transient'>;
  /** A removed chunk: the reload surface (default the inline watchdog's, index.html `__COT_BOOT_RECOVERY.showRetry`). */
  readonly onMissing?: (error: unknown) => void;
}

export interface LazyChunk<T> {
  readonly state: LazyChunkState;
  /** The loaded value once ready, else null. */
  readonly value: T | null;
  /** The kept failure while failed, else null. */
  readonly error: unknown;
  /** Failed for the rest of the document: an opener's chunk, a stylesheet that did not arrive, or a removed chunk. */
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

type Settled<T extends readonly unknown[]> = { -readonly [K in keyof T]: Awaited<T[K]> };

/**
 * Every part of a load of several chunks (a module and its stylesheet, a picker and its words), settled before the load
 * settles: their values in order, or the failure, a stylesheet's when any part's stylesheet failed, else the first.
 * `Promise.all` keeps whichever rejection came first, and offline which comes first is a race: a module's would leave
 * the load asked again, and Vite's preload would skip the stylesheet it already failed (the chunk would run unstyled).
 */
export async function importAll<T extends readonly unknown[] | []>(parts: T): Promise<Settled<T>> {
  const settled = await Promise.allSettled(parts);
  let failure: PromiseRejectedResult | null = null;
  for (const part of settled) {
    if (part.status === 'fulfilled') continue;
    if (isStylesheetFailure(part.reason)) throw part.reason;
    failure ??= part;
  }
  if (failure) throw failure.reason;
  return settled.map((part) => (part as PromiseFulfilledResult<unknown>).value) as Settled<T>;
}

const platformNow = (): number => globalThis.performance?.now?.() ?? Date.now();
const platformOnline = (): boolean => (globalThis as { navigator?: { onLine?: boolean } }).navigator?.onLine !== false;
// a probe asks the network: only a document's chunks are hashed, and a Node receipt never sends one
const platformClassify = (error: unknown): PromiseLike<'missing' | 'transient'> =>
  typeof document === 'object' && typeof location === 'object' ? classifyChunkFailure(error) : Promise.resolve('transient');
const platformMissing = (): void => {
  try {
    (globalThis as { __COT_BOOT_RECOVERY?: { showRetry?(reason: string): void } }).__COT_BOOT_RECOVERY?.showRetry?.('module');
  } catch { /* the reload surface is optional (the Gallery and the docs have none) */ }
};

/** One chunk's load under the policy above. `load` runs at most once at a time, and only when a caller asks. */
export function createLazyChunk<T>(load: () => PromiseLike<T> | T, options: LazyChunkOptions = {}): LazyChunk<T> {
  if (typeof load !== 'function') throw new TypeError('a lazy chunk needs its loader');
  const policy = options.retry ?? LAZY_IMPORT_RETRY;
  const now = options.now ?? platformNow;
  const online = options.online ?? platformOnline;
  const opener = options.opener === true;
  const classify = options.classify ?? platformClassify;
  const onMissing = options.onMissing ?? platformMissing;
  let state: LazyChunkState = 'idle';
  let value: T | null = null;
  let error: unknown = null;
  let terminal = false;
  let failures = 0;
  let failedAt = 0;
  let failedOffline = false;
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
      failedOffline = !online();
      terminal = opener || isStylesheetFailure(reason);
      if (terminal) return;
      // a removed chunk: never asked again, and the reload surface shows (until that is known the policy's re-ask holds)
      void Promise.resolve(classify(reason)).then((kind) => {
        if (kind !== 'missing' || request !== pending || terminal) return;
        terminal = true;
        onMissing(reason);
      }, () => { /* unknown is transient */ });
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
      // back online after a failure seen offline, or after one failure: at once; after n > 1 in a row, the backoff of
      // n - 1 (2, 4, 8 ... s), capped at the policy's maximum and never spent
      const wait = failedOffline || failures === 1 ? 0 : Math.min(policy.maxMs, policy.baseMs * 2 ** (failures - 2));
      return now() - failedAt < wait ? request! : ask();
    },
  };
}
