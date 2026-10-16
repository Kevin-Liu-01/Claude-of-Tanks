import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import {
  PINCH_GESTURE_EVENTS, PINCH_ZOOM_BOOT_GUARD, ZOOMED_IN_SCALE, cancelsPinch, installPinchZoomGuard, isBrowserZoomWheel,
} from './pinchZoomGuard.ts';

function fakeTarget() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, listener, options) { listeners.set(type, { listener, options }); },
    removeEventListener(type, listener, options) {
      const entry = listeners.get(type);
      // a capture listener only comes off with a matching capture flag, as in the DOM
      if (entry && entry.listener === listener && !!entry.options?.capture === !!options?.capture) listeners.delete(type);
    },
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

// install once per window; every listener is non-passive (preventDefault is honoured) and in the capture phase,
// so no element's stopPropagation — the Studio dock stops 'wheel' — can let a pinch past
const win = fakeTarget(), doc = fakeTarget();
const handle = installPinchZoomGuard(win, doc);
assert.equal(handle.installed, true);
assert.deepEqual([...doc.listeners.keys()], [...PINCH_GESTURE_EVENTS], 'Safari gesture events are cancelled document-wide');
assert.deepEqual([...win.listeners.keys()], ['wheel']);
for (const entry of [...doc.listeners.values(), ...win.listeners.values()]) {
  assert.equal(entry.options.passive, false);
  assert.equal(entry.options.capture, true, 'capture phase: a descendant cannot stop the guard');
}
const again = installPinchZoomGuard(win, doc);
assert.equal(again.installed, false, 'a second install on the same window is a no-op');
assert.equal(win.listeners.size, 1, 'no duplicate wheel listener');

// ctrl+wheel (trackpad pinch) is cancelled everywhere; plain wheel is left to its owner
assert.equal(win.dispatch('wheel', { ctrlKey: true, deltaY: -5 }).defaultPrevented, true, 'a pinch over any target is cancelled');
assert.equal(win.dispatch('wheel', { ctrlKey: true, deltaY: 5 }).defaultPrevented, true, 'at scale 1 a pinch-in is cancelled too');
assert.equal(win.dispatch('wheel', { ctrlKey: false, deltaY: -100 }).defaultPrevented, false, 'a plain wheel is not');
assert.equal(win.dispatch('wheel', { deltaY: 7 }).defaultPrevented, false);
for (const type of PINCH_GESTURE_EVENTS) assert.equal(doc.dispatch(type, { scale: 1.2 }).defaultPrevented, true, `${type} is cancelled`);
assert.equal(isBrowserZoomWheel({ ctrlKey: true }), true);
assert.equal(isBrowserZoomWheel({}), false);

// a page that is already zoomed in (a pinch from before the guard, a page scale the browser restored) can always
// be pinched back OUT; zooming further in stays cancelled
win.visualViewport = { scale: 2 };
assert.equal(win.dispatch('wheel', { ctrlKey: true, deltaY: 6 }).defaultPrevented, false, 'zoomed in: a pinch-out passes');
assert.equal(win.dispatch('wheel', { ctrlKey: true, deltaY: -6 }).defaultPrevented, true, 'zoomed in: a pinch-in is still cancelled');
assert.equal(doc.dispatch('gesturestart', { scale: 1 }).defaultPrevented, false, 'zoomed in: a Safari gesture may start');
assert.equal(doc.dispatch('gesturechange', { scale: 0.8 }).defaultPrevented, false, 'zoomed in: a closing Safari pinch passes');
assert.equal(doc.dispatch('gesturechange', { scale: 1.2 }).defaultPrevented, true, 'zoomed in: an opening Safari pinch is cancelled');
win.visualViewport = { scale: 1.005 };
assert.equal(win.dispatch('wheel', { ctrlKey: true, deltaY: 6 }).defaultPrevented, true, 'a scale within rounding of 1 is not zoomed');
delete win.visualViewport;

// the decision table, one place for the module and the inline boot copy
const cases = [];
for (const scale of [1, 1.005, ZOOMED_IN_SCALE, 1.5, 2, Number.NaN]) {
  for (const deltaY of [-12, -1, 0, 1, 12]) {
    cases.push([{ type: 'wheel', ctrlKey: true, deltaY }, scale], [{ type: 'wheel', ctrlKey: false, deltaY }, scale]);
  }
  for (const type of PINCH_GESTURE_EVENTS) for (const gestureScale of [undefined, 0.5, 1, 1.5]) {
    cases.push([{ type, scale: gestureScale }, scale]);
  }
}

// destroy removes everything (its capture flag matches) and allows a fresh install
handle.destroy();
assert.equal(win.listeners.size, 0);
assert.equal(doc.listeners.size, 0);
assert.equal(installPinchZoomGuard(win, doc).installed, true);
assert.equal(installPinchZoomGuard(undefined, undefined).installed, false, 'no window: nothing to guard');

// index.html guards the splash from first paint with an inline copy of the same rule; installing the module guard
// hands over from it (listening first, then removing the boot copy)
const indexHtml = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const headScript = indexHtml.match(/<script>\n([\s\S]*?)<\/script>/)?.[1] ?? '';
assert.ok(headScript.includes("Symbol.for('claude-of-tanks.pinch-zoom-boot-guard')"), 'the first head script carries the boot guard');
assert.equal(PINCH_ZOOM_BOOT_GUARD, Symbol.for('claude-of-tanks.pinch-zoom-boot-guard'));
assert.ok(headScript.includes(`> ${ZOOMED_IN_SCALE}`), 'the boot copy uses the module\'s zoomed-in scale');
assert.ok(indexHtml.indexOf('pinch-zoom-boot-guard') < indexHtml.indexOf('id="cot-boot"'), 'the boot guard runs before the splash markup');
{
  const bootWin = fakeTarget(), bootDoc = fakeTarget();
  bootDoc.documentElement = { style: { setProperty() {} } };
  Object.assign(bootWin, { innerWidth: 1440, innerHeight: 900, visualViewport: { width: 1440, height: 900, scale: 1 } });
  runInNewContext(headScript, { window: bootWin, document: bootDoc, Symbol, Number, Math });
  assert.deepEqual([...bootDoc.listeners.keys()], [...PINCH_GESTURE_EVENTS]);
  assert.deepEqual([...bootWin.listeners.keys()], ['wheel']);
  for (const entry of [...bootDoc.listeners.values(), ...bootWin.listeners.values()]) {
    assert.deepEqual({ ...entry.options }, { passive: false, capture: true });
  }
  for (const [event, scale] of cases) {
    bootWin.visualViewport = { width: 1440 / scale, height: 900 / scale, scale };
    const target = event.type === 'wheel' ? bootWin : bootDoc;
    const prevented = target.dispatch(event.type, { ...event }).defaultPrevented;
    assert.equal(prevented, cancelsPinch(event, scale),
      `boot guard and module agree on ${JSON.stringify(event)} at scale ${scale}`);
  }
  const removeBoot = bootWin[PINCH_ZOOM_BOOT_GUARD];
  assert.equal(typeof removeBoot, 'function', 'the boot guard leaves its remover for the module');
  // the module guard takes over: it installs its own listeners, then calls and clears the boot remover
  let removedAfterModuleListened = false;
  const wrapped = () => { removedAfterModuleListened = bootWin.listeners.get('wheel')?.listener !== bootGuardWheel; removeBoot(); };
  const bootGuardWheel = bootWin.listeners.get('wheel').listener;
  bootWin[PINCH_ZOOM_BOOT_GUARD] = wrapped;
  const takeover = installPinchZoomGuard(bootWin, bootDoc);
  assert.equal(takeover.installed, true);
  assert.equal(removedAfterModuleListened, true, 'the module listens before the boot copy comes off');
  assert.equal(bootWin[PINCH_ZOOM_BOOT_GUARD], undefined, 'the boot remover is consumed');
  assert.notEqual(bootWin.listeners.get('wheel').listener, bootGuardWheel, 'the wheel guard is the module\'s now');
  bootWin.visualViewport = { scale: 1 };
  assert.equal(bootWin.dispatch('wheel', { ctrlKey: true, deltaY: -5 }).defaultPrevented, true, 'still guarded after the handover');
  takeover.destroy();
  assert.equal(bootWin.listeners.size + bootDoc.listeners.size, 0, 'nothing of the boot copy is left behind');
}

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

// DOM rails and the key-binding capture never read a pinch as a scroll or a wheel notch
const garage = readFileSync(new URL('./garage.ts', import.meta.url), 'utf8');
for (const [name, pattern] of [
  ['country chip rail', /chipsEl\.addEventListener\('wheel', \(event\) => \{[^}]*?if \(event\.ctrlKey\) return;/],
  ['tank card carousel', /cardsEl\.addEventListener\('wheel', \(e\) => \{[^}]*?if \(e\.ctrlKey \|\|/],
  ['camo strip', /strip\.addEventListener\('wheel', \(event\) => \{[^}]*?if \(event\.ctrlKey \|\|/],
]) assert.match(garage, pattern, `the garage ${name} ignores ctrl+wheel`);
const settings = readFileSync(new URL('./settings.ts', import.meta.url), 'utf8');
assert.match(settings, /function onCaptureWheel\(e: WheelEvent\): void \{[^}]*?e\.ctrlKey\) return;/,
  'a pinch during key capture binds nothing');
console.log('pinchZoomGuard.selftest: first-paint, capture-phase, idempotent pinch guard cancels zoom-in (ctrl+wheel, gesture*) and lets a zoomed page zoom back out');
