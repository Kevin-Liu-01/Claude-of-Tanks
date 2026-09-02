import assert from 'node:assert/strict';

import { GARAGE_VARIANTS } from './garageVariants.ts';
import { GARAGE_SKY_PRESETS, getGarageSkyPreset } from './garageSkyPresets.ts';

const MAP_MODULES = Object.freeze({
  verdant: '../world/maps/verdant.ts',
  desert: '../world/maps/desert.ts',
  winter: '../world/maps/winter.ts',
  urban: '../world/maps/urban.ts',
  coastal: '../world/maps/coastal.ts',
  railyard: '../world/maps/railyard.ts',
  monsoon: '../world/maps/monsoon.ts',
  alpine: '../world/maps/alpine.ts',
  badlands: '../world/maps/badlands.ts',
  foundry: '../world/maps/foundry.ts',
});

for (const variant of GARAGE_VARIANTS) {
  const modulePath = MAP_MODULES[variant.mapId];
  assert.ok(modulePath, `${variant.id} must name an audited Garage sky source`);
  const mapConfig = (await import(modulePath)).default;
  assert.deepEqual(
    getGarageSkyPreset(variant.mapId),
    mapConfig.sky,
    `${variant.id} must reuse the exact ${variant.mapId} battlefield atmosphere`,
  );
}

assert.equal(getGarageSkyPreset('unknown'), GARAGE_SKY_PRESETS.verdant,
  'unknown Garage map ids fall back to Verdant without loading a battlefield');

console.log('garageSkyPresets.selftest: 10 lightweight Garage skies match battlefield presets');
