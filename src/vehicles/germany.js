// German Leopard derivative registration. Owner-supplied GLBs stay outside
// the project and are used only for comparison; all playable geometry is the
// first-party procedural work in profiles/germany.js.

import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.js';

export const GERMANY_IDS = Object.freeze(['leo2a4_otco', 'leo2a4m', 'leo2a6m']);

function variant(id, donorId, options) {
  const donor = TANK_SPECS[donorId];
  if (!donor) throw new Error(`German family donor missing: ${donorId}`);
  const spec = structuredClone(donor);
  spec.id = id;
  spec.name = options.name;
  spec.nation = 'Germany';
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
    for (const armor of [...spec.armor.hullPlates, ...spec.armor.turretPlates]) {
      if (armor.kind === 'external') continue;
      armor.keMm = Math.round(armor.keMm * options.armorFactor);
      armor.ceMm = Math.round(armor.ceMm * options.armorFactor);
    }
  }
  return spec;
}

export const GERMANY_SPECS = {
  leo2a4_otco: variant('leo2a4_otco', 'leo2a4', {
    name: 'Leopard 2A4 OTCO', number: 'OTCO', scheme: 'stripes',
    base: '#4b5140', weather: '#666a57', patches: ['#2d3328', '#665a42', '#77725e'],
    camoScale: 0.44,
    dims: { hullLengthM: 7.72, overallLengthM: 9.67, widthM: 3.70, heightM: 2.90 },
    stats: { hp: 2250, enginePowerHp: 1500, weightTons: 56.0, topSpeedKmh: 68,
      reverseSpeedKmh: 31, turretTraverseDegS: 36, gunPitchDegS: 31 },
    reloadS: 6.1, shellName: 'DM53 APFSDS', armorFactor: 1.08,
  }),
  leo2a4m: variant('leo2a4m', 'leo2a4', {
    name: 'Leopard 2A4M', number: 'A4M', scheme: 'stripes',
    base: '#4a5141', weather: '#656b58', patches: ['#2b3329', '#625941', '#77705b'],
    camoScale: 0.42,
    dims: { hullLengthM: 7.72, overallLengthM: 9.96, widthM: 4.07, heightM: 2.75 },
    stats: { hp: 2450, enginePowerHp: 1500, weightTons: 61.8, topSpeedKmh: 68,
      reverseSpeedKmh: 31, turretTraverseDegS: 38, gunPitchDegS: 32 },
    reloadS: 5.9, shellName: 'DM53A1 APFSDS', armorFactor: 1.22,
  }),
  leo2a6m: variant('leo2a6m', 'leo2a6', {
    name: 'Leopard 2A6M', number: 'A6M', scheme: 'stripes',
    base: '#48503f', weather: '#626956', patches: ['#293128', '#605640', '#746d58'],
    camoScale: 0.40,
    dims: { hullLengthM: 7.72, overallLengthM: 10.97, widthM: 4.24, heightM: 3.03 },
    stats: { hp: 2600, enginePowerHp: 1500, weightTons: 64.1, topSpeedKmh: 68,
      reverseSpeedKmh: 31, turretTraverseDegS: 40, gunPitchDegS: 34 },
    reloadS: 5.7, shellName: 'DM63 APFSDS', armorFactor: 1.27,
  }),
};

for (const id of GERMANY_IDS) {
  TANK_SPECS[id] = TANK_SPECS[id] || GERMANY_SPECS[id];
  MODEL_SOURCE[id] = MODEL_SOURCE[id] || { source: 'procedural' };
  if (!ALL_TANK_IDS.includes(id)) ALL_TANK_IDS.push(id);
}
