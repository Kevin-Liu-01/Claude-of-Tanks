import { BATTLE_TIMES, type BattleTimeOfDay } from './battleWeatherPolicy.ts';
import { createLazyRuntimeOwner } from '../app/lazyRuntimeOwner.ts';
import { createLazyChunk, type LazyChunk, type LazyChunkLoadOptions } from '../app/lazyChunk.ts';
import { importGroundedLightModel } from './lightModelCore.ts';
import { cloudscapeChunk } from './cloudPresets.ts';
import type { BattleAtmosphereRuntime, BattleAtmosphereRuntimeOptions } from './battleAtmosphereRuntime.ts';

type AtmosphereModule = Pick<typeof import('./battleAtmosphereRuntime.ts'), 'createBattleAtmosphereRuntime'>;

// (round 3 A4) the grounded light model's chunk (lightModelCore.ts importGroundedLightModel, which rejects and keeps no
// memo) under the one lazy-chunk policy, held here on the main thread: lightModelCore.ts also rides the horizon ring and
// hinterland worker graphs, which do not carry app/lazyChunk.ts. Its memo there was cleared on a failure and asked again
// at once by the next call, and every prepare asks it (below), which the Studio makes once per sun-dial or slider move
const groundedLightChunk = createLazyChunk(importGroundedLightModel);

/**
 * The grounded light model, loaded behind the battle entry (this module's prepare, the capture staging).
 * Never rejects: a failed chunk keeps the authored rig, and a later call asks again as the lazy-chunk policy allows (at
 * once after one failure, then past its backoff, never offline; a removed chunk shows the reload action).
 */
export function loadGroundedLightModel(): Promise<void> {
  return groundedLightChunk.load().then(undefined, () => undefined);
}

/** How a prepare asks (round 4 F2). */
export interface BattleAtmospherePrepareOptions {
  /**
   * A battle's covered entry (main.ts: the solo entry's prepareAtmosphere, the network round's warm, the capture's
   * battle time): the runtime and both parts are asked at once whatever the lazy-chunk backoff, and awaited. Without it
   * (the Studio's light applies, one per sun-dial or slider move) each is asked as the policy allows, and a part's re-ask
   * is never awaited.
   */
  readonly entry?: boolean;
}

const AT_ONCE: LazyChunkLoadOptions = Object.freeze({ backoff: false });

/**
 * One of the sky's two parts asked for one prepare: the promise to await, or undefined when this prepare does not wait.
 * (2026-10-02, the boot weight) the grounded light model (lightModelCore.ts) and the maps' cloudscapes (cloudPresets.ts)
 * light and cloud every open sky this runtime applies; each is optional (a failed one leaves the authored rig or the deck
 * derivation). (round 4 F2) An entry asks at once and waits. Another prepare waits on a part's first ask (a cold Studio is
 * lit as a battle is) but never on a re-ask: a re-ask follows a failure, its transfer may hang until the browser gives up,
 * and a Studio light apply (with the Studio's busy 'light' hold over it) waited on it. The part lights the next apply once
 * it lands.
 */
function askPart(part: LazyChunk<void>, entry: boolean): Promise<void> | undefined {
  const request = part.load(entry ? AT_ONCE : undefined).then(undefined, () => undefined);
  return entry || part.failures === 0 ? request : undefined;
}

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
    async prepare(
      seed: number | undefined,
      mapId: string,
      times: readonly BattleTimeOfDay[] | boolean = BATTLE_TIMES,
      how: BattleAtmospherePrepareOptions = {},
    ): Promise<void> {
      const requested = ++generation;
      const entry = how.entry === true;
      // (round 2 U35) the grounded model and the cloudscapes never reject: a failed chunk leaves the authored rig and the
      // deck derivation. They rode only the runtime's first acquisition, so once the runtime had loaded nothing asked them
      // again and one failed transfer stood for the document; every prepare asks them (a loaded one answers at once).
      // (round 3 A4) Every prepare includes the Studio's, one per sun-dial or slider move (main.ts prepareStudioAtmosphere):
      // all three are held under the lazy-chunk policy, so a drag after a failure asks at most at the policy's backoff
      // points and never offline; inside the backoff the kept failure answers at once.
      // (round 4 F2) That drag raised the backoff (up to the minute's cap) that the next battle's entry then met: it got the
      // kept failure and played on the authored rig with deck-only clouds, or failed its atmosphere. An entry asks at once
      // whatever the backoff and waits for the parts it asked; a Studio apply keeps the backoff and never awaits a re-ask.
      // The runtime is the apply itself (it has no fallback), so every prepare waits for it
      const [runtime] = await Promise.all([
        owner.preload(entry ? AT_ONCE : undefined), askPart(groundedLightChunk, entry), askPart(cloudscapeChunk, entry),
      ]);
      if (requested !== generation) return;
      runtime.prepare(seed, mapId, times);
    },
    reset(): void { generation++; owner.current?.reset(); },
  };
}
