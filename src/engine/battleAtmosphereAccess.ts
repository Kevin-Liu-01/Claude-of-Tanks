import { BATTLE_TIMES, type BattleTimeOfDay } from './battleWeatherPolicy.ts';
import { createLazyRuntimeOwner } from '../app/lazyRuntimeOwner.ts';
import { loadGroundedLightModel } from './lightModelCore.ts';
import { loadCloudscapeLayers } from './cloudPresets.ts';
import type { BattleAtmosphereRuntime, BattleAtmosphereRuntimeOptions } from './battleAtmosphereRuntime.ts';

type AtmosphereModule = Pick<typeof import('./battleAtmosphereRuntime.ts'), 'createBattleAtmosphereRuntime'>;

/** Acquisition belongs to covered battle entry, never the first visible drop.
 * Invalidation also cancels a pending import before it can repaint the Garage.
 */
export function createBattleAtmosphereAccess(
  options: () => BattleAtmosphereRuntimeOptions,
  load: () => Promise<AtmosphereModule> = () => import('./battleAtmosphereRuntime.ts'),
) {
  // 2026-10-02 (the boot weight): the grounded light model (lightModelCore.ts) and the maps' cloudscapes (cloudPresets.ts)
  // ride the same covered acquisition, so every open sky this runtime applies is lit and clouded by them
  const loadRuntime = load;
  load = () => Promise.all([loadRuntime(), loadGroundedLightModel(), loadCloudscapeLayers()]).then(([module]) => module);
  const owner = createLazyRuntimeOwner(load, (module) => module.createBattleAtmosphereRuntime(options()));
  let generation = 0;
  return {
    get current(): BattleAtmosphereRuntime | null { return owner.current; },
    async prepare(seed: number | undefined, mapId: string, times: readonly BattleTimeOfDay[] | boolean = BATTLE_TIMES): Promise<void> {
      const requested = ++generation;
      const runtime = await owner.preload();
      if (requested !== generation) return;
      runtime.prepare(seed, mapId, times);
    },
    reset(): void { generation++; owner.current?.reset(); },
  };
}
