import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.js';

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
  const attachmentSeat = turret?.userData.kf51bAttachmentSeatReceipt;
  const rws = tank.root.getObjectByName('fitting_pintleMG');
  const spareLinks = hull?.children.find((child) => child.userData.fitting === 'spareTrackLinks');

  assert.ok(turret, 'KF51B rotating turret rig exists');
  assert.equal(turret.position.z, 0.30,
    'KF51B turret ring remains centered 0.30 m forward of the hull datum');
  assert.equal(gun?.parent, turret,
    'KF51B gun remains owned by the translated turret rig');

  assert.equal(runningGear?.wheelR, 0.385,
    'KF51B road-wheel radius uses the smaller uncrowded Panther cadence');
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
} finally {
  tank.dispose();
}

console.log('kf51bTurretCenter.selftest: turret, tracks, RWS, roof and panel seating pass');
