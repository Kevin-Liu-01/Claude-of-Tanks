import type {
  BattleVisualStreamer,
  BattleVisualStreamerOptions,
} from './battleVisualStreamer.ts';

interface StreamerModule {
  createBattleVisualStreamer<TGame extends { tanks: any[] }>(
    options: BattleVisualStreamerOptions<TGame>,
  ): BattleVisualStreamer;
}

interface StreamerAccessLoaders {
  load(): Promise<StreamerModule>;
}

export interface BattleVisualStreamerAccess {
  preload(): Promise<BattleVisualStreamer>;
  readonly current: BattleVisualStreamer | null;
}

const DEFAULT_LOADERS: StreamerAccessLoaders = {
  load: async () => await import('./battleVisualStreamer.ts') as unknown as StreamerModule,
};

/** Retryable access boundary for the battle-only visual staging implementation. */
export function createBattleVisualStreamerAccess<TGame extends { tanks: any[] }>(
  options: BattleVisualStreamerOptions<TGame>,
  loaders: StreamerAccessLoaders = DEFAULT_LOADERS,
): BattleVisualStreamerAccess {
  let current: BattleVisualStreamer | null = null;
  let pending: Promise<BattleVisualStreamer> | null = null;

  const preload = (): Promise<BattleVisualStreamer> => {
    if (current) return Promise.resolve(current);
    if (pending) return pending;
    const request = loaders.load().then((module) => {
      current = module.createBattleVisualStreamer(options);
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
