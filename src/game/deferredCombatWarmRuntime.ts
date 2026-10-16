import type { RuntimeValue } from '../runtimeTypes.ts';
import {
  createFrameBudgetYielder,
  nextPaintFrame,
  type WorkYielder,
} from '../engine/frameScheduler.ts';
import {
  ProgramUniformPreparationError,
  snapshotRendererPrograms,
  warmNewRendererProgramUniforms,
  type ContextProgramRenderer,
} from '../engine/programWarm.ts';
import type {
  BattleVisualEntity,
  BattleVisualStreamer,
} from './battleVisualStreamer.ts';

interface BattleEntity {
  team?: string;
}

interface BattleGame {
  phase?: string;
  preBattleS?: number;
}

interface CombatWarmCoordinator {
  cancelRare(): void;
  warmOpeningChunked(budgetMs: number, yielder: WorkYielder): Promise<void>;
  warmRareChunked(budgetMs: number, yielder: WorkYielder): Promise<void>;
}

interface WarmableWorld {
  warmTerrainLookahead?(cameraPosition: RuntimeValue, bandCount: number): number;
}

interface WarmTrace {
  done: boolean;
  generation: number;
  stages: Record<string, number>;
  enemyProgramUniformWarm?: RuntimeValue;
  /** The stages whose programs were still linking when their window closed (the warm went on past them). */
  unfinishedLinks?: Record<string, RuntimeValue>;
  navigationJobs?: number[];
  terrainLookaheadJobs?: number;
  totalMs?: number;
  finishedAtPreBattleS?: number | null;
  doneBeforeRollout?: boolean;
  error?: string;
  cancelled?: boolean;
}

interface TraceSink {
  mark?(event: string, payload: Record<string, RuntimeValue>): void;
}

type DeferredWarmHost = typeof globalThis & {
  __BATTLE_DEFERRED_WARM?: WarmTrace;
  __COMBAT_RARE_WARM?: { stages?: Record<string, number> };
};

interface DeferredCombatWarmRuntimeOptions<
  Game extends BattleGame,
  Entity extends BattleVisualEntity & BattleEntity,
  World extends WarmableWorld,
> {
  game: Game;
  renderer: ContextProgramRenderer;
  camera: { position: RuntimeValue };
  getBattleVisuals(): BattleVisualStreamer<Entity>;
  warmVisionSteps?(): Generator<void>;
  combatWarm: CombatWarmCoordinator;
  warmBattleTerrainTiles(yieldForBudget: WorkYielder): Promise<RuntimeValue>;
  getWorld(): World | null;
  getGeneration(): number;
  setPending(pending: boolean): void;
  prepareNextOpeningRoute(): boolean;
  devTrace?: TraceSink | null;
  now?: () => number;
  yieldFrame?: () => Promise<void>;
  createYielder?: (budgetMs: number) => WorkYielder;
}

export interface DeferredCombatWarmRuntime {
  schedule(generation: number): Promise<void>;
  cancel(): void;
  isActive(): boolean;
}

/**
 * Own the cancellable, revision-bound warm queue that runs during deployment.
 *
 * This queue deliberately lives outside the render loop: it may populate
 * hidden enemy visuals and exact effect/terrain caches, but it never advances
 * simulation or changes a visible pose. A newer battle generation owns the
 * slot immediately, so a stale rematch cannot clear or publish its successor.
 */
export function createDeferredCombatWarmRuntime<
  Game extends BattleGame,
  Entity extends BattleVisualEntity & BattleEntity,
  World extends WarmableWorld,
>({
  game,
  renderer,
  camera,
  getBattleVisuals,
  combatWarm,
  warmVisionSteps,
  warmBattleTerrainTiles,
  getWorld,
  getGeneration,
  setPending,
  prepareNextOpeningRoute,
  devTrace = null,
  now = () => performance.now(),
  yieldFrame = nextPaintFrame,
  createYielder = (budgetMs) => createFrameBudgetYielder(budgetMs, {
    yieldFrame: nextPaintFrame,
  }),
}: DeferredCombatWarmRuntimeOptions<Game, Entity, World>): DeferredCombatWarmRuntime {
  const host = globalThis as DeferredWarmHost;
  let pendingPromise: Promise<void> | null = null;

  const cancel = (): void => {
    combatWarm.cancelRare();
    pendingPromise = null;
  };

  const schedule = (generation: number): Promise<void> => {
    if (!Number.isFinite(generation) || generation !== getGeneration()) {
      setPending(false);
      return Promise.resolve();
    }
    if (pendingPromise) return pendingPromise;

    const trace: WarmTrace = { done: false, generation, stages: {} };
    host.__BATTLE_DEFERRED_WARM = trace;
    const startedAt = now();
    let pending!: Promise<void>;
    pending = (async () => {
      // Leave the first battlefield frame's pre-paint microtask checkpoint
      // before constructing hidden actors. Later batches use the same
      // post-frame task boundary; an rAF alone would append their work to
      // the visible render and hold up the countdown's paint.
      await yieldFrame();
      if (generation !== getGeneration() || game.phase !== 'battle') return;

      const visibleYield = createYielder(6);
      const guardedYield: WorkYielder = async (force = false) => {
        await visibleYield(force);
        if (generation !== getGeneration() || game.phase !== 'battle') {
          throw Object.assign(new Error('deferred combat warm cancelled'), {
            code: 'combat_warm_cancelled',
          });
        }
      };

      // (2026-10-16, the perf lane) a stage whose programs are still linking when its strict window closes (five seconds
      // of live battle, frame-paced: the driver drains every queued link first, and at load the battle's own frames are
      // slow) has not failed the warm. Its links go on as submitted and an unfinished one waits at its first draw, as it
      // would have anyway; the other stages do not wait on it. Every probed integ/226 entry (load 100-220) lost every
      // stage after the first unfinished one to "incomplete: budget" — the vision programs, the opening and rare effects,
      // the routes and the terrain tiles left to their first use in battle. The trace names the stage (unfinishedLinks);
      // a stale battle (invalidated) still stops the warm.
      const unlessLinksUnfinished = async (stage: string, run: () => Promise<void>): Promise<void> => {
        try { await run(); } catch (error) {
          if (!(error instanceof ProgramUniformPreparationError) || error.preparation.reason === 'invalidated') throw error;
          (trace.unfinishedLinks ??= {})[stage] = {
            ...(error.receipt ?? {}), reason: error.preparation.reason, pending: error.preparation.pending,
          };
          devTrace?.mark?.('battle:deferred-warm-links-unfinished', {
            stage, reason: error.preparation.reason, pending: error.preparation.pending ?? -1 });
        }
      };

      const enemyVisualsStartedAt = now();
      const enemyProgramBaseline = snapshotRendererPrograms(renderer);
      await getBattleVisuals().stream(
        (entity) => entity.team === 'enemy', guardedYield, null, true,
      );
      await unlessLinksUnfinished('enemyVisuals', async () => {
        trace.enemyProgramUniformWarm = await warmNewRendererProgramUniforms(
          renderer, enemyProgramBaseline, guardedYield, now,
          { isCurrent: () => generation === getGeneration() && game.phase === 'battle' },
        );
      });
      trace.stages.enemyVisuals = Math.round(now() - enemyVisualsStartedAt);

      const visionStartedAt = now();
      await unlessLinksUnfinished('visionPrograms', async () => {
        // (2026-10-16, the perf lane) every step a real frame: the vision programs' strict preparation polls their links
        // once a step and spends one of its finite rounds each time, so an unforced yield (a no-op until the 6 ms slice is
        // used) burned its 1024 rounds in ~80 ms with the thermal links still in the driver's queue — 'budget', and the
        // sights left to link at their first use. A forced yield gives the links real time (as the enemies' uniform
        // warm does: warmNewRendererProgramUniforms forces its checkpoints).
        if (warmVisionSteps) for (const _ of warmVisionSteps()) await guardedYield(true);
      });
      trace.stages.visionPrograms = Math.round(now() - visionStartedAt);

      const openingFxStartedAt = now();
      await unlessLinksUnfinished('combatOpeningWarm', () => combatWarm.warmOpeningChunked(6, guardedYield));
      trace.stages.combatOpeningWarm = Math.round(now() - openingFxStartedAt);

      const navigationStartedAt = now();
      trace.navigationJobs = [];
      for (;;) {
        const jobStartedAt = now();
        const consumed = prepareNextOpeningRoute();
        const jobMs = Math.round(now() - jobStartedAt);
        if (!consumed) break;
        trace.navigationJobs.push(jobMs);
        await guardedYield();
      }

      const world = getWorld();
      await warmBattleTerrainTiles(guardedYield);
      trace.stages.navigation = Math.round(now() - navigationStartedAt);

      const terrainLookaheadStartedAt = now();
      let terrainLookaheadJobs = 0;
      while ((world?.warmTerrainLookahead?.(camera.position, 1) ?? 0) > 0) {
        terrainLookaheadJobs++;
        await guardedYield();
      }
      trace.stages.terrainLookahead = Math.round(now() - terrainLookaheadStartedAt);
      trace.terrainLookaheadJobs = terrainLookaheadJobs;

      await unlessLinksUnfinished('rarePrograms', () => combatWarm.warmRareChunked(6, guardedYield));
      Object.assign(trace.stages, host.__COMBAT_RARE_WARM?.stages || {});
      trace.done = true;
      trace.totalMs = Math.round(now() - startedAt);
      trace.finishedAtPreBattleS = Number.isFinite(game.preBattleS)
        ? game.preBattleS ?? null : null;
      trace.doneBeforeRollout = game.phase === 'battle'
        && typeof game.preBattleS === 'number' && game.preBattleS > 0;
      devTrace?.mark?.('battle:deferred-warm-end', { totalMs: trace.totalMs });
    })().catch((error: RuntimeValue) => {
      const code = error && typeof error === 'object' && 'code' in error
        ? (error as { code?: RuntimeValue }).code : null;
      if (code !== 'combat_warm_cancelled') {
        trace.error = String(error);
        console.warn('[warm] deferred deployment warm failed (continuing):', error);
      } else {
        trace.cancelled = true;
      }
      trace.done = true;
      trace.doneBeforeRollout = false;
      if (generation !== getGeneration() && pendingPromise === pending) cancel();
    }).finally(() => {
      if (generation === getGeneration()) setPending(false);
      const ownsSlot = pendingPromise === pending;
      if (ownsSlot) pendingPromise = null;
      if (generation === getGeneration()
          && (ownsSlot || host.__BATTLE_DEFERRED_WARM === trace)) {
        host.__BATTLE_DEFERRED_WARM = trace;
      }
    });
    pendingPromise = pending;
    return pending;
  };

  return {
    schedule,
    cancel,
    isActive: () => pendingPromise !== null,
  };
}
