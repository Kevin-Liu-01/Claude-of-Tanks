import type {
  SoloBattleStartOptions,
  SoloBattleStartRuntime,
  SoloBattleStartRuntimeOptions,
} from './soloBattleStartRuntime.ts';

interface SoloBattleStartModule {
  createSoloBattleStartRuntime(options: SoloBattleStartRuntimeOptions): SoloBattleStartRuntime;
}

type SoloBattleStartLoader = () => Promise<SoloBattleStartModule>;

export interface SoloBattleStartAccess extends SoloBattleStartRuntime {
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
  let pending: Promise<SoloBattleStartRuntime> | null = null;

  const preload = () => {
    if (runtime) return Promise.resolve(runtime);
    if (pending) return pending;
    const request = load().then((module) => {
      runtime = module.createSoloBattleStartRuntime(options());
      return runtime;
    });
    pending = request;
    request.catch(() => {
      if (pending === request) pending = null;
    });
    return request;
  };

  return {
    preload,
    start(specId: string, mapId?: string | null, startOptions?: SoloBattleStartOptions) {
      if (!runtime) throw new Error('solo battle start runtime is not ready');
      runtime.start(specId, mapId, startOptions);
    },
  };
}
