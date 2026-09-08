import { shorelineDistance, shorelineWetnessFromDistance, type ShorelineDisc } from './shoreline.ts';

export interface LakeHeightResult { height: number; wetness: number }

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function bankWeight(distance: number, band: number, settlement: number, liquid: boolean): number {
  let weight = smoothstep(band, .94, distance);
  if (liquid && settlement > 0) {
    // Preserve the existing settlement relief priority exactly.
    const original = smoothstep(1.32, .94, distance);
    weight += (original - weight) * settlement;
  }
  return weight;
}

/** One traversal and caller-owned output; never allocate in a height query.
 * Legacy sequential arithmetic remains exact. Authored drainage aprons use
 * continuous odds weighting so a later apron cannot deform an earlier core.
 */
export function composeLakeHeight(
  lakes: readonly ShorelineDisc[], levels: Float64Array, banks: Float64Array | null,
  authored: boolean, x: number, z: number, height: number, settlement: number,
  out: LakeHeightResult,
): void {
  let oddsSum = 0, weightedLevel = 0, coreLevel = 0, coreCount = 0;
  const continuous = authored && banks !== null;
  out.wetness = 0;
  for (let index = 0; index < lakes.length; index++) {
    const band = banks ? banks[index] : 1.32;
    const distance = shorelineDistance(lakes[index], x, z, band);
    if (banks && out.wetness < 1 && distance < .96) {
      out.wetness = Math.max(out.wetness, shorelineWetnessFromDistance(distance, true));
    }
    if (!(distance < band)) continue;
    const weight = bankWeight(distance, band, settlement, banks !== null);
    if (!continuous) { height += (levels[index] - height) * weight; continue; }
    // As weight approaches one, other aprons lose influence continuously.
    // Exact cores are handled separately to avoid division by zero.
    if (weight === 1) { coreLevel += levels[index]; coreCount++; continue; }
    if (weight === 0) continue;
    const odds = weight / (1 - weight);
    oddsSum += odds; weightedLevel += levels[index] * odds;
  }
  out.height = continuous ? (coreCount > 0 ? coreLevel / coreCount
    : (height + weightedLevel) / (1 + oddsSum)) : height;
}
