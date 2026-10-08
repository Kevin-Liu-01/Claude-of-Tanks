// Redrock's enclosing walls crest as a chain of jebels (horizonJebelSkyline.ts, the borders lane 2026-10-08; gauntlet
// wave 270: "the far ring wall seals the valley like a rampart"): domed heads in most cells, saddles where the cells meet,
// past the near band and on the plateau's crest only — the floor, the faces and the walls within 140 m of the square stay
// the canyon's, and the basin stays enclosed (redrockCanyonHorizon.selftest pins the headwall and the plateau walls).
import assert from 'node:assert/strict';
import { JEBEL_SKYLINE_DEFAULTS, jebelHeadProfile, jebelSkylineAt, shapeJebelSkyline } from './horizonJebelSkyline.ts';
import { getMapConfig } from './maps/index.ts';
import { HORIZON_SEGMENTS, sampleHorizonGeometry } from './maps/horizon.ts';
import { createHeightField } from './terrain.ts';

const s = JEBEL_SKYLINE_DEFAULTS;
// the profile: a beehive — the dome over the shoulder, the flank sheer from the shoulder to the outline, a joint's cleft
// stepping the outline back (the coordinator: "vertical joint-cut flanks under domed tops", not "bulbous rounded lumps")
const shoulderQ = 1 - s.flank;
assert.equal(jebelHeadProfile(0, 0), 1, 'the crown at the centre');
assert.ok(Math.abs(jebelHeadProfile(shoulderQ, 0) - (1 - s.dome)) < 1e-9, 'the shoulder holds the rise under the dome');
assert.ok(jebelHeadProfile(shoulderQ * 0.5, 0) > (1 - s.dome) + s.dome * 0.8, 'the dome rounds over the shoulder');
const flankDrop = (jebelHeadProfile(shoulderQ + s.flank * 0.25, 0) - jebelHeadProfile(shoulderQ + s.flank * 0.75, 0)) / (s.flank * 0.5);
assert.ok(flankDrop > 2.2, `the flank falls sheer: ${flankDrop.toFixed(2)} of the rise per share of the radius mid-flank (the first heads' law: ${((Math.pow(1 - Math.pow(0.85, 2.6), 0.75) - Math.pow(1 - Math.pow(0.95, 2.6), 0.75)) / 0.1).toFixed(2)})`);
assert.equal(jebelHeadProfile(1 - s.jointDepth * 0.5, s.jointDepth), 0, 'a joint\'s cleft steps the outline back');
assert.ok(jebelHeadProfile(1 - s.jointDepth * 0.5, 0) > 0, '... where the uncut flank still stands');
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

// Redrock's own ring: the pass runs on the canyon outland. Its walls' crest round the compass (per column the highest
// ring vertex past 140 m of the edge) as heads and saddles, not a rampart: its local relief (the departure from a
// 21-column moving mean, ~1 km of arc) and its level share (neighbouring columns within a metre). The PR's tree without
// the pass (Redrock r8's walls): 11.9 m and 36 %.
const cfg = getMapConfig('badlands');
const field = createHeightField(1337, cfg);
const built = sampleHorizonGeometry(cfg, 1337, field);
const n = HORIZON_SEGMENTS, rowsN = built.heights.length / n, crestCol = new Float64Array(n);
for (let k = 0; k < n; k++) {
  let best = -Infinity;
  for (let j = 0; j < rowsN; j++) {
    const i = j * n + k, x = built.positions[i * 3], z = built.positions[i * 3 + 2];
    if (Math.max(Math.abs(x), Math.abs(z)) - 512 >= 140) best = Math.max(best, built.heights[i]);
  }
  crestCol[k] = best;
}
let localSq = 0, level = 0;
for (let k = 0; k < n; k++) {
  let m = 0;
  for (let q = -10; q <= 10; q++) m += crestCol[(k + q + n) % n];
  localSq += (crestCol[k] - m / 21) ** 2;
  if (Math.abs(crestCol[(k + 1) % n] - crestCol[k]) < 1) level++;
}
const localRelief = Math.sqrt(localSq / n), levelShare = level / n;
assert.ok(localRelief > 14, `Redrock's crest rises and falls in heads and saddles (local relief ${localRelief.toFixed(1)} m; 11.9 without the pass)`);
assert.ok(levelShare < 0.26, `... and little of it runs level (${(levelShare * 100).toFixed(1)} % of the compass; 36 % without the pass)`);
console.log(`horizonJebelSkyline.selftest: ok (heads to ${maxHead.toFixed(0)} m in ${headed}/${cells} cells, saddles to ${(maxSaddle * 100).toFixed(0)} %, flanks ${flankDrop.toFixed(1)} per radius share; synthetic crest sd ${sd.toFixed(1)} m with ${peaks} heads; Redrock's crest local relief ${localRelief.toFixed(1)} m, level ${(levelShare * 100).toFixed(1)} %)`);
