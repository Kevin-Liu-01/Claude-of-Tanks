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
let opaqueObserved = false, atPaint = null;
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
    const opaque = root.classList.contains('lit');
    if (opaque) opaqueObserved = true;
    return { opacity: opaque ? '1' : '0' };
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
  assert.equal(visibilityListeners.size, 0, 'completed and superseded covers release their document listeners');
} finally {
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
  }
}
console.log('transitionRuntime.selftest: actual owner handles cover microtask races, stale progress and failed work');
