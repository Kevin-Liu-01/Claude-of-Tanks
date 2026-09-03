import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  compareCountryThenTierThenName, countryFilterGroups, createGarageCountrySelectionMemory,
  defaultGarageMapId, GARAGE_LEADING_VEHICLE_IDS, GARAGE_LEADING_VEHICLE_IDS_BY_NATION,
  horizontalRailState, horizontalRailWheelDelta,
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
  /\.cot-card \.ti\{[^}]*opacity:1;[^}]*\}/,
  'tank portraits paint immediately with a safe default frame while exact normalization idles');
assert.match(garageSource,
  /const cardsByCountry = new Map<string, HTMLElement\[\]>\(\);/,
  'nation switches update indexed card groups instead of rescanning the fleet');
assert.match(garageSource,
  /cardsEl\.animate\(\[\{ opacity: 0\.76 \}, \{ opacity: 1 \}\]/,
  'nation switches create one strip animation instead of one animation per vehicle');
assert.match(garageSource,
  /cardById\.get\(previousSelectedId\)\?\.classList\.remove\('sel'\);[\s\S]*?card\?\.classList\.add\('sel'\);/,
  'selection updates only the previous and next cards');
assert.match(garageSource, /shellAmmunitionCapacity\(shell\).*carried/,
  'the dossier exposes authoritative per-channel ammunition capacity');
assert.match(garageSource,
  /technicalSection \+\s*equipmentSection \+\s*`<section class="cot-stat-section">\$\{statSectionTitle\('speed', 'Performance'/,
  'the persistent equipment loadout appears above primary performance instead of below the dossier fold');
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
  /class="card-era">\$\{vehicleEraLabel\((?:s|spec)\.era, \{ short: true \}\)\}<\/span>/,
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
  ['m1a2', 'm1a1', 't90', 't72b3m', 't72bu', 'challenger'],
  'garage cards sort by country first, then descending tier and display name',
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
  sortedUsTopRun.slice(0, 4).map((card) => card.id),
  GARAGE_LEADING_VEHICLE_IDS_BY_NATION.USA,
  'the U.S. left edge leads with M1A3, TUSK, M551A1 TTS, then Bradley',
);

const nationalShowcaseCases = [
  {
    nation: 'Japan', filler: 'type90a',
    expected: ['type10b', 'type10', 'type89_light_tiger'],
  },
  {
    nation: 'Sweden', filler: 'cv90',
    expected: ['strv122', 'strv103', 'cv90_mkiv'],
  },
  {
    nation: 'Germany', filler: 'leo2a6',
    expected: [
      'kf51b', 'kf51', 'leo2a7v', 'leo2a5_a5nl', 'leo2a5',
      'leo2a6m', 'mbt70', 'leo2_revolution', 'spz_puma_s1',
    ],
  },
  {
    nation: 'China', filler: 'type99a',
    expected: ['vt4a1', 'ztz99a2', 'ztz99a2_prototype'],
  },
];

for (const { nation, filler, expected } of nationalShowcaseCases) {
  assert.deepEqual(
    GARAGE_LEADING_VEHICLE_IDS_BY_NATION[nation],
    expected,
    `${nation} publishes its reversed owner-directed left-edge run`,
  );
  const shuffled = [
    { id: expected.at(-1), nation, name: expected.at(-1) },
    { id: filler, nation, name: filler },
    ...expected.slice(0, -1).reverse().map((id) => ({ id, nation, name: id })),
  ];
  const sorted = shuffled.sort((a, b) => (
    compareCountryThenTierThenName(a, b, rank, () => 10)
  ));
  assert.deepEqual(
    sorted.slice(0, expected.length).map((card) => card.id),
    expected,
    `${nation} keeps its requested hero tanks in exact reversed left-edge order`,
  );
}

assert.equal(
  new Set(GARAGE_LEADING_VEHICLE_IDS).size,
  GARAGE_LEADING_VEHICLE_IDS.length,
  'national showcase runs do not duplicate a tank across countries',
);

assert.deepEqual(
  [
    { id: 'leo2a5', nation: 'Germany', name: 'Leopard 2A5' },
    { id: 'spz_puma_s1', nation: 'Germany', name: 'Puma S1' },
    { id: 'kf51b', nation: 'Germany', name: 'KF51B' },
  ].sort((a, b) => compareCountryThenTierThenName(
    a, b, rank, (id) => id === 'leo2a5' ? 9 : 10,
  )).map((spec) => spec.id),
  ['kf51b', 'spz_puma_s1', 'leo2a5'],
  'descending tier remains authoritative even when a lower-tier tank belongs to a hero run',
);

let storedSelections = null;
const selectionStorage = {
  getItem: () => storedSelections,
  setItem: (_key, value) => { storedSelections = value; },
};
const selectionSpecs = [
  { id: 'jp_left', nation: 'Japan' },
  { id: 'jp_other', nation: 'Japan' },
  { id: 'se_left', nation: 'Sweden' },
];
const selectionCountryCode = (spec) => spec.nation === 'Japan' ? 'jp' : 'se';
const selectionMemory = createGarageCountrySelectionMemory(
  selectionSpecs, selectionCountryCode, { getStorage: () => selectionStorage },
);
assert.equal(selectionMemory.preferredSpec('jp')?.id, 'jp_left',
  'a nation without history defaults to its leftmost sorted vehicle');
assert.equal(selectionMemory.remember('jp_other'), true,
  'a visible vehicle can become its nation-specific remembered choice');
assert.deepEqual(JSON.parse(storedSelections), { jp: 'jp_other' },
  'nation-specific selection is persisted without changing other nations');
const restoredSelectionMemory = createGarageCountrySelectionMemory(
  selectionSpecs, selectionCountryCode, { getStorage: () => selectionStorage },
);
assert.equal(restoredSelectionMemory.preferredSpec('jp')?.id, 'jp_other',
  'a later Garage restores the last selected vehicle for that nation');
assert.equal(restoredSelectionMemory.preferredSpec('se')?.id, 'se_left',
  'an unvisited nation still opens at its independent left edge');

storedSelections = JSON.stringify({ jp: 'se_left', se: 'missing' });
const invalidSelectionMemory = createGarageCountrySelectionMemory(
  selectionSpecs, selectionCountryCode, { getStorage: () => selectionStorage },
);
assert.equal(invalidSelectionMemory.preferredSpec('jp')?.id, 'jp_left',
  'cross-country stored ids are rejected instead of leaking selection between nations');
assert.equal(invalidSelectionMemory.preferredSpec('se')?.id, 'se_left',
  'stale stored ids safely fall back to the current leftmost vehicle');

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
  ['variant_b', 'variant_a'],
  'duplicate display names use a deterministic reversed id tie-break',
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
assert.match(garageSource,
  /const preferred = countrySelection\.preferredSpec\(group\.id\);[\s\S]*?api\.setSelected\(preferred\.id\);/,
  'nation chips restore their remembered tank or choose the highest-tier left edge');
assert.match(garageSource, /if \(remember && cardById\.has\(specId\)\) countrySelection\.remember\(specId\);/,
  'visible Garage selections update independent per-nation memory');
assert.match(garageSource, /applySelection\(selectedId, \{ remember: false \}\);/,
  'hidden Garage construction cannot overwrite a persisted nation choice');
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
