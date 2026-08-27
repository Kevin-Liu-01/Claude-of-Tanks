import {
  createFrameBudgetYielder,
  nextFrame,
  type WorkYielder,
} from '../engine/frameScheduler.ts';
import {
  snapshotRendererPrograms,
  warmNewRendererProgramUniforms,
  type RendererWithPrograms,
} from '../engine/programWarm.ts';

interface BattleEntity {
  team?: string;
}

interface BattleGame {
  phase?: string;
  preBattleS?: number;
}

interface BattleVisualStreamer {
  stream(
    predicate: (entity: BattleEntity) => boolean,
    yieldForBudget: WorkYielder,
    onProgress?: ((fraction: number) => void) | null,
    keepDetached?: boolean,
  ): Promise<unknown>;
}

interface CombatWarmCoordinator {
  cancelRare(): void;
  warmOpeningChunked(budgetMs: number, yielder: WorkYielder): Promise<void>;
  warmRareChunked(budgetMs: number, yielder: WorkYielder): Promise<void>;
}

interface BattleWarmRuntime {
  warmBattleTerrainTiles(options: {
    game: BattleGame;
    world: unknown;
    yieldForBudget: WorkYielder;
    primePresentation: boolean;
  }): Promise<unknown>;
}

interface WarmableWorld {
  warmTerrainLookahead?(cameraPosition: unknown, bandCount: number): number;
}

interface WarmTrace {
  done: boolean;
  generation: number;
  stages: Record<string, number>;
  enemyProgramUniformWarm?: unknown;
  navigationJobs?: number[];
  terrainLookaheadJobs?: number;
  totalMs?: number;
  finishedAtPreBattleS?: number | null;
  doneBeforeRollout?: boolean;
  error?: string;
  cancelled?: boolean;
}

interface TraceSink {
  mark?(event: string, payload: Record<string, unknown>): void;
}

type DeferredWarmHost = typeof globalThis & {
  __BATTLE_DEFERRED_WARM?: WarmTrace;
  __COMBAT_RARE_WARM?: { stages?: Record<string, number> };
};

export interface DeferredCombatWarmRuntimeOptions {
  game: BattleGame;
  renderer: RendererWithPrograms;
  camera: { position: unknown };
  getBattleVisuals(): BattleVisualStreamer;
  combatWarm: CombatWarmCoordinator;
  battleWarm: BattleWarmRuntime;
  getWorld(): WarmableWorld | null;
  getGeneration(): number;
  setPending(pending: boolean): void;
  prepareNextOpeningRoute(game: BattleGame): boolean;
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
export function createDeferredCombatWarmRuntime({
  game,
  renderer,
  camera,
  getBattleVisuals,
  combatWarm,
  battleWarm,
  getWorld,
  getGeneration,
  setPending,
  prepareNextOpeningRoute,
  devTrace = null,
  now = () => performance.now(),
  yieldFrame = nextFrame,
  createYielder = createFrameBudgetYielder,
}: DeferredCombatWarmRuntimeOptions): DeferredCombatWarmRuntime {
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
      // The first battlefield frame and countdown numeral must reach the
      // default framebuffer before any deferred atom starts.
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

      const enemyVisualsStartedAt = now();
      const enemyProgramBaseline = snapshotRendererPrograms(renderer);
      await getBattleVisuals().stream(
        (entity) => entity.team === 'enemy', guardedYield, null, true,
      );
      trace.enemyProgramUniformWarm = await warmNewRendererProgramUniforms(
        renderer, enemyProgramBaseline, guardedYield, now,
      );
      trace.stages.enemyVisuals = Math.round(now() - enemyVisualsStartedAt);

      const openingFxStartedAt = now();
      await combatWarm.warmOpeningChunked(6, guardedYield);
      trace.stages.combatOpeningWarm = Math.round(now() - openingFxStartedAt);

      const navigationStartedAt = now();
      trace.navigationJobs = [];
      for (;;) {
        const jobStartedAt = now();
        const consumed = prepareNextOpeningRoute(game);
        const jobMs = Math.round(now() - jobStartedAt);
        if (!consumed) break;
        trace.navigationJobs.push(jobMs);
        await guardedYield();
      }

      const world = getWorld();
      await battleWarm.warmBattleTerrainTiles({
        game,
        world,
        yieldForBudget: guardedYield,
        primePresentation: false,
      });
      trace.stages.navigation = Math.round(now() - navigationStartedAt);

      const terrainLookaheadStartedAt = now();
      let terrainLookaheadJobs = 0;
      while ((world?.warmTerrainLookahead?.(camera.position, 1) ?? 0) > 0) {
        terrainLookaheadJobs++;
        await guardedYield();
      }
      trace.stages.terrainLookahead = Math.round(now() - terrainLookaheadStartedAt);
      trace.terrainLookaheadJobs = terrainLookaheadJobs;

      await combatWarm.warmRareChunked(6, guardedYield);
      Object.assign(trace.stages, host.__COMBAT_RARE_WARM?.stages || {});
      trace.done = true;
      trace.totalMs = Math.round(now() - startedAt);
      trace.finishedAtPreBattleS = Number.isFinite(game.preBattleS)
        ? game.preBattleS ?? null : null;
      trace.doneBeforeRollout = game.phase === 'battle'
        && typeof game.preBattleS === 'number' && game.preBattleS > 0;
      devTrace?.mark?.('battle:deferred-warm-end', { totalMs: trace.totalMs });
    })().catch((error: unknown) => {
      const code = error && typeof error === 'object' && 'code' in error
        ? (error as { code?: unknown }).code : null;
      if (code !== 'combat_warm_cancelled') {
        trace.error = String(error);
        console.warn('[warm] deferred deployment warm failed (continuing):', error);
      } else {
        trace.cancelled = true;
      }
      trace.done = true;
      trace.doneBeforeRollout = false;
      if (generation !== getGeneration()) cancel();
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
