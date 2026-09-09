import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { getMapConfig, MAP_IDS } from './maps/index.ts';
import { sampleHorizonGeometry } from './maps/horizon.ts';

// Pinned dba1c5ce3 decomposition: every other map is unchanged, and the
// explicit historical Titan input reproduces its actual original buffers.
const seeds = [1337, 2049, 7719];
// Pre-restoration 28d5fd378 executable, excluding restored Verdant.
// originalVerdantHorizon.selftest owns the original Verdant geometry oracle.
const originalOther28 = [
  'f54d545335afbeb1e69ffda3885531257d36679e0207b5e226b49f25f6e4a889',
  '572d59aca8b3212be236a5ecf1978f1039058054d3c035248c2a1dc6da0c931c',
  'a679499bf0cd8a02f147bc4c28228971a2e9ad92df5132a9cd794acd03b5cb2d',
];
const originalTitan = [
  '71fed723702ef66dfb6444b47fdb856382c50c2ec24a15fea6073ed89e87dd51',
  '7840d0fb6b457b0016b2be5dc15a5697c91fa527e18205b3acc715bd3d5883f0',
  'd1249c399ed83d0159cc780cfdd4d6af0439da8da434cc2b4a1a3b9a87a6869b',
];
const currentTitan = [
  'b05656ac36d85486fedf0c350ddf8a12db83638434086f83e419bdb8f0d8da4f',
  'b3c46c8043c1166238a3c36203164222fb24fc69343704177dcc9932da113b4f',
  'ee015587ca0359f0760609af20f3534d3db516dc6378b91a2fb3dd4fd0a61a90',
];
const n = 287;
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
  for (const [top, minimumDepth] of [[5, 80], [9, 90]]) {
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
    assert.ok(quads >= 35 && longestRun >= 8 && area > 150000,
      `Titan range${top}: broad upper cap surfaces, not narrow flat apexes or low valley floors`);
    const crest = Array.from({ length: n }, (_, c) => y(top, c));
    assert.ok(crest.filter(value => value < capLevel - 100).length >= 30,
      'Low passes still separate the mesas rather than forming a continuous elevated lid');
    receipts.push({ top, area, quads, longestRun });
  }
  for (let c = 0; c < n; c++) {
    for (let row = 1; row < ring.rows.length; row++) {
      const span = radius(row, c) - radius(row - 1, c);
      assert.ok(span > 1, 'No folded annular faces');
      assert.ok((y(row, c) - y(row - 1, c)) / span < 1.4,
        'No return to steep unbounded canyon sheets');
    }
    for (const [a, b] of [[2, 3], [3, 4], [4, 5], [7, 8], [8, 9]]) {
      assert.ok((y(b, c) - y(a, c)) / (radius(b, c) - radius(a, c)) <= 1.251,
        'Reused approach/buttress rows bound the rise into the broad cap');
    }
  }
  return receipts;
}

const receipts = [];
for (const [index, seed] of seeds.entries()) {
  const other28 = createHash('sha256'), unrelatedMutation = createHash('sha256');
  for (const id of MAP_IDS) {
    if (id === 'titan_gorge' || id === 'verdant') continue;
    const cfg = getMapConfig(id), ring = sampleHorizonGeometry(cfg, seed);
    appendReceipt(other28, id, ring);
    const mutated = id === 'desert' ? { ...ring, positions: ring.positions.slice() } : ring;
    if (id === 'desert') mutated.positions[0] += 0.125;
    appendReceipt(unrelatedMutation, id, mutated);
  }
  assert.equal(other28.digest('hex'), originalOther28[index], 'All28 other unrestored maps stay byte-identical');
  assert.throws(() => assert.equal(unrelatedMutation.digest('hex'), originalOther28[index]),
    { code: 'ERR_ASSERTION' }, 'The other29 oracle catches unrelated geometry drift');

  const ring = sampleHorizonGeometry(config, seed), historical = sampleHorizonGeometry(historicalConfig, seed);
  assert.equal(appendReceipt(createHash('sha256'), 'titan_gorge', historical).digest('hex'), originalTitan[index],
    'Historical opt-out preserves the exact pre-cap Titan fixture, not a reconstructed approximation');
  assert.equal(ring.positions.constructor, Float32Array);
  assert.equal(ring.heights.constructor, Float32Array);
  assert.equal(ring.positions.length, 8610); assert.equal(ring.heights.length, 2870);
  assert.deepEqual(ring.rows, historical.rows, 'Same10 source rows and metadata');
  assert.equal(ring.maxHeight, historical.maxHeight, 'Same color/texture height normalization');
  const alteredHeightRows = new Set([3, 4, 5, 6, 8, 9]);
  for (let vertex = 0; vertex < ring.heights.length; vertex++) {
    const row = Math.floor(vertex / n);
    assert.equal(ring.heights[vertex], ring.positions[vertex * 3 + 1]);
    if (!alteredHeightRows.has(row)) assert.equal(ring.heights[vertex], historical.heights[vertex],
      'The buried seam, foothills and intervening basin remain exact');
    if (row !== 4 && row !== 8) for (const axis of [0, 2]) {
      assert.equal(ring.positions[vertex * 3 + axis], historical.positions[vertex * 3 + axis],
        'Only the two existing cap-front rows may move horizontally');
    }
  }
  const caps = capSurfaces(ring);
  assert.throws(() => capSurfaces(historical), { code: 'ERR_ASSERTION' },
    'The cap gate rejects the original broad smooth mounds');
  assert.equal(appendReceipt(createHash('sha256'), 'titan_gorge', ring).digest('hex'), currentTitan[index],
    'Current cap/buttress geometry stays exact after intentional shape verification');
  const narrowed = { ...ring, positions: ring.positions.slice(), heights: ring.heights.slice() };
  for (const row of [4, 8]) for (let c = 0; c < n; c++) {
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
