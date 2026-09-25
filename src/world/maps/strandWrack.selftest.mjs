// Round 56 (2026-09-24, owner decision 21 of 2026-09-23): the strands' wrack line and debris. The three sea maps'
// strands carry a high-water band of weed mats, sticks, pebbles and shells with larger pieces beside the landings,
// derived from each lake's authored contour. This receipt checks the law and the placement rules on the production
// build of every strand map, at three seeds: nothing in the water, nothing floating, nothing on the bank above the
// beach, off roads / pads / boats / jetties / footprints, inside the square, in the existing buckets only, bounded,
// deterministic. It does not pin bytes — beachedBoat.selftest and winterLakeGeometry.selftest freeze the kit's geometry.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createHeightField, mulberry32 } from '../terrain.ts';
import { shorelineDistance, shorelineRadiusAt } from '../shoreline.ts';
import { MAP_IDS, getMapConfig } from './index.ts';
import { dressMapExtras } from './mapKits.ts';
import { dressStrandWrack, strandBandAt, wrackBand, wrackDensity } from './strandWrack.ts';

const names = ['plaster', 'plaster2', 'plaster3', 'roof', 'stone', 'wood', 'dark', 'glass', 'curtain', 'straw', 'baked'];
const strandMaps = MAP_IDS.filter(id => (getMapConfig(id).terrain.lakes ?? []).some(lake => lake.shelfM !== undefined));
assert.deepEqual(strandMaps, ['coastal', 'fjord', 'saltwind'], 'a wrack line follows every authored shelf, and only those');

function build(mapId, seed) {
  const config = getMapConfig(mapId);
  const field = createHeightField(seed, config);
  const buckets = Object.fromEntries(names.map(name => [name, []]));
  const receipts = [], random = mulberry32(seed ^ 0x5a17);
  let calls = 0;
  const woodBefore = buckets.wood.length;
  dressMapExtras({ mapId, extraKits: config.props.extraKits, riverLandings: config.props.riverLandings,
    L: field._layout, heightField: field, rng: () => { calls++; return random(); }, buckets, groundingReceipts: receipts });
  return { config, field, buckets, receipts, calls, next: random(), woodBefore };
}

function digest(geometries) {
  const hash = createHash('sha256');
  for (const g of geometries) {
    for (const key of Object.keys(g.attributes).sort()) {
      const a = g.attributes[key].array;
      hash.update(key).update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    }
    if (g.index) { const a = g.index.array; hash.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)); }
  }
  return hash.digest('hex');
}

function dispose(built) {
  for (const geometries of Object.values(built.buckets)) for (const g of geometries) g.dispose();
}

function lakeLevelAt(lakes, x, z) {
  let level = -Infinity;
  for (const lake of lakes) if (shorelineDistance(lake, x, z, 1.4) < 1.4) level = Math.max(level, lake.level);
  return level;
}

/** Every vertex of a piece against the placement rules. */
function auditPiece(g, built, label) {
  const { field, config } = built;
  const p = g.attributes.position;
  assert.deepEqual(Object.keys(g.attributes).sort(), ['color', 'normal', 'position', 'uv'],
    `${label}: the baked bucket merges one attribute set (the coal heaps' position / colour / uv / normal)`);
  let cx = 0, cz = 0, lowest = Infinity;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z));
    cx += x / p.count; cz += z / p.count;
    assert.equal(field.getWaterMaskAt(x, z), 0, `${label}: no vertex over water at ${x.toFixed(1)}, ${z.toFixed(1)}`);
    lowest = Math.min(lowest, y - field.getHeightAt(x, z));
  }
  assert.ok(lowest <= 0.03 && lowest >= -0.30, `${label}: seated on the sand, not floating or swallowed (${lowest.toFixed(3)} m)`);
  const level = lakeLevelAt(config.terrain.lakes, cx, cz);
  assert.ok(Number.isFinite(level), `${label}: lies on a sea lake's shore`);
  assert.ok(field.getHeightAt(cx, cz) - level <= 0.6, `${label}: on the strand's flat, not the bank above the beach`);
  assert.ok(field._roadDist(cx, cz) >= 6, `${label}: off the roads`);
  assert.ok(Math.max(Math.abs(cx), Math.abs(cz)) <= 470, `${label}: inside the dressing square`);
  for (const spawn of [config.spawns.player, ...config.spawns.enemies]) {
    assert.ok(Math.hypot(cx - spawn.x, cz - spawn.z) >= 26, `${label}: clear of the spawn pads`);
  }
  return { cx, cz };
}

let pieces = 0, logs = 0, landingPieces = 0;
for (const seed of [1337, 2049, 7719]) for (const mapId of strandMaps) {
  const built = build(mapId, seed);
  try {
    const { buckets, receipts, field, config } = built;
    assert.ok(buckets.baked.length >= 200, `${mapId}/${seed}: a wrack line was laid (${buckets.baked.length} pieces)`);
    assert.ok(buckets.baked.length <= 1400, `${mapId}/${seed}: bounded (${buckets.baked.length} pieces)`);
    let triangles = 0;
    for (const g of buckets.baked) {
      auditPiece(g, built, `${mapId}/${seed} baked`);
      triangles += g.index.count / 3;
    }
    assert.ok(triangles <= 18000, `${mapId}/${seed}: the whole line stays under 18k triangles (${triangles})`);
    for (const name of names) if (name !== 'wood' && name !== 'baked' && name !== 'straw' && name !== 'plaster') {
      assert.equal(buckets[name].length, 0, `${mapId}/${seed}: no new material family (${name})`);
    }
    pieces += buckets.baked.length;
    // the coastal driftwood (Saltmere, Nordhavn) lies on the strand now, never up the bank or in the water
    for (const receipt of receipts.filter(r => r.kind === 'driftwood')) {
      const level = lakeLevelAt(config.terrain.lakes, receipt.x, receipt.z);
      assert.equal(field.getWaterMaskAt(receipt.x, receipt.z), 0, `${mapId}/${seed}: driftwood on dry sand`);
      assert.ok(field.getHeightAt(receipt.x, receipt.z) - level <= 0.6, `${mapId}/${seed}: driftwood within the high-water mark's reach`);
      assert.ok(receipt.relief <= 0.35 && receipt.baseClearance === -0.03);
      logs++;
    }
    // the larger pieces gather beside the landings (the coastal jetties, Saltwind's two piers)
    const larger = receipts.filter(r => r.kind.startsWith('strand-'));
    assert.ok(larger.some(r => r.kind === 'strand-crate') && larger.some(r => r.kind === 'strand-rope')
      && larger.some(r => r.kind === 'strand-timber'), `${mapId}/${seed}: a crate, a rope coil and timber beside the landings`);
    for (const r of larger) {
      assert.ok(r.baseClearance <= 0 && r.relief <= 0.35, `${r.kind}: grounded`);
      assert.equal(field.getWaterMaskAt(r.x, r.z), 0);
      assert.ok(field._roadDist(r.x, r.z) >= 6);
    }
    landingPieces += larger.length;
    // deterministic: the same seed lays the same bytes and receipts
    const again = build(mapId, seed);
    try {
      assert.equal(digest(again.buckets.baked), digest(buckets.baked), `${mapId}/${seed}: deterministic wrack bytes`);
      assert.equal(digest(again.buckets.wood), digest(buckets.wood), `${mapId}/${seed}: deterministic wood bytes`);
      assert.deepEqual(again.receipts, receipts);
      assert.equal(again.calls, built.calls); assert.equal(again.next, built.next);
    } finally { dispose(again); }
  } finally { dispose(built); }
}
console.log(`strandWrack.selftest: ${pieces} wrack pieces, ${logs} strand logs and ${landingPieces} landing pieces audited over 9 builds`);

// The band law on Saltmere's crescent: the water's edge lies inside the sand's end, the band starts a metre up the
// beach and is never narrower than 2.2 m; an azimuth with no water at 0.8 R has no strand.
{
  const config = getMapConfig('coastal'), field = createHeightField(1337, config), lake = field._layout.lakes[0];
  let bands = 0;
  for (let deg = 110; deg <= 250; deg += 10) {
    const band = strandBandAt(field, lake, deg * Math.PI / 180);
    assert.ok(band, `Saltmere strand at ${deg}°`);
    assert.ok(band.edge < band.sandEnd, 'the sand ends beyond the water');
    const local = shorelineRadiusAt(lake, deg * Math.PI / 180);
    assert.ok(band.edge > local * 0.9 && band.edge < local * 1.0, `the water's edge is on the shelf (${band.edge.toFixed(1)} of ${local.toFixed(1)} m)`);
    const [start, end] = wrackBand(band);
    assert.ok(start === band.edge + 1.0 && end - start >= 2.2 && end <= Math.max(start + 2.2, band.edge + 8.5));
    assert.equal(field.getWaterMaskAt(lake.x + Math.cos(deg * Math.PI / 180) * start, lake.z + Math.sin(deg * Math.PI / 180) * start), 0);
    bands++;
  }
  assert.equal(bands, 15);
  // east of the red line the disc's own far arc: the square's field has no water at 0.8 R there
  assert.equal(strandBandAt({ getHeightAt: () => 0, getWaterMaskAt: () => 0, _roadDist: () => 100 }, lake, 0), null,
    'no water, no strand');
}

// The along-shore density: bounded, varying, and phase-keyed so two lakes never share one rhythm.
{
  let low = 1, high = 0;
  for (let s = 0; s < 600; s += 0.5) {
    const n = wrackDensity(s, 0.3, 1.7);
    assert.ok(n >= 0 && n <= 1);
    low = Math.min(low, n); high = Math.max(high, n);
  }
  assert.ok(low < 0.25 && high > 0.85, `stretches of clean sand and thick wrack (${low.toFixed(2)}–${high.toFixed(2)})`);
  assert.notEqual(wrackDensity(100, 0.3, 1.7), wrackDensity(100, 2.3, 0.4));
}

// A lake without an authored shelf lays nothing, and the pass tolerates a kit context without the optional lists.
{
  const flat = { getHeightAt: () => 0, getWaterMaskAt: () => 0, _roadDist: () => 100 };
  const buckets = { wood: [], baked: [] };
  const census = dressStrandWrack({ lakes: [{ x: 0, z: 0, r: 80, level: -2 }], heightField: flat, rng: mulberry32(7), buckets });
  assert.deepEqual(census, { lakes: 0, stations: 0, mats: 0, sticks: 0, pebbles: 0, shells: 0, landingPieces: 0 });
  assert.equal(buckets.baked.length + buckets.wood.length, 0);
  const dry = dressStrandWrack({ lakes: [{ x: 0, z: 0, r: 80, level: -2, shelfM: 8 }], heightField: flat, rng: mulberry32(7), buckets });
  assert.equal(dry.lakes, 1); assert.equal(dry.stations, 0, 'a shelf with no water under it has no strand');
}
console.log('strandWrack.selftest: band law, density, opt-out and empty-context checks pass');

// Round 67 (2026-09-24): the per-station draw budget. A keep-out that moves changes only the stations it touches:
// Saltmere's line laid with the kit's shipped keep-outs, then again with one more 4.2 m keep-out (a boat hauled up
// on the wrack band far from the landings) — every piece more than 8 m from the added keep-out is byte-identical,
// piece for piece; only stations inside it lose their pieces. Before this round the whole line past the first
// affected station re-rolled (the pieces' draws followed admission on the shared stream).
{
  const config = getMapConfig('coastal'), field = createHeightField(1337, config), lake = field._layout.lakes[0];
  const azimuth = 140 * Math.PI / 180;
  const band = strandBandAt(field, lake, azimuth), [start, end] = wrackBand(band);
  const r = (start + end) / 2, extra = { x: lake.x + Math.cos(azimuth) * r, z: lake.z + Math.sin(azimuth) * r, r: 4.2 };
  const lay = (keepOut) => {
    const buckets = { wood: [], baked: [] };
    const census = dressStrandWrack({ lakes: field._layout.lakes, heightField: field, rng: mulberry32(1337 ^ 0x5a17), buckets,
      spawns: [config.spawns.player, ...config.spawns.enemies], keepOut });
    const pieces = buckets.baked.map((g) => {
      const p = g.attributes.position; let cx = 0, cz = 0;
      for (let i = 0; i < p.count; i++) { cx += p.getX(i) / p.count; cz += p.getZ(i) / p.count; }
      return { cx, cz, digest: digest([g]) };
    });
    for (const g of [...buckets.baked, ...buckets.wood]) g.dispose();
    return { census, pieces };
  };
  const before = lay([]), after = lay([extra]);
  const far = (piece) => Math.hypot(piece.cx - extra.x, piece.cz - extra.z) > extra.r + 8;
  const farBefore = before.pieces.filter(far).map((p) => p.digest).sort(), farAfter = after.pieces.filter(far).map((p) => p.digest).sort();
  assert.ok(before.pieces.length > 500 && farBefore.length > 400, `Saltmere's line (${before.pieces.length} pieces, ${farBefore.length} far from the added keep-out)`);
  assert.deepEqual(farAfter, farBefore, 'every piece more than 8 m from the moved keep-out is byte-identical');
  const nearBefore = before.pieces.length - farBefore.length, nearAfter = after.pieces.length - farAfter.length;
  assert.ok(nearBefore > 0 && nearAfter < nearBefore, `only the stations inside the keep-out change (${nearBefore} → ${nearAfter} pieces beside it)`);
  assert.equal(after.census.stations, before.census.stations, 'the station count is the law\'s, not the keep-out\'s');
  console.log(`strandWrack.selftest: per-station budget — ${farBefore.length} pieces byte-identical past a moved keep-out, ${nearBefore} → ${nearAfter} beside it`);
}
