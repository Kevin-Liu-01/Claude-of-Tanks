import { createLazyRuntimeOwner } from '../app/lazyRuntimeOwner.ts';
import type { MapAmbience, MapAmbienceOptions } from './mapAmbience.ts';

type AmbienceModule = Pick<typeof import('./mapAmbience.ts'), 'createMapAmbience'>;

/**
 * Lazy owner for the map's air (mapAmbience.ts): the module (its shaders and the per-map table) stays out of the boot
 * graph and is acquired behind the covered battle entry or the Studio's atmosphere, like the frontline's. A prepare that
 * is superseded before its import lands is dropped. The toggle and the density override survive the import: they are
 * applied to the runtime when it lands.
 */
export function createMapAmbienceAccess(
  options: () => MapAmbienceOptions,
  load: () => Promise<AmbienceModule> = () => import('./mapAmbience.ts'),
) {
  const owner = createLazyRuntimeOwner(load, (module) => module.createMapAmbience(options()));
  let generation = 0;
  let enabled = true;
  let densityOverride: number | null = null;
  return {
    get current(): MapAmbience | null { return owner.current; },
    /** `time`: a battle's time of day or one of the Studio's seven. */
    async prepare(seed: number | undefined, mapId: string, time: string): Promise<void> {
      const requested = ++generation;
      const runtime = await owner.preload();
      if (requested !== generation) return;
      runtime.setEnabled(enabled);
      runtime.setDensityOverride(densityOverride);
      runtime.prepare(seed, mapId, time);
    },
    setEnabled(on: boolean): void { enabled = !!on; owner.current?.setEnabled(enabled); },
    get enabled(): boolean { return enabled; },
    setDensityOverride(scale: number | null): void { densityOverride = scale; owner.current?.setDensityOverride(scale); },
    refreshTier(): void { owner.current?.refreshTier(); },
    /** True while a layer draws (the late-FX pass must run for it). */
    isActive(): boolean { return owner.current?.isActive() === true; },
    reset(): void { generation++; owner.current?.reset(); },
  };
}
