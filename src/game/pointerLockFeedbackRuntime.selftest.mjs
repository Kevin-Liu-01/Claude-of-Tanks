import assert from 'node:assert/strict';
import { createBus } from './stateCore.ts';
import { createPointerLockFeedbackRuntime } from './pointerLockFeedbackRuntime.ts';

class FakeElement {
  constructor() {
    this.className = '';
    this.textContent = '';
    this.style = { cssText: '', opacity: '' };
    this.removed = false;
    this.listeners = new Map();
  }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }
  dispatch(type) { this.listeners.get(type)?.(); }
  remove() { this.removed = true; }
}

const priorDocument = globalThis.document;
const appended = [];
globalThis.document = {
  createElement: () => new FakeElement(),
  body: { appendChild: (element) => appended.push(element) },
};

try {
  const canvas = new FakeElement();
  const bus = createBus();
  let denied = null;
  let restored = null;
  let lockRequests = 0;
  let resumes = 0;
  let refreshes = 0;
  let touch = false;
  let locked = false;
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
    isBattleStageVisible: () => true,
    canRecapturePointer: () => true,
    ensureTouchControls: async () => ({ refresh: () => { refreshes += 1; } }),
    nextFrame: () => new Promise(() => {}),
  });

  denied();
  assert.equal(appended.length, 1, 'durable denial shows one notice on the visible battle stage');
  assert.equal(appended[0].className, 'cot-lock-toast');
  denied();
  assert.equal(appended.length, 1, 'repeated denial does not duplicate the notice');
  restored();
  assert.equal(appended[0].removed, true, 'successful capture removes and rearms the notice');

  canvas.dispatch('mousedown');
  assert.equal(resumes, 1, 'canvas intent resumes audio');
  assert.equal(lockRequests, 1, 'eligible desktop canvas intent requests capture');
  locked = true;
  canvas.dispatch('mousedown');
  assert.equal(lockRequests, 1, 'an already captured canvas does not request again');

  locked = false;
  bus.emit('ui:battleStart', {});
  await Promise.resolve();
  assert.equal(lockRequests, 2, 'desktop battle start requests capture in the initiating gesture');
  assert.equal(refreshes, 1, 'battle start refreshes lazily acquired touch controls');

  touch = true;
  bus.emit('ui:battleStart', {});
  await Promise.resolve();
  assert.equal(lockRequests, 2, 'touch battle start never requests pointer capture');
  assert.equal(refreshes, 2);

  runtime.dispose();
  assert.equal(canvas.listeners.size, 0, 'dispose detaches the canvas gesture');
  assert.equal(denied, null, 'dispose detaches denial recovery');
  assert.equal(restored, null, 'dispose detaches restored recovery');
  bus.emit('ui:battleStart', {});
  await Promise.resolve();
  assert.equal(refreshes, 2, 'dispose detaches the battle-start listener');
} finally {
  globalThis.document = priorDocument;
}

console.log('pointerLockFeedbackRuntime.selftest: gesture, notice and disposal ownership passed');
