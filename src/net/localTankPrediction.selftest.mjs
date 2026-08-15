import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createTankState } from '../sim/movement.js';
import { LocalTankPredictor } from './localTankPrediction.js';

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

function authority(tick, ackInputSeq, x = 0, z = 0) {
  return {
    tick,
    ackInputSeq,
    entity: {
      x, y: 0, z,
      vx: 0, vz: 0,
      yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0,
      destroyed: false,
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

console.log('localTankPrediction.selftest: replay, correction, and reconnect passed');
