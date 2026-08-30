import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';

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
  const eraFinish = tank.root.userData.eraFinishReceipt;
  const rws = tank.root.getObjectByName('fitting_pintleMG');
  const spareLinks = hull?.children.find((child) => child.userData.fitting === 'spareTrackLinks');

  assert.ok(turret, 'KF51B rotating turret rig exists');
  closeTo(hull.scale.x, 1.05);
  closeTo(hull.scale.y, 1.05);
  closeTo(hull.scale.z, 1.05);
  closeTo(turret.scale.x, 1.05);
  closeTo(turret.position.z, 0.441);
  assert.equal(proportions?.turretPivotLocalZ, 0.42,
    'KF51B turret ring moves forward before the uniform vehicle scale');
  assert.equal(proportions?.trackContactMetadataScaled, true,
    'KF51B movement contact metadata follows the enlarged visual hierarchy');
  assert.equal(proportions?.trackHitGeometryScaled, true,
    'KF51B track hit geometry follows the enlarged visual hierarchy');
  assert.equal(gun?.parent, turret,
    'KF51B gun remains owned by the translated turret rig');

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
    'KF51B remote weapon station remains turret-owned');
  assert.equal(rws?.position.z, -2.18,
    'KF51B RWS gun foot is pulled back onto its pedestal');
  const rwsAft = rws.position.z + rws.userData.aabb.min[2];
  assert.ok(rwsAft <= -2.295,
    'KF51B RWS fitting overlaps the pedestal front face');
  assert.equal(spareLinks?.position.y, trackSeat?.spareTrackSeatY,
    'KF51B spare links are bedded into the upper glacis');

  assert.equal(attachmentSeat?.roofPeriscopeY, 0.615,
    'KF51B forward roof optics are lowered into the roof skin');
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
