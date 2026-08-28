type MaybePromise<T> = T | PromiseLike<T>;

export interface KillcamSpectateAccess {
  readonly active: boolean;
  readonly targetId: string | null;
  startObserver(): boolean;
  stop(emitEnd?: boolean): void;
  cycle?(direction?: number): void;
  maybeStart?(): boolean;
}

export interface KillcamRuntime {
  readonly fxTimeScale: number;
  readonly lastBeginWallMs: number;
  readonly spectate: KillcamSpectateAccess;
  readonly phase?: unknown;
  readonly replayInfo?: unknown;
  isActive(): boolean;
  cancel(): void;
  update(deltaSeconds: number): void;
  playForResult(...args: unknown[]): boolean;
  stageReplayShot(...args: unknown[]): unknown;
  stageXrayShot(...args: unknown[]): unknown;
  recordSimStep(...args: unknown[]): void;
  onShellHit(...args: unknown[]): void;
  onRam(...args: unknown[]): void;
}

interface KillcamModule {
  createKillCam?: (...args: unknown[]) => KillcamRuntime;
}

export interface KillcamAccessOptions<TModule extends KillcamModule = KillcamModule> {
  loadModule(): MaybePromise<TModule>;
  initialize(module: TModule): MaybePromise<KillcamRuntime>;
}

export interface KillcamAccess<TModule extends KillcamModule = KillcamModule> {
  readonly current: KillcamRuntime | null;
  readonly presentation: KillcamRuntime;
  preloadModule(): Promise<TModule>;
  ensureRuntime(): Promise<KillcamRuntime>;
}

const DORMANT_SPECTATE: KillcamSpectateAccess = Object.freeze({
  active: false,
  targetId: null,
  startObserver: () => false,
  stop() {},
  cycle() {},
  maybeStart: () => false,
});

/** Retryable lazy ownership for the replay chunk and its live presentation. */
export function createKillcamAccess<TModule extends KillcamModule>({
  loadModule,
  initialize,
}: KillcamAccessOptions<TModule>): KillcamAccess<TModule> {
  if (typeof loadModule !== 'function' || typeof initialize !== 'function') {
    throw new TypeError('killcam access requires module and initializer ports');
  }

  let runtime: KillcamRuntime | null = null;
  let modulePromise: Promise<TModule> | null = null;
  let runtimePromise: Promise<KillcamRuntime> | null = null;

  const preloadModule = (): Promise<TModule> => {
    if (modulePromise) return modulePromise;
    const request = Promise.resolve().then(loadModule);
    modulePromise = request;
    request.catch(() => {
      if (modulePromise === request) modulePromise = null;
    });
    return request;
  };

  const ensureRuntime = (): Promise<KillcamRuntime> => {
    if (runtime) return Promise.resolve(runtime);
    if (runtimePromise) return runtimePromise;
    const request = preloadModule()
      .then(initialize)
      .then((live) => {
        if (!live || typeof live.isActive !== 'function'
            || typeof live.update !== 'function') {
          throw new TypeError('killcam initializer did not return a runtime');
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

  // Main and debug hooks keep one identity while the heavy implementation is
  // absent from garage boot. Simulation receives the live runtime after the
  // composition root installs it, so fixed-step capture does not pay this
  // forwarding layer during battle.
  const presentation: KillcamRuntime = {
    get fxTimeScale() { return runtime?.fxTimeScale ?? 1; },
    get lastBeginWallMs() { return runtime?.lastBeginWallMs ?? 0; },
    get spectate() { return runtime?.spectate ?? DORMANT_SPECTATE; },
    get phase() { return runtime?.phase ?? null; },
    get replayInfo() { return runtime?.replayInfo ?? null; },
    isActive: () => runtime?.isActive() ?? false,
    cancel: () => { runtime?.cancel(); },
    update: (deltaSeconds) => { runtime?.update(deltaSeconds); },
    playForResult: (...args) => runtime?.playForResult(...args) ?? false,
    stageReplayShot: (...args) => runtime?.stageReplayShot(...args),
    stageXrayShot: (...args) => runtime?.stageXrayShot(...args),
    recordSimStep: (...args) => { runtime?.recordSimStep(...args); },
    onShellHit: (...args) => { runtime?.onShellHit(...args); },
    onRam: (...args) => { runtime?.onRam(...args); },
  };

  return {
    get current() { return runtime; },
    presentation,
    preloadModule,
    ensureRuntime,
  };
}
