import { createThermalVehicles } from '../engine/thermalVehicles.ts';
import type { RuntimeValue } from '../runtimeTypes.ts';
import type {
  Object3D,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { createOffscreenSceneWarmer, type OffscreenSceneWarmer } from '../engine/offscreenWarm.ts';
import {
  createDeploymentShadowWarmOwner,
  type DeploymentShadowWarmOwner,
} from '../engine/deploymentShadowWarm.ts';
import {
  snapshotRendererPrograms,
  warmNewRendererProgramUniforms,
  type ContextProgramRenderer,
  type ForwardProgramWarmOwner,
} from '../engine/programWarm.ts';
import type { WorkYielder } from '../engine/frameScheduler.ts';
import type { BattleWarmAccess } from '../game/battleWarmAccess.ts';
import type { CombatWarmRuntimeContext } from '../game/battleWarmRuntime.ts';
import {
  createCombatWarmCoordinator,
  type CombatWarmCoordinator,
} from '../game/combatWarmCoordinator.ts';
import type { DeferredCombatWarmRuntime } from '../game/deferredCombatWarmRuntime.ts';
import type { BattleVisualStreamer } from '../game/battleVisualStreamer.ts';
import { preloadWreckTurretDriver } from '../vehicles/wreckTurretDriverLoader.ts';
import type {
  MainEntity,
  MainFxRuntime,
  MainGameState,
  MainLightingRuntime,
  MainWorld,
} from './mainContracts.ts';

/** (perf-245) the live scene target's MSAA sample count: the warm target matches it (offscreenWarm.ts samples) */
type CombatWarmPost = CombatWarmRuntimeContext['post'] & { readonly msaaSamples?: number };
type IsolatedForwardWarmFactory = CombatWarmRuntimeContext['createIsolatedForwardWarmBatches'];

interface TraceSink {
  mark?(event: string, payload: Record<string, RuntimeValue>): void;
}

interface CombatWarmCompositionOptions {
  game: MainGameState;
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  post: CombatWarmPost;
  lighting: MainLightingRuntime;
  battleWarm: BattleWarmAccess;
  forwardProgramWarm: ForwardProgramWarmOwner;
  getFx(): MainFxRuntime;
  getWorld(): MainWorld | null;
  getBattleVisuals(): BattleVisualStreamer<MainEntity>;
  getGeneration(): number;
  setPending(pending: boolean): void;
  prepareNextOpeningRoute(): boolean;
  ensureStagedVisuals(count: number): boolean;
  prepareModeVisuals?(): readonly Object3D[] | void;
  prebakeBurntSteps: CombatWarmRuntimeContext['prebakeBurntSteps'];
  warmWreckTextures: CombatWarmRuntimeContext['warmWreckTextures'];
  createIsolatedForwardWarmBatches: IsolatedForwardWarmFactory;
  scratch1: Vector3;
  scratch2: Vector3;
  scratch3: Vector3;
  anisotropy: number;
  noteFovPrimed(fov: number): void;
  simDt: number;
  publishStudioTrace?(trace: RuntimeValue): void;
  devTrace?: TraceSink | null;
}

/** The covered first-battle warm's record (window.__BATTLE_FIRST_WARM): what ran behind the veil and how long. */
interface FirstBattleWarmTrace {
  ran: boolean;
  stages: Record<string, number>;
  totalMs: number;
  failed?: string;
  /** The enemy programs' uniform warm, when it did not finish (the deferred warm's then). */
  enemyUniforms?: string;
}

interface CombatWarmComposition {
  thermalVehicles: ReturnType<typeof createThermalVehicles>;
  /**
   * (battle-spikes-253; the owner via the coordinator, 2026-10-25: "a few seconds' longer entry once per session is far
   * better than 0.1-1.1 s stalls in the first seconds of play") A session's first battle finishes the GPU-heavy warm
   * stages behind the entry veil; later battles (the renderer's programs and pipelines warm) skip it.
   */
  warmFirstBattleCovered(yieldForBudget: WorkYielder, onProgress?: ((fraction: number) => void) | null): Promise<FirstBattleWarmTrace>;
  warmVisionSteps(): Generator<void>;
  combatWarm: CombatWarmCoordinator;
  warmRender: OffscreenSceneWarmer;
  deploymentShadowWarm: DeploymentShadowWarmOwner;
  scheduleDeferred(generation: number): Promise<void>;
  cancelDeferred(): void;
  warmStudioPipeline(
    onProgress?: ((fraction: number, label: string) => void) | null,
  ): Promise<void>;
  setDestructionWarmed(warmed: boolean): void;
  isDestructionWarmed(): boolean;
  resetRendererWarmState(): void;
  dispose(): void;
}

/**
 * Own every renderer-lifetime combat warm cache and its cancellation policy.
 *
 * The composition root supplies stable application ports; this owner keeps
 * opening/rare generators, private render targets, deployment shadows,
 * Studio FX preparation, and deferred rollout work on one reset/dispose path.
 */
export function createCombatWarmComposition({
  game,
  renderer,
  scene,
  camera,
  post,
  lighting,
  battleWarm,
  forwardProgramWarm,
  getFx,
  getWorld,
  getBattleVisuals,
  getGeneration,
  setPending,
  prepareNextOpeningRoute,
  ensureStagedVisuals,
  prepareModeVisuals,
  prebakeBurntSteps,
  warmWreckTextures,
  createIsolatedForwardWarmBatches,
  scratch1,
  scratch2,
  scratch3,
  anisotropy,
  noteFovPrimed,
  simDt,
  publishStudioTrace,
  devTrace = null,
}: CombatWarmCompositionOptions): CombatWarmComposition {
  const thermalVehicles = createThermalVehicles();
  let destructionWarmed = false;
  // a session's first battle warms its GPU-heavy stages behind the veil once (warmFirstBattleCovered); a lost context
  // (resetRendererWarmState) takes the programs and pipelines with it, so the next battle warms them again
  let firstBattleWarmed = false;
  const warmRender = createOffscreenSceneWarmer(renderer, scene, camera, 0.125, { samples: () => post.msaaSamples ?? 0 });
  const deploymentShadowWarm = createDeploymentShadowWarmOwner({
    renderer,
    scene,
    camera,
    lighting,
    warmRender,
    noteFovPrimed,
    simDt,
  });

  const warmVisionSteps = function* (): Generator<void> {
    yield* thermalVehicles.warmSteps(game.tanks, game.player?.team, function* (root) {
      const steps = (function* () {
        yield* forwardProgramWarm.initializeSteps(root);
        // Bind uniforms and buffers using the actual scene lights and HDR target.
        yield* createIsolatedForwardWarmBatches({ scene, root, warmRender, cohortSize: Infinity });
      })();
      try {
        for (;;) {
          // Enemy visuals may be staged off-scene until first spotted. Attach
          // only during this private synchronous transaction, never at a yield.
          const detached = !root.parent;
          let done = false;
          try {
            if (detached) scene.add(root);
            done = !!steps.next().done;
          } finally { if (detached) scene.remove(root); }
          if (done) break;
          yield;
        }
      } finally { steps.return(undefined); }
    });
  };

  let combatWarm!: CombatWarmCoordinator;
  const createContext = (): CombatWarmRuntimeContext => ({
    game,
    fx: getFx(),
    post,
    renderer,
    camera,
    scene,
    world: getWorld,
    warmRender,
    deploymentShadowWarm,
    forwardProgramWarm,
    lighting,
    scratch1,
    scratch2,
    scratch3,
    anisotropy,
    ensureStagedVisuals,
    prepareModeVisuals,
    prebakeBurntSteps,
    warmWreckTextures,
    createIsolatedForwardWarmBatches,
    isOpeningReady: () => combatWarm.isOpeningReady(),
    isRareReady: () => combatWarm.isRareReady(),
    markOpeningReady: () => combatWarm.markOpeningReady(),
    markRareReady: () => combatWarm.markRareReady(),
    isDestructionWarmed: () => destructionWarmed,
    setDestructionWarmed: (value) => { destructionWarmed = value; },
  });

  combatWarm = createCombatWarmCoordinator({
    createOpening: (execution) => battleWarm.requireRuntime().createCombatOpeningWarmSteps(createContext(), execution),
    createRare: (execution) => battleWarm.requireRuntime().createCombatRareWarmSteps(createContext(), execution),
  });

  // (2026-10-16, the perf lane: 226's game entry budget) the deferred warm's owner is battle-only: its module is its own
  // chunk, fetched once the boot is idle and at the latest when a battle schedules it. A stale schedule (the battle gone
  // before the module landed) does nothing, and the hold it would have released belongs to the newer battle; a module
  // that fails to load releases the countdown's hold rather than holding it forever.
  const deferredOptions: Parameters<typeof import('../game/deferredCombatWarmRuntime.ts').createDeferredCombatWarmRuntime>[0] = {
    game,
    renderer,
    camera,
    getBattleVisuals,
    combatWarm,
    warmVisionSteps,
    warmBattleTerrainTiles: (yieldForBudget) => battleWarm.warmBattleTerrainTiles({
      game,
      world: getWorld(),
      yieldForBudget,
      primePresentation: false,
    }),
    getWorld,
    getGeneration,
    setPending,
    prepareNextOpeningRoute,
    devTrace,
  };
  let deferredRuntime: DeferredCombatWarmRuntime | null = null;
  let deferredModule: Promise<typeof import('../game/deferredCombatWarmRuntime.ts')> | null = null;
  const loadDeferred = () => {
    deferredModule ??= import('../game/deferredCombatWarmRuntime.ts').catch((error: unknown) => {
      deferredModule = null;
      throw error;
    });
    return deferredModule;
  };
  {
    const host = globalThis as { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number };
    const prefetch = (): void => { void loadDeferred().catch(() => { /* retried by the battle that schedules it */ }); };
    if (typeof host.requestIdleCallback === 'function') host.requestIdleCallback(prefetch, { timeout: 4000 });
    else setTimeout(prefetch, 1500);
  }
  const deferred: DeferredCombatWarmRuntime = {
    schedule(generation) {
      return loadDeferred().then((module) => {
        deferredRuntime ??= module.createDeferredCombatWarmRuntime(deferredOptions);
        if (generation !== getGeneration()) return undefined;
        return deferredRuntime.schedule(generation);
      }, (error: unknown) => {
        console.warn('[warm] the deferred warm did not load (the countdown goes on without it):', error);
        if (generation === getGeneration()) setPending(false);
      });
    },
    cancel() { deferredRuntime?.cancel(); },
    isActive: () => deferredRuntime?.isActive() ?? false,
  };

  // A Studio take stages its kills as soon as this resolves: its turrets pop as bodies (wreckTurretDriverLoader.ts), and
  // a physics that cannot load leaves the scripted pop rather than failing the take.
  const warmStudioPipeline = (
    onProgress?: ((fraction: number, label: string) => void) | null,
  ): Promise<void> => Promise.all([
    battleWarm.warmStudioEffects({
      fx: getFx(),
      post,
      renderer,
      camera,
      initializeForwardPrograms: forwardProgramWarm.initializeSteps,
      isCombatPipelineWarmed: combatWarm.isRareReady,
      onProgress: onProgress ?? undefined,
      onTrace: publishStudioTrace,
    }),
    preloadWreckTurretDriver().catch(() => undefined),
  ]).then(() => undefined);
  // After battle entry: the wreck turret's physics, if the entry's load (battleWarmAccess.ts) did not land it. Never
  // awaited; a kill before it resolves keeps the scripted pop for that turret.
  const scheduleDeferred = (generation: number): Promise<void> => {
    void preloadWreckTurretDriver().catch(() => undefined);
    return deferred.schedule(generation);
  };

  /**
   * Behind the entry veil, a session's first battle (battle-spikes-253): the GPU-heavy work the deferred warm would do in
   * the live battle's first seconds — the hidden enemies' visuals and their programs, the opening and rare effects
   * (rendered as a covered load renders them, so the GPU builds their pipelines here), and the sights' heat stand-ins.
   * The census measured those stages as 100 ms-1.1 s GPU-process stalls in a cold session's first ~10 s of combat, and
   * none in its later battles. After it the deferred warm finds this work done (the visuals streamed, the warms ready, the
   * stand-ins warmed) and only routes, tiles and the lookahead remain. Later battles skip it; a failure is the deferred
   * warm's to finish, as before.
   */
  const warmFirstBattleCovered = async (
    yieldForBudget: WorkYielder,
    onProgress: ((fraction: number) => void) | null = null,
  ): Promise<FirstBattleWarmTrace> => {
    const trace: FirstBattleWarmTrace = { ran: false, stages: {}, totalMs: 0 };
    (globalThis as { __BATTLE_FIRST_WARM?: FirstBattleWarmTrace }).__BATTLE_FIRST_WARM = trace;
    if (firstBattleWarmed) return trace;
    trace.ran = true;
    const startedAt = performance.now();
    let markedAt = startedAt;
    const mark = (stage: string, fraction: number): void => {
      const at = performance.now();
      trace.stages[stage] = Math.round(at - markedAt);
      markedAt = at;
      onProgress?.(fraction);
    };
    try {
      const baseline = snapshotRendererPrograms(renderer as unknown as ContextProgramRenderer);
      await getBattleVisuals().stream((entity) => entity.team === 'enemy', yieldForBudget, null, true);
      // the new enemy programs' uniforms; a link still pending (or no program owner) is the deferred warm's, as there
      try { await warmNewRendererProgramUniforms(renderer as unknown as ContextProgramRenderer, baseline, yieldForBudget); }
      catch (error) { trace.enemyUniforms = String((error as Error)?.message ?? error).slice(0, 120); }
      mark('enemyVisuals', 0.3);
      await combatWarm.warmOpeningChunked(6, yieldForBudget, { covered: true });
      mark('openingEffects', 0.4);
      await combatWarm.warmRareChunked(6, yieldForBudget, { covered: true });
      mark('rareEffects', 0.75);
      for (const _ of warmVisionSteps()) await yieldForBudget(true);
      mark('visionPrograms', 1);
      firstBattleWarmed = true;
    } catch (error) {
      trace.failed = String((error as Error)?.message ?? error).slice(0, 200);
      console.warn('[warm] the first battle\'s covered warm stopped (the deferred warm finishes it):', error);
    }
    trace.totalMs = Math.round(performance.now() - startedAt);
    devTrace?.mark?.('battle:first-warm', { totalMs: trace.totalMs, ran: 1 });
    return trace;
  };

  return {
    thermalVehicles,
    warmFirstBattleCovered,
    warmVisionSteps,
    combatWarm,
    warmRender,
    deploymentShadowWarm,
    scheduleDeferred,
    cancelDeferred: deferred.cancel,
    warmStudioPipeline,
    setDestructionWarmed: (warmed) => { destructionWarmed = warmed; },
    isDestructionWarmed: () => destructionWarmed,
    resetRendererWarmState() {
      firstBattleWarmed = false;
      thermalVehicles.invalidateWarm();
      destructionWarmed = false;
      battleWarm.invalidate();
      forwardProgramWarm.invalidate();
      combatWarm.reset();
      deferred.cancel();
      setPending(false);
    },
    dispose() {
      deferred.cancel();
      deploymentShadowWarm.dispose();
      warmRender.dispose();
    },
  };
}
