import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SRGBColorSpace, NoColorSpace } from 'three';
import { makeSeaLayer } from './terrain.ts';

// Inspect the real generator's CPU pixels. Native canvas upload, mipmapping,
// and final shader response remain browser/render checks, not this stub's proof.
const previousDocument = globalThis.document;
const previousImageData = globalThis.ImageData;
globalThis.ImageData = class { constructor(data) { this.data = data; } };
globalThis.document = {
  createElement(tag) {
    assert.equal(tag, 'canvas');
    const canvas = { width: 0, height: 0, pixels: null };
    canvas.getContext = () => ({ putImageData(image) { canvas.pixels = image.data.slice(); } });
    return canvas;
  },
};

try {
  for (const seed of [3003, 1337, 2002]) {
    const water = makeSeaLayer(seed, 4);
    const tinted = makeSeaLayer(seed, 4, () => [0.1, 0.8, 0.3]);
    assert.deepEqual(Object.keys(water).sort(), ['albedo', 'normal']);
    assert.equal(water.albedo.colorSpace, SRGBColorSpace);
    assert.equal(water.normal.colorSpace, NoColorSpace);
    assert.equal(water.normal.image.width, 256);
    assert.equal(water.normal.image.height, 256);
    assert.deepEqual(water.normal.image.pixels, tinted.normal.image.pixels,
      'water pigment cannot sculpt its normal field');
    assert.notDeepEqual(water.albedo.image.pixels, tinted.albedo.image.pixels,
      'each biome still controls its water color');
    let minZ = 1, sumZ = 0, maxTilt = 0, variance = 0;
    const pixels = water.normal.image.pixels;
    for (let i = 0; i < pixels.length; i += 4) {
      const x = pixels[i] / 127.5 - 1;
      const y = pixels[i + 1] / 127.5 - 1;
      const z = pixels[i + 2] / 127.5 - 1;
      assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < 0.012);
      minZ = Math.min(minZ, z); sumZ += z;
      maxTilt = Math.max(maxTilt, Math.hypot(x, y));
      variance += x * x + y * y;
    }
    assert.ok(minZ > 0.94, `seed ${seed}: no engraved side-facing scratches (${minZ})`);
    assert.ok(sumZ / (256 * 256) > 0.985, 'calm liquid remains shallow on average');
    assert.ok(maxTilt > 0.03 && variance > 1, 'waves retain real surface relief');
    for (let i = 3; i < pixels.length; i += 4) {
      assert.ok(water.albedo.image.pixels[i] >= 25 && water.albedo.image.pixels[i] <= 35,
        'packed roughness stays bounded; final roughness/foam are shader policies');
    }
    for (const layer of [water, tinted]) {
      layer.albedo.dispose(); layer.normal.dispose();
    }
  }
} finally {
  if (previousDocument === undefined) delete globalThis.document;
  else globalThis.document = previousDocument;
  if (previousImageData === undefined) delete globalThis.ImageData;
  else globalThis.ImageData = previousImageData;
}

const source = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
assert.match(source, /iceLum \* 1\.18\), fMs \* 0\.9 \* \(1\.0 - uSea\)/,
  'giant pressure-crack albedo is exclusive to frozen sheets');
assert.match(source, /iceN\.xy \* mix\(0\.5, 0\.04, uSea\)/,
  'liquid macro normals stay restrained without changing the ice response');
console.log('liquidSurfaceDetail.selftest: shallow pigment-independent waves, same two textures, unchanged ice path');
