import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { makeSeaLayer } from './terrain.ts';
import { mulberry32 } from './props.ts';
import oasis from './maps/oasis.ts';
import desert from './maps/desert.ts';

// CPU generator/recording-canvas checks only. These do not prove native
// canvas antialiasing, GPU mip filtering, or the final sunlit scene response.
const oldDocument = globalThis.document, oldImageData = globalThis.ImageData;
globalThis.ImageData = class { constructor(data) { this.data = data; } };
globalThis.document = {
  createElement() {
    const canvas = { width: 0, height: 0, pixels: null };
    canvas.getContext = () => ({ putImageData(image) { canvas.pixels = image.data.slice(); } });
    return canvas;
  },
};
try {
  for (const seed of [1337, 2049, 3003]) {
    const spring = makeSeaLayer(seed, 4, oasis.splat.mudTone);
    const clay = makeSeaLayer(seed, 4, desert.splat.mudTone);
    assert.equal(spring.albedo.image.width, 256);
    assert.equal(spring.albedo.image.height, 256);
    assert.equal(spring.albedo.colorSpace, THREE.SRGBColorSpace);
    assert.deepEqual(spring.normal.image.pixels, clay.normal.image.pixels,
      'a spring pigment override cannot alter the wave geometry');
    const pixels = spring.albedo.image.pixels, prior = clay.albedo.image.pixels;
    const color = new THREE.Color(), hsl = {};
    let lightness = 0, priorLightness = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      color.setRGB(pixels[i] / 255, pixels[i + 1] / 255, pixels[i + 2] / 255).getHSL(hsl);
      assert.ok(hsl.h > 0.49 && hsl.h < 0.51, 'spring water is blue-green rather than clay brown');
      assert.ok(hsl.s >= 0.33 && hsl.s <= 0.37 && hsl.l <= 0.423,
        'pigment remains subdued, not a fluorescent pool');
      lightness += hsl.l;
      color.setRGB(prior[i] / 255, prior[i + 1] / 255, prior[i + 2] / 255).getHSL(hsl);
      priorLightness += hsl.l;
      assert.equal(pixels[i + 3], prior[i + 3], 'packed roughness is unchanged');
    }
    const lift = (lightness - priorLightness) / (256 * 256);
    assert.ok(lift > 0.02 && lift <= 0.032, 'water receives only the intended small lightness lift');
    for (const layer of [spring, clay]) { layer.albedo.dispose(); layer.normal.dispose(); }
  }
} finally {
  if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  if (oldImageData === undefined) delete globalThis.ImageData; else globalThis.ImageData = oldImageData;
}

const source = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
const start = source.indexOf('  function createCropTexture(');
const end = source.indexOf('  function cropPlotAvoidsSpawns(', start);
assert.ok(start > 0 && end > start);
const makeCrop = new Function('THREE', 'document', 'canvas2d', '_col', 'aniso',
  `${stripTypeScriptTypes(source.slice(start, end))}\nreturn createCropTexture;`);

function recordCrop(seed) {
  const stemStyles = [], headStyles = [];
  let strokes = 0, heads = 0, draws = 0;
  const canvas = { width: 0, height: 0, pixels: null };
  const context = {
    clearRect() {}, beginPath() {}, moveTo() {}, quadraticCurveTo() {}, ellipse() {},
    stroke() { strokes++; stemStyles.push(this.strokeStyle); },
    fill() { heads++; headStyles.push(this.fillStyle); },
    // An adversarial fully opaque field checks the actual gap/shading pass:
    // even overlapping rasterized stalks cannot refill these coarse gaps.
    getImageData() {
      const data = new Uint8ClampedArray(canvas.width * canvas.height * 4);
      for (let i = 0; i < data.length; i += 4) data.set([155, 133, 78, 255], i);
      return { data };
    },
    putImageData(image) { canvas.pixels = image.data.slice(); },
  };
  const rng = mulberry32(seed);
  const texture = makeCrop(THREE, { createElement: () => canvas }, () => context,
    new THREE.Color(), 4)(() => { draws++; return rng(); });
  return { texture, stems: stemStyles, heads: headStyles, strokes, headCount: heads, draws };
}
for (const seed of [1337, 2049]) {
  const crop = recordCrop(seed), repeated = recordCrop(seed);
  assert.equal(crop.draws, 260 * 9, 'every original seeded painter draw is preserved');
  assert.equal(crop.strokes, 260); assert.equal(crop.headCount, 260);
  assert.equal(crop.texture.image.width, 256); assert.equal(crop.texture.image.height, 256);
  assert.equal(crop.texture.colorSpace, THREE.SRGBColorSpace);
  assert.equal(crop.texture.wrapS, THREE.RepeatWrapping);
  assert.equal(crop.texture.anisotropy, 4);
  const hsl = {}, color = new THREE.Color();
  for (const style of crop.stems) {
    color.setStyle(style).getHSL(hsl);
    assert.ok(hsl.l >= 0.16 && hsl.l <= 0.29, 'recorded crop painter uses muted linear-light stems');
  }
  for (const style of crop.heads) {
    color.setStyle(style).getHSL(hsl);
    assert.ok(hsl.l <= 0.355, 'seed heads cannot return to the old cream-white cap');
  }
  const pixels = crop.texture.image.pixels;
  let gaps = 0;
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const offset = (y * 256 + x) * 4;
    if (x % 64 < 24) { assert.equal(pixels[offset + 3], 0); gaps++; }
    else assert.equal(pixels[offset + 3], 255, 'the cut preserves opaque resolved stalk clumps');
  }
  assert.equal(gaps / (256 * 256), 0.375, 'coarse gaps break a solid-card silhouette');
  // Box-filtered alpha is a CPU mip surrogate, not a GPU upload/readback.
  for (let x = 0; x < 64; x++) {
    if (x % 16 >= 6) continue;
    let alpha = 0;
    for (let dx = 0; dx < 4; dx++) for (let dy = 0; dy < 4; dy++) {
      alpha += pixels[((128 + dy) * 256 + x * 4 + dx) * 4 + 3];
    }
    assert.equal(alpha, 0, 'four coarse gaps survive a quarter-resolution alpha mip');
  }
  assert.ok(pixels[(255 * 256 + 32) * 4] < pixels[32 * 4], 'roots are darker than the tips');
  assert.deepEqual(pixels, repeated.texture.image.pixels);
  assert.deepEqual(crop.stems, repeated.stems);
  crop.texture.dispose(); repeated.texture.dispose();
}
console.log('environmentSurfaceColor.selftest: CPU spring pigment, recorded crop tones, fixed RNG/buffers and persistent alpha gaps passed');
