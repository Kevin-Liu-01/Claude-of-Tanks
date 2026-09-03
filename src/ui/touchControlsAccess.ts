import type { RuntimeValue } from '../runtimeTypes.ts';
/** Retryable owner for the battle-only mobile control surface. */
import type { ActionId } from '../game/input.ts';
import type { EventBus } from '../game/stateCore.ts';

export interface TouchControlsInput {
  isTouchLayout(): boolean;
  setVirtualMove(x: number, y: number): void;
  addVirtualAim(dx: number, dy: number): void;
  pressVirtual(action: ActionId): void;
  releaseVirtual(action: ActionId): void;
  tapVirtual(action: ActionId): void;
}

export interface TouchControlsRuntime {
  readonly root: HTMLElement;
  readonly isLayout: boolean;
  refresh(): void;
}

export interface TouchControlsOptions {
  input: TouchControlsInput;
  bus: EventBus;
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
  controls: async () => await import('./touchControls.ts'),
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
    }).catch((error: RuntimeValue) => {
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
