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
import { near } from '../../../tools/receipt-kit.test-support.mjs';

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
  // (2026-10-21, waterBank.ts: a lake's level is its floor and its water stands the depth over it) the deck stands over
  // the water's top, not the floor; on a field without bodies the top is the level, as before
  assert.equal(p.deckY, p.surface + 0.65, 'pier deck stays at a believable height above water');
  assert.ok(p.surface >= p.waterLevel, 'the water stands on its floor');
  assert.ok(hf.getHeightAt(p.boatX, p.boatZ) > p.surface + 0.05, 'the hauled-out boat lies over the water\'s top');
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
// 2026-10-01 (frozen pins retired): the reed/jetty sha256 at three seeds and the exact RNG call count/state (1207,
// -1144973475) were change detectors. Defaults must equal the explicit authoring, every landing must place and ground,
// and a rebuild must reproduce the receipts and the RNG stream.
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
  // the beached boats are painted hulls in the props' baked bucket (maps/boatHulls.ts, the map-vehicles lane, P2); the
  // timber and the reeds stay in the wood and straw buckets
  if (geometries.length) assert.ok(['wood', 'straw', 'baked'].includes(bucket), 'landings add no material family beyond the boats\' paint');
  for (const geometry of geometries) {
    triangles += (geometry.index?.count ?? geometry.attributes.position.count) / 3;
    assert.ok([...geometry.attributes.position.array].every(Number.isFinite));
    geometry.dispose();
  }
}
// #16 r2 (Lane C, 2026-10-14): Mangrove's three landings are the Ca Mau pole landings in their members (jettyKit.ts
// 'stilts': leaning poles, lashed bearers and runners, rough boards, the handrail, sway braces, the tide sleeves) —
// about 2,500 triangles a landing where the old kit's piles and slabs were 168; and the bank's reeds are the Ca Mau
// nipa over its sedge (reedBeds.ts: three pinnate fronds a clump, ~350 triangles): the bound moves from 8,000 to 16,000
// (r2 sweep, Lane C 2026-10-16: the kit's squared members' long arrises eased, bevelBox's 28 triangles a member where a box
// had 12) the bound moves from 16,000 to 18,500
assert.ok(triangles <= 18500, `landing kit stays bounded, got ${triangles} triangles`);
console.log(`riverLandings.selftest: Mangrove's landings ${triangles} triangles`);
const repeated = build();
assert.deepEqual(repeated.receipts, receipts, 'landing placement and support receipts are deterministic');
assert.deepEqual([repeated.calls, repeated.state], [original.calls, original.state], 'the rebuild draws the same RNG stream');
disposeBuckets(repeated.buckets);
console.log(`riverLandings.selftest: 3 beached boats, 30 supported piles; ${triangles} triangles in the timber, reed and paint buckets`);

// Current reed geometry is evaluated against these same canonical fields.
// All default sites must survive the full-width wet-tip check; boat transforms
// are independently checked by beachedBoat.selftest.
for (const seed of [2025, 7719]) {
  const field = createHeightField(seed, mangrove);
  const defaults = build(mangrove, field);
  const explicit = build(mangrove, field, anchors.map((site) => ({ ...site, jettyLength: 7.6, shoreReeds: true })));
  assert.equal(defaults.receipts.filter((r) => r.kind === 'beached-boat').length, 3, 'no default landing silently disappears');
  assert.equal(defaults.receipts.filter((r) => r.kind === 'jetty-pile').length, 30);
  assert.deepEqual(geometryReceipt(defaults.buckets), geometryReceipt(explicit.buckets));
  assert.deepEqual(defaults.receipts, explicit.receipts);
  assert.equal(explicit.calls, defaults.calls); assert.equal(explicit.state, defaults.state);
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
// the map-vehicles lane (P2, 2026-10-05): the beached and the moored boat are painted hulls in the baked bucket, two per
// landing ahead of the strand's wrack; the wood keeps the piles, the decks, the gangway, the bollards and the lines
// (round 3) and the hauled-out boat's stake and its line in four runs, after the landing's own timber
// #16 r2 (Lane C, 2026-10-14): Saltwind's piers are Dalmatian rivas (jettyKit.ts 'riva'): the masonry, its coping and
// paving one stone piece, the landward stair a second (in place of the gangway plank), the weed line and the head's
// cast-iron bollards one painted piece; the moored boat's two bollards are cast iron too (painted) and only their
// lines stay timber — the wood a landing keeps is the two lines and the hauled-out boat's stake and line (5); the
// paint is the beached hull, the jetty's painted piece, the moored hull and its two bollards. (The looks lane, 227, map
// kits 5cb4642b0: the stake's line one round rope along the same sag, mapKits.ts ropeGeometry — it was four square
// runs — so a landing's wood is the two lines, the stake and its one line: 4)
const landingWood = () => 2 + 2;
const LANDING_PAINT = 5;
const LANDING_STONE = 2;
const landingReceipts = (spans) => 1 + 2 * (spans + 1) + 2;
// the lowest and the highest surface a vertical line through (x, z) meets in a geometry
function column(geometry, x, z) {
  let lo = Infinity, hi = -Infinity;
  const p = geometry.attributes.position, idx = geometry.index, n = idx ? idx.count : p.count;
  for (let i = 0; i < n; i += 3) {
    const a = idx ? idx.getX(i) : i, b = idx ? idx.getX(i + 1) : i + 1, c = idx ? idx.getX(i + 2) : i + 2;
    const ax = p.getX(a), az = p.getZ(a), bx = p.getX(b), bz = p.getZ(b), cx = p.getX(c), cz = p.getZ(c);
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(d) < 1e-12) continue;
    const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, w = 1 - u - v;
    if (u < -1e-9 || v < -1e-9 || w < -1e-9) continue;
    const y = u * p.getY(a) + v * p.getY(b) + w * p.getY(c);
    lo = Math.min(lo, y); hi = Math.max(hi, y);
  }
  return [lo, hi];
}
function checkSaltwindSite(field, site, stone, paint, supportReceipts, stoneStart, paintStart, receiptStart) {
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
  for (const geometry of paint.slice(paintStart, paintStart + 1)) {
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
  // #16 r2: the riva (one stone piece) stands under every support from 10 cm into its bed (deeper where a course runs
  // on to a lower bay) up to the deck top (the paving 4 mm under the coping), clear of the route
  const riva = stone[stoneStart];
  for (let i = 0; i < piles; i++) {
    const pile = supportReceipts[receiptStart + 1 + i];
    assert.equal(pile.kind, 'jetty-pile');
    assert.ok(Math.abs(pile.y - (field.getHeightAt(pile.x, pile.z) - 0.10)) < 1e-8);
    // (the column a few centimetres either side along the pier too: a ray down a coping joint meets the course under it)
    let lo = Infinity, hi = -Infinity;
    for (const o of [-0.04, 0, 0.04]) {
      const [l, h] = column(riva, pile.x + Math.cos(p.angle) * o, pile.z + Math.sin(p.angle) * o);
      lo = Math.min(lo, l); hi = Math.max(hi, h);
    }
    assert.ok(lo <= pile.y + 2e-6, 'the masonry under each support is planted, not just the receipt');
    assert.ok(hi >= p.deckY + 0.045 - 0.005 && hi <= p.deckY + 0.045 + 2e-6, 'and carries the deck at the deck top');
    assert.ok(field._roadDist(pile.x, pile.z) >= 7);
    for (const spawn of [saltwind.spawns.player, ...saltwind.spawns.enemies]) {
      assert.ok(Math.hypot(pile.x - spawn.x, pile.z - spawn.z) > 26);
    }
  }
  const dx = Math.cos(p.angle), dz = Math.sin(p.angle);
  {
    let minAlong = Infinity, maxAlong = -Infinity, minAcross = Infinity, maxAcross = -Infinity, top = -Infinity;
    const a = riva.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const x = a.getX(i), z = a.getZ(i);
      const along = (x - p.x) * dx + (z - p.z) * dz;
      const across = -(x - p.x) * dz + (z - p.z) * dx;
      minAlong = Math.min(minAlong, along); maxAlong = Math.max(maxAlong, along);
      minAcross = Math.min(minAcross, across); maxAcross = Math.max(maxAcross, across);
      top = Math.max(top, a.getY(i));
      assert.ok(field._roadDist(x, z) >= 7, 'full emitted pier remains clear of the route');
      if (along > p.length) {
        assert.equal(field.getWaterMaskAt(x, z), 1, 'the head stands in visible liquid');
        assert.equal(field.getHeightAt(x, z), p.waterLevel);
      }
    }
    assert.ok(Math.abs(minAlong + 0.025) < 4e-5 && Math.abs(maxAlong - (p.length + 0.025)) < 4e-5, 'the pier from the shore end to the head');
    assert.ok(Math.abs(minAcross + 0.75) < 4e-5 && Math.abs(maxAcross - 0.75) < 4e-5, 'the deck width the moorings key on');
    assert.ok(Math.abs(top - (p.deckY + 0.045)) < 2e-6, 'the coping is the deck top');
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
  // the stair: from the sand at the gangway's foot to the deck top at the shore end
  const stair = stone[stoneStart + 1];
  stair.computeBoundingBox();
  assert.ok(Math.abs(stair.boundingBox.max.y - (p.deckY + 0.045)) < 2e-6, 'the stair climbs to the deck top');
  const [stairLo] = column(stair, gangway.x + dx * 0.05, gangway.z + dz * 0.05);
  assert.ok(stairLo <= field.getHeightAt(gangway.x, gangway.z) - 0.09, 'its first step is set into the sand');
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
  const landingsWood = landingWood(7) + landingWood(8);
  assert.equal(result.buckets.wood.length, landingsWood + strandWood,
    'two landings (the mooring lines, the stake and its line), then the wrack line\'s timber and crate planks');
  assert.equal(result.buckets.stone.length, 2 * LANDING_STONE, '#16 r2: each riva and its stair in the stone bucket');
  for (const [bucket, geometries] of Object.entries(result.buckets)) {
    if (bucket !== 'wood' && bucket !== 'baked' && bucket !== 'stone') assert.equal(geometries.length, 0, 'dry landings do not activate a straw or other new bucket');
    for (const geometry of geometries) for (const attribute of Object.values(geometry.attributes)) {
      assert.ok([...attribute.array].every(Number.isFinite));
    }
  }
  { let stoneStart = 0, paintStart = 0, receiptStart = 0;
    saltwind.props.riverLandings.forEach((site, i) => {
      checkSaltwindSite(field, site, result.buckets.stone, result.buckets.baked, result.receipts, stoneStart, paintStart, receiptStart);
      stoneStart += LANDING_STONE; paintStart += LANDING_PAINT; receiptStart += landingReceipts(i === 0 ? 7 : 8);
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
  // the merged 4464 / 142848 → 3852 / 123264, the draw count 12005 → 11964 and its state re-pinned; then the wrack line's
  // per-station draw budget (round 67): the wrack takes one salt per lake from the main stream instead of every piece's
  // draws, so the count and state re-pinned again
  // the map-vehicles lane (P2, 2026-10-05): the two beached and two moored boats left the wood for the paint bucket
  // (painted hulls, maps/boatHulls.ts): 1284 / 89880 / 2568 → 780 / 54600 / 1560, the merged 3852 / 123264 →
  // 2340 / 74880; the draws and their state are unchanged
  // round 3 (the map-vehicles lane, 2026-10-07): each hauled-out boat's stake and its line in four runs (five boxes a
  // landing, no draws): 780 / 54600 / 1560 → 900 / 63000 / 1800, the merged 2340 / 74880 → 2700 / 86400
  // #16 r2 (Lane C, 2026-10-14): the piers, their stairs and the moored boats' bollards left the wood for the stone and
  // the paint (the rivas, jettyKit.ts); the wood keeps the two mooring lines and the stake and its line a landing
  // (14 boxes): 900 / 63000 / 1800 → 168 / 11760 / 336, the merged 2700 / 86400 → 504 / 16128
  // the hauled-out boat's stake is a round driven pole with its broomed head and the hitch's two turns (waterside.ts:
  // 228 triangles, 238 vertices where the box had 12 and 24): 168 / 11760 / 336 -> 600 / 28048 / 764, the merged
  // 504 / 16128 -> 1800 / 57600
  // (the looks lane, 227, map kits 5cb4642b0; the r2 sweep: the lines were square boxes) the two mooring lines and the
  // stake's line each one round rope (mapKits.ts ropeGeometry: 8 segments of 5 sides, 80 triangles; the lines were a box
  // each and the stake's line four): 600 / 28048 / 764 -> 936 / 31216 / 800, the merged 1800 / 57600 -> 2808 / 89856
  assert.equal(metrics.triangles, 936);
  assert.equal(metrics.bytes, 31216);
  assert.equal(metrics.vertices, 800);
  // Same non-indexed merge used by props.ts: incremental bytes in its existing
  // wood batch, not a whole-world draw-count or renderer-memory certification.
  const expanded = landings.wood.map((geometry) => geometry.toNonIndexed());
  const merged = mergeGeometries(expanded, false);
  assert.equal(merged.attributes.position.count, 2808); // round 58: was 3024; P2: was 3852; round 3: was 2340; #16 r2: was 2700, then 504; 227: 1800
  assert.equal(Object.values(merged.attributes).reduce((n, a) => n + a.array.byteLength, 0), 89856); // round 58: was 96768; P2: was 123264; round 3: was 74880; #16 r2: was 86400, then 16128; 227: 57600
  for (const geometry of expanded) geometry.dispose();
  merged.dispose();
  const replay = build(saltwind, field);
  assert.deepEqual(geometryReceipt({ wood: replay.buckets.wood.slice(0, landingsWood) }), metrics, 'all emitted landing bytes repeat exactly');
  assert.deepEqual(geometryReceipt(replay.buckets), geometryReceipt(result.buckets), 'the whole shore, landings and wrack line, repeats exactly');
  assert.deepEqual(replay.receipts, result.receipts);
  // 396 / 1264123100 were the landings alone; the wrack line's draws follow them (round 56, 2026-09-24) and do not
  // depend on the field seed
  assert.equal(result.calls, 327);
  assert.equal(result.state, -419840147);
  assert.equal(replay.state, result.state);
  disposeBuckets(result.buckets);
  disposeBuckets(replay.buckets);
  console.log(`riverLandings.selftest: Saltwind seed ${seed}: 2 beached boats/2 rivas on 34 planted supports/2 stairs/2 moored hulls (painted hulls), +936 wood triangles/+89,856 merged bytes`);
}
