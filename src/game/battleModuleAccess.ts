import type { RuntimeValue } from '../runtimeTypes.ts';
type PlayMenuModule = typeof import('../ui/playMenu.ts');

interface BattleModuleLoaders {
  playMenu(): Promise<PlayMenuModule>;
}

interface BattleModuleAccess {
  loadPlayMenuModule(): Promise<PlayMenuModule>;
}

const DEFAULT_LOADERS: BattleModuleLoaders = {
  playMenu: async () => await import('../ui/playMenu.ts'),
};

function retryable<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    if (pending) return pending;
    const request = load().catch((error: RuntimeValue) => {
      if (pending === request) pending = null;
      throw error;
    });
    pending = request;
    return request;
  };
}

/**
 * Own the battle-only dynamic import shared by garage intent and entry (the
 * Play menu; the multiplayer composition has its own access in main). Failed
 * transfers are retryable; concurrent intent and click paths share one request
 * so slow clients never download or evaluate the same chunk twice.
 */
export function createBattleModuleAccess(
  loaders: BattleModuleLoaders = DEFAULT_LOADERS,
): BattleModuleAccess {
  if (!loaders || Object.values(loaders).some((load) => typeof load !== 'function')) {
    throw new TypeError('battle module access requires all loaders');
  }
  return {
    loadPlayMenuModule: retryable(loaders.playMenu),
  };
}
