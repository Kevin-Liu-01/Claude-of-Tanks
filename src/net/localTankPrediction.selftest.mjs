import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createTankState } from '../sim/movement.js';
import { LocalTankPredictor } from './localTankPrediction.js';
import { SNAPSHOT_FLAGS } from './snapshot.js';

const SPEC = {
  enginePowerHp: 1500,
  weightTons: 60,
  topSpeedKmh: 65,
  reverseSpeedKmh: 30,
  hullTraverseDegS: 42,
  turretTraverseDegS: 40,
  gunPitchDegS: 25,
  gunElevationDeg: 20,
  gunDepressionDeg: 10,
  pivotStyle: 'neutral',
  terrainResistance: { hard: 0.8, medium: 1, soft: 1.8 },
  dims: { hullLengthM: 7.8, overallLengthM: 9.8, widthM: 3.7, heightM: 2.4 },
  gun: {
    caliberMm: 120,
    baseAccuracy: 0.3,
    aimTimeS: 2,
    bloom: { move: 0.1, hullRot: 0.1, turret: 0.08, afterShot: 3 },
  },
  armor: {
    boundingRadiusM: 4.8,
    turretPivot: [0, 1.5, 0],
    gunPivot: [0, 0.3, 0.2],
    gunBarrel: { lengthM: 5.3 },
  },
};

const FIELD = {
  getHeightAt: () => 0,
  getHeightAtFast: () => 0,
  getNormalAt: () => new Vector3(0, 1, 0),
  getGroundType: () => 'hard',
};

function authority(tick, ackInputSeq, x = 0, z = 0, overrides = {}) {
  return {
    tick,
    ackInputSeq,
    entity: {
      x, y: 0, z,
      vx: 0, vz: 0,
      yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0,
      destroyed: false,
      ...overrides,
    },
  };
}

const state = createTankState(SPEC, new Vector3(), 0);
const entity = { spec: SPEC, state, combat: null, contactGeom: null, rigidGear: false };
const predictor = new LocalTankPredictor({ entity, heightField: FIELD });
predictor.reconcile(authority(0, null, 300, -220));
assert.deepEqual(
  { x: entity.state.pos.x, z: entity.state.pos.z },
  { x: 300, z: -220 },
  'the first authority pose seeds presentation directly from the staging origin',
);
assert.deepEqual(
  { reconciliations: predictor.getStats().reconciliations,
    hardSnaps: predictor.getStats().hardSnaps,
    maxPositionErrorM: predictor.getStats().maxPositionErrorM },
  { reconciliations: 0, hardSnaps: 0, maxPositionErrorM: 0 },
  'initial spawn placement is not counted as rubberband correction',
);
predictor.reconcile(authority(1, null, 300, -220));
const driving = {
  throttle: 1, steer: 0, brake: false, fire: false,
  aimYaw: 0, aimPitch: 0, shellSlot: 0,
};
for (let seq = 0; seq < 4; seq++) predictor.recordInput(driving, 1 / 60, seq);
assert.ok(entity.state.pos.z > -220,
  'local input advances presentation before authority returns');
const shownBeforeReconcile = entity.state.pos.z;

predictor.reconcile(authority(3, 1, 300, -220), 0);
assert.equal(predictor.getStats().pendingInputs, 2,
  'authority acknowledgement removes only confirmed input history');
assert.ok(Math.abs(entity.state.pos.z - shownBeforeReconcile) < 1e-9,
  'small reconciliation begins from the already displayed pose');
for (let index = 0; index < 60; index++) predictor.present(1 / 60);
assert.ok(Math.abs(entity.state.pos.z - predictor.simEntity.state.pos.z) < 1e-4,
  'visual correction converges smoothly to replayed authority');

predictor.reconcile(authority(6, 3, 20, 0), 1 / 60);
assert.ok(Math.abs(entity.state.pos.x - 20) < 1e-6,
  'large authority corrections hard-snap instead of dragging across the map');
assert.equal(predictor.getStats().hardSnaps, 1);

predictor.recordInput(driving, 1 / 60, 4);
predictor.recordInput(driving, 1 / 60, 0);
assert.equal(predictor.getStats().pendingInputs, 1,
  'fresh reconnect sequence discards history from the dead transport');

// Browser snapshots expose a clock-corrected own-entity sample alongside the
// raw acknowledged authority row. Inputs are replaceable held states rather
// than commands with server-owned durations, so that sampled path must not
// replay the unacknowledged render-frame dt a second time.
{
  const sampledState = createTankState(SPEC, new Vector3(), 0);
  const sampledEntity = {
    spec: SPEC,
    state: sampledState,
    combat: null,
    contactGeom: null,
    rigidGear: false,
  };
  const sampled = new LocalTankPredictor({ entity: sampledEntity, heightField: FIELD });
  sampled.reconcile(authority(0, null));
  for (let seq = 0; seq < 4; seq++) sampled.recordInput(driving, 1 / 60, seq);
  const sampledTarget = authority(3, 1, 0, 1.25);
  sampledTarget.sampledEntity = { ...sampledTarget.entity, z: 2.5 };
  sampled.reconcile(sampledTarget, 1 / 60);
  assert.equal(sampled.simEntity.state.pos.z, 2.5,
    'clock-corrected authority is not advanced again by pending input durations');
  assert.equal(sampled.getStats().pendingInputs, 2,
    'sampled reconciliation still retains inputs newer than authority acknowledgement');
  assert.equal(sampled.getStats().replayedInputs, 0,
    'browser sampled authority performs no command-style replay');
}

// A parked authority tank can quantize between adjacent support-height and
// hull-angle samples at the 20 Hz snapshot cadence. Presentation must not
// turn that sub-contact-patch noise into a visible 60 Hz vibration. Turret
// and gun articulation remain live because stationary players still aim.
{
  const parkedState = createTankState(SPEC, new Vector3(), 0);
  const parkedEntity = {
    spec: SPEC,
    state: parkedState,
    combat: null,
    contactGeom: null,
    rigidGear: false,
  };
  const parked = new LocalTankPredictor({ entity: parkedEntity, heightField: FIELD });
  parked.reconcile(authority(0, null));
  const samples = [];
  let tick = 0;
  for (let frame = 0; frame < 180; frame++) {
    if (frame % 3 === 0) {
      tick += 3;
      const sign = (frame / 3) % 2 ? -1 : 1;
      parked.reconcile(authority(tick, null, 0, 0, {
        y: sign * 0.01,
        pitch: sign * 0.0015,
        roll: sign * -0.0012,
        turretYaw: tick * 0.00035,
        gunPitch: tick * -0.00012,
      }), 1 / 60);
    } else {
      parked.present(1 / 60);
    }
    if (frame >= 60) samples.push({
      y: parkedEntity.state.pos.y,
      pitch: parkedEntity.state.visualPitch,
      roll: parkedEntity.state.visualRoll,
    });
  }
  const range = (key) => Math.max(...samples.map((sample) => sample[key])) -
    Math.min(...samples.map((sample) => sample[key]));
  assert.ok(range('y') < 0.001,
    `parked local support-height noise is held below 1 mm (range=${range('y')})`);
  assert.ok(range('pitch') < 0.0002 && range('roll') < 0.0002,
    `parked local hull-angle noise is visually stable (pitch=${range('pitch')}, roll=${range('roll')})`);
  assert.ok(Math.abs(parkedEntity.state.turretYaw) > 0.02 &&
    Math.abs(parkedEntity.state.gunPitch) > 0.005,
  'stationary hull stabilization never freezes turret or gun aim');

  const beforeMove = parkedEntity.state.pos.z;
  parked.recordInput(driving, 1 / 30, 1);
  assert.ok(parkedEntity.state.pos.z > beforeMove + 0.0001,
    'real local movement input releases the parked hold immediately');
}

// Reconciliation must seed the complete ballistic state, not just Y. Pending
// input replay then advances the exact shared gravity integrator while leaving
// horizontal momentum intact.
{
  const flightState = createTankState(SPEC, new Vector3(0, 5, 0), 0);
  const flightEntity = {
    spec: SPEC,
    state: flightState,
    combat: null,
    contactGeom: null,
    rigidGear: false,
  };
  const flight = new LocalTankPredictor({ entity: flightEntity, heightField: FIELD });
  flight.reconcile(authority(0, null, 0, 0, {
    y: 5,
    vy: 2,
    vz: 8,
    flags: SNAPSHOT_FLAGS.AIRBORNE,
  }));
  const startY = flightEntity.state.pos.y;
  flight.recordInput(driving, 0.1, 1);
  assert.equal(flightEntity.state.grounded, false,
    'airborne authority phase survives local input replay');
  assert.ok(flightEntity.state.pos.y > startY,
    'positive authority vertical velocity continues upward during replay');
  assert.ok(flightEntity.state.verticalSpeed < 2 && flightEntity.state.verticalSpeed > 0.8,
    `replay integrates gravity into vertical velocity (${flightEntity.state.verticalSpeed})`);
  assert.ok(flightEntity.state.pos.z > 0.7,
    'airborne replay preserves authoritative horizontal momentum');
}

console.log('localTankPrediction.selftest: replay, parked stability, correction, and reconnect passed');
