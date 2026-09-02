import assert from 'node:assert/strict';
import {
  DEFAULT_GARAGE_VARIANT_ID,
  GARAGE_VARIANTS,
  GARAGE_VARIANT_STORAGE_KEY,
  getGarageVariant,
  loadGarageVariantId,
  saveGarageVariantId,
} from './garageVariants.ts';
import { getMapConfig } from '../world/maps/index.ts';

assert.equal(GARAGE_VARIANTS.length, 10, 'garage selector must expose exactly ten staging areas');
assert.equal(new Set(GARAGE_VARIANTS.map((variant) => variant.id)).size, 10, 'variant ids unique');
assert.equal(new Set(GARAGE_VARIANTS.map((variant) => variant.mapId)).size, 10, 'each staging area uses a distinct real battlefield');
assert.equal(new Set(GARAGE_VARIANTS.map((variant) => variant.layout)).size, 10, 'each workshop has a distinct assembly layout');
assert.equal(new Set(GARAGE_VARIANTS.map((variant) => variant.architecture)).size, 10,
  'each battlefield selection has a distinct staging vignette');
assert.equal(new Set(GARAGE_VARIANTS.map((variant) => variant.platformTint)).size, 10,
  'each staging area has a distinct turntable finish');
for (const variant of GARAGE_VARIANTS) {
  assert.match(variant.id, /^[a-z0-9_]+$/);
  assert.ok(variant.name && variant.location && variant.description);
  assert.equal(variant.location, getMapConfig(variant.mapId).name,
    `${variant.id} must display its actual battlefield name`);
  assert.ok(Number.isInteger(variant.accent) && Number.isInteger(variant.wallTint)
    && Number.isInteger(variant.platformTint));
}

const memory = new Map();
const storage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, value),
};
assert.equal(loadGarageVariantId(storage), DEFAULT_GARAGE_VARIANT_ID);
assert.equal(saveGarageVariantId('foundry_heavy_works', storage), 'foundry_heavy_works');
assert.equal(memory.get(GARAGE_VARIANT_STORAGE_KEY), 'foundry_heavy_works');
assert.equal(loadGarageVariantId(storage), 'foundry_heavy_works');
assert.equal(saveGarageVariantId('not-real', storage), DEFAULT_GARAGE_VARIANT_ID);
assert.equal(getGarageVariant('not-real').id, DEFAULT_GARAGE_VARIANT_ID);

console.log('garageVariants.selftest: ok');
