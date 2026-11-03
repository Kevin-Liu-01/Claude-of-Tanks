import type * as THREE from 'three';
import { sceneWindOf } from './sceneWind.ts';
import { minimapAssetUrl } from '../ui/minimapAssetUrl.ts';
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

interface WorldRaycastHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  dist: number;
  kind: string;
}

interface ActiveWorld<SkyConfig extends object = object> {
  mapId: string;
  terrainVariant?: 'assault-trenches' | null;
  group: THREE.Object3D;
  /** 2026-10-01: `clouds` is the map's cloudscape (engine/cloudscapes.ts), carried on the sky preset like the battle's. */
  config: { sky?: SkyConfig; clouds?: object };
  /** Round 77c: bakes the vegetation's impostor atlas under cover (map.ts). */
  warmImpostors?(): boolean;
  raycast(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDistance: number,
  ): WorldRaycastHit | null;
}

type WorldActivationStage = 'build' | 'present' | 'compile' | 'shadowWarm' | 'clouds' | 'activate';

interface WorldActivationStageInterval {
  stage: WorldActivationStage;
  /** Absolute performance.now() timebase, matching PerformanceEntry.startTime. */
  startTime: number;
  /** Absent while this stage is still pending. */
  endTime?: number;
}

interface WorldActivationTrace {
  id: string;
  cached: boolean;
  status: 'pending' | 'complete' | 'failed';
  startedAt: number;
  endedAt?: number;
  stageIntervals: WorldActivationStageInterval[];
  error?: { name: string; message: string };
  build?: number;
  buildDetail?: Record<string, number | object>;
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
  /** Covered solo/network entry prepares its selected atmosphere before warm. */
  atmosphere?: 'covered-battle';
  /** Frontline Assault: build the map with its trench system carved into the terrain. */
  terrainVariant?: 'assault-trenches';
}

type WorldSceneActivationOptions = Pick<WorldActivationOptions, 'services' | 'atmosphere'>;

/**
 * (2026-11-02 audit R1) An activation request's life: it resolves (cache or build), warms, then activates — or a later
 * request (another ensure, a direct activate or switchMap, or the Garage taking the screen: setDormant(true))
 * supersedes it first and it never presents. The entry barriers are Promise.all (battleEntryAcquisition.ts), so a
 * failed sibling leaves its entry's ensure running while the entry restores the Garage, and the next entry, the Studio
 * or a capture starts its own: before this owner, whichever finished last became current, over a battle or the Garage.
 * A request that ends without presenting puts back what its warm lifted: the world it warmed is hidden again.
 */
type ActivationRequestState = 'resolving' | 'warming' | 'activated' | 'superseded' | 'failed';
const ACTIVATION_MOVES: Readonly<Record<ActivationRequestState, readonly ActivationRequestState[]>> = {
  resolving: ['warming', 'superseded', 'failed'],
  warming: ['activated', 'superseded', 'failed'],
  activated: [],
  superseded: [],
  failed: [],
};

interface ActivationRequest {
  readonly ticket: number;
  readonly id: string;
  state: ActivationRequestState;
  /** The world this request warms, once resolved. */
  world: object | null;
}

/** The rejection a superseded ensure settles with: a later request owns the battlefield on screen. */
export class WorldActivationSupersededError extends Error {
  readonly superseded = true;
  readonly mapId: string;
  constructor(mapId: string) {
    super(`Battlefield activation for ${mapId} was superseded by a later request`);
    this.name = 'WorldActivationSuperseded';
    this.mapId = mapId;
  }
}

function moveActivationRequest(request: ActivationRequest, next: ActivationRequestState): void {
  if (!ACTIVATION_MOVES[request.state].includes(next)) {
    throw new Error(`world activation ${request.id}: ${request.state} cannot become ${next}`);
  }
  request.state = next;
}

type CoordinatorDependencies<World extends ActiveWorld> = Omit<
  WorldBuildCoordinatorDependencies<World>,
  'getCurrentWorld'
>;

interface WorldActivationRuntimeOptions<
  World extends ActiveWorld<SkyConfig>,
  Collider,
  SkyConfig extends object = object,
> {
  initialMapId: string;
  coordinator?: WorldBuildCoordinator<World>;
  coordinatorDependencies?: CoordinatorDependencies<World>;
  swapSceneWorld(previous: THREE.Object3D | null, next: THREE.Object3D): void;
  setSceneWorldActive(root: THREE.Object3D | null, active: boolean): void;
  ensureCloudTextures(): void;
  ensureCloudTexturesChunked?(yieldFrame: () => Promise<void>): Promise<void>;
  awaitInitialCloudWarm(): Promise<void>;
  applySkyPreset(skyConfig: SkyConfig): void;
  applySkyPresentation(skyConfig: SkyConfig): void;
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
  linkerBreathingSlices(maxSlices: number): Iterable<void>;
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
  prefetch(mapId: string, options?: { intent?: boolean; pace?: 'background' | 'loading' }): Promise<World | null> | null;
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
  activate(world: World, options?: WorldSceneActivationOptions): World;
  switchMap(mapId: string): World | Promise<World>;
  ensure(
    mapId?: string | null,
    onProgress?: ProgressListener | null,
    options?: WorldActivationOptions | null,
  ): Promise<World>;
  setDormant(dormant: boolean): void;
  /** The dormant battlefield released when another one is asked for (its id; the same one keeps it); true when released. */
  releaseDormantExcept(id: string | null): boolean;
  invalidateSkyPresentation(): void;
  /** A selected/reset battle preset has completed its synchronous IBL bake. */
  markEnvironmentPrepared(world: World | null): void;
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
  SkyConfig extends object = object,
>(options: WorldActivationRuntimeOptions<World, Collider, SkyConfig>): WorldActivationRuntime<World, Collider> {
  if (!options.initialMapId) throw new TypeError('world activation requires an initial map id');
  const now = options.now ?? (() => performance.now());
  let current: World | null = null;
  let collider: Collider | null = null;
  let pendingMapId = options.initialMapId;
  let dormant = false;
  let servicesMapId: string | null = null;
  let skyMapId = options.initialMapId;
  let skyPresentationDirty = false;
  let skyEnvironmentDeferred = false;
  // (2026-11-02 audit R1) the latest activation request: an ensure, a direct activate or a switchMap takes the next ticket
  let activationTicket = 0;
  let latestRequest: ActivationRequest | null = null;
  const supersedeActivations = (): void => {
    activationTicket += 1;
    if (latestRequest && (latestRequest.state === 'resolving' || latestRequest.state === 'warming')) {
      moveActivationRequest(latestRequest, 'superseded');
    }
    latestRequest = null;
  };

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
  const assetUrl = (mapId: string): string => (
    minimapAssetUrl(mapId, baseUrl, options.minimapAssetVersion)
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

  const restoreAtmosphere = (world: World, atmosphere?: 'covered-battle'): void => {
    // 2026-10-01: the map's cloudscape rides with its sky block here too (main.ts getAuthoredPreset does it for the
    // battle) — the shots, the Studio staging and the census frames showed the legacy cloud layer derived from the sky
    // block alone (Titan Gorge's dense overcast as scattered cumulus, every authored regime lost)
    // (2026-10-05: and its scene wind — the clouds drift with the battlefield's surface wind, veered: world/sceneWind.ts)
    const skyConfig = {
      ...(world.config.sky ?? {}), ...(world.config.clouds ? { cloudscape: world.config.clouds } : {}),
      ...sceneWindOf(world.config as { id?: string }),
    } as SkyConfig;
    if (atmosphere === 'covered-battle') {
      // This authored daytime presentation is only intermediate. The covered
      // deployment/authority owner bakes the selected day/night IBL once.
      if (skyMapId !== world.mapId || skyPresentationDirty) {
        options.applySkyPresentation(skyConfig);
        options.onFogDensityChanged(options.getFogDensity());
      }
      skyEnvironmentDeferred = true;
    } else if (skyMapId !== world.mapId || skyEnvironmentDeferred) {
      options.applySkyPreset(skyConfig);
      options.onFogDensityChanged(options.getFogDensity());
      skyEnvironmentDeferred = false;
    } else if (skyPresentationDirty) {
      // Garage variants only retarget the visible sky; the last battlefield's
      // PMREM remains resident. Restore that sky/fog without rebaking its IBL
      // when the same cached battlefield is entered again.
      options.applySkyPresentation(skyConfig);
      options.onFogDensityChanged(options.getFogDensity());
    }
    skyMapId = world.mapId;
    skyPresentationDirty = false;
    options.setSun(skyConfig);
  };

  const presentWorld = (world: World, { services = true, atmosphere }: WorldSceneActivationOptions = {}): World => {
    options.swapSceneWorld(current?.group ?? null, world.group);
    current = world;
    dormant = false;
    options.ensureCloudTextures();
    pendingMapId = world.mapId;
    restoreAtmosphere(world, atmosphere);
    if (services) prepareServices(world);
    else {
      collider = null;
      if (servicesMapId !== world.mapId) servicesMapId = null;
    }
    coordinator.enforceCacheBudget();
    return world;
  };

  /** A direct activation is a request too: it supersedes any ensure still resolving or warming. */
  const activate = (world: World, sceneOptions: WorldSceneActivationOptions = {}): World => {
    supersedeActivations();
    return presentWorld(world, sceneOptions);
  };

  const timingStages: readonly WorldActivationStage[] = [
    'build', 'present', 'compile', 'shadowWarm', 'clouds', 'activate',
  ];
  type BuildDiagnostics = {
    vegetation?: object | null;
    terrain?: object | null;
    props?: object | null;
  };

  const createStageMarker = (trace: WorldActivationTrace): {
    mark(stage: WorldActivationStage): void;
    complete(): void;
    fail(error: NonNullable<WorldActivationTrace['error']>): void;
  } => {
    const publish = (): void => {
      try {
        options.publishActivationTrace?.({
          ...trace,
          stageIntervals: trace.stageIntervals.map((interval) => ({ ...interval })),
          ...(trace.buildDetail ? { buildDetail: { ...trace.buildDetail } } : {}),
          ...(trace.error ? { error: { ...trace.error } } : {}),
        });
      } catch { /* telemetry must not change activation success or its original failure */ }
    };
    const closeStage = (sample: number): void => {
      const interval = trace.stageIntervals.at(-1);
      if (!interval || interval.endTime !== undefined) return;
      interval.endTime = sample;
      trace[interval.stage] = Math.round(sample - interval.startTime);
    };
    const finish = (status: 'complete' | 'failed'): void => {
      const sample = now();
      closeStage(sample);
      trace.status = status;
      trace.endedAt = sample;
      trace.totalMs = Math.round(sample - trace.startedAt);
      publish();
    };
    publish();
    return {
      mark(stage): void {
        const sample = now();
        closeStage(sample);
        const nextStage = timingStages[timingStages.indexOf(stage) + 1];
        if (nextStage) trace.stageIntervals.push({ stage: nextStage, startTime: sample });
        publish();
      },
      complete(): void {
        finish('complete');
      },
      fail(error): void {
        trace.error = error;
        finish('failed');
      },
    };
  };

  const copyBuildDiagnostics = (trace: WorldActivationTrace, world: World): void => {
    const diagnostics = (world as World & { _buildDetail?: BuildDiagnostics })._buildDetail;
    if (!diagnostics || !trace.buildDetail) return;
    if (diagnostics.vegetation) {
      trace.buildDetail.vegetationDetail = { ...diagnostics.vegetation };
    }
    if (diagnostics.terrain) {
      trace.buildDetail.terrainDetail = { ...diagnostics.terrain };
    }
    if (diagnostics.props) {
      trace.buildDetail.propsDetail = { ...diagnostics.props };
    }
  };

  const resolveWorld = async (
    id: string,
    cached: World | null,
    trace: WorldActivationTrace,
    onProgress: ProgressListener | null,
  ): Promise<World> => {
    if (cached) return cached;
    const request = coordinator.beginBuild(id, onProgress);
    try {
      const built = await request.promise;
      trace.buildDetail = { ...request.stageTimings };
      copyBuildDiagnostics(trace, built);
      return built;
    } catch (error) {
      trace.buildDetail = { ...request.stageTimings };
      throw error;
    } finally {
      if (onProgress && request.listeners) request.listeners.delete(onProgress);
    }
  };

  const drainLinker = async (maxSlices: number): Promise<void> => {
    for (const _ of options.linkerBreathingSlices(maxSlices)) await options.nextFrame();
  };

  const compileWorldPrograms = async (root: THREE.Object3D): Promise<void> => {
    try { options.compilePrograms(root); } catch { /* real render remains fallback */ }
    await drainLinker(24);
  };

  const warmShadowCohort = async (
    children: THREE.Object3D[],
    lastVisible: number,
  ): Promise<void> => {
    const hidden: THREE.Object3D[] = [];
    for (let index = lastVisible + 1; index < children.length; index += 1) {
      const child = children[index];
      if (!child.visible) continue;
      child.visible = false;
      hidden.push(child);
    }
    try {
      options.updateShadowFrustums();
      options.warmShadowFrame();
    } catch { /* real render remains fallback */ }
    for (const child of hidden) child.visible = true;
    await drainLinker(24);
    await options.nextFrame();
  };

  const warmWorldShadows = async (root: THREE.Object3D, live: () => boolean): Promise<void> => {
    const children = root.children.slice();
    const cohorts = Math.min(3, Math.max(1, children.length));
    for (let cohort = 0; cohort < cohorts; cohort += 1) {
      if (!live()) return;
      const lastVisible = Math.ceil(((cohort + 1) / cohorts) * children.length) - 1;
      await warmShadowCohort(children, lastVisible);
    }
  };

  /**
   * The covered warm. `live` is the request's ticket check: once a later request supersedes it, the warm stops at its
   * next wait (no program compile or shadow warm of a world nobody will present).
   */
  const warmWorldForActivation = async (
    world: World,
    activationOptions: WorldActivationOptions | null,
    mark: (stage: WorldActivationStage) => void,
    live: () => boolean,
  ): Promise<void> => {
    const precompile = activationOptions?.precompile !== false;
    // (2026-10-19, black-screen-228 RC5) the world sits out one frame only while no one presents it, and comes back on
    // every exit: a rejected or abandoned frame wait never leaves a cached (reused) world hidden, and the active,
    // presented world is never hidden
    const hide = world !== current || dormant;
    try {
      if (hide) world.group.visible = false;
      if (precompile) await options.nextFrame();
    } finally {
      world.group.visible = true;
    }
    if (!live()) return;
    mark('present');

    if (precompile || activationOptions?.compilePrograms === true) {
      await compileWorldPrograms(world.group);
      if (!live()) return;
      // Round 77c: the far-tree impostor atlas bakes with the programs, before any presented frame needs it
      try { world.warmImpostors?.(); } catch { /* the first update bakes lazily */ }
    }
    mark('compile');
    if (precompile) await options.nextFrame();
    if (precompile && live()) await warmWorldShadows(world.group, live);
    if (!live()) return;
    mark('shadowWarm');
  };

  /**
   * (battle-spikes-253, the memory lockdown; the coordinator, 2026-10-25: "memory returns to baseline after each battle
   * and heavy maps stay well under 4 GB") A battlefield left dormant under the Garage is released once a different one is
   * asked for: a battle entry or the Garage's planned battle on another map. The memory probe (tools/battle-memory-probe.mjs)
   * found a page on the random rotation keeping the last battle's world beside the next one's (desktop keeps two). A
   * rematch on the same battlefield keeps it (its entry is instant); a speculative background prefetch never releases.
   */
  const releaseDormantExcept = (id: string | null): boolean => {
    if (!current || !dormant || !id) return false;
    let key: string | null = null;
    for (const [cachedId, cachedWorld] of cache) if (cachedWorld === current) { key = cachedId; break; }
    if (key === null || key === id) return false;
    const released = current;
    current = null;
    collider = null;
    servicesMapId = null;
    dormant = false;
    // the scene's residency forgets its root (it holds the active world's group across dormancy)
    options.setSceneWorldActive(null, false);
    if (coordinator.releaseCached(key)) return true;
    current = released;
    dormant = true;
    options.setSceneWorldActive(released.group, false);
    return false;
  };

  const ensure = async (
    mapId: string | null = null,
    onProgress: ProgressListener | null = null,
    activationOptions: WorldActivationOptions | null = null,
  ): Promise<World> => {
    if (activationOptions?.atmosphere === 'covered-battle'
      && (activationOptions.precompile !== false || activationOptions.compilePrograms === true)) {
      throw new TypeError('Covered battle atmosphere must precede combat program warming');
    }
    const baseId = mapId || pendingMapId;
    const id = activationOptions?.terrainVariant ? `${baseId}#${activationOptions.terrainVariant}` : baseId;
    supersedeActivations();
    const request: ActivationRequest = { ticket: activationTicket, id, state: 'resolving', world: null };
    latestRequest = request;
    coordinator.cancelBackgroundExcept(id);
    // (audit R1) a world built under another quality class is retired here (it builds afresh; on screen, it stays until
    // the fresh one replaces it), so the dormant release below takes a retired dormant battlefield too
    const cached = coordinator.cached(id);
    // another battlefield: the dormant one goes before this one builds (its memory is not held through the build's peak)
    releaseDormantExcept(id);
    // (audit R1) the world stays resident while this request warms it: another activation's budget cannot release it
    const releaseHold = coordinator.retain(id);
    const startedAt = now();
    const trace: WorldActivationTrace = {
      id,
      cached: !!cached,
      status: 'pending',
      startedAt,
      stageIntervals: [{ stage: 'build', startTime: startedAt }],
    };
    const timer = createStageMarker(trace);
    const live = (): boolean => request.ticket === activationTicket;
    /**
     * (audit R1) After every wait: a later request supersedes this one, which settles without presenting — with the world
     * when that later request already presents this very world awake (a direct activation of it), else rejected (another
     * world, or the Garage's dormancy over this one).
     */
    const supersededBy = (world: World): boolean => {
      if (live()) return false;
      if (request.state === 'resolving' || request.state === 'warming') moveActivationRequest(request, 'superseded');
      if (current !== world || dormant) throw new WorldActivationSupersededError(id);
      return true;
    };
    /**
     * (audit R1 review) A request that ends without presenting (superseded or failed) restores the hidden invariant its warm
     * lifted: every built world is in the scene hidden (map.ts, the coordinator) and the residency hides a dormant one, so
     * a world nobody presents is hidden again — unless a later request is warming this same world (its warm owns it now).
     */
    const standDown = (): void => {
      const warmed = request.world as World | null;
      if (!warmed || request.state === 'activated') return;
      if (warmed === current && !dormant) return;
      if (latestRequest && latestRequest !== request && latestRequest.world === warmed
        && latestRequest.state === 'warming') return;
      warmed.group.visible = false;
    };
    try {
      const next = await resolveWorld(id, cached, trace, onProgress);
      if (supersededBy(next)) {
        timer.complete();
        return next;
      }
      timer.mark('build');
      moveActivationRequest(request, 'warming');
      request.world = next;
      await warmWorldForActivation(next, activationOptions, timer.mark, live);
      // (audit R1 review) a warm superseded part way stops there: no cloud wait for a world nobody presents
      if (supersededBy(next)) {
        timer.complete();
        return next;
      }

      await options.awaitInitialCloudWarm();
      await options.ensureCloudTexturesChunked?.(options.nextFrame);
      if (supersededBy(next)) {
        timer.complete();
        return next;
      }
      timer.mark('clouds');

      const needsServices = activationOptions?.services !== false
        && servicesMapId !== next.mapId;
      if (current !== next || dormant) {
        presentWorld(next, {
          services: activationOptions?.services !== false,
          atmosphere: activationOptions?.atmosphere,
        });
      } else {
        // A cancelled covered entry may leave this same active world with
        // presentation only. Explicit ordinary/capture ensure restores its IBL.
        if (!activationOptions?.atmosphere && skyEnvironmentDeferred) restoreAtmosphere(next);
        if (needsServices) prepareServices(next);
      }
      moveActivationRequest(request, 'activated');
      timer.mark('activate');
      timer.complete();
      return next;
    } catch (error) {
      if (request.state === 'resolving' || request.state === 'warming') moveActivationRequest(request, 'failed');
      let detail = { name: 'Error', message: 'Unprintable activation error' };
      try {
        detail = error instanceof Error
          ? { name: error.name, message: error.message }
          : { name: 'Error', message: String(error) };
      } catch { /* arbitrary thrown values need not be printable */ }
      timer.fail(detail);
      throw error;
    } finally {
      standDown();
      releaseHold();
    }
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
    prefetch: (mapId, prefetchOptions) => {
      // the Garage's planned battle on another battlefield: the dormant one goes first (a speculative prefetch keeps it)
      if (prefetchOptions?.intent) releaseDormantExcept(mapId);
      return coordinator.prefetch(mapId, prefetchOptions) as Promise<World | null> | null;
    },
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
      // A Frontline Assault variant of the same map satisfies the request: the
      // battle owner re-selects its map a few seconds in, and the garage staging
      // area may keep the trench build until the next standard battle loads.
      // (audit R1) it is a request for the battlefield on screen: an ensure still in flight never presents over it
      if (current?.mapId === mapId) {
        supersedeActivations();
        return current;
      }
      const cached = coordinator.cached(mapId);
      return cached ? activate(cached) : ensure(mapId);
    },
    ensure,
    invalidateSkyPresentation() { skyPresentationDirty = true; },
    markEnvironmentPrepared(world) {
      if (world && world === current) skyEnvironmentDeferred = false;
    },
    releaseDormantExcept,
    setDormant(nextDormant) {
      // (audit R1 review) the Garage taking the screen is a request too: an ensure still in flight (an entry whose sibling
      // task failed and that restores the Garage, a Studio left while its battlefield loads) never presents over it
      if (nextDormant) supersedeActivations();
      if (!current) return;
      if (!nextDormant && skyPresentationDirty) restoreAtmosphere(current);
      if (dormant === nextDormant) return;
      dormant = nextDormant;
      options.setSceneWorldActive(current.group, !nextDormant);
    },
  };
}
