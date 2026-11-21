import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { tankTier } from '../tier.ts';
import { FLEET_RENEWAL_DONORS } from '../fleetRenewalSpecs.ts';

// 2026-10-01: three former carrier builds are owner-directed rebuilds since 4c34b3e8b (fleet-renewal-publication-
// 20260930.md): t72bu_1989 on t72bu (its Kontakt chevrons, "lower ERA chevron halves restored on both BUs"), t80uk (now
// the T-80UK) on t80u and t64bv1 on t72b3. Their reactive armour is the donor study's own construction, not this
// shared two-row carrier, so they leave the carrier cases below and are held to their donor's reactive sectors.
// 2026-10-22: the T-64BV1 is on the T-72B3 study under the Kontakt-1 layout (t64bvK1.ts: glacis courses, skirt
// containers and turret horseshoe); its containers still fill exactly the B3 frame's six gameplay sectors.
const REBUILT = Object.freeze({ t72bu_1989: 't72bu', t80uk: 't80u', t64bv1: 't72b3' });
const eraSectors = (id) => {
  const tank = createTank(id, null, { proceduralOnly: true, quality: 'high', camoSeed: 4242, geometryReceipt: true });
  try { return [...(tank.root.userData.eraFinishReceipt?.sectors ?? [])].sort(); } finally { tank.dispose(); }
};
for (const [id, donorId] of Object.entries(REBUILT)) {
  assert.equal(FLEET_RENEWAL_DONORS[id], donorId, `${id}: the renewal rebuilds it on ${donorId}`);
  const sectors = eraSectors(id);
  assert.ok(sectors.length > 0, `${id}: keeps live reactive sectors`);
  assert.deepEqual(sectors, eraSectors(donorId), `${id}: carries exactly its donor study's reactive sectors`);
}

// 2026-10-30 (lane t90-family-266, 50854bcefb; the owner: "take inspirration annd update from the later t90s we added
// that have far more accurate models"): the earlier T-90 marks build from their source-X twins (t90XTwins.selftest.mjs)
// and carry the twins' measured Kontakt-5 / Relikt construction, not this shared two-row carrier. They leave the carrier
// cases and are held to their twin's reactive sectors (the twins' zones: t90XEraBindings.selftest.mjs).
const T90_TWINS = Object.freeze({ t90_1992: 't90', t90a_2004: 't90a', t90a_2006: 't90a_vladimir', t90a_burlak_proto: 't90a',
  t90m_proryv: 't90m' });
for (const [id, twinId] of Object.entries(T90_TWINS)) {
  const sectors = eraSectors(id);
  assert.ok(sectors.includes('turret_era_L') && sectors.includes('turret_era_R'), `${id}: keeps live turret reactive sectors`);
  assert.deepEqual(sectors, eraSectors(twinId), `${id}: carries exactly its source-X twin ${twinId}'s reactive sectors`);
}

// 274: the shared two-row carrier (sovietChevronEra.ts) is retired with its last build: the T-80BV draws its photographed
// Kontakt-1 wedge arrays and the T-80U Kursk the T-80U X's Kontakt-5 (t80Marks.selftest.mjs pins both).

// 2026-09-15 owner roster pass: the T-90M X study carries the T-90M name; the retained hull is the T-90AM.
// 2026-10-27 owner names (display only, ids unchanged): the X study is the T-90M Proryv, the tier X chevron the T-90AM II.
assert.equal(getSpec('t90am').name, 'T-90AM');
assert.equal(tankTier('t90am'), 9, 'the retained T-90AM occupies tier IX');
assert.equal(getSpec('t90m').name, 'T-90M Proryv', 'the source-X T-90M study is the T-90M Proryv');
assert.equal(getSpec('t90m_proryv').name, 'T-90AM II', 'the tier X chevron configuration is the T-90AM II');
assert.equal(tankTier('t90m_proryv'), 10, 'the T-90AM II chevron occupies tier X');

console.log('sovietChevronEraFleet.selftest: rebuilt and source-X twins carry their donors\' reactive sectors; T-90M progression verified');
