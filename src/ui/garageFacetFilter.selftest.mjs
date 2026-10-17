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

// Boot budget: the Garage reaches the panel, the filter and the facet tables only through import().
const garageSource = readFileSync(new URL('./garage.ts', import.meta.url), 'utf8');
const garageCss = readFileSync(new URL('./garage.css', import.meta.url), 'utf8');
assert.match(garageSource, /import\('\.\/garageFacetPanel\.ts'\)/, 'the Filter toggle loads its panel lazily');
assert.match(garageSource, /import\('\.\/garageFacetPanel\.css'\)/, 'the panel stylesheet loads with it');
assert.doesNotMatch(garageSource, /^import (?!type )[^;]*from '(?:\.\.\/vehicles\/vehicleFacets(?:Search)?|\.\/garageFacet(?:Filter|Panel))\.ts'/m,
  'garage.ts never imports the facet modules statically');
assert.match(garageSource, /\.filter\(\(s\) => facetVisible\(s\.id\)\)/, 'arrow keys walk only the filtered strip');
assert.match(garageCss, /\.cot-facet-toggle\{position:sticky;left:0;/, 'the toggle stays at the rail start while flags scroll');
assert.match(garageCss, /\.cot-country-chip\.is-facet-empty\{opacity:/, 'nations without a match read as empty');

console.log(`garageFacetFilter.selftest: ${total} Garage vehicles; ifv ${members('class', 'ifv').length},`
  + ` scout ${members('role', 'scout').length}, concept/prototype ${shown({ vehicleClass: 'concept-prototype' }).length}`);
