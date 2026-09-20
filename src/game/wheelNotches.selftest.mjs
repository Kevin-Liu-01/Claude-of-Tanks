import assert from 'node:assert/strict';
import {
  PINCH_GAIN, WHEEL_GESTURE_GAP_MS, WHEEL_NOTCH_PX, createWheelNotcher, wheelDeltaPx, wheelNotchUnits,
} from './wheelNotches.ts';

// delta modes: a mouse click is one notch in every mode
assert.equal(wheelDeltaPx({ deltaY: 100, deltaMode: 0 }), 100);
assert.equal(wheelDeltaPx({ deltaY: 3, deltaMode: 1 }), 100);
assert.equal(wheelDeltaPx({ deltaY: 1, deltaMode: 2 }), 400);
assert.equal(wheelDeltaPx({ deltaY: Number.NaN }), 0);
assert.equal(wheelNotchUnits({ deltaY: -100 }), -1, 'a mouse click up is one notch');
assert.equal(wheelNotchUnits({ deltaY: -3, deltaMode: 1 }), -1, 'a line-mode click is one notch');
assert.equal(wheelNotchUnits({ deltaY: -8, ctrlKey: true }), -8 / WHEEL_NOTCH_PX * PINCH_GAIN, 'pinch units carry the pinch gain');

// a mouse wheel steps once per click, in either direction, at any pace
{
  const notcher = createWheelNotcher();
  assert.equal(notcher.push({ deltaY: -100 }, 0), -1);
  assert.equal(notcher.push({ deltaY: -100 }, 50), -1);
  assert.equal(notcher.push({ deltaY: 120 }, 100), 1, 'a 120-unit click (Windows) is still one notch');
  assert.equal(notcher.push({ deltaY: 120 }, 5000), 1, 'its 20-unit remainder is forgotten after the gesture gap');
}
// a trackpad two-finger scroll of many small events steps at the rate of the distance covered, not per event
{
  const notcher = createWheelNotcher();
  let notches = 0;
  for (let i = 0; i < 30; i++) notches += notcher.push({ deltaY: -7 }, i * 16);
  assert.equal(notches, -2, '30 events of 7 units (210 px) release two notches, not thirty');
}
// a trackpad pinch (ctrl+wheel, a few units per event) walks the ladder a few steps for a whole gesture
{
  const notcher = createWheelNotcher();
  let notches = 0;
  for (let i = 0; i < 24; i++) notches += notcher.push({ deltaY: -5, ctrlKey: true }, i * 16);
  assert.equal(notches, -3, `a 120-unit pinch releases ${Math.floor(120 / WHEEL_NOTCH_PX * PINCH_GAIN)} notches`);
  assert.equal(notcher.push({ deltaY: 5, ctrlKey: true }, 24 * 16), 0, 'reversing drops the carried remainder');
  let back = 0;
  for (let i = 0; i < 8; i++) back += notcher.push({ deltaY: 5, ctrlKey: true }, (25 + i) * 16);
  assert.equal(back, 1);
}
// idle gap forgets the remainder; reset clears it at once
{
  const notcher = createWheelNotcher();
  assert.equal(notcher.push({ deltaY: -60 }, 0), 0);
  assert.equal(notcher.push({ deltaY: -60 }, WHEEL_GESTURE_GAP_MS + 1), 0, 'a stale 60 does not join a fresh 60');
  assert.equal(notcher.push({ deltaY: -60 }, WHEEL_GESTURE_GAP_MS + 100), -1);
  notcher.reset();
  assert.equal(notcher.push({ deltaY: -60 }, WHEEL_GESTURE_GAP_MS + 200), 0);
}
console.log('wheelNotches.selftest: mouse clicks, trackpad scrolls and pinches map to the same notch scale');
