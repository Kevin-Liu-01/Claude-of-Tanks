/**
 * waterBank.ts — level water held in its banks (the ground lane, 2026-10-17; MASTER #14 / GW.14, the critics' "tilted water
 * wedge climbing the far bank" at Mangrove, Monsoon and Delta's banks).
 *
 * A lake's or liquid marsh's water stands at its level (HeightField getWaterBodySurfaceAt) and the sheet holds that level
 * (shallowWater.ts). The carve had kept the bed flat AT the level out past the waterline (a marsh's flat core runs to
 * 0.94 of its radius, its water ends near 0.76; a lake's core to 0.94, its water near 0.89) and drawn the water a full
 * depth over that bed, thinning with the shore's coverage: the water's top stood over the level and over the ground
 * round it (Mangrove's flats lie at the level), and fell to the bed down the shore's band — the tilted wedge. Now:
 * - under the water (coverage > 0) the bed is the level less the depth its coverage holds (so the bed plus that depth,
 *   the simulation's water top, is the level), raised by a lip's share toward the waterline;
 * - past the waterline the dry shore stands at least a lip over the level across one sheet cell (a low bank, where the
 *   native ground lies under the water's level, is raised to it: the levee that holds the water), then falls away.
 * Every map without liquid water, and all ground farther than the lip's fall from a waterline, is untouched.
 */
import { shallowWaterDepth } from './waterContact.ts';

/** How far the dry shore stands over its water at the waterline (m): the sheet tucks under it, no shimmer at the edge. */
export const WATER_BANK_LIP_M = 0.12;
/** The lip's fall past the waterline (m of height per m out): it meets the native ground within a few metres. */
export const WATER_BANK_FALL = 0.3;
/** How far past the waterline the dry shore holds the lip's height before it falls (m): just over the water sheet's 8 m
 *  lattice cell, so every dry corner of a shore cell stands over the water and the sheet runs level under it. */
export const WATER_BANK_PLATEAU_M = 9;
/** How far past the waterline the floor reaches (m): past it the native bank stands as authored. */
export const WATER_BANK_REACH_M = 16;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** The t in [0, 1] whose smoothstep is `y` (the shoreline laws' waterline by inversion). */
function inverseSmoothstep(y: number): number {
  const v = Math.min(1, Math.max(0, y));
  return 0.5 - Math.sin(Math.asin(1 - 2 * v) / 3);
}

/**
 * The normalised shoreline distance at which a shoreline law's wetness falls to `rampStart` — the visible waterline
 * (HeightField getWaterMaskAt is smoothstep(rampStart, rampEnd, wetness); wetness = 1 - smoothstep(start, end, distance)).
 */
export function waterlineDistance(start: number, end: number, rampStart: number): number {
  return start + (end - start) * inverseSmoothstep(1 - rampStart);
}

/** The bed under a body's water at coverage `mask` (0..1]: the level less the depth that coverage holds, a lip's share
 * over it toward the waterline. */
export function waterBedAt(level: number, depthM: number, mask: number): number {
  return level - shallowWaterDepth(mask, depthM) + WATER_BANK_LIP_M * (1 - mask);
}

/** The lowest dry shore a body allows `beyondM` past its waterline: a lip over its level, falling away; -Infinity past the
 * floor's reach. */
export function waterShoreFloor(level: number, beyondM: number): number {
  if (beyondM > WATER_BANK_REACH_M) return -Infinity;
  return level + WATER_BANK_LIP_M - WATER_BANK_FALL * Math.max(0, beyondM - WATER_BANK_PLATEAU_M);
}

/** A body's water coverage (HeightField getWaterMaskAt's law) from its shoreline wetness and the map's water ramp. */
export function waterCoverage(wetness: number, rampStart: number, rampEnd: number): number {
  return smoothstep(rampStart, rampEnd, wetness);
}
