import assert from 'node:assert/strict';
import {
  isEditingControl,
  isTypingTarget,
  shouldOpenSettingsFromPointerUnlock,
} from './keyboardOwnership.ts';

const input = { tagName: 'INPUT', type: 'text', isContentEditable: false };
const canvas = { tagName: 'CANVAS', isContentEditable: false };

assert.equal(isEditingControl(input), true, 'chat input owns typed keys');
assert.equal(isEditingControl({ tagName: 'INPUT', isContentEditable: false }), true, 'an input of no type takes text');
assert.equal(isEditingControl({ tagName: 'INPUT', type: 'range', isContentEditable: false }), false,
  'a slider left focused after Settings closed does not take the next Esc (INTERACTION-REDESIGN C)');
assert.equal(isEditingControl({ tagName: 'INPUT', type: 'checkbox', isContentEditable: false }), false, 'nor a checkbox');
assert.equal(isEditingControl({ tagName: 'SELECT', isContentEditable: false }), false, 'nor a closed select');
assert.equal(isEditingControl({ tagName: 'TEXTAREA', isContentEditable: false }), true, 'a text area takes text');
assert.equal(isEditingControl(canvas), false, 'game canvas does not own typed keys');
assert.equal(shouldOpenSettingsFromPointerUnlock({ battleActive: true }), true,
  'an unclaimed in-battle unlock (the browser\'s swallowed Esc) opens Settings');
assert.equal(shouldOpenSettingsFromPointerUnlock({ battleActive: true, unlockOwner: 'editor' }), false,
  'opening chat with Enter must not open settings (a focused editor claims the unlock)');
assert.equal(shouldOpenSettingsFromPointerUnlock({ battleActive: true, unlockOwner: 'presentation' }), false,
  'killcam keeps ownership of its pointer unlock');
assert.equal(shouldOpenSettingsFromPointerUnlock({ battleActive: true, unlockOwner: 'photo-mode' }), false,
  'photo mode keeps ownership of its pointer release (settings-unify-278 fix-back)');
assert.equal(shouldOpenSettingsFromPointerUnlock({ battleActive: true, pointerLocked: true }), false, 'a held lock');
assert.equal(shouldOpenSettingsFromPointerUnlock({ battleActive: true, settingsOpen: true }), false, 'an open panel');
assert.equal(shouldOpenSettingsFromPointerUnlock({ battleActive: false }), false, 'outside a controllable battle');

// isTypingTarget: the one test every global key listener runs (typing-keys-277)
const key = (k, target, extra = {}) => ({ key: k, target, ...extra });
const search = { tagName: 'INPUT', type: 'search', isContentEditable: false };
assert.equal(isTypingTarget(key(' ', search)), true, 'a space typed into the Garage search is the field\'s (Kevin, 276)');
assert.equal(isTypingTarget(key('ArrowLeft', search)), true, 'so are its arrows');
assert.equal(isTypingTarget(key('Escape', search)), false, 'Escape is never typed text: it still blurs, clears or closes');
assert.equal(isTypingTarget(key('Escape', canvas, { isComposing: true })), true, 'but an IME composition keeps its Escape');
assert.equal(isTypingTarget(key('a', canvas, { keyCode: 229 })), true, 'a composing key by its legacy code');
assert.equal(isTypingTarget(key('a', { tagName: 'SELECT', isContentEditable: false })), true, 'a select\'s type-ahead');
assert.equal(isTypingTarget(key('a', { tagName: 'SPAN', isContentEditable: true })), true, 'editable content');
assert.equal(isTypingTarget(key(' ', { tagName: 'INPUT', type: 'range', isContentEditable: false })), false, 'not a slider');
assert.equal(isTypingTarget(key(' ', canvas)), false, 'the page\'s keys are the game\'s');
assert.equal(isTypingTarget({ ...key(' ', { tagName: 'COT-PANEL', isContentEditable: false }), composedPath: () => [search] }), true,
  'a field inside a shadow root, by the composed path');
assert.equal(isTypingTarget({ target: search, type: 'pointerdown' }), false, 'a pointer a shared listener takes is no key');
assert.equal(isTypingTarget(null), false);

console.log('keyboardOwnership.selftest: Enter/chat and Esc/settings ownership, by the unlock\'s owner, and the typing predicate, passed');
