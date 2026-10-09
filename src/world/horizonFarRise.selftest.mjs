// The far rise (the borders lane, 2026-10-08; the gauntlet's waves 286a-d and 288 at Verdant's corners and edges: "the
// crest across the centre ends against bare sky with only a few lone lollipop trees standing on it, so the land beyond
// simply vanishes"): the country past the near band rises by the map's farRiseM (borderLandform.ts) on the ring's own
// rows — nothing within 120 m of the square's edge, all of it from 520 m, the crests the whole rise and the valleys a
// third of it (a range keeps its low passes), the water's rows at their level — so the land and woods beyond a near crest
// stand into view behind it. Wave 288 landed it on Verdant alone (its every view up or flat; Steinburg, Frontier Basin and
// Monsoon gained nothing with the lower critic).
import assert from 'node:assert/strict';
import { HORIZON_SEGMENTS, liftFarCountry } from './maps/horizon.ts';
import { resolveBorderLandform } from './borderLandform.ts';
import { MAP_IDS, getMapConfig } from './maps/index.ts';

const n = HORIZON_SEGMENTS;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// a ring of rows from the square's edge out to 1.4 km past it, its columns a range of crests and valleys, one sector water
const edgeOuts = [0, 60, 120, 200, 320, 520, 700, 900];
const ring = () => {
  const rows = edgeOuts.length, positions = new Float32Array(n * rows * 3), heights = new Float32Array(n * rows);
  for (let row = 0; row < rows; row++) for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, i = row * n + k;
    // along the column, the square radius max(|x|, |z|) is 512 m + the row's reach past the edge
    const c = Math.cos(a), s = Math.sin(a), r = (512 + edgeOuts[row]) / Math.max(Math.abs(c), Math.abs(s));
    positions[i * 3] = c * r; positions[i * 3 + 2] = s * r;
    const water = k >= 200 && k < 230;
    heights[i] = positions[i * 3 + 1] = water ? 0 : 2 + row + 80 * Math.max(0, Math.sin(a * 5));
  }
  let maxHeight = 1;
  for (const h of heights) maxHeight = Math.max(maxHeight, h);
  return { rows: [], positions, heights, maxHeight };
};

const base = ring(), lifted = ring();
const crest = Math.max(1, base.maxHeight * 0.7);
liftFarCountry(lifted, 40);
let crestRise = 0, valleyRise = Infinity;
for (let row = 0; row < edgeOuts.length; row++) for (let k = 0; k < n; k++) {
  const i = row * n + k, h = base.heights[i], out = edgeOuts[row];
  if (row === 0 || out <= 120 || h < 0.5) {
    assert.equal(lifted.heights[i], h, `row ${row} (${out} m past the edge${h < 0.5 ? ', the water' : ''}) keeps its height`);
    continue;
  }
  const want = h + 40 * smooth(120, 520, out) * (0.35 + 0.65 * smooth(0, crest, h));
  assert.ok(Math.abs(lifted.heights[i] - want) < 1e-3, `row ${row} column ${k}: ${lifted.heights[i].toFixed(2)} m, the rise by its reach and its crest share (${want.toFixed(2)})`);
  assert.equal(lifted.positions[i * 3 + 1], lifted.heights[i], 'the vertex stands at its height');
  if (out >= 520) { crestRise = Math.max(crestRise, lifted.heights[i] - h); valleyRise = Math.min(valleyRise, lifted.heights[i] - h); }
}
assert.ok(Math.abs(crestRise - 40) < 1 && valleyRise > 13 && valleyRise < 17,
  `past 520 m the crests rise the whole 40 m (${crestRise.toFixed(1)}) and the valleys about a third (${valleyRise.toFixed(1)}): the low passes stay low`);
let max = 1;
for (const h of lifted.heights) max = Math.max(max, h);
assert.equal(lifted.maxHeight, max, 'the ring\'s highest point follows the rise');
const flat = ring();
liftFarCountry(flat, 0);
assert.deepEqual(flat.heights, base.heights, 'no rise: the ring as it was, byte for byte');

// the maps: Verdant alone rises (40 m); every other map's border keeps none
const rising = [];
for (const id of MAP_IDS) {
  const cfg = getMapConfig(id);
  const rise = resolveBorderLandform(undefined, cfg?.terrain?.border ?? null, id).farRiseM ?? 0;
  if (rise > 0) rising.push(`${id}:${rise}`);
}
assert.deepEqual(rising, ['verdant:40'], `the far rise is Verdant's alone (${rising.join(', ')})`);
console.log(`horizonFarRise.selftest: the country past the near band rises from 120 m to its whole by 520 m, the crests by ${crestRise.toFixed(0)} m and the valleys by ${valleyRise.toFixed(0)} m, the water and the near band unchanged; Verdant alone PASS`);
