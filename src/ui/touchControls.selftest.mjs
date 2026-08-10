import { createReleaseFireGesture } from './touchControls.js';

let fired = 0;
let cancelled = 0;
const aim = [];
const gesture = createReleaseFireGesture({
  onAim: (dx, dy) => aim.push([dx, dy]),
  onFire: () => { fired += 1; },
  onCancel: () => { cancelled += 1; },
  isCancelPoint: (x, y) => x >= 200 && y >= 50,
});
if (gesture.end(null, 0, 0) || gesture.cancel()) throw new Error('idle gesture produced a terminal edge');

// Landing wobble is swallowed, an intentional drag aims, and neither the
// press nor the held interval fires. The release is the sole fire edge.
if (!gesture.begin(7, 100, 100)) throw new Error('first fire pointer did not arm');
gesture.move(7, 105, 103);
if (aim.length || fired) throw new Error('fire deadzone produced aim/fire');
if (gesture.begin(8, 0, 0)) throw new Error('second fire pointer stole the gesture');
if (gesture.end(8, 0, 0)) throw new Error('foreign pointer ended the gesture');
gesture.move(7, 122, 108);
if (!gesture.getState().dragging || aim.length !== 1) throw new Error('intentional fire drag did not aim');
gesture.end(7, 130, 110);
if (fired !== 1 || gesture.getState().active) throw new Error('release did not fire exactly once');

// A simple tap remains quick-fire, but still fires on lift rather than down.
gesture.begin(9, 80, 80);
if (fired !== 1) throw new Error('tap fired on pointerdown');
gesture.end(9, 80, 80);
if (fired !== 2) throw new Error('tap did not fire on pointerup');

// The visible cancel target and all platform interruption paths are no-fire.
gesture.begin(10, 100, 100);
gesture.move(10, 210, 70);
if (!gesture.getState().cancelHot) throw new Error('cancel target did not arm');
gesture.end(10, 210, 70);
if (fired !== 2 || cancelled !== 1) throw new Error('cancel target fired a shot');
gesture.begin(11, 100, 100);
gesture.cancel(11);
if (fired !== 2 || cancelled !== 2) throw new Error('pointer cancellation fired a shot');

console.log('touchControls release-fire selftest passed');
