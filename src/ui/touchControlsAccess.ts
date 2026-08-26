/** Retryable owner for the battle-only mobile control surface. */

export interface TouchControlsRuntime {
  readonly root: HTMLElement;
  readonly isLayout: boolean;
  refresh(): void;
  update(speedMps?: number): void;
}

export interface TouchControlsOptions {
  input: unknown;
  bus: unknown;
  isBattleActive(): boolean;
  onOpenSettings(): void;
  onToggleSound(): boolean;
  isSniper(): boolean;
}

interface TouchControlsModule {
  createTouchControls(options: TouchControlsOptions): TouchControlsRuntime;
}

interface TouchControlsLoaders {
  controls(): Promise<TouchControlsModule>;
}

export interface TouchControlsAccess {
  preload(): Promise<TouchControlsRuntime>;
  readonly current: TouchControlsRuntime | null;
}

const DEFAULT_LOADERS: TouchControlsLoaders = {
  controls: async () => await import('./touchControls.js') as unknown as TouchControlsModule,
};

export function createTouchControlsAccess(
  options: TouchControlsOptions,
  loaders: TouchControlsLoaders = DEFAULT_LOADERS,
): TouchControlsAccess {
  let current: TouchControlsRuntime | null = null;
  let pending: Promise<TouchControlsRuntime> | null = null;

  const preload = (): Promise<TouchControlsRuntime> => {
    if (current) return Promise.resolve(current);
    if (pending) return pending;
    const request = loaders.controls().then((module) => {
      current = module.createTouchControls(options);
      return current;
    }).catch((error: unknown) => {
      if (pending === request) pending = null;
      throw error;
    });
    pending = request;
    return request;
  };

  return {
    preload,
    get current() { return current; },
  };
}
