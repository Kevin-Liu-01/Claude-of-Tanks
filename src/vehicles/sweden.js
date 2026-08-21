// Swedish family gameplay/spec registration. Geometry lives in
// profiles/sweden.js and the supplied GLBs remain external visual oracles.

import {
  TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS, fitArmorToDims,
} from './specs.js';

const SWEDEN_IDS = Object.freeze(['strv81', 'udes03', 'strv103a', 'strv122']);

function siegeGun({
  name, reloadS, accuracy, aimTimeS, damage,
  apcrPen, apcrPenFar, heatPen, velocityMps, heDamage,
}) {
  const gun = structuredClone(TANK_SPECS.strv103.gun);
  gun.reloadS = reloadS;
  gun.baseAccuracy = accuracy;
  gun.aimTimeS = aimTimeS;
  gun.shells[0] = {
    ...gun.shells[0],
    name: `${name} APDS`, pen100Mm: apcrPen, pen1000Mm: apcrPenFar,
    dmg: damage, velocityMps,
  };
  gun.shells[1] = {
    ...gun.shells[1],
    name: `${name} HEAT`, pen100Mm: heatPen, pen1000Mm: heatPen,
    dmg: damage,
  };
  gun.shells[2] = {
    ...gun.shells[2],
    name: `${name} HE`, dmg: heDamage,
  };
  return gun;
}

function variant(id, donorId, options) {
  const donor = TANK_SPECS[donorId];
  if (!donor) throw new Error(`Swedish family donor missing: ${donorId}`);
  const donorDims = { ...donor.dims };
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
  if (options.dims) {
    spec.dims = { ...spec.dims, ...options.dims };
    if (options.fitArmor) fitArmorToDims(spec.armor, donorDims, spec.dims);
  }
  if (options.armorFactor) {
    scaleArmorRatings(spec, options.armorFactor);
  }
  return spec;
}

function scaleArmorRatings(spec, factor) {
  for (const armor of [...spec.armor.hullPlates, ...spec.armor.turretPlates]) {
    if (armor.kind === 'external') continue;
    armor.keMm = Math.round(armor.keMm * factor);
    armor.ceMm = Math.round(armor.ceMm * factor);
  }
  return spec;
}

function enforceTurretlessArmor(spec) {
  spec.armor.turretless = true;
  spec.armor.turretPlates = [];
  return spec;
}

const SWEDEN_SPECS = {
  strv81: variant('strv81', 'centurion3', {
    name: 'Strv 81', number: '81', scheme: 'woodland',
    base: '#39483b', weather: '#4f5948', patches: ['#263129', '#62634a', '#74664c'],
    camoScale: 0.55,
    dims: { hullLengthM: 7.82, overallLengthM: 9.85, widthM: 3.39, heightM: 3.01 },
    stats: { hp: 1450, enginePowerHp: 650, weightTons: 51.8, topSpeedKmh: 35,
      reverseSpeedKmh: 12, turretTraverseDegS: 24, gunPitchDegS: 20 },
    reloadS: 7.1,
    armorFactor: 1.05,
  }),
  // UDES 03: compact 17-ton hydraulic test-bed and the dedicated Tier VIII
  // entry to the Swedish siege-TD line. The supplied image is treated only
  // as a silhouette/detail oracle; runtime geometry is entirely procedural.
  udes03: variant('udes03', 'strv103', {
    name: 'UDES 03', number: '03', class: 'td', scheme: 'solid',
    base: '#45513f', weather: '#55614d', patches: [],
    camoScale: 0.46,
    dims: { hullLengthM: 5.91, overallLengthM: 7.65, widthM: 2.85, heightM: 1.90 },
    fitArmor: true,
    stats: {
      hp: 1400,
      enginePowerHp: 340, weightTons: 17.5, topSpeedKmh: 72, reverseSpeedKmh: 52,
      hullTraverseDegS: 48,
      terrainResistance: { hard: 0.66, medium: 0.82, soft: 1.28 },
      turretTraverseDegS: 32, gunPitchDegS: 30,
      gunElevationDeg: 20, gunDepressionDeg: 14, gunArcDeg: 3,
      hydropneumaticAim: {
        noseDownDeg: 14, noseUpDeg: 20, rateDegS: 12,
        compressionM: 0.50, droopM: 0.50,
      },
      gun: siegeGun({
        name: '10,5 cm kan m/59', reloadS: 6.8, accuracy: 0.23, aimTimeS: 1.4,
        damage: 400, apcrPen: 300, apcrPenFar: 278, heatPen: 340,
        velocityMps: 1420, heDamage: 500,
      }),
    },
    armorFactor: 0.50,
  }),
  // Strv 103A (§5.317 lane J): the initial-production S-Tank (1967-70,
  // 70 built) ahead of the resident 103B. Same fixed 105 mm L74 and hull,
  // the weaker first engine pairing (Rolls-Royce K60 240 hp diesel +
  // Boeing 502-10MA ~300 shp gas turbine vs the B's Caterpillar 553 fit),
  // 37.0 t vs 39.7. No flotation screens, no standard dozer blade, simpler
  // rear deck — the visual distinctions live in profiles/sweden.js.
  // Tier IX now sits between the UDES 03 and 103B. Published A dims: hull
  // 7.04, overall 8.99 (gun
  // forward), width 3.60 bare hull (B's 3.63 includes flotation gear),
  // height 2.14. Plain 1960s Swedish olive, pre-splinter.
  strv103a: variant('strv103a', 'strv103', {
    name: 'Strv 103A', number: '103A', class: 'td', scheme: 'solid',
    base: '#46503b', weather: '#525a44', patches: [],
    camoScale: 0.5,
    dims: { hullLengthM: 7.04, overallLengthM: 8.99, widthM: 3.60, heightM: 2.14 },
    stats: {
      hp: 1800,
      enginePowerHp: 650, weightTons: 37.0, topSpeedKmh: 58, reverseSpeedKmh: 44,
      hullTraverseDegS: 48,
      terrainResistance: { hard: 0.62, medium: 0.78, soft: 1.20 },
      turretTraverseDegS: 38, gunPitchDegS: 34,
      gunElevationDeg: 12, gunDepressionDeg: 13, gunArcDeg: 4,
      hydropneumaticAim: {
        noseDownDeg: 13, noseUpDeg: 12, rateDegS: 10,
        compressionM: 0.44, droopM: 0.44,
      },
      gun: siegeGun({
        name: '10,5 cm kan Strv 103 L/74', reloadS: 5.4, accuracy: 0.21, aimTimeS: 1.25,
        damage: 420, apcrPen: 320, apcrPenFar: 298, heatPen: 360,
        velocityMps: 1530, heDamage: 540,
      }),
    },
    armorFactor: 1.25,
  }),
  strv122: variant('strv122', 'leo2a5', {
    name: 'Strv 122', number: '122', scheme: 'splinter',
    base: '#34493c', weather: '#4b5b4c', patches: ['#202b26', '#5c644c', '#81745a'],
    camoScale: 0.42,
    dims: { hullLengthM: 7.72, overallLengthM: 9.97, widthM: 3.75, heightM: 3.02 },
    stats: { hp: 2850, enginePowerHp: 1500, weightTons: 62.5, topSpeedKmh: 68,
      reverseSpeedKmh: 31, turretTraverseDegS: 38, gunPitchDegS: 32 },
    reloadS: 6.0,
    armorFactor: 1.14,
  }),
};

// These hull-aimed vehicles have no rotating turret volume. The generic donor
// retains turret plates for conventional tanks, so remove them explicitly to
// prevent invisible hit surfaces and floating armor boxes in technical views.
enforceTurretlessArmor(SWEDEN_SPECS.udes03);
enforceTurretlessArmor(SWEDEN_SPECS.strv103a);

// Upgrade the existing generic Strv 103 registration to the supplied 103B
// identity while keeping its stable public ID and saves/protocol key.
if (TANK_SPECS.strv103) {
  Object.assign(TANK_SPECS.strv103, {
    name: 'Strv 103B', nation: 'Sweden', hp: 2400,
    enginePowerHp: 900, weightTons: 39.7, topSpeedKmh: 65, reverseSpeedKmh: 50,
    hullTraverseDegS: 54,
    terrainResistance: { hard: 0.55, medium: 0.70, soft: 1.08 },
    turretTraverseDegS: 44, gunPitchDegS: 40,
    gunElevationDeg: 12, gunDepressionDeg: 13, gunArcDeg: 4,
    hydropneumaticAim: {
      noseDownDeg: 13, noseUpDeg: 12, rateDegS: 11,
      compressionM: 0.46, droopM: 0.46,
    },
    gun: siegeGun({
      name: '10,5 cm kan Strv 103 L/74B', reloadS: 4.4, accuracy: 0.18, aimTimeS: 1.05,
      damage: 440, apcrPen: 350, apcrPenFar: 326, heatPen: 390,
      velocityMps: 1600, heDamage: 580,
    }),
  });
  scaleArmorRatings(TANK_SPECS.strv103, 1.60);
  delete TANK_SPECS.strv103.community;
  TANK_SPECS.strv103.visual = {
    ...TANK_SPECS.strv103.visual,
    scheme: 'splinter', base: '#384b3d', weather: '#4e5b49',
    patches: ['#263329', '#62644b', '#776b50'], marking: 'number',
    number: '103B', camoScale: 0.48,
  };
  enforceTurretlessArmor(TANK_SPECS.strv103);
  MODEL_SOURCE.strv103 = { source: 'procedural' };
}

for (const id of SWEDEN_IDS) {
  TANK_SPECS[id] = TANK_SPECS[id] || SWEDEN_SPECS[id];
  MODEL_SOURCE[id] = MODEL_SOURCE[id] || { source: 'procedural' };
  if (!ALL_TANK_IDS.includes(id)) ALL_TANK_IDS.push(id);
}
