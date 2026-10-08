// The scenery lane's prop damage kit (b39; docs/DESTRUCTION.md §16.5-16.7): every destructible kind with a broken state
// is described from its own intact build (its materials in its type's bucket, a vertex-coloured kind's own colours)
// and throws its debris deterministically, inside the writer's cap, along the blow, sized and placed by the prop.
import assert from 'node:assert/strict';
import { DESTRUCTIBLE_TYPES } from './inhabitKit.ts';
import { SCENERY_DESTRUCTIBLE_TYPES } from './sceneryKit.ts';
import { HAYSTACK_DESTRUCTIBLE_TYPES } from './haystackKit.ts';
import { SCENERY_PROP_DAMAGE_KIT } from './propDamageKits.ts';
import { propDamageKitFor } from '../destructionKit.ts';

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function writer(capacity) {
  const pieces = [];
  return {
    pieces,
    push(...args) { if (pieces.length >= capacity) return false; pieces.push(args); return true; },
    get count() { return pieces.length; },
    capacity,
  };
}

assert.equal(propDamageKitFor('stall'), SCENERY_PROP_DAMAGE_KIT, 'the kit is every prop\'s (registered as the default)');
assert.equal(propDamageKitFor('meule'), SCENERY_PROP_DAMAGE_KIT);

const types = { ...SCENERY_DESTRUCTIBLE_TYPES, ...HAYSTACK_DESTRUCTIBLE_TYPES, ...DESTRUCTIBLE_TYPES };
let kinds = 0, thrown = 0;
for (const [kind, meta] of Object.entries(types)) {
  if (!meta.broken) continue;
  const geometry = meta.build(mulberry32(7));
  const anatomy = SCENERY_PROP_DAMAGE_KIT.describe({ propIdx: 3, kind, mat: meta.mat, geometry, radiusM: meta.r, heightM: meta.h, seed: 0x5eed + kinds });
  geometry.dispose();
  assert.ok(anatomy.fracture.length >= 1, `${kind}: names what it breaks into`);
  const share = anatomy.fracture.reduce((s, slot) => s + slot.share, 0);
  assert.ok(Math.abs(share - 1) < 1e-9, `${kind}: its shares sum to one (${share})`);
  for (const slot of anatomy.fracture) {
    assert.equal(slot.bucket, meta.mat, `${kind}: in its type's own bucket`);
    assert.ok(slot.tint.every((c) => Number.isFinite(c) && c >= 0 && c <= 1.5), `${kind}: a tint in range`);
  }
  if (meta.mat === 'baked' && anatomy.fracture[0].material !== 'glass') {
    assert.ok(anatomy.fracture[0].tint.some((c) => c < 0.95), `${kind}: a vertex-coloured kind's debris wears its own colour`);
  }
  for (const [cause, dirX, dirZ] of [['blast', 1, 0], ['kinetic', 0.6, -0.8], ['ram', -1, 0]]) {
    const a = writer(400), b = writer(400);
    SCENERY_PROP_DAMAGE_KIT.debris(anatomy, cause, dirX, dirZ, a);
    SCENERY_PROP_DAMAGE_KIT.debris(anatomy, cause, dirX, dirZ, b);
    assert.deepEqual(a.pieces, b.pieces, `${kind}/${cause}: the same blow throws the same pieces`);
    assert.ok(a.count >= 3, `${kind}/${cause}: throws something`);
    let along = 0;
    for (const [bucket, , variant, px, py, pz, qx, qy, qz, qw, sx, sy, sz, , , , vx, vy, vz] of a.pieces) {
      assert.equal(bucket, meta.mat);
      assert.ok(variant >= 0 && variant < 4);
      assert.ok(Math.abs(Math.hypot(qx, qy, qz, qw) - 1) < 1e-9, `${kind}: a unit quaternion`);
      assert.ok(Math.hypot(px, pz) <= meta.r * 1.2 + 0.01 && py >= 0 && py <= meta.h + 0.01, `${kind}: thrown from the prop's body`);
      assert.ok([sx, sy, sz].every((s) => s > 0.005 && s < 1.6), `${kind}: a piece sized to it`);
      assert.ok(vy > 0, `${kind}: thrown up`);
      if (vx * dirX + vz * dirZ > 0) along++;
    }
    assert.ok(along === a.count, `${kind}/${cause}: every piece along the blow (${along}/${a.count})`);
    thrown += a.count;
  }
  // the writer's cap: the kit stops at it
  const capped = writer(2);
  SCENERY_PROP_DAMAGE_KIT.debris(anatomy, 'blast', 0, 1, capped);
  assert.equal(capped.count, 2, `${kind}: stops at the writer's cap`);
  kinds++;
}
assert.ok(kinds >= 40, `every kind with a broken state is covered (${kinds})`);
console.log(`propDamageKits.selftest: ${kinds} kinds described and ${thrown} pieces thrown, deterministic, capped, along the blow`);
