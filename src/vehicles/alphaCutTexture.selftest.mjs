// The suits' alpha-cut finish (263, 2026-10-28; the GPU-still critic on the Christian II and the Strv 121: "black specks
// and dark fringes at grazing angles", "the net reads flat"). alphaCutTexture.ts keeps a painted net's straight alpha:
// no texel under the cut keeps black (the canvas's premultiplied clear) where cloth lies beside it, the mips keep the
// cloth's coverage and colour, and the height map's occlusion fills the gaps under thick garnish and leaves bare net open.
import assert from 'node:assert/strict';
import { coverageMipChainSteps, floodClearTexels, shadeFromHeight } from './alphaCutTexture.ts';

const SIZE = 64, CUT = 128;
const drain = (steps) => { let next = steps.next(); while (!next.done) next = steps.next(); return next.value; };
const image = () => ({ data: new Uint8ClampedArray(SIZE * SIZE * 4), width: SIZE, height: SIZE });
const at = (x, y) => (y * SIZE + x) * 4;
/** A net of 2-texel olive cords at irregular spacing on a clear (black, alpha 0) ground, as a canvas reads one back. */
function cordNet() {
  const img = image();
  let seed = 7;
  const rng = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const lines = [];
  for (let at = 0; at < SIZE - 1; at += 5 + Math.floor(rng() * 7)) lines.push(at);
  const on = new Set(lines.flatMap((l) => [l, l + 1]));
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (on.has(x) || on.has(y)) img.data.set([60, 70, 40, 255], at(x, y));
  }
  return img;
}

// the flood: every clear texel beside a cord takes cord colour, its alpha untouched
{
  const img = cordNet();
  floodClearTexels(img.data, SIZE, { floor: CUT });
  for (let p = 0; p < SIZE * SIZE; p++) {
    const o = p * 4;
    if (img.data[o + 3] >= CUT) continue;
    assert.equal(img.data[o + 3], 0, 'the flood keeps a clear texel clear');
    assert.ok(img.data[o] > 50 && img.data[o + 1] > 60, `clear texel ${p} took the cord's colour, not black (${img.data.slice(o, o + 3)})`);
  }
  // an atlas (no wrap, fillRest false): texels the rings never reach keep their own flood tone
  const atlas = image();
  for (let p = 0; p < SIZE * SIZE; p++) atlas.data.set([10, 200, 10, 0], p * 4);
  for (let y = 30; y < 34; y++) for (let x = 30; x < 34; x++) atlas.data.set([200, 50, 50, 255], at(x, y));
  floodClearTexels(atlas.data, SIZE, { floor: CUT, wrap: false, fillRest: false, rings: 3 });
  assert.deepEqual([...atlas.data.slice(at(29, 31), at(29, 31) + 3)], [200, 50, 50], 'a ring reaches the texel beside the cloth');
  assert.deepEqual([...atlas.data.slice(at(2, 2), at(2, 2) + 3)], [10, 200, 10], 'a far texel keeps its tile flood');
}

// the mips: the cut's coverage holds within the coverage rule's band over the near levels (a level of a few texels a
// cord quantises its alphas, and ties at the quantile all pass), and the flooded net's colour never darkens toward
// black with range at any level
{
  const img = cordNet();
  floodClearTexels(img.data, SIZE, { floor: CUT });
  const chain = drain(coverageMipChainSteps(img, CUT / 255));
  const coverage = (d) => { let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] >= CUT) n++; return n / (d.length / 4); };
  const target = coverage(chain[0].data);
  for (const level of chain.slice(1)) {
    if (level.width < 2) break;
    const c = coverage(level.data);
    if (level.width >= SIZE / 2) assert.ok(c > target * 0.7 && c < target * 1.3, `mip ${level.width}: coverage ${c.toFixed(3)} against ${target.toFixed(3)}`);
    else assert.ok(c > 0, `mip ${level.width}: the net never vanishes`);
    let minGreen = 255;
    for (let i = 0; i < level.data.length; i += 4) if (level.data[i + 3] >= CUT) minGreen = Math.min(minGreen, level.data[i + 1]);
    assert.ok(minGreen >= 60, `mip ${level.width}: the cloth keeps its colour (green ${minGreen})`);
  }
}

// the occlusion: a gap under a thick bunch closes with the shade (whole: no gap is left half open), bare net far from it
// stays open, and cloth low in the height map comes out darker than cloth high in it
{
  const img = cordNet(), height = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const cord = img.data[at(x, y) + 3] === 255;
    const bunch = Math.hypot(x - 16, y - 16) < 12;
    // a bunch of strips: cloth over the cords and between them, high in the height map
    if (bunch && (x + y) % 3) img.data.set([90, 100, 60, 255], at(x, y));
    const h = bunch && (x + y) % 3 ? 210 : cord ? 120 : 0;
    height.fill(h, at(x, y), at(x, y) + 4);
  }
  const tone = [30, 34, 22];
  const filled = shadeFromHeight(img.data, height, SIZE, { cutoff: 0.5, lowShade: 0.6, occlusion: 2.4, radii: [2, 5],
    gaps: { tone, fill: [0.3, 0.44], cell: 16 } });
  assert.ok(filled > 0, 'gaps under the bunch fill');
  // a clear texel inside the bunch (between its strips and off the cords)
  let under = null;
  for (let y = 10; y < 22 && !under; y++) for (let x = 10; x < 22; x++) {
    if ((x + y) % 3 === 0 && x % 8 >= 2 && y % 8 >= 2) { under = at(x, y); break; }
  }
  assert.ok(under !== null && img.data[under + 3] >= CUT, 'a gap inside the bunch is shaded cloth');
  assert.ok(img.data[under] < 50, 'and dark: the hull in the garnish shadow');
  let open = 0;
  for (let y = 40; y < SIZE; y++) for (let x = 40; x < SIZE; x++) if (height[at(x, y)] === 0 && img.data[at(x, y) + 3] === 0) open++;
  assert.ok(open > 100, `the gaps of bare net far from the bunch stay open (${open})`);
  // a cord far from the bunch, and a strip of the bunch
  let cordAt = -1;
  for (let p = 0; p < SIZE * SIZE && cordAt < 0; p++) if (height[p * 4] === 120 && Math.hypot(p % SIZE - 16, Math.floor(p / SIZE) - 16) > 30) cordAt = p * 4;
  const cord = img.data[cordAt + 1], strip = img.data[at(18, 16) + 1];
  assert.ok(cord < 70 * 0.95, `cloth low in the height map darkens (cord green ${cord})`);
  assert.ok(strip > cord, 'a strip lying on top stays lighter than the cord under it');
  // every gap closed or open whole: no clear texel touches a texel the shade closed (the shade draws no contour of its own)
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (img.data[at(x, y) + 3] !== 0) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const q = at((x + dx + SIZE) % SIZE, (y + dy + SIZE) % SIZE);
      const shaded = img.data[q + 3] === 255 && height[q] === 0;
      assert.ok(!shaded, `an open gap at ${x},${y} borders a closed one`);
    }
  }
}

console.log('alphaCutTexture selftest passed');
