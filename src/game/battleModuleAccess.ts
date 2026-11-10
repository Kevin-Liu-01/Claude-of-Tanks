import { createLazyChunk } from '../app/lazyChunk.ts';
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

// (2026-11-02 audit R6, round 2 U35) one app/lazyChunk.ts chunk: a failed transfer is asked again under the one policy (at
// once after one failure, then past its backoff; a removed chunk shows the reload action), not at once by every call
function retryable<T>(load: () => Promise<T>): () => Promise<T> {
  const chunk = createLazyChunk(load);
  return () => chunk.load();
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
