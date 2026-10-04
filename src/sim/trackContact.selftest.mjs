// The tracks' published ground contact (src/sim/trackContact.ts; physics lane round 8, the coordinator's ruling of
// 2026-10-04): every playable tank carries the receipt its builder lays, and no playable tank's receipt is the synthetic
// default line (0.45 x the hull's length either side of its root).
import assert from 'node:assert/strict';
import '../../tools/tank-surface-collect.mjs'; // node canvas shim for the three tanks built below
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { PRODUCTION_TANK_IDS, TANK_SPECS } from '../vehicles/specs.ts';
import { publishedTrackContact, validatedContactGeometry } from './trackContact.ts';

await ensureAuthorityFleet([...PRODUCTION_TANK_IDS]);

// 1. Every playable tank has a receipt, inside the sanity band, so none drives the default line.
const missing = [], defaulted = [];
let shortest = Infinity, longest = 0;
for (const id of PRODUCTION_TANK_IDS) {
  const spec = TANK_SPECS[id];
  const receipt = spec.armor?.trackContact;
  if (!receipt) { missing.push(id); continue; }
  const contact = publishedTrackContact(spec);
  assert.ok(contact, `${id}: a receipt validates to a contact`);
  const length = spec.dims.hullLengthM;
  if (Math.abs(contact.halfLenM - 0.45 * length) < 1e-6 && contact.zCenterM === 0) defaulted.push(id);
  assert.ok(contact.endRise, `${id}: the sprocket and idler ends rise`);
  assert.ok(receipt.halfLenM > 1 && receipt.halfLenM < 0.5 * length, `${id}: flat run ${receipt.halfLenM} m either side`);
  shortest = Math.min(shortest, 2 * contact.halfLenM);
  longest = Math.max(longest, 2 * contact.halfLenM);
}
assert.deepEqual(missing, [], 'every playable tank publishes its track contact (npm run tank:anatomy:update)');
assert.deepEqual(defaulted, [], 'no playable tank runs the synthetic default support line');

// 2. The published receipt is the drawn model's, validated the same way solo play validates it (game/state.ts).
const { createTank } = await import('../vehicles/tankFactory.ts');
for (const id of ['t90m', 'challenger_3x', 'udes03']) {
  const tank = createTank(id, null, { proceduralOnly: true, quality: 'low', batchStatic: false, decor: false });
  try {
    const drawn = validatedContactGeometry(tank.contactGeom, TANK_SPECS[id].dims);
    const published = publishedTrackContact(TANK_SPECS[id]);
    for (const key of ['halfLenM', 'halfWidM', 'zCenterM', 'bottomYM', 'panYM']) {
      assert.ok(Math.abs((published[key] ?? 0) - (drawn[key] ?? 0)) < 1e-3, `${id}: ${key} ${published[key]} published, ${drawn[key]} drawn`);
    }
    for (const key of ['dzM', 'frontM', 'rearM']) {
      assert.ok(Math.abs(published.endRise[key] - drawn.endRise[key]) < 1e-3, `${id}: endRise.${key}`);
    }
  } finally {
    tank.dispose?.();
  }
}

console.log(`trackContact.selftest: ${PRODUCTION_TANK_IDS.length} playable tanks publish their track contact `
  + `(flat runs ${shortest.toFixed(2)}-${longest.toFixed(2)} m), the drawn and published receipts agree`);
