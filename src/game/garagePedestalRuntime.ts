import type {
  Object3D,
  Scene,
  Vector3,
} from 'three';
import { createGaragePedestalPreloader } from './garagePedestalPreloader.ts';

type BudgetYield = () => Promise<void> | undefined;

interface GaragePedestalSpec {
  [key: string]: unknown;
}

export interface GaragePedestalVisual {
  specId: string;
  spec?: GaragePedestalSpec;
  root: Object3D;
  dispose(): void;
  setVisible?(visible: boolean): void;
  centerOnPresentationPoint?(x: number, z: number): void;
  presentationTrackFloorYM?: number;
  seatOnFloor?(y: number): void;
  seatRunningGearOnFloor?(y: number): void;
  prepareForSimulation?(): void;
  setGroundSampler?(sampler: unknown): void;
  __everShown?: boolean;
  __pedestalCompiling?: boolean;
  __pedestalCompileP?: Promise<void> | null;
}

interface BattleEntity {
  visual?: GaragePedestalVisual | null;
}

interface PedestalDebugTarget {
  __SWITCH_TIMINGS?: Array<Record<string, unknown>>;
  __PED_TRACE?: Array<Record<string, unknown>>;
}

interface InitialPedestalOptions {
  builderReady?: Promise<unknown>;
  yieldForBudget?: BudgetYield;
}

interface GaragePedestalRuntimeOptions {
  scene: Scene;
  garagePosition: Vector3;
  podiumTopY: number;
  trackAxisYawRad: number;
  residentLimit: number;
  anisotropy: number;
  createVisual(
    specId: string,
    options: {
      camoSeed: number;
      quality: 'ai';
      staticPreview: true;
      batchStatic: true;
    },
  ): GaragePedestalVisual;
  getSpec(specId: string): GaragePedestalSpec;
  ensureTankBuilder(specId: string): Promise<unknown>;
  ensureTankBuilders(specIds: readonly string[]): Promise<unknown>;
  prebakeSharedTextures(
    spec: GaragePedestalSpec,
    anisotropy: number,
    quality: 'ai' | 'preview',
    yieldForBudget?: BudgetYield,
  ): Promise<unknown>;
  discardSharedTextures(specId: string): void;
  createBudgetYield(budgetMs: number): BudgetYield;
  compilePrograms(root: Object3D): void;
  nextFrame(): Promise<unknown>;
  getDeviceTier(): string;
  getPhase(): string;
  isBootComplete(): boolean;
  getSelectedId(): string;
  getNeighborIds(): readonly string[];
  getBattlePlayer(): BattleEntity | null | undefined;
  getBattleEntity(specId: string): BattleEntity | null | undefined;
  groundSampler: unknown;
  scheduleDelay(callback: () => void, delayMs: number): unknown;
  acquireBackgroundWork?: (
    kind: 'pedestal-neighbors',
    stillValid: () => boolean,
  ) => Promise<{ release(): void } | null>;
  scheduleWatchdog?(callback: () => void, delayMs: number): unknown;
  cancelWatchdog?(handle: unknown): void;
  now?(): number;
  debugTarget?: PedestalDebugTarget | null;
  warn?(message: string, error: unknown): void;
  invalidatePresentation?(): void;
}

export interface GaragePedestalRuntime {
  readonly current: GaragePedestalVisual | null;
  readonly cacheIds: readonly string[];
  readonly switchPending: boolean;
  set(specId: string, force?: boolean): Promise<void>;
  prepareInitial(specId: string, options?: InitialPedestalOptions): Promise<void>;
  preloadIntent(specId: string): Promise<unknown>;
  invalidatePreload(): void;
  queueNeighbors(): void;
  trim(maxEntries?: number): void;
  hasCached(specId: string): boolean;
  isOnStage(visual?: GaragePedestalVisual | null): boolean;
  poseCurrent(): void;
  adoptBattlePlayer(specId: string): boolean;
  lendToBattle(specId: string): boolean;
  dispose(): void;
}

const PARK_OFFSET_Y = -200;
const PENDING_GRACE_MS = 8000;
const TRACE_LIMIT = 500;

/**
 * Own the complete garage-hero lifecycle: async construction, shader
 * submission, warm LRU residency, switch convergence, and battle handoff.
 * Callers choose *which* vehicle is wanted; this owner guarantees that the
 * selected first-party visual becomes the one visible on the stage.
 */
export function createGaragePedestalRuntime({
  scene,
  garagePosition,
  podiumTopY,
  trackAxisYawRad,
  residentLimit,
  anisotropy,
  createVisual,
  getSpec,
  ensureTankBuilder,
  ensureTankBuilders,
  prebakeSharedTextures,
  discardSharedTextures,
  createBudgetYield,
  compilePrograms,
  nextFrame,
  getDeviceTier,
  getPhase,
  isBootComplete,
  getSelectedId,
  getNeighborIds,
  getBattlePlayer,
  getBattleEntity,
  groundSampler,
  scheduleDelay,
  acquireBackgroundWork,
  scheduleWatchdog = (callback, delayMs) => globalThis.setInterval(callback, delayMs),
  cancelWatchdog = (handle) => globalThis.clearInterval(
    handle as ReturnType<typeof globalThis.setInterval>,
  ),
  now = () => performance.now(),
  debugTarget = typeof window !== 'undefined'
    ? window as unknown as PedestalDebugTarget
    : null,
  warn = (message, error) => console.warn(message, error),
  invalidatePresentation = () => {},
}: GaragePedestalRuntimeOptions): GaragePedestalRuntime {
  const required = [createVisual, getSpec, ensureTankBuilder, ensureTankBuilders,
    prebakeSharedTextures, discardSharedTextures, createBudgetYield, nextFrame,
    compilePrograms,
    getDeviceTier, getPhase, isBootComplete, getSelectedId, getNeighborIds,
    getBattlePlayer, getBattleEntity, scheduleDelay, scheduleWatchdog,
    cancelWatchdog, now, warn, invalidatePresentation];
  if (required.some((entry) => typeof entry !== 'function')) {
    throw new TypeError('garage pedestal runtime requires every lifecycle port');
  }
  if (!scene || !garagePosition || residentLimit < 1) {
    throw new TypeError('garage pedestal runtime requires its scene and residency policy');
  }

  let current: GaragePedestalVisual | null = null;
  let pollToken = 0;
  let shownToken = 0;
  let pendingSince = 0;
  const cache = new Map<string, GaragePedestalVisual>();

  if (debugTarget) {
    debugTarget.__SWITCH_TIMINGS = [];
    debugTarget.__PED_TRACE = [];
  }

  const trace = (event: string, data: Record<string, unknown>) => {
    const log = debugTarget?.__PED_TRACE;
    if (!log) return;
    log.push({ t: Math.round(now()), ev: event, ...data });
    if (log.length > TRACE_LIMIT) log.splice(0, log.length - TRACE_LIMIT);
  };

  const visualState = (visual: GaragePedestalVisual | null) => {
    if (!visual) return null;
    const root = visual.root;
    return `${visual.specId}${root.parent ? '' : '/detached'}`
      + `${root.visible === false ? '/hidden' : ''}`
      + `${root.position.y < garagePosition.y - 50 ? '/parked' : ''}`;
  };

  const isOnStage = (visual: GaragePedestalVisual | null = current) => {
    if (!visual?.root) return false;
    const root = visual.root;
    return !!root.parent && root.visible !== false
      && Math.abs(root.position.x - garagePosition.x) < 4
      && Math.abs(root.position.z - garagePosition.z) < 4
      && root.position.y > garagePosition.y - 50;
  };

  const switchPending = () => pollToken !== shownToken
    && now() - pendingSince < PENDING_GRACE_MS;

  const pose = (visual: GaragePedestalVisual) => {
    // The pedestal owns the complete showroom pose. Battle visuals can arrive
    // with arbitrary hull yaw, pitch, and roll, while older adoption code used
    // a separate 162-degree heading. Reapply one canonical transform here so
    // fresh, cached, and post-battle vehicles frame identically.
    visual.root.rotation.set(0, trackAxisYawRad, 0, 'YXZ');
    if (visual.centerOnPresentationPoint) {
      visual.centerOnPresentationPoint(garagePosition.x, garagePosition.z);
    } else {
      visual.root.position.x = garagePosition.x;
      visual.root.position.z = garagePosition.z;
    }
    if (visual.seatRunningGearOnFloor) {
      visual.seatRunningGearOnFloor(garagePosition.y + podiumTopY);
    } else if (visual.seatOnFloor) {
      visual.seatOnFloor(garagePosition.y + podiumTopY);
    } else {
      visual.root.position.y = garagePosition.y + 0.35;
    }
  };

  const park = (visual: GaragePedestalVisual | null) => {
    if (!visual || visual === current) return;
    // Never strip the last visible cover while a replacement is compiling.
    if (isOnStage(visual) && !isOnStage(current)) {
      trace('park-deferred', { id: visual.specId, pv: visualState(current) });
      return;
    }
    trace('park', { id: visual.specId });
    visual.setVisible?.(false);
    visual.root.position.y = garagePosition.y + PARK_OFFSET_Y;
  };

  const evict = (specId: string, visual: GaragePedestalVisual) => {
    cache.delete(specId);
    trace('evict', { id: visual.specId, state: visualState(visual) });
    scene.remove(visual.root);
    visual.dispose();
  };

  const trim = (maxEntries = residentLimit) => {
    for (const [specId, visual] of cache) {
      if (cache.size <= maxEntries) break;
      if (visual === current || visual.__pedestalCompiling || isOnStage(visual)) continue;
      evict(specId, visual);
    }
  };

  const touch = (specId: string, visual: GaragePedestalVisual) => {
    cache.delete(specId);
    cache.set(specId, visual);
    // Prefer never-shown speculative entries, then fall back to true LRU.
    // The inserted, current, compiling, and visible roots are never victims.
    for (const pass of [1, 2]) {
      for (const [candidateId, candidate] of cache) {
        if (cache.size <= residentLimit) return;
        if (candidate === current || candidate.__pedestalCompiling
          || candidate === visual || isOnStage(candidate)) continue;
        if (pass === 1 && candidate.__everShown) continue;
        evict(candidateId, candidate);
      }
    }
  };

  const preloader = createGaragePedestalPreloader({
    getPhase,
    isBootComplete,
    getSelectedId,
    getNeighborIds,
    hasCachedVisual: (specId) => cache.has(specId),
    ensureTankBuilder,
    ensureTankBuilders,
    getSpec,
    prebakeSharedTextures,
    discardSharedTextures,
    createBudgetYield,
    nextFrame,
    scheduleDelay,
    acquireBackgroundWork,
    anisotropy,
    warn,
  });

  const recordSwitch = (
    specId: string,
    startedAt: number,
    path: 'cached' | 'procedural',
    phases: Record<string, number> | null = null,
  ) => {
    if (current) current.__everShown = true;
    shownToken = pollToken;
    for (const visual of cache.values()) {
      if (visual !== current && isOnStage(visual)) park(visual);
    }
    const elapsedMs = Math.round(now() - startedAt);
    debugTarget?.__SWITCH_TIMINGS?.push({
      id: specId,
      ms: elapsedMs,
      path,
      ...(phases || {}),
    });
    trace('reveal', { id: specId, ms: elapsedMs, path, pv: visualState(current) });
    invalidatePresentation();
    if (isBootComplete() && getPhase() === 'garage') preloader.queueNeighbors();
  };

  const buildVisual = (specId: string, parked = false) => {
    const visual = createVisual(specId, {
      camoSeed: 4200,
      quality: 'ai',
      staticPreview: true,
      // A Garage hero still articulates at the hull/turret/gun boundaries,
      // but every fitting inside those owners is static. Collapse those
      // exact meshes before their first GPU submission so a pristine ANGLE
      // process does not compile and upload hundreds of redundant draws.
      // The same batched representation is already battle-safe and the
      // selected visual can still be lent directly to simulation.
      batchStatic: true,
    });
    visual.spec = getSpec(specId);
    pose(visual);
    if (parked) visual.root.position.y = garagePosition.y + PARK_OFFSET_Y;
    scene.add(visual.root);
    touch(specId, visual);
    return visual;
  };

  const warmPrograms = async (visual: GaragePedestalVisual) => {
    if (getDeviceTier() === 'mobile') return;
    try {
      // Submit without compileAsync completion polling: ANGLE can block on
      // KHR_parallel_shader_compile status reads for hundreds of milliseconds.
      compilePrograms(visual.root);
      await nextFrame();
      await nextFrame();
    } catch (_) {
      // The first visible render remains the compatibility fallback.
    }
  };

  const set = (specId: string, force = false): Promise<void> => {
    if (!force && current?.specId === specId) {
      if (switchPending() || isOnStage(current)) {
        trace('same-spec-return', { id: specId, pv: visualState(current) });
        return Promise.resolve();
      }
      trace('same-spec-rerun', { id: specId, pv: visualState(current) });
    }

    pollToken += 1;
    preloader.invalidate();
    pendingSince = now();
    trace('call', { id: specId, tok: pollToken, pv: visualState(current) });
    const startedAt = now();
    const previous = current;
    let previousRetired = false;
    const retirePrevious = () => {
      if (previousRetired || !previous) return;
      previousRetired = true;
      park(previous);
    };

    let cached = cache.get(specId);
    if (cached && !cached.root.parent) {
      trace('purge-detached', { id: specId });
      cache.delete(specId);
      cached = undefined;
    }
    if (cached) {
      const cachedToken = pollToken;
      const revealCached = () => {
        if (cachedToken !== pollToken || !cached) return;
        current = cached;
        touch(specId, cached);
        pose(cached);
        cached.setVisible?.(true);
        retirePrevious();
        recordSwitch(specId, startedAt, 'cached');
      };
      if (cached.__pedestalCompileP) {
        return cached.__pedestalCompileP.then(revealCached);
      }
      revealCached();
      return Promise.resolve();
    }

    const buildToken = pollToken;
    let phaseAt = now();
    const phases: Record<string, number> = {
      prebakeMs: 0,
      buildMs: 0,
      compileMs: 0,
    };
    return Promise.all([
      ensureTankBuilder(specId),
      prebakeSharedTextures(
        getSpec(specId), anisotropy, 'ai', createBudgetYield(6),
      ).catch(() => undefined),
    ]).then(async () => {
      phases.prebakeMs = Math.round(now() - phaseAt);
      if (buildToken !== pollToken) {
        trace('prebake-stale', { id: specId, tok: buildToken });
        retirePrevious();
        return;
      }

      phaseAt = now();
      const incoming = buildVisual(specId, true);
      phases.buildMs = Math.round(now() - phaseAt);
      phases.decorMs = Math.round(Number(incoming.root.userData.decorBuildMs) || 0);
      incoming.__pedestalCompiling = true;
      phaseAt = now();
      const compileWork = isBootComplete() ? warmPrograms(incoming) : Promise.resolve();
      incoming.__pedestalCompileP = compileWork.finally(() => {
        incoming.__pedestalCompiling = false;
        incoming.__pedestalCompileP = null;
        if (cache.get(specId) === incoming) touch(specId, incoming);
      });
      await incoming.__pedestalCompileP;
      phases.compileMs = Math.round(now() - phaseAt);
      if (buildToken !== pollToken) {
        trace('compile-stale', { id: specId, tok: buildToken });
        return;
      }
      current = incoming;
      pose(incoming);
      incoming.setVisible?.(true);
      retirePrevious();
      recordSwitch(specId, startedAt, 'procedural', phases);
    });
  };

  const prepareInitial = async (
    specId: string,
    options: InitialPedestalOptions = {},
  ) => {
    await Promise.all([
      options.builderReady ?? ensureTankBuilder(specId),
      prebakeSharedTextures(
        getSpec(specId), anisotropy, 'preview', options.yieldForBudget,
      ),
    ]);
    await set(specId);
  };

  const adoptBattlePlayer = (specId: string) => {
    const incoming = getBattlePlayer()?.visual;
    if (!incoming || incoming.specId !== specId) return false;
    const cached = cache.get(specId);
    if (cached?.root?.parent && cached !== incoming) return false;
    const outgoing = current;
    incoming.spec = getSpec(specId);
    if (!incoming.root.parent) scene.add(incoming.root);
    current = incoming;
    pose(incoming);
    incoming.setVisible?.(true);
    incoming.__everShown = true;
    touch(specId, incoming);
    if (outgoing && outgoing !== incoming) park(outgoing);
    pollToken += 1;
    shownToken = pollToken;
    trace('adopt-battle', { id: specId, pv: visualState(incoming) });
    invalidatePresentation();
    return true;
  };

  const lendToBattle = (specId: string) => {
    const visual = current;
    const entity = getBattleEntity(specId);
    if (!visual || visual.specId !== specId || !entity) return false;
    if (visual.__pedestalCompiling || (entity.visual && entity.visual !== visual)) {
      return false;
    }
    try {
      visual.prepareForSimulation?.();
    } catch (_) {
      return false;
    }
    entity.visual = visual;
    visual.setGroundSampler?.(groundSampler);
    trace('lend-battle', { id: specId });
    return true;
  };

  const watchdog = scheduleWatchdog(() => {
    if (!isBootComplete() || getPhase() !== 'garage') return;
    const wanted = getSelectedId();
    if (!wanted || switchPending()) return;
    if (current?.specId === wanted && isOnStage(current)) return;
    trace('watchdog-resync', { want: wanted, pv: visualState(current) });
    void set(wanted, true);
  }, 500);

  return {
    get current() { return current; },
    get cacheIds() { return [...cache.keys()]; },
    get switchPending() { return switchPending(); },
    set,
    prepareInitial,
    preloadIntent: preloader.preloadIntent,
    invalidatePreload: preloader.invalidate,
    queueNeighbors: preloader.queueNeighbors,
    trim,
    hasCached: (specId) => cache.has(specId),
    isOnStage,
    poseCurrent: () => { if (current) pose(current); },
    adoptBattlePlayer,
    lendToBattle,
    dispose: () => cancelWatchdog(watchdog),
  };
}
