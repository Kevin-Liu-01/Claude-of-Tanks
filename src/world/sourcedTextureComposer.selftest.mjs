import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { composeAlbedoPixels, composeSurfacePixels } from './sourcedTextureComposer.ts';

// Independent frozen reference: production sourcedTextures.ts before sharing
// the kernel. Keep its arithmetic/order literal; never call the new kernel here.
function legacyAlbedo(d, aod, rgd, {
  roughInAlpha = false, roughMul = 1, tint = null, desat = 0, lift = 0,
} = {}) {
  const tr = tint ? tint[0] : 1, tg = tint ? tint[1] : 1, tb = tint ? tint[2] : 1;
  for (let i = 0; i < d.length; i += 4) {
    const a = aod ? aod[i] / 255 : 1;
    let r = d[i] * a * tr, g = d[i + 1] * a * tg, b = d[i + 2] * a * tb;
    if (desat > 0) {
      const lum = r * 0.299 + g * 0.587 + b * 0.114;
      r += (lum - r) * desat; g += (lum - g) * desat; b += (lum - b) * desat;
    }
    if (lift > 0) { r += lift * 255; g += lift * 255; b += lift * 255; }
    d[i] = Math.min(255, r);
    d[i + 1] = Math.min(255, g);
    d[i + 2] = Math.min(255, b);
    d[i + 3] = roughInAlpha
      ? Math.max(8, Math.min(255, (rgd ? rgd[i] : 230) * roughMul))
      : 255;
  }
}

function legacySurface(d, aod, rgd, roughMul = 1) {
  for (let i = 0; i < d.length; i += 4) {
    d[i] = aod ? aod[i] : 255;
    d[i + 1] = Math.max(8, Math.min(255, (rgd ? rgd[i] : 230) * roughMul));
    d[i + 2] = 0;
    d[i + 3] = 255;
  }
}

// Read the actual current policy literals, without importing Three.js/DOM or
// accepting a favorable hand-picked subset of biome and building variants.
const source = readFileSync(new URL('./sourcedTextures.ts', import.meta.url), 'utf8');
function policy(start, end, expression) {
  const begin = source.indexOf(start), finish = source.indexOf(end, begin);
  assert.ok(begin >= 0 && finish > begin, `Policy fixture boundary: ${start}`);
  return runInNewContext(`${stripTypeScriptTypes(source.slice(begin, finish))}\n(${expression})`);
}
const terrain = policy('const TERRAIN_PLAN =', 'export type TerrainPaletteId', 'TERRAIN_PLAN');
const buildings = policy('const FOUNDRY_BUILDING_TINTS =', 'export type BuildingPaletteId', 'BUILDING_TINTS');
const options = [{}, { roughInAlpha: true }, { separateSurface: true },
  { separateSurface: true, roughInAlpha: true, roughMul: 1.3 },
  { roughInAlpha: true, roughMul: 0, tint: [0.5, 0.5, 0.5] },
  { roughInAlpha: true, roughMul: 4, tint: [4, 0, 2], desat: 1, lift: 1 }];
for (const layers of Object.values(terrain)) {
  for (const layer of Object.values(layers)) {
    if (layer === null) continue;
    const { set: _set, ...opts } = typeof layer === 'string' ? {} : layer;
    options.push({ roughInAlpha: true, ...opts });
  }
}
for (const buckets of Object.values(buildings)) {
  for (const value of Object.values(buckets)) {
    options.push({ separateSurface: true, ...(Array.isArray(value) ? { tint: value } : value) });
  }
}
assert.ok(Object.keys(terrain).length >= 16 && Object.keys(buildings).length >= 16,
  'all current authored palette groups participate');

// Every possible byte occurs in every input role, with independent channels;
// alpha is deliberately not opaque so alpha overwrite is also checked.
const color = new Uint8ClampedArray(256 * 4);
const ao = new Uint8ClampedArray(color.length), rough = new Uint8ClampedArray(color.length);
for (let i = 0; i < 256; i++) {
  color.set([i, (i * 73) % 256, 255 - i, (i * 19) % 256], i * 4);
  ao.set([(i * 17) % 256, 11, 29, 97], i * 4);
  rough.set([(i * 29) % 256, 230, 45, 3], i * 4);
}
const originalAO = ao.slice(), originalRough = rough.slice();
let comparisons = 0;
for (const opts of options) for (const aod of [null, ao]) for (const rgd of [null, rough]) {
  const expected = color.slice(), actual = color.slice();
  legacyAlbedo(expected, aod, opts.roughInAlpha ? rgd : null, opts);
  assert.equal(composeAlbedoPixels(actual, aod, rgd, opts), undefined);
  assert.deepEqual(actual, expected, `albedo ${JSON.stringify(opts)} AO=${!!aod} rough=${!!rgd}`);
  const expectedSurface = new Uint8ClampedArray(color.length), actualSurface = expectedSurface.slice();
  legacySurface(expectedSurface, aod, rgd, opts.roughMul);
  assert.equal(composeSurfacePixels(actualSurface, aod, rgd, opts.roughMul), undefined);
  assert.deepEqual(actualSurface, expectedSurface, 'full-byte independent surface formula');
  comparisons += 2;
}
assert.deepEqual(ao, originalAO, 'AO source remains immutable');
assert.deepEqual(rough, originalRough, 'roughness source remains immutable');
const rounded = new Uint8ClampedArray([1, 3, 5, 0, 255, 255, 255, 0]);
composeAlbedoPixels(rounded, null, null, { tint: [0.5, 0.5, 0.5], roughInAlpha: true, roughMul: 0 });
assert.deepEqual([...rounded], [0, 2, 2, 8, 128, 128, 128, 8], 'retain ToUint8Clamp ties-to-even and roughness floor');
console.log(`sourcedTextureComposer.selftest: PASS ${comparisons} full-byte comparisons across ${options.length} policies`);
