import assert from 'node:assert/strict';
import { PRODUCT_STATS } from '../productStats.ts';
import {
  DEV_FLEET_KEY,
  HISTORICAL_COLD_WAR_CANDIDATE_IDS,
  PRODUCTION_HIDDEN_TANK_IDS,
  RETAINED_COLD_WAR_IDS,
  RETAINED_WW2_IDS,
  developmentFleetEnabled,
  isRetiredHistoricalTank,
} from './rosterPolicy.ts';

const retainedWw2 = new Set(RETAINED_WW2_IDS);
const retainedColdWar = new Set(RETAINED_COLD_WAR_IDS);

assert.ok(
  retainedColdWar.has('vickers_mk1'),
  'Vickers MBT Mk 1 remains in the playable Cold War runtime roster',
);

for (const id of retainedWw2) {
  assert.equal(isRetiredHistoricalTank({ id, era: 'ww2' }), false, `${id} stays selectable`);
}
for (const id of HISTORICAL_COLD_WAR_CANDIDATE_IDS) {
  assert.equal(
    isRetiredHistoricalTank({ id, era: id === 't95' ? 'ww2' : 'modern' }),
    !retainedColdWar.has(id),
    `${id} follows the Cold War exception policy`,
  );
}

assert.equal(isRetiredHistoricalTank({ id: 'm4a3e8', era: 'ww2' }), true);
assert.equal(isRetiredHistoricalTank({ id: 'tiger2', era: 'ww2' }), true);
assert.equal(isRetiredHistoricalTank({ id: 'm1a2', era: 'modern' }), false);
assert.equal(isRetiredHistoricalTank({ id: 't80u', era: 'modern' }), false);
assert.equal(developmentFleetEnabled({ DEV: true, VITE_COT_DEV_FLEET_KEY: DEV_FLEET_KEY }), true);
assert.equal(developmentFleetEnabled({ DEV: false, VITE_COT_DEV_FLEET_KEY: DEV_FLEET_KEY }), false,
  'production ignores the local development key');
assert.equal(developmentFleetEnabled({ DEV: true, VITE_COT_DEV_FLEET_KEY: 'wrong' }), false);

const ownerHidden = [
  'panther_g', 'tiger1', 'sturmtiger', 'jpz_e100',
  'm26_pershing', 'm45_patton', 't95', 'isu122s', 'isu152',
];
for (const id of ownerHidden) {
  assert(PRODUCTION_HIDDEN_TANK_IDS.has(id), `${id}: owner production exclusion is centralized`);
}

await import('./tankFactory.ts');
const {
  ALL_TANK_IDS,
  BOT_TANK_IDS,
  DEVELOPMENT_TANK_IDS,
  PRODUCTION_TANK_IDS,
  SAVED_TANK_IDS,
  TANK_SPECS,
  VISIBLE_TANK_IDS,
} = await import('./specs.js');

assert.equal(SAVED_TANK_IDS.length, PRODUCT_STATS.savedVehicleRecords,
  'the complete saved procedural fleet is indexed');
assert.equal(DEVELOPMENT_TANK_IDS.length, PRODUCT_STATS.developmentVehicles,
  'reference-only placeholders are never playable');
assert.deepEqual(BOT_TANK_IDS, PRODUCTION_TANK_IDS,
  'bots can field exactly the production-visible catalog');
assert.equal(BOT_TANK_IDS.includes('m1a2_legacy'), false,
  'production-hidden development tanks cannot occupy bot seats');
assert.equal(BOT_TANK_IDS.includes('recon_tank'), false,
  'reference placeholders cannot occupy bot seats');
assert.deepEqual(new Set(SAVED_TANK_IDS), new Set(Object.keys(TANK_SPECS)),
  'every registered spec belongs to the saved-fleet projection');
assert.deepEqual(VISIBLE_TANK_IDS, PRODUCTION_TANK_IDS,
  'bare Node and production use the curated projection');
assert.equal(PRODUCTION_TANK_IDS.length, PRODUCT_STATS.productionVehicles,
  'production fleet count is deliberate');
for (const id of ownerHidden) {
  assert(ALL_TANK_IDS.includes(id), `${id}: record stays available to local development`);
  assert(!PRODUCTION_TANK_IDS.includes(id), `${id}: record stays out of production`);
}
for (const id of SAVED_TANK_IDS) {
  const roster = TANK_SPECS[id].roster;
  assert.equal(Boolean(roster), true, `${id}: missing canonical roster metadata`);
  assert.equal(roster.developmentOnly, !roster.productionVisible, `${id}: inconsistent roster flags`);
  const expectedTag = roster.productionVisible ? '' : roster.localVisible ? 'DEV' : 'REF';
  assert.equal(roster.tag, expectedTag, `${id}: incorrect roster tag`);
}

console.log(
  `rosterPolicy.selftest: ${PRODUCTION_TANK_IDS.length} production / ${SAVED_TANK_IDS.length} saved vehicles classified`,
);
