export interface SoloBattleRuntime {
  setupBattle(...args: unknown[]): unknown;
  simStep(...args: unknown[]): unknown;
  createCollider(...args: unknown[]): unknown;
  prepareNextOpeningRoute(...args: unknown[]): unknown;
}

export type SoloBattleRuntimeLoader = () => Promise<SoloBattleRuntime>;

export interface SoloBattleRuntimeAccess extends SoloBattleRuntime {
  preload(): Promise<SoloBattleRuntime>;
  isReady(): boolean;
}

/**
 * Retryable lazy access to the legacy solo-authority graph. The composition
 * root receives stable call sites without owning promise/error state, while a
 * rejected transfer can be attempted again instead of permanently wedging
 * first battle entry.
 */
export function createSoloBattleRuntimeAccess(
  load: SoloBattleRuntimeLoader = () => import('./soloBattleRuntime.ts'),
): SoloBattleRuntimeAccess {
  let runtime: SoloBattleRuntime | null = null;
  let pending: Promise<SoloBattleRuntime> | null = null;

  const preload = () => {
    if (runtime) return Promise.resolve(runtime);
    if (pending) return pending;
    const request = load().then((loaded) => {
      runtime = loaded;
      return loaded;
    });
    pending = request;
    request.catch(() => {
      if (pending === request) pending = null;
    });
    return request;
  };

  const requireRuntime = () => {
    if (!runtime) throw new Error('Solo battle runtime is not ready.');
    return runtime;
  };

  return {
    preload,
    isReady: () => runtime !== null,
    setupBattle: (...args) => requireRuntime().setupBattle(...args),
    simStep: (...args) => requireRuntime().simStep(...args),
    createCollider: (...args) => requireRuntime().createCollider(...args),
    prepareNextOpeningRoute: (...args) => requireRuntime().prepareNextOpeningRoute(...args),
  };
}
