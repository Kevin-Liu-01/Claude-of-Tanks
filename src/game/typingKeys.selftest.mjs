// typingKeys.selftest.mjs — a field gets every key typed into it (typing-keys-277; Kevin, 276: "i cant write spaces in
// the tank filter in garage because it gets detected by teh game itself"). Copyright © 2026 Kevin B. Liu.
//
// The game's input layer listens on the window for every key, and Space is the handbrake: its keydown was taken as the
// action and its default prevented, so the Garage search never received the space. This drives the real layer
// (createInput) with "t 72 b3" typed into a search field, a field inside a shadow root and an IME composition, the way
// the browser delivers them (each keydown reaches the window; the character lands only if no listener prevented it):
//   1. the field ends with exactly the typed text, and no action fires or holds (no handbrake, no shell, no turbo);
//   2. the same keys with the focus on the page still drive the tank (the guard is the field's, not a dead layer);
//   3. a key held as the focus moves into a field is still released (keyup is never filtered).
// tools/typing-keys-census.selftest.mjs holds every other global key listener to the same predicate.
import assert from 'node:assert/strict';
import { ACTION_DEFS, createInput } from './input.ts';
import { A11Y } from '../ui/accessibilityPreferences.ts';

const TEXT = 't 72 b3';
const CODES = { t: 'KeyT', ' ': 'Space', 7: 'Digit7', 2: 'Digit2', b: 'KeyB', 3: 'Digit3' };
const prior = { window: globalThis.window, document: globalThis.document, localStorage: globalThis.localStorage };

const field = (type = 'search') => ({ tagName: 'INPUT', type, isContentEditable: false });
const body = { tagName: 'BODY', isContentEditable: false };
/** A key event as the window sees it: its target, and the composed path a shadow root's field reports. */
function keyEvent(type, key, target, extra = {}) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { key, code: CODES[key] ?? key, repeat: false, isComposing: false, keyCode: 0, ...extra });
  Object.defineProperty(event, 'target', { value: target.host ?? target });
  event.composedPath = () => [target, ...(target.host ? [target.host] : []), body];
  return event;
}

function fresh() {
  globalThis.window = new EventTarget();
  globalThis.document = Object.assign(new EventTarget(), { hidden: false, pointerLockElement: null });
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  A11Y.toggles = new Set();
  const input = createInput();
  const fired = [];
  for (const { id } of ACTION_DEFS) input.onAction(id, () => fired.push(id));
  return { input, fired };
}

/** Type `text` into `target` as the browser does; returns the field's value. */
function type(text, target, extra = {}) {
  let value = '';
  for (const key of text) {
    const down = keyEvent('keydown', key, target, extra);
    window.dispatchEvent(down);
    if (!down.defaultPrevented) value += key;
    window.dispatchEvent(keyEvent('keyup', key, target, extra));
  }
  return value;
}

try {
  // 1. the field gets every key, the game none
  for (const [name, target, extra] of [
    ['the Garage search', field('search'), {}],
    ['a text field', field('text'), {}],
    ['a field in a shadow root', { ...field('text'), host: { tagName: 'COT-PANEL', isContentEditable: false } }, {}],
    ['a contenteditable note', { tagName: 'DIV', isContentEditable: true }, {}],
    ['an IME composition on the page', body, { isComposing: true }],
  ]) {
    const { input, fired } = fresh();
    let handbrakeHeld = false;
    window.addEventListener('keydown', () => { handbrakeHeld ||= input.getState().handbrake; });
    const value = type(TEXT, target, extra);
    if (!extra.isComposing) assert.equal(value, TEXT, `${name}: the field reads exactly "${TEXT}" (the space typed)`);
    assert.deepEqual(fired, [], `${name}: no action fired while typing`);
    assert.equal(handbrakeHeld, false, `${name}: Space never held the handbrake`);
    assert.equal(input.getState().handbrake, false, `${name}: nothing is held after`);
  }

  // 2. on the page the same keys are the game's
  {
    const { input, fired } = fresh();
    window.dispatchEvent(keyEvent('keydown', ' ', body));
    assert.equal(input.getState().handbrake, true, 'on the page Space still holds the handbrake');
    window.dispatchEvent(keyEvent('keyup', ' ', body));
    const space = keyEvent('keydown', ' ', body);
    window.dispatchEvent(space);
    assert.equal(space.defaultPrevented, true, 'and keeps the page from scrolling');
    window.dispatchEvent(keyEvent('keyup', ' ', body));
    assert.ok(fired.includes('handbrake'), 'the handbrake action fires from the page');
  }

  // 3. a key held into a field is released there
  {
    const { input } = fresh();
    window.dispatchEvent(keyEvent('keydown', ' ', body));
    assert.equal(input.getState().handbrake, true);
    window.dispatchEvent(keyEvent('keyup', ' ', field()));
    assert.equal(input.getState().handbrake, false, 'a release inside a field still lets the handbrake go');
  }
} finally {
  A11Y.toggles = new Set();
  for (const [k, v] of Object.entries(prior)) {
    if (v === undefined) delete globalThis[k];
    else globalThis[k] = v;
  }
}

console.log(`typingKeys.selftest: "${TEXT}" typed whole into a search, a text field, a shadow root's field and editable `
  + 'content with no game action; an IME composition drives nothing; the page\'s Space still the handbrake; releases never filtered');
