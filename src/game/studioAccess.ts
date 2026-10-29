import type { RuntimeValue } from '../runtimeTypes.ts';
interface StudioRuntime {
  active: boolean;
  tick(deltaSeconds: number, frameWallDtSeconds?: number): void;
  enter(options?: RuntimeValue): Promise<RuntimeValue> | RuntimeValue;
  /** The scene the boot URL carries (studio.ts bootScene); absent on the inactive placeholder. */
  bootScene?(): { readonly map: Promise<string | null>; open(fallbackMap: string): Promise<void> } | null;
}

interface StudioModule {
  createStudio(context: RuntimeValue): StudioRuntime;
}

interface StudioPresentation {
  readonly active: boolean;
  tick(deltaSeconds: number, frameWallDtSeconds?: number): void;
}

interface KeyboardEventTarget {
  addEventListener(type: 'keydown', listener: EventListener, options?: boolean): void;
  removeEventListener(type: 'keydown', listener: EventListener, options?: boolean): void;
}

interface StudioAccessOptions {
  loadModule(): Promise<StudioModule>;
  preloadFxModule(): Promise<RuntimeValue>;
  ensureFxRuntime(): Promise<RuntimeValue>;
  prepareRuntime(): void;
  createContext(fx: RuntimeValue): RuntimeValue;
  getPhase(): string;
  keyTarget?: KeyboardEventTarget | null;
  onEntryError?: (error: RuntimeValue) => void;
  /** While F8's (or the Studio link's) press waits for the Studio's code, before the entry's own cover takes over. */
  onPending?: (pending: boolean) => void;
  /** (264) Whether the Studio's code did not arrive: a chunk is not asked for again in this document, so the press reloads
   *  the page once online instead of asking again (main.ts: the kit's pressFailed on the Studio links). */
  pressFailed?: () => boolean;
}

interface StudioAccess {
  readonly presentation: StudioPresentation;
  preloadModule(): Promise<StudioModule>;
  preloadIntent(): void;
  loadRuntime(): Promise<StudioRuntime>;
  /** Enter the Studio from the Garage (the Garage's Studio button; F8 there takes the same way). */
  open(): void;
  installKeyboard(): void;
  uninstallKeyboard(): void;
}

const INACTIVE_STUDIO: StudioRuntime = Object.freeze({
  active: false,
  tick() {},
  enter() { return Promise.resolve(); },
});

/** Lazy boundary for Studio code, FX acquisition, and F8 ownership. A load that threw is forgotten; a chunk that did not
 *  arrive is not asked for again in this document, and the press reloads the page instead (`pressFailed`). */
export function createStudioAccess({
  loadModule,
  preloadFxModule,
  ensureFxRuntime,
  prepareRuntime,
  createContext,
  getPhase,
  keyTarget = typeof window !== 'undefined' ? window : null,
  onEntryError = (error) => console.error('[studio] lazy entry failed', error),
  onPending = () => {},
  pressFailed = () => false,
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
    }).catch((error: RuntimeValue) => {
      if (runtimePromise === request) runtimePromise = null;
      throw error;
    });
    runtimePromise = request;
    return request;
  };

  const open = (): void => {
    if (getPhase() !== 'garage') return;
    if (pressFailed()) return;
    // the press answers at once (the loading census 262: F8 gave no sign until the entry's cover, seconds later on a slow
    // network)
    onPending(true);
    loadRuntime()
      .then((loaded) => { onPending(false); return loaded.enter(); })
      .catch((error: RuntimeValue) => { onPending(false); onEntryError(error); });
  };

  const onKeyDown: EventListener = (rawEvent): void => {
    const event = rawEvent as KeyboardEvent;
    if (event.code !== 'F8' || event.repeat || getPhase() !== 'garage') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    open();
  };

  const installKeyboard = (): void => {
    if (keyboardInstalled || !keyTarget) return;
    keyTarget.addEventListener('keydown', onKeyDown, true);
    keyboardInstalled = true;
  };

  const presentation: StudioPresentation = {
    get active() { return runtime.active; },
    tick(deltaSeconds, frameWallDtSeconds = deltaSeconds) { runtime.tick(deltaSeconds, frameWallDtSeconds); },
  };

  return {
    presentation,
    preloadModule,
    preloadIntent() {
      preloadModule().catch(() => null);
      preloadFxModule().catch(() => null);
    },
    loadRuntime,
    open,
    installKeyboard,
    uninstallKeyboard,
  };
}
