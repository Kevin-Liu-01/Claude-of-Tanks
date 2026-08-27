import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGarageShowroomRuntime } from './garageShowroomRuntime.ts';

class FakeElement extends EventTarget {
  capturedPointer = null;
  setPointerCapture(pointerId) { this.capturedPointer = pointerId; }
}

function pointerEvent(type, values = {}) {
  const event = new Event(type, { cancelable: true });
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(event, key, { configurable: true, value });
  }
  return event;
}

const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1_000);
const poses = [];
const rig = {
  setExternalPose(position, look, fov) {
    poses.push({ position: position.clone(), look: look.clone(), fov });
  },
};
const subject = new THREE.Group();
const element = new FakeElement();
const showroom = createGarageShowroomRuntime({
  camera,
  rig,
  element,
  getSubject: () => subject,
  getStageRect: () => ({ x: 200, y: 100, w: 1_200, h: 700 }),
  heroYawRad: Math.PI / 4,
  heroPitchRad: 0.1,
  fixedFrame: () => ({ x: 0, y: 1.6, z: 0, hw: 2, hh: 1.4, hd: 5 }),
  floorY: () => 0,
});

assert.equal(showroom.update(1 / 60), false, 'inactive Garage camera performs no work');
showroom.start();
assert.equal(showroom.active, true, 'start acquires the engine orbit when a hero exists');
assert.ok(poses.length > 0, 'the existing camera solver publishes the canonical hero pose');

element.dispatchEvent(pointerEvent('pointerdown', { button: 0, pointerId: 7 }));
assert.equal(element.capturedPointer, 7, 'primary drag captures its pointer');
assert.equal(showroom.debugState().dragging, true);
element.dispatchEvent(pointerEvent('pointermove', {
  pointerId: 7, movementX: 40, movementY: -12,
}));
assert.equal(showroom.update(1 / 60), true, 'captured drag advances the same orbit solver');

const wheel = pointerEvent('wheel', { deltaY: -1 });
assert.equal(element.dispatchEvent(wheel), false, 'active showroom wheel is consumed');
assert.equal(wheel.defaultPrevented, true);
element.dispatchEvent(pointerEvent('pointerup', { pointerId: 7 }));
assert.equal(showroom.debugState().dragging, false, 'matching release ends the drag');

showroom.stop();
assert.equal(showroom.active, false);
assert.equal(showroom.update(1 / 60), false, 'battle/Studio phases do not pump showroom work');
const inactiveWheel = pointerEvent('wheel', { deltaY: 1 });
assert.equal(element.dispatchEvent(inactiveWheel), true, 'inactive wheel remains available to its owner');

showroom.dispose();
showroom.start();
element.dispatchEvent(pointerEvent('pointerdown', { button: 0, pointerId: 9 }));
assert.equal(element.capturedPointer, 7, 'disposed input bindings cannot recapture pointers');
showroom.stop();

console.log('garageShowroomRuntime.selftest: typed phase, pointer, wheel, and disposal ownership pass');
