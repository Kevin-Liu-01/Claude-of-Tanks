// Korean armored-family gameplay/spec registration (first-party expansion).
// K2B resurrects the former PL-01 combat deltas on the certified K2 donor;
// all playable geometry remains first-party procedural work in profiles/korea.js.

import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.js';
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
  k2b: variant('k2b', 'k2', {
    name: 'K2B', number: 'K2B', scheme: 'digital',
    base: '#313b38', weather: '#47504a', patches: ['#202725', '#4e5750', '#67685e'],
    camoScale: 0.36,
    dims: { hullLengthM: 7.00, overallLengthM: 9.20, widthM: 3.80, heightM: 2.80 },
    stats: { hp: 2300, enginePowerHp: 1000, weightTons: 35.0, topSpeedKmh: 70,
      reverseSpeedKmh: 30, turretTraverseDegS: 44, gunPitchDegS: 36 },
    reloadS: 5.4, shellName: 'DM63A1 APFSDS', armorFactor: 1.10,
  }),
} satisfies Record<string, FleetTankSpec>;

registerFleetSpecs(registries, KOREA_IDS, KOREA_SPECS);
