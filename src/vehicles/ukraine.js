// Ukrainian family gameplay/spec registration.
//
// Builders live in profiles/ukraine.js.  These rows deliberately inherit
// the nearest certified armor/module envelope so hitboxes, crew, ammo and
// articulation remain coherent with the family base.

import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.js';

export const UKRAINE_IDS = Object.freeze([
  'ua_t64bv', 'ua_t80bv', 'ua_t80u_kursk', 'ua_t84_oplot_m', 'ua_m1a1',
]);

function variant(id, donorId, o) {
  const donor = TANK_SPECS[donorId];
  if (!donor) throw new Error(`Ukraine family donor missing: ${donorId}`);
  const spec = structuredClone(donor);
  spec.id = id;
  spec.name = o.name;
  spec.nation = 'Ukraine';
  spec.era = 'modern';
  spec.class = 'mbt';
  spec.variantOf = donorId;
  delete spec.community;
  Object.assign(spec, o.stats || {});
  spec.visual = {
    ...spec.visual,
    scheme: o.scheme || 'digital',
    base: o.base || '#43503c',
    weather: o.weather || '#53604b',
    patches: o.patches || ['#2d352c', '#59604b', '#6d6650'],
    marking: 'number',
    number: o.number,
    camoScale: o.camoScale ?? 0.52,
  };
  if (o.heightM) spec.dims.heightM = o.heightM;
  if (o.armorFactor) {
    for (const plate of [...spec.armor.hullPlates, ...spec.armor.turretPlates]) {
      if (plate.kind === 'external') continue;
      plate.keMm = Math.round(plate.keMm * o.armorFactor);
      plate.ceMm = Math.round(plate.ceMm * o.armorFactor);
    }
  }
  return spec;
}

export const UKRAINE_SPECS = {
  ua_t64bv: variant('ua_t64bv', 't64bv1', {
    name: 'T-64BV Donbas', number: 'UA 64', base: '#46503d', weather: '#5a604d',
    patches: ['#30382f', '#655f49', '#776c52'], camoScale: 0.48,
    stats: { hp: 2050, enginePowerHp: 850, weightTons: 43.5, topSpeedKmh: 60 },
  }),
  ua_t80bv: variant('ua_t80bv', 't80bv', {
    name: 'T-80BV (Ukraine)', number: 'UA 80', base: '#38483b', weather: '#4b5848',
    patches: ['#263329', '#5c5942', '#71644b'], camoScale: 0.56,
    stats: { hp: 2150, enginePowerHp: 1100, weightTons: 44.5, topSpeedKmh: 70 },
  }),
  ua_t80u_kursk: variant('ua_t80u_kursk', 't80u', {
    name: 'T-80U Kursk', number: 'KURSK', base: '#4b5039', weather: '#5c5b45',
    patches: ['#303329', '#6b634a', '#80745a'], camoScale: 0.64, heightM: 2.90,
    stats: { hp: 2350, enginePowerHp: 1250, weightTons: 46.0, topSpeedKmh: 70 },
    armorFactor: 1.04,
  }),
  ua_t84_oplot_m: variant('ua_t84_oplot_m', 't84', {
    name: 'T-84BM Oplot-M', number: 'OPLOT', base: '#42483a', weather: '#56594a',
    patches: ['#2d3029', '#77705b', '#8a8068'], camoScale: 0.42, heightM: 3.15,
    stats: { hp: 2700, enginePowerHp: 1200, weightTons: 51.0, topSpeedKmh: 70,
      reverseSpeedKmh: 35, turretTraverseDegS: 44 },
    armorFactor: 1.12,
  }),
  ua_m1a1: variant('ua_m1a1', 'm1a1ha', {
    name: 'M1A1 Abrams UA', number: 'UA M1', base: '#55594b', weather: '#69695a',
    patches: ['#393c34', '#77705b', '#82755c'], camoScale: 0.55, heightM: 3.46,
    stats: { hp: 2450, weightTons: 64.0, topSpeedKmh: 65 },
  }),
};

for (const id of UKRAINE_IDS) {
  TANK_SPECS[id] = TANK_SPECS[id] || UKRAINE_SPECS[id];
  MODEL_SOURCE[id] = MODEL_SOURCE[id] || { source: 'procedural' };
  if (!ALL_TANK_IDS.includes(id)) ALL_TANK_IDS.push(id);
}
