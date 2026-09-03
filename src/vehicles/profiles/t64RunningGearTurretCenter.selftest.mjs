import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

const EPSILON = 1e-6;
const CASES = {
  t64bv1: {
    wheelR: 0.285,
    wheelY: 0.49,
    topY: 1.01,
    botY: 0.13,
    idlerY: 0.785,
    sprocketY: 0.868,
    rollerY: 0.98,
    authoredEnvelopeHeightM: 0.80,
    installedEnvelopeHeightM: 0.88,
    hullMinY: 0.48,
    hullMaxY: 1.536,
    turretZ: 0.14,
    armorCenterZ: [-0.20, -0.16],
  },
  ua_t64bv: {
    wheelR: 0.285,
    wheelY: 0.49,
    topY: 1.01,
    botY: 0.14,
    idlerY: 0.795,
    sprocketY: 0.84,
    rollerY: 0.98,
    authoredEnvelopeHeightM: 0.79,
    installedEnvelopeHeightM: 0.87,
    hullMinY: 0.48,
    hullMaxY: 2.03,
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
    const suspensionLinks = hullRig?.getObjectByName('gearSuspensionLinks');
    const suspensionJoints = hullRig?.getObjectByName('gearSuspensionJointBosses');
    const structuralHull = hullRig?.getObjectByName('hull');

    assert.ok(receipt && tallTrack && roadWheels?.isInstancedMesh && returnRollers?.isInstancedMesh,
      `${id}: exposes the canonical running-gear receipt and visible wheel layers`);
    assert.ok(suspensionLinks?.isInstancedMesh && suspensionJoints?.isInstancedMesh
      && structuralHull?.isMesh,
    `${id}: exposes the wheel-bound torsion arms, joint bosses and structural hull`);
    near(receipt.wheelR, expected.wheelR, `${id}: road wheels use the taller T-64 profile`);
    near(receipt.wheelY, expected.wheelY, `${id}: road-wheel axle clears the lower track run`);
    near(tallTrack.roadWheelRadiusM, expected.wheelR,
      `${id}: tall-track receipt records the installed road-wheel radius`);
    near(tallTrack.roadWheelCenterY, expected.wheelY,
      `${id}: tall-track receipt records the raised road-wheel axle`);
    near(tallTrack.frontIdlerLiftM, 0.04,
      `${id}: shared BV-family receipt records the 40 mm front-idler lift`);
    assert.ok(receipt.wheelY - receipt.wheelR >= 0.205 - EPSILON,
      `${id}: wheel bottoms stay above the lower track-shoe crest datum`);
    near(receipt.shoeRadialScale, 0.46,
      `${id}: thin T-64 shoes preserve wheel-to-track clearance`);
    near(receipt.topY, expected.topY, `${id}: upper track run gains 80 mm`);
    near(receipt.botY, expected.botY, `${id}: loaded lower run stays on its ground datum`);
    near(receipt.idler.y, expected.idlerY, `${id}: idler follows the lifted course`);
    near(receipt.sprocket.y, expected.sprocketY, `${id}: sprocket follows the lifted course`);
    near(tallTrack.authoredEnvelopeHeightM, expected.authoredEnvelopeHeightM,
      `${id}: receipt preserves the authored course height`);
    near(tallTrack.installedEnvelopeHeightM, expected.installedEnvelopeHeightM,
      `${id}: installed track envelope is 80 mm taller`);
    near(tallTrack.hullRideHeightIncreaseM, 0.18,
      `${id}: hull retains the tightened 180 mm ride-height increase`);
    near(tallTrack.lowerHullDropM, 0.08,
      `${id}: belly and lower-glacis underside drop by 80 mm`);
    near(tallTrack.upperHullShiftM, 0,
      `${id}: upper hull remains on its certified datum`);
    near(tallTrack.runningGearShiftM, 0,
      `${id}: wheel centers and track course remain fixed`);
    assert.equal(tallTrack.lowerGlacisExtendedToBelly, true,
      `${id}: lower glacis reaches the lowered belly datum`);
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
    assert.equal(receipt.suspensionPatternId, 't64-torsion-arm',
      `${id}: uses the exposed T-64 torsion-arm geometry`);
    assert.equal(suspensionLinks.count, 12,
      `${id}: one dynamic torsion arm attaches to every road wheel`);
    assert.equal(suspensionJoints.count, 24,
      `${id}: every arm receives a hull pivot and road-wheel axle boss`);
    assert.equal(suspensionLinks.userData.suspensionPattern, 't64-torsion-arm',
      `${id}: visible links retain their T-64 running-gear ownership`);
    assert.equal(suspensionLinks.userData.suspensionGeometryProfile,
      'tapered-forged-arm-v1', `${id}: arms use the shaped forged profile`);
    assert.equal(suspensionLinks.userData.suspensionPlacement,
      'inboard-behind-road-wheel', `${id}: arms remain behind the wheel backs`);

    tank.root.updateMatrixWorld(true);
    const hullBounds = new THREE.Box3().setFromObject(structuralHull);
    near(hullBounds.min.y, expected.hullMinY,
      `${id}: only the belly/lower glacis reaches the lower datum`);
    near(hullBounds.max.y, expected.hullMaxY,
      `${id}: upper hull height remains unchanged`);
    const linkBounds = new THREE.Box3().setFromObject(suspensionLinks);
    assert.ok(linkBounds.max.y >= expected.hullMinY,
      `${id}: torsion-arm hull anchors overlap the lowered sidewall vertically`);
    for (const side of ['left', 'right']) {
      assert.ok(suspensionLinks.userData.assemblyOutboardAbsX[side]
        <= suspensionLinks.userData.wheelInnerAbsX[side]
          - suspensionLinks.userData.wheelClearanceM + EPSILON,
      `${id}: ${side} torsion-arm assembly stays wholly behind the road-wheel back`);
    }

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
    near(turretRig.position.y, 1.48,
      `${id}: turret and gun assembly follows the lowered hull seating`);
    near(turretRig.position.z, expected.turretZ,
      `${id}: complete turret rig moves 200 mm forward`);
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

console.log('t64RunningGearTurretCenter.selftest: T-64BV1 and Donbas seat taller road wheels above the lower track run while preserving the tall-course hull and turret alignment');
