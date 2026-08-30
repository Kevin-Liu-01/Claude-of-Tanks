import type * as THREE from 'three';
import {
  createWorldBuildCoordinator,
  type WorldBuildCoordinator,
  type WorldBuildCoordinatorDependencies,
  type WorldPrefetchStats,
} from './worldBuildCoordinator.ts';
import {
  createMinimapAssetRuntime,
  type MinimapLoadTrace,
} from '../ui/minimapAssetRuntime.ts';

type MaybePromise<T> = T | PromiseLike<T>;
type ProgressListener = (fraction: number, label: string) => void;

export interface WorldRaycastHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  dist: number;
  kind: string;
}

export interface ActiveWorld<SkyConfig = unknown> {
  mapId: string;
  group: THREE.Object3D;
  config: { sky?: SkyConfig };
  raycast(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDistance: number,
  ): WorldRaycastHit | null;
}

export interface WorldActivationTrace {
  id: string;
  cached: boolean;
  build?: number;
  buildDetail?: Record<string, unknown>;
  present?: number;
  compile?: number;
  shadowWarm?: number;
  clouds?: number;
  activate?: number;
  totalMs?: number;
}

export interface WorldActivationOptions {
  precompile?: boolean;
  compilePrograms?: boolean;
  services?: boolean;
}

type CoordinatorDependencies<World extends ActiveWorld> = Omit<
  WorldBuildCoordinatorDependencies<World>,
  'getCurrentWorld'
>;

export interface WorldActivationRuntimeOptions<
  World extends ActiveWorld<SkyConfig>,
  Collider,
  SkyConfig = unknown,
> {
  initialMapId: string;
  coordinator?: WorldBuildCoordinator<World>;
  coordinatorDependencies?: CoordinatorDependencies<World>;
  swapSceneWorld(previous: THREE.Object3D | null, next: THREE.Object3D): void;
  setSceneWorldActive(root: THREE.Object3D, active: boolean): void;
  ensureCloudTextures(): void;
  ensureCloudTexturesChunked?(yieldFrame: () => Promise<void>): Promise<void>;
  awaitInitialCloudWarm(): Promise<void>;
  applySkyPreset(skyConfig: SkyConfig): void;
  setSun(skyConfig: SkyConfig): void;
  getFogDensity(): number;
  onFogDensityChanged(density: number): void;
  canCreateCollider(): boolean;
  createCollider(world: World): Collider;
  placeGarage(): void;
  isMinimapReady(): boolean;
  buildMinimap(world: World, textured: boolean): void;
  loadMinimapAsset(world: World, url: string): MaybePromise<boolean>;
  compilePrograms(root: THREE.Object3D): void;
  linkerBreathingSlices(maxSlices: number): Iterable<unknown>;
  updateShadowFrustums(): void;
  warmShadowFrame(): void;
  nextFrame(): Promise<void>;
  baseUrl?: string;
  minimapAssetVersion?: string;
  now?: () => number;
  publishActivationTrace?(trace: WorldActivationTrace): void;
  publishMinimapTrace?(trace: MinimapLoadTrace): void;
}

export interface WorldActivationRuntime<
  World extends ActiveWorld,
  Collider,
> {
  readonly current: World | null;
  readonly collider: Collider | null;
  readonly pendingMapId: string;
  readonly dormant: boolean;
  readonly servicesMapId: string | null;
  readonly cache: Map<string, World>;
  readonly resourceLimits: WorldBuildCoordinator<World>['resourceLimits'];
  readonly prefetchStats: WorldPrefetchStats;
  readonly lastRelease: WorldBuildCoordinator<World>['lastRelease'];
  loadModule(): ReturnType<WorldBuildCoordinator<World>['loadModule']>;
  enforceCacheBudget(): void;
  prefetch(mapId: string, options?: { intent?: boolean }): Promise<World | null> | null;
  cancelBackgroundExcept(mapId?: string | null): void;
  setPendingMapId(mapId: string): void;
  raycast(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDistance: number,
  ): WorldRaycastHit | null;
  buildMinimap(world: World, textured?: boolean): void;
  queueMinimap(world?: World | null): Promise<boolean> | null;
  prepareServices(world?: World | null): void;
  prepareBattleServices(world?: World | null): void;
  activate(world: World, options?: { services?: boolean }): World;
  switchMap(mapId: string): World | Promise<World>;
  ensure(
    mapId?: string | null,
    onProgress?: ProgressListener | null,
    options?: WorldActivationOptions | null,
  ): Promise<World>;
  setDormant(dormant: boolean): void;
}

/**
 * Own the browser presentation lifetime of one active battlefield.
 *
 * The construction coordinator owns deterministic builds and cache eviction;
 * this deeper owner adds the one active-world decision, atmosphere, services,
 * minimap upgrade, covered GPU warm, dormancy, and trace. Callers do not own
 * partial map state or reproduce activation order.
 */
export function createWorldActivationRuntime<
  World extends ActiveWorld<SkyConfig>,
  Collider,
  SkyConfig = unknown,
>(options: WorldActivationRuntimeOptions<World, Collider, SkyConfig>): WorldActivationRuntime<World, Collider> {
  if (!options.initialMapId) throw new TypeError('world activation requires an initial map id');
  const now = options.now ?? (() => performance.now());
  let current: World | null = null;
  let collider: Collider | null = null;
  let pendingMapId = options.initialMapId;
  let dormant = false;
  let servicesMapId: string | null = null;
  let skyMapId = options.initialMapId;

  const coordinatorDependencies = options.coordinatorDependencies;
  let coordinator = options.coordinator;
  if (!coordinator) {
    if (!coordinatorDependencies) {
      throw new TypeError('world activation requires coordinator dependencies');
    }
    coordinator = createWorldBuildCoordinator<World>({
      ...coordinatorDependencies,
      getCurrentWorld: () => current,
    });
  }
  const cache = coordinator.cache;
  const baseUrl = options.baseUrl || '/';
  const assetVersion = options.minimapAssetVersion || 'spawn-oriented-v2';
  const assetUrl = (mapId: string): string => (
    `${baseUrl}minimaps/${encodeURIComponent(mapId)}.webp?v=${assetVersion}`
  );
  const minimapAssets = createMinimapAssetRuntime<World>({
    isReady: options.isMinimapReady,
    getActiveWorld: () => current,
    isPrepared: (mapId) => servicesMapId === mapId,
    loadAsset: options.loadMinimapAsset,
    buildFallback: (world) => options.buildMinimap(world, false),
    assetUrl,
    now,
    publishTrace: options.publishMinimapTrace,
  });

  const queueMinimap = (world: World | null = current): Promise<boolean> | null => (
    minimapAssets.queue(world)
  );

  const prepareServices = (world: World | null = current): void => {
    if (!world || current !== world) return;
    collider = options.canCreateCollider() ? options.createCollider(world) : null;
    options.placeGarage();
    if (servicesMapId !== world.mapId) servicesMapId = world.mapId;
    queueMinimap(world);
  };

  const prepareBattleServices = (world: World | null = current): void => {
    if (!world || current !== world) return;
    collider = options.createCollider(world);
    options.placeGarage();
    if (servicesMapId !== world.mapId) servicesMapId = world.mapId;
    queueMinimap(world);
  };

  const activate = (world: World, { services = true }: { services?: boolean } = {}): World => {
    options.swapSceneWorld(current?.group ?? null, world.group);
    current = world;
    dormant = false;
    options.ensureCloudTextures();
    pendingMapId = world.mapId;
    const skyConfig = world.config.sky ?? {} as SkyConfig;
    if (skyMapId !== world.mapId) {
      skyMapId = world.mapId;
      options.applySkyPreset(skyConfig);
      options.onFogDensityChanged(options.getFogDensity());
    }
    options.setSun(skyConfig);
    if (services) prepareServices(world);
    else {
      collider = null;
      if (servicesMapId !== world.mapId) servicesMapId = null;
    }
    coordinator.enforceCacheBudget();
    return world;
  };

  const ensure = async (
    mapId: string | null = null,
    onProgress: ProgressListener | null = null,
    activationOptions: WorldActivationOptions | null = null,
  ): Promise<World> => {
    const id = mapId || pendingMapId;
    coordinator.cancelBackgroundExcept(id);
    let next = cache.get(id) ?? null;
    const trace: WorldActivationTrace = { id, cached: !!next };
    const startedAt = now();
    let stageAt = startedAt;
    const mark = (key: keyof WorldActivationTrace): void => {
      const sample = now();
      if (key !== 'id' && key !== 'cached') (trace[key] as number | undefined) = Math.round(sample - stageAt);
      stageAt = sample;
    };

    if (!next) {
      const request = coordinator.beginBuild(id, onProgress);
      try {
        next = await request.promise;
        trace.buildDetail = { ...request.stageTimings };
        const built = next as World & {
          _buildDetail?: {
            vegetation?: Record<string, unknown>;
            terrain?: Record<string, unknown>;
          };
        };
        if (built._buildDetail?.vegetation) {
          trace.buildDetail.vegetationDetail = { ...built._buildDetail.vegetation };
        }
        if (built._buildDetail?.terrain) {
          trace.buildDetail.terrainDetail = { ...built._buildDetail.terrain };
        }
      } finally {
        if (onProgress && request.listeners) request.listeners.delete(onProgress);
      }
    }
    mark('build');

    next.group.visible = false;
    if (activationOptions?.precompile !== false) await options.nextFrame();
    mark('present');
    next.group.visible = true;

    if (activationOptions?.precompile !== false || activationOptions?.compilePrograms === true) {
      try { options.compilePrograms(next.group); } catch { /* real render remains fallback */ }
      for (const _ of options.linkerBreathingSlices(24)) await options.nextFrame();
    }
    mark('compile');
    if (activationOptions?.precompile !== false) await options.nextFrame();

    if (activationOptions?.precompile !== false) {
      const children = next.group.children.slice();
      const cohorts = Math.min(3, Math.max(1, children.length));
      for (let cohort = 0; cohort < cohorts; cohort += 1) {
        const lastVisible = Math.ceil(((cohort + 1) / cohorts) * children.length) - 1;
        const hidden: THREE.Object3D[] = [];
        for (let index = lastVisible + 1; index < children.length; index += 1) {
          if (children[index].visible) {
            children[index].visible = false;
            hidden.push(children[index]);
          }
        }
        try {
          options.updateShadowFrustums();
          options.warmShadowFrame();
        } catch { /* real render remains fallback */ }
        for (const child of hidden) child.visible = true;
        for (const _ of options.linkerBreathingSlices(24)) await options.nextFrame();
        await options.nextFrame();
      }
    }
    mark('shadowWarm');

    await options.awaitInitialCloudWarm();
    await options.ensureCloudTexturesChunked?.(options.nextFrame);
    mark('clouds');

    const needsServices = activationOptions?.services !== false
      && servicesMapId !== next.mapId;
    if (current !== next || dormant) {
      activate(next, { services: activationOptions?.services !== false });
    } else if (needsServices) {
      prepareServices(next);
    }
    mark('activate');
    trace.totalMs = Math.round(now() - startedAt);
    options.publishActivationTrace?.(trace);
    return current as World;
  };

  return {
    get current() { return current; },
    get collider() { return collider; },
    get pendingMapId() { return pendingMapId; },
    get dormant() { return dormant; },
    get servicesMapId() { return servicesMapId; },
    cache,
    resourceLimits: coordinator.resourceLimits,
    prefetchStats: coordinator.stats,
    get lastRelease() { return coordinator.lastRelease; },
    loadModule: () => coordinator.loadModule(),
    enforceCacheBudget: () => coordinator.enforceCacheBudget(),
    prefetch: (mapId, prefetchOptions) => coordinator.prefetch(mapId, prefetchOptions) as Promise<World | null> | null,
    cancelBackgroundExcept: (mapId) => coordinator.cancelBackgroundExcept(mapId),
    setPendingMapId(mapId) {
      if (mapId) pendingMapId = mapId;
    },
    raycast(origin, direction, maxDistance) {
      return current?.raycast(origin, direction, maxDistance) ?? null;
    },
    buildMinimap: (world, textured = true) => options.buildMinimap(world, textured),
    queueMinimap,
    prepareServices,
    prepareBattleServices,
    activate,
    switchMap(mapId) {
      if (current?.mapId === mapId) return current;
      const cached = cache.get(mapId);
      return cached ? activate(cached) : ensure(mapId);
    },
    ensure,
    setDormant(nextDormant) {
      if (!current || dormant === nextDormant) return;
      dormant = nextDormant;
      options.setSceneWorldActive(current.group, !nextDormant);
    },
  };
}
