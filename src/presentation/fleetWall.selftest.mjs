// fleetWall.selftest.mjs — the landing's fleet wall facets (03 .facets): every vehicle with a fleet take is in the
// wall's index with its Garage facets, the curated twelve lead in the page's order, a nation, a class and the search
// narrow it (English and Chinese words, `class:` tokens), and the page carries the chips and the search.
// Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fleetMatches, isEmptyFilter } from './fleetWall.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const wall = JSON.parse(readFileSync(join(ROOT, 'src/presentation/fleetWall.json'), 'utf8'));
const takes = JSON.parse(readFileSync(join(ROOT, 'public/media/site50-r14/fleet/index.json'), 'utf8')).vehicles;
const home = readFileSync(join(ROOT, 'site/home.html'), 'utf8');
const onDisk = (path) => existsSync(join(ROOT, 'public', path.replace(/^\//, '')));

// the index: one record per fleet take, each with its take, its facets and its plate
assert.equal(wall.length, Object.keys(takes).length, 'every vehicle with a fleet take is on the wall');
assert.equal(new Set(wall.map((record) => record.id)).size, wall.length, 'one record per vehicle');
for (const record of wall) {
  assert.ok(onDisk(record.poster) && onDisk(record.loop), `${record.id}: its take's poster and loop ship`);
  assert.ok(record.entry.facets.vehicleClass && record.entry.facets.battleRole && record.entry.facets.designStatus, `${record.id}: its Garage facets`);
  assert.ok(record.title.en && record.title.zh, `${record.id}: its take's title in both locales`);
  assert.match(record.href, new RegExp(`^/gallery\\?id=${record.id}(?:&|$)`), `${record.id}: the tile opens its Gallery dossier`);
  assert.equal(record.entry.searchText, record.entry.searchText.toLocaleLowerCase('en-US'), `${record.id}: the haystack is lowercase`);
}

// the page's twelve are the index's first twelve, in order
const pageTiles = [...home.matchAll(/<a class="fleet-tile[^"]*" href="([^"]+)"/g)].map((match) => match[1].replace(/&amp;/g, '&'));
assert.deepEqual(pageTiles, wall.slice(0, 12).map((record) => record.href), 'the curated twelve lead, in the page\'s order');

// the filter: a nation, a class and the search, each narrowing
const none = { nation: '', cls: '', query: '' };
assert.ok(isEmptyFilter(none) && isEmptyFilter({ ...none, query: '  ' }) && !isEmptyFilter({ ...none, nation: 'de' }));
assert.equal(fleetMatches(none, wall).length, wall.length, 'the empty filter holds every vehicle');
const german = fleetMatches({ ...none, nation: 'de' }, wall);
assert.ok(german.length > 0 && german.every((record) => record.flag === 'de'), 'a nation chip keeps its nation');
const ifv = fleetMatches({ ...none, cls: 'ifv' }, wall);
assert.ok(ifv.length > 0 && ifv.every((record) => record.entry.facets.vehicleClass === 'ifv'), 'a class chip keeps its class');
const concepts = fleetMatches({ ...none, cls: 'concept-prototype' }, wall);
assert.ok(concepts.length > 0 && concepts.every((record) => record.entry.facets.designStatus !== 'service'), 'concept and prototype');
assert.deepEqual(fleetMatches({ ...none, query: 'class:ifv' }, wall).map((r) => r.id), ifv.map((r) => r.id), 'class: in the search');
const leopards = fleetMatches({ ...none, query: 'leopard' }, wall);
assert.ok(leopards.length > 0 && leopards.every((record) => /leopard/i.test(record.entry.searchText)), 'a name word');
assert.deepEqual(fleetMatches({ ...none, query: '德国' }, wall).map((r) => r.id), german.map((r) => r.id), 'a Chinese nation name');
assert.ok(fleetMatches({ ...none, nation: 'de', query: 'leopard' }, wall).every((r) => r.flag === 'de'), 'chips and search together');
assert.deepEqual(fleetMatches({ ...none, query: 'zzzz' }, wall), [], 'nothing for a word no vehicle holds');

// the page: All, a flag per nation on the wall, the class chips, the search over the whole wall
const facets = /<div class="fleet-facets">([\s\S]*?)<\/div><div class="fleet-wall" data-fleet-wall>/.exec(home)?.[1] ?? '';
assert.match(facets, /<button class="cot-c-chip" type="button" aria-pressed="true" data-fleet-all>/, 'All leads, pressed');
const flags = [...facets.matchAll(/data-fleet-nation="([a-z]{2})"/g)].map((match) => match[1]);
assert.deepEqual([...flags].sort(), [...new Set(wall.map((record) => record.flag))].sort(), 'a flag for every nation on the wall');
assert.ok([...facets.matchAll(/data-fleet-class="([\w-]+)"/g)].length >= 3, 'the class chips');
assert.match(facets, new RegExp(`data-i18n-vars='\\{"count":"${wall.length}"\\}'`), 'the search names the whole wall');
assert.match(facets, /<p class="fleet-count" role="status"><\/p>/, 'the count speaks as the filter changes');

console.log(`fleetWall.selftest: ${wall.length} vehicles, ${flags.length} nations; the curated twelve lead; chips and search narrow`);
