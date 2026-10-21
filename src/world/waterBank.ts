/**
 * waterBank.ts — level water held in its banks (the ground lane, 2026-10-17; MASTER #14 / GW.14, the critics' "tilted water
 * wedge climbing the far bank" at Mangrove, Monsoon and Delta's banks; finished 2026-10-21 for 230).
 *
 * A lake's or liquid marsh's level is its floor (the bed its carve holds flat; the ring and the bays read it so) and its
 * water's top is that floor plus the map's full depth: one surface per body (HeightField getWaterBodySurfaceAt), which the
 * sheet holds (shallowWater.ts). The carve had kept the bed flat at the floor out past the waterline (a marsh's flat core
 * runs to 0.94 of its radius, its water ends near 0.76; a lake's core to 0.94, its water near 0.89) and graded the bank
 * from that floor, so the dry shore at the waterline stood the full depth under the water's top: the sheet drawn as the
 * bed plus a depth thinning with the shore's coverage fell to the bed down the shore's band (the tilted wedge). Now:
 * - under the water (coverage > 0) the bed is the surface less the depth its coverage holds (the floor under full water,
 *   rising to the waterline), so the bed plus that depth (the simulation's water top) is the surface, a lip's share over
 *   it toward the shore;
 * - past the waterline the bank is graded from the water's top instead of the floor: the same band and the same blend
 *   weight the carve grades it by, the depth added in that weight's share (terrain.ts holdWaterInBanks). The bank meets
 *   the water at its top and runs out into the native ground as before: no plateau, no levee wall, no cut at a reach;
 * - the first metres of dry shore stand a lip over the water (the sheet's edge, filtered from the mask texture, tucks
 *   under it), fading to nothing.
 * Every map without liquid water and all ground outside a body's bank band is untouched. The 10-17 cut held the dry
 * shore over a 9 m plateau and cut it off at 16 m, which stepped low banks (Autumn's 2.5 m drop, the strands' 0.84 m
 * terrace); the band grading replaces it (the 230 waterside pass).
 */
import { shallowWaterDepth } from './waterContact.ts';

/** How far the dry shore stands over its water at the waterline (m): the sheet tucks under it, no shimmer at the edge. */
export const WATER_BANK_LIP_M = 0.12;
/** How far past the waterline the lip fades out (m): the mask texture's filtered edge and a little more. */
export const WATER_BANK_LIP_FADE_M = 4;

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

/** The bed under a body's water at coverage `mask` (0..1]: its surface less the depth that coverage holds (the floor under
 * full water), a lip's share over it toward the waterline. */
export function waterBedAt(surface: number, depthM: number, mask: number): number {
  return surface - shallowWaterDepth(mask, depthM) + WATER_BANK_LIP_M * (1 - mask);
}

/** The lip a dry shore `beyondM` past a body's waterline keeps over the water's top `surface`, added to ground `h` (never
 * more than the lip, never past the fade): the ground it stands at. */
export function waterBankLip(surface: number, h: number, beyondM: number): number {
  if (!(beyondM < WATER_BANK_LIP_FADE_M)) return h;
  const need = Math.min(WATER_BANK_LIP_M, surface + WATER_BANK_LIP_M - h);
  return need > 0 ? h + need * (1 - smoothstep(0, WATER_BANK_LIP_FADE_M, Math.max(0, beyondM))) : h;
}

/** A body's water coverage (HeightField getWaterMaskAt's law) from its shoreline wetness and the map's water ramp. */
export function waterCoverage(wetness: number, rampStart: number, rampEnd: number): number {
  return smoothstep(rampStart, rampEnd, wetness);
}
