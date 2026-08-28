import assert from 'node:assert/strict';
import {
  isEditingControl,
  shouldOpenSettingsFromPointerUnlock,
} from './keyboardOwnership.ts';

const input = { tagName: 'INPUT', isContentEditable: false };
const canvas = { tagName: 'CANVAS', isContentEditable: false };

assert.equal(isEditingControl(input), true, 'chat input owns typed keys');
assert.equal(isEditingControl(canvas), false, 'game canvas does not own typed keys');
assert.equal(shouldOpenSettingsFromPointerUnlock({
  battleActive: true,
  activeElement: canvas,
}), true, 'an unclaimed in-battle unlock retains the Esc-to-settings behavior');
assert.equal(shouldOpenSettingsFromPointerUnlock({
  battleActive: true,
  activeElement: input,
}), false, 'opening chat with Enter must not open settings');
assert.equal(shouldOpenSettingsFromPointerUnlock({
  battleActive: true,
  replayActive: true,
  activeElement: canvas,
}), false, 'killcam keeps ownership of its pointer unlock');

console.log('keyboardOwnership.selftest: Enter/chat and Esc/settings ownership passed');
