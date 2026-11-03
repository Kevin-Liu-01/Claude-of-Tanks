import assert from 'node:assert/strict';
import {
  ROLLOVER_AUTO_RIGHT_S,
  SELF_RIGHT_ANGULAR_MPS,
  SELF_RIGHT_LAUNCH_MPS,
  canSelfRightTank,
  requestTankSelfRight,
  stepBotRollovers,
  stepRolloverLifecycle,
} from './rollover.ts';
import { readFileSync } from 'node:fs';

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

// (268) one rule for both drivers: a bot (a hull its controller drives) rights itself on the timer; a human (the player, a
// couch seat, a network seat) presses SELF_RIGHT; a wreck and an inactive hull are left alone
{
  const hull = (id, extra) => ({ id, combat: { destroyed: false }, state: state(), ...extra });
  const bot = hull('bot', { aiCtl: {} });
  const seat = hull('seat-2', { aiCtl: null });
  const wreck = hull('wreck', { aiCtl: {}, combat: { destroyed: true } });
  const parked = hull('parked', { aiCtl: {}, modeActive: false });
  const righted = [];
  for (let i = 0; i < ROLLOVER_AUTO_RIGHT_S * 60 + 1; i++) stepBotRollovers([bot, seat, wreck, parked], 1 / 60, (entity) => righted.push(entity.id));
  assert.deepEqual(righted, ['bot'], 'only the bot rights itself on the timer');
  for (const [file, call] of [['../game/state.ts', /stepBotRollovers\(game\.tanks, SIM_DT,/], ['./authoritativeMatch.ts', /stepBotRollovers\(entities, dt,/]]) {
    assert.match(readFileSync(new URL(file, import.meta.url), 'utf8'), call, `${file} runs the one rollover rule`);
  }
}

console.log('rollover.selftest: manual and assisted recovery assertions passed; a bot rights itself on the timer on both drivers, a seat, a wreck and an inactive hull never');
