// Owner 2026-10-08: every cannon gets a real bore with a sparse interior; flat masks are retired.
import assert from 'node:assert/strict';
import { ALLOWED_BORE_METHODS, inventoryOne } from './muzzle-bore-inventory.mjs';

// Representative formerly capped tubes, shaped brakes and low-detail mouths.
// Their outer source geometry remains covered by separate profile regressions.
const CONVERTED = ['k2b', 'k1a1', 'type10', 'spz_puma', 'chieftain_mk10_x',
  'ariete_c1_x', 'ariete_c2_x', 'ares_apc_x', 'leo2a6_x', 'amx30_x', 'jpz_e100_x', 'amx40_x',
  't72b3m_x', 'challenger1_x', 't72bu_x', 'chieftain5_x', 't90_x', 't90a_burlak_x', 't90ms_x', 'm60a2'];
for (const id of CONVERTED) {
  for (const quality of ['high', 'low']) {
    const row = inventoryOne(id, quality);
    assert.equal(row.method, 'physical-carved', `${id} ${quality}: native muzzle has a verified physical recess`);
    assert.ok(row.recess.inwardWallTris >= 12, `${id} ${quality}: real inward-facing stock is present`);
    assert.ok(row.seatPass, `${id} ${quality}: native rim, wall and floor pass the ray course`);
    assert.equal(row.fallback.total, 0, `${id} ${quality}: no flat black mask or overlaid ring remains`);
    assert.equal(row.conversion.interiorTriangles, 34 * row.expectedBores,
      `${id} ${quality}: one sparse wall and floor per mouth`);
    assert.ok(row.conversion.removedTriangles > 0, `${id} ${quality}: actual native cap stock was removed`);
  }
}

// A declared physical bore keeps its measured recess and passes the seat policy under node with the
// same assembled disc-depth witness the browser probe adds.
const physical = inventoryOne('kf41_lynx_x', 'high');
assert.equal(physical.method, 'physical-declared');
assert.ok(physical.recess.carvedTris > 0 && Math.abs(physical.recess.deepestM - .11 * .90) < .002,
  'KF41 keeps its measured 11 cm recess at the owner-approved 0.90 vehicle scale');
assert.ok(physical.seatPass, 'authored physical receipts pass the seat policy under node');
// An authored physical recess supplies its own rim, walls and backstop.
assert.equal(physical.fallback.rim + physical.fallback.throat, 0, 'no barrel-paint fallback rim or throat duplicates the physical mouth');
assert.equal(physical.fallback.total, physical.fallback.disc, 'the physical mouth has no generated overlay');
assert.equal(physical.fallback.disc, 0, 'the real recessed floor needs no second dark overlay');

// Formerly capped tubes are carved; sealed launch canisters are not cannons.
assert.equal(inventoryOne('m1a2', 'high').method, 'physical-carved');
assert.equal(inventoryOne('aft10_x', 'high').method, 'none');
for (const method of ['physical-carved', 'physical-declared', 'none']) assert.ok(ALLOWED_BORE_METHODS.includes(method));
assert.ok(!ALLOWED_BORE_METHODS.includes('fallback-only') && !ALLOWED_BORE_METHODS.includes('authored-recess') && !ALLOWED_BORE_METHODS.includes('carved-undeclared'),
  'a recess carved under the fallback is never an allowed method');

console.log('muzzle-bore-inventory.selftest: converted hulls have native open mouths, authored bores retain their depth, no flat overlays remain');
