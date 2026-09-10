import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { installCameraInputObserver, dispatchCameraInputPulse, prepareCameraInput,
  cameraInputSchedule, runCameraInputWindow } from './perfprobe-camera-input.mjs';

const plain = value => JSON.parse(JSON.stringify(value));

// No DOM, browser, real timers or input implementation. The fixture executes
// the exact page function and keeps all pose writes inside the original rig.
function fixture(options = {}, { quietFrames = 2 } = {}) {
  let now = 100, serial = 0, permitPoseWrite = false;
  const timers = new Map(), frames = new Map(), listeners = new Map();
  const calls = [], timerDelays = [];
  const originalResult = { owner: 'original-rig-return' };
  const surface = { focused: true, hidden: false, open: false, killcam: false };
  const pose = (values) => {
    const target = { ...values };
    return new Proxy(target, { set(object, key, value) {
      assert.equal(permitPoseWrite, true, `observer must not write camera.${String(key)}`);
      object[key] = value;
      return true;
    } });
  };
  const quaternion = pose({ x: 0, y: 0, z: 0, w: 1 });
  const camera = {
    quaternion,
    rotation: pose({ x: 0, y: 0, z: 0, order: 'YXZ' }),
    position: pose({ x: 0, y: 2, z: 0 }),
    matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 2, 0, 1] },
  };
  // Methods are installed on the backing descriptor so setup itself does not
  // exercise the pose-write guard used during observation.
  Object.defineProperty(quaternion, 'toArray', { configurable: true, value: () => [quaternion.x, quaternion.y, quaternion.z, quaternion.w] });
  Object.defineProperty(camera.rotation, 'toArray', { configurable: true, value: () => [camera.rotation.x, camera.rotation.y, camera.rotation.z, camera.rotation.order] });
  Object.defineProperty(camera.position, 'toArray', { value: () => [camera.position.x, camera.position.y, camera.position.z] });
  const setYaw = (yaw, { translate = 0, negate = false } = {}) => {
    permitPoseWrite = true;
    try {
      const sign = negate ? -1 : 1;
      Object.assign(quaternion, { x: 0, y: Math.sin(yaw / 2) * sign, z: 0, w: Math.cos(yaw / 2) * sign });
      camera.rotation.y = yaw;
      camera.position.x += translate;
      const e = camera.matrixWorld.elements;
      e[0] = Math.cos(yaw); e[2] = -Math.sin(yaw);
      e[8] = Math.sin(yaw); e[10] = Math.cos(yaw); e[12] = camera.position.x;
    } finally { permitPoseWrite = false; }
  };
  const canvas = { isConnected: true, getBoundingClientRect: () => ({ left: 10, top: 20, width: 1000, height: 600 }) };
  const game = { phase: 'battle', preBattleS: 0, result: null,
    player: { combat: { destroyed: false }, input: { throttle: 1, steer: -1, fire: true } } };
  const settings = { sensitivity: 1, aimSmoothing: 0.2, sniperSensScale: 0.6, invertY: false };
  const input = {
    getSettings: () => settings,
    isLocked: () => document.pointerLockElement === canvas,
    consumeMouseDelta() { assert.fail('observer cannot consume the live input accumulator'); },
    poll() { assert.fail('observer cannot poll live input'); },
  };
  let originalBehavior = (_dt, frame) => setYaw(camera.rotation.y + (frame.mouseDX || 0) * 0.0025);
  function original(...args) {
    calls.push({ receiver: this, args });
    originalBehavior(...args);
    return originalResult;
  }
  const rig = { mode: 'ARCADE', update: original };
  const debug = { rig, camera, game, input, renderer: { domElement: canvas, info: { render: { frame: 10 } } },
    settings: { isOpen: () => surface.open }, killcam: { isActive: () => surface.killcam } };
  const document = {
    pointerLockElement: canvas,
    get hidden() { return surface.hidden; }, hasFocus: () => surface.focused,
  };
  const window = { __DEBUG: debug,
    addEventListener(type, callback, eventOptions) {
      const rows = listeners.get(type) || [];
      rows.push({ callback, eventOptions }); listeners.set(type, rows);
    },
    removeEventListener(type, callback) {
      listeners.set(type, (listeners.get(type) || []).filter(row => row.callback !== callback));
    },
  };
  document.addEventListener = window.addEventListener;
  document.removeEventListener = window.removeEventListener;
  const context = {
    window, document, performance: { now: () => now, timeOrigin: 100000 },
    setTimeout(callback, delay) {
      timerDelays.push(delay); timers.set(++serial, { callback, at: now + delay }); return serial;
    },
    clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame(callback) { frames.set(++serial, callback); return serial; },
    cancelAnimationFrame(id) { frames.delete(id); },
  };
  const install = () => runInNewContext(`(${installCameraInputObserver.toString()})(${JSON.stringify(options)})`, context);
  install();
  for (let i = 0; i < quietFrames; i++) rig.update(1 / 60, { mouseDX: 0, mouseDY: 0 });
  calls.length = 0;
  return { camera, canvas, game, rig, debug, document, window, input, settings, surface,
    calls, original, originalResult, frames, timers, listeners, timerDelays, install, setYaw,
    get controller() { return window.__PERF_CAMERA_INPUT; },
    set behavior(value) { originalBehavior = value; },
    at(value) { now = value; },
    emit(changes = {}) {
      const event = { isTrusted: true, movementX: 24, movementY: 0, timeStamp: now, clientX: 524, clientY: 300,
        target: canvas, ...changes };
      for (const { callback } of [...(listeners.get('mousemove') || [])]) callback(event);
    },
    frame(at = now + 16) {
      now = at;
      const callbacks = [...frames.values()]; frames.clear();
      callbacks.forEach(callback => callback(now));
    },
    expire(at = now + 2000) {
      now = at;
      for (const [id, timer] of [...timers]) {
        if (timer.at > now) continue;
        timers.delete(id); timer.callback();
      }
    },
    listenerCount() { return [...listeners.values()].reduce((sum, rows) => sum + rows.length, 0); },
  };
}

for (const quietFrames of [0, 1]) {
  const f = fixture({}, { quietFrames }), c = f.controller;
  const result = c.arm({ id: 1, movementX: 24 });
  assert.equal(result.status, 'unsupported');
  assert.equal(result.reason, 'mouse-input-not-quiet', 'one settled update cannot hide a smoothing tail');
  f.rig.update(1 / 60, { mouseDX: -0.1, mouseDY: 0 });
  f.rig.update(1 / 60, { mouseDX: 0, mouseDY: 0 });
  assert.equal(c.arm({ id: 2, movementX: 24 }).reason, 'mouse-input-not-quiet', 'nonzero input resets the quiet count');
  f.rig.update(1 / 60, { mouseDX: 0, mouseDY: 0 });
  assert.equal(c.arm({ id: 3, movementX: 24 }).status, 'armed');
  c.dispose();
}

{
  const f = fixture({}, { quietFrames: 0 }), c = f.controller;
  const settings = { offsetMs: 2000, sampleMs: 5000, notBeforeAt: 2500 };
  f.window.__PERF = { startedAt: null, done: false };
  assert.equal(c.slotState(settings).status, 'waiting', 'null start is not a zero-time sample');
  f.window.__PERF.startedAt = 0;
  f.at(2499);
  assert.equal(c.slotState(settings).status, 'waiting', 'nominal deadline cannot shorten actual event spacing');
  f.at(2500);
  assert.equal(c.slotState(settings).status, 'waiting', 'elapsed time alone cannot certify a quiet input tail');
  f.rig.update(1 / 60, { mouseDX: 0, mouseDY: 0 });
  assert.equal(c.slotState(settings).status, 'waiting', 'one quiet update is insufficient');
  f.rig.update(1 / 60, { mouseDX: 0, mouseDY: 0 });
  assert.equal(c.slotState(settings).status, 'ready');
  assert.equal(c.snapshot().requestedInputCount, 0, 'quiet polling cannot arm/retry or erase an input row');
  f.at(4001);
  assert.equal(c.slotState(settings).status, 'dropped', 'the full original response timeout must still fit');
  assert.equal(c.arm({ id: 1, movementX: 24, latestArmAt: 4000 }).reason, 'response-window-exhausted',
    'late CDP arm delivery is rejected again at the browser boundary');
  assert.equal(c.snapshot().unsupportedInputCount, 1, 'an arm-race failure remains an explicit raw row');
  c.dispose();
}

{
  const f = fixture(), controller = f.controller;
  assert.equal(f.listenerCount(), 1);
  assert.equal(f.listeners.get('mousemove')[0].eventOptions, true, 'observe native dispatch in capture phase');
  assert.throws(f.install, /already installed/, 'a second observer cannot replace an active owner');
  const receiver = { owner: 'caller' }, frame = { mouseDX: -24, mouseDY: 0 }, extra = {};
  f.at(110);
  assert.deepEqual(plain(controller.arm({ id: 1, movementX: 24 })), { status: 'armed', id: 1 });
  assert.equal(f.timerDelays[0], 1000);
  assert.throws(() => controller.arm({ id: 2, movementX: 24 }), /one.*pending/i);
  const waiting = controller.wait(1);
  await assert.rejects(controller.wait(1), /already has a waiter/);
  f.settings.aimSmoothing = 0.9;
  f.at(120); f.emit({ timeStamp: 118 });
  assert.equal(f.calls.length, 0, 'dispatch observation never invokes the rig');
  assert.deepEqual(f.camera.quaternion.toArray(), [0, 0, 0, 1], 'dispatch observation never writes the camera');
  f.at(136);
  assert.equal(f.rig.update.call(receiver, 1 / 60, frame, extra), f.originalResult);
  assert.equal(f.calls.length, 1, 'the original rig runs exactly once');
  assert.equal(f.calls[0].receiver, receiver);
  assert.equal(f.calls[0].args[0], 1 / 60);
  assert.equal(f.calls[0].args[1], frame);
  assert.equal(f.calls[0].args[2], extra);
  assert.equal(controller.snapshot().records[0].status, 'armed', 'camera response waits for the following RAF');
  assert.equal(f.frames.size, 1);
  f.frame(148);
  const row = await waiting;
  assert.equal(row.status, 'responded');
  assert.equal(row.reason, null);
  assert.equal(row.event.isTrusted, true);
  assert.equal(row.event.targetIsCanvas, true);
  assert.equal(row.event.canvasLocked, true);
  assert.equal(row.event.timeStamp, 118);
  assert.equal(row.event.observedAt, 120);
  assert.equal(row.response.dispatchObservedToCameraMs, 16);
  assert.equal(row.response.eventTimestampToCameraMs, 18);
  assert.equal(row.raf.dispatchObservedToRafMs, 28);
  assert.equal(row.response.mouseDX, -24);
  assert.ok(Math.abs(row.response.radians - 0.06) < 1e-10);
  assert.ok(Math.abs(row.response.yawRadians + 0.06) < 1e-10);
  assert.equal(row.settings.aimSmoothing, 0.2, 'settings are copied, never normalized or overridden');
  assert.equal(f.settings.aimSmoothing, 0.9);
  assert.deepEqual(f.game.player.input, { throttle: 1, steer: -1, fire: true },
    'driving and shooting remain active throughout observation');
  assert.deepEqual(plain(controller.snapshot().ignored), { untrusted: 0, zeroMovement: 0 });
  assert.equal(controller.snapshot().observedInputCount, 1);
  assert.equal(f.timers.size, 0);
  assert.equal(f.frames.size, 0);
  const receipt = controller.dispose();
  assert.equal(receipt.disposed, true);
  assert.equal(f.rig.update, f.original);
  assert.equal(f.listenerCount(), 0);
  assert.equal(f.window.__PERF_CAMERA_INPUT, undefined);
  assert.deepEqual(plain(controller.dispose()), plain(receipt), 'dispose is idempotent');
  assert.throws(() => controller.arm({ id: 2, movementX: 24 }), /disposed/);
}

for (const movementX of [24, -24]) {
  const f = fixture(), c = f.controller;
  c.arm({ id: 1, movementX });
  const waiting = c.wait(1);
  f.setYaw(movementX > 0 ? -Math.PI + 0.01 : Math.PI - 0.01);
  f.emit({ movementX });
  f.rig.update(1 / 60, { mouseDX: -movementX, mouseDY: 0 });
  f.frame();
  const row = await waiting;
  assert.equal(row.status, 'responded', 'both horizontal directions survive the world-yaw wrap');
  assert.equal(Math.sign(row.response.yawRadians), -Math.sign(movementX));
  c.dispose();
}

{
  const f = fixture(), c = f.controller;
  c.arm({ id: 1, movementX: 24 });
  const waiting = c.wait(1);
  f.emit({ isTrusted: false });
  f.emit({ movementX: 0, movementY: 0 });
  assert.equal(c.snapshot().records[0].event, null);
  assert.deepEqual(plain(c.snapshot().ignored), { untrusted: 1, zeroMovement: 1 });
  f.expire();
  assert.equal((await waiting).reason, 'no-trusted-mouse-event');
  assert.equal(c.snapshot().missedInputCount, 1);
  assert.equal(f.timers.size, 0);
  c.dispose();
}

const unsupportedCases = [
  ['wrong canvas lock', f => { f.document.pointerLockElement = {}; }, 'pointer-lock-unavailable'],
  ['no pointer lock', f => { f.document.pointerLockElement = null; }, 'pointer-lock-unavailable'],
  ['hidden', f => { f.surface.hidden = true; }, 'page-not-visible-focused'],
  ['blurred', f => { f.surface.focused = false; }, 'page-not-visible-focused'],
  ['Garage', f => { f.game.phase = 'garage'; }, 'controls-not-released'],
  ['covered countdown', f => { f.game.preBattleS = Infinity; }, 'controls-not-released'],
  ['positive countdown', f => { f.game.preBattleS = 1; }, 'controls-not-released'],
  ['missing player', f => { f.game.player = null; }, 'player-unavailable'],
  ['dead player', f => { f.game.player.combat.destroyed = true; }, 'player-unavailable'],
  ['result', f => { f.game.result = {}; }, 'battle-result'],
  ['settings', f => { f.surface.open = true; }, 'paused-or-killcam'],
  ['killcam', f => { f.surface.killcam = true; }, 'paused-or-killcam'],
  ['shot', f => { f.debug.shotMode = true; }, 'non-player-camera'],
  ['external', f => { f.rig.externalActive = true; }, 'non-player-camera'],
  ['cinematic', f => { f.rig.cinematicActive = true; }, 'non-player-camera'],
  ['scope', f => { f.rig.mode = 'SNIPER'; }, 'unsupported-camera-mode'],
];
for (const [label, invalidate, reason] of unsupportedCases) {
  const f = fixture(), c = f.controller;
  invalidate(f);
  assert.deepEqual(plain(c.arm({ id: 1, movementX: 24 })), { status: 'unsupported', id: 1, reason }, label);
  assert.equal((await c.wait(1)).reason, reason);
  assert.equal(f.timers.size, 0, `${label}: unsupported input never starts a timing window`);
  assert.equal(c.snapshot().unsupportedInputCount, 1);
  c.dispose();
}

for (const [stage, expectedCalls] of [['event', 0], ['update', 1], ['raf', 1]]) {
  const f = fixture(), c = f.controller;
  c.arm({ id: 1, movementX: 24 });
  const waiting = c.wait(1);
  if (stage === 'event') f.surface.hidden = true;
  f.emit();
  if (stage === 'update') f.surface.hidden = true;
  if (stage !== 'event') f.rig.update(1 / 60, { mouseDX: -24, mouseDY: 0 });
  if (stage === 'raf') { f.surface.hidden = true; f.frame(); }
  const row = await waiting;
  assert.equal(row.status, 'missed');
  assert.equal(row.reason, 'page-not-visible-focused', `eligibility is rechecked at ${stage}`);
  assert.equal(f.calls.length, expectedCalls);
  assert.equal(f.frames.size, 0);
  assert.equal(f.timers.size, 0);
  c.dispose();
}

for (const event of [
  { target: {} }, { movementX: -24 }, { movementX: 23 }, { movementY: 1 },
  { movementX: NaN }, { movementX: Infinity },
]) {
  const f = fixture(), c = f.controller;
  c.arm({ id: 1, movementX: 24 });
  const waiting = c.wait(1);
  f.emit(event);
  assert.equal((await waiting).reason, 'unexpected-mouse-event');
  c.dispose();
}
{
  const f = fixture(), c = f.controller;
  c.arm({ id: 1, movementX: 24 });
  const waiting = c.wait(1);
  f.emit(); f.emit();
  const row = await waiting;
  assert.equal(row.status, 'missed');
  assert.equal(row.reason, 'multiple-mouse-events');
  assert.equal(row.coalescedEvents, 1, 'multiple dispatches cannot be mislabelled as a single pulse response');
  c.dispose();
}

for (const [label, deliveredDX, mutation] of [
  ['unrelated camera motion', 0, f => f.setYaw(-0.1, { translate: 3 })],
  ['wrong consumed sign', 24, f => f.setYaw(-0.1)],
  ['wrong camera yaw sign', -24, f => f.setYaw(0.1)],
  ['no camera movement', -24, () => {}],
  ['quaternion sign only', -24, f => f.setYaw(0, { negate: true })],
]) {
  const f = fixture(), c = f.controller;
  c.arm({ id: 1, movementX: 24 });
  const waiting = c.wait(1);
  f.emit();
  f.behavior = () => mutation(f);
  f.rig.update(1 / 60, { mouseDX: deliveredDX, mouseDY: 0 });
  assert.equal(c.snapshot().records[0].response, null, label);
  assert.equal(f.frames.size, 0, `${label}: no response RAF is invented`);
  f.expire();
  assert.equal((await waiting).reason, 'no-matching-camera-response', label);
  c.dispose();
}

for (const timeStamp of [NaN, -1, Infinity, 1000000]) {
  const f = fixture(), c = f.controller;
  c.arm({ id: 1, movementX: 24 });
  const waiting = c.wait(1);
  f.emit({ timeStamp });
  f.at(110); f.rig.update(1 / 60, { mouseDX: -24, mouseDY: 0 }); f.frame(126);
  const row = await waiting;
  assert.equal(row.status, 'responded');
  assert.equal(row.response.eventTimestampToCameraMs, null, 'incompatible browser timestamps remain unknown');
  assert.equal(row.response.dispatchObservedToCameraMs, 10, 'same-page observed latency stays valid');
  c.dispose();
}

{
  const f = fixture(), c = f.controller;
  const originalError = new Error('original camera failure');
  c.arm({ id: 1, movementX: 24 });
  const waiting = c.wait(1);
  f.emit(); f.behavior = () => { throw originalError; };
  assert.throws(() => f.rig.update(1 / 60, { mouseDX: -24, mouseDY: 0 }), error => error === originalError);
  assert.equal(f.calls.length, 1);
  assert.equal((await waiting).reason, 'camera-update-error');
  assert.equal(f.rig.update, f.original, 'a failing original rig is restored without changing error identity');
  assert.equal(f.listenerCount(), 0);
  assert.equal(f.frames.size, 0);
  assert.equal(f.timers.size, 0);
}
for (const followingRaf of [false, true]) {
  const f = fixture(), c = f.controller;
  c.arm({ id: 1, movementX: 24 });
  const waiting = c.wait(1);
  if (followingRaf) { f.emit(); f.rig.update(1 / 60, { mouseDX: -24, mouseDY: 0 }); }
  const foreign = function () {};
  f.rig.update = foreign;
  const snapshot = c.dispose();
  assert.equal((await waiting).reason, 'observer-disposed');
  assert.equal(f.rig.update, foreign, 'cleanup preserves a later owner of the rig method');
  assert.match(snapshot.errors.join('\n'), /ownership changed/);
  assert.equal(f.frames.size, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.listenerCount(), 0);
}
for (const when of ['before', 'after']) {
  const f = fixture(), c = f.controller;
  c.arm({ id: 1, movementX: 24 });
  const waiting = c.wait(1);
  f.emit();
  const breakReceipt = () => Object.defineProperty(f.camera.rotation, 'toArray', {
    configurable: true, value() { throw new Error('observer-only snapshot failure'); },
  });
  if (when === 'before') breakReceipt();
  else f.behavior = () => { f.setYaw(-0.1); breakReceipt(); };
  assert.equal(f.rig.update(1 / 60, { mouseDX: -24, mouseDY: 0 }), f.originalResult,
    'observer failure cannot change the original rig return value');
  assert.equal(f.calls.length, 1, 'observer failure cannot skip or repeat original camera work');
  assert.equal((await waiting).reason, 'observer-disposed');
  assert.match(c.snapshot().errors.join('\n'), /Observer (?:read|update) failed/);
  assert.equal(f.rig.update, f.original);
  assert.equal(f.listenerCount(), 0);
}
{
  const f = fixture(), c = f.controller;
  c.arm({ id: 1, movementX: 24 });
  const waiting = c.wait(1);
  f.emit(); f.rig.update(1 / 60, { mouseDX: -24, mouseDY: 0 });
  f.expire();
  assert.equal((await waiting).reason, 'no-response-raf', 'camera update without RAF delivery remains a missed response');
  assert.equal(f.frames.size, 0);
  c.dispose();
}
{
  const f = fixture(), c = f.controller;
  c.arm({ id: 1, movementX: 24 });
  const waiting = c.wait(1);
  c.rejectDispatch(2, 'wrong pulse');
  assert.equal(c.snapshot().records[0].status, 'armed');
  c.rejectDispatch(1, 'mouse dispatch failed');
  assert.equal((await waiting).reason, 'browser-dispatch-failed');
  assert.deepEqual(plain(c.snapshot().errors), ['mouse dispatch failed']);
  await assert.rejects(c.wait(99), /Unknown/);
  assert.throws(() => c.arm({ id: 1, movementX: 24 }), /unique/);
  c.dispose();
}
for (const options of [{ responseTimeoutMs: 0 }, { responseTimeoutMs: -1 },
  { maxSamples: 0 }, { maxSamples: 257 }, { maxSamples: 1.5 }]) {
  assert.throws(() => fixture(options), /Invalid bounded/);
}
{
  const f = fixture({ maxSamples: 1 }), c = f.controller;
  for (const pulse of [{ id: 1, movementX: 0 }, { id: 1, movementX: NaN },
    { id: 1, movementX: Infinity }, { id: 1, movementX: 24, movementY: 1 },
    { id: 1.5, movementX: 24 }]) {
    assert.throws(() => c.arm(pulse), /unique integer.*nonzero horizontal/);
  }
  c.arm({ id: 1, movementX: 24 }); f.expire();
  assert.throws(() => c.arm({ id: 2, movementX: 24 }), /sample bound/);
  c.dispose();
}

// Node-side dispatch uses one real browser mouse operation; its round-trip
// timestamps remain explicitly separate from the page's response clocks.
{
  const operations = [], record = { status: 'responded', id: 4 };
  const page = {
    async evaluate(fn, argument) {
      operations.push({ source: fn.toString(), argument });
      return operations.length === 1 ? { status: 'armed', id: 4 } : record;
    },
    mouse: { async move(...args) { operations.push({ mouse: args }); } },
  };
  const result = await dispatchCameraInputPulse(page, { id: 4, x: 500, y: 300, movementX: 24 });
  assert.deepEqual(operations[0].argument, { id: 4, movementX: 24, movementY: 0, latestArmAt: undefined });
  assert.deepEqual(operations[1].mouse, [524, 300, { steps: 1 }]);
  assert.match(operations[2].source, /\.wait\(id\)/);
  assert.equal(result.record, record);
  assert.equal(result.x, 524);
  assert.equal(result.y, 300);
  assert.equal(result.nodeDispatch.clock, 'node-performance');
  assert.ok(result.nodeDispatch.roundTripMs >= 0);
}
{
  const page = { evaluate: async () => ({ status: 'unsupported', id: 1, reason: 'pointer-lock-unavailable' }),
    mouse: { move() { assert.fail('unsupported input cannot dispatch a mouse pulse'); } } };
  const result = await dispatchCameraInputPulse(page, { id: 1, x: 100, y: 80, movementX: 24 });
  assert.equal(result.status, 'unsupported');
  assert.equal(result.nodeDispatch, null);
  assert.equal(result.x, 100);
}
{
  const failure = new Error('mouse command failed');
  const evaluations = [];
  const page = {
    async evaluate(fn, argument) {
      evaluations.push({ source: fn.toString(), argument });
      if (evaluations.length === 1) return { status: 'armed', id: 1 };
      throw new Error('page closed during cleanup');
    },
    mouse: { async move() { throw failure; } },
  };
  await assert.rejects(dispatchCameraInputPulse(page, { id: 1, x: 100, y: 80, movementX: 24 }), error => error === failure);
  assert.match(evaluations[1].source, /rejectDispatch/);
  assert.equal(evaluations[1].argument.id, 1);
}

function preparationPage({ locked = false, reason = locked ? null : 'pointer-lock-unavailable',
  width = 1000, waitError = null, downError = null, upError = null } = {}) {
  const operations = [];
  let reads = 0;
  const page = {
    async evaluate(fn) {
      assert.match(fn.toString(), /availability/);
      reads++;
      return reads === 1 ? { locked, reason, bounds: { left: 10, top: 20, width, height: 600 } }
        : { locked: true, reason: null };
    },
    mouse: {
      async move(...args) { operations.push(['move', ...args]); },
      async down(...args) { operations.push(['down', ...args]); if (downError) throw downError; },
      async up(...args) { operations.push(['up', ...args]); if (upError) throw upError; },
    },
    async waitForFunction(fn, options) {
      assert.match(fn.toString(), /pointerLockElement === window\.__DEBUG\.renderer\.domElement/);
      operations.push(['wait', options]);
      if (waitError) throw waitError;
    },
  };
  return { page, operations };
}
{
  const f = preparationPage({ locked: true });
  assert.deepEqual(await prepareCameraInput(f.page, { x: 125, y: 95 }),
    { status: 'ready', x: 125, y: 95, gesture: 'already-locked' });
  assert.deepEqual(f.operations, [], 'an existing lock never recenters the CDP mouse');
}
{
  const f = preparationPage();
  assert.deepEqual(await prepareCameraInput(f.page, { lockTimeoutMs: 1234 }),
    { status: 'ready', x: 510, y: 320, gesture: 'trusted-canvas-click' });
  assert.deepEqual(f.operations, [
    ['move', 510, 320, { steps: 1 }], ['down', { button: 'left' }], ['up', { button: 'left' }],
    ['wait', { timeout: 1234 }],
  ], 'center only before lock, then use a real left-button gesture and verify exact canvas ownership');
}
for (const [options, reason] of [
  [{ reason: 'paused-or-killcam' }, 'paused-or-killcam'], [{ width: 0 }, 'canvas-has-no-area'],
]) {
  const f = preparationPage(options);
  const result = await prepareCameraInput(f.page, { x: 125, y: 95 });
  assert.equal(result.status, 'unsupported');
  assert.equal(result.reason, reason);
  assert.equal(result.x, 125);
  assert.deepEqual(f.operations, []);
}
{
  const f = preparationPage({ waitError: Object.assign(new Error('native lock denied'), { name: 'TimeoutError' }) });
  const result = await prepareCameraInput(f.page);
  assert.equal(result.status, 'unsupported');
  assert.equal(result.reason, 'pointer-lock-unavailable');
  assert.deepEqual(f.operations.slice(1, 3), [['down', { button: 'left' }], ['up', { button: 'left' }]]);
}
for (const kind of ['wait', 'down', 'up', 'down-and-up']) {
  const primary = new Error(`${kind} failed`);
  const f = preparationPage({
    waitError: kind === 'wait' ? primary : null,
    downError: kind.startsWith('down') ? primary : null,
    upError: kind === 'up' ? primary : kind === 'down-and-up' ? new Error('secondary release failure') : null,
  });
  await assert.rejects(prepareCameraInput(f.page), error => error === primary,
    'browser command failures retain their original error identity');
  assert.ok(f.operations.some(operation => operation[0] === 'up'), 'failed mouse-down still releases the button');
}

// Coordinator-only fixtures execute the actual browser-clock predicate, but
// never acquire a browser, install listeners, wait on real time or send input.
function coordinatorFixture(options = {}) {
  const operations = [], rawRecords = [];
  const windowStartedAt = 10000;
  let now = windowStartedAt, waitCount = 0, disposeCount = 0;
  const admission = fixture();
  if (options.quietUntil) admission.rig.update(1 / 60, { mouseDX: -1, mouseDY: 0 });
  const setClock = at => {
    now = at; admission.at(at);
    if (options.quietUntil && at >= options.quietUntil) {
      admission.rig.update(1 / 60, { mouseDX: 0, mouseDY: 0 });
      admission.rig.update(1 / 60, { mouseDX: 0, mouseDY: 0 });
    }
  };
  const observer = () => ({
    disposed: true, records: rawRecords, errors: options.observerErrors || [],
    requestedInputCount: rawRecords.length,
    observedInputCount: rawRecords.filter(row => row.status === 'responded').length,
    missedInputCount: rawRecords.filter(row => row.status === 'missed').length,
    unsupportedInputCount: rawRecords.filter(row => row.status === 'unsupported').length,
  });
  const window = { __PERF: { startedAt: windowStartedAt, done: false },
    __PERF_CAMERA_INPUT: { slotState: admission.controller.slotState, dispose() {
      operations.push(['observer-dispose']); disposeCount++;
      if (options.cleanupError) throw options.cleanupError;
      return observer();
    } } };
  admission.window.__PERF = window.__PERF;
  setClock(now);
  const page = {
    async evaluate(fn, argument) {
      if (fn === installCameraInputObserver) {
        operations.push(['install', argument]);
        if (options.installError) throw options.installError;
        return { installed: true };
      }
      operations.push([/\.dispose\(/.test(fn.toString()) ? 'cleanup-evaluate' : 'window-state']);
      return runInNewContext(`(${fn.toString()})(argument)`, { window, argument });
    },
    async waitForFunction(fn, config, settings) {
      waitCount++;
      operations.push(['wait', settings, config]);
      assert.equal(config.polling, 'raf');
      config.signal?.throwIfAborted();
      if (options.onWait) await options.onWait({ waitCount, config, window });
      config.signal?.throwIfAborted();
      const check = () => runInNewContext(`(${fn.toString()})(settings)`, {
        window, settings,
      });
      if (options.endedAtWait === waitCount) window.__PERF.done = true;
      if (!window.__PERF.done) {
        window.__PERF.startedAt = null;
        assert.equal(check(), false, 'a not-yet-started sample cannot open a scheduled input slot');
        window.__PERF.startedAt = windowStartedAt;
        const target = Math.max(windowStartedAt + settings.offsetMs, settings.notBeforeAt ?? 0);
        if (now < target) {
          setClock(target - 1);
          if (target <= windowStartedAt + settings.sampleMs - 1000) {
            assert.equal(check(), false, 'browser-clock polling cannot shorten the event-spacing deadline');
          }
          setClock(target);
        }
        if (!check()) setClock(Math.min(options.quietUntil ?? Infinity,
          windowStartedAt + settings.sampleMs - 999));
      }
      assert.equal(check(), true, 'only elapsed browser sample time or an ended sample resolves the wait');
      setClock(now + (options.deliveryDelay?.(waitCount) ?? 0));
      return { async dispose() { operations.push(['wait-handle-dispose', settings.offsetMs]); } };
    },
  };
  const dependencies = {
    async prepare(receivedPage, position) {
      assert.equal(receivedPage, page);
      operations.push(['prepare', { ...position }]);
      if (options.onPrepare) await options.onPrepare();
      return options.preparation || { status: 'ready', x: 500, y: 300, gesture: 'trusted-canvas-click' };
    },
    async dispatch(receivedPage, pulse) {
      assert.equal(receivedPage, page);
      operations.push(['dispatch', { ...pulse }, now]);
      const row = { id: pulse.id, status: 'responded', armedAt: now,
        event: { observedAt: now + 1, isTrusted: true, movementX: pulse.movementX },
        response: { dispatchObservedToCameraMs: 8 }, raf: { observedAt: now + 17 },
        rawMarker: `raw-${pulse.id}`, ...(options.row?.(pulse, now) || {}) };
      rawRecords.push(row);
      if (options.throwAtPulse === pulse.id) throw new Error(`dispatch-${pulse.id}-failed`);
      if (row.status === 'unsupported') return {
        status: 'unsupported', reason: row.reason, x: pulse.x, y: pulse.y, nodeDispatch: null,
      };
      return { x: pulse.x + pulse.movementX, y: pulse.y, record: row,
        nodeDispatch: { clock: 'node-performance', roundTripMs: 3 } };
    },
  };
  return { page, dependencies, operations, rawRecords, windowStartedAt,
    get disposeCount() { return disposeCount; } };
}

for (const sampleMs of [0, -1, NaN, Infinity, '6000']) {
  assert.throws(() => cameraInputSchedule(sampleMs), /Invalid.*duration/);
}
for (const sampleMs of [1, 1000, 2000, 2999.999]) assert.deepEqual(cameraInputSchedule(sampleMs), []);
assert.deepEqual(cameraInputSchedule(3000), [{ id: 1, offsetMs: 2000, movementX: 24 }]);
assert.deepEqual(cameraInputSchedule(7000), [
  { id: 1, offsetMs: 2000, movementX: 24 }, { id: 2, offsetMs: 4000, movementX: -24 },
  { id: 3, offsetMs: 6000, movementX: 24 },
]);
assert.equal(cameraInputSchedule(60000).length, 29);
const cappedSchedule = cameraInputSchedule(1000000);
assert.equal(cappedSchedule.length, 64);
assert.deepEqual(cappedSchedule[63], { id: 64, offsetMs: 128000, movementX: -24 });
assert.ok(cappedSchedule.every((pulse, index) => pulse.offsetMs === (index + 1) * 2000
  && pulse.movementX === (index % 2 ? -24 : 24)));

{
  const f = coordinatorFixture();
  const report = await runCameraInputWindow(f.page, { sampleMs: 2999 }, f.dependencies);
  assert.equal(report.status, 'unsupported');
  assert.equal(report.reason, 'window-too-short');
  assert.equal(report.coveragePass, false, 'an empty schedule is not a passing input acquisition');
  assert.equal(report.plannedInputCount, 0);
  assert.equal(report.attemptedInputCount, 0);
  assert.deepEqual(f.operations, [], 'no eligible pulses acquire no observer, pointer lock or input');
}
{
  const f = coordinatorFixture(), abort = new AbortController();
  const report = await runCameraInputWindow(f.page, { sampleMs: 7500, signal: abort.signal }, f.dependencies);
  assert.equal(report.status, 'complete');
  assert.equal(report.coveragePass, true);
  assert.deepEqual(report.plan, cameraInputSchedule(7500));
  assert.equal(report.plannedInputCount, 3);
  assert.equal(report.attemptedInputCount, 3);
  assert.equal(report.observedInputCount, 3);
  assert.equal(report.missedInputCount, 0);
  assert.equal(report.unsupportedInputCount, 0);
  assert.equal(report.unattemptedInputCount, 0);
  assert.deepEqual(f.operations[0], ['install', { responseTimeoutMs: 1000, maxSamples: 3 }]);
  const waits = f.operations.filter(row => row[0] === 'wait');
  assert.deepEqual(waits.map(row => row[1].offsetMs), [2000, 2000, 4000, 6000]);
  assert.ok(waits.every(row => row[2].signal === abort.signal && row[2].timeout === 37500));
  assert.deepEqual(f.operations.filter(row => row[0] === 'wait-handle-dispose').map(row => row[1]), [2000, 2000, 4000, 6000]);
  assert.deepEqual(f.operations.filter(row => row[0] === 'prepare'), [['prepare', { x: 0, y: 0 }]],
    'one real preparation gesture belongs to the entire camera-input window');
  assert.deepEqual(f.operations.filter(row => row[0] === 'dispatch').map(row => row[1]), [
    { id: 1, x: 500, y: 300, movementX: 24, latestArmAt: 16500 },
    { id: 2, x: 524, y: 300, movementX: -24, latestArmAt: 16500 },
    { id: 3, x: 500, y: 300, movementX: 24, latestArmAt: 16500 },
  ], 'every pulse retains the preceding CDP coordinates instead of recentering');
  assert.deepEqual(report.pulses.map(pulse => pulse.dispatchOffsetMs), [2000, 4001, 6002]);
  assert.ok(report.pulses.every(pulse => pulse.withinWindow));
  assert.equal(f.disposeCount, 1);
  assert.deepEqual(report.observer.records, f.rawRecords);
  assert.equal(report.observer.disposed, true);
  assert.ok(f.operations.findIndex(row => row[0] === 'prepare') >
    f.operations.findIndex(row => row[0] === 'wait-handle-dispose'), 'preparation follows the first scheduled browser-clock wait');
}
{
  const f = coordinatorFixture({ preparation: {
    status: 'unsupported', reason: 'pointer-lock-unavailable', x: 500, y: 300, error: 'native-denial-receipt',
  } });
  const report = await runCameraInputWindow(f.page, { sampleMs: 7000 }, f.dependencies);
  assert.equal(report.status, 'unsupported');
  assert.equal(report.coveragePass, false);
  assert.equal(report.reason, 'pointer-lock-unavailable');
  assert.equal(report.preparation.error, 'native-denial-receipt');
  assert.equal(report.attemptedInputCount, 0);
  assert.equal(report.unattemptedInputCount, 3);
  assert.equal(f.operations.some(row => row[0] === 'dispatch'), false);
  assert.equal(f.disposeCount, 1);
}
{
  // Reproduce the native id3 +4 s delivery stall. Old absolute-only deadlines
  // immediately armed id4, while the actual input smoothing tail was nonzero.
  const f = coordinatorFixture({ deliveryDelay: count => count === 4 ? 4030 : 0 });
  const report = await runCameraInputWindow(f.page, { sampleMs: 30000 }, f.dependencies);
  assert.equal(report.plannedInputCount, 14);
  assert.equal(report.observedInputCount, 12);
  assert.equal(report.droppedInputCount, 2);
  assert.equal(report.unattemptedInputCount, 2);
  assert.equal(report.coveragePass, false, 'overdue slots cannot be erased or compressed into passing full coverage');
  assert.equal(report.status, 'incomplete');
  assert.equal(report.reason, 'response-window-exhausted');
  assert.equal(report.pulses[2].dispatchLatenessMs, 4032, 'preserve lateness against the unchanged nominal plan');
  assert.equal(report.pulses[3].schedule.effectiveOffsetMs, 12033);
  assert.deepEqual(report.pulses.filter(pulse => pulse.status === 'dropped').map(pulse => pulse.id), [13, 14]);
  assert.ok(report.pulses.filter(pulse => pulse.record?.event).slice(1).every(pulse => pulse.eventSpacingMs >= 2000));
  assert.equal(report.spacingViolationCount, 0);
  assert.equal(report.missedInputCount, 0, 'undispatched schedule drops are not fabricated camera-response misses');
  assert.equal(report.unsupportedInputCount, 0, 'do not arm catch-up inputs into the prior smoothing tail');
  assert.deepEqual(report.observer.records, f.rawRecords, 'all real response receipts remain intact');
}
{
  const f = coordinatorFixture({ quietUntil: 12400 });
  const report = await runCameraInputWindow(f.page, { sampleMs: 7500 }, f.dependencies);
  assert.equal(report.coveragePass, true);
  assert.deepEqual(report.pulses.map(pulse => pulse.dispatchOffsetMs), [2400, 4401, 6402]);
  assert.equal(report.lateInputCount, 3, 'waiting for the unchanged quiet guard is recorded as lateness');
  assert.ok(report.pulses.every(pulse => pulse.schedule.quietInputFrames === 2));
}
{
  const f = coordinatorFixture({ quietUntil: Infinity });
  const report = await runCameraInputWindow(f.page, { sampleMs: 7000 }, f.dependencies);
  assert.equal(report.coveragePass, false, 'zero observed responses never pass even when the scheduler waited quietly');
  assert.equal(report.droppedInputCount, 3);
  assert.equal(report.attemptedInputCount, 0);
  assert.equal(f.operations.some(row => row[0] === 'dispatch'), false);
  assert.equal(f.disposeCount, 1);
}
{
  const f = coordinatorFixture({ row: (pulse, now) => pulse.id === 2
    ? { event: { observedAt: now - 1, isTrusted: true, movementX: pulse.movementX } } : {} });
  const report = await runCameraInputWindow(f.page, { sampleMs: 7500 }, f.dependencies);
  assert.equal(report.observedInputCount, 3);
  assert.equal(report.spacingViolationCount, 1);
  assert.equal(report.coveragePass, false, 'even responded rows cannot certify a compressed actual-event interval');
}
for (const [label, mutate, missed, unsupported] of [
  ['missed camera', () => ({ status: 'missed', reason: 'no-matching-camera-response', raf: null }), 1, 0],
  ['coalesced events', () => ({ status: 'missed', reason: 'multiple-mouse-events', coalescedEvents: 1, raf: null }), 1, 0],
  ['unsupported pulse', () => ({ status: 'unsupported', reason: 'mouse-input-not-quiet', event: null, raf: null }), 0, 1],
  ['late response', (_pulse, now) => ({ raf: { observedAt: now + 1001 } }), 0, 0],
  ['event before window', () => ({ event: { observedAt: 9999 }, raf: { observedAt: 12017 } }), 0, 0],
]) {
  const f = coordinatorFixture({ row: mutate });
  const report = await runCameraInputWindow(f.page, { sampleMs: 3000 }, f.dependencies);
  assert.equal(report.status, 'incomplete', label);
  assert.equal(report.coveragePass, false, label);
  assert.equal(report.missedInputCount, missed);
  assert.equal(report.unsupportedInputCount, unsupported);
  assert.deepEqual(report.observer.records, f.rawRecords, `${label}: all raw evidence survives`);
  assert.equal(report.pulses[0].record.rawMarker, 'raw-1', 'unsupported/missed dispatch receipts are joined by exact pulse ID');
  assert.equal(f.disposeCount, 1);
}
{
  const f = coordinatorFixture({ observerErrors: ['observer-read-failed'] });
  const report = await runCameraInputWindow(f.page, { sampleMs: 3000 }, f.dependencies);
  assert.equal(report.coveragePass, false, 'a responded row cannot conceal an observer failure');
  assert.deepEqual(report.observer.errors, ['observer-read-failed']);
}
{
  const f = coordinatorFixture({ endedAtWait: 3 });
  const report = await runCameraInputWindow(f.page, { sampleMs: 7000 }, f.dependencies);
  assert.equal(report.status, 'incomplete');
  assert.equal(report.reason, 'sample-ended-before-schedule');
  assert.equal(report.coveragePass, false);
  assert.equal(report.attemptedInputCount, 1);
  assert.equal(report.unattemptedInputCount, 2);
  assert.equal(f.operations.filter(row => row[0] === 'dispatch').length, 1);
  assert.equal(f.disposeCount, 1);
}
{
  const f = coordinatorFixture({ throwAtPulse: 2,
    row: pulse => pulse.id === 2 ? { status: 'missed', reason: 'browser-dispatch-failed', raf: null } : {} });
  const report = await runCameraInputWindow(f.page, { sampleMs: 7000 }, f.dependencies);
  assert.equal(report.status, 'failed');
  assert.equal(report.coveragePass, false);
  assert.match(report.errors.join('\n'), /dispatch-2-failed/);
  assert.equal(report.attemptedInputCount, 2);
  assert.equal(report.observedInputCount, 1);
  assert.equal(report.missedInputCount, 1);
  assert.equal(report.unattemptedInputCount, 1);
  assert.deepEqual(report.observer.records.map(row => row.rawMarker), ['raw-1', 'raw-2'],
    'a rejected dispatch cannot erase the raw failed observer row or preceding success');
  assert.equal(f.disposeCount, 1);
}
{
  const abort = new AbortController(); abort.abort(new Error('cancel-before-install'));
  const f = coordinatorFixture();
  const report = await runCameraInputWindow(f.page, { sampleMs: 7000, signal: abort.signal }, f.dependencies);
  assert.equal(report.status, 'failed');
  assert.equal(report.coveragePass, false);
  assert.match(report.errors.join('\n'), /cancel-before-install/);
  assert.deepEqual(f.operations, [], 'pre-aborted acquisition owns no browser resources or input');
}
for (const stage of ['wait', 'prepare']) {
  const abort = new AbortController();
  const f = coordinatorFixture({
    onWait: stage === 'wait' ? () => abort.abort(new Error('cancel-during-wait')) : undefined,
    onPrepare: stage === 'prepare' ? () => abort.abort(new Error('cancel-during-prepare')) : undefined,
  });
  const report = await runCameraInputWindow(f.page, { sampleMs: 7000, signal: abort.signal }, f.dependencies);
  assert.equal(report.status, 'failed', stage);
  assert.equal(report.coveragePass, false);
  assert.match(report.errors.join('\n'), new RegExp(`cancel-during-${stage}`));
  assert.equal(f.operations.some(row => row[0] === 'dispatch'), false, 'aborted preparation cannot send a late mouse pulse');
  assert.equal(f.disposeCount, 1);
}
{
  const abort = new AbortController();
  const f = coordinatorFixture({ onWait: ({ waitCount }) => {
    if (waitCount === 3) abort.abort(new Error('cancel-after-first-response'));
  } });
  const report = await runCameraInputWindow(f.page, { sampleMs: 7000, signal: abort.signal }, f.dependencies);
  assert.equal(report.status, 'failed');
  assert.equal(report.coveragePass, false);
  assert.equal(report.observedInputCount, 1);
  assert.deepEqual(report.observer.records.map(row => row.rawMarker), ['raw-1']);
  assert.equal(report.unattemptedInputCount, 2);
  assert.equal(f.disposeCount, 1);
}
for (const stage of ['install', 'cleanup']) {
  const error = new Error(`${stage}-failure-receipt`);
  const f = coordinatorFixture(stage === 'install' ? { installError: error } : { cleanupError: error });
  const report = await runCameraInputWindow(f.page, { sampleMs: 3000 }, f.dependencies);
  assert.equal(report.status, 'failed');
  assert.equal(report.coveragePass, false);
  assert.match(report.errors.join('\n'), new RegExp(`${stage}-failure-receipt`));
  assert.equal(f.disposeCount, stage === 'install' ? 0 : 1, 'cleanup only releases an acquired observer');
}

console.log('perfprobe-camera-input: trusted directional response, bounded clocks, input/pose preservation, schedule coverage and cleanup passed');
