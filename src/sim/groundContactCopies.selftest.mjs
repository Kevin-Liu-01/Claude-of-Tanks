/**
 * groundContactCopies.selftest.mjs — a hull's ground contact has two copies, `state.grounded` (what the step reads as
 * groundedAtStart, and what the snapshot row's AIRBORNE flag carries) and `_ride.grounded` (what the viewer checkpoint
 * carries). Every writer sets both through one setter (audit 2026-11-02, M8 lane), so no path can leave them apart: the
 * client used to take the first from the row and the second from the checkpoint, equal only because the authority
 * happened to write them together.
 * Run with: node src/sim/groundContactCopies.selftest.mjs
 */
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { SIM_DT, createTankState, requestTankJump, resetTankVerticalState, updateTank } from './movement.ts';
import { applyMovementPredictionState, captureMovementPredictionState } from './movementPredictionState.ts';
import { requestTankSelfRight } from './rollover.ts';

const SPEC = {
  enginePowerHp: 1500, weightTons: 60, topSpeedKmh: 65, reverseSpeedKmh: 30, hullTraverseDegS: 42,
  turretTraverseDegS: 40, gunPitchDegS: 25, gunElevationDeg: 20, gunDepressionDeg: 10, pivotStyle: 'neutral',
  terrainResistance: { hard: 0.8, medium: 1, soft: 1.8 },
  dims: { hullLengthM: 7.8, overallLengthM: 9.8, widthM: 3.7, heightM: 2.4 },
  gun: { caliberMm: 120, baseAccuracy: 0.3, aimTimeS: 2, bloom: { move: 0.1, hullRot: 0.1, turret: 0.08, afterShot: 3 } },
  armor: { boundingRadiusM: 4.8, turretPivot: [0, 1.5, 0], gunPivot: [0, 0.3, 0.2], gunBarrel: { lengthM: 5.3 } },
};
const FIELD = { getHeightAt: () => 0, getGroundType: () => 'hard' };
const agree = (state, label) => assert.equal(state.grounded, state._ride.grounded, `${label}: both copies agree`);

function grounded() {
  const state = createTankState(SPEC, new Vector3(0, 0, 0), 0);
  const entity = { spec: SPEC, state, combat: null, input: { throttle: 0, steer: 0, brake: false, aimPoint: null } };
  for (let tick = 0; tick < 30; tick++) updateTank(entity, FIELD, SIM_DT);
  return { state, entity };
}

{
  const { state, entity } = grounded();
  agree(state, 'a settled hull');
  assert.equal(requestTankJump(state, 6), true);
  assert.equal(state.grounded, false);
  agree(state, 'a jump');
  updateTank(entity, FIELD, SIM_DT);
  agree(state, 'a step in flight');
  resetTankVerticalState(state, 0);
  assert.equal(state.grounded, true);
  agree(state, 'a vertical reset');
}

{
  const { state } = grounded();
  state.visualRoll = state._spring.roll = Math.PI / 2 + 0.3;
  state.overturned = true;
  state._body.tumbling = true;
  assert.equal(requestTankSelfRight(state), true);
  agree(state, 'the self-right launch');
}

// the checkpoint is the integrator's truth: a restore sets both copies from it, whatever the row said before
{
  const { state: authority } = grounded();
  const checkpoint = captureMovementPredictionState(authority);
  const client = createTankState(SPEC, new Vector3(0, 0.4, 0), 0);
  client.grounded = false; // a stale or reordered AIRBORNE row
  assert.equal(applyMovementPredictionState(client, checkpoint), true);
  assert.equal(client._ride.grounded, true, 'the checkpoint restores the ride on the ground');
  agree(client, 'a checkpoint restore');
}

console.log('groundContactCopies.selftest: jump, flight, reset, self-right and checkpoint restore keep both copies together');
