import assert from 'node:assert/strict';
import {
  isMaterialTextureQualityUpgrade,
  materialTextureDimensions,
  normalizeMaterialTextureQuality,
} from './materials.js';

assert.deepEqual(materialTextureDimensions('low'), { albedo: 256, map: 128 });
assert.deepEqual(materialTextureDimensions('ai'), { albedo: 512, map: 256 });
assert.deepEqual(materialTextureDimensions('preview'), { albedo: 1024, map: 512 });
assert.deepEqual(materialTextureDimensions('high'), { albedo: 2048, map: 1024 });
assert.equal(normalizeMaterialTextureQuality('unknown'), 'high');

assert.equal(isMaterialTextureQualityUpgrade('low', 'ai'), true);
assert.equal(isMaterialTextureQualityUpgrade('ai', 'preview'), true);
assert.equal(isMaterialTextureQualityUpgrade('preview', 'high'), true);
assert.equal(isMaterialTextureQualityUpgrade('high', 'preview'), false);
assert.equal(isMaterialTextureQualityUpgrade('preview', 'preview'), false);

await import('./factoryCamo.selftest.mjs');

console.log('materialQuality.selftest: low, AI, preview, and hero texture tiers passed');
