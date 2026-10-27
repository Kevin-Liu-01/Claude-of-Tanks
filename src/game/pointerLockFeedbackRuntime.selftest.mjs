import assert from 'node:assert/strict';
import { createBus } from './stateCore.ts';
import { createPointerLockFeedbackRuntime } from './pointerLockFeedbackRuntime.ts';

class FakeElement {
  constructor() {
    this.listeners = new Map();
  }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }
  dispatch(type) { this.listeners.get(type)?.(); }
}

// (the battle's notice region, ui/battleNotices.ts: the notice is the kit's, so the receipt reads what it was handed)
const shown = [];
const dismissed = [];
const notices = { show: (options) => shown.push(options), dismiss: (id) => dismissed.push(id) };

{
  const canvas = new FakeElement();
  const bus = createBus();
  let denied = null;
  let restored = null;
  let lockRequests = 0;
  let resumes = 0;
  let refreshes = 0;
  let touch = false;
  let locked = false;
  let battleStageVisible = false;
  let canRecapture = true;
  const input = {
    isTouchLayout: () => touch,
    isLocked: () => locked,
    requestLock: () => { lockRequests += 1; },
    onLockDenied: (listener) => { denied = listener; return () => { denied = null; }; },
    onLockRestored: (listener) => { restored = listener; return () => { restored = null; }; },
  };
  const runtime = createPointerLockFeedbackRuntime({
    input,
    bus,
    canvas,
    audioResume: () => { resumes += 1; },
    isBattleStageVisible: () => battleStageVisible,
    canRecapturePointer: () => canRecapture,
    ensureTouchControls: async () => ({ refresh: () => { refreshes += 1; } }),
    notices,
  });

  canvas.dispatch('mousedown');
  assert.equal(resumes, 0, 'Garage canvas orbit cannot initialize or resume battle audio');
  assert.equal(lockRequests, 0, 'non-battle canvas never recaptures even if the other predicate permits it');
  battleStageVisible = true;
  denied();
  assert.equal(shown.length, 1, 'durable denial shows one notice on the visible battle stage');
  assert.equal(shown[0].id, 'cot-pointer-lock');
  assert.equal(shown[0].severity, 'warning', 'the notice is the kit\'s warning in the battle region');
  assert.equal(shown[0].dismissible, false);
  denied();
  assert.equal(shown.length, 1, 'repeated denial does not duplicate the notice');
  restored();
  assert.deepEqual(dismissed, ['cot-pointer-lock'], 'successful capture dismisses and rearms the notice');
  battleStageVisible = false;
  denied();
  assert.equal(shown.length, 1, 'a covered stage waits before the notice shows');
  restored();
  assert.equal(dismissed.length, 2, 'capture while waiting drops the wait');
  battleStageVisible = true;

  canvas.dispatch('mousedown');
  assert.equal(resumes, 1, 'canvas intent resumes audio');
  assert.equal(lockRequests, 1, 'eligible desktop canvas intent requests capture');
  locked = true;
  canvas.dispatch('mousedown');
  assert.equal(lockRequests, 1, 'an already captured canvas does not request again');

  locked = false;
  battleStageVisible = false;
  canvas.dispatch('mousedown');
  assert.equal(resumes, 2, 'covered loading preserves the loading owner instead of unlocking from canvas clicks');
  battleStageVisible = true;
  canRecapture = false;
  canvas.dispatch('mousedown');
  assert.equal(resumes, 3, 'visible battle still retries audio when pointer recapture is unavailable');
  assert.equal(lockRequests, 1, 'audio recovery does not bypass the recapture predicate');
  canRecapture = true;
  bus.emit('ui:battleStart', {});
  await Promise.resolve();
  assert.equal(lockRequests, 2, 'desktop battle start requests capture in the initiating gesture');
  assert.equal(refreshes, 1, 'battle start refreshes lazily acquired touch controls');

  touch = true;
  canvas.dispatch('mousedown');
  assert.equal(resumes, 4, 'touch battle audio recovery remains available without pointer lock');
  assert.equal(lockRequests, 2);
  bus.emit('ui:battleStart', {});
  await Promise.resolve();
  assert.equal(lockRequests, 2, 'touch battle start never requests pointer capture');
  assert.equal(refreshes, 2);

  const staleMouseDown = canvas.listeners.get('mousedown');
  runtime.dispose();
  staleMouseDown();
  assert.equal(resumes, 4, 'a saved stale callback cannot revive disposed audio recovery');
  assert.equal(canvas.listeners.size, 0, 'dispose detaches the canvas gesture');
  assert.equal(denied, null, 'dispose detaches denial recovery');
  assert.equal(restored, null, 'dispose detaches restored recovery');
  bus.emit('ui:battleStart', {});
  await Promise.resolve();
  assert.equal(refreshes, 2, 'dispose detaches the battle-start listener');
  await new Promise((resolve) => setTimeout(resolve, 450));
  assert.equal(shown.length, 1, 'a disposed runtime never shows the waiting notice');
}

console.log('pointerLockFeedbackRuntime.selftest: gesture, notice and disposal ownership passed');
