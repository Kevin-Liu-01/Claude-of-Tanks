// Swedish family gameplay/spec registration. Geometry lives in
// profiles/sweden.ts and supplied GLBs remain external visual oracles.

import {
  TANK_SPECS,
  MODEL_SOURCE,
  ALL_TANK_IDS,
  fitArmorToDims,
} from './specs.js';
import {
  crewBox,
  frontPlate,
  leftSidePlate,
  moduleBox,
  rearPlate,
  rightSidePlate,
  roofPlate,
  type ArmorEnvelope,
  type PlateOptions,
} from './specHelpers.ts';
import type {
  FleetDimensions,
  FleetGunSpec,
  FleetTankSpec,
  HydropneumaticAim,
  TerrainResistance,
} from './specContracts.ts';
import {
  bindFleetRegistries,
  cloneFleetVariant,
  registerFleetSpecs,
  scaleNonExternalArmor,
} from './fleetSpecRegistry.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
const SWEDEN_IDS = Object.freeze(['strv81', 'udes03', 'strv103a', 'strv122'] as const);

interface SiegeGunOptions {
  name: string;
  reloadS: number;
  accuracy: number;
  aimTimeS: number;
  damage: number;
  apcrPen: number;
  apcrPenFar: number;
  heatPen: number;
  velocityMps: number;
  heDamage: number;
}

function siegeGun({
  name,
  reloadS,
  accuracy,
  aimTimeS,
  damage,
  apcrPen,
  apcrPenFar,
  heatPen,
  velocityMps,
  heDamage,
}: SiegeGunOptions): FleetGunSpec {
  const gun = structuredClone(registries.tankSpecs.strv103.gun);
  gun.reloadS = reloadS;
  gun.baseAccuracy = accuracy;
  gun.aimTimeS = aimTimeS;
  gun.shells[0] = {
    ...gun.shells[0],
    name: `${name} APDS`, pen100Mm: apcrPen, pen1000Mm: apcrPenFar,
    dmg: damage, velocityMps,
  };
  gun.shells[1] = {
    ...gun.shells[1],
    name: `${name} HEAT`, pen100Mm: heatPen, pen1000Mm: heatPen,
    dmg: damage,
  };
  gun.shells[2] = { ...gun.shells[2], name: `${name} HE`, dmg: heDamage };
  return gun;
}

type SwedishStatOverrides = Partial<Pick<FleetTankSpec,
  | 'hp'
  | 'enginePowerHp'
  | 'weightTons'
  | 'topSpeedKmh'
  | 'reverseSpeedKmh'
  | 'hullTraverseDegS'
  | 'terrainResistance'
  | 'turretTraverseDegS'
  | 'gunPitchDegS'
  | 'gunElevationDeg'
  | 'gunDepressionDeg'
  | 'hydropneumaticAim'
>> & {
  gunArcDeg?: number;
  gun?: FleetGunSpec;
};

interface SwedishVariantOptions {
  name: string;
  number: string;
  role?: string;
  era?: string;
  scheme?: string;
  base: string;
  weather: string;
  patches: string[];
  camoScale: number;
  dims?: Partial<FleetDimensions>;
  fitArmor?: boolean;
  stats?: SwedishStatOverrides;
  reloadS?: number;
  armorFactor?: number;
}

function variant(
  id: string,
  donorId: string,
  options: SwedishVariantOptions,
): FleetTankSpec {
  const donor = registries.tankSpecs[donorId];
  if (!donor) throw new Error(`Swedish family donor missing: ${donorId}`);
  const donorDims = { ...donor.dims };
  const spec = cloneFleetVariant(registries.tankSpecs, id, donorId, {
    name: options.name,
    nation: 'Sweden',
    era: options.era,
    role: options.role,
  });
  Object.assign(spec, options.stats || {});
  if (options.reloadS !== undefined && Number.isFinite(options.reloadS)) {
    spec.gun.reloadS = options.reloadS;
  }
  spec.visual = {
    ...spec.visual,
    scheme: options.scheme || 'nato',
    base: options.base,
    weather: options.weather,
    patches: options.patches,
    marking: 'number',
    number: options.number,
    camoScale: options.camoScale,
  };
  if (options.dims) {
    spec.dims = { ...spec.dims, ...options.dims };
    if (options.fitArmor) fitArmorToDims(spec.armor, donorDims, spec.dims);
  }
  if (options.armorFactor) scaleNonExternalArmor(spec, options.armorFactor);
  return spec;
}

function enforceTurretlessArmor(spec: FleetTankSpec): FleetTankSpec {
  spec.armor.turretless = true;
  spec.armor.turretPlates = [];
  return spec;
}

interface SiegeArmorRatings {
  frontPhysicalMm: number;
  frontKeMm: number;
  frontCeMm: number;
  lowerPhysicalMm: number;
  lowerKeMm: number;
  lowerCeMm: number;
  sideMm: number;
  sideKeMm: number;
  sideCeMm: number;
  rearMm: number;
  roofMm: number;
  trackMm: number;
}

/** Combat envelope for the hull-aimed Swedish wedge. Every module remains in
 * hull space so armor, reticle, module hits and server authority agree. */
function siegeArmor(
  dims: FleetDimensions,
  ratings: SiegeArmorRatings,
): ArmorEnvelope {
  const hl = dims.hullLengthM * 0.5;
  const hw = dims.widthM * 0.5;
  const bodyW = hw * 0.73;
  const floor = 0.20;
  const trackTop = Math.min(0.88, dims.heightM * 0.43);
  const roofY = dims.heightM * 0.68;
  const bowZ = hl * 0.99;
  const roofNoseZ = hl * 0.48;
  const gunY = roofY * 0.73;
  const gunZ = hl * 0.54;
  const plateRatings = (keMm: number, ceMm: number): PlateOptions => ({ keMm, ceMm });
  return {
    turretless: true,
    boundingRadiusM: hl + 3.2,
    turretPivot: [0, 0, 0],
    gunPivot: [0, gunY, gunZ],
    gunBarrel: {
      lengthM: dims.overallLengthM - dims.hullLengthM + hl * 0.62,
      radiusM: 0.075,
    },
    hullPlates: [
      frontPlate('upper_glacis', ratings.frontPhysicalMm, bodyW, trackTop * 0.57,
        bowZ, roofY, roofNoseZ, plateRatings(ratings.frontKeMm, ratings.frontCeMm)),
      frontPlate('lower_front', ratings.lowerPhysicalMm, bodyW, floor, hl * 0.86,
        trackTop * 0.57, bowZ, plateRatings(ratings.lowerKeMm, ratings.lowerCeMm)),
      rightSidePlate('hull_side_upper_R', ratings.sideMm, bodyW, trackTop * 0.70,
        bodyW * 0.96, roofY, -hl * 0.96, roofNoseZ,
        plateRatings(ratings.sideKeMm, ratings.sideCeMm)),
      leftSidePlate('hull_side_upper_L', ratings.sideMm, bodyW, trackTop * 0.70,
        bodyW * 0.96, roofY, -hl * 0.96, roofNoseZ,
        plateRatings(ratings.sideKeMm, ratings.sideCeMm)),
      rightSidePlate('hull_side_lower_R', ratings.sideMm, bodyW * 0.88, floor,
        bodyW, trackTop * 0.70, -hl * 0.94, hl * 0.86,
        plateRatings(ratings.sideKeMm, ratings.sideCeMm)),
      leftSidePlate('hull_side_lower_L', ratings.sideMm, bodyW * 0.88, floor,
        bodyW, trackTop * 0.70, -hl * 0.94, hl * 0.86,
        plateRatings(ratings.sideKeMm, ratings.sideCeMm)),
      rightSidePlate('track_R', ratings.trackMm, hw * 0.88, 0.10, hw * 0.88,
        trackTop, -hl, hl, { kind: 'external', moduleLink: 'trackR' }),
      leftSidePlate('track_L', ratings.trackMm, hw * 0.88, 0.10, hw * 0.88,
        trackTop, -hl, hl, { kind: 'external', moduleLink: 'trackL' }),
      rearPlate('hull_rear', ratings.rearMm, bodyW, floor, -hl * 0.96, roofY,
        -hl * 0.96),
      roofPlate('hull_roof', ratings.roofMm, bodyW * 0.96, roofY, -hl * 0.96,
        roofNoseZ),
    ],
    turretPlates: [],
    modules: [
      moduleBox('engine', [-bodyW * 0.92, floor, -hl * 0.93],
        [bodyW * 0.92, roofY * 0.82, -hl * 0.48]),
      moduleBox('fuelTank', [-bodyW * 0.90, floor, -hl * 0.45],
        [bodyW * 0.90, roofY * 0.56, -hl * 0.18]),
      moduleBox('ammoRack', [-bodyW * 0.86, floor, -hl * 0.14],
        [bodyW * 0.86, roofY * 0.58, hl * 0.34]),
      moduleBox('radio', [-bodyW * 0.82, roofY * 0.48, -hl * 0.13],
        [-bodyW * 0.20, roofY * 0.87, hl * 0.30]),
      moduleBox('optics', [bodyW * 0.18, roofY * 0.66, hl * 0.12],
        [bodyW * 0.78, roofY * 1.02, roofNoseZ]),
      moduleBox('gun', [-0.22, gunY - 0.24, -hl * 0.08],
        [0.22, gunY + 0.24, gunZ]),
      moduleBox('trackL', [-hw, 0, -hl], [-bodyW * 0.86, trackTop, hl]),
      moduleBox('trackR', [bodyW * 0.86, 0, -hl], [hw, trackTop, hl]),
    ],
    crew: [
      crewBox('driver', [-bodyW * 0.72, floor + 0.12, hl * 0.30],
        [-0.08, roofY * 0.92, hl * 0.66]),
      crewBox('gunner', [0.08, floor + 0.12, hl * 0.24],
        [bodyW * 0.72, roofY * 0.90, hl * 0.62]),
      crewBox('commander', [0.10, floor + 0.12, -hl * 0.18],
        [bodyW * 0.74, roofY * 0.92, hl * 0.17]),
    ],
  };
}

const udesAim: HydropneumaticAim = {
  noseDownDeg: 14, noseUpDeg: 20, rateDegS: 12,
  compressionM: 0.50, droopM: 0.50,
};
const udesTerrain: TerrainResistance = { hard: 0.66, medium: 0.82, soft: 1.28 };
const strv103aAim: HydropneumaticAim = {
  noseDownDeg: 13, noseUpDeg: 12, rateDegS: 10,
  compressionM: 0.44, droopM: 0.44,
};
const strv103aTerrain: TerrainResistance = { hard: 0.62, medium: 0.78, soft: 1.20 };

const SWEDEN_SPECS = {
  strv81: variant('strv81', 'centurion3', {
    name: 'Strv 81', number: '81', scheme: 'woodland',
    base: '#39483b', weather: '#4f5948', patches: ['#263129', '#62634a', '#74664c'],
    camoScale: 0.55,
    dims: { hullLengthM: 7.82, overallLengthM: 9.85, widthM: 3.39, heightM: 3.01 },
    stats: { hp: 1450, enginePowerHp: 650, weightTons: 51.8, topSpeedKmh: 35,
      reverseSpeedKmh: 12, turretTraverseDegS: 24, gunPitchDegS: 20 },
    reloadS: 7.1, armorFactor: 1.05,
  }),
  udes03: variant('udes03', 'strv103', {
    name: 'UDES 03', number: '03', role: 'td', scheme: 'solid',
    base: '#45513f', weather: '#55614d', patches: [], camoScale: 0.46,
    dims: { hullLengthM: 5.91, overallLengthM: 7.65, widthM: 2.85, heightM: 1.90 },
    fitArmor: true,
    stats: {
      hp: 1400, enginePowerHp: 340, weightTons: 17.5, topSpeedKmh: 72,
      reverseSpeedKmh: 52, hullTraverseDegS: 48, terrainResistance: udesTerrain,
      turretTraverseDegS: 32, gunPitchDegS: 30, gunElevationDeg: 20,
      gunDepressionDeg: 14, gunArcDeg: 3, hydropneumaticAim: udesAim,
      gun: siegeGun({
        name: '10,5 cm kan m/59', reloadS: 6.6, accuracy: 0.23, aimTimeS: 1.4,
        damage: 430, apcrPen: 315, apcrPenFar: 292, heatPen: 355,
        velocityMps: 1420, heDamage: 510,
      }),
    },
  }),
  strv103a: variant('strv103a', 'strv103', {
    name: 'Strv 103A', number: '103A', role: 'td', scheme: 'solid',
    base: '#46503b', weather: '#525a44', patches: [], camoScale: 0.5,
    dims: { hullLengthM: 7.04, overallLengthM: 8.99, widthM: 3.60, heightM: 2.14 },
    stats: {
      hp: 1850, enginePowerHp: 650, weightTons: 37.0, topSpeedKmh: 58,
      reverseSpeedKmh: 44, hullTraverseDegS: 48,
      terrainResistance: strv103aTerrain, turretTraverseDegS: 38,
      gunPitchDegS: 34, gunElevationDeg: 12, gunDepressionDeg: 13,
      gunArcDeg: 4, hydropneumaticAim: strv103aAim,
      gun: siegeGun({
        name: '10,5 cm kan Strv 103 L/74', reloadS: 5.4,
        accuracy: 0.21, aimTimeS: 1.25, damage: 480, apcrPen: 345,
        apcrPenFar: 318, heatPen: 390, velocityMps: 1530, heDamage: 560,
      }),
    },
  }),
  strv122: variant('strv122', 'leo2a5', {
    name: 'Strv 122', number: '122', scheme: 'splinter',
    base: '#34493c', weather: '#4b5b4c', patches: ['#202b26', '#5c644c', '#81745a'],
    camoScale: 0.42,
    dims: { hullLengthM: 7.72, overallLengthM: 9.97, widthM: 3.75, heightM: 3.02 },
    stats: { hp: 2850, enginePowerHp: 1500, weightTons: 62.5, topSpeedKmh: 68,
      reverseSpeedKmh: 31, turretTraverseDegS: 38, gunPitchDegS: 32 },
    reloadS: 6.0, armorFactor: 1.14,
  }),
} satisfies Record<string, FleetTankSpec>;

SWEDEN_SPECS.udes03.armor = siegeArmor(SWEDEN_SPECS.udes03.dims, {
  frontPhysicalMm: 45, frontKeMm: 90, frontCeMm: 125,
  lowerPhysicalMm: 35, lowerKeMm: 65, lowerCeMm: 85,
  sideMm: 25, sideKeMm: 35, sideCeMm: 45,
  rearMm: 25, roofMm: 25, trackMm: 20,
});
SWEDEN_SPECS.strv103a.armor = siegeArmor(SWEDEN_SPECS.strv103a.dims, {
  frontPhysicalMm: 65, frontKeMm: 180, frontCeMm: 240,
  lowerPhysicalMm: 55, lowerKeMm: 140, lowerCeMm: 180,
  sideMm: 40, sideKeMm: 55, sideCeMm: 70,
  rearMm: 35, roofMm: 35, trackMm: 25,
});
enforceTurretlessArmor(SWEDEN_SPECS.udes03);
enforceTurretlessArmor(SWEDEN_SPECS.strv103a);

// Upgrade the stable Strv 103 public ID to the supplied 103B identity while
// preserving saves and protocol keys.
const strv103 = registries.tankSpecs.strv103;
if (strv103) {
  Object.assign(strv103, {
    name: 'Strv 103B', nation: 'Sweden', hp: 2400,
    enginePowerHp: 900, weightTons: 39.7, topSpeedKmh: 65, reverseSpeedKmh: 50,
    hullTraverseDegS: 54,
    terrainResistance: { hard: 0.55, medium: 0.70, soft: 1.08 },
    turretTraverseDegS: 44, gunPitchDegS: 40,
    gunElevationDeg: 12, gunDepressionDeg: 13, gunArcDeg: 4,
    hydropneumaticAim: {
      noseDownDeg: 13, noseUpDeg: 12, rateDegS: 11,
      compressionM: 0.46, droopM: 0.46,
    },
    gun: siegeGun({
      name: '10,5 cm kan Strv 103 L/74B', reloadS: 4.4,
      accuracy: 0.18, aimTimeS: 1.05, damage: 520, apcrPen: 380,
      apcrPenFar: 350, heatPen: 425, velocityMps: 1600, heDamage: 620,
    }),
    armor: siegeArmor(strv103.dims, {
      frontPhysicalMm: 75, frontKeMm: 220, frontCeMm: 300,
      lowerPhysicalMm: 65, lowerKeMm: 170, lowerCeMm: 220,
      sideMm: 50, sideKeMm: 65, sideCeMm: 90,
      rearMm: 40, roofMm: 40, trackMm: 30,
    }),
  });
  delete strv103.community;
  strv103.visual = {
    ...strv103.visual,
    scheme: 'splinter', base: '#384b3d', weather: '#4e5b49',
    patches: ['#263329', '#62644b', '#776b50'], marking: 'number',
    number: '103B', camoScale: 0.48,
  };
  enforceTurretlessArmor(strv103);
  registries.modelSources.strv103 = { source: 'procedural' };
}

registerFleetSpecs(registries, SWEDEN_IDS, SWEDEN_SPECS);
