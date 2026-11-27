// turboSpin.selftest.mjs — Turbo and the boost key (turbo-spin-275; owner 2026-11-22: "for turbo ball and gravity mode add
// another thing with going up called turbo - it makes you go launch forward for a short bit ... f should also be an official
// command so u can literally spin in air but only if ur in air (gray if ur not)"; he picked F in the air and Z with a 3 s
// cooldown; thrust-boosts-279 made F in flight a boost). Copyright (c) 2026 Kevin B. Liu.
//
// Pins, on the shared per-hull action step both drivers call (sim/hullActions.ts):
//   - only Turbo Ball and Gravity (mars) carry Turbo and the boosts; every other mode carries neither, and a press there
//     does nothing;
//   - the nozzle a press picks from the drive (sim/hullFlight.ts boostNozzleFor): W or none the belly, S the nose, A/D a
//     side (a steer as strong as the throttle);
//   - Turbo: the forward leap on the ground (speed and a hop), never past the launch cap; in flight the butt's burn
//     (thrust-boosts-279: the run speed gains its push over the burn, a fall goes on falling but for the push); refused
//     while it cools and for a hull on its roof on the ground; taken again once the cooldown has run;
//   - F (SELF_RIGHT): a jump on the ground, a boost in flight (the nozzle the drive picks, lit at once and heard); a second
//     press while a burn is under way is refused;
//   - the boost's own bit boosts in flight; on the ground it is the ground press, a hop that then fires;
//   - the ground ends a burn and refills the flight's boosts.
// (The boosts' forces, charges and plumes: thrustBoosts.selftest.mjs; the r x F and the checkpoint replay:
// hullThrusters.selftest.mjs.)
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createTankState, updateTank, SIM_DT, canTankBoost } from './movement.ts';
import { matchRulesetFor } from './matchRuleset.ts';
import { applyHullActions } from './hullActions.ts';
import { turboReadyIn } from './modeMoves.ts';
import { PLAYER_ACTION_BITS } from './playerActions.ts';
import { BOOST_BURN_S, BOOST_NOZZLES, boostNozzleFor } from './hullFlight.ts';

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

// ---- which modes
for (const mode of ['turbo_ball', 'mars']) {
  const r = matchRulesetFor(mode);
  assert.ok(r.turbo && r.turbo.forwardMps > 0 && r.turbo.cooldownS === 3, `${mode} carries Turbo with the 3 s cooldown`);
  assert.ok(r.airSpin && r.airSpin.cooldownS > 0 && r.airSpin.upMps > 0 && r.airSpin.charges === 5, `${mode} carries the boosts, five a flight`);
  assert.ok(r.jumpMps > 0, `${mode} is a jump mode`);
}
for (const mode of ['standard', 'capture_the_flag', 'zone_control', 'air_support', 'drone']) {
  const r = matchRulesetFor(mode);
  assert.equal(r.turbo, null, `${mode} has no Turbo`);
  assert.equal(r.airSpin, null, `${mode} has no boosts`);
  const e = hull(mode);
  run(e, 120);
  const speed = e.state.speed;
  tick(e, PLAYER_ACTION_BITS.TURBO | PLAYER_ACTION_BITS.AIR_SPIN);
  assert.ok(Math.abs(e.state.speed - speed) < 0.5 && e.state.grounded, `${mode}: the presses do nothing`);
}

// ---- the nozzle a press picks
assert.equal(boostNozzleFor(0, 0), BOOST_NOZZLES.UP, 'no drive held: the belly');
assert.equal(boostNozzleFor(1, 0), BOOST_NOZZLES.UP, 'W: the belly (W is held through a run)');
assert.equal(boostNozzleFor(-1, 0), BOOST_NOZZLES.BACK, 'S: the nose, pushing back');
assert.equal(boostNozzleFor(0, 1), BOOST_NOZZLES.LEFT, 'A (steer +): pushed left');
assert.equal(boostNozzleFor(1, -1), BOOST_NOZZLES.RIGHT, 'W and D held alike: the side');
assert.equal(boostNozzleFor(1, 0.5), BOOST_NOZZLES.UP, 'W with a light steer: the belly');
assert.equal(boostNozzleFor(0.5, -0.9), BOOST_NOZZLES.RIGHT, 'D stronger than W: pushed right');

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
  // in the air: after a jump past its apex, the butt's burn adds its push to the run over the burn, and the fall goes on
  tick(e, PLAYER_ACTION_BITS.SELF_RIGHT);
  while (e.state._ride.v > -1) tick(e);
  const air = e.state.speed;
  tick(e, PLAYER_ACTION_BITS.TURBO);
  assert.ok(e.state.speed < air + 0.2 * turbo.forwardMps, `${mode}: the burn pushes over its time, not at once`);
  run(e, Math.round(BOOST_BURN_S / SIM_DT));
  assert.ok(e.state.speed > air + matchRulesetFor(mode).airSpin.forwardMps * 0.9, `${mode}: the butt's burn adds its push (${(e.state.speed - air).toFixed(2)} m/s)`);
  assert.ok(e.state._ride.v < 0, `${mode}: and the fall goes on but for the push's lift`);
  // on its roof on the ground: no leap
  const roof = hull(mode); clock.t = 0;
  run(roof, 60);
  roof.state.overturned = true; roof.state._body.tumbling = true;
  const before = roof.state.speed;
  roof.input.actionBits = PLAYER_ACTION_BITS.TURBO; applyHullActions(roof, host);
  assert.equal(roof.state.speed, before, `${mode}: a hull on its roof cannot leap`);
}

// ---- F: a jump on the ground, a boost in flight
function flight(mode, throttle, steer, { press = PLAYER_ACTION_BITS.SELF_RIGHT } = {}) {
  const e = hull(mode); clock.t = 0; heard.length = 0;
  const charges = matchRulesetFor(mode).airSpin.charges;
  run(e, 120);
  assert.equal(canTankBoost(e.state, charges), true, `${mode}: lit on the ground too, the ground press`);
  tick(e, PLAYER_ACTION_BITS.SELF_RIGHT);
  assert.equal(e.state.grounded, false, `${mode}: F on the ground jumps`);
  assert.equal(e.state._boostsUsed, 0, `${mode}: the jump spends no boost`);
  run(e, 20);
  assert.equal(canTankBoost(e.state, charges), true, `${mode}: the boost lit in flight`);
  e.input.throttle = throttle; e.input.steer = steer;
  tick(e, press);
  e.input.throttle = 0; e.input.steer = 0;
  return e;
}
for (const mode of ['turbo_ball', 'mars']) {
  for (const [throttle, steer, nozzle] of [[1, 0, BOOST_NOZZLES.UP], [0, 0, BOOST_NOZZLES.UP], [-1, 0, BOOST_NOZZLES.BACK],
    [0, 1, BOOST_NOZZLES.LEFT], [0, -1, BOOST_NOZZLES.RIGHT]]) {
    const e = flight(mode, throttle, steer);
    assert.equal(e.state._boostNozzle, nozzle, `${mode}: drive ${throttle}/${steer} fires nozzle ${nozzle}`);
    assert.ok(e.state._thrust.level > 0, `${mode}: lit at once`);
    assert.deepEqual(heard.at(-1), ['spin', mode]);
    run(e, Math.round(matchRulesetFor(mode).airSpin.cooldownS / SIM_DT) - 13);
    tick(e, PLAYER_ACTION_BITS.SELF_RIGHT);
    assert.equal(heard.filter(([what]) => what === 'spin').length, 1, `${mode}: a second press while the burn runs is refused`);
  }
  // the boost's own bit: a boost in flight; on the ground the ground press, its hop then its burn
  const g = hull(mode); clock.t = 0; run(g, 120);
  tick(g, PLAYER_ACTION_BITS.AIR_SPIN);
  assert.ok(g.state._boostNozzle === BOOST_NOZZLES.UP && g.state.grounded === false && g.state._boostsUsed === 1,
    `${mode}: the boost's own key on the ground hops and fires, one boost spent`);
  const a = flight(mode, 0, 0, { press: PLAYER_ACTION_BITS.AIR_SPIN });
  assert.equal(a.state._boostNozzle, BOOST_NOZZLES.UP, `${mode}: and boosts in flight`);
}

// ---- the ground ends a burn and refills the boosts
{
  const e = flight('turbo_ball', 0, 1);
  assert.ok(e.state._boostBurnS > 0 && e.state._boostsUsed === 1, 'mid-burn, one spent');
  e.state.grounded = true; e.state._ride.grounded = true;
  updateTank(e, field, SIM_DT, null);
  assert.ok(e.state._boostNozzle === 0 && e.state._boostBurnS === 0 && e.state._boostsUsed === 0, 'the ground ends the burn and refills the boosts');
}

console.log('turboSpin: Turbo Ball and Gravity alone carry Turbo and the boosts; the drive picks the nozzle (W/none the belly, S the nose, A/D a side); Turbo leaps on the ground under the launch cap, fires the butt in flight, cools 3 s, and never leaps off a roof; F jumps on the ground and boosts in flight, a second press refused mid-burn; the boost key on the ground hops and fires; the ground ends a burn and refills the boosts');
