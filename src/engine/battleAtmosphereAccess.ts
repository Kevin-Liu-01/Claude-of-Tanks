import { BATTLE_TIMES, type BattleTimeOfDay } from './battleWeatherPolicy.ts';
import { createLazyRuntimeOwner } from '../app/lazyRuntimeOwner.ts';
import { createLazyChunk, type LazyChunkLoadOptions, type LazyChunkState } from '../app/lazyChunk.ts';
import { importGroundedLightModel } from './lightModelCore.ts';
import { cloudscapeChunk } from './cloudPresets.ts';
import { loadEarthLand, skyDrawsEarth } from './earthLandAccess.ts';
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
   * battle time): the runtime, both parts and, for a sky that draws the Earth, the Moon's land mask are asked at once
   * whatever the lazy-chunk backoff, and awaited. Without it (the Studio's light applies, one per sun-dial or slider
   * move) each is asked as the policy allows, and only a first ask is awaited, never a re-ask.
   */
  readonly entry?: boolean;
  /**
   * (round 4 F2 review) The Studio's light applied again because something an earlier prepare lit without has landed
   * (its `landing`): the runtime applies its light again, where its prepare keeps a light it has already applied for
   * the same battlefield, seed and time. Once per landing, never per move (app/lazyChunkSites.selftest.mjs).
   */
  readonly relight?: boolean;
}

/** What a prepare lit without (round 4 F2 review). */
export interface BattleAtmospherePrepared {
  /**
   * The runtime or sky parts this prepare did not wait for (a re-ask after a failure, still in flight): resolves true
   * once one of them lands while this is still the latest prepare (its caller lights again, `{ relight: true }`), false
   * once they all failed or a later prepare or a reset came first. Null when it waited for everything it asked.
   */
  readonly landing: Promise<boolean> | null;
}

const AT_ONCE: LazyChunkLoadOptions = Object.freeze({ backoff: false });

interface AskedChunk<T> {
  load(options?: LazyChunkLoadOptions): Promise<T>;
  readonly failures: number;
  readonly state: LazyChunkState;
}

/** A chunk one prepare asked: its request, and the promise the prepare waits on (undefined: it does not wait). */
interface Asked<T> {
  readonly chunk: AskedChunk<T>;
  readonly request: Promise<T>;
  readonly wait: Promise<T> | undefined;
}

/**
 * One chunk asked for one prepare. (round 4 F2) An entry asks at once and waits. Another prepare waits on a first ask
 * (a cold Studio is lit as a battle is) but never on a re-ask: a re-ask follows a failure, its transfer may hang until
 * the browser gives up, and a Studio light apply (with the Studio's busy 'light' hold over it) waited on it. What it did
 * not wait for and is still in flight is the prepare's `landing`.
 */
function ask<T>(chunk: AskedChunk<T>, entry: boolean): Asked<T> {
  const request = chunk.load(entry ? AT_ONCE : undefined);
  return { chunk, request, wait: entry || chunk.failures === 0 ? request : undefined };
}

/** True once one of the requests lands while `latest()` holds; false once they all failed or it no longer holds. */
function landingOf(requests: readonly Promise<unknown>[], latest: () => boolean): Promise<boolean> {
  return new Promise((resolve) => {
    let left = requests.length;
    for (const request of requests) request.then(() => resolve(latest()), () => { if (--left === 0) resolve(false); });
  });
}

/** Acquisition belongs to covered battle entry, never the first visible drop.
 * Invalidation also cancels a pending import before it can repaint the Garage.
 */
export function createBattleAtmosphereAccess(
  options: () => BattleAtmosphereRuntimeOptions,
  load: () => Promise<AtmosphereModule> = () => import('./battleAtmosphereRuntime.ts'),
) {
  // the runtime's options, read once (the runtime keeps them for its life); an entry reads the authored sky from them
  let runtimeOptions: BattleAtmosphereRuntimeOptions | null = null;
  const optionsOnce = (): BattleAtmosphereRuntimeOptions => (runtimeOptions ??= options());
  const owner = createLazyRuntimeOwner(load, (module) => module.createBattleAtmosphereRuntime(optionsOnce()));
  const runtimeChunk: AskedChunk<BattleAtmosphereRuntime> = {
    load: (asking) => owner.preload(asking), get failures() { return owner.failures; }, get state() { return owner.state; },
  };
  let generation = 0;
  return {
    get current(): BattleAtmosphereRuntime | null { return owner.current; },
    async prepare(
      seed: number | undefined,
      mapId: string,
      times: readonly BattleTimeOfDay[] | boolean = BATTLE_TIMES,
      how: BattleAtmospherePrepareOptions = {},
    ): Promise<BattleAtmospherePrepared | undefined> {
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
      // whatever the backoff and waits for what it asked; a Studio apply keeps the backoff and waits on a first ask only.
      // (round 4 F2 review) The runtime as well as the parts: a Studio apply never waits on its re-ask, and applies nothing
      // until it lands (the Studio light runtime's own sky stands). What a prepare did not wait for is its `landing`, and
      // the Studio lights again once that lands (studio.ts prepareAtmosphere). An entry's sky that draws the Earth (the
      // Moon's) asks its land mask at once too, so the sky binds the raster as it applies (sky.ts earthLandTexture reads
      // the loaded module): the Studio's Moon sky asks the mask on every move and raises the same backoff
      const runtimeAsk = ask(runtimeChunk, entry);
      const parts = [ask(groundedLightChunk, entry), ask(cloudscapeChunk, entry)];
      const mask = entry && skyDrawsEarth(optionsOnce().getAuthoredPreset?.()) ? loadEarthLand(AT_ONCE) : undefined;
      // the parts and the mask never reject (a failed one leaves its fallback); the runtime's failure is the prepare's
      const optional = [...parts.map((part) => part.wait), mask].map((wait) => wait?.then(undefined, () => undefined));
      await Promise.all([runtimeAsk.wait, ...optional]);
      if (requested !== generation) return undefined;
      const runtime = owner.current;
      if (runtime) {
        if (how.relight === true) runtime.reset(); // its prepare keeps a light it applied: this one applies it again
        runtime.prepare(seed, mapId, times);
      }
      const late = [runtimeAsk, ...parts].filter((asked) => !asked.wait && asked.chunk.state === 'loading');
      return { landing: late.length ? landingOf(late.map((asked) => asked.request), () => requested === generation) : null };
    },
    reset(): void { generation++; owner.current?.reset(); },
  };
}
