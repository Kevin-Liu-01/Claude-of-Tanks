import type {
  NetworkBattlePresentationOptions,
  NetworkBattlePresentationRequest,
  NetworkBattlePresentationRuntime,
} from './networkBattlePresentationRuntime.ts';

interface NetworkBattlePresentationModule {
  createNetworkBattlePresentationRuntime(
    options: NetworkBattlePresentationOptions,
  ): NetworkBattlePresentationRuntime;
}

type RuntimeLoader = () => Promise<NetworkBattlePresentationModule>;

interface NetworkBattlePresentationAccess {
  preload(): Promise<NetworkBattlePresentationRuntime>;
  present(request: NetworkBattlePresentationRequest): Promise<void>;
}

interface NetworkBattlePresentationAccessOptions {
  options: () => NetworkBattlePresentationOptions;
  load?: RuntimeLoader;
}

/** Retryable intent boundary for multiplayer-only presentation policy. */
export function createNetworkBattlePresentationAccess({
  options,
  load = () => import('./networkBattlePresentationRuntime.ts'),
}: NetworkBattlePresentationAccessOptions): NetworkBattlePresentationAccess {
  if (typeof options !== 'function' || typeof load !== 'function') {
    throw new TypeError('network battle presentation access requires options and a loader');
  }

  let runtime: NetworkBattlePresentationRuntime | null = null;
  let pending: Promise<NetworkBattlePresentationRuntime> | null = null;

  const preload = () => {
    if (runtime) return Promise.resolve(runtime);
    if (pending) return pending;
    const request = load().then((module) => {
      runtime = module.createNetworkBattlePresentationRuntime(options());
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
    async present(request) {
      const owner = await preload();
      return owner.present(request);
    },
  };
}
