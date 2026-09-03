import type { RuntimeValue } from '../runtimeTypes.ts';
type BudgetYield = () => Promise<void> | undefined;

interface GaragePedestalPreloaderOptions {
  getPhase(): string;
  isBootComplete(): boolean;
  getSelectedId(): string;
  getNeighborIds(): readonly string[];
  hasCachedVisual(specId: string): boolean;
  ensureTankBuilder(specId: string): Promise<RuntimeValue>;
  ensureTankBuilders(specIds: readonly string[]): Promise<RuntimeValue>;
  getSpec(specId: string): RuntimeValue;
  prebakeSharedTextures(
    spec: RuntimeValue,
    anisotropy: number,
    quality: string,
    yieldForBudget?: BudgetYield,
  ): Promise<RuntimeValue>;
  discardSharedTextures(specId: string): void;
  createBudgetYield(budgetMs: number): BudgetYield;
  nextFrame(): Promise<RuntimeValue>;
  scheduleDelay(callback: () => void, delayMs: number): RuntimeValue;
  acquireBackgroundWork?: (
    kind: 'pedestal-neighbors',
    stillValid: () => boolean,
  ) => Promise<{ release(): void } | null>;
  anisotropy: number;
  warn?: (message: string, error: RuntimeValue) => void;
  retainedIntentLimit?: number;
  neighborDelayMs?: number;
}

export interface GaragePedestalPreloader {
  invalidate(): void;
  queueNeighbors(): void;
  preloadIntent(specId: string): Promise<RuntimeValue>;
  readonly retainedIds: readonly string[];
  readonly pendingIntents: number;
}

const CANCELLED = Symbol('garage-pedestal-preload-cancelled');

/** Own cancellable neighbor and pointer-intent warming for garage heroes. */
export function createGaragePedestalPreloader({
  getPhase,
  isBootComplete,
  getSelectedId,
  getNeighborIds,
  hasCachedVisual,
  ensureTankBuilder,
  ensureTankBuilders,
  getSpec,
  prebakeSharedTextures,
  discardSharedTextures,
  createBudgetYield,
  nextFrame,
  scheduleDelay,
  acquireBackgroundWork = async () => ({ release() {} }),
  anisotropy,
  warn = (message, error) => console.warn(message, error),
  retainedIntentLimit = 4,
  neighborDelayMs = 1800,
}: GaragePedestalPreloaderOptions): GaragePedestalPreloader {
  const required = [getPhase, isBootComplete, getSelectedId, getNeighborIds,
    hasCachedVisual, ensureTankBuilder, ensureTankBuilders, getSpec,
    prebakeSharedTextures, discardSharedTextures, createBudgetYield, nextFrame,
    scheduleDelay, acquireBackgroundWork, warn];
  if (required.some((entry) => typeof entry !== 'function')) {
    throw new TypeError('garage pedestal preloader requires every runtime port');
  }

  let generation = 0;
  const retainedIds = new Set<string>();
  const intentPromises = new Map<string, Promise<RuntimeValue>>();
  const active = (token: number) => token === generation && getPhase() === 'garage';
  const invalidate = () => { generation += 1; };

  const queueNeighbors = () => {
    if (!isBootComplete() || getPhase() !== 'garage') return;
    const selectedId = getSelectedId();
    const ids = [...getNeighborIds()]
      .filter((id) => id !== selectedId && !hasCachedVisual(id));
    const token = ++generation;

    // Pointer/focus intent already warms the exact card. Speculative neighbors
    // wait for a genuine quiet window so family evaluation and canvas paint
    // cannot land immediately after a cold hero reveal.
    scheduleDelay(() => {
      void (async () => {
        if (!active(token)) return;
        const lease = await acquireBackgroundWork(
          'pedestal-neighbors', () => active(token),
        );
        if (!lease) return;
        const keep = new Set(ids);
        try {
          for (const id of [...retainedIds]) {
            if (keep.has(id)) continue;
            discardSharedTextures(id);
            retainedIds.delete(id);
          }
          // Transfer exact profile families before paying for paint work. This
          // prevents a country boundary from discovering a large builder chunk
          // only after the card click.
          await ensureTankBuilders(ids);
          if (!active(token)) throw CANCELLED;
          for (const id of ids) {
            if (!active(token)) throw CANCELLED;
            const budgetYield = createBudgetYield(3);
            await prebakeSharedTextures(getSpec(id), anisotropy, 'ai', async () => {
              if (!active(token)) throw CANCELLED;
              await budgetYield();
            });
            if (!active(token)) {
              discardSharedTextures(id);
              throw CANCELLED;
            }
            retainedIds.add(id);
            await nextFrame();
          }
        } catch (error) {
          if (error !== CANCELLED) warn('[garage] neighbor texture prefetch failed:', error);
        } finally {
          lease.release();
        }
      })();
    }, neighborDelayMs);
  };

  const preloadIntent = (specId: string): Promise<RuntimeValue> => {
    if (!specId || specId === getSelectedId() || hasCachedVisual(specId)) {
      return Promise.resolve();
    }
    const activeIntent = intentPromises.get(specId);
    if (activeIntent) return activeIntent;
    const pending = Promise.all([
      ensureTankBuilder(specId),
      prebakeSharedTextures(
        getSpec(specId), anisotropy, 'ai', createBudgetYield(3),
      ),
    ]).then(() => {
      if (specId === getSelectedId() || hasCachedVisual(specId)) return;
      retainedIds.delete(specId);
      retainedIds.add(specId);
      while (retainedIds.size > retainedIntentLimit) {
        const oldest = retainedIds.values().next().value;
        if (oldest === undefined) break;
        retainedIds.delete(oldest);
        if (oldest !== getSelectedId() && !hasCachedVisual(oldest)) {
          discardSharedTextures(oldest);
        }
      }
    }).catch(() => null).finally(() => {
      if (intentPromises.get(specId) === pending) intentPromises.delete(specId);
    });
    intentPromises.set(specId, pending);
    return pending;
  };

  return {
    invalidate,
    queueNeighbors,
    preloadIntent,
    get retainedIds() { return [...retainedIds]; },
    get pendingIntents() { return intentPromises.size; },
  };
}
