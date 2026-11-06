import { createLazyRuntimeOwner } from '../app/lazyRuntimeOwner.ts';
import type { LazyChunkLoadOptions } from '../app/lazyChunk.ts';
import type { MapAmbience, MapAmbienceOptions } from './mapAmbience.ts';

type AmbienceModule = Pick<typeof import('./mapAmbience.ts'), 'createMapAmbience'>;

/** How a prepare asks (round 4 F2 review). */
export interface MapAmbiencePrepareOptions {
  /**
   * A battle's covered entry (main.ts: the solo entry's prepareAtmosphere, the network round's warm, the capture's battle
   * time): the module is asked at once whatever the lazy-chunk backoff, and awaited. Without it (the Studio's light
   * applies, one per sun-dial or slider move) it is asked as the policy allows, and only a first ask is awaited.
   */
  readonly entry?: boolean;
}

/** What a prepare applied without (round 4 F2 review). */
export interface MapAmbiencePrepared {
  /**
   * The module's re-ask this prepare did not wait for (after a failure, still in flight): resolves true once it lands
   * while this is still the latest prepare and its asker's session is live (its caller prepares again), else false.
   * Null when the prepare waited, or had nothing in flight.
   */
  readonly landing: Promise<boolean> | null;
}

const AT_ONCE: LazyChunkLoadOptions = Object.freeze({ backoff: false });

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
    /**
     * `time`: a battle's time of day or one of the Studio's seven. `asker` (round 3 A10): the Studio session's token; a
     * prepare whose session ended before the import landed applies nothing (that session's exit restored the air).
     * `how` (round 4 F2 review): a battle's entry declares itself (`{ entry: true }`).
     */
    async prepare(
      seed: number | undefined,
      mapId: string,
      time: string,
      asker?: { current(): boolean },
      how: MapAmbiencePrepareOptions = {},
    ): Promise<MapAmbiencePrepared | undefined> {
      const requested = ++generation;
      const entry = how.entry === true;
      // (round 4 F2 review) the battle atmosphere's rule (engine/battleAtmosphereAccess.ts): every Studio light apply
      // prepares the air, so a drag through an outage raised the lazy-chunk backoff to the minute's cap, and a battle
      // entered inside it got the kept failure: the solo entry dropped its optional warms, the network round failed. An
      // entry asks at once whatever the backoff. A Studio apply waits on a first ask only: a re-ask follows a failure and
      // may hang until the browser gives up, with the Studio's busy 'light' hold over it, so it is the prepare's
      // `landing` (the Studio prepares again once it lands), and a kept failure leaves the air off without failing the
      // Studio's light
      const request = owner.preload(entry ? AT_ONCE : undefined);
      if (!entry && owner.failures > 0) {
        if (owner.state !== 'loading') return { landing: null };
        return { landing: request.then(() => requested === generation && (!asker || asker.current()), () => false) };
      }
      const runtime = await request;
      if (requested !== generation || (asker && !asker.current())) return undefined;
      runtime.setEnabled(enabled);
      runtime.setDensityOverride(densityOverride);
      runtime.prepare(seed, mapId, time);
      return { landing: null };
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
