import assert from 'node:assert/strict';
import { createInput, DEFAULT_BINDINGS, migrateShiftAimCapsFreeLookBindings } from './input.ts';
import './armorAimOverlay.selftest.mjs';

assert.equal(DEFAULT_BINDINGS.sniperToggle, 'ShiftLeft',
  'left Shift toggles sniper mode');
assert.equal(DEFAULT_BINDINGS.freeLook, 'CapsLock',
  'Caps Lock is the dedicated hold-to-free-look modifier');
assert.equal(DEFAULT_BINDINGS.selfRight, 'KeyF',
  'F is the rebindable self-right recovery key');

const shiftFreeLookPrimary = { sniperToggle: null, freeLook: 'ShiftLeft' };
const shiftFreeLookSecondary = { freeLook: 'AltLeft' };
assert.equal(migrateShiftAimCapsFreeLookBindings(
  shiftFreeLookPrimary, shiftFreeLookSecondary), true);
assert.deepEqual(shiftFreeLookPrimary, { sniperToggle: 'ShiftLeft', freeLook: 'CapsLock' },
  'current defaults migrate Shift back to aiming and Caps Lock onto free look');
assert.equal(shiftFreeLookSecondary.freeLook, 'AltLeft',
  'the old Alt shortcut remains available as a secondary free-look key');

const legacyPrimary = { sniperToggle: 'ShiftLeft', freeLook: 'AltLeft' };
const legacySecondary = {};
assert.equal(migrateShiftAimCapsFreeLookBindings(legacyPrimary, legacySecondary), true);
assert.deepEqual(legacyPrimary, { sniperToggle: 'ShiftLeft', freeLook: 'CapsLock' },
  'older Shift-aim defaults gain the Caps Lock free-look hold');
assert.equal(legacySecondary.freeLook, 'AltLeft',
  'older defaults retain Left Alt as their secondary free-look key');

const customPrimary = { sniperToggle: 'KeyV', freeLook: 'KeyX' };
assert.equal(migrateShiftAimCapsFreeLookBindings(customPrimary, {}), false);
assert.deepEqual(customPrimary, { sniperToggle: 'KeyV', freeLook: 'KeyX' },
  'intentional custom bindings are preserved');

const capsCollision = { sniperToggle: null, freeLook: 'ShiftLeft', shotLog: 'CapsLock' };
assert.equal(migrateShiftAimCapsFreeLookBindings(capsCollision, {}), false);
assert.deepEqual(capsCollision,
  { sniperToggle: null, freeLook: 'ShiftLeft', shotLog: 'CapsLock' },
  'a custom Caps Lock binding is never overwritten');

// Blur and hidden-document edges must discard every transient input source,
// including a buffered click/touch action whose key was already released.
{
  const priorWindow = globalThis.window;
  const priorDocument = globalThis.document;
  const priorStorage = globalThis.localStorage;
  try {
    globalThis.window = new EventTarget();
    globalThis.document = Object.assign(new EventTarget(), { hidden: false });
    globalThis.localStorage = { getItem: () => null, setItem() {} };
    const controls = createInput();
    for (const event of ['blur', 'visibilitychange']) {
      controls.pressVirtual('fire');
      controls.tapVirtual('consumable1');
      controls.pressVirtual('forward');
      controls.setVirtualMove(0.5, 1);
      assert.equal(controls.getState().fire, true);
      if (event === 'blur') window.dispatchEvent(new Event(event));
      else {
        document.hidden = true;
        document.dispatchEvent(new Event(event));
        document.hidden = false;
      }
      assert.equal(controls.getState().fire, false, 'buffered fire cannot survive focus loss');
      assert.equal(controls.isDown('consumable1'), false, 'released action latch cannot replay on resume');
      assert.equal(controls.isDown('forward'), false, 'held touch movement clears with keyboard movement');
      const movement = {};
      assert.equal(controls.getVirtualMove(movement), false);
      assert.deepEqual(movement, { x: 0, y: 0 });
    }
  } finally {
    if (priorWindow === undefined) delete globalThis.window;
    else globalThis.window = priorWindow;
    if (priorDocument === undefined) delete globalThis.document;
    else globalThis.document = priorDocument;
    if (priorStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = priorStorage;
  }
}

console.log('input.selftest: binding migration and keyboard/touch blur intent reset passed');
