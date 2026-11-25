import assert from 'node:assert/strict';
import * as THREE from 'three';

// Real Texture/Source ownership, controlled image IO and unchanged production
// composition. Native upload/pixel allocation proof has a separate browser gate.
class Canvas {
  width = 4;
  height = 4;
  pixels = new Uint8ClampedArray(64);
  getContext() {
    return {
      drawImage: image => { this.pixels = image.pixels.slice(); },
      getImageData: () => ({ data: this.pixels.slice() }),
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: image => { this.pixels = image.data.slice(); },
    };
  }
}
let imageRequests = 0;
class ImageFixture extends Canvas {
  set src(url) {
    imageRequests++;
    for (let i = 0; i < this.pixels.length; i++) this.pixels[i] = (i * 19 + url.length * 7) % 256;
    queueMicrotask(() => this.onload());
  }
}
const previous = Object.fromEntries(['window', 'document', 'Image'].map(key =>
  [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
Object.assign(globalThis, {
  window: {}, Image: ImageFixture,
  document: { createElement: () => new Canvas() },
});
const resources = [];
function texture() {
  const view = new THREE.CanvasTexture(new Canvas());
  view.wrapS = view.wrapT = THREE.RepeatWrapping;
  view.anisotropy = 4;
  view.offset.set(0.13, -0.27);
  view.repeat.set(2, 3);
  view.center.set(0.2, 0.4);
  view.rotation = 0.3;
  resources.push(view);
  return view;
}
const layer = () => ({ albedo: texture(), normal: texture(), surface: texture() });
const policy = view => ({
  mapping: view.mapping, channel: view.channel, wrapS: view.wrapS, wrapT: view.wrapT,
  magFilter: view.magFilter, minFilter: view.minFilter, anisotropy: view.anisotropy,
  format: view.format, type: view.type, colorSpace: view.colorSpace,
  generateMipmaps: view.generateMipmaps, premultiplyAlpha: view.premultiplyAlpha,
  flipY: view.flipY, unpackAlignment: view.unpackAlignment,
  offset: view.offset.toArray(), repeat: view.repeat.toArray(), center: view.center.toArray(),
  rotation: view.rotation, matrixAutoUpdate: view.matrixAutoUpdate,
});
try {
  const { applySourcedBuildings, applySourcedTerrain } = await import('./sourcedTextures.ts');
  const autumn = layer(), desert = layer();
  const original = Object.fromEntries(Object.entries(autumn).map(([key, value]) => [key, value.source]));
  const originalPolicies = Object.fromEntries(Object.entries(autumn).map(([key, value]) => [key, policy(value)]));
  const disposals = [];
  for (const [key, value] of Object.entries(autumn)) value.addEventListener('dispose', () => {
    disposals.push({ key, source: value.source });
  });
  await applySourcedBuildings({ wood: autumn }, 'autumn');
  const requestCount = imageRequests;
  await applySourcedBuildings({ wood: desert }, 'desert');
  assert.equal(imageRequests, requestCount, 'shared data adds no source requests');
  assert.equal(autumn.normal.image, desert.normal.image);
  assert.equal(autumn.surface.image, desert.surface.image);
  // This assertion is the unchanged f662 negative witness before implementation.
  assert.equal(autumn.normal.source, desert.normal.source,
    'building normal views must share the already-identical immutable canvas Source');
  assert.equal(autumn.surface.source, desert.surface.source);
  assert.notEqual(autumn.normal.source, autumn.surface.source, 'different data canvases never alias');
  assert.notEqual(autumn.albedo.source, desert.albedo.source, 'pigment views are outside sharing scope');
  assert.equal(autumn.albedo.source, original.albedo, 'ordinary albedo replacement path is unchanged');
  assert.notDeepEqual(autumn.albedo.image.pixels, desert.albedo.image.pixels);
  assert.deepEqual(disposals.map(({ key, source }) => [key, source]),
    ['albedo', 'surface', 'normal'].map(key => [key, original[key]]),
    'release the old GPU owner before replacing the data Source');
  for (const [key, value] of Object.entries(autumn)) assert.deepEqual(policy(value), originalPolicies[key]);
  for (const key of ['normal', 'surface']) for (const field of ['offset', 'repeat', 'center', 'matrix']) {
    assert.notEqual(autumn[key][field], desert[key][field], `independent ${key}/${field}`);
  }
  autumn.normal.offset.x = 0.75;
  assert.equal(desert.normal.offset.x, 0.13, 'UV mutation never reaches the sibling');

  const woodSources = [desert.normal.source, desert.surface.source];
  const woodPixels = woodSources.map(source => source.data.pixels.slice());
  // (building-tex-diet-278) another set (the plaster) replaces the timber Source; the roof tiles set is retired
  await applySourcedBuildings({ plaster: autumn }, 'autumn');
  for (const [index, key] of ['normal', 'surface'].entries()) {
    assert.notEqual(autumn[key].source, woodSources[index], 'new image replaces Source');
    assert.equal(desert[key].source, woodSources[index]);
    assert.deepEqual(desert[key].image.pixels, woodPixels[index], 'sibling data cannot change on replacement');
  }
  await applySourcedBuildings({ wood: autumn }, 'autumn');
  assert.equal(autumn.normal.source, woodSources[0], 'return to retained immutable data rejoins Source');
  assert.equal(autumn.surface.source, woodSources[1]);
  autumn.normal.dispose(); autumn.surface.dispose();
  assert.deepEqual(desert.normal.image.pixels, woodPixels[0]);
  await applySourcedBuildings({ wood: autumn }, 'autumn');
  assert.equal(autumn.normal.source, desert.normal.source, 'temporary disposal preserves reusable CPU ownership');

  const legacy = { G: layer(), D: layer() };
  const legacySources = [legacy.G.normal.source, legacy.D.normal.source];
  await applySourcedTerrain('desert', legacy);
  assert.equal(legacy.G.normal.image, legacy.D.normal.image, 'real terrain case reuses sand canvas');
  assert.equal(legacy.G.normal.source, legacySources[0]);
  assert.equal(legacy.D.normal.source, legacySources[1]);
  assert.notEqual(legacy.G.normal.source, legacy.D.normal.source, 'terrain source policy remains unchanged');

  const aborted = layer(), signal = new AbortController(); signal.abort();
  const beforeCancel = [aborted.normal.source, aborted.surface.source];
  const result = await applySourcedBuildings({ wood: aborted }, 'autumn', {}, { signal: signal.signal });
  assert.equal(result[0].applied, false);
  assert.deepEqual([aborted.normal.source, aborted.surface.source], beforeCancel,
    'canceled source consumption cannot install a shared owner');
  const { replaceSourcedBuildingDataImage } = await import('./sourcedBuildingDataSource.ts');
  const a = texture(), b = texture(), c = new Canvas();
  b.wrapS = THREE.ClampToEdgeWrapping; b.anisotropy = 1;
  const bPolicy = policy(b);
  replaceSourcedBuildingDataImage(a, c); replaceSourcedBuildingDataImage(b, c);
  assert.equal(a.source, b.source, 'sampler differences remain texture-view policy, not pixel identity');
  assert.deepEqual(policy(b), bPolicy);
  const originalSource = a.source;
  const fail = () => { throw 0; };
  a.addEventListener('dispose', fail);
  assert.throws(() => replaceSourcedBuildingDataImage(a, new Canvas()), error => error === 0);
  assert.equal(a.source, originalSource, 'failed old-owner release cannot publish a new source');
  a.removeEventListener('dispose', fail);
} finally {
  for (const view of resources) view.dispose();
  for (const [key, descriptor] of Object.entries(previous)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
}
console.log('sourcedBuildingDataSource.selftest: actual building Source sharing, replacement, UV/sampler/disposal, terrain exclusion and abort passed');
