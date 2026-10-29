import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { FLEET_RENEWAL_DONORS } from '../fleetRenewalSpecs.ts';
import { T64_GEAR, T64_ROAD_STATIONS } from './t64RunningGear.ts';
import { T64_DATUMS } from '../t64Armor.ts';
import { T64_FRAME } from './t64Foundation.ts';

// 262 (owner 2026-10-27: the T-64BM1M "should be designed from scratchh as well", then "make these new tanks were making
// fully nnew tnaks"): the T-64BM1M, the T-64BV and the T-64B1V mod. 2022 are true T-64s on one first-party base
// (t64Foundation.ts), beside the T-64BV1 and T-64BV mod. 2017 on the T-72B3 study. This receipt holds all three to
// the T-64's own course: six small dual road wheels a side at the base's stations, four return rollers a side (the T-72
// has three), the exposed forged T-64 arms, every wheel standing on the band face at one axle height and driven by its
// arm, and one articulated turret/gun assembly at the T-64 combat datum.
const EPSILON = 1e-6;
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) <= EPSILON,
  `${message}: expected ${expected}, received ${actual}`);
const build = (id) => createTank(id, null, { proceduralOnly: true, quality: 'high', camoSeed: 4242, geometryReceipt: true });
const uniqueInstanceYs = (mesh) => {
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), ys = new Set();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, matrix);
    ys.add(Number(position.setFromMatrixPosition(matrix).y.toFixed(4)));
  }
  return [...ys];
};

// The builders carry the frame's numbers themselves (a lazy import of the boot spec module splits it into a boot chunk):
// they are the combat frame's, number for number.
assert.deepEqual(JSON.parse(JSON.stringify(T64_FRAME)), JSON.parse(JSON.stringify({ turretPivot: T64_DATUMS.turretPivot,
  trunnion: T64_DATUMS.trunnion, muzzleZ: T64_DATUMS.muzzleZ, structuralRoofM: T64_DATUMS.structuralRoofM })),
'the builders\' T64_FRAME is t64Armor.ts T64_DATUMS');

for (const [id, variant] of [['t64bm1m', 'bm1m'], ['t64bv', 'bv'], ['t64b1v_2022', 'b1v2022'], ['pt64_tur', 'tur']]) {
  assert.equal(FLEET_RENEWAL_DONORS[id], undefined, `${id}: no renewal donor frame (the T-64 frame, t64Armor.ts)`);
  near(getSpec(id).visual.trackWidthM, T64_DATUMS.trackWidthM, `${id}: the T-64's 540 mm track`);
  const tank = build(id);
  try {
    const hullRig = tank.root.getObjectByName('rig_hull');
    const turretRig = tank.root.getObjectByName('rig_turret');
    const gunRig = tank.root.getObjectByName('rig_gun');
    assert.equal(hullRig.userData.familyRebuild?.base, 't64Foundation', `${id}: built on the true T-64 base`);
    assert.equal(hullRig.userData.familyRebuild?.variant, variant, `${id}: its own variant`);
    assert.ok(!('donor' in hullRig.userData.familyRebuild), `${id}: no donor study`);
    const [receipt] = hullRig.userData.runningGearReceipts || [];
    assert.ok(receipt, `${id}: exposes the canonical running-gear receipt`);
    assert.deepEqual(receipt.wheelZs, [...T64_ROAD_STATIONS], `${id}: the T-64's six road-wheel stations`);
    near(receipt.wheelR, T64_GEAR.wheelR, `${id}: the small T-64 road wheel`);
    assert.equal(receipt.suspensionPatternId, 't64-torsion-arm', `${id}: the exposed T-64 torsion arms`);
    near(receipt.wheelY, receipt.botY + receipt.trackTh / 2 + receipt.wheelR,
      `${id}: road-wheel axle rests on the band face (ground-datum seat, 2026-09-17)`);
    const roadWheels = hullRig.getObjectByName('gearRoadWheelTires');
    assert.equal(roadWheels?.count, 12, `${id}: six road wheels a side`);
    assert.equal(hullRig.getObjectByName('gearReturnRollerTires')?.count, 8, `${id}: four return rollers a side`);
    const roadYs = uniqueInstanceYs(roadWheels);
    assert.equal(roadYs.length, 1, `${id}: all visible road wheels share one axle height`);
    assert.ok(Math.abs(roadYs[0] - receipt.wheelY) < 1e-4, `${id}: all visible road wheels sit on the seated axle`);
    assert.equal(receipt.suspensionLinkCount, roadWheels.count, `${id}: every road wheel remains suspension-driven`);
    assert.equal(hullRig.userData.t64GearContract?.returnRollers, 4, `${id}: the T-64 gear contract`);
    assert.ok(gunRig?.parent === turretRig, `${id}: gun and turret remain one articulated assembly`);
    turretRig.position.toArray().forEach((value, axis) => near(value, getSpec(id).armor.turretPivot[axis],
      `${id}: turret seats at the combat/anatomy ring datum (${axis})`));
    T64_DATUMS.turretPivot.forEach((value, axis) => near(getSpec(id).armor.turretPivot[axis], value,
      `${id}: the combat ring is the T-64's (${axis})`));
    assert.ok(turretRig.getObjectByName('turretExternalArmor')?.isMesh,
      `${id}: the variant's reactive armour is turret-owned external armor`);
  } finally {
    tank.dispose();
  }
}

console.log('t64Foundation.selftest: the T-64BM1M, T-64BV, T-64B1V mod. 2022 and PT-64 Tur run the T-64 course (six wheels, four rollers a side) with an articulated turret at the T-64 datum');
