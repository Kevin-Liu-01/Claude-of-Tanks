import { isFleetBalanceFinalized } from './fleetBalanceState.ts';
// Additive Abrams source-study prototypes. Combat ancestry is metadata only:
// the original profiles stay untouched and the X family owns its native build.
// Lengths, kit widths and frames come from the registered SEP v2 source;
// published height remains a separate unresolved check. No donor silhouette
// or calibration is evidence for these new models.
import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.ts';
import {
  bindFleetRegistries,
  cloneFleetVariant,
  registerFleetSpecs,
  stripSilhouetteDimensions,
} from './fleetSpecRegistry.ts';
import { vehicleEraForId } from './taxonomy.ts';
import type { FleetTankSpec, TankSpecRegistry } from './specContracts.ts';
import type { GunPitchByYawCurve } from '../sim/gunPitchLimits.ts';
import { ABRAMS_SOURCE_X_FRAME, ABRAMS_SOURCE_X_MEASUREMENTS } from './abramsSourceXDatums.ts';
import { SEPV3_SIDE_ARMOR_WIDTH_M } from './abramsUpgradeDatums.ts';
import { applyAbramsSourceXSkirtArmor } from './abramsSourceXSkirtArmor.ts';
import { applyAbramsSourceXRackArmor } from './abramsSourceXRackArmor.ts';
import { applyAbramsSourceXUkraineEraArmor } from './abramsSourceXUkraineEraArmor.ts';
import { ukrainianSourceCage } from './ukrainianDroneCage.ts';
import { turretSideX } from './abramsSourceXDatums.ts';

export const ABRAMS_SOURCE_X_ENTRIES = Object.freeze([
  // 2026-09-15 owner roster pass: the X studies carry the canonical names (their donors moved
  // to older M1A1 marks) and the M1A1 X / M1A1 HA X studies were retired.
  ['m1a2_abrams', 'm1a1_abrams_hc', 'M1A2 Abrams'],
  ['m1a2_abrams_tusk', 'm1a1_abrams_sa', 'M1A2 Abrams TUSK'],
  ['m1a2_abrams_sepv2', 'm1a1_abrams_aim', 'M1A2 Abrams SEPv2'],
  ['m1a2_abrams_sepv3', 'm1a1_abrams_fep', 'M1A2 Abrams SEPv3'],
  ['ua_m1a2_abrams', 'ua_m1a1', 'M1A2 Abrams UA'], // owner 2026-09-15: the kitted Ukrainian study is the M1A2 UA
] as const);

export const ABRAMS_SOURCE_X_IDS = Object.freeze(
  ABRAMS_SOURCE_X_ENTRIES.map(([id]) => id),
);
export const ABRAMS_SOURCE_X_DONORS = Object.freeze(Object.fromEntries(
  ABRAMS_SOURCE_X_ENTRIES.map(([id, donor]) => [id, donor]),
));
export const ABRAMS_SOURCE_X_STATUS = Object.freeze({
  phase: 'prototype',
  dimensionBasis: 'measured-source-lengths; published-configuration-height',
  sourceFrame: 'fixed-selected-source; inferred-bearing-and-bore-joints',
  qualification: 'pending',
});

/** Release 231 (the gun-hull fleet lane): each M1A2 X's main-gun depression by absolute turret yaw (degrees;
 * sim/gunPitchLimits.ts), measured with tools/gun-depression-sweep.mjs once the hull's turret race cover and race
 * stopped inside the turret's ring disc (profiles/abramsSourceXHull.ts; the gun's cradle had stood in the cover at
 * every bearing and pitch) and the SEPv3's and UA kit's deck stowage came under the bustle: no mount conflict,
 * nothing blocked. The full ten degrees ahead and over the sides; the front skirt shoulders at 11-64; the engine deck
 * from 128. */

const M1A2_GUN_PITCH_BY_YAW: GunPitchByYawCurve = Object.freeze([[0, -10], [10, -10], [11, -8.9], [12, -8.6],
  [17, -8.4], [19, -8.4], [20, -8.7], [21, -9.7], [29, -8.8], [30, -8.4], [33, -7.6], [36, -7.5], [37, -7.6],
  [41, -8.4], [43, -8.9], [44, -9.3], [45, -9], [48, -9], [49, -9.1], [53, -9.9], [64, -9.9], [65, -10], [115, -10],
  [118, -9.9], [126, -9.9], [132, -6.7], [133, -6.1], [137, -4.2], [139, -2.6], [141, -1.6], [144, -0.3], [145, 0],
  [154, 0.7], [158, 0.7], [175, 0.5], [180, 0.2]]);

const TUSK_GUN_PITCH_BY_YAW: GunPitchByYawCurve = Object.freeze([[0, -10], [10, -10], [11, -8.9], [12, -8.6],
  [17, -8.4], [19, -8.4], [20, -8.7], [21, -9.6], [30, -8.4], [33, -7.4], [36, -7.5], [37, -7.6], [46, -9],
  [56, -8.9], [57, -9], [60, -9.9], [64, -9.9], [65, -10], [115, -10], [119, -9.2], [121, -9.2], [124, -9.6],
  [128, -9.1], [129, -8.5], [131, -7], [133, -5.8], [134, -5.3], [137, -4.2], [139, -2.6], [144, 0], [145, 0.3],
  [154, 0.8], [165, 0.7], [173, 0.6], [180, 0.4]]);

const SEPV2_GUN_PITCH_BY_YAW: GunPitchByYawCurve = Object.freeze([[0, -10], [10, -10], [11, -8.9], [12, -8.6],
  [17, -8.4], [19, -8.4], [20, -8.7], [21, -9.7], [26, -9.3], [28, -7.4], [29, -7.1], [32, -7.1], [37, -7.6],
  [45, -9], [46, -8.7], [53, -8.7], [54, -9], [56, -9.9], [64, -9.9], [65, -10], [115, -10], [124, -9.7], [130, -8],
  [131, -7.3], [133, -6.1], [137, -4.2], [139, -2.6], [141, -1.6], [144, -0.3], [145, 0], [154, 0.7], [158, 0.7],
  [175, 0.5], [180, 0.2]]);

const SEPV3_GUN_PITCH_BY_YAW: GunPitchByYawCurve = Object.freeze([[0, -10], [10, -10], [11, -8.9], [12, -8.6],
  [17, -8.4], [19, -8.4], [20, -8.7], [21, -9.7], [29, -8.8], [30, -8.4], [31, -7], [32, -6.2], [34, -5.5],
  [39, -5.1], [41, -5.1], [50, -6.2], [55, -7.5], [59, -7.5], [73, -9.5], [109, -9.5], [110, -9], [120, -7.7],
  [121, -7.5], [127, -7.3], [129, -6.5], [135, -5.4], [139, -2.6], [141, -1.6], [142, -1.2], [143, 0], [144, 0.7],
  [147, 1.8], [148, 2.1], [151, 2.6], [152, 2.8], [154, 2.9], [162, 3], [164, 2.5], [165, 2.1], [167, 0.5],
  [175, 0.5], [180, 0.2]]);

const UA_GUN_PITCH_BY_YAW: GunPitchByYawCurve = Object.freeze([[0, -10], [10, -10], [11, -8.9], [12, -8.6],
  [17, -8.4], [19, -8.4], [20, -8.7], [21, -9.6], [29, -8.8], [32, -7.5], [33, -7.2], [36, -7.2], [43, -8.9],
  [44, -9.2], [45, -8.5], [46, -8.3], [48, -8.3], [49, -8.5], [51, -9.5], [52, -9.2], [53, -9.1], [56, -9.1],
  [60, -9.9], [64, -9.9], [65, -10], [113, -10], [120, -8.6], [123, -8.6], [127, -9], [131, -6.5], [133, -5.4],
  [136, -4.4], [137, -4.2], [139, -2.6], [141, -1.6], [145, 0.2], [151, 0.8], [159, 0.9], [161, 2.8], [162, 3.4],
  [163, 3.7], [166, 3.8], [169, 2.9], [171, 1.6], [172, 0.6], [180, 0.5]]);

const ABRAMS_SOURCE_X_GUN_PITCH_BY_YAW: Readonly<Record<string, GunPitchByYawCurve>> = Object.freeze({
  m1a2_abrams: M1A2_GUN_PITCH_BY_YAW, m1a2_abrams_tusk: TUSK_GUN_PITCH_BY_YAW,
  m1a2_abrams_sepv2: SEPV2_GUN_PITCH_BY_YAW, m1a2_abrams_sepv3: SEPV3_GUN_PITCH_BY_YAW,
  ua_m1a2_abrams: UA_GUN_PITCH_BY_YAW,
});

/** Clone authored combat data without presenting donor-derived runtime
 * collision or fitted volume shapes as a fresh X calibration receipt. */
function provisionalArmor(donor: FleetTankSpec, donorId: string): FleetTankSpec['armor'] {
  const armor = structuredClone(donor.armor);
  const { turret, gun } = ABRAMS_SOURCE_X_FRAME;
  armor.turretPivot = [...turret];
  armor.gunPivot = [gun[0] - turret[0], gun[1] - turret[1], gun[2] - turret[2]];
  armor.gunBarrel = {
    lengthM: ABRAMS_SOURCE_X_MEASUREMENTS.muzzleZ - gun[2],
    radiusM: ABRAMS_SOURCE_X_MEASUREMENTS.barrelRadiusM,
  };
  Reflect.deleteProperty(armor, 'collisionShells');
  Reflect.deleteProperty(armor, 'bodyContactPoints');
  for (const volume of [...armor.modules, ...armor.crew]) {
    Reflect.deleteProperty(volume, 'parts');
    Reflect.deleteProperty(volume, 'shapes');
  }
  applyAbramsSourceXSkirtArmor(armor, {
    extendedFront: donorId === 'm1a1_abrams_aim',
    partitionedSkin: donorId === 'm1a1_abrams_hc', // the SEPv3's reactive skirt is its ARAT cassettes (2026-09-16)
  });
  applyAbramsSourceXRackArmor(armor, { extended: donorId === 'm1a1_abrams_aim' });
  // The Ukrainian study alone wears the field kit's reactive cassettes (owner 2026-09-15).
  if (donorId === 'ua_m1a1') {
    applyAbramsSourceXUkraineEraArmor(armor);
    armor.droneScreens = ukrainianSourceCage(armor.turretPivot, turretSideX);
  }
  return armor;
}

/** Pure construction port for registry and preservation regressions. */
export function createAbramsSourceXSpecs(donors: TankSpecRegistry): TankSpecRegistry {
  const result: TankSpecRegistry = {};
  for (const [id, donorId, name] of ABRAMS_SOURCE_X_ENTRIES) {
    const donor = donors[donorId];
    if (!donor) throw new Error(`Abrams X combat donor is not registered: ${donorId}`);
    const spec = cloneFleetVariant(donors, id, donorId, {
      name, nation: donor.nation, era: vehicleEraForId(donorId) || donor.era,
      role: donor.role,
    });
    delete spec.publicVisualFallback;
    delete spec.label;
    delete spec.roster;
    stripSilhouetteDimensions(spec.dims);
    // Standard and urban-kit widths are separate physical configurations.
    // Keep published height as an independent check, not a candidate-fit
    // value or the antenna-inclusive source bounding box.
    Object.assign(spec.dims, {
      hullLengthM: ABRAMS_SOURCE_X_MEASUREMENTS.structuralHullLengthM,
      overallLengthM: ABRAMS_SOURCE_X_MEASUREMENTS.overallLengthM,
      widthM: id === 'm1a2_abrams_sepv3' ? SEPV3_SIDE_ARMOR_WIDTH_M
        : id === 'm1a2_abrams_sepv2'
        ? ABRAMS_SOURCE_X_MEASUREMENTS.curvedUrbanArmorWidthM
        : id === 'm1a2_abrams_tusk'
          ? ABRAMS_SOURCE_X_MEASUREMENTS.rectangularUrbanArmorWidthM
        : ABRAMS_SOURCE_X_MEASUREMENTS.standardWidthM,
    });
    spec.armor = provisionalArmor(donor, donorId);
    spec.gunPitchByYawDeg = ABRAMS_SOURCE_X_GUN_PITCH_BY_YAW[id];
    spec.balancePeerOf = donorId;
    spec.sourceStudyStatus = { ...ABRAMS_SOURCE_X_STATUS };
    result[id] = spec;
  }
  return result;
}

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
registerFleetSpecs(registries, ABRAMS_SOURCE_X_IDS, createAbramsSourceXSpecs(registries.tankSpecs));

/** Run after the established donor balance pass, before anatomy finalization.
 * Never copy identity, dimensions, paint seats or qualification from donors. */
export function synchronizeAbramsSourceXCombatMetadata(
  registry: TankSpecRegistry = registries.tankSpecs,
): void {
  // Combat donor synchronization is initialization-only once final role tuning is published.
  if (isFleetBalanceFinalized(registry)) return;
  const fields = ['hp', 'enginePowerHp', 'weightTons', 'topSpeedKmh', 'reverseSpeedKmh',
    'hullTraverseDegS', 'terrainResistance', 'pivotStyle', 'turretTraverseDegS',
    'gunPitchDegS', 'gunElevationDeg', 'gunDepressionDeg', 'gun'] as const;
  for (const [id, donorId] of ABRAMS_SOURCE_X_ENTRIES) {
    const target = registry[id], donor = registry[donorId];
    if (!target || !donor) throw new Error(`Abrams X combat sync is missing ${id} or ${donorId}`);
    for (const field of fields) Object.assign(target, { [field]: structuredClone(donor[field]) });
    target.armor = provisionalArmor(donor, donorId);
  }
}
