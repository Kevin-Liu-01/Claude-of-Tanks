type MaybePromise<T> = T | PromiseLike<T>;

export interface MinimapWorldRef {
  mapId: string;
}

export interface MinimapLoadTrace {
  mapId: string;
  state: 'queued' | 'loading' | 'ready' | 'stale' | 'fallback';
  startedAt: number;
  totalMs?: number;
  error?: string;
}

interface MinimapAssetRuntimeOptions<World extends MinimapWorldRef> {
  isReady(): boolean;
  getActiveWorld(): World | null;
  isPrepared(mapId: string): boolean;
  loadAsset(world: World, url: string): MaybePromise<boolean>;
  buildFallback(world: World): void;
  assetUrl(mapId: string): string;
  now(): number;
  publishTrace?(trace: MinimapLoadTrace): void;
}

export interface MinimapAssetRuntime<World extends MinimapWorldRef> {
  queue(world?: World | null): Promise<boolean> | null;
  dispose(): void;
}

/**
 * Own the asynchronous upgrade from procedural cartography to a baked minimap.
 * World activation and HUD rendering stay outside; this boundary owns only
 * coalescing, stale-result rejection, trace state, and the exact fallback edge.
 */
export function createMinimapAssetRuntime<World extends MinimapWorldRef>({
  isReady,
  getActiveWorld,
  isPrepared,
  loadAsset,
  buildFallback,
  assetUrl,
  now,
  publishTrace = () => undefined,
}: MinimapAssetRuntimeOptions<World>): MinimapAssetRuntime<World> {
  const required = [isReady, getActiveWorld, isPrepared, loadAsset,
    buildFallback, assetUrl, now, publishTrace];
  if (required.some((entry) => typeof entry !== 'function')) {
    throw new TypeError('minimap asset runtime requires every lifecycle port');
  }

  let installedMapId: string | null = null;
  let generation = 0;
  let pending: {
    world: World;
    generation: number;
    promise: Promise<boolean>;
  } | null = null;
  let disposed = false;

  const isCurrent = (world: World, candidateGeneration: number) => (
    !disposed
    && candidateGeneration === generation
    && getActiveWorld() === world
    && isPrepared(world.mapId)
  );

  const queue = (world: World | null = getActiveWorld()) => {
    if (disposed || !isReady() || !world || getActiveWorld() !== world
      || installedMapId === world.mapId) return null;
    if (pending?.world === world) return pending.promise;

    const candidateGeneration = ++generation;
    const trace: MinimapLoadTrace = {
      mapId: world.mapId,
      state: 'queued',
      startedAt: now(),
    };
    publishTrace(trace);

    let promise: Promise<boolean>;
    promise = (async () => {
      if (!isCurrent(world, candidateGeneration)) return false;
      trace.state = 'loading';
      const installed = await loadAsset(world, assetUrl(world.mapId));
      if (!installed || !isCurrent(world, candidateGeneration)) {
        trace.state = 'stale';
        return false;
      }
      installedMapId = world.mapId;
      trace.state = 'ready';
      trace.totalMs = Math.round(now() - trace.startedAt);
      return true;
    })().catch((error: unknown) => {
      trace.state = 'fallback';
      trace.error = String(error);
      if (isCurrent(world, candidateGeneration)) buildFallback(world);
      return false;
    }).finally(() => {
      if (pending?.generation === candidateGeneration) pending = null;
    });

    pending = { world, generation: candidateGeneration, promise };
    return promise;
  };

  const dispose = () => {
    disposed = true;
    generation++;
    pending = null;
    installedMapId = null;
  };

  return { queue, dispose };
}
