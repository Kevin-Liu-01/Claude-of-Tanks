import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.js';
import { getSpec } from '../specs.js';
import { tankTier } from '../tier.ts';

const cases = Object.freeze({
  t64bv1: Object.freeze({ receiptKey: 't64BV1ChevronEraReceipt', forwardM: 0 }),
  t72bu: Object.freeze({ receiptKey: 't72BUChevronEraReceipt', forwardM: 0 }),
  t80u: Object.freeze({ receiptKey: 't80UChevronEraReceipt', forwardM: 0 }),
  t80bv: Object.freeze({ receiptKey: 't80BVChevronEraReceipt', forwardM: 0.18 }),
  ua_t80bv: Object.freeze({ receiptKey: 'uaT80ChevronEraReceipt', forwardM: 0.14 }),
  ua_t80u_kursk: Object.freeze({ receiptKey: 'uaT80ChevronEraReceipt', forwardM: 0.14 }),
  t90a: Object.freeze({ receiptKey: 't90AChevronEraReceipt', forwardM: 0.14 }),
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
    assert.equal(receipt.carrierSurfacesTotal,
      receipt.rowsPerCheek * receipt.carriersPerRow * 2,
      `${id}: mirrors the complete carrier topology`);
  } finally {
    tank.dispose();
  }
}

assert.equal(getSpec('t90m').name, 'T-90M');
assert.equal(tankTier('t90m'), 9, 'the retained T-90M occupies tier IX');
assert.equal(getSpec('t90m_proryv').name, 'T-90M Proryv');
assert.equal(tankTier('t90m_proryv'), 10, 'the new chevron Proryv occupies tier X');

console.log('sovietChevronEraFleet.selftest: per-family two-row carriers, exact tile seating, and T-90M progression verified');
