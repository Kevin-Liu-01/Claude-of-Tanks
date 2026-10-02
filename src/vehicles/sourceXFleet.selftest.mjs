import assert from 'node:assert/strict';
import { createTank } from './tankFactory.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { SOURCE_X_IDS, SOURCE_X_DONORS } from './sourceXFleetSpecs.ts';
import { PROCEDURAL_PROFILES } from './profiledProcedurals.ts';
import { FLEET_GROUP_BY_ID } from './fleetManifest.ts';
import { geometryFingerprint } from './tankAssets.ts';
import { tankTier } from './tier.ts';
import { k2SourceMetadata } from './xk2Specs.ts';
import { donorSpec } from './donorSpecs.ts';
import { assertCurrentT90MLampSeats } from './historicalT90MLamps.test-support.mjs';

// 2026-09-15 owner rulings: the four T-90 X studies are tier X ("all should be tier 10 and prominent");
// evening: "make the leopard 2a5m, leopard 2a5, leopard 2a6 tier 10" (the 2A5M and 2A5 studies live here).
// Every other X study still may not out-tier its donor without an explicit ruling here.
// 2026-09-23 (owner: "no hidden tanks"): the merkava4 donor record retired, so tier.ts no longer carries the row the
// no-implicit-increase check read for its study; the donor's last published tier (IX at a10d0a30b) is pinned here.
const OWNER_TIER_RULINGS = Object.freeze({ k2_x: 10, t90a_x: 10, t90a_vladimir_x: 10, t90m_x: 10, t90sm_x: 10, leo2a4m_x: 10, leo2a5_x: 10,
  merkava4_x: 9 });
// Donor records retired with the hidden fleet (2026-09-23): no buildable original remains to differ from.
const RETIRED_DONORS = new Set(['merkava4']);

// 2026-10-01 (owner: retire frozen pins): the pinned donor fingerprints, the XK2/Leopard owner-rebuild pins
// and the historical T-90M lamp-pose inverse are gone; the fleet geometry ledger owns whole-tank change
// detection. Each X study is now compared with its donor built live in the same run.
const options = { proceduralOnly:true, geometryReceipt:true, quality:'high', camoSeed:4242 };
const donorFingerprints = new Map();
for (const donor of new Set(Object.values(SOURCE_X_DONORS))) {
  if (RETIRED_DONORS.has(donor)) continue;
  assert.ok(ALL_TANK_IDS.includes(donor), `${donor}: registered donor`);
  const tank = createTank(donor, null, options);
  try {
    if (donor === 't90m') assertCurrentT90MLampSeats(tank);
    donorFingerprints.set(donor, geometryFingerprint(tank.root));
  } finally { tank.dispose(); }
}
assert.equal(SOURCE_X_IDS.length, 13);
for (const id of SOURCE_X_IDS) {
  const donor = SOURCE_X_DONORS[id], spec = TANK_SPECS[id], donorRow = donorSpec(TANK_SPECS, donor);
  assert.equal(ALL_TANK_IDS.filter(value => value === id).length, 1, `${id}: exactly one selectable row`);
  // 2026-09-15 owner roster pass: the X suffix is retired — the study carries the canonical public name
  assert.ok(!spec.name.endsWith(' X'), `${id}: no X suffix on a shipped study`);
  assert.equal(tankTier(id), OWNER_TIER_RULINGS[id] ?? tankTier(donor), `${id}: no implicit combat tier increase`);
  assert.equal(MODEL_SOURCE[id].source, 'procedural');
  assert.equal(spec.community, undefined);
  assert.ok(FLEET_GROUP_BY_ID[id].endsWith('X'), `${id}: independently demand-loaded builder`);
  assert.equal(typeof PROCEDURAL_PROFILES[id].build, 'function');
  assert.notEqual(PROCEDURAL_PROFILES[id].build, PROCEDURAL_PROFILES[donor]?.build);
  assert.deepEqual(spec.gun, donor === 'k2' ? k2SourceMetadata().gun : donorRow.gun,
    `${id}: production donor combat balance remains independent of the XK2 hybrid`);
  assert.equal(spec.hp, donorRow.hp);
  assert.notEqual(spec.armor, donorRow.armor);
  const tank = createTank(id, null, options);
  try {
    assert.ok(tank.root.getObjectByName('hull')?.geometry);
    assert.ok(tank.root.getObjectByName('turret')?.geometry);
    if (donorFingerprints.has(donor)) assert.notEqual(geometryFingerprint(tank.root), donorFingerprints.get(donor),
      `${id}: genuinely new authored geometry, not its live donor`);
  } finally { tank.dispose(); }
}
console.log(`sourceXFleet: ${donorFingerprints.size} live donor builds (T-90M lamp seats checked); 13 independent procedural X builds differ from their donors; identities and combat metadata pass`);
