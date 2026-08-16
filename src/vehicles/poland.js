// Polish armored-family gameplay/spec registration. The owner-supplied GLBs
// remain external visual and metric oracles; all playable geometry is the
// first-party procedural work in profiles/poland.js.

import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.js';

export const POLAND_IDS = Object.freeze(['t72m1_jaguar', 'pt91_twardy', 'pl01']);

function variant(id, donorId, options) {
  const donor = TANK_SPECS[donorId];
  if (!donor) throw new Error(`Polish family donor missing: ${donorId}`);
  const spec = structuredClone(donor);
  spec.id = id;
  spec.name = options.name;
  spec.nation = 'Poland';
  spec.era = 'modern';
  spec.class = 'mbt';
  spec.variantOf = donorId;
  delete spec.community;
  Object.assign(spec, options.stats || {});
  if (Number.isFinite(options.reloadS)) spec.gun.reloadS = options.reloadS;
  if (options.shellName && spec.gun?.shells?.[0]) spec.gun.shells[0].name = options.shellName;
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

export const POLAND_SPECS = {
  t72m1_jaguar: variant('t72m1_jaguar', 't72b_1987', {
    name: 'T-72M1 Jaguar', number: 'PL-721', scheme: 'woodland',
    base: '#39453a', weather: '#505b4a', patches: ['#202820', '#665b43', '#77705a'],
    camoScale: 0.48,
    dims: { hullLengthM: 6.95, overallLengthM: 9.53, widthM: 3.59, heightM: 2.36 },
    stats: { hp: 1850, enginePowerHp: 1000, weightTons: 45.5, topSpeedKmh: 60,
      reverseSpeedKmh: 18, turretTraverseDegS: 34, gunPitchDegS: 27 },
    reloadS: 7.1, shellName: 'Pronit APFSDS', armorFactor: 1.06,
  }),
  pt91_twardy: variant('pt91_twardy', 'pt91m', {
    name: 'PT-91A Twardy', number: 'PT-91', scheme: 'stripes',
    base: '#34453a', weather: '#4b5747', patches: ['#222b24', '#5b5843', '#77664a'],
    camoScale: 0.46,
    dims: { hullLengthM: 6.86, overallLengthM: 9.67, widthM: 3.59, heightM: 2.19 },
    stats: { hp: 2150, enginePowerHp: 1000, weightTons: 47.5, topSpeedKmh: 60,
      reverseSpeedKmh: 20, turretTraverseDegS: 36, gunPitchDegS: 29 },
    reloadS: 6.8, shellName: 'Pronit 125 APFSDS', armorFactor: 1.08,
  }),
  pl01: variant('pl01', 'k2', {
    name: 'PL-01', number: 'PL-01', scheme: 'digital',
    base: '#313b38', weather: '#47504a', patches: ['#202725', '#4e5750', '#67685e'],
    camoScale: 0.36,
    dims: { hullLengthM: 7.00, overallLengthM: 9.20, widthM: 3.80, heightM: 2.80 },
    stats: { hp: 2300, enginePowerHp: 1000, weightTons: 35.0, topSpeedKmh: 70,
      reverseSpeedKmh: 30, turretTraverseDegS: 44, gunPitchDegS: 36 },
    reloadS: 5.4, shellName: 'DM63A1 APFSDS', armorFactor: 1.10,
  }),
};

for (const id of POLAND_IDS) {
  TANK_SPECS[id] = TANK_SPECS[id] || POLAND_SPECS[id];
  MODEL_SOURCE[id] = MODEL_SOURCE[id] || { source: 'procedural' };
  if (!ALL_TANK_IDS.includes(id)) ALL_TANK_IDS.push(id);
}
