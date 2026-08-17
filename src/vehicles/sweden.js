// Swedish family gameplay/spec registration. Geometry lives in
// profiles/sweden.js and the supplied GLBs remain external visual oracles.

import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.js';

export const SWEDEN_IDS = Object.freeze(['strv81', 'strv122']);

function variant(id, donorId, options) {
  const donor = TANK_SPECS[donorId];
  if (!donor) throw new Error(`Swedish family donor missing: ${donorId}`);
  const spec = structuredClone(donor);
  spec.id = id;
  spec.name = options.name;
  spec.nation = 'Sweden';
  spec.era = options.era || 'modern';
  spec.class = options.class || 'mbt';
  spec.variantOf = donorId;
  delete spec.community;
  Object.assign(spec, options.stats || {});
  if (Number.isFinite(options.reloadS)) spec.gun.reloadS = options.reloadS;
  spec.visual = {
    ...spec.visual,
    scheme: options.scheme || 'nato',
    base: options.base,
    weather: options.weather,
    patches: options.patches,
    marking: 'number',
    number: options.number,
    camoScale: options.camoScale,
  };
  if (options.dims) spec.dims = { ...spec.dims, ...options.dims };
  // §5.248 ground-up builds own their rigs: pivot/barrel patches applied on
  // the CLONE only (donor armor object untouched by structuredClone).
  if (options.armorPatch) Object.assign(spec.armor, options.armorPatch);
  if (options.armorFactor) {
    for (const armor of [...spec.armor.hullPlates, ...spec.armor.turretPlates]) {
      if (armor.kind === 'external') continue;
      armor.keMm = Math.round(armor.keMm * options.armorFactor);
      armor.ceMm = Math.round(armor.ceMm * options.armorFactor);
    }
  }
  return spec;
}

export const SWEDEN_SPECS = {
  strv81: variant('strv81', 'centurion3', {
    name: 'Strv 81', number: '81', scheme: 'woodland',
    base: '#39483b', weather: '#4f5948', patches: ['#263129', '#62634a', '#74664c'],
    camoScale: 0.55,
    // §5.248 ground-up true-up: hullLengthM 7.82 was a donor-clone
    // registration error — the committed centurion3 family value is 7.56
    // (same chassis), and the strv81 print's own hull mask reads 7.565.
    // Overall/width/height stay the Swedish published figures.
    dims: { hullLengthM: 7.56, overallLengthM: 9.85, widthM: 3.39, heightM: 3.01 },
    // Rig matches the §5.248 measured build (ring 1.76/0.35, bore 2.08).
    armorPatch: { turretPivot: [0, 1.76, 0.35], gunPivot: [0, 0.32, 0.75] },
    stats: { hp: 1450, enginePowerHp: 650, weightTons: 51.8, topSpeedKmh: 35,
      reverseSpeedKmh: 12, turretTraverseDegS: 24, gunPitchDegS: 20 },
    reloadS: 7.1,
    armorFactor: 1.05,
  }),
  strv122: variant('strv122', 'leo2a5', {
    name: 'Strv 122', number: '122', scheme: 'splinter',
    base: '#34493c', weather: '#4b5b4c', patches: ['#202b26', '#5c644c', '#81745a'],
    camoScale: 0.42,
    // Rig matches the §5.248 measured build (ring 1.70/-0.30, bore 2.03).
    armorPatch: { turretPivot: [0, 1.70, -0.30], gunPivot: [0, 0.33, 0.90] },
    dims: { hullLengthM: 7.72, overallLengthM: 9.97, widthM: 3.75, heightM: 3.02 },
    stats: { hp: 2850, enginePowerHp: 1500, weightTons: 62.5, topSpeedKmh: 68,
      reverseSpeedKmh: 31, turretTraverseDegS: 38, gunPitchDegS: 32 },
    reloadS: 6.0,
    armorFactor: 1.14,
  }),
};

// Upgrade the existing generic Strv 103 registration to the supplied 103B
// identity while keeping its stable public ID and saves/protocol key.
if (TANK_SPECS.strv103) {
  TANK_SPECS.strv103.name = 'Strv 103B';
  TANK_SPECS.strv103.nation = 'Sweden';
  delete TANK_SPECS.strv103.community;
  TANK_SPECS.strv103.visual = {
    ...TANK_SPECS.strv103.visual,
    scheme: 'splinter', base: '#384b3d', weather: '#4e5b49',
    patches: ['#263329', '#62644b', '#776b50'], marking: 'number',
    number: '103B', camoScale: 0.48,
  };
  MODEL_SOURCE.strv103 = { source: 'procedural' };
}

for (const id of SWEDEN_IDS) {
  TANK_SPECS[id] = TANK_SPECS[id] || SWEDEN_SPECS[id];
  MODEL_SOURCE[id] = MODEL_SOURCE[id] || { source: 'procedural' };
  if (!ALL_TANK_IDS.includes(id)) ALL_TANK_IDS.push(id);
}
