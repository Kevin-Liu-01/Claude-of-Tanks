import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';

const EPSILON = 1e-6;
const CASES = {
  t64bv1: {
    wheelY: 0.315,
    topY: 1.09,
    botY: 0.13,
    idlerY: 0.825,
    sprocketY: 0.948,
    rollerY: 1.06,
    authoredEnvelopeHeightM: 0.80,
    installedEnvelopeHeightM: 0.96,
    turretZ: 0.14,
    armorCenterZ: [-0.20, -0.16],
  },
  ua_t64bv: {
    wheelY: 0.315,
    topY: 1.09,
    botY: 0.14,
    idlerY: 0.835,
    sprocketY: 0.92,
    rollerY: 1.06,
    authoredEnvelopeHeightM: 0.79,
    installedEnvelopeHeightM: 0.95,
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
    const tallTrack = hullRig?.userData.t64TallTrackReceipt;
    const roadWheels = hullRig?.getObjectByName('gearRoadWheelTires');
    const returnRollers = hullRig?.getObjectByName('gearReturnRollerTires');

    assert.ok(receipt && tallTrack && roadWheels?.isInstancedMesh && returnRollers?.isInstancedMesh,
      `${id}: exposes the canonical running-gear receipt and visible wheel layers`);
    near(receipt.wheelY, expected.wheelY, `${id}: road-wheel axle stays on its ground datum`);
    near(receipt.topY, expected.topY, `${id}: upper track run gains 160 mm`);
    near(receipt.botY, expected.botY, `${id}: loaded lower run stays on its ground datum`);
    near(receipt.idler.y, expected.idlerY, `${id}: idler follows the lifted course`);
    near(receipt.sprocket.y, expected.sprocketY, `${id}: sprocket follows the lifted course`);
    near(tallTrack.authoredEnvelopeHeightM, expected.authoredEnvelopeHeightM,
      `${id}: receipt preserves the authored course height`);
    near(tallTrack.installedEnvelopeHeightM, expected.installedEnvelopeHeightM,
      `${id}: installed track envelope is 160 mm taller`);
    near(tallTrack.hullRideHeightIncreaseM, 0.36,
      `${id}: hull receives the additional 360 mm ride-height increase`);
    assert.ok(tallTrack.liftedDirectHullChildren >= 2,
      `${id}: direct hull fittings follow the raised hull body`);
    assert.deepEqual(uniqueInstanceYs(roadWheels), [expected.wheelY],
      `${id}: all visible road wheels retain the loaded axle datum`);
    assert.deepEqual(uniqueInstanceYs(returnRollers), [expected.rollerY],
      `${id}: all visible return rollers follow the raised course`);
    assert.equal(roadWheels.count, 12, `${id}: retains six road wheels per side`);
    assert.equal(returnRollers.count, 8, `${id}: retains four return rollers per side`);
    assert.equal(receipt.suspensionLinkCount, 12,
      `${id}: every road wheel remains suspension-driven`);

    const bottomPoints = receipt.loopPoints.filter(([, y]) =>
      Math.abs(y - expected.botY) <= EPSILON);
    assert.ok(bottomPoints.length >= 6,
      `${id}: lower course contains a stable loaded contact run`);
    const bottomZs = bottomPoints.map(([z]) => z);
    assert.ok(Math.min(...bottomZs) > receipt.sprocket.z
      && Math.max(...bottomZs) < receipt.idler.z,
    `${id}: lower run is the short base between naturally rising end wraps`);
    const actualCourseHeight = Math.max(...receipt.loopPoints.map(([, y]) => y))
      - Math.min(...receipt.loopPoints.map(([, y]) => y));
    assert.ok(actualCourseHeight >= expected.installedEnvelopeHeightM,
      `${id}: closed shoe course visibly spans the taller \\____/ envelope`);

    assert.ok(turretRig && gunRig?.parent === turretRig,
      `${id}: gun and turret remain one articulated assembly`);
    near(turretRig.position.y, 1.66,
      `${id}: turret and gun assembly rises with the hull`);
    near(turretRig.position.z, expected.turretZ,
      `${id}: complete turret rig moves 200 mm forward`);
    tank.root.updateMatrixWorld(true);
    const armor = turretRig.getObjectByName('turret');
    assert.ok(armor?.isMesh, `${id}: structural turret armor remains present`);
    const armorCenterZ = new THREE.Box3().setFromObject(armor).getCenter(new THREE.Vector3()).z;
    assert.ok(armorCenterZ >= expected.armorCenterZ[0]
      && armorCenterZ <= expected.armorCenterZ[1],
    `${id}: turret casting centers on the hull deck (${armorCenterZ.toFixed(3)} m)`);

    if (id === 'ua_t64bv') {
      const era = turretRig.userData.uaT64DonbasERAReceipt;
      assert.ok(era?.carrierDerivedTransforms,
        `${id}: Donbas ERA transforms derive from the cast-turret surface`);
      assert.equal(era.totalCassettes, 22,
        `${id}: complete Donbas turret K-1 field remains present`);
      assert.equal(era.maxSupportGapM, 0,
        `${id}: no Donbas ERA cassette floats above its carrier`);
      assert.ok(era.seats.every((seat) => seat.contactEmbedM >= 0.04),
        `${id}: every Donbas ERA cassette has a structural attachment embed`);
      assert.ok(turretRig.getObjectByName('turretExternalArmor')?.isMesh,
        `${id}: Donbas ERA is external armor rather than buried track geometry`);
    }
  } finally {
    tank.dispose();
  }
}

console.log('t64RunningGearTurretCenter.selftest: T-64BV1 and Donbas use taller grounded courses with raised hulls and centered turrets');
