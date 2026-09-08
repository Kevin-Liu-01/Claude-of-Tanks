import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const contextOptions = [];
const loadedImageUrls = [];
const loadedImages = new Map();

// Exercise actual private cache/applySet paths without adding runtime test APIs.
const sourcedUrl = new URL('./sourcedTextures.ts', import.meta.url).href;
const hooks = registerHooks({ load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  return url === sourcedUrl ? { ...result, source: `${result.source}\nexport { applySet, _compositeCache };\n` } : result;
} });

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
      createImageData(width, height) {
        return { data: new Uint8ClampedArray(width * height * 4) };
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

  set src(value) {
    loadedImageUrls.push(value);
    loadedImages.set(value, this);
    queueMicrotask(() => this.onload());
  }
}
globalThis.Image = TestImage;

const {
  applySourcedBuildings, applySourcedTerrain, composeAlbedo, composeSurface,
  sourcedBuildingTintPolicy, resolveSourcedTerrainPalette, resolveSourcedBuildingPalette,
  applySet, _compositeCache,
} = await import('./sourcedTextures.ts');
hooks.deregister();
const { MAP_IDS, getMapConfig } = await import('./maps/index.ts');
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

const surface = composeSurface(ao, rough, 2, 1.25);
assert.deepEqual([...surface.pixels], [
  128, 250, 0, 255, 255, 125, 0, 255,
  64, 62, 0, 255, 0, 255, 0, 255,
], 'building surface composer packs AO in red and roughness in green');
assert.equal(contextOptions.length, 3,
  'packed surface output reuses the one readback context and allocates one write-only canvas');

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

const buildingLayer = { albedo: texture(), normal: texture(), surface: texture() };
await applySourcedBuildings({ plaster: buildingLayer }, 'verdant');
assert.equal(buildingLayer.albedo.disposeCount, 1, 'building albedo swaps without baked-in AO');
assert.equal(buildingLayer.normal.disposeCount, 1, 'building normal swaps once');
assert.equal(buildingLayer.surface.disposeCount, 1,
  'building packed AO/roughness surface swaps once');

const ruinspiresLayers = {
  plaster: { albedo: texture(), normal: texture(), surface: texture() },
  roof: { albedo: texture(), normal: texture(), surface: texture() },
  wood: { albedo: texture(), normal: texture(), surface: texture() },
};
await applySourcedBuildings(ruinspiresLayers, 'ruinspires');
assert.equal(ruinspiresLayers.plaster.albedo.disposeCount, 1,
  'Ruinspires receives its smoke-muted sourced facade texture');
assert.equal(ruinspiresLayers.wood.albedo.disposeCount, 1,
  'Ruinspires receives its restrained sourced trim texture');
assert.equal(ruinspiresLayers.roof.albedo.disposeCount, 0,
  'Ruinspires preserves the authored procedural roof palette like Steinburg');
const facadeRgb = [...ruinspiresLayers.plaster.albedo.image.pixels]
  .filter((_, index) => index % 4 !== 3);
assert.ok(Math.max(...facadeRgb) < 192,
  'Ruinspires facade source cannot reintroduce near-white texture lines');

for (const mapId of ['urban', 'ruinspires', 'blackglass', 'skybridge', 'foundry', 'caldera']) {
  const policy = sourcedBuildingTintPolicy(mapId, 'plaster');
  assert.ok(policy, `${mapId}: sourced city plaster has a deliberate tint policy`);
  const tint = Array.isArray(policy) ? policy : policy.tint;
  assert.ok(tint && Math.max(...tint) - Math.min(...tint) >= 0.10,
    `${mapId}: sourced city plaster retains warm material color instead of neutral grey`);
  if (!Array.isArray(policy)) {
    assert.ok((policy.desat || 0) <= 0.45,
      `${mapId}: sourced city color is not erased by excessive desaturation`);
  }
}

const newMapPalettes = {
  polders: ['verdant', 'coastal'],
  copper_mesa: ['badlands', 'foundry'],
  airfield: ['railyard', 'railyard'],
  oasis: ['desert', 'desert'],
  whiteout: ['winter', 'winter'],
  orchard: ['verdant', 'orchard'],
  longleaf: ['verdant', 'frontier'],
  mangrove: ['monsoon', 'delta'],
  saltwind: ['coastal', 'coastal'],
  reservoir: ['frontier', 'frontier'],
};
assert.deepEqual(Object.keys(newMapPalettes), MAP_IDS.slice(20),
  'every new battlefield explicitly inherits its intended sourced palettes');
for (const [mapId, [terrainPalette, buildingPalette]] of Object.entries(newMapPalettes)) {
  const config = getMapConfig(mapId);
  assert.equal(config.splat.sourcedPalette, terrainPalette,
    `${mapId}: terrain palette is deliberate, not an unknown-id Verdant fallback`);
  assert.equal(config.props.sourcedPalette, buildingPalette,
    `${mapId}: building palette is deliberate, not untinted photo defaults`);
  assert.equal(resolveSourcedTerrainPalette(mapId, config.splat), terrainPalette);
  assert.equal(resolveSourcedBuildingPalette(mapId, config.props), buildingPalette);
}
for (const mapId of MAP_IDS.slice(0, 20)) {
  assert.equal(resolveSourcedTerrainPalette(mapId), MAP_IDS.indexOf(mapId) < 16 ? mapId : 'verdant',
    `${mapId}: legacy terrain routing remains unchanged`);
  assert.equal(resolveSourcedBuildingPalette(mapId), mapId,
    `${mapId}: legacy building palette remains unchanged`);
}

const freshLayer = () => ({ albedo: texture(), normal: texture() });
const volcanicLayers = { G: freshLayer(), D: freshLayer(), R: freshLayer() };
await applySourcedTerrain('caldera', volcanicLayers);
const volcanicPixels = {
  G: [30, 38, 43, 134, 23, 16, 13, 107, 138, 70, 37, 255, 11, 11, 12, 27],
  D: [26, 33, 39, 140, 20, 15, 13, 112, 112, 59, 34, 255, 11, 11, 11, 28],
  R: [31, 40, 49, 120, 23, 16, 13, 96, 143, 74, 42, 255, 11, 11, 12, 24],
};
for (const [key, expected] of Object.entries(volcanicPixels)) {
  assert.deepEqual([...volcanicLayers[key].albedo.image.pixels], expected,
    `${key}: the live terrain hookup applies Caldera's authored lift after AO/tint without lifting roughness`);
  assert.equal(volcanicLayers[key].albedo.image.width, 2,
    `${key}: the lift uses the existing composite rather than a larger texture`);
}
const volcanicRepeat = freshLayer();
await applySourcedTerrain('caldera', { G: volcanicRepeat });
assert.equal(volcanicRepeat.albedo.image, volcanicLayers.G.albedo.image,
  'lifted terrain composites retain the existing cache reuse contract');
const snowLayer = freshLayer();
await applySourcedTerrain('whiteout', { G: snowLayer }, getMapConfig('whiteout').splat);
assert.ok(loadedImageUrls.some((url) => url.includes('Snow010A_1K-JPG_Color.jpg')),
  'Whiteout physically loads the snow source, not summer grass');
const winterLayer = freshLayer();
await applySourcedTerrain('winter', { G: winterLayer });
assert.equal(snowLayer.albedo.image, winterLayer.albedo.image,
  'Whiteout reuses the existing snow composite with identical texture dimensions');
for (const mapId of ['oasis', 'copper_mesa']) {
  const layers = { G: freshLayer(), D: freshLayer(), R: freshLayer() };
  await applySourcedTerrain(mapId, layers, getMapConfig(mapId).splat);
  assert.equal(layers.G.albedo.disposeCount, 1, `${mapId}: sand replaces the base fallback`);
  assert.equal(layers.D.albedo.disposeCount, 1, `${mapId}: worn sand replaces the dirt fallback`);
  assert.equal(layers.R.albedo.disposeCount, 0,
    `${mapId}: the authored sandstone layer is not overwritten by grey sourced rock`);
}
assert.ok(loadedImageUrls.some((url) => url.includes('Ground093C_1K-JPG_Color.jpg')),
  'the two arid maps physically use the existing sand source');

const whiteoutRoof = freshLayer();
const whiteoutStone = freshLayer();
await applySourcedBuildings({ roof: whiteoutRoof, stone: whiteoutStone },
  'whiteout', getMapConfig('whiteout').props);
const winterRoof = freshLayer();
await applySourcedBuildings({ roof: winterRoof }, 'winter');
assert.equal(whiteoutRoof.albedo.image, winterRoof.albedo.image,
  'Whiteout roof tint inherits the existing desaturated winter frost composite');
assert.equal(whiteoutStone.albedo.disposeCount, 0,
  'building palette inheritance does not add a sourced bucket or enlarge a procedural texture');
const orchardRoof = { ...freshLayer(), surface: texture() };
const autumnRoof = { ...freshLayer(), surface: texture() };
await applySourcedBuildings({ roof: autumnRoof }, 'autumn');
await applySourcedBuildings({ roof: orchardRoof }, 'orchard', getMapConfig('orchard').props);
assert.deepEqual([...orchardRoof.albedo.image.pixels], [
  75, 78, 82, 255, 30, 29, 28, 255,
  89, 83, 80, 255, 18, 19, 19, 255,
], 'actual CPU compositor turns the controlled orange tile sample into restrained charcoal, without clipping');
assert.equal(orchardRoof.normal.image, autumnRoof.normal.image,
  'Orchard reuses the exact existing roof normal source rather than adding a sampler');
assert.deepEqual(orchardRoof.surface.image.pixels, autumnRoof.surface.image.pixels,
  'roof pigment does not modify the existing roughness/AO surface');
assert.notEqual(orchardRoof.albedo.image, autumnRoof.albedo.image,
  'Orchard still owns its distinct charcoal pigment canvas');
assert.equal(orchardRoof.surface.image, autumnRoof.surface.image,
  'Orchard and Autumn share the same immutable AO/roughness canvas, not duplicate bytes');
for (const name of ['albedo', 'normal', 'surface']) {
  assert.equal(orchardRoof[name].image.width, autumnRoof[name].image.width);
  assert.equal(orchardRoof[name].image.height, autumnRoof[name].image.height);
}
for (const bucket of ['plaster', 'wood']) assert.deepEqual(sourcedBuildingTintPolicy('orchard', bucket),
  sourcedBuildingTintPolicy('autumn', bucket), 'the Orchard-only change does not recolor its other building surfaces');
for (const [mapId, parent] of [['whiteout', 'winter'], ['oasis', 'desert'], ['copper_mesa', 'desert']]) {
  const vegetation = getMapConfig(mapId).vegetation;
  const parentVegetation = getMapConfig(parent).vegetation;
  assert.equal(vegetation.grassTexTone, parentVegetation.grassTexTone,
    `${mapId}: grass cards inherit the authored biome texture tone`);
  assert.equal(vegetation.tuftTone, parentVegetation.tuftTone,
    `${mapId}: grass instances inherit the authored biome tuft tone`);
}

const building = () => ({ ...freshLayer(), surface: texture() });
const backingBytes = canvases => [...new Set(canvases)].reduce((sum, c) => sum + c.pixels.byteLength, 0);
const cacheBytes = () => backingBytes([..._compositeCache.values()].flatMap(entry =>
  [entry.canvas, entry.surface].filter(Boolean)));
_compositeCache.clear();
const paletteRoofs = [];
for (const mapId of ['autumn', 'orchard', 'winter', 'railyard', 'blackglass', 'skybridge',
  'fjord', 'alpine', 'caldera', 'foundry']) {
  const roof = building();
  await applySourcedBuildings({ roof }, mapId);
  paletteRoofs.push(roof);
  assert.ok(_compositeCache.size <= 8, 'sharing never expands the existing eight-entry LRU');
  const priorDuplicateBytes = [..._compositeCache.values()].reduce((sum, entry) =>
    sum + entry.canvas.pixels.byteLength + (entry.surface?.pixels.byteLength ?? 0), 0);
  assert.ok(cacheBytes() <= priorDuplicateBytes,
    `${mapId}: cached unique pixel bytes cannot exceed prior per-composite surface duplication`);
}
assert.equal(_compositeCache.size, 8, 'ten distinct pigments still evict down to exactly eight composites');
assert.equal(new Set(paletteRoofs.map(roof => roof.surface.image)).size, 1,
  'the shared surface survives eviction only through remaining composite/live texture owners');
assert.equal(cacheBytes(), 9 * 2 * 2 * 4,
  'eight cached albedos plus one shared surface use 144 bytes rather than sixteen canvases / 256 bytes');
assert.equal(backingBytes(paletteRoofs.flatMap(roof => [roof.albedo.image, roof.surface.image])),
  11 * 2 * 2 * 4, 'ten live palette pairs retain eleven canvas backings, not twenty');
const stableSurface = paletteRoofs[0].surface.image;
const stablePixels = stableSurface.pixels.slice();
const rougher = building();
await applySet('roof', rougher, { roughMul: 1.5, tint: [0.9, 0.9, 0.9] });
assert.notEqual(rougher.surface.image, stableSurface, 'roughness multipliers never alias');
assert.notDeepEqual(rougher.surface.image.pixels, stablePixels, 'roughness separation changes actual green-channel bytes');
const rougherTint = building();
await applySet('roof', rougherTint, { roughMul: 1.5, desat: 0.4, lift: 0.1 });
assert.equal(rougherTint.surface.image, rougher.surface.image,
  'tint, desaturation and lift remain albedo-only identity dimensions');
const plasterSurface = building();
await applySet('plaster', plasterSurface, { roughMul: 1.5 });
assert.notEqual(plasterSurface.surface.image, rougher.surface.image,
  'different source sets never share even when controlled fixture pixels match');

// Change the actual cached image fixtures to a larger source, as a tier/size
// transition does; keep every RGBA pixel valid without involving a GPU.
for (const [url, fixture] of loadedImages) {
  if (!url.includes('RoofingTiles012A')) continue;
  const previous = fixture.pixels;
  fixture.width = fixture.height = 4;
  fixture.pixels = Uint8ClampedArray.from({ length: 4 * 4 * 4 }, (_, i) => previous[i % previous.length]);
}
const larger = building();
await applySet('roof', larger, { roughMul: 1.5 });
assert.equal(larger.surface.image.width, 4);
assert.equal(larger.surface.image.pixels.byteLength, 64);
assert.notEqual(larger.surface.image, rougher.surface.image, 'different output sizes never alias');
assert.deepEqual(stableSurface.pixels, stablePixels, 'later palettes, roughness and size changes never mutate shared pixels');

_compositeCache.clear();
const packedLayer = freshLayer();
await applySet('roof', packedLayer, { roughInAlpha: true, roughMul: 1.5 });
assert.equal([..._compositeCache.values()][0].surface, null,
  'terrain packed-alpha composition still creates no separate surface');
const separateLayer = building();
await applySet('roof', separateLayer, { roughMul: 1.5 });
assert.notEqual(separateLayer.albedo.image, packedLayer.albedo.image,
  'packed terrain and opaque building albedos retain separate cache identities');
assert.ok(packedLayer.albedo.image.pixels.some((value, i) => i % 4 === 3 && value < 255));
assert.ok(separateLayer.albedo.image.pixels.every((value, i) => i % 4 !== 3 || value === 255));

console.log('sourcedTextures.selftest: byte, readback, and async readiness contracts passed');
