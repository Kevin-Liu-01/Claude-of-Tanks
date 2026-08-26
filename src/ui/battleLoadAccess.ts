export interface BattleLoadRuntime {
  readonly visible: boolean;
  readonly covering: boolean;
  show(options: unknown): void;
  rosters(allies: unknown[], enemies: unknown[]): void;
  progress(fraction: number, label?: string): void;
  hide(): Promise<void>;
}

interface BattleLoadModule {
  createBattleLoadScreen(): BattleLoadRuntime;
}

interface BattleLoadAccessOptions {
  load?: () => Promise<BattleLoadModule>;
}

export interface BattleLoadAccess {
  preload(): Promise<BattleLoadRuntime>;
  readonly current: BattleLoadRuntime | null;
}

/** Retryable battle-only loading-screen boundary. */
export function createBattleLoadAccess({
  load = async () => await import('./battleLoad.js') as unknown as BattleLoadModule,
}: BattleLoadAccessOptions = {}): BattleLoadAccess {
  let current: BattleLoadRuntime | null = null;
  let pending: Promise<BattleLoadRuntime> | null = null;

  const preload = (): Promise<BattleLoadRuntime> => {
    if (current) return Promise.resolve(current);
    if (pending) return pending;
    const request = load().then((module) => {
      const runtime = module.createBattleLoadScreen();
      if (!runtime || typeof runtime.show !== 'function' || typeof runtime.hide !== 'function') {
        throw new TypeError('battle loading screen did not provide its runtime contract');
      }
      current = runtime;
      return runtime;
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
