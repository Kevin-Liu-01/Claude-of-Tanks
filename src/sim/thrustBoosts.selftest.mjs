// thrustBoosts.selftest.mjs — boosts as plain force vectors, five a flight (thrust-boosts-279; owner 2026-11-27: "for the
// rocket modes (gravity turbo) i think we should be able to elevate/boost up multiple times into the sky, and that the
// subsequent side/rear boosts that alow you to roll shouldnt like just have you end at rogiinal position they should
// literally be just like a additional force vector added from that side"). Copyright (c) 2026 Kevin B. Liu.
//
// Main's pass rules, written before measuring (numbers fixed here before the first run), on the shared per-hull action step
// both drivers call (sim/hullActions.ts) with F (SELF_RIGHT) and the drive a player holds, in Turbo Ball and Gravity (mars;
// the Moon and Earth worlds for the climb):
//   (i)   the climb: from a jump, F with no drive pressed at each apex five times; each apex is higher than the one before
//         by at least 0.1 m, and no tick's climb passes the mode's cap (AirSpinRules.climbCapMps, a cap on vertical
//         speed alone); five presses mashed 0.35 s apart from the jump reach the cap (within 0.5 m/s) and never pass it;
//   (ii)  a side boost (A, then D): within 0.25 s the hull's velocity across its heading toward the pushed side grows by at
//         least 0.8 x sideMps, it rolls the way it is pushed (the far side up: roll rate at least 0.5 rad/s in that sense),
//         and 1 s after the press its roll is at least 0.5 rad from where it started (no return to the start attitude);
//   (iii) two side boosts (A, A, 0.4 s apart): each burn's velocity change (gravity's share taken out) is the single
//         boost's within 5 %, the two sum to twice the single's within 10 %, and the roll-rate gains (the flight's drag
//         taken out) sum to twice the single's within 15 %; the second fires from a rolled hull, so its push is not the
//         first's direction (the velocity across the heading is reported, not ruled);
//   (iv)  the sixth press in a flight does nothing: over the next 0.25 s the velocity changes by gravity alone (within
//         0.05 m/s), and the nozzle does not light; after touchdown F jumps and the next flight's F boosts again;
//   (v)   the plumes (fx/hullThrusterPlumes.ts, its scene graph) draw a pair of flames exactly on the steps a burn applies
//         force, none in the coast after it, a capped burn's shorter than a full one's, and a ground press's two lift
//         jets while its hop clears the ground.
// Reverted controls: the 277 burn (the base tree, tools/thrust-boosts-controls.mjs runs this file against it with
// COT_BOOST_CONTROL_TREE and asserts (i), (ii) and (iii) fail there); planted here: a count of boosts that never grows
// passes a sixth press (iv), and plumes keyed to the boosted flight instead of the applied force draw in the coast (v).
// Also: the ground press (A on the ground hops, then fires once clear) and Turbo in flight (the butt's burn, no charge
// spent, nose down); a replay round trip of a boosted flight through the replay's seat-action tap (game/replay/
// seatActions.ts), tick-identical, whose control (the recorded steer dropped) parts at the side boost; and page/authority
// parity: the same presses as action bits on the shared step leave byte-identical hulls (a press a tick late is found).
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { Group, Vector3 } from 'three';

/** The tree under test: this one, or (the reverted control) the base tree's src/sim. */
const CONTROL = process.env.COT_BOOST_CONTROL_TREE ?? '';
const SIM = CONTROL ? pathToFileURL(CONTROL.endsWith('/') ? CONTROL : `${CONTROL}/`) : new URL('./', import.meta.url);
const { createTankState, updateTank, SIM_DT } = await import(new URL('movement.ts', SIM).href);
const { matchRulesetFor } = await import(new URL('matchRuleset.ts', SIM).href);
const { applyHullActions } = await import(new URL('hullActions.ts', SIM).href);
const { PLAYER_ACTION_BITS } = await import(new URL('playerActions.ts', SIM).href);

const SPEC = {
  name: 'fixture-mbt', enginePowerHp: 1200, weightTons: 50, topSpeedKmh: 65, reverseSpeedKmh: 15,
  hullTraverseDegS: 36, turretTraverseDegS: 36, gunPitchDegS: 24, gunElevationDeg: 25, gunDepressionDeg: 10,
  pivotStyle: 'pivot', terrainResistance: { hard: 1.0, medium: 1.2, soft: 2.2 },
  dims: { hullLengthM: 6.27, overallLengthM: 7.52, widthM: 3.0, heightM: 2.97 },
  gun: { caliberMm: 120, baseAccuracy: 0.38, aimTimeS: 2.3, reloadS: 6, bloom: { move: 0.2, hullRot: 0.2, turret: 0.12, afterShot: 4 } },
  armor: { boundingRadiusM: 3.8, turretPivot: [0, 1.55, 0], gunPivot: [0, 0.25, 0.3], gunBarrel: { lengthM: 4.0 } },
};
const field = { getHeightAt: () => 0, getNormalAt: () => null, getGroundType: () => 'medium' };
const YAW = 0.7; // off the world axes, so a push along the wrong one shows
const F = PLAYER_ACTION_BITS.SELF_RIGHT;
const WINDOW = 15; // ticks: a burn (12) and a margin
const rulesOf = (mode) => mode.startsWith('mars:') ? matchRulesetFor('mars', null, { marsGravity: mode.slice(5) }) : matchRulesetFor(mode);

function hull(mode) {
  const r = rulesOf(mode);
  return {
    id: mode, spec: SPEC, state: createTankState(SPEC, new Vector3(0, 0, 0), YAW),
    input: { throttle: 0, steer: 0, brake: false, aimPoint: null, actionBits: 0, shellSlot: 0 },
    combat: { destroyed: false }, modeGravityScale: r.gravityScale, modePhysics: r.physics, modeSpeedMultiplier: r.speedMultiplier,
    modeJumpMps: r.jumpMps, modeTurbo: r.turbo, modeAirSpin: r.airSpin, rules: r,
  };
}
const clock = { t: 0 };
const host = {
  get timeS() { return clock.t; }, verdict: false, consumables: false, rng: () => 0.5, ground: () => 0, world: null, wind: null,
  supply() {}, smokeLaunched() {}, turboed() {}, airSpun() {}, selfRighted() {},
};
/** One step: the hull's action bits with the drive held, then the movement step. `before` runs between them (a planted
 *  control's hand). */
function tick(e, bits = 0, drive = null, before = null) {
  if (drive) { e.input.throttle = drive.throttle ?? 0; e.input.steer = drive.steer ?? 0; }
  e.input.actionBits = bits;
  applyHullActions(e, host);
  if (drive) { e.input.throttle = 0; e.input.steer = 0; }
  before?.(e);
  updateTank(e, field, SIM_DT, null);
  clock.t += SIM_DT;
}
const gravityOf = (e) => 9.81 * (e.modeGravityScale ?? 1);
const velocity = (s) => [Math.sin(s.yaw) * s.speed + s._spring.recoilVX, s._ride.v, Math.cos(s.yaw) * s.speed + s._spring.recoilVZ];
const SIDE = [Math.cos(YAW), 0, -Math.sin(YAW)]; // the hull's left, where a positive steer (A) pushes it
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** A hull on the ground, settled, then F (the jump). */
function jumped(mode) {
  const e = hull(mode); clock.t = 0;
  for (let n = 0; n < 120; n++) tick(e);
  tick(e, F);
  assert.equal(e.state.grounded, false, `${mode}: the jump left the ground`);
  return e;
}

/** A burn window: the velocity change over WINDOW ticks from the press (gravity's share put back) and the roll-rate gain
 *  (the flight's drag over the window taken out). */
function burnWindow(e, drive, bits = F) {
  const v0 = velocity(e.state), r0 = e.state._spring.rollV;
  tick(e, bits, drive);
  for (let n = 1; n < WINDOW; n++) tick(e);
  const dv = sub(velocity(e.state), v0);
  dv[1] += gravityOf(e) * WINDOW * SIM_DT;
  const drag = e.modePhysics?.airAngularDrag ?? 0;
  const rollGain = e.state._spring.rollV - r0 * Math.exp(-drag * WINDOW * SIM_DT);
  return { dv, rollGain };
}

// ---- the measures
/** (i) the stepped climb: the apexes of the jump and five boosts pressed at each apex, the fastest climb, and the mash. */
function climb(mode) {
  const e = jumped(mode);
  const apexes = [];
  let presses = 0, prev = e.state._ride.v, peak = 0;
  for (let n = 0; n < 60 * 120 && !(e.state.grounded && presses > 0); n++) {
    const v = e.state._ride.v;
    peak = Math.max(peak, v);
    if (prev > 0 && v <= 0 && apexes.length <= 5) {
      apexes.push(e.state.pos.y);
      if (presses < 5) { presses++; tick(e, F, { throttle: 0, steer: 0 }); prev = e.state._ride.v; continue; }
    }
    prev = v;
    tick(e);
  }
  const mash = jumped(mode);
  let mashPeak = 0;
  for (let n = 0; n < 5; n++) {
    tick(mash, F, { throttle: 1, steer: 0 }); // W held through a run: the belly too
    for (let k = 1; k < 21; k++) { tick(mash); mashPeak = Math.max(mashPeak, mash.state._ride.v); }
  }
  return { apexes, peak, mashPeak, cap: e.rules.airSpin?.climbCapMps };
}

/** (ii) a side boost, 20 ticks into the jump's climb. */
function side(mode, steer) {
  const e = jumped(mode);
  for (let n = 0; n < 20; n++) tick(e);
  const roll0 = e.state._spring.roll;
  const w = burnWindow(e, { throttle: 0, steer });
  const rollRate = e.state._spring.rollV;
  for (let n = WINDOW; n < 60 && !e.state.grounded; n++) tick(e);
  return { lateral: dot(w.dv, SIDE) * Math.sign(steer), rollRate, turned: Math.abs(wrap(e.state._spring.roll - roll0)), dv: norm(w.dv),
    rollGain: w.rollGain, sideMps: e.rules.airSpin.sideMps };
}

/** (iii) two side boosts (A, A), 24 ticks apart. */
function twoSides(mode) {
  const e = jumped(mode);
  for (let n = 0; n < 20; n++) tick(e);
  const v0 = velocity(e.state);
  const first = burnWindow(e, { throttle: 0, steer: 1 });
  for (let n = WINDOW; n < 24; n++) tick(e);
  const second = burnWindow(e, { throttle: 0, steer: 1 });
  const total = sub(velocity(e.state), v0);
  total[1] += gravityOf(e) * (24 + WINDOW) * SIM_DT;
  return { first: norm(first.dv), second: norm(second.dv), rollGains: [first.rollGain, second.rollGain],
    lateral: dot(total, SIDE) };
}

/** (iv) six presses in a flight (W held, 24 ticks apart), then touchdown, then a jump and a boost. `before` plants a hand
 *  between the action step and the movement step. */
function sixth(mode, before = null) {
  const e = jumped(mode);
  for (let n = 0; n < 5; n++) {
    tick(e, F, { throttle: 1, steer: 0 }, before);
    for (let k = 1; k < 24; k++) tick(e);
  }
  const used = e.state._boostsUsed;
  const v0 = velocity(e.state);
  let lit = false;
  tick(e, F, { throttle: 1, steer: 0 }, before);
  lit ||= (e.state._thrust?.level ?? 0) > 0 || (e.state._boostBurnS ?? 0) > 0;
  for (let k = 1; k < WINDOW; k++) { tick(e); lit ||= (e.state._thrust?.level ?? 0) > 0; }
  const dv = sub(velocity(e.state), v0);
  dv[1] += gravityOf(e) * WINDOW * SIM_DT;
  const flying = !e.state.grounded;
  let ticks = 0;
  while (!e.state.grounded && ticks++ < 60 * 120) tick(e);
  for (let k = 0; k < 90; k++) tick(e);
  tick(e, F);
  const jumpedAgain = e.state.grounded === false && e.state._ride.v > 0;
  for (let k = 0; k < 20; k++) tick(e);
  const again = burnWindow(e, { throttle: 0, steer: 0 });
  return { used, sixthDv: norm(dv), lit, flying, jumpedAgain, againDv: norm(again.dv) };
}

// ---- the rules
const MODES = ['turbo_ball', 'mars'];
const verdicts = {};
const rule = (id, pass, detail) => { (verdicts[id] ??= []).push({ pass, detail }); };
for (const mode of [...MODES, 'mars:moon', 'mars:earth']) {
  const c = climb(mode);
  const rising = c.apexes.length === 6 && c.apexes.every((y, k) => k === 0 || y >= c.apexes[k - 1] + 0.1);
  const capped = c.cap == null ? null : c.peak <= c.cap + 1e-9 && c.mashPeak <= c.cap + 1e-9 && c.mashPeak >= c.cap - 0.5;
  rule('i', rising && capped !== false, `${mode}: apexes ${c.apexes.map((y) => y.toFixed(1)).join(' < ')} m; climb peak ${c.peak.toFixed(2)}, mash peak ${c.mashPeak.toFixed(2)}, cap ${c.cap ?? 'none'} m/s`);
}
const single = {};
for (const mode of MODES) {
  for (const steer of [1, -1]) {
    const s = side(mode, steer);
    if (steer === 1) single[mode] = s;
    const sense = s.rollRate * -steer;
    const pass = s.lateral >= 0.8 * s.sideMps && sense >= 0.5 && s.turned >= 0.5;
    rule('ii', pass, `${mode} ${steer > 0 ? 'A' : 'D'}: +${s.lateral.toFixed(2)} m/s toward the pushed side (sideMps ${s.sideMps}), roll ${sense.toFixed(2)} rad/s its way, ${s.turned.toFixed(2)} rad from the start 1 s on`);
  }
  const t = twoSides(mode), one = single[mode];
  const each = Math.abs(t.first / one.dv - 1) <= 0.05 && Math.abs(t.second / one.dv - 1) <= 0.05;
  const sum = Math.abs((t.first + t.second) / (2 * one.dv) - 1) <= 0.10;
  const roll = Math.abs((t.rollGains[0] + t.rollGains[1]) / (2 * one.rollGain) - 1) <= 0.15;
  rule('iii', each && sum && roll, `${mode}: burns ${t.first.toFixed(2)} + ${t.second.toFixed(2)} m/s vs single ${one.dv.toFixed(2)}; roll gains ${t.rollGains.map((g) => g.toFixed(2)).join(' + ')} vs single ${one.rollGain.toFixed(2)} rad/s; across the heading ${t.lateral.toFixed(2)} m/s (single ${one.lateral.toFixed(2)})`);
  const x = sixth(mode);
  rule('iv', x.used === 5 && x.flying && !x.lit && x.sixthDv < 0.05 && x.jumpedAgain && x.againDv > 1,
    `${mode}: ${x.used} spent, the sixth moved it ${x.sixthDv.toFixed(3)} m/s (lit ${x.lit}); after touchdown a jump ${x.jumpedAgain}, a boost ${x.againDv.toFixed(2)} m/s`);
}

if (CONTROL) {
  // the reverted control's verdicts, for tools/thrust-boosts-controls.mjs
  console.log(JSON.stringify(verdicts));
  process.exit(0);
}
for (const [id, list] of Object.entries(verdicts)) {
  for (const { pass, detail } of list) {
    console.log(`(${id}) ${pass ? 'PASS' : 'FAIL'} ${detail}`);
    assert.ok(pass, `(${id}) ${detail}`);
  }
}

// ---- (iv)'s planted control: a count that never grows lets a sixth press through
for (const mode of MODES) {
  const x = sixth(mode, (e) => { e.state._boostsUsed = 0; });
  assert.ok(x.lit && x.sixthDv > 1, `planted (iv) ${mode}: with the count held at none the sixth press fires (${x.sixthDv.toFixed(2)} m/s), so the rule sees it`);
}

// ---- (v) the plumes draw the force applied
const { createHullThrusterPlumes } = await import('../fx/hullThrusterPlumes.ts');
const { BOOST_BURN_S } = await import('./hullFlight.ts');
/** Run `script` on a hull and its plumes; each tick the drawn flames (visible slots and their lengths) against the burn. */
function drawn(mode, script, view = (s) => s) {
  const plumes = createHullThrusterPlumes();
  const root = new Group();
  const e = hull(mode); clock.t = 0;
  const rows = [];
  script(e, () => {
    plumes.sync('h', root, SPEC, view(e.state), SIM_DT, true, null);
    const group = root.children.find((c) => c.name === 'hullThrusterPlumes');
    const slots = group && group.visible ? group.children.filter((c) => c.visible) : [];
    const t = e.state._thrust;
    rows.push({ flames: slots.length, length: slots.length ? slots[0].children[0].scale.y : 0, level: t.level, lift: t.lift, nozzle: t.nozzle,
      boosted: e.state._boostNozzle !== 0 });
  });
  return rows;
}
const mashAndCoast = (e, draw) => {
  for (let n = 0; n < 120; n++) { tick(e); draw(); }
  tick(e, F); draw();
  for (let p = 0; p < 3; p++) {
    tick(e, F, { throttle: 0, steer: 0 }); draw();
    for (let k = 1; k < 24; k++) { tick(e); draw(); }
  }
  // a side boost's whole burn and its coast
  for (let k = 0; k < 40; k++) { tick(e); draw(); }
  tick(e, F, { throttle: 0, steer: 1 }); draw();
  for (let k = 1; k < 40; k++) { tick(e); draw(); }
};
for (const mode of MODES) {
  const rows = drawn(mode, mashAndCoast);
  const burning = rows.filter((r) => r.level > 0);
  const coasting = rows.filter((r) => r.boosted && !(r.level > 0) && !(r.lift > 0));
  assert.ok(burning.length >= 4 * Math.round(BOOST_BURN_S / SIM_DT) - 4, `${mode}: the burns ran (${burning.length} steps)`);
  assert.ok(coasting.length > 30, `${mode}: a coast in the boosted flight (${coasting.length} steps)`);
  const wrong = rows.filter((r) => (r.level > 0 || r.lift > 0) !== (r.flames === 2));
  assert.equal(wrong.length, 0, `(v) ${mode}: a pair of flames on exactly the steps a burn applies force (${wrong.length} wrong)`);
  const full = burning.filter((r) => r.level === 1 && r.nozzle === 1), capped = burning.filter((r) => r.level < 0.99 && r.nozzle === 1);
  assert.ok(capped.length > 0 && full.length > 0, `${mode}: the climb cap took part of a belly burn (${capped.length} steps) and left others whole (${full.length})`);
  const meanLength = (list) => list.reduce((sum, r) => sum + r.length, 0) / list.length;
  assert.ok(meanLength(capped) < 0.97 * meanLength(full), `(v) ${mode}: a capped burn draws shorter flames (${meanLength(capped).toFixed(2)} vs ${meanLength(full).toFixed(2)})`);
  console.log(`(v) PASS ${mode}: flames on ${burning.length} burning steps, none on ${coasting.length} coasting ones; capped ${meanLength(capped).toFixed(2)} vs full ${meanLength(full).toFixed(2)}`);
  // planted: plumes keyed to the boosted flight, not the force applied
  const keyed = drawn(mode, mashAndCoast, (s) => ({ ...s, _thrust: { ...s._thrust, nozzle: s._boostNozzle, level: s._boostNozzle ? 1 : 0 } }));
  const keyedWrong = keyed.filter((r) => (r.level > 0 || r.lift > 0) !== (r.flames === 2));
  assert.ok(keyedWrong.length > 30, `planted (v) ${mode}: plumes keyed to the boosted flight draw in the coast (${keyedWrong.length} wrong steps), so the rule sees it`);
}
// the ground press: A on the ground hops, its lift jets show until the hull clears what a roll sweeps, then the side fires
{
  const rows = drawn('turbo_ball', (e, draw) => {
    for (let n = 0; n < 120; n++) { tick(e); draw(); }
    tick(e, PLAYER_ACTION_BITS.AIR_SPIN, { throttle: 0, steer: 1 }); draw();
    for (let k = 0; k < 40; k++) { tick(e); draw(); }
  });
  const lift = rows.filter((r) => r.lift > 0), side = rows.filter((r) => r.level > 0 && r.nozzle === 4);
  assert.ok(lift.length >= 1 && lift.every((r) => r.flames === 2), `the ground press's lift jets draw while it clears (${lift.length} steps)`);
  assert.ok(side.length === Math.round(BOOST_BURN_S / SIM_DT) && side.every((r) => r.flames === 2), `then the side pair fires its whole burn (${side.length} steps)`);
  assert.ok(rows.indexOf(lift[lift.length - 1]) < rows.indexOf(side[0]), 'the lift before the burn');
}

// ---- Turbo in flight: the butt's burn, no charge, nose down
for (const mode of MODES) {
  const e = jumped(mode);
  for (let n = 0; n < 20; n++) tick(e);
  const speed0 = e.state.speed, used0 = e.state._boostsUsed;
  tick(e, PLAYER_ACTION_BITS.TURBO);
  assert.equal(e.state._boostNozzle, 2, `${mode}: Turbo in flight lights the butt`);
  for (let k = 1; k < WINDOW; k++) tick(e);
  const along = e.state.speed - speed0;
  assert.ok(Math.abs(along - e.rules.airSpin.forwardMps) < 0.05 * e.rules.airSpin.forwardMps, `${mode}: the butt's burn adds forwardMps to the run (${along.toFixed(2)} m/s)`);
  assert.equal(e.state._boostsUsed, used0, `${mode}: Turbo spends none of the flight's boosts`);
  assert.ok(e.state._spring.pitchV < -0.3, `${mode}: the butt turns the nose down (${e.state._spring.pitchV.toFixed(2)} rad/s)`);
}

// ---- a replay round trip of a boosted flight through the seat-action tap
const { wrapRecordedRules, replaySeatAction } = await import('../game/replay/seatActions.ts');
const modeMoves = await import('./modeMoves.ts');
const PORT = { pressSelfRight: modeMoves.pressSelfRight, requestHullAirSpin: modeMoves.requestHullAirSpin, requestHullTurbo: modeMoves.requestHullTurbo };
/** The solo player's presses on the page's path (the rules port between steps), at fixed ticks with their drive. */
const PRESSES = [[120, 'pressSelfRight', 0, 0], [150, 'pressSelfRight', 0, 0], [180, 'pressSelfRight', 1, 0], [210, 'pressSelfRight', 0, 1],
  [240, 'requestHullTurbo', 0, 0], [270, 'pressSelfRight', -1, 0], [300, 'pressSelfRight', 0, -1], [330, 'pressSelfRight', 0, 0]];
const trace = (s) => [s.pos.x, s.pos.y, s.pos.z, s._spring.pitch, s._spring.roll, s._spring.pitchV, s._spring.rollV, s._ride.v, s.speed,
  s._boostsUsed, s._boostNozzle, s._boostBurnS];
function recordFlight() {
  const e = hull('turbo_ball'); clock.t = 0;
  const actions = [], frames = [];
  const rules = wrapRecordedRules(PORT, (owner) => (owner === e ? 0 : -1), (seat, kind, args) => actions.push({ tick: frames.length, kind, args }));
  for (let n = 0; n < 420; n++) {
    for (const [at, kind, throttle, steer] of PRESSES) {
      if (at !== n) continue;
      e.input.throttle = throttle; e.input.steer = steer;
      rules[kind](e, clock.t);
      e.input.throttle = 0; e.input.steer = 0;
    }
    updateTank(e, field, SIM_DT, null); clock.t += SIM_DT;
    frames.push(trace(e.state));
  }
  return { actions, frames, used: Math.max(...frames.map((f) => f[9])) };
}
function replayFlight(actions, edit = (a) => a) {
  const e = hull('turbo_ball'); clock.t = 0;
  const frames = [];
  for (let n = 0; n < 420; n++) {
    for (const action of actions) if (action.tick === n) replaySeatAction(edit(action), e, { rules: PORT, bus: { emit() {} }, timeS: clock.t });
    updateTank(e, field, SIM_DT, null); clock.t += SIM_DT;
    frames.push(trace(e.state));
  }
  return frames;
}
const recorded = recordFlight();
assert.ok(recorded.used >= 5 && recorded.actions.length === PRESSES.length, `the flight boosted (${recorded.used} spent, ${recorded.actions.length} recorded calls)`);
const replayed = replayFlight(recorded.actions);
const parted = replayed.findIndex((f, n) => f.some((v, k) => v !== recorded.frames[n][k]));
assert.equal(parted, -1, `the replay of the boosted flight is tick-identical (parted at ${parted})`);
// page/authority parity: the same presses as action bits on the shared step (applyHullActions) leave the same hull every tick
function bitsFlight(late = 0) {
  const e = hull('turbo_ball'); clock.t = 0;
  const frames = [];
  for (let n = 0; n < 420; n++) {
    const press = PRESSES.find(([at]) => at + (at === 210 ? late : 0) === n);
    const bits = !press ? 0 : press[1] === 'requestHullTurbo' ? PLAYER_ACTION_BITS.TURBO : F;
    tick(e, bits, press ? { throttle: press[2], steer: press[3] } : null);
    frames.push(trace(e.state));
  }
  return frames;
}
const viaBits = bitsFlight();
const bitsParted = viaBits.findIndex((f, n) => f.some((v, k) => v !== recorded.frames[n][k]));
assert.equal(bitsParted, -1, `the action bits and the page's press leave byte-identical hulls (parted at ${bitsParted})`);
const lateAt = bitsFlight(1).findIndex((f, n) => f.some((v, k) => v !== recorded.frames[n][k]));
assert.equal(lateAt, 210, `control: the side press a tick late is found at its tick (${lateAt})`);
const dropped = replayFlight(recorded.actions, (a) => ({ ...a, args: [a.args[0], 0] }));
const droppedAt = dropped.findIndex((f, n) => f.some((v, k) => v !== recorded.frames[n][k]));
assert.ok(droppedAt === 210, `control: the replay with the recorded steer dropped parts at the side boost (tick ${droppedAt})`);

console.log('thrustBoosts: (i) five belly boosts climb in steps under the cap, (ii) a side boost drifts away from the firing side and rolls without returning, (iii) two sum, (iv) the sixth does nothing until touchdown, (v) the plumes draw only the force applied; the ground press, Turbo\'s butt burn in flight, a tick-identical replay of a boosted flight; planted controls caught');
