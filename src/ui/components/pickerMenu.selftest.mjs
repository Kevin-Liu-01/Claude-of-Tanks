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
assert.equal(placeMenu(trigger(100, 200, 400), view, 300, false).width, 400, "the trigger's width up to 480");
assert.equal(placeMenu(trigger(100, 200, 900), view, 300, false).width, 900, 'never narrower than its trigger: a wider trigger sets the width');

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

// (261) a narrow panel with its sides (a readout column, a dossier) is spanned: the menu stands across its inner width, below
// the trigger to the panel's foot with no 420 px cap (its list fades there), so no sliver of the panel's labels shows beside it
spot = placeMenu(trigger(1020, 161, 165, 32), { width: 1280, height: 800 }, 1000, false, false, { top: 149, bottom: 563, left: 939, right: 1257 });
assert.equal(spot.span, true, 'a 318 px column is spanned');
assert.equal(spot.left, 939, "flush with the column's inner box (its room is inside its rule)");
assert.equal(spot.width, 1257 - 939, "the column's inner width");
assert.equal(spot.maxHeight, 563 - 193 - 4, "to the column's foot, past the 420 px cap's place");
// a dossier whose trigger stands near its foot: the spanning menu stands above it, up to the panel's top
spot = placeMenu(trigger(1080, 680, 340, 36), { width: 1440, height: 900 }, 4000, false, false, { top: 64, bottom: 820, left: 1040, right: 1440 });
assert.equal(spot.above, true);
assert.equal(spot.maxHeight, 680 - 4 - 64, "up to the dossier's top");
// a wide panel is not spanned: the trigger's width, inside the panel's sides
spot = placeMenu(trigger(1200, 200, 300), view, 300, false, false, { top: 100, bottom: 800, left: 600, right: 1360 });
assert.equal(spot.span, false);
assert.equal(spot.width, 300);
assert.equal(spot.left + spot.width, 1360 - 8, "its right edge inside the panel's");
// a panel that asks to be spanned is spanned at any width (the Gallery dossier at 2560), its ring kept on the window
spot = placeMenu(trigger(1820, 760, 700, 36), { width: 2560, height: 1440 }, 4000, false, false, { top: 65, bottom: 1440, left: 1793, right: 2560, span: true });
assert.equal(spot.span, true, 'a 767 px dossier that asks is spanned');
assert.equal(spot.left, 1793);
assert.equal(spot.left + spot.width, 2559, "its ring on the window's last column");

// a fine pointer on a narrow window keeps the popover; a coarse one on a wide window too
assert.equal(placeMenu(trigger(20, 300, 200), { width: 390, height: 844 }, 400, false).sheet, false);
assert.equal(placeMenu(trigger(20, 300, 200), { width: 1024, height: 768 }, 400, true).sheet, false);

console.log('pickerMenu.selftest: placement under, above, clamped and as a sheet PASS');
