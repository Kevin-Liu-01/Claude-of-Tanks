// hullThrusters.selftest.mjs — the air spin as a thruster burn on a rigid body (thrust-flips-277; owner 2026-11-24: "right
// now the flips and barrel rolls in gravity mode look like your literally swinging around an axis instead of like a rocket
// strapped to your butt and sides being activated to change your motion"). Copyright (c) 2026 Kevin B. Liu.
//
// Pins (sim/hullThrusters.ts, sim/movement.ts driveAirSpin), on a real hull (the M1A1 Abrams HC's contact box) and the
// fixture:
//   - the torque is r x F: for each move the main nozzles' moment about the centre of mass, recomputed here from their
//     mounts and forces as full 3-vectors, has no component off the move's axis, and with the attitude jets beside them
//     sums to the burn's angular acceleration; each attitude-jet pair is a couple (no net force); the front flip fires
//     from behind the centre of mass (the butt), the back flip from ahead of it and below, a roll from the side away from
//     its travel, which lifts that side;
//   - the burn has a shape: it lights at a share of its thrust, ramps to all of it, tapers as the spin reaches its rate,
//     coasts with no burn, then a counter-burn in the turn's second half stops it a whole turn round at rest, in about
//     AIR_SPIN_TURN_S;
//   - in flight the centre of mass, not the root, keeps a ballistic path: while the hull coasts its centre of mass falls
//     at the mode's gravity along a straight horizontal line, while the root under the tracks swings round it (a planted
//     control: the root's own path fails the same check);
//   - deterministic: two runs are bit-identical, and a replay from a checkpoint taken mid main burn (the prediction's
//     version 11, no new value) follows the original exactly;
//   - planted: a set-rate turn (the 276 spin: full rate on the press tick) fails the burn-shape check.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import {
  AIR_SPIN_BURN, airSpinBurn, airSpinSense, airSpinThrusters, attitudeJets, createAirSpinThrusters, hullThrustFrame, nozzleAlpha,
} from './hullThrusters.ts';
import { AIR_SPIN_RATE } from './hullFlight.ts';
import { AIR_SPIN_AXES, createTankState, updateTank, SIM_DT } from './movement.ts';
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
const MOVES = [
  { name: 'front flip', axis: AIR_SPIN_AXES.FRONT_FLIP, shove: RULES.airSpin.forwardMps, throttle: 1, steer: 0 },
  { name: 'back flip', axis: AIR_SPIN_AXES.BACK_FLIP, shove: RULES.airSpin.backMps, throttle: -1, steer: 0 },
  { name: 'roll left', axis: AIR_SPIN_AXES.ROLL_LEFT, shove: RULES.airSpin.sideMps, throttle: 0, steer: 1 },
  { name: 'roll right', axis: AIR_SPIN_AXES.ROLL_RIGHT, shove: RULES.airSpin.sideMps, throttle: 0, steer: -1 },
];
const cross = (r, f) => [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];

// ---- the torque is r x F
for (const move of MOVES) {
  const t = airSpinThrusters(frame, move.axis, move.shove, createAirSpinThrusters());
  const pitch = Math.abs(move.axis) === 1;
  const torque = [0, 0, 0];
  for (const n of t.nozzles) {
    const tau = cross([n.x - frame.comX, n.y - frame.comY, n.z - frame.comZ], [n.dx * n.accel, n.dy * n.accel, n.dz * n.accel]);
    for (let i = 0; i < 3; i++) torque[i] += tau[i];
  }
  // pitch is about x (the spring's pitch is -tau_x: nose up), a roll about z (+tau_z lifts the left, +x)
  const onAxis = pitch ? -torque[0] / frame.k2Pitch : torque[2] / frame.k2Roll;
  const off = pitch ? [torque[1], torque[2]] : [torque[0], torque[1]];
  assert.ok(Math.abs(onAxis * airSpinSense(move.axis) - t.alphaMainNozzles) < 1e-9, `${move.name}: the nozzles' moment is r x F (${onAxis.toFixed(3)} rad/s^2)`);
  assert.ok(off.every((c) => Math.abs(c) < 1e-9), `${move.name}: no moment off its axis (${off.map((c) => c.toExponential(1))})`);
  assert.equal(Math.sign(onAxis), airSpinSense(move.axis), `${move.name}: the nozzles turn the hull the move's way`);
  const jets = attitudeJets(frame, pitch, airSpinSense(move.axis), t.alphaCouple, 'couple');
  const net = jets.reduce((sum, j) => sum + j.dy * j.accel, 0);
  const jetAlpha = jets.reduce((sum, j) => sum + nozzleAlpha(frame, j, move.axis), 0);
  assert.ok(Math.abs(net) < 1e-9, `${move.name}: the attitude jets are a couple (net ${net})`);
  assert.ok(t.alphaCouple > 0 && Math.sign(jetAlpha) === airSpinSense(move.axis), `${move.name}: the jets turn it the same way`);
  assert.ok(Math.abs(t.alphaMainNozzles + jetAlpha * airSpinSense(move.axis) - AIR_SPIN_BURN.alphaMain) < 1e-9,
    `${move.name}: nozzles ${t.alphaMainNozzles.toFixed(1)} + jets ${Math.abs(jetAlpha).toFixed(1)} = the burn's ${AIR_SPIN_BURN.alphaMain} rad/s^2`);
  const n = t.nozzles[0];
  if (move.axis === AIR_SPIN_AXES.FRONT_FLIP) assert.ok(n.z < frame.comZ - 1 && n.dz > 0.9, 'the front flip fires from the butt, pushing forward');
  if (move.axis === AIR_SPIN_AXES.BACK_FLIP) assert.ok(n.z > frame.comZ + 1 && n.y < frame.comY && n.dz < 0, 'the back flip fires from the nose\'s underside, pushing back');
  if (Math.abs(move.axis) === 2) {
    const toward = move.axis === AIR_SPIN_AXES.ROLL_LEFT ? 1 : -1;
    assert.ok(Math.sign(n.x - frame.comX) === -toward && Math.sign(n.dx) === toward, `${move.name}: fired from the side away from its travel`);
    // that side goes up: the left (+x) side's sense is the opposite of the travel's
    assert.equal(airSpinSense(move.axis), -toward, `${move.name}: the far side lifts, the hull rolls the way it travels`);
  }
}

// ---- the burn's shape
/** The burn law run from rest at the sim's step: each step's levels, and the ticks to a whole turn. */
function profile(law = airSpinBurn) {
  const levels = { main: 0, trim: 0, counter: 0 };
  let left = 2 * Math.PI, rate = 0;
  const rows = [];
  for (let tick = 0; tick < 120; tick++) {
    law(left, rate, levels);
    rows.push({ ...levels, rate, left });
    rate += (levels.main * AIR_SPIN_BURN.alphaMain + levels.trim * AIR_SPIN_BURN.alphaCounter - levels.counter * AIR_SPIN_BURN.alphaCounter) * SIM_DT;
    const step = rate * SIM_DT;
    if (step >= left - AIR_SPIN_BURN.finishRad || (rate <= 0 && levels.counter > 0)) return { rows, ticks: tick + 1, endRate: Math.abs(rate) };
    left -= step;
  }
  return { rows, ticks: Infinity, endRate: rate };
}
/** The shape: ramp up from a share, all of it, a taper, a coast with none, a counter-burn in the second half. */
function shaped({ rows, ticks }) {
  const first = rows[0];
  const peak = rows.findIndex((r) => r.main === 1);
  const cut = rows.findIndex((r, i) => i > peak && r.main === 0);
  const tapered = rows.slice(peak, cut).some((r) => r.main > 0 && r.main < 1);
  const coast = rows.slice(cut).findIndex((r) => r.counter > 0);
  const counterAt = cut + coast;
  return first.main > 0 && first.main < 0.5 && rows[0].rate === 0 && peak > 0 && cut > peak && tapered && coast > 5
    && rows[counterAt].left < Math.PI && Number.isFinite(ticks);
}
{
  const run = profile();
  assert.ok(shaped(run), 'the burn lights at a share, ramps, tapers, coasts and counter-burns in the second half');
  const nominal = 2 * Math.PI / AIR_SPIN_RATE / SIM_DT;
  assert.ok(Math.abs(run.ticks - nominal) <= 3, `a whole turn in about AIR_SPIN_TURN_S (${run.ticks} ticks, nominal ${nominal.toFixed(1)})`);
  assert.ok(run.endRate < 3, `it ends near rest (${run.endRate.toFixed(2)} rad/s at the last step)`);
  const burn = run.rows.filter((r) => r.main > 0).length, counter = run.rows.filter((r) => r.counter > 0).length;
  console.log(`hullThrusters: the burn ${burn} ticks, the coast ${run.ticks - burn - counter}, the counter-burn ${counter}; a whole turn in ${run.ticks} ticks`);
  // planted: the 276 spin, a set rate from the press tick (full rate at once, never a burn)
  const setRate = (left, rate, out) => { out.main = rate < AIR_SPIN_BURN.rateMax ? 1e9 : 0; out.trim = 0; out.counter = 0; return out; };
  assert.equal(shaped(profile(setRate)), false, 'planted: a set-rate turn fails the burn shape');
}

// ---- in flight the centre of mass keeps a ballistic path, the root swings round it
const field = { getHeightAt: () => 0, getNormalAt: () => null, getGroundType: () => 'medium' };
const clock = { t: 0 };
const host = { get timeS() { return clock.t; }, verdict: false, consumables: false, rng: () => 0.5, ground: () => 0, world: null, wind: null,
  supply() {}, smokeLaunched() {}, turboed() {}, airSpun() {}, selfRighted() {} };
function hull() {
  return {
    id: 'thruster', spec: SPEC, state: createTankState(SPEC, new Vector3(0, 0, 0), 0.4),
    input: { throttle: 0, steer: 0, brake: false, aimPoint: null, actionBits: 0, shellSlot: 0 }, combat: { destroyed: false },
    modeGravityScale: RULES.gravityScale, modePhysics: RULES.physics, modeSpeedMultiplier: RULES.speedMultiplier,
    modeJumpMps: RULES.jumpMps, modeTurbo: RULES.turbo, modeAirSpin: RULES.airSpin,
  };
}
function tick(e, bits = 0) { e.input.actionBits = bits; applyHullActions(e, host); updateTank(e, field, SIM_DT, null); clock.t += SIM_DT; }
/** A hull jumped, 20 ticks into the climb, the move pressed. */
function pressed(move) {
  const e = hull(); clock.t = 0;
  for (let n = 0; n < 120; n++) tick(e);
  tick(e, PLAYER_ACTION_BITS.SELF_RIGHT);
  for (let n = 0; n < 20; n++) tick(e);
  e.input.throttle = move.throttle; e.input.steer = move.steer;
  tick(e, PLAYER_ACTION_BITS.AIR_SPIN);
  e.input.throttle = 0; e.input.steer = 0;
  assert.equal(e.state._airSpinAxis, move.axis, `${move.name}: pressed`);
  return e;
}
/** The centre of mass in the world (Euler YXZ: yaw, -pitch, roll), and the root. */
function comOf(s) {
  const p = -s.visualPitch, r = s.visualRoll, y = s.yaw;
  const x1 = frame.comX * Math.cos(r) - frame.comY * Math.sin(r), y1 = frame.comX * Math.sin(r) + frame.comY * Math.cos(r);
  const y2 = y1 * Math.cos(p) - frame.comZ * Math.sin(p), z2 = y1 * Math.sin(p) + frame.comZ * Math.cos(p);
  return [s.pos.x + x1 * Math.cos(y) + z2 * Math.sin(y), s.pos.y + y2, s.pos.z - x1 * Math.sin(y) + z2 * Math.cos(y)];
}
const gravity = 9.81 * RULES.gravityScale;
/** The worst departure from a ballistic path over the coast's ticks (second differences: 0 horizontally, -g dt^2 up). */
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
for (const move of MOVES) {
  const e = pressed(move);
  const com = [], root = [];
  let coastTicks = 0, ticks = 0;
  while (e.state._airSpinAxis && ticks < 120) {
    tick(e); ticks++;
    const t = e.state._thrust;
    if (t.main === 0 && t.trim === 0 && t.counter === 0 && t.lift === 0 && e.state._airSpinAxis && e.state._airSpinLeft < 2 * Math.PI - 0.5) {
      com.push(comOf(e.state)); root.push([e.state.pos.x, e.state.pos.y, e.state.pos.z]); coastTicks++;
    } else if (com.length) break;
  }
  assert.ok(coastTicks >= 8, `${move.name}: a coast (${coastTicks} ticks)`);
  const comErr = ballistic(com), rootErr = ballistic(root);
  // the ride integrates with its own step (semi-implicit), so the centre of mass is ballistic to within a step's rounding
  assert.ok(comErr < 0.5, `${move.name}: the centre of mass coasts ballistic (worst ${comErr.toFixed(3)} m/s^2 off gravity)`);
  assert.ok(rootErr > 20, `planted: the root under the tracks is not ballistic mid-${move.name} (${rootErr.toFixed(1)} m/s^2 off), so the check sees a pivot`);
}

// ---- determinism and a replay from mid main burn
function midBurn() {
  const e = pressed(MOVES[0]);
  for (let n = 0; n < 5; n++) tick(e);
  return e;
}
const a = midBurn(), b = midBurn();
assert.deepEqual(captureMovementPredictionState(a.state), captureMovementPredictionState(b.state), 'two runs are bit-identical');
assert.ok(a.state._thrust.main > 0, 'the checkpoint is mid main burn');
const checkpoint = captureMovementPredictionState(a.state);
assert.equal(checkpoint.version, 11, 'no new checkpoint version: the burn reads the version-11 values');
const replay = hull();
replay.state.pos.copy(a.state.pos); replay.state.yaw = a.state.yaw; replay.state.speed = a.state.speed;
replay.state.verticalSpeed = a.state.verticalSpeed; replay.state.visualPitch = a.state.visualPitch; replay.state.visualRoll = a.state.visualRoll;
replay.state.overturned = a.state.overturned; replay.state._spring.recoilVX = a.state._spring.recoilVX; replay.state._spring.recoilVZ = a.state._spring.recoilVZ;
assert.equal(applyMovementPredictionState(replay.state, checkpoint), true);
let worst = 0;
for (let n = 0; n < 90; n++) {
  updateTank(a, field, SIM_DT, null); updateTank(replay, field, SIM_DT, null);
  worst = Math.max(worst, Math.abs(a.state.visualPitch - replay.state.visualPitch), Math.abs(a.state.pos.z - replay.state.pos.z),
    Math.abs(a.state.pos.y - replay.state.pos.y));
}
assert.equal(worst, 0, `the replay from mid burn follows the original exactly (worst ${worst})`);

console.log('hullThrusters: each move\'s moment is r x F about the centre of mass, on its axis alone, with couple attitude jets; the burn ramps, tapers, coasts and counter-burns to a whole turn at rest; the centre of mass coasts ballistic while the root swings round it; bit-identical runs and a replay from mid burn; a set-rate turn is caught');
