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

export type T64Variant = 'bm1m' | 'bv' | 'b1v2022' | 'tur';

/** Each variant's measured stops (tools/gun-depression-sweep.mjs, 26 mm from the hull, every degree of yaw, 262): the full
 * 6 degrees ahead and abeam; the bow mudguards' crowns under the jacket at 19-41 degrees; over the rear quarter the gun
 * rides the right shelf's fuel tanks and the left's SPTA boxes (the T-64's own rear-quarter stop); the engine deck (and
 * the mod. 2022's rear slat screens) astern. */
const T64_GUN_PITCH_BY_YAW_DEG: Readonly<Record<T64Variant, readonly (readonly [number, number])[]>> = Object.freeze({
  bm1m: Object.freeze([[0,-6],[17,-6],[19,-5.1],[21,-4.7],[28,-4.4],[35,-4.4],[37,-4.6],[39,-4.9],[42,-6],[127,-6],
    [128,-2.4],[129,-0.1],[130,1],[131,1.6],[134,2.4],[139,2.7],[143,2.7],[155,1.5],[158,1.6],[159,1.6],[160,1.5],
    [161,0.8],[163,-2.8],[180,-2.8]] as const),
  bv: Object.freeze([[0,-6],[17,-6],[19,-5.1],[21,-4.7],[28,-4.4],[35,-4.4],[37,-4.6],[38,-4.8],[42,-6],[127,-6],
    [128,-2.4],[129,-0.1],[130,1],[131,1.6],[134,2.4],[139,2.7],[143,2.7],[155,1.5],[158,1.6],[159,1.6],[160,1.5],
    [161,0.8],[163,-2.8],[180,-2.8]] as const),
  b1v2022: Object.freeze([[0,-6],[17,-6],[19,-5.1],[21,-4.7],[28,-4.4],[35,-4.4],[37,-4.6],[38,-4.8],[42,-6],[127,-6],
    [128,-2.4],[129,-0.1],[130,1],[131,1.6],[134,2.4],[139,2.7],[143,2.7],[155,1.5],[158,1.6],[159,1.6],[160,1.5],
    [161,0.8],[162,-1.3],[163,-2],[180,-2.1]] as const),
  tur: Object.freeze([[0,-6],[17,-6],[19,-5.1],[21,-4.7],[28,-4.4],[35,-4.4],[37,-4.6],[38,-4.8],[42,-6],[127,-6],
    [128,-2.4],[129,-0.1],[130,1],[131,1.6],[134,2.4],[139,2.7],[143,2.7],[155,1.5],[158,1.6],[159,1.6],[160,1.5],
    [161,0.8],[163,-2.8],[180,-2.8]] as const),
});

/** Each variant's measured silhouette (262; the geometry gate's dims rule on the build: p95 body height over the cupola
 * gun, body-column length, full lit length with the rear stowage): what the gate's dims rows and the roof guns' aim rows
 * read in place of the published roof height and lengths. */
const T64_SILHOUETTE_DIMS: Readonly<Record<T64Variant, Readonly<Record<string, number>>>> = Object.freeze({
  bm1m: Object.freeze({ silhouetteHeightM: 2.788, silhouetteHullLengthM: 6.557, silhouetteOverallLengthM: 9.405 }),
  bv: Object.freeze({ silhouetteHeightM: 2.790, silhouetteHullLengthM: 6.868, silhouetteOverallLengthM: 9.689 }),
  b1v2022: Object.freeze({ silhouetteHeightM: 2.819, silhouetteHullLengthM: 6.774, silhouetteOverallLengthM: 9.410 }),
  tur: Object.freeze({ silhouetteHeightM: 2.790, silhouetteHullLengthM: 6.868, silhouetteOverallLengthM: 9.689 }),
});

const NIZH ={ keReduction: .30, ceFlatMm: 600 } as const;
const NIZH_SCREEN = { keReduction: .12, ceFlatMm: 420 } as const;
const KONTAKT1 = { keReduction: .05, ceFlatMm: 400 } as const;
const KONTAKT1_SKIRT = { keReduction: .03, ceFlatMm: 300 } as const;
/** The PT-64 Tur's ERAWA-2 cassettes: the PT-91M's values (glacis and turret; its skirts). */
const ERAWA2 = { keReduction: .20, ceFlatMm: 450 } as const;
const ERAWA2_SKIRT = { keReduction: .05, ceFlatMm: 280 } as const;

/** Seed quads for each variant's reactive sectors, named as the builders' destructible clusters; the combat-anatomy
 * generator replaces each with the exact envelope of the cassettes the build emits. */
function eraZones(variant: T64Variant): { hullPlates: ArmorPlate[]; turretPlates: ArmorPlate[] } {
  const main = variant === 'bm1m' ? NIZH : variant === 'tur' ? ERAWA2 : KONTAKT1;
  const skirt = variant === 'bm1m' ? NIZH_SCREEN : variant === 'tur' ? ERAWA2_SKIRT : KONTAKT1_SKIRT;
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
  Object.assign(spec.dims, T64_SILHOUETTE_DIMS[variant]);
  spec.visual.trackWidthM = T64_DATUMS.trackWidthM;
  const [tx, ty, tz] = T64_DATUMS.turretPivot, [gx, gy, gz] = T64_DATUMS.trunnion;
  spec.armor.turretPivot = [tx, ty, tz];
  spec.armor.gunPivot = [gx - tx, gy - ty, gz - tz];
  spec.armor.gunBarrel.lengthM = T64_DATUMS.muzzleZ - gz;
  spec.gunPitchByYawDeg = T64_GUN_PITCH_BY_YAW_DEG[variant];
  spec.armor.hullPlates = spec.armor.hullPlates.filter(p => !p.era);
  spec.armor.turretPlates = spec.armor.turretPlates.filter(p => !p.era);
  const zones = eraZones(variant);
  spec.armor.hullPlates.push(...zones.hullPlates);
  spec.armor.turretPlates.push(...zones.turretPlates);
}
