// Japanese armored-family gameplay/spec registration. Owner-supplied GLBs
// are external visual/metric oracles only; playable geometry is authored in
// profiles/japan.js from first-party procedural donors and primitives.

import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.js';
import './profiles/miscSpecs.js';
import { TYPE10_GUN_SEAT } from './profiles/type10GunSeat.ts';

const JAPAN_IDS = Object.freeze(['stb1', 'type90a', 'type10b']);

function scaleFightingArmor(spec, factor) {
  for (const plate of [...spec.armor.hullPlates, ...spec.armor.turretPlates]) {
    if (plate.kind === 'external') continue;
    plate.keMm = Math.round(plate.keMm * factor);
    plate.ceMm = Math.round(plate.ceMm * factor);
  }
}

function variant(id, donorId, options) {
  const donor = TANK_SPECS[donorId];
  if (!donor) throw new Error(`Japanese family donor missing: ${donorId}`);
  const spec = structuredClone(donor);
  spec.id = id;
  spec.name = options.name;
  spec.nation = 'Japan';
  spec.era = 'modern';
  spec.role = 'mbt';
  spec.variantOf = donorId;
  delete spec.community;
  Object.assign(spec, options.stats || {});
  if (Number.isFinite(options.reloadS)) spec.gun.reloadS = options.reloadS;
  if (options.shellName && spec.gun?.shells?.[0]) spec.gun.shells[0].name = options.shellName;
  if (options.gun) spec.gun = { ...spec.gun, ...options.gun };
  if (options.primaryShell && spec.gun?.shells?.[0]) {
    spec.gun.shells[0] = { ...spec.gun.shells[0], ...options.primaryShell };
  }
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
  if (options.armorFactor) scaleFightingArmor(spec, options.armorFactor);
  return spec;
}

// The Japanese MBT line is intentionally split into two matchmaking bands:
// Type 90 / 90A are mobile three-round Tier IX autoloaders, while Type 10 /
// 10B are Tier X single-shot vehicles with stronger fire control, ammunition,
// durability and composite protection. Keep the base rows explicit here so
// the A/B derivatives clone the same canonical balance ladder.
{
  const type90 = TANK_SPECS.type90;
  Object.assign(type90, {
    hp: 2250,
    enginePowerHp: 1500,
    reverseSpeedKmh: 25,
    hullTraverseDegS: 44,
    turretTraverseDegS: 40,
    gunPitchDegS: 30,
  });
  Object.assign(type90.gun, {
    reloadS: 18.5,
    baseAccuracy: 0.30,
    aimTimeS: 1.8,
    autoloader: { magazineSize: 3, intraClipS: 2.2, fullReloadS: 18.5 },
  });
  Object.assign(type90.gun.shells[0], {
    name: 'JM33 APFSDS', dmg: 500,
    pen100Mm: 806, pen1000Mm: 733, pen2000Mm: 660,
  });

  const type10 = TANK_SPECS.type10;
  Object.assign(type10, {
    hp: 2550,
    reverseSpeedKmh: 35,
    hullTraverseDegS: 48,
    turretTraverseDegS: 46,
    gunPitchDegS: 36,
  });
  Object.assign(type10.gun, {
    reloadS: 5.2,
    baseAccuracy: 0.27,
    aimTimeS: 1.5,
  });
  delete type10.gun.autoloader;
  Object.assign(type10.gun.shells[0], {
    name: 'Type 10 APFSDS', dmg: 540,
    pen100Mm: 891, pen1000Mm: 811, pen2000Mm: 730,
  });
  scaleFightingArmor(type10, 1.12);
}

const JAPAN_SPECS = {
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
    stats: { hp: 2400, enginePowerHp: 1500, weightTons: 52.0, topSpeedKmh: 70,
      reverseSpeedKmh: 30, hullTraverseDegS: 46, turretTraverseDegS: 42,
      gunPitchDegS: 34 },
    gun: {
      reloadS: 17.0, baseAccuracy: 0.29, aimTimeS: 1.65,
      autoloader: { magazineSize: 3, intraClipS: 2.0, fullReloadS: 17.0 },
    },
    primaryShell: {
      name: 'Type 10 APFSDS', dmg: 510,
      pen100Mm: 855, pen1000Mm: 778, pen2000Mm: 700,
    },
    armorFactor: 1.12,
  }),
  type10b: variant('type10b', 'type10', {
    name: 'Type 10B', number: '10-B', scheme: 'stripes',
    base: '#3a4937', weather: '#59604b', patches: ['#243026', '#65583b', '#7a7054'],
    camoScale: 0.40,
    // §5.336 owner-decreed ×1.10 enlargement (rides the rebuilt shared base;
    // §5.304-class divergence documented in the type10 spec row).
    dims: { hullLengthM: 7.513, overallLengthM: 10.439, widthM: 3.564, heightM: 2.838 },
    stats: { hp: 2700, enginePowerHp: 1200, weightTons: 48.0, topSpeedKmh: 70,
      reverseSpeedKmh: 45, hullTraverseDegS: 50, turretTraverseDegS: 48,
      gunPitchDegS: 40 },
    gun: { reloadS: 4.7, baseAccuracy: 0.25, aimTimeS: 1.35 },
    primaryShell: {
      name: 'Type 10 Kai APFSDS', dmg: 550,
      pen100Mm: 916, pen1000Mm: 833, pen2000Mm: 750,
    },
    armorFactor: 1.08,
  }),
};

for (const id of JAPAN_IDS) {
  TANK_SPECS[id] = TANK_SPECS[id] || JAPAN_SPECS[id];
  MODEL_SOURCE[id] = MODEL_SOURCE[id] || { source: 'procedural' };
  if (!ALL_TANK_IDS.includes(id)) ALL_TANK_IDS.push(id);
}

// --- Type 10 pair live rig seats -------------------------------------------
// Keep the donor armor row byte-stable for Type 90 cloning, then apply the
// live Type 10 / Type 10B rig seats post-clone. Gallery surface markup places
// the gun-owned mantlet rear plane 0.759 m behind the turret attachment area;
// this shared pivot centers it in the throat and restores the authored 1.991 m
// bore height. The builder compensates the tube run to preserve the certified
// muzzle station and overall length.
{
  const TYPE10_PAIR_RIG = Object.freeze({
    turretPivot: [0, 1.8027777777777776, 0.2713333333333332],
    gunPivot: TYPE10_GUN_SEAT.turretLocalPivot,
  });
  for (const id of ['type10', 'type10b']) {
    const armor = TANK_SPECS[id]?.armor;
    if (!armor) throw new Error(`type10 pair rig re-auth: ${id} spec missing`);
    armor.turretPivot = TYPE10_PAIR_RIG.turretPivot.slice();
    armor.gunPivot = TYPE10_PAIR_RIG.gunPivot.slice();
  }
}
