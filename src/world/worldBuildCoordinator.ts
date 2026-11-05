import type * as THREE from 'three';
import { createLazyChunk } from '../app/lazyChunk.ts';
import {
  createOpaqueLoadingYielder,
  type WorkYielder,
} from '../engine/frameScheduler.ts';
import { getPreset, type QualityPreset } from '../engine/quality.ts';
import {
  disposeObject3DResourcesSteps,
  residentResourceLimits,
  type ResourceDisposalReceipt,
} from '../engine/resourceLifetime.ts';

interface WorldScene {
  group: THREE.Object3D;
  /** Final-eviction hook for external bindings, separate from GPU release. */
  dispose?(): void;
}

type ProgressListener = (fraction: number, label: string) => void;
type LoadingYield = (force?: boolean) => Promise<void>;

interface WorldMapModule<World extends WorldScene> {
  createMapAsync(
    engineContext: object,
    options: { mapId: string; seed: number },
    progress: (label: string, fraction: number) => Promise<void>,
    slicing: { fineSlices: boolean; abandon?(roots: THREE.Object3D[]): void },
  ): Promise<World>;
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

/**
 * (2026-11-02 audit R1) A build record's phase, once three independent flags (background, cancelled and a one-shot
 * interrupt): background (speculative, paced behind the Garage) → foreground (promoted by a demand) or cancelled.
 * (round 2 U26) A foreground build whose every demand was let go (each activation waiting on it superseded: the entry's
 * failure restoring the Garage, the Studio left while its battlefield loads) is speculative again: back to background,
 * where it yields to the Garage, the next entry on another battlefield cancels it as any stale prefetch, and the next on
 * this one promotes it again. Before, it kept loading-pace slices into the Garage and beside the next entry's build (two
 * build peaks at once on the mobile tier, which keeps one world). Nothing leaves cancelled. Leaving background fires
 * the record's interrupt (the pacing waits end); entering it arms a fresh one.
 */
type BuildPhase = 'background' | 'foreground' | 'cancelled';
const BUILD_MOVES: Readonly<Record<BuildPhase, readonly BuildPhase[]>> = {
  background: ['foreground', 'cancelled'],
  foreground: ['background'],
  cancelled: [],
};

interface BuildRecord<World extends WorldScene> {
  id: string;
  fraction: number;
  label: string;
  listeners: Set<ProgressListener>;
  promise: Promise<World> | null;
  stageTimings: Record<string, number>;
  stageLabel: string | null;
  stageMark: number;
  phase: BuildPhase;
  waitForGarageLull: boolean;
  /** A background build paced like a covered load (prefetch pace 'loading'): a returning tab's battlefield under its boot. */
  loadingPace: boolean;
  /** (round 2 U26) the foreground demands (beginBuild without `background`) still waiting on this build. */
  demands: number;
  backgroundInterrupted: Promise<void>;
  interruptBackgroundWait(): void;
}

/** (round 2 U26) A fresh interrupt for the record's background waits (it is one-shot: leaving background fires it). */
function armBackgroundWait<World extends WorldScene>(record: Pick<BuildRecord<World>, 'backgroundInterrupted' | 'interruptBackgroundWait'>): void {
  record.backgroundInterrupted = new Promise<void>((resolve) => { record.interruptBackgroundWait = resolve; });
}

/** The record's one transition: a refused move (a cancelled record, or a repeated one) changes nothing and reports false. */
function moveBuild<World extends WorldScene>(record: BuildRecord<World>, next: BuildPhase): boolean {
  if (!BUILD_MOVES[record.phase].includes(next)) return false;
  const left = record.phase;
  record.phase = next;
  if (left === 'background') record.interruptBackgroundWait();
  if (next === 'background') armBackgroundWait(record);
  return true;
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

export interface WorldBuildCoordinatorDependencies<World extends WorldScene = WorldScene> {
  engineContext: object;
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  deviceTier: string;
  getCurrentWorld(): World | null;
  getGarageActivity(): GarageActivity;
  releaseShadowMaterial(resource: THREE.Material): void;
  loadModule(): Promise<WorldMapModule<World>>;
  now?: () => number;
  sleep?: (durationMs: number) => Promise<void>;
  foregroundYielder?: () => LoadingYield;
  backgroundYielder?: () => LoadingYield;
  acquireBackgroundWork?: (
    kind: 'world' | 'world-intent',
    stillValid: () => boolean,
  ) => Promise<BackgroundWorkLease | null>;
  resourceLimits?: ResourceLimits;
  /**
   * (2026-11-02 audit R1) The quality class a build reads at its start: what the build captures in what it builds
   * (worldBuildClassOf). Default: the live preset's (engine/quality.ts).
   */
  buildClass?: () => string;
}

interface WorldBuildRequest<World extends WorldScene = WorldScene> {
  promise: Promise<World>;
  listeners: Set<ProgressListener> | null;
  fraction: number;
  label: string;
  stageTimings: Record<string, number>;
  /**
   * (round 2 U26) Let go of this demand (once; a no-op for a cached world or a background request): the build's last
   * foreground demand let go returns it to background (BUILD_MOVES).
   */
  release(): void;
}

export interface WorldBuildCoordinator<World extends WorldScene = WorldScene> {
  readonly cache: Map<string, World>;
  readonly resourceLimits: ResourceLimits;
  readonly stats: WorldPrefetchStats;
  readonly lastRelease: ReleaseReceipt | null;
  loadModule(): Promise<WorldMapModule<World>>;
  enforceCacheBudget(): void;
  /** A cached world released now (never the current one, one still building or one held); false when there was none to release. */
  releaseCached(id: string): boolean;
  /**
   * (2026-11-02 audit R1) The world cached under `id` if it was built for the quality class in effect now, else null: one
   * built under another class is retired (released, or kept under a retired key while it is still on screen or held,
   * for the budget to release) so the id builds afresh. The cache was keyed by map alone, so after a change to or from
   * Ultra Low a cached map came back with live-following lite terrain under its build-time vegetation.
   */
  cached(id: string): World | null;
  /** (round 2 U26) Whether cached(id) would hand out a world now, with none of its side effects (nothing is retired). */
  reusable(id: string): boolean;
  /**
   * (round 2 U26) The build id of every resident world (a retired one under the id it was built for), for the probes'
   * residency census: the cache's own keys carry the retired suffix.
   */
  residentIds(): string[];
  /**
   * (2026-11-02 audit R1) Hold the world cached (or about to be cached) under `id` against eviction while an activation
   * warms it; the returned release drops the hold (once) and lets the residency budget run again.
   */
  retain(id: string): () => void;
  beginBuild(
    mapId: string,
    onProgress?: ProgressListener | null,
    options?: { background?: boolean; waitForGarageLull?: boolean; loadingPace?: boolean },
  ): WorldBuildRequest<World>;
  prefetch(mapId: string, options?: { intent?: boolean; pace?: 'background' | 'loading' }): Promise<World | null> | null;
  cancelBackgroundExcept(mapId?: string | null): void;
}

const STAGE_KEYS: Readonly<Record<string, string>> = Object.freeze({
  'Surveying terrain': 'heightField',
  'Building terrain meshes': 'terrain',
  'Planting vegetation': 'vegetation',
  'Placing structures': 'props',
  'Sealing the battlefield': 'assemble',
});

type DisposableResource = THREE.BufferGeometry | THREE.Material | THREE.Texture;

function isMaterial(resource: DisposableResource): resource is THREE.Material {
  return typeof resource === 'object'
    && resource !== null
    && 'isMaterial' in resource
    && resource.isMaterial === true;
}

/**
 * (2026-11-02 audit R1, review) The part of a quality preset a world build captures in what it builds, the key a cached
 * battlefield is reused under: Ultra Low's light world (presetLightWorld at build: the vegetation's near band, the grass's
 * pressure field, the litter, the water ripples, the Hinterland, whether the FFT ocean is built at all) and the world
 * texture scale and cap (texSize). The rest a build reads from the preset is capacity sized at build — the track-mark ring
 * (map.ts trackMarkSegmentsFor), the FFT ocean's grid and stride (terrain.ts, oceanFft.ts) — which a world keeps through
 * the battle it was built for after any live step anyway; the terrain material and the per-frame levers follow the live
 * preset. A step between High, Medium and Low (desktop Auto's frame governor and the context-loss recovery change the
 * preset name mid-battle) keeps the cached battlefield, so Battle Again stays instant; a step into or out of Ultra Low
 * builds the battlefield afresh.
 */
export function worldBuildClassOf(preset: Pick<QualityPreset, 'lightWorld' | 'textureScale' | 'textureCap'>): string {
  return `${preset.lightWorld === true ? 'light' : 'full'}:${preset.textureScale || 1}:${preset.textureCap || 0}`;
}

/** The background yielder (engine/backgroundYield.ts), its module loaded with the build's first background slice. */
function lazyBackgroundYielder(): WorkYielder {
  let yielder: WorkYielder | null = null;
  return async (force = false) => {
    yielder ??= (await import('../engine/backgroundYield.ts')).createBackgroundYielder(4);
    return yielder(force);
  };
}

/**
 * Own map transfer, deterministic construction, background pacing, promotion,
 * cancellation, residency, and eviction. The active-world decision remains
 * with the application composition root; this owner only builds and retains
 * complete world scenes.
 */
export function createWorldBuildCoordinator<World extends WorldScene = WorldScene>(
  dependencies: WorldBuildCoordinatorDependencies<World>,
): WorldBuildCoordinator<World> {
  const now = dependencies.now ?? (() => performance.now());
  const sleep = dependencies.sleep ?? ((durationMs: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, durationMs)));
  const cache = new Map<string, World>();
  const builds = new Map<string, BuildRecord<World>>();
  const buildClass = dependencies.buildClass ?? (() => {
    try { return worldBuildClassOf(getPreset()); } catch { return 'default'; }
  });
  // (audit R1) each cached world's quality class, read when its build started
  const classOf = new WeakMap<World, string>();
  // worlds retired while still on screen or held: never handed out again, released as soon as they are evictable
  const retired = new Set<string>();
  let retiredSerial = 0;
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
  let lastRelease: ReleaseReceipt | null = null;

  // (round 2 U35) the map module is one lazy chunk under the app's policy (app/lazyChunk.ts): a hand-made memo kept its
  // first failure for the document, so one failed transfer (a Garage speculation offline) failed every later battle's
  // world build until a reload. A failure is asked again by the next build (at once, then past the backoff, never offline)
  const moduleChunk = createLazyChunk((): Promise<WorldMapModule<World>> => dependencies.loadModule(), { now });
  const loadModule = (): Promise<WorldMapModule<World>> => moduleChunk.load();

  const releaseRoot = (id: string, root: THREE.Object3D, paced: boolean): void => {
    const preserveRoots = dependencies.scene.children.filter(
      (child) => child !== root,
    );
    // Dormant cached worlds may be detached from the scene but still share
    // immutable geometry/materials with the discarded completed build.
    for (const retained of cache.values()) {
      if (retained.group !== root && !preserveRoots.includes(retained.group)) {
        preserveRoots.push(retained.group);
      }
    }
    const steps = disposeObject3DResourcesSteps(root, {
      preserveRoots,
      onDispose: (type: string, resource: DisposableResource) => {
        if (type === 'material' && isMaterial(resource)) {
          dependencies.releaseShadowMaterial(resource);
        }
      },
    });
    const finish = (released: ResourceDisposalReceipt): void => {
      dependencies.renderer.renderLists?.dispose?.();
      lastRelease = { id, ...released };
    };
    if (!paced) {
      let step = steps.next();
      while (!step.done) step = steps.next();
      finish(step.value);
      return;
    }
    // (battle-spikes-253) the dormant battlefield's release disposes its resources in 6 ms slices between tasks (one task
    // of a whole world's GPU deletes was nav-perf's 1.0 s room leave); the world left the cache and the scene at once
    // (2026-11-02 audit R1) the keep list is read again at every slice: a world cached or a root added to the scene since
    // the release began keeps what it shares (the list was a snapshot taken when the release started)
    const seen = new Set<THREE.Object3D>(preserveRoots);
    seen.add(root);
    const lateRoots = (): THREE.Object3D[] | undefined => {
      let late: THREE.Object3D[] | undefined;
      const consider = (root: THREE.Object3D): void => {
        if (seen.has(root)) return;
        seen.add(root);
        (late ??= []).push(root);
      };
      for (const child of dependencies.scene.children) consider(child);
      for (const retained of cache.values()) consider(retained.group);
      return late;
    };
    const slice = (): void => {
      const started = now();
      let step = steps.next(lateRoots());
      while (!step.done && now() - started < 6) step = steps.next();
      if (step.done) finish(step.value);
      else setTimeout(slice, 0);
    };
    slice();
  };

  const releaseWorld = (id: string, world: World, paced = false): void => {
    world.dispose?.();
    releaseRoot(id, world.group, paced);
  };

  /** (2026-11-02 audit R1) A build that ended part way: the subsystems it had built, released as a world is. */
  const abandonPartial = (id: string, roots: THREE.Object3D[]): void => {
    for (const root of roots) releaseRoot(id, root, true);
  };

  // (2026-11-02 audit R1) the worlds an activation is warming: a world neither current nor building was evictable mid-warm,
  // so another activation's budget could release it and the warm then activated a released world (mobile keeps one)
  const holds = new Set<{ key: string }>();
  const held = (id: string): boolean => {
    for (const hold of holds) if (hold.key === id) return true;
    return false;
  };
  const evictable = (id: string, world: World): boolean => (
    world !== dependencies.getCurrentWorld() && !builds.has(id) && !held(id)
  );

  const enforceCacheBudget = (): void => {
    for (const id of retired) {
      const world = cache.get(id);
      if (!world) { retired.delete(id); continue; }
      if (!evictable(id, world)) continue;
      retired.delete(id);
      cache.delete(id);
      releaseWorld(id, world);
    }
    if (!Number.isFinite(limits.worldScenes)) return;
    for (const [id, cached] of cache) {
      if (cache.size <= limits.worldScenes) break;
      if (!evictable(id, cached)) continue;
      cache.delete(id);
      releaseWorld(id, cached);
    }
  };

  const releaseCached = (id: string): boolean => {
    const cached = cache.get(id);
    if (!cached || !evictable(id, cached)) return false;
    cache.delete(id);
    releaseWorld(id, cached, true);
    return true;
  };

  const cached = (id: string): World | null => {
    const world = cache.get(id);
    if (!world) return null;
    const built = classOf.get(world);
    if (built === undefined || built === buildClass()) return world;
    cache.delete(id);
    if (evictable(id, world)) releaseWorld(id, world, true);
    else {
      const key = `${id}~${built}#${++retiredSerial}`;
      cache.set(key, world);
      retired.add(key);
      for (const hold of holds) if (hold.key === id) hold.key = key;
    }
    return null;
  };

  const reusable = (id: string): boolean => {
    const world = cache.get(id);
    if (!world) return false;
    const built = classOf.get(world);
    return built === undefined || built === buildClass();
  };

  const residentIds = (): string[] => {
    const ids: string[] = [];
    for (const key of cache.keys()) ids.push(retired.has(key) ? key.slice(0, key.indexOf('~')) : key);
    return ids;
  };

  const retain = (id: string): (() => void) => {
    const hold = { key: id };
    holds.add(hold);
    return () => {
      if (!holds.delete(hold)) return;
      enforceCacheBudget();
    };
  };

  const beginBuild = (
    mapId: string,
    onProgress: ProgressListener | null = null,
    options: { background?: boolean; waitForGarageLull?: boolean; loadingPace?: boolean } = {},
  ): WorldBuildRequest<World> => {
    const resident = cached(mapId);
    if (resident) {
      return {
        promise: Promise.resolve(resident), listeners: null, fraction: 1, label: 'Ready',
        stageTimings: {}, release: () => {},
      };
    }

    const background = options.background ?? false;
    const waitForGarageLull = options.waitForGarageLull ?? true;
    let record = builds.get(mapId);
    const cancelledPredecessor = record?.phase === 'cancelled' ? record.promise : null;
    if (record?.phase === 'cancelled') record = undefined;
    if (record && !background && moveBuild(record, 'foreground')) {
      stats.joined += 1;
      stats.promoted += 1;
    }

    if (!record) {
      const created: BuildRecord<World> = {
        id: mapId,
        fraction: 0,
        label: 'Surveying terrain',
        listeners: new Set<ProgressListener>(),
        promise: null,
        stageTimings: {},
        stageLabel: null,
        stageMark: now(),
        phase: background ? 'background' : 'foreground',
        waitForGarageLull,
        loadingPace: options.loadingPace ?? false,
        demands: 0,
        backgroundInterrupted: Promise.resolve(),
        interruptBackgroundWait: () => {},
      };
      armBackgroundWait(created);
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
        // Request covered paints sooner instead of accumulating several task
        // slices; individual construction checkpoints can still overrun either budget.
        ?? createOpaqueLoadingYielder(6, 16);
      const yieldBackground = dependencies.backgroundYielder?.()
        // (battle-spikes-253) behind the live Garage: 4 ms slices that wait out a press until its paint and resume as
        // background-priority tasks between frames (engine/backgroundYield.ts, loaded with the first background slice)
        ?? lazyBackgroundYielder();

      const throwIfCancelled = (): void => {
        if (created.phase !== 'cancelled') return;
        stats.cancelled += 1;
        throw new Error(`Cancelled stale battlefield prefetch: ${mapId}`);
      };

      const publishProgress = (label: string, fraction: number): void => {
        if (label !== created.stageLabel) {
          const sampleNow = now();
          finishBuildStage(sampleNow);
          created.stageLabel = label;
          created.stageMark = sampleNow;
        }
        // Fine construction checkpoints still pace and cancel independently.
        // Only observable changes need to repeat the loading UI's DOM work.
        if (label === created.label && fraction === created.fraction) return;
        created.label = label;
        created.fraction = fraction;
        for (const listener of created.listeners) {
          try { listener(fraction, label); } catch { /* advisory */ }
        }
      };

      const pollGarageLull = async (): Promise<void> => {
        while (created.phase === 'background' && created.waitForGarageLull) {
          const activity = dependencies.getGarageActivity();
          const idle = activity.phase === 'garage' && !activity.transitionActive &&
            now() - activity.lastActivityAt >= 1200;
          if (idle) return;
          await sleep(120);
        }
      };

      const awaitGarageLull = async (): Promise<void> => {
        // Subscribe once per pacing wait, not once per 120 ms poll: reactions
        // on the unresolved interrupt promise otherwise accumulate indefinitely.
        await Promise.race([pollGarageLull(), created.backgroundInterrupted]);
        throwIfCancelled();
      };

      const acquireBackgroundLease = async (): Promise<void> => {
        if (created.phase !== 'background' || !dependencies.acquireBackgroundWork) return;
        const kind = created.waitForGarageLull ? 'world' : 'world-intent';
        const pendingLease = dependencies.acquireBackgroundWork(
          kind,
          () => created.phase === 'background',
        );
        backgroundLease = await Promise.race([
          pendingLease,
          created.backgroundInterrupted.then(() => null),
        ]);
        if (backgroundLease) return;
        void pendingLease.then((lateLease) => lateLease?.release());
      };

      const paceBuild = async (): Promise<void> => {
        if (created.phase === 'foreground') {
          await yieldForeground();
          return;
        }
        await awaitGarageLull();
        await acquireBackgroundLease();
        throwIfCancelled();
        // Explicit room/Battle intent keeps the 4ms budget: fine terrain rows
        // must not each cost a display frame. Passive speculation stays forced.
        // A loading-paced build (a returning tab under its boot screen) takes
        // the covered load's slices while it still holds its background lease.
        if (created.phase === 'background' && backgroundLease && !created.loadingPace) await yieldBackground(created.waitForGarageLull);
        else await yieldForeground();
      };

      const handleProgress = async (label: string, fraction: number): Promise<void> => {
        releaseBackgroundLease();
        throwIfCancelled();
        publishProgress(label, fraction);
        await paceBuild();
      };

      let builtClass = '';
      const startBuild = async (): Promise<World> => {
        // A late old assembly can register same-ID destructible callbacks.
        // Wait for its disposal before building the fresh request; observing
        // settlement here does not change the predecessor caller's rejection.
        if (cancelledPredecessor) {
          await cancelledPredecessor.then(() => undefined, () => undefined);
        }
        const { createMapAsync } = await loadModule();
        throwIfCancelled();
        builtClass = buildClass();
        // 'mapId#assault-trenches' builds the Frontline Assault variant of the map;
        // the cache and build records keep the full key, the world keeps mapId.
        const [baseMapId, terrainVariant] = mapId.split('#');
        return createMapAsync(dependencies.engineContext,
          { mapId: baseMapId, seed: 1337, ...(terrainVariant ? { terrainVariant: terrainVariant as 'assault-trenches' } : {}) },
          handleProgress, { fineSlices: true, abandon: (roots) => abandonPartial(mapId, roots) });
      };

      const promise = startBuild().then((next) => {
        releaseBackgroundLease();
        finishBuildStage();
        next.group.visible = false;
        // Cancellation during the final pacing yield must finish assembly so
        // a real world owns every resource before this final-disposal path.
        // (audit R1) A build cancelled earlier never gets here: createMapAsync hands the subsystems it had built to
        // slicing.abandon (abandonPartial), released as a released world's are.
        if (created.phase === 'cancelled') releaseWorld(mapId, next);
        throwIfCancelled();
        cache.set(mapId, next);
        classOf.set(next, builtClass);
        if (startedInBackground) {
          stats.completed += 1;
          stats.lastMap = mapId;
          stats.lastMs = Math.round(now() - startedAt);
        }
        return next;
      }).finally(() => {
        releaseBackgroundLease();
        if (builds.get(mapId) === created) {
          builds.delete(mapId);
          if (stats.active === mapId) stats.active = null;
        }
      });
      created.promise = promise;
      builds.set(mapId, created);
    }

    if (onProgress) {
      record.listeners.add(onProgress);
      try { onProgress(record.fraction, record.label); } catch { /* advisory */ }
    }
    if (!record.promise) throw new Error(`Battlefield build ${mapId} has no promise`);
    // (round 2 U26) a foreground demand holds the build foreground until it is let go (its activation superseded or
    // settled); the last one let go returns a still-running build to background
    let release = (): void => {};
    if (!background) {
      const demanded = record;
      demanded.demands += 1;
      let held = true;
      release = () => {
        if (!held) return;
        held = false;
        demanded.demands -= 1;
        if (demanded.demands === 0 && builds.get(mapId) === demanded) moveBuild(demanded, 'background');
      };
    }
    return {
      promise: record.promise,
      listeners: record.listeners,
      fraction: record.fraction,
      label: record.label,
      stageTimings: record.stageTimings,
      release,
    };
  };

  const prefetch = (
    mapId: string,
    options: { intent?: boolean; pace?: 'background' | 'loading' } = {},
  ): Promise<World | null> | null => {
    // (audit R1) a cancelled record still settling is no build: the prefetch starts the fresh one, which waits for it
    // (before, the same map's prefetch was silently skipped until the cancelled one settled)
    if (!mapId || mapId === 'random' || cached(mapId)) return null;
    if (builds.has(mapId) && builds.get(mapId)?.phase !== 'cancelled') return null;
    if (Number.isFinite(limits.worldScenes) && cache.size >= limits.worldScenes) {
      stats.skippedCapacity += 1;
      return null;
    }
    stats.requested += 1;
    stats.active = mapId;
    return beginBuild(mapId, null, {
      background: true,
      waitForGarageLull: !options.intent,
      // (2026-10-20, item/mp-rejoin-229) 'loading' is explicit intent paced as a covered load
      loadingPace: options.intent === true && options.pace === 'loading',
    }).promise.catch(() => null);
  };

  const cancelBackgroundExcept = (mapId: string | null = null): void => {
    for (const record of builds.values()) {
      if (record.id !== mapId) moveBuild(record, 'cancelled');
    }
  };

  return {
    cache,
    resourceLimits: limits,
    stats,
    get lastRelease() { return lastRelease; },
    loadModule,
    enforceCacheBudget,
    releaseCached,
    cached,
    reusable,
    residentIds,
    retain,
    beginBuild,
    prefetch,
    cancelBackgroundExcept,
  };
}
