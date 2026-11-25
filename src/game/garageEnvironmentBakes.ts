// src/game/garageEnvironmentBakes.ts — each Garage pack's environment, baked from its own sky (garage-env-276).
//
// The open flip used to re-bake the sky's environment once and keep it for every later open pack (the Garage keeps
// one PMREM resident: per-switch re-bakes stalled the selector), so a desert yard could be lit and reflected with the
// winter sky's environment. Now each pack's environment is baked under its own preset, sun and enclosure, ahead of
// its showing in the Garage's idle pre-paint (the same intents that warm its surfaces: the selector opening and a
// choice's hover or focus), and kept resident per pack up to the device's cap while the Garage shows. The pack's
// activation installs it by key (engine/sky.ts bakeEnvironment: an exact hit swaps maps, no bake).
import { getGarageVariant, type GarageVariant } from './garageVariants.ts';

/**
 * How many bakes stay resident while the Garage shows (each a 768 x 1024 half-float PMREM target, 6 MiB: PMREM's
 * 256 cube, the same on every tier). Desktop: the shown pack and five more, 36 MiB; mobile: the shown pack and two,
 * 18 MiB (the surfaces' own rule there: the shown set and two kept). Leaving the Garage gives them back (the pair).
 */
export const GARAGE_ENVIRONMENT_CAP = Object.freeze({ desktop: 6, mobile: 3 });
/** One baked environment's GPU memory (MiB): 768 x 1024 texels of RGBA half float. */
export const GARAGE_ENVIRONMENT_MIB = (768 * 1024 * 8) / (1024 * 1024);

export interface GarageEnvironmentSky {
  prebakeEnvironment(preset: object, enclosed: boolean): string | null;
  environmentCached(key: string): boolean;
  setEnvironmentCapacity(count: number): void;
}

export interface GarageEnvironmentBakesOptions {
  readonly sky: GarageEnvironmentSky;
  /** The sky the Garage shows for a pack (main.ts: its battlefield's under the Garage's fair weather). */
  presetFor(variant: GarageVariant): object;
  /** Run work in an idle slot (main.ts requestQuietIdle). */
  schedule(work: () => void): void;
  /** Whether the Garage is showing (a pre-bake never runs behind a battle). */
  isShowing(): boolean;
  readonly capacity: number;
}

export interface GarageEnvironmentBakes {
  /** Bake this pack's environment in an idle slot, unless it is resident already. */
  want(variantId: string): void;
  /** The Garage shows: its per-pack bakes stay resident up to the cap. */
  enter(): void;
  /** The Garage is left: the queue drops and the cache gives the per-pack bakes back (the pair stays). */
  leave(): void;
  diagnostics(): { readonly resident: readonly string[]; readonly capacity: number; readonly residentMib: number };
}

export function createGarageEnvironmentBakes(options: GarageEnvironmentBakesOptions): GarageEnvironmentBakes {
  const { sky, presetFor, schedule, isShowing, capacity } = options;
  const keys = new Map<string, string>();
  const queue: string[] = [];
  let scheduled = false;
  const resident = (id: string): boolean => {
    const key = keys.get(id);
    return key !== undefined && sky.environmentCached(key);
  };
  const pump = (): void => {
    scheduled = false;
    if (!isShowing()) { queue.length = 0; return; }
    const id = queue.shift();
    if (id === undefined) return;
    if (!resident(id)) {
      const variant = getGarageVariant(id);
      // one pack a slot: its bake is one synchronous block (sky.ts prebakeEnvironment)
      const key = sky.prebakeEnvironment(presetFor(variant), variant.enclosure === 'sealed');
      if (key !== null) keys.set(id, key);
    }
    if (queue.length) { scheduled = true; schedule(pump); }
  };
  return {
    want(variantId) {
      const id = getGarageVariant(variantId).id;
      if (resident(id) || queue.includes(id)) return;
      queue.push(id);
      if (!scheduled) { scheduled = true; schedule(pump); }
    },
    enter() { sky.setEnvironmentCapacity(capacity); },
    leave() { queue.length = 0; sky.setEnvironmentCapacity(0); },
    diagnostics() {
      const ids = [...keys.keys()].filter(resident);
      return Object.freeze({ resident: Object.freeze(ids), capacity, residentMib: ids.length * GARAGE_ENVIRONMENT_MIB });
    },
  };
}
