// Korean armored-family gameplay/spec registration (first-party expansion).
// K2B resurrects the former PL-01 combat deltas on the certified K2 donor;
// all playable geometry remains first-party procedural work in profiles/korea.js.

import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.js';
import type {
  FleetDimensions,
  FleetTankSpec,
  ModelSourceRegistry,
  TankSpecRegistry,
} from './specContracts.ts';

const tankSpecs = TANK_SPECS as unknown as TankSpecRegistry;
const modelSources = MODEL_SOURCE as unknown as ModelSourceRegistry;
const allTankIds = ALL_TANK_IDS as unknown as string[];
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
  const donor = tankSpecs[donorId];
  if (!donor) throw new Error(`Korean family donor missing: ${donorId}`);
  const spec = structuredClone(donor);
  spec.id = id;
  spec.name = options.name;
  spec.nation = 'South Korea';
  spec.era = 'modern';
  spec.role = 'mbt';
  spec.variantOf = donorId;
  delete spec.community;
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
  if (options.armorFactor) {
    for (const plate of [...spec.armor.hullPlates, ...spec.armor.turretPlates]) {
      if (plate.kind === 'external') continue;
      plate.keMm = Math.round(plate.keMm * options.armorFactor);
      plate.ceMm = Math.round(plate.ceMm * options.armorFactor);
    }
  }
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

for (const id of KOREA_IDS) {
  tankSpecs[id] ||= KOREA_SPECS[id];
  modelSources[id] ||= { source: 'procedural' };
  if (!allTankIds.includes(id)) allTankIds.push(id);
}
