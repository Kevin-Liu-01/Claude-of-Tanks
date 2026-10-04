import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { SIM_DT, createTankState, updateTank } from '../../sim/movement.ts';
// The v1 checkpoint is the layout's origin; it is imported here only to prove byte-for-byte parity.
import { applyMovementPredictionState, captureMovementPredictionState } from '../../sim/movementPredictionState.ts';
import {
  MOVEMENT_CHECKPOINT_VALUES, MOVEMENT_CHECKPOINT_VERSION, applyMovementCheckpoint, captureMovementCheckpoint,
} from './movementCheckpoint.ts';

const SPEC = {
  enginePowerHp: 1500, weightTons: 60, topSpeedKmh: 65, reverseSpeedKmh: 30, hullTraverseDegS: 42,
  turretTraverseDegS: 40, gunPitchDegS: 25, gunElevationDeg: 20, gunDepressionDeg: 10, pivotStyle: 'neutral',
  terrainResistance: { hard: 0.8, medium: 1, soft: 1.8 },
  dims: { hullLengthM: 7.8, overallLengthM: 9.8, widthM: 3.7, heightM: 2.4 },
  gun: { caliberMm: 120, baseAccuracy: 0.3, aimTimeS: 2, bloom: { move: 0.1, hullRot: 0.1, turret: 0.08, afterShot: 3 } },
  armor: { boundingRadiusM: 4.8, turretPivot: [0, 1.5, 0], gunPivot: [0, 0.3, 0.2], gunBarrel: { lengthM: 5.3 } },
};
const height = (x, z) => 0.3 * Math.sin(z / 3) + 0.2 * Math.sin(x / 2.5);
const FIELD = { getHeightAt: height, getHeightAtFast: height, getGroundType: () => 'hard' };

function drive(ticks) {
  const state = createTankState(SPEC, new Vector3(3, height(3, -4), -4), 0.4);
  const entity = { spec: SPEC, state, combat: null, input: { throttle: 1, steer: 0.4, brake: false, aimLocked: false, aimPoint: new Vector3(80, 2, 60) } };
  for (let n = 0; n < ticks; n++) updateTank(entity, FIELD, SIM_DT, null);
  return state;
}

assert.equal(MOVEMENT_CHECKPOINT_VERSION, 7,
  'bots lane (2026-10-02): the roof a hull rests on rides with the integrator; physics lane (2026-10-03): and its gravity tip, then the landing stroke and the dive, then the top track contact, then the side-to-side transfer');
assert.equal(MOVEMENT_CHECKPOINT_VALUES, 55, 'version 4 (48 values) + rebound, stroke, dive, dive rate + top contact + side-to-side transfer and its rate');

const driven = drive(180);
const ours = captureMovementCheckpoint(driven);
const theirs = captureMovementPredictionState(driven);
assert.ok(ours && theirs);
assert.equal(ours.version, theirs.version);
assert.equal(ours.flags, theirs.flags);
assert.deepEqual(ours.values, theirs.values, 'the wire checkpoint is the authority layout value for value');
assert.equal(ours.values.length, MOVEMENT_CHECKPOINT_VALUES);

// Restoring onto a fresh state reproduces the driven integrator exactly (the fields the checkpoint owns).
const restored = createTankState(SPEC, driven.pos, driven.yaw);
assert.equal(applyMovementCheckpoint(restored, ours), true);
const viaV1 = createTankState(SPEC, driven.pos, driven.yaw);
assert.equal(applyMovementPredictionState(viaV1, theirs), true);
assert.deepEqual(captureMovementCheckpoint(restored), ours, 'capture after apply is the identity');
assert.deepEqual(captureMovementCheckpoint(viaV1), ours, 'v1 apply and v2 apply agree');
for (const key of ['yawRate', '_spool', '_swayEst', '_perch', 'atGunLimit']) assert.equal(restored[key], driven[key], key);
assert.deepEqual(restored._ride, driven._ride);
assert.deepEqual(restored._spring, driven._spring);
assert.deepEqual(restored._susp, driven._susp);
assert.equal(restored._sup.rigid, driven._sup.rigid);
assert.equal(restored._sup.cg, null, 'the geometry stays a local reference');

// The wire carries f32: the round trip through Math.fround stays applicable and close.
const rounded = { ...ours, values: ours.values.map((value) => Math.fround(value)) };
const f32 = createTankState(SPEC, driven.pos, driven.yaw);
assert.equal(applyMovementCheckpoint(f32, rounded), true);
assert.ok(Math.abs(f32._ride.y - driven._ride.y) < 1e-4);

// Version 5 appends its four values after the version-4 layout: a version-4 checkpoint (an older authority) still decodes,
// as a hull with no landing stroke or dive in progress.
const midStop = drive(150);
midStop._susp.d = -0.02; midStop._susp.dv = 0.1; midStop._ride.rebound = 1.2; midStop._ride.stroke = 1;
const v5 = captureMovementCheckpoint(midStop);
assert.deepEqual(v5.values.slice(48, 52), [1.2, 1, -0.02, 0.1], 'the version-5 tail is rebound, stroke, dive, dive rate');
const fromV4 = createTankState(SPEC, midStop.pos, midStop.yaw);
fromV4._susp.d = 0.5; fromV4._ride.rebound = 3;
assert.equal(applyMovementCheckpoint(fromV4, { version: 4, values: v5.values.slice(0, 48), flags: v5.flags }), true);
assert.equal(fromV4._ride.y, midStop._ride.y, 'the version-4 prefix restores as before');
assert.deepEqual([fromV4._ride.rebound, fromV4._ride.stroke, fromV4._susp.d, fromV4._susp.dv], [0, 0, 0, 0]);
assert.equal(fromV4._sup.top, fromV4._sup.y, 'and its top contact at its seat');

// Version 6 appends the top track contact after the version-5 layout: a version-5 checkpoint still decodes, its top
// contact at its seat.
midStop._sup.top = midStop._sup.y + 0.07;
const v6 = captureMovementCheckpoint(midStop);
assert.equal(v6.values[52], midStop._sup.top, 'the tail is the top contact');
const fromV6 = createTankState(SPEC, midStop.pos, midStop.yaw);
assert.equal(applyMovementCheckpoint(fromV6, v6), true);
assert.equal(fromV6._sup.top, midStop._sup.top, 'the replay starts with the authority top contact');
const fromV5 = createTankState(SPEC, midStop.pos, midStop.yaw);
assert.equal(applyMovementCheckpoint(fromV5, { version: 5, values: v6.values.slice(0, 52), flags: v6.flags }), true);
assert.deepEqual([fromV5._ride.rebound, fromV5._ride.stroke, fromV5._susp.d, fromV5._susp.dv], [1.2, 1, -0.02, 0.1], 'the version-5 tail restores');
assert.equal(fromV5._sup.top, fromV5._sup.y, 'and its top contact at its seat');

// Version 7 appends the side-to-side transfer and its rate after the version-6 layout: a version-6 checkpoint still
// decodes, with none in progress.
midStop._susp.l = 0.012; midStop._susp.lv = -0.03;
const v7 = captureMovementCheckpoint(midStop);
assert.deepEqual(v7.values.slice(53, 55), [0.012, -0.03], 'the tail is the side-to-side transfer and its rate');
const fromV7 = createTankState(SPEC, midStop.pos, midStop.yaw);
assert.equal(applyMovementCheckpoint(fromV7, v7), true);
assert.deepEqual([fromV7._susp.l, fromV7._susp.lv], [0.012, -0.03], 'the replay starts mid-transfer');
const fromV6Only = createTankState(SPEC, midStop.pos, midStop.yaw);
fromV6Only._susp.l = 0.5; fromV6Only._susp.lv = 1;
assert.equal(applyMovementCheckpoint(fromV6Only, { version: 6, values: v7.values.slice(0, 53), flags: v7.flags }), true);
assert.equal(fromV6Only._sup.top, midStop._sup.top, 'the version-6 tail restores');
assert.deepEqual([fromV6Only._susp.l, fromV6Only._susp.lv], [0, 0], 'and no side-to-side transfer is in progress');

// Rejections leave the state untouched.
const untouched = createTankState(SPEC, new Vector3(), 0);
const before = JSON.stringify(captureMovementCheckpoint(untouched));
assert.equal(applyMovementCheckpoint(untouched, { version: 3, values: ours.values.slice(0, 46), flags: ours.flags }), false);
assert.equal(applyMovementCheckpoint(untouched, { version: 4, values: ours.values, flags: ours.flags }), false, 'a version-4 tag on 55 values');
assert.equal(applyMovementCheckpoint(untouched, { version: 5, values: ours.values, flags: ours.flags }), false, 'a version-5 tag on 55 values');
assert.equal(applyMovementCheckpoint(untouched, { version: 6, values: ours.values, flags: ours.flags }), false, 'a version-6 tag on 55 values');
assert.equal(applyMovementCheckpoint(untouched, { version: 8, values: ours.values, flags: ours.flags }), false);
assert.equal(applyMovementCheckpoint(untouched, { version: 7, values: ours.values.slice(1), flags: ours.flags }), false);
assert.equal(applyMovementCheckpoint(untouched, { version: 7, values: ours.values.map(() => 2e6), flags: ours.flags }), false);
assert.equal(applyMovementCheckpoint(untouched, { version: 7, values: ours.values, flags: 4096 }), false);
assert.equal(JSON.stringify(captureMovementCheckpoint(untouched)), before);

// Version 3: a hull resting on another hull's roof carries that roof; a free hull carries none (flag bit 10 clear).
assert.equal(ours.flags & 1024, 0, 'a hull on the ground carries no roof');
const resting = drive(60);
resting._body.restSupportY = resting.pos.y + 0.4;
const roof = captureMovementCheckpoint(resting);
assert.equal(roof.flags & 1024, 1024, 'a seated hull flags its roof');
assert.deepEqual(roof.values, captureMovementPredictionState(resting).values, 'both encoders carry the roof');
const seated = createTankState(SPEC, resting.pos, resting.yaw);
assert.equal(applyMovementCheckpoint(seated, roof), true);
assert.equal(seated._body.restSupportY, resting._body.restSupportY, 'the replay starts on the roof');
assert.equal(applyMovementCheckpoint(seated, ours), true);
assert.ok(Number.isNaN(seated._body.restSupportY), 'a checkpoint without a roof clears it');

console.log('mp movement checkpoint: 55-value version-7 layout identical to the authority encoder, versions 6, 5 and 4 still decode, the roof a hull rests on carried and cleared, identity after apply, f32 tolerant, typed rejections pass');
