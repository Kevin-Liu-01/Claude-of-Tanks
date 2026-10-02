import assert from 'node:assert/strict';
import { COPPER_QUARRY, copperQuarryRise, sampleCopperQuarrySurface } from './copperQuarrySurface.ts';
import { acquireTerrainChunkIndex, createHeightField, createLayout } from './terrain.ts';
import { sampleHorizonGeometry, HORIZON_SEGMENTS } from './maps/horizon.ts';
import { getMapConfig } from './maps/index.ts';
import copper from './maps/copperMesa.ts';

const seeds = [1337, 2049, 7719];
const legacy = { ...copper, terrain: { ...copper.terrain, quarryBenches: false } };
const layout = createLayout(copper);
assert.deepEqual(layout.roads, createLayout(legacy).roads, 'All authored road vertices retained');
assert.deepEqual(layout.spawns, createLayout(legacy).spawns, 'All authored spawn records retained');
assert.deepEqual(copper.terrain.landforms[0], { kind: 'basin', x: COPPER_QUARRY.x,
  z: COPPER_QUARRY.z, rx: COPPER_QUARRY.rx, rz: COPPER_QUARRY.rz,
  height: -COPPER_QUARRY.depth, corridorScale: 0.7 }, 'Cut stays inside the original pit');
assert.deepEqual(copper.terrain.marshes, [{ x: -66, z: 32, r: 38, dip: 0.8 }],
  'Protected mud-pan coordinates remain the actual authored wet footprint');
assert.equal(copper.terrain.village.x0, 64, 'Eastern cut boundary leaves24m before the building zone');
for (const [a, b] of [[0, 0.28], [0.39, 0.52], [0.63, 0.76]]) {
  assert.equal(copperQuarryRise(a), copperQuarryRise(b), 'Cut treads have finite radial width');
}
for (const point of [[-180, 0, 24], [40, 0, 100], [-66, 32, 100], [-300, 0, 100]]) {
  assert.equal(sampleCopperQuarrySurface(point[0], point[1], 17, -8, point[2]), 17,
    'Road, settlement, wet pan and outside-pit guards are exact');
}

function equalSurface(actual, baseline, x, z, label) {
  assert.equal(actual.getHeightAt(x, z), baseline.getHeightAt(x, z), `${label}: exact height`);
  assert.deepEqual(actual.getNormalAt(x, z).toArray(), baseline.getNormalAt(x, z).toArray(),
    `${label}: exact support normal`);
}

const receipts = [];
for (const seed of seeds) {
  // 2026-09-17 field trenches: the relief law is compared on untrenched fields (fieldTrenches:false); the carve has its own receipt.
  const actual = createHeightField(seed, { ...copper, fieldTrenches: false }), baseline = createHeightField(seed, { ...legacy, fieldTrenches: false });
  let roadSamples = 0, spawnSamples = 0, fastSamples = 0, changedArea = 0;
  const treadArea = [0, 0];
  for (const road of layout.roads) for (let i = 1; i < road.length; i++) {
    const a = road[i - 1], b = road[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = (b[1] - a[1]) / length, nz = -(b[0] - a[0]) / length;
    for (const t of [0, 0.5, 1]) for (const lateral of [-21, -14, -4, 0, 4, 14, 21]) {
      const x = a[0] + (b[0] - a[0]) * t + nx * lateral;
      const z = a[1] + (b[1] - a[1]) * t + nz * lateral;
      if (baseline._roadDist(x, z) > 22) continue;
      equalSurface(actual, baseline, x, z, `${seed}: road/earthworks`); roadSamples++;
    }
  }
  for (const spawn of [layout.spawns.player, ...layout.spawns.enemies]) {
    for (const radius of [0, 9, 22, 36, 60, 90, 92]) for (let angle = 0; angle < 24; angle++) {
      const a = angle * Math.PI / 12;
      equalSurface(actual, baseline, spawn.x + Math.cos(a) * radius,
        spawn.z + Math.sin(a) * radius, `${seed}: spawn approach`); spawnSamples++;
    }
  }
  for (const beat of copper.props.tacticalBeats) {
    for (const dx of [-20, 0, 20]) for (const dz of [-20, 0, 20]) {
      equalSurface(actual, baseline, beat.x + dx, beat.z + dz, `${seed}: tactical structure support`);
    }
  }
  for (let z = -194; z < 234; z += 4) for (let x = -256; x < 40; x += 4) {
    const h = actual.getHeightAt(x, z), old = baseline.getHeightAt(x, z);
    assert.ok(Number.isFinite(h) && h <= old && h >= old - COPPER_QUARRY.maximumCut - 1e-10,
      'Excavation never raises a dam and cannot exceed its8m cut budget');
    assert.equal(actual.getGroundType(x, z), baseline.getGroundType(x, z), 'Ground collision classification retained');
    if (old - h < 0.1) continue;
    changedArea += 16;
    const q = Math.hypot((x + 78) / 178, (z - 20) / 214);
    const normal = actual.getNormalAt(x, z);
    for (const [i, a, b] of [[0, 0.39, 0.52], [1, 0.63, 0.76]]) {
      if (q >= a && q <= b && normal.y > 0.99) treadArea[i] += 16;
    }
    if (x % 20 === 0 && z % 20 === 6) {
      const px = x + 0.25, pz = z + 0.35;
      assert.ok(Math.abs(actual.getHeightAt(px, pz) - actual.getHeightAtFast(px, pz)) < 0.08,
        'Existing live collision/LOS grid follows the same new exact surface');
      fastSamples++;
    }
  }
  assert.ok(roadSamples > 3000 && spawnSamples === 1344);
  assert.ok(changedArea > 15000 && changedArea < 60000, 'Cut is a bounded part of the existing pit');
  assert.ok(treadArea.every(area => area >= 1200), 'Both mine benches have substantial real2D level tread area');
  assert.ok(fastSamples > 10, 'Collision-cache checks actually sample changed ground');
  receipts.push({ seed, roadSamples, spawnSamples, changedArea, treadArea, fastSamples });
}

// The opt-in alone cannot alter another map. This exercises the production
// guard on the same terrain instead of trusting a source-text assertion.
const otherMap = getMapConfig('verdant');
const gated = createHeightField(1337, { ...otherMap, terrain: { ...otherMap.terrain, quarryBenches: true } });
const uncut = createHeightField(1337, { ...otherMap, terrain: { ...otherMap.terrain, quarryBenches: false } });
for (let z = -180; z < 220; z += 16) for (let x = -240; x < 40; x += 16) {
  equalSurface(gated, uncut, x, z, 'Other map IDs ignore quarry opt-in');
}

// Copper Mesa's own horizon caps. 2026-10-01 (frozen pins retired): the sha256 aggregate of the other 28 rings (with
// historical Polders/Titan/Badlands inputs), its mutation control and the byte pin of the current Polders ring were
// change detectors; horizonResources gates every registered ring (finite rows, closed rim, no folds, layered ranges,
// Polders' low ridge) and titanGorgeHorizon owns Titan's caps.
for (const seed of seeds) {
  const ring = sampleHorizonGeometry(getMapConfig('copper_mesa'), seed);
  // Vista pass (2026-09-19, owner: 'consider this a triple AAA pass'): the ring ladder is 431 columns and 18 / 36 rows with
  // ridged relief, the first ridge stands 700-720 m out and the skirt seats on the terrain.
  const n = HORIZON_SEGMENTS;
  // round 47 (owner 2026-09-23, "the skybox and mountains are too bland"): the mesa stack uploads 30 rows (was 18)
  assert.equal(ring.rows.length, 30); assert.equal(ring.positions.length, n * 30 * 3);
  assert.equal(ring.heights.length, n * 30);
  const p = ring.positions, h = ring.heights;
  const radius = (row, c) => Math.hypot(p[(row * n + c) * 3], p[(row * n + c) * 3 + 2]);
  for (let c = 0; c < n; c++) for (let row = 1; row < 30; row++) {
    assert.ok(radius(row, c) > radius(row - 1, c) + 1, 'No folded horizon faces');
    // The restored 1049e4e mesa profile keeps its terraced cliff steps (up to
    // about 4:1 between adjacent rows); a genuinely vertical sheet is steeper.
    assert.ok((h[row * n + c] - h[(row - 1) * n + c])
      / (radius(row, c) - radius(row - 1, c)) < 4.5, 'No new vertical skyline sheets');
  }
  for (const top of [9, 17]) {
    let capQuads = 0, area = 0;
    for (let c = 0; c < n; c++) {
      const next = (c + 1) % n;
      const ids = [(top - 1) * n + c, top * n + c, top * n + next, (top - 1) * n + next];
      const levels = ids.map(i => h[i]);
      if (Math.max(...levels) - Math.min(...levels) >= 2) continue;
      // Restored 1049e4e rows: the near table's cap depth follows the closer
      // 585-760 m row spacing (about 58 m), the outer table keeps 90 m.
      assert.ok(radius(top, c) - radius(top - 1, c) >= (top === 9 ? 40 : 90) - 0.001);
      let doubleArea = 0;
      for (let j = 0; j < 4; j++) {
        const a = ids[j] * 3, b = ids[(j + 1) % 4] * 3;
        doubleArea += p[a] * p[b + 2] - p[b] * p[a + 2];
      }
      area += Math.abs(doubleArea) * 0.5; capQuads++;
    }
    assert.ok(capQuads >= 35 && area > (top === 9 ? 40000 : 120000), // vista pass: narrower 431-column quads
      `Both ranges have finite attached cap surfaces (range ${top}: ${capQuads} quads, ${Math.round(area)} m2)`);
  }
}
for (const segments of [96, 48, 24]) {
  const index = acquireTerrainChunkIndex(new Map(), segments);
  assert.equal(index.count, segments * segments * 6 + 4 * segments * 6,
    'All terrain LODs retain their original surface/skirt topology');
}
console.log('copperQuarrySurface: protected exact terrain, bounded2D treads, collision cache and finite mesa caps PASS', receipts);
