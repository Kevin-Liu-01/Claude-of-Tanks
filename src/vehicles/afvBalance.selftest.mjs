/** Regression coverage for the class-wide AFV durability package. */

import './tankFactory.js'; // registers modern roster extension specs
import {
  AFV_DAMAGE_MULTIPLIER, AFV_HP_BONUS, AFV_PENETRATION_MULTIPLIER,
  ALL_TANK_IDS, TANK_SPECS, getSpec,
} from './specs.js';

const afvIds = ALL_TANK_IDS.filter((id) => TANK_SPECS[id] && TANK_SPECS[id].class === 'ifv');
const originalFirepower = new Map(afvIds.map((id) => [id,
  TANK_SPECS[id].gun.shells.map((shell) => ({
    dmg: shell.dmg,
    pen100Mm: shell.pen100Mm,
    pen1000Mm: shell.pen1000Mm,
    pen2000Mm: shell.pen2000Mm,
  })),
]));

const expected = [
  ['m2a2_bradley', 1300, 60],
  ['bmp2', 900, 35],
  ['spz_puma', 1500, 160],
  ['type89', 1200, 45],
];

for (const [id, baseHp, baseFrontKe] of expected) {
  const spec = getSpec(id);
  if (spec.hp !== baseHp + AFV_HP_BONUS) {
    throw new Error(`${id}: expected ${baseHp + AFV_HP_BONUS} HP, got ${spec.hp}`);
  }
  const front = spec.armor.hullPlates.find((p) => p.name === 'upper_glacis');
  if (!front || front.keMm !== baseFrontKe + 45) {
    throw new Error(`${id}: frontal protection package was not applied`);
  }
  const track = spec.armor.hullPlates.find((p) => p.name === 'track_R');
  if (!track || track.keMm !== 20) {
    throw new Error(`${id}: external track protection must remain unchanged`);
  }
  if (getSpec(id).hp !== spec.hp) {
    throw new Error(`${id}: repeated lookup applied the HP bonus twice`);
  }
}

if (!afvIds.includes('fv510')) {
  throw new Error('derived AFV coverage must include FV510 Warrior');
}

{
  const bmp = TANK_SPECS.bmp2;
  const rapidBelts = bmp.gun.shells.filter((shell) => shell.reloadS <= 0.5);
  if (bmp.class !== 'ifv' || bmp.gun.caliberMm !== 30 || rapidBelts.length !== 2) {
    throw new Error('BMP-2 must remain a 30 mm IFV autocannon with rapid APDS and HE-I belts');
  }
}

for (const id of afvIds) {
  const spec = getSpec(id);
  const originals = originalFirepower.get(id);
  for (let i = 0; i < spec.gun.shells.length; i++) {
    const shell = spec.gun.shells[i];
    const original = originals[i];
    if (shell.dmg !== original.dmg * AFV_DAMAGE_MULTIPLIER) {
      throw new Error(`${id}/${shell.name}: damage was not doubled`);
    }
    for (const key of ['pen100Mm', 'pen1000Mm']) {
      if (shell[key] !== original[key] * AFV_PENETRATION_MULTIPLIER) {
        throw new Error(`${id}/${shell.name}: ${key} was not doubled`);
      }
    }
    if (original.pen2000Mm !== undefined
      && shell.pen2000Mm !== original.pen2000Mm * AFV_PENETRATION_MULTIPLIER) {
      throw new Error(`${id}/${shell.name}: pen2000Mm was not doubled`);
    }
  }
  const once = spec.gun.shells.map(
    (shell) => [shell.dmg, shell.pen100Mm, shell.pen1000Mm, shell.pen2000Mm]);
  getSpec(id);
  const twice = spec.gun.shells.map(
    (shell) => [shell.dmg, shell.pen100Mm, shell.pen1000Mm, shell.pen2000Mm]);
  if (JSON.stringify(twice) !== JSON.stringify(once)) {
    throw new Error(`${id}: repeated lookup stacked the firepower multiplier`);
  }
}

for (const [id, missileName] of [
  ['m2a2_bradley', 'BGM-71 TOW-2A'],
  ['bmp2', '9M113M Konkurs-M'],
  ['spz_puma', 'Spike LR'],
  ['type89', 'Type 79 Jyu-MAT'],
]) {
  const missile = getSpec(id).gun.shells.find((shell) => shell.name === missileName);
  if (!missile?.guided) {
    throw new Error(`${id}/${missileName}: guided round must fly the center-reticle line`);
  }
}

{
  const mbt = TANK_SPECS.m1a2;
  const before = mbt.gun.shells.map(
    (shell) => [shell.dmg, shell.pen100Mm, shell.pen1000Mm, shell.pen2000Mm]);
  getSpec('m1a2');
  const after = mbt.gun.shells.map(
    (shell) => [shell.dmg, shell.pen100Mm, shell.pen1000Mm, shell.pen2000Mm]);
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    throw new Error('AFV firepower multiplier leaked into an MBT');
  }
}
