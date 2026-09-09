import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { createCanvas, ImageData, loadImage } from '@napi-rs/canvas';
import { CanvasTexture, NoColorSpace, RepeatWrapping, SRGBColorSpace } from 'three';
import { MAP_IDS, getMapConfig } from './maps/index.ts';
import { resolveDeviceTier, texSize } from '../engine/quality.ts';
import { parentPalettes, parentRoutes } from './foundryMasonryParent.fixture.mjs';

// Genuine Canvas2D, including JPEG decode/resampling below. No GPU or visual
// acceptance is inferred from these pigment, routing and ownership checks.
const tier = process.argv.includes('--tier=mobile') ? 'mobile' : 'desktop';
const saved = new Map(['document', 'Image', 'window'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const requests = [];
const ownedTextures = [];
const control = new Uint8ClampedArray([
  184, 96, 52, 255, 180, 180, 180, 255,
  46, 32, 25, 255, 0, 0, 0, 255,
]);
const gray = values => Uint8ClampedArray.from(values.flatMap(value => [value, value, value, 255]));
const inputs = { color: control, ao: gray([255, 192, 64, 0]), rough: gray([192, 128, 64, 240]),
  normal: new Uint8ClampedArray([128, 128, 255, 255, 140, 110, 245, 255, 118, 137, 248, 255, 127, 127, 255, 255]) };

function raster(data, size = 2) {
  const canvas = createCanvas(size, size);
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data), size, size), 0, 0);
  return canvas;
}
function pixels(canvas) {
  return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
}
function options(policy) { return Array.isArray(policy) ? { tint: policy } : policy ?? { tint: null }; }
function oracle(source, policy) {
  const { tint = [1, 1, 1], desat = 0, lift = 0 } = options(policy);
  const result = new Uint8ClampedArray(source.length);
  for (let at = 0; at < source.length; at += 4) {
    const rgb = [0, 1, 2].map(channel => source[at + channel] * (tint?.[channel] ?? 1));
    const luminance = rgb[0] * .299 + rgb[1] * .587 + rgb[2] * .114;
    for (let channel = 0; channel < 3; channel++) {
      result[at + channel] = Math.min(255, rgb[channel] + (luminance - rgb[channel]) * desat + lift * 255);
    }
    result[at + 3] = 255;
  }
  return result;
}
const experiment = { tint: [.80, .75, .70], desat: .34 };
const buckets = ['plaster', 'roof', 'wood', 'stone'];
function assertPolicies(resolve, lookup) {
  assert.deepEqual(MAP_IDS, Object.keys(parentRoutes), 'the frozen parent covers all30 maps');
  for (const id of MAP_IDS) {
    const actualRoute = resolve(id, getMapConfig(id).props);
    assert.equal(actualRoute, id === 'foundry' ? 'ironworks' : parentRoutes[id], `${id}: explicit routing`);
    for (const bucket of buckets) {
      const prior = parentPalettes[parentRoutes[id]]?.[bucket] ?? null;
      const expected = id === 'foundry' && bucket === 'stone' ? experiment : prior;
      assert.deepEqual(lookup(actualRoute, bucket), expected, `${id}/${bucket}: parent policy or sole masonry exception`);
    }
  }
}
function layer() {
  const result = {};
  for (const role of ['albedo', 'normal', 'surface']) {
    const texture = new CanvasTexture(createCanvas(1, 1));
    ownedTextures.push(texture);
    texture.colorSpace = role === 'albedo' ? SRGBColorSpace : NoColorSpace;
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.anisotropy = 4;
    let disposed = 0;
    texture.addEventListener('dispose', () => disposed++);
    result[role] = texture;
    result[`${role}Disposals`] = () => disposed;
  }
  return result;
}
function layers() { return Object.fromEntries(buckets.map(bucket => [bucket, layer()])); }
function backingBytes(items) {
  return [...new Set(items)].reduce((sum, canvas) => sum + pixels(canvas).byteLength, 0);
}

const url = new URL('./sourcedTextures.ts?selftest=foundry-masonry', import.meta.url).href;
const hooks = registerHooks({ load(loaded, context, next) {
  const result = next(loaded, context);
  return loaded === url ? { ...result, source: `${result.source}\nexport { composeSet, _compositeCache, _normalCache };\n` } : result;
} });
let api;
let hooksActive = true;
try {
  globalThis.window = { location: { search: `?tier=${tier}` }, localStorage: { getItem: () => null } };
  globalThis.document = { createElement(tag) { assert.equal(tag, 'canvas'); return createCanvas(1, 1); } };
  // The loader still invokes its real async plan/cache/swap; its controlled
  // source images are native canvases, not pixel-only Canvas2D replacements.
  globalThis.Image = function ControlledImage() {
    const canvas = createCanvas(2, 2);
    Object.defineProperty(canvas, 'src', { set(value) {
      requests.push(value);
      const role = value.includes('_Color') ? 'color' : value.includes('_NormalGL') ? 'normal'
        : value.includes('_Roughness') ? 'rough' : 'ao';
      canvas.getContext('2d').putImageData(new ImageData(inputs[role], 2, 2), 0, 0);
      queueMicrotask(() => canvas.onload());
    } });
    return canvas;
  };
  assert.equal(resolveDeviceTier(), tier);
  api = await import(url);
  hooks.deregister();
  hooksActive = false;
  const { resolveSourcedBuildingPalette: resolve, sourcedBuildingTintPolicy: lookup } = api;
  assertPolicies(resolve, lookup);
  assert.throws(() => assertPolicies((id, settings) => id === 'copper_mesa' ? 'ironworks' : resolve(id, settings), lookup),
    /copper_mesa/, 'the real inherited-palette hazard is an effective negative control');
  assert.throws(() => assertPolicies(resolve, (palette, bucket) => palette === 'ironworks' && bucket === 'roof'
    ? experiment : lookup(palette, bucket)), /foundry\/roof/, 'no collateral roof experiment');

  const controlCanvas = raster(control);
  for (const id of MAP_IDS) for (const bucket of buckets) {
    const policy = lookup(resolve(id, getMapConfig(id).props), bucket);
    const actual = api.composeAlbedo(controlCanvas, null, raster(inputs.rough), options(policy));
    const expected = id === 'foundry' && bucket === 'stone' ? experiment : parentPalettes[parentRoutes[id]]?.[bucket];
    assert.deepEqual(pixels(actual), oracle(control, expected), `${id}/${bucket}: actual Canvas pixels versus independent parent oracle`);
    assert.equal(pixels(actual).byteLength, control.byteLength);
  }

  const before = layers(), after = layers(), copper = layers();
  const bindings = Object.values(after).flatMap(item => [item.albedo, item.normal, item.surface]);
  assert.ok((await api.applySourcedBuildings(before, 'foundry')).every(row => row.applied && !row.failures.length));
  assert.ok((await api.applySourcedBuildings(after, 'foundry', getMapConfig('foundry').props)).every(row => row.applied && !row.failures.length));
  assert.ok((await api.applySourcedBuildings(copper, 'copper_mesa', getMapConfig('copper_mesa').props)).every(row => row.applied && !row.failures.length));
  for (const bucket of buckets) for (const role of ['albedo', 'normal', 'surface']) {
    const a = before[bucket][role], b = after[bucket][role];
    assert.equal(b, bindings[buckets.indexOf(bucket) * 3 + ['albedo', 'normal', 'surface'].indexOf(role)], 'swap preserves the texture object');
    assert.equal(after[bucket][`${role}Disposals`](), 1, 'exact existing dispose-before-swap lifecycle');
    assert.equal(pixels(a.image).byteLength, pixels(b.image).byteLength, 'equal actual RGBA backing byte counts');
    for (const property of ['colorSpace', 'wrapS', 'wrapT', 'anisotropy', 'minFilter', 'magFilter', 'generateMipmaps']) {
      assert.equal(b[property], a[property], `${bucket}/${role}: sampler descriptor unchanged`);
    }
    if (bucket === 'stone' && role === 'albedo') {
      assert.notDeepEqual(pixels(b.image), pixels(a.image), 'the actual stone swap changes pigment');
      assert.deepEqual(pixels(b.image), oracle(control, experiment), 'surface AO is not multiplied into building albedo');
    } else {
      assert.equal(b.image, a.image, `${bucket}/${role}: exact existing immutable canvas is reused`);
      assert.deepEqual(pixels(b.image), pixels(a.image));
    }
  }
  for (const bucket of ['plaster', 'roof', 'wood']) for (const role of ['albedo', 'normal', 'surface']) {
    assert.equal(copper[bucket][role].image, before[bucket][role].image, `Copper Mesa ${bucket}/${role}: unchanged loaded owner`);
  }
  assert.equal(copper.stone.albedoDisposals(), 0, 'palette inheritance never adds Copper Mesa a sourced stone bucket');
  assert.deepEqual(pixels(after.stone.normal.image), inputs.normal);
  assert.deepEqual([...pixels(after.stone.surface.image)], [255, 192, 0, 255, 192, 128, 0, 255, 64, 64, 0, 255, 0, 240, 0, 255]);
  const ownerImages = group => Object.values(group).flatMap(item => [item.albedo.image, item.normal.image, item.surface.image]);
  assert.equal(new Set(ownerImages(before)).size, 12);
  assert.equal(new Set(ownerImages(after)).size, 12);
  assert.equal(backingBytes(ownerImages(after)), backingBytes(ownerImages(before)), 'one world keeps the same12 raster owners/bytes');
  assert.ok(requests.every(path => path.startsWith('/textures/buildings/')), 'unchanged local building asset route');
  assert.equal(requests.filter(path => path.includes('Bricks097')).length, 4, 'one existing brick PBR set, no additional asset request');
  const repeat = layer();
  await api.applySourcedBuildings({ stone: repeat }, 'foundry', getMapConfig('foundry').props);
  assert.equal(repeat.albedo.image, after.stone.albedo.image, 'the new pigment retains exact rematch cache reuse');

  // Decode the shipped brick photograph using the native rasterizer. Keep this
  // separate from the controlled loader, so a source-image swap cannot silently
  // update the arithmetic oracle or turn the test into a synthetic-only proof.
  const photo = await loadImage(readFileSync(new URL('../../public/textures/buildings/Bricks097_1K-JPG_Color.jpg', import.meta.url)));
  const size = Math.min(photo.width, texSize(1024));
  const raw = createCanvas(size, size);
  raw.getContext('2d').drawImage(photo, 0, 0, size, size);
  const composed = api.composeAlbedo(photo, null, null, experiment);
  const actualPixels = pixels(composed);
  assert.deepEqual(actualPixels, oracle(pixels(raw), experiment), 'native JPEG→Canvas composition follows exact existing encoded-RGB arithmetic');
  assert.equal(actualPixels.byteLength, size * size * 4, `${tier}: existing texture-size budget`);
  assert.ok(actualPixels.every((value, index) => index % 4 !== 3 || value === 255), 'opaque alpha coverage unchanged');
  const priorControl = oracle(control, parentPalettes.foundry.stone), nextControl = oracle(control, experiment);
  assert.ok(nextControl[0] > nextControl[1] && nextControl[1] > nextControl[2], 'warm brick is retained');
  assert.ok(nextControl[0] - nextControl[2] < priorControl[0] - priorControl[2], 'the declared chroma contrast actually falls');
  assert.ok(nextControl[4] > nextControl[8] * 3, 'light mortar and dark cavities remain distinct');

  api._compositeCache.clear();
  const fixtureImages = Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, raster(value)]));
  for (let index = 0; index < 10; index++) {
    api.composeSet('brick', { ...fixtureImages, failures: [] }, { separateSurface: true, tint: [.50 + index * .03, .60, .55], desat: .2 });
    assert.ok(api._compositeCache.size <= 8 && api._normalCache.size <= 4, 'existing cache bounds remain exact');
  }
  assert.equal(api._compositeCache.size, 8);
  assert.equal(new Set([...api._compositeCache.values()].map(entry => entry.surface)).size, 1, 'pigments still share one immutable surface');
  assert.deepEqual(pixels(after.stone.surface.image), pixels(before.stone.surface.image), 'later pigments never mutate a live surface');
  console.log(`foundryMasonry: ${tier}, all30/120 policies, real Canvas/JPEG pixels, exact other buckets, texture ownership/cache PASS`);
} finally {
  if (hooksActive) hooks.deregister();
  for (const texture of ownedTextures) texture.dispose();
  api?._compositeCache.clear(); api?._normalCache.clear();
  for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
}
