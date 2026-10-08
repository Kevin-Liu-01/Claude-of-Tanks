import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import { createHeightField, mulberry32 } from '../terrain.ts';
import { planGroundedObbPose } from '../propPlacement.ts';
import { MAP_IDS, getMapConfig } from './index.ts';
import { BOAT_FAMILIES, familyBoat } from './boatHulls.ts';

// Exercise the exact private production constructor without adding a runtime
// export or duplicating its geometry/placement implementation in the test.
const kitUrl = new URL('./mapKits.ts', import.meta.url).href;
const hook = registerHooks({ load(url, context, next) {
  const result = next(url, context);
  return url === kitUrl ? { ...result, source: `${result.source}\nexport { beachedBoat };` } : result;
} });
const { dressMapExtras, beachedBoat } = await import(kitUrl);
hook.deregister();
const names = ['plaster', 'plaster2', 'plaster3', 'roof', 'stone', 'wood',
  'dark', 'glass', 'curtain', 'straw', 'baked'];
const consumers = ['coastal', 'fjord', 'mangrove', 'saltwind'];
assert.deepEqual(MAP_IDS.filter(id => {
  const p = getMapConfig(id).props;
  return (p.extraKits || (id === 'coastal' ? ['coastal'] : [])).includes('coastal')
    || Boolean(p.riverLandings?.length);
}), consumers, 'cover every actual beachedBoat caller, including authored dry landings');

function capture() {
  const buckets = Object.fromEntries(names.map(name => [name, []]));
  const boats = [], receipts = [];
  receipts.push = receipt => {
    // the beached boat is one painted hull (maps/boatHulls.ts, the map-vehicles lane, P2): the bucket's last geometry
    if (receipt.kind === 'beached-boat') boats.push({ receipt, hull: buckets.baked.at(-1) });
    return Array.prototype.push.call(receipts, receipt);
  };
  return { buckets, boats, receipts };
}

function inventory(built) {
  const boatSet = new Set(built.boats.map(boat => boat.hull));
  const other = createHash('sha256'), boat = createHash('sha256');
  let vertices = 0, indices = 0, bytes = 0, geometries = 0;
  for (const name of names) {
    other.update(name); boat.update(name);
    for (const g of built.buckets[name]) {
      const hash = boatSet.has(g) ? boat : other;
      geometries++; vertices += g.attributes.position.count;
      indices += g.index?.count ?? g.attributes.position.count;
      for (const key of Object.keys(g.attributes).sort()) {
        const a = g.attributes[key].array;
        const b = Buffer.from(a.buffer, a.byteOffset, a.byteLength);
        bytes += a.byteLength; hash.update(key); hash.update(b);
      }
      if (g.index) {
        const a = g.index.array;
        bytes += a.byteLength; hash.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
      }
    }
  }
  return { other: other.digest('hex'), boat: boat.digest('hex'), vertices, indices, bytes, geometries };
}

function build(mapId, seed) {
  const config = getMapConfig(mapId);
  const field = createHeightField(seed, config);
  const built = capture(), random = mulberry32(seed ^ 0x5a17);
  let calls = 0;
  dressMapExtras({ mapId, extraKits: config.props.extraKits,
    riverLandings: config.props.riverLandings, L: field._layout, heightField: field,
    rng: () => { calls++; return random(); }, buckets: built.buckets, groundingReceipts: built.receipts });
  return { ...built, field, calls, next: random() };
}

function dispose(built) {
  for (const geometries of Object.values(built.buckets)) for (const g of geometries) g.dispose();
}

// The map-vehicles lane (P2, 2026-10-05): the boats are lofted hulls (maps/boatHulls.ts), one painted geometry each in
// the props' baked bucket. Every consumer places them seated shallowly on their own keel and bilge, upper strakes and
// gunwales clear of the beach, a mast standing on the boats that carry one; the kits still draw exactly what the box
// boats drew (the stream pins below hold every later piece of dressing in place) and a rebuild is byte-identical.
const STREAM = {"coastal/1337":[1428,0.9317218211945146],"coastal/2049":[1465,0.6188307891134173],"coastal/7719":[1483,0.13037028862163424],"fjord/1337":[1113,0.11280965339392424],"fjord/2049":[1113,0.03331061592325568],"fjord/7719":[1113,0.8480063327588141],"mangrove/1337":[948,0.8354170476086438],"mangrove/2049":[1171,0.2525088486727327],"mangrove/7719":[1154,0.6781580389942974],"saltwind/1337":[327,0.49958163732662797],"saltwind/2049":[327,0.5719069924671203],"saltwind/7719":[327,0.3591820828150958]};
function auditBoat(boat, field) {
  const { hull, receipt } = boat;
  assert.ok(hull, 'the hull is in the painted bucket');
  assert.deepEqual(Object.keys(hull.attributes).sort(), ['color', 'normal', 'position', 'uv']);
  for (const attr of Object.values(hull.attributes)) assert.ok(attr.array.every(Number.isFinite));
  const p = hull.attributes.position;
  let low = Infinity;
  for (let i = 0; i < p.count; i++) low = Math.min(low, p.getY(i));
  let minGap = Infinity, maxGap = -Infinity;
  for (let i = 0; i < p.count; i++) {
    const gap = p.getY(i) - field.getHeightAt(p.getX(i), p.getZ(i));
    if (p.getY(i) <= low + 0.16) minGap = Math.min(minGap, gap);
    maxGap = Math.max(maxGap, gap);
  }
  // round 4 (the map-vehicles lane, wave 260: the Mangrove hull "placed rather than beached… no sink"): a river
  // landing's hauled-out hull (its receipt carries `mud`) lies sunk 9 cm in its mud; a beach's boat seats as before
  const sink = receipt.mud ? .09 : .035;
  assert.ok(minGap >= -sink - .004 - 1e-9, `the keel and bilge seat shallowly, never buried: ${minGap}`);
  assert.ok(maxGap > .25, 'the upper strakes and gunwales stand clear of the beach');
  assert.ok(Math.abs(receipt.baseClearance + sink) < 1e-12);
  return { minGap, maxGap };
}

let realBoats = 0, deepest = 0, closest = Infinity;
for (const seed of [1337, 2049, 7719]) for (const mapId of consumers) {
  const built = build(mapId, seed), stats = inventory(built);
  try {
    // Round 47 follow-up: a shore may author `boats: 0` on every lake (Nordhavn's fjord arms). That is a deliberate
    // opt-out, not vacuous coverage.
    const optedOut = (getMapConfig(mapId).terrain.lakes ?? []).every(lake => lake.boats === 0);
    assert.ok(built.boats.length > 0 || optedOut, 'no vacuous production consumer coverage');
    if (optedOut) assert.equal(built.boats.length, 0, `${mapId}: an authored zero places no boat`);
    for (const boat of built.boats) {
      const audit = auditBoat(boat, built.field);
      deepest = Math.min(deepest, audit.minGap); realBoats++;
    }
    // boats drawn up on one shore lie apart (the map-vehicles lane, 2026-10-06): no two hulls' seats within 6.5 m, so
    // no hull runs into another (Coastal's pair sat 4.1 m apart)
    const seats = built.boats.map((boat) => boat.receipt);
    for (let i = 0; i < seats.length; i++) for (let k = i + 1; k < seats.length; k++) {
      const apart = Math.hypot(seats[i].x - seats[k].x, seats[i].z - seats[k].z);
      closest = Math.min(closest, apart);
      assert.ok(apart >= 6.5, `${mapId}/${seed}: two beached boats ${apart.toFixed(2)} m apart`);
    }
    assert.deepEqual([built.calls, built.next], STREAM[`${mapId}/${seed}`], `${mapId}/${seed}: the kits draw what the box boats drew`);
    const repeated = build(mapId, seed);
    assert.deepEqual(inventory(repeated), stats, 'boat and kit bytes are deterministic');
    assert.deepEqual([repeated.calls, repeated.next], [built.calls, built.next], 'the rebuild draws the same seeded stream');
    assert.deepEqual([...repeated.receipts], [...built.receipts]);
    dispose(repeated);
  } finally { dispose(built); }
}
console.log(`beachedBoat.selftest: ${realBoats} hulls seated; worst penetration ${deepest} m; the closest two ${closest.toFixed(2)} m apart; `
  + 'the kits\' streams as the box boats left them');

for (const slope of [0, .16, -.24]) for (const yaw of [0, .71, 2.8]) for (const seed of [1337, 2049, 7719]) for (const withMast of [true, false]) {
  let queries = 0;
  const field = { getHeightAt: (x, z) => { queries++; return slope * x + slope * z * .35
    + (slope ? .018 * Math.sin(x * .7) * Math.cos(z * .5) : 0); },
  getWaterMaskAt: () => 0, _roadDist: () => 100 };
  const random = mulberry32(seed), built = capture();
  let calls = 0;
  beachedBoat(built.buckets, () => { calls++; return random(); }, field, 20, -30, yaw, withMast, built.receipts);
  try {
    const boat = built.boats[0];
    auditBoat(boat, field);
    assert.equal(calls, withMast ? 49 : 48, 'one length and the box boat\'s 47 draws (its boom swing with a mast)');
    // the hull is the family's boat at the drawn length, scheme and mast, heeled about its length, laid on the kit's
    // yaw and the ground plane, and seated on its keel: rebuilt here from the same draws it matches the production one
    const check = mulberry32(seed), L = 4.6 + check() * 1.2, draws = [];
    for (let k = 0; k < 47 + (withMast ? 1 : 0); k++) draws.push(check());
    const ref = familyBoat(BOAT_FAMILIES.canot, L, Math.floor(draws[7] * 97), withMast);
    const pose = planGroundedObbPose(field, 20, -30, L / 2, .8, yaw, .06);
    ref.rotateZ(0.10 + draws[6] * 0.08);
    ref.rotateY(yaw + Math.PI / 2);
    ref.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(pose.normalX, pose.normalY, pose.normalZ)));
    const a = boat.hull.attributes.position, b = ref.attributes.position;
    assert.equal(a.count, b.count, 'the same hull');
    const dy = a.getY(0) - b.getY(0);
    for (let i = 0; i < a.count; i += 7) {
      assert.ok(Math.abs(a.getX(i) - b.getX(i) - 20) < 1e-4 && Math.abs(a.getZ(i) - b.getZ(i) + 30) < 1e-4 && Math.abs(a.getY(i) - b.getY(i) - dy) < 1e-4,
        'the heel is a roll about the length, then the yaw and the ground plane: a rigid hull, nothing deformed');
    }
    // a mast stands well above a beached hull's gunwale on a boat that carries one
    let top = -Infinity;
    for (let i = 0; i < a.count; i++) top = Math.max(top, a.getY(i) - field.getHeightAt(a.getX(i), a.getZ(i)));
    assert.ok(withMast ? top > 2.5 : top < 1.6, `the mast ${withMast ? 'stands' : 'is absent'} (${top.toFixed(2)} m)`);
    ref.dispose();
  } finally { dispose(built); }
}
console.log('beachedBoat.selftest: flat/sloped/rippled terrain, non-cardinal yaw, the rigid heel, the seat and the mast check out');
