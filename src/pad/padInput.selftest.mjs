// The phone controller's input model (docs/PHONE-CONTROLLER.md "Controls"): the floating drive stick, the frame's quarter
// turn on a portrait page, the sight's speed curve, and the desktop mapper that turns frames into the input layer's
// virtual controls — newest frame only, aim from wrapping totals, holds reconciled across the two channels, taps,
// commands, pause and the stale fail-safe. Every action the phone names is a real input action.
import assert from 'node:assert/strict';
import { ACTION_DEFS } from '../game/input.ts';
import { AIM_CURVE, DRIVE_STICK, aimGain, aimSpeed, frameDelta, frameInsets, frameTurnFor, stickKnob, stickValue } from './padInput.ts';
import { PAD_AIM_GAIN, createPadInputMapper, decodePadAxes } from './padDesk.ts';
import { PAD_COMMANDS, PAD_HOLD_ACTIONS, PAD_TAP_ACTIONS, encodePadAxes, readPadCtl } from './padProtocol.ts';

const near = (a, b, eps, label) => assert.ok(Math.abs(a - b) <= eps, `${label}: ${a} vs ${b}`);
const DEG = Math.PI / 180;

// every action the phone may name is an action of the input layer (the phone enters the game only through it)
const ids = new Set(ACTION_DEFS.map((def) => def.id));
for (const action of [...PAD_HOLD_ACTIONS, ...PAD_TAP_ACTIONS]) assert.ok(ids.has(action), `${action} is an input action`);
assert.ok(!PAD_TAP_ACTIONS.includes('settingsMenu') && !PAD_TAP_ACTIONS.includes('leaveBattle'), 'the phone cannot leave a battle by itself');
assert.ok(PAD_HOLD_ACTIONS.length <= 32, 'every hold has a bit in the axes frame');
assert.deepEqual(PAD_HOLD_ACTIONS.slice(0, 3), ['fire', 'handbrake', 'freeLook'], 'the first holds keep their bits');

// The drive stick (owner 2026-11-20: "use joysticks"): a push past a small dead zone, curved, full at the ring and held
// there; its direction kept, so a diagonal stays a diagonal; forward is the screen's up
const R = DRIVE_STICK.radiusPx;
assert.deepEqual(stickValue(0, 0), [0, 0], 'a centred stick is still');
assert.deepEqual(stickValue(R * DRIVE_STICK.deadzone * 0.9, 0), [0, 0], 'a resting thumb\'s wobble moves nothing');
near(stickValue(0, -R)[1], 1, 1e-9, 'pushed up to the ring is full forward');
near(stickValue(0, R * 3)[1], -1, 1e-9, 'past the ring is still full (reverse)');
near(stickValue(R, 0)[0], 1, 1e-9, 'pushed right is full right');
{
  const [x, y] = stickValue(R, -R);
  near(x, y, 1e-9, 'a diagonal stays a diagonal');
  near(Math.hypot(x, y), 1, 1e-9, 'and its length is the push\'s, never past 1');
  const halfway = stickValue(0, -R * (DRIVE_STICK.deadzone + (1 - DRIVE_STICK.deadzone) / 2))[1];
  near(halfway, 0.5 ** DRIVE_STICK.curve, 1e-9, 'half travel is finer than linear');
}
assert.deepEqual(stickKnob(10, 0, R), [10, 0], 'the knob follows the thumb inside the ring');
{
  const [kx, ky] = stickKnob(3 * R, 4 * R, R);
  near(Math.hypot(kx, ky), R, 1e-9, 'and stops at the ring');
  near(kx / ky, 0.75, 1e-9, 'along the thumb\'s direction');
}

// The frame: always landscape; a page the system keeps portrait (an iPhone with rotation lock on, held sideways) turns
// it a quarter, the top to the left, or the other way with Flip; a finger's movement reads in the frame's own axes, and
// the island and the home bar land on the frame's own sides
assert.equal(frameTurnFor(true), 0, 'a landscape page is not turned');
assert.equal(frameTurnFor(true, true), 0, 'Flip turns only a portrait page');
assert.equal(frameTurnFor(false), 90, 'a portrait page: the top to the left');
assert.equal(frameTurnFor(false, true), 270, 'or to the right');
for (const turn of [0, 90, 180, 270]) {
  // CSS rotate(turn) carries the frame's axes onto the viewport; frameDelta brings a movement there back
  const t = turn * DEG, fx = 3, fy = -7;
  const [bx, by] = frameDelta(turn, fx * Math.cos(t) - fy * Math.sin(t), fx * Math.sin(t) + fy * Math.cos(t));
  near(bx, fx, 1e-9, `turn ${turn} x`);
  near(by, fy, 1e-9, `turn ${turn} y`);
}
// turned 90 on Safari's portrait (top 59 is the island, bottom 34 the home bar): the frame's left is the island's side
// and its right the home bar's
assert.deepEqual(frameInsets(90, [59, 0, 34, 0]), [0, 34, 0, 59]);
assert.deepEqual(frameInsets(0, [0, 59, 20, 59]), [0, 59, 20, 59]);

// the sight's drag: slow is 1:1, a swipe a few times as far, a flick the most; the scope caps it lower
assert.equal(aimGain(0), 1, 'a finger at rest keeps the mouse precision');
assert.equal(aimGain(AIM_CURVE.slowPxPerMs), 1, 'and a slow drag');
assert.ok(aimGain(0.5) > 2 && aimGain(0.5) < 3, 'a swipe turns two to three times as far');
assert.equal(aimGain(10), AIM_CURVE.max, 'a flick is capped');
assert.equal(aimGain(10, true), AIM_CURVE.maxScoped, 'and lower in the scope');
assert.ok(aimGain(1) > aimGain(0.5), 'faster is further');
assert.equal(aimGain(Number.NaN), 1);
{
  // a 150 px flick at 1.5 px/ms swings the gun past 90° at the mouse's 0.0022 rad per px (cameraRig BASE_SENS)
  const rad = 150 * PAD_AIM_GAIN * aimGain(1.5) * 0.0022;
  assert.ok(rad > Math.PI / 2, `a flick across the sight turns the gun past 90° (${(rad * 180 / Math.PI).toFixed(0)}°)`);
}
assert.equal(aimSpeed(0, 10, 10), 0.5, 'speed is distance over time, smoothed');
assert.equal(aimSpeed(1, 0, 16), 0.5, 'a still move halves it');
assert.equal(aimSpeed(0, 8, 0), 1, 'two moves in one millisecond read as 4 ms apart, never infinite');

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

  // Watch's descend and boost are holds (it reads them with isDown): the axes bits carry them like the brake
  const DESCEND = 1 << PAD_HOLD_ACTIONS.indexOf('reloadMagazine');
  const watch = port();
  const wm2 = createPadInputMapper(watch);
  wm2.applyAxes(frame(1, { held: DESCEND }), 0);
  assert.ok(watch.held.has('reloadMagazine'), 'a later hold presses from its bit');
  wm2.applyAxes(frame(2), 16);
  assert.ok(!watch.held.has('reloadMagazine'), 'and lets go with it');

  // commands: what no input action names goes to the desktop's own calls, never the input layer
  const commands = [];
  const cm = createPadInputMapper(port(), undefined, (c, n) => commands.push([c, n]));
  cm.applyCtl(readPadCtl(JSON.stringify({ k: 'cmd', c: 'watchNext' })));
  cm.applyCtl(readPadCtl(JSON.stringify({ k: 'cmd', c: 'strikePick', n: 4 })));
  assert.deepEqual(commands, [['watchNext', undefined], ['strikePick', 4]], 'commands reach the command port');
  assert.equal(readPadCtl(JSON.stringify({ k: 'cmd', c: 'strikePick', n: 5 })), null, 'a call-in past the fifth is refused');
  assert.equal(readPadCtl(JSON.stringify({ k: 'cmd', c: 'strikePick' })), null, 'a pick names its call-in');
  assert.equal(readPadCtl(JSON.stringify({ k: 'cmd', c: 'leaveBattle' })), null, 'an unknown command is refused');
  for (const c of PAD_COMMANDS) {
    const message = readPadCtl(JSON.stringify(c === 'strikePick' ? { k: 'cmd', c, n: 0 } : { k: 'cmd', c }));
    assert.equal(message?.c, c, `${c} reads`);
  }
  assert.doesNotThrow(() => createPadInputMapper(port()).applyCtl({ k: 'cmd', c: 'watchNext' }), 'a seat without the port drops commands');

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

  // a phone whose timers are throttled (low power) sends its heartbeat a second apart: the window widens to four of its
  // gaps, to the cap, so a steady hold does not stutter; a phone that streams at its usual rate keeps the short window
  const slow = port();
  const sm = createPadInputMapper(slow);
  for (let i = 0; i < 6; i++) sm.applyAxes(frame(i + 1, { throttle: 1, held: FIRE }), i * 1000);
  sm.tick(5000 + 1400, 400);
  assert.ok(slow.held.has('fire') && slow.move[1] === 1, 'a slow heartbeat holds through its own gap');
  sm.tick(5000 + 1501, 400);
  assert.ok(!slow.held.has('fire') && slow.move[1] === 0, 'and lets go past the 1.5 s cap');
  const fast = port();
  const fm = createPadInputMapper(fast);
  for (let i = 0; i < 20; i++) fm.applyAxes(frame(i + 1, { throttle: 1 }), i * 100);
  fm.tick(1900 + 401, 400);
  assert.equal(fast.move[1], 0, 'a phone at its usual 100 ms keeps the 400 ms window');

  // an idle mapper does not keep writing the stick (keyboard keeps working when the phone is centred)
  const idle = port();
  const im = createPadInputMapper(idle);
  im.applyAxes(frame(1), 0);
  im.tick(5000, 400);
  assert.equal(idle.calls.filter((c) => c[0] === 'move').length, 1, 'a centred, idle phone is not re-zeroed every frame');
}

console.log('padInput: PASS — the drive stick, the portrait turn, the sight\'s speed curve, mapper (frames, aim, holds, taps, commands, pause, fail-safe, throttled heartbeat)');
