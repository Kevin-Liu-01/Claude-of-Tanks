import { preloadWreckTurretDriver } from '../vehicles/wreckTurretDriverLoader.ts';

type RuntimeModule = typeof import('./battleWarmRuntime.ts');
type RuntimeLoader = () => Promise<RuntimeModule>;

export interface BattleWarmAccess {
  preload(): Promise<RuntimeModule>;
  isReady(): boolean;
  requireRuntime(): RuntimeModule;
  warmBattleTerrainTiles(
    options: Parameters<RuntimeModule['warmBattleTerrainTiles']>[0],
  ): ReturnType<RuntimeModule['warmBattleTerrainTiles']>;
  primeOpeningTerrainPresentation(
    options: Parameters<RuntimeModule['primeOpeningTerrainPresentation']>[0],
  ): ReturnType<RuntimeModule['primeOpeningTerrainPresentation']>;
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

/**
 * The battle warm runtime, with the wreck turret's physics beside it (wreckTurretDriverLoader.ts). Every battle path
 * loads this under its cover (solo, network, the Studio, staged shots, the debug entry), so a turret popped in a battle,
 * a late-joined room's wrecks or a Studio take is a body. The physics never fails the battle: a load that fails leaves
 * the scripted pop for those turrets, and the deferred warm after entry asks again.
 */
const loadBattleWarmRuntime: RuntimeLoader = () => Promise.all([
  import('./battleWarmRuntime.ts'),
  preloadWreckTurretDriver().catch(() => undefined),
]).then(([loaded]) => loaded);

/** Retryable battle-only owner for terrain, wreck and common-FX warming. */
export function createBattleWarmAccess(
  load: RuntimeLoader = loadBattleWarmRuntime,
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
    requireRuntime() {
      if (!runtime) throw new Error('battle warm runtime was not preloaded');
      return runtime;
    },
    warmBattleTerrainTiles: async (options) =>
      (await preload()).warmBattleTerrainTiles(options),
    primeOpeningTerrainPresentation: async (options) =>
      (await preload()).primeOpeningTerrainPresentation(options),
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
