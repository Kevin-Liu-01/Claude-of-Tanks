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

// a phone gets a bottom sheet across the window
spot = placeMenu(trigger(20, 300, 200), { width: 390, height: 844 }, 400, true);
assert.equal(spot.sheet, true);
assert.equal(spot.left, 0);
assert.equal(spot.width, 390);
assert.equal(spot.top, 844 - 400, 'its foot on the window foot');
// a fine pointer on a narrow window keeps the popover; a coarse one on a wide window too
assert.equal(placeMenu(trigger(20, 300, 200), { width: 390, height: 844 }, 400, false).sheet, false);
assert.equal(placeMenu(trigger(20, 300, 200), { width: 1024, height: 768 }, 400, true).sheet, false);

console.log('pickerMenu.selftest: placement under, above, clamped and as a sheet PASS');
