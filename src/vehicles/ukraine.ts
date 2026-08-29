// Ukrainian family gameplay/spec registration. Builders remain in
// profiles/ukraine.js; these rows clone the nearest certified combat envelope
// and apply only the typed national delta.

import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.ts';
import type { FleetDimensions, FleetTankSpec } from './specContracts.ts';
import {
  bindFleetRegistries,
  cloneFleetVariant,
  registerFleetSpecs,
  scaleNonExternalArmor,
  stripSilhouetteDimensions,
} from './fleetSpecRegistry.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
const UKRAINE_IDS = Object.freeze([
  'ua_t64bv', 'ua_t80bv', 'ua_t80u_kursk', 'ua_t84_oplot_m', 'ua_m1a1',
] as const);

type UkraineStatOverrides = Partial<Pick<FleetTankSpec,
  | 'hp'
  | 'enginePowerHp'
  | 'weightTons'
  | 'topSpeedKmh'
  | 'reverseSpeedKmh'
  | 'turretTraverseDegS'
  | 'gunPitchDegS'
>>;

interface UkraineVariantOptions {
  name: string;
  number: string;
  scheme?: string;
  base?: string;
  weather?: string;
  patches?: string[];
  camoScale?: number;
  dims?: Partial<FleetDimensions>;
  stats?: UkraineStatOverrides;
  armorFactor?: number;
}

function variant(
  id: string,
  donorId: string,
  options: UkraineVariantOptions,
): FleetTankSpec {
  const spec = cloneFleetVariant(registries.tankSpecs, id, donorId, {
    name: options.name,
    nation: 'Ukraine',
  });
  Object.assign(spec, options.stats || {});
  spec.visual = {
    ...spec.visual,
    scheme: options.scheme || 'digital',
    base: options.base || '#43503c',
    weather: options.weather || '#53604b',
    patches: options.patches || ['#2d352c', '#59604b', '#6d6650'],
    marking: 'number',
    number: options.number,
    camoScale: options.camoScale ?? 0.52,
  };
  // Ground-up Ukrainian builds own their silhouette measurements; donor gate
  // overrides describe the donor and must never transfer through the clone.
  stripSilhouetteDimensions(spec.dims);
  if (options.dims) Object.assign(spec.dims, options.dims);
  if (options.armorFactor) scaleNonExternalArmor(spec, options.armorFactor);
  return spec;
}

const UKRAINE_SPECS = {
  ua_t64bv: variant('ua_t64bv', 't64bv1', {
    name: 'T-64BV Donbas', number: 'UA 64', base: '#46503d', weather: '#5a604d',
    patches: ['#30382f', '#655f49', '#776c52'], camoScale: 0.48,
    dims: { hullLengthM: 6.54, overallLengthM: 9.23, widthM: 3.42, heightM: 2.17 },
    stats: { hp: 2050, enginePowerHp: 850, weightTons: 43.5, topSpeedKmh: 60 },
  }),
  ua_t80bv: variant('ua_t80bv', 't80bv', {
    name: 'T-80BV (Ukraine)', number: 'UA 80', base: '#38483b', weather: '#4b5848',
    patches: ['#263329', '#5c5942', '#71644b'], camoScale: 0.56,
    stats: { hp: 2150, enginePowerHp: 1100, weightTons: 44.5, topSpeedKmh: 70 },
  }),
  ua_t80u_kursk: variant('ua_t80u_kursk', 't80u', {
    name: 'T-80U Kursk', number: 'KURSK', base: '#4b5039', weather: '#5c5b45',
    patches: ['#303329', '#6b634a', '#80745a'], camoScale: 0.64,
    stats: { hp: 2350, enginePowerHp: 1250, weightTons: 46.0, topSpeedKmh: 70 },
    armorFactor: 1.04,
  }),
  ua_t84_oplot_m: variant('ua_t84_oplot_m', 't84', {
    name: 'T-84BM Oplot-M', number: 'OPLOT', base: '#42483a', weather: '#56594a',
    patches: ['#2d3029', '#77705b', '#8a8068'], camoScale: 0.42,
    dims: { heightM: 2.285, widthM: 3.775 },
    stats: { hp: 2700, enginePowerHp: 1200, weightTons: 51.0, topSpeedKmh: 70,
      reverseSpeedKmh: 35, turretTraverseDegS: 44 },
    armorFactor: 1.12,
  }),
  ua_m1a1: variant('ua_m1a1', 'm1a1ha', {
    name: 'M1A1 Abrams UA', number: 'UA M1', base: '#55594b', weather: '#69695a',
    patches: ['#393c34', '#77705b', '#82755c'], camoScale: 0.55,
    stats: { hp: 2450, weightTons: 64.0, topSpeedKmh: 65 },
  }),
} satisfies Record<string, FleetTankSpec>;

// Oplot-M is the tier-X end state of this family, with its own ammunition and
// cycle rather than the inherited tier-IX T-84 values.
{
  const spec = UKRAINE_SPECS.ua_t84_oplot_m;
  spec.hp = 2800;
  spec.gun.reloadS = 6.3;
  spec.gun.baseAccuracy = 0.31;
  spec.gun.aimTimeS = 1.8;
  Object.assign(spec.gun.shells[0], {
    name: '3BM60U APFSDS', pen100Mm: 830, pen1000Mm: 770,
    pen2000Mm: 700, dmg: 540, velocityMps: 1780,
  });
  Object.assign(spec.gun.shells[1], {
    name: 'Kombat-M HEAT', pen100Mm: 760, pen1000Mm: 760, dmg: 500,
  });
  Object.assign(spec.gun.shells[2], { dmg: 600 });
}

registerFleetSpecs(registries, UKRAINE_IDS, UKRAINE_SPECS);
