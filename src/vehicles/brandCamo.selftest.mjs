import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createCanvas, loadImage, Path2D, DOMMatrix, ImageData } from '@napi-rs/canvas';
import { paintBrandCamo, paintBrandMark } from './brandCamoPainter.ts';
import { OPENAI_BRAND_PATH, X_BRAND_PATH, GEMINI_BRAND_PATH } from './brandCamoMarks.ts';
import { createMaterialPainter } from './materialPainter.ts';
import { paintMaterialBase } from './materialPainterWorker.ts';
import { paintCamoSwatch } from '../ui/camoSwatchPainter.ts';
import { resolveCamoVisual } from './materials.ts';
Object.assign(globalThis, { Path2D, DOMMatrix, ImageData });
const sha = data => createHash('sha256').update(data).digest('hex');
const pixels = canvas => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
const sources = [
  ['openai', 'openai-blossom-guideline.svg', '01485e70cea6df8422f5abc643fbbd3c153442cc41da0e7d8e7451801ebf26e2', OPENAI_BRAND_PATH],
  ['xai', 'x-logo.svg', 'dd46f96b6f47fcd33683b79ddfaf3daca1d4f8aeba3c0f2bde1584c69cc699d4', X_BRAND_PATH],
  ['gemini', 'gemini-sparkle-v002.svg', '01821494593b81ffd7da0e08287d4735304ff6292a6903453328b9d17cf38799', GEMINI_BRAND_PATH],
];
function alphaAgreement(actual, expected) {
  let union = 0, intersection = 0;
  for (let i = 3; i < actual.length; i += 4) {
    const a = actual[i] > 127, b = expected[i] > 127;
    if (a || b) union++;
    if (a && b) intersection++;
  }
  return intersection / union;
}
for (const [brand, file, hash, path] of sources) {
  const bytes = readFileSync(new URL(`../../docs/references/brand-assets/${file}`, import.meta.url));
  assert.equal(sha(bytes), hash, `${brand}: exact official source asset`);
  const tags = [...bytes.toString().matchAll(/<path\b[^>]*>/g)].map(match => match[0]);
  const tag = brand === 'openai' ? tags.find(value => /fill="black"/.test(value)) : tags[0];
  const sourcePath = tag.match(/\bd="([^"]+)"/)[1];
  assert.equal(path, sourcePath, `${brand}: complete source path, not a generic substitute`);
  const native = createCanvas(256, 256);
  paintBrandMark(native.getContext('2d'), brand, 128, 128, 200);
  const viewBox = brand === 'openai' ? '109.28628 188.44128 342.01344 342.01344'
    : brand === 'xai' ? '-185.28 -171.78 1570.56 1570.56' : '-3.92 -3.92 35.84 35.84';
  const defs = bytes.toString().match(/<defs>[\s\S]*?<\/defs>/)?.[0] || '';
  const referenceSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="${viewBox}">${tag}${defs}</svg>`;
  const reference = createCanvas(256, 256);
  reference.getContext('2d').drawImage(await loadImage(Buffer.from(referenceSvg)), 0, 0);
  assert.ok(alphaAgreement(pixels(native), pixels(reference)) > .995,
    `${brand}: actual canvas mark retains the independently rasterized official SVG silhouette/counters`);
  if (brand === 'gemini') {
    const actual = pixels(native), expected = pixels(reference);
    let error = 0, count = 0;
    for (let i = 0; i < actual.length; i += 4) if (actual[i + 3] > 250 && expected[i + 3] > 250) {
      for (let channel = 0; channel < 3; channel++) { error += Math.abs(actual[i + channel] - expected[i + channel]); count++; }
    }
    assert.ok(error / count < 1, 'Gemini reproduces the published colored gradient, not a flat-color sparkle');
  }
  const substitute = createCanvas(256, 256);
  substitute.getContext('2d').fillRect(28, 28, 200, 200);
  assert.ok(alphaAgreement(pixels(substitute), pixels(reference)) < .9, 'solid generic substitute is rejected');
}
const painter = createMaterialPainter(createCanvas);
const spec = { id: 'sabra_mk2_x', nation: 'Israel', era: 'modern', visual: {} };
const hashes = new Set(), swatchHashes = new Set();
for (const pattern of ['openai', 'xai', 'gemini', 'mono', 'carbon', 'prism', 'sig_sabra_mk2_x']) {
  const request = { identity: `brand-test:${pattern}`, visual: resolveCamoVisual(spec, pattern), seed: 4242,
    dimensions: { albedo: 256, map: 128 }, plateLines: false };
  const entry = { camoCanvas: createCanvas(4, 4), normalCanvas: createCanvas(4, 4), roughCanvas: createCanvas(4, 4), feats: null };
  for (const step of painter.bakeBaseSteps(entry, request)) void step;
  const worker = paintMaterialBase(request, createCanvas);
  for (const [key, canvas] of [['albedo', entry.camoCanvas], ['normal', entry.normalCanvas], ['roughness', entry.roughCanvas]]) {
    assert.deepEqual(worker[key], pixels(canvas), `${pattern}: sync and worker ${key} exact`);
  }
  assert.deepEqual(worker, paintMaterialBase(request, createCanvas), `${pattern}: deterministic repeated painter result`);
  hashes.add(sha(worker.albedo));
  const swatch = createCanvas(128, 44), repeat = createCanvas(128, 44);
  paintCamoSwatch(swatch, spec, pattern); paintCamoSwatch(repeat, spec, pattern);
  assert.deepEqual(pixels(swatch), pixels(repeat), `${pattern}: deterministic real picker preview`);
  swatchHashes.add(sha(pixels(swatch)));
}
assert.equal(swatchHashes.size, 7, 'seven actual picker previews remain distinct');
assert.equal(hashes.size, 7, 'seven paints render as independently distinct finishes');
for (const scheme of ['mono', 'carbon', 'prism', 'digital', 'stripes']) {
  const canvas = createCanvas(64, 64), ctx = canvas.getContext('2d');
  const before = sha(pixels(canvas));
  paintBrandCamo(ctx, 64, scheme, () => { throw Error('nonbrand consumed RNG'); });
  assert.equal(sha(pixels(canvas)), before, `${scheme}: no injected brand mark`);
}
console.log('brandCamo.selftest: official path/source raster, independent prints, deterministic sync/worker passed');
