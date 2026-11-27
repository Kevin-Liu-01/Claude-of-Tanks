// hullThrusters.selftest.mjs — a boost as a force at a point on a rigid body (thrust-flips-277; thrust-boosts-279, owner
// 2026-11-27: the side and rear boosts "just like a additional force vector added from that side"). Copyright (c) 2026
// Kevin B. Liu.
//
// Pins (sim/hullThrusters.ts, sim/movement.ts driveBoost), on a real hull (the M1A1 Abrams HC's contact box):
//   - the torque is r x F: each nozzle pair's moment about the centre of mass, recomputed here from its mounts and forces
//     as full 3-vectors, has no yaw, and is the pair's alphaPitch / alphaRoll; the belly's has none at all; the butt
//     (Turbo in flight) turns the nose down, the nose's underside turns it up, a side pair fires from the side away from
//     its push and rolls the hull the way it is pushed (the far side up);
//   - the burn: a constant thrust for BOOST_BURN_S (twelve 60 Hz steps), whose push along the nozzle's travel is the
//     mode's shove (within 2 %), and nothing after it: no couple, no counter-burn, the spin it leaves bled by the
//     flight's drag alone (exp(-drag t) to within 1 %);
//   - in a boosted flight the centre of mass, not the root, keeps a ballistic path (a planted control: the root's own path
//     fails the same check);
//   - deterministic: two runs are bit-identical, and a replay from a checkpoint taken mid-burn with three boosts spent (the
//     prediction's version 12) follows the original exactly and refuses what it would (two boosts left, then none).
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { boostThrusters, createBoostThrusters, hullThrustFrame, nozzlePitchAlpha, nozzleRollAlpha } from './hullThrusters.ts';
import { BOOST_BURN_S, BOOST_NOZZLES } from './hullFlight.ts';
import { createTankState, updateTank, SIM_DT } from './movement.ts';
import { matchRulesetFor } from './matchRuleset.ts';
import { applyHullActions } from './hullActions.ts';
import { PLAYER_ACTION_BITS } from './playerActions.ts';
import { applyMovementPredictionState, captureMovementPredictionState } from './movementPredictionState.ts';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { TANK_SPECS } from '../vehicles/specs.ts';

const SPEC_ID = 'm1a1_abrams_hc';
await ensureAuthorityFleet([SPEC_ID]);
const SPEC = TANK_SPECS[SPEC_ID];
const frame = hullThrustFrame(SPEC);
const MODE = 'turbo_ball';
const RULES = matchRulesetFor(MODE);
const B = RULES.airSpin;
const N = BOOST_NOZZLES;
const NOZZLES = [
  // the belly near the apex (pressed early in the jump's climb, the climb cap takes part of it: thrustBoosts.selftest.mjs)
  { name: 'belly', nozzle: N.UP, shove: B.upMps, throttle: 0, steer: 0, pitch: 0, roll: 0, climbTicks: 125 },
  { name: 'nose', nozzle: N.BACK, shove: B.backMps, throttle: -1, steer: 0, pitch: 1, roll: 0 },
  { name: 'left push', nozzle: N.LEFT, shove: B.sideMps, throttle: 0, steer: 1, pitch: 0, roll: -1 },
  { name: 'right push', nozzle: N.RIGHT, shove: B.sideMps, throttle: 0, steer: -1, pitch: 0, roll: 1 },
  { name: 'butt (Turbo)', nozzle: N.FORWARD, shove: B.forwardMps, turbo: true, pitch: -1, roll: 0 },
];
const cross = (r, f) => [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];

// ---- the torque is r x F
for (const move of NOZZLES) {
  const t = boostThrusters(frame, move.nozzle, move.shove, createBoostThrusters());
  const torque = [0, 0, 0], force = [0, 0, 0];
  for (const n of t.pair) {
    const f = [n.dx * n.accel, n.dy * n.accel, n.dz * n.accel];
    const tau = cross([n.x - frame.comX, n.y - frame.comY, n.z - frame.comZ], f);
    for (let i = 0; i < 3; i++) { torque[i] += tau[i]; force[i] += f[i]; }
  }
  // the spring's pitch is -tau_x (nose up), its roll +tau_z (the left, +x, up)
  const pitch = -torque[0] / frame.k2Pitch, roll = torque[2] / frame.k2Roll;
  assert.ok(Math.abs(torque[1]) < 1e-9, `${move.name}: no yaw (${torque[1]})`);
  assert.ok(Math.abs(pitch - t.alphaPitch) < 1e-9 && Math.abs(roll - t.alphaRoll) < 1e-9,
    `${move.name}: the pair's turn is its r x F (pitch ${pitch.toFixed(2)}, roll ${roll.toFixed(2)} rad/s^2)`);
  const pitchSign = Math.abs(pitch) < 1e-9 ? 0 : Math.sign(pitch), rollSign = Math.abs(roll) < 1e-9 ? 0 : Math.sign(roll);
  assert.equal(pitchSign, move.pitch, `${move.name}: pitch sense`);
  assert.equal(rollSign, move.roll, `${move.name}: roll sense`);
  for (const n of t.pair) {
    assert.ok(Math.abs(nozzlePitchAlpha(frame, n) + nozzleRollAlpha(frame, n)) < 1e3, `${move.name}: finite`);
  }
  // the push over the burn along the nozzle's travel is the shove
  const along = move.nozzle === N.UP ? force[1] : move.nozzle === N.FORWARD ? force[2] : move.nozzle === N.BACK ? -force[2]
    : move.nozzle === N.LEFT ? force[0] : -force[0];
  assert.ok(Math.abs(along * BOOST_BURN_S - move.shove) < 1e-9, `${move.name}: a full burn pushes ${move.shove} m/s along its travel`);
  const n = t.pair[0];
  if (move.nozzle === N.FORWARD) assert.ok(n.z < frame.comZ - 1 && n.dz > 0.9, 'the butt pushes forward from behind the centre of mass');
  if (move.nozzle === N.BACK) assert.ok(n.z > frame.comZ + 1 && n.y < frame.comY && n.dz < 0, 'the nose\'s underside pushes back');
  if (move.nozzle === N.UP) assert.ok(n.y <= frame.comY && n.dy === 1 && Math.abs(t.alphaPitch) + Math.abs(t.alphaRoll) < 1e-9, 'the belly pushes up, through the centre of mass');
  if (move.nozzle === N.LEFT || move.nozzle === N.RIGHT) {
    const toward = move.nozzle === N.LEFT ? 1 : -1;
    assert.ok(Math.sign(n.x - frame.comX) === -toward && Math.sign(n.dx) === toward, `${move.name}: fired from the side away from its push`);
  }
}

// ---- the burn in the sim
const field = { getHeightAt: () => 0, getNormalAt: () => null, getGroundType: () => 'medium' };
const clock = { t: 0 };
const host = {
  get timeS() { return clock.t; }, verdict: false, consumables: false, rng: () => 0.5, ground: () => 0, world: null, wind: null,
  supply() {}, smokeLaunched() {}, turboed() {}, airSpun() {}, selfRighted() {},
};
function hull() {
  return {
    id: 'thruster', spec: SPEC, state: createTankState(SPEC, new Vector3(0, 0, 0), 0.4),
    input: { throttle: 0, steer: 0, brake: false, aimPoint: null, actionBits: 0, shellSlot: 0 }, combat: { destroyed: false },
    modeGravityScale: RULES.gravityScale, modePhysics: RULES.physics, modeSpeedMultiplier: RULES.speedMultiplier,
    modeJumpMps: RULES.jumpMps, modeTurbo: RULES.turbo, modeAirSpin: RULES.airSpin,
  };
}
function tick(e, bits = 0) { e.input.actionBits = bits; applyHullActions(e, host); updateTank(e, field, SIM_DT, null); clock.t += SIM_DT; }
/** A hull jumped, `climbTicks` into the climb, the nozzle pressed (its drive, or Turbo). */
function pressed(move, climbTicks = move.climbTicks ?? 40) {
  const e = hull(); clock.t = 0;
  for (let n = 0; n < 120; n++) tick(e);
  tick(e, PLAYER_ACTION_BITS.SELF_RIGHT);
  for (let n = 0; n < climbTicks; n++) tick(e);
  e.input.throttle = move.throttle ?? 0; e.input.steer = move.steer ?? 0;
  tick(e, move.turbo ? PLAYER_ACTION_BITS.TURBO : PLAYER_ACTION_BITS.SELF_RIGHT);
  e.input.throttle = 0; e.input.steer = 0;
  assert.equal(e.state._boostNozzle, move.nozzle, `${move.name}: pressed`);
  return e;
}
const drag = RULES.physics.airAngularDrag;
for (const move of NOZZLES) {
  const e = pressed(move);
  // the press tick burnt its first step; count the rest, then the coast
  let burnTicks = 1;
  while (e.state._boostBurnS > 0 && burnTicks < 30) { assert.equal(e.state._thrust.level, 1, `${move.name}: a constant thrust`); tick(e); burnTicks++; }
  assert.equal(burnTicks, Math.round(BOOST_BURN_S / SIM_DT), `${move.name}: the burn lasts ${BOOST_BURN_S} s (${burnTicks} ticks)`);
  const p0 = e.state._spring.pitchV, r0 = e.state._spring.rollV;
  for (let n = 0; n < 30; n++) {
    tick(e);
    assert.equal(e.state._thrust.nozzle, 0, `${move.name}: nothing fires after the burn`);
  }
  const decay = Math.exp(-drag * 30 * SIM_DT);
  for (const [v0, v1, axis] of [[p0, e.state._spring.pitchV, 'pitch'], [r0, e.state._spring.rollV, 'roll']]) {
    if (Math.abs(v0) < 1e-6) continue;
    assert.ok(Math.abs(v1 / v0 - decay) < 0.01, `${move.name}: the ${axis} rate is the flight's drag alone (${(v1 / v0).toFixed(4)} vs ${decay.toFixed(4)})`);
  }
  if (move.pitch || move.roll) assert.ok(Math.abs(move.pitch ? p0 : r0) > 0.5, `${move.name}: it turns (${(move.pitch ? p0 : r0).toFixed(2)} rad/s)`);
}

// ---- the centre of mass is ballistic in a boosted flight
/** The centre of mass in the world (Euler YXZ: yaw, -pitch, roll), and the root. */
function comOf(s) {
  const p = -s.visualPitch, r = s.visualRoll, y = s.yaw;
  const x1 = frame.comX * Math.cos(r) - frame.comY * Math.sin(r), y1 = frame.comX * Math.sin(r) + frame.comY * Math.cos(r);
  const y2 = y1 * Math.cos(p) - frame.comZ * Math.sin(p), z2 = y1 * Math.sin(p) + frame.comZ * Math.cos(p);
  return [s.pos.x + x1 * Math.cos(y) + z2 * Math.sin(y), s.pos.y + y2, s.pos.z - x1 * Math.sin(y) + z2 * Math.cos(y)];
}
const gravity = 9.81 * RULES.gravityScale;
/** The worst departure from a ballistic path (second differences: 0 horizontally, -g dt^2 up). */
const ballistic = (path) => {
  let worst = 0;
  for (let i = 1; i + 1 < path.length; i++) {
    for (let c = 0; c < 3; c++) {
      const accel = (path[i + 1][c] - 2 * path[i][c] + path[i - 1][c]) / (SIM_DT * SIM_DT);
      worst = Math.max(worst, Math.abs(accel - (c === 1 ? -gravity : 0)));
    }
  }
  return worst;
};
for (const move of NOZZLES.filter((m) => m.pitch || m.roll)) {
  const e = pressed(move);
  while (e.state._boostBurnS > 0) tick(e);
  const com = [], root = [];
  for (let n = 0; n < 24 && !e.state.grounded; n++) { tick(e); com.push(comOf(e.state)); root.push([e.state.pos.x, e.state.pos.y, e.state.pos.z]); }
  assert.ok(com.length >= 16, `${move.name}: a coast (${com.length} ticks)`);
  const comErr = ballistic(com), rootErr = ballistic(root);
  assert.ok(comErr < 0.5, `${move.name}: the centre of mass coasts ballistic (worst ${comErr.toFixed(3)} m/s^2 off gravity)`);
  assert.ok(rootErr > 1.5, `planted: the root under the tracks is not ballistic after the ${move.name} (${rootErr.toFixed(1)} m/s^2 off), so the check sees a pivot`);
}

// ---- determinism and a replay from mid-burn, three boosts spent
function midBurn() {
  const e = hull(); clock.t = 0;
  for (let n = 0; n < 120; n++) tick(e);
  tick(e, PLAYER_ACTION_BITS.SELF_RIGHT);
  for (let n = 0; n < 10; n++) tick(e);
  for (const steer of [0, 1, 0]) {
    e.input.steer = steer;
    tick(e, PLAYER_ACTION_BITS.SELF_RIGHT);
    e.input.steer = 0;
    for (let n = 0; n < 23; n++) tick(e);
  }
  e.input.steer = -1;
  tick(e, PLAYER_ACTION_BITS.SELF_RIGHT);
  e.input.steer = 0;
  for (let n = 0; n < 4; n++) tick(e);
  return e;
}
const a = midBurn(), b = midBurn();
assert.deepEqual(captureMovementPredictionState(a.state), captureMovementPredictionState(b.state), 'two runs are bit-identical');
assert.ok(a.state._boostBurnS > 0 && a.state._boostNozzle === N.RIGHT && a.state._boostsUsed === 4, 'the checkpoint is mid-burn, four boosts spent');
const checkpoint = captureMovementPredictionState(a.state);
assert.equal(checkpoint.version, 12, 'the boosts ride checkpoint version 12');
const replay = hull();
replay.state.pos.copy(a.state.pos); replay.state.yaw = a.state.yaw; replay.state.speed = a.state.speed;
replay.state.verticalSpeed = a.state.verticalSpeed; replay.state.visualPitch = a.state.visualPitch; replay.state.visualRoll = a.state.visualRoll;
replay.state.overturned = a.state.overturned;
assert.equal(applyMovementPredictionState(replay.state, checkpoint), true);
assert.equal(replay.state._boostsUsed, 4, 'the replay has four boosts spent');
let worst = 0;
for (let n = 0; n < 90; n++) {
  updateTank(a, field, SIM_DT, null); updateTank(replay, field, SIM_DT, null);
  worst = Math.max(worst, Math.abs(a.state.visualRoll - replay.state.visualRoll), Math.abs(a.state.pos.x - replay.state.pos.x),
    Math.abs(a.state.pos.z - replay.state.pos.z), Math.abs(a.state.pos.y - replay.state.pos.y));
}
assert.equal(worst, 0, `the replay from mid-burn follows the original exactly (worst ${worst})`);

console.log('hullThrusters: each pair\'s turn is its own r x F about the centre of mass (none for the belly, nose down for the butt, up for the nose, a side pair rolling the hull the way it pushes); a constant 0.2 s burn delivers the shove and nothing fires after it, the spin bled by the flight\'s drag alone; the centre of mass coasts ballistic while the root swings round it; bit-identical runs and a version-12 replay from mid-burn');
