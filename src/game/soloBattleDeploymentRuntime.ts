import type { Camera, Object3D, Scene } from 'three';
import {
  createOpaqueLoadingYielder,
  nextFrame,
  type WorkYielder,
} from '../engine/frameScheduler.ts';
import {
  createDeploymentForwardWarmBatches,
  createIsolatedForwardWarmBatches,
} from '../engine/deploymentWarm.ts';
import type { DeploymentShadowWarmOwner } from '../engine/deploymentShadowWarm.ts';
import type { ForwardProgramWarmOwner } from '../engine/programWarm.ts';
import type { BattleEntryLifecycle } from './battleEntryLifecycle.ts';
import type { BattleVisualEntity, BattleVisualStreamer } from './battleVisualStreamer.ts';
import type { CombatWarmCoordinator } from './combatWarmCoordinator.ts';

interface DeploymentEntity extends BattleVisualEntity {
  team?: string;
  isPlayer?: boolean;
}

interface DeploymentGame {
  phase?: string;
  preBattleS?: number;
  tanks: DeploymentEntity[];
  player?: DeploymentEntity | null;
}

interface DeploymentWorld {
  group?: Object3D | null;
}

interface BattleLoadPort {
  progress(fraction: number, label: string): void;
}

interface ArmorWarmPort {
  warm(): () => void;
}

interface FxPort {
  group: Object3D;
}

interface CombatFxSubmission {
  staged: boolean;
  restore(): void;
}

interface BattleWarmPort {
  warmBattleTerrainTiles(options: {
    game: DeploymentGame;
    world: DeploymentWorld | null;
    yieldForBudget: WorkYielder;
  }): Promise<unknown>;
  stageCombatFxProgramSubmission(options: {
    game: DeploymentGame;
    fx: FxPort;
    post: PostWarmPort;
    camera: Camera;
    createShell: unknown;
  }): Promise<CombatFxSubmission>;
}

interface PostWarmPort {
  setAdaptiveSuspended(suspended: boolean): void;
  warmFirstFrame(yieldForBudget: WorkYielder): Promise<unknown>;
}

type DeploymentCsmLights = Parameters<
  typeof createDeploymentForwardWarmBatches
>[0]['csmLights'];

interface LightingPort {
  csm?: { lights?: DeploymentCsmLights };
}

interface TraceSink {
  mark?(event: string, payload: Record<string, unknown>): void;
}

interface DeploymentWarmTrace {
  done: boolean;
  phase: 'transition';
  stages: Record<string, number>;
  enemyVisualsDeferred?: boolean;
  deploymentCompileMs?: number;
  deploymentFxForwardWarm?: {
    batches: number;
    maxMs: number;
    totalMs: number;
  };
  deploymentUniformsDeferred?: boolean;
  deploymentShadowWarm?: unknown;
  deploymentForwardWarm?: {
    batches: unknown[];
    maxMs: number;
    totalMs: number;
  };
  deploymentPostWarm?: unknown;
  totalMs?: number;
  preBattleRemainingS?: number | null;
  doneBeforeRollout?: boolean;
  error?: string;
}

type DeploymentWarmHost = typeof globalThis & {
  __BATTLE_COUNTDOWN_WARM?: DeploymentWarmTrace;
  __COMBAT_OPENING_WARM?: {
    covered: boolean;
    batches: number;
    totalMs: number;
  };
};

export interface SoloBattleDeploymentRuntimeOptions {
  game: DeploymentGame;
  scene: Scene;
  camera: Camera;
  battleLoad: BattleLoadPort;
  battleWarm: BattleWarmPort;
  armorAimOverlay: ArmorWarmPort;
  forwardProgramWarm: ForwardProgramWarmOwner;
  combatWarm: Pick<CombatWarmCoordinator, 'markOpeningReady'>;
  post: PostWarmPort;
  lighting: LightingPort;
  createShell: unknown;
  getWorld(): DeploymentWorld | null;
  getBattleVisuals(): BattleVisualStreamer;
  getFx(): FxPort;
  getWarmRender(): () => void;
  getDeploymentShadowWarm(): DeploymentShadowWarmOwner;
  getEntryLifecycle(): BattleEntryLifecycle;
  prepareRevealCamera(): void;
  getGeneration(): number;
  advanceGeneration(): number;
  setPending(pending: boolean): void;
  setDestructionWarmed(warmed: boolean): void;
  devTrace?: TraceSink | null;
  now?: () => number;
  yieldFrame?: () => Promise<unknown>;
  createLoadingYielder?: (budgetMs: number, maxDelayMs: number) => WorkYielder;
}

export interface SoloBattleDeploymentWarmResult {
  generation: number;
  revealPrimed: boolean;
}

export interface SoloBattleDeploymentRuntime {
  warm(camoSweep: PromiseLike<unknown> | unknown): Promise<SoloBattleDeploymentWarmResult>;
}

/**
 * Own the covered solo deployment warm from final camouflage through the
 * first production-quality battlefield frame. Callers know only the warm
 * generation and whether reveal was primed; shader, CSM, FX and cohort order
 * remain local to this module.
 */
export function createSoloBattleDeploymentRuntime({
  game,
  scene,
  camera,
  battleLoad,
  battleWarm,
  armorAimOverlay,
  forwardProgramWarm,
  combatWarm,
  post,
  lighting,
  createShell,
  getWorld,
  getBattleVisuals,
  getFx,
  getWarmRender,
  getDeploymentShadowWarm,
  getEntryLifecycle,
  prepareRevealCamera,
  getGeneration,
  advanceGeneration,
  setPending,
  setDestructionWarmed,
  devTrace = null,
  now = () => performance.now(),
  yieldFrame = nextFrame,
  createLoadingYielder = createOpaqueLoadingYielder,
}: SoloBattleDeploymentRuntimeOptions): SoloBattleDeploymentRuntime {
  const required = [battleLoad?.progress, battleWarm?.warmBattleTerrainTiles,
    battleWarm?.stageCombatFxProgramSubmission, armorAimOverlay?.warm,
    forwardProgramWarm?.compile, combatWarm?.markOpeningReady,
    post?.setAdaptiveSuspended, post?.warmFirstFrame, getWorld,
    getBattleVisuals, getFx, getWarmRender, getDeploymentShadowWarm,
    getEntryLifecycle, prepareRevealCamera, getGeneration, advanceGeneration,
    setPending, setDestructionWarmed, now, yieldFrame, createLoadingYielder];
  if (required.some((entry) => typeof entry !== 'function')) {
    throw new TypeError('solo deployment runtime requires every warm lifecycle port');
  }

  const host = globalThis as DeploymentWarmHost;
  const stillCurrent = (generation: number): boolean => generation === getGeneration();

  return {
    async warm(camoSweep) {
      const generation = advanceGeneration();
      setPending(true);
      let revealPrimed = false;
      const trace: DeploymentWarmTrace = {
        done: false,
        phase: 'transition',
        stages: {},
      };
      host.__BATTLE_COUNTDOWN_WARM = trace;
      devTrace?.mark?.('battle:entry-warm-start', {});
      const startedAt = now();
      let markedAt = startedAt;
      const mark = (name: string): void => {
        const marked = now();
        trace.stages[name] = Math.round(marked - markedAt);
        markedAt = marked;
      };

      try {
        await camoSweep;
        if (!stillCurrent(generation)) return { generation, revealPrimed };
        mark('camo');
        battleLoad.progress(0.91, 'Finishing camouflage');
        const coveredYield = createLoadingYielder(18, 80);
        const battleVisuals = getBattleVisuals();

        await battleVisuals.stream(
          (entity) => (entity as DeploymentEntity).team === 'player',
          coveredYield,
          (fraction) => battleLoad.progress(
            0.91 + fraction * 0.02,
            'Preparing allied vehicles',
          ),
        );
        if (!stillCurrent(generation)) return { generation, revealPrimed };
        mark('allyVisuals');

        // Hidden opponents cannot participate in the first revealed frame.
        // The deferred warm owner streams the same exact builders during the
        // visible deployment countdown, before control is released.
        trace.enemyVisualsDeferred = true;
        if (!stillCurrent(generation)) return { generation, revealPrimed };
        mark('enemyVisuals');

        battleLoad.progress(0.965, 'Warming suspension terrain');
        await battleWarm.warmBattleTerrainTiles({
          game,
          world: getWorld(),
          yieldForBudget: coveredYield,
        });
        if (!stillCurrent(generation)) return { generation, revealPrimed };
        mark('terrainGrid');

        battleLoad.progress(0.968, 'Priming deployment view');
        post.setAdaptiveSuspended(false);
        mark('restoreRenderer');
        prepareRevealCamera();

        const deploymentCompileStartedAt = now();
        const restoreArmorWarmVisibility = armorAimOverlay.warm();
        const fx = getFx();
        const combatFxSubmission = await battleWarm.stageCombatFxProgramSubmission({
          game,
          fx,
          post,
          camera,
          createShell,
        });
        const fxForwardWarmBatches = [];
        try {
          forwardProgramWarm.compile(scene);
          fx.group.visible = false;
          for (const batch of createIsolatedForwardWarmBatches({
            scene,
            root: fx.group,
            warmRender: getWarmRender(),
            cohortSize: 1,
            now,
          })) {
            fxForwardWarmBatches.push(batch);
            await coveredYield(true);
          }
        } catch {
          // The first covered production frame remains the compatibility path.
        } finally {
          combatFxSubmission.restore();
          restoreArmorWarmVisibility();
        }

        if (combatFxSubmission.staged) {
          combatWarm.markOpeningReady();
          setDestructionWarmed(true);
          host.__COMBAT_OPENING_WARM = {
            covered: true,
            batches: fxForwardWarmBatches.length,
            totalMs: Math.round(now() - deploymentCompileStartedAt),
          };
        }
        trace.deploymentCompileMs = Math.round(now() - deploymentCompileStartedAt);
        trace.deploymentFxForwardWarm = {
          batches: fxForwardWarmBatches.length,
          maxMs: Math.max(0, ...fxForwardWarmBatches.map((batch) => batch.ms)),
          totalMs: fxForwardWarmBatches.reduce((sum, batch) => sum + batch.ms, 0),
        };

        await yieldFrame();
        await yieldFrame();
        // Those newly submitted programs belong to hidden combat effects.
        // Reflecting every private ANGLE uniform table here can block for more
        // than a second even though none is rendered by the reveal frame.
        trace.deploymentUniformsDeferred = true;
        battleLoad.progress(0.969, 'Priming deployment shadows');
        trace.deploymentShadowWarm = await getDeploymentShadowWarm().prime(coveredYield);
        mark('shadowMaps');

        const forwardBatches = [];
        for (const batch of createDeploymentForwardWarmBatches({
          scene,
          csmLights: lighting.csm?.lights,
          worldGroup: getWorld()?.group,
          playerRoot: game.player?.visual?.root,
          warmRender: getWarmRender(),
          now,
        })) {
          forwardBatches.push(batch);
          await coveredYield(true);
        }
        const forwardBatchMs = forwardBatches.map((batch) => batch.ms);
        trace.deploymentForwardWarm = {
          batches: forwardBatches,
          maxMs: forwardBatchMs.length ? Math.max(...forwardBatchMs) : 0,
          totalMs: forwardBatchMs.reduce((sum, ms) => sum + ms, 0),
        };
        mark('forwardPrograms');

        trace.deploymentPostWarm = await post.warmFirstFrame(coveredYield);
        mark('postPasses');
        battleLoad.progress(0.97, 'Priming deployment view');
        const entryLifecycle = getEntryLifecycle();
        await entryLifecycle.primeReveal();
        revealPrimed = true;
        entryLifecycle.coverRendering();
        if (!stillCurrent(generation)) return { generation, revealPrimed };
        mark('openingFrame');

        battleLoad.progress(0.975, 'Combat effects ready');
        mark('combatTextures');
        if (!stillCurrent(generation)) return { generation, revealPrimed };
        trace.totalMs = Math.round(now() - startedAt);
        trace.preBattleRemainingS = Number.isFinite(game.preBattleS)
          ? game.preBattleS ?? null
          : null;
        trace.doneBeforeRollout = game.phase === 'battle'
          && typeof game.preBattleS === 'number'
          && game.preBattleS > 0;
        trace.done = true;
        host.__BATTLE_COUNTDOWN_WARM = trace;
        devTrace?.mark?.('battle:entry-warm-end', { totalMs: trace.totalMs });
      } catch (error) {
        if (stillCurrent(generation)) {
          trace.done = true;
          trace.doneBeforeRollout = false;
          trace.error = String(error);
          host.__BATTLE_COUNTDOWN_WARM = trace;
        }
      }
      return { generation, revealPrimed };
    },
  };
}
