import assert from 'node:assert/strict';
import { placeMenu } from './pickerMenu.ts';

// The picker menu's placement (INTERACTION-REDESIGN.md, "The picker menu"): under the trigger, or above it when the room
// below is short and the room above is larger; as wide as the trigger within 280-480 px and inside the window; at most
// min(60 % of the window, 420 px) tall; a coarse pointer on a window under 520 px wide gets a bottom sheet.

const view = { width: 1440, height: 900 };
const trigger = (left, top, width, height = 36) => ({ left, top, bottom: top + height, width });

// under the trigger, its width
let spot = placeMenu(trigger(100, 200, 320), view, 300, false);
assert.equal(spot.sheet, false);
assert.equal(spot.above, false);
assert.equal(spot.top, 200 + 36 + 4, 'under the trigger, with its gap');
assert.equal(spot.left, 100);
assert.equal(spot.width, 320, "the trigger's width");
assert.equal(spot.maxHeight, 420, 'min(60 % of 900, 420)');

// the width's bounds
assert.equal(placeMenu(trigger(100, 200, 120), view, 300, false).width, 280, 'never narrower than 280');
assert.equal(placeMenu(trigger(100, 200, 900), view, 300, false).width, 480, 'never wider than 480');

// a set of picture cards takes the widest room (its pictures two abreast), still inside the window
assert.equal(placeMenu(trigger(100, 200, 300), view, 300, false, true).width, 480, 'cards: the widest room');
assert.equal(placeMenu(trigger(20, 200, 300), { width: 420, height: 800 }, 300, false, true).width, 420 - 16, 'cards: inside a narrow window');
// picture cards stand two rows tall (a 183 px battlefield card held one row under 420 px): 520 px where the window has it
assert.equal(placeMenu(trigger(1500, 860, 32), { width: 1920, height: 1080 }, 1600, false, true).maxHeight, 520, 'cards: min(60 % of 1080, 520)');
assert.equal(placeMenu(trigger(1500, 860, 32), { width: 1920, height: 1080 }, 1600, false, false).maxHeight, 420, 'a list keeps 420');
assert.equal(placeMenu(trigger(1500, 560, 32), { width: 1440, height: 800 }, 1600, false, true).maxHeight, 480, 'cards: min(60 % of 800, 520)');

// inside the window: a trigger at the right edge moves the menu in
spot = placeMenu(trigger(1300, 200, 120), view, 300, false);
assert.equal(spot.left + spot.width, 1440 - 8, 'its right edge stays 8 px inside the window');

// flipped above when the room below is short and the room above is larger
spot = placeMenu(trigger(100, 760, 320), view, 360, false);
assert.equal(spot.above, true);
assert.equal(spot.top, 760 - 4 - 360, 'its foot sits the gap above the trigger');
assert.ok(spot.maxHeight <= 420 && spot.maxHeight >= 360);
// a short menu that fits below stays below, even near the foot
assert.equal(placeMenu(trigger(100, 760, 320), view, 80, false).above, false);

// a short window: the cap is 60 % of it, and the side's room caps it further
spot = placeMenu(trigger(100, 40, 320), { width: 1024, height: 600 }, 500, false);
assert.equal(spot.above, false);
assert.equal(spot.maxHeight, 360, 'min(60 % of 600, 420, the room below)');

// a room with sides is spanned: the menu takes its width and its left edge, past the 480 px cap
spot = placeMenu(trigger(160, 600, 330), { width: 2560, height: 1440 }, 300, false, false, { top: 72, bottom: 1300, left: 140, right: 700 });
assert.equal(spot.width, 560, 'the room\'s width');
assert.equal(spot.left, 140, 'the room\'s left edge');
// a room against the window's right edge keeps its edge (no window margin pushes it left)
spot = placeMenu(trigger(1050, 600, 330), { width: 1440, height: 900 }, 300, false, false, { top: 72, bottom: 860, left: 1038, right: 1440 });
assert.deepEqual([spot.left, spot.width], [1038, 402], 'the room\'s edges, flush with the window');
// a filling room is covered from the trigger to its foot whatever the rows need, past the 420 px cap (the r26 critic: the
// Garage readout's rows cut under the rival menu)
spot = placeMenu(trigger(160, 600, 330), { width: 2560, height: 1440 }, 200, false, false, { top: 72, bottom: 1300, left: 140, right: 700, fill: true });
assert.equal(spot.above, false, 'a filling menu still opens below with room there');
assert.deepEqual([spot.top, spot.maxHeight], [640, 660], 'from under the trigger (636 + 4) to the room\'s foot itself (1300), past the 420 px cap');

// a phone gets a bottom sheet across the window
spot = placeMenu(trigger(20, 300, 200), { width: 390, height: 844 }, 400, true);
assert.equal(spot.sheet, true);
assert.equal(spot.left, 0);
assert.equal(spot.width, 390);
assert.equal(spot.top, 844 - 400, 'its foot on the window foot');
// a coarse pointer on a short window (a phone on its side) gets the sheet too, leaving a strip of the window above it
spot = placeMenu(trigger(500, 200, 200), { width: 844, height: 390 }, 600, true);
assert.equal(spot.sheet, true);
assert.equal(spot.width, 844);
assert.equal(spot.maxHeight, 390 - 48, 'a short window: all but its top strip');

// the room is the trigger's panel when it has one: under the trigger to the panel's foot, never over the page's header
spot = placeMenu(trigger(100, 500, 300), { width: 1280, height: 720 }, 900, false, false, { top: 120, bottom: 660 });
assert.equal(spot.above, true, 'more room above the trigger inside the panel');
assert.equal(spot.maxHeight, 500 - 4 - 8 - 120, "the room above, inside the panel's top");
assert.ok(spot.top >= 120, "it never runs over the panel's top");
spot = placeMenu(trigger(100, 160, 300), { width: 1024, height: 600 }, 900, false, false, { top: 86, bottom: 435 });
assert.equal(spot.above, false);
assert.equal(spot.maxHeight, 435 - 196 - 4 - 8, "the room below, inside the panel's foot");

// a fine pointer on a narrow window keeps the popover; a coarse one on a wide window too
assert.equal(placeMenu(trigger(20, 300, 200), { width: 390, height: 844 }, 400, false).sheet, false);
assert.equal(placeMenu(trigger(20, 300, 200), { width: 1024, height: 768 }, 400, true).sheet, false);

console.log('pickerMenu.selftest: placement under, above, clamped and as a sheet PASS');
