// The phone controller's input model (docs/PHONE-CONTROLLER.md "Controls"): the wheel angle from deviceorientation in
// every landscape and lean, the steering curve, the lever, and the desktop mapper that turns frames into the input
// layer's virtual controls — newest frame only, aim from wrapping totals, holds reconciled across the two channels,
// taps, pause and the stale fail-safe. Every action the phone names is a real input action.
import assert from 'node:assert/strict';
import { ACTION_DEFS } from '../game/input.ts';
import { DEFAULT_STEERING, PAD_AIM_GAIN, createPadInputMapper, leverValue, steerFromAngle, wheelAngleDeg, wrapDeg } from './padInput.ts';
import { PAD_HOLD_ACTIONS, PAD_TAP_ACTIONS, decodePadAxes, encodePadAxes } from './padProtocol.ts';

const near = (a, b, eps, label) => assert.ok(Math.abs(a - b) <= eps, `${label}: ${a} vs ${b}`);
const DEG = Math.PI / 180;

// every action the phone may name is an action of the input layer (the phone enters the game only through it)
const ids = new Set(ACTION_DEFS.map((def) => def.id));
for (const action of [...PAD_HOLD_ACTIONS, ...PAD_TAP_ACTIONS]) assert.ok(ids.has(action), `${action} is an input action`);
assert.ok(!PAD_TAP_ACTIONS.includes('settingsMenu') && !PAD_TAP_ACTIONS.includes('leaveBattle'), 'the phone cannot leave a battle by itself');

/** deviceorientation (β, γ) for a phone in a screen rotation, turned like a wheel by θ (clockwise +) and leaned back by λ. */
function orientationFor(screenDeg, wheelDeg, leanDeg) {
  const t = wheelDeg * DEG, l = leanDeg * DEG, a = screenDeg * DEG;
  const right = -Math.sin(t) * Math.cos(l);
  const up = Math.cos(t) * Math.cos(l);
  const normal = Math.sin(l);
  const ux = right * Math.cos(a) + up * Math.sin(a);
  const uy = -right * Math.sin(a) + up * Math.cos(a);
  return { beta: Math.asin(uy) / DEG, gamma: Math.atan2(-ux, normal) / DEG };
}

for (const screen of [90, 270, 0]) {
  for (const lean of [5, 30, 60]) {
    for (const wheel of [-60, -25, -4, 0, 4, 25, 60]) {
      const { beta, gamma } = orientationFor(screen, wheel, lean);
      near(wheelAngleDeg(beta, gamma, screen), wheel, 0.01, `screen ${screen} lean ${lean} wheel ${wheel}`);
    }
  }
}
const flat = orientationFor(90, 20, 85);
assert.equal(wheelAngleDeg(flat.beta, flat.gamma, 90), null, 'a phone lying flat is no wheel');
assert.equal(wheelAngleDeg(NaN, 0, 90), null, 'no sensor reading, no angle');

// the curve: a dead zone, finer near centre, full lock at maxAngle, around any centre (wrapping)
assert.equal(steerFromAngle(2, 0), 0, 'inside the dead zone');
assert.equal(steerFromAngle(-2.9, 0), -0, 'inside the dead zone (left)');
assert.equal(steerFromAngle(35, 0), 1, 'full lock right');
assert.equal(steerFromAngle(-90, 0), -1, 'past full lock clamps');
const half = steerFromAngle(DEFAULT_STEERING.deadzoneDeg + (DEFAULT_STEERING.maxAngleDeg - DEFAULT_STEERING.deadzoneDeg) / 2, 0);
near(half, 0.5 ** DEFAULT_STEERING.curve, 1e-9, 'half travel is finer than linear');
near(steerFromAngle(175, -170), -steerFromAngle(15, 0), 1e-9, 'the centre wraps through ±180 (175° is 15° left of −170°)');
assert.ok(steerFromAngle(10, 20) < 0, 'left of a re-centred wheel steers left');
assert.equal(wrapDeg(190), -170);
assert.equal(wrapDeg(-180), 180);
assert.equal(leverValue(0.03, 1), 0, 'the lever has a small dead zone');
assert.equal(leverValue(2, 1), 1);
assert.equal(leverValue(-1, 1), -1);
assert.equal(leverValue(1, 0), 0);

// --- the mapper -------------------------------------------------------------------------------------------------
function port() {
  const calls = [];
  const held = new Set();
  let move = [0, 0];
  let aim = [0, 0];
  return {
    calls, held,
    get move() { return move; }, get aim() { return aim; },
    setVirtualMove: (x, y) => { move = [x, y]; calls.push(['move', x, y]); },
    addVirtualAim: (dx, dy) => { aim = [aim[0] + dx, aim[1] + dy]; calls.push(['aim', dx, dy]); },
    pressVirtual: (a) => { held.add(a); calls.push(['press', a]); },
    releaseVirtual: (a) => { held.delete(a); calls.push(['release', a]); },
    tapVirtual: (a) => calls.push(['tap', a]),
  };
}
const frame = (seq, fields = {}) => {
  const out = {};
  decodePadAxes(encodePadAxes({ flags: 1, seq, t: seq * 16, steer: 0, throttle: 0, aimX: 0, aimY: 0, held: 0, ...fields }), out);
  return out;
};
const FIRE = 1 << PAD_HOLD_ACTIONS.indexOf('fire');
const BRAKE = 1 << PAD_HOLD_ACTIONS.indexOf('handbrake');

{
  const input = port();
  let paused = 0;
  const mapper = createPadInputMapper(input, () => paused++);
  assert.equal(mapper.applyAxes(frame(10, { steer: 0.5, throttle: -1, aimX: 100, aimY: 50 }), 1000), true);
  assert.deepEqual(input.move.map((v) => Math.round(v * 1000) / 1000), [0.5, -1], 'the stick drives the virtual move (x right, y forward)');
  assert.deepEqual(input.aim, [0, 0], 'the first frame is the aim baseline, not a swing');
  mapper.applyAxes(frame(11, { steer: 0.5, aimX: 108, aimY: 46 }), 1016);
  near(input.aim[0], 8 * PAD_AIM_GAIN, 1e-9, 'aim is the difference of totals');
  near(input.aim[1], -4 * PAD_AIM_GAIN, 1e-9, 'aim y');
  assert.equal(mapper.applyAxes(frame(9, { steer: -1 }), 1020), false, 'an older frame is ignored (unordered channel)');
  assert.ok(input.move[0] > 0, 'the stale frame did not steer');
  // a lost frame loses no aim: frame 13 carries the total through 12
  mapper.applyAxes(frame(13, { steer: 0.5, aimX: 130, aimY: 46 }), 1050);
  near(input.aim[0], 30 * PAD_AIM_GAIN, 1e-9, 'aim survives a lost frame');
  // wrapping totals
  const wrap = createPadInputMapper(port());
  const w = port();
  const wm = createPadInputMapper(w);
  wm.applyAxes(frame(1, { aimX: 2 ** 31 / 8 - 1 }), 0);
  wm.applyAxes(frame(2, { aimX: 2 ** 31 / 8 + 1 }), 16);
  near(w.aim[0], 2 * PAD_AIM_GAIN, 1e-9, 'aim totals wrap across int32');
  void wrap;

  // holds: ctl down presses at once; the axes bit is the truth for frames at or after the event's seq
  mapper.applyCtl({ k: 'down', a: 'fire', s: 14 });
  assert.ok(input.held.has('fire'), 'ctl down presses fire');
  mapper.applyAxes(frame(14, { held: FIRE, steer: 0.5, aimX: 130, aimY: 46 }), 1060);
  assert.ok(input.held.has('fire'));
  mapper.applyCtl({ k: 'up', a: 'fire', s: 16 });
  assert.ok(!input.held.has('fire'), 'ctl up releases');
  mapper.applyAxes(frame(15, { held: FIRE, aimX: 130, aimY: 46 }), 1070);
  assert.ok(!input.held.has('fire'), 'a frame older than the release (the channels cross) does not re-press');
  // a lost ctl down (the relay's rate limit) is recovered from the axes bit
  mapper.applyAxes(frame(17, { held: BRAKE, aimX: 130, aimY: 46 }), 1080);
  assert.ok(input.held.has('handbrake'), 'the held bit presses a hold whose ctl event was lost');
  mapper.applyAxes(frame(18, { aimX: 130, aimY: 46 }), 1090);
  assert.ok(!input.held.has('handbrake'), 'and releases it');

  mapper.applyCtl({ k: 'tap', a: 'shell2' });
  assert.deepEqual(input.calls.at(-1), ['tap', 'shell2'], 'taps go through tapVirtual (one action edge)');
  mapper.applyCtl({ k: 'pause' });
  assert.equal(paused, 1, 'pause goes to the host port, not an input action');

  // the fail-safe: a phone that went quiet centres the stick and releases its holds
  mapper.applyCtl({ k: 'down', a: 'fire', s: 19 });
  mapper.applyAxes(frame(19, { steer: 1, throttle: 1, held: FIRE, aimX: 130, aimY: 46 }), 2000);
  mapper.tick(2300, 400);
  assert.ok(input.held.has('fire'), 'inside the stale window nothing changes');
  mapper.tick(2401, 400);
  assert.deepEqual(input.move, [0, 0], 'a stale link centres the stick');
  assert.ok(!input.held.has('fire'), 'and releases held controls');
  const aimBefore = input.aim[0];
  mapper.applyAxes(frame(25, { aimX: 900, aimY: 46 }), 3000);
  assert.equal(input.aim[0], aimBefore, 'after a stale gap the next frame is a fresh baseline (no swing)');

  // a phone that reloaded and resumed restarts its sequence: far behind the newest is a new stream, not a late frame
  const restart = port();
  const rm = createPadInputMapper(restart);
  rm.applyAxes(frame(5000, { aimX: 400 }), 0);
  assert.equal(rm.applyAxes(frame(4990, { steer: 1 }), 16), false, 'ten behind is a late frame');
  assert.equal(rm.applyAxes(frame(1, { steer: 0.5, aimX: 0 }), 32), true, 'a restarted sequence is taken');
  assert.ok(restart.move[0] > 0.4, 'the restarted phone steers');
  assert.equal(restart.aim[0], 0, 'and its new aim total is a baseline, not a swing back');
  assert.equal(rm.applyAxes(frame(2, { steer: 0.5, aimX: 8 }), 48), true);

  // an idle mapper does not keep writing the stick (keyboard keeps working when the phone is centred)
  const idle = port();
  const im = createPadInputMapper(idle);
  im.applyAxes(frame(1), 0);
  im.tick(5000, 400);
  assert.equal(idle.calls.filter((c) => c[0] === 'move').length, 1, 'a centred, idle phone is not re-zeroed every frame');
}

console.log('padInput: PASS — wheel angle in every landscape and lean, steering curve, lever, mapper (frames, aim, holds, taps, pause, fail-safe)');
