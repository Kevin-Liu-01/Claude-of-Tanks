import type * as THREE from 'three';
import {
  createFrameBudgetYielder,
  createOpaqueLoadingYielder,
} from '../engine/frameScheduler.ts';
import {
  disposeObject3DResources,
  residentResourceLimits,
} from '../engine/resourceLifetime.js';

interface WorldScene {
  group: THREE.Object3D;
}

type ProgressListener = (fraction: number, label: string) => void;
type LoadingYield = (force?: boolean) => Promise<void>;

interface WorldMapModule {
  createMapAsync(
    engineContext: unknown,
    options: { mapId: string; seed: number },
    progress: (label: string, fraction: number) => Promise<void>,
    slicing: { fineSlices: boolean },
  ): Promise<WorldScene>;
}

interface GarageActivity {
  phase: string;
  transitionActive: boolean;
  lastActivityAt: number;
}

interface ResourceLimits {
  pedestalVisuals: number;
  worldScenes: number;
}

interface ReleaseReceipt {
  id: string;
  objects: number;
  geometries: number;
  materials: number;
  textures: number;
}

interface BackgroundWorkLease {
  release(): void;
}

interface BuildRecord {
  id: string;
  fraction: number;
  label: string;
  listeners: Set<ProgressListener>;
  promise: Promise<WorldScene> | null;
  stageTimings: Record<string, number>;
  stageLabel: string | null;
  stageMark: number;
  background: boolean;
  waitForGarageLull: boolean;
  cancelled: boolean;
}

export interface WorldPrefetchStats {
  requested: number;
  completed: number;
  joined: number;
  promoted: number;
  cancelled: number;
  skippedCapacity: number;
  lastMap: string | null;
  lastMs: number;
  active: string | null;
}

export interface WorldBuildCoordinatorDependencies {
  engineContext: unknown;
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  deviceTier: string;
  getCurrentWorld(): WorldScene | null;
  getGarageActivity(): GarageActivity;
  releaseShadowMaterial(resource: unknown): void;
  loadModule?: () => Promise<WorldMapModule>;
  now?: () => number;
  sleep?: (durationMs: number) => Promise<void>;
  foregroundYielder?: () => LoadingYield;
  backgroundYielder?: () => LoadingYield;
  acquireBackgroundWork?: (
    kind: 'world' | 'world-intent',
    stillValid: () => boolean,
  ) => Promise<BackgroundWorkLease | null>;
  resourceLimits?: ResourceLimits;
}

export interface WorldBuildRequest {
  promise: Promise<WorldScene>;
  listeners: Set<ProgressListener> | null;
  fraction: number;
  label: string;
  stageTimings: Record<string, number>;
}

export interface WorldBuildCoordinator {
  readonly cache: Map<string, WorldScene>;
  readonly resourceLimits: ResourceLimits;
  readonly stats: WorldPrefetchStats;
  readonly lastRelease: ReleaseReceipt | null;
  loadModule(): Promise<WorldMapModule>;
  enforceCacheBudget(): void;
  beginBuild(
    mapId: string,
    onProgress?: ProgressListener | null,
    options?: { background?: boolean; waitForGarageLull?: boolean },
  ): WorldBuildRequest;
  prefetch(mapId: string, options?: { intent?: boolean }): Promise<WorldScene | null> | null;
  cancelBackgroundExcept(mapId?: string | null): void;
}

const STAGE_KEYS: Readonly<Record<string, string>> = Object.freeze({
  'Surveying terrain': 'heightField',
  'Building terrain meshes': 'terrain',
  'Planting vegetation': 'vegetation',
  'Placing structures': 'props',
  'Sealing the battlefield': 'assemble',
});

/**
 * Own map transfer, deterministic construction, background pacing, promotion,
 * cancellation, residency, and eviction. The active-world decision remains
 * with the application composition root; this owner only builds and retains
 * complete world scenes.
 */
export function createWorldBuildCoordinator(
  dependencies: WorldBuildCoordinatorDependencies,
): WorldBuildCoordinator {
  const now = dependencies.now ?? (() => performance.now());
  const sleep = dependencies.sleep ?? ((durationMs: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, durationMs)));
  const cache = new Map<string, WorldScene>();
  const builds = new Map<string, BuildRecord>();
  const limits = dependencies.resourceLimits
    ?? residentResourceLimits(dependencies.deviceTier) as ResourceLimits;
  const stats: WorldPrefetchStats = {
    requested: 0,
    completed: 0,
    joined: 0,
    promoted: 0,
    cancelled: 0,
    skippedCapacity: 0,
    lastMap: null,
    lastMs: 0,
    active: null,
  };
  let modulePromise: Promise<WorldMapModule> | null = null;
  let lastRelease: ReleaseReceipt | null = null;

  const loadModule = (): Promise<WorldMapModule> => {
    if (!modulePromise) {
      modulePromise = dependencies.loadModule
        ? dependencies.loadModule()
        : import('./map.js') as Promise<WorldMapModule>;
    }
    return modulePromise;
  };

  const enforceCacheBudget = (): void => {
    if (!Number.isFinite(limits.worldScenes)) return;
    for (const [id, cached] of cache) {
      if (cache.size <= limits.worldScenes) break;
      if (cached === dependencies.getCurrentWorld() || builds.has(id)) continue;
      cache.delete(id);
      const preserveRoots = dependencies.scene.children.filter(
        (child) => child !== cached.group,
      );
      const released = disposeObject3DResources(cached.group, {
        preserveRoots,
        onDispose: (type: string, resource: unknown) => {
          if (type === 'material') dependencies.releaseShadowMaterial(resource);
        },
      });
      dependencies.renderer.renderLists?.dispose?.();
      lastRelease = { id, ...released };
    }
  };

  const beginBuild = (
    mapId: string,
    onProgress: ProgressListener | null = null,
    options: { background?: boolean; waitForGarageLull?: boolean } = {},
  ): WorldBuildRequest => {
    const cached = cache.get(mapId);
    if (cached) {
      return {
        promise: Promise.resolve(cached), listeners: null, fraction: 1, label: 'Ready',
        stageTimings: {},
      };
    }

    const background = options.background ?? false;
    const waitForGarageLull = options.waitForGarageLull ?? true;
    let record = builds.get(mapId);
    if (record && !background && record.background) {
      record.background = false;
      stats.joined += 1;
      stats.promoted += 1;
    }

    if (!record) {
      const created: BuildRecord = {
        id: mapId,
        fraction: 0,
        label: 'Surveying terrain',
        listeners: new Set<ProgressListener>(),
        promise: null,
        stageTimings: {},
        stageLabel: null,
        stageMark: now(),
        background,
        waitForGarageLull,
        cancelled: false,
      };
      record = created;
      const startedAt = now();
      const startedInBackground = background;
      let backgroundLease: BackgroundWorkLease | null = null;
      const releaseBackgroundLease = (): void => {
        backgroundLease?.release();
        backgroundLease = null;
      };
      const finishBuildStage = (sampleNow = now()): void => {
        if (!created.stageLabel) return;
        const key = STAGE_KEYS[created.stageLabel] ?? created.stageLabel;
        created.stageTimings[key] = (created.stageTimings[key] ?? 0)
          + Math.round(sampleNow - created.stageMark);
        created.stageMark = sampleNow;
      };
      const yieldForeground = dependencies.foregroundYielder?.()
        ?? createOpaqueLoadingYielder(24, 80);
      const yieldBackground = dependencies.backgroundYielder?.()
        ?? createFrameBudgetYielder(4);

      const promise = loadModule().then(({ createMapAsync }) => createMapAsync(
        dependencies.engineContext,
        { mapId, seed: 1337 },
        async (label, fraction) => {
          // The previous lease covered the generator work that led to this
          // checkpoint. Release it before waiting or selecting the next lane.
          releaseBackgroundLease();
          if (created.cancelled) {
            stats.cancelled += 1;
            throw new Error(`Cancelled stale battlefield prefetch: ${mapId}`);
          }
          if (label !== created.stageLabel) {
            const sampleNow = now();
            finishBuildStage(sampleNow);
            created.stageLabel = label;
            created.stageMark = sampleNow;
          }
          created.label = label;
          created.fraction = fraction;
          for (const listener of created.listeners) {
            try { listener(fraction, label); } catch { /* advisory */ }
          }
          if (created.background) {
            while (created.background && created.waitForGarageLull) {
              const activity = dependencies.getGarageActivity();
              if (activity.phase === 'garage' && !activity.transitionActive
                  && now() - activity.lastActivityAt >= 1200) break;
              await sleep(120);
            }
            if (created.background && dependencies.acquireBackgroundWork) {
              const kind = created.waitForGarageLull ? 'world' : 'world-intent';
              backgroundLease = await dependencies.acquireBackgroundWork(
                kind, () => created.background && !created.cancelled,
              );
            }
            if (created.cancelled) {
              stats.cancelled += 1;
              throw new Error(`Cancelled stale battlefield prefetch: ${mapId}`);
            }
            if (created.background && backgroundLease) await yieldBackground(true);
            else await yieldForeground();
          } else {
            await yieldForeground();
          }
        },
        { fineSlices: true },
      )).then((next) => {
        releaseBackgroundLease();
        finishBuildStage();
        next.group.visible = false;
        cache.set(mapId, next);
        if (startedInBackground) {
          stats.completed += 1;
          stats.lastMap = mapId;
          stats.lastMs = Math.round(now() - startedAt);
        }
        return next;
      }).finally(() => {
        releaseBackgroundLease();
        if (builds.get(mapId) === created) builds.delete(mapId);
        if (stats.active === mapId) stats.active = null;
      });
      created.promise = promise;
      builds.set(mapId, created);
    }

    if (onProgress) {
      record.listeners.add(onProgress);
      try { onProgress(record.fraction, record.label); } catch { /* advisory */ }
    }
    if (!record.promise) throw new Error(`Battlefield build ${mapId} has no promise`);
    return {
      promise: record.promise,
      listeners: record.listeners,
      fraction: record.fraction,
      label: record.label,
      stageTimings: record.stageTimings,
    };
  };

  const prefetch = (
    mapId: string,
    options: { intent?: boolean } = {},
  ): Promise<WorldScene | null> | null => {
    if (!mapId || mapId === 'random' || cache.has(mapId) || builds.has(mapId)) return null;
    if (Number.isFinite(limits.worldScenes) && cache.size >= limits.worldScenes) {
      stats.skippedCapacity += 1;
      return null;
    }
    stats.requested += 1;
    stats.active = mapId;
    return beginBuild(mapId, null, {
      background: true,
      waitForGarageLull: !options.intent,
    }).promise.catch(() => null);
  };

  const cancelBackgroundExcept = (mapId: string | null = null): void => {
    for (const record of builds.values()) {
      if (record.background && record.id !== mapId) record.cancelled = true;
    }
  };

  return {
    cache,
    resourceLimits: limits,
    stats,
    get lastRelease() { return lastRelease; },
    loadModule,
    enforceCacheBudget,
    beginBuild,
    prefetch,
    cancelBackgroundExcept,
  };
}
