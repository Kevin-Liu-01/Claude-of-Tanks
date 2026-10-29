// Chinese family gameplay/spec registration. Geometry remains demand-owned by
// profiles/china.ts; these rows inherit a certified combat envelope and apply
// explicit typed deltas.

import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.ts';
import { createType99Armor } from './profiles/type99Armor.ts';
import { createZTZ85IIIArmor } from './profiles/ztz85iiiArmor.ts';
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
const CHINA_IDS = Object.freeze(['ztz85_iii', 'ztz99a', 'ztz99a2'] as const);

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
  trackWidthM?: number;
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
  // a donor's measured deck-clearance curve belongs to its own hull and turret (release 233: the Longwei's)
  delete spec.gunPitchByYawDeg;
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
    ...(options.trackWidthM === undefined ? {} : { trackWidthM: options.trackWidthM }),
  };
  if (options.dims) {
    stripSilhouetteDimensions(spec.dims);
    spec.dims = { ...spec.dims, ...options.dims };
  }
  if (options.armor) spec.armor = options.armor;
  if (options.armorFactor) scaleNonExternalArmor(spec, options.armorFactor);
  return spec;
}

/**
 * Release 263: the rebuilt ZTZ-85-III's main gun by turret yaw, measured (tools/gun-depression-sweep.mjs --ids=ztz85_iii,
 * the whole gun 26 mm off every hull mesh, no mount conflict, clear at full elevation): the full 6 degrees dead ahead and
 * abeam; over the driver's periscopes at 7-22 degrees about 5.5, over the headlight guards at 25-39 about 3-4.3; over the
 * raised engine deck from 138 degrees it rises to 1.1-1.8 degrees down.
 */
const ZTZ85III_GUN_PITCH_BY_YAW_DEG = Object.freeze([
  [0, -6], [6, -6], [17, -5.5], [21, -5.5], [23, -6], [24, -6], [25, -4.3], [26, -3.5], [27, -3.3],
  [34, -3], [37, -3.2], [38, -3.6], [39, -4.3], [40, -5.8], [41, -6], [137, -6], [139, -4.5], [141, -3.8],
  [146, -2.8], [151, -2], [159, -1.7], [167, -1.5], [168, -1.2], [174, -1.1], [178, -1.3], [180, -1.8]] as const);

const CHINA_SPECS = {
  // Release 263 (owner 2026-10-28, "yeah going to need a totally new ztz 85 III"): the ground-up rebuild of
  // profiles/ztz85iii.ts on the published Type 85 record (docs/references/tanks/ztz85_iii.md §263). Dims are the published
  // 6.325 m hull, 10.37 m gun forward, 3.372 m over the skirts and 2.29 m over the cupola; the combat envelope follows the
  // new hull and welded turret at the tier's former strengths (profiles/ztz85iiiArmor.ts).
  ztz85_iii: variant('ztz85_iii', 'type59', {
    name: 'ZTZ-85-III', number: '85-III', base: '#35483a', weather: '#4a5947',
    patches: ['#263229', '#59634c', '#736a4d'], camoScale: 0.50,
    // the Type 85-IIM's 0.55 m track
    trackWidthM: 0.55,
    dims: {
      hullLengthM: 6.325, overallLengthM: 10.37, widthM: 3.372, heightM: 2.29,
      // the drawn envelope (the build's body extents): the stern drums to the front guards, the drums to the muzzle, the
      // 12.7 mm on its post over the cupola
      silhouetteHullLengthM: 6.88, silhouetteOverallLengthM: 10.91, silhouetteHeightM: 2.89,
    },
    stats: {
      hp: 1950, enginePowerHp: 1000, weightTons: 43.7, topSpeedKmh: 57,
      reverseSpeedKmh: 15, turretTraverseDegS: 34,
      gunPitchDegS: 27, gunElevationDeg: 14, gunDepressionDeg: 6,
    },
    armor: createZTZ85IIIArmor(),
  }),
  ztz99a: variant('ztz99a', 'ztz99_longwei', {
    name: 'ZTZ-99A', number: '99A', base: '#35453a', weather: '#4a5847',
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
    armor: createType99Armor('ztz99a'),
    armorFactor: 1.12,
  }),
  ztz99a2: variant('ztz99a2', 'ztz99_longwei', {
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

// Tier-VIII fire-control package: the inherited 100 mm ammunition replaced with the ZTZ-85-III's 125 mm set.
{
  const spec = CHINA_SPECS.ztz85_iii;
  spec.gunPitchByYawDeg = ZTZ85III_GUN_PITCH_BY_YAW_DEG;
  spec.hp = 2100;
  // 265 (the photo packet's 125 mm): the gun itself, not only its rounds; the Type 59's 100 mm rode the variant to here
  spec.gun.caliberMm = 125;
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
