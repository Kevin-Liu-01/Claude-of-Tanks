/** Regression coverage for ordinary, explicit, per-vehicle IFV stats. */

import assert from 'node:assert/strict';
import './tankFactory.ts'; // registers the complete modern roster
import { ALL_TANK_IDS, TANK_SPECS, getSpec } from './specs.js';

const EXPECTED = Object.freeze({
  m2a2_bradley:       { hp: 1650, speed: 61, reverse: 20, traverse: 42, damage: 58, pen: [130, 118, 106], reload: 0.42, sound: 'm242-bushmaster', missile: [540, 'tow-launch'] },
  bmp2:               { hp: 1050, speed: 65, reverse: 12, traverse: 50, damage: 42, pen: [74, 66, 58], reload: 0.28, sound: '2a42', missile: [430, 'konkurs-launch'] },
  spz_puma:           { hp: 2100, speed: 70, reverse: 30, traverse: 46, damage: 70, pen: [180, 164, 148], reload: 0.35, sound: 'mk30-2', missile: [520, 'spike-launch'] },
  type89:             { hp: 1450, speed: 70, reverse: 16, traverse: 46, damage: 82, pen: [112, 100, 88], reload: 0.52, sound: 'kde-35', missile: [500, 'jyu-mat-launch'] },
  fv510:              { hp: 1400, speed: 75, reverse: 20, traverse: 45, damage: 90, pen: [96, 86, 76], reload: 0.75, sound: 'rarden-l21a1', missile: null },
  fv510_milan:        { hp: 1525, speed: 68, reverse: 20, traverse: 43, damage: 84, pen: [96, 86, 76], reload: 0.78, sound: 'rarden-l21a1', missile: [480, 'milan-launch'] },
  bmp3_rok:           { hp: 1550, speed: 70, reverse: 20, traverse: 48, damage: 58, pen: [128, 116, 104], reload: 0.36, sound: '2a72', missile: [470, 'arkan-launch'] },
  ua_m2a3_bradley:    { hp: 1950, speed: 58, reverse: 20, traverse: 40, damage: 64, pen: [142, 128, 116], reload: 0.42, sound: 'm242-bushmaster', missile: [560, 'tow-launch'] },
  bmpt_terminator2:   { hp: 2700, speed: 60, reverse: 18, traverse: 34, damage: 52, pen: [118, 106, 94], reload: 0.30, sound: 'twin-2a42', missile: [540, 'ataka-launch'] },
  bwp1:               { hp: 1850, speed: 68, reverse: 28, traverse: 48, damage: 62, pen: [158, 144, 130], reload: 0.32, sound: 'mk30-2', missile: [580, 'spike-launch'] },
  marder1a3:          { hp: 1250, speed: 65, reverse: 17, traverse: 50, damage: 32, pen: [72, 64, 56], reload: 0.20, sound: 'rh202', missile: [450, 'milan-launch'] },
  m3a3_bradley:       { hp: 2300, speed: 61, reverse: 20, traverse: 44, damage: 70, pen: [185, 170, 155], reload: 0.33, sound: 'm242-bushmaster', missile: [700, 'tow-launch'] },
  bmp3:               { hp: 1450, speed: 70, reverse: 20, traverse: 48, damage: 55, pen: [112, 102, 92], reload: 0.34, sound: '2a72', missile: [500, 'arkan-launch'] },
  upior:              { hp: 1700, speed: 75, reverse: 30, traverse: 52, damage: 58, pen: [146, 132, 118], reload: 0.30, sound: '2a72', missile: [550, 'spike-launch'] },
  bmpt_t90:           { hp: 2950, speed: 60, reverse: 18, traverse: 32, damage: 50, pen: [122, 110, 98], reload: 0.28, sound: 'twin-2a42', missile: [560, 'ataka-launch'] },
});

const ifvIds = ALL_TANK_IDS.filter((id) => TANK_SPECS[id]?.role === 'ifv');
assert.equal(ifvIds.length, 15, 'complete selectable IFV fleet');
assert.deepEqual([...ifvIds].sort(), Object.keys(EXPECTED).sort(),
  'the explicit stat table covers exactly the selectable IFVs');

const hpValues = new Set();
const cannonDamage = new Set();
const cannonReload = new Set();
const missileDamage = new Set();
const mobilitySignatures = new Set();

for (const id of ifvIds) {
  const expected = EXPECTED[id];
  const raw = TANK_SPECS[id];
  const spec = getSpec(id);
  assert.strictEqual(spec, raw, `${id}: lookup returns the canonical spec without a class-wide wrapper`);

  const before = JSON.stringify({ hp: raw.hp, gun: raw.gun, armor: raw.armor });
  getSpec(id);
  assert.equal(JSON.stringify({ hp: raw.hp, gun: raw.gun, armor: raw.armor }), before,
    `${id}: repeated lookups never mutate or stack balance values`);

  assert.equal(spec.hp, expected.hp, `${id}: HP`);
  assert.equal(spec.topSpeedKmh, expected.speed, `${id}: forward speed`);
  assert.equal(spec.reverseSpeedKmh, expected.reverse, `${id}: reverse speed`);
  assert.equal(spec.hullTraverseDegS, expected.traverse, `${id}: hull traverse`);
  assert.equal(spec.gun.soundProfile, expected.sound, `${id}: weapon report`);

  const round = spec.gun.shells[0];
  assert.equal(spec.gun.reloadS, expected.reload, `${id}: headline reload`);
  assert.equal(round.reloadS, expected.reload, `${id}: default-round reload`);
  assert.equal(round.dmg, expected.damage, `${id}: default-round damage`);
  assert.deepEqual([round.pen100Mm, round.pen1000Mm, round.pen2000Mm], expected.pen,
    `${id}: default-round penetration curve`);

  const guided = spec.gun.shells.find((shell) => shell.guided);
  if (expected.missile) {
    assert.ok(guided, `${id}: guided weapon exists`);
    assert.equal(guided.dmg, expected.missile[0], `${id}: guided damage`);
    assert.equal(guided.soundProfile, expected.missile[1], `${id}: launcher report`);
    assert.ok(guided.reloadS >= 12, `${id}: guided round pays its own long reload`);
    missileDamage.add(guided.dmg);
  } else {
    assert.equal(guided, undefined, `${id}: gun-only vehicle stays gun-only`);
  }

  hpValues.add(spec.hp);
  cannonDamage.add(round.dmg);
  cannonReload.add(round.reloadS);
  mobilitySignatures.add(`${spec.topSpeedKmh}/${spec.reverseSpeedKmh}/${spec.hullTraverseDegS}`);
}

assert.ok(hpValues.size >= 14, `HP remains too uniform (${hpValues.size} unique)`);
assert.equal(Math.min(...hpValues), 1050, 'BMP-2 owns the lightest HP pool');
assert.equal(Math.max(...hpValues), 2950, 'T-90 Terminator owns the heaviest HP pool');
assert.ok(cannonDamage.size >= 12, `autocannon damage remains too uniform (${cannonDamage.size} unique)`);
assert.ok(Math.max(...cannonDamage) - Math.min(...cannonDamage) >= 58,
  '20 mm volume fire and 30 mm RARDEN alpha are materially distinct');
assert.ok(cannonReload.size >= 12, `weapon cycles remain too uniform (${cannonReload.size} unique)`);
assert.ok(missileDamage.size >= 10, `missile damage remains too uniform (${missileDamage.size} unique)`);
assert.ok(mobilitySignatures.size >= 12,
  `mobility remains too uniform (${mobilitySignatures.size} unique signatures)`);

assert.equal(getSpec('bmp3').gun.shells[2].dmg, 360, 'BMP-3 keeps its 100 mm HE identity');
assert.equal(getSpec('bmp3').gun.shells[2].reloadS, 4, 'BMP-3 100 mm HE has a full reload');
assert.equal(getSpec('bmp3').gun.shells[2].soundProfile, 'bmp3-100mm',
  'BMP-3 100 mm report does not masquerade as its 30 mm autocannon');
for (const id of ['bmpt_terminator2', 'bmpt_t90']) {
  assert.deepEqual(getSpec(id).gun.muzzles.map((muzzle) => muzzle.x),
    id === 'bmpt_t90' ? [-0.20, 0.20] : [-0.16, 0.16],
    `${id}: authentic twin-barrel fire axes`);
}

const abrams = TANK_SPECS.m1a2;
const abramsBefore = JSON.stringify({ hp: abrams.hp, gun: abrams.gun, armor: abrams.armor });
getSpec('m1a2');
assert.equal(JSON.stringify({ hp: abrams.hp, gun: abrams.gun, armor: abrams.armor }), abramsBefore,
  'IFV balancing never leaks into an MBT');

console.log(`afvBalance.selftest: ${ifvIds.length} canonical IFVs, ${hpValues.size} HP pools, ` +
  `${cannonDamage.size} damage values, ${cannonReload.size} reload cycles passed`);
