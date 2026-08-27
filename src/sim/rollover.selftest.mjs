import assert from 'node:assert/strict';
import { ROLLOVER_AUTO_RIGHT_S, stepRolloverLifecycle } from './rollover.ts';

function state() {
  return {
    speed: 0,
    verticalSpeed: 0,
    visualPitch: Math.PI,
    visualRoll: 0,
    overturned: true,
    rolloverCountdownS: 0,
    _spring: { pitchV: 0, rollV: 0 },
    _body: { tumbling: true, autoRighting: false },
    _rollover: { elapsedS: 0, expired: false },
  };
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

console.log('rollover.selftest: 9 assertions passed');
