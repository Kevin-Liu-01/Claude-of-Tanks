import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';
import { TANK_SPECS } from '../specs.ts';

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
  assert.deepEqual(TANK_SPECS.kf51b.armor.gunPivot, [0, 0.231, 1.659]);
  closeTo(TANK_SPECS.kf51b.armor.gunBarrel.lengthM, 5.565);
  closeTo(
    TANK_SPECS.kf51b.armor.turretPivot[2]
      + TANK_SPECS.kf51b.armor.gunPivot[2]
      + TANK_SPECS.kf51b.armor.gunBarrel.lengthM,
    7.9065,
  );
  assert.equal(proportions?.turretPivotLocalZ, 0.65,
    'KF51B turret ring moves forward before the uniform vehicle scale');
  assert.equal(proportions?.trackContactMetadataScaled, true,
    'KF51B movement contact metadata follows the enlarged visual hierarchy');
  assert.equal(proportions?.trackHitGeometryScaled, true,
    'KF51B track hit geometry follows the enlarged visual hierarchy');
  assert.equal(gun?.parent, turret,
    'KF51B gun remains owned by the translated turret rig');
  assert.equal(gunHousing?.profile, 'kf51b-panther-angular-mantlet-r2');
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
  assert.deepEqual(gunHousing?.visualGunPivotLocal, [0, 0.22, 1.58]);
  closeTo(gunHousing?.barrelLengthLocalM, 5.30);
  assert.equal(gunHousing?.authoritativePivotAndMuzzlePreserved, true,
    'KF51B visual gun upgrade preserves the certified firing frame');
  assert.equal(roofReceipt?.profile, 'convex-crowned-wedge');
  assert.equal(roofReceipt?.concaveFanRemoved, true,
    'KF51B roof no longer uses the selected concave center fan');
  assert.ok(roofReceipt?.centerAboveHighestEdgeM > 0,
    'KF51B roof center stays above every perimeter station');

  assert.equal(runningGear?.wheelR, 0.355,
    'KF51B road wheels use the smaller revised Panther radius');
  assert.equal(runningGear?.wheelY, 0.395,
    'KF51B smaller road wheels preserve their authored ground clearance');
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

console.log('kf51bTurretCenter.selftest: scale, turret, tracks, skirt armor, RWS and seating pass');
