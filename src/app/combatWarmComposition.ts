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
  mark?(event: string, payload: Record<string, unknown>): void;
}

export interface CombatWarmCompositionOptions {
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
  prebakeBurntSteps: CombatWarmRuntimeContext['prebakeBurntSteps'];
  warmWreckTextures: CombatWarmRuntimeContext['warmWreckTextures'];
  createIsolatedForwardWarmBatches: IsolatedForwardWarmFactory;
  scratch1: Vector3;
  scratch2: Vector3;
  scratch3: Vector3;
  anisotropy: number;
  noteFovPrimed(fov: number): void;
  simDt: number;
  publishStudioTrace?(trace: unknown): void;
  devTrace?: TraceSink | null;
}

export interface CombatWarmComposition {
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
    createRare: () => battleWarm.requireRuntime().createCombatRareWarmSteps(createContext()),
  });

  const deferred: DeferredCombatWarmRuntime = createDeferredCombatWarmRuntime({
    game,
    renderer,
    camera,
    getBattleVisuals,
    combatWarm,
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
    combatWarm,
    warmRender,
    deploymentShadowWarm,
    scheduleDeferred: deferred.schedule,
    cancelDeferred: deferred.cancel,
    warmStudioPipeline,
    setDestructionWarmed: (warmed) => { destructionWarmed = warmed; },
    isDestructionWarmed: () => destructionWarmed,
    resetRendererWarmState() {
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
