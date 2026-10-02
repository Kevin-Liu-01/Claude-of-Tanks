import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCanvas, Path2D, DOMMatrix, ImageData } from '@napi-rs/canvas';
import { CATALOG_CAMO_ART_IDS, createCatalogCamoPainter } from './catalogCamoPainter.ts';
import { createMaterialPainter } from './materialPainter.ts';
import { paintMaterialBase } from './materialPainterWorker.ts';
import { resolveCamoVisual, camoPatternIdHash, camoPatternStreamSeed } from './materials.ts';
import { SHARED_CAMO_PRESETS, stockCamoPatternIdFor } from './camoPolicy.ts';
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
for (const id of ['summer', 'winter', 'digital', 'splinter', 'flames', 'leopardprint', 'factory', 'sig_k2', 'service_challenger_3', 'national_il', 'carbon', 'prism']) {
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
// Every fleet recipe uses an explicit art family and retains its source palette.
for (const preset of SHARED_CAMO_PRESETS) {
  const visual = resolveCamoVisual(spec, preset.id);
  assert.ok(visual.catalogPattern, `${preset.id}: improved fleet art is reachable`);
  assert.equal(visual.base, preset.visual.base);
  assert.deepEqual(visual.patches, preset.visual.patches);
  const swatch = camoSwatchRecipe(spec, preset.id);
  assert.equal(swatch.visual.catalogPattern, visual.catalogPattern);
  const seed = camoPatternStreamSeed(visual, camoPatternIdHash(preset.id));
  assert.equal(seed, swatch.streamSeed);
  const a = createCanvas(96, 96), b = createCanvas(96, 96);
  painter.paintCamo(a, visual, painter.mulberry32(seed), empty, seed);
  painter.paintCamo(b, visual, painter.mulberry32(seed), empty, seed);
  assert.deepEqual(pixels(a), pixels(b), `${preset.id}: repeatable paint`);
  const px = pixels(a); for (let at = 3; at < px.length; at += 4) assert.equal(px[at], 255);
}
for (const tank of [spec, { ...spec, id: 'abramsx' }, { ...spec, id: 'm48' }, { ...spec, id: 'merkava3d_x', nation: 'Israel' }]) {
  const source = stockCamoPatternIdFor(tank.id, tank.nation, tank.era);
  const factory = camoSwatchRecipe(tank, 'factory'), named = camoSwatchRecipe(tank, source);
  assert.equal(factory.streamSeed, named.streamSeed, `${tank.id}: Factory uses the named colorway's exact pattern`);
  assert.equal(factory.key, named.key, `${tank.id}: Factory reuses the named swatch cache entry`);
  const a = createCanvas(128, 128), b = createCanvas(128, 128);
  painter.paintCamo(a, factory.visual, painter.mulberry32(factory.streamSeed), empty, factory.streamSeed);
  painter.paintCamo(b, named.visual, painter.mulberry32(named.streamSeed), empty, named.streamSeed);
  assert.deepEqual(pixels(a), pixels(b), `${tank.id}: Factory and its reusable colorway have identical pixels`);
}
// Complete official logos retain their dedicated artist; surface finish never substitutes a glyph.
for (const id of ['openai', 'gemini', 'xai', 'claude', 'spark']) {
  const visual = resolveCamoVisual(spec, id);
  assert.equal(visual.catalogPattern, undefined);
  const c = createCanvas(16, 16), before = hash(pixels(c));
  catalog(c.getContext('2d'), 16, visual, () => { throw Error('Brand recipe consumed catalog RNG'); });
  assert.equal(hash(pixels(c)), before);
}
console.log(`catalogCamoPainter: ${CATALOG_CAMO_ART_IDS.length} catalog and ${SHARED_CAMO_PRESETS.length} fleet paints, worker parity, Factory equivalence and logo isolation passed`);

// Factory and the explicitly selected reusable finish must share the same
// actual pigment coverage, including LOW-sized maps and cached rebakes.
for (const [id,nation] of [['ariete_c1_x','Italy'],['ariete_c2_x','Italy'],['lrmv_lynx','Italy'],
  ['type100','China'],['ztz100_x','China'],['ztz100_prototype','China']]) {
  const tank={...spec,id,nation},visual=resolveCamoVisual(tank,'factory');
  const pattern=stockCamoPatternIdFor(id,nation),selected=resolveCamoVisual(tank,pattern);
  assert.deepEqual(visual.patches,selected.patches,`${id}: selected coat matches Factory`);
  const palette=[visual.base,...visual.patches].map(hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)));
  for(let i=0;i<palette.length;i++) for(let j=i+1;j<palette.length;j++)
    assert.ok(Math.hypot(...palette[i].map((v,c)=>v-palette[j][c]))>30,`${id}: pigment tones are visibly distinct`);
  for(const size of [128,512]) {
    const canvas=createCanvas(size,size);
    catalog(canvas.getContext('2d'),size,visual,painter.mulberry32(camoPatternStreamSeed(visual,camoPatternIdHash(pattern))));
    const data=pixels(canvas),coverage=palette.map(()=>0);
    for(let at=0;at<data.length;at+=4) {
      const distances=palette.map(color=>color.reduce((sum,v,c)=>sum+(v-data[at+c])**2,0));
      coverage[distances.indexOf(Math.min(...distances))]++;
    }
    for(const count of coverage) assert.ok(count/(size*size)>.10,`${id}/${size}: every pigment covers useful armor area`);
  }
}
