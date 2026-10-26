import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// The Garage staging area is the kit's picker menu (INTERACTION-REDESIGN C, "Garage staging area picker"): a trigger in the
// paint sheet's head showing the area's picture, name and place, and the kit picker's picture cards in its popover. No
// hand-rolled listbox, trigger or card stays.

const garageTs = await readFile(new URL('./garage.ts', import.meta.url), 'utf8');
const garageCss = await readFile(new URL('./garage.css', import.meta.url), 'utf8');
const showroomCss = await readFile(new URL('./showroom.css', import.meta.url), 'utf8');

const headerStart = garageTs.indexOf('<div class="cot-brand-rail">');
const headerEnd = garageTs.indexOf('<nav class="cot-nav cot-header-nav"', headerStart);
assert.ok(headerStart >= 0 && headerEnd > headerStart, 'garage header markup remains identifiable');
assert.doesNotMatch(garageTs.slice(headerStart, headerEnd), /cot-garage-variant-control/,
  'staging selection does not consume space in the primary header');

assert.match(garageTs,
  /<div class="cot-leftcol">` \+\s*`<div class="cot-drawer-heading">[^\n]+\n\s*`<div class="cot-garage-variant-control"><\/div>` \+\s*`<div class="cot-camos"/,
  'the staging choice sits in the paint sheet, immediately above its catalog');
assert.match(garageTs,
  /createPickerMenu\(garageVariantHost, \{\s*id: 'garage-staging',[\s\S]*?layout: 'cards',/,
  'the staging choice is the kit picker menu, registered as garage-staging, over picture cards');
assert.match(garageTs,
  /facts: \[variantPlace\(variant\)\][\s\S]*?media: \{ poster: picture \}/,
  "each card and the trigger show the area's picture, its name and its place");
assert.match(garageTs, /onPreview: \(item\) => \{\s*if \(item\) try \{ opts\.onGarageVariantIntent\?\.\(item\.id\)/,
  'pointing at a card warms its scene');
assert.match(garageTs, /openGarageVariantMenu\(mobileNavTrigger\)/,
  "a phone's menu opens the staging choice anchored to its own trigger (the sheet's column is hidden there)");
assert.doesNotMatch(garageTs, /cot-garage-variant-(?:menu|card|trigger)|role="listbox" data-heading/,
  'no hand-rolled staging listbox, trigger or card remains');
assert.doesNotMatch(garageCss, /\.cot-garage-variant-(?:menu|card|trigger)/,
  "the bespoke staging styles left with the bespoke control");
assert.match(showroomCss, /@container sheet \(width < 640px\)\{\s*\.cot-garage-variant-control \.cot-c-menu__fact\{display:none;\}/,
  "a narrow sheet drops the area's place and keeps its name");
assert.doesNotMatch(garageCss, /\.cot-wordmark \.wm\[lang=en\]/,
  'the Claude of Tanks wordmark is the outlined master (brandWordmark.ts): it tracks the same in every locale');

console.log('garageVariantPicker.selftest: ok');
