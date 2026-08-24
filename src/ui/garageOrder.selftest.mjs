import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  compareCountryThenTierThenName, countryFilterGroups, defaultGarageMapId,
  horizontalRailState, horizontalRailWheelDelta,
} from './garageOrder.js';

const garageSource = await readFile(new URL('./garage.js', import.meta.url), 'utf8');

const rank = new Map([
  ['USA', 0], ['USSR', 1], ['USSR/Russia', 1], ['Russia', 1], ['UK', 2],
]);
const tiers = new Map([
  ['challenger', 8], ['t72bu', 8], ['m1a2', 10], ['t90', 9],
  ['t72b3m', 9], ['m1a1', 9],
]);
const tierOf = (id) => tiers.get(id) ?? 6;
const cards = [
  { id: 'challenger', nation: 'UK', name: 'Challenger' },
  { id: 't72bu', nation: 'USSR/Russia', name: 'T-72BU' },
  { id: 'm1a2', nation: 'USA', name: 'M1A2 Abrams' },
  { id: 't90', nation: 'Russia', name: 'T-90' },
  { id: 't72b3m', nation: 'Russia', name: 'T-72B3M obr. 2022' },
  { id: 'm1a1', nation: 'USA', name: 'M1A1 Abrams' },
];

assert.deepEqual(
  cards.sort((a, b) => compareCountryThenTierThenName(a, b, rank, tierOf)).map((card) => card.id),
  ['m1a1', 'm1a2', 't72bu', 't72b3m', 't90', 'challenger'],
  'garage cards sort by country first, tier second and display name third',
);

const combinedEras = [
  { id: 'm1a2', nation: 'USA', era: 'modern' },
  { id: 'm4a3', nation: 'USA', era: 'ww2' },
  { id: 't90', nation: 'Russia', era: 'modern' },
  { id: 't34', nation: 'USSR', era: 'ww2' },
];
const countryCode = (spec) => spec.nation === 'USA' ? 'us' : 'ru';
assert.deepEqual(
  countryFilterGroups(combinedEras, countryCode).map(({ id, count }) => [id, count]),
  [['us', 2], ['ru', 2]],
  'country filters combine modern, Cold War and WWII vehicles under one flag',
);

assert.equal(defaultGarageMapId([
  { id: 'verdant' }, { id: 'desert' }, { id: 'random' },
]), 'random', 'garage defaults to random even when it is not the first card');
assert.equal(defaultGarageMapId([{ id: 'verdant' }]), 'verdant',
  'a caller without a random option keeps its first concrete map');

const duplicateNames = [
  { id: 'variant_b', nation: 'Russia', name: 'T-72' },
  { id: 'variant_a', nation: 'Russia', name: 'T-72' },
];
assert.deepEqual(
  duplicateNames.sort((a, b) => compareCountryThenTierThenName(a, b, rank, tierOf)).map((card) => card.id),
  ['variant_a', 'variant_b'],
  'duplicate display names use a deterministic id tie-break',
);

assert.deepEqual(horizontalRailState(0, 900, 400), {
  maxScroll: 500, hasLeft: false, hasRight: true,
}, 'country rail advertises only the right edge at its start');
assert.deepEqual(horizontalRailState(250, 900, 400), {
  maxScroll: 500, hasLeft: true, hasRight: true,
}, 'country rail advertises both edges in its middle');
assert.deepEqual(horizontalRailState(500, 900, 400), {
  maxScroll: 500, hasLeft: true, hasRight: false,
}, 'country rail advertises only the left edge at its end');
assert.deepEqual(horizontalRailState(20, 300, 400), {
  maxScroll: 0, hasLeft: false, hasRight: false,
}, 'a fitting country rail shows no false edge affordances');
assert.equal(horizontalRailWheelDelta(4, 60), 60,
  'vertical mouse-wheel motion pans the horizontal country rail');
assert.equal(horizontalRailWheelDelta(-38, 6), -38,
  'native horizontal trackpad motion keeps its direction and magnitude');
assert.equal(horizontalRailWheelDelta(0, 3, 1), 60,
  'line-mode wheel motion is normalized to useful pixels');
assert.match(garageSource,
  /\.cot-country-chips\{[^}]*overflow-x:auto;[^}]*scrollbar-width:none;[^}]*\}/,
  'country selection keeps horizontal scrolling without a visible Firefox scrollbar');
assert.match(garageSource, /\.cot-country-chips::\-webkit-scrollbar\{display:none;\}/,
  'country selection hides its Chromium and Safari scrollbar');
assert.match(garageSource,
  /\.cot-country-chips\{[^}]*justify-content:safe center;[^}]*width:100%;[^}]*overflow-x:auto;/,
  'the complete country list centers when it fits while retaining honest overflow');
assert.match(garageSource,
  /\.cot-country-edge\{position:relative;[^}]*width:26px;height:36px;/,
  'country overflow arrows use compact balanced gutters instead of looking like nation tiles');
assert.match(garageSource, /\.cot-country-rail\{[^}]*left:50%;[^}]*transform:translateX\(-50%\);/,
  'the desktop nation rail is centered on the Garage stage');
assert.doesNotMatch(garageSource, /\.cot-dossier-head\{[^}]*border-top:/,
  'the vehicle dossier header uses one consistent neutral border');
assert.doesNotMatch(garageSource, /\.cot-stat-section::before\{/,
  'dossier sections do not draw stray orange rules across their top edges');
await import('./topAccentBorders.selftest.mjs');

console.log('garageOrder.selftest: ordering, map default, filters and hidden horizontal rail verified');
