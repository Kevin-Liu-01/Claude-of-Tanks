import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PINCH_GESTURE_EVENTS, installPinchZoomGuard, isBrowserZoomWheel } from './pinchZoomGuard.ts';

function fakeTarget() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, listener, options) { listeners.set(type, { listener, options }); },
    removeEventListener(type) { listeners.delete(type); },
    dispatch(type, event) {
      const entry = listeners.get(type);
      if (!entry) return event;
      let prevented = false;
      entry.listener({ ...event, type, preventDefault() { prevented = true; } });
      event.defaultPrevented = prevented;
      return event;
    },
  };
}

// install once per window; every listener is non-passive so preventDefault is honoured
const win = fakeTarget(), doc = fakeTarget();
const handle = installPinchZoomGuard(win, doc);
assert.equal(handle.installed, true);
assert.deepEqual([...doc.listeners.keys()], [...PINCH_GESTURE_EVENTS], 'Safari gesture events are cancelled document-wide');
assert.deepEqual([...win.listeners.keys()], ['wheel']);
for (const entry of [...doc.listeners.values(), ...win.listeners.values()]) assert.equal(entry.options.passive, false);
const again = installPinchZoomGuard(win, doc);
assert.equal(again.installed, false, 'a second install on the same window is a no-op');
assert.equal(win.listeners.size, 1, 'no duplicate wheel listener');

// ctrl+wheel (trackpad pinch) is cancelled everywhere; plain wheel is left to its owner
assert.equal(win.dispatch('wheel', { ctrlKey: true, deltaY: -5 }).defaultPrevented, true, 'a pinch over any target is cancelled');
assert.equal(win.dispatch('wheel', { ctrlKey: false, deltaY: -100 }).defaultPrevented, false, 'a plain wheel is not');
assert.equal(win.dispatch('wheel', { deltaY: 7 }).defaultPrevented, false);
for (const type of PINCH_GESTURE_EVENTS) assert.equal(doc.dispatch(type, { scale: 1.2 }).defaultPrevented, true, `${type} is cancelled`);
assert.equal(isBrowserZoomWheel({ ctrlKey: true }), true);
assert.equal(isBrowserZoomWheel({}), false);

// destroy removes everything and allows a fresh install
handle.destroy();
assert.equal(win.listeners.size, 0);
assert.equal(doc.listeners.size, 0);
assert.equal(installPinchZoomGuard(win, doc).installed, true);
assert.equal(installPinchZoomGuard(undefined, undefined).installed, false, 'no window: nothing to guard');

// wiring: the guard is installed at boot for every device (the touch controls used to be its only owner)
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
const bootIndex = main.indexOf('installResponsiveLayout();');
assert.ok(bootIndex > 0);
assert.ok(main.indexOf('installPinchZoomGuard();') > bootIndex && main.indexOf('installPinchZoomGuard();') - bootIndex < 400,
  'main.ts installs the pinch guard right after the responsive layout, before any surface is built');
const touch = readFileSync(new URL('./touchControls.ts', import.meta.url), 'utf8');
assert.ok(touch.includes('installPinchZoomGuard()'), 'touch controls reuse the shared guard');
assert.ok(!/addEventListener\('gesturestart'|addEventListener\(type, killGesture/.test(touch), 'touch controls no longer own gesture listeners');
assert.ok(!/e\.ctrlKey\) e\.preventDefault\(\)/.test(touch), 'touch controls no longer own the ctrl+wheel listener');
console.log('pinchZoomGuard.selftest: boot-installed, idempotent, non-passive pinch guard cancels ctrl+wheel and gesture events everywhere');
