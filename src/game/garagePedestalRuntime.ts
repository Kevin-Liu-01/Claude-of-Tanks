import type { RuntimeValue } from '../runtimeTypes.ts';
import type {
  Object3D,
  Scene,
  Vector3,
} from 'three';
import { createGaragePedestalPreloader } from './garagePedestalPreloader.ts';

type BudgetYield = () => Promise<void> | undefined;

interface GaragePedestalSpec {
  [key: string]: RuntimeValue;
}

export interface GaragePedestalVisual {
  specId: string;
  spec?: GaragePedestalSpec;
  root: Object3D;
  dispose(): void;
  setVisible?(visible: boolean): void;
  centerOnPresentationPoint?(x: number, z: number): void;
  presentationTrackFloorYM?: number | null;
  seatOnFloor?(y: number): void;
  seatRunningGearOnFloor?(y: number): void;
  prepareForSimulation?(): void;
  setGroundSampler?(sampler: RuntimeValue): void;
  __everShown?: boolean;
  __pedestalCompiling?: boolean;
  __pedestalCompileP?: Promise<void> | null;
}

interface BattleEntity {
  visual?: GaragePedestalVisual | null;
}

interface GarageSwitchStageSpan { beginMs: number; endMs: number }

type GarageSwitchStageName = 'import' | 'paint' | 'build' | 'stage' | 'compile';

/**
 * FSP-01 (2026-09-25): one bounded stage record per Garage selection. Spans
 * are elapsed intervals from the selection call (never CPU time); `core` and
 * `tail` copy the factory's own interval receipts so a switch profile can
 * attribute construction without changing any construction step.
 */
export interface GarageSwitchRecord {
  id: string;
  token: number;
  path: 'cached' | 'procedural' | 'speculative' | 'aborted';
  startedAt: number;
  revealMs: number | null;
  stages: Partial<Record<GarageSwitchStageName, GarageSwitchStageSpan>>;
  build?: { workMs: number; yieldMs: number; checkpointCount: number; maxStepMs: number };
  core?: Record<string, number>;
  tail?: Record<string, number>;
  /** Program link wait before reveal: preparation status, frames waited, and the warm owner's receipts. */
  link?: { status: string; reason?: string; pending: number | null; slices: number; waitMs: number;
    timing: Record<string, number> };
  abortReason?: string;
}

interface ProgramPreparationOutcome {
  status: 'complete' | 'incomplete';
  pending?: number | null;
  reason?: string;
}

interface PedestalDebugTarget {
  __SWITCH_TIMINGS?: Array<Record<string, RuntimeValue>>;
  __PED_TRACE?: Array<Record<string, RuntimeValue>>;
  __GARAGE_SWITCH?: GarageSwitchRecord[];
}

declare global {
  interface Window extends PedestalDebugTarget {}
}

interface InitialPedestalOptions {
  builderReady?: Promise<RuntimeValue>;
  yieldForBudget?: BudgetYield;
}

interface PedestalVisualOptions {
  camoSeed: number;
  quality: 'ai';
  staticPreview: true;
  batchStatic: true;
  eraVisualBindingReceipt: false;
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
    options: PedestalVisualOptions,
  ): GaragePedestalVisual;
  createVisualSteps(
    specId: string,
    options: PedestalVisualOptions,
  ): Generator<void, GaragePedestalVisual, void>;
  getSpec(specId: string): GaragePedestalSpec;
  ensureTankBuilder(specId: string): Promise<RuntimeValue>;
  ensureTankBuilders(specIds: readonly string[]): Promise<RuntimeValue>;
  prebakeSharedTextures(
    spec: GaragePedestalSpec,
    anisotropy: number,
    quality: 'ai' | 'preview',
    yieldForBudget?: BudgetYield,
  ): Promise<RuntimeValue>;
  discardSharedTextures(specId: string): void;
  createBudgetYield(budgetMs: number): BudgetYield;
  compilePrograms(root: Object3D): void;
  /**
   * Optional strict first-use preparation of the hero's forward programs:
   * submission, KHR_parallel_shader_compile readiness polling in bounded
   * slices and uniform reflection. The runtime awaits one frame per yield.
   */
  prepareProgramSteps?(
    root: Object3D,
    timing: Record<string, number>,
  ): Generator<void, ProgramPreparationOutcome | void, void>;
  nextFrame(): Promise<RuntimeValue>;
  getDeviceTier(): string;
  getPhase(): string;
  isBootComplete(): boolean;
  getSelectedId(): string;
  getNeighborIds(): readonly string[];
  /** Nearest cards constructed ahead into the warm cache while the Garage is quiet. */
  getSpeculativeIds?(): readonly string[];
  getBattlePlayer(): BattleEntity | null | undefined;
  getBattleEntity(specId: string): BattleEntity | null | undefined;
  groundSampler: RuntimeValue;
  scheduleDelay(callback: () => void, delayMs: number): RuntimeValue;
  acquireBackgroundWork?: (
    kind: 'pedestal-neighbors',
    stillValid: () => boolean,
  ) => Promise<{ release(): void } | null>;
  scheduleWatchdog?(callback: () => void, delayMs: number): RuntimeValue;
  cancelWatchdog?(handle: RuntimeValue): void;
  now?(): number;
  debugTarget?: PedestalDebugTarget | null;
  warn?(message: string, error: RuntimeValue): void;
  invalidatePresentation?(): void;
}

export interface GaragePedestalRuntime {
  readonly current: GaragePedestalVisual | null;
  readonly cacheIds: readonly string[];
  readonly switchPending: boolean;
  set(specId: string, force?: boolean): Promise<void>;
  prepareInitial(specId: string, options?: InitialPedestalOptions): Promise<void>;
  preloadIntent(specId: string): Promise<RuntimeValue>;
  invalidatePreload(): void;
  queueNeighbors(): void;
  trim(maxEntries?: number): void;
  hasCached(specId: string): boolean;
  isOnStage(visual?: GaragePedestalVisual | null): boolean;
  poseCurrent(): void;
  adoptBattlePlayer(specId: string): boolean;
  lendToBattle(specId: string): boolean;
  buildSpeculative(
    specId: string,
    stillValid?: () => boolean,
    protectedIds?: readonly string[],
  ): Promise<boolean>;
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
  createVisualSteps,
  getSpec,
  ensureTankBuilder,
  ensureTankBuilders,
  prebakeSharedTextures,
  discardSharedTextures,
  createBudgetYield,
  compilePrograms,
  prepareProgramSteps,
  nextFrame,
  getDeviceTier,
  getPhase,
  isBootComplete,
  getSelectedId,
  getNeighborIds,
  getSpeculativeIds = () => [],
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
    ? window
    : null,
  warn = (message, error) => console.warn(message, error),
  invalidatePresentation = () => {},
}: GaragePedestalRuntimeOptions): GaragePedestalRuntime {
  const required = [createVisual, createVisualSteps, getSpec, ensureTankBuilder, ensureTankBuilders,
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
  let disposed = false;
  const cache = new Map<string, GaragePedestalVisual>();
  const parked = new WeakMap<GaragePedestalVisual, number>();
  const trackedDisposal = new WeakSet<GaragePedestalVisual>();
  const retired = new WeakSet<GaragePedestalVisual>();

  // A parked root is deliberately parentless, so parent presence alone can
  // no longer distinguish it from an externally disposed visual. Preserve
  // that invalidation contract without disposing any additional resource.
  const trackDisposal = (visual: GaragePedestalVisual) => {
    if (trackedDisposal.has(visual)) return;
    trackedDisposal.add(visual);
    const originalDispose = visual.dispose;
    visual.dispose = () => {
      if (retired.has(visual)) return;
      retired.add(visual);
      parked.delete(visual);
      if (cache.get(visual.specId) === visual) cache.delete(visual.specId);
      if (current === visual) current = null;
      originalDispose.call(visual);
    };
  };

  const fielded = (visual: GaragePedestalVisual) => getPhase() !== 'garage'
    && (getBattlePlayer()?.visual === visual
      || getBattleEntity(visual.specId)?.visual === visual);

  const reusable = (visual: GaragePedestalVisual) => !retired.has(visual)
    && (visual.root.parent === scene || (parked.has(visual)
      && visual.root.parent === null && visual.root.visible === false
      && visual.root.position.y === parked.get(visual)));

  // Direct Studio boot intentionally warms its future Garage hero while idle.
  const canStage = () => !disposed && (getPhase() === 'garage' || getPhase() === 'studio');

  if (debugTarget) {
    debugTarget.__SWITCH_TIMINGS = [];
    debugTarget.__PED_TRACE = [];
    debugTarget.__GARAGE_SWITCH = [];
  }

  const round1 = (value: number) => Math.round(value * 10) / 10;
  const openSwitchRecord = (
    id: string,
    token: number,
    startedAt: number,
    path: GarageSwitchRecord['path'] = 'procedural',
  ): GarageSwitchRecord => ({ id, token, path, startedAt, revealMs: null, stages: {} });
  const closeStage = (record: GarageSwitchRecord, name: GarageSwitchStageName, beginAt: number) => {
    record.stages[name] = {
      beginMs: round1(beginAt - record.startedAt),
      endMs: round1(now() - record.startedAt),
    };
  };
  const publishSwitchRecord = (record: GarageSwitchRecord) => {
    const log = debugTarget?.__GARAGE_SWITCH;
    if (!log) return;
    log.push(record);
    if (log.length > TRACE_LIMIT) log.splice(0, log.length - TRACE_LIMIT);
  };
  const abortSwitchRecord = (record: GarageSwitchRecord, reason: string) => {
    record.path = 'aborted';
    record.abortReason = reason;
    publishSwitchRecord(record);
  };
  // The factory records elapsed timestamps; publish durations so consumers
  // never depend on the construction clock origin.
  const buildTimingDurations = (root: Object3D): Pick<GarageSwitchRecord, 'core' | 'tail'> => {
    const out: Pick<GarageSwitchRecord, 'core' | 'tail'> = {};
    const core = root.userData.coreBuildTiming as Record<string, number> | undefined;
    if (core && Number.isFinite(core.startedAt)) {
      out.core = {
        setupMs: round1(core.setupMs),
        materialsMs: round1(core.materialsFinishedAt - core.materialsStartedAt),
        authoredMs: round1(core.authoredFinishedAt - core.authoredStartedAt),
        bindMergeMs: round1(core.bindMergeFinishedAt - core.authoredFinishedAt),
        assemblyMs: round1(core.finishedAt - core.bindMergeFinishedAt),
        totalMs: round1(core.finishedAt - core.startedAt),
      };
    }
    const tail = root.userData.tailBuildTiming as Record<string, number> | undefined;
    if (tail && Number.isFinite(tail.decorStartedAt)) {
      out.tail = {
        decorMs: round1(tail.decorFinishedAt - tail.decorStartedAt),
        decorWorkMs: round1(Number(root.userData.decorBuildMs) || 0),
        fillsMs: round1(tail.fillsFinishedAt - tail.decorFinishedAt),
        normalizeMs: round1(tail.normalizeFinishedAt - tail.fillsFinishedAt),
        batchMs: round1(tail.batchFinishedAt - tail.normalizeFinishedAt),
        finalizeMs: round1(tail.finalizeFinishedAt - tail.batchFinishedAt),
        shadowBatchMs: round1(tail.shadowBatchFinishedAt - tail.finalizeFinishedAt),
        shareMs: round1(tail.shareFinishedAt - tail.shadowBatchFinishedAt),
        totalMs: round1(tail.shareFinishedAt - tail.decorStartedAt),
      };
    }
    return out;
  };

  const trace = (event: string, data: Record<string, RuntimeValue>) => {
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

  const park = (visual: GaragePedestalVisual | null, leavingGarage = false) => {
    if (!visual || (visual === current && !leavingGarage) || fielded(visual)) return;
    if (visual.root.parent !== scene) return;
    // Never strip the last visible cover while a replacement is compiling.
    if (isOnStage(visual) && !isOnStage(current)) {
      trace('park-deferred', { id: visual.specId, pv: visualState(current) });
      return;
    }
    trace('park', { id: visual.specId });
    visual.setVisible?.(false);
    visual.root.visible = false;
    visual.root.position.y = garagePosition.y + PARK_OFFSET_Y;
    visual.root.removeFromParent();
    parked.set(visual, visual.root.position.y);
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
      if (visual === current || visual.__pedestalCompiling || isOnStage(visual)
        || fielded(visual)) continue;
      evict(specId, visual);
    }
  };

  const touch = (specId: string, visual: GaragePedestalVisual) => {
    trackDisposal(visual);
    cache.delete(specId);
    cache.set(specId, visual);
    // Prefer never-shown speculative entries, then fall back to true LRU.
    // The inserted, current, compiling, and visible roots are never victims.
    for (const pass of [1, 2]) {
      for (const [candidateId, candidate] of cache) {
        if (cache.size <= residentLimit) return;
        if (candidate === current || candidate.__pedestalCompiling
          || candidate === visual || isOnStage(candidate) || fielded(candidate)) continue;
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
    getSpeculativeIds,
    buildSpeculative: (specId, stillValid, protectedIds) => buildSpeculative(specId, stillValid, protectedIds),
  });

  const recordSwitch = (
    specId: string,
    startedAt: number,
    path: 'cached' | 'procedural',
    phases: Record<string, number> | null = null,
    record: GarageSwitchRecord | null = null,
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
    if (record) {
      record.revealMs = elapsedMs;
      publishSwitchRecord(record);
    }
    invalidatePresentation();
    if (isBootComplete() && getPhase() === 'garage') preloader.queueNeighbors();
  };

  const buildVisual = async (
    specId: string,
    stillCurrent: () => boolean,
    phases: Record<string, number>,
  ): Promise<GaragePedestalVisual | null> => {
    const options: PedestalVisualOptions = {
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
      // Live ERA clusters and checked anatomy remain present. The fitted-face
      // report is only for authoring; battle construction already omits it.
      eraVisualBindingReceipt: false,
    };
    const steps = isBootComplete() ? createVisualSteps(specId, options) : null;
    const yieldForBudget = createBudgetYield(16);
    let visual: GaragePedestalVisual | null = null;
    let complete = false;
    let transferred = false;
    phases.buildYieldMs = 0;
    phases.buildCheckpointCount = 0;
    phases.maxBuildStepMs = 0;
    try {
      if (steps) {
        while (stillCurrent()) {
          const startedAt = now();
          const result = steps.next();
          const elapsed = now() - startedAt;
          phases.buildMs += elapsed;
          phases.maxBuildStepMs = Math.max(phases.maxBuildStepMs, elapsed);
          if (result.done) {
            complete = true;
            visual = result.value;
            break;
          }
          if (!stillCurrent()) return null;
          const pausedAt = now();
          await yieldForBudget();
          phases.buildYieldMs += now() - pausedAt;
          phases.buildCheckpointCount += 1;
        }
      } else {
        const startedAt = now();
        visual = createVisual(specId, options);
        phases.buildMs = phases.maxBuildStepMs = now() - startedAt;
      }
      if (!visual || !stillCurrent()) return null;
      transferred = true;
      return visual;
    } finally {
      // A partial factory graph remains iterator-owned. Completion transfers
      // ownership here, but never into the scene/cache after a stale selection.
      if (steps && !complete) steps.return(undefined as never);
      if (visual && !transferred) visual.dispose();
    }
  };

  const warmPrograms = async (
    visual: GaragePedestalVisual,
    stillCurrent: () => boolean = () => true,
    record: GarageSwitchRecord | null = null,
  ) => {
    if (getDeviceTier() === 'mobile') return;
    try {
      if (!prepareProgramSteps) {
        // Submit-only fallback: two frames give the linker a head start and
        // the first visible render resolves any link still pending.
        compilePrograms(visual.root);
        await nextFrame();
        await nextFrame();
        return;
      }
      // FSP-01 (2026-09-25): a freshly submitted program's first draw blocks
      // on its deferred KHR_parallel_shader_compile link (three's onFirstUse
      // link-status read measured 0.5–0.9 s for 7–8 programs on ANGLE Metal
      // in the first frame after reveal). Submit, then poll readiness one
      // bounded slice per frame while the outgoing hero stays visible, and
      // reflect uniforms before the incoming hero is shown. A stale selection
      // stops waiting; the preparation owner keeps its own deadline.
      const timing: Record<string, number> = {};
      const startedAt = now();
      const steps = prepareProgramSteps(visual.root, timing);
      let slices = 0;
      let result: ProgramPreparationOutcome | undefined;
      try {
        for (;;) {
          if (!stillCurrent()) break;
          const step = steps.next();
          if (step.done) {
            result = step.value ?? undefined;
            break;
          }
          slices += 1;
          await nextFrame();
        }
      } finally {
        steps.return(undefined);
      }
      if (record) {
        record.link = {
          status: result?.status ?? 'stale', reason: result?.reason, pending: result?.pending ?? null,
          slices, waitMs: round1(now() - startedAt), timing,
        };
      }
    } catch (_) {
      // The first visible render remains the compatibility fallback.
    }
  };

  /**
   * FSP-01 R2: construct a likely next hero into the warm cache while the
   * Garage is quiet. Never shown until selected; never displaces a hero the
   * player has seen (only a stale never-shown entry outside `protectedIds`);
   * cancelled at every checkpoint by fresh input through `stillValid`. A
   * selection of this very vehicle during the link wait keeps the wait alive
   * so the selection reveals fully prepared.
   */
  const buildSpeculative = async (
    specId: string,
    stillValid: () => boolean = () => true,
    protectedIds: readonly string[] = [],
  ): Promise<boolean> => {
    if (disposed || getDeviceTier() === 'mobile' || !isBootComplete() || getPhase() !== 'garage') return false;
    if (cache.has(specId) || specId === getSelectedId() || current?.specId === specId) return false;
    if (cache.size >= residentLimit) {
      const displaceable = [...cache.values()].some((visual) => !visual.__everShown
        && visual !== current && !visual.__pedestalCompiling && !isOnStage(visual)
        && !fielded(visual) && !protectedIds.includes(visual.specId));
      if (!displaceable) return false;
    }
    const valid = () => stillValid() && canStage() && getPhase() === 'garage'
      && !cache.has(specId) && getSelectedId() !== specId;
    const record = openSwitchRecord(specId, 0, now(), 'speculative');
    const phases: Record<string, number> = { prebakeMs: 0, buildMs: 0, compileMs: 0 };
    const prebakeAt = now();
    try {
      await ensureTankBuilder(specId);
      await prebakeSharedTextures(getSpec(specId), anisotropy, 'ai', createBudgetYield(6));
    } catch (error) {
      warn('[garage] speculative hero preparation failed:', error);
      return false;
    }
    closeStage(record, 'paint', prebakeAt);
    if (!valid()) {
      abortSwitchRecord(record, 'speculative-stale');
      return false;
    }
    const buildStartedAt = now();
    const incoming = await buildVisual(specId, valid, phases);
    closeStage(record, 'build', buildStartedAt);
    if (!incoming || !valid()) {
      incoming?.dispose();
      abortSwitchRecord(record, 'speculative-stale');
      return false;
    }
    record.build = {
      workMs: round1(phases.buildMs), yieldMs: round1(phases.buildYieldMs),
      checkpointCount: phases.buildCheckpointCount, maxStepMs: round1(phases.maxBuildStepMs),
    };
    Object.assign(record, buildTimingDurations(incoming.root));
    incoming.spec = getSpec(specId);
    pose(incoming);
    incoming.root.position.y = garagePosition.y + PARK_OFFSET_Y;
    scene.add(incoming.root);
    incoming.__pedestalCompiling = true;
    touch(specId, incoming);
    const compileAt = now();
    const warmValid = () => canStage() && cache.get(specId) === incoming
      && (stillValid() || getSelectedId() === specId);
    incoming.__pedestalCompileP = warmPrograms(incoming, warmValid, record).finally(() => {
      incoming.__pedestalCompiling = false;
      incoming.__pedestalCompileP = null;
    });
    await incoming.__pedestalCompileP;
    closeStage(record, 'compile', compileAt);
    if (cache.get(specId) !== incoming || retired.has(incoming)) return false;
    // A selection made during the wait reveals through the cached path; an
    // unselected hero waits parked, hidden and detached, like any warm entry.
    if (current !== incoming && !isOnStage(incoming)) park(incoming);
    publishSwitchRecord(record);
    return true;
  };

  const set = (specId: string, force = false): Promise<void> => {
    if (!canStage()) return Promise.resolve();
    if (!force && current?.specId === specId) {
      // Returning to the still-visible outgoing hero must invalidate a newer
      // in-flight selection. Its late completion cannot override this choice.
      if (pollToken === shownToken && isOnStage(current)) {
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
      if (previousRetired || !previous || previous === current) return;
      previousRetired = true;
      park(previous);
    };

    let cached = cache.get(specId);
    if (cached && !reusable(cached)) {
      trace('purge-detached', { id: specId });
      parked.delete(cached);
      cache.delete(specId);
      cached = undefined;
    }
    if (cached) {
      const cachedToken = pollToken;
      const revealCached = () => {
        if (!canStage() || cachedToken !== pollToken || !cached) return;
        if (cache.get(specId) !== cached || !reusable(cached)) return;
        current = cached;
        touch(specId, cached);
        parked.delete(cached);
        if (!cached.root.parent) scene.add(cached.root);
        pose(cached);
        cached.setVisible?.(true);
        cached.root.visible = true;
        retirePrevious();
        recordSwitch(specId, startedAt, 'cached', null,
          openSwitchRecord(specId, cachedToken, startedAt, 'cached'));
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
    const record = openSwitchRecord(specId, buildToken, startedAt);
    const importStartedAt = phaseAt;
    return Promise.all([
      ensureTankBuilder(specId).then((ready) => {
        closeStage(record, 'import', importStartedAt);
        return ready;
      }),
      prebakeSharedTextures(
        getSpec(specId), anisotropy, 'ai', createBudgetYield(6),
      ).catch(() => undefined).then(() => closeStage(record, 'paint', importStartedAt)),
    ]).then(async () => {
      phases.prebakeMs = Math.round(now() - phaseAt);
      if (!canStage() || buildToken !== pollToken) {
        trace('prebake-stale', { id: specId, tok: buildToken });
        abortSwitchRecord(record, 'prebake-stale');
        return;
      }

      const buildStartedAt = now();
      const incoming = await buildVisual(specId,
        () => canStage() && buildToken === pollToken, phases);
      closeStage(record, 'build', buildStartedAt);
      if (!incoming || !canStage() || buildToken !== pollToken) {
        incoming?.dispose();
        trace('build-stale', { id: specId, tok: buildToken });
        abortSwitchRecord(record, 'build-stale');
        return;
      }
      phaseAt = now();
      incoming.spec = getSpec(specId);
      pose(incoming);
      incoming.root.position.y = garagePosition.y + PARK_OFFSET_Y;
      scene.add(incoming.root);
      touch(specId, incoming);
      phases.buildMs += now() - phaseAt;
      closeStage(record, 'stage', phaseAt);
      phases.decorMs = Math.round(Number(incoming.root.userData.decorBuildMs) || 0);
      incoming.__pedestalCompiling = true;
      phaseAt = now();
      const compileWork = isBootComplete()
        ? warmPrograms(incoming, () => canStage() && buildToken === pollToken, record)
        : Promise.resolve();
      incoming.__pedestalCompileP = compileWork.finally(() => {
        incoming.__pedestalCompiling = false;
        incoming.__pedestalCompileP = null;
        if (!disposed && cache.get(specId) === incoming) touch(specId, incoming);
      });
      await incoming.__pedestalCompileP;
      phases.compileMs = Math.round(now() - phaseAt);
      closeStage(record, 'compile', phaseAt);
      record.build = {
        workMs: round1(phases.buildMs),
        yieldMs: round1(phases.buildYieldMs),
        checkpointCount: phases.buildCheckpointCount,
        maxStepMs: round1(phases.maxBuildStepMs),
      };
      Object.assign(record, buildTimingDurations(incoming.root));
      if (!canStage() || buildToken !== pollToken
        || cache.get(specId) !== incoming || !reusable(incoming)) {
        trace('compile-stale', { id: specId, tok: buildToken });
        abortSwitchRecord(record, 'compile-stale');
        park(incoming);
        return;
      }
      current = incoming;
      pose(incoming);
      incoming.setVisible?.(true);
      incoming.root.visible = true;
      retirePrevious();
      recordSwitch(specId, startedAt, 'procedural', phases, record);
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
    if (disposed || getPhase() !== 'garage') return false;
    const incoming = getBattlePlayer()?.visual;
    if (!incoming || incoming.specId !== specId || retired.has(incoming)) return false;
    const cached = cache.get(specId);
    if (cached && reusable(cached) && cached !== incoming) return false;
    const outgoing = current;
    incoming.spec = getSpec(specId);
    if (!incoming.root.parent) scene.add(incoming.root);
    current = incoming;
    parked.delete(incoming);
    pose(incoming);
    incoming.setVisible?.(true);
    incoming.root.visible = true;
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
    if (disposed) return false;
    const visual = current;
    const entity = getBattleEntity(specId);
    if (visual && visual.specId !== specId) {
      // Direct entry/rematch can request a different tank from the hero still
      // on the podium. Keep its warm cache, but remove its off-map scene graph
      // before battle and invalidate any unfinished Garage selection.
      pollToken += 1;
      shownToken = pollToken;
      preloader.invalidate();
      park(visual, true);
      return false;
    }
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
    // A slow Garage selection must not finish after the current hero has
    // been handed to simulation and move that actor back onto the podium.
    pollToken += 1;
    preloader.invalidate();
    visual.setGroundSampler?.(groundSampler);
    trace('lend-battle', { id: specId });
    return true;
  };

  const watchdog = scheduleWatchdog(() => {
    if (disposed || !isBootComplete() || getPhase() !== 'garage') return;
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
    // Environment activation precedes reveal/adoption on Garage return. Keep
    // a parked root's owned sentinel intact until that reveal reattaches it.
    poseCurrent: () => { if (current && !parked.has(current)) pose(current); },
    adoptBattlePlayer,
    lendToBattle,
    buildSpeculative,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      pollToken += 1;
      preloader.invalidate();
      cancelWatchdog(watchdog);
    },
  };
}
