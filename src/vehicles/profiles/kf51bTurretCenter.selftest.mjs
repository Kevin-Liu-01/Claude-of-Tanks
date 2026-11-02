import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { TANK_SPECS } from '../specs.ts';
import { createTankState } from '../../sim/movement.ts';
import { ensureInteriorFills } from '../interiorFills.ts';

await ensureInteriorFills(['kf51_u']);

function verifyGunSeat(quality) {
  const visual = createTank('kf51_u', null, {
    proceduralOnly: true, geometryReceipt: true, quality,
  });
  try {
    const spec = TANK_SPECS.kf51_u;
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
    // 268: the throat cowl reaches back to 0.91 (the rear bulkhead stands at 0.88), the cone forward to 2.45
    closeTo(gun.position.z + bounds.min.z, 0.91, 1e-3);
    closeTo(gun.position.z + bounds.max.z, 2.45, 1e-3);
    // The fixed front shell ends at z=1.95: the housing overlaps its throat
    // by over a metre and projects 500 mm, instead of 350/900 mm.
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
      for (const z of [.92, 1.02, 1.18, 1.40, 1.65, 1.85]) {
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
    const back = hitInTurret(new THREE.Vector3(0, .22, .98), new THREE.Vector3(0, 0, -1), .15);
    assert.ok(back, 'the recess ends at a real rear bulkhead');
    closeTo(turret.worldToLocal(back.point.clone()).z, .88, 1e-5);
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
          // the cheek walls stand at x +/-0.43 and the rear bulkhead at z 0.88 (asserted above)
          assert.ok(Math.abs(point.x) < .425 && point.z > .90,
            `${quality}: moving housing clears the cheek walls and rear bulkhead at ${yaw}/${pitch}`);
        }
      }
    }
    const mountPosition = mount.position.clone();
    visual.recoilKick(0, 1);
    visual.syncFromState(state, .12);
    assert.ok(recoil.position.z < -.05, 'the barrel recoils inside the reseated housing');
    assert.deepEqual(mount.position, mountPosition, 'recoil does not detach or slide the mantlet');
    visual.root.updateMatrixWorld(true);
    recoil.traverseVisible(object => {
      if (object.userData.shadowOnly || object.userData.authoredShadowProxy) return;
      const positions = object.geometry?.getAttribute('position');
      if (!positions) return;
      for (let i = 0; i < positions.count; i++) {
        const point = turret.worldToLocal(object.localToWorld(new THREE.Vector3().fromBufferAttribute(positions, i)));
        assert.ok(point.z > .92,
          `${quality}: recoiling ${object.name} clears the rear bulkhead by at least 40 mm at full elevation`);
      }
    });
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

const tank = createTank('kf51_u', null, {
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
  TANK_SPECS.kf51_u.armor.turretPivot.forEach((value, axis) => {
    closeTo(value, turret.position.getComponent(axis));
  });
  assert.deepEqual(TANK_SPECS.kf51_u.armor.gunPivot, [0, 0.231, 1.239]);
  closeTo(TANK_SPECS.kf51_u.armor.gunBarrel.lengthM, 5.565);
  closeTo(
    TANK_SPECS.kf51_u.armor.turretPivot[2]
      + TANK_SPECS.kf51_u.armor.gunPivot[2]
      + TANK_SPECS.kf51_u.armor.gunBarrel.lengthM,
    7.4865,
  );
  assert.equal(proportions?.turretPivotLocalZ, 0.65,
    'KF51B turret ring moves forward before the uniform vehicle scale');
  assert.equal(proportions?.trackContactMetadataScaled, true,
    'KF51B movement contact metadata follows the enlarged visual hierarchy');
  assert.equal(proportions?.trackHitGeometryScaled, true,
    'KF51B track hit geometry follows the enlarged visual hierarchy');
  assert.ok(gun?.parent === turret,
    'KF51B gun remains owned by the translated turret rig');
  assert.equal(gunHousing?.profile, 'kf51u-conical-mantlet-r5');
  assert.equal(gunHousing?.movingWithGun, true,
    'KF51B mantlet, clamp and thermal shroud elevate with the gun rig');
  assert.equal(gunHousing?.mainHousing, 'conical-mantlet-in-throat-cowl');
  assert.ok(gunHousing?.throatCowlWidthM < 2 * 0.43 && gunHousing?.throatCowlTopUnderCheekRoof === true,
    'KF51-U throat cowl fills the throat inside its cheek walls, under the cheeks\' roof');
  assert.ok(gunHousing?.housingLengthM >= 1.20,
    'KF51B angular mantlet replaces the retired short 390 mm shroud');
  assert.ok(gunHousing?.rearWidthM < gunHousing?.throatCowlWidthM && gunHousing?.forwardWidthM < gunHousing?.rearWidthM,
    'KF51-U cone rises out of its throat cowl and tapers to the clamp');
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

  // Owner 2026-10-27 ("from the side its silhouette should look more like the leopard 2a6s"): the Leopard 2A6 X
  // running gear, recorded here from its source packet rather than read back from the builder.
  const leopard2Stations = [-2.239845, -1.357925, -.483615, .398305, 1.127355, 1.899555, 2.715785];
  assert.equal(runningGear?.wheelR, 0.34531, 'KF51B road wheels are the Leopard 2 wheel');
  assert.ok(Math.abs(runningGear?.wheelY - (runningGear.botY + runningGear.trackTh / 2 + runningGear.wheelR)) < 1e-9,
    'KF51B road wheels rest on the fleet band (ground-datum seat, 2026-09-17)');
  assert.deepEqual(runningGear?.wheelZs, leopard2Stations, 'KF51B rides the Leopard 2 road-wheel stations');
  assert.equal(trackSeat?.runningGear, 'leopard-2a6-x');
  closeTo(proportions?.installedRoadWheelRadiusM, 0.34531 * 1.05);
  assert.deepEqual([runningGear?.sprocket.z, runningGear?.sprocket.y, runningGear?.idler.z, runningGear?.idler.y],
    [-3.058845, .82369, 3.365775, .8399], 'KF51B rear sprocket and raised front idler sit at the Leopard 2 stations');
  assert.ok(skirtArmor?.armorBottomY > runningGear.wheelY + runningGear.wheelR + 0.1,
    'KF51B skirt hem rides over the road-wheel tops, as on the 2A6');
  assert.ok(skirtArmor?.armorBottomY < runningGear.topY,
    'KF51B skirt still covers the return run');
  assert.equal(trackSeat?.trackArcSteps, 14,
    'KF51B terminal wraps use the high-resolution closed course');
  assert.equal(trackSeat?.smoothRearTopTangent, true,
    'KF51B return run leaves the rear sprocket on a smooth tangent');
  for (let i = 1; i < runningGear.loopPoints.length; i++) {
    assert.notDeepEqual(runningGear.loopPoints[i], runningGear.loopPoints[i - 1],
      'KF51B track loop has no consecutive duplicate crown vertices');
  }

  assert.ok(rws?.parent === turret,
    'KF51B open-yoke weapon tower remains turret-owned');
  assert.equal(rws?.userData.designFamily, 'abramsx-open-yoke-v1',
    'KF51B tower shares the Leopard 2A6M open-yoke mechanism');
  assert.equal(rws?.userData.stationVariant, 'kf51b-panther',
    'KF51B tower retains its faceted Panther armor and twin optics');
  assert.equal(rws?.userData.sizeStandard, 'leopard-reduced-tower',
    'KF51B tower uses the same size standard as the Leopard 2A6M');
  assert.equal(rws?.userData.weaponRole, 'roof-primary',
    'KF51B open-yoke station replaces the retired split-shield roof gun');
  assert.deepEqual(attachmentSeat?.roofRws?.mountLocal, [-0.83, 0.644, 0.35]);
  assert.equal(attachmentSeat?.roofRws?.visibleFeedBelt, true);
  // 267 (the real Eurosatory 2024 KF51-U): the three crew ride in the hull under the KF51 front armour's flat crew roof,
  // ahead of the uncrewed turret; the Leopard bow's glacis spare links went under that armour
  const crew = hull?.userData.kf51uCrewStationsReceipt;
  assert.equal(crew?.crewInHull, 3, 'KF51-U seats its three crew in the hull');
  assert.equal(spareLinks === undefined, true, 'KF51-U glacis is the clean KF51 front armour');
  const turretHatches = [];
  turret.traverse((node) => { if (node.isMesh && node.name === 'turretHatch') turretHatches.push(node); });
  assert.equal(turretHatches.length, 0, 'KF51-U turret is uncrewed: no turret hatches');
  assert.equal(attachmentSeat?.uncrewedTurret, true, 'KF51-U publishes its uncrewed turret');
  assert.equal(attachmentSeat?.hullCrewStations, 3, 'KF51-U publishes its three hull crew stations');
  // 268 r13: the sight stands flush in the cheek's own upright face, its window (0.22 m tall) wholly within the face,
  // and the face's shoulder stays under the roof line
  const sight = attachmentSeat?.multispectralSight;
  assert.equal(sight?.mounting, 'upright-cheek-face', 'KF51-U cheek sight sits in the cheek, not on it');
  assert.deepEqual(sight?.centerLocal, [-0.90, 0.385, 1.2906]);
  assert.ok(sight.faceBottomY < sight.apertureCenterY - 0.11 && sight.apertureCenterY + 0.11 < sight.faceTopY
    && sight.faceTopY < roofReceipt.centerHeightM,
    'KF51-U cheek sight window lies within its face, and the face stays under the roof line');
  // 268 r14: the photographed side is plain upright plate with one riveted access panel ahead of mid-length
  const accessPanel = attachmentSeat?.flankAccessPanel;
  assert.ok(accessPanel && accessPanel.z > 0 && accessPanel.proudM > 0 && accessPanel.proudM < 0.02 && accessPanel.wallX > 1.4,
    'KF51-U flank carries its riveted access panel on the upright wall, ahead of mid-length');

  // 268 r15 (owner 11-02, the hull to the turret's paradigm): the photographed KF51-U skirts, five deep chamfered
  // panels a side, no grille
  assert.equal(skirtArmor?.panelsPerSide, 5,
    'KF51-U skirts carry five deep panels a side, as photographed');
  assert.equal(skirtArmor?.protectionRows, 1,
    'KF51-U skirt panels are single deep faces under a chamfered band');
  assert.ok(skirtArmor?.armorOuterFaceX > 1.88,
    'KF51B skirt armor is substantially thicker than the retired thin skin');
  assert.ok(skirtArmor?.chamferBandY[0] > (skirtArmor?.armorBottomY + skirtArmor?.armorTopY) / 2,
    'KF51-U skirt chamfer band rides in the upper half of the skirt');
  assert.equal(skirtArmor?.grilleRetired, true,
    'KF51-U skirts carry no grille (the 2022 Panther\'s)');
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
