import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { FLEET_RENEWAL_DONORS } from '../fleetRenewalSpecs.ts';

// 2026-10-21 (owner: "make the t64bv1 look a lot different from the t72b3, rn they look identical"): the T-64BV1 and
// the Donbas left the T-72B3 study for the T-64's own build (profiles/t64bvX.ts) and keep only the B3's physical frame
// (fleetRenewalSpecs.ts copyPhysicalFrame: dims, armour, ring and gun datums). This receipt holds the T-64 running gear
// apart from the donor course (six small steel wheels, four return rollers per side, the narrower double-pin track) and
// the seating laws the old receipt protected: wheels standing on the band face at one axle height, suspension-driven
// wheels, and one articulated turret/gun assembly at the combat datum. 2026-10-22 (owner: "the ukranian t64bv1 should
// just be its previous model with an updated name"): the T-64BV mod. 2017 (t64bv_donbas) is back on the T-72B3 study
// (t72ModernVariants.ts buildT64BV2017) and is held to the donor course again, as before release 237.
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

const donor = build('t72b3');
const donorHull = donor.root.getObjectByName('rig_hull');
const [donorGear] = donorHull.userData.runningGearReceipts;
const donorCounts = ['gearRoadWheelTires', 'gearReturnRollerTires', 'gearSuspensionLinks', 'gearSuspensionJointBosses']
  .map((name) => donorHull.getObjectByName(name)?.count);
donor.dispose();

for (const [id, variant, donorBuild] of [['t64bv1', 'bv1', 't64bv1'], ['t64bv_donbas', 'donbas', 't72b3']]) {
  assert.equal(FLEET_RENEWAL_DONORS[id], 't72b3', `${id}: keeps the B3's physical frame`);
  const tank = build(id);
  try {
    const hullRig = tank.root.getObjectByName('rig_hull');
    const turretRig = tank.root.getObjectByName('rig_turret');
    const gunRig = tank.root.getObjectByName('rig_gun');
    assert.equal(hullRig.userData.familyRebuild?.donor, donorBuild, `${id}: built on ${donorBuild}`);
    assert.equal(hullRig.userData.familyRebuild?.variant, variant, `${id}: its own variant`);
    const [receipt] = hullRig.userData.runningGearReceipts || [];
    assert.ok(receipt, `${id}: exposes the canonical running-gear receipt`);
    if (donorBuild === 't72b3') {
      for (const key of ['wheelZs', 'wheelY', 'wheelR', 'idler', 'sprocket', 'topY', 'botY', 'trackTh',
        'shoeRadialScale']) {
        assert.deepEqual(receipt[key], donorGear[key], `${id}: ${key} is the t72b3 donor course`);
      }
      assert.deepEqual(['gearRoadWheelTires', 'gearReturnRollerTires', 'gearSuspensionLinks', 'gearSuspensionJointBosses']
        .map((name) => hullRig.getObjectByName(name)?.count), donorCounts,
      `${id}: complete donor wheels, rollers, torsion arms and joint bosses`);
    } else {
      assert.equal(receipt.wheelZs.length, 6, `${id}: six road wheels per side`);
      assert.ok(receipt.wheelR < donorGear.wheelR - .06, `${id}: the T-64's small wheels (${receipt.wheelR} against ${donorGear.wheelR})`);
      assert.notDeepEqual(receipt.wheelZs, donorGear.wheelZs, `${id}: its own wheel stations`);
      assert.notDeepEqual(receipt.idler, donorGear.idler, `${id}: its own idler`);
      assert.notDeepEqual(receipt.sprocket, donorGear.sprocket, `${id}: its own drive sprocket`);
      const [wheels, rollers] = ['gearRoadWheelTires', 'gearReturnRollerTires'].map((name) => hullRig.getObjectByName(name)?.count);
      assert.equal(wheels, 12, `${id}: twelve road wheels`);
      assert.equal(rollers, 8, `${id}: four return rollers per side (the T-72 carries three)`);
      assert.equal(donorCounts[1], 6, 't72b3: three return rollers per side');
    }
    // The T-64 identity keeps its exposed forged arms (suspensionPatterns.ts family rule).
    assert.equal(receipt.suspensionPatternId, 't64-torsion-arm', `${id}: uses the exposed T-64 torsion-arm geometry`);
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

console.log('t64RunningGearTurretCenter.selftest: the T-64BV1 runs its own six-small-wheel course, the T-64BV mod. 2017 the T-72B3 study course, both with seated wheels and an articulated turret at the combat datum');
