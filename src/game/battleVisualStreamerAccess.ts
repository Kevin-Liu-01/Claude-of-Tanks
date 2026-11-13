import type {
  BattleVisualEntity,
  BattleVisualStreamer,
  BattleVisualStreamerOptions,
} from './battleVisualStreamer.ts';
import { createLazyChunk } from '../app/lazyChunk.ts';

type StreamerModule = Pick<
  typeof import('./battleVisualStreamer.ts'),
  'createBattleVisualStreamer'
>;

interface StreamerAccessLoaders {
  load(): Promise<StreamerModule>;
}

interface BattleVisualStreamerAccess<
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
  // (2026-11-02 audit R6, round 2 U35) one app/lazyChunk.ts chunk: a failed transfer is asked again under the one policy
  // (at once after one failure, then past its backoff; a removed chunk shows the reload action), not at once by every call
  const chunk = createLazyChunk(() => loaders.load().then((module) => (current = module.createBattleVisualStreamer(options))));
  const preload = (): Promise<BattleVisualStreamer<Entity>> => chunk.load();

  return {
    preload,
    get current() { return current; },
  };
}
