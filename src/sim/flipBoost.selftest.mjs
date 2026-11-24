// flipBoost.selftest.mjs — the air spin as a dodge (flip-boost-276; owner 2026-11-24: "make the flip work a lot better as an
// actual boost", "doing a and d and s should do barrel rolls and a reverse flip too"). Copyright (c) 2026 Kevin B. Liu.
//
// Pins, on the shared per-hull action step both drivers call (sim/hullActions.ts) and the solo player's press
// (game/playerBattleActions.ts), in Turbo Ball and Gravity (mars):
//   - each move's shove, at once on the press, and its turn: W or no drive a front flip (+forwardMps along the heading,
//     pitch nose-down), S a back flip (-backMps, pitch nose-up), A a barrel roll left and D right (sideMps toward the side
//     the steer turns to, about the long axis); in flight the dodge stops the fall; the roll's shove carries while it rolls;
//   - it out-runs the drive: a ground dodge from a full-throttle run is metres ahead of the run within the turn, the roll
//     metres to the side;
//   - the cooldown (AirSpinRules.cooldownS): refused while it cools, taken once it has run;
//   - one a flight: a second press in the same flight is refused after the first turn ends and the cooldown has run
//     (F and the air spin's own bit alike); the ground gives it back;
//   - the ground dodge: on its tracks the press hops the hull into the turn, which ends before it lands, on its tracks;
//     refused on its roof;
//   - the ball: a hull mid-dodge strikes it harder than the run alone, and the barrel roll's sideways shove strikes it;
//   - page/authority parity: the solo player's press and the action bit from identical hulls leave byte-identical hulls
//     every tick, F and the air spin's tile, all four moves;
//   - planted controls, each of which the receipt's own checks must catch: a cosmetic flip (no shove) fails the out-run
//     and the ball checks, a flight's dodge left unspent lets the second press through, and the page's press a tick
//     late is found at its tick.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createTankState, updateTank, SIM_DT, AIR_SPIN_AXES, canTankAirSpin } from './movement.ts';
import { matchRulesetFor } from './matchRuleset.ts';
import { applyHullActions } from './hullActions.ts';
import { airSpinReadyIn, pressSelfRight, requestHullAirSpin } from './modeMoves.ts';
import { createMatchModeController } from './matchModes.ts';
import { PLAYER_ACTION_BITS } from './playerActions.ts';
import { createPlayerBattleActions } from '../game/playerBattleActions.ts';
import { createBus } from '../game/stateCore.ts';

const SPEC = {
  name: 'fixture-mbt', enginePowerHp: 1200, weightTons: 50, topSpeedKmh: 65, reverseSpeedKmh: 15,
  hullTraverseDegS: 36, turretTraverseDegS: 36, gunPitchDegS: 24, gunElevationDeg: 25, gunDepressionDeg: 10,
  pivotStyle: 'pivot', terrainResistance: { hard: 1.0, medium: 1.2, soft: 2.2 },
  dims: { hullLengthM: 6.27, overallLengthM: 7.52, widthM: 3.0, heightM: 2.97 },
  gun: { caliberMm: 120, baseAccuracy: 0.38, aimTimeS: 2.3, reloadS: 6, bloom: { move: 0.2, hullRot: 0.2, turret: 0.12, afterShot: 4 } },
  armor: { boundingRadiusM: 3.8, turretPivot: [0, 1.55, 0], gunPivot: [0, 0.25, 0.3], gunBarrel: { lengthM: 4.0 } },
};
const field = { getHeightAt: () => 0, getNormalAt: () => null, getGroundType: () => 'medium' };
const MODES = ['turbo_ball', 'mars'];
const MOVES = [
  { name: 'none', throttle: 0, steer: 0, axis: AIR_SPIN_AXES.FRONT_FLIP },
  { name: 'W', throttle: 1, steer: 0, axis: AIR_SPIN_AXES.FRONT_FLIP },
  { name: 'S', throttle: -1, steer: 0, axis: AIR_SPIN_AXES.BACK_FLIP },
  { name: 'A', throttle: 0, steer: 1, axis: AIR_SPIN_AXES.ROLL_LEFT },
  { name: 'D', throttle: 0, steer: -1, axis: AIR_SPIN_AXES.ROLL_RIGHT },
];
const YAW = 0.7; // off the world axes, so a shove along the wrong one shows

function hull(mode, airSpin = matchRulesetFor(mode).airSpin) {
  const r = matchRulesetFor(mode);
  return {
    id: mode, spec: SPEC, state: createTankState(SPEC, new Vector3(0, 0, 0), YAW),
    input: { throttle: 0, steer: 0, brake: false, aimPoint: null, actionBits: 0, shellSlot: 0 },
    combat: { destroyed: false }, modeGravityScale: r.gravityScale, modePhysics: r.physics, modeSpeedMultiplier: r.speedMultiplier,
    modeJumpMps: r.jumpMps, modeTurbo: r.turbo, modeAirSpin: airSpin,
  };
}
const clock = { t: 0 };
const heard = [];
const host = {
  get timeS() { return clock.t; }, verdict: false, consumables: false, rng: () => 0.5, ground: () => 0, world: null, wind: null,
  supply() {}, smokeLaunched() {}, turboed() {}, airSpun: (e) => heard.push(e.state._airSpinAxis), selfRighted() {},
};
function tick(entity, bits = 0) {
  entity.input.actionBits = bits;
  applyHullActions(entity, host);
  updateTank(entity, field, SIM_DT, null);
  clock.t += SIM_DT;
}
function run(entity, ticks) { for (let n = 0; n < ticks; n++) tick(entity); }
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
/** The hull's ground velocity: its run along the heading plus its translation impulse. */
const velocity = (s) => ({ x: Math.sin(s.yaw) * s.speed + s._spring.recoilVX, z: Math.cos(s.yaw) * s.speed + s._spring.recoilVZ });
const FWD = { x: Math.sin(YAW), z: Math.cos(YAW) };
const SIDE = { x: Math.cos(YAW), z: -Math.sin(YAW) }; // the side a positive steer (A) turns to
const dot = (a, b) => a.x * b.x + a.z * b.z;

/** A hull 20 ticks into a jump (F on the ground), its drive set to the move's. */
function airborne(mode, move, airSpin) {
  const e = hull(mode, airSpin); clock.t = 0; heard.length = 0;
  run(e, 120);
  tick(e, PLAYER_ACTION_BITS.SELF_RIGHT);
  run(e, 20);
  assert.equal(e.state.grounded, false, `${mode}: setup in flight`);
  e.input.throttle = move.throttle; e.input.steer = move.steer;
  return e;
}

// ---- each move's shove and turn, in flight
for (const mode of MODES) {
  const rules = matchRulesetFor(mode).airSpin;
  for (const move of MOVES) {
    const e = airborne(mode, move);
    const v0 = velocity(e.state), speed0 = e.state.speed;
    e.input.actionBits = PLAYER_ACTION_BITS.AIR_SPIN;
    applyHullActions(e, host);
    const v1 = velocity(e.state), dv = { x: v1.x - v0.x, z: v1.z - v0.z };
    assert.equal(e.state._airSpinAxis, move.axis, `${mode} ${move.name}: the move's axis`);
    assert.deepEqual(heard, [move.axis], `${mode} ${move.name}: heard`);
    const along = dot(dv, FWD), side = dot(dv, SIDE);
    if (Math.abs(move.axis) === 1) {
      const want = move.axis === AIR_SPIN_AXES.FRONT_FLIP ? rules.forwardMps : -rules.backMps;
      assert.ok(Math.abs(along - want) < 1e-9 && Math.abs(side) < 1e-9, `${mode} ${move.name}: ${want} m/s along the heading (${along.toFixed(3)}, side ${side.toFixed(3)})`);
      assert.ok(Math.abs(e.state.speed - speed0 - want) < 1e-9, `${mode} ${move.name}: into the run speed`);
    } else {
      const want = move.axis === AIR_SPIN_AXES.ROLL_LEFT ? rules.sideMps : -rules.sideMps;
      assert.ok(Math.abs(side - want) < 1e-9 && Math.abs(along) < 1e-9, `${mode} ${move.name}: ${want} m/s to the side (${side.toFixed(3)}, along ${along.toFixed(3)})`);
    }
    assert.ok(e.state._ride.v >= 0 && e.state.verticalSpeed >= 0, `${mode} ${move.name}: the fall stopped`);
    // the turn: a whole one about the move's axis, the other axis held near level
    const [spun, held] = Math.abs(move.axis) === 1 ? ['visualPitch', 'visualRoll'] : ['visualRoll', 'visualPitch'];
    let turned = 0, last = e.state[spun], drift = 0, ticks = 0;
    const startSide = dot(e.state.pos, SIDE), startAlong = dot(e.state.pos, FWD);
    updateTank(e, field, SIM_DT, null); clock.t += SIM_DT;
    turned += wrap(e.state[spun] - last); last = e.state[spun]; ticks++;
    while (e.state._airSpinAxis && ticks < 120) {
      tick(e); turned += wrap(e.state[spun] - last); last = e.state[spun]; drift = Math.max(drift, Math.abs(e.state[held])); ticks++;
    }
    assert.ok(Math.abs(Math.abs(turned) - 2 * Math.PI) < 0.35 && Math.sign(turned) === Math.sign(move.axis),
      `${mode} ${move.name}: one whole turn about its ${spun === 'visualPitch' ? 'pitch' : 'long'} axis (${turned.toFixed(2)} rad)`);
    assert.ok(drift < 0.35, `${mode} ${move.name}: the other axis held (${drift.toFixed(2)} rad)`);
    if (Math.abs(move.axis) === 2) {
      // the roll's shove carries while it rolls: the hull moves most of sideMps × the turn to the side
      const moved = (dot(e.state.pos, SIDE) - startSide) * Math.sign(move.axis);
      assert.ok(moved > rules.sideMps * 0.6 * 0.85, `${mode} ${move.name}: the roll carries the hull ${moved.toFixed(1)} m to the side`);
    }
    void startAlong;
  }
}

// ---- it out-runs the drive: a ground dodge from a full-throttle run against the run alone, over the turn
/** Metres the ground dodge (W, or A) leaves the hull ahead of (beside) a full-throttle run after `seconds`. */
function outrun(mode, airSpin, move, seconds = 0.6) {
  const a = hull(mode, airSpin), b = hull(mode, airSpin);
  for (const e of [a, b]) { e.input.throttle = 1; clock.t = 0; run(e, 240); }
  const speed = a.state.speed;
  b.input.throttle = move.throttle || 1; b.input.steer = move.steer;
  clock.t = 10; tick(b, PLAYER_ACTION_BITS.AIR_SPIN);
  b.input.throttle = 1; b.input.steer = 0;
  tick(a);
  for (let n = 1; n < Math.round(seconds / SIM_DT); n++) { tick(a); tick(b); }
  const d = { x: b.state.pos.x - a.state.pos.x, z: b.state.pos.z - a.state.pos.z };
  return { speed, ahead: dot(d, FWD), aside: dot(d, SIDE), driveGain: a.state.speed - speed };
}
const OUTRUN_M = 3, ASIDE_M = 4;
for (const mode of MODES) {
  const fwd = outrun(mode, undefined, MOVES[1]);
  assert.ok(fwd.ahead > OUTRUN_M, `${mode}: the front flip is ${fwd.ahead.toFixed(1)} m ahead of a full-throttle run at ${fwd.speed.toFixed(1)} m/s within its 0.6 s turn`);
  const roll = outrun(mode, undefined, MOVES[3]);
  assert.ok(roll.aside > ASIDE_M, `${mode}: the barrel roll is ${roll.aside.toFixed(1)} m to the side of the run`);
  const back = outrun(mode, undefined, MOVES[2]);
  assert.ok(back.ahead < -OUTRUN_M, `${mode}: the back flip falls ${(-back.ahead).toFixed(1)} m behind the run`);
  console.log(`flipBoost: ${mode} from ${fwd.speed.toFixed(1)} m/s over 0.6 s: front +${fwd.ahead.toFixed(1)} m, roll ${roll.aside.toFixed(1)} m aside, back ${back.ahead.toFixed(1)} m (the drive alone gains ${fwd.driveGain.toFixed(2)} m/s)`);
}
// planted control: a cosmetic flip (the 275 spin, no shove) fails the out-run check
{
  const cosmetic = { ...matchRulesetFor('turbo_ball').airSpin, forwardMps: 0, backMps: 0, sideMps: 0 };
  const fwd = outrun('turbo_ball', cosmetic, MOVES[1]);
  const roll = outrun('turbo_ball', cosmetic, MOVES[3]);
  assert.ok(!(fwd.ahead > OUTRUN_M) && !(roll.aside > ASIDE_M), `planted: a cosmetic flip is caught (${fwd.ahead.toFixed(2)} m ahead, ${roll.aside.toFixed(2)} m aside)`);
}

// ---- the cooldown, and one a flight
for (const mode of MODES) {
  const rules = matchRulesetFor(mode).airSpin;
  // the cooldown: a ground dodge, then the hull set back on the ground (a fresh pose: its dodge given back, the cooldown the
  // entity's) a quarter second on, inside the cooldown (refused), and after it (taken)
  const e = hull(mode); clock.t = 0; heard.length = 0;
  run(e, 120);
  tick(e, PLAYER_ACTION_BITS.AIR_SPIN);
  assert.equal(heard.length, 1, `${mode}: the ground dodge taken`);
  assert.ok(Math.abs(airSpinReadyIn(e, clock.t) - (rules.cooldownS - SIM_DT)) < 1e-9, `${mode}: its cooldown starts`);
  run(e, 15);
  e.state = createTankState(SPEC, new Vector3(0, 0, 0), YAW);
  run(e, 2);
  assert.ok(airSpinReadyIn(e, clock.t) > 0 && e.state.grounded, `${mode}: setup back on the ground inside the cooldown`);
  assert.equal(canTankAirSpin(e.state), true, `${mode}: the ground gave the dodge back`);
  tick(e, PLAYER_ACTION_BITS.AIR_SPIN);
  assert.equal(heard.length, 1, `${mode}: refused while it cools`);
  while (airSpinReadyIn(e, clock.t) > 0) tick(e);
  tick(e, PLAYER_ACTION_BITS.AIR_SPIN);
  assert.equal(heard.length, 2, `${mode}: taken once it has run (${rules.cooldownS} s)`);
}
/** A jump, a flip, then a second press in the same flight once the turn has ended and the cooldown has run. */
function secondInFlight(mode, press, plant = false) {
  const e = airborne(mode, MOVES[1]);
  tick(e, PLAYER_ACTION_BITS.AIR_SPIN);
  while (e.state._airSpinAxis) tick(e);
  while (airSpinReadyIn(e, clock.t) > 0) tick(e);
  assert.equal(e.state.grounded, false, `${mode}: setup still in flight after the turn and the cooldown`);
  if (plant) e.state._flipUsed = false;
  const before = heard.length;
  tick(e, press);
  return { taken: heard.length > before, e };
}
for (const mode of MODES) {
  for (const [press, name] of [[PLAYER_ACTION_BITS.AIR_SPIN, 'the air spin'], [PLAYER_ACTION_BITS.SELF_RIGHT, 'F']]) {
    const { taken, e } = secondInFlight(mode, press);
    assert.equal(taken, false, `${mode}: ${name} refuses a second dodge in one flight`);
    assert.equal(canTankAirSpin(e.state), false, `${mode}: and the HUD greys it`);
    while (!e.state.grounded) tick(e);
    run(e, 2);
    assert.equal(canTankAirSpin(e.state), true, `${mode}: the ground gives it back`);
  }
}
assert.equal(secondInFlight('turbo_ball', PLAYER_ACTION_BITS.AIR_SPIN, true).taken, true, 'planted: a flight\'s dodge left unspent is caught');

// ---- the ground dodge: a hop into the turn, ended before the landing, on its tracks; refused on its roof
for (const mode of MODES) {
  for (const move of MOVES.slice(1)) {
    const e = hull(mode); clock.t = 0; run(e, 120);
    e.input.throttle = move.throttle; e.input.steer = move.steer;
    tick(e, PLAYER_ACTION_BITS.AIR_SPIN);
    assert.equal(e.state._airSpinAxis, move.axis, `${mode} ${move.name}: the ground dodge's move`);
    assert.equal(e.state.grounded, false, `${mode} ${move.name}: the hop leaves the ground`);
    e.input.throttle = 0; e.input.steer = 0;
    let ticks = 0; while (e.state._airSpinAxis && !e.state.grounded && ticks < 200) { tick(e); ticks++; }
    assert.equal(e.state._airSpinAxis, 0, `${mode} ${move.name}: the turn ends in the air (${ticks} ticks)`);
    while (!e.state.grounded) tick(e);
    run(e, 120);
    assert.equal(e.state.overturned, false, `${mode} ${move.name}: lands on its tracks`);
  }
  const roof = hull(mode); clock.t = 0; run(roof, 60);
  roof.state.overturned = true; roof.state._body.tumbling = true;
  heard.length = 0;
  roof.input.actionBits = PLAYER_ACTION_BITS.AIR_SPIN; applyHullActions(roof, host);
  assert.equal(heard.length, 0, `${mode}: no ground dodge on its roof`);
}

// ---- the ball: a hull mid-dodge strikes harder than its run; the barrel roll's sideways shove strikes it
/** The ball's speed after one touch by a hull `move`d at it from `speed`, with the air spin's rules `airSpin`. */
function strike(move, airSpin, speed = 12) {
  const striker = hull('turbo_ball', airSpin);
  striker.id = 'striker'; striker.team = 'alpha';
  striker.combat = { hp: 100, maxHp: 100, destroyed: false, ammo: [1], ammoCapacity: [1] };
  const other = hull('turbo_ball'); other.id = 'other'; other.team = 'bravo';
  other.combat = { hp: 100, maxHp: 100, destroyed: false, ammo: [1], ammoCapacity: [1] };
  other.state.pos.set(0, 0, 200);
  const match = createMatchModeController({ mode: 'turbo_ball', entities: [striker, other], seed: 42, terrainHeight: () => 0,
    setActive() {}, revive() {}, emit() {} });
  if (airSpin) striker.modeAirSpin = airSpin; // the controller stamps the ruleset's; a planted rule goes on after it
  const ball = match.state.ball;
  ball.vx = 0; ball.vy = 0; ball.vz = 0;
  // the hull 5 m short of the ball along the move's direction, already at speed
  const dir = Math.abs(move.axis) === 2 ? { x: SIDE.x * Math.sign(move.axis), z: SIDE.z * Math.sign(move.axis) } : FWD;
  striker.state.pos.set(ball.x - dir.x * 5, 0, ball.z - dir.z * 5);
  striker.state.yaw = YAW; striker.state.speed = Math.abs(move.axis) === 2 ? 0 : speed;
  striker.state.grounded = false; striker.state._ride.grounded = false;
  striker.input.throttle = move.throttle; striker.input.steer = move.steer;
  if (move.axis) requestHullAirSpin(striker, 100);
  match.step(SIM_DT, 100);
  return Math.hypot(ball.vx, ball.vz);
}
{
  const run0 = strike({ axis: 0, throttle: 1, steer: 0 }, undefined);
  const flip = strike(MOVES[1], undefined);
  const roll = strike(MOVES[3], undefined);
  assert.ok(flip > run0 * 1.5, `the front flip strikes the ball at ${flip.toFixed(1)} m/s, the run alone ${run0.toFixed(1)}`);
  assert.ok(roll > 12, `the barrel roll strikes it sideways at ${roll.toFixed(1)} m/s from a standing run`);
  // planted control: a cosmetic flip (no shove) strikes with the run and the dodge's own strike alone, and both checks catch it
  const cosmetic = { ...matchRulesetFor('turbo_ball').airSpin, forwardMps: 0, backMps: 0, sideMps: 0 };
  const flat = strike(MOVES[1], cosmetic), flatRoll = strike(MOVES[3], cosmetic);
  assert.ok(!(flat > run0 * 1.5) && !(flatRoll > 12), `planted: a cosmetic flip's strike is caught (${flat.toFixed(1)}, roll ${flatRoll.toFixed(1)})`);
  console.log(`flipBoost: the ball from a 12 m/s run: ${run0.toFixed(1)} m/s; front flip ${flip.toFixed(1)}; barrel roll from 0 m/s ${roll.toFixed(1)}`);
}

// ---- page/authority parity: the solo player's press and the action bit, from identical hulls
function pagePress() {
  const handlers = new Map();
  const input = {
    onAction(action, listener) { (handlers.get(action) ?? handlers.set(action, new Set()).get(action)).add(listener); return () => handlers.get(action).delete(listener); },
    press(action) { for (const listener of handlers.get(action) ?? []) listener('KeyF'); },
  };
  const bus = createBus(() => {});
  const game = { phase: 'battle', timeS: 0, player: null, ruleset: matchRulesetFor('turbo_ball') };
  const rules = {
    pressSelfRight, requestHullAirSpin, requestHullTurbo: () => false, requestTankSelfRight: () => false, requestTankJump: () => false,
    rulesetUnlimitedFor: () => false, hasConsumableRule: () => false, selectShell: () => false,
  };
  createPlayerBattleActions({ game, bus, input, rules, network: { isActive: () => false, queueAction() {} },
    strikes: { modeOn: () => false }, isSettingsOpen: () => false });
  return { game, bus, input };
}
const BYTES = (s) => new Float64Array([s.pos.x, s.pos.y, s.pos.z, s.yaw, s.speed, s.verticalSpeed, s.visualPitch, s.visualRoll,
  s._spring.recoilVX, s._spring.recoilVZ, s._spring.pitchV, s._spring.rollV, s._airSpinAxis, s._airSpinLeft, Number(s._flipUsed)]);
/** The first tick the page's hull and the authority's differ at (-1: never), the page's press `lateBy` ticks late. */
function parity(mode, move, via, lateBy = 0) {
  const page = pagePress();
  const P = hull(mode), A = hull(mode);
  P.combat = { destroyed: false, hp: 1, maxHp: 1, ammo: [1], ammoCapacity: [1], shellSlot: 0, crew: {}, fire: { burning: false } };
  page.game.player = P;
  clock.t = 0;
  const step = (n, press) => {
    page.game.timeS = clock.t;
    if (n === press + lateBy) { if (via === 'F') page.input.press('selfRight'); else page.bus.emit('ui:airSpin', {}); }
    A.input.actionBits = n === press ? (via === 'F' ? PLAYER_ACTION_BITS.SELF_RIGHT : PLAYER_ACTION_BITS.AIR_SPIN) : 0;
    applyHullActions(A, host);
    // the page's own action step (state.ts simStep) runs its pressed bits too: none here, the press went straight in
    P.input.actionBits = 0; applyHullActions(P, host);
    updateTank(P, field, SIM_DT, null); updateTank(A, field, SIM_DT, null);
    clock.t += SIM_DT;
  };
  // both jump on the authority's bit (the page jumps through the same rule), fly, then the move's press
  for (let n = 0; n < 60; n++) {
    if (n === 40) { P.input.actionBits = PLAYER_ACTION_BITS.SELF_RIGHT; applyHullActions(P, host); }
    A.input.actionBits = n === 40 ? PLAYER_ACTION_BITS.SELF_RIGHT : 0; applyHullActions(A, host);
    updateTank(P, field, SIM_DT, null); updateTank(A, field, SIM_DT, null); clock.t += SIM_DT;
  }
  for (const e of [P, A]) { e.input.throttle = move.throttle; e.input.steer = move.steer; }
  for (let n = 0; n < 120; n++) {
    step(n, 5);
    const p = BYTES(P.state), a = BYTES(A.state);
    for (let i = 0; i < p.length; i++) if (!Object.is(p[i], a[i])) return n;
  }
  return -1;
}
for (const mode of MODES) {
  for (const move of MOVES) {
    for (const via of ['tile', 'F']) assert.equal(parity(mode, move, via), -1, `${mode} ${move.name} (${via}): the page's press and the authority's bit leave identical hulls`);
  }
}
assert.equal(parity('mars', MOVES[3], 'tile', 1), 5, 'planted: the page\'s press a tick late is found at its tick');

console.log('flipBoost: in Turbo Ball and Gravity the air spin dodges: W/none a front flip +forward, S a back flip -back, A/D a barrel roll to the side, at once, the fall stopped; it out-runs the drive; a cooldown; one a flight, the ground giving it back; a ground dodge hops into a turn that ends in the air; mid-dodge the ball is struck harder, the roll striking it sideways; the page\'s press and the authority\'s bit are byte-identical; four planted controls caught');
