import assert from 'node:assert/strict';
import { createTransition } from './transition.ts';

class ElementFixture {
  constructor() {
    this.style = {};
    this.children = new Map();
    this.classes = new Set();
    this.textContent = '';
    this.classList = {
      add: (...values) => values.forEach(value => this.classes.add(value)),
      remove: (...values) => values.forEach(value => this.classes.delete(value)),
      contains: value => this.classes.has(value),
      toggle: (value, force = !this.classes.has(value)) => { if (force) this.classes.add(value); else this.classes.delete(value); return force; },
    };
  }
  set className(value) { this.classes = new Set(value.split(/\s+/)); }
  querySelector(selector) {
    if (!this.children.has(selector)) this.children.set(selector, new ElementFixture());
    return this.children.get(selector);
  }
  appendChild(child) { return child; }
  getClientRects() { return this.classes.has('on') ? [{}] : []; }
}

const originals = new Map(['window', 'document', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'scheduler']
  .map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
const roots = [];
let opaqueObserved = false, atPaint = null, controlledOpacity = null;
const head = new ElementFixture(), body = new ElementFixture();
const documentEvents = new EventTarget();
const visibilityListeners = new Set();
body.appendChild = child => { roots.push(child); return child; };
const globals = {
  window: { location: { search: '' } },
  document: {
    hidden: false, head, body, getElementById: () => null, createElement: () => new ElementFixture(),
    addEventListener(type, callback) {
      assert.equal(type, 'visibilitychange');
      visibilityListeners.add(callback);
      documentEvents.addEventListener(type, callback);
    },
    removeEventListener(type, callback) {
      assert.equal(type, 'visibilitychange');
      visibilityListeners.delete(callback);
      documentEvents.removeEventListener(type, callback);
    },
  },
  getComputedStyle: root => {
    const opacity = controlledOpacity ?? (root.classList.contains('lit') ? 1 : 0);
    const opaque = opacity >= 0.999;
    if (opaque) opaqueObserved = true;
    return { opacity: String(opacity) };
  },
  requestAnimationFrame: callback => setTimeout(() => callback(performance.now()), 0),
  cancelAnimationFrame: handle => clearTimeout(handle),
  scheduler: { yield: () => new Promise(resolve => setTimeout(() => {
    resolve();
    if (opaqueObserved && atPaint) {
      const run = atPaint; atPaint = null;
      // nextPaintFrame resumes, then the cover helper checks ownership and
      // resolves. Supersede in the microtask before run()'s await continuation.
      queueMicrotask(() => queueMicrotask(run));
    }
  }, 0)) },
};
for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, value });
try {
  const transition = createTransition();
  const root = roots.at(-1);
  assert.equal(transition.holdingSceneForFadeIn, false);
  let workCalls = 0;
  atPaint = () => transition.show({ title: 'New owner' });
  await assert.rejects(transition.run(() => { workCalls++; }, { minShowMs: 0 }), { name: 'AbortError' });
  assert.equal(workCalls, 0, 'supersession after cover resolves cannot invoke old work');
  assert.equal(transition.visible, true, 'old failure must not hide the new owner');
  assert.equal(root.querySelector('.title').textContent, 'New owner');
  await transition.hide();

  opaqueObserved = false;
  const result = await transition.run(progress => {
    workCalls++;
    transition.show({ title: 'Newer owner' });
    progress(0.7, 'Stale work progress');
    return 42;
  }, { minShowMs: 0 });
  assert.equal(result, 42);
  assert.equal(workCalls, 1);
  assert.equal(root.querySelector('.mpct').textContent, '0%', 'old work cannot repaint new progress');
  assert.notEqual(root.querySelector('.mstage').textContent, 'Stale work progress');
  assert.equal(transition.visible, true, 'old completion cannot hide the new transition');
  await transition.hide();

  await assert.rejects(transition.run(() => { throw new Error('restore failed'); }, { minShowMs: 0 }), /restore failed/);
  assert.equal(transition.active, false, 'current-owner work failure releases its veil');

  controlledOpacity = 0;
  const oldFade = transition.run(() => assert.fail('superseded fade cannot start work'),
    { holdSceneDuringFadeIn: true, minShowMs: 0 });
  assert.equal(transition.holdingSceneForFadeIn, true, 'opt-in acquires the fade lease before returning');
  const oldRejected = assert.rejects(oldFade, { name: 'AbortError' });
  const newerFade = transition.run(() => {
    assert.equal(transition.holdingSceneForFadeIn, false, 'release precedes the covered work callback');
  }, { holdSceneDuringFadeIn: true, minShowMs: 0 });
  await oldRejected;
  assert.equal(transition.holdingSceneForFadeIn, true, 'old cleanup cannot release the newer fade lease');
  controlledOpacity = 1;
  await newerFade;
  assert.equal(transition.holdingSceneForFadeIn, false);

  controlledOpacity = 0;
  const interruptedFade = transition.run(() => assert.fail('hidden veil cannot start stale work'),
    { holdSceneDuringFadeIn: true, minShowMs: 0 });
  const interruptedRejected = assert.rejects(interruptedFade, { name: 'AbortError' });
  const hiding = transition.hide();
  assert.equal(transition.holdingSceneForFadeIn, false, 'explicit hide releases immediately, not after fade-out');
  await Promise.all([interruptedRejected, hiding]);

  const ordinary = transition.run(() => {
    assert.equal(transition.holdingSceneForFadeIn, false);
  }, { minShowMs: 0 });
  assert.equal(transition.holdingSceneForFadeIn, false, 'other transition callers keep original scene cadence');
  controlledOpacity = 1;
  await ordinary;

  globals.document.hidden = true;
  await transition.run(() => {
    assert.equal(transition.holdingSceneForFadeIn, false, 'hidden continuation releases before work');
  }, { holdSceneDuringFadeIn: true, minShowMs: 0 });
  globals.document.hidden = false;
  globals.window.location.search = '?notrans';
  let skippedWork = false;
  const skipped = transition.run(() => {
    skippedWork = true;
    assert.equal(transition.holdingSceneForFadeIn, false, 'capture bypass never acquires a scene hold');
  }, { holdSceneDuringFadeIn: true });
  assert.equal(skippedWork, true, 'capture bypass retains synchronous work invocation');
  await skipped;
  globals.window.location.search = '';
  assert.equal(visibilityListeners.size, 0, 'completed and superseded covers release their document listeners');
} finally {
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
  }
}
console.log('transitionRuntime.selftest: actual owner handles cover microtask races, stale progress and failed work');
