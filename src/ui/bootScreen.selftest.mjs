import assert from 'node:assert/strict';
import { createBootScreen } from './bootScreen.ts';

// Exercise the actual boot owner's listeners with a minimal DOM. No browser,
// timers, images, audio device or network requests are started by this fixture.
class FakeElement {
  constructor(control = false) {
    this.control = control;
    const classes = new Set();
    this.classList = { contains: key => classes.has(key), add: key => classes.add(key),
      remove: key => classes.delete(key) };
  }
  closest() { return this.control ? this : null; }
}
class FakeKeyboardEvent {
  constructor(key, isTrusted = true) { this.type = 'keydown'; this.key = key; this.isTrusted = isTrusted; }
}
const globals = ['window', 'document', 'navigator', 'Element', 'KeyboardEvent', 'CustomEvent',
  'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'];
const saved = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));

function harness({ mode = 'garage', query = '', webdriver = false, missing = false, preparationError = false } = {}) {
  const root = missing ? null : new FakeElement();
  const listeners = new Map(), frames = new Map(), timers = new Map();
  const events = [];
  let sequence = 0;
  const scope = {
    window: { location: { search: query }, __COT_NO_BOOT_HERO: true,
      addEventListener(type, callback) { listeners.set(type, callback); },
      removeEventListener(type, callback) { if (listeners.get(type) === callback) listeners.delete(type); } },
    document: { getElementById: id => id === 'cot-boot' ? root : null,
      querySelectorAll: () => [], dispatchEvent: event => events.push(event.type) },
    navigator: { webdriver }, Element: FakeElement, KeyboardEvent: FakeKeyboardEvent,
    CustomEvent: class { constructor(type) { this.type = type; } },
    requestAnimationFrame(callback) { const id = ++sequence; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    setTimeout(callback) { const id = ++sequence; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  for (const [key, value] of Object.entries(scope)) Object.defineProperty(globalThis, key,
    { configurable: true, writable: true, value });
  const boot = createBootScreen({ mode });
  let prepares = 0;
  const ready = boot.ready(() => {
    prepares++;
    assert.equal(root.classList.contains('cot-boot-out'), false, 'preparation occurs before opaque cover dismissal');
    events.push('prepare');
    if (preparationError) throw new Error('optional device unavailable');
  });
  return { boot, root, listeners, frames, events, ready, get prepares() { return prepares; },
    fire(event) { listeners.get(event.type)?.(event); } };
}

try {
  for (const type of ['pointerdown', 'keydown']) {
    const h = harness();
    assert.equal(h.prepares, 0);
    assert.equal(h.boot.ready(() => assert.fail('duplicate ready callback')), h.ready);
    const event = type === 'keydown' ? new FakeKeyboardEvent('Enter') : { type, isTrusted: true };
    const lateCallback = h.listeners.get(type);
    h.fire(event); await h.ready;
    assert.deepEqual(h.events, ['prepare', 'cot:boot-dismiss']);
    assert.equal(h.prepares, 1);
    assert.equal(h.listeners.size, 0);
    assert.equal(h.frames.size, 0);
    lateCallback(event);
    assert.equal(h.prepares, 1, 'late delivery cannot repeat device preparation');
  }
  for (const config of [{ query: '?nosplash' }, { query: '?nogate' }, { webdriver: true }, { missing: true }]) {
    const h = harness(config); await h.ready;
    assert.equal(h.prepares, 0, 'skipped/missing gates are never sound-preparation intent');
    assert.equal(h.listeners.size, 0);
  }
  for (const mode of ['garage', 'studio']) {
    const h = harness({ mode });
    h.fire({ type: 'pointerdown', isTrusted: mode === 'studio' }); await h.ready;
    assert.equal(h.prepares, 0, 'synthetic and Studio entry never prepare Garage audio');
  }
  const syntheticKey = harness();
  syntheticKey.fire(new FakeKeyboardEvent('Enter', false)); await syntheticKey.ready;
  assert.equal(syntheticKey.prepares, 0);
  const rejected = harness();
  rejected.fire({ type: 'pointerdown', isTrusted: true, target: new FakeElement(true) });
  for (const key of ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab']) rejected.fire(new FakeKeyboardEvent(key));
  assert.equal(rejected.prepares, 0);
  assert.equal(rejected.boot.gated, true, 'controls/modifiers leave the entry gate armed');
  rejected.boot.dismiss(); await rejected.ready;
  assert.equal(rejected.prepares, 0);
  assert.equal(rejected.listeners.size, 0, 'programmatic dismissal retires the pending gesture owner');
  await rejected.boot.ready(() => assert.fail('dismissed gate must not prepare'));
  const throwing = harness({ preparationError: true });
  throwing.fire({ type: 'pointerdown', isTrusted: true }); await throwing.ready;
  assert.equal(throwing.boot.gated, false, 'optional preparation errors cannot trap entry');
} finally {
  for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
}

console.log('bootScreen.selftest: trusted silent preparation and gate ownership passed');
