// Polish armored-family gameplay/spec registration. The owner-supplied GLBs
// remain external visual and metric oracles; all playable geometry is the
// first-party procedural work in profiles/poland.js.

import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.js';

const POLAND_IDS = Object.freeze(['t72m1_jaguar', 'pt91_twardy', 'pl01', 'pl01_105']);

function variant(id, donorId, options) {
  const donor = TANK_SPECS[donorId];
  if (!donor) throw new Error(`Polish family donor missing: ${donorId}`);
  const spec = structuredClone(donor);
  spec.id = id;
  spec.name = options.name;
  spec.nation = 'Poland';
  spec.era = 'modern';
  spec.role = 'mbt';
  spec.variantOf = donorId;
  delete spec.community;
  Object.assign(spec, options.stats || {});
  if (Number.isFinite(options.reloadS)) spec.gun.reloadS = options.reloadS;
  if (options.autoloader) spec.gun.autoloader = { ...options.autoloader };
  if (options.shellName && spec.gun?.shells?.[0]) spec.gun.shells[0].name = options.shellName;
  if (options.dims) spec.dims = { ...spec.dims, ...options.dims };
  // §5.248 ground-up builds own their rigs: measured turret ring / gun
  // trunnion seats and published-overall muzzle lengths (the shadow-proxy
  // §C law sizes proxies from armor.gunBarrel — keep it the visual truth).
  if (options.turretPivot) spec.armor.turretPivot = options.turretPivot;
  if (options.gunPivot) spec.armor.gunPivot = options.gunPivot;
  if (options.gunBarrel) Object.assign(spec.armor.gunBarrel, options.gunBarrel);
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

const POLAND_SPECS = {
  t72m1_jaguar: variant('t72m1_jaguar', 't72b_1987', {
    name: 'T-72M1 Jaguar', number: 'PL-721', scheme: 'woodland',
    base: '#39453a', weather: '#505b4a', patches: ['#202820', '#665b43', '#77705a'],
    camoScale: 0.48,
    // §5.248 spec true-up (poland round 1) to the landed REG bracket
    // (tools/vertex-extract.mjs t72m1_jaguar pubDims): T-72M1 carries the
    // classic T-72 body — hull 6.86 (not the 6.95 PT-91 figure) and height
    // 2.23 to the roof (2.36 was a with-AAMG figure; the gate's p95 law
    // measures the roof plane).
    dims: { hullLengthM: 6.86, overallLengthM: 9.53, widthM: 3.59, heightM: 2.23 },
    // Measured T-72M1/Jaguar rig: gun axis 1.64 m
    // (turret 1.40 + trunnion 0.24); the 5.74 m tube lands the muzzle on the
    // published overall line without moving the turret off its ring.
    turretPivot: [0, 1.40, -0.02], gunPivot: [0, 0.24, 0.52],
    gunBarrel: { lengthM: 5.74, radiusM: 0.112 },
    stats: { hp: 1850, enginePowerHp: 1000, weightTons: 45.5, topSpeedKmh: 60,
      reverseSpeedKmh: 18, turretTraverseDegS: 34, gunPitchDegS: 27 },
    reloadS: 7.1, shellName: 'Pronit APFSDS', armorFactor: 1.06,
  }),
  pt91_twardy: variant('pt91_twardy', 'pt91m', {
    name: 'PT-91A Twardy', number: 'PT-91', scheme: 'stripes',
    base: '#34453a', weather: '#4b5747', patches: ['#222b24', '#5b5843', '#77664a'],
    camoScale: 0.46,
    // §5.248 spec true-up (poland round 1) to the landed REG bracket
    // (tools/vertex-extract.mjs pt91_twardy pubDims): PT-91 hull is the
    // stretched 6.95 figure (Bumar-Łabędy data; the 6.86 was the T-72M1
    // donor's), overall 9.67 gun forward.
    dims: { hullLengthM: 6.95, overallLengthM: 9.67, widthM: 3.59, heightM: 2.19 },
    // measured rig (§5.248 rebuild): gun axis 1.70 (pivot 1.38+0.32), muzzle
    // world 6.25 = rear drums -3.42 + published overall 9.67
    turretPivot: [0, 1.38, 0.02], gunPivot: [0, 0.32, 0.50],
    gunBarrel: { lengthM: 5.73, radiusM: 0.115 },
    stats: { hp: 2150, enginePowerHp: 1000, weightTons: 47.5, topSpeedKmh: 60,
      reverseSpeedKmh: 20, turretTraverseDegS: 36, gunPitchDegS: 29 },
    reloadS: 6.8, shellName: 'Pronit 125 APFSDS', armorFactor: 1.08,
  }),
  pl01: variant('pl01', 'k2', {
    name: 'PL-01', number: 'PL-01', scheme: 'digital',
    base: '#313b38', weather: '#47504a', patches: ['#202725', '#4e5750', '#67685e'],
    camoScale: 0.36,
    // §5.248 spec true-up (owner brief "overall 9.20 -> ~8.96, apply with
    // sources" + the landed REG bracket in tools/vertex-extract.mjs): the
    // OBRUM/army-technology concept sheet gives 8.96 m overall / 6.95 m hull
    // / 3.80 m wide; height 2.80 is the REG-resolved vehicle figure (the print's
    // own hull is 6.95 native EXACT at that bracket). The old 9.20/7.00 pair
    // was the donor-clone estimate.
    dims: { hullLengthM: 6.95, overallLengthM: 8.96, widthM: 3.80, heightM: 2.80 },
    // Low-profile r3 rig: the 0.60-scale structural turret is exactly 20%
    // taller than the approved half-height redesign. The gun axis follows
    // that nose and remains buried in the connected thermal sleeve.
    turretPivot: [0, 2.07, -0.90], gunPivot: [0, 0.216, 1.45],
    gunBarrel: { lengthM: 4.71, radiusM: 0.098 },
    stats: { hp: 2300, enginePowerHp: 1000, weightTons: 35.0, topSpeedKmh: 70,
      reverseSpeedKmh: 30, turretTraverseDegS: 44, gunPitchDegS: 36 },
    reloadS: 20.0,
    autoloader: { magazineSize: 3, intraClipS: 2.4, fullReloadS: 20.0 },
    shellName: 'DM63A1 APFSDS', armorFactor: 1.10,
  }),
};

// OBRUM's modular fire-support turret was offered around both 120 mm and
// 105 mm autoloading guns. The 105 keeps the same low-observable hull and
// turret family while trading single-shot damage for a four-round magazine.
POLAND_SPECS.pl01_105 = (() => {
  const spec = structuredClone(POLAND_SPECS.pl01);
  spec.id = 'pl01_105';
  spec.name = 'PL-01 (105)';
  spec.variantOf = 'pl01';
  // Keep the powered CROWS silhouette distinct from the structural roof.
  spec.dims = { ...spec.dims, silhouetteHeightM: 3.03 };
  spec.gun = {
    ...spec.gun,
    caliberMm: 105,
    reloadS: 18.0,
    autoloader: { magazineSize: 4, intraClipS: 2.0, fullReloadS: 18.0 },
    shells: [
      {
        name: 'DM63 105 APFSDS', type: 'APFSDS', caliberMm: 105,
        pen100Mm: 720, pen1000Mm: 655, pen2000Mm: 590,
        dmg: 400, velocityMps: 1555, moduleDmg: 105, tracer: 'APFSDS',
      },
      {
        name: 'M456A2 HEAT-T', type: 'HEAT', caliberMm: 105,
        pen100Mm: 450, pen1000Mm: 450,
        dmg: 390, velocityMps: 1173, moduleDmg: 105, tracer: 'HEAT',
      },
      {
        name: 'DM12 105 HE', type: 'HE', caliberMm: 105,
        pen100Mm: 40, pen1000Mm: 40,
        dmg: 480, velocityMps: 732, moduleDmg: 105, tracer: 'HE',
      },
    ],
  };
  spec.armor.gunBarrel.radiusM = 0.086;
  spec.visual = { ...spec.visual, number: 'PL-105' };
  return spec;
})();

for (const id of POLAND_IDS) {
  TANK_SPECS[id] = TANK_SPECS[id] || POLAND_SPECS[id];
  MODEL_SOURCE[id] = MODEL_SOURCE[id] || { source: 'procedural' };
  if (!ALL_TANK_IDS.includes(id)) ALL_TANK_IDS.push(id);
}
