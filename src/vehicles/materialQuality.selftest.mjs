import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  applyPatchRoughnessPixels,
  fillHeightNormalRows,
  isMaterialTextureQualityUpgrade,
  materialTextureDimensions,
  normalizeMaterialTextureQuality,
} from './materials.ts';

function referencePatchPixels(pixels, size, classes, classSize, offsets) {
  let state = 0x51ab7 ^ size;
  for (let y = 0; y < size; y++) {
    const row = (y >> 1) * classSize;
    const south = (((y >> 1) + 2) % classSize) * classSize;
    for (let x = 0; x < size; x++) {
      const cx = x >> 1;
      const tone = classes[row + cx];
      let delta = offsets[tone];
      if (classes[row + ((cx + 2) % classSize)] !== tone
          || classes[south + cx] !== tone) delta += 0.035;
      state = (state * 1664525 + 1013904223) >>> 0;
      delta += (((state >>> 16) & 255) / 255 - 0.5) * 0.024;
      const index = (y * size + x) * 4;
      let value = pixels[index] + delta * 255;
      value = value < 0 ? 0 : (value > 255 ? 255 : value);
      pixels[index] = pixels[index + 1] = pixels[index + 2] = value;
    }
  }
  return pixels;
}

assert.deepEqual(materialTextureDimensions('low'), { albedo: 256, map: 128 });
assert.deepEqual(materialTextureDimensions('ai'), { albedo: 512, map: 256 });
assert.deepEqual(materialTextureDimensions('preview'), { albedo: 1024, map: 512 });
assert.deepEqual(materialTextureDimensions('high'), { albedo: 2048, map: 1024 });
assert.equal(normalizeMaterialTextureQuality('unknown'), 'high');

assert.equal(isMaterialTextureQualityUpgrade('low', 'ai'), true);
assert.equal(isMaterialTextureQualityUpgrade('ai', 'preview'), true);
assert.equal(isMaterialTextureQualityUpgrade('preview', 'high'), true);
assert.equal(isMaterialTextureQualityUpgrade('high', 'preview'), false);
assert.equal(isMaterialTextureQualityUpgrade('preview', 'preview'), false);

const materialsSource = await readFile(new URL('./materials.ts', import.meta.url), 'utf8');
assert.match(materialsSource,
  /await run\(bakeSharedCanvasesSteps\(entry, quality\)\);[\s\S]{0,900}const acquiredDuringBake = TEX_CACHE\.get\(key\);[\s\S]{0,700}finalizeEntryResize\(acquiredDuringBake\);[\s\S]{0,200}return;/,
  'chunked pre-bake must preserve a live cache entry acquired during a yielded painter pass');
assert.match(materialsSource,
  /const burnt = track\(setup\(new THREE\.MeshStandardMaterial\(\{[\s\S]{0,500}map: null,[\s\S]{0,500}emissiveMap: null,[\s\S]{0,500}const prepareBurnt = \(\) => \{[\s\S]{0,400}ensureBurntTextures\(shared, aniso\);/,
  'Garage material construction must defer destroyed-only atlases until prepareBurnt');
const factorySource = await readFile(new URL('./tankFactoryCore.js', import.meta.url), 'utf8');
assert.match(factorySource,
  /setDestroyed\(opts\) \{[\s\S]{0,350}mats\.prepareBurnt\?\.\(\);/,
  'destruction remains self-contained when a caller bypasses battle warming');

{
  const size = 19;
  const source = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < source.length; i += 4) {
    source[i] = ((i >> 2) * 29 + 17) & 255;
    source[i + 3] = 255;
  }
  const expected = new Uint8ClampedArray(source.length);
  const height = (x, y) => source[(((y + size) % size) * size + ((x + size) % size)) * 4];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (height(x + 1, y) - height(x - 1, y)) / 255;
      const dy = (height(x, y + 1) - height(x, y - 1)) / 255;
      let nx = -dx * 1.6, ny = dy * 1.6, nz = 1;
      const invLength = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= invLength; ny *= invLength; nz *= invLength;
      const index = (y * size + x) * 4;
      expected[index] = (nx * 0.5 + 0.5) * 255;
      expected[index + 1] = (ny * 0.5 + 0.5) * 255;
      expected[index + 2] = (nz * 0.5 + 0.5) * 255;
      expected[index + 3] = 255;
    }
  }
  const actual = new Uint8ClampedArray(source.length);
  fillHeightNormalRows(source, actual, size, 1.6, 0, size);
  assert.deepEqual(actual, expected,
    'direct wrapped Sobel indexing preserves every generated normal byte');
}

{
  const size = 32;
  const classSize = size >> 1;
  const classes = new Uint8Array(classSize * classSize);
  for (let y = 0; y < classSize; y++) {
    for (let x = 0; x < classSize; x++) classes[y * classSize + x] = (x + y * 2) % 3;
  }
  const source = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < source.length; i += 4) {
    source[i] = source[i + 1] = source[i + 2] = 128 + ((i >> 2) % 31);
    source[i + 3] = 255;
  }
  const offsets = [-0.03125, 0.0065, 0.044];
  assert.deepEqual(
    applyPatchRoughnessPixels(source.slice(), size, classes, classSize, offsets),
    referencePatchPixels(source.slice(), size, classes, classSize, offsets),
    'paired patch roughness preserves every deterministic output byte',
  );
}

await import('./factoryCamo.selftest.mjs');

console.log('materialQuality.selftest: low, AI, preview, and hero texture tiers passed');
