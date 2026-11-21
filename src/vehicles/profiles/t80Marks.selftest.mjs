// Release 274 (lane t80-family-274, the owner 2026-11-20: "make unique versions of them now"): the T-80, T-80B and T-80BV
// build on the T-80U X hull (profiles/t80Marks.ts), each with its own photographed era kit, and take the T-80U X's combat
// frame (t80MarkFrames.ts). Pins: the twin and each mark's identity (no two marks share their sights, searchlight side,
// smoke, flank boxes, side screens and stern), the commander's NSVT on the traversing turret, and the BV's Kontakt-1 drawn
// and in the spec both ways, at the fleet's Kontakt-1 values; the T-80 and T-80B carry no ERA. Per-tank pin (tanks suite).
import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';
import { TANK_SPECS } from '../specs.ts';
import { KONTAKT1_ERA } from '../leopard2A4Kontakt1.ts';
import { T80BV_KONTAKT1_PLATES } from '../t80MarkFrames.ts';
import { eraPlateNames } from './eraAgreement.test-support.mjs';

const MARKS = ['t80', 't80b', 't80bv'];
const receipts = {};
for (const id of MARKS) {
  const tank = createTank(id, null, { proceduralOnly: true, quality: 'high', camoSeed: 4242, geometryReceipt: true });
  try {
    const hull = tank.root.getObjectByName('rig_hull'), turret = tank.root.getObjectByName('rig_turret');
    assert.deepEqual(hull.userData.familyRebuild, { donor: 't80u', revision: 1, mark: id }, `${id}: built on the T-80U X hull`);
    const receipt = turret.userData.t80MarkReceipt;
    assert.ok(receipt, `${id}: publishes its mark receipt`);
    assert.equal(receipt.casting, 't80-early-cast-r1', `${id}: the early casting, not the T-80U's`);
    assert.equal(turret.userData.t80CastTurretReceipt, undefined, `${id}: the retired print-fitted dome is gone`);
    receipts[id] = receipt;

    // the commander's NSVT rides the traversing turret on a straight, cupola-mounted station
    const station = turret.getObjectByName('t80MarkCommanderNsvtStation');
    assert.ok(station && station.parent === turret, `${id}: the NSVT station is on the turret`);
    assert.equal(station.userData.supportAssembly, 'commander-cupola');
    assert.ok(station.position.x < 0, `${id}: the NSVT is on the commander's (right, -x) side`);
    for (const axis of ['x', 'y', 'z']) assert.equal(station.rotation[axis], 0, `${id}: station ${axis} rotation`);

    // drawn ERA against the spec, both directions
    const drawn = [...(tank.root.userData.eraClusterNames ?? [])].sort();
    assert.deepEqual(drawn, eraPlateNames(TANK_SPECS[id]), `${id}: drawn ERA equals its gameplay ERA plates`);
    assert.equal(tank.root.userData.eraFinishReceipt !== undefined, id === 't80bv', `${id}: an ERA finish only where ERA is drawn`);
  } finally { tank.dispose(); }
}

// each mark's photographed identity (evidence photos/IDENTITY.md)
assert.deepEqual(receipts.t80.sights, ['tpd-2-49', 'rangefinder-housing', 'tpn-1-49-23']);
assert.deepEqual(receipts.t80b.sights, ['1g42', 'kobra-guidance']);
assert.equal(receipts.t80.lunaSide, 'left');
assert.equal(receipts.t80b.lunaSide, 'right');
assert.deepEqual(MARKS.map((id) => receipts[id].smokeTubes), [0, 9, 8], 'no smoke on the 1976 tank; 5+4 on the B; 4+4 on the BV flanks');
assert.deepEqual(MARKS.map((id) => receipts[id].flankBoxes), [3, 2, 2]);
assert.deepEqual(MARKS.map((id) => receipts[id].sideScreens), ['steel-screen', 'rubber-skirt', 'rubber-skirt']);
assert.deepEqual(MARKS.map((id) => receipts[id].sternDrums), [false, false, true]);
assert.deepEqual(MARKS.map((id) => receipts[id].commanderShield), [false, false, true]);
for (const id of ['t80', 't80b']) assert.deepEqual(receipts[id].kontakt1, {}, `${id}: no Kontakt-1`);

// the BV's Kontakt-1: every cluster populated (eight wedge columns left of the gun's line on the casting's +x cheek, five
// on the -x, two deep; the 4x4 roof grid on the -x front; the tapering glacis field; ten a skirt), and the spec's plates
// at the fleet's Kontakt-1 values
const k1 = receipts.t80bv.kontakt1;
assert.deepEqual(Object.keys(k1).sort(), [...T80BV_KONTAKT1_PLATES]);
assert.equal(k1.turret_era_R, 16, 'eight double-stacked columns on the +x cheek');
assert.equal(k1.turret_era_L, 10 + 16, 'five double-stacked columns and the 4x4 roof grid on the -x side');
assert.equal(k1.skirt_era_L, 10);
assert.equal(k1.skirt_era_R, 10);
assert.ok(k1.glacis_era_L + k1.glacis_era_R >= 30, 'the glacis field (11-10-8-6-4 less the lamp and hook clearances)');
for (const plate of [...TANK_SPECS.t80bv.armor.hullPlates, ...TANK_SPECS.t80bv.armor.turretPlates].filter((p) => p.kind === 'era'))
  assert.deepEqual(plate.era, { ...KONTAKT1_ERA }, `t80bv ${plate.name}: Kontakt-1, not the T-80UK's Kontakt-5`);

// the T-80U X combat frame
for (const id of MARKS) {
  const spec = TANK_SPECS[id], twin = TANK_SPECS.t80u;
  // the combat frame is the one the gun-barrel census measures on the build (combatGunRigs.generated.ts): the twin's yaw
  // pivot exactly, the trunnion within 1.5 cm of the twin's (the marks' gun sits on the casting's own mantlet collar)
  assert.deepEqual(spec.armor.turretPivot, twin.armor.turretPivot, `${id}: the twin's yaw pivot`);
  spec.armor.gunPivot.forEach((v, k) => assert.ok(Math.abs(v - twin.armor.gunPivot[k]) <= 0.015, `${id}: trunnion ${k} within 1.5 cm of the twin's`));
  assert.equal(spec.dims.hullLengthM, twin.dims.hullLengthM, `${id}: the twin's hull length`);
}

console.log('t80Marks.selftest: T-80, T-80B and T-80BV on the T-80U X hull, each with its own kit; BV Kontakt-1 drawn = spec');
