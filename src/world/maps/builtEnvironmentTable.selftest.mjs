import assert from 'node:assert/strict';
import { BANK_KIND_CODE, BUILT_ENVIRONMENT, builtEnvironmentFor, watersideFor } from './builtEnvironmentTable.ts';
import { MAP_IDS } from './mapIds.ts';
import { getMapConfig } from './index.ts';
import { BOAT_FAMILIES } from './boatHulls.ts';
import { CIVIC_STYLES } from '../civic/styles.ts';
import { CIVIC_PLAN_MAPS, civicPlanFor } from '../civic/plans/index.ts';
import { ROAD_SURFACE_CODE } from '../roadSurfaces.ts';

// The built-environment table (item built-env-270, DECISIONS 2026-11-05 "Built environment per map"): one row per
// battlefield, and every row names real kits. Pins: a row per map and none for anything else; the civic style a row names
// exists, and a map with a civic plan names one (its plan lays it); a path surface per real path only; the owner's
// protected maps keep the old road law; the waterside's craft are real families and forms, each coast's own.

assert.deepEqual(Object.keys(BUILT_ENVIRONMENT).sort(), [...MAP_IDS].sort(), 'a row for every battlefield and nothing else');
assert.equal(builtEnvironmentFor('studio'), null, 'no row for a scene that is not a battlefield');
assert.equal(watersideFor('studio').boats, 'canot', 'a scene that is not a battlefield: the European waterside');

for (const id of MAP_IDS) {
  const row = BUILT_ENVIRONMENT[id];
  if (row.civic) assert.ok(CIVIC_STYLES[row.civic], `${id}: its civic style '${row.civic}' exists`);
  const paths = getMapConfig(id).terrain?.roads?.paths ?? [];
  if (row.roads.paths) {
    assert.ok(row.roads.paths.length <= paths.length, `${id}: no surface past its ${paths.length} paths`);
    for (const surface of row.roads.paths) assert.ok(surface === null || ROAD_SURFACE_CODE[surface] > 0, `${id}: ${surface} is a class`);
  }
  assert.ok(BOAT_FAMILIES[row.shore.boats], `${id}: its boats '${row.shore.boats}' are a family`);
}
for (const id of CIVIC_PLAN_MAPS) {
  assert.ok(BUILT_ENVIRONMENT[id].civic, `${id}: a civic plan, so its row names a civic style`);
  assert.equal(civicPlanFor(id).style, BUILT_ENVIRONMENT[id].civic, `${id}: its plan lays its row's style`);
}

// the owner's protected maps (2026-10-09) keep the old road law until a pair shows the worked carriageway does them no harm
// (their paving, reopened by the owner's 2026-11-05 ask, is the per-map A/B's)
for (const id of ['verdant', 'frontier', 'winter', 'saltwind', 'reservoir', 'railyard', 'coastal', 'desert', 'fjord']) {
  assert.equal(BUILT_ENVIRONMENT[id].roads.work, 'off', `${id}: the old road law`);
}
// a bank's facing only where the water is open (the material reads it off the shore distance of a seaLake map)
for (const id of MAP_IDS) {
  const bank = BUILT_ENVIRONMENT[id].shore.bank;
  if (!bank) continue;
  assert.ok(getMapConfig(id).splat?.seaLake, `${id}: a bank's facing on open water`);
  assert.ok(bank.widthM > 0 && bank.widthM < 30, `${id}: the facing inside the shore distance's 32 m`);
  assert.ok(BANK_KIND_CODE[bank.kind] > 0, `${id}: ${bank.kind} is a facing`);
}

// each coast's craft (#16 r2, Lane C, 2026-10-14: the forms keyed on the coast's boats, now the rows')
const shore = (id) => BUILT_ENVIRONMENT[id].shore;
assert.deepEqual(['coastal', 'fjord', 'saltwind', 'mangrove', 'delta', 'alpine'].map((id) => shore(id).boats),
  ['canot', 'faering', 'gajeta', 'xuong', 'nouka', 'lakeboat'], 'Léon, Narvik, Dalmatia, Cà Mau, the Jamuna, the Mont-Cenis lake');
assert.deepEqual(['coastal', 'fjord', 'saltwind', 'mangrove', 'delta', 'alpine'].map((id) => shore(id).jetty),
  ['estacade', 'brygge', 'riva', 'stilts', 'stilts', 'stage']);
assert.equal(shore('fjord').drift, 'nordland'); assert.equal(shore('coastal').drift, 'breton');
assert.equal(shore('delta').ford, 'bamboo'); assert.equal(shore('autumn').ford, 'gauge');
assert.deepEqual(['autumn', 'delta', 'mangrove'].map((id) => shore(id).reeds), ['phragmites', 'kash', 'nipa']);

console.log(`builtEnvironmentTable.selftest: ${MAP_IDS.length} rows, ${MAP_IDS.filter((id) => BUILT_ENVIRONMENT[id].civic).length} civic styles, `
  + `${MAP_IDS.filter((id) => BUILT_ENVIRONMENT[id].roads.paved).length} paved catalogues`);
