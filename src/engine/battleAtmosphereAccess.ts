import { createLazyRuntimeOwner } from '../app/lazyRuntimeOwner.ts';
import type { BattleAtmosphereRuntime, BattleAtmosphereRuntimeOptions } from './battleAtmosphereRuntime.ts';

type AtmosphereModule = Pick<typeof import('./battleAtmosphereRuntime.ts'), 'createBattleAtmosphereRuntime'>;

/** Acquisition belongs to covered battle entry, never the first visible drop.
 * Invalidation also cancels a pending import before it can repaint the Garage.
 */
export function createBattleAtmosphereAccess(
  options: () => BattleAtmosphereRuntimeOptions,
  load: () => Promise<AtmosphereModule> = () => import('./battleAtmosphereRuntime.ts'),
) {
  const owner = createLazyRuntimeOwner(load, (module) => module.createBattleAtmosphereRuntime(options()));
  let generation = 0;
  return {
    get current(): BattleAtmosphereRuntime | null { return owner.current; },
    async prepare(seed: number | undefined, mapId: string, budget: number): Promise<void> {
      const requested = ++generation;
      const runtime = await owner.preload();
      if (requested !== generation) return;
      runtime.prepare(seed, mapId, budget);
    },
    update(seconds: number, budget: number): void { owner.current?.update(seconds, budget); },
    reset(): void { generation++; owner.current?.reset(); },
  };
}
