type RuntimeModule = typeof import('./battleWarmRuntime.ts');
type RuntimeLoader = () => Promise<RuntimeModule>;

export interface BattleWarmAccess {
  preload(): Promise<RuntimeModule>;
  isReady(): boolean;
  warmBattleTerrainTiles(
    options: Parameters<RuntimeModule['warmBattleTerrainTiles']>[0],
  ): ReturnType<RuntimeModule['warmBattleTerrainTiles']>;
  warmNetworkWrecks(
    options: Parameters<RuntimeModule['warmNetworkWrecks']>[0],
  ): ReturnType<RuntimeModule['warmNetworkWrecks']>;
  warmNetworkOpeningEffects(
    options: Parameters<RuntimeModule['warmNetworkOpeningEffects']>[0],
  ): ReturnType<RuntimeModule['warmNetworkOpeningEffects']>;
  warmStudioEffects(
    options: Parameters<RuntimeModule['warmStudioEffects']>[0],
  ): ReturnType<RuntimeModule['warmStudioEffects']>;
  stageCombatFxProgramSubmission(
    options: Parameters<RuntimeModule['stageCombatFxProgramSubmission']>[0],
  ): Promise<ReturnType<RuntimeModule['stageCombatFxProgramSubmission']>>;
  invalidate(): void;
}

/** Retryable battle-only owner for terrain, wreck and common-FX warming. */
export function createBattleWarmAccess(
  load: RuntimeLoader = () => import('./battleWarmRuntime.ts'),
): BattleWarmAccess {
  let runtime: RuntimeModule | null = null;
  let pending: Promise<RuntimeModule> | null = null;

  const preload = (): Promise<RuntimeModule> => {
    if (runtime) return Promise.resolve(runtime);
    if (pending) return pending;
    const request = load().then((loaded) => {
      runtime = loaded;
      pending = null;
      return loaded;
    });
    pending = request;
    request.catch(() => {
      if (pending === request) pending = null;
    });
    return request;
  };

  return {
    preload,
    isReady: () => runtime !== null,
    warmBattleTerrainTiles: async (options) =>
      (await preload()).warmBattleTerrainTiles(options),
    warmNetworkWrecks: async (options) =>
      (await preload()).warmNetworkWrecks(options),
    warmNetworkOpeningEffects: async (options) =>
      (await preload()).warmNetworkOpeningEffects(options),
    warmStudioEffects: async (options) =>
      (await preload()).warmStudioEffects(options),
    stageCombatFxProgramSubmission: async (options) =>
      (await preload()).stageCombatFxProgramSubmission(options),
    invalidate: () => { runtime?.invalidateBattleWarmRuntime(); },
  };
}
