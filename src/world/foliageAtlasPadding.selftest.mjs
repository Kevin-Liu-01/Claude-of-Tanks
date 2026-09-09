import assert from 'node:assert/strict';
import { createCanvas, ImageData } from '@napi-rs/canvas';
import { CanvasTexture, SRGBColorSpace } from 'three';
import { makeLeafClusterTexture, makeNeedleSprayTexture, makePalmFrondTexture, makeTwigTexture } from './vegetation.ts';
import { applyTone, mulberry32 } from './terrain.ts';
import { getMapConfig } from './maps/index.ts';
import { getDeviceTier, resolveDeviceTier } from '../engine/quality.ts';

const savedDocument = globalThis.document, savedWindow = globalThis.window;
let paintedCanvas;
globalThis.document = { createElement(tag) {
  assert.equal(tag, 'canvas');
  paintedCanvas = createCanvas(1, 1);
  return paintedCanvas;
} };
const families = [
  { species: 'oak', make: makeLeafClusterTexture, flood: [70,78,40], radial: true },
  { species: 'pine', make: makeNeedleSprayTexture, flood: [52,68,48], radial: true },
  { species: 'palm', make: makePalmFrondTexture, flood: [55,76,38], radial: false },
  { species: 'birch', make: makeTwigTexture, flood: [82,72,66], radial: true },
];

function legacyFinish(canvas, family, tone) {
  // Frozen previous finalization, starting from the real painted canvas.
  // This independent loop also guards radial alpha falloff and palette use.
  const size = canvas.width, context = canvas.getContext('2d');
  const pixels = context.getImageData(0, 0, size, size), data = pixels.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const offset = (y * size + x) * 4;
    if (data[offset + 3] < 24) data.set(family.flood, offset);
    if (family.radial) {
      const radius = Math.hypot(x - size / 2, y - size / 2) / (size / 2);
      data[offset + 3] *= Math.max(0, Math.min(1, (1.08 - radius) / .5));
    }
  }
  applyTone(data, tone);
  context.putImageData(pixels, 0, 0);
  return { straight: pixels, uploaded: context.getImageData(0, 0, size, size) };
}

function inspectSource(texture, expectedSize) {
  assert.ok(texture.image instanceof ImageData, 'retain straight-alpha ImageData, not a lossy canvas');
  assert.equal(texture.source.data, texture.image, 'one retained pixel source');
  assert.equal(texture.image.width, expectedSize);
  assert.equal(texture.image.height, expectedSize);
  assert.equal(texture.image.data.byteLength, expectedSize ** 2 * 4);
  assert.equal(texture.colorSpace, SRGBColorSpace);
  assert.equal(texture.anisotropy, 8);
  assert.equal(texture.version, 1);
}

function inspectPixels(current, old) {
  let padded = 0, opaque = 0;
  for (let i = 0; i < current.length; i += 4) {
    assert.equal(current[i + 3], old[i + 3], 'exact previous alpha, including falloff and sky holes');
    if (current[i + 3] === 0 && current[i] + current[i + 1] + current[i + 2] > 0) {
      padded++;
      assert.deepEqual([...old.subarray(i, i + 3)], [0,0,0], 'previous Canvas roundtrip loses the padding');
    }
    if (current[i + 3] === 255) {
      opaque++;
      assert.deepEqual(current.subarray(i, i + 3), old.subarray(i, i + 3), 'opaque pigment is unchanged');
    }
  }
  assert.ok(padded > 1000 && opaque > 100, 'exercise both transparent padding and real foliage');
  return padded;
}

function checkAtlas(family, mapId, seed, tier) {
  const tone = getMapConfig(mapId).vegetation.palettes?.[family.species]?.texTone ?? null;
  const random = mulberry32(seed), texture = family.make(random, tone), tail = random();
  const canvas = paintedCanvas;
  const size = family.species === 'oak' && tier === 'desktop' ? 512 : 256;
  inspectSource(texture, size);
  const old = legacyFinish(canvas, family, tone);
  assert.deepEqual(texture.image.data, old.straight.data, 'same intended finishing pixels, before lossy Canvas storage');
  const padded = inspectPixels(texture.image.data, old.uploaded.data);
  const canvasTexture = new CanvasTexture(canvas);
  for (const key of ['format','type','flipY','wrapS','wrapT','minFilter','magFilter','generateMipmaps','premultiplyAlpha']) {
    assert.equal(texture[key], canvasTexture[key], `same sampling/upload policy: ${key}`);
  }
  assert.throws(() => inspectSource(canvasTexture, size), /straight-alpha ImageData/,
    'restoring the rejected Canvas source must fail');
  const repeatRandom = mulberry32(seed), repeated = family.make(repeatRandom, tone);
  assert.equal(repeatRandom(), tail, 'identical seeded painting stream');
  assert.deepEqual(repeated.image.data, texture.image.data, 'deterministic pixel content');
  let disposed = 0;
  texture.addEventListener('dispose', () => disposed++);
  texture.dispose(); repeated.dispose(); canvasTexture.dispose();
  assert.equal(disposed, 1, 'ordinary Texture disposal remains available');
  paintedCanvas = null;
  return padded;
}

try {
  let cases = 0, padded = 0;
  for (const tier of ['desktop','mobile']) {
    globalThis.window = { location: { search: `?tier=${tier}` }, localStorage: { getItem: () => null } };
    if (tier === 'mobile') assert.equal(resolveDeviceTier(), 'mobile');
    assert.equal(getDeviceTier(), tier);
    for (const mapId of ['verdant','coastal','winter','desert']) {
      for (const family of families) for (const seed of [1337,7719]) {
        padded += checkAtlas(family, mapId, seed, tier); cases++;
      }
    }
  }
  console.log(`foliageAtlasPadding: ${cases} real Canvas cases, ${padded} restored transparent texels; exact previous alpha/opaque pigment, dimensions, RNG and upload policy PASS`);
} finally {
  if (savedDocument === undefined) delete globalThis.document; else globalThis.document = savedDocument;
  if (savedWindow === undefined) delete globalThis.window; else globalThis.window = savedWindow;
}
