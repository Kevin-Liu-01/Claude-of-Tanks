// camoFieldEdges.selftest.mjs — the field camouflages' colour boundaries are drawn at the tile's own resolution
// (catalogCamoPainter.ts paintFieldEdges, 2026-10-04, the vehicle-look lane; gauntlet wave 49: "its soft camo blobs look
// blurry"). The fields are thresholded on a 192-texel raster across the two-metre tile; scaling that hard stencil to
// the 1024 battle bake (×5.3) and the 2048 Garage bake (×10.7) with bilinear smoothing made every boundary a soft,
// stair-stepped ramp a raster texel wide (median 3–5 tile texels at 1024, 5–11 at 2048, measured on this receipt's
// patterns). Each tile texel now takes the continuous fields at its centre and blends the stencil's colours by its
// coverage of each threshold over one texel: a boundary is one anti-aliased texel, the shapes and coverage are the
// raster's, the random stream is untouched, the digital patterns keep their pixels and a swatch no larger than the
// raster is the raster itself.
import assert from 'node:assert/strict';
import { createCanvas, Path2D, DOMMatrix, ImageData } from '@napi-rs/canvas';
import { createCatalogCamoPainter, DIGITAL_TONE_LUMA_FLOOR, liftDigitalTone } from './catalogCamoPainter.ts';
import { createMaterialPainter } from './materialPainter.ts';
import { resolveCamoVisual, camoPatternIdHash, camoPatternStreamSeed } from './materials.ts';
Object.assign(globalThis, { Path2D, DOMMatrix, ImageData });

const painter = createMaterialPainter(createCanvas), catalog = createCatalogCamoPainter(createCanvas);
const spec = { id: 'm1a2', nation: 'USA', era: 'modern', visual: { scheme: 'nato', base: '#49543c',
  weather: '#525f45', patches: ['#23261f', '#4a3a2c'] } };
const parse = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const paint = (id, size) => {
  const visual = resolveCamoVisual(spec, id);
  const canvas = createCanvas(size, size);
  catalog(canvas.getContext('2d'), size, visual, painter.mulberry32(camoPatternStreamSeed(visual, camoPatternIdHash(id))));
  return { data: canvas.getContext('2d').getImageData(0, 0, size, size).data, visual };
};
const paletteOf = (visual) => {
  const palette = [visual.base, ...(visual.patches || [])].map(parse);
  if (palette.length === 1) palette.push(parse(visual.weather || visual.base));
  return palette;
};
/** Each texel's plateau tone (a palette colour times the field's ±4 % pigment variation), or -1 for a blended texel. */
function tones(data, size, palette) {
  const tone = new Int8Array(size * size).fill(-1);
  for (let i = 0; i < size * size; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    for (let k = 0; k < palette.length; k++) {
      const [pr, pg, pb] = palette[k];
      const v = (r * pr + g * pg + b * pb) / (pr * pr + pg * pg + pb * pb);
      if (v < 0.95 || v > 1.05) continue;
      if (Math.max(Math.abs(r - v * pr), Math.abs(g - v * pg), Math.abs(b - v * pb)) <= 3) { tone[i] = k; break; }
    }
  }
  return tone;
}
/** Along every row: the blended texels between two plateaus of different tones (the boundary's width in texels). */
function edgeRuns(tone, size) {
  const runs = [];
  for (let y = 0; y < size; y++) {
    let last = -1, run = 0;
    for (let x = 0; x < size; x++) {
      const k = tone[y * size + x];
      if (k < 0) { run++; continue; }
      if (run > 0 && last >= 0 && last !== k) runs.push(run);
      run = 0; last = k;
    }
  }
  return runs.sort((a, b) => a - b);
}
const quantile = (list, p) => list[Math.min(list.length - 1, Math.floor(p * list.length))];
const coverage = (tone, k) => { let n = 0; for (const t of tone) if (t === k) n++; return n / tone.length; };

const FIELDS = ['summer', 'desert', 'winter', 'merdc', 'amoeba', 'dpm', 'chocchip', 'tigerstripe', 'flecktarn'];
for (const id of FIELDS) {
  const { data, visual } = paint(id, 1024);
  const palette = paletteOf(visual);
  const tone = tones(data, 1024, palette);
  const runs = edgeRuns(tone, 1024);
  assert.ok(runs.length > 1000, `${id}: the tile has its boundaries (${runs.length})`);
  assert.ok(quantile(runs, 0.5) <= 1, `${id}: a boundary is one texel (median ${quantile(runs, 0.5)})`);
  assert.ok(quantile(runs, 0.9) <= 4, `${id}: nine in ten crossings within four texels (p90 ${quantile(runs, 0.9)}; the bilinear stencil read 7-15)`);
  const blended = tone.reduce((n, t) => n + (t < 0 ? 1 : 0), 0) / tone.length;
  assert.ok(blended < (id === 'flecktarn' ? 0.04 : 0.012), `${id}: ${(100 * blended).toFixed(2)} % blended texels`);
  // the shapes are the raster's: each colour covers the same share of the tile as the 192-texel raster itself does
  const raster = paint(id, 192), rasterTone = tones(raster.data, 192, palette);
  for (let k = 0; k < palette.length; k++) {
    const a = coverage(tone, k), b = coverage(rasterTone, k);
    if (b < 0.005) continue;
    assert.ok(Math.abs(a - b) < 0.02 + 0.06 * b, `${id}: colour ${k} covers ${(100 * a).toFixed(1)} % (raster ${(100 * b).toFixed(1)} %)`);
  }
}
// the Garage's 2048 bake: still one texel, not 10.7 raster-scaled texels
{
  const { data, visual } = paint('desert', 2048);
  const runs = edgeRuns(tones(data, 2048, paletteOf(visual)), 2048);
  assert.ok(quantile(runs, 0.5) <= 1 && quantile(runs, 0.9) <= 4, `desert 2048: median ${quantile(runs, 0.5)}, p90 ${quantile(runs, 0.9)}`);
}
// deterministic on repeat (the bake cache and the worker parity rely on it)
{
  const a = paint('amoeba', 1024).data, b = paint('amoeba', 1024).data;
  assert.deepEqual(a, b, 'repeatable paint');
}
// the digital patterns stay pixel art. 2026-10-07 (tank-accessories lane, round 3; critics: "jagged stair-stepping",
// "a large black camo blob with uniform stair-stepped edges", "blown-up low-resolution images"): the cells are drawn
// by box coverage (catalogCamoPainter.ts paintPixels), so a blended texel is one a cell edge crosses and nothing else
// (this used to read "no blended texels": nearest-neighbour cells 25 or 26 texels wide with aliased edges); the
// boundaries break into pixel clusters (fragmentPixelEdges: stray pixels and teeth, where the smooth fields left almost
// none: 0-5 isolated cells of 6,400 on these patterns); and no tone is near-black (liftDigitalTone).
const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
for (const id of ['digital', 'digitaldesert']) {
  const visual = resolveCamoVisual(spec, id);
  const n = Math.round(80 / Math.max(.85, visual.digitalCellK || 1)); // paintField's pixel raster across the tile
  const palette = paletteOf(visual).map(liftDigitalTone);
  for (const c of palette) assert.ok(luma(c) >= DIGITAL_TONE_LUMA_FLOOR - 0.5, `${id}: tone ${c} is not near-black`);
  for (const size of [1024, 2048]) {
    const tone = tones(paint(id, size).data, size, palette);
    const crossed = (at) => Math.floor(at * n / size) !== Math.floor((at + 1) * n / size - 1e-9);
    let blended = 0, stray = 0, crossedTexels = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const onEdge = crossed(x) || crossed(y);
      if (onEdge) crossedTexels++;
      if (tone[y * size + x] >= 0) continue;
      blended++;
      if (!onEdge) stray++;
    }
    assert.equal(stray, 0, `${id}/${size}: every blended texel is one a cell edge crosses (${stray} of ${blended} are not)`);
    assert.ok(blended < crossedTexels, `${id}/${size}: cells keep their own tone between their edges`);
  }
  const raster = tones(paint(id, n).data, n, palette);
  let isolated = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const k = raster[y * n + x];
    if (k < 0) continue;
    if ([raster[y * n + (x + 1) % n], raster[y * n + (x + n - 1) % n], raster[((y + 1) % n) * n + x],
      raster[((y + n - 1) % n) * n + x]].every((other) => other !== k)) isolated++;
  }
  assert.ok(isolated / (n * n) > 0.005, `${id}: the boundaries break into pixel clusters (${isolated} stray cells of ${n * n})`);
}
// 2026-10-07 (Challenger 1: the stripes "tile visibly: regular, evenly spaced green and black bands"): the service
// stripes' spacing breathes across the tile. Along every fourth column, the spacing between successive stripe centres
// (the Challenger 3 service coat measured cv 0.14 with three equal bands in every column).
{
  const size = 192, { data, visual } = paint('service_challenger_3', size);
  const tone = tones(data, size, paletteOf(visual));
  const spacings = [], counts = new Set();
  for (let x = 0; x < size; x += 4) {
    const band = (y) => tone[(((y % size) + size) % size) * size + x] === 1;
    const centres = [];
    for (let y = 0; y < size; y++) {
      if (!band(y) || band(y - 1)) continue;
      let run = 0;
      while (run < size && band(y + run)) run++;
      if (run >= 3) centres.push(y + run / 2);
    }
    counts.add(centres.length);
    for (let k = 0; k < centres.length; k++) spacings.push((centres[(k + 1) % centres.length] - centres[k] + size) % size || size);
  }
  const mean = spacings.reduce((s, v) => s + v, 0) / spacings.length;
  const cv = Math.sqrt(spacings.reduce((s, v) => s + (v - mean) ** 2, 0) / spacings.length) / mean;
  assert.ok(cv > 0.25, `service stripes: band spacing varies across the tile (cv ${cv.toFixed(3)})`);
  assert.ok(counts.size > 1, `service stripes: bands fork and merge (stripes per column: ${[...counts].join(', ')})`);
}
console.log(`camoFieldEdges.selftest: ${FIELDS.length} field camouflages draw one-texel boundaries at 1024 and 2048 with the raster's `
  + 'shapes and coverage, repeatable; the digital patterns keep crisp box-covered pixels with clustered edges and no '
  + 'near-black tone; the service stripes vary their spacing PASS');
