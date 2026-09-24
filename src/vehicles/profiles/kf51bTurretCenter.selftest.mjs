import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { TANK_SPECS } from '../specs.ts';
import { createTankState } from '../../sim/movement.ts';
import { ensureInteriorFills } from '../interiorFills.ts';

await ensureInteriorFills(['kf51b']);

function verifyGunSeat(quality) {
  const visual = createTank('kf51b', null, {
    proceduralOnly: true, geometryReceipt: true, quality,
  });
  try {
    const spec = TANK_SPECS.kf51b;
    const state = createTankState(spec, new THREE.Vector3(), 0);
    const turret = visual.root.getObjectByName('rig_turret');
    const gun = visual.root.getObjectByName('rig_gun');
    const mount = visual.root.getObjectByName('gunMount');
    const recoil = visual.root.getObjectByName('rig_recoil');
    const muzzle = visual.root.getObjectByName('rig_muzzle');
    assert.ok(mount.parent === gun, 'the selected housing stays on the elevating cradle');
    assert.ok(recoil.parent === gun, 'barrel and housing share the reseated gun joint');
    mount.geometry.computeBoundingBox();
    const bounds = mount.geometry.boundingBox;
    closeTo(gun.position.z + bounds.min.z, 1.20, 1e-6);
    closeTo(gun.position.z + bounds.max.z, 2.45, 1e-6);
    // The fixed front shell ends at z=1.95: the housing now overlaps its
    // throat by 750 mm and projects 500 mm, instead of 350/900 mm.
    assert.ok(1.95 - (gun.position.z + bounds.min.z) > .70,
      'the actual housing rear is buried in the turret throat');
    assert.ok(gun.position.z + bounds.max.z - 1.95 < .55,
      'the actual housing no longer projects nearly a metre beyond the turret');
    visual.root.updateMatrixWorld(true);
    const fixed = [];
    turret.traverseVisible(object => {
      if (!object.isMesh || object.userData.shadowOnly || object.userData.authoredShadowProxy) return;
      for (let owner = object; owner; owner = owner.parent) if (owner === gun) return;
      fixed.push(object);
    });
    const ray = new THREE.Raycaster();
    const hitInTurret = (origin, direction, distance) => {
      ray.set(turret.localToWorld(origin.clone()), direction.transformDirection(turret.matrixWorld));
      ray.far = distance * turret.scale.x;
      return ray.intersectObjects(fixed, false)[0];
    };
    // Real air through the fore-roof: a dark patch over the old loft, an
    // uncut lower cheek or stale generated interior backing all fail this.
    for (const x of [-.40, -.20, 0, .20, .40]) {
      for (const z of [1.02, 1.18, 1.40, 1.65, 1.85]) {
        // Stop at the turret floor; the rear bearing ring below it remains
        // real stock and sits behind the moving housing's z >= 1.09 limit.
        const hit = hitInTurret(new THREE.Vector3(x, .80, z), new THREE.Vector3(0, -1, 0), .80);
        assert.ok(!hit,
          `${quality}: fixed armor must leave real elevation clearance at ${x}/${z}; hit ${hit?.object.name}`);
      }
    }
    for (const side of [-1, 1]) {
      const hit = hitInTurret(new THREE.Vector3(side * .38, .22, 1.18), new THREE.Vector3(side, 0, 0), .10);
      assert.ok(hit, `${quality}: recess has a closed inner cheek supporting the trunnion`);
      closeTo(Math.abs(turret.worldToLocal(hit.point.clone()).x), .43, 1e-5);
    }
    assert.ok(hitInTurret(new THREE.Vector3(0, .22, 1.04), new THREE.Vector3(0, 0, -1), .15),
      'the recess ends at a real rear bulkhead');
    for (const yaw of [0, 90, 180, -90]) {
      for (const pitch of [-spec.gunDepressionDeg, 0, 10, spec.gunElevationDeg]) {
        state.turretYaw = THREE.MathUtils.degToRad(yaw);
        state.gunPitch = THREE.MathUtils.degToRad(pitch);
        visual.syncFromState(state, 0);
        visual.root.updateMatrixWorld(true);
        const expectedPivot = new THREE.Vector3(...spec.armor.gunPivot)
          .divide(turret.scale).applyMatrix4(turret.matrixWorld);
        assert.ok(gun.getWorldPosition(new THREE.Vector3()).distanceTo(expectedPivot) < 1e-8,
          `${quality}: rendered and authoritative trunnions align at ${yaw}/${pitch}`);
        const expectedMuzzle = new THREE.Vector3(0, 0, spec.armor.gunBarrel.lengthM)
          .applyAxisAngle(new THREE.Vector3(1, 0, 0), -state.gunPitch)
          .add(new THREE.Vector3(...spec.armor.gunPivot))
          .divide(turret.scale).applyMatrix4(turret.matrixWorld);
        assert.ok(muzzle.getWorldPosition(new THREE.Vector3()).distanceTo(expectedMuzzle) < 1e-6,
          `${quality}: visible muzzle stays aligned with the firing frame at ${yaw}/${pitch}`);
        const selectedCorner = new THREE.Vector3(.245, -.135, 1.27);
        assert.ok(mount.localToWorld(selectedCorner.clone())
          .distanceTo(gun.localToWorld(selectedCorner.clone())) < 1e-8,
        'the marked side moves with the gun throughout the sweep');
        const position = mount.geometry.getAttribute('position');
        for (let i = 0; i < position.count; i++) {
          const point = turret.worldToLocal(mount.localToWorld(new THREE.Vector3().fromBufferAttribute(position, i)));
          assert.ok(Math.abs(point.x) < .38 && point.z > 1.09,
            `${quality}: moving housing clears the cheek walls and rear bulkhead at ${yaw}/${pitch}`);
        }
      }
    }
    const mountPosition = mount.position.clone();
    visual.recoilKick(0, 1);
    visual.syncFromState(state, .12);
    assert.ok(recoil.position.z < -.05, 'the barrel recoils inside the reseated housing');
    assert.deepEqual(mount.position, mountPosition, 'recoil does not detach or slide the mantlet');
    visual.syncFromState(state, 1);
    closeTo(recoil.position.z, 0);
  } finally {
    visual.dispose();
  }
}

const closeTo = (actual, expected, epsilon = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`);
};

const tank = createTank('kf51b', null, {
  proceduralOnly: true,
  geometryReceipt: true,
});

try {
  const turret = tank.root.getObjectByName('rig_turret');
  const gun = tank.root.getObjectByName('rig_gun');
  const hull = tank.root.getObjectByName('rig_hull');
  const runningGear = hull?.userData.runningGearReceipts?.[0];
  const trackSeat = hull?.userData.kf51bTrackSeatReceipt;
  const skirtArmor = hull?.userData.kf51bSkirtArmorReceipt;
  const proportions = hull?.userData.kf51bProportionReceipt;
  const attachmentSeat = turret?.userData.kf51bAttachmentSeatReceipt;
  const roofReceipt = turret?.userData.kf51bTurretRoofReceipt;
  const gunHousing = gun?.userData.kf51bAngularGunHousingReceipt;
  const eraFinish = tank.root.userData.eraFinishReceipt;
  const rws = tank.root.getObjectByName('kf51bRoofOpenYokeRws');
  const spareLinks = hull?.children.find((child) => child.userData.fitting === 'spareTrackLinks');

  assert.ok(turret, 'KF51B rotating turret rig exists');
  closeTo(hull.scale.x, 1.05);
  closeTo(hull.scale.y, 1.05);
  closeTo(hull.scale.z, 1.05);
  closeTo(turret.scale.x, 1.05);
  closeTo(turret.position.z, 0.6825);
  TANK_SPECS.kf51b.armor.turretPivot.forEach((value, axis) => {
    closeTo(value, turret.position.getComponent(axis));
  });
  assert.deepEqual(TANK_SPECS.kf51b.armor.gunPivot, [0, 0.231, 1.239]);
  closeTo(TANK_SPECS.kf51b.armor.gunBarrel.lengthM, 5.565);
  closeTo(
    TANK_SPECS.kf51b.armor.turretPivot[2]
      + TANK_SPECS.kf51b.armor.gunPivot[2]
      + TANK_SPECS.kf51b.armor.gunBarrel.lengthM,
    7.4865,
  );
  assert.equal(proportions?.turretPivotLocalZ, 0.65,
    'KF51B turret ring moves forward before the uniform vehicle scale');
  assert.equal(proportions?.trackContactMetadataScaled, true,
    'KF51B movement contact metadata follows the enlarged visual hierarchy');
  assert.equal(proportions?.trackHitGeometryScaled, true,
    'KF51B track hit geometry follows the enlarged visual hierarchy');
  assert.equal(gun?.parent, turret,
    'KF51B gun remains owned by the translated turret rig');
  assert.equal(gunHousing?.profile, 'kf51b-panther-angular-mantlet-r3');
  assert.equal(gunHousing?.movingWithGun, true,
    'KF51B mantlet, clamp and thermal shroud elevate with the gun rig');
  assert.equal(gunHousing?.mainHousing, 'closed-tapered-six-plane-wedge');
  assert.ok(gunHousing?.housingLengthM >= 1.20,
    'KF51B angular mantlet replaces the retired short 390 mm shroud');
  assert.ok(gunHousing?.rearWidthM >= 0.72 && gunHousing?.rearWidthM < 0.78,
    'KF51B mantlet fills the turret throat without dominating the front');
  assert.ok(gunHousing?.rearHeightM <= 0.43 && gunHousing?.forwardWidthM <= 0.49,
    'KF51B surrounding armor stays compact around the preserved gun course');
  assert.equal(gunHousing?.forwardClampSides, 6,
    'KF51B mantlet terminates in a faceted armored clamp');
  assert.equal(gunHousing?.forwardClampRadiusM, 0.175,
    'KF51B nose clamp scales down with the surrounding mantlet armor');
  assert.equal(gunHousing?.thermalShroudCourses, 2,
    'KF51B gun carries a stepped two-course thermal jacket');
  assert.equal(gunHousing?.cinchRingCount, 3,
    'KF51B thermal jacket has three readable structural cinches');
  assert.equal(gunHousing?.compactRoundShroudRetired, true);
  assert.deepEqual(gunHousing?.visualGunPivotLocal, [0, 0.22, 1.18]);
  closeTo(gunHousing?.rearwardSeatLocalM, 0.40);
  closeTo(gunHousing?.barrelLengthLocalM, 5.30);
  assert.equal(gunHousing?.authoritativePivotAndMuzzleAligned, true,
    'KF51B visual gun seat matches the updated authoritative firing frame');
  assert.equal(roofReceipt?.profile, 'convex-crowned-wedge');
  assert.equal(roofReceipt?.concaveFanRemoved, true,
    'KF51B roof no longer uses the selected concave center fan');
  assert.ok(roofReceipt?.centerAboveHighestEdgeM > 0,
    'KF51B roof center stays above every perimeter station');

  assert.equal(runningGear?.wheelR, 0.355,
    'KF51B road wheels use the smaller revised Panther radius');
  assert.ok(Math.abs(runningGear?.wheelY - (runningGear.botY + runningGear.trackTh / 2 + runningGear.wheelR)) < 1e-9,
    'KF51B smaller road wheels rest on the fleet band (ground-datum seat, 2026-09-17)');
  closeTo(runningGear?.wheelZs[0], 2.72);
  closeTo(runningGear?.wheelZs.at(-1), -2.18);
  assert.equal(trackSeat?.roadWheelForwardShiftM, 0.12,
    'KF51B seven-wheel course is moved forward as one coherent cadence');
  closeTo(proportions?.installedRoadWheelRadiusM, 0.37275);
  assert.equal(runningGear?.idler.z, 3.40,
    'KF51B idler is reseated forward of the glacis shoulder');
  assert.equal(trackSeat?.trackArcSteps, 14,
    'KF51B terminal wraps use the high-resolution closed course');
  assert.equal(trackSeat?.smoothRearTopTangent, true,
    'KF51B return run leaves the rear sprocket on a smooth tangent');
  for (let i = 1; i < runningGear.loopPoints.length; i++) {
    assert.notDeepEqual(runningGear.loopPoints[i], runningGear.loopPoints[i - 1],
      'KF51B track loop has no consecutive duplicate crown vertices');
  }

  assert.equal(rws?.parent, turret,
    'KF51B open-yoke weapon tower remains turret-owned');
  assert.equal(rws?.userData.designFamily, 'abramsx-open-yoke-v1',
    'KF51B tower shares the Leopard 2A6M open-yoke mechanism');
  assert.equal(rws?.userData.stationVariant, 'kf51b-panther',
    'KF51B tower retains its faceted Panther armor and twin optics');
  assert.equal(rws?.userData.sizeStandard, 'leopard-reduced-tower',
    'KF51B tower uses the same size standard as the Leopard 2A6M');
  assert.equal(rws?.userData.weaponRole, 'roof-primary',
    'KF51B open-yoke station replaces the retired split-shield roof gun');
  assert.deepEqual(attachmentSeat?.roofRws?.mountLocal, [0.30, 0.55, -2.16]);
  assert.equal(attachmentSeat?.roofRws?.visibleFeedBelt, true);
  assert.equal(spareLinks?.position.y, trackSeat?.spareTrackSeatY,
    'KF51B spare links are bedded into the upper glacis');

  assert.equal(attachmentSeat?.roofPeriscopeY, 0.615,
    'KF51B forward roof optics are lowered into the roof skin');
  assert.deepEqual(attachmentSeat?.multispectralSight?.centerLocal, [-0.74, 0.52, 1.27],
    'KF51B multispectral sight housing rises above the fore-roof skin');
  closeTo(attachmentSeat?.multispectralSight?.apertureCenterY, 0.57);
  assert.ok(attachmentSeat?.multispectralSight?.apertureCenterY > 0.56,
    'KF51B multispectral apertures rise with their armored housing');
  assert.equal(attachmentSeat?.multispectralSight?.liftM, 0.18,
    'KF51B sight lift remains an explicit local-frame seating adjustment');
  assert.equal(attachmentSeat?.multispectralSight?.rigidApertureLift, true,
    'KF51B sight glass cannot detach from its raised housing');
  assert.equal(attachmentSeat?.sidePanelStations.length, 7,
    'KF51B carries a complete seven-station flank panel course');
  for (let i = 1; i < attachmentSeat.sidePanelStations.length; i++) {
    assert.ok(attachmentSeat.sidePanelStations[i].wallX
      < attachmentSeat.sidePanelStations[i - 1].wallX + 0.06,
    'KF51B flank panels follow the taper instead of staying on one fixed X plane');
  }

  assert.equal(skirtArmor?.panelsPerSide, 7,
    'KF51B skirt jacket preserves its seven-module Panther cadence');
  assert.equal(skirtArmor?.protectionRows, 2,
    'KF51B skirt modules carry two readable protection faces');
  assert.ok(skirtArmor?.armorOuterFaceX > 1.88,
    'KF51B skirt armor is substantially thicker than the retired thin skin');
  assert.ok(skirtArmor?.grilleY[0] > skirtArmor?.armorBottomY + 0.70,
    'KF51B signature grille is reseated into the upper service band');
  assert.equal(skirtArmor?.grilleReseatedAboveArmor, true,
    'KF51B grille no longer masks the running gear and armor course');
  assert.equal(skirtArmor?.continuousUpperCarrier, true,
    'KF51B skirt modules have a continuous load path into the hull sponson');
  assert.ok(eraFinish?.visualSectors.includes('kf51b-hull-skirt-era'),
    'KF51B protection course is registered as static visual external armor');
  assert.equal(eraFinish?.semanticBucket, 'externalArmor',
    'KF51B skirt armor stays outside the base hull-envelope merge');
  assert.equal(eraFinish?.perFrameWork, false,
    'KF51B skirt armor adds no per-frame update cost');
} finally {
  tank.dispose();
}

for (const quality of ['high', 'low']) verifyGunSeat(quality);

console.log('kf51bTurretCenter.selftest: scale, turret, tracks, skirt armor, RWS, gun seat and articulation pass');
