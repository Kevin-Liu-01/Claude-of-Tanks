import { createThermalVehicles } from '../engine/thermalVehicles.ts';
import type { RuntimeValue } from '../runtimeTypes.ts';
import type {
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
import type { ForwardProgramWarmOwner } from '../engine/programWarm.ts';
import type { BattleWarmAccess } from '../game/battleWarmAccess.ts';
import type { CombatWarmRuntimeContext } from '../game/battleWarmRuntime.ts';
import {
  createCombatWarmCoordinator,
  type CombatWarmCoordinator,
} from '../game/combatWarmCoordinator.ts';
import {
  createDeferredCombatWarmRuntime,
  type DeferredCombatWarmRuntime,
} from '../game/deferredCombatWarmRuntime.ts';
import type { BattleVisualStreamer } from '../game/battleVisualStreamer.ts';
import type {
  MainEntity,
  MainFxRuntime,
  MainGameState,
  MainLightingRuntime,
  MainWorld,
} from './mainContracts.ts';

type CombatWarmPost = CombatWarmRuntimeContext['post'];
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
  prepareModeVisuals?(): void;
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

interface CombatWarmComposition {
  thermalVehicles: ReturnType<typeof createThermalVehicles>;
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
  const warmRender = createOffscreenSceneWarmer(renderer, scene, camera, 0.125);
  const deploymentShadowWarm = createDeploymentShadowWarmOwner({
    renderer,
    scene,
    camera,
    lighting,
    warmRender,
    getWorldGroup: () => getWorld()?.group ?? null,
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
    createOpening: () => battleWarm.requireRuntime().createCombatOpeningWarmSteps(createContext()),
    createRare: (execution) => battleWarm.requireRuntime().createCombatRareWarmSteps(createContext(), execution),
  });

  const deferred: DeferredCombatWarmRuntime = createDeferredCombatWarmRuntime({
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
  });

  const warmStudioPipeline = (
    onProgress?: ((fraction: number, label: string) => void) | null,
  ): Promise<void> => battleWarm.warmStudioEffects({
    fx: getFx(),
    post,
    renderer,
    camera,
    initializeForwardPrograms: forwardProgramWarm.initializeSteps,
    isCombatPipelineWarmed: combatWarm.isRareReady,
    onProgress: onProgress ?? undefined,
    onTrace: publishStudioTrace,
  });

  return {
    thermalVehicles,
    warmVisionSteps,
    combatWarm,
    warmRender,
    deploymentShadowWarm,
    scheduleDeferred: deferred.schedule,
    cancelDeferred: deferred.cancel,
    warmStudioPipeline,
    setDestructionWarmed: (warmed) => { destructionWarmed = warmed; },
    isDestructionWarmed: () => destructionWarmed,
    resetRendererWarmState() {
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
