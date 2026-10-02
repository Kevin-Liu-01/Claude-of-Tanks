import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { tankTier } from '../tier.ts';
import { FLEET_RENEWAL_DONORS } from '../fleetRenewalSpecs.ts';

// 2026-10-01: three former carrier builds are owner-directed rebuilds since 4c34b3e8b (fleet-renewal-publication-
// 20260930.md): t72bu on t72bu_x (its Kontakt chevrons, "lower ERA chevron halves restored on both BUs"), t80u (now
// the T-80UK) on t80u_x and t64bv1 on t72b3_x. Their reactive armour is the donor study's own construction, not this
// shared two-row carrier, so they leave the carrier cases below and are held to their donor's reactive sectors.
const REBUILT = Object.freeze({ t72bu: 't72bu_x', t80u: 't80u_x', t64bv1: 't72b3_x' });
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

const cases = Object.freeze({
  t80bv: Object.freeze({ receiptKey: 't80BVChevronEraReceipt', forwardM: 0.26, minimumRidgeY: 0.34 }),
  ua_t80bv: Object.freeze({ receiptKey: 'uaT80ChevronEraReceipt', forwardM: 0.23, minimumRidgeY: 0.32, omittedCarrierSurfaces: 1 }),
  ua_t80u_kursk: Object.freeze({ receiptKey: 'uaT80ChevronEraReceipt', forwardM: 0.14 }),
  t90a: Object.freeze({ receiptKey: 't90AChevronEraReceipt', forwardM: 0.24 }),
  t90a_burlak: Object.freeze({ receiptKey: 't90AChevronEraReceipt', forwardM: 0 }),
  t90a_vladimir: Object.freeze({ receiptKey: 't90aVladimirChevronEraReceipt', forwardM: 0.12 }),
  t90: Object.freeze({ receiptKey: 't90ChevronEraReceipt', forwardM: 0.27 }),
  t90m_proryv: Object.freeze({ receiptKey: 't90MProryvChevronEraReceipt', forwardM: 0 }),
});

for (const [id, expected] of Object.entries(cases)) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });
  try {
    const turret = tank.root.getObjectByName('rig_turret');
    const receipt = turret?.userData[expected.receiptKey];
    assert.ok(receipt, `${id}: publishes its chevron ERA receipt`);
    assert.equal(receipt.rowsPerCheek, 2, `${id}: has two joined carrier rows per cheek`);
    assert.ok(receipt.carriersPerRow >= 2, `${id}: has multiple plan carriers per row`);
    assert.ok(receipt.tilesPerCarrierSurface >= 2, `${id}: has distinct ERA tiles on every carrier`);
    assert.equal(receipt.exactSurfaceOffsets, true, `${id}: derives tile faces from carrier planes`);
    assert.equal(receipt.forwardM, expected.forwardM,
      `${id}: seats its chevrons on the variant's installed front datum`);
    if (expected.minimumRidgeY != null) {
      assert.ok(receipt.ridgeY >= expected.minimumRidgeY,
        `${id}: keeps both front chevron rows high on the turret cheek`);
    }
    assert.equal(receipt.carrierSurfacesOmitted, expected.omittedCarrierSurfaces ?? 0,
      `${id}: records only intentional equipment reliefs`);
    assert.equal(receipt.carrierSurfacesTotal + receipt.carrierSurfacesOmitted,
      receipt.rowsPerCheek * receipt.carriersPerRow * 2,
      `${id}: mirrors the complete carrier topology except explicit equipment notches`);
    if (id === 't80bv') {
      const hull = tank.root.getObjectByName('rig_hull');
      const bridges = hull?.userData.t80bvFenderBridgeReceipt;
      assert.ok(bridges, 't80bv: receipts the plan-contiguous fender transition');
      assert.equal(bridges.planSeamsOpen, 0);
      assert.ok(bridges.minimumShoeClearanceM > 0,
        't80bv: fender bridge remains physically above the animated shoe envelope');
    }
  } finally {
    tank.dispose();
  }
}

// 2026-09-15 owner roster pass: the T-90M X study carries the T-90M name; the retained hull is the T-90AM.
assert.equal(getSpec('t90m').name, 'T-90AM');
assert.equal(tankTier('t90m'), 9, 'the retained T-90AM occupies tier IX');
assert.equal(getSpec('t90m_proryv').name, 'T-90M Proryv');
assert.equal(tankTier('t90m_proryv'), 10, 'the new chevron Proryv occupies tier X');

console.log('sovietChevronEraFleet.selftest: per-family two-row carriers, exact tile seating, and T-90M progression verified');
