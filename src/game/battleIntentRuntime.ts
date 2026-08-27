type MaybePromise<T = unknown> = T | PromiseLike<T>;
type BudgetYield = (force?: boolean) => Promise<void> | undefined;

interface BattleIntentSpec {
  [key: string]: unknown;
}

interface BattleIntentFxRuntime {
  preloadTextures?(): MaybePromise;
}

export interface BattleIntentOptions {
  specId?: string | null;
  mapId?: string | null;
}

export interface BattleRosterPreparation {
  specId: string;
  mapId: string;
  rosterIds: readonly string[];
  autoCamoIds: readonly string[];
  yieldForBudget: BudgetYield;
}

interface BattleIntentRuntimeOptions {
  isBootComplete(): boolean;
  getPhase(): string;
  getPendingMapChoice(): string | null;
  getSelectedSpecId(): string;
  getBattleCount(): number;
  resolveMapId(mapId: string): string;
  loadWorldModule(): MaybePromise;
  prefetchWorld(mapId: string, options?: { intent?: boolean }): MaybePromise;
  ensureTankBuilder(specId: string): Promise<unknown>;
  ensureTankBuilders(specIds: readonly string[]): Promise<unknown>;
  planRoster(specId: string): readonly string[];
  getSpec(specId: string): BattleIntentSpec;
  prebakeSharedTextures(
    spec: BattleIntentSpec,
    anisotropy: number,
    quality: 'ai' | 'preview',
    yieldForBudget?: BudgetYield,
  ): Promise<unknown>;
  createBudgetYield(budgetMs: number): BudgetYield;
  anisotropy: number;
  setCamoBiome(mapId: string): void;
  clearCamoOverrides(): void;
  setCamoOverride(specId: string, patternId: 'auto'): void;
  applyCamoPatterns(options: {
    priorityIds: readonly string[];
    onlySpecIds: readonly string[];
  }): Promise<unknown>;
  preloadBattleVisuals(): MaybePromise;
  preloadAudio(): MaybePromise;
  preloadSettings(): MaybePromise;
  preloadArmorOverlay(): MaybePromise;
  preloadBattleHud(): MaybePromise;
  preloadTouchControls(): MaybePromise;
  preloadSoloBattle(): MaybePromise;
  preloadBattleClient(): MaybePromise;
  preloadKillcam(): MaybePromise;
  ensureFxRuntime(): Promise<BattleIntentFxRuntime>;
  preloadMinimap(mapId: string): MaybePromise;
  scheduleDelay(callback: () => void, delayMs: number): unknown;
  cancelDelay(handle: unknown): void;
  warn?(message: string, error: unknown): void;
}

export interface BattleIntentRuntime {
  scheduleIdleWorld(mapId: string | null, delayMs?: number): void;
  preload(options?: BattleIntentOptions): void;
  invalidateMapPlan(): void;
  consumeMap(specId: string, requestedMapId: string): string;
  prepareRoster(options: BattleRosterPreparation): Promise<void>;
  dispose(): void;
}

interface MapPlan {
  specId: string;
  battleCount: number;
  resolved: string;
}

/**
 * Own Battle intent from the first hover through the covered roster handoff.
 * The composition root supplies concrete loaders and presentation adapters;
 * this module owns ordering, coalescing, cancellation, and Random-map identity.
 */
export function createBattleIntentRuntime({
  isBootComplete,
  getPhase,
  getPendingMapChoice,
  getSelectedSpecId,
  getBattleCount,
  resolveMapId,
  loadWorldModule,
  prefetchWorld,
  ensureTankBuilder,
  ensureTankBuilders,
  planRoster,
  getSpec,
  prebakeSharedTextures,
  createBudgetYield,
  anisotropy,
  setCamoBiome,
  clearCamoOverrides,
  setCamoOverride,
  applyCamoPatterns,
  preloadBattleVisuals,
  preloadAudio,
  preloadSettings,
  preloadArmorOverlay,
  preloadBattleHud,
  preloadTouchControls,
  preloadSoloBattle,
  preloadBattleClient,
  preloadKillcam,
  ensureFxRuntime,
  preloadMinimap,
  scheduleDelay,
  cancelDelay,
  warn = (message, error) => console.warn(message, error),
}: BattleIntentRuntimeOptions): BattleIntentRuntime {
  const required = [isBootComplete, getPhase, getPendingMapChoice,
    getSelectedSpecId, getBattleCount, resolveMapId, loadWorldModule,
    prefetchWorld, ensureTankBuilder, ensureTankBuilders, planRoster, getSpec,
    prebakeSharedTextures, createBudgetYield, setCamoBiome,
    clearCamoOverrides, setCamoOverride, applyCamoPatterns,
    preloadBattleVisuals, preloadAudio, preloadSettings, preloadArmorOverlay,
    preloadBattleHud, preloadTouchControls, preloadSoloBattle,
    preloadBattleClient, preloadKillcam, ensureFxRuntime, preloadMinimap,
    scheduleDelay, cancelDelay, warn];
  if (required.some((entry) => typeof entry !== 'function')) {
    throw new TypeError('battle intent runtime requires every lifecycle port');
  }
  if (!(anisotropy > 0)) throw new TypeError('battle intent runtime requires anisotropy');

  let worldTimer: unknown = null;
  let textureKey = '';
  let textureGeneration = 0;
  let texturePromise: Promise<void> | null = null;
  let mapPlan: MapPlan | null = null;
  let disposed = false;

  const ignoreFailure = (task: () => MaybePromise) => {
    try {
      Promise.resolve(task()).catch(() => undefined);
    } catch (_) {
      // Intent is speculative. The covered entry path owns actionable errors.
    }
  };

  const invalidateMapPlan = () => { mapPlan = null; };

  const planMap = (specId: string, mapId: string) => {
    if (mapId !== 'random') {
      invalidateMapPlan();
      return mapId;
    }
    const battleCount = getBattleCount();
    if (mapPlan?.specId === specId && mapPlan.battleCount === battleCount) {
      return mapPlan.resolved;
    }
    const resolved = resolveMapId('random');
    mapPlan = { specId, battleCount, resolved };
    return resolved;
  };

  const cancelTextureWarm = () => {
    const pending = texturePromise;
    textureGeneration++;
    texturePromise = null;
    textureKey = '';
    return pending ?? Promise.resolve();
  };

  const warmRosterTextures = (
    specId: string,
    plannedIds: readonly string[],
    foregroundYield: BudgetYield | null = null,
  ) => {
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const id of plannedIds || []) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
    const key = `${getBattleCount()}:${specId}:${ids.join(',')}`;
    if (texturePromise && textureKey === key) return texturePromise;

    const generation = ++textureGeneration;
    textureKey = key;
    let pending: Promise<void>;
    pending = (async () => {
      await ensureTankBuilders(ids);
      for (const id of ids) {
        if (generation !== textureGeneration) return;
        const tick = foregroundYield ?? createBudgetYield(3);
        await prebakeSharedTextures(
          getSpec(id), anisotropy, id === specId ? 'preview' : 'ai', tick,
        );
      }
    })().catch((error) => {
      warn('[loading] Battle-intent texture warm failed:', error);
    }).finally(() => {
      if (texturePromise === pending) texturePromise = null;
    });
    texturePromise = pending;
    return pending;
  };

  const scheduleIdleWorld = (mapId: string | null, delayMs = 2500) => {
    if (worldTimer !== null) cancelDelay(worldTimer);
    worldTimer = null;
    if (disposed || !isBootComplete() || !mapId) return;
    worldTimer = scheduleDelay(() => {
      worldTimer = null;
      if (disposed || getPhase() !== 'garage' || getPendingMapChoice() !== mapId) return;
      const selectedSpecId = getSelectedSpecId();
      const resolvedMapId = mapId === 'random' ? planMap(selectedSpecId, mapId) : mapId;
      ignoreFailure(async () => {
        await loadWorldModule();
        await prefetchWorld(resolvedMapId);
      });
      ignoreFailure(() => ensureTankBuilder(selectedSpecId));
    }, delayMs);
  };

  const preload = ({ specId, mapId }: BattleIntentOptions = {}) => {
    if (disposed) return;
    ignoreFailure(preloadBattleVisuals);
    ignoreFailure(preloadAudio);
    ignoreFailure(preloadSettings);
    ignoreFailure(preloadArmorOverlay);
    ignoreFailure(preloadBattleHud);
    ignoreFailure(preloadTouchControls);
    ignoreFailure(loadWorldModule);
    ignoreFailure(preloadSoloBattle);
    ignoreFailure(preloadBattleClient);
    ignoreFailure(preloadKillcam);

    if (specId) {
      const planned = planRoster(specId);
      ignoreFailure(() => ensureTankBuilders(planned));
      void warmRosterTextures(specId, planned);
    }

    ignoreFailure(async () => {
      const live = await ensureFxRuntime();
      await live.preloadTextures?.();
    });

    const plannedMapId = specId && mapId ? planMap(specId, mapId) : mapId;
    if (!plannedMapId) return;
    ignoreFailure(() => prefetchWorld(plannedMapId, { intent: true }));
    ignoreFailure(() => preloadMinimap(plannedMapId));
  };

  const consumeMap = (specId: string, requestedMapId: string) => {
    const planned = requestedMapId === 'random'
      && mapPlan?.specId === specId
      && mapPlan.battleCount === getBattleCount()
      ? mapPlan.resolved
      : null;
    invalidateMapPlan();
    return planned ?? resolveMapId(requestedMapId);
  };

  const prepareRoster = async ({
    specId,
    mapId,
    rosterIds,
    autoCamoIds,
    yieldForBudget,
  }: BattleRosterPreparation) => {
    if (!specId || !mapId || !Array.isArray(rosterIds)
      || !Array.isArray(autoCamoIds) || typeof yieldForBudget !== 'function') {
      throw new TypeError('battle roster preparation requires map, roster, camouflage, and yielder');
    }
    await cancelTextureWarm();
    setCamoBiome(mapId);
    clearCamoOverrides();
    for (const id of autoCamoIds) setCamoOverride(id, 'auto');
    await applyCamoPatterns({ priorityIds: [specId], onlySpecIds: rosterIds });
    await warmRosterTextures(specId, rosterIds, yieldForBudget);
  };

  const dispose = () => {
    disposed = true;
    if (worldTimer !== null) cancelDelay(worldTimer);
    worldTimer = null;
    invalidateMapPlan();
    void cancelTextureWarm();
  };

  return {
    scheduleIdleWorld,
    preload,
    invalidateMapPlan,
    consumeMap,
    prepareRoster,
    dispose,
  };
}
