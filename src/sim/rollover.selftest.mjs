import assert from 'node:assert/strict';
import {
  ROLLOVER_AUTO_RIGHT_S,
  SELF_RIGHT_ANGULAR_MPS,
  SELF_RIGHT_LAUNCH_MPS,
  canSelfRightTank,
  requestTankSelfRight,
  stepRolloverLifecycle,
} from './rollover.ts';

function state() {
  return {
    speed: 0,
    verticalSpeed: 0,
    grounded: true,
    visualPitch: Math.PI,
    visualRoll: 0,
    overturned: true,
    rolloverCountdownS: 0,
    _spring: { pitchV: 0, rollV: 0 },
    _body: { tumbling: true, autoRighting: false },
    _terr: { pitch: 0, roll: 0 },
    _ride: { y: 1, v: 0, airTime: 0 },
    _rollover: { elapsedS: 0, expired: false },
  };
}

{
  const tank = state();
  assert.equal(canSelfRightTank(tank), true, 'a grounded overturned tank exposes recovery');
  assert.equal(requestTankSelfRight(tank), true, 'the recovery edge is accepted once');
  assert.equal(tank._body.autoRighting, true, 'recovery engages the damped actuator');
  assert.equal(tank._ride.v, SELF_RIGHT_LAUNCH_MPS, 'recovery applies a visible upward shove');
  assert.equal(Math.abs(tank._spring.pitchV), SELF_RIGHT_ANGULAR_MPS,
    'roof-down recovery applies a bounded shortest-axis angular shove');
  assert.equal(requestTankSelfRight(tank), false, 'an active recovery cannot be spammed');
  assert.equal(canSelfRightTank({ ...state(), grounded: false }), false,
    'an airborne tank cannot stack another launch impulse');
}

{
  const tank = state();
  for (let i = 0; i < ROLLOVER_AUTO_RIGHT_S * 60 - 1; i++) {
    assert.equal(stepRolloverLifecycle(tank, 1 / 60), false);
  }
  assert.ok(tank.rolloverCountdownS > 0, 'settled rollover retains its final recovery tick');
  assert.equal(stepRolloverLifecycle(tank, 1 / 60), true,
    'settled roof-down tank begins assisted recovery after exactly fifteen seconds');
  assert.equal(tank._body.autoRighting, true, 'assisted recovery is explicit movement state');
  assert.equal(stepRolloverLifecycle(tank, 1 / 60), false,
    'assisted recovery is emitted only once');
}

{
  const tank = state();
  for (let i = 0; i < 900; i++) stepRolloverLifecycle(tank, 1 / 60);
  tank._spring.rollV = 0.4;
  stepRolloverLifecycle(tank, 1 / 60);
  assert.equal(tank._rollover.elapsedS, 0, 'a physical righting shove restarts the recovery window');
  tank._spring.rollV = 0;
  tank.overturned = false;
  tank._body.tumbling = false;
  tank.visualPitch = 0;
  stepRolloverLifecycle(tank, 1 / 60);
  assert.equal(tank.rolloverCountdownS, 0, 'upright recovery clears the rollover lifecycle');
}

console.log('rollover.selftest: manual and assisted recovery assertions passed');
