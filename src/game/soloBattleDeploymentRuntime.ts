import type { RuntimeValue } from '../runtimeTypes.ts';
import type { Camera, Object3D, Scene } from 'three';
import { checkedIntegrationPort } from '../app/checkedIntegrationPort.ts';
import {
  createOpaqueLoadingYielder,
  nextFrame,
  nextPaintFrame,
  type WorkYielder,
} from '../engine/frameScheduler.ts';
import {
  createDeploymentForwardWarmBatches,
  createIsolatedForwardWarmBatches,
} from '../engine/deploymentWarm.ts';
import type { DeploymentShadowWarmOwner } from '../engine/deploymentShadowWarm.ts';
import type { SceneWatchdogResult } from '../engine/deviceDiag.ts';
import type { PostRuntime } from '../engine/post.ts';
import type { ForwardProgramWarmOwner, ForwardProgramCompileTiming, ProgramPreparationResult } from '../engine/programWarm.ts';
import { LATE_FX_LAYER } from '../fx/layers.ts';
import type { BattleEntryLifecycle } from './battleEntryLifecycle.ts';
import type {
  CombatFxSubmission,
  CombatFxSubmissionOptions,
  TerrainWarmOptions,
  OpeningTerrainPresentationOptions,
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
  primeOpeningTerrainPresentation(options: OpeningTerrainPresentationOptions): Promise<RuntimeValue>;
  stageCombatFxProgramSubmission(
    options: CombatFxSubmissionOptions,
  ): Promise<CombatFxSubmission> | CombatFxSubmission;
}

type PostWarmPort = Pick<PostRuntime, 'warmFirstFrame'> &
  CombatFxSubmissionOptions['post'] & {
    sceneAA: Pick<PostRuntime['sceneAA'], 'sceneTarget'>;
  };

type DeploymentCsmLights = Parameters<
  typeof createDeploymentForwardWarmBatches
>[0]['csmLights'];

interface LightingPort {
  csm?: { lights?: DeploymentCsmLights };
}

interface TraceSink {
  mark?(event: string, payload: Record<string, RuntimeValue>): void;
}

interface TerrainProgramReceipt {
  result: ProgramPreparationResult;
  timing: ForwardProgramCompileTiming;
  error?: string;
}

interface DeploymentWarmTrace {
  done: boolean;
  phase: 'transition';
  stages: Record<string, number>;
  enemyVisualsDeferred?: boolean;
  deploymentCompileMs?: number;
  deploymentProgramSubmission?: ForwardProgramCompileTiming;
  deploymentFxForwardWarm?: {
    batches: number;
    maxMs: number;
    totalMs: number;
  };
  deploymentUniformsDeferred?: boolean;
  deploymentTerrainPrograms?: TerrainProgramReceipt;
  deploymentVegetationPrograms?: TerrainProgramReceipt;
  deploymentShadowWarm?: RuntimeValue;
  deploymentForwardWarm?: {
    batches: RuntimeValue[];
    maxMs: number;
    totalMs: number;
  };
  deploymentPostWarm?: RuntimeValue;
  sceneWatchdog?: SceneWatchdogResult | null;
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
  prepareNightLighting?(): Promise<void>;
  runSceneWatchdog(assertCurrent: () => void): Promise<SceneWatchdogResult | void>;
  getGeneration(): number;
  advanceGeneration(): number;
  setPending(pending: boolean): void;
  setDestructionWarmed(warmed: boolean): void;
  devTrace?: TraceSink | null;
  now?: () => number;
  yieldFrame?: () => Promise<RuntimeValue>;
  /** Native link polling needs a frame-plus-task opportunity, not only a task yield. */
  yieldProgramFrame?: () => Promise<void>;
  createLoadingYielder?: (budgetMs: number, maxDelayMs: number) => WorkYielder;
}

export interface SoloBattleDeploymentWarmResult {
  generation: number;
  revealPrimed: boolean;
  /** Revalidate this generation after every loading/fallback await. */
  assertRevealReady(): void;
}

export interface SoloBattleDeploymentRuntime {
  warm(camoSweep: PromiseLike<RuntimeValue> | RuntimeValue): Promise<SoloBattleDeploymentWarmResult>;
}

async function prepareWorldRootPrograms(
  terrain: Object3D,
  options: Pick<SoloBattleDeploymentRuntimeOptions,
    'getWorld' | 'camera' | 'post' | 'forwardProgramWarm' | 'yieldProgramFrame'>,
  receipt: TerrainProgramReceipt,
  yieldCovered: WorkYielder,
  assertCurrent: () => void,
): Promise<void> {
  const worldGroup = terrain.parent;
  const assertTerrainCurrent = (): void => {
    assertCurrent();
    if (options.getWorld()?.group !== worldGroup || terrain.parent !== worldGroup) throw STALE_DEPLOYMENT;
  };
  assertTerrainCurrent();
  const steps = options.forwardProgramWarm.prepareSceneSteps({
    visibleRoot: terrain, strict: true, sliceMs: 4, timing: receipt.timing,
    passes: [{
      layerMask: options.camera.layers.mask & ~(1 << LATE_FX_LAYER),
      target: options.post.sceneAA.sceneTarget,
    }],
  });
  try {
    for (;;) {
      assertTerrainCurrent();
      const step = steps.next();
      if (step.done) { receipt.result = step.value; break; }
      // Rapid scheduler tasks can consume the finite native polling budget
      // before the browser gets even one rendering opportunity. Give pending
      // links a real frame boundary; retain the compiler's deadline/cap.
      await (options.yieldProgramFrame ?? nextPaintFrame)();
    }
  } catch (error) {
    assertTerrainCurrent();
    receipt.error = String(error);
    receipt.result = { status: 'incomplete', pending: null, reason: 'reflection' };
    // The unchanged covered draw is the compatibility fallback, not proof
    // that failed/unsupported preparation completed successfully.
  } finally {
    steps.return({ status: 'incomplete', pending: null, reason: 'invalidated' });
  }
  await yieldCovered(true);
  assertTerrainCurrent();
}

async function prepareWorldPrograms(
  options: SoloBattleDeploymentRuntimeOptions,
  trace: DeploymentWarmTrace,
  yieldCovered: WorkYielder,
  assertCurrent: () => void,
  mark: (name: string) => void,
): Promise<void> {
  for (const name of ['terrain', 'vegetation'] as const) {
    assertCurrent();
    const root = options.getWorld()?.group?.children.find(child => child.name === name && child.visible);
    if (root) {
      const receipt: TerrainProgramReceipt = {
        result: { status: 'incomplete', pending: null, reason: 'not-requested' }, timing: {},
      };
      if (name === 'terrain') trace.deploymentTerrainPrograms = receipt;
      else trace.deploymentVegetationPrograms = receipt;
      options.battleLoad.progress(0.9695, 'Priming deployment view');
      await prepareWorldRootPrograms(root, options, receipt, yieldCovered, assertCurrent);
    }
    mark(`${name}Programs`);
  }
  assertCurrent();
}

function validateDeploymentPorts(options: SoloBattleDeploymentRuntimeOptions): void {
  try {
    checkedIntegrationPort<BattleLoadPort>(
      options.battleLoad ?? {}, 'solo deployment load screen', ['progress'],
    );
    checkedIntegrationPort<BattleWarmPort>(
      options.battleWarm ?? {},
      'solo deployment battle warm',
      ['warmBattleTerrainTiles', 'primeOpeningTerrainPresentation', 'stageCombatFxProgramSubmission'],
    );
    checkedIntegrationPort<ArmorWarmPort>(
      options.armorAimOverlay ?? {}, 'solo deployment armor overlay', ['warm'],
    );
    checkedIntegrationPort(
      options.forwardProgramWarm ?? {}, 'solo deployment program warm', ['compileSceneSteps', 'prepareSceneSteps'],
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
        runSceneWatchdog: options.runSceneWatchdog,
        now: options.now ?? (() => performance.now()),
        yieldFrame: options.yieldFrame ?? nextFrame,
        createLoadingYielder: options.createLoadingYielder ?? createOpaqueLoadingYielder,
      },
      'solo deployment lifecycle',
      ['getWorld', 'getBattleVisuals', 'getFx', 'getWarmRender',
        'getDeploymentShadowWarm', 'getEntryLifecycle', 'prepareRevealCamera',
        'getGeneration', 'advanceGeneration', 'setPending', 'setDestructionWarmed',
        'now', 'yieldFrame', 'createLoadingYielder', 'runSceneWatchdog'],
    );
  } catch {
    throw new TypeError('solo deployment runtime requires every warm lifecycle port');
  }
}

async function runRequiredSceneWatchdog(
  options: Pick<SoloBattleDeploymentRuntimeOptions, 'runSceneWatchdog'>,
  trace: DeploymentWarmTrace,
  assertRevealReady: () => void,
  assertCurrent: () => void,
  isCurrent: () => boolean,
  mark: (name: string) => void,
): Promise<void> {
  trace.done = false;
  try {
    assertRevealReady();
    const health = await options.runSceneWatchdog(assertCurrent);
    assertCurrent();
    trace.sceneWatchdog = health ?? null;
    mark('sceneWatchdog');
    if (health?.failed) throw new Error('Battlefield scene watchdog could not validate a healthy frame');
  } catch (error) {
    if (error === STALE_DEPLOYMENT || !isCurrent()) {
      throw new Error('Solo battle deployment was superseded');
    }
    trace.done = true;
    trace.doneBeforeRollout = false;
    trace.error = String(error);
    throw error;
  }
}

async function primeCoveredReveal(
  getEntryLifecycle: SoloBattleDeploymentRuntimeOptions['getEntryLifecycle'],
  trace: DeploymentWarmTrace,
  assertRevealReady: () => void,
  assertCurrent: () => void,
  isCurrent: () => boolean,
  mark: (name: string) => void,
): Promise<boolean> {
  try {
    const entryLifecycle = getEntryLifecycle();
    assertRevealReady();
    await entryLifecycle.primeReveal();
    assertCurrent();
    entryLifecycle.coverRendering();
    mark('openingFrame');
    return true;
  } catch (error) {
    if (error === STALE_DEPLOYMENT || !isCurrent()) {
      throw new Error('Solo battle deployment was superseded');
    }
    // Preserve the loading owner's existing covered reveal retry.
    trace.error = String(error);
    return false;
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
      let groundCoverReady = false;
      let optionalWarmCompleted = false;
      const assertRevealReady = (): void => {
        if (!stillCurrent(generation)) throw new Error('Solo battle deployment was superseded');
        if (!groundCoverReady) throw new Error('Opening ground cover is not ready for reveal');
      };
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
        // A first night must attach its fixed light pool before any allied
        // shader submission. Their construction hook appends new emitters.
        await options.prepareNightLighting?.();
        requireCurrent(generation);
        mark('nightLighting');
        battleLoad.progress(0.91, 'Finishing camouflage');
        // Keep the loader responsive through consecutive private vehicle builds.
        // Task yields alone do not request animation callbacks: the former
        // 80 ms paint interval let several complete tanks share a visible gap.
        // Match foreground world preparation without changing the built roster.
        const coveredYield = createLoadingYielder(12, 32);
        const guardedCoveredYield: WorkYielder = async (force) => {
          requireCurrent(generation);
          await coveredYield(force);
          requireCurrent(generation);
        };
        const battleVisuals = getBattleVisuals();

        await battleVisuals.stream(
          (entity) => (entity as DeploymentEntity).team === 'player',
          guardedCoveredYield,
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
          yieldForBudget: guardedCoveredYield,
          primePresentation: false,
        });
        requireCurrent(generation);
        mark('terrainGrid');

        battleLoad.progress(0.968, 'Priming deployment view');
        prepareRevealCamera();
        mark('revealCamera');
        await battleWarm.primeOpeningTerrainPresentation({
          game, world: getWorld(), camera, yieldForBudget: guardedCoveredYield,
          assertCurrent: () => requireCurrent(generation),
        });
        requireCurrent(generation);
        groundCoverReady = true;
        mark('openingGroundCover');

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
          requireCurrent(generation);
          // The complete scene submission and its first FX bind previously
          // shared one >100 ms task. Use the existing exact-scene compiler's
          // bounded traversal; every checkpoint restores renderer state.
          const submissionTiming: ForwardProgramCompileTiming = {};
          trace.deploymentProgramSubmission = submissionTiming;
          for (const _ of forwardProgramWarm.compileSceneSteps({
            sliceMs: 8,
            timing: submissionTiming,
          })) {
            await guardedCoveredYield(true);
            requireCurrent(generation);
          }
          // Also separate the final compile batch from native uniform lookup
          // in the first bind. A completed short compile may yield no slices.
          await guardedCoveredYield(true);
          requireCurrent(generation);
          fx.group.visible = false;
          for (const batch of createIsolatedForwardWarmBatches({
            scene,
            root: fx.group,
            warmRender: getWarmRender(),
            cohortSize: 1,
            now,
          })) {
            fxForwardWarmBatches.push(batch);
            await guardedCoveredYield(true);
            requireCurrent(generation);
          }
        } catch {
          // The first covered production frame remains the compatibility path.
        } finally {
          combatFxSubmission.restore();
          restoreArmorWarmVisibility();
        }
        requireCurrent(generation);

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
        requireCurrent(generation);
        await yieldFrame();
        requireCurrent(generation);
        // Those newly submitted programs belong to hidden combat effects.
        // Reflecting every private ANGLE uniform table here can block for more
        // than a second even though none is rendered by the reveal frame.
        trace.deploymentUniformsDeferred = true;
        battleLoad.progress(0.969, 'Priming deployment shadows');
        trace.deploymentShadowWarm = await getDeploymentShadowWarm().prime(guardedCoveredYield);
        requireCurrent(generation);
        mark('shadowMaps');

        // Whole-scene submission does not reflect retained native programs.
        // Prepare the active terrain and vegetation source-pass materials;
        // hidden FX/LOD objects and inactive worlds must stay out of this job.
        await prepareWorldPrograms(options, trace, guardedCoveredYield,
          () => requireCurrent(generation), mark);
        requireCurrent(generation);

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
          await guardedCoveredYield(true);
          requireCurrent(generation);
        }
        const forwardBatchMs = forwardBatches.map((batch) => batch.ms);
        trace.deploymentForwardWarm = {
          batches: forwardBatches,
          maxMs: forwardBatchMs.length ? Math.max(...forwardBatchMs) : 0,
          totalMs: forwardBatchMs.reduce((sum, ms) => sum + ms, 0),
        };
        mark('forwardPrograms');

        trace.deploymentPostWarm = await post.warmFirstFrame(() => guardedCoveredYield(true));
        requireCurrent(generation);
        mark('postPasses');
        battleLoad.progress(0.97, 'Priming deployment view');
        optionalWarmCompleted = true;
      } catch (error) {
        if (error === STALE_DEPLOYMENT || !stillCurrent(generation)) {
          throw new Error('Solo battle deployment was superseded');
        }
        if (stillCurrent(generation)) {
          trace.done = true;
          trace.doneBeforeRollout = false;
          trace.error = String(error);
          host.__BATTLE_COUNTDOWN_WARM = trace;
        }
        // Optional shader warming may fall back to a real covered render.
        // Incomplete geometry cannot: loading must recover, not reveal a
        // different/empty carpet via its optional-warm compatibility path.
        if (!groundCoverReady) throw error;
      }
      // Health is required even after optional warming fails. It cannot share
      // that catch: a known-black/unrestorable result must retain the cover.
      await runRequiredSceneWatchdog(options, trace, assertRevealReady,
        () => requireCurrent(generation), () => stillCurrent(generation), mark);
      if (optionalWarmCompleted) {
        revealPrimed = await primeCoveredReveal(getEntryLifecycle, trace, assertRevealReady,
          () => requireCurrent(generation), () => stillCurrent(generation), mark);
        optionalWarmCompleted = revealPrimed;
      }
      assertRevealReady();
      battleLoad.progress(0.975, 'Combat effects ready');
      mark('combatTextures');
      trace.totalMs = Math.round(now() - startedAt);
      trace.preBattleRemainingS = Number.isFinite(game.preBattleS) ? game.preBattleS ?? null : null;
      trace.doneBeforeRollout = optionalWarmCompleted && game.phase === 'battle'
        && typeof game.preBattleS === 'number' && game.preBattleS > 0;
      trace.done = true;
      devTrace?.mark?.('battle:entry-warm-end', { totalMs: trace.totalMs });
      return { generation, revealPrimed, assertRevealReady };
    },
  };
}
