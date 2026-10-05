// The tracks' published ground contact (src/sim/trackContact.ts; physics lane round 8, the coordinator's ruling of
// 2026-10-04): every playable tank carries the receipt its builder lays, the host and solo play read the same contact,
// and no playable tank falls back to the synthetic default line (0.45 x the hull's length either side of its root).
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import '../../tools/tank-surface-collect.mjs'; // node canvas shim for the three tanks built below
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { PRODUCTION_TANK_IDS, TANK_SPECS } from '../vehicles/specs.ts';
import { publishedTrackContact, validatedContactGeometry } from './trackContact.ts';
import { createTankState, updateTank, SIM_DT } from './movement.ts';

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

// 3. The host and solo play drive the same tank: the host stamps no contact, solo play stamps the drawn model's, and
// the published receipt governs both, so over rolling ground at speed they agree step for step. Before, the host ran
// 0.9 x the hull's length on its root.
{
  const id = 't90m';
  const spec = TANK_SPECS[id];
  const tank = createTank(id, null, { proceduralOnly: true, quality: 'low', batchStatic: false, decor: false });
  const drawn = validatedContactGeometry(tank.contactGeom, spec.dims);
  tank.dispose?.();
  const ground = (x, z) => 0.6 * Math.sin(z / 4.1) + 0.25 * Math.sin(x / 3.3 + z / 7.7);
  const field = { getHeightAt: ground, getHeightAtFast: ground, getGroundType: () => 'medium' };
  const drive = (contactGeom) => {
    const state = createTankState(spec, new Vector3(0, ground(0, 0), 0), 0.3);
    const entity = { spec, state, combat: null, contactGeom, input: { throttle: 1, steer: 0.2, brake: false, aimPoint: null } };
    const trace = [];
    for (let tick = 0; tick < 240; tick++) {
      updateTank(entity, field, SIM_DT);
      trace.push([state.pos.x, state.pos.y, state.pos.z, state.visualPitch, state.visualRoll]);
    }
    return trace;
  };
  const host = drive(null), solo = drive(drawn);
  let worst = 0;
  for (let tick = 0; tick < host.length; tick++) {
    for (let k = 0; k < 5; k++) worst = Math.max(worst, Math.abs(host[tick][k] - solo[tick][k]));
  }
  assert.ok(worst < 1e-6, `the host and solo play drive the T-90M alike over rolling ground (worst difference ${worst})`);
}

console.log(`trackContact.selftest: ${PRODUCTION_TANK_IDS.length} playable tanks publish their track contact `
  + `(flat runs ${shortest.toFixed(2)}-${longest.toFixed(2)} m), the drawn and published receipts agree, the host's solve reads it`);
