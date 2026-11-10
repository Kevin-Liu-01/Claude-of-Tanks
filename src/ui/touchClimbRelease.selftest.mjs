// 2026-11-02 audit F8: the touch flight's climb rail holds the virtual handbrake while pressed. Leaving the battle hid the
// rail and released the joystick and the fire gesture but not the climb: the held handbrake waited for a pointer lift
// that a hidden element may never see. Driven through the real touch controls over the recording DOM.
import { created, windowStub } from './hudDomHarness.test-support.mjs';
import assert from 'node:assert/strict';
import { createBus } from '../game/stateCore.ts';
import { createTouchControls } from './touchControls.ts';

const held = new Set();
let touchLayout = true;
const input = {
  pressVirtual: (id) => held.add(id), releaseVirtual: (id) => held.delete(id), tapVirtual() {},
  setVirtualMove() {}, addVirtualAim() {}, isTouchLayout: () => touchLayout,
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

// (U23, round 2) the virtual handbrake is shared: a phone pad's held button and the Watch climb rail press it too. A
// layout change (a resize, an orientation change, a pad plugged in) or a battle exit releases only the hold this rail
// made, never one it did not.
bus.emit('phase:change', { phase: 'battle' });
input.pressVirtual('handbrake'); // another owner's hold (the pad's)
touchLayout = false;
windowStub.dispatchEvent(new Event('resize'));
assert.equal(held.has('handbrake'), true, 'a resize out of the touch layout leaves another owner\'s handbrake held');
bus.emit('phase:change', { phase: 'garage' });
assert.equal(held.has('handbrake'), true, 'and so does a battle exit with the rail never pressed');
held.delete('handbrake');
// the rail's own hold is still released on a layout exit
touchLayout = true;
bus.emit('phase:change', { phase: 'battle' });
climb.dispatchEvent(press);
assert.equal(held.has('handbrake'), true);
touchLayout = false;
windowStub.dispatchEvent(new Event('resize'));
assert.equal(held.has('handbrake'), false, 'a layout exit releases the rail\'s own hold');

console.log('touchClimbRelease.selftest: leaving the battle or the touch layout releases a held climb, and only the climb\'s own hold');
