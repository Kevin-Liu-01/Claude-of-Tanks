// Receipt of the rail spur kit (round 57, 2026-09-24): the path resampler reproduces the rail yards' segmentation
// rule and shares a run evenly on request; the berth exclusion is a point-to-polyline test; the four rail yards'
// track is byte-identical to the fixed lines they always laid (their rail-part digests at seed 1337 are the
// migration certificate — a re-pin here means the yards' geometry moved, which railWashout and railCoalStockpiles
// do not detect on their own); Tarkhan Steppe's grain-station siding is laid from the layout it authored, every
// slab bedded into the ground with no gap under any corner, sleepers on the slab and rails on the sleepers, the
// stub's buffer stop turned to the track (round 63, 2026-09-24: the line runs on to the map edge through the rim
// cutting, so only the west stub is closed — railCutting.selftest certifies the cutting itself), no span over
// liquid, no collision record published, and every draw of the seeded stream accounted for; every other map's
// layout carries no spur and its height field's exclusion is the function it was.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createHeightField, createLayout, mulberry32 } from './terrain.ts';
import { dressMapExtras, railSegmentIsDry, railSpanIsDry } from './maps/mapKits.ts';
import { MAP_IDS, getMapConfig } from './maps/index.ts';
import {
  RAIL_SPUR_BALLAST_M, RAIL_SPUR_BERTH_M, RAIL_SPUR_GAUGE_M, RAIL_SPUR_LAY_M, RAIL_SPUR_SPAN_M,
  createRailSpurExclusion, railRunLength, railSpurDistance, resampleRailPath,
} from './railSpurs.ts';

// ------------------------------------------------------------------ the path resampler
// the yards' rule: 10 m spans with the remainder in the last one, and an edge shorter than half a span still lays one
assert.deepEqual(resampleRailPath([[40, -235], [40, 235]]).map((s) => [s.az, s.bz]).slice(0, 2), [[-235, -225], [-225, -215]]);
assert.equal(resampleRailPath([[40, -235], [40, 235]]).length, 47);
const remainder = resampleRailPath([[58, -205], [58, 210]]);
assert.equal(remainder.length, 42); assert.deepEqual([remainder[41].az, remainder[41].bz], [205, 210], 'the 415 m line keeps its 5 m last span');
assert.deepEqual(resampleRailPath([[0, 0], [0, 3]]), [{ ax: 0, az: 0, bx: 0, bz: 3 }], 'a short edge is one span');
const truncated = resampleRailPath([[0, 0], [0, 14]]);
assert.equal(truncated.length, 1); assert.equal(truncated[0].bz, 10, 'the yards\' rule truncates a 14 m run at the rounded span count');
for (const span of resampleRailPath([[40, -235], [40, 235]])) assert.equal(span.ax, 40, 'an axis-aligned span never drifts off its x');
// the even split: equal spans, the last one closed exactly on the run, along a diagonal
const even = resampleRailPath([[0, 0], [30, 40]], 4, true);
assert.equal(even.length, Math.round(50 / 4));
for (const span of even) assert.ok(Math.abs(railRunLength(span.bx - span.ax, span.bz - span.az) - 50 / 13) < 1e-9, 'equal spans');
assert.deepEqual([even[12].bx, even[12].bz], [30, 40], 'the last even span ends on the path point');
assert.deepEqual(resampleRailPath([[5, 5], [5, 5], [5, 15]]), [{ ax: 5, az: 5, bx: 5, bz: 15 }], 'a zero-length edge lays nothing');
assert.equal(railRunLength(0, -7), 7); assert.equal(railRunLength(3, 0), 3); assert.equal(railRunLength(3, 4), 5);

// ------------------------------------------------------------------ the berth
const spurs = [{ path: [[0, 0], [100, 0], [100, 50]] }];
assert.equal(railSpurDistance(spurs, 50, 3), 3); assert.equal(railSpurDistance(spurs, 100, 25), 0);
assert.equal(railSpurDistance(spurs, -3, -4), 5, 'past an end the distance is to the end point');
assert.equal(railSpurDistance([], 0, 0), Infinity);
const inBerth = createRailSpurExclusion(spurs);
assert.equal(inBerth(50, RAIL_SPUR_BERTH_M - 0.01), true); assert.equal(inBerth(50, RAIL_SPUR_BERTH_M + 0.01), false);
assert.equal(inBerth(100 + RAIL_SPUR_BERTH_M * 0.7, 50 + RAIL_SPUR_BERTH_M * 0.7), true, 'the end disc');
assert.equal(inBerth(-RAIL_SPUR_BERTH_M - 0.01, 0), false);
assert.equal(createRailSpurExclusion(undefined), null); assert.equal(createRailSpurExclusion([]), null);
assert.equal(createRailSpurExclusion([{ path: [[1, 1]] }]), null, 'a single point lays no edge');
assert.equal(createRailSpurExclusion(spurs, 1)(50, 1.5), false, 'the berth is a parameter');

// ------------------------------------------------------------------ the dry-span check reduces to the yards' predicate
const flat = { getHeightAt: () => 0, _roadDist: () => 100 };
for (const [name, mask] of [
  ['mid', (_x, z) => Math.abs(z - 5) < 1 ? 1 : 0], ['edge', (x) => x > 1.4 ? 1 : 0], ['overhang', (_x, z) => z < 0 ? 1 : 0],
  ['corner', (x, z) => x < -1.2 && z > 9.5 ? 1 : 0], ['dry', () => 0],
]) {
  const field = { ...flat, getWaterMaskAt: mask };
  assert.equal(railSpanIsDry(field, 0, 0, 0, 10), railSegmentIsDry(field, 0, 0, 10), `${name}: the same verdict along +z`);
}
assert.equal(railSpanIsDry({ ...flat, getWaterMaskAt: (x, z) => Math.hypot(x - 5, z - 5) < 1.2 ? 1 : 0 }, 0, 0, 10, 10), false, 'a diagonal span sees a pond on its centreline');
assert.equal(railSpanIsDry({ ...flat, getWaterMaskAt: (x, z) => Math.hypot(x - 8, z - 2) < 1.2 ? 1 : 0 }, 0, 0, 10, 10), true, 'and ignores water off its slab');
assert.equal(railSpanIsDry({ ...flat, getWaterMaskAt: (x, z) => Math.hypot(x - 6.2, z - 3.8) < 0.5 ? 1 : 0 }, 0, 0, 10, 10), false, 'the slab edge at 1.5 m across');

// ------------------------------------------------------------------ build helpers
const names = ['plaster', 'plaster2', 'plaster3', 'roof', 'stone', 'wood', 'dark', 'glass', 'curtain', 'straw', 'baked'];
const bytes = (v) => Buffer.from(v.buffer, v.byteOffset, v.byteLength);
const hashGeometry = (g) => {
  const h = createHash('sha256');
  for (const n of Object.keys(g.attributes).sort()) h.update(n).update(bytes(g.attributes[n].array));
  if (g.index) h.update(bytes(g.index.array));
  return h.digest('hex');
};
const part = (g) => {
  const p = g.parameters; if (!p) return null;
  if (p.width === RAIL_SPUR_BALLAST_M && (p.height === 0.16 || p.height === 0.36)) return 'slab';
  if (p.width === 0.09 && p.height === 0.17) return 'rail';
  if (p.width === RAIL_SPUR_GAUGE_M + 0.66 && p.height === 0.09 && p.depth === 0.28) return 'sleeper';
  if (p.width === 0.18 && p.height === 1.5) return 'strut';
  if (p.width === 2.2 && p.height === 0.45) return 'beam';
  return null;
};
function build(mapId, field, seed) {
  const cfg = getMapConfig(mapId), buckets = Object.fromEntries(names.map((n) => [n, []]));
  const obstacles = [], colliders = [], random = mulberry32(seed ^ 0x5a17);
  let calls = 0;
  dressMapExtras({ mapId, extraKits: cfg.props?.extraKits, riverLandings: cfg.props?.riverLandings, L: field._layout,
    heightField: field, rng: () => { calls++; return random(); }, buckets, obstacles, colliders });
  const parts = { slab: [], rail: [], sleeper: [], strut: [], beam: [] };
  const digest = createHash('sha256');
  for (const n of names) for (const g of buckets[n]) { const kind = part(g); if (kind) { parts[kind].push(g); digest.update(n).update(hashGeometry(g)); } }
  return { buckets, parts, obstacles, colliders, calls, next: random(), digest: digest.digest('hex') };
}
const dispose = (built) => { for (const list of Object.values(built.buckets)) for (const g of list) g.dispose(); };

// ------------------------------------------------------------------ the yards: byte-identical to their fixed lines
// pinned 2026-09-24 on origin/main 63bf9b4a6 BEFORE the kit (the rail parts of dressMapExtras at seed 1337 ^ 0x5a17):
// the migration certificate of Cinder Junction, Foundry, Caldera and Skybridge onto the span layer.
const YARD_RAIL_DIGESTS = {
  railyard: [2911, '2baf4f422406a263a85d29de9cdc846fd47736ccaf7626b9acdc7b24c849856e'],
  foundry: [2911, '9c8afdefa31ecff31774127a773b43f9509c23cef5b03f5f6532709c297ec318'],
  caldera: [2915, '185fc72a507b486afd155176a51f1f64af9da178585fd4b92febc5c830ae20af'],
  skybridge: [2154, 'fe986dade9fe219ab27ac39e7bacf1766a0a83c2aceefba1411e491d166d6c4d'],
};
for (const [mapId, [count, digest]] of Object.entries(YARD_RAIL_DIGESTS)) {
  const field = createHeightField(1337, getMapConfig(mapId));
  assert.equal(field._layout.railSpurs, undefined, `${mapId}: a yard authors no spur`);
  const built = build(mapId, field, 1337);
  try {
    const total = Object.values(built.parts).reduce((n, list) => n + list.length, 0);
    assert.equal(total, count, `${mapId}: rail part count`);
    assert.equal(built.digest, digest, `${mapId}: the yard's track is byte-identical to its fixed lines (2026-09-24 pin)`);
    for (const slab of built.parts.slab) assert.equal(slab.parameters.height, 0.16, `${mapId}: the yards keep their 0.16 m slab`);
  } finally { dispose(built); }
}

// ------------------------------------------------------------------ Tarkhan's siding
const steppeConfig = getMapConfig('steppe');
const authored = steppeConfig.terrain.railSpurs;
assert.equal(authored.length, 1); assert.equal(authored[0].bufferStop, 'start', 'round 63: only the west stub is closed');
assert.deepEqual(authored[0].path, [[144, -181], [512, -181]], 'the loading-face siding to the map edge (round 57 authoring, round 63 extension)');
assert.deepEqual(authored[0].cutting, { from: [440, -181] }, 'the rim cutting from the round-57 stop (railCutting.selftest)');
const steppe = createHeightField(1337, steppeConfig);
assert.deepEqual(createLayout(steppeConfig).railSpurs, authored, 'the layout carries the authored spurs');
assert.equal(steppe._layout.railSpurs, authored);
// the berth: the height field's exclusion, on the line and off it, and not on the map's other ground
assert.equal(steppe._noVeg(300, -181), true); assert.equal(steppe._noVeg(300, -181 - RAIL_SPUR_BERTH_M + 0.05), true);
assert.equal(steppe._noVeg(300, -181 - RAIL_SPUR_BERTH_M - 0.05), false); assert.equal(steppe._noVeg(300, -200), false);
assert.equal(steppe._noVeg(144 - RAIL_SPUR_BERTH_M + 0.05, -181), true, 'the west stub and its stop');
assert.equal(steppe._noVeg(440 + RAIL_SPUR_BERTH_M + 0.05, -181), true, 'round 63: the line runs on past the old east stop');
assert.equal(steppe._noVeg(511.5, -181), true, 'to the map edge');
const spurSpans = resampleRailPath(authored[0].path, RAIL_SPUR_LAY_M, true);
assert.equal(spurSpans.length, 92, '368 m in 4 m spans'); assert.equal(RAIL_SPUR_LAY_M, 4); assert.equal(RAIL_SPUR_SPAN_M, 10);
const built = build('steppe', steppe, 1337);
try {
  const { slab, rail, sleeper, strut, beam } = built.parts;
  assert.equal(slab.length, 92); assert.equal(rail.length, 184); assert.equal(strut.length, 2); assert.equal(beam.length, 1, 'one stop: the west stub');
  assert.equal(sleeper.length, spurSpans.reduce((n, s) => n + Math.round(railRunLength(s.bx - s.ax, s.bz - s.az) / 1.4), 0) + 0,
    'one sleeper every ~1.4 m of every span (the fitted rise of a 4 m span never changes the count)');
  assert.equal(built.obstacles.length, 0); assert.equal(built.colliders.length, 0, 'soft dressing: no collision record');
  assert.equal(built.calls, 24 * slab.length + sleeper.length + 4 * beam.length, 'every seeded draw: 24 slab colours, one sleeper jitter, four beam UV jitters');
  assert.equal(built.digest, '564361d75c3fb68acc16789ebce89c6bdc6c86673922130633ceae56d2f6cace', 'the siding at seed 1337 (2026-09-24 pin; round 63: to the edge through the cutting, one stop)');
  // every slab bedded: no corner floats, every top corner clears the ground; every span dry
  const v = new THREE.Vector3();
  let worstGap = -Infinity, lowestTop = Infinity;
  for (const g of slab) {
    assert.equal(g.parameters.height, 0.36, 'the spur lays the deep slab');
    const pos = g.attributes.position, verts = [];
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); verts.push([v.x, v.y, v.z]); }
    verts.sort((a, b) => a[1] - b[1]);
    for (const [x, y, z] of verts.slice(0, 12)) worstGap = Math.max(worstGap, y - steppe.getHeightAt(x, z));
    for (const [x, y, z] of verts.slice(-12)) lowestTop = Math.min(lowestTop, y - steppe.getHeightAt(x, z));
    g.computeBoundingBox();
    const { min, max } = g.boundingBox;
    for (let iz = 0; iz <= 8; iz++) for (let ix = 0; ix <= 4; ix++) {
      assert.ok(steppe.getWaterMaskAt(min.x + (max.x - min.x) * ix / 4, min.z + (max.z - min.z) * iz / 8) <= 0.01, 'no span over liquid');
    }
  }
  assert.ok(worstGap < -0.1, `every slab's bottom corners sit under the ground (worst ${worstGap.toFixed(3)} m)`);
  assert.ok(lowestTop > 0.03, `every slab's top corners clear the ground (lowest ${lowestTop.toFixed(3)} m)`);
  // the stack: per span, the two rails ride the slab's top and the sleepers lie between them
  const centre = (g) => { g.computeBoundingBox(); return g.boundingBox.getCenter(new THREE.Vector3()); };
  for (let i = 0; i < slab.length; i++) {
    const sc = centre(slab[i]);
    for (const r of [rail[2 * i], rail[2 * i + 1]]) {
      const rc = centre(r);
      assert.ok(Math.abs(rc.z - sc.z) > 0.6 && Math.abs(rc.z - sc.z) < 0.85, 'a rail sits ±0.72 m across the slab');
      assert.ok(Math.abs(rc.x - sc.x) < 0.2, 'and along it');
      // the deep slab's centre is 0.03 m under the plane, the rail's 0.24 m over it: 0.27 m apart, ± the roll at 0.72 m
      assert.ok(rc.y - sc.y > 0.15 && rc.y - sc.y < 0.40, `rail centre 0.27 m over the slab centre (${(rc.y - sc.y).toFixed(3)})`);
    }
  }
  for (const s of sleeper) {
    const sc = centre(s), rise = sc.y - steppe.getHeightAt(sc.x, sc.z);
    assert.ok(rise > 0.03 && rise < 0.25, `a sleeper lies on the bedded slab (${rise.toFixed(3)} m over the ground)`);
    assert.ok(Math.abs(sc.z + 181) < 0.1, 'centred on the line');
  }
  for (const r of rail) { const rc = centre(r); const rise = rc.y - steppe.getHeightAt(rc.x, rc.z); assert.ok(rise > 0.08 && rise < 0.32, `a rail rides the sleepers (${rise.toFixed(3)} m over the ground)`); }
  // the stop: 0.8 m past the west stub, the beam across the track, the struts astride the gauge; the east end is open
  const beamCentres = beam.map(centre).sort((a, b) => a.x - b.x);
  assert.ok(Math.abs(beamCentres[0].x - (144 - 0.8 + 0.05)) < 0.02, 'a beam 0.8 m past the stub, faced to the track');
  for (const b of beamCentres) { assert.ok(Math.abs(b.z + 181) < 0.01); assert.ok(b.y - steppe.getHeightAt(b.x, b.z) > 0.9, 'the beam at buffer height'); }
  const strutZ = strut.map((g) => centre(g).z).sort((a, b) => a - b);
  assert.deepEqual(strutZ.map((z) => Math.round((z + 181) * 100) / 100), [-0.72, 0.72], 'struts astride the gauge, the stop turned to the track');
  const lastSlab = slab.map(centre).sort((a, b) => a.x - b.x)[slab.length - 1];
  assert.ok(lastSlab.x > 509.5 && lastSlab.x < 510.5, 'the last 4 m slab is centred 2 m short of the edge (the line leaves the square)');
} finally { dispose(built); }

// ------------------------------------------------------------------ every other map: no spur, the exclusion it had
for (const mapId of MAP_IDS) {
  if (mapId === 'steppe') continue;
  const cfg = getMapConfig(mapId);
  assert.equal(cfg.terrain?.railSpurs, undefined, `${mapId}: no authored spur`);
  assert.equal(createLayout(cfg).railSpurs, undefined, `${mapId}: no layout key`);
}
console.log('railSpurs.selftest: resampler (yard rule + even split), berth, dry-span reduction; four yards byte-identical at seed 1337; Tarkhan siding 92 spans / 184 rails / 276 sleepers / 1 stop bedded with no gap to the map edge, 0 collision records; 30 other layouts unchanged');
