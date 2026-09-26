import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { getMapConfig, MAP_IDS } from './maps/index.ts';
import { HORIZON_SEGMENTS, sampleHorizonGeometry } from './maps/horizon.ts';

// Pinned dba1c5ce3 decomposition: every other map is unchanged, and the
// explicit historical Titan input reproduces its actual original buffers.
const seeds = [1337, 2049, 7719];
// Pre-restoration 28d5fd378 executable, excluding restored Verdant.
// Verdant uses the shared classic rolling horizon; horizonResources.selftest guards it.
// Round 72 (2026-09-25, the mountain relief round): the coarse relief field (horizonRelief.ts) displaces every authored
// and interpolated ring row on every map but Redrock, so the digests below were re-pinned once against the relieved geometry.
const originalOther28 = [
  '668b0d8020214fadcb4159c932f9d641851e272d780dad8486823e3a4ccd62d9' /* 2026-09-19 vista pass */ /* 2026-09-19 vista pass */ /* 2026-09-19 vista pass: 431-column, 18/36-row ring with ridged relief and 700 m first ridge */ /* 2026-09-19: Mars joins the other maps */,
  'a849ab5f5215ff491fb7e5074ad1c0c82df4b1144c8dcd96963db3324e96b274',
  'cb25f6feef23d723705e9b9859856900106a19b5b8b0116e52c713fc138b9c1e',
];
// Round 47 (owner 2026-09-23, "the skybox and mountains are too bland"): the mesa style authors a nine-row stack
// (bench, tables, valley, escarpment, saddle, summits, shoulder; 30 uploaded rows) and the far escarpment's cap
// stands over a real valley with a 1.8:1 front, so Titan's uncapped fixture and its capped geometry are re-pinned here.
// (round 72: re-pinned with the relieved geometry, see above)
const originalTitan = [
  '4a838ee779715f47895bf317fa5ef5d02ffa5f007f855e15b9b4573057b967c4',
  '5501b91ee6d2af1415e0f6c20c409d9a132a76f81f6bd32ea3b424571fcd0249',
  'a435955dc422dbf2a389c0b2995c1628d4b72e48f212f1186fd08fc092291037',
];
// (round 72: re-pinned with the relieved geometry, see above)
const currentTitan = [
  '4e9bf25525c5864bc62cd14b6fce53b2961a95b342d6866f32b3625d2ba7d04a',
  '9ca0cfc838fa657c709d9c1d45b0e75a89529593161a24bd23f7e738a1c24de5',
  '1daeaa1cec6871f75743dc3136e420341a1b416ecb421b5d2821668d3181d616',
];
// Vista pass (2026-09-19, owner: 'consider this a triple AAA pass'): the ring ladder is 431 columns and 18 / 36 rows with
// ridged relief, the first ridge stands 700-720 m out and the skirt seats on the terrain; every geometry receipt below is
// re-established at this commit (the 1049e4e byte identity it guarded is superseded by that owner direction).
const n = HORIZON_SEGMENTS;
const config = getMapConfig('titan_gorge');
const historicalConfig = { ...config, horizon: { ...config.horizon, finiteTableCaps: false } };

function appendReceipt(hash, id, ring) {
  return hash.update(id).update(new Uint8Array(ring.positions.buffer))
    .update(new Uint8Array(ring.heights.buffer)).update(JSON.stringify(ring.rows))
    .update(String(ring.maxHeight));
}

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
for (const [index, seed] of seeds.entries()) {
  const other28 = createHash('sha256'), unrelatedMutation = createHash('sha256');
  for (const id of MAP_IDS) {
    if (id === 'titan_gorge' || id === 'verdant') continue;
    const actual = getMapConfig(id);
    // Preserve this historical aggregate; the current canyon is independently
    // exercised by redrockCanyonHorizon.selftest, including the exact opt-out.
    const cfg = id === 'badlands' ? { ...actual, horizon: { ...actual.horizon, redrockCanyon: false } } : actual;
    const ring = sampleHorizonGeometry(cfg, seed);
    appendReceipt(other28, id, ring);
    const mutated = id === 'desert' ? { ...ring, positions: ring.positions.slice() } : ring;
    if (id === 'desert') mutated.positions[0] += 0.125;
    appendReceipt(unrelatedMutation, id, mutated);
  }
  assert.equal(other28.digest('hex'), originalOther28[index], 'All29 other unrestored maps stay byte-identical');
  assert.throws(() => assert.equal(unrelatedMutation.digest('hex'), originalOther28[index]),
    { code: 'ERR_ASSERTION' }, 'The other29 oracle catches unrelated geometry drift');

  const ring = sampleHorizonGeometry(config, seed), historical = sampleHorizonGeometry(historicalConfig, seed);
  assert.equal(appendReceipt(createHash('sha256'), 'titan_gorge', historical).digest('hex'), originalTitan[index],
    'Historical opt-out preserves the exact pre-cap Titan fixture, not a reconstructed approximation');
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
  assert.equal(appendReceipt(createHash('sha256'), 'titan_gorge', ring).digest('hex'), currentTitan[index],
    'Current cap/buttress geometry stays exact after intentional shape verification');
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
console.log('titanGorgeHorizon: real upper2D caps, attached bounded sidewalls, historical/current receipts, other29 exact and mutation controls PASS', JSON.stringify(receipts));
