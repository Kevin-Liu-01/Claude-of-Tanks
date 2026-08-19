// Korean armored-family gameplay/spec registration (first-party expansion).
//
// K2B (§5.299): the pre-§5.248-wave PL-01 spec row resurrected as a NEW
// Korean fleet id on the K2 donor frame. The variant machinery and every
// delta below are verbatim from the pre-wave row (source of truth:
// `git show d7ba844f^:src/vehicles/poland.js`, pl01: variant('pl01','k2',…))
// with the identity re-flagged: id k2b, name/number K2B, nation South Korea
// (the donor's own nation string — one garage tab with k2/k1a1). All playable
// geometry is the first-party procedural work in profiles/korea.js.

import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.js';

const KOREA_IDS = Object.freeze(['k2b']);

function variant(id, donorId, options) {
  const donor = TANK_SPECS[donorId];
  if (!donor) throw new Error(`Korean family donor missing: ${donorId}`);
  const spec = structuredClone(donor);
  spec.id = id;
  spec.name = options.name;
  spec.nation = 'South Korea';
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

const KOREA_SPECS = {
  // Pre-§5.248 pl01 deltas verbatim (dims/stats/reload/shell/armorFactor and
  // the digital scheme palette); the donor rig (turret/gun pivots, barrel)
  // stays the certified K2 clone, exactly as the old row inherited it.
  k2b: variant('k2b', 'k2', {
    name: 'K2B', number: 'K2B', scheme: 'digital',
    base: '#313b38', weather: '#47504a', patches: ['#202725', '#4e5750', '#67685e'],
    camoScale: 0.36,
    dims: { hullLengthM: 7.00, overallLengthM: 9.20, widthM: 3.80, heightM: 2.80 },
    stats: { hp: 2300, enginePowerHp: 1000, weightTons: 35.0, topSpeedKmh: 70,
      reverseSpeedKmh: 30, turretTraverseDegS: 44, gunPitchDegS: 36 },
    reloadS: 5.4, shellName: 'DM63A1 APFSDS', armorFactor: 1.10,
  }),
};

for (const id of KOREA_IDS) {
  TANK_SPECS[id] = TANK_SPECS[id] || KOREA_SPECS[id];
  MODEL_SOURCE[id] = MODEL_SOURCE[id] || { source: 'procedural' };
  if (!ALL_TANK_IDS.includes(id)) ALL_TANK_IDS.push(id);
}
