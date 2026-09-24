import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCanvas, Path2D, DOMMatrix, ImageData } from '@napi-rs/canvas';
import { CATALOG_CAMO_ART_IDS, createCatalogCamoPainter } from './catalogCamoPainter.ts';
import { createMaterialPainter } from './materialPainter.ts';
import { paintMaterialBase } from './materialPainterWorker.ts';
import { resolveCamoVisual, camoPatternIdHash, camoPatternStreamSeed } from './materials.ts';
import { camoSwatchRecipe } from '../ui/camoSwatchPainter.ts';
Object.assign(globalThis, { Path2D, DOMMatrix, ImageData });
const painter = createMaterialPainter(createCanvas), catalog = createCatalogCamoPainter(createCanvas);
const spec = { id: 'm1a2', nation: 'USA', era: 'modern', visual: { scheme: 'nato', base: '#49543c',
  weather: '#525f45', patches: ['#23261f', '#4a3a2c'] } };
const pixels = c => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
const hash = data => createHash('sha256').update(data).digest('hex');
const empty = { hLines: [], vLines: [], rings: [], chips: [], streaks: [] };
const hashes = new Set();
for (const id of CATALOG_CAMO_ART_IDS) {
  const visual = resolveCamoVisual(spec, id);
  assert.equal(visual.catalogPattern, id, `${id}: catalog selects its art`);
  const swatch = camoSwatchRecipe(spec, id);
  assert.equal(swatch.visual.catalogPattern, id, `${id}: picker retains exact art recipe`);
  const seed = camoPatternStreamSeed(visual, camoPatternIdHash(id));
  assert.equal(seed, swatch.streamSeed, `${id}: picker and hull use the same random stream`);
  const a = createCanvas(128, 128), b = createCanvas(128, 128);
  painter.paintCamo(a, visual, painter.mulberry32(seed), empty, seed);
  painter.paintCamo(b, visual, painter.mulberry32(seed), empty, seed);
  assert.deepEqual(pixels(a), pixels(b), `${id}: deterministic on repeat/cache return`);
  const px = pixels(a); for (let i = 3; i < px.length; i += 4) assert.equal(px[i], 255, `${id}: opaque paint`);
  hashes.add(hash(px));
  // Fittings on other hulls resolve the same catalog artwork; winter retains
  // its intentional underlying factory colour, not another hull's geometry.
  const other = resolveCamoVisual({ ...spec, id: 'm60a3', visual: { ...spec.visual, camoScale: .88 } }, id);
  assert.deepEqual(other, visual, `${id}: source hull density cannot change selected art`);
}
assert.equal(hashes.size, CATALOG_CAMO_ART_IDS.length, 'every named finish has distinct artwork');

// Production worker and synchronous path must publish identical complete maps.
for (const id of ['summer', 'winter', 'digital', 'splinter', 'flames', 'leopardprint']) {
  const visual = resolveCamoVisual(spec, id);
  const request = { identity: `catalog:${id}`, visual, seed: 4242, dimensions: { albedo: 128, map: 64 },
    plateLines: false, camoStreamSeed: camoPatternStreamSeed(visual, camoPatternIdHash(id)) };
  const entry = { camoCanvas: createCanvas(1, 1), normalCanvas: createCanvas(1, 1), roughCanvas: createCanvas(1, 1), feats: null };
  for (const step of painter.bakeBaseSteps(entry, request)) void step;
  const worker = paintMaterialBase(request, createCanvas);
  assert.deepEqual(worker.albedo, pixels(entry.camoCanvas), `${id}: worker albedo parity`);
  assert.deepEqual(worker.normal, pixels(entry.normalCanvas), `${id}: worker normal parity`);
  assert.deepEqual(worker.roughness, pixels(entry.roughCanvas), `${id}: worker roughness parity`);
}

// Adjacent periodic field samples must not introduce a tile-boundary stripe.
for (const id of ['summer', 'desert', 'winter', 'merdc', 'tropic', 'digital', 'dpm']) {
  const visual = resolveCamoVisual(spec, id), c = createCanvas(192, 192);
  catalog(c.getContext('2d'), 192, visual, painter.mulberry32(71));
  const px = pixels(c); let seam = 0, interior = 0;
  const delta = (a, b) => [0, 1, 2].reduce((s, ch) => s + Math.abs(px[a * 4 + ch] - px[b * 4 + ch]), 0);
  for (let y = 0; y < 192; y++) {
    seam += delta(y * 192, y * 192 + 191) + delta(y, 191 * 192 + y);
    for (let x = 1; x < 192; x++) interior += delta(y * 192 + x, y * 192 + x - 1);
  }
  assert.ok(seam / 384 < interior / (192 * 191) * 3 + 3, `${id}: periodic boundaries stay within local edge contrast`);
}
for (const id of ['factory', 'sig_abramsx', 'sig_k2', 'sig_tos1a_tagil', 'service_usa_desert', 'national_de',
  'paint_cv90_mkiv', 'openai', 'gemini', 'xai', 'mono', 'carbon', 'prism']) {
  const visual = resolveCamoVisual(spec, id);
  assert.equal(visual.catalogPattern, undefined, `${id}: authored/brand finish retains its own painter`);
  const c = createCanvas(16, 16), before = hash(pixels(c));
  catalog(c.getContext('2d'), 16, visual, () => { throw Error('Authored recipe consumed catalog RNG'); });
  assert.equal(hash(pixels(c)), before, `${id}: catalog artist cannot overwrite authored artwork`);
}
console.log(`catalogCamoPainter: ${CATALOG_CAMO_ART_IDS.length} distinct deterministic paints, worker parity, periodic fields, authored isolation passed`);
