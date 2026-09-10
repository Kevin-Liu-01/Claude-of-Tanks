import assert from 'node:assert/strict';
import { createModal } from './modal.ts';

class ElementFixture {
  constructor(tag = 'div') {
    this.tagName = tag; this.style = {}; this.dataset = {}; this.children = [];
    this.attributes = new Map(); this.classes = new Set(); this.hidden = false;
    this.isConnected = true; this.focuses = 0;
    this.classList = { add: (name) => this.classes.add(name), remove: (name) => this.classes.delete(name) };
  }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.append(node); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
  remove() { this.isConnected = false; }
  focus() { this.focuses++; document.activeElement = this; }
}
const keys = ['window', 'document', 'HTMLElement', 'requestAnimationFrame'];
const saved = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const frames = [], timers = new Map();
let timerId = 0;
const body = new ElementFixture('body'), head = new ElementFixture('head');
body.style.overflow = 'auto';
const trigger = new ElementFixture('button');
globalThis.HTMLElement = ElementFixture;
globalThis.document = {
  body, head, activeElement: trigger, fonts: null,
  createElement: (tag) => new ElementFixture(tag),
  getElementById: () => ({}), // existing stylesheet/font nodes; no CSS instrumentation
};
globalThis.window = {
  clearTimeout(id) { timers.delete(id); },
  setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; },
  matchMedia: () => ({ matches: false }),
};
globalThis.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length; };
const flushFrames = () => { for (const callback of frames.splice(0)) callback(); };
const flushTimers = () => { for (const [id, callback] of [...timers]) { timers.delete(id); callback(); } };
const modals = [];
try {
  const modal = createModal(); modals.push(modal);
  modal.open({ trigger });
  modal.close({ restoreFocus: false, immediate: true });
  flushFrames();
  assert.equal(modal.closeButton.focuses, 0, 'closed notice cannot focus from its queued open callback');
  assert.equal(modal.root.classes.has('is-open'), false);
  assert.equal(body.style.overflow, 'auto');

  modal.open({ trigger }); modal.close({ restoreFocus: false, immediate: true }); modal.open({ trigger });
  flushFrames();
  assert.equal(modal.closeButton.focuses, 1, 'only the latest open lifetime focuses');
  modal.close(); flushTimers();
  assert.equal(document.activeElement, trigger, 'ordinary animated close still restores accessible trigger focus');
  assert.equal(body.style.overflow, 'auto');

  modal.open({ trigger });
  const other = createModal(); modals.push(other); other.open({ trigger });
  flushFrames();
  assert.equal(modal.closeButton.focuses, 1, 'superseded modal cannot steal focus from another dialog');
  assert.equal(document.activeElement, other.closeButton);
  other.close({ immediate: true });
  assert.equal(document.activeElement, trigger, 'ordinary immediate close still restores trigger focus');

  modal.open({ trigger }); modal.dispose(); flushFrames();
  assert.equal(modal.closeButton.focuses, 1, 'disposed pending open never focuses');
  assert.equal(body.style.overflow, 'auto');
} finally {
  for (const modal of modals) modal.dispose();
  for (const key of keys) {
    const descriptor = saved.get(key);
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
}
console.log('modalFocusLifecycle.selftest: actual queued focus callbacks, supersession and ordinary focus restore pass');
