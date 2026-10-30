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

const wheel = pointerEvent('wheel', { deltaY: -100 }); // one mouse click (2026-09-19: the dolly follows travel)
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

// Selecting a vehicle can finish before the orbit's 0.4-second measurement
// poll notices the replacement. That late poll must not erase a newer drag.
{
  let shownSubject = new THREE.Group();
  const dragElement = new FakeElement();
  const orbit = createGarageShowroomRuntime({
    camera, rig, element: dragElement,
    getSubject: () => shownSubject,
    getStageRect: () => ({ x: 200, y: 100, w: 1_200, h: 700 }),
    heroYawRad: Math.PI / 4, heroPitchRad: 0.1,
    fixedFrame: () => ({ x: 0, y: 1.6, z: 0, hw: 2, hh: 1.4, hd: 5 }),
    floorY: () => 0,
  });
  const performanceDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  let clockMs = 0;
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => clockMs } });
  const advance = (frames) => {
    for (let frame = 0; frame < frames; frame++) { clockMs += 100; orbit.update(0.1); }
  };
  try {
  orbit.start();
  shownSubject = new THREE.Group();
  dragElement.dispatchEvent(pointerEvent('pointerdown', { button: 0, pointerId: 3 }));
  dragElement.dispatchEvent(pointerEvent('pointermove', { pointerId: 3, movementX: 100, movementY: 0 }));
  advance(12);
  assert.ok(orbit.debugState().yawDeg < 30,
    'late subject measurement must preserve the current held drag instead of snapping toward the hero');
  dragElement.dispatchEvent(pointerEvent('pointerup', { pointerId: 3 }));
  shownSubject = new THREE.Group();
  advance(8);
  assert.ok(orbit.debugState().yawDeg < 30,
    'late replacement during release momentum must not discard recent camera input');
  advance(100);
  assert.ok(Math.abs(orbit.debugState().yawDeg - 45) < 0.01, 'normal idle spring still returns to the hero');
  orbit.reset();
  assert.equal(orbit.debugState().yawDeg, 45, 'explicit reset still restores the canonical hero pose');
  assert.equal(orbit.debugState().dragging, false);
  shownSubject = new THREE.Group();
  dragElement.dispatchEvent(pointerEvent('wheel', { deltaY: -100 }));
  advance(12);
  assert.ok(orbit.debugState().zoom < 0.95, 'late subject measurement preserves a newer wheel gesture');
  clockMs += 5100; // An idle watchdog paints rarely and clamps its update delta.
  shownSubject = new THREE.Group();
  advance(12);
  assert.ok(Math.abs(orbit.debugState().zoom - 1) < 0.001,
    'a later idle selection does not inherit stale zoom because the frame clock was parked');
  dragElement.dispatchEvent(pointerEvent('pointerdown', { button: 0, pointerId: 3 }));
  dragElement.dispatchEvent(pointerEvent('pointermove', { pointerId: 3, movementX: 100, movementY: 0 }));
  advance(3);
  orbit.stop();
  orbit.start();
  assert.equal(orbit.debugState().yawDeg, 45, 'stop/start retains explicit canonical framing');
  } finally {
    orbit.dispose();
    if (performanceDescriptor) Object.defineProperty(globalThis, 'performance', performanceDescriptor);
    else delete globalThis.performance;
  }
}

// A touch screen (the iPad review, 2026-10-27): one finger turns the tank, a second pinches it without a turn or a flick,
// the finger left turns it again, and the dolly never winds past what the camera can reach.
{
  const touchElement = new FakeElement();
  const orbit = createGarageShowroomRuntime({
    camera, rig, element: touchElement,
    getSubject: () => subject,
    getStageRect: () => ({ x: 200, y: 100, w: 1_200, h: 700 }),
    heroYawRad: Math.PI / 4, heroPitchRad: 0.1,
    fixedFrame: () => ({ x: 0, y: 1.6, z: 0, hw: 2, hh: 1.4, hd: 5 }),
    floorY: () => 0,
  });
  const settle = (frames = 60) => { for (let frame = 0; frame < frames; frame++) orbit.update(1 / 60); };
  const touch = (type, pointerId, clientX, clientY) =>
    touchElement.dispatchEvent(pointerEvent(type, { button: 0, pointerId, clientX, clientY, pointerType: 'touch' }));
  try {
    orbit.start();
    settle();
    touch('pointerdown', 1, 500, 400);
    touch('pointermove', 1, 540, 400);
    settle(30);
    const turned = orbit.debugState().yawDeg;
    assert.ok(turned < 44, `a finger's client travel turns the tank (no movementX on iOS touch): ${turned}`);
    touch('pointerdown', 2, 700, 400);
    assert.equal(orbit.debugState().dragging, false, 'a second finger ends the turn');
    touch('pointermove', 1, 400, 400);
    touch('pointermove', 2, 800, 400); // the spread 160 -> 400 px
    settle();
    const pinched = orbit.debugState();
    assert.ok(Math.abs(pinched.yawDeg - turned) < 0.5, `a pinch never turns the tank (${turned} -> ${pinched.yawDeg})`);
    assert.ok(pinched.zoom < 0.95, `fingers spread apart bring the tank closer: zoom ${pinched.zoom}`);
    touch('pointerup', 2, 800, 400);
    assert.equal(orbit.debugState().dragging, true, 'the finger left after a pinch turns the tank again');
    touch('pointermove', 1, 360, 400);
    settle(10);
    assert.ok(orbit.debugState().yawDeg > pinched.yawDeg + 1, 'and turns it from where it rests');
    touch('pointerup', 1, 360, 400);
    // the dolly's ends: twenty notches out, then one in, moves the camera at once (no target wound past the bay's reach)
    for (let notch = 0; notch < 20; notch++) touchElement.dispatchEvent(pointerEvent('wheel', { deltaY: 100 }));
    settle();
    const out = orbit.debugState().zoom;
    touchElement.dispatchEvent(pointerEvent('wheel', { deltaY: -100 }));
    settle();
    assert.ok(orbit.debugState().zoom < out - 0.01, `one notch in after the far end moves the camera (${out} -> ${orbit.debugState().zoom})`);
    for (let notch = 0; notch < 40; notch++) touchElement.dispatchEvent(pointerEvent('wheel', { deltaY: -100 }));
    settle();
    const near = orbit.debugState().zoom;
    assert.ok(near >= 0.45 - 1e-6, `the closest dolly keeps its floor: ${near}`);
    touchElement.dispatchEvent(pointerEvent('wheel', { deltaY: 100 }));
    settle();
    assert.ok(orbit.debugState().zoom > near + 0.01, 'one notch out after the near end moves the camera at once');
  } finally {
    orbit.dispose();
  }
}

console.log('garageShowroomRuntime.selftest: typed phase, pointer, touch pinch, wheel, dolly reach, and disposal ownership pass');
