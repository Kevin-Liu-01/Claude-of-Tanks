import assert from 'node:assert/strict';
import { getMapConfig } from './maps/index.ts';
import { HORIZON_SEGMENTS, sampleHorizonGeometry } from './maps/horizon.ts';

// Titan Gorge's finite table caps (round 47 mesa stack, round 72 relief). The checks below are live: the cap shape
// gates, and a same-run comparison with the explicit `finiteTableCaps: false` authoring opt-out proving the caps move
// only the approach and cap-front rows. 2026-10-01 (frozen pins retired): the sha256 pins of the other 29 maps, the
// historical pre-cap fixture and the current Titan bytes were change detectors, not invariants; every registered ring
// still passes horizonResources' all-map gates (finite rows, closed rim, no folds, layered ranges).
const seeds = [1337, 2049, 7719];
// Vista pass (2026-09-19, owner: 'consider this a triple AAA pass'): the ring ladder is 431 columns and 18 / 36 rows with
// ridged relief, the first ridge stands 700-720 m out and the skirt seats on the terrain; every geometry receipt below is
// re-established at this commit (the 1049e4e byte identity it guarded is superseded by that owner direction).
const n = HORIZON_SEGMENTS;
const config = getMapConfig('titan_gorge');
const historicalConfig = { ...config, horizon: { ...config.horizon, finiteTableCaps: false } };

function capSurfaces(ring) {
  const p = ring.positions, y = (row, c) => p[(row * n + c) * 3 + 1];
  const radius = (row, c) => Math.hypot(p[(row * n + c) * 3], p[(row * n + c) * 3 + 2]);
  const receipts = [];
  // Restored 1049e4e rows sit closer together (row 4 -> 5 spans about 58 m
  // instead of 360 m), so the near table's cap depth and plan area scale down
  // while the outer table keeps its former depth.
  for (const [top, minimumDepth] of [[9, 40], [17, 90]]) {
    const capLevel = (ring.rows[top].base + ring.rows[top].amp * 0.60) * config.horizon.amp;
    let area = 0, quads = 0, run = 0, longestRun = 0;
    for (let c = 0; c < n * 2; c++) {
      const column = c % n, next = (column + 1) % n;
      const levels = [y(top - 1, column), y(top, column), y(top, next), y(top - 1, next)];
      const depth = Math.min(radius(top, column) - radius(top - 1, column),
        radius(top, next) - radius(top - 1, next));
      const isCap = Math.max(...levels) - Math.min(...levels) < 2
        && Math.min(...levels) >= capLevel - 2 && depth >= minimumDepth - 0.001;
      if (!isCap) { run = 0; continue; }
      longestRun = Math.max(longestRun, ++run);
      if (c >= n) continue;
      const ids = [(top - 1) * n + column, top * n + column, top * n + next, (top - 1) * n + next];
      let doubleArea = 0;
      for (let edge = 0; edge < 4; edge++) {
        const a = ids[edge] * 3, b = ids[(edge + 1) % 4] * 3;
        doubleArea += p[a] * p[b + 2] - p[b] * p[a + 2];
      }
      area += Math.abs(doubleArea) / 2; quads++;
    }
    // vista pass: 431 columns make each cap quad narrower; measured near 45k-129k m2 / outer 147k-614k m2 over three seeds
    assert.ok(quads >= 35 && longestRun >= 8 && area > (top === 9 ? 40000 : 120000),
      `Titan range${top}: broad upper cap surfaces, not narrow flat apexes or low valley floors (${quads} quads, ${Math.round(area)} m2)`);
    const crest = Array.from({ length: n }, (_, c) => y(top, c));
    // Restored 1049e4e tables: passes drop at least 60 m below the cap level
    // across two dozen columns or more (measured 30-112 across three seeds).
    assert.ok(crest.filter(value => value < capLevel - 60).length >= 24,
      'Low passes still separate the mesas rather than forming a continuous elevated lid');
    receipts.push({ top, area, quads, longestRun });
  }
  for (let c = 0; c < n; c++) {
    for (let row = 1; row < ring.rows.length; row++) {
      const span = radius(row, c) - radius(row - 1, c);
      assert.ok(span > 1, 'No folded annular faces');
      // The restored 1049e4e mesa terraces step up to about 4:1 between rows;
      // the rejected unbounded sheets were steeper still and single-column.
      // Row 1 is the buried anchor's rise to the low skirt bank, which the
      // rim terrain hides; it is bounded by the fold check above.
      if (row >= 2) assert.ok((y(row, c) - y(row - 1, c)) / span < 4.5,
        'No return to steep unbounded canyon sheets');
    }
    // round 47: the near table keeps its 1.25:1 approach; the far escarpment's cliff-and-talus front is bounded at 1.8:1
    for (const [a, b, limit] of [[5, 6, 1.251], [6, 7, 1.251], [7, 8, 1.251], [8, 9, 1.251],
      [13, 14, 1.801], [14, 15, 1.801], [15, 16, 1.801], [16, 17, 1.801]]) {
      assert.ok((y(b, c) - y(a, c)) / (radius(b, c) - radius(a, c)) <= limit,
        `Reused approach/buttress rows bound the rise into the broad cap (rows ${a}-${b} within ${limit})`);
    }
  }
  return receipts;
}

const receipts = [];
for (const seed of seeds) {
  const ring = sampleHorizonGeometry(config, seed), historical = sampleHorizonGeometry(historicalConfig, seed);
  assert.equal(ring.positions.constructor, Float32Array);
  assert.equal(ring.heights.constructor, Float32Array);
  assert.equal(ring.positions.length, n * 30 * 3); assert.equal(ring.heights.length, n * 30); // round 47: nine-row stack
  assert.deepEqual(ring.rows, historical.rows, 'Same 30 source rows and metadata');
  assert.equal(ring.maxHeight, historical.maxHeight, 'Same color/texture height normalization');
  // approach rows, crest, back rows of the near table; approach rows, crest and (round 47) back rows of the escarpment
  const alteredHeightRows = new Set([6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20]);
  const movedRows = new Set([6, 7, 8, 14, 15, 16]);
  for (let vertex = 0; vertex < ring.heights.length; vertex++) {
    const row = Math.floor(vertex / n);
    assert.equal(ring.heights[vertex], ring.positions[vertex * 3 + 1]);
    if (!alteredHeightRows.has(row)) assert.equal(ring.heights[vertex], historical.heights[vertex],
      'The buried seam, foothills and intervening basin remain exact');
    if (!movedRows.has(row)) for (const axis of [0, 2]) {
      assert.equal(ring.positions[vertex * 3 + axis], historical.positions[vertex * 3 + axis],
        'Only the approach and cap-front rows may move horizontally');
    }
  }
  const caps = capSurfaces(ring);
  assert.throws(() => capSurfaces(historical), { code: 'ERR_ASSERTION' },
    'The cap gate rejects the original broad smooth mounds');
  const narrowed = { ...ring, positions: ring.positions.slice(), heights: ring.heights.slice() };
  for (const row of [8, 16]) for (let c = 0; c < n; c++) {
    narrowed.positions[(row * n + c) * 3 + 1] -= 8;
    narrowed.heights[row * n + c] -= 8;
  }
  assert.throws(() => capSurfaces(narrowed), { code: 'ERR_ASSERTION' },
    'A cap-front regression cannot pass using flat crest endpoints alone');
  receipts.push({ seed, caps });
}
const desert = getMapConfig('desert');
assert.deepEqual(sampleHorizonGeometry({ ...desert, horizon: { ...desert.horizon, finiteTableCaps: true } }, 1337),
  sampleHorizonGeometry(desert, 1337), 'Authoring option never enables new caps on an unrelated mesa map');
console.log('titanGorgeHorizon: real upper2D caps, attached bounded sidewalls, cap rows isolated against the opt-out, negative controls PASS', JSON.stringify(receipts));
