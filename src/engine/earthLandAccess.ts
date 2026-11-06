// src/engine/earthLandAccess.ts — the lunar Earth's land mask on demand (the 228 entry diet, 2026-10-18).
//
// earthLandMask.ts (the hand-traced coastlines and their rasteriser, ~8 KB built) serves one sky, Earthrise Basin's,
// so it is not part of the game's entry chunk (tools/bundle-budget.mjs entryRaw). The world build of a map whose sky
// draws the Earth (world/map.ts createMapAsync) loads it beside the terrain and awaits it before the world exists, so
// every sky that draws the Earth afterwards (the battle, the Studio, the horizon sample and the reflection bake, all of
// them on a built world) builds the raster where it did before: synchronously, on the same first call, the same bytes.
import type { DataTexture } from 'three';
import { createLazyChunk } from '../app/lazyChunk.ts';

type EarthLandModule = typeof import('./earthLandMask.ts');

// (round 3 A4) the mask's chunk under the one lazy-chunk policy (app/lazyChunk.ts). Its memo was cleared on a failure and
// asked again at once by the next caller, and on the Moon the Studio applies the sky once per sun-dial or slider move
// (studioLightRuntime.ts apply -> sky.ts earthLandTexture): after one failed transfer every move asked again, offline too.
// Now a failure is asked again at once after one failure, then past the backoff, never offline; a removed chunk shows
// the reload action
const earthLandChunk = createLazyChunk((): Promise<EarthLandModule> => import('./earthLandMask.ts'));

/** Whether a sky block draws the Earth (sky.ts SkyPreset.earth over 0.5, the shader's own test): its world loads the mask. */
export function skyDrawsEarth(sky: { readonly earth?: number | null } | null | undefined): boolean {
  return (sky?.earth ?? 0) > 0.5;
}

/**
 * Load the land mask's module (one request at a time; a failure is asked again under the lazy-chunk policy, and the
 * returned promise rejects with it, which every caller catches); resolved, sky.ts builds the raster synchronously.
 */
export function loadEarthLand(): Promise<EarthLandModule> {
  return earthLandChunk.load();
}

/** The land mask's raster (built on its first call, then kept) once its module has loaded; null before. */
export function loadedEarthLandTexture(): DataTexture | null {
  return earthLandChunk.value?.earthLandTexture() ?? null;
}
