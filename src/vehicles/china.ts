// Chinese family gameplay/spec registration. Geometry remains demand-owned by
// profiles/china.ts; these rows inherit a certified combat envelope and apply
// explicit typed deltas.

import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.ts';
import { createType99Armor } from './profiles/type99Armor.ts';
import type { ArmorEnvelope } from './specHelpers.ts';
import type { FleetDimensions, FleetTankSpec } from './specContracts.ts';
import {
  bindFleetRegistries,
  cloneFleetVariant,
  registerFleetSpecs,
  scaleNonExternalArmor,
  stripSilhouetteDimensions,
} from './fleetSpecRegistry.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
const CHINA_IDS = Object.freeze(['ztz85_iii', 'ztz99a2_prototype', 'ztz99a2'] as const);

type ChinaStatOverrides = Partial<Pick<FleetTankSpec,
  | 'hp'
  | 'enginePowerHp'
  | 'weightTons'
  | 'topSpeedKmh'
  | 'reverseSpeedKmh'
  | 'turretTraverseDegS'
  | 'gunPitchDegS'
  | 'gunElevationDeg'
  | 'gunDepressionDeg'
>>;

interface ChinaVariantOptions {
  name: string;
  number: string;
  base: string;
  weather: string;
  patches: string[];
  camoScale: number;
  dims?: Partial<FleetDimensions>;
  stats?: ChinaStatOverrides;
  reloadS?: number;
  armor?: ArmorEnvelope;
  armorFactor?: number;
}

function variant(
  id: string,
  donorId: string,
  options: ChinaVariantOptions,
): FleetTankSpec {
  const spec = cloneFleetVariant(registries.tankSpecs, id, donorId, {
    name: options.name,
    nation: 'China',
  });
  Object.assign(spec, options.stats || {});
  if (options.reloadS !== undefined && Number.isFinite(options.reloadS)) {
    spec.gun.reloadS = options.reloadS;
  }
  spec.visual = {
    ...spec.visual,
    scheme: 'digital',
    base: options.base,
    weather: options.weather,
    patches: options.patches,
    marking: 'number',
    number: options.number,
    camoScale: options.camoScale,
  };
  if (options.dims) {
    stripSilhouetteDimensions(spec.dims);
    spec.dims = { ...spec.dims, ...options.dims };
  }
  if (options.armor) spec.armor = options.armor;
  if (options.armorFactor) scaleNonExternalArmor(spec, options.armorFactor);
  return spec;
}

const CHINA_SPECS = {
  ztz85_iii: variant('ztz85_iii', 'type59', {
    name: 'ZTZ-85-III', number: '85-III', base: '#35483a', weather: '#4a5947',
    patches: ['#263229', '#59634c', '#736a4d'], camoScale: 0.50,
    // Ground-up silhouette receipts include bow/stern fittings and the roof
    // weapon cluster; gameplay dimensions remain the published base values.
    dims: {
      hullLengthM: 6.40, overallLengthM: 10.28, widthM: 3.45, heightM: 2.30,
      silhouetteHullLengthM: 6.47,
      silhouetteOverallLengthM: 8.43, silhouetteHeightM: 2.53,
    },
    stats: {
      hp: 1950, enginePowerHp: 1000, weightTons: 43.7, topSpeedKmh: 57,
      reverseSpeedKmh: 15, turretTraverseDegS: 34,
      gunPitchDegS: 27, gunElevationDeg: 14, gunDepressionDeg: 6,
    },
    armorFactor: 1.14,
  }),
  ztz99a2_prototype: variant('ztz99a2_prototype', 'type99a', {
    name: 'ZTZ-99A2 Prototype', number: '99A2-P', base: '#35453a', weather: '#4a5847',
    patches: ['#222f28', '#59634c', '#73694f'], camoScale: 0.43,
    dims: {
      hullLengthM: 7.6, overallLengthM: 11.0, widthM: 3.7, heightM: 2.45,
      silhouetteHullLengthM: 8.18, silhouetteOverallLengthM: 11.55,
      silhouetteHeightM: 2.95,
    },
    stats: {
      hp: 2650, enginePowerHp: 1500, weightTons: 57.5, topSpeedKmh: 70,
      reverseSpeedKmh: 28, turretTraverseDegS: 40, gunPitchDegS: 32,
    },
    reloadS: 6.6,
    armor: createType99Armor('ztz99a2_prototype'),
    armorFactor: 1.12,
  }),
  ztz99a2: variant('ztz99a2', 'type99a', {
    name: 'ZTZ-99A2', number: '99A2', base: '#36463a', weather: '#4c5a49',
    patches: ['#232f28', '#5e654d', '#766b52'], camoScale: 0.43,
    // The rear fuel rack participates in silhouette measurements while UI
    // dimensions retain the published hull and gun-forward values.
    dims: {
      hullLengthM: 7.6, overallLengthM: 11.0, widthM: 3.7, heightM: 2.45,
      silhouetteHullLengthM: 8.18, silhouetteOverallLengthM: 11.55,
      // The now-seated flank modules enter the measured P95 body envelope.
      silhouetteHeightM: 2.95,
    },
    stats: {
      hp: 2750, enginePowerHp: 1500, weightTons: 58.0, topSpeedKmh: 70,
      reverseSpeedKmh: 28, turretTraverseDegS: 42, gunPitchDegS: 34,
    },
    reloadS: 6.4,
    // Production A2: new reference-shaped turret on the improved A2 hull.
    armor: createType99Armor('ztz99a2'),
    armorFactor: 1.12,
  }),
} satisfies Record<string, FleetTankSpec>;

// Tier-VIII fire-control package: keep Type 59 ancestry for geometry while
// replacing the inherited 100 mm ammunition with the ZTZ-85-III's 125 mm set.
{
  const spec = CHINA_SPECS.ztz85_iii;
  spec.hp = 2100;
  spec.gun.reloadS = 6.8;
  spec.gun.baseAccuracy = 0.33;
  spec.gun.aimTimeS = 2.0;
  Object.assign(spec.gun.shells[0], {
    name: '125-I APFSDS', caliberMm: 125,
    pen100Mm: 620, pen1000Mm: 570, pen2000Mm: 510, dmg: 500,
    velocityMps: 1730, moduleDmg: 125,
  });
  Object.assign(spec.gun.shells[1], {
    name: 'DTP-125 HEAT', caliberMm: 125,
    pen100Mm: 600, pen1000Mm: 600, dmg: 480, velocityMps: 950, moduleDmg: 125,
  });
  Object.assign(spec.gun.shells[2], {
    name: 'DTB-125 HE', caliberMm: 125,
    pen100Mm: 50, pen1000Mm: 50, dmg: 570, velocityMps: 900, moduleDmg: 125,
  });
}

registerFleetSpecs(registries, CHINA_IDS, CHINA_SPECS);
