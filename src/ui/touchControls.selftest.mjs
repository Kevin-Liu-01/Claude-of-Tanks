import { createMobileFireGesture, nextQuickGraphicsPreset } from './touchControls.js';
import { MOBILE_PRESET_ORDER, PRESETS } from '../engine/quality.ts';

if (nextQuickGraphicsPreset('low') !== 'medium' ||
    nextQuickGraphicsPreset('ultra') !== 'low') {
  throw new Error('desktop quick graphics cycle is not closed');
}
if (nextQuickGraphicsPreset('mobile', true) !== 'mobile-high' ||
    nextQuickGraphicsPreset('mobile-high', true) !== 'mobile-low') {
  throw new Error('mobile quick graphics cycle is not closed');
}
for (const name of MOBILE_PRESET_ORDER) {
  const preset = PRESETS[name];
  if (!preset || preset.textureScale !== 0.5 || preset.textureCap !== 2048) {
    throw new Error(`${name} escaped the mobile texture budget`);
  }
}

let clock = 0;
let timerSeq = 0;
const timers = new Map();
const scheduleHold = (fn, ms) => {
  const id = ++timerSeq;
  timers.set(id, { at: clock + ms, fn });
  return id;
};
const cancelHold = (id) => timers.delete(id);
const advance = (ms) => {
  clock += ms;
  for (;;) {
    const due = [...timers.entries()]
      .filter(([, t]) => t.at <= clock)
      .sort((a, b) => a[1].at - b[1].at)[0];
    if (!due) break;
    timers.delete(due[0]);
    due[1].fn();
  }
};

let fired = 0;
let holdStarts = 0;
let holdEnds = 0;
let cancelled = 0;
const aim = [];
const gesture = createMobileFireGesture({
  onAim: (dx, dy) => aim.push([dx, dy]),
  onFire: () => { fired += 1; },
  onHoldStart: () => { holdStarts += 1; },
  onHoldEnd: () => { holdEnds += 1; },
  onCancel: () => { cancelled += 1; },
  isCancelPoint: (x, y) => x >= 200 && y >= 50,
  holdDelayMs: 320,
  scheduleHold,
  cancelHold,
});
if (gesture.end(null, 0, 0) || gesture.cancel()) throw new Error('idle gesture produced a terminal edge');

// Landing wobble is swallowed; an intentional quick drag aims and then fires
// once on release without ever entering held fire.
if (!gesture.begin(7, 100, 100)) throw new Error('first fire pointer did not arm');
advance(100);
gesture.move(7, 105, 103);
if (aim.length || fired || holdStarts) throw new Error('fire deadzone produced input');
if (gesture.begin(8, 0, 0)) throw new Error('second fire pointer stole the gesture');
if (gesture.end(8, 0, 0)) throw new Error('foreign pointer ended the gesture');
gesture.move(7, 122, 108);
if (!gesture.getState().dragging || aim.length !== 1) throw new Error('intentional fire drag did not aim');
gesture.end(7, 130, 110);
advance(500); // released gesture's cancelled timer must stay dead
if (fired !== 1 || holdStarts || gesture.getState().active) throw new Error('quick release contract failed');

// A simple tap remains quick-fire, but still fires on lift rather than down.
gesture.begin(9, 80, 80);
advance(120);
if (fired !== 1) throw new Error('tap fired on pointerdown');
gesture.end(9, 80, 80);
if (fired !== 2) throw new Error('tap did not fire on pointerup');

// Holding crosses into one real held-fire interval. Dragging keeps aiming;
// release ends the hold and must not append a second release shot.
gesture.begin(10, 100, 100);
advance(319);
if (holdStarts) throw new Error('auto fire began before the hold threshold');
advance(1);
if (holdStarts !== 1 || !gesture.getState().autoFiring) throw new Error('hold did not start auto fire');
gesture.move(10, 125, 90);
gesture.end(10, 130, 88);
if (holdEnds !== 1 || fired !== 2 || gesture.getState().autoFiring) {
  throw new Error('release did not stop auto fire cleanly');
}

// Entering the compact cancel target stops an active hold immediately and
// lifting there adds neither a held nor release shot.
gesture.begin(11, 100, 100);
advance(320);
gesture.move(11, 210, 70);
if (!gesture.getState().cancelHot || gesture.getState().autoFiring) {
  throw new Error('cancel target did not stop auto fire');
}
gesture.end(11, 210, 70);
if (holdStarts !== 2 || holdEnds !== 2 || fired !== 2 || cancelled !== 1) {
  throw new Error('cancel target emitted an extra shot');
}

// Platform interruption also releases a live held action with no shot edge.
gesture.begin(12, 100, 100);
advance(320);
gesture.cancel(12);
if (holdStarts !== 3 || holdEnds !== 3 || fired !== 2 || cancelled !== 2) {
  throw new Error('pointer cancellation left auto fire active');
}

console.log('touchControls hybrid fire selftest passed');
