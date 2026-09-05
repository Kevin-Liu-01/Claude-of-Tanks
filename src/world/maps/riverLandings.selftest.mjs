import assert from 'node:assert/strict';
import { createHeightField } from '../terrain.ts';
import { sampleShorelineMask } from '../shoreline.ts';
import { planRiverLanding } from './riverLandings.ts';
import { dressMapExtras } from './mapKits.ts';
import mangrove from './mangrove.ts';

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

function build() {
  const buckets = Object.fromEntries(['plaster', 'plaster2', 'plaster3', 'roof', 'stone', 'wood',
    'dark', 'glass', 'curtain', 'straw', 'baked'].map((key) => [key, []]));
  let seed = 1024;
  const rng = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
  const receipts = [];
  dressMapExtras({ mapId: 'mangrove', extraKits: ['river'], riverLandings: anchors,
    L: hf._layout, heightField: hf, rng, buckets, groundingReceipts: receipts });
  return { buckets, receipts };
}
const { buckets, receipts } = build();
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
for (const geometries of Object.values(repeated.buckets)) for (const geometry of geometries) geometry.dispose();
console.log(`riverLandings.selftest: 3 beached boats, 30 supported piles; ${triangles} triangles in 2 existing buckets`);
