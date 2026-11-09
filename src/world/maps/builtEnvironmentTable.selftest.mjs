import assert from 'node:assert/strict';
import { BANK_KIND_CODE, BUILT_ENVIRONMENT, PAVED_GROUND_MAX, builtEnvironmentFor, pavedGroundLocal, pavedGroundTest, watersideFor } from './builtEnvironmentTable.ts';
import { MAP_IDS } from './mapIds.ts';
import { getMapConfig } from './index.ts';
import { BOAT_FAMILIES } from './boatHulls.ts';
import { CIVIC_STYLES } from '../civic/styles.ts';
import { CIVIC_PLAN_MAPS, civicPlanFor } from '../civic/plans/index.ts';
import { ROAD_SURFACE_CODE } from '../roadSurfaces.ts';
import { BUILT_ENVIRONMENT_RECORDS } from './builtEnvironmentRecords.ts';

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

// the photographs: every real place has its own, each a free licence with its source (mars is the future: its setting only)
assert.deepEqual(Object.keys(BUILT_ENVIRONMENT_RECORDS).sort(), [...MAP_IDS].sort(), 'a record for every battlefield');
for (const id of MAP_IDS) {
  const rec = BUILT_ENVIRONMENT_RECORDS[id];
  assert.ok(rec.setting.length > 20, `${id}: its setting`);
  if (id === 'mars') continue;
  assert.ok(rec.photos.length >= 2, `${id}: two photographs or more`);
  for (const ph of rec.photos) {
    assert.match(ph.url, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/, `${id}: a Commons file`);
    assert.match(ph.license, /CC|Public domain|PD|No restrictions|Attribution/i, `${id}: ${ph.license} is free`);
  }
}

// (built-env-270b) the open built ground: each piece inside the battlefield's square with a sensible size, a named surface
// from the catalogue, at most PAVED_GROUND_MAX surfaced pieces a map (the material's uniforms), its frame a rotation (the
// mask stamp and the shader share it), and the vegetation test true on it and false off it
let groundPieces = 0;
for (const id of MAP_IDS) {
  const grounds = BUILT_ENVIRONMENT[id].roads.ground ?? [];
  groundPieces += grounds.length;
  assert.ok(grounds.filter((g) => g.surface).length <= PAVED_GROUND_MAX, `${id}: at most ${PAVED_GROUND_MAX} surfaced grounds`);
  const test = pavedGroundTest(id);
  assert.equal(test === null, grounds.length === 0, `${id}: the vegetation's ground test exists exactly where grounds do`);
  for (const g of grounds) {
    assert.ok(Math.abs(g.x) + g.hw < 512 && Math.abs(g.z) + g.hl < 512 || Math.hypot(g.x, g.z) + Math.hypot(g.hw, g.hl) < 512 * Math.SQRT2,
      `${id}: ${g.what} inside the battlefield`);
    assert.ok(g.hw >= 1 && g.hl >= 1 && g.hw <= 60 && g.hl <= 60, `${id}: ${g.what} 2-120 m a side`);
    if (g.surface) assert.ok(g.surface in ROAD_SURFACE_CODE, `${id}: ${g.what} names a catalogue surface`);
    assert.ok(g.what.length > 10, `${id}: each ground says what it is`);
    const [cx, cz] = pavedGroundLocal(g, g.x, g.z);
    assert.ok(Math.abs(cx) < 1e-9 && Math.abs(cz) < 1e-9, `${id}: the frame is centred`);
    const [lx, lz] = pavedGroundLocal(g, g.x + 3, g.z + 4);
    assert.ok(Math.abs(Math.hypot(lx, lz) - 5) < 1e-9, `${id}: the frame is a rotation`);
    assert.ok(test(g.x, g.z), `${id}: the vegetation test holds at ${g.what}'s centre`);
  }
}
assert.ok(groundPieces > 0, 'some rows lay open ground');
assert.equal(builtEnvironmentFor('studio-probe'), null);

console.log(`builtEnvironmentTable.selftest: ${MAP_IDS.length} rows, ${MAP_IDS.filter((id) => BUILT_ENVIRONMENT[id].civic).length} civic styles, `
  + `${MAP_IDS.filter((id) => BUILT_ENVIRONMENT[id].roads.paved).length} paved catalogues, ${groundPieces} pieces of open ground`);
