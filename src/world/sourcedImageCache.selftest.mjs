// sourcedImageCache.selftest.mjs — the decoded source-photo cache of sourcedTextures.ts is bounded (ARCH-P8).
// It used to keep every photo a session ever loaded (up to 48 1K images across 12 sets); it now keeps the
// most recently used photos up to one battlefield's working set, so a map's own loads never evict each other.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Reach the private cache without a runtime test API (the sourcedTextures.selftest.mjs convention).
const privateUrl = new URL('./sourcedTextures.ts?selftest=image-cache', import.meta.url).href;
const hooks = registerHooks({ load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  return url === privateUrl
    ? { ...result, source: `${result.source}\nexport { loadImage, _imgCache, IMAGE_CACHE_MAX, SETS, TERRAIN_PLAN };\n` }
    : result;
} });

const constructed = [];
globalThis.Image = class {
  width = 1;
  height = 1;
  set src(url) {
    constructed.push(url);
    queueMicrotask(() => this.onload());
  }
};
globalThis.window = globalThis.window || {};
globalThis.document = globalThis.document || { createElement() { throw new Error('no canvas in this receipt'); } };

const { loadImage, _imgCache, IMAGE_CACHE_MAX, SETS, TERRAIN_PLAN } = await import(privateUrl);
hooks.deregister();

// The bound covers the largest single battlefield: its distinct terrain sets plus every building set.
const imagesOf = (setKey) => ['color', 'normal', 'rough', 'ao'].filter((slot) => SETS[setKey][slot]).length;
const setKeyOf = (entry) => (typeof entry === 'string' ? entry : entry?.set ?? null);
const buildingSets = Object.keys(SETS).filter((key) => SETS[key].color.startsWith('/textures/buildings/'));
let largest = 0;
for (const [mapId, plan] of Object.entries(TERRAIN_PLAN)) {
  const terrainSets = new Set(Object.values(plan).map(setKeyOf).filter(Boolean));
  const images = [...terrainSets, ...buildingSets].reduce((sum, key) => sum + imagesOf(key), 0);
  assert.ok(images <= IMAGE_CACHE_MAX, `${mapId} loads ${images} source photos, above the ${IMAGE_CACHE_MAX}-image cache`);
  largest = Math.max(largest, images);
}
const everyPhoto = Object.keys(SETS).reduce((sum, key) => sum + imagesOf(key), 0);
assert.ok(IMAGE_CACHE_MAX < everyPhoto, `the bound (${IMAGE_CACHE_MAX}) must stay below every photo (${everyPhoto})`);

// LRU behaviour: recent photos are reused, the least recently used one is released.
const url = (index) => `/textures/test/photo-${index}.jpg`;
const first = loadImage(url(0));
assert.equal(loadImage(url(0)), first, 'a cached photo is reused, not reloaded');
for (let index = 1; index < IMAGE_CACHE_MAX; index++) loadImage(url(index));
assert.equal(_imgCache.size, IMAGE_CACHE_MAX);
loadImage(url(0)); // refresh the oldest entry
loadImage(url(IMAGE_CACHE_MAX)); // one past the bound evicts the least recently used: photo-1
assert.equal(_imgCache.size, IMAGE_CACHE_MAX, 'the cache never grows past its bound');
assert.ok(_imgCache.has(url(0)) && !_imgCache.has(url(1)), 'recency, not insertion order, decides eviction');
const before = constructed.length;
await loadImage(url(1));
assert.equal(constructed.length, before + 1, 'an evicted photo loads again on demand');
await Promise.all([..._imgCache.values()]);
assert.equal(constructed.filter((entry) => entry === url(0)).length, 1, 'photo-0 was decoded once throughout');

console.log(`sourcedImageCache.selftest: ${IMAGE_CACHE_MAX}-photo LRU covers the largest battlefield (${largest}) of ${everyPhoto} photos`);
