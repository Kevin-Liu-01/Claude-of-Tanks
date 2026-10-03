import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { FLEET_RENEWAL_DONORS } from '../fleetRenewalSpecs.ts';

// 2026-10-01: the owner's September renewal (4c34b3e8b, fleet-renewal-publication-20260930.md: "T-64BV1 and UA
// Donbas use modernized t72b3_x foundations") retired the old T-64 builder, its tall 285 mm-wheel course and the
// t64TallTrackReceipt. Both rebuilds now run the T-72B3 study's own running gear under their modernization fit; this
// receipt holds them to that donor course and to the seating laws the T-64 receipt protected: wheels standing on the
// band face at one axle height, suspension-driven wheels, and one articulated turret/gun assembly at the combat datum.
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

const donor = build('t72b3_x');
const donorHull = donor.root.getObjectByName('rig_hull');
const [donorGear] = donorHull.userData.runningGearReceipts;
const donorCounts = ['gearRoadWheelTires', 'gearReturnRollerTires', 'gearSuspensionLinks', 'gearSuspensionJointBosses']
  .map((name) => donorHull.getObjectByName(name)?.count);
donor.dispose();

for (const [id, variant] of [['t64bv1', 'bv1'], ['ua_t64bv', 'donbas']]) {
  assert.equal(FLEET_RENEWAL_DONORS[id], 't72b3_x', `${id}: the renewal builds it on the T-72B3 study`);
  const tank = build(id);
  try {
    const hullRig = tank.root.getObjectByName('rig_hull');
    const turretRig = tank.root.getObjectByName('rig_turret');
    const gunRig = tank.root.getObjectByName('rig_gun');
    assert.equal(hullRig.userData.familyRebuild?.donor, 't72b3_x', `${id}: owner-directed T-72B3 family rebuild`);
    assert.equal(hullRig.userData.familyRebuild?.variant, variant, `${id}: its own modernization variant`);
    const [receipt] = hullRig.userData.runningGearReceipts || [];
    assert.ok(receipt, `${id}: exposes the canonical running-gear receipt`);
    for (const key of ['wheelZs', 'wheelY', 'wheelR', 'idler', 'sprocket', 'topY', 'botY', 'trackTh',
      'shoeRadialScale']) {
      assert.deepEqual(receipt[key], donorGear[key], `${id}: ${key} is the t72b3_x donor course`);
    }
    // The T-64 identity keeps its exposed forged arms (suspensionPatterns.ts family rule) on the donor stations.
    assert.equal(receipt.suspensionPatternId, 't64-torsion-arm', `${id}: uses the exposed T-64 torsion-arm geometry`);
    assert.deepEqual(['gearRoadWheelTires', 'gearReturnRollerTires', 'gearSuspensionLinks', 'gearSuspensionJointBosses']
      .map((name) => hullRig.getObjectByName(name)?.count), donorCounts,
    `${id}: complete donor wheels, rollers, torsion arms and joint bosses`);
    near(receipt.wheelY, receipt.botY + receipt.trackTh / 2 + receipt.wheelR,
      `${id}: road-wheel axle rests on the band face (ground-datum seat, 2026-09-17)`);
    const roadWheels = hullRig.getObjectByName('gearRoadWheelTires');
    const roadYs = uniqueInstanceYs(roadWheels);
    assert.equal(roadYs.length, 1, `${id}: all visible road wheels share one axle height`);
    assert.ok(Math.abs(roadYs[0] - receipt.wheelY) < 1e-4, `${id}: all visible road wheels sit on the seated axle`);
    assert.equal(receipt.suspensionLinkCount, roadWheels.count, `${id}: every road wheel remains suspension-driven`);
    assert.ok(gunRig?.parent === turretRig, `${id}: gun and turret remain one articulated assembly`);
    turretRig.position.toArray().forEach((value, axis) => near(value, getSpec(id).armor.turretPivot[axis],
      `${id}: turret seats at the combat/anatomy ring datum (${axis})`));
    assert.ok(turretRig.getObjectByName('turretExternalArmor')?.isMesh,
      `${id}: the modernization ERA is turret-owned external armor`);
  } finally {
    tank.dispose();
  }
}

console.log('t64RunningGearTurretCenter.selftest: T-64BV1 and Donbas run the T-72B3 study course with seated wheels and an articulated turret at the combat datum');
