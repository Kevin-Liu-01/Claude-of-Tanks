import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { assertTerrainMaskShaderContract } from './terrainMaskShaderTestOracle.mjs';
import { stampWorkedGroundMask } from './workedGroundMask.ts';
import { createHeightField, makeMaskTexture, mulberry32 } from './terrain.ts';
import { historicalMaskTexture } from './roadRutHistoryTestOracle.mjs';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { resolveDeviceTier } from '../engine/quality.ts';
import longleaf from './maps/longleaf.ts';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const originalLongleaf = '6a9160c1524c81c58d138e94963e6c3dc16773cf3c1febfc423db087ff839ca0';
const zeroNoise = { noise: () => 0 };
const rectangle = { boundary: [[-24, -24], [24, -24], [24, 24], [-24, 24]], feather: 8, strength: 1 };
function pixel(size, mapSize, x, z) {
  return (Math.floor((z + mapSize / 2) / mapSize * size) * size
    + Math.floor((x + mapSize / 2) / mapSize * size)) * 4;
}
function invariantChannels(before, after) {
  let changed = 0;
  for (let at = 0; at < before.length; at += 4) {
    for (let channel = 0; channel < 3; channel++) assert.equal(after[at + channel], before[at + channel]);
    assert.ok(after[at + 3] >= before[at + 3], 'existing settlement/shore wear cannot be erased');
    if (before[at] || before[at + 2]) assert.equal(after[at + 3], before[at + 3], 'all road/water pixels retain original alpha');
    if (after[at + 3] > before[at + 3]) changed++;
  }
  return changed;
}
function checkAnalyticRaster() {
  const size = 64, pixels = new Uint8ClampedArray(size * size * 4), buffer = pixels.buffer;
  pixels[pixel(size, 128, 0, 0)] = 255;
  pixels[pixel(size, 128, 4, 0) + 2] = 1;
  pixels[pixel(size, 128, 8, 0) + 3] = 252;
  const original = pixels.slice();
  stampWorkedGroundMask(pixels, size, 128, [rectangle], zeroNoise);
  assert.equal(pixels.buffer, buffer, 'stamp reuses the original allocation');
  assert.ok(invariantChannels(original, pixels) > 500);
  assert.equal(pixels[pixel(size, 128, 40, 0) + 3], 0, 'no soil beyond declared feather');
  assert.equal(pixels[pixel(size, 128, -40, 0) + 3], 0, 'no opposite-side wrapping');
  let previous = 255;
  for (let x = 14; x <= 38; x += 2) {
    const value = pixels[pixel(size, 128, x, 4) + 3];
    assert.ok(value <= previous, 'analytic straight edge fades continuously'); previous = value;
  }
  const once = pixels.slice();
  stampWorkedGroundMask(pixels, size, 128, [rectangle], zeroNoise);
  assert.deepEqual(pixels, once, 'repeat stamping cannot accumulate soil');
  stampWorkedGroundMask(pixels, size, 128, [], zeroNoise);
  assert.deepEqual(pixels, once, 'empty config is exact no-op');
  const reverse = new Uint8ClampedArray(pixels.length);
  const forward = new Uint8ClampedArray(pixels.length);
  stampWorkedGroundMask(reverse, size, 128, [{ ...rectangle, boundary: rectangle.boundary.toReversed() }], zeroNoise);
  stampWorkedGroundMask(forward, size, 128, [rectangle], zeroNoise);
  assert.deepEqual(reverse, forward, 'clockwise/counterclockwise winding agree');
}
function checkConcaveAndClipped() {
  const pixels = new Uint8ClampedArray(64 * 64 * 4);
  const concave = { ...rectangle, boundary: [[-60,-60], [36,-60], [36,-28], [-28,-28], [-28,36], [-60,36]] };
  stampWorkedGroundMask(pixels, 64, 128, [concave], zeroNoise);
  assert.ok(pixels[pixel(64,128,-40,0) + 3] > 200);
  assert.equal(pixels[pixel(64,128,0,0) + 3], 0, 'concave notch is not filled like a convex hull');
  assert.equal(pixels[pixel(64,128,60,0) + 3], 0, 'map-edge feather does not wrap');
}
function checkInvalid() {
  const pixels = new Uint8ClampedArray(64);
  assert.throws(() => stampWorkedGroundMask(pixels, 3, 16, [rectangle], zeroNoise), /valid RGBA/);
  assert.throws(() => stampWorkedGroundMask(pixels, 4, NaN, [rectangle], zeroNoise), /valid RGBA/);
  assert.throws(() => stampWorkedGroundMask(pixels, 4, 16, Array(5).fill(rectangle), zeroNoise), /four patches/);
  for (const change of [{ feather: 0 }, { strength: NaN }, { strength: 2 }, { boundary: [[0,0], [1,1]] }]) {
    assert.throws(() => stampWorkedGroundMask(pixels, 4, 16, [{ ...rectangle, ...change }], zeroNoise), /vertices/);
  }
  assert.throws(() => stampWorkedGroundMask(pixels, 4, 16,
    [{ ...rectangle, boundary: [[0,0],[1,NaN],[2,2]] }], zeroNoise), /finite/);
  assert.throws(() => stampWorkedGroundMask(pixels, 4, 16,
    [{ ...rectangle, boundary: [[0,0],[0,0],[2,2]] }], zeroNoise), /distinct/);
  const invalidSecond = [{ ...rectangle }, { ...rectangle, feather: 0 }];
  assert.throws(() => stampWorkedGroundMask(pixels, 4, 16, invalidSecond, zeroNoise));
  assert.ok(pixels.every(value => value === 0), 'all patches validate before any mutation');
}
function fieldPoint(field, x, z) {
  return [field.getHeightAt(x,z), ...field.getNormalAt(x,z).toArray(), field.getGroundType(x,z),
    field._roadDist(x,z), field.getWaterMaskAt(x,z), field._noVeg(x,z)];
}
function checkProduction(seed, size) {
  const control = { ...longleaf, terrain: { ...longleaf.terrain, workedGround: [] } };
  const beforeField = createHeightField(seed, control), field = createHeightField(seed, longleaf);
  const noise = () => new SimplexNoise({ random: mulberry32(3010) });
  const before = makeMaskTexture(noise(), beforeField._layout);
  const after = makeMaskTexture(noise(), field._layout);
  const repeat = makeMaskTexture(noise(), field._layout);
  try {
    assert.equal(after.image.width, size); assert.equal(after.image.height, size);
    assert.equal(after.image.data.byteLength, before.image.data.byteLength);
    assert.deepEqual(repeat.image.data, after.image.data, 'normal production bake is deterministic');
    for (const key of ['format','type','colorSpace','flipY','wrapS','wrapT','minFilter','magFilter','generateMipmaps','anisotropy']) {
      assert.equal(after[key], before[key], `no texture policy change: ${key}`);
    }
    if (seed === 1337 && size === 512) {
      const historical = historicalMaskTexture(noise(), beforeField._layout);
      try { assert.equal(hash(historical.image.data), originalLongleaf, 'independently preserved pre-change full RGBA'); }
      finally { historical.dispose(); }
    }
    const changed = invariantChannels(before.image.data, after.image.data), area = changed * (1024 / size) ** 2;
    assert.ok(area > 4000 && area < 45000, 'meaningful localized harvest, not blanket biome recoloring');
    for (let z = -496; z <= 496; z += 32) for (let x = -496; x <= 496; x += 32) {
      assert.deepEqual(fieldPoint(field,x,z), fieldPoint(beforeField,x,z), 'collision/slope/traction/vegetation queries remain exact');
    }
    for (const spawn of [field._layout.spawns.player, ...field._layout.spawns.enemies]) {
      for (const dx of [-24,0,24]) for (const dz of [-24,0,24]) {
        const at = pixel(size,1024,spawn.x + dx,spawn.z + dz);
        assert.equal(after.image.data[at + 3], before.image.data[at + 3], 'spawn margin untouched');
      }
    }
    for (const [x,z] of longleaf.props.loggingYard.clearcut) {
      const at = pixel(size,1024,x,z);
      if (!before.image.data[at] && !before.image.data[at + 2]) {
        assert.ok(after.image.data[at + 3] > 150,
          `existing timber station ${x},${z} belongs to worked ground (alpha ${after.image.data[at + 3]})`);
      }
    }
    return { seed, size, changedAreaM2: area, rgbaBytes: after.image.data.byteLength, hash: hash(after.image.data) };
  } finally { before.dispose(); after.dispose(); repeat.dispose(); }
}
checkAnalyticRaster(); checkConcaveAndClipped(); checkInvalid();
const receipts = [];
for (const seed of [1337,2025,7719]) receipts.push(checkProduction(seed,512));
const savedWindow = globalThis.window;
try {
  globalThis.window = { location: { search: '?tier=mobile' }, localStorage: { getItem: () => null } };
  resolveDeviceTier();
  for (const seed of [1337,2025,7719]) receipts.push(checkProduction(seed,256));
} finally {
  if (savedWindow === undefined) delete globalThis.window; else globalThis.window = savedWindow;
}
const source = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
// Historical full shader: d470ffa221c1ed9617c7794f0734932fb904beb1e204e1af6a10d1f415e14713.
// Projection/sand/worn-blend gates own later shader improvements independently;
// the historical mask controls above still feed the current A-channel path.
assertTerrainMaskShaderContract(source);
console.log(JSON.stringify({ test: 'workedGroundMask', scope: 'CPU production masks; no native/performance acceptance', receipts }));
