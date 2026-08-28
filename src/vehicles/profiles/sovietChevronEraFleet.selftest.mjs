import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.js';
import { getSpec } from '../specs.js';
import { tankTier } from '../tier.ts';

const cases = Object.freeze({
  t64bv1: 't64BV1ChevronEraReceipt',
  t72bu: 't72BUChevronEraReceipt',
  t80u: 't80UChevronEraReceipt',
  t80bv: 't80BVChevronEraReceipt',
  ua_t80bv: 'uaT80ChevronEraReceipt',
  ua_t80u_kursk: 'uaT80ChevronEraReceipt',
  t90a: 't90AChevronEraReceipt',
  t90: 't90ChevronEraReceipt',
  t90m_proryv: 't90MProryvChevronEraReceipt',
});

for (const [id, receiptKey] of Object.entries(cases)) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });
  try {
    const turret = tank.root.getObjectByName('rig_turret');
    const receipt = turret?.userData[receiptKey];
    assert.ok(receipt, `${id}: publishes its chevron ERA receipt`);
    assert.equal(receipt.rowsPerCheek, 2, `${id}: has two joined carrier rows per cheek`);
    assert.ok(receipt.carriersPerRow >= 2, `${id}: has multiple plan carriers per row`);
    assert.ok(receipt.tilesPerCarrierSurface >= 2, `${id}: has distinct ERA tiles on every carrier`);
    assert.equal(receipt.exactSurfaceOffsets, true, `${id}: derives tile faces from carrier planes`);
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
