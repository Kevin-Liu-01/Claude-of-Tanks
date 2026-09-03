import {
  createFrameBudgetYielder,
  type WorkYielder,
} from '../engine/frameScheduler.ts';

type WarmGenerator = Generator<object | void, object | void, void>;
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

  const generatorFor = (kind: WarmKind): WarmGenerator | null =>
    kind === 'opening' ? openingGenerator : rareGenerator;

  const isReady = (kind: WarmKind): boolean =>
    kind === 'opening' ? openingReady : rareReady;

  const storeGenerator = (kind: WarmKind, generator: WarmGenerator): void => {
    if (kind === 'opening') openingGenerator = generator;
    else rareGenerator = generator;
  };

  const clearGeneratorIfCurrent = (kind: WarmKind, generator: WarmGenerator): void => {
    if (generatorFor(kind) !== generator) return;
    if (kind === 'opening') openingGenerator = null;
    else rareGenerator = null;
  };

  const warmChunked = async (
    kind: WarmKind,
    factory: WarmFactory,
    budgetMs: number,
    providedYielder: WorkYielder | null,
  ): Promise<void> => {
    let generator = generatorFor(kind);
    if (isReady(kind) && !generator) return;
    if (!generator) {
      generator = factory();
      storeGenerator(kind, generator);
    }
    const yieldForBudget = providedYielder ?? createYielder(budgetMs);
    for (;;) {
      if (generatorFor(kind) !== generator) return;
      const result = generator.next();
      if (result.done) {
        clearGeneratorIfCurrent(kind, generator);
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
