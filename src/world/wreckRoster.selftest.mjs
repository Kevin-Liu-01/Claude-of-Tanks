import assert from 'node:assert/strict';
import { PRODUCTION_TANK_IDS, SAVED_TANK_IDS } from '../vehicles/specs.ts';
import { FLEET_GROUP_BY_ID } from '../vehicles/fleetManifest.ts';
import { VEHICLE_ERA_ORDER, vehicleEraForId } from '../vehicles/taxonomy.ts';
import { isPublicWreckDonor, resolveWreckRoster, WRECK_ROSTER_POOLS } from './wreckRoster.ts';

// Register the actual browser metadata after importing the policy. No visual
// family is acquired here: the separate wreckFleet test exercises real bakes.
const { isTankBuilderReady } = await import('../vehicles/fleetFactory.ts');
const { wreckPool } = await import('./wrecks.ts');
assert.equal(typeof globalThis.document, 'undefined');

const unavailable = ['leo2a7', 'tiger1', 'panther_g', 't34_85', 'm4a3e8', 'is2',
  'm1a2_legacy', 'recon_tank', 'q_heavy', 'not-a-tank'];
for (const id of unavailable) {
  assert.equal(isPublicWreckDonor(id), false, `${id}: saved/hidden/unknown is not public`);
}
assert.ok(SAVED_TANK_IDS.includes('leo2a7'), 'retired Leopard donor still exists for builder derivation');
assert.ok(isPublicWreckDonor('leo2a7v'), 'public Leopard 2A7V replaces the retired 2A7 wreck');
assert.ok(Object.isFrozen(WRECK_ROSTER_POOLS));

const allDonors = new Set();
for (const era of VEHICLE_ERA_ORDER) {
  const authored = WRECK_ROSTER_POOLS[era];
  assert.ok(Object.isFrozen(authored), `${era}: canonical pool is immutable`);
  assert.ok(authored.length > 0, `${era}: deliberate populated cast`);
  assert.equal(new Set(authored).size, authored.length, `${era}: no accidental weighting by repetition`);
  for (const id of authored) {
    assert.ok(PRODUCTION_TANK_IDS.includes(id), `${era}/${id}: actual public catalog membership`);
    assert.ok(FLEET_GROUP_BY_ID[id], `${era}/${id}: explicit demand-loaded builder owner`);
    allDonors.add(id);
  }
  assert.deepEqual(resolveWreckRoster(era), authored, `${era}: no unavailable default silently filtered`);
  assert.deepEqual(wreckPool(era), authored, `${era}: existing public wrapper uses the same policy`);
  assert.deepEqual(resolveWreckRoster(era, unavailable), authored, `${era}: wholly invalid cast falls back`);
  assert.deepEqual(resolveWreckRoster(era, []), authored, `${era}: empty authored cast falls back`);
}

assert.equal(WRECK_ROSTER_POOLS.modern.length, 32, 'expanded modern cast stays bounded');
assert.deepEqual(resolveWreckRoster('ww2'), ['kv2', 'jpz_e100_x'],
  'historical cast never resurrects hidden/archived tanks to satisfy a size target');
for (const era of ['ww2', 'cold-war', 'next-generation']) {
  for (const id of WRECK_ROSTER_POOLS[era]) {
    assert.equal(vehicleEraForId(id), era, `${era}/${id}: period-appropriate fallback`);
  }
}
for (const id of ['m551_sheridan', 'm60a2', 'm60a3', 'marder1a3', 'bmpt_t90',
  'bmp3', 'm2a2_bradley', 'pl01', 'cv90', 'ua_t84_oplot_m', 'leclerc_xlr', 'type90']) {
  assert.ok(resolveWreckRoster('modern').includes(id), `${id}: distinct public silhouette retained`);
}

const cast = Object.freeze(['leo2a7', 'm1a2', 'tiger1', 'leo2a7v', 'm1a2', 't90m']);
const castBefore = [...cast];
assert.deepEqual(resolveWreckRoster('modern', cast), ['m1a2', 'leo2a7v', 't90m'],
  'eligible authored order survives filtering and stable deduplication');
assert.deepEqual(cast, castBefore, 'caller cast is never mutated');
for (const era of ['future-era', '', '__proto__', 'constructor']) {
  assert.deepEqual(resolveWreckRoster(era), WRECK_ROSTER_POOLS.modern,
    `${era}: unknown era uses public modern defaults, never inherited object properties`);
}
const owned = resolveWreckRoster('modern');
owned.splice(0, owned.length, 'not-a-tank');
assert.deepEqual(resolveWreckRoster('modern'), WRECK_ROSTER_POOLS.modern,
  'returned arrays do not retain or mutate shared selection state');

// The canonical catalog is finalized/reordered in place. Deliberately remove
// entries inside this isolated test, then restore the exact original order.
const originalPublic = [...PRODUCTION_TANK_IDS];
try {
  PRODUCTION_TANK_IDS.splice(PRODUCTION_TANK_IDS.indexOf('leo2a7v'), 1);
  assert.equal(isPublicWreckDonor('leo2a7v'), false, 'eligibility is not an import-time snapshot');
  assert.ok(!resolveWreckRoster('modern').includes('leo2a7v'));
  assert.deepEqual(resolveWreckRoster('modern', ['leo2a7v', 'm1a2']), ['m1a2']);
  PRODUCTION_TANK_IDS.splice(0, PRODUCTION_TANK_IDS.length);
  for (const era of VEHICLE_ERA_ORDER) {
    assert.deepEqual(resolveWreckRoster(era), [], 'no eligible fleet means no invalid fallback');
    assert.deepEqual(resolveWreckRoster(era, ['m1a2', 'leo2a7']), []);
  }
} finally {
  PRODUCTION_TANK_IDS.splice(0, PRODUCTION_TANK_IDS.length, ...originalPublic);
}
for (const id of allDonors) {
  assert.equal(isTankBuilderReady(id), false, `${id}: policy selection never acquires geometry builders`);
}
console.log(`wreckRoster: ${allDonors.size} unique public donors; ordered filtering, live eligibility, empty/unknown fallback and builder-free selection pass`);
