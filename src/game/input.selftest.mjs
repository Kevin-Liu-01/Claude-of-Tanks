import assert from 'node:assert/strict';
import { createInput, DEFAULT_BINDINGS, migrateShiftAimCapsFreeLookBindings } from './input.ts';
import { CREW_VOICE_NATIONS } from '../audio/crewVoice.ts';
import { getLocale, setLocale } from '../ui/i18n.ts';

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
    globalThis.localStorage = {getItem:key=>key==='cot.bindings.v1'?JSON.stringify({hitboxOverlay:'KeyG'}):null,setItem(){}};
    const migrated=createInput();
    assert.equal(migrated.getBinding('hitboxOverlay'),'KeyG','new smoke default preserves existing custom keys');
    assert.equal(migrated.getBinding('smoke'),null);
    globalThis.localStorage = { getItem: () => null, setItem() {} };
    const controls = createInput();
    assert.equal(controls.getSettings().isometricView, false, 'overhead view is opt-in');
    controls.setSetting('isometricView', true);
    assert.equal(controls.getSettings().isometricView, true);
    assert.equal(createInput().getSettings().isometricView, false, 'missing saved preference retains chase view');
    assert.equal(controls.getSettings().armorAimOverlay, false, 'armor highlighting is opt-in for new profiles');
    for (const enabled of [true, false]) {
      globalThis.localStorage = {getItem:key=>key==='cot.settings.v1'?JSON.stringify({armorAimOverlay:enabled,isometricView:enabled}):null,setItem(){}};
      assert.equal(createInput().getSettings().isometricView, enabled, 'saved camera preference is restored');
      assert.equal(createInput().getSettings().armorAimOverlay, enabled, 'explicit saved armor preference is preserved');
    }
    globalThis.localStorage = { getItem: () => null, setItem() {} };
    assert.equal(controls.getBinding('smoke'),'KeyG');
    assert.equal(controls.getBinding('lights'),'KeyN');
    assert.equal(controls.getBinding('roofGun'),'KeyB');
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

// The real input store persists every voice pack and upgrades the two legacy
// choices once, without making future interface-language changes change crews.
{
  const prior = { window: globalThis.window, document: globalThis.document, localStorage: globalThis.localStorage };
  const locale = getLocale();
  const stored = new Map();
  try {
    globalThis.window = new EventTarget();
    globalThis.document = new EventTarget();
    globalThis.localStorage = {
      getItem: key => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, value),
    };
    const newInput = () => {
      globalThis.window = new EventTarget();
      globalThis.document = new EventTarget();
      return createInput();
    };
    assert.equal(newInput().getSettings().crewVoice, 'national');
    for (const choice of ['national', ...Object.keys(CREW_VOICE_NATIONS)]) {
      const input = newInput();
      input.setSetting('crewVoice', choice);
      assert.equal(JSON.parse(stored.get('cot.settings.v1')).crewVoice, choice);
      assert.equal(newInput().getSettings().crewVoice, choice, 'choice survives a new input owner');
      input.setSetting('crewVoice', 'not-a-pack');
      assert.equal(input.getSettings().crewVoice, choice, 'invalid live changes are ignored');
    }
    setLocale('zh-CN');
    for (const [legacy, expected] of [['english', 'en-US'], ['interface', 'zh']]) {
      stored.set('cot.settings.v1', JSON.stringify({ crewVoice: legacy, volMaster: 0.37, futureSetting: true }));
      assert.equal(newInput().getSettings().crewVoice, expected);
      assert.deepEqual(JSON.parse(stored.get('cot.settings.v1')), { crewVoice: expected, volMaster: 0.37, futureSetting: true });
    }
    setLocale('en-US');
    assert.equal(newInput().getSettings().crewVoice, 'zh', 'migrated Interface becomes a fixed nation');
    for (const raw of ['{"crewVoice":"bogus"}', '{broken json', 'null']) {
      stored.set('cot.settings.v1', raw);
      assert.equal(newInput().getSettings().crewVoice, 'national');
    }
  } finally {
    setLocale(locale);
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
}

console.log('input.selftest: bindings, blur reset and persisted crew voice migration passed');
