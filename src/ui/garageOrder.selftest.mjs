import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  compareCountryThenTierThenName, countryFilterGroups, defaultGarageMapId,
  GARAGE_FINAL_VEHICLE_IDS, horizontalRailState, horizontalRailWheelDelta,
  topCountrySpec,
} from './garageOrder.ts';

const garageSource = `${await readFile(new URL('./garage.ts', import.meta.url), 'utf8')}\n${
  await readFile(new URL('./garage.css', import.meta.url), 'utf8')
}`;

assert.match(garageSource,
  /\.cot-card \.ti\{[^}]*width:140px;height:88px;[^}]*--cot-thumb-scale,1\.22[^}]*\}/,
  'every garage vehicle card lifts and enlarges its shared tank portrait');
assert.match(garageSource,
  /body\[data-cot-panels='overlay'\] \.cot-card \.ti\{[^}]*width:98px;height:52px;[^}]*--cot-thumb-scale,1\.2[^}]*\}/,
  'compact garage cards preserve the lifted, enlarged portrait treatment');
assert.match(garageSource,
  /\.cot-card \.ti\{[^}]*opacity:0;[^}]*\}[\s\S]*?\.cot-card \.ti\[data-cot-portrait-framed='true'\]\{opacity:1;\}/,
  'tank portraits remain hidden until their final centered frame is applied');
assert.match(garageSource,
  /\.cot-card \.nm\{position:absolute;left:10px;right:10px;bottom:8px;/,
  'tank titles use the card padding as a stable bottom inset');
assert.match(garageSource,
  /const reopening = !firstPresentation && !api\.isOpen;[\s\S]*?if \(reopening\) \{[\s\S]*?classList\.add\('enter'\)/,
  'Garage entrance motion is reserved for later reopens instead of replaying under first boot');
assert.match(garageSource,
  /\.cot-garage\.awaiting-boot\{visibility:hidden;\}/,
  'first-visit Garage construction stays hidden until the boot surface begins its fade');
assert.match(garageSource, /document\.addEventListener\('cot:boot-dismiss'/,
  'Garage listens for the boot fade before revealing first-visit chrome');
assert.match(garageSource,
  /class="card-era">\$\{vehicleEraLabel\(s\.era, \{ short: true \}\)\}<\/span>/,
  'garage cards show the canonical vehicle era in their top-right metadata slot');
assert.doesNotMatch(garageSource,
  /class="designation">\$\{s\.markings\?\.designation/,
  'garage cards do not expose technical marking identifiers as UI metadata');

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

const usTopRun = [
  { id: 'm1a3', nation: 'USA', name: 'M1A3 Abrams' },
  { id: 'm1a2_tusk', nation: 'USA', name: 'M1A2 Abrams TUSK' },
  { id: 'm551a1_tts', nation: 'USA', name: 'M551A1 TTS' },
  { id: 'm3a3_bradley', nation: 'USA', name: 'M3A3 Bradley CFV' },
  { id: 'm1a2_sepv3', nation: 'USA', name: 'M1A2 Abrams SEP v3' },
];
const topRunTierOf = () => 10;
const sortedUsTopRun = usTopRun.sort((a, b) => (
  compareCountryThenTierThenName(a, b, rank, topRunTierOf)
));
assert.deepEqual(
  sortedUsTopRun.slice(-4).map((card) => card.id),
  GARAGE_FINAL_VEHICLE_IDS,
  'the U.S. far-right showcase run is Bradley, M551A1 TTS, TUSK, then M1A3',
);
assert.equal(
  topCountrySpec(sortedUsTopRun, 'us', () => 'us')?.id,
  'm1a3',
  'nation entry selects the top tank at the far-right end of its sorted fleet',
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
assert.match(garageSource, /const top = topCountrySpec\(specs, group\.id, countryCodeOf\);[\s\S]*?api\.setSelected\(top\.id\);/,
  'nation chips always move selection to the highest-tier end of the chosen fleet');
assert.match(garageSource,
  /card\.scrollIntoView\(\{ block: 'nearest', inline: 'center', behavior: 'auto' \}\);/,
  'vehicle selection reveals distant cards immediately instead of sweeping across the carousel');
assert.match(garageSource,
  /\.cot-cards\{[^}]*padding:8px 8px 0;[^}]*scroll-padding-inline:8px;/,
  'vehicle rails keep selected end cards inset from their clipping edges');
assert.match(garageSource,
  /body\[data-cot-width='laptop'\] \.cot-header-nav \.cot-garage-variant-trigger\{[^}]*width:34px;min-width:34px;max-width:34px;[^}]*\}/,
  'laptop headers collapse the workshop picker to the same compact footprint as adjacent icon controls');
assert.match(garageSource,
  /body\[data-cot-width='laptop'\] \.cot-garage-variant-trigger \.cot-garage-variant-label\{display:none;\}/,
  'compact workshop controls keep only their environment icon and dropdown indicator');
assert.doesNotMatch(garageSource, /\.cot-dossier-head\{[^}]*border-top:/,
  'the vehicle dossier header uses one consistent neutral border');
assert.doesNotMatch(garageSource, /\.cot-stat-section::before\{/,
  'dossier sections do not draw stray orange rules across their top edges');
assert.match(garageSource,
  /cot-technical-section[\s\S]*?cot-dossier-head[\s\S]*?role="tablist"[\s\S]*?data-technical-image/,
  'vehicle identity and generated technical diagrams share one garage dossier card');
assert.doesNotMatch(garageSource,
  /statSectionTitle\('gallery', 'Technical schematics'/,
  'the merged dossier does not repeat a technical-schematics header');
assert.doesNotMatch(garageSource,
  /cot-dossier-head[\s\S]*?Open in Tank Gallery/,
  'the vehicle header does not duplicate the technical Gallery action');
assert.match(garageSource,
  /class="cot-gallery-link cot-technical-gallery"[\s\S]*?Inspect in Gallery[\s\S]*?class="go"/,
  'the layer-specific Gallery action reuses the primary orange-accent CTA treatment');
assert.match(garageSource,
  /\['ArrowLeft', 'ArrowRight', 'Home', 'End'\][\s\S]*?activateTechnicalTab/,
  'technical schematic tabs support standard keyboard navigation');
assert.match(garageSource,
  /\.cot-technical-figure img\{[^}]*aspect-ratio:2\/1;[^}]*object-fit:contain;/,
  'technical diagrams preserve their authored two-to-one frame at every dossier width');
assert.match(garageSource,
  /data-technical-expand[^]*?aria-haspopup="dialog"[^]*?aria-controls="cot-technical-viewer-dialog"/,
  'every compact technical diagram exposes an accessible expanded-view trigger');
assert.match(garageSource,
  /createModal\(\{[^]*?className: 'cot-technical-viewer'[^]*?data-technical-modal-view/,
  'the expanded schematic reuses the shared accessible modal and all three technical views');
assert.match(garageSource,
  /cot-technical-viewer-figure img\{[^}]*aspect-ratio:2\/1;[^}]*object-fit:contain;/,
  'expanded schematics preserve the authored two-to-one frame instead of cropping the diagram');
await import('./topAccentBorders.selftest.mjs');

console.log('garageOrder.selftest: ordering, map default, filters and hidden horizontal rail verified');
