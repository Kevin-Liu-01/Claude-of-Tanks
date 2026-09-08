import assert from 'node:assert/strict';

const urls = [];
const warnings = [];
const originalWarn = console.warn;
console.warn = (...args) => warnings.push(args.join(' '));
class ImageFixture {
  width = 1;
  height = 1;
  set src(url) {
    urls.push(url);
    const fail = /Grass004.*Color|Plaster007.*NormalGL|Ground071.*Roughness|Rock058.*AmbientOcclusion/.test(url);
    queueMicrotask(() => fail ? this.onerror() : this.onload());
  }
}
const context = {
  drawImage() {},
  getImageData() { return { data: new Uint8ClampedArray([100, 120, 140, 255]) }; },
  createImageData() { return { data: new Uint8ClampedArray(4) }; },
  putImageData() {},
};
globalThis.Image = ImageFixture;
globalThis.window = {};
globalThis.document = { createElement() { return { width: 1, height: 1, getContext: () => context }; } };
try {
  const { applySourcedTerrain, applySourcedBuildings } = await import('./sourcedTextures.ts');
  const layer = () => ({ albedo: { swaps: 0, dispose() { this.swaps++; } }, normal: { dispose() {} } });
  const layers = { G: layer(), D: layer(), R: layer() };
  const terrain = await applySourcedTerrain('verdant', layers);
  const building = layer();
  const buildings = await applySourcedBuildings({ plaster: building }, 'verdant');
  assert.equal(terrain.length, 3);
  assert.equal(terrain[0].applied, false, 'missing albedo preserves the procedural fallback');
  assert.match(terrain[0].failures[0], /Grass004.*Color/);
  assert.equal(layers.G.albedo.swaps, 0);
  assert.equal(terrain[1].applied, true, 'optional roughness fallback remains usable in normal gameplay');
  assert.match(terrain[1].failures[0], /Ground071.*Roughness/);
  assert.equal(terrain[2].applied, true);
  assert.match(terrain[2].failures[0], /Rock058.*AmbientOcclusion/);
  assert.equal(buildings[0].applied, false);
  assert.match(buildings[0].failures[0], /Plaster007.*NormalGL/);
  assert.equal(building.albedo.swaps, 0);
  assert.equal(warnings.length, 4, 'all four source failures are visible to capture tooling');
  assert.equal(urls.length, 16, 'existing four images per set, no retry or extra preload');
  for (const receipt of [...terrain, ...buildings]) {
    assert.deepEqual(Object.keys(receipt).sort(), ['applied', 'failures', 'target']);
    assert.ok(receipt.failures.every((failure) => typeof failure === 'string'), 'receipts retain text, not images/errors');
  }
} finally { console.warn = originalWarn; }
console.log('sourcedTextureFailures.selftest: albedo/normal errors and optional roughness/AO failures remain visible without blocking production');
