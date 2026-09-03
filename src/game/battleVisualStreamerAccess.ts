import type { RuntimeValue } from '../runtimeTypes.ts';
import type {
  BattleVisualEntity,
  BattleVisualStreamer,
  BattleVisualStreamerOptions,
} from './battleVisualStreamer.ts';

type StreamerModule = Pick<
  typeof import('./battleVisualStreamer.ts'),
  'createBattleVisualStreamer'
>;

interface StreamerAccessLoaders {
  load(): Promise<StreamerModule>;
}

export interface BattleVisualStreamerAccess<
  Entity extends BattleVisualEntity = BattleVisualEntity,
> {
  preload(): Promise<BattleVisualStreamer<Entity>>;
  readonly current: BattleVisualStreamer<Entity> | null;
}

const DEFAULT_LOADERS: StreamerAccessLoaders = {
  load: () => import('./battleVisualStreamer.ts'),
};

/** Retryable access boundary for the battle-only visual staging implementation. */
export function createBattleVisualStreamerAccess<
  TGame extends { tanks: BattleVisualEntity[] },
>(
  options: BattleVisualStreamerOptions<TGame>,
  loaders: StreamerAccessLoaders = DEFAULT_LOADERS,
): BattleVisualStreamerAccess<TGame['tanks'][number]> {
  type Entity = TGame['tanks'][number];
  let current: BattleVisualStreamer<Entity> | null = null;
  let pending: Promise<BattleVisualStreamer<Entity>> | null = null;

  const preload = (): Promise<BattleVisualStreamer<Entity>> => {
    if (current) return Promise.resolve(current);
    if (pending) return pending;
    const request = loaders.load().then((module) => {
      current = module.createBattleVisualStreamer(options);
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
