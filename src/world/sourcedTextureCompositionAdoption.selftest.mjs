import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { composeAlbedoPixels, composeSurfacePixels } from './sourcedTextureComposer.ts';

const url = new URL('./sourcedTextures.ts?selftest=worker-adoption', import.meta.url).href;
const clientUrl = new URL('./sourcedTextureCompositionClient.ts', import.meta.url).href;
const qualityUrl = new URL('../engine/quality.ts', import.meta.url).href;
const driver = { available: true, calls: [], mode: 'hold' };
globalThis.__sourcedCompositionTest = driver;
globalThis.__sourceTestCap = 2;
const hooks = registerHooks({ load(path, context, next) {
  if (path === clientUrl) return { format: 'module', shortCircuit: true, source: `
    export const canComposeSourcedTextureInWorker = () => globalThis.__sourcedCompositionTest.available;
    export const tryComposeSourcedTexture = (...args) => globalThis.__sourcedCompositionTest.compose(...args);` };
  if (path === qualityUrl) return { format: 'module', shortCircuit: true,
    source: 'export const texSize = size => Math.min(size, globalThis.__sourceTestCap);' };
  const result = next(path, context);
  return path === url ? { ...result, source: `${result.source}\nexport { applySet, composeSet, composeSetAsync, loadSetImages, _compositeCache, _normalCache };` } : result;
} });

let canvasCount = 0, reads = 0, failAdoption = false;
class TestImageData {
  constructor(data, width, height) { this.data = data; this.width = width; this.height = height; }
}
class TestCanvas {
  constructor() { canvasCount++; this.width = this.height = 0; this.pixels = null; }
  getContext() {
    const canvas = this;
    return {
      drawImage(image, _x, _y, size) { canvas.pixels = scale(image, size); },
      getImageData() { reads++; return new TestImageData(new Uint8ClampedArray(canvas.pixels), canvas.width, canvas.height); },
      createImageData(width, height) { return new TestImageData(new Uint8ClampedArray(width * height * 4), width, height); },
      putImageData(image) {
        if (failAdoption && image instanceof TestImageData) { failAdoption = false; throw new Error('adoption denied'); }
        canvas.pixels = new Uint8ClampedArray(image.data);
      },
    };
  }
}
function scale(image, size) {
  const output = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const from = (Math.floor(y * image.height / size) * image.width + Math.floor(x * image.width / size)) * 4;
    output.set(image.pixels.subarray(from, from + 4), (y * size + x) * 4);
  }
  return output;
}
const loaded = new Map(), failedUrls = new Set();
class TestImage {
  constructor() {
    this.width = this.height = 2;
    this.pixels = new Uint8ClampedArray([100, 150, 200, 255, 80, 40, 20, 255, 255, 128, 64, 255, 20, 30, 40, 255]);
  }
  set src(url) {
    loaded.set(url, this);
    queueMicrotask(() => failedUrls.has(url) ? this.onerror(new Error('missing source')) : this.onload());
  }
}
globalThis.document = { createElement: tag => { assert.equal(tag, 'canvas'); return new TestCanvas(); } };
globalThis.Image = TestImage; globalThis.ImageData = TestImageData;
const { applySet, composeSet, composeSetAsync, loadSetImages, _compositeCache, _normalCache,
  applySourcedBuildings, applySourcedTerrain, prepareSourcedTerrain } = await import(url);
hooks.deregister();

const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const texture = () => ({ image: {}, disposals: 0, dispose() { this.disposals++; }, needsUpdate: false });
const layer = (surface = false) => ({ albedo: texture(), normal: texture(), ...(surface ? { surface: texture() } : {}) });
const reset = () => { _compositeCache.clear(); _normalCache.clear(); driver.calls.length = 0; driver.available = true; driver.mode = 'hold'; };
driver.compose = (input, signal) => {
  const job = { input, signal, resolve: null, result: null };
  driver.calls.push(job);
  if (driver.mode === 'reject') return Promise.reject(new Error('worker unavailable'));
  if (driver.mode === 'null') return Promise.resolve(null);
  return new Promise(resolve => { job.resolve = resolve; });
};
function complete(job, overrides = {}) {
  const { input } = job;
  const color = scale(input.images.color, input.size);
  const ao = input.images.ao ? scale(input.images.ao, input.size) : null;
  const rough = input.images.rough ? scale(input.images.rough, input.size) : null;
  composeAlbedoPixels(color, input.options.separateSurface ? null : ao, rough, input.options);
  const surface = input.includeSurface ? new Uint8ClampedArray(color.length) : null;
  if (surface) composeSurfacePixels(surface, ao, rough, input.options.roughMul);
  job.result = { albedo: color, surface, ...overrides }; job.resolve(job.result);
  return job.result;
}

// Public authoring and existing prepared terrain remain synchronous composers,
// even when worker support exists. Merely settling prefetch IO paints nothing.
reset();
await applySourcedBuildings({ plaster: layer(true) }, 'urban');
await applySourcedTerrain('urban', { G: layer() });
assert.equal(driver.calls.length, 0, 'default source application never opts authoring into workers');
reset();
const beforePreparation = canvasCount;
const preparation = prepareSourcedTerrain('urban'); await preparation.ready;
assert.equal(canvasCount, beforePreparation, 'unused source preparation remains image-only');
assert.ok(preparation.tryCreateLayer('G', 8));
assert.equal(driver.calls.length, 0, 'early preparation has no new speculative composition owner');

// Misses publish only after complete adoption, with no input readback on main.
// Joined callers recheck the completed cache before allocating their canvases.
reset();
const a = layer(true), b = layer(true);
const pendingA = applySet('plaster', a, { tint: [0.9, 0.8, 0.7], desat: 0.2 }, { worker: true });
const pendingB = applySet('plaster', b, { tint: [0.9, 0.8, 0.7], desat: 0.2 }, { worker: true });
await flush();
assert.equal(driver.calls.length, 2, 'client pending coalescence is separately tested at its native port');
assert.equal(a.albedo.disposals, 0); assert.equal(b.albedo.disposals, 0);
const preAdoptionReads = reads;
const same = complete(driver.calls[0]); driver.calls[1].resolve(same);
assert.deepEqual(await pendingA, { applied: true, failures: [] }); await pendingB;
assert.equal(reads, preAdoptionReads, 'adoption uses putImageData and normal draw only');
assert.equal(a.albedo.image, b.albedo.image); assert.equal(a.surface.image, b.surface.image);
assert.equal(a.normal.image, b.normal.image);
for (const owner of [a, b]) for (const name of ['albedo', 'normal', 'surface']) {
  assert.equal(owner[name].disposals, 1); assert.equal(owner[name].needsUpdate, true);
}
const c = layer(true), beforeHit = canvasCount;
await applySet('plaster', c, { tint: [0.9, 0.8, 0.7], desat: 0.2 }, { worker: true });
assert.equal(driver.calls.length, 2, 'cache hits never visit worker client');
assert.equal(canvasCount, beforeHit); assert.equal(c.albedo.image, a.albedo.image);
const originalBytes = new Uint8ClampedArray(a.surface.image.pixels);
const variant = layer(true);
const variantPending = applySet('plaster', variant, { tint: [0.7, 0.6, 0.5] }, { worker: true });
await flush(); assert.equal(driver.calls[2].input.includeSurface, false, 'cached immutable surface is not re-read');
complete(driver.calls[2]); await variantPending;
assert.equal(variant.surface.image, a.surface.image);
assert.deepEqual(a.surface.image.pixels, originalBytes);

// Exact bytes and metadata-producing canvas ownership match the sync path for
// packed alpha, separate surfaces, both flags, and every optional-map absence.
const source = await loadSetImages('plaster');
for (const options of [
  { roughInAlpha: true, roughMul: 1.25, tint: [0.8, 1, 0.5], desat: 0.16, lift: 0.02 },
  { separateSurface: true, roughMul: 0.7, tint: [1.1, 0.7, 0.5] },
  { separateSurface: true, roughInAlpha: true, desat: 0.5 },
]) for (const absent of [[], ['ao'], ['rough'], ['ao', 'rough']]) {
  reset();
  const images = { ...source }; for (const role of absent) images[role] = null;
  const expected = composeSet('plaster', images, options);
  _compositeCache.clear(); _normalCache.clear();
  const pending = composeSetAsync('plaster', images, options); await flush();
  complete(driver.calls[0]); const actual = await pending;
  for (const name of ['albedo', 'normal', 'surface']) {
    assert.deepEqual(actual[name]?.pixels ?? null, expected[name]?.pixels ?? null, `${JSON.stringify(options)} ${absent}/${name}`);
    assert.equal(actual[name]?.width, expected[name]?.width);
  }
}

// Fallback remains the full exact composer, with honest failure receipts; a
// native failure never converts a supported sourced set into a silent success.
for (const mode of ['null', 'reject', 'unsupported', 'adoption']) {
  reset(); driver.mode = mode; driver.available = mode !== 'unsupported';
  const destination = layer(true);
  const pending = applySet('plaster', destination, {}, { worker: true }); await flush();
  if (mode === 'adoption') { failAdoption = true; complete(driver.calls[0]); }
  const result = await pending;
  assert.equal(result.applied, true, mode); assert.equal(destination.albedo.disposals, 1);
  assert.equal(_compositeCache.size, 1);
}
reset();
assert.equal(await composeSetAsync('plaster', { ...source, normal: null }, {}), null);
assert.equal(driver.calls.length, 0, 'missing mandatory normal never asks for worker success');

// Cancellation before IO or after native work was queued cannot adopt, fall
// back, fill caches, or overwrite the last valid texture image.
for (const when of ['before', 'queued']) {
  reset(); const abort = new AbortController(), target = layer(true), original = target.albedo.image;
  if (when === 'before') abort.abort();
  const pending = applySet('plaster', target, {}, { worker: true, signal: abort.signal }); await flush();
  if (when === 'queued') { abort.abort(); complete(driver.calls[0]); }
  const before = canvasCount;
  const result = await pending;
  assert.equal(result.applied, false); assert.ok(result.failures.includes('Source composition canceled'));
  assert.equal(canvasCount, before); assert.equal(target.albedo.image, original);
  assert.equal(target.albedo.disposals, 0); assert.equal(_compositeCache.size, 0);
}

// A tier-size change in flight discards obsolete worker output and composes
// the current size. Later variants still respect the existing eight-entry LRU.
reset();
const resized = layer(); const resizePending = applySet('plaster', resized, {}, { worker: true }); await flush();
globalThis.__sourceTestCap = 1; complete(driver.calls[0]); await resizePending;
assert.equal(resized.albedo.image.width, 1); assert.equal([..._compositeCache.values()][0].size, 1);
globalThis.__sourceTestCap = 2;
reset();
for (let i = 0; i < 10; i++) {
  const pending = applySet('plaster', layer(true), { tint: [i / 10, 1, 1] }, { worker: true }); await flush();
  complete(driver.calls.at(-1)); await pending;
  assert.ok(_compositeCache.size <= 8);
}
assert.equal(_compositeCache.size, 8);
console.log('sourcedTextureCompositionAdoption.selftest: cache bypass, exact optionals, source settlement, adoption, fallback, cancellation, size invalidation, and bounded retention passed');
