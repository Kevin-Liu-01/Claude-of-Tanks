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

// round 58 (2026-09-24, jetties at the water's edge): a Saltwind landing is the beached boat (10 wood), the planted
// piles (two per station), the deck segments (one per span), then the pieces that key on the derived jetty from its
// own stream — the gangway plank and three battens (4), the moored clinker hull (10, with its mast and boom 12), two
// bollards and their lines (4) — and its support receipts (boat, the piles, gangway, moored boat).
// round 67 (2026-09-24): the piers take the strand law's shelf-sized length instead of the authored 19 m — 7 spans
// (13.3 m) at −25° and 8 (15.2 m) at 45° at every seed — so the wood and receipt strides are the landing's own
// (the landing stream keys on the spans, so the mast draw re-rolled: the −25° hull carries none).
const SALTWIND_SPANS = { '-25': 7, '45': 8 };
const near = (a, b, tolerance, message) => assert.ok(Math.abs(a - b) <= tolerance, `${message}: ${a} vs ${b}`);
const landingWood = (spans, mast) => 10 + 2 * (spans + 1) + spans + 4 + (mast ? 12 : 10) + 4;
const landingReceipts = (spans) => 1 + 2 * (spans + 1) + 2;
function checkSaltwindSite(field, site, wood, supportReceipts, woodStart, receiptStart) {
  const p = planRiverLanding(field, saltwind.terrain.lakes, site);
  assert.ok(p, `Saltwind lake ${site.lakeIndex}: actual low-bank landing is usable`);
  const spans = SALTWIND_SPANS[String(site.shoreAngleDeg)];
  assert.equal(p.shore.spans, spans, `round 67: the ${site.shoreAngleDeg}° pier is sized to the shelf (${spans} spans)`);
  near(p.length, spans * 1.9, 1e-9, 'whole 1.9 m spans');
  assert.ok(p.shore.tipR <= p.shore.core - 1.9 && p.shore.shoreR - p.shore.core + 4.6 <= p.length + 1e-9, 'from the shore end over the core with room for the hull, as the strand law sizes a jetty');
  assert.ok(p.shore, 'a shelf shore plans the jetty from the strand law');
  const boat = supportReceipts[receiptStart];
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
  for (const geometry of wood.slice(woodStart, woodStart + 10)) {
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
  const piles = 2 * (spans + 1);
  for (let i = 0; i < piles; i++) {
    const pile = supportReceipts[receiptStart + 1 + i];
    assert.equal(pile.kind, 'jetty-pile');
    assert.ok(Math.abs(pile.y - (field.getHeightAt(pile.x, pile.z) - 0.10)) < 1e-8);
    const geometry = wood[woodStart + 10 + i];
    geometry.computeBoundingBox();
    assert.ok(Math.abs(geometry.boundingBox.min.y - pile.y) < 2e-6, 'emitted pile base is planted, not just the receipt');
    assert.ok(Math.abs(geometry.boundingBox.max.y - (p.deckY + 0.045)) < 2e-6, 'each pile actually meets the deck');
    assert.ok(field._roadDist(pile.x, pile.z) >= 7);
    for (const spawn of [saltwind.spawns.player, ...saltwind.spawns.enemies]) {
      assert.ok(Math.hypot(pile.x - spawn.x, pile.z - spawn.z) > 26);
    }
  }
  const dx = Math.cos(p.angle), dz = Math.sin(p.angle);
  for (let k = 0; k < spans; k++) {
    const geometry = wood[woodStart + 10 + piles + k];
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
      if (k === spans - 1 && along > p.length) {
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
    // round 58: the deck top stands a constant 0.45 m over the water SURFACE (bed + the sheet's depth), not the bed —
    // the old level + 0.65 deck put the outer spans 7 cm under the 0.72 m sheet
    assert.ok(Math.abs(p.deckY + 0.045 - (p.waterLevel + field.getWaterDepthAt(tipX, tipZ) + 0.45)) < 1e-9, 'deck freeboard over the surface');
  }
  // round 58: the shore end stands a metre landward of the wrack band on dry sand, the gangway's foot on dry sand too,
  // the moored hull afloat over the core at its draft
  assert.equal(field.getWaterMaskAt(p.x, p.z), 0, 'shore end on dry sand');
  const gangway = supportReceipts[receiptStart + 1 + piles], moored = supportReceipts[receiptStart + 2 + piles];
  assert.equal(gangway.kind, 'jetty-gangway'); assert.equal(field.getWaterMaskAt(gangway.x, gangway.z), 0);
  assert.ok(Math.abs(gangway.y - field.getHeightAt(gangway.x, gangway.z)) < 1e-9 && gangway.baseClearance === -0.01);
  assert.equal(moored.kind, 'moored-boat'); assert.equal(field.getWaterMaskAt(moored.x, moored.z), 1, 'the moored hull floats over the core');
  assert.ok(Math.abs(moored.baseClearance + 0.28) < 1e-9 && Math.abs(moored.y - (p.waterLevel + field.getWaterDepthAt(moored.x, moored.z) - 0.28)) < 1e-9, 'hull at its draft');
}

assert.equal(saltwind.props.riverLandings.length, 2);
// round 40 (2026-09-22): Saltwind's bay is one authored contour, so both landings share lakeIndex 0 and stand on two
// distinct stations of its village-facing east shore (70° apart, the stations between them sit on the basin landform's wet flat) instead of two basins
assert.equal(new Set(saltwind.props.riverLandings.map((site) => `${site.lakeIndex}:${site.shoreAngleDeg}`)).size, 2,
  'occupational sites are distributed along two distinct village-facing shore stations');
for (const site of saltwind.props.riverLandings) {
  assert.equal(site.shoreReeds, false);
  assert.equal(site.jettyLength, undefined, 'round 67: no authored length — the strand law sizes the pier to the shelf');
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
  // round 56 (2026-09-24): the strand's wrack line follows the authored shelf, not a kit — without its landings Saltwind
  // still carries the weed, pebbles and shells of its high-water mark (vertex-coloured `baked`) and nothing else; the
  // larger pieces that need a landing (timber, crate, rope) only appear beside the piers below
  assert.ok(before.calls > 0 && before.receipts.length === 0 && before.buckets.baked.length > 0,
    'Saltwind without its landings carries only the strand\'s wrack line');
  assert.ok(Object.entries(before.buckets).every(([bucket, geometries]) => bucket === 'baked' || geometries.length === 0));
  const result = build(saltwind, field);
  assert.equal(result.receipts.filter((r) => r.kind === 'beached-boat').length, 2);
  assert.equal(result.receipts.filter((r) => r.kind === 'jetty-pile').length, 2 * (7 + 1) + 2 * (8 + 1), 'round 67: 16 + 18 piles on the shelf-sized piers');
  const strandWood = result.receipts.filter((r) => r.kind === 'strand-timber').length
    + 6 * result.receipts.filter((r) => r.kind === 'strand-crate').length;
  assert.ok(strandWood > 0, 'the wrack line gathers timber or a broken crate beside the piers');
  // round 67: the landing streams re-keyed on the spans, so whether a hull carries its mast and boom is read off the
  // wood itself (the mast is the 0.11 × 3.4 × 0.11 box that follows the hull's ten pieces)
  const isMast = (g) => g?.parameters?.width === 0.11 && g.parameters.height === 3.4 && g.parameters.depth === 0.11;
  const masts = [];
  { let at = 0;
    for (const spans of [7, 8]) { const hullStart = at + 10 + 2 * (spans + 1) + spans + 4; masts.push(isMast(result.buckets.wood[hullStart + 10])); at += landingWood(spans, masts[masts.length - 1]); } }
  const landingsWood = landingWood(7, masts[0]) + landingWood(8, masts[1]);
  assert.equal(result.buckets.wood.length, landingsWood + strandWood,
    'two landings (boat, piles, decks, gangway, moored hull, bollards and lines), then the wrack line\'s timber and crate planks');
  for (const [bucket, geometries] of Object.entries(result.buckets)) {
    if (bucket !== 'wood' && bucket !== 'baked') assert.equal(geometries.length, 0, 'dry landings do not activate a straw or other new bucket');
    for (const geometry of geometries) for (const attribute of Object.values(geometry.attributes)) {
      assert.ok([...attribute.array].every(Number.isFinite));
    }
  }
  { let woodStart = 0, receiptStart = 0;
    saltwind.props.riverLandings.forEach((site, i) => {
      checkSaltwindSite(field, site, result.buckets.wood, result.receipts, woodStart, receiptStart);
      woodStart += landingWood(i === 0 ? 7 : 8, masts[i]); receiptStart += landingReceipts(i === 0 ? 7 : 8);
    }); }
  // round 56 (2026-09-24): the landings are the first wood pieces; the strand's wrack line that follows them (its
  // timber and crate planks in wood, everything else in baked) is audited by strandWrack.selftest, so the budgets
  // below are the landings' own — round 58: 124 pieces, the two derived landings with their gangways, moored hulls,
  // bollards and lines; round 67: the shelf-sized piers
  const landings = { wood: result.buckets.wood.slice(0, landingsWood) };
  const metrics = geometryReceipt(landings);
  // round 58 (2026-09-24): 1008 / 70560 / 2016 were the two boats, piles and decks; the gangways, moored hulls, bollards
  // and lines add 480 triangles (seed-independent: the plans and their streams key on the shore ends)
  // round 67 (2026-09-24): the shelf-sized piers (7 + 8 spans, 34 piles, one mast) — 1488 / 104160 / 2976 → 1284 / 89880 / 2568,
  // the merged 4464 / 142848 → 3852 / 123264, the draw count 12005 → 11964 and its state re-pinned
  assert.equal(metrics.triangles, 1284);
  assert.equal(metrics.bytes, 89880);
  assert.equal(metrics.vertices, 2568);
  // Same non-indexed merge used by props.ts: incremental bytes in its existing
  // wood batch, not a whole-world draw-count or renderer-memory certification.
  const expanded = landings.wood.map((geometry) => geometry.toNonIndexed());
  const merged = mergeGeometries(expanded, false);
  assert.equal(merged.attributes.position.count, 3852); // round 58: was 3024
  assert.equal(Object.values(merged.attributes).reduce((n, a) => n + a.array.byteLength, 0), 123264); // round 58: was 96768
  for (const geometry of expanded) geometry.dispose();
  merged.dispose();
  const replay = build(saltwind, field);
  assert.deepEqual(geometryReceipt({ wood: replay.buckets.wood.slice(0, landingsWood) }), metrics, 'all emitted landing bytes repeat exactly');
  assert.deepEqual(geometryReceipt(replay.buckets), geometryReceipt(result.buckets), 'the whole shore, landings and wrack line, repeats exactly');
  assert.deepEqual(replay.receipts, result.receipts);
  // 396 / 1264123100 were the landings alone; the wrack line's draws follow them (round 56, 2026-09-24) and do not
  // depend on the field seed
  assert.equal(result.calls, 11964);
  assert.equal(result.state, -1509049396);
  assert.equal(replay.state, result.state);
  disposeBuckets(result.buckets);
  disposeBuckets(replay.buckets);
  console.log(`riverLandings.selftest: Saltwind seed ${seed}: 2 beached boats/34 planted piles on the shelf-sized piers/2 gangways/2 moored hulls, +1,284 triangles/+123,264 merged bytes, wood only`);
}
