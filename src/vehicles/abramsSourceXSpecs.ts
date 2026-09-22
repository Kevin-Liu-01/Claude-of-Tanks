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
import { ABRAMS_SOURCE_X_FRAME, ABRAMS_SOURCE_X_MEASUREMENTS } from './abramsSourceXDatums.ts';
import { SEPV3_SIDE_ARMOR_WIDTH_M } from './abramsUpgradeDatums.ts';
import { applyAbramsSourceXSkirtArmor } from './abramsSourceXSkirtArmor.ts';
import { applyAbramsSourceXRackArmor } from './abramsSourceXRackArmor.ts';
import { applyAbramsSourceXUkraineEraArmor } from './abramsSourceXUkraineEraArmor.ts';

export const ABRAMS_SOURCE_X_ENTRIES = Object.freeze([
  // 2026-09-15 owner roster pass: the X studies carry the canonical names (their donors moved
  // to older M1A1 marks) and the M1A1 X / M1A1 HA X studies were retired.
  ['m1a2_x', 'm1a2', 'M1A2 Abrams'],
  ['m1a2_tusk_x', 'm1a2_tusk', 'M1A2 Abrams TUSK'],
  ['m1a2_sepv2_x', 'm1a2_sepv2', 'M1A2 Abrams SEPv2'],
  ['m1a2_sepv3_x', 'm1a2_sepv3', 'M1A2 Abrams SEPv3'],
  ['ua_m1a1_x', 'ua_m1a1', 'M1A2 Abrams UA'], // owner 2026-09-15: the kitted Ukrainian study is the M1A2 UA
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
    extendedFront: donorId === 'm1a2_sepv2',
    partitionedSkin: donorId === 'm1a2', // the SEPv3's reactive skirt is its ARAT cassettes (2026-09-16)
  });
  applyAbramsSourceXRackArmor(armor, { extended: donorId === 'm1a2_sepv2' });
  // The Ukrainian study alone wears the field kit's reactive cassettes (owner 2026-09-15).
  if (donorId === 'ua_m1a1') applyAbramsSourceXUkraineEraArmor(armor);
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
      widthM: id === 'm1a2_sepv3_x' ? SEPV3_SIDE_ARMOR_WIDTH_M
        : id === 'm1a2_sepv2_x'
        ? ABRAMS_SOURCE_X_MEASUREMENTS.curvedUrbanArmorWidthM
        : id === 'm1a2_tusk_x'
          ? ABRAMS_SOURCE_X_MEASUREMENTS.rectangularUrbanArmorWidthM
        : ABRAMS_SOURCE_X_MEASUREMENTS.standardWidthM,
    });
    spec.armor = provisionalArmor(donor, donorId);
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

