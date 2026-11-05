import assert from 'node:assert/strict';
import { PRODUCTION_TANK_IDS, SAVED_TANK_IDS } from '../vehicles/specs.ts';
import { FLEET_GROUP_BY_ID } from '../vehicles/fleetManifest.ts';
import { vehicleEraForId } from '../vehicles/taxonomy.ts';
import { MAP_IDS } from './maps/mapIds.ts';
import { WRECK_CASTS } from './maps/wreckCasts.ts';
import { isPublicWreckDonor, resolveWreckRoster, WRECK_DONOR_IDS, wreckDonorsFor } from './wreckRoster.ts';
import { WRECK_STATES, WRECK_STATE_TABLE, WRECK_SITES, statesForSite } from './wreckStates.ts';

// Register the actual browser metadata after importing the policy. No visual
// family is acquired here: the separate wreckFleet test exercises real bakes.
const { isTankBuilderReady } = await import('../vehicles/fleetFactory.ts');
assert.equal(typeof globalThis.document, 'undefined');

// Ids retired from the saved fleet on 2026-09-23 plus an unknown id.
const unavailable = ['leo2a7', 'm1a2_legacy', 'recon_tank', 'not-a-tank'];
for (const id of unavailable) {
  assert.equal(isPublicWreckDonor(id), false, `${id}: retired/unknown is not public`);
  assert.equal(SAVED_TANK_IDS.includes(id), false, `${id}: no saved record remains`);
}

// (wrecks-270) one cast a map, every map a row (the table's type requires it; this is the runtime twin)
assert.deepEqual(Object.keys(WRECK_CASTS).sort(), [...MAP_IDS].sort(), 'every map has its cast');
const allDonors = new Set();
for (const [mapId, cast] of Object.entries(WRECK_CASTS)) {
  assert.ok(Object.isFrozen(cast) && Object.isFrozen(cast.ids), `${mapId}: the cast is immutable`);
  assert.equal(new Set(cast.ids).size, cast.ids.length, `${mapId}: no accidental weighting by repetition`);
  assert.ok(cast.ids.length <= cast.count, `${mapId}: a cast within its slots`);
  for (const id of cast.ids) {
    assert.ok(PRODUCTION_TANK_IDS.includes(id), `${mapId}/${id}: actual public catalog membership`);
    assert.ok(FLEET_GROUP_BY_ID[id], `${mapId}/${id}: explicit demand-loaded builder owner`);
    if (cast.era === 'ww2') assert.equal(vehicleEraForId(id), 'ww2', `${mapId}/${id}: a tank of the war`);
    allDonors.add(id);
  }
  assert.deepEqual(wreckDonorsFor(mapId), [...cast.ids], `${mapId}: no authored donor silently filtered`);
  for (const state of cast.states ?? []) assert.ok(WRECK_STATES.includes(state), `${mapId}/${state}: a known state`);
  // every site a map places on shows at least one of its states
  for (const site of WRECK_SITES) assert.ok(cast.count === 0 || statesForSite(site, cast.states).length > 0, `${mapId}/${site}: a state to show`);
}
assert.deepEqual([...allDonors].sort(), [...WRECK_DONOR_IDS].sort(), 'the donor list is the casts\' union');
assert.deepEqual(wreckDonorsFor('not-a-map'), [], 'an unknown map has no cast');
assert.deepEqual(wreckDonorsFor('__proto__'), [], 'never inherited object properties');

// the damage-state table: eight states, each with a pose and the sites it reads true on
assert.equal(WRECK_STATES.length, 8);
for (const state of WRECK_STATES) {
  const row = WRECK_STATE_TABLE[state];
  assert.ok(Object.isFrozen(row) && row.sites.length > 0, `${state}: a frozen row with its sites`);
  assert.ok(row.age >= 0 && row.age <= 1, `${state}: an age share`);
}
for (const site of WRECK_SITES) assert.ok(statesForSite(site).length >= 2, `${site}: at least two states, so a view varies`);

const cast = Object.freeze(['leo2a7', 'm1a1_abrams_hc', 'tiger1', 'leo2_improved', 'm1a1_abrams_hc', 't90am']);
const castBefore = [...cast];
assert.deepEqual(resolveWreckRoster(cast), ['m1a1_abrams_hc', 'leo2_improved', 't90am'],
  'eligible authored order survives filtering and stable deduplication');
assert.deepEqual(cast, castBefore, 'caller cast is never mutated');
assert.deepEqual(resolveWreckRoster(unavailable), [], 'a wholly invalid cast places nothing, never a fallback');
assert.deepEqual(resolveWreckRoster(), [], 'no cast, no donors');
const owned = wreckDonorsFor('frontier');
owned.splice(0, owned.length, 'not-a-tank');
assert.deepEqual(wreckDonorsFor('frontier'), [...WRECK_CASTS.frontier.ids], 'returned arrays retain no shared state');

// The canonical catalog is finalized/reordered in place. Deliberately remove
// entries inside this isolated test, then restore the exact original order.
const originalPublic = [...PRODUCTION_TANK_IDS];
try {
  PRODUCTION_TANK_IDS.splice(PRODUCTION_TANK_IDS.indexOf('leo2_improved'), 1);
  assert.equal(isPublicWreckDonor('leo2_improved'), false, 'eligibility is not an import-time snapshot');
  assert.ok(!wreckDonorsFor('coastal').includes('leo2_improved'));
  assert.deepEqual(resolveWreckRoster(['leo2_improved', 'm1a1_abrams_hc']), ['m1a1_abrams_hc']);
  PRODUCTION_TANK_IDS.splice(0, PRODUCTION_TANK_IDS.length);
  for (const mapId of MAP_IDS) assert.deepEqual(wreckDonorsFor(mapId), [], 'no eligible fleet means no invalid fallback');
} finally {
  PRODUCTION_TANK_IDS.splice(0, PRODUCTION_TANK_IDS.length, ...originalPublic);
}
for (const id of allDonors) {
  assert.equal(isTankBuilderReady(id), false, `${id}: policy selection never acquires geometry builders`);
}
console.log(`wreckRoster: ${MAP_IDS.length} casts, ${allDonors.size} unique public donors, ${WRECK_STATES.length} damage states; ordered filtering, live eligibility and builder-free selection pass`);
