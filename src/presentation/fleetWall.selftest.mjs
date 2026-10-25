// fleetWall.selftest.mjs — the fleet index the 404 page's search reads (src/presentation/fleetWall.json, written by
// tools/home-premiere.mjs): every vehicle with a fleet take, with its Garage facets, its take and its Gallery dossier.
// The landing's fleet wall it once fed left the page with the 2026-10-25 redesign. Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const wall = JSON.parse(readFileSync(join(ROOT, 'src/presentation/fleetWall.json'), 'utf8'));
const takes = JSON.parse(readFileSync(join(ROOT, 'public/media/site50-r14/fleet/index.json'), 'utf8')).vehicles;
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

console.log(`fleetWall.selftest: ${wall.length} vehicles in the 404 search's fleet index, each with its take, facets and dossier`);
