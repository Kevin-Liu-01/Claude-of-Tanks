import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';

// Default: deterministic tiny image fixture. --native uses the pinned real
// rasterizer for the same legacy/prepared pixel comparison, without a browser.
// An existing installation can be selected with --canvas-module=/absolute/index.js.
let native = null;
if (process.argv.includes('--native')) {
  const canvasModule = process.argv.find(arg => arg.startsWith('--canvas-module='))?.slice('--canvas-module='.length);
  const modulePath = createRequire(import.meta.url).resolve(canvasModule ?? '@napi-rs/canvas');
  const installed = JSON.parse(readFileSync(join(dirname(modulePath), 'package.json'), 'utf8'));
  const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.equal(installed.name, '@napi-rs/canvas');
  assert.equal(installed.version, manifest.devDependencies['@napi-rs/canvas']);
  native = await import(pathToFileURL(modulePath).href);
}

const COLOR = [100, 150, 200, 255, 80, 40, 20, 255, 255, 128, 64, 255, 20, 30, 40, 255];
const NORMAL = [127, 128, 255, 255, 140, 120, 250, 255, 110, 150, 245, 255, 128, 127, 255, 255];
const ROUGH = [200, 200, 200, 255, 100, 100, 100, 255, 50, 50, 50, 255, 255, 255, 255, 255];
const AO = [128, 128, 128, 255, 255, 255, 255, 255, 64, 64, 64, 255, 0, 0, 0, 255];

class TestCanvas {
  width = 0;
  height = 0;
  pixels = new Uint8ClampedArray();
  getContext(type) {
    assert.equal(type, '2d');
    return {
      drawImage: image => { this.pixels = new Uint8ClampedArray(image.pixels); },
      getImageData: () => ({ data: new Uint8ClampedArray(this.pixels) }),
      createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
      putImageData: image => { this.pixels = new Uint8ClampedArray(image.data); },
    };
  }
}

let serial = 0;
async function withFixture(run) {
  const descriptors = new Map(['document', 'window', 'Image'].map(key =>
    [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const requests = new Map();
  const warnings = [];
  const owned = new Set();
  const originalWarn = console.warn;
  let canvasCount = 0;
  const sourcedUrl = new URL(`./sourcedTextures.ts?selftest=prepared-${++serial}`, import.meta.url).href;
  const hooks = registerHooks({ load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    return url === sourcedUrl ? { ...result,
      source: `${result.source}\nexport { _compositeCache, _normalCache };\n` } : result;
  } });
  const canvas = () => {
    canvasCount++;
    if (!native) return new TestCanvas();
    const value = native.createCanvas(1, 1);
    const context = value.getContext('2d');
    const draw = context.drawImage.bind(context);
    context.drawImage = (image, ...args) => draw(image.raster ?? image, ...args);
    return value;
  };
  class ImageFixture {
    width = 2;
    height = 2;
    set src(url) {
      assert.equal(requests.has(url), false, `one image request per cache key: ${url}`);
      this.pixels = new Uint8ClampedArray(/NormalGL|nor_gl/.test(url) ? NORMAL
        : /Roughness|rough_/.test(url) ? ROUGH : /AmbientOcclusion|_ao_/.test(url) ? AO : COLOR);
      if (native) {
        this.raster = native.createCanvas(2, 2);
        this.raster.getContext('2d').putImageData(new native.ImageData(this.pixels, 2, 2), 0, 0);
      }
      requests.set(url, { image: this, settled: false });
    }
  }
  const globals = { document: { createElement(tag) { assert.equal(tag, 'canvas'); return canvas(); } },
    window: {}, Image: ImageFixture };
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  console.warn = (...args) => { warnings.push(args.join(' ')); };
  const own = layer => {
    if (layer) { owned.add(layer.albedo); owned.add(layer.normal); }
    return layer;
  };
  const fallback = (anisotropy = 16) => {
    const image = canvas(); image.width = image.height = 2;
    image.getContext('2d').putImageData(native
      ? new native.ImageData(new Uint8ClampedArray(COLOR), 2, 2)
      : { data: new Uint8ClampedArray(COLOR) }, 0, 0);
    const make = srgb => {
      const texture = new THREE.CanvasTexture(image);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = anisotropy;
      if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    };
    return own({ albedo: make(true), normal: make(false) });
  };
  try {
    const api = await import(sourcedUrl);
    hooks.deregister();
    assert.equal(typeof api.prepareSourcedTerrain, 'function');
    await run({ ...api, requests, warnings, own, fallback,
      canvasCount: () => canvasCount,
      async settle(match = () => true, fail = () => false) {
        for (const [url, request] of requests) {
          if (request.settled || !match(url)) continue;
          request.settled = true;
          if (fail(url)) request.image.onerror(); else request.image.onload();
        }
        // Flush all promise reactions without awaiting unrelated pending sets.
        await new Promise(resolve => setImmediate(resolve));
      },
    });
  } finally {
    hooks.deregister();
    for (const texture of owned) texture.dispose();
    console.warn = originalWarn;
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

function snapshot(texture) {
  const image = texture.image;
  const settings = {};
  for (const key of ['mapping', 'channel', 'wrapS', 'wrapT', 'magFilter', 'minFilter',
    'anisotropy', 'format', 'internalFormat', 'type', 'colorSpace', 'generateMipmaps',
    'premultiplyAlpha', 'flipY', 'unpackAlignment', 'rotation', 'matrixAutoUpdate',
    'isCanvasTexture']) settings[key] = texture[key];
  for (const key of ['offset', 'repeat', 'center', 'matrix']) settings[key] = texture[key].toArray();
  settings.mipmaps = texture.mipmaps.slice();
  // Legacy swaps an existing CanvasTexture (generation 2); direct creation is
  // already dirty at generation 1. Those counters are lifecycle, not output.
  settings.source = { dataReady: texture.source.dataReady };
  return { size: [image.width, image.height],
    pixels: [...image.getContext('2d').getImageData(0, 0, image.width, image.height).data], settings };
}
const layerSnapshot = layer => Object.fromEntries(['albedo', 'normal'].map(key => [key, snapshot(layer[key])]));
const generations = layer => ['albedo', 'normal'].flatMap(key =>
  [layer[key].version, layer[key].source.version]);
function observeDisposal(layer) {
  let count = 0;
  for (const texture of Object.values(layer)) texture.addEventListener('dispose', () => count++);
  return () => count;
}
function noTextureAllocation(run) {
  const before = new THREE.Texture();
  run();
  const after = new THREE.Texture();
  assert.equal(after.id, before.id + 1, 'preparation must not allocate any texture');
  before.dispose(); after.dispose();
}

await withFixture(async f => {
  let preparation;
  noTextureAllocation(() => { preparation = f.prepareSourcedTerrain('winter'); });
  assert.equal(f.requests.size, 12, 'all three image sets start immediately');
  assert.equal(f.canvasCount(), 0, 'starting image IO does not compose canvases');
  assert.equal(f._compositeCache.size + f._normalCache.size, 0);
  for (const key of ['G', 'D', 'R', 'M']) assert.equal(preparation.tryCreateLayer(key, 16), null);
  let ready = false;
  preparation.ready.then(() => { ready = true; });
  await f.settle(url => url.includes('Snow010A'));
  assert.equal(ready, false, 'one settled layer does not settle the whole preparation');
  assert.equal(f.canvasCount(), 0, 'settling image IO still does not compose');
  const grass = f.own(preparation.tryCreateLayer('G', 16));
  assert.ok(grass?.albedo.isCanvasTexture && grass.normal.isCanvasTexture);
  assert.equal(preparation.tryCreateLayer('D', 16), null);
  assert.equal(preparation.tryCreateLayer('R', 16), null);
  assert.equal(preparation.tryCreateLayer('M', 16), null);
  const original = layerSnapshot(grass);
  const originalGenerations = generations(grass);
  assert.deepEqual(originalGenerations, [1, 1, 1, 1], 'fresh textures are already dirty exactly once');
  const disposed = observeDisposal(grass);
  grass.albedo.dispose(); grass.normal.dispose();
  await f.settle();
  await preparation.ready;
  assert.deepEqual(layerSnapshot(grass), original,
    'later image settlements never mutate already-created, abandoned textures');
  assert.deepEqual(generations(grass), originalGenerations);
  assert.equal(disposed(), 2);
  assert.equal(f.warnings.length, 0);

  const legacy = f.fallback();
  const legacyDisposed = observeDisposal(legacy);
  const expectedReceipts = await f.applySourcedTerrain('winter', { G: legacy });
  assert.equal(legacyDisposed(), 2);
  assert.deepEqual(layerSnapshot(grass), layerSnapshot(legacy),
    'prepared pixels and every non-allocation texture metadata field match legacy final output');
  assert.deepEqual(await preparation.apply({ G: grass }), expectedReceipts);
  assert.equal(disposed(), 2, 'apply must not reswap its exact prepared layer');
  assert.deepEqual(layerSnapshot(grass), original);
  assert.deepEqual(generations(grass), originalGenerations, 'apply must not schedule redundant uploads');

  const foreign = f.fallback();
  const foreignDisposed = observeDisposal(foreign);
  await preparation.apply({ G: foreign });
  assert.equal(foreignDisposed(), 2, 'a different layer under the same key is not mistaken for prepared ownership');
  assert.deepEqual(layerSnapshot(foreign), layerSnapshot(legacy));
  const requestsBefore = f.requests.size;
  const second = f.prepareSourcedTerrain('winter');
  await second.ready;
  const nextBuild = f.own(second.tryCreateLayer('G', 16));
  assert.notEqual(nextBuild.albedo, grass.albedo, 'each build owns fresh texture identities');
  assert.notEqual(nextBuild.normal, grass.normal);
  assert.deepEqual(layerSnapshot(nextBuild), layerSnapshot(legacy));
  assert.equal(f.requests.size, requestsBefore, 'preparation and legacy application reuse source image IO');
});

await withFixture(async f => {
  let abandoned;
  noTextureAllocation(() => { abandoned = f.prepareSourcedTerrain('winter'); });
  const before = new THREE.Texture();
  await f.settle();
  await abandoned.ready;
  const after = new THREE.Texture();
  assert.equal(after.id, before.id + 1, 'aborting before creation leaves no asynchronously allocated texture');
  assert.equal(f.canvasCount(), 0, 'unused settled preparations never paint or compose');
  assert.equal(f._compositeCache.size + f._normalCache.size, 0);
  assert.equal(f.warnings.length, 0);
  before.dispose(); after.dispose();
});

for (const missing of ['Color', 'NormalGL', 'optional']) await withFixture(async f => {
  const preparation = f.prepareSourcedTerrain('verdant');
  const fail = url => url.includes('Grass004') && (missing === 'optional'
    ? /Roughness|AmbientOcclusion/.test(url) : url.includes(missing));
  await f.settle(() => true, fail);
  await preparation.ready;
  assert.equal(f.warnings.length, 0, 'preparation reports failures only when applied');
  const prepared = f.own(preparation.tryCreateLayer('G', 8));
  assert.equal(Boolean(prepared), missing === 'optional');
  assert.equal(f.warnings.length, 0, 'tryCreate does not publish source warnings');
  const legacy = f.fallback(8);
  const expected = await f.applySourcedTerrain('verdant', { G: legacy });
  const target = prepared ?? f.fallback(8);
  const before = layerSnapshot(target);
  const disposals = observeDisposal(target);
  const warningCount = f.warnings.length;
  assert.deepEqual(await preparation.apply({ G: target }), expected);
  assert.equal(f.warnings.length, warningCount + 1, 'one visible warning per applied layer with failures');
  assert.equal(disposals(), 0, 'missing mandatory sources preserve fallback; ready prepared sources do not reswap');
  assert.deepEqual(layerSnapshot(target), before);
  assert.deepEqual(layerSnapshot(target), layerSnapshot(legacy));
  assert.equal(expected[0].applied, missing === 'optional');
  assert.equal(expected[0].failures.length, missing === 'optional' ? 2 : 1);
});

for (const [mapId, settings, sourceName] of [
  ['whiteout', { sourcedPalette: 'winter' }, 'Snow010A'],
  ['unknown-map', {}, 'Grass004'],
  ['caldera', {}, 'Ground071'],
]) await withFixture(async f => {
  const preparation = f.prepareSourcedTerrain(mapId, settings);
  await f.settle(); await preparation.ready;
  assert.ok([...f.requests.keys()].some(url => url.includes(sourceName)));
  const prepared = f.own(preparation.tryCreateLayer('G', 16));
  const legacy = f.fallback();
  const expected = await f.applySourcedTerrain(mapId, { G: legacy }, settings);
  assert.deepEqual(await preparation.apply({ G: prepared }), expected);
  assert.deepEqual(layerSnapshot(prepared), layerSnapshot(legacy), `${mapId}: resolved palette/tint/lift parity`);
  assert.equal(preparation.tryCreateLayer('M', 16), null);
});

for (const mapId of ['desert', 'badlands']) await withFixture(async f => {
  const preparation = f.prepareSourcedTerrain(mapId);
  assert.equal(f.requests.size, 4, 'G and D share the same four sand source images');
  await f.settle(); await preparation.ready;
  const G = f.own(preparation.tryCreateLayer('G', 16));
  const D = f.own(preparation.tryCreateLayer('D', 16));
  assert.ok(G && D);
  assert.equal(preparation.tryCreateLayer('R', 16), null, 'authored rock/sandstone has no source replacement');
  assert.equal(preparation.tryCreateLayer('M', 16), null, 'authored mud/ice/water remains procedural');
  const R = f.fallback(); const M = f.fallback();
  const original = [layerSnapshot(R), layerSnapshot(M)];
  const disposals = [observeDisposal(R), observeDisposal(M)];
  const receipts = await preparation.apply({ G, D, R, M });
  assert.deepEqual(receipts.map(row => row.target), [`terrain ${mapId}/G`, `terrain ${mapId}/D`]);
  assert.deepEqual([layerSnapshot(R), layerSnapshot(M)], original);
  assert.deepEqual(disposals.map(read => read()), [0, 0]);
});

await withFixture(async f => {
  // Keep the actual selection/yield logic, but replace expensive procedural
  // painters with counters. Stop before mask/material/mesh construction.
  const terrainUrl = new URL('./terrain.ts?selftest=prepared-layer-seam', import.meta.url).href;
  const hooks = registerHooks({ load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    return url === terrainUrl ? { ...result, source: `${result.source}
      export const _paintCalls = [];
      const _paint = (kind, args) => {
        _paintCalls.push([kind, ...args]);
        return { albedo: null, normal: null };
      };
      makeGrassLayer = (...args) => _paint('grass', args);
      makeDirtLayer = (...args) => _paint('dirt', args);
      makeGroundLayer = (...args) => _paint('ground', args);
      makeSandstoneLayer = (...args) => _paint('sandstone', args);
      export { createSplatMaterialSteps as _createSplatMaterialSteps, terrainBuildSteps as _terrainBuildSteps };
    ` } : result;
  } });
  let terrain;
  try { terrain = await import(terrainUrl); } finally { hooks.deregister(); }
  function layerPass(preparation = null, splat = {}) {
    terrain._paintCalls.length = 0;
    const seenKeys = [];
    const source = preparation && { ...preparation, tryCreateLayer(key, anisotropy) {
      seenKeys.push(key);
      assert.equal(anisotropy, 16, 'source textures retain the terrain anisotropy floor');
      return f.own(preparation.tryCreateLayer(key, anisotropy));
    } };
    const steps = terrain._createSplatMaterialSteps({ anisotropy: 2 }, {}, splat,
      'verdant', null, null, source);
    try { for (let i = 0; i < 4; i++) assert.equal(steps.next().done, false); }
    finally { steps.return(); }
    assert.deepEqual(seenKeys, preparation ? ['G', 'D', 'R'] : [],
      'wet/ice/sea layer never consults sourced preparation');
  }
  // makeGroundLayer's second argument is the ground kind (seed, kind, aniso).
  const calls = () => terrain._paintCalls.map(([kind, , ground]) =>
    kind === 'ground' ? `${kind}:${ground}` : kind);
  const preparation = f.prepareSourcedTerrain('winter');
  layerPass(preparation);
  assert.deepEqual(calls(), ['grass', 'dirt', 'ground:rock', 'ground:mud'],
    'pending sources retain all original painters without waiting');
  await f.settle(); await preparation.ready;
  layerPass(preparation);
  assert.deepEqual(calls(), ['ground:mud'], 'ready G/D/R skip only the replaced procedural painters');
  layerPass();
  assert.deepEqual(calls(), ['grass', 'dirt', 'ground:rock', 'ground:mud'],
    'the synchronous default retains every original layer painter');
  const desert = f.prepareSourcedTerrain('desert');
  await f.settle(); await desert.ready;
  layerPass(desert, { sandstone: true });
  assert.deepEqual(calls(), ['sandstone', 'ground:mud'], 'null-plan sandstone remains procedural');

  // Verify the public wrapper seam without constructing an entire heightfield.
  assert.match(String(terrain.buildTerrainMeshes), /terrainBuildSteps\(heightField, engineCtx, cfg\)/);
  assert.doesNotMatch(String(terrain.buildTerrainMeshes), /sourcePreparation|prepareSourcedTerrain/);
  assert.match(String(terrain.buildTerrainMeshesAsync), /sourcePreparation = prepareSourcedTerrain/);
  assert.match(String(terrain.buildTerrainMeshesAsync), /terrainBuildSteps\(heightField, engineCtx, cfg, streamOpts, sourcePreparation\)/);
  assert.match(String(terrain._terrainBuildSteps), /createSplatMaterialSteps\([\s\S]*?sourcePreparation,?\s*\)/);
});

console.log(`sourcedTerrainPreparation.selftest: readiness, fallback, ownership, palette, builder seam and ${native ? 'native' : 'fixture'} pixel/metadata parity passed`);
