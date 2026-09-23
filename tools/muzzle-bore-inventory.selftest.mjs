// Owner 2026-09-22: "the point of adding holes instead of carving them into the barrel is that we
// save on triangles, so actually check for this and make sure were saving the triangles here".
// Holes are added (the factory's fallback assembly), not carved into the barrel; the only carved
// recesses allowed are declared, ray-verified physical bores measured from a source model.
import assert from 'node:assert/strict';
import { ALLOWED_BORE_METHODS, inventoryOne } from './muzzle-bore-inventory.mjs';

// The §B3.1 hulls that carved a funnel/torus/disc recess under the fallback until this round,
// the Chieftain Mk10 X whose undeclared 32 cm bore sat hidden behind the fallback disc, and the
// fourteen bespoke lofts closed the same evening (round 40): each turned into its measured source
// bore behind the fallback disc (ariete C1/C2 1.344 m, JPz E100 1.342 m, T-90MS 1.303 m, AMX-40
// 1.236 m, T-72B3M 0.697 m, Chieftain 5 0.563 m, T-90/Burlak 0.406 m, AMX-30 0.314 m, Leopard 2A6
// 0.260 m open jacket, Challenger 1 0.116 m octagonal throat, T-72BU 0.106 m, Ares L111A1 35 mm)
// and now ends on one flat cap at the mouth; the depths stay recorded in their own receipts.
const CONVERTED = ['k2b', 'k1a1', 'type10', 'spz_puma', 'chieftain_mk10_x',
  'ariete_c1_x', 'ariete_c2_x', 'ares_apc_x', 'leo2a6_x', 'amx30_x', 'jpz_e100_x', 'amx40_x',
  't72b3m_x', 'challenger1_x', 't72bu_x', 'chieftain5_x', 't90_x', 't90a_burlak_x', 't90ms_x'];
for (const id of CONVERTED) {
  for (const quality of ['high', 'low']) {
    const row = inventoryOne(id, quality);
    assert.equal(row.method, 'fallback-only', `${id} ${quality}: the fallback assembly is the only mouth (${row.method})`);
    // No inward-facing wall stock or deep floor remains; near-mouth furniture (the Chieftain's MRS
    // bracket, brake baffles) is reported as FURNITURE, never counted as carved.
    assert.equal(row.recess.carvedTris, 0, `${id} ${quality}: no recess remains in the barrel buckets (${row.recess.nonSkinTris} furniture triangles)`);
    assert.ok(row.recess.deepestM <= 0.034, `${id} ${quality}: the barrel face sits at the mouth, not down a carved throat (${row.recess.deepestM})`);
    assert.ok(row.seatPass, `${id} ${quality}: muzzle-seat policy holds on the flat cap`);
    // 2026-09-22 (owner: "make sure were saving the triangles"): the added hole is a flat ring 2N + the
    // disc N, plus a 2N throat sleeve only when the authored tube stops short of the marker — never the
    // former 13N torus assembly.
    const sleeveN = row.fallback.throat ? 2 : 0;
    assert.equal(row.fallback.total, (3 + sleeveN) * row.nBore * row.expectedBores,
      `${id} ${quality}: the hole as built is ring 2N + disc N (+ throat 2N) (${JSON.stringify(row.fallback)})`);
    assert.ok(row.fallback.total <= 5 * row.nBore * row.expectedBores, `${id} ${quality}: at most 5N per mouth`);
  }
}

// A declared physical bore keeps its measured recess and passes the seat policy under node with the
// same assembled disc-depth witness the browser probe adds.
const physical = inventoryOne('kf41_lynx_x', 'high');
assert.equal(physical.method, 'physical-declared');
assert.ok(physical.recess.carvedTris > 0 && physical.recess.deepestM > 0.1, 'kf41 keeps its source-measured 11 cm recess');
assert.ok(physical.seatPass, 'physical-recess-r1 receipts pass the seat policy under node');
// 2026-09-22: a verified physical recess is its own rim and annulus; the factory adds only the shadow disc.
assert.equal(physical.fallback.rim + physical.fallback.throat, 0, 'no barrel-paint fallback rim or throat duplicates the physical mouth');
assert.equal(physical.fallback.total, physical.fallback.disc, 'the physical mouth carries the shadow disc alone');
assert.ok(physical.fallback.disc > 0, 'the shadow disc keeps the near-black floor read');

// Plain capped tubes read fallback-only; sealed launch canisters have no cannon bore at all.
assert.equal(inventoryOne('m1a2', 'high').method, 'fallback-only');
assert.equal(inventoryOne('aft10_x', 'high').method, 'none');
for (const method of ['fallback-only', 'physical-declared', 'none']) assert.ok(ALLOWED_BORE_METHODS.includes(method));
assert.ok(!ALLOWED_BORE_METHODS.includes('authored-recess') && !ALLOWED_BORE_METHODS.includes('carved-undeclared'),
  'a recess carved under the fallback is never an allowed method');

console.log('muzzle-bore-inventory.selftest: converted hulls carry only the added hole, declared physical bores keep their measured recess, carved-under-fallback is never allowed');
