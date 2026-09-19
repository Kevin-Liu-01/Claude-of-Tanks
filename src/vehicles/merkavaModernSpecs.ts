// Boot-light combat records for the current Merkava 4 family and the Namer
// IFV. Their first-party visuals remain demand-loaded with the merkavaX pack.

import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { shell } from './specHelpers.ts';
import {
  bindFleetRegistries,
  cloneFleetVariant,
  registerFleetSpecs,
  scaleNonExternalArmor,
  stripSilhouetteDimensions,
} from './fleetSpecRegistry.ts';
import type { FleetTankSpec } from './specContracts.ts';

export const MERKAVA_MODERN_IDS = Object.freeze([
  'merkava4_trophy',
  'merkava4_barak',
  'namer_ifv',
] as const);

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
const SINAI_GRAY = Object.freeze({
  scheme: 'solid',
  base: '#6f7566',
  weather: '#7b8172',
  patches: [] as string[],
  marking: 'number',
  trackWidthM: 0.548,
  camoScale: 0.46,
});

function mk4Variant(
  id: 'merkava4_trophy' | 'merkava4_barak',
  name: string,
  number: string,
  barak: boolean,
): FleetTankSpec {
  const spec = cloneFleetVariant(registries.tankSpecs, id, 'merkava4_x', {
    name,
    nation: 'Israel',
    era: 'modern',
    role: 'mbt',
  });
  delete spec.balancePeerOf;
  delete spec.sourceStudyStatus;
  stripSilhouetteDimensions(spec.dims);
  Object.assign(spec, {
    hp: 2850,
    enginePowerHp: 1500,
    weightTons: 65,
    topSpeedKmh: 64,
    reverseSpeedKmh: 25,
    hullTraverseDegS: barak ? 42 : 40,
    terrainResistance: barak
      ? { hard: 0.64, medium: 0.74, soft: 1.32 }
      : { hard: 0.68, medium: 0.78, soft: 1.40 },
    turretTraverseDegS: barak ? 44 : 40,
    gunPitchDegS: barak ? 36 : 32,
    gunElevationDeg: 20,
    gunDepressionDeg: 8,
  });
  spec.gun = {
    caliberMm: 120,
    reloadS: 6.0,
    baseAccuracy: barak ? 0.25 : 0.27,
    aimTimeS: barak ? 1.35 : 1.50,
    bloom: barak
      ? { move: 0.035, hullRot: 0.050, turret: 0.035, afterShot: 1.80 }
      : { move: 0.050, hullRot: 0.070, turret: 0.045, afterShot: 2.00 },
    shells: [
      shell('M338 APFSDS-T', 'APFSDS', 120, 900, 820, 550, 1730,
        { pen2000Mm: 740, moduleDmg: 130 }),
      shell('M325 HEAT-MP-T', 'HEAT', 120, 680, 680, 510, 1400,
        { pen2000Mm: 680, moduleDmg: 130 }),
      shell('M339 HE-MP-T', 'HE', 120, 45, 45, 620, 950,
        { pen2000Mm: 45, moduleDmg: 130 }),
    ],
  };
  spec.dims = barak ? {
    hullLengthM: 8.10,
    overallLengthM: 8.86,
    widthM: 3.90,
    heightM: 2.82,
  } : {
    hullLengthM: 7.98,
    overallLengthM: 8.97,
    widthM: 4.35,
    heightM: 4.53,
  };
  spec.visual = { ...SINAI_GRAY, number };
  return spec;
}

function namerSpec(): FleetTankSpec {
  const spec = cloneFleetVariant(registries.tankSpecs, 'namer_ifv', 'merkava4_x', {
    name: 'Namer IFV',
    nation: 'Israel',
    era: 'modern',
    role: 'ifv',
  });
  delete spec.balancePeerOf;
  delete spec.sourceStudyStatus;
  stripSilhouetteDimensions(spec.dims);
  Object.assign(spec, {
    balanceCohort: 'heavy-survivability',
    hp: 2650,
    enginePowerHp: 1200,
    weightTons: 63.5,
    topSpeedKmh: 54,
    reverseSpeedKmh: 20,
    hullTraverseDegS: 34,
    terrainResistance: { hard: 0.74, medium: 0.86, soft: 1.55 },
    turretTraverseDegS: 60,
    gunPitchDegS: 40,
    gunElevationDeg: 60,
    gunDepressionDeg: 10,
  });
  spec.gun = {
    caliberMm: 30,
    reloadS: 0.35,
    baseAccuracy: 0.28,
    aimTimeS: 1.30,
    muzzleBoreSegments: 14,
    soundProfile: 'mk30-2',
    bloom: { move: 0.055, hullRot: 0.075, turret: 0.050, afterShot: 1.65 },
    shells: [
      shell('Mk258 APFSDS-T', 'APFSDS', 30, 180, 164, 70, 1385,
        { pen2000Mm: 148, reloadS: 0.35, count: 200, moduleDmg: 30 }),
      shell('Mk310 PABM-T', 'HE', 30, 12, 12, 80, 1080,
        { pen2000Mm: 12, reloadS: 0.35, count: 200, moduleDmg: 30 }),
    ],
  };
  spec.dims = {
    hullLengthM: 7.48,
    overallLengthM: 7.48,
    widthM: 3.58,
    heightM: 3.15,
  };
  spec.armor.turretPivot = [0, 2.10, -1.15];
  spec.armor.gunPivot = [0.05, 0.28, 1.02];
  spec.armor.gunBarrel = { lengthM: 2.51, radiusM: 0.037 };
  scaleNonExternalArmor(spec, 1.08);
  spec.visual = { ...SINAI_GRAY, number: 'NAMER' };
  return spec;
}

const MERKAVA_MODERN_SPECS = {
  merkava4_trophy: mk4Variant('merkava4_trophy', 'Merkava Mk 4 Trophy', '4M', false),
  merkava4_barak: mk4Variant('merkava4_barak', 'Merkava Mk 4 Barak', 'BARAK', true),
  namer_ifv: namerSpec(),
} satisfies Readonly<Record<(typeof MERKAVA_MODERN_IDS)[number], FleetTankSpec>>;

registerFleetSpecs(registries, MERKAVA_MODERN_IDS, MERKAVA_MODERN_SPECS);

export { MERKAVA_MODERN_SPECS };
