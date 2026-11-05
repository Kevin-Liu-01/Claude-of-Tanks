import type {
  SoloBattleStartOptions,
  SoloBattleStartRuntime,
  SoloBattleStartRuntimeOptions,
} from './soloBattleStartRuntime.ts';
import { createLazyChunk } from '../app/lazyChunk.ts';

interface SoloBattleStartModule {
  createSoloBattleStartRuntime(options: SoloBattleStartRuntimeOptions): SoloBattleStartRuntime;
}

type SoloBattleStartLoader = () => Promise<SoloBattleStartModule>;

interface SoloBattleStartAccess extends SoloBattleStartRuntime {
  preload(): Promise<SoloBattleStartRuntime>;
}

interface SoloBattleStartAccessOptions {
  options: () => SoloBattleStartRuntimeOptions;
  load?: SoloBattleStartLoader;
}

/** Retryable intent owner for the solo-only round activation transaction. */
export function createSoloBattleStartAccess({
  options,
  load = () => import('./soloBattleStartRuntime.ts'),
}: SoloBattleStartAccessOptions): SoloBattleStartAccess {
  if (typeof options !== 'function' || typeof load !== 'function') {
    throw new TypeError('solo battle start access requires options and a loader');
  }

  let runtime: SoloBattleStartRuntime | null = null;
  // (2026-11-02 audit R6, round 2 U35) one app/lazyChunk.ts chunk: a failed transfer is asked again under the one policy
  // (at once after one failure, then past its backoff; a removed chunk shows the reload action), not at once by every call
  const chunk = createLazyChunk(() => load().then((module) => (runtime = module.createSoloBattleStartRuntime(options()))));
  const preload = () => chunk.load();

  return {
    preload,
    start(specId: string, mapId?: string | null, startOptions?: SoloBattleStartOptions) {
      if (!runtime) throw new Error('solo battle start runtime is not ready');
      runtime.start(specId, mapId, startOptions);
    },
  };
}
