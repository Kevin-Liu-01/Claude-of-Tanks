import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './tankFactory.ts';
import * as specs from './specs.ts';
import * as policy from './camoPolicy.ts';
import * as materials from './materials.ts';
import { camoBaselineRows } from './camoProductionBaseline.test-support.mjs';

// fix/camo-defaults (2026-10-09). PR #9 moved 69 tanks' Factory coat, AUTO to national theatre coats, bots off their
// own paint, and the field schemes onto a shared patch-field painter. The owner on launch day: "why did you break camos?
// they only show generic camos now instead of the cool camos we had before", then "yeah our entire camo system before
// was better" (R113, 2026-09-21: "i want the default camos of our tanks to be what they were before, but just organized
// a lot better"). Production's camouflage system is restored. This receipt holds it to production row for row.
const baseline = JSON.parse(readFileSync(new URL('./camoProductionBaseline.json', import.meta.url), 'utf8'));
const now = camoBaselineRows({ specs, policy, materials });

// Saved selections and serialized catalog indices: production's 170 ids keep their exact positions. Only paints that
// joined after GT may follow them (camoPolicy.ts AUTHORED_PAINT_IDS_AFTER_GT).
assert.equal(baseline.ids.length, 170, 'production (deploy 206) lists 170 pattern ids');
assert.deepEqual(now.ids.slice(0, baseline.ids.length), baseline.ids, 'every production index holds the same id');
assert.deepEqual(now.ids.slice(baseline.ids.length), ['paint_m6_linebacker'], 'only the M6 Linebacker paint appends, after GT');
assert.deepEqual(now.catalog.slice(0, baseline.catalog.length), baseline.catalog, 'the garage picker lists production\'s schemes in order');
assert.deepEqual(now.catalog.slice(baseline.catalog.length), ['paint_m6_linebacker']);

// Every production id, as a saved selection, paints the same scheme (label, preset recipe and the resolved visual on
// ten reference hulls: US, Russian, German, British, Chinese, Korean, IDF, X-series and brand).
const movedSelections = baseline.ids.filter((id) => now.selections[id] !== baseline.selections[id]);
assert.deepEqual(movedSelections, [], 'production selections resolve to production\'s schemes');

// Every tank: the default selection, the Factory/stock scheme, the Factory visual and AUTO on twelve maps.
assert.equal(Object.keys(now.tanks).length, Object.keys(baseline.tanks).length, 'the same fleet');
const movedTanks = Object.keys(baseline.tanks).filter((id) => JSON.stringify(now.tanks[id]) !== JSON.stringify(baseline.tanks[id]));
assert.deepEqual(movedTanks, [], 'every tank\'s default camouflage is production\'s');

console.log(`camoCatalogProductionIndices.selftest: ${baseline.ids.length}/${baseline.ids.length} production ids at their `
  + `indices with the same schemes; ${Object.keys(baseline.tanks).length}/${Object.keys(baseline.tanks).length} tanks' `
  + 'selection, stock, Factory visual and AUTO equal production (afc5018e9)');
