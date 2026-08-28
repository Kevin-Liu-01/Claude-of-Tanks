// German Leopard derivative registration. Owner-supplied GLBs stay outside
// the project and are used only for comparison; all playable geometry is
// first-party procedural work in profiles/leopard.js and profiles/germany.ts.

import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.js';
import {
  frontPlate,
  leftCheekPlate,
  leftSidePlate,
  rightCheekPlate,
  rightSidePlate,
  type ArmorEnvelope,
  type PlateOptions,
  type Vec3Tuple,
} from './specHelpers.ts';
import type { FleetDimensions, FleetTankSpec } from './specContracts.ts';
import {
  bindFleetRegistries,
  cloneFleetVariant,
  registerFleetSpecs,
  scaleNonExternalArmor,
  stripSilhouetteDimensions,
} from './fleetSpecRegistry.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
const GERMANY_IDS = Object.freeze(['leo2a4_otco', 'leo2a4m', 'leo2a6m'] as const);

type GermanStatOverrides = Partial<Pick<FleetTankSpec,
  | 'hp'
  | 'enginePowerHp'
  | 'weightTons'
  | 'topSpeedKmh'
  | 'reverseSpeedKmh'
  | 'turretTraverseDegS'
  | 'gunPitchDegS'
>>;

interface GermanVariantOptions {
  name: string;
  nation?: string;
  number: string;
  scheme: string;
  base: string;
  weather: string;
  patches: string[];
  camoScale: number;
  dims?: Partial<FleetDimensions>;
  stats?: GermanStatOverrides;
  reloadS?: number;
  shellName?: string;
  turretPivot?: Vec3Tuple;
  gunPivot?: Vec3Tuple;
  gunBarrel?: Partial<ArmorEnvelope['gunBarrel']>;
  armorFactor?: number;
}

function variant(
  id: string,
  donorId: string,
  options: GermanVariantOptions,
): FleetTankSpec {
  const spec = cloneFleetVariant(registries.tankSpecs, id, donorId, {
    name: options.name,
    nation: options.nation || 'Germany',
  });
  Object.assign(spec, options.stats || {});
  if (options.reloadS !== undefined && Number.isFinite(options.reloadS)) {
    spec.gun.reloadS = options.reloadS;
  }
  if (options.shellName && spec.gun.shells[0]) spec.gun.shells[0].name = options.shellName;
  // Ground-up rows own their silhouette receipts; donor gate overrides must
  // not survive into a new geometry package.
  if (options.dims) {
    stripSilhouetteDimensions(spec.dims);
    spec.dims = { ...spec.dims, ...options.dims };
  }
  // Measured ring, trunnion, and muzzle dimensions are also the shadow-proxy
  // truth, so copy tuples into the mutable armor envelope explicitly.
  if (options.turretPivot) spec.armor.turretPivot = [...options.turretPivot];
  if (options.gunPivot) spec.armor.gunPivot = [...options.gunPivot];
  if (options.gunBarrel) Object.assign(spec.armor.gunBarrel, options.gunBarrel);
  spec.visual = {
    ...spec.visual,
    scheme: options.scheme,
    base: options.base,
    weather: options.weather,
    patches: options.patches,
    marking: 'number',
    number: options.number,
    camoScale: options.camoScale,
  };
  if (options.armorFactor) scaleNonExternalArmor(spec, options.armorFactor);
  return spec;
}

const GERMANY_SPECS = {
  leo2a4_otco: variant('leo2a4_otco', 'leo2a4', {
    name: 'Leopard 2A4 OTCO', number: 'OTCO', scheme: 'stripes',
    base: '#4b5140', weather: '#666a57', patches: ['#2d3328', '#665a42', '#77725e'],
    camoScale: 0.44,
    dims: { hullLengthM: 7.72, overallLengthM: 9.67, widthM: 3.70, heightM: 2.90 },
    stats: { hp: 2250, enginePowerHp: 1500, weightTons: 56.0, topSpeedKmh: 68,
      reverseSpeedKmh: 31, turretTraverseDegS: 36, gunPitchDegS: 31 },
    reloadS: 6.1, shellName: 'DM53 APFSDS', armorFactor: 1.08,
  }),
  leo2a4m: variant('leo2a4m', 'leo2a4', {
    name: 'Leopard 2A4M', number: 'A4M', scheme: 'stripes',
    base: '#4a5141', weather: '#656b58', patches: ['#2b3329', '#625941', '#77705b'],
    camoScale: 0.42,
    dims: { hullLengthM: 7.72, overallLengthM: 9.96, widthM: 3.77, heightM: 2.62 },
    // The ring reproduces the donor A4 seat margin while the certified gun
    // axis and 9.96 m overall muzzle receipt remain unchanged.
    turretPivot: [0, 1.70, 0.30], gunPivot: [0, 0.30, 1.13],
    gunBarrel: { lengthM: 4.81, radiusM: 0.10 },
    stats: { hp: 2450, enginePowerHp: 1500, weightTons: 61.8, topSpeedKmh: 68,
      reverseSpeedKmh: 31, turretTraverseDegS: 38, gunPitchDegS: 32 },
    reloadS: 5.9, shellName: 'DM53A1 APFSDS', armorFactor: 1.22,
  }),
  leo2a6m: variant('leo2a6m', 'leo2a6', {
    name: 'Leopard 2A6M', number: 'A6M', scheme: 'stripes',
    base: '#48503f', weather: '#626956', patches: ['#293128', '#605640', '#746d58'],
    camoScale: 0.40,
    dims: { hullLengthM: 7.72, overallLengthM: 10.97, widthM: 3.98, heightM: 3.03 },
    // Measured L55 rig: the authored bore mouth lands at the published 10.97
    // m overall line from the ISAF cage tail.
    turretPivot: [0, 1.80, 0.45], gunPivot: [0, 0.33, 0.85],
    gunBarrel: { lengthM: 5.98, radiusM: 0.10 },
    stats: { hp: 2600, enginePowerHp: 1500, weightTons: 64.1, topSpeedKmh: 68,
      reverseSpeedKmh: 31, turretTraverseDegS: 40, gunPitchDegS: 34 },
    reloadS: 5.7, shellName: 'DM63 APFSDS', armorFactor: 1.27,
  }),
} satisfies Record<string, FleetTankSpec>;

registerFleetSpecs(registries, GERMANY_IDS, GERMANY_SPECS);

// Clone before adding the A6M's separate fitted frontal package. The
// Ukrainian vehicle owns its own field-modernized sector layout.
const LEOPARD_2A6_UA_ID = 'leo2a6_ua';
const leopard2A6UA = variant(LEOPARD_2A6_UA_ID, 'leo2a6m', {
  name: 'Leopard 2A6 UA', nation: 'Ukraine', number: 'UA 26', scheme: 'digital',
  base: '#4d5343', weather: '#686858', patches: ['#2d382f', '#6c654d', '#4b5141'],
  camoScale: 0.46,
  dims: { hullLengthM: 7.72, overallLengthM: 10.97, widthM: 4.44, heightM: 3.28 },
  stats: { hp: 2850, enginePowerHp: 1500, weightTons: 72.4, topSpeedKmh: 64,
    reverseSpeedKmh: 29, turretTraverseDegS: 38, gunPitchDegS: 32 },
  reloadS: 5.8, shellName: 'DM63A1 APFSDS', armorFactor: 1.06,
});

interface EraReduction {
  readonly keReduction: number;
  readonly ceFlatMm: number;
}

const ukrainianNizh: EraReduction = Object.freeze({ keReduction: 0.22, ceFlatMm: 480 });
const ukrainianNizhSkirt: EraReduction = Object.freeze({ keReduction: 0.12, ceFlatMm: 320 });
const eraLayer = (era: EraReduction, keMm: number, ceMm: number): PlateOptions => ({
  kind: 'era', era, keMm, ceMm,
});

function addLeopard2A6UAFieldEraSectors(spec: FleetTankSpec): void {
  spec.armor.hullPlates.push(
    rightSidePlate('ua_skirt_era_R', 18, 2.04, 0.72, 2.04, 1.48, -3.08, 3.22,
      eraLayer(ukrainianNizhSkirt, 145, 520)),
    leftSidePlate('ua_skirt_era_L', 18, 2.04, 0.72, 2.04, 1.48, -3.08, 3.22,
      eraLayer(ukrainianNizhSkirt, 145, 520)),
  );
  spec.armor.turretPlates.push(
    rightCheekPlate('ua_turret_cheek_era_R', 18, 0.34, 2.58, 1.48, 1.30,
      0.05, 0.78, 0.14, 0, eraLayer(ukrainianNizh, 780, 1280)),
    leftCheekPlate('ua_turret_cheek_era_L', 18, 0.34, 2.58, 1.48, 1.30,
      0.05, 0.78, 0.14, 0, eraLayer(ukrainianNizh, 780, 1280)),
    rightSidePlate('ua_turret_side_era_R', 18, 1.56, 0.05, 1.56, 0.76,
      -2.86, 1.22, eraLayer(ukrainianNizhSkirt, 320, 720)),
    leftSidePlate('ua_turret_side_era_L', 18, 1.56, 0.05, 1.56, 0.76,
      -2.86, 1.22, eraLayer(ukrainianNizhSkirt, 320, 720)),
  );
}

// A6M keeps only the requested frontal field package. Its certified ISAF
// cage, skirts, and 3.98 m silhouette remain untouched.
registries.tankSpecs.leo2a6m.armor.hullPlates.push(
  frontPlate('a6m_upper_glacis_era', 18, 1.46, 1.65, 2.12, 1.39, 3.08,
    eraLayer(ukrainianNizh, 620, 1120)),
);
registries.tankSpecs.leo2a6m.armor.turretPlates.push(
  rightCheekPlate('a6m_turret_cheek_era_R', 18, 0.32, 2.66, 1.48, 1.30,
    0.05, 0.78, 0.16, 0, eraLayer(ukrainianNizh, 780, 1280)),
  leftCheekPlate('a6m_turret_cheek_era_L', 18, 0.32, 2.66, 1.48, 1.30,
    0.05, 0.78, 0.16, 0, eraLayer(ukrainianNizh, 780, 1280)),
);

// A7V's fitted package follows its native arrowhead cheeks and upper glacis;
// sector names match procedural clusters so stripEra removes the same area.
registries.tankSpecs.leo2a7v.armor.hullPlates.push(
  frontPlate('a7v_upper_glacis_era', 18, 1.50, 1.60, 2.10, 1.43, 2.84,
    eraLayer(ukrainianNizh, 620, 1120)),
);
registries.tankSpecs.leo2a7v.armor.turretPlates.push(
  rightCheekPlate('a7v_turret_cheek_era_R', 18, 0.36, 1.90, 1.40, 1.02,
    0.30, 0.80, 0.82, 0, eraLayer(ukrainianNizh, 780, 1280)),
  leftCheekPlate('a7v_turret_cheek_era_L', 18, 0.36, 1.90, 1.40, 1.02,
    0.30, 0.80, 0.82, 0, eraLayer(ukrainianNizh, 780, 1280)),
);
addLeopard2A6UAFieldEraSectors(leopard2A6UA);

registerFleetSpecs(registries, [LEOPARD_2A6_UA_ID], {
  [LEOPARD_2A6_UA_ID]: leopard2A6UA,
});
