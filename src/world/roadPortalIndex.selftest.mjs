import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createLayout } from './terrain.ts';
import { MAP_IDS, getMapConfig } from './maps/index.ts';
import { buildRoadPortalShoulderIndex, gradeIndexedRoadPortalShoulders,
  gradeRoadPortalShoulders, gradeSelectedRoadPortalShoulders } from './fixtures/legacyRoadPortalShoulders.ts';

// The reference is the preserved r1 production policy, not a second indexed
// implementation. Keep its exact source frozen while optimizing selection.
const source = readFileSync(new URL('./fixtures/legacyRoadPortalShoulders.ts', import.meta.url), 'utf8');
const start = source.indexOf('function portalShoulderHeight('), end = source.indexOf('function portalOriginDistance2(');
assert.ok(start >= 0 && end > start, 'preserved historical reference block exists in its test-only owner');
const legacy = source.slice(start, end);
const legacyHash = createHash('sha256').update(legacy).digest('hex');
assert.equal(legacyHash, '3377c01f9bc5226872c2b4fd6f6b5ce60ffb5365c1e8d5fa837d57fcf9d89cef',
  'r1 production shoulder reference remains exact');
const planes = [(x, z) => x * .017 - z * .023 + Math.sin(x * .007) * 3,
  (x, z) => x * x * .002 - z * z * .003];
let comparisons = 0;
const receipts = [];
function comparePoint(index, mapId, roads, spec, offset, rim, x, z) {
  if (Math.max(Math.abs(x), Math.abs(z)) > 512) return;
  for (const height of [-60, 0, 100]) for (const plane of planes) {
    const expected = gradeRoadPortalShoulders(mapId, roads, spec.paths, offset, x, z, height, rim, plane);
    const actual = index ? gradeIndexedRoadPortalShoulders(index, x, z, height, plane) : height;
    assert.equal(actual, expected, `${mapId}: exact indexed height at ${x},${z} from ${height}`);
    comparisons++;
  }
}
function boundaryPoints(index, compare) {
  if (!index) return;
  for (let at = 0; at < index.data.length; at += 9) {
    const d = index.data, ax = d[at], az = d[at + 1], ux = d[at + 7], uz = d[at + 8];
    for (const along of [-32 - 1e-7, -32, -32 + 1e-7, -16, 0, 16, 32, 64, 128, 184, 256, 384, 512]) {
      for (const across of [-index.width - .001, -index.width, -index.width + .001,
        -6, 0, 6, index.width - .001, index.width, index.width + .001]) {
        compare(ax + ux * along + uz * across, az + uz * along - ux * across);
      }
    }
  }
}
for (const mapId of MAP_IDS) {
  const config = getMapConfig(mapId), spec = config.terrain.roads, roads = createLayout(config).roads;
  if (!spec || spec === 'country' || !spec.paths) continue;
  const offset = spec.grid ? spec.grid.xs.length + spec.grid.zs.length : 0;
  const index = buildRoadPortalShoulderIndex(mapId, roads, spec.paths, offset, config.terrain.rimH);
  const compare = (x, z) => comparePoint(index, mapId, roads, spec, offset, config.terrain.rimH, x, z);
  for (let z = -512; z <= 512; z += 16) for (let x = -512; x <= 512; x += 16) compare(x, z);
  // Exact cell boundaries and both neighboring floating-point sides.
  for (let cell = 0; cell <= 16; cell++) for (let station = -480; station <= 480; station += 64) {
    for (const delta of [-1e-7, 0, 1e-7]) {
      compare(cell * 64 - 512 + delta, station);
      compare(station, cell * 64 - 512 + delta);
    }
  }
  boundaryPoints(index, compare);
  if (!index) { receipts.push({ mapId, bytes: 0, portals: 0 }); continue; }
  assert.ok(index.data instanceof Float64Array);
  assert.ok(index.cells instanceof Uint16Array);
  const bytes = index.data.byteLength + index.cells.byteLength;
  assert.ok(bytes <= 1376, `${mapId}: current roster descriptor/mask backing budget`);
  const counts = [...index.cells].map(mask => {
    let count = 0;
    while (mask) { mask &= mask - 1; count++; }
    return count;
  });
  receipts.push({ mapId, bytes, portals: index.data.length / 9,
    selectedCells: counts.filter(Boolean).length, maxCandidates: Math.max(...counts),
    meanCandidates: counts.reduce((a, b) => a + b, 0) / counts.length });
}
assert.equal(buildRoadPortalShoulderIndex(undefined, [], [], 0, 32), null);
// A real admitted portal with an already-supported surface must not read the
// taper. This observes executed work rather than matching an early-return string.
const fixture = getMapConfig('fjord'), fixtureRoads = createLayout(fixture).roads;
const fixtureIndex = buildRoadPortalShoulderIndex('fjord', fixtureRoads, fixture.terrain.roads.paths, 0, fixture.terrain.rimH);
const d = fixtureIndex.data, px = d[0] + d[7] * 16, pz = d[1] + d[8] * 16;
let taperReads = 0;
const observedIndex = new Proxy(fixtureIndex, { get(target, key) {
  if (key === 'edgeWidth') taperReads++;
  return target[key];
} });
for (const value of [-0, 0, 1, -1, Infinity, -Infinity, NaN]) {
  const expected = gradeRoadPortalShoulders('fjord', fixtureRoads, fixture.terrain.roads.paths,
    0, px, pz, value, fixture.terrain.rimH, () => value);
  assert.equal(gradeSelectedRoadPortalShoulders(observedIndex, 1, px, pz, value, () => value), expected);
}
// The NaN case cannot take an equality exit; all six equal-target cases can.
assert.equal(taperReads, 1);
const previousReads = taperReads;
assert.notEqual(gradeSelectedRoadPortalShoulders(observedIndex, 1, px, pz, 100, () => 0), 100);
assert.equal(taperReads, previousReads + 1, 'an actual cut still evaluates its support taper');
assert.ok(Object.is(gradeSelectedRoadPortalShoulders(observedIndex, 0, 0, 0, -0,
  () => { throw new Error('empty selection must not sample a road plane'); }), -0));
console.log(JSON.stringify({ test: 'roadPortalIndex', scope: 'exact r1 policy equivalence, not timing', legacyHash, comparisons, receipts }));
