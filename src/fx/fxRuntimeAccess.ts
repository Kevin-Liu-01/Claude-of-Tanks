import { createLazyChunk } from '../app/lazyChunk.ts';

type MaybePromise<T> = T | PromiseLike<T>;

interface FxRuntimeAccessOptions<TModule, TRuntime extends object> {
  loadModule(): MaybePromise<TModule>;
  initialize(module: TModule): MaybePromise<TRuntime>;
  activate?(runtime: TRuntime): void;
  suspend?(runtime: TRuntime): void;
}

interface FxRuntimeAccess<TModule, TRuntime extends object> {
  readonly current: TRuntime | null;
  readonly active: boolean;
  preloadModule(): Promise<TModule>;
  ensureRuntime(): Promise<TRuntime>;
  suspendRuntime(): boolean;
}

/**
 * Own the battle-only effects import and singleton construction lifecycle.
 *
 * Intent can preload code without allocating a scene graph. Entry coalesces
 * every caller onto one initializer. A failed module request or initializer
 * clears only its own in-flight receipt, so a later Battle/Studio/shot entry
 * can recover without refreshing the page.
 */
export function createFxRuntimeAccess<TModule, TRuntime extends object>({
  loadModule,
  initialize,
  activate = () => {},
  suspend = () => {},
}: FxRuntimeAccessOptions<TModule, TRuntime>): FxRuntimeAccess<TModule, TRuntime> {
  if (typeof loadModule !== 'function' || typeof initialize !== 'function'
    || typeof activate !== 'function' || typeof suspend !== 'function') {
    throw new TypeError('FX runtime access requires module and initializer ports');
  }

  let runtime: TRuntime | null = null;
  let active = false;
  let activationRequested = false;
  let runtimePromise: Promise<TRuntime> | null = null;

  // (2026-11-02 audit R6, round 2 U35) the module is one app/lazyChunk.ts chunk: a failed one is asked again under the one
  // policy (at once after one failure, then past its backoff; a removed chunk shows the reload action), not at once by every
  // call. The runtime below is an initialization over the loaded module, not a chunk: a failed one is made again next time.
  const moduleChunk = createLazyChunk(() => Promise.resolve().then(loadModule));
  const preloadModule = (): Promise<TModule> => moduleChunk.load();

  const ensureRuntime = (): Promise<TRuntime> => {
    activationRequested = true;
    if (runtime) {
      if (!active) {
        activate(runtime);
        active = true;
      }
      return Promise.resolve(runtime);
    }
    if (runtimePromise) return runtimePromise;
    const request = preloadModule()
      .then(initialize)
      .then((live) => {
        if (!live || typeof live !== 'object') {
          throw new TypeError('FX initializer did not return a runtime');
        }
        // A sibling entry operation can fail while construction yields. Keep
        // the reusable singleton, but honor Garage recovery's later suspend
        // instead of publishing a battle graph after the owner has exited.
        if (activationRequested) activate(live);
        else suspend(live);
        runtime = live;
        active = activationRequested;
        return live;
      });
    runtimePromise = request;
    request.catch(() => {
      if (runtimePromise === request) runtimePromise = null;
    });
    return request;
  };

  const suspendRuntime = (): boolean => {
    const cancelledActivation = activationRequested && runtimePromise !== null;
    activationRequested = false;
    if (!runtime || !active) return cancelledActivation;
    suspend(runtime);
    active = false;
    return true;
  };

  return {
    get current() { return runtime; },
    get active() { return active; },
    preloadModule,
    ensureRuntime,
    suspendRuntime,
  };
}
