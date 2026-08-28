// Japanese armored-family gameplay/spec registration. Owner-supplied GLBs
// are external visual/metric oracles only; playable geometry is authored in
// profiles/japan.js from first-party procedural donors and primitives.

import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.js';
import './profiles/miscSpecs.ts';
import { TYPE10_GUN_SEAT } from './profiles/type10GunSeat.ts';
import type {
  FleetDimensions,
  FleetGunSpec,
  FleetTankSpec,
} from './specContracts.ts';
import type { ShellSpec, Vec3Tuple } from './specHelpers.ts';
import {
  bindFleetRegistries,
  cloneFleetVariant,
  registerFleetSpecs,
  scaleNonExternalArmor,
} from './fleetSpecRegistry.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
const JAPAN_IDS = Object.freeze(['stb1', 'type90a', 'type10b'] as const);

interface AutoloaderSpec {
  magazineSize: number;
  intraClipS: number;
  fullReloadS: number;
}

type JapaneseStatOverrides = Partial<Pick<FleetTankSpec,
  | 'hp'
  | 'enginePowerHp'
  | 'weightTons'
  | 'topSpeedKmh'
  | 'reverseSpeedKmh'
  | 'hullTraverseDegS'
  | 'turretTraverseDegS'
  | 'gunPitchDegS'
>>;

type JapaneseGunOverrides = Partial<Pick<FleetGunSpec,
  | 'reloadS'
  | 'baseAccuracy'
  | 'aimTimeS'
>> & { autoloader?: AutoloaderSpec };

interface JapaneseVariantOptions {
  name: string;
  number: string;
  scheme: string;
  base: string;
  weather: string;
  patches: string[];
  camoScale: number;
  dims?: Partial<FleetDimensions>;
  stats?: JapaneseStatOverrides;
  reloadS?: number;
  shellName?: string;
  gun?: JapaneseGunOverrides;
  primaryShell?: Partial<ShellSpec>;
  armorFactor?: number;
}

function variant(
  id: string,
  donorId: string,
  options: JapaneseVariantOptions,
): FleetTankSpec {
  const spec = cloneFleetVariant(registries.tankSpecs, id, donorId, {
    name: options.name,
    nation: 'Japan',
  });
  Object.assign(spec, options.stats || {});
  if (options.reloadS !== undefined && Number.isFinite(options.reloadS)) {
    spec.gun.reloadS = options.reloadS;
  }
  if (options.shellName && spec.gun.shells[0]) spec.gun.shells[0].name = options.shellName;
  if (options.gun) spec.gun = { ...spec.gun, ...options.gun };
  if (options.primaryShell && spec.gun.shells[0]) {
    spec.gun.shells[0] = { ...spec.gun.shells[0], ...options.primaryShell };
  }
  if (options.dims) spec.dims = { ...spec.dims, ...options.dims };
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

// Type 90 is the mobile Tier IX three-round autoloader. Type 10 is the Tier X
// single-shot vehicle with stronger fire control, ammunition and protection.
const type90 = registries.tankSpecs.type90;
Object.assign(type90, {
  hp: 2250,
  enginePowerHp: 1500,
  reverseSpeedKmh: 25,
  hullTraverseDegS: 44,
  turretTraverseDegS: 40,
  gunPitchDegS: 30,
});
Object.assign(type90.gun, {
  reloadS: 18.5,
  baseAccuracy: 0.30,
  aimTimeS: 1.8,
  autoloader: { magazineSize: 3, intraClipS: 2.2, fullReloadS: 18.5 },
});
Object.assign(type90.gun.shells[0], {
  name: 'JM33 APFSDS', dmg: 500,
  pen100Mm: 806, pen1000Mm: 733, pen2000Mm: 660,
});

const type10 = registries.tankSpecs.type10;
Object.assign(type10, {
  hp: 2550,
  reverseSpeedKmh: 35,
  hullTraverseDegS: 48,
  turretTraverseDegS: 46,
  gunPitchDegS: 36,
});
Object.assign(type10.gun, {
  reloadS: 5.2,
  baseAccuracy: 0.27,
  aimTimeS: 1.5,
});
delete type10.gun.autoloader;
Object.assign(type10.gun.shells[0], {
  name: 'Type 10 APFSDS', dmg: 540,
  pen100Mm: 891, pen1000Mm: 811, pen2000Mm: 730,
});
scaleNonExternalArmor(type10, 1.12);

const JAPAN_SPECS = {
  stb1: variant('stb1', 'type74', {
    name: 'STB-1', number: 'STB-1', scheme: 'solid',
    base: '#3c4937', weather: '#59624d', patches: ['#273126', '#59604b', '#77715b'],
    camoScale: 0.46,
    dims: { hullLengthM: 6.70, overallLengthM: 9.20, widthM: 3.18, heightM: 2.25 },
    stats: { hp: 1750, enginePowerHp: 750, weightTons: 37.9, topSpeedKmh: 53,
      reverseSpeedKmh: 20, turretTraverseDegS: 32, gunPitchDegS: 27 },
    reloadS: 7.2, shellName: 'Type 93 APFSDS', armorFactor: 1.03,
  }),
  type90a: variant('type90a', 'type90', {
    name: 'Type 90A', number: '90-A', scheme: 'stripes',
    base: '#3f4c39', weather: '#5c624d', patches: ['#253127', '#6b5d3c', '#807458'],
    camoScale: 0.44,
    dims: { hullLengthM: 7.55, overallLengthM: 9.80, widthM: 3.43, heightM: 2.34 },
    stats: { hp: 2400, enginePowerHp: 1500, weightTons: 52.0, topSpeedKmh: 70,
      reverseSpeedKmh: 30, hullTraverseDegS: 46, turretTraverseDegS: 42,
      gunPitchDegS: 34 },
    gun: {
      reloadS: 17.0, baseAccuracy: 0.29, aimTimeS: 1.65,
      autoloader: { magazineSize: 3, intraClipS: 2.0, fullReloadS: 17.0 },
    },
    primaryShell: {
      name: 'Type 10 APFSDS', dmg: 510,
      pen100Mm: 855, pen1000Mm: 778, pen2000Mm: 700,
    },
    armorFactor: 1.12,
  }),
  type10b: variant('type10b', 'type10', {
    name: 'Type 10B', number: '10-B', scheme: 'stripes',
    base: '#3a4937', weather: '#59604b', patches: ['#243026', '#65583b', '#7a7054'],
    camoScale: 0.40,
    dims: { hullLengthM: 7.513, overallLengthM: 10.439, widthM: 3.564, heightM: 2.838 },
    stats: { hp: 2700, enginePowerHp: 1200, weightTons: 48.0, topSpeedKmh: 70,
      reverseSpeedKmh: 45, hullTraverseDegS: 50, turretTraverseDegS: 48,
      gunPitchDegS: 40 },
    gun: { reloadS: 4.7, baseAccuracy: 0.25, aimTimeS: 1.35 },
    primaryShell: {
      name: 'Type 10 Kai APFSDS', dmg: 550,
      pen100Mm: 916, pen1000Mm: 833, pen2000Mm: 750,
    },
    armorFactor: 1.08,
  }),
} satisfies Record<string, FleetTankSpec>;

registerFleetSpecs(registries, JAPAN_IDS, JAPAN_SPECS);

// Keep the donor armor row byte-stable for Type 90 cloning, then apply the
// live Type 10 pair seats post-clone. The builder compensates the tube run to
// preserve its certified muzzle station and overall length.
const TYPE10_PAIR_RIG: Readonly<{
  turretPivot: Vec3Tuple;
  gunPivot: Vec3Tuple;
}> = Object.freeze({
  turretPivot: [0, 1.8027777777777776, 0.2713333333333332],
  gunPivot: TYPE10_GUN_SEAT.turretLocalPivot,
});

for (const id of ['type10', 'type10b'] as const) {
  const armor = registries.tankSpecs[id]?.armor;
  if (!armor) throw new Error(`type10 pair rig re-auth: ${id} spec missing`);
  armor.turretPivot = [...TYPE10_PAIR_RIG.turretPivot];
  armor.gunPivot = [...TYPE10_PAIR_RIG.gunPivot];
}
