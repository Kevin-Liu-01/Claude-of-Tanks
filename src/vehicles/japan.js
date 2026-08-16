// Japanese armored-family gameplay/spec registration. Owner-supplied GLBs
// are external visual/metric oracles only; playable geometry is authored in
// profiles/japan.js from first-party procedural donors and primitives.

import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.js';

export const JAPAN_IDS = Object.freeze(['stb1', 'type90a', 'type10b']);

function variant(id, donorId, options) {
  const donor = TANK_SPECS[donorId];
  if (!donor) throw new Error(`Japanese family donor missing: ${donorId}`);
  const spec = structuredClone(donor);
  spec.id = id;
  spec.name = options.name;
  spec.nation = 'Japan';
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

export const JAPAN_SPECS = {
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
    stats: { hp: 2350, enginePowerHp: 1500, weightTons: 52.0, topSpeedKmh: 70,
      reverseSpeedKmh: 42, turretTraverseDegS: 40, gunPitchDegS: 34 },
    reloadS: 5.2, shellName: 'Type 10 APFSDS', armorFactor: 1.12,
  }),
  type10b: variant('type10b', 'type10', {
    name: 'Type 10B', number: '10-B', scheme: 'stripes',
    base: '#3a4937', weather: '#59604b', patches: ['#243026', '#65583b', '#7a7054'],
    camoScale: 0.40,
    dims: { hullLengthM: 6.83, overallLengthM: 9.49, widthM: 3.24, heightM: 2.58 },
    stats: { hp: 2450, enginePowerHp: 1200, weightTons: 48.0, topSpeedKmh: 70,
      reverseSpeedKmh: 45, turretTraverseDegS: 46, gunPitchDegS: 38 },
    reloadS: 4.7, shellName: 'Type 10 Kai APFSDS', armorFactor: 1.16,
  }),
};

for (const id of JAPAN_IDS) {
  TANK_SPECS[id] = TANK_SPECS[id] || JAPAN_SPECS[id];
  MODEL_SOURCE[id] = MODEL_SOURCE[id] || { source: 'procedural' };
  if (!ALL_TANK_IDS.includes(id)) ALL_TANK_IDS.push(id);
}
