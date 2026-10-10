// Receipt of the rail spur kit (round 57, 2026-09-24): the path resampler reproduces the rail yards' segmentation
// rule and shares a run evenly on request; the berth exclusion is a point-to-polyline test; the four rail yards'
// track lays its 0.16 m slab and rebuilds byte-identically (2026-10-01: the seed-1337 rail-part digests pinned on
// 63bf9b4a6 as the kit's migration certificate are retired as change detectors); Tarkhan Steppe's grain-station
// siding is laid from the layout it authored, every
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
  RAIL_COAL_STAGE_OFFSET_M, RAIL_COAL_STAGE_PITCH_M, RAIL_OPEN_KIT_M, RAIL_SPUR_BALLAST_M, RAIL_SPUR_BERTH_M, RAIL_SPUR_GAUGE_M,
  RAIL_SPUR_LAY_M, RAIL_SPUR_SPAN_M, createRailSpurExclusion, railCoalStageStations, railRunLength, railSpurDistance,
  resampleRailPath,
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

// ------------------------------------------------------------------ the yards: slab, no spur, deterministic track
// (2026-10-01: Cinder Junction's yard is authored spurs now — its own section below)
// (batch 4: Skybridge round 3, e53ee9c50 — Page never had a railway, so its yard is gone)
for (const mapId of ['foundry', 'caldera']) {
  const field = createHeightField(1337, getMapConfig(mapId));
  assert.equal(field._layout.railSpurs, undefined, `${mapId}: a yard authors no spur`);
  const built = build(mapId, field, 1337), again = build(mapId, field, 1337);
  try {
    const total = Object.values(built.parts).reduce((n, list) => n + list.length, 0);
    assert.ok(built.parts.slab.length > 0 && built.parts.rail.length > 0 && built.parts.sleeper.length > 0,
      `${mapId}: the yard lays slabs, rails and sleepers (${total} parts)`);
    assert.equal(again.digest, built.digest, `${mapId}: the yard's track rebuilds byte-identically from the same seed`);
    assert.equal(again.calls, built.calls, `${mapId}: the rebuild draws the same seeded stream`);
    for (const slab of built.parts.slab) assert.equal(slab.parameters.height, 0.16, `${mapId}: the yards keep their 0.16 m slab`);
  } finally { dispose(built); dispose(again); }
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
  // the line runs on past the edge in the open (2026-10-03, the map-borders lane: the round-67 tunnel portal is retired;
  // railCutting.selftest audits the open line); the siding's own parts are the ones inside the square
  const centreX = (g) => { g.computeBoundingBox(); return g.boundingBox.getCenter(new THREE.Vector3()).x; };
  const inSquare = (list) => list.filter((g) => centreX(g) <= 512);
  const approach = { slab: built.parts.slab.filter((g) => centreX(g) > 512), sleeper: built.parts.sleeper.filter((g) => centreX(g) > 512), rail: built.parts.rail.filter((g) => centreX(g) > 512) };
  // ground lane (2026-10-03): an infill sleeper (userData.railInfill, a hashed jitter, no seeded draw) lies midway before
  // every seeded one — sleepers every ~0.7 m; the seeded ones keep the old count and the old draws
  const seededOnly = (list) => list.filter((g) => !g.userData.railInfill);
  const infillAll = built.parts.sleeper.filter((g) => g.userData.railInfill);
  assert.equal(infillAll.length, seededOnly(built.parts.sleeper).length, 'one infill sleeper for every seeded one');
  approach.sleeper = seededOnly(approach.sleeper);
  const slab = inSquare(built.parts.slab), rail = inSquare(built.parts.rail), sleeper = seededOnly(inSquare(built.parts.sleeper)), { strut, beam } = built.parts;
  assert.equal(slab.length, 92); assert.equal(rail.length, 184); assert.equal(strut.length, 2); assert.equal(beam.length, 1, 'one stop: the west stub');
  assert.equal(sleeper.length, spurSpans.reduce((n, s) => n + Math.round(railRunLength(s.bx - s.ax, s.bz - s.az) / 1.4), 0) + 0,
    'one sleeper every ~1.4 m of every span (the fitted rise of a 4 m span never changes the count)');
  assert.equal(approach.slab.length, RAIL_OPEN_KIT_M / RAIL_SPUR_LAY_M, 'the open line past the edge, 60 spans'); assert.equal(approach.rail.length, 2 * RAIL_OPEN_KIT_M / RAIL_SPUR_LAY_M);
  assert.equal(built.obstacles.length, 0); assert.equal(built.colliders.length, 0, 'no record: the track is soft dressing');
  assert.equal(built.buckets.stone.length, 0, 'no masonry');
  assert.equal(built.calls, 24 * (slab.length + approach.slab.length) + sleeper.length + approach.sleeper.length + 4 * beam.length,
    'every seeded draw: 24 slab colours, one sleeper jitter, four beam UV jitters');
  const rebuilt = build('steppe', steppe, 1337);
  try { assert.equal(rebuilt.digest, built.digest, 'the siding rebuilds byte-identically from the same seed'); }
  finally { dispose(rebuilt); }
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
  for (const s of approach.sleeper) { const sc = centre(s), rise = sc.y - steppe.getOutlandHeightAt(sc.x, sc.z); assert.ok(rise > 0.03 && rise < 0.25, `round 67: an approach sleeper lies on the valley floor the ring seats on (${rise.toFixed(3)} m)`); }
  for (const r of rail) { const rc = centre(r); const rise = rc.y - steppe.getHeightAt(rc.x, rc.z); assert.ok(rise > 0.08 && rise < 0.32, `a rail rides the sleepers (${rise.toFixed(3)} m over the ground)`); }
  // the stop: 0.8 m past the west stub, the beam across the track, the struts astride the gauge; the east end is open
  const beamCentres = beam.map(centre).sort((a, b) => a.x - b.x);
  assert.ok(Math.abs(beamCentres[0].x - (144 - 0.8 + 0.05)) < 0.02, 'a beam 0.8 m past the stub, faced to the track');
  for (const b of beamCentres) { assert.ok(Math.abs(b.z + 181) < 0.01); assert.ok(b.y - steppe.getHeightAt(b.x, b.z) > 0.9, 'the beam at buffer height'); }
  const strutZ = strut.map((g) => centre(g).z).sort((a, b) => a - b);
  assert.deepEqual(strutZ.map((z) => Math.round((z + 181) * 100) / 100), [-0.72, 0.72], 'struts astride the gauge, the stop turned to the track');
  const lastSlab = slab.map(centre).sort((a, b) => a.x - b.x)[slab.length - 1];
  assert.ok(lastSlab.x > 509.5 && lastSlab.x < 510.5, 'the last 4 m slab in the square is centred 2 m short of the edge (the line leaves the square)');
} finally { dispose(built); }

// ------------------------------------------------------------------ Cinder Junction (2026-10-01): the yard as authored spurs
// The redesigned junction lays its double main line, the three sidings each side, the two loading stubs and their coal
// stages from the layout it authors; the legacy siding fan is gone. Every spur keeps its berth, the track rebuilds
// byte-identically, both stubs close at their buffer stops, every coal heap stands at its stage's offset beside its
// stub, and the only collision records are the heaps (2026-10-03: the two tunnel portals are retired; the line runs on in
// the open past each edge, railCutting.selftest).
let junctionSummary = '';
{
  const cfg = getMapConfig('railyard'), authored = cfg.terrain.railSpurs;
  const field = createHeightField(1337, cfg);
  assert.equal(field._layout.railSpurs, authored, 'Cinder Junction: the layout carries the authored spurs');
  assert.ok(!(cfg.props.extraKits ?? []).includes('rail'), 'Cinder Junction: no legacy siding fan');
  for (const spur of authored) for (let i = 1; i < spur.path.length; i++) {
    const [ax, az] = spur.path[i - 1], [bx, bz] = spur.path[i];
    assert.equal(field._noVeg((ax + bx) / 2, (az + bz) / 2), true, 'every span keeps its berth clear');
  }
  const built = build('railyard', field, 1337), again = build('railyard', field, 1337);
  try {
    assert.ok(built.parts.slab.length > 0 && built.parts.rail.length > 0 && built.parts.sleeper.length > 0,
      'Cinder Junction lays slabs, rails and sleepers');
    assert.equal(again.digest, built.digest, 'Cinder Junction: the track rebuilds byte-identically from the same seed');
    assert.equal(again.calls, built.calls, 'Cinder Junction: the rebuild draws the same seeded stream');
    const spans = authored.reduce((n, spur) => n + resampleRailPath(spur.path, RAIL_SPUR_LAY_M, true).length, 0);
    assert.ok(built.parts.slab.length >= spans, `a slab for every span in the square (${built.parts.slab.length} for ${spans})`);
    assert.equal(built.parts.beam.length, authored.filter((spur) => spur.bufferStop).length, 'one stop beam closes each stub');
    const stages = authored.filter((spur) => spur.coalStage);
    assert.equal(stages.length, 2, 'a coal stage beside each loading stub');
    const coal = built.obstacles.filter((record) => record.kind === 'coal-heap');
    const stations = stages.flatMap((spur) => railCoalStageStations(spur));
    assert.ok(coal.length >= 6 && coal.length <= stations.length, `the stages' admitted heaps (${coal.length} of ${stations.length})`);
    for (const heap of coal) {
      const { cx, cz } = heap.shape2;
      const nearest = Math.min(...stations.map((station) => Math.hypot(station.x - cx, station.z - cz)));
      assert.ok(nearest < 1.2, 'every heap stands on a stage station');
      const stub = Math.min(...stages.map((spur) => railSpurDistance([spur], cx, cz)));
      assert.ok(Math.abs(stub - RAIL_COAL_STAGE_OFFSET_M) < 1.2, `beside its stub at the stage offset (${stub.toFixed(2)} m)`);
    }
    for (const spur of stages) {
      const own = railCoalStageStations(spur);
      for (let i = 1; i < own.length; i++) {
        assert.ok(Math.abs(Math.hypot(own[i].x - own[i - 1].x, own[i].z - own[i - 1].z) - RAIL_COAL_STAGE_PITCH_M) < 1e-9, 'stations at the stage pitch');
      }
    }
    assert.equal(built.obstacles.filter((record) => record.kind === 'tunnel-portal').length, 0, 'no tunnel portal');
    // P5 (the map-vehicles lane): the standing rolling stock carries one solid record a vehicle, nothing else does
    const stock = built.obstacles.filter((record) => record.kind === 'rolling-stock');
    assert.equal(stock.length, authored.reduce((n, spur) => n + (spur.stock ?? []).reduce((m, cut) => m + cut.kinds.length, 0), 0),
      'one record for each standing vehicle');
    assert.equal(built.obstacles.length, coal.length + stock.length, 'nothing else on the line publishes collision');
    junctionSummary = `Cinder Junction ${authored.length} spurs / ${built.parts.slab.length} slabs / ${coal.length} coal heaps`;
  } finally { dispose(built); dispose(again); }
}

// ------------------------------------------------------------------ every other map: no spur, the exclusion it had
for (const mapId of MAP_IDS) {
  if (mapId === 'steppe' || mapId === 'railyard') continue;
  const cfg = getMapConfig(mapId);
  assert.equal(cfg.terrain?.railSpurs, undefined, `${mapId}: no authored spur`);
  assert.equal(createLayout(cfg).railSpurs, undefined, `${mapId}: no layout key`);
}
console.log(`railSpurs.selftest: resampler (yard rule + even split), berth, dry-span reduction; two yards deterministic with their 0.16 m slab; Tarkhan siding 92 spans / 184 rails / 276 sleepers / 1 stop bedded with no gap to the map edge, then ${RAIL_OPEN_KIT_M / RAIL_SPUR_LAY_M} spans on the open line past the edge (no record); ${junctionSummary}; ${MAP_IDS.length - 2} other layouts carry no spur`);
