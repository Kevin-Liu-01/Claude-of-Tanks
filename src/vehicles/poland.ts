import {applyEscortFieldKitArmor} from './escortFieldKitArmor.ts';
import {ESCORT_FIELD_KITS} from './escortFieldKitLayout.ts';
// Polish armored-family gameplay/spec registration. The owner-supplied GLBs
// remain external visual and metric oracles; all playable geometry is the
// first-party procedural work in profiles/poland.ts.

import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.ts';
import type { ArmorEnvelope, ShellSpec, Vec3Tuple } from './specHelpers.ts';
import type { FleetDimensions, FleetTankSpec } from './specContracts.ts';
import {
  bindFleetRegistries,
  cloneFleetVariantFrom,
  registerFleetSpecs,
  scaleNonExternalArmor,
} from './fleetSpecRegistry.ts';
import { donorSpec } from './donorSpecs.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
const POLAND_IDS = Object.freeze(['t72m1_jaguar', 'pt91a_twardy', 'pl01', 'pl01_105'] as const);

type PolishStatOverrides = Partial<Pick<FleetTankSpec,
  | 'hp'
  | 'enginePowerHp'
  | 'weightTons'
  | 'topSpeedKmh'
  | 'reverseSpeedKmh'
  | 'turretTraverseDegS'
  | 'gunPitchDegS'
>>;

interface AutoloaderSpec {
  magazineSize: number;
  intraClipS: number;
  fullReloadS: number;
}

interface PolishVariantOptions {
  name: string;
  number: string;
  scheme: string;
  base: string;
  weather: string;
  patches: string[];
  camoScale: number;
  dims?: Partial<FleetDimensions>;
  stats?: PolishStatOverrides;
  reloadS?: number;
  autoloader?: AutoloaderSpec;
  shellName?: string;
  turretPivot?: Vec3Tuple;
  gunPivot?: Vec3Tuple;
  gunBarrel?: Partial<ArmorEnvelope['gunBarrel']>;
  armorFactor?: number;
  armor?: ArmorEnvelope;
}

function variant(
  id: string,
  donorId: string,
  options: PolishVariantOptions,
): FleetTankSpec {
  // t72b_1987 is an unregistered donor template since 2026-09-23.
  const spec = cloneFleetVariantFrom(donorSpec(registries.tankSpecs, donorId), id, donorId, {
    name: options.name,
    nation: 'Poland',
  });
  Object.assign(spec, options.stats || {});
  if (options.reloadS !== undefined && Number.isFinite(options.reloadS)) {
    spec.gun.reloadS = options.reloadS;
  }
  if (options.autoloader) spec.gun.autoloader = { ...options.autoloader };
  if (options.shellName && spec.gun.shells[0]) spec.gun.shells[0].name = options.shellName;
  if (options.dims) spec.dims = { ...spec.dims, ...options.dims };
  if (options.armor) spec.armor = structuredClone(options.armor);
  // Ground-up builds own their rigs: measured turret ring / gun trunnion
  // seats and published-overall muzzle lengths also size shadow proxies.
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

const t72m1Jaguar = variant('t72m1_jaguar', 't72b_1987', {
  name: 'T-72M1 Jaguar', number: 'PL-721', scheme: 'nato',
  // High-contrast Polish woodland: olive CARC ground with broad earth-brown
  // and near-black organic bands. Keep this brighter than the former muted
  // blue-gray recipe so the national finish reads through AO and weathering.
  base: '#46533a', weather: '#60694d', patches: ['#5a4534', '#1c211c'],
  camoScale: 0.44,
  dims: { hullLengthM: 6.86, overallLengthM: 9.53, widthM: 3.59, heightM: 2.23 },
  // Lift the complete articulated weapon group (mantlet, cradle and tube),
  // and move the complete turret package 120 mm forward so the ring sits
  // behind the shortened upper-glacis run instead of crowding the rear deck.
  turretPivot: [0, 1.40, 0.10], gunPivot: [0, 0.28, 0.52],
  // The tube is seated 120 mm deeper as the turret moves forward, preserving
  // the certified 6.24 m muzzle endpoint and published overall length.
  gunBarrel: { lengthM: 5.62, radiusM: 0.112 },
  stats: { hp: 2050, enginePowerHp: 1000, weightTons: 45.5, topSpeedKmh: 60,
    reverseSpeedKmh: 18, turretTraverseDegS: 34, gunPitchDegS: 27 },
  reloadS: 6.7, shellName: 'Pronit APFSDS', armorFactor: 1.06,
});

// 262 (owner 2026-10-28: "update the twardy to be beter and based off an actual tnak"): the serial PT-91 Twardy,
// built on the T-72B3 study under its ERAWA tiles (profiles/pt91Twardy.ts). Its dims, rig, track and protection frame
// are the study's (fleetRenewalSpecs.ts FLEET_RENEWAL_DONORS); the PT-91A's S-1000 (1,000 hp) stays its own, at the
// published 45.9 t, in the Polish Army's green, sand and black.
const pt91Twardy = variant('pt91a_twardy', 'pt91m', {
  name: 'PT-91A Twardy', number: 'PT-91', scheme: 'nato',
  base: '#4b5a3c', weather: '#66694f', patches: ['#8a7653', '#202420'],
  camoScale: 0.46,
  stats: { hp: 2250, enginePowerHp: 1000, weightTons: 45.9, topSpeedKmh: 60,
    reverseSpeedKmh: 20, turretTraverseDegS: 36, gunPitchDegS: 29 },
  reloadS: 6.4, shellName: 'Pronit 125 APFSDS',
});
// 262: the gun's depression by turret yaw over the rebuilt hull (tools/gun-depression-sweep.mjs, 26 mm): the full -6 over
// the glacis tiles; the bow ends of the steel screens and their tiles hold the front quarters to -3.8 at 27-33 degrees;
// behind, the study's engine deck and fittings as on the T-72B3.
pt91Twardy.gunPitchByYawDeg = [[0, -6], [25, -6], [26, -5.5], [27, -4.1], [28, -3.8], [30, -3.8], [32, -4], [33, -4.2],
  [40, -6], [139, -6], [147, -4.2], [150, -4.1], [153, -4.1], [158, -5.4], [159, -1.3], [160, 1.4], [161, 2.5], [162, 2.9],
  [167, 3.6], [168, 4], [169, 4.2], [172, 4.2], [175, 3.6], [179, 3.1], [180, 2.8]];

const pl01 = variant('pl01', 'xk2_black_panther', {
  name: 'PL-01', number: 'PL-01', scheme: 'digital',
  base: '#313b38', weather: '#47504a', patches: ['#202725', '#4e5750', '#67685e'],
  camoScale: 0.36,
  dims: { hullLengthM: 6.95, overallLengthM: 8.96, widthM: 3.80, heightM: 2.80 },
  // The ring stays fixed while the trunnion follows the taller structural
  // turret nose and remains buried in the thermal sleeve.
  turretPivot: [0, 2.07, -0.90], gunPivot: [0, 0.31104, 1.45],
  gunBarrel: { lengthM: 4.71, radiusM: 0.098 },
  stats: { hp: 2400, enginePowerHp: 1000, weightTons: 35.0, topSpeedKmh: 70,
    reverseSpeedKmh: 30, turretTraverseDegS: 44, gunPitchDegS: 36 },
  reloadS: 15.0,
  autoloader: { magazineSize: 3, intraClipS: 2.2, fullReloadS: 15.0 },
  shellName: 'DM63A1 APFSDS', armorFactor: 1.10,
});
// 261 (the owner's PL-01 gun fits, 2026-10-27): the gun's depression by turret yaw, measured over its own hull
// (tools/gun-depression-sweep.mjs, 26 mm; pl01GunHousing.selftest.mjs). Over the glacis it keeps its full -10. The tall
// skirt shoulders hold the front quarters to about -5 and the engine deck the rear to about -4.2; until 261 the gun ran
// into both at its bare -10. The 120's onset at yaw 9-10 is ramped at 2 deg per degree of yaw (the low stop is a clamp).
pl01.gunPitchByYawDeg = [[0, -10], [8.4, -10], [10, -6.9], [11, -5.8], [12, -5.1], [23, -4.7], [29, -4.7], [30, -4.9],
  [31, -5.8], [33, -8], [34, -8], [41, -9.2], [44, -10], [117, -10], [128, -9.2], [131, -8], [141, -5], [146, -4.2],
  [155, -4.3], [180, -5.2]];
Object.assign(pl01.gun.shells[0], {
  pen100Mm: 891, pen1000Mm: 830, pen2000Mm: 730, dmg: 550,
});
Object.assign(pl01.gun.shells[1], { pen100Mm: 650, pen1000Mm: 650, dmg: 500 });
Object.assign(pl01.gun.shells[2], { dmg: 600 });

// OBRUM offered its modular fire-support turret around 120 mm and 105 mm
// autoloading guns. The 105 trades single-shot damage for a four-round clip.
const pl01_105 = structuredClone(pl01);
pl01_105.id = 'pl01_105';
pl01_105.name = 'PL-01 (105)';
pl01_105.variantOf = 'pl01';
pl01_105.dims = { ...pl01_105.dims, silhouetteHeightM: 3.22368 };
pl01_105.gun = {
  ...pl01_105.gun,
  caliberMm: 105,
  reloadS: 13.5,
  autoloader: { magazineSize: 4, intraClipS: 1.8, fullReloadS: 13.5 },
  shells: [
    {
      name: 'DM63 105 APFSDS', type: 'APFSDS', caliberMm: 105,
      pen100Mm: 855, pen1000Mm: 790, pen2000Mm: 690,
      dmg: 430, velocityMps: 1555, moduleDmg: 110, tracer: 'APFSDS',
    },
    {
      name: 'M456A2 HEAT-T', type: 'HEAT', caliberMm: 105,
      pen100Mm: 450, pen1000Mm: 450,
      dmg: 420, velocityMps: 1173, moduleDmg: 110, tracer: 'HEAT',
    },
    {
      name: 'DM12 105 HE', type: 'HE', caliberMm: 105,
      pen100Mm: 40, pen1000Mm: 40,
      dmg: 510, velocityMps: 732, moduleDmg: 110, tracer: 'HE',
    },
  ] satisfies ShellSpec[],
};
pl01_105.armor.gunBarrel.radiusM = 0.086;
// its own fit's curve (the shield and sleeve sweep lower ahead than the 120's shroud; same hull)
pl01_105.gunPitchByYawDeg = [[0, -10], [3, -10], [5, -9.7], [12, -9.6], [14, -6.6], [15, -6.5], [25, -5.9], [27, -5.9],
  [28, -6.2], [30, -9], [32, -9], [35, -10], [119, -10], [125, -7.9], [126, -7.6], [133, -7], [140, -6.7], [142, -5.8],
  [145, -4.8], [146, -4.7], [157, -4.7], [167, -5.4], [168, -5.1], [169, -5], [180, -5]];
pl01_105.visual = { ...pl01_105.visual, number: 'PL-105' };

applyEscortFieldKitArmor(pl01_105,ESCORT_FIELD_KITS.pl01_105);

const POLAND_SPECS = {
  t72m1_jaguar: t72m1Jaguar,
  pt91a_twardy: pt91Twardy,
  pl01,
  pl01_105,
} satisfies Record<string, FleetTankSpec>;

registerFleetSpecs(registries, POLAND_IDS, POLAND_SPECS);
