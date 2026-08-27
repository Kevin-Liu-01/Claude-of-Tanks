type MaybePromise<T> = T | PromiseLike<T>;

export interface FxRuntimeAccessOptions<TModule, TRuntime extends object> {
  loadModule(): MaybePromise<TModule>;
  initialize(module: TModule): MaybePromise<TRuntime>;
}

export interface FxRuntimeAccess<TModule, TRuntime extends object> {
  readonly current: TRuntime | null;
  preloadModule(): Promise<TModule>;
  ensureRuntime(): Promise<TRuntime>;
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
}: FxRuntimeAccessOptions<TModule, TRuntime>): FxRuntimeAccess<TModule, TRuntime> {
  if (typeof loadModule !== 'function' || typeof initialize !== 'function') {
    throw new TypeError('FX runtime access requires module and initializer ports');
  }

  let runtime: TRuntime | null = null;
  let modulePromise: Promise<TModule> | null = null;
  let runtimePromise: Promise<TRuntime> | null = null;

  const preloadModule = (): Promise<TModule> => {
    if (modulePromise) return modulePromise;
    const request = Promise.resolve().then(loadModule);
    modulePromise = request;
    request.catch(() => {
      if (modulePromise === request) modulePromise = null;
    });
    return request;
  };

  const ensureRuntime = (): Promise<TRuntime> => {
    if (runtime) return Promise.resolve(runtime);
    if (runtimePromise) return runtimePromise;
    const request = preloadModule()
      .then(initialize)
      .then((live) => {
        if (!live || typeof live !== 'object') {
          throw new TypeError('FX initializer did not return a runtime');
        }
        runtime = live;
        return live;
      });
    runtimePromise = request;
    request.catch(() => {
      if (runtimePromise === request) runtimePromise = null;
    });
    return request;
  };

  return {
    get current() { return runtime; },
    preloadModule,
    ensureRuntime,
  };
}
