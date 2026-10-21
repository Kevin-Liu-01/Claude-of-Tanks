import { shorelineDistance, shorelineRadiusAt, shorelineWetnessFromDistance, type ShorelineDisc } from './shoreline.ts';
import { WATER_BANK_REACH_M, waterCoverage, waterShoreFloor, waterlineDistance } from './waterBank.ts';

export interface LakeHeightResult {
  height: number; wetness: number;
  /** (2026-10-17, with a LakeBankLaw) the most covering lake's floor (its level) and its own coverage there (0: none
   * covers the point), and the highest dry-shore floor of the lakes whose waterline the point lies past (-Infinity: none);
   * the caller sets the bed by the water's true mask (terrain.ts applyHeightConstraints). */
  bedLevel?: number; bedCoverage?: number; shoreFloor?: number;
}

/** (the ground lane, 2026-10-17; waterBank.ts) a liquid lake's water held level in its banks: the map's water ramp, so
 * the composition can report the most covering lake and the shores' floor (LakeHeightResult). */
export interface LakeBankLaw { depthM: number; rampStart: number; rampEnd: number }

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
  out: LakeHeightResult, candidates: ArrayLike<number> | null = null, bank: LakeBankLaw | null = null,
): void {
  let oddsSum = 0, weightedLevel = 0, coreLevel = 0, coreCount = 0;
  let floor = -Infinity, bedCoverage = 0, bedLevel = 0;
  const continuous = authored && banks !== null;
  out.wetness = 0;
  // (2026-10-08, lakeCandidateIndex.ts) `candidates`: the ascending indices of the discs that can reach (x, z); the
  // others would each discard themselves below, so the result is the full loop's, bit for bit
  const count = candidates ? candidates.length : lakes.length;
  for (let k = 0; k < count; k++) {
    const index = candidates ? candidates[k] : k;
    const band = banks ? banks[index] : 1.32;
    const distance = shorelineDistance(lakes[index], x, z, band);
    if (banks && out.wetness < 1 && distance < .96) {
      out.wetness = Math.max(out.wetness, shorelineWetnessFromDistance(distance, true));
    }
    if (bank && banks && Number.isFinite(distance)) {
      // (2026-10-17, waterBank.ts) under this lake's water the bed that holds its top at its level (the most covering
      // lake's); past its own shelf law's waterline the shore's floor
      const lake = lakes[index];
      const radius = shorelineRadiusAt(lake, Math.atan2(z - lake.z, x - lake.x));
      const start = lake.shelfM !== undefined ? Math.min(0.94, 1 - lake.shelfM / Math.max(1, radius)) : 0.80;
      const coverage = waterCoverage(shorelineWetnessFromDistance(distance, true, start), bank.rampStart, bank.rampEnd);
      if (coverage > bedCoverage) { bedCoverage = coverage; bedLevel = levels[index]; }
      else if (coverage === 0) {
        const beyondM = Math.max(0, (distance - waterlineDistance(start, 0.96, bank.rampStart)) * radius);
        if (beyondM <= WATER_BANK_REACH_M) floor = Math.max(floor, waterShoreFloor(levels[index] + bank.depthM, beyondM));
      }
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
  if (bank) { out.bedLevel = bedLevel; out.bedCoverage = bedCoverage; out.shoreFloor = floor; }
}
