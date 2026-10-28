// The true T-64 base (profiles/t64Foundation.ts): its datums and the combat frame every T-64 takes. Owner 2026-10-27:
// "the t64 bm1m should be designed from scratchh as well and serve as inspiratin to properly update our t64s which are
// not based onn t64s rn". Boot-light: spec data only, no three.js.
//
// Datums (hull frame: ground y 0, +Z bow, +X the vehicle's left) come from the 42manako T-64BM1M print (CC-BY-NC,
// measurement only; docs/references/tanks/t64bm1m.md) held to published T-64 figures: the print is 6.4 % wide against
// the Kharkiv track law (540 mm track, 2,730 mm gauge, 3,270 mm over the tracks), so lateral stations take 0.933 of it,
// heights 0.96 and the turret 0.96 about its ring, while its 6.55 m hull length is kept.
import { plate, reactivePlate, type ArmorPlate } from './specHelpers.ts';
import type { FleetDimensions, FleetTankSpec } from './specContracts.ts';
import { fitArmorToDims } from './specs.ts';
import { stripSilhouetteDimensions } from './fleetSpecRegistry.ts';

export const T64_DATUMS = Object.freeze({
  /** Published T-64B figures (T-64B1M/BM1M: 3.61 m over the Nizh side screens, t64bm1m's own row). */
  dims: Object.freeze({ hullLengthM: 6.54, overallLengthM: 9.225, widthM: 3.415, heightM: 2.17 }),
  /** The turret ring's centre on the deck (2,160 mm bearing, its opening r 1.05 here). */
  turretPivot: Object.freeze([0, 1.40, -.10] as const),
  /** The 2A46M-1's trunnion: 0.72 m ahead of the ring, its bore 0.313 m over the deck. */
  trunnion: Object.freeze([0, 1.713, .62] as const),
  /** 9.225 m overall from the rear plate (z -3.375). */
  muzzleZ: 5.85,
  structuralRoofM: 2.19,
  trackWidthM: .54,
} as const);

export type T64Variant = 'bm1m' | 'bv' | 'b1v2022';

const NIZH = { keReduction: .30, ceFlatMm: 600 } as const;
const NIZH_SCREEN = { keReduction: .12, ceFlatMm: 420 } as const;
const KONTAKT1 = { keReduction: .05, ceFlatMm: 400 } as const;
const KONTAKT1_SKIRT = { keReduction: .03, ceFlatMm: 300 } as const;

/** Seed quads for each variant's reactive sectors, named as the builders' destructible clusters; the combat-anatomy
 * generator replaces each with the exact envelope of the cassettes the build emits. */
function eraZones(variant: T64Variant): { hullPlates: ArmorPlate[]; turretPlates: ArmorPlate[] } {
  const main = variant === 'bm1m' ? NIZH : KONTAKT1, skirt = variant === 'bm1m' ? NIZH_SCREEN : KONTAKT1_SKIRT;
  const [, py, pz] = T64_DATUMS.turretPivot;
  const era = (e: { keReduction: number; ceFlatMm: number }) => ({ kind: 'era', era: { ...e } });
  return {
    hullPlates: [
      plate('glacis_era_L', 12, [.02, .86, 2.88], [.98, .86, 2.88], [.02, 1.36, 1.86], era(main)),
      plate('glacis_era_R', 12, [-.98, .86, 2.88], [-.02, .86, 2.88], [-.98, 1.36, 1.86], era(main)),
      plate('skirt_era_L', 10, [1.76, .74, -2.30], [1.76, .74, 2.30], [1.76, 1.30, -2.30], era(skirt)),
      plate('skirt_era_R', 10, [-1.76, .74, 2.30], [-1.76, .74, -2.30], [-1.76, 1.30, 2.30], era(skirt)),
    ],
    turretPlates: [
      plate('turret_era_L', 12, [.30, 1.52 - py, 1.30 - pz], [1.40, 1.52 - py, .10 - pz], [.30, 1.95 - py, 1.30 - pz], era(main)),
      plate('turret_era_R', 12, [-1.40, 1.52 - py, .10 - pz], [-.30, 1.52 - py, 1.30 - pz], [-1.40, 1.95 - py, .10 - pz], era(main)),
      ...(variant === 'bm1m' ? [reactivePlate('turret_roof_era', 'top', { ...NIZH })] : []),
    ],
  };
}

/** The T-64's combat frame on a clone of the T-72B3's balanced combat record: the donor's protection values fitted to
 * the T-64's published dimensions, the T-64 ring, trunnion and muzzle, and the variant's own reactive sectors in place
 * of the donor's Kontakt-5. The generated anatomy then calibrates every plate, module and crew seat to the build. */
export function applyT64PhysicalFrame(spec: FleetTankSpec, donor: FleetTankSpec, variant: T64Variant, dims: FleetDimensions): void {
  spec.armor = structuredClone(donor.armor);
  fitArmorToDims(spec.armor, donor.dims, dims);
  spec.dims = { ...dims };
  stripSilhouetteDimensions(spec.dims);
  spec.visual.trackWidthM = T64_DATUMS.trackWidthM;
  const [tx, ty, tz] = T64_DATUMS.turretPivot, [gx, gy, gz] = T64_DATUMS.trunnion;
  spec.armor.turretPivot = [tx, ty, tz];
  spec.armor.gunPivot = [gx - tx, gy - ty, gz - tz];
  spec.armor.gunBarrel.lengthM = T64_DATUMS.muzzleZ - gz;
  spec.armor.hullPlates = spec.armor.hullPlates.filter(p => !p.era);
  spec.armor.turretPlates = spec.armor.turretPlates.filter(p => !p.era);
  const zones = eraZones(variant);
  spec.armor.hullPlates.push(...zones.hullPlates);
  spec.armor.turretPlates.push(...zones.turretPlates);
}
