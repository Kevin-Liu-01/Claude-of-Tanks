/** Retryable owner for the battle-only mobile control surface. */
import type { ActionId } from '../game/input.ts';
import type { EventBus } from '../game/stateCore.ts';
import { createLazyChunk } from '../app/lazyChunk.ts';

interface TouchControlsInput {
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
  getFlightKind?(): string | undefined;
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
  // (2026-11-02 audit R6, round 2 U35) one app/lazyChunk.ts chunk: a failed transfer is asked again under the one policy
  // (at once after one failure, then past its backoff; a removed chunk shows the reload action), not at once by every call
  const chunk = createLazyChunk(() => loaders.controls().then((module) => (current = module.createTouchControls(options))));
  const preload = (): Promise<TouchControlsRuntime> => chunk.load();

  return {
    preload,
    get current() { return current; },
  };
}
