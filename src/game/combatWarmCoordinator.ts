import {
  createFrameBudgetYielder,
  type WorkYielder,
} from '../engine/frameScheduler.ts';

type WarmGenerator = Generator<unknown, unknown, unknown>;
type WarmFactory = () => WarmGenerator;
type WarmKind = 'opening' | 'rare';

export interface CombatWarmCoordinatorOptions {
  createOpening(): WarmGenerator;
  createRare(): WarmGenerator;
  createYielder?: (budgetMs: number) => WorkYielder;
}

export interface CombatWarmCoordinator {
  isOpeningReady(): boolean;
  isRareReady(): boolean;
  markOpeningReady(): void;
  markRareReady(): void;
  reset(): void;
  cancelRare(): void;
  drain(): void;
  warmOpeningChunked(budgetMs?: number, yielder?: WorkYielder | null): Promise<void>;
  warmRareChunked(budgetMs?: number, yielder?: WorkYielder | null): Promise<void>;
}

/** Own resumable opening/rare warm generators across covered battle transitions. */
export function createCombatWarmCoordinator({
  createOpening,
  createRare,
  createYielder = createFrameBudgetYielder,
}: CombatWarmCoordinatorOptions): CombatWarmCoordinator {
  let openingReady = false;
  let rareReady = false;
  let openingGenerator: WarmGenerator | null = null;
  let rareGenerator: WarmGenerator | null = null;

  const close = (generator: WarmGenerator | null): void => {
    if (!generator) return;
    try { generator.return(undefined); } catch { /* stale transition cleanup */ }
  };

  const reset = (): void => {
    close(openingGenerator);
    close(rareGenerator);
    openingGenerator = null;
    rareGenerator = null;
    openingReady = false;
    rareReady = false;
  };

  const drainGenerator = (generator: WarmGenerator): void => {
    let result = generator.next();
    while (!result.done) result = generator.next();
  };

  const drain = (): void => {
    if (!openingReady) {
      const generator = openingGenerator ?? createOpening();
      openingGenerator = null;
      drainGenerator(generator);
    }
    if (!rareReady) {
      const generator = rareGenerator ?? createRare();
      rareGenerator = null;
      drainGenerator(generator);
    }
  };

  const warmChunked = async (
    kind: WarmKind,
    factory: WarmFactory,
    budgetMs: number,
    providedYielder: WorkYielder | null,
  ): Promise<void> => {
    const isOpening = kind === 'opening';
    let generator = isOpening ? openingGenerator : rareGenerator;
    if ((isOpening ? openingReady : rareReady) && !generator) return;
    if (!generator) {
      generator = factory();
      if (isOpening) openingGenerator = generator;
      else rareGenerator = generator;
    }
    const yieldForBudget = providedYielder ?? createYielder(budgetMs);
    for (;;) {
      const liveGenerator = isOpening ? openingGenerator : rareGenerator;
      if (liveGenerator !== generator) return;
      const result = generator.next();
      if (result.done) {
        if (isOpening && openingGenerator === generator) openingGenerator = null;
        if (!isOpening && rareGenerator === generator) rareGenerator = null;
        return;
      }
      await yieldForBudget();
    }
  };

  return {
    isOpeningReady: () => openingReady,
    isRareReady: () => rareReady,
    markOpeningReady() { openingReady = true; },
    markRareReady() { rareReady = true; },
    reset,
    cancelRare() {
      close(rareGenerator);
      rareGenerator = null;
    },
    drain,
    warmOpeningChunked: (budgetMs = 8, yielder = null) =>
      warmChunked('opening', createOpening, budgetMs, yielder),
    warmRareChunked: (budgetMs = 6, yielder = null) =>
      warmChunked('rare', createRare, budgetMs, yielder),
  };
}
