/**
 * hullBodyMode.selftest.mjs — the hull's body mode (audit M8, 2026-11-02): supported, tumbling or righting, with
 * `overturned` an attribute of the two rigid modes only. Node probes on flat ground, a 40-degree face, a 65-degree face
 * and a cliff band step the real movement and the bots' rollover lifecycle and check every tick that no dead-end flag
 * combination is built: overturned or auto-righting without the rigid phase locked the drivetrain, refused the
 * self-right and the jump, and parked the lifecycle with AUTO_RIGHTING on the wire until the hull died.
 * Run with: node src/sim/hullBodyMode.selftest.mjs
 */
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { SIM_DT, createTankState, resetTankVerticalState, updateTank } from './movement.ts';
import { canSelfRightTank, requestTankSelfRight, stepRolloverLifecycle } from './rollover.ts';
import {
  OVERTURN_ENTER_UP_Y, OVERTURN_EXIT_UP_Y, enterHullTumble, finishHullRighting, hullBodyMode, resetHullBodyMode,
  restoreHullBodyMode, settleHullOnTracks, startHullRighting, updateHullOverturn,
} from './hullBodyMode.ts';

// The medium-tank fixture of movement.selftest.mjs (contact plane at hull-local y = 0, closed-shell body points).
const SPEC = {
  name: 'fixture-medium', enginePowerHp: 500, weightTons: 33, topSpeedKmh: 42, reverseSpeedKmh: 15,
  hullTraverseDegS: 36, turretTraverseDegS: 36, gunPitchDegS: 24, gunElevationDeg: 25, gunDepressionDeg: 10,
  pivotStyle: 'pivot', terrainResistance: { hard: 1.0, medium: 1.2, soft: 2.2 },
  dims: { hullLengthM: 6.27, overallLengthM: 7.52, widthM: 3.0, heightM: 2.97 },
  gun: { caliberMm: 76, baseAccuracy: 0.38, aimTimeS: 2.3, bloom: { move: 0.2, hullRot: 0.2, turret: 0.12, afterShot: 4 } },
  armor: {
    boundingRadiusM: 3.8, turretPivot: [0, 1.55, 0], gunPivot: [0, 0.25, 0.3], gunBarrel: { lengthM: 4.0 },
    bodyContactPoints: {
      hull: [-1.42, 0.42, -2.75, 1.42, 0.42, -2.75, -1.42, 1.48, -2.75, 1.42, 1.48, -2.75,
        -1.42, 0.42, 2.75, 1.42, 0.42, 2.75, -1.42, 1.48, 2.75, 1.42, 1.48, 2.75],
      turret: [-0.82, 0.02, -0.95, 0.82, 0.02, -0.95, -0.72, 0.60, -0.82, 0.72, 0.60, -0.82,
        -0.82, 0.02, 0.82, 0.82, 0.02, 0.82, -0.72, 0.60, 0.72, 0.72, 0.60, 0.72],
    },
  },
};
const DEG = Math.PI / 180;
const plane = (deg) => {
  const t = Math.tan(deg * DEG);
  return { getHeightAt: (x) => x * t, getNormalAt: () => null, getGroundType: () => 'medium' };
};
const cliffBand = (deg, heightM) => {
  const t = Math.tan(deg * DEG);
  return { getHeightAt: (x) => Math.min(heightM, Math.max(0, x * t)), getNormalAt: () => null, getGroundType: () => 'medium' };
};
const upY = (s) => Math.cos(s.visualPitch) * Math.cos(s.visualRoll);

/** Every flag combination a hull may hold: overturned and auto-righting are sub-states of the rigid phase. */
function legal(s) {
  return (!s.overturned || s._body.tumbling) && (!s._body.autoRighting || s._body.tumbling);
}

function entity(field, x = 0, y = field.getHeightAt(x, 0)) {
  return {
    spec: SPEC, bot: true, state: createTankState(SPEC, new Vector3(x, y, 0), 0),
    input: { throttle: 0, steer: 0, brake: false, aimPoint: null }, combat: null,
  };
}

/** Step `seconds` of a bot as the authority does (movement, then the rollover lifecycle), checking every tick. */
function run(e, field, seconds, label, throttle = 0) {
  const s = e.state;
  let illegal = 0, firstIllegal = -1, autoflips = 0;
  for (let tick = 0; tick < seconds * 60; tick++) {
    e.input.throttle = throttle;
    updateTank(e, field, SIM_DT);
    if (stepRolloverLifecycle(s, SIM_DT)) autoflips++;
    if (!legal(s)) {
      illegal++;
      if (firstIllegal < 0) firstIllegal = tick;
    }
  }
  assert.equal(illegal, 0, `${label}: ${illegal} ticks held overturned or auto-righting outside the rigid phase ` +
    `(first at tick ${firstIllegal}; now overturned ${s.overturned}, tumbling ${s._body.tumbling}, ` +
    `autoRighting ${s._body.autoRighting}, grounded ${s.grounded})`);
  return { autoflips };
}

/** Seat a hull on `field`, then lean it `extraDeg` past the ground's roll with the overturn latched (out of a tumble). */
function leanedOutOfTumble(field, extraDeg, x = 0) {
  const e = entity(field, x);
  for (let tick = 0; tick < 120; tick++) updateTank(e, field, SIM_DT);
  const s = e.state;
  const ground = s._terr.roll;
  s.visualRoll = s._spring.roll = ground + Math.sign(ground || 1) * extraDeg * DEG;
  s._spring.rollV = 0;
  s._spring.pitchV = 0;
  s.speed = 0;
  s.overturned = true;
  s._body.tumbling = true;
  s._body.autoRighting = false;
  return e;
}

// ---- flat ground: a roof-down bot is righted once by the lifecycle and drives off upright ----------------------------
{
  const field = plane(0);
  const e = entity(field, 0, 2.2);
  const s = e.state;
  s.visualPitch = s._spring.pitch = Math.PI - 0.05;
  s.overturned = true;
  s._body.tumbling = true;
  const { autoflips } = run(e, field, 10, 'flat, roof-down');
  assert.equal(autoflips, 1, 'flat: the lifecycle rights a settled roof-down bot once');
  assert.ok(!s.overturned && !s._body.tumbling && !s._body.autoRighting && s.grounded, 'flat: the bot ends supported');
  assert.ok(upY(s) > 0.94, 'flat: and upright');
}

// ---- a 40-degree face: a hull that comes out of its tumble against the face leaves the overturn with the tumble -------
{
  const field = plane(40);
  const e = leanedOutOfTumble(field, 28);
  const s = e.state;
  assert.ok(upY(s) < 0.48 && upY(s) > -0.08, 'probe: 40 deg + 28 deg leaves the up-vector between the overturn thresholds');
  const x0 = s.pos.x, z0 = s.pos.z;
  run(e, field, 4, '40 deg face', 1);
  assert.ok(!s.overturned && !s._body.tumbling && s.grounded, '40 deg face: the hull settles supported on the face');
  assert.ok(Math.hypot(s.pos.x - x0, s.pos.z - z0) > 5, '40 deg face: and its drivetrain drives it on');
}

// ---- a 65-degree face: no supported seat holds there; the hull slides and the mode stays legal throughout ------------
{
  const field = plane(65);
  const e = entity(field);
  const s = e.state;
  s.visualRoll = s._spring.roll = -(65 + 25) * DEG;
  s.overturned = true;
  s._body.tumbling = true;
  run(e, field, 6, '65 deg face', 1);
}

// ---- a 70-degree cliff band: an overturned hull lying with its tracks on the face is never left in a dead end -------
// (lane base: the tumble's terrain-relative settle cleared `tumbling` while the gravity overturn held: the drivetrain
// stayed locked, the self-right was refused, and after 5 s the bots' lifecycle set auto-righting with no rigid phase
// to clear it, so AUTO_RIGHTING stayed on the wire until the hull died)
for (const deg of [70, 80]) {
  const field = cliffBand(deg, 3);
  const e = entity(field, 0.5, field.getHeightAt(0.5, 0) + 1.5);
  const s = e.state;
  s.visualRoll = s._spring.roll = 70 * DEG;
  s.overturned = true;
  s._body.tumbling = true;
  run(e, field, 15, `${deg} deg cliff band`, 1);
  const stuck = s.grounded && s.overturned && !canSelfRightTank(s) && !(s._body.autoRighting && s._body.tumbling);
  assert.ok(!stuck, `${deg} deg cliff band: a grounded overturned hull is righting or can be righted`);
}

// ---- the self-right edge and a vertical reset keep the mode legal --------------------------------------------------
{
  const field = plane(0);
  const e = entity(field, 0, 2.2);
  const s = e.state;
  s.visualRoll = s._spring.roll = Math.PI / 2 + 0.2;
  s.overturned = true;
  s._body.tumbling = true;
  run(e, field, 1, 'flat, on its side');
  assert.equal(canSelfRightTank(s), true, 'a grounded hull on its side can self-right');
  assert.equal(requestTankSelfRight(s), true, 'the self-right edge is taken');
  assert.ok(legal(s) && s._body.autoRighting, 'the self-right enters the righting torque inside the rigid phase');
  s.visualRoll = s._spring.roll = 0.1;
  s.overturned = false;
  resetTankVerticalState(s, 0);
  assert.ok(legal(s), 'a vertical reset on the ground leaves no righting latch behind its tumble');
}

// ---- the owner's transition table ---------------------------------------------------------------------------------
{
  const flags = (s) => [s.overturned, s._body.tumbling, s._body.autoRighting];
  const at = (overturned, tumbling, autoRighting) => ({ overturned, _body: { tumbling, autoRighting } });
  const supported = () => at(false, false, false);
  const tumbling = (overturned = false) => at(overturned, true, false);
  const righting = (overturned = false) => at(overturned, true, true);
  assert.equal(hullBodyMode(supported()), 'supported');
  assert.equal(hullBodyMode(tumbling(true)), 'tumbling');
  assert.equal(hullBodyMode(righting()), 'righting');
  assert.equal(hullBodyMode(at(false, false, true)), 'righting', 'a righting latch never reads as supported');

  let s = supported();
  assert.equal(enterHullTumble(s), true);
  assert.deepEqual(flags(s), [false, true, false], 'tumble: supported -> tumbling');
  s = righting(true);
  assert.equal(enterHullTumble(s), false);
  assert.deepEqual(flags(s), [true, true, true], 'tumble: a righting hull keeps its torque');

  s = tumbling(true);
  assert.equal(settleHullOnTracks(s, 0.3), true);
  assert.deepEqual(flags(s), [false, false, false], 'settle: tumbling -> supported, the overturn with it');
  s = tumbling(true);
  assert.equal(settleHullOnTracks(s, OVERTURN_ENTER_UP_Y - 0.01), false, 'settle: refused past the side');
  assert.deepEqual(flags(s), [true, true, false]);
  s = righting();
  assert.equal(settleHullOnTracks(s, 1), false, 'settle: a righting hull leaves only by finishing');
  assert.deepEqual(flags(s), [false, true, true]);

  s = tumbling(true);
  assert.equal(startHullRighting(s), true);
  assert.deepEqual(flags(s), [true, true, true], 'right: tumbling -> righting');
  s = supported();
  assert.equal(startHullRighting(s), false, 'right: refused without a rigid phase to end it');
  assert.deepEqual(flags(s), [false, false, false]);
  s = righting();
  assert.equal(startHullRighting(s), false, 'right: refused while righting');

  s = righting(true);
  assert.equal(finishHullRighting(s, 0.5), true);
  assert.deepEqual(flags(s), [false, false, false], 'righted: righting -> supported, the overturn with it');
  s = tumbling();
  assert.equal(finishHullRighting(s, 1), false, 'righted: refused from tumbling');
  s = righting(true);
  assert.equal(finishHullRighting(s, -0.5), false, 'righted: refused past the side');

  s = supported();
  updateHullOverturn(s, 0.2);
  assert.deepEqual(flags(s), [false, false, false], 'overturn: a supported hull above the side stays supported');
  updateHullOverturn(s, OVERTURN_ENTER_UP_Y - 0.01);
  assert.deepEqual(flags(s), [true, true, false], 'overturn: crossing the side enters the tumble with the overturn');
  updateHullOverturn(s, OVERTURN_EXIT_UP_Y - 0.01);
  assert.deepEqual(flags(s), [true, true, false], 'overturn: hysteresis holds it below the exit');
  updateHullOverturn(s, OVERTURN_EXIT_UP_Y);
  assert.deepEqual(flags(s), [false, true, false], 'overturn: the exit leaves the tumble running');
  s = righting();
  updateHullOverturn(s, -0.5);
  assert.deepEqual(flags(s), [true, true, true], 'overturn: a righting hull can be past the side');

  s = righting();
  resetHullBodyMode(s);
  assert.deepEqual(flags(s), [false, false, false], 'reset: an upright hull drops its tumble and its righting');
  s = tumbling(true);
  resetHullBodyMode(s);
  assert.deepEqual(flags(s), [true, true, false], 'reset: an overturned hull keeps its rigid phase');

  for (const bits of [[false, false, false], [true, true, false], [false, true, true], [true, true, true], [false, true, false]]) {
    s = supported();
    restoreHullBodyMode(s, ...bits);
    assert.deepEqual(flags(s), bits, `restore: the legal authority bits ${bits} restore exactly`);
  }
  for (const bits of [[true, false, false], [false, false, true], [true, false, true]]) {
    s = supported();
    restoreHullBodyMode(s, ...bits);
    assert.ok(legal(s), `restore: the dead-end bits ${bits} restore into the rigid phase`);
  }
}

console.log('hullBodyMode.selftest: transition table, and flat, 40 deg, 65 deg and cliff-band probes hold a legal body mode every tick');
