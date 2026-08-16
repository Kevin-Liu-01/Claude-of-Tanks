// Chinese family gameplay/spec registration.  Geometry lives in
// profiles/china.js; these rows inherit certified armor/module structures so
// generated hitboxes and articulation stay coherent with their donor tanks.

import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.js';

export const CHINA_IDS = Object.freeze(['ztz85_iii', 'ztz99a2']);

function variant(id, donorId, options) {
  const donor = TANK_SPECS[donorId];
  if (!donor) throw new Error(`Chinese family donor missing: ${donorId}`);
  const spec = structuredClone(donor);
  spec.id = id;
  spec.name = options.name;
  spec.nation = 'China';
  spec.era = 'modern';
  spec.class = 'mbt';
  spec.variantOf = donorId;
  delete spec.community;
  Object.assign(spec, options.stats || {});
  if (Number.isFinite(options.reloadS)) spec.gun.reloadS = options.reloadS;
  spec.visual = {
    ...spec.visual,
    scheme: 'digital',
    base: options.base,
    weather: options.weather,
    patches: options.patches,
    marking: 'number',
    number: options.number,
    camoScale: options.camoScale,
  };
  if (options.dims) spec.dims = { ...spec.dims, ...options.dims };
  if (options.armorFactor) {
    for (const plate of [...spec.armor.hullPlates, ...spec.armor.turretPlates]) {
      if (plate.kind === 'external') continue;
      plate.keMm = Math.round(plate.keMm * options.armorFactor);
      plate.ceMm = Math.round(plate.ceMm * options.armorFactor);
    }
  }
  return spec;
}

export const CHINA_SPECS = {
  ztz85_iii: variant('ztz85_iii', 'type59', {
    name: 'ZTZ-85-III', number: '85-III', base: '#35483a', weather: '#4a5947',
    patches: ['#263229', '#59634c', '#736a4d'], camoScale: 0.50,
    dims: { hullLengthM: 6.40, overallLengthM: 9.82, widthM: 3.45, heightM: 2.45 },
    stats: {
      hp: 1950, enginePowerHp: 1000, weightTons: 43.7, topSpeedKmh: 57,
      reverseSpeedKmh: 15, turretTraverseDegS: 34,
      gunPitchDegS: 27, gunElevationDeg: 14, gunDepressionDeg: 6,
    },
    armorFactor: 1.14,
  }),
  ztz99a2: variant('ztz99a2', 'type99a', {
    name: 'ZTZ-99A2', number: '99A2', base: '#36463a', weather: '#4c5a49',
    patches: ['#232f28', '#5e654d', '#766b52'], camoScale: 0.43,
    dims: { hullLengthM: 7.76, overallLengthM: 11.66, widthM: 3.82, heightM: 3.24 },
    stats: {
      hp: 2750, enginePowerHp: 1500, weightTons: 58.0, topSpeedKmh: 70,
      reverseSpeedKmh: 28, turretTraverseDegS: 42, gunPitchDegS: 34,
    },
    reloadS: 6.4,
    armorFactor: 1.12,
  }),
};

for (const id of CHINA_IDS) {
  TANK_SPECS[id] = TANK_SPECS[id] || CHINA_SPECS[id];
  MODEL_SOURCE[id] = MODEL_SOURCE[id] || { source: 'procedural' };
  if (!ALL_TANK_IDS.includes(id)) ALL_TANK_IDS.push(id);
}
