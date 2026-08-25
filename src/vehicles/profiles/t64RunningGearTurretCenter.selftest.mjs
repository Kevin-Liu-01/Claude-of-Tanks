import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';

const EPSILON = 1e-6;
const CASES = {
  t64bv1: {
    wheelY: 0.475,
    topY: 1.09,
    botY: 0.29,
    idlerY: 0.825,
    sprocketY: 0.948,
    rollerY: 1.06,
    turretZ: 0.14,
    armorCenterZ: [-0.20, -0.16],
  },
  ua_t64bv: {
    wheelY: 0.475,
    topY: 1.09,
    botY: 0.30,
    idlerY: 0.835,
    sprocketY: 0.92,
    rollerY: 1.06,
    turretZ: -0.06,
    armorCenterZ: [-0.34, -0.30],
  },
};

function near(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) <= EPSILON,
    `${message}: expected ${expected}, received ${actual}`);
}

function uniqueInstanceYs(mesh) {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const ys = new Set();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, matrix);
    position.setFromMatrixPosition(matrix);
    ys.add(Number(position.y.toFixed(4)));
  }
  return [...ys].sort((a, b) => b - a);
}

for (const [id, expected] of Object.entries(CASES)) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });

  try {
    const hullRig = tank.root.getObjectByName('rig_hull');
    const turretRig = tank.root.getObjectByName('rig_turret');
    const gunRig = tank.root.getObjectByName('rig_gun');
    const receipt = hullRig?.userData.runningGearReceipts?.[0];
    const roadWheels = hullRig?.getObjectByName('gearRoadWheelTires');
    const returnRollers = hullRig?.getObjectByName('gearReturnRollerTires');

    assert.ok(receipt && roadWheels?.isInstancedMesh && returnRollers?.isInstancedMesh,
      `${id}: exposes the canonical running-gear receipt and visible wheel layers`);
    near(receipt.wheelY, expected.wheelY, `${id}: road-wheel axle is raised 160 mm`);
    near(receipt.topY, expected.topY, `${id}: upper track run is raised 160 mm`);
    near(receipt.botY, expected.botY, `${id}: lower track run is raised 160 mm`);
    near(receipt.idler.y, expected.idlerY, `${id}: idler follows the lifted course`);
    near(receipt.sprocket.y, expected.sprocketY, `${id}: sprocket follows the lifted course`);
    assert.deepEqual(uniqueInstanceYs(roadWheels), [expected.wheelY],
      `${id}: all visible road wheels use the raised axle datum`);
    assert.deepEqual(uniqueInstanceYs(returnRollers), [expected.rollerY],
      `${id}: all visible return rollers follow the raised course`);
    assert.equal(roadWheels.count, 12, `${id}: retains six road wheels per side`);
    assert.equal(returnRollers.count, 8, `${id}: retains four return rollers per side`);
    assert.equal(receipt.suspensionLinkCount, 12,
      `${id}: every raised road wheel remains suspension-driven`);

    assert.ok(turretRig && gunRig?.parent === turretRig,
      `${id}: gun and turret remain one articulated assembly`);
    near(turretRig.position.z, expected.turretZ,
      `${id}: complete turret rig moves 200 mm forward`);
    tank.root.updateMatrixWorld(true);
    const armor = turretRig.getObjectByName('turret');
    assert.ok(armor?.isMesh, `${id}: structural turret armor remains present`);
    const armorCenterZ = new THREE.Box3().setFromObject(armor).getCenter(new THREE.Vector3()).z;
    assert.ok(armorCenterZ >= expected.armorCenterZ[0]
      && armorCenterZ <= expected.armorCenterZ[1],
    `${id}: turret casting centers on the hull deck (${armorCenterZ.toFixed(3)} m)`);
  } finally {
    tank.dispose();
  }
}

console.log('t64RunningGearTurretCenter.selftest: T-64BV1 and Donbas running gear is raised and turret rigs are centered');
