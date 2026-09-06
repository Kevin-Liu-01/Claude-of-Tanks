import type { RuntimeValue } from '../runtimeTypes.ts';
import type { Camera, Object3D, Scene } from 'three';
import { checkedIntegrationPort } from '../app/checkedIntegrationPort.ts';
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
import type { PostRuntime } from '../engine/post.ts';
import type { ForwardProgramWarmOwner } from '../engine/programWarm.ts';
import type { BattleEntryLifecycle } from './battleEntryLifecycle.ts';
import type {
  CombatFxSubmission,
  CombatFxSubmissionOptions,
  TerrainWarmOptions,
} from './battleWarmRuntime.ts';
import type { BattleVisualEntity, BattleVisualStreamer } from './battleVisualStreamer.ts';
import type { CombatWarmCoordinator } from './combatWarmCoordinator.ts';

type BattleWarmEntity = TerrainWarmOptions['game']['tanks'][number];

type DeploymentEntity = BattleVisualEntity & BattleWarmEntity & {
  team?: string;
  isPlayer?: boolean;
};

type DeploymentGame = Omit<TerrainWarmOptions['game'], 'tanks' | 'player'> & {
  phase?: string;
  preBattleS?: number;
  tanks: DeploymentEntity[];
  player?: DeploymentEntity | null;
};

type DeploymentWorld = NonNullable<TerrainWarmOptions['world']> & {
  group?: Object3D | null;
};

interface BattleLoadPort {
  progress(fraction: number, label: string): void;
}

interface ArmorWarmPort {
  warm(): () => void;
}

interface BattleWarmPort {
  warmBattleTerrainTiles(options: TerrainWarmOptions): Promise<RuntimeValue>;
  stageCombatFxProgramSubmission(
    options: CombatFxSubmissionOptions,
  ): Promise<CombatFxSubmission> | CombatFxSubmission;
}

type PostWarmPort = Pick<PostRuntime, 'warmFirstFrame'> &
  CombatFxSubmissionOptions['post'];

type DeploymentCsmLights = Parameters<
  typeof createDeploymentForwardWarmBatches
>[0]['csmLights'];

interface LightingPort {
  csm?: { lights?: DeploymentCsmLights };
}

interface TraceSink {
  mark?(event: string, payload: Record<string, RuntimeValue>): void;
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
  deploymentShadowWarm?: RuntimeValue;
  deploymentForwardWarm?: {
    batches: RuntimeValue[];
    maxMs: number;
    totalMs: number;
  };
  deploymentPostWarm?: RuntimeValue;
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

const STALE_DEPLOYMENT = Symbol('stale deployment');

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
  createShell: CombatFxSubmissionOptions['createShell'];
  getWorld(): DeploymentWorld | null;
  getBattleVisuals(): BattleVisualStreamer;
  getFx(): CombatFxSubmissionOptions['fx'];
  getWarmRender(): () => void;
  getDeploymentShadowWarm(): DeploymentShadowWarmOwner;
  getEntryLifecycle(): BattleEntryLifecycle;
  prepareRevealCamera(): void;
  prepareAtmosphere?(): Promise<void>;
  getGeneration(): number;
  advanceGeneration(): number;
  setPending(pending: boolean): void;
  setDestructionWarmed(warmed: boolean): void;
  devTrace?: TraceSink | null;
  now?: () => number;
  yieldFrame?: () => Promise<RuntimeValue>;
  createLoadingYielder?: (budgetMs: number, maxDelayMs: number) => WorkYielder;
}

export interface SoloBattleDeploymentWarmResult {
  generation: number;
  revealPrimed: boolean;
}

export interface SoloBattleDeploymentRuntime {
  warm(camoSweep: PromiseLike<RuntimeValue> | RuntimeValue): Promise<SoloBattleDeploymentWarmResult>;
}

function validateDeploymentPorts(options: SoloBattleDeploymentRuntimeOptions): void {
  try {
    checkedIntegrationPort<BattleLoadPort>(
      options.battleLoad ?? {}, 'solo deployment load screen', ['progress'],
    );
    checkedIntegrationPort<BattleWarmPort>(
      options.battleWarm ?? {},
      'solo deployment battle warm',
      ['warmBattleTerrainTiles', 'stageCombatFxProgramSubmission'],
    );
    checkedIntegrationPort<ArmorWarmPort>(
      options.armorAimOverlay ?? {}, 'solo deployment armor overlay', ['warm'],
    );
    checkedIntegrationPort(
      options.forwardProgramWarm ?? {}, 'solo deployment program warm', ['compile'],
    );
    checkedIntegrationPort(
      options.combatWarm ?? {}, 'solo deployment combat warm', ['markOpeningReady'],
    );
    checkedIntegrationPort(
      options.post ?? {}, 'solo deployment postprocessing', ['warmFirstFrame'],
    );
    checkedIntegrationPort(
      {
        getWorld: options.getWorld,
        getBattleVisuals: options.getBattleVisuals,
        getFx: options.getFx,
        getWarmRender: options.getWarmRender,
        getDeploymentShadowWarm: options.getDeploymentShadowWarm,
        getEntryLifecycle: options.getEntryLifecycle,
        prepareRevealCamera: options.prepareRevealCamera,
        getGeneration: options.getGeneration,
        advanceGeneration: options.advanceGeneration,
        setPending: options.setPending,
        setDestructionWarmed: options.setDestructionWarmed,
        now: options.now ?? (() => performance.now()),
        yieldFrame: options.yieldFrame ?? nextFrame,
        createLoadingYielder: options.createLoadingYielder ?? createOpaqueLoadingYielder,
      },
      'solo deployment lifecycle',
      ['getWorld', 'getBattleVisuals', 'getFx', 'getWarmRender',
        'getDeploymentShadowWarm', 'getEntryLifecycle', 'prepareRevealCamera',
        'getGeneration', 'advanceGeneration', 'setPending', 'setDestructionWarmed',
        'now', 'yieldFrame', 'createLoadingYielder'],
    );
  } catch {
    throw new TypeError('solo deployment runtime requires every warm lifecycle port');
  }
}

/**
 * Own the covered solo deployment warm from final camouflage through the
 * first production-quality battlefield frame. Callers know only the warm
 * generation and whether reveal was primed; shader, CSM, FX and cohort order
 * remain local to this module.
 */
export function createSoloBattleDeploymentRuntime(
  options: SoloBattleDeploymentRuntimeOptions,
): SoloBattleDeploymentRuntime {
  validateDeploymentPorts(options);
  const {
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
  } = options;

  const host = globalThis as DeploymentWarmHost;
  const stillCurrent = (generation: number): boolean => generation === getGeneration();
  const requireCurrent = (generation: number): void => {
    if (!stillCurrent(generation)) throw STALE_DEPLOYMENT;
  };

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
        requireCurrent(generation);
        mark('camo');
        await options.prepareAtmosphere?.();
        requireCurrent(generation);
        mark('atmosphere');
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
        requireCurrent(generation);
        mark('allyVisuals');

        // Hidden opponents cannot participate in the first revealed frame.
        // The deferred warm owner streams the same exact builders during the
        // visible deployment countdown, before control is released.
        trace.enemyVisualsDeferred = true;
        requireCurrent(generation);
        mark('enemyVisuals');

        battleLoad.progress(0.965, 'Warming suspension terrain');
        await battleWarm.warmBattleTerrainTiles({
          game,
          world: getWorld(),
          yieldForBudget: coveredYield,
        });
        requireCurrent(generation);
        mark('terrainGrid');

        battleLoad.progress(0.968, 'Priming deployment view');
        prepareRevealCamera();
        mark('revealCamera');

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

        trace.deploymentPostWarm = await post.warmFirstFrame(() => coveredYield(true));
        mark('postPasses');
        battleLoad.progress(0.97, 'Priming deployment view');
        const entryLifecycle = getEntryLifecycle();
        await entryLifecycle.primeReveal();
        revealPrimed = true;
        entryLifecycle.coverRendering();
        requireCurrent(generation);
        mark('openingFrame');

        battleLoad.progress(0.975, 'Combat effects ready');
        mark('combatTextures');
        requireCurrent(generation);
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
        if (error === STALE_DEPLOYMENT) return { generation, revealPrimed };
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
