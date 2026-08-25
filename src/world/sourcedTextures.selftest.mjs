import assert from 'node:assert/strict';

const contextOptions = [];

class TestCanvas {
  constructor() {
    this.width = 0;
    this.height = 0;
    this.pixels = new Uint8ClampedArray();
  }

  getContext(type, options) {
    assert.equal(type, '2d');
    contextOptions.push(options || null);
    const canvas = this;
    return {
      drawImage(image, _x, _y, width, height) {
        canvas.width = width;
        canvas.height = height;
        canvas.pixels = new Uint8ClampedArray(image.pixels);
      },
      getImageData() {
        return { data: new Uint8ClampedArray(canvas.pixels) };
      },
      putImageData(image) {
        canvas.pixels = new Uint8ClampedArray(image.data);
      },
    };
  }
}

globalThis.document = {
  createElement(tag) {
    assert.equal(tag, 'canvas');
    return new TestCanvas();
  },
};
globalThis.window = globalThis.window || {};

class TestImage {
  constructor() {
    this.width = 2;
    this.height = 2;
    this.pixels = new Uint8ClampedArray([
      100, 150, 200, 255, 80, 40, 20, 255,
      255, 128, 64, 255, 20, 30, 40, 255,
    ]);
  }

  set src(_value) { queueMicrotask(() => this.onload()); }
}
globalThis.Image = TestImage;

const { applySourcedTerrain, composeAlbedo } = await import('./sourcedTextures.js');
const image = (pixels) => ({ width: 2, height: 2, pixels: new Uint8ClampedArray(pixels) });

const color = image([
  100, 150, 200, 255, 80, 40, 20, 255,
  255, 128, 64, 255, 20, 30, 40, 255,
]);
const ao = image([
  128, 128, 128, 255, 255, 255, 255, 255,
  64, 64, 64, 255, 0, 0, 0, 255,
]);
const rough = image([
  200, 200, 200, 255, 100, 100, 100, 255,
  50, 50, 50, 255, 255, 255, 255, 255,
]);

const canvas = composeAlbedo(color, ao, rough, {
  roughInAlpha: true,
  roughMul: 1.25,
  tint: [0.8, 1, 0.5],
});

assert.deepEqual([...canvas.pixels], [
  40, 75, 50, 250, 64, 40, 10, 125,
  51, 32, 8, 62, 0, 0, 0, 255,
], 'composer preserves the color × AO × tint and packed-roughness contract');
assert.equal(contextOptions.filter((options) => options?.willReadFrequently).length, 2,
  'output plus shared AO/roughness surfaces opt into readback-optimized Canvas2D');
assert.equal(contextOptions.length, 2,
  'one output context plus one reusable readback context are allocated');

const texture = () => ({ disposeCount: 0, dispose() { this.disposeCount++; } });
const layer = { albedo: texture(), normal: texture() };
let terrainSettled = false;
const terrainReady = applySourcedTerrain('verdant', { G: layer });
terrainReady.then(() => { terrainSettled = true; });
assert.equal(terrainSettled, false,
  'terrain readiness remains pending until the sourced images finish loading');
await terrainReady;
assert.equal(terrainSettled, true,
  'terrain readiness resolves after every requested texture swap');
assert.equal(layer.albedo.disposeCount, 1, 'sourced albedo replaces the fallback once');
assert.equal(layer.normal.disposeCount, 1, 'sourced normal replaces the fallback once');

console.log('sourcedTextures.selftest: byte, readback, and async readiness contracts passed');
