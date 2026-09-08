import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const garageTs = await readFile(new URL('./garage.ts', import.meta.url), 'utf8');
const garageCss = await readFile(new URL('./garage.css', import.meta.url), 'utf8');

const headerStart = garageTs.indexOf('<div class="cot-brand-utilities cot-header-nav"');
const headerEnd = garageTs.indexOf('<nav class="cot-nav cot-header-nav"', headerStart);
assert.ok(headerStart >= 0 && headerEnd > headerStart, 'garage header markup remains identifiable');
assert.doesNotMatch(garageTs.slice(headerStart, headerEnd), /cot-garage-variant-trigger/,
  'staging selection does not consume space in the primary header');

assert.match(garageTs,
  /<div class="cot-leftcol">` \+\s*`<div class="cot-garage-variant-control">` \+[\s\S]*?<div class="cot-maps"/,
  'the staging selector sits immediately above Battlefield in the setup rail');
assert.match(garageTs,
  /class="cot-garage-variant-trigger-thumb"[\s\S]*?class="cot-garage-variant-label"/,
  'the closed selector includes its selected staging image and garage name');
assert.doesNotMatch(garageTs,
  /class="cot-garage-variant-location"/,
  'the closed selector does not repeat the underlying battlefield name');
assert.match(garageTs,
  /class="cot-garage-variant-action"[\s\S]*?garage\.setup\.change/,
  'the closed selector exposes a visible localized change affordance');
assert.match(garageTs,
  /garageVariantLabel\.textContent = variantDisplayName;[\s\S]*?garageVariantThumb\.src = selected\.thumb \|\| selected\.hero \|\| '';/,
  'selection changes synchronize the closed selector preview');
assert.match(garageTs,
  /image\.loading = 'lazy';[\s\S]*?garageVariantMenu\.appendChild\(button\);/,
  'the full staging gallery keeps its preview images lazy-loaded');

assert.match(garageCss,
  /\.cot-garage-variant-menu\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\);/,
  'desktop opens an image-rich two-column staging gallery');
assert.match(garageCss,
  /\.cot-garage-variant-trigger-thumb\{position:absolute;[^}]*inset:0;[^}]*width:100%;height:100%;[^}]*object-fit:cover;/,
  'the selected battlefield preview fills the staging control instead of reading as a tiny thumbnail');
assert.match(garageCss,
  /\.cot-garage-variant-trigger::before\{[^}]*linear-gradient/,
  'the staging control layers a legibility scrim over its preview');
assert.doesNotMatch(garageCss,
  /\.cot-garage-variant-trigger::after/,
  'the staging control avoids a redundant left-side accent rail');
assert.match(garageCss,
  /\.cot-garage-variant-trigger\{[^}]*border:1px solid rgba\(146,164,180,\.16\)/,
  'the staging control uses the same neutral border color as the setup panels');
assert.match(garageCss,
  /body\[data-cot-width='compact'\] \.cot-garage-variant-menu,[\s\S]*?grid-template-columns:1fr;/,
  'compact screens retain the existing single-column staging gallery');
assert.match(garageCss,
  /\.cot-garage \.title\{[^}]*letter-spacing:\.18em;/,
  'the desktop CLAUDE OF TANKS wordmark uses slightly tighter tracking');

console.log('garageVariantPicker.selftest: ok');
