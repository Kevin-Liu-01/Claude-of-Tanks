interface StudioRuntime {
  active: boolean;
  tick(deltaSeconds: number): void;
  enter(options?: unknown): Promise<unknown> | unknown;
}

interface StudioModule {
  createStudio(context: unknown): StudioRuntime;
}

interface StudioPresentation {
  readonly active: boolean;
  tick(deltaSeconds: number): void;
}

interface KeyboardEventTarget {
  addEventListener(type: 'keydown', listener: EventListener, options?: boolean): void;
  removeEventListener(type: 'keydown', listener: EventListener, options?: boolean): void;
}

export interface StudioAccessOptions {
  loadModule(): Promise<StudioModule>;
  preloadFxModule(): Promise<unknown>;
  ensureFxRuntime(): Promise<unknown>;
  prepareRuntime(): void;
  createContext(fx: unknown): unknown;
  getPhase(): string;
  keyTarget?: KeyboardEventTarget | null;
  onEntryError?: (error: unknown) => void;
}

export interface StudioAccess {
  readonly presentation: StudioPresentation;
  preloadModule(): Promise<StudioModule>;
  preloadIntent(): void;
  loadRuntime(): Promise<StudioRuntime>;
  installKeyboard(): void;
  uninstallKeyboard(): void;
}

const INACTIVE_STUDIO: StudioRuntime = Object.freeze({
  active: false,
  tick() {},
  enter() { return Promise.resolve(); },
});

/** Retryable lazy boundary for Studio code, FX acquisition, and F8 ownership. */
export function createStudioAccess({
  loadModule,
  preloadFxModule,
  ensureFxRuntime,
  prepareRuntime,
  createContext,
  getPhase,
  keyTarget = typeof window !== 'undefined' ? window : null,
  onEntryError = (error) => console.error('[studio] lazy entry failed', error),
}: StudioAccessOptions): StudioAccess {
  let runtime: StudioRuntime = INACTIVE_STUDIO;
  let modulePromise: Promise<StudioModule> | null = null;
  let runtimePromise: Promise<StudioRuntime> | null = null;
  let keyboardInstalled = false;

  const preloadModule = (): Promise<StudioModule> => {
    if (!modulePromise) {
      const request = loadModule();
      modulePromise = request;
      request.catch(() => {
        if (modulePromise === request) modulePromise = null;
      });
    }
    return modulePromise;
  };

  const uninstallKeyboard = (): void => {
    if (!keyboardInstalled || !keyTarget) return;
    keyTarget.removeEventListener('keydown', onKeyDown, true);
    keyboardInstalled = false;
  };

  const loadRuntime = (): Promise<StudioRuntime> => {
    if (runtimePromise) return runtimePromise;
    prepareRuntime();
    const request = Promise.all([
      preloadModule(),
      ensureFxRuntime(),
    ]).then(([module, fx]) => {
      uninstallKeyboard();
      runtime = module.createStudio(createContext(fx));
      return runtime;
    }).catch((error: unknown) => {
      if (runtimePromise === request) runtimePromise = null;
      throw error;
    });
    runtimePromise = request;
    return request;
  };

  const onKeyDown: EventListener = (rawEvent): void => {
    const event = rawEvent as KeyboardEvent;
    if (event.code !== 'F8' || event.repeat || getPhase() !== 'garage') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    loadRuntime()
      .then((loaded) => loaded.enter())
      .catch(onEntryError);
  };

  const installKeyboard = (): void => {
    if (keyboardInstalled || !keyTarget) return;
    keyTarget.addEventListener('keydown', onKeyDown, true);
    keyboardInstalled = true;
  };

  const presentation: StudioPresentation = {
    get active() { return runtime.active; },
    tick(deltaSeconds) { runtime.tick(deltaSeconds); },
  };

  return {
    presentation,
    preloadModule,
    preloadIntent() {
      preloadModule().catch(() => null);
      preloadFxModule().catch(() => null);
    },
    loadRuntime,
    installKeyboard,
    uninstallKeyboard,
  };
}
