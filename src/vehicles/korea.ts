// Korean armored-family gameplay/spec registration (first-party expansion).
// K2B resurrects the former PL-01 combat deltas on the certified K2 donor;
// all playable geometry remains first-party procedural work in profiles/korea.ts.

import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.ts';
import type { FleetDimensions, FleetTankSpec } from './specContracts.ts';
import {
  bindFleetRegistries,
  cloneFleetVariant,
  registerFleetSpecs,
  scaleNonExternalArmor,
} from './fleetSpecRegistry.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
const KOREA_IDS = Object.freeze(['k2b'] as const);

type KoreanStatOverrides = Partial<Pick<FleetTankSpec,
  | 'hp'
  | 'enginePowerHp'
  | 'weightTons'
  | 'topSpeedKmh'
  | 'reverseSpeedKmh'
  | 'turretTraverseDegS'
  | 'gunPitchDegS'
>>;

interface KoreanVariantOptions {
  name: string;
  number: string;
  scheme: string;
  base: string;
  weather: string;
  patches: string[];
  camoScale: number;
  dims?: Partial<FleetDimensions>;
  stats?: KoreanStatOverrides;
  reloadS?: number;
  shellName?: string;
  armorFactor?: number;
  gunPitchByYawDeg?: FleetTankSpec['gunPitchByYawDeg'];
}

function variant(
  id: string,
  donorId: string,
  options: KoreanVariantOptions,
): FleetTankSpec {
  const spec = cloneFleetVariant(registries.tankSpecs, id, donorId, {
    name: options.name,
    nation: 'South Korea',
  });
  Object.assign(spec, options.stats || {});
  if (options.reloadS !== undefined && Number.isFinite(options.reloadS)) {
    spec.gun.reloadS = options.reloadS;
  }
  if (options.shellName && spec.gun.shells[0]) spec.gun.shells[0].name = options.shellName;
  if (options.dims) spec.dims = { ...spec.dims, ...options.dims };
  if (options.gunPitchByYawDeg) spec.gunPitchByYawDeg = options.gunPitchByYawDeg;
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

const KOREA_SPECS = {
  k2b: variant('k2b', 'xk2_black_panther', {
    name: 'K2B', number: 'K2B', scheme: 'digital',
    base: '#313b38', weather: '#47504a', patches: ['#202725', '#4e5750', '#67685e'],
    camoScale: 0.36,
    dims: { hullLengthM: 7.00, overallLengthM: 9.20, widthM: 3.80, heightM: 2.80 },
    stats: { hp: 2300, enginePowerHp: 1000, weightTons: 35.0, topSpeedKmh: 70,
      reverseSpeedKmh: 30, turretTraverseDegS: 44, gunPitchDegS: 36 },
    reloadS: 5.4, shellName: 'DM63A1 APFSDS', armorFactor: 1.10,
    // 252 (tools/gun-depression-sweep.mjs, the K2 gun front with its mantlet trimmed to 0.24 m under the bore): the gun's
    // lowest pitch by absolute turret yaw keeping 26 mm off every hull mesh, both sides, each degree's shallowest
    // neighbour. Over the glacis's lamp clusters and front corners 7.6-9.6 deg, over the engine deck and the stern
    // fittings from yaw 125 3.3-7.3 deg; the full 10 deg elsewhere.
    gunPitchByYawDeg: [[0, -9.2], [1, -7.7], [2, -7.6], [4, -7.6], [10, -8.2], [13, -8.6], [14, -8.1], [15, -7.8], [20, -7.6],
      [21, -7.6], [22, -7.9], [23, -9.5], [24, -9.4], [26, -9.4], [27, -9.6], [28, -9.1], [29, -9], [41, -8], [48, -8],
      [51, -8.3], [55, -9], [56, -9.9], [57, -9.9], [58, -10], [124, -10], [125, -7.3], [126, -6.4], [130, -5.5],
      [139, -5.2], [141, -4.6], [146, -4.2], [150, -4.2], [152, -3.3], [155, -3.4], [159, -4.2], [174, -4.2], [180, -4.5]],
  }),
} satisfies Record<string, FleetTankSpec>;

registerFleetSpecs(registries, KOREA_IDS, KOREA_SPECS);
