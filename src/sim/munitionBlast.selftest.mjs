// The munition blast catalog (docs/DESTRUCTION.md §4): every round in the game classifies, carries the charge its
// class gives it, and the blast, penetrator and crater laws hold the documented numbers.
import assert from 'node:assert/strict';
import '../vehicles/fleetRegistration.ts';
import { SAVED_TANK_IDS, TANK_SPECS } from '../vehicles/specs.ts';
import { auxiliaryWeaponProfile } from '../vehicles/auxiliaryWeapons.ts';
import { DRONE_WARHEAD, GUNSHIP_WEAPONS, GUN_GAME_WEAPONS } from './matchRuleset.ts';
import { MUNITION_CLASSES, MUNITION_PROFILES } from './destructionEvents.ts';
import {
  BLAST_POINTS_PER_KG, CRATER_DEFORM_MIN_RADIUS_M, CRATER_MAX_RADIUS_M, FUEL_CHARGE_KG, blastFalloff, blastReachM,
  cookOffChargeKg, craterFor, kineticStructurePoints, munitionBlastEventFor, munitionChargeKg, munitionClassForShell,
  penetratorHoleRadiusM, structureBlastPoints,
} from './munitionBlast.ts';

const near = (actual, expected, eps, label) => assert.ok(Math.abs(actual - expected) <= eps,
  `${label}: ${actual} is not within ${eps} of ${expected}`);

// ---- the contract's table is complete and sane
assert.deepEqual(Object.keys(MUNITION_PROFILES).sort(), [...MUNITION_CLASSES].sort(), 'one profile per class');
for (const id of MUNITION_CLASSES) {
  const profile = MUNITION_PROFILES[id];
  assert.equal(profile.id, id);
  assert.ok(profile.structureFactor >= 0 && profile.craterFactor >= 0 && profile.nominalChargeKg >= 0, id);
  assert.equal(profile.explosive, profile.nominalChargeKg > 0, `${id}: explosive exactly when it carries a charge`);
  assert.ok(Object.isFrozen(profile), `${id} profile is frozen`);
}

// ---- every fleet round classifies to a class with a finite charge
const census = new Map();
let rounds = 0;
for (const id of SAVED_TANK_IDS) {
  for (const shell of TANK_SPECS[id].gun.shells) {
    const munition = munitionClassForShell(shell);
    assert.ok(MUNITION_CLASSES.includes(munition), `${id} ${shell.name}: ${munition}`);
    const charge = munitionChargeKg(shell, munition);
    assert.ok(Number.isFinite(charge) && charge >= 0, `${id} ${shell.name}: charge ${charge}`);
    assert.equal(charge > 0, MUNITION_PROFILES[munition].explosive, `${id} ${shell.name}: ${munition} charge ${charge}`);
    census.set(munition, (census.get(munition) ?? 0) + 1);
    rounds++;
    if (/\bHESH\b/.test(shell.name)) assert.equal(munition, 'hesh', `${id} ${shell.name} is HESH by name`);
    if (/\bSmoke\b|\bWP\b/.test(shell.name)) assert.equal(munition, 'smoke', `${id} ${shell.name} is smoke by name`);
    if (shell.type === 'HEAT' && shell.guided) assert.equal(munition, 'atgm', `${id} ${shell.name}`);
    if (shell.type === 'HE' && shell.guided) assert.equal(munition, 'missile', `${id} ${shell.name}`);
    if (shell.type === 'HE' && !shell.guided && shell.launcherTubes > 0) assert.equal(munition, 'rocket', `${id} ${shell.name}`);
  }
}
assert.ok(rounds > 600, `the fleet's rounds were read (${rounds})`);
for (const expected of ['kinetic', 'autocannon_ap', 'he', 'heat', 'atgm', 'missile', 'rocket', 'hesh', 'smoke', 'autocannon_he']) {
  assert.ok(census.get(expected) > 0, `the fleet carries ${expected} rounds`);
}

// ---- named rounds the fleet types otherwise
assert.equal(munitionClassForShell({ type: 'HE', caliberMm: 120, name: 'L31A7 HESH' }), 'hesh');
assert.equal(munitionClassForShell({ type: 'HE', caliberMm: 105, name: 'M393 HESH' }), 'hesh');
assert.equal(munitionClassForShell({ type: 'HE', caliberMm: 120, name: 'L34 WP Smoke' }), 'smoke');
assert.equal(munitionChargeKg({ type: 'HE', caliberMm: 120, name: 'L34 WP Smoke' }), 0, 'smoke never blasts a building');
near(munitionChargeKg({ type: 'HE', caliberMm: 120, name: 'L31A7 HESH' }), 5.18, 0.01, '120 mm HESH charge');

// ---- roof guns, the gunship, the drone and the Gun Game ladder
assert.equal(munitionClassForShell(auxiliaryWeaponProfile(12.7).shell), 'small_arms');
assert.equal(munitionClassForShell(auxiliaryWeaponProfile(7.62).shell), 'small_arms');
assert.equal(munitionClassForShell(auxiliaryWeaponProfile(30).shell), 'autocannon_he', 'M789 HEDP is typed AP, named HEDP');
assert.equal(munitionClassForShell(auxiliaryWeaponProfile(30, 't14').shell), 'autocannon_ap', '3UBR6 AP-T stays kinetic');
const [gunshipCannon, gunshipHowitzer, gunshipMissile] = GUNSHIP_WEAPONS;
assert.equal(munitionClassForShell(gunshipCannon), 'autocannon_ap');
assert.equal(munitionClassForShell(gunshipHowitzer), 'howitzer');
near(munitionChargeKg(gunshipHowitzer), 20.04, 0.01, 'the gunship howitzer charge from its 22 m envelope');
assert.equal(munitionClassForShell(gunshipMissile), 'missile');
near(munitionChargeKg(gunshipMissile), 10.97, 0.01, 'the gunship missile charge from its 18 m envelope');
assert.equal(munitionClassForShell(DRONE_WARHEAD), 'drone_fpv');
assert.equal(munitionChargeKg(DRONE_WARHEAD), 1.2);
assert.deepEqual(GUN_GAME_WEAPONS.map((shell) => munitionClassForShell(shell)),
  ['autocannon_ap', 'kinetic', 'kinetic', 'howitzer', 'atgm']);
const tosRocket = TANK_SPECS.tos1a_tagil.gun.shells[0];
assert.equal(munitionClassForShell(tosRocket), 'rocket');
assert.equal(munitionChargeKg(tosRocket), 8, 'one rocket is capped at 8 kg');

// ---- charges by calibre (§4.1 table)
near(munitionChargeKg({ type: 'HE', caliberMm: 125 }), 3.52, 0.01, '125 mm HE-FRAG');
near(munitionChargeKg({ type: 'HE', caliberMm: 152 }), 6.85, 0.01, '152 mm howitzer HE');
near(munitionChargeKg({ type: 'HE', caliberMm: 30 }), 0.0486, 0.001, '30 mm HE');
near(munitionChargeKg({ type: 'HEAT', caliberMm: 120 }), 2.33, 0.01, '120 mm HEAT');
near(munitionChargeKg({ type: 'HEAT', caliberMm: 152, guided: true }), 3.44, 0.01, '152 mm ATGM');
near(munitionChargeKg({ type: 'HE', caliberMm: 70, guided: true }), 0.62, 0.01, 'Stinger 70 mm');
assert.equal(munitionChargeKg({ type: 'APFSDS', caliberMm: 120 }), 0);
assert.equal(munitionClassForShell({ type: 'HE', caliberMm: Number.NaN }), 'autocannon_he', 'a degenerate calibre never throws');
assert.equal(munitionChargeKg({ type: 'HE', caliberMm: Number.NaN }), 0, 'a degenerate calibre carries no charge');
near(cookOffChargeKg(60), 9, 1e-9, 'a 60 t hull cooks off at 9 kg');
assert.equal(cookOffChargeKg(10), 3);
assert.equal(cookOffChargeKg(120), 12);
assert.equal(cookOffChargeKg(Number.NaN), 6, 'unknown mass reads 40 t');
assert.equal(FUEL_CHARGE_KG, 4);

// ---- the blast law (§4.2)
assert.equal(blastFalloff(0), 1);
assert.equal(blastFalloff(0.6), 1);
assert.equal(blastFalloff(6.0001), 0);
let previous = 1;
for (let z = 0.6; z <= 6; z += 0.05) {
  const value = blastFalloff(z);
  assert.ok(value <= previous + 1e-12 && value >= 0, `falloff is monotone at Z ${z.toFixed(2)}`);
  previous = value;
}
near(blastReachM(8), 12, 1e-9, 'an 8 kg charge reaches 12 m');
assert.equal(blastReachM(0), 0);
const he125 = munitionChargeKg({ type: 'HE', caliberMm: 125 });
near(structureBlastPoints(he125, 'he', 0), 12.3, 0.05, '125 mm HE at contact');
near(structureBlastPoints(he125, 'he', 3), 0.89, 0.02, '125 mm HE 3 m from the wall');
near(structureBlastPoints(munitionChargeKg(gunshipHowitzer), 'howitzer', 0), 70.1, 0.1, 'the gunship howitzer at contact');
near(structureBlastPoints(munitionChargeKg(gunshipMissile), 'missile', 0), 38.4, 0.1, 'the gunship missile at contact');
near(structureBlastPoints(munitionChargeKg({ type: 'HEAT', caliberMm: 152, guided: true }), 'atgm', 0), 8.4, 0.1, 'an ATGM');
near(structureBlastPoints(1.2, 'drone_fpv', 0), 2.94, 0.01, 'an FPV warhead');
near(structureBlastPoints(cookOffChargeKg(60), 'cook_off', 0), 25.2, 0.01, 'a cook-off beside a wall');
assert.equal(structureBlastPoints(0, 'he', 0), 0);
assert.equal(structureBlastPoints(5, 'smoke', 0), 0, 'a class without a structure factor deals nothing');
assert.equal(structureBlastPoints(5, 'he', Number.NaN), 0, 'an unknown distance is out of reach');
assert.equal(BLAST_POINTS_PER_KG, 3.5);

// ---- penetrators (§4.3)
near(kineticStructurePoints({ type: 'APFSDS', caliberMm: 120, pen100Mm: 600 }), 2.88, 1e-9, '120 mm APFSDS');
near(kineticStructurePoints({ type: 'AP', caliberMm: 30, pen100Mm: 60 }), 0.072, 1e-9, '30 mm AP');
assert.equal(kineticStructurePoints({ type: 'HE', caliberMm: 125, pen100Mm: 60 }), 0, 'HE is no penetrator');
assert.equal(kineticStructurePoints({ type: 'AP', caliberMm: 12.7, pen100Mm: 26 }), 0, 'small arms are no penetrator');
near(penetratorHoleRadiusM({ type: 'APFSDS', caliberMm: 120 }), 0.42, 1e-9, 'a 120 mm hole');

// ---- craters (§4.5)
const crater = { radiusM: 0, depthM: 0, rimM: 0 };
craterFor(he125, 'he', 1, crater);
near(crater.radiusM, 1.67, 0.01, '125 mm HE crater radius');
near(crater.depthM, 0.585, 0.01, '125 mm HE crater depth');
near(crater.rimM, 0.4, 0.01, '125 mm HE crater rim (crater round 3: read from the player\'s eye height)');
assert.ok(crater.radiusM >= CRATER_DEFORM_MIN_RADIUS_M, 'a 125 mm HE crater deforms the ground');
craterFor(munitionChargeKg(gunshipHowitzer), 'howitzer', 1, crater);
near(crater.radiusM, 3.44, 0.01, 'the gunship howitzer crater');
near(crater.depthM / crater.radiusM, 0.4, 1e-9, 'a howitzer shell digs deeper');
near(crater.rimM / crater.radiusM, 0.26, 1e-9, 'and throws a higher rim');
craterFor(munitionChargeKg({ type: 'HE', caliberMm: 152 }), 'howitzer', 1, crater);
assert.ok(crater.rimM > 0.55, `a 152 mm howitzer shell's rim reads from 25 m (${crater.rimM.toFixed(2)} m)`);
for (const [munition, kg] of [['atgm', 3.4], ['drone_fpv', 1.2], ['heat', 1.6]]) {
  craterFor(kg, munition, 1.25, crater);
  assert.ok(crater.radiusM < CRATER_DEFORM_MIN_RADIUS_M, `a shaped charge (${munition}) never bowls, even under the gunship's scale (${crater.radiusM.toFixed(2)} m)`);
}
craterFor(munitionChargeKg({ type: 'HE', caliberMm: 105 }), 'he', 1, crater);
assert.ok(crater.radiusM < CRATER_DEFORM_MIN_RADIUS_M, `a 105 mm HE crater (${crater.radiusM.toFixed(2)} m) is a mark`);
craterFor(1000, 'missile', 1, crater);
assert.equal(crater.radiusM, CRATER_MAX_RADIUS_M, 'craters are capped');
craterFor(he125, 'kinetic', 1, crater);
assert.equal(crater.radiusM, 0, 'kinetic rounds dig nothing');
craterFor(he125, 'he', 0, crater);
assert.equal(crater.radiusM, 0, 'a mode without craters digs nothing');

// ---- the blast event (§11): a detonating round's class, charge, point, normal, surface, and the structure it struck
{
  const event = munitionBlastEventFor({ type: 'HE', caliberMm: 125 }, 10, 2, -4, 0, 0, 1, 'structure', 17);
  assert.deepEqual(event, { munition: 'he', chargeKg: munitionChargeKg({ type: 'HE', caliberMm: 125 }), x: 10, y: 2, z: -4,
    nx: 0, ny: 0, nz: 1, surface: 'structure', structureId: 17 });
  const ground = munitionBlastEventFor(gunshipHowitzer, 0, 0, 0, 0, 1, 0, 'terrain');
  assert.equal(ground.munition, 'howitzer');
  assert.equal('structureId' in ground, false, 'no structure: no id');
  assert.equal(munitionBlastEventFor({ type: 'HE', caliberMm: 125 }, 0, 0, 0, 0, 1, 0, 'prop', null).structureId, undefined);
  assert.equal(munitionBlastEventFor({ type: 'APFSDS', caliberMm: 120, pen100Mm: 600 }, 0, 0, 0, 0, 1, 0, 'terrain'), null,
    'a penetrator does not detonate');
  assert.equal(munitionBlastEventFor({ type: 'AP', caliberMm: 12.7, pen100Mm: 26 }, 0, 0, 0, 0, 1, 0, 'terrain'), null, 'nor small arms');
}

console.log(`munitionBlast: ${rounds} fleet rounds over ${census.size} classes (${[...census].map(([k, n]) => `${k} ${n}`).join(', ')}); `
  + 'gunship, drone, roof guns, Gun Game; blast, penetrator and crater laws; the blast event PASS');
