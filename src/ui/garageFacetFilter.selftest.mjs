// Receipt: the Garage roster filter narrows the real fleet by class, role, era and facet search, its chip counts
// add up, it keeps the strip on a nation with a match, and its tables stay off the game entry (lazy panel).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../vehicles/tankFactory.ts';
import { VISIBLE_TANK_IDS, getSpec } from '../vehicles/specs.ts';
import { vehicleFacetsForId, vehicleIdsForFacet } from '../vehicles/vehicleFacets.ts';
import {
  EMPTY_GARAGE_FACET_STATE,
  GARAGE_FACET_GROUPS,
  createGarageFacetIndex,
  garageFacetActiveCount,
  garageFacetMatchCount,
  garageFacetMatcher,
  garageFacetOptionCounts,
} from './garageFacetFilter.ts';
import { facetFilteredCountry } from './garageOrder.ts';
import {
  VEHICLE_CLASS_GLYPH_IDS, VEHICLE_ROLE_GLYPH_IDS, facetControlGlyphSVG, vehicleClassGlyphSVG, vehicleRoleGlyphSVG,
} from './vehicleFacetIcons.ts';
import { VEHICLE_BATTLE_ROLE_ORDER, VEHICLE_CLASS_ORDER } from '../vehicles/vehicleFacets.ts';

const en = JSON.parse(readFileSync(new URL('./i18nCatalog.en-US.json', import.meta.url), 'utf8'));
const zh = JSON.parse(readFileSync(new URL('./i18nCatalog.zh-CN.json', import.meta.url), 'utf8'));
const specs = VISIBLE_TANK_IDS.map(getSpec);
const ids = specs.map((spec) => spec.id);
const index = createGarageFacetIndex(specs, (key) => en[key] ?? key);
const total = specs.length;
const state = (patch) => ({ ...EMPTY_GARAGE_FACET_STATE, ...patch });
const shown = (patch) => {
  const match = garageFacetMatcher(index, state(patch));
  return match ? ids.filter(match).sort() : [...ids].sort();
};

assert.equal(index.entries.length, total, 'every Garage vehicle is indexed');
assert.ok(index.entries.every((entry) => entry.facets), 'every Garage vehicle carries its facets');
assert.equal(garageFacetMatcher(index, EMPTY_GARAGE_FACET_STATE), null, 'no filter shows every card');
assert.equal(garageFacetActiveCount(EMPTY_GARAGE_FACET_STATE), 0);
assert.equal(garageFacetActiveCount(state({ vehicleClass: 'td', battleRole: 'sniper', era: 'modern', query: 'x' })), 4);
assert.equal(garageFacetActiveCount(state({ query: '   ' })), 0, 'a blank search is not a filter');

const visible = new Set(ids);
const members = (facet, value) => vehicleIdsForFacet(facet, value).filter((id) => visible.has(id)).sort();
assert.deepEqual(shown({ vehicleClass: 'ifv' }), members('class', 'ifv'));
assert.deepEqual(shown({ battleRole: 'scout' }), members('role', 'scout'));
assert.deepEqual(shown({ vehicleClass: 'concept-prototype' }),
  [...members('status', 'prototype'), ...members('status', 'concept')].sort());
assert.deepEqual(shown({ era: 'ww2' }), ids.filter((id) => getSpec(id).era === 'ww2').sort());
assert.deepEqual(shown({ vehicleClass: 'mbt', battleRole: 'sniper' }),
  members('class', 'mbt').filter((id) => vehicleFacetsForId(id).battleRole === 'sniper'));
assert.deepEqual(shown({ query: 'class:td' }), members('class', 'td'), 'facet tokens work in the Garage search');
const leopard2a6 = shown({ query: 'leopard 2a6' });
assert.ok(['leo2a6', 'leo2a6_ua', 'leo2a6m'].every((id) => leopard2a6.includes(id))
  && leopard2a6.every((id) => /^leo2/.test(id)), 'name words AND across names and aliases');
assert.ok(shown({ query: 'abrams' }).every((id) => /m1|abrams/.test(id)), 'name search stays on its family');
assert.deepEqual(createGarageFacetIndex(specs, (key) => zh[key] ?? key).entries
  .filter((entry) => entry.searchText.includes('坦克歼击车')).map((entry) => entry.id).sort(), members('class', 'td'),
'the zh-CN Garage searches its own class labels');

// Chip counts: one group's options partition the roster (concept-prototype is a cut across classes).
for (const group of Object.keys(GARAGE_FACET_GROUPS)) {
  const counts = garageFacetOptionCounts(index, EMPTY_GARAGE_FACET_STATE, group);
  assert.equal(counts.get('all'), total, `${group}: All counts the roster`);
  const partition = GARAGE_FACET_GROUPS[group].filter((value) => value !== 'all' && value !== 'concept-prototype');
  assert.equal(partition.reduce((sum, value) => sum + counts.get(value), 0), total, `${group}: options partition the roster`);
}
const roleCountsUnderTd = garageFacetOptionCounts(index, state({ vehicleClass: 'td' }), 'battleRole');
assert.equal(roleCountsUnderTd.get('all'), members('class', 'td').length, 'option counts respect the other groups');
assert.equal(roleCountsUnderTd.get('flanker'), 0, 'no flanking tank destroyer: that chip is disabled');
assert.equal(garageFacetOptionCounts(index, EMPTY_GARAGE_FACET_STATE, 'era').get('interwar'), 0,
  'an era without vehicles is left out of the panel');
assert.equal(garageFacetMatchCount(index, state({ vehicleClass: 'spaa' })), members('class', 'spaa').length);

// The strip stays on a nation with a match.
const order = ['us', 'ru', 'gb', 'de'];
assert.equal(facetFilteredCountry('ru', order, () => true), 'ru', 'a nation with a match keeps the strip');
assert.equal(facetFilteredCountry('ru', order, (id) => id === 'de'), 'de', 'otherwise the first nation with one');
assert.equal(facetFilteredCountry('ru', order, () => false), null, 'nothing matches: no nation');

// Glyphs (owner UI rules 2026-10-17: tank icons, less text): one silhouette per class chip and one symbol per role
// chip, constant markup keyed by own facet ids, so no typed or prototype key ever reaches the markup.
assert.deepEqual([...VEHICLE_CLASS_GLYPH_IDS].sort(), [...VEHICLE_CLASS_ORDER, 'concept-prototype'].sort(),
  'every class filter option has its silhouette');
assert.deepEqual([...VEHICLE_ROLE_GLYPH_IDS].sort(), [...VEHICLE_BATTLE_ROLE_ORDER].sort(), 'every role has its symbol');
assert.ok(GARAGE_FACET_GROUPS.vehicleClass.every((value) => value === 'all' || VEHICLE_CLASS_GLYPH_IDS.includes(value)),
  'the panel can draw every class option');
const glyphs = [
  ...VEHICLE_CLASS_GLYPH_IDS.map((id) => vehicleClassGlyphSVG(id)), ...VEHICLE_ROLE_GLYPH_IDS.map((id) => vehicleRoleGlyphSVG(id)),
  facetControlGlyphSVG('search'), facetControlGlyphSVG('clear'),
];
assert.equal(new Set(glyphs).size, glyphs.length, 'no two facet glyphs are the same drawing');
for (const svg of glyphs) {
  assert.match(svg, /^<svg class="cot-facet-glyph" viewBox="0 0 (?:32 16|24 24)" width="\d+" height="\d+" aria-hidden="true" focusable="false">/);
  assert.doesNotMatch(svg, /<(?:script|foreignObject|image|use|a)\b|\bon[a-z]+=|href|url\(/i, 'glyphs are inert shapes');
}
for (const hostile of ['constructor', '__proto__', 'toString', '<img src=x onerror=alert(1)>', '']) {
  assert.equal(vehicleClassGlyphSVG(hostile), '', `no class glyph for ${JSON.stringify(hostile)}`);
  assert.equal(vehicleRoleGlyphSVG(hostile), '', `no role glyph for ${JSON.stringify(hostile)}`);
}

// The panel writes markup only from the glyph builders, the icon table and the kit (whose factories escape their text);
// every label, count and search string is text.
const panelSource = readFileSync(new URL('./garageFacetPanel.ts', import.meta.url), 'utf8');
const markupWrites = [...panelSource.matchAll(/\.innerHTML = ([^;]+);/g)].map((match) => match[1].trim());
assert.ok(markupWrites.length >= 4, 'the panel draws its glyphs');
for (const rhs of markupWrites) {
  // (261: a value is the kit's chip, which escapes its label, its count and its attributes; its glyph is view.glyph)
  assert.match(rhs, /^(?:view\.glyph|(?:facetControlGlyphSVG|uiIconSVG)\('[a-z-]+', \d+\)|vehicleClassGlyphSVG\(CONCEPT_PROTOTYPE_CLASS_FILTER, \d+\)|emptyState\(\{ text: t\('[\w.]+'\)[^)]*\}\)|chip\(\{ label: view\.label, glyph: view\.glyph, [\s\S]*\}\))$/,
    `panel markup comes from a glyph builder: ${rhs}`);
}
assert.doesNotMatch(panelSource, /insertAdjacentHTML|outerHTML/, 'no other markup sink in the panel');
assert.match(panelSource, /if \(target === input\) \{\n\s+event\.stopPropagation\(\);/,
  'typed keys stay in the search (the Garage arrows never step the vehicle from it)');
assert.doesNotMatch(panelSource, /cot-facet-label|cot-facet-hint/, 'no visible eyebrow labels or hint paragraph over the rows');
// Blind critic round 1 (2026-10-21): the panel sits above the phone Garage's side cards, takes the height above the
// rail, shows Clear only once something narrows, cues the swipe rows, and the stage follows the filter.
assert.match(panelSource, /clearButton\.hidden = active === 0;/, 'Clear shows only while a filter is active');
assert.match(panelSource, /for \(const el of document\.querySelectorAll<HTMLElement>\('\.cot-gbar, \.cot-brand-rail, \.cot-nav'\)\)/,
  'the ceiling is the header\'s lowest visible edge, whichever parts a layout shows');
assert.match(panelSource, /const ceiling = !short \? headerBottom \+ 12 : 16;\s*const fitHeight = Math\.round\(Math\.max\(160, Math\.min\(520, top - ceiling\)\)\);\s*panel\.style\.maxHeight = `\$\{fitHeight\}px`;/,
  'the panel takes the height above the rail, a gap under the header (a short landscape phone covers the header whole)');
assert.match(panelSource, /wrap\.dataset\.more = max <= 1 \? '' :/, 'swipe rows mark the side with more chips');
const panelCss = readFileSync(new URL('./garageFacetPanel.css', import.meta.url), 'utf8');
const garageText = readFileSync(new URL('./garage.ts', import.meta.url), 'utf8');
assert.match(panelCss, /\.cot-facet-rowwrap\{position:relative;min-width:0;/, 'a swipe row never widens the panel (blind re-check 2026-10-21)');
assert.match(panelCss, /grid-template-columns:minmax\(0,1fr\)/, 'the panel column never grows past the panel');
assert.match(panelCss, /\.cot-facet-rowwrap\[data-more='r'\] \.cot-facet-row\{[^}]*mask-image:linear-gradient\(90deg/,
  'the edge cue shows where chips continue: the side with more fades (the gauntlet 10-25)');
assert.doesNotMatch(panelCss, /\.cot-facet-rowwrap::after\{[^}]*content/, 'no arrow glyph over the chips');
assert.match(panelCss, /\.cot-country-rail:has\(> \.cot-facet-panel:not\(\[hidden\]\)\)\{z-index:21;\}/,
  'an open panel lifts the rail over the side cards and the Battle and Multiplayer buttons');
assert.doesNotMatch(garageText, /facetToggle[^\n]*'\.code'/, 'the Filter toggle is an icon: its name rides in aria-label and title');
assert.match(garageText, /if \(facetVisible\(selectedId\) \|\| vehicleLocked\) return;\n\s+const first = \(specsByCountry\.get\(countryFilter\) \|\| \[\]\)\.find\(\(spec\) => facetVisible\(spec\.id\)\);/,
  'a filter that hides the staged vehicle stages the strip\'s first match');

// Boot budget: the Garage reaches the panel, the filter and the facet tables only through import().
const garageSource = readFileSync(new URL('./garage.ts', import.meta.url), 'utf8');
const garageCss = readFileSync(new URL('./garage.css', import.meta.url), 'utf8');
assert.match(garageSource, /import\('\.\/garageFacetPanel\.ts'\)/, 'the Filter toggle loads its panel lazily');
assert.match(garageSource, /import\('\.\/garageFacetPanel\.css'\)/, 'the panel stylesheet loads with it');
assert.doesNotMatch(garageSource, /^import (?!type )[^;]*from '(?:\.\.\/vehicles\/vehicleFacets(?:Search)?|\.\/garageFacet(?:Filter|Panel))\.ts'/m,
  'garage.ts never imports the facet modules statically');
assert.match(garageSource, /\.filter\(\(s\) => facetVisible\(s\.id\)\)/, 'arrow keys walk only the filtered strip');
assert.match(garageCss, /\.cot-facet-toggle\{grid-column:2;position:relative;/, 'the toggle has its own rail slot before the flag track');
assert.match(garageSource, /countryRailEl\.insertBefore\(facetToggle, chipsEl\);/, 'no flag ever scrolls beneath the toggle');
assert.match(panelCss, /\.cot-country-chip\.is-facet-empty:not\(\.sel\)\{opacity:/, 'nations without a match read as empty; the chosen one keeps its mark');
// boot budget: only the toggle's idle look rides garage.css; its open/active/badge styles load with the panel
assert.doesNotMatch(garageCss, /is-facet-empty|cot-facet-toggle\.is-active|cot-facet-toggle \.ct|cot-facet-panel/,
  'the filter\'s panel-time styles stay off the boot stylesheet');

console.log(`garageFacetFilter.selftest: ${total} Garage vehicles; ifv ${members('class', 'ifv').length},`
  + ` scout ${members('role', 'scout').length}, concept/prototype ${shown({ vehicleClass: 'concept-prototype' }).length}`);
