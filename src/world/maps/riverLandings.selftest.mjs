import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createHeightField } from '../terrain.ts';
import { planGroundedObbPose } from '../propPlacement.ts';
import { sampleShorelineMask } from '../shoreline.ts';
import { planRiverLanding } from './riverLandings.ts';
import { dressMapExtras } from './mapKits.ts';
import mangrove from './mangrove.ts';
import saltwind from './saltwind.ts';

const hf = createHeightField(1337, mangrove);
const anchors = mangrove.props.riverLandings;
assert.equal(anchors.length, 3, 'three explicit occupational landings, not26 per-cell kits');
for (const anchor of anchors) {
  const p = planRiverLanding(hf, mangrove.terrain.lakes, anchor);
  assert.ok(p, `authored landing ${anchor.lakeIndex} has valid low-bank support`);
  assert.equal(sampleShorelineMask([], mangrove.terrain.lakes, p.boatX, p.boatZ), 0,
    'beached boat is on the union shore, not inside another overlapping lake');
  const tipX = p.x + Math.cos(p.angle) * p.length, tipZ = p.z + Math.sin(p.angle) * p.length;
  assert.ok(sampleShorelineMask([], mangrove.terrain.lakes, tipX, tipZ) > 0.99);
  assert.ok(Math.abs(hf.getHeightAt(tipX, tipZ) - p.waterLevel) < 1e-8,
    'jetty reaches actual flat water');
  assert.equal(p.deckY, p.waterLevel + 0.65, 'pier deck stays at a believable height above water');
}
assert.equal(planRiverLanding(hf, mangrove.terrain.lakes, { lakeIndex: 999, shoreAngleDeg: 0 }), null);
assert.equal(planRiverLanding({ ...hf, getHeightAt: () => 100 }, mangrove.terrain.lakes, anchors[0]), null,
  'a steep or non-planar water site does not emit unsupported props');
assert.equal(planRiverLanding(hf, mangrove.terrain.lakes, { lakeIndex: 23, shoreAngleDeg: 180 }), null,
  'regression: an individual cell shoreline can lie inside another cell');

function build(config = mangrove, field = hf, sites = config.props.riverLandings, kits = config.props.extraKits) {
  const buckets = Object.fromEntries(['plaster', 'plaster2', 'plaster3', 'roof', 'stone', 'wood',
    'dark', 'glass', 'curtain', 'straw', 'baked'].map((key) => [key, []]));
  let seed = 1024, calls = 0;
  const rng = () => { calls++; seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
  const receipts = [];
  dressMapExtras({ mapId: config.id, extraKits: kits, riverLandings: sites,
    L: field._layout, heightField: field, rng, buckets, groundingReceipts: receipts });
  return { buckets, receipts, calls, state: seed };
}

function geometryReceipt(buckets) {
  const hash = createHash('sha256');
  let triangles = 0, bytes = 0, vertices = 0;
  for (const [bucket, geometries] of Object.entries(buckets)) {
    hash.update(bucket);
    for (const geometry of geometries) {
      for (const [key, attribute] of Object.entries(geometry.attributes)) {
        hash.update(key);
        hash.update(Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength));
        bytes += attribute.array.byteLength;
      }
      if (geometry.index) {
        hash.update('index');
        const a = geometry.index.array;
        hash.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
        bytes += a.byteLength;
      }
      triangles += (geometry.index?.count ?? geometry.attributes.position.count) / 3;
      vertices += geometry.attributes.position.count;
    }
  }
  return { hash: hash.digest('hex'), triangles, bytes, vertices };
}

function disposeBuckets(buckets) {
  for (const geometries of Object.values(buckets)) for (const geometry of geometries) geometry.dispose();
}

const original = build();
const { buckets, receipts } = original;
// Pin the current tapered river reeds and unchanged jetties, excluding boats.
// The reed contact test separately verifies exact root draws and non-reed bytes;
// all grounding, population and RNG checks here remain unchanged.
assert.equal(geometryReceipt({
  wood: buckets.wood.filter((_, i) => i % 24 >= 10), straw: buckets.straw,
}).hash, 'f2e13a39f24bc57e627262a1189be25cb853f63b5fad37a529ff824dd42a9c05');
assert.equal(original.calls, 1207);
assert.equal(original.state, -1144973475);
const explicitReeds = build(mangrove, hf, anchors.map((anchor) => ({ ...anchor, shoreReeds: true, jettyLength: 7.6 })));
assert.deepEqual(geometryReceipt(explicitReeds.buckets), geometryReceipt(buckets));
assert.deepEqual(explicitReeds.receipts, receipts);
assert.equal(explicitReeds.calls, original.calls);
assert.equal(explicitReeds.state, original.state);
disposeBuckets(explicitReeds.buckets);
assert.equal(receipts.filter((r) => r.kind === 'beached-boat').length, 3);
assert.equal(receipts.filter((r) => r.kind === 'jetty-pile').length, 30);
for (const receipt of receipts) {
  assert.ok(receipt.baseClearance <= 0, `${receipt.kind}: no floating ground contact`);
  if (receipt.kind === 'jetty-pile') {
    assert.ok(Math.abs(receipt.y - (hf.getHeightAt(receipt.x, receipt.z) - 0.10)) < 1e-8,
      'every pile is independently planted into its actual terrain/water support');
  } else assert.ok(receipt.relief <= 1.5, 'boat rests on a shallow shore, not a cliff');
}
let triangles = 0;
for (const [bucket, geometries] of Object.entries(buckets)) {
  if (geometries.length) assert.ok(['wood', 'straw'].includes(bucket), 'landings add no material family');
  for (const geometry of geometries) {
    triangles += (geometry.index?.count ?? geometry.attributes.position.count) / 3;
    assert.ok([...geometry.attributes.position.array].every(Number.isFinite));
    geometry.dispose();
  }
}
assert.ok(triangles <= 8000, `landing kit stays bounded, got ${triangles} triangles`);
const repeated = build();
assert.deepEqual(repeated.receipts, receipts, 'landing placement and support receipts are deterministic');
disposeBuckets(repeated.buckets);
console.log(`riverLandings.selftest: 3 beached boats, 30 supported piles; ${triangles} triangles in 2 existing buckets`);

// Current reed geometry is evaluated against these same canonical fields.
// All default sites must survive the full-width wet-tip check; boat transforms
// are independently checked by beachedBoat.selftest.
for (const [seed, hash] of [
  [2025, '8028dc2d52f9384cf5762fb0924763c42b16488adbec3ec32e7044d626446961'],
  [7719, '3872d39feadee5bb0def8ae84650e1e68df0f8a25ca9ea932c9c2f2b7d17d29c'],
]) {
  const field = createHeightField(seed, mangrove);
  const defaults = build(mangrove, field);
  const explicit = build(mangrove, field, anchors.map((site) => ({ ...site, jettyLength: 7.6, shoreReeds: true })));
  assert.equal(defaults.receipts.filter((r) => r.kind === 'beached-boat').length, 3, 'no default landing silently disappears');
  assert.equal(defaults.receipts.filter((r) => r.kind === 'jetty-pile').length, 30);
  assert.equal(geometryReceipt({
    wood: defaults.buckets.wood.filter((_, i) => i % 24 >= 10), straw: defaults.buckets.straw,
  }).hash, hash);
  assert.deepEqual(geometryReceipt(defaults.buckets), geometryReceipt(explicit.buckets));
  assert.deepEqual(defaults.receipts, explicit.receipts);
  assert.equal(defaults.calls, 1207); assert.equal(explicit.calls, 1207);
  assert.equal(defaults.state, -1144973475); assert.equal(explicit.state, defaults.state);
  disposeBuckets(defaults.buckets); disposeBuckets(explicit.buckets);
}

function checkSaltwindSite(field, site, wood, supportReceipts, index) {
  const p = planRiverLanding(field, saltwind.terrain.lakes, site);
  assert.ok(p, `Saltwind lake ${site.lakeIndex}: actual low-bank landing is usable`);
  assert.equal(p.length, 19);
  const boat = supportReceipts[index * 23];
  assert.equal(boat.kind, 'beached-boat');
  assert.equal(boat.x, p.boatX);
  assert.equal(boat.z, p.boatZ);
  const footprint = planGroundedObbPose(field, p.boatX, p.boatZ, 2.9, 0.8, p.boatYaw, 0.06);
  assert.ok(footprint.spread < 0.20 && footprint.maxEmbed < 0.15, 'whole maximum-length boat rests on a shallow bank');
  for (const sample of footprint.samples) {
    assert.equal(sampleShorelineMask([], saltwind.terrain.lakes, sample.x, sample.z), 0);
    assert.ok(field._roadDist(sample.x, sample.z) >= 7, 'beached hull is clear of the coastal route');
    for (const spawn of [saltwind.spawns.player, ...saltwind.spawns.enemies]) {
      assert.ok(Math.hypot(sample.x - spawn.x, sample.z - spawn.z) > 26);
    }
  }
  let lowestHullGap = Infinity, highestHullGap = -Infinity;
  for (const geometry of wood.slice(index * 42, index * 42 + 10)) {
    const a = geometry.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const gap = a.getY(i) - field.getHeightAt(a.getX(i), a.getZ(i));
      lowestHullGap = Math.min(lowestHullGap, gap);
      highestHullGap = Math.max(highestHullGap, gap);
    }
  }
  // Inspect the emitted hull, not just its support-plane receipt. Detailed
  // keel/bow burial bounds belong to the separately owned boat-grounding test.
  assert.ok(lowestHullGap <= 0 && highestHullGap > 0.30, 'actual hull touches shore and is not wholly buried');
  for (let i = 0; i < 22; i++) {
    const pile = supportReceipts[index * 23 + 1 + i];
    assert.equal(pile.kind, 'jetty-pile');
    assert.ok(Math.abs(pile.y - (field.getHeightAt(pile.x, pile.z) - 0.10)) < 1e-8);
    const geometry = wood[index * 42 + 10 + i];
    geometry.computeBoundingBox();
    assert.ok(Math.abs(geometry.boundingBox.min.y - pile.y) < 2e-6, 'emitted pile base is planted, not just the receipt');
    assert.ok(Math.abs(geometry.boundingBox.max.y - (p.deckY + 0.045)) < 2e-6, 'each pile actually meets the deck');
    assert.ok(field._roadDist(pile.x, pile.z) >= 7);
    for (const spawn of [saltwind.spawns.player, ...saltwind.spawns.enemies]) {
      assert.ok(Math.hypot(pile.x - spawn.x, pile.z - spawn.z) > 26);
    }
  }
  const dx = Math.cos(p.angle), dz = Math.sin(p.angle);
  for (let k = 0; k < 10; k++) {
    const geometry = wood[index * 42 + 32 + k];
    geometry.computeBoundingBox();
    assert.ok(Math.abs(geometry.boundingBox.min.y - (p.deckY - 0.045)) < 2e-6);
    assert.ok(Math.abs(geometry.boundingBox.max.y - (p.deckY + 0.045)) < 2e-6);
    let minAlong = Infinity, maxAlong = -Infinity, minAcross = Infinity, maxAcross = -Infinity;
    const a = geometry.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const x = a.getX(i), z = a.getZ(i);
      const along = (x - p.x) * dx + (z - p.z) * dz;
      const across = -(x - p.x) * dz + (z - p.z) * dx;
      minAlong = Math.min(minAlong, along); maxAlong = Math.max(maxAlong, along);
      minAcross = Math.min(minAcross, across); maxAcross = Math.max(maxAcross, across);
      assert.ok(field._roadDist(x, z) >= 7, 'full emitted deck remains clear of the route');
      if (k === 9 && along > 19) {
        assert.equal(field.getWaterMaskAt(x, z), 1, 'actual overhanging tip corners reach visible liquid');
        assert.equal(field.getHeightAt(x, z), p.waterLevel);
      }
    }
    assert.ok(Math.abs(minAlong - (k * 1.9 - 0.025)) < 4e-5);
    assert.ok(Math.abs(maxAlong - ((k + 1) * 1.9 + 0.025)) < 4e-5);
    assert.ok(Math.abs(minAcross + 0.75) < 4e-5 && Math.abs(maxAcross - 0.75) < 4e-5);
  }
  for (const side of [-0.75, 0, 0.75]) {
    const tipX = p.x + dx * p.length - dz * side, tipZ = p.z + dz * p.length + dx * side;
    assert.equal(field.getHeightAt(tipX, tipZ), p.waterLevel);
    assert.equal(field.getWaterMaskAt(tipX, tipZ), 1, 'full-width tip reaches canonical visible water, not merely low dry ground');
  }
}

assert.equal(saltwind.props.riverLandings.length, 2);
assert.equal(new Set(saltwind.props.riverLandings.map((site) => site.lakeIndex)).size, 2,
  'occupational sites are distributed along two distinct village-facing shores');
for (const site of saltwind.props.riverLandings) {
  assert.equal(site.shoreReeds, false);
  assert.equal(site.jettyLength, 19);
}
for (const jettyLength of [0, 1.9, 7.5, 8, 20.9, Infinity, NaN, null, '19']) {
  assert.throws(() => planRiverLanding(hf, mangrove.terrain.lakes, { ...anchors[0], jettyLength }),
    /complete 1.9 m spans/, 'invalid authored lengths fail clearly, without rounding or fallback');
}
for (const seed of [1337, 2025, 7719]) {
  const field = createHeightField(seed, saltwind);
  const site = saltwind.props.riverLandings[0];
  assert.equal(planRiverLanding(field, saltwind.terrain.lakes, { ...site, jettyLength: 7.6 }), null,
    'regression: the default short pier stops on dry graded shore despite nearly matching water height');
  assert.equal(planRiverLanding({ ...field, getWaterMaskAt: () => 0 }, saltwind.terrain.lakes, site), null);
  assert.throws(() => planRiverLanding({ ...field, getWaterMaskAt: undefined }, saltwind.terrain.lakes, site),
    /getWaterMaskAt/, 'missing required liquid owner is an error, not a silently omitted pier');
  const plan = planRiverLanding(field, saltwind.terrain.lakes, site);
  const blockedX = plan.x + Math.cos(plan.angle) * 3.8;
  const blockedZ = plan.z + Math.sin(plan.angle) * 3.8;
  assert.equal(planRiverLanding({ ...field, _roadDist: (x, z) => Math.hypot(x - blockedX, z - blockedZ) < 1 ? 0 : 100 },
    saltwind.terrain.lakes, site), null, 'intermediate pile stations use the complete authored footprint');
  const before = build(saltwind, field, [], []);
  assert.equal(before.calls, 0, 'Saltwind previously had no special shoreline kit');
  assert.ok(Object.values(before.buckets).every((geometries) => geometries.length === 0));
  const result = build(saltwind, field);
  assert.equal(result.receipts.filter((r) => r.kind === 'beached-boat').length, 2);
  assert.equal(result.receipts.filter((r) => r.kind === 'jetty-pile').length, 44);
  assert.equal(result.buckets.wood.length, 84, 'two complete boats, forty-four piles and twenty deck segments');
  for (const [bucket, geometries] of Object.entries(result.buckets)) {
    if (bucket !== 'wood') assert.equal(geometries.length, 0, 'dry landings do not activate a straw or other new bucket');
    for (const geometry of geometries) for (const attribute of Object.values(geometry.attributes)) {
      assert.ok([...attribute.array].every(Number.isFinite));
    }
  }
  saltwind.props.riverLandings.forEach((site, i) => checkSaltwindSite(field, site, result.buckets.wood, result.receipts, i));
  const metrics = geometryReceipt(result.buckets);
  assert.equal(metrics.triangles, 1008);
  assert.equal(metrics.bytes, 70560);
  assert.equal(metrics.vertices, 2016);
  // Same non-indexed merge used by props.ts: incremental bytes in its existing
  // wood batch, not a whole-world draw-count or renderer-memory certification.
  const expanded = result.buckets.wood.map((geometry) => geometry.toNonIndexed());
  const merged = mergeGeometries(expanded, false);
  assert.equal(merged.attributes.position.count, 3024);
  assert.equal(Object.values(merged.attributes).reduce((n, a) => n + a.array.byteLength, 0), 96768);
  for (const geometry of expanded) geometry.dispose();
  merged.dispose();
  const replay = build(saltwind, field);
  assert.deepEqual(geometryReceipt(replay.buckets), metrics, 'all emitted geometry bytes repeat exactly');
  assert.deepEqual(replay.receipts, result.receipts);
  assert.equal(result.calls, 396);
  assert.equal(result.state, 1264123100);
  assert.equal(replay.state, result.state);
  disposeBuckets(result.buckets);
  disposeBuckets(replay.buckets);
  console.log(`riverLandings.selftest: Saltwind seed ${seed}: 2 boats/44 planted piles, +1,008 triangles/+96,768 merged bytes, wood only`);
}
