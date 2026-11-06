import { BATTLE_TIMES, type BattleTimeOfDay } from './battleWeatherPolicy.ts';
import { createLazyRuntimeOwner } from '../app/lazyRuntimeOwner.ts';
import { createLazyChunk } from '../app/lazyChunk.ts';
import { importGroundedLightModel } from './lightModelCore.ts';
import { loadCloudscapeLayers } from './cloudPresets.ts';
import type { BattleAtmosphereRuntime, BattleAtmosphereRuntimeOptions } from './battleAtmosphereRuntime.ts';

type AtmosphereModule = Pick<typeof import('./battleAtmosphereRuntime.ts'), 'createBattleAtmosphereRuntime'>;

// (round 3 A4) the grounded light model's chunk (lightModelCore.ts importGroundedLightModel, which rejects and keeps no
// memo) under the one lazy-chunk policy, held here on the main thread: lightModelCore.ts also rides the horizon ring and
// hinterland worker graphs, which do not carry app/lazyChunk.ts. Its memo there was cleared on a failure and asked again
// at once by the next call, and every prepare asks it (below), which the Studio makes once per sun-dial or slider move
const groundedLightChunk = createLazyChunk(importGroundedLightModel);

/**
 * The grounded light model, loaded behind the battle entry (this module's acquisition and prepare, the capture staging).
 * Never rejects: a failed chunk keeps the authored rig, and a later call asks again as the lazy-chunk policy allows (at
 * once after one failure, then past its backoff, never offline; a removed chunk shows the reload action).
 */
export function loadGroundedLightModel(): Promise<void> {
  return groundedLightChunk.load().then(undefined, () => undefined);
}

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
      // (round 2 U35) the grounded model and the cloudscapes never reject: a failed chunk leaves the authored rig and the
      // deck derivation. They rode only the runtime's first acquisition, so once the runtime had loaded nothing asked them
      // again and one failed transfer stood for the document; every prepare asks them (a loaded one answers at once).
      // (round 3 A4) Every prepare includes the Studio's, one per sun-dial or slider move (main.ts prepareStudioAtmosphere):
      // both are held under the lazy-chunk policy, so a drag after a failure asks at most at the policy's backoff points and
      // never offline; inside the backoff the kept failure answers at once. A prepare that makes an allowed ask waits for
      // that transfer, as a battle entry's does, so the sky it applies is lit by the parts that arrived
      const [runtime] = await Promise.all([owner.preload(), loadGroundedLightModel(), loadCloudscapeLayers()]);
      if (requested !== generation) return;
      runtime.prepare(seed, mapId, times);
    },
    reset(): void { generation++; owner.current?.reset(); },
  };
}
