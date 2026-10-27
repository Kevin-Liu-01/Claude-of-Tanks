/**
 * foliageSeeThrough.ts — the player's See-through foliage choice (Settings › Graphics), off by default. Copyright © 2026
 * Kevin B. Liu.
 *
 * Item 259 (the owner, 2026-10-26: "disable the thing that lets u see through greenery. it can be an optional thing u
 * can enable in settings"): on, the camera clears the foliage in its way (vegetation.ts FOLIAGE_LENS_REACH: the chase
 * camera's occlusion fade, the scope corridor, the near dissolve); off, every tree, bush and blade draws solid. The world
 * reads it each frame (worldFramePresentationRuntime.ts) and the Settings row writes it. Visual only: spotting and the
 * simulation never read it. Node-safe: a blocked or missing storage keeps the session's choice.
 */

export const FOLIAGE_SEE_THROUGH_STORAGE_KEY = 'cot.graphics.foliageSeeThrough.v1';
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

export interface FoliageSeeThroughPreference {
  /** The choice (read from storage once, then held). */
  get(): boolean;
  set(on: boolean): void;
}

export function createFoliageSeeThroughPreference(
  getStorage: () => PreferenceStorage | undefined = () => globalThis.localStorage,
): FoliageSeeThroughPreference {
  let value: boolean | null = null;
  return {
    get() {
      if (value === null) {
        value = false;
        try { value = getStorage()?.getItem(FOLIAGE_SEE_THROUGH_STORAGE_KEY) === 'on'; }
        catch { /* blocked storage: the default */ }
      }
      return value;
    },
    set(on) {
      value = on;
      try { getStorage()?.setItem(FOLIAGE_SEE_THROUGH_STORAGE_KEY, on ? 'on' : 'off'); }
      catch { /* the session keeps the choice */ }
    },
  };
}

export const foliageSeeThrough = createFoliageSeeThroughPreference();
