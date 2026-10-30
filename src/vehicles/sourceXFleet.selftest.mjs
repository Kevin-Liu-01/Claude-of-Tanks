import assert from 'node:assert/strict';
import { createTank } from './tankFactory.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { SOURCE_X_IDS, SOURCE_X_DONORS } from './sourceXFleetSpecs.ts';
import { PROCEDURAL_PROFILES } from './profiledProcedurals.ts';
import { FLEET_GROUP_BY_ID } from './fleetManifest.ts';
import { geometryFingerprint } from './tankAssets.ts';
import { tankTier } from './tier.ts';
import { displayTier } from '../techTree/tiers.ts';
import { k2SourceMetadata } from './xk2Specs.ts';
import { donorSpec } from './donorSpecs.ts';
import { VEHICLE_ROLE_PROFILES } from './roleProfiles.ts';
import { tacticalRoleHandling } from './tacticalRoleBalance.ts';

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
    donorFingerprints.set(donor, geometryFingerprint(tank.root));
  } finally { tank.dispose(); }
}
// 2026-10-01: the role balance (0e5fc79e2, tacticalRoleBalance.ts) layers each vehicle's doctrine onto its aim time,
// base accuracy and movement/traverse bloom after donor synchronization. A retired donor template (merkava4) or the
// XK2 source metadata carries no doctrine, so its study must equal that pre-role gun with the study's own doctrine
// applied (merkava4: assault; k2_black_panther: flanker), field for field. A registered donor carries its own doctrine.
const roleTuned = (id, gun) => VEHICLE_ROLE_PROFILES[id]
  ? tacticalRoleHandling({ hullTraverseDegS: 0, turretTraverseDegS: 0, gun }, VEHICLE_ROLE_PROFILES[id].doctrine).gun : gun;
assert.equal(SOURCE_X_IDS.length, 13);
for (const id of SOURCE_X_IDS) {
  const donor = SOURCE_X_DONORS[id], spec = TANK_SPECS[id], donorRow = donorSpec(TANK_SPECS, donor);
  assert.equal(ALL_TANK_IDS.filter(value => value === id).length, 1, `${id}: exactly one selectable row`);
  // 2026-09-15 owner roster pass: the X suffix is retired — the study carries the canonical public name
  assert.ok(!spec.name.endsWith(' X'), `${id}: no X suffix on a shipped study`);
  // 258: a study's tier is its reviewed column in the tree table (src/techTree/tiers.ts, pinned by techTree.selftest's
  // digest), never one a rebuild inherits from its donor
  assert.equal(tankTier(id), displayTier(id), `${id}: matches at its shown tier`);
  assert.equal(MODEL_SOURCE[id].source, 'procedural');
  assert.equal(spec.community, undefined);
  assert.ok(FLEET_GROUP_BY_ID[id].endsWith('X'), `${id}: independently demand-loaded builder`);
  assert.equal(typeof PROCEDURAL_PROFILES[id].build, 'function');
  // An X that took its donor template's name in the schema-3 rename (merkava4_x -> merkava4, t72b3_x -> t72b3, ...)
  // shares the donor's id string, so the donor's builder cannot be looked up by it: it must own an X builder.
  if (donor === id) assert.match(PROCEDURAL_PROFILES[id].build.name, /X$/, `${id}: its own X builder, not its donor template's`);
  else assert.notEqual(PROCEDURAL_PROFILES[id].build, PROCEDURAL_PROFILES[donor]?.build);
  const templateGun = donor === 'xk2_black_panther' ? k2SourceMetadata().gun : RETIRED_DONORS.has(donor) ? donorRow.gun : null;
  assert.deepEqual(spec.gun, templateGun ? roleTuned(id, templateGun) : donorRow.gun,
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
