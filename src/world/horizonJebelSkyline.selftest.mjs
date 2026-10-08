// Redrock's enclosing walls crest as a chain of jebels (horizonJebelSkyline.ts, the borders lane 2026-10-08; gauntlet
// wave 270: "the far ring wall seals the valley like a rampart"): domed heads in most cells, saddles where the cells meet,
// past the near band and on the plateau's crest only — the floor, the faces and the walls within 140 m of the square stay
// the canyon's, and the basin stays enclosed (redrockCanyonHorizon.selftest pins the headwall and the plateau walls).
import assert from 'node:assert/strict';
import { JEBEL_SKYLINE_DEFAULTS, jebelSkylineAt, shapeJebelSkyline } from './horizonJebelSkyline.ts';
import { getMapConfig } from './maps/index.ts';
import { HORIZON_SEGMENTS, sampleHorizonGeometry } from './maps/horizon.ts';
import { createHeightField } from './terrain.ts';

const s = JEBEL_SKYLINE_DEFAULTS;
// the law: heads within their range, saddles no deeper than their share, most cells headed
let headed = 0, cells = 0, maxHead = 0, maxSaddle = 0;
for (let z = -3000; z < 3000; z += 17) for (let x = -3000; x < 3000; x += 17) {
  const { head, saddle } = jebelSkylineAt(x, z, 77);
  maxHead = Math.max(maxHead, head); maxSaddle = Math.max(maxSaddle, saddle);
}
for (let cz = -20; cz < 20; cz++) for (let cx = -20; cx < 20; cx++) {
  cells++;
  const c = jebelSkylineAt((cx + 0.5) * s.cellM, (cz + 0.5) * s.cellM, 77);
  if (c.head > 0) headed++;
}
assert.ok(maxHead <= s.headM[1] + 1e-9 && maxHead > s.headM[1] * 0.85, `the heads rise to ${maxHead.toFixed(1)} m (range ${s.headM.join('-')})`);
assert.ok(maxSaddle <= s.saddle + 1e-9 && maxSaddle > s.saddle * 0.9, `the saddles reach ${maxSaddle.toFixed(2)} of the wall`);
assert.ok(headed / cells > 0.5, `most cells hold a head (${headed} of ${cells})`);

// a synthetic ring: a flat plateau 80 m over the floor everywhere past 600 m, the floor inside; one row near the edge
const columns = 360, radii = [480, 560, 640, 700, 760, 900, 1000, 1100, 1200, 1300];
const positions = new Float32Array(radii.length * columns * 3), heights = new Float32Array(radii.length * columns);
for (let j = 0; j < radii.length; j++) for (let k = 0; k < columns; k++) {
  const a = (k / columns) * Math.PI * 2, i = j * columns + k, r = radii[j];
  const h = r < 600 ? s.floorM : s.floorM + 80;
  positions[i * 3] = Math.cos(a) * r; positions[i * 3 + 1] = h; positions[i * 3 + 2] = Math.sin(a) * r; heights[i] = h;
}
const before = Float32Array.from(heights);
const ring = { rows: radii, positions, heights, maxHeight: 0 };
shapeJebelSkyline(ring, 77);
for (let i = 0; i < heights.length; i++) {
  const x = positions[i * 3], z = positions[i * 3 + 2], edgeOut = Math.max(Math.abs(x), Math.abs(z)) - 512;
  if (before[i] < s.floorM + s.shoulderM) assert.equal(heights[i], before[i], 'the floor and the low ground stay the canyon\'s');
  if (edgeOut < 140) assert.equal(heights[i], before[i], 'the walls by the square stay the canyon\'s');
  assert.equal(positions[i * 3 + 1], heights[i], 'positions follow the heights');
  if (before[i] > s.floorM + 79) assert.ok(heights[i] >= s.floorM + 80 * (1 - s.saddle) - 1e-4, 'no saddle deeper than its share: the basin stays enclosed');
}
// the crest round the far row: heads and saddles, a chain rather than a level line
const row = radii.indexOf(1200), crest = Array.from(heights.slice(row * columns, (row + 1) * columns));
const mean = crest.reduce((a, b) => a + b, 0) / columns, sd = Math.sqrt(crest.reduce((a, b) => a + (b - mean) ** 2, 0) / columns);
let peaks = 0;
for (let k = 0; k < columns; k++) {
  const l = crest[(k - 1 + columns) % columns], c = crest[k], r = crest[(k + 1) % columns];
  if (c > l && c >= r && c > mean + 4) peaks++;
}
assert.ok(sd > 10, `the far crest rises and falls (sd ${sd.toFixed(1)} m; the plateau before was level)`);
assert.ok(peaks >= 12, `the far crest carries a chain of heads (${peaks} round the compass)`);
assert.equal(ring.maxHeight, Math.max(...heights), 'the ring keeps its max height');

// Redrock's own ring: the pass runs on the canyon outland (the plateau's crest past the near band varies)
const cfg = getMapConfig('badlands');
const field = createHeightField(1337, cfg);
const built = sampleHorizonGeometry(cfg, 1337, field);
let crestN = 0, crestSum = 0, crestSq = 0;
for (let i = HORIZON_SEGMENTS; i < built.heights.length; i++) {
  const x = built.positions[i * 3], z = built.positions[i * 3 + 2], edgeOut = Math.max(Math.abs(x), Math.abs(z)) - 512;
  if (edgeOut < 450 || built.heights[i] < s.floorM + s.shoulderM + 20) continue;
  crestN++; crestSum += built.heights[i]; crestSq += built.heights[i] ** 2;
}
const crestSd = Math.sqrt(crestSq / crestN - (crestSum / crestN) ** 2);
assert.ok(crestN > 2000 && crestSd > 12, `Redrock's far crest varies (${crestN} vertices, sd ${crestSd.toFixed(1)} m)`);
console.log(`horizonJebelSkyline.selftest: ok (heads to ${maxHead.toFixed(0)} m in ${headed}/${cells} cells, saddles to ${(maxSaddle * 100).toFixed(0)} %; synthetic crest sd ${sd.toFixed(1)} m with ${peaks} heads; Redrock's far crest sd ${crestSd.toFixed(1)} m over ${crestN} vertices)`);
