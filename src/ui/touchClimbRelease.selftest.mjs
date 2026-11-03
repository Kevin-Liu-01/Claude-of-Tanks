// 2026-11-02 audit F8: the touch flight's climb rail holds the virtual handbrake while pressed. Leaving the battle hid the
// rail and released the joystick and the fire gesture but not the climb: the held handbrake waited for a pointer lift
// that a hidden element may never see. Driven through the real touch controls over the recording DOM.
import { created } from './hudDomHarness.test-support.mjs';
import assert from 'node:assert/strict';
import { createBus } from '../game/stateCore.ts';
import { createTouchControls } from './touchControls.ts';

const held = new Set();
const input = {
  pressVirtual: (id) => held.add(id), releaseVirtual: (id) => held.delete(id), tapVirtual() {},
  setVirtualMove() {}, addVirtualAim() {}, isTouchLayout: () => true,
};
const bus = createBus();
createTouchControls({ input, bus, isBattleActive: () => true });
bus.emit('phase:change', { phase: 'battle' });
const climb = created.find((element) => element.classes.has('flight-climb'));
assert.ok(climb, 'the climb rail is mounted');
const press = new Event('pointerdown');
press.pointerId = 7;
climb.dispatchEvent(press);
assert.equal(held.has('handbrake'), true, 'the climb holds the handbrake');
bus.emit('phase:change', { phase: 'garage' }); // the battle ends under the thumb: no pointer lift reaches the hidden rail
assert.equal(held.has('handbrake'), false, 'leaving the battle releases the climb');

console.log('touchClimbRelease.selftest: leaving the battle releases a held climb');
