// turboSpin.selftest.mjs — Turbo and the air spin (turbo-spin-275; owner 2026-11-22: "for turbo ball and gravity mode add
// another thing with going up called turbo - it makes you go launch forward for a short bit ... f should also be an official
// command so u can literally spin in air but only if ur in air (gray if ur not)"; he picked F in the air, flips and rolls,
// Z and a 3 s cooldown). Copyright (c) 2026 Kevin B. Liu.
//
// Pins, on the shared per-hull action step both drivers call (sim/hullActions.ts):
//   - only Turbo Ball and Gravity (mars) carry Turbo and the air spin; every other mode carries neither, and a press there
//     does nothing;
//   - Turbo: the forward leap on the ground (speed and a hop) and in flight (speed, the fall stopped), never past the
//     launch cap; refused while it cools and for a hull on its roof on the ground; taken again once the cooldown has run;
//   - F (SELF_RIGHT): a jump on the ground, a flip or roll in flight (no rocket re-boost), the axis from the drive (W or
//     nothing a front flip, S a back flip, A a roll left, D a roll right); one whole turn, then the axis stops and the
//     hull lands on its tracks; a second press mid-turn is refused;
//   - the air spin's own bit flips in flight and never jumps on the ground;
//   - the ground ends a turn; two runs of the same presses are bit-identical; a replay from a mid-flip checkpoint
//     (movementPredictionState.ts version 10) follows the original exactly.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createTankState, updateTank, SIM_DT, AIR_SPIN_AXES, airSpinAxisFor, canTankAirSpin } from './movement.ts';
import { matchRulesetFor } from './matchRuleset.ts';
import { applyHullActions, turboReadyIn } from './hullActions.ts';
import { PLAYER_ACTION_BITS } from './playerActions.ts';
import { applyMovementPredictionState, captureMovementPredictionState } from './movementPredictionState.ts';

const SPEC = {
  name: 'fixture-mbt', enginePowerHp: 1200, weightTons: 50, topSpeedKmh: 65, reverseSpeedKmh: 15,
  hullTraverseDegS: 36, turretTraverseDegS: 36, gunPitchDegS: 24, gunElevationDeg: 25, gunDepressionDeg: 10,
  pivotStyle: 'pivot', terrainResistance: { hard: 1.0, medium: 1.2, soft: 2.2 },
  dims: { hullLengthM: 6.27, overallLengthM: 7.52, widthM: 3.0, heightM: 2.97 },
  gun: { caliberMm: 120, baseAccuracy: 0.38, aimTimeS: 2.3, reloadS: 6, bloom: { move: 0.2, hullRot: 0.2, turret: 0.12, afterShot: 4 } },
  armor: { boundingRadiusM: 3.8, turretPivot: [0, 1.55, 0], gunPivot: [0, 0.25, 0.3], gunBarrel: { lengthM: 4.0 } },
};
const field = { getHeightAt: () => 0, getNormalAt: () => null, getGroundType: () => 'medium' };
const LAUNCH_CAP = 45;

function hull(mode) {
  const r = matchRulesetFor(mode);
  return {
    id: mode, spec: SPEC, state: createTankState(SPEC, new Vector3(0, 0, 0), 0),
    input: { throttle: 0, steer: 0, brake: false, aimPoint: null, actionBits: 0 },
    combat: { destroyed: false }, modeGravityScale: r.gravityScale, modePhysics: r.physics, modeSpeedMultiplier: r.speedMultiplier,
    modeJumpMps: r.jumpMps, modeTurbo: r.turbo, modeAirSpin: r.airSpin,
  };
}
const heard = [];
const clock = { t: 0 };
const host = {
  get timeS() { return clock.t; }, verdict: false, consumables: false, rng: () => 0.5, ground: () => 0, world: null, wind: null,
  supply() {}, smokeLaunched() {}, turboed: (e) => heard.push(['turbo', e.id]), airSpun: (e) => heard.push(['spin', e.id]),
  selfRighted: (e) => heard.push(['right', e.id]),
};
function tick(entity, bits = 0) {
  entity.input.actionBits = bits;
  applyHullActions(entity, host);
  updateTank(entity, field, SIM_DT, null);
  clock.t += SIM_DT;
}
function run(entity, ticks) { for (let n = 0; n < ticks; n++) tick(entity); }
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ---- which modes
for (const mode of ['turbo_ball', 'mars']) {
  const r = matchRulesetFor(mode);
  assert.ok(r.turbo && r.turbo.forwardMps > 0 && r.turbo.cooldownS === 3, `${mode} carries Turbo with the 3 s cooldown`);
  assert.equal(r.airSpin, true, `${mode} carries the air spin`);
  assert.ok(r.jumpMps > 0, `${mode} is a jump mode`);
}
for (const mode of ['standard', 'capture_the_flag', 'zone_control', 'air_support', 'drone']) {
  const r = matchRulesetFor(mode);
  assert.equal(r.turbo, null, `${mode} has no Turbo`);
  assert.equal(r.airSpin, false, `${mode} has no air spin`);
  const e = hull(mode);
  run(e, 120);
  const speed = e.state.speed;
  tick(e, PLAYER_ACTION_BITS.TURBO | PLAYER_ACTION_BITS.AIR_SPIN);
  assert.ok(Math.abs(e.state.speed - speed) < 0.5 && e.state.grounded, `${mode}: the presses do nothing`);
}

// ---- the axis a press picks
assert.equal(airSpinAxisFor(0, 0), AIR_SPIN_AXES.FRONT_FLIP, 'no drive held: a front flip');
assert.equal(airSpinAxisFor(1, 0), AIR_SPIN_AXES.FRONT_FLIP, 'W: a front flip');
assert.equal(airSpinAxisFor(-1, 0), AIR_SPIN_AXES.BACK_FLIP, 'S: a back flip');
assert.equal(airSpinAxisFor(0, 1), AIR_SPIN_AXES.ROLL_LEFT, 'A (steer +): a roll left');
assert.equal(airSpinAxisFor(1, -1), AIR_SPIN_AXES.FRONT_FLIP, 'W and D held alike: the flip (a roll needs the steer stronger)');
assert.equal(airSpinAxisFor(0.5, -0.9), AIR_SPIN_AXES.ROLL_RIGHT, 'D stronger than W: a roll right');

// ---- Turbo on the ground and in the air
for (const mode of ['turbo_ball', 'mars']) {
  const turbo = matchRulesetFor(mode).turbo;
  const e = hull(mode); clock.t = 0; heard.length = 0;
  e.input.throttle = 1; run(e, 600);
  const speed = e.state.speed;
  assert.ok(e.state.grounded, `${mode}: setup on the ground`);
  tick(e, PLAYER_ACTION_BITS.TURBO);
  assert.deepEqual(heard, [['turbo', mode]], `${mode}: the leap is heard`);
  assert.ok(e.state.speed > speed + turbo.forwardMps * 0.8 && e.state.speed <= LAUNCH_CAP, `${mode}: forward speed ${speed.toFixed(1)} -> ${e.state.speed.toFixed(1)}`);
  assert.equal(e.state.grounded, false, `${mode}: the leap leaves the ground`);
  assert.ok(Math.abs(turboReadyIn(e, clock.t) - (turbo.cooldownS - SIM_DT)) < 1e-9, `${mode}: the cooldown starts`);
  let airS = 0; while (!e.state.grounded && airS < 3) { tick(e); airS += SIM_DT; }
  assert.ok(airS > 0.5 && airS < 1.5, `${mode}: a short hop (${airS.toFixed(2)} s)`);
  const cooling = e.state.speed;
  tick(e, PLAYER_ACTION_BITS.TURBO);
  assert.ok(e.state.speed <= cooling + 0.5, `${mode}: refused while it cools`);
  run(e, Math.ceil(turbo.cooldownS / SIM_DT));
  assert.equal(turboReadyIn(e, clock.t), 0, `${mode}: ready after ${turbo.cooldownS} s`);
  // in the air: after a jump at its apex, the leap adds the speed and stops the fall
  tick(e, PLAYER_ACTION_BITS.SELF_RIGHT);
  while (e.state._ride.v > -1) tick(e);
  const air = e.state.speed;
  tick(e, PLAYER_ACTION_BITS.TURBO);
  assert.ok(e.state.speed > air + turbo.forwardMps * 0.8, `${mode}: the air dash adds its speed`);
  assert.ok(e.state._ride.v > 0, `${mode}: and stops the fall`);
  // on its roof on the ground: no leap
  const roof = hull(mode); clock.t = 0;
  run(roof, 60);
  roof.state.overturned = true; roof.state._body.tumbling = true;
  const before = roof.state.speed;
  roof.input.actionBits = PLAYER_ACTION_BITS.TURBO; applyHullActions(roof, host);
  assert.equal(roof.state.speed, before, `${mode}: a hull on its roof cannot leap`);
}

// ---- F: a jump on the ground, a flip in the air; one whole turn, back on its tracks
function flight(mode, throttle, steer, { press = PLAYER_ACTION_BITS.SELF_RIGHT } = {}) {
  const e = hull(mode); clock.t = 0; heard.length = 0;
  run(e, 120);
  assert.equal(canTankAirSpin(e.state), false, `${mode}: no spin on the ground (the HUD's grey)`);
  tick(e, PLAYER_ACTION_BITS.SELF_RIGHT);
  assert.equal(e.state.grounded, false, `${mode}: F on the ground jumps`);
  run(e, 20);
  assert.equal(canTankAirSpin(e.state), true, `${mode}: the spin lit in flight`);
  const v = e.state._ride.v;
  e.input.throttle = throttle; e.input.steer = steer;
  tick(e, press);
  assert.ok(e.state._ride.v <= v, `${mode}: no rocket re-boost from F in the air`);
  return e;
}
for (const mode of ['turbo_ball', 'mars']) {
  for (const [throttle, steer, axis, key] of [[1, 0, AIR_SPIN_AXES.FRONT_FLIP, 'pitch'], [-1, 0, AIR_SPIN_AXES.BACK_FLIP, 'pitch'],
    [0, 1, AIR_SPIN_AXES.ROLL_LEFT, 'roll'], [0, -1, AIR_SPIN_AXES.ROLL_RIGHT, 'roll']]) {
    const e = flight(mode, throttle, steer);
    assert.equal(e.state._airSpinAxis, axis, `${mode}: drive ${throttle}/${steer} picks axis ${axis}`);
    assert.deepEqual(heard.at(-1), ['spin', mode]);
    tick(e, PLAYER_ACTION_BITS.SELF_RIGHT);
    assert.equal(heard.filter(([what]) => what === 'spin').length, 1, `${mode}: a second press mid-turn is refused`);
    const field0 = key === 'pitch' ? 'visualPitch' : 'visualRoll';
    let turned = 0, last = e.state[field0], ticks = 0;
    while (e.state._airSpinAxis && ticks < 120) { tick(e); turned += wrap(e.state[field0] - last); last = e.state[field0]; ticks++; }
    assert.ok(ticks >= 50 && ticks <= 56, `${mode}: one turn in about 0.9 s (${ticks} ticks)`);
    assert.ok(Math.abs(Math.abs(turned) - 2 * Math.PI) < 0.35, `${mode}: a whole turn about its ${key} (${turned.toFixed(2)} rad)`);
    assert.equal(Math.sign(turned), Math.sign(axis), `${mode}: in its direction`);
    while (!e.state.grounded) tick(e);
    run(e, 180);
    assert.equal(e.state.overturned, false, `${mode}: axis ${axis} lands on its tracks`);
  }
  // the air spin's own bit: a flip in flight, nothing on the ground
  const g = hull(mode); clock.t = 0; run(g, 120);
  tick(g, PLAYER_ACTION_BITS.AIR_SPIN);
  assert.ok(g.state.grounded && g.state._airSpinAxis === 0, `${mode}: the air spin's own key never jumps`);
  const a = flight(mode, 0, 0, { press: PLAYER_ACTION_BITS.AIR_SPIN });
  assert.equal(a.state._airSpinAxis, AIR_SPIN_AXES.FRONT_FLIP, `${mode}: and flips in flight`);
}

// ---- the ground ends a turn
{
  const e = flight('turbo_ball', 0, 1);
  e.state.grounded = true; e.state._ride.grounded = true;
  updateTank(e, field, SIM_DT, null);
  assert.equal(e.state._airSpinAxis, 0, 'the ground ends a roll');
}

// ---- determinism and the mid-flip replay
function script() {
  const e = flight('mars', 0, -1); // a roll right
  run(e, 15);
  return e;
}
const a = script(), b = script();
assert.deepEqual(captureMovementPredictionState(a.state), captureMovementPredictionState(b.state), 'two runs of the same presses are bit-identical');
const checkpoint = captureMovementPredictionState(a.state);
assert.ok(a.state._airSpinAxis === AIR_SPIN_AXES.ROLL_RIGHT && a.state._airSpinLeft > 1, 'the checkpoint is mid-roll');
const replay = hull('mars');
replay.state.pos.copy(a.state.pos); replay.state.yaw = a.state.yaw; replay.state.speed = a.state.speed;
replay.state.verticalSpeed = a.state.verticalSpeed; replay.state.visualPitch = a.state.visualPitch; replay.state.visualRoll = a.state.visualRoll;
replay.state.overturned = a.state.overturned;
assert.equal(applyMovementPredictionState(replay.state, checkpoint), true);
for (let n = 0; n < 90; n++) { updateTank(a, field, SIM_DT, null); updateTank(replay, field, SIM_DT, null); }
assert.equal(replay.state.visualRoll, a.state.visualRoll, 'the replay rolls as the original');
assert.equal(replay.state.pos.y, a.state.pos.y, 'and flies as it');

console.log('turboSpin: Turbo Ball and Gravity alone carry Turbo and the air spin; Turbo leaps on the ground and dashes in the air under the launch cap, cools 3 s, and never leaps off a roof; F jumps on the ground and flips or rolls in flight (W/none front, S back, A left, D right), one whole turn in 0.9 s, landing on its tracks; the air spin key never jumps; the ground ends a turn; runs and a mid-flip replay are bit-identical');
