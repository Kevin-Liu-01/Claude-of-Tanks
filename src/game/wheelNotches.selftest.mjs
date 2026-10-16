import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PINCH_GAIN, WHEEL_DOLLY_MAX_UNITS, WHEEL_GESTURE_GAP_MS, WHEEL_NOTCH_PX, createWheelNotcher, wheelDeltaPx,
  wheelDollyFactor, wheelNotchUnits,
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
// a continuous dolly (the Studio orbit): one click is exactly the old 12 % step; a pinch glides a bounded distance
{
  const close = 1e-12;
  assert.ok(Math.abs(wheelDollyFactor(wheelNotchUnits({ deltaY: 100 }), 0.12) - 1.12) < close, 'a click out is one 12 % notch');
  assert.ok(Math.abs(wheelDollyFactor(wheelNotchUnits({ deltaY: -100 }), 0.12) - 0.88) < close, 'a click in is one 12 % notch');
  assert.equal(wheelDollyFactor(0, 0.12), 1, 'a sideways swipe (deltaY 0) does not dolly');
  assert.equal(wheelDollyFactor(Number.NaN, 0.12), 1);
  assert.equal(wheelDollyFactor(40, 0.12), Math.pow(1.12, WHEEL_DOLLY_MAX_UNITS), 'a flung wheel is clamped per event');
  let distance = 40;
  for (let i = 0; i < 30; i++) distance *= wheelDollyFactor(wheelNotchUnits({ deltaY: -5, ctrlKey: true }), 0.12);
  // per-event stepping took 40 m to 40 x 0.88^30 = 0.86 m (the 3 m clamp); by travel it is 40 x 0.88^3.75
  assert.ok(Math.abs(distance - 40 * Math.pow(0.88, 30 * 5 / WHEEL_NOTCH_PX * PINCH_GAIN)) < 1e-9);
  assert.ok(distance > 20, `one ordinary pinch dollies a bounded distance (40 m -> ${distance.toFixed(1)} m)`);
}
// every camera zoom consumer reads the shared model (the Studio was missed on 2026-09-19)
{
  const studio = readFileSync(new URL('./studio.ts', import.meta.url), 'utf8');
  const onWheel = studio.slice(studio.indexOf('function onWheel(e: WheelEvent)'), studio.indexOf('function typingInUI('));
  assert.match(onWheel, /wheelNotchUnits\(e\)/, 'the Studio camera follows the distance scrolled');
  assert.match(onWheel, /wheelDollyFactor\(units, 0\.12\)/, 'the Studio orbit keeps its 12 % notch');
  assert.doesNotMatch(onWheel, /e\.deltaY < 0 \? 1 : -1/, 'no per-event zoom step remains');
}
console.log('wheelNotches.selftest: mouse clicks, trackpad scrolls and pinches map to the same notch scale');
