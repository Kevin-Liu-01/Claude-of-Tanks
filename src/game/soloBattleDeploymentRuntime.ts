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
import type { OffscreenSceneWarmer } from '../engine/offscreenWarm.ts';
import type { ContextProgramRenderer, ForwardProgramWarmOwner, ForwardProgramCompileTiming, ProgramPreparationResult } from '../engine/programWarm.ts';
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
import { prepareDeploymentFxPrograms, type DeploymentFxProgramReceipt } from './deploymentFxPrograms.ts';

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
  deploymentFxPrograms?: DeploymentFxProgramReceipt;
  deploymentFxForwardWarm?: {
    batches: number;
    maxMs: number;
    totalMs: number;
    /** Preparation plus isolated draws; elapsed includes waits, sync excludes them. */
    programAndDrawTotalMs?: number;
    programAndDrawSyncMs?: number;
    programAndDrawMaxMs?: number;
    completed: boolean;
    error?: string;
    cleanupError?: string;
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
  renderer: ContextProgramRenderer;
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
  getWarmRender(): OffscreenSceneWarmer;
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
    checkedIntegrationPort(options.renderer ?? {}, 'solo deployment renderer', ['getContext']);
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

function restoreDeploymentWarmState(
  submission: CombatFxSubmission | null,
  restoreArmor: (() => void) | undefined,
  receipt: NonNullable<DeploymentWarmTrace['deploymentFxForwardWarm']>,
): void {
  try {
    try { submission?.restore(); }
    finally { restoreArmor?.(); }
  } catch (error) {
    receipt.cleanupError = String(error).slice(0, 320);
    throw error;
  }
}

function createDeploymentFxLease(
  options: SoloBattleDeploymentRuntimeOptions,
  fx: CombatFxSubmissionOptions['fx'],
  warmRender: OffscreenSceneWarmer,
  assertCurrent: () => void,
): () => void {
  const root = fx.group, parent = root.parent;
  const phase = options.game.phase;
  const info = options.renderer.info, context = options.renderer.getContext();
  return (): void => {
    assertCurrent();
    if (options.game.phase !== phase || options.getFx() !== fx || fx.group !== root || root.parent !== parent
      || options.getWarmRender() !== warmRender || options.renderer.info !== info
      || options.renderer.getContext() !== context || !info || context.isContextLost()) throw STALE_DEPLOYMENT;
    let ancestor: Object3D | null = root;
    while (ancestor && ancestor !== options.scene) ancestor = ancestor.parent;
    if (!ancestor) throw STALE_DEPLOYMENT;
  };
}

/** The staged FX lease spans preparation and actual draws; native render state
 * belongs only to synchronous engine checkpoints, never to an awaited slice.
 */
async function warmDeploymentFx(
  options: SoloBattleDeploymentRuntimeOptions,
  trace: DeploymentWarmTrace,
  yieldCovered: WorkYielder,
  assertCurrent: () => void,
  now: () => number,
): Promise<{
  receipt: NonNullable<DeploymentWarmTrace['deploymentFxForwardWarm']>;
  completed: boolean;
  assertCurrent(): void;
}> {
  const startedAt = now();
  const receipt: NonNullable<DeploymentWarmTrace['deploymentFxForwardWarm']> = {
    batches: 0, maxMs: 0, totalMs: 0, completed: false,
  };
  trace.deploymentFxForwardWarm = receipt;
  const fx = options.getFx(), root = fx.group, warmRender = options.getWarmRender();
  const assertFxCurrent = createDeploymentFxLease(options, fx, warmRender, assertCurrent);
  let restoreArmor: (() => void) | undefined;
  let submission: CombatFxSubmission | null = null;
  let cohortsCompleted = false;
  let programAndDrawStartedAt: number | undefined;
  let drawSyncMs = 0, maxDrawStepMs = 0;
  try {
    assertFxCurrent();
    restoreArmor = options.armorAimOverlay.warm();
    submission = await options.battleWarm.stageCombatFxProgramSubmission({
      game: options.game, fx, post: options.post, camera: options.camera, createShell: options.createShell,
    });
    assertFxCurrent();
    const timing: ForwardProgramCompileTiming = {};
    trace.deploymentProgramSubmission = timing;
    for (const _ of options.forwardProgramWarm.compileSceneSteps({ sliceMs: 8, timing })) {
      await yieldCovered(true);
      assertFxCurrent();
    }
    await yieldCovered(true);
    assertFxCurrent();
    programAndDrawStartedAt = now();
    // Selection must precede hiding the staged root. Both this preparation and
    // the draws consume the same retained warmer and exact private HDR target.
    trace.deploymentFxPrograms = await prepareDeploymentFxPrograms({
      root, camera: options.camera, warmRender, assertCurrent: assertFxCurrent,
      yieldProgramFrame: options.yieldProgramFrame, now,
      onReceipt: value => { trace.deploymentFxPrograms = value; },
    });
    assertFxCurrent();
    root.visible = false;
    const batches = createIsolatedForwardWarmBatches({
      scene: options.scene, root, warmRender, cohortSize: 1, now,
    });
    try {
      for (;;) {
        const stepAt = now();
        let step: ReturnType<typeof batches.next>;
        try { step = batches.next(); }
        finally {
          const elapsed = Math.max(0, now() - stepAt);
          drawSyncMs += elapsed;
          maxDrawStepMs = Math.max(maxDrawStepMs, elapsed);
        }
        if (step.done) break;
        receipt.batches++;
        receipt.maxMs = Math.max(receipt.maxMs, step.value.ms);
        receipt.totalMs += step.value.ms;
        await yieldCovered(true);
        assertFxCurrent();
      }
    } finally {
      batches.return(undefined);
    }
    cohortsCompleted = true;
  } catch (error) {
    receipt.error = String(error).slice(0, 320);
    if (!submission) throw error;
  } finally {
    try {
      restoreDeploymentWarmState(submission, restoreArmor, receipt);
    } finally {
      trace.deploymentCompileMs = Math.round(now() - startedAt);
      if (programAndDrawStartedAt !== undefined) {
        receipt.programAndDrawTotalMs = Math.max(0, now() - programAndDrawStartedAt);
        receipt.programAndDrawSyncMs = (trace.deploymentFxPrograms?.syncMs ?? 0) + drawSyncMs;
        receipt.programAndDrawMaxMs = Math.max(trace.deploymentFxPrograms?.maxStepMs ?? 0, maxDrawStepMs);
      }
    }
  }
  assertFxCurrent();
  return { receipt, completed: cohortsCompleted && submission?.staged === true,
    assertCurrent: assertFxCurrent };
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
  combatWarm,
  post,
  lighting,
  getWorld,
  getBattleVisuals,
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
      delete host.__COMBAT_OPENING_WARM;
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

        const fxWarm = await warmDeploymentFx(options, trace, guardedCoveredYield,
          () => requireCurrent(generation), now);
        // The helper's returned Promise is another handoff: cleanup can queue
        // an owner change before this continuation is allowed to publish ready.
        fxWarm.assertCurrent();
        const fxReceipt = fxWarm.receipt;
        fxReceipt.completed = fxWarm.completed;

        if (fxReceipt.completed) {
          combatWarm.markOpeningReady();
          setDestructionWarmed(true);
          host.__COMBAT_OPENING_WARM = {
            covered: true,
            batches: fxReceipt.batches,
            totalMs: trace.deploymentCompileMs ?? 0,
          };
        }

        await yieldFrame();
        requireCurrent(generation);
        await yieldFrame();
        requireCurrent(generation);
        // The selected FX private-target cache was prepared above. A separate
        // renderer-wide reflection sweep remains deferred: unrelated retained
        // programs do not belong to this covered first-frame preparation.
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
        // The stale-owner branch above exits synchronously; this receipt
        // still belongs to the active deployment until the next await.
        trace.done = true;
        trace.doneBeforeRollout = false;
        trace.error = String(error);
        host.__BATTLE_COUNTDOWN_WARM = trace;
        // Optional shader warming may fall back to a real covered render.
        // Incomplete geometry cannot: loading must recover, not reveal a
        // different/empty carpet via its optional-warm compatibility path.
        // Failed restoration can leave staged effects alive. A healthy frame
        // cannot certify their cleanup; use the covered entry recovery owner.
        if (!groundCoverReady || trace.deploymentFxForwardWarm?.cleanupError !== undefined) throw error;
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
