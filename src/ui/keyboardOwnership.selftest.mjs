import assert from 'node:assert/strict';
import {
  isEditingControl,
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

console.log('keyboardOwnership.selftest: Enter/chat and Esc/settings ownership, by the unlock\'s owner, passed');
