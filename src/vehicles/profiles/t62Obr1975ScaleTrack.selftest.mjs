import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.js';
import { getSpec } from '../specs.js';

const EPSILON = 1e-6;
const SCALE = 0.90;
const near = (actual, expected, message) => {
  assert.ok(Math.abs(actual - expected) <= EPSILON,
    `${message}: expected ${expected}, received ${actual}`);
};

const tank = createTank('t62mv1', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});

try {
  const spec = getSpec('t62mv1');
  const hull = tank.root.getObjectByName('rig_hull');
  const turret = tank.root.getObjectByName('rig_turret');
  const gun = tank.root.getObjectByName('rig_gun');
  assert.ok(hull && turret && gun?.parent === turret,
    'T-62 retains independent articulated hull, turret and gun rigs');
  assert.deepEqual([
    spec.dims.hullLengthM,
    spec.dims.overallLengthM,
    spec.dims.widthM,
    spec.dims.heightM,
  ], [5.967, 8.406, 3.267, 2.16],
  'published dimensions are exactly 90% of the previous vehicle');
  assert.deepEqual([
    spec.dims.silhouetteHullLengthM,
    spec.dims.silhouetteOverallLengthM,
    spec.dims.silhouetteHeightM,
  ], [6.354, 8.964, 2.466],
  'registered silhouette dimensions use the same uniform reduction');

  for (const rig of [hull, turret]) {
    near(rig.scale.x, SCALE, `${rig.name} scales uniformly in x`);
    near(rig.scale.y, SCALE, `${rig.name} scales uniformly in y`);
    near(rig.scale.z, SCALE, `${rig.name} scales uniformly in z`);
  }
  assert.deepEqual(turret.position.toArray(), [0, 1.4804 * SCALE, 0.676 * SCALE],
    'turret pivot follows the reduced hull deck and ring center');

  const receipt = hull.userData.t62Obr1975ScaleTrackReceipt;
  const gear = hull.userData.runningGearReceipts?.[0];
  assert.deepEqual(receipt, {
    revision: 't62-obr1975-compact-track-wrap-r1',
    vehicleScale: SCALE,
    roadWheelStations: 5,
    linkedTrackCourse: true,
    targetShoePitchM: 0.135 * SCALE,
    fittedShoePitchM: gear.shoePitchM * SCALE,
    endArcSteps: 12,
    returnSagM: 0.050 * SCALE,
  }, 'profile publishes the compact articulated-track contract');
  assert.equal(hull.userData.nativeRoadWheelStations, 5,
    'five road-wheel stations remain suspension driven');
  assert.deepEqual(gear.wheelZs,
    [2.235, 1.297, 0.293, -0.791, -1.933],
  'road-wheel receipts retain the track mesh hull-local coordinate frame');
  assert.ok(gear.shoePitchM * SCALE <= 0.135 * SCALE
    && gear.shoePitchM * SCALE >= 0.132 * SCALE,
  'visible linked shoes remain within one small fraction of the scaled target pitch');
  assert.ok(gear.shoeCountPerSide >= 105,
    'dense shoe count rounds cleanly around both terminal wheels');

  const topSupportY = 0.455 + 0.42 + 0.045 - 0.02;
  for (const wheelZ of gear.wheelZs) {
    assert.ok(gear.loopPoints.some(([z, y]) => Math.abs(z - wheelZ) <= EPSILON
      && Math.abs(y - topSupportY) <= EPSILON),
    `return run bends onto road-wheel crown at z=${wheelZ}`);
    assert.ok(gear.loopPoints.some(([z, y]) => Math.abs(z - wheelZ) <= EPSILON
      && Math.abs(y - 0.02) <= EPSILON),
    `loaded run articulates below road wheel at z=${wheelZ}`);
  }
  const frontWrapPoints = gear.loopPoints.filter(([z]) => z > gear.idler.z + 0.01);
  const rearWrapPoints = gear.loopPoints.filter(([z]) => z < gear.sprocket.z - 0.01);
  assert.ok(frontWrapPoints.length >= 10 && rearWrapPoints.length >= 10,
    'both end wheels receive fine curved wrap sampling');
} finally {
  tank.dispose();
}

console.log('t62Obr1975ScaleTrack.selftest: uniform 90% scale and articulated five-wheel track wrap passed');
