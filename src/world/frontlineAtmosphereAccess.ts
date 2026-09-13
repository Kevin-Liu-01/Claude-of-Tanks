import { createLazyRuntimeOwner } from '../app/lazyRuntimeOwner.ts';
import type { FrontlineAtmosphere, FrontlineAtmosphereOptions } from './frontlineAtmosphere.ts';

type FrontlineModule = Pick<typeof import('./frontlineAtmosphere.ts'), 'createFrontlineAtmosphere'>;

/**
 * Lazy owner for the frontline atmosphere: the module (shaders, textures,
 * aircraft geometry) stays out of the boot graph and is acquired behind the
 * covered battle entry, never on the first visible frame. A prepare that is
 * superseded before its import lands is dropped, like the weather owner.
 */
export function createFrontlineAtmosphereAccess(
  options: () => FrontlineAtmosphereOptions,
  load: () => Promise<FrontlineModule> = () => import('./frontlineAtmosphere.ts'),
) {
  const owner = createLazyRuntimeOwner(load, (module) => module.createFrontlineAtmosphere(options()));
  let generation = 0;
  return {
    get current(): FrontlineAtmosphere | null { return owner.current; },
    async prepare(seed: number | undefined, mapId: string): Promise<void> {
      const requested = ++generation;
      const runtime = await owner.preload();
      if (requested !== generation) return;
      runtime.prepare(seed, mapId);
    },
    update(dtSeconds: number): void { owner.current?.update(dtSeconds); },
    reset(): void { generation++; owner.current?.reset(); },
  };
}
