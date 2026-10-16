import assert from 'node:assert/strict';

import { GARAGE_VARIANTS } from './garageVariants.ts';
import { GARAGE_SKY_PRESETS, GARAGE_SUN_TRIM, getGarageSkyPreset } from './garageSkyPresets.ts';

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
  // the Garage reuses the map's atmosphere exactly except the declared Garage sun trim (coordinator ruling 2026-10-15,
  // option A: per-yard sun elevation and azimuth for a three-quarter back light from the fixed Garage camera; the map
  // atmosphere stays map-true and is the sky lane's)
  const trim = GARAGE_SUN_TRIM[variant.mapId];
  const garageSky = getGarageSkyPreset(variant.mapId);
  assert.deepEqual(GARAGE_SKY_PRESETS[variant.mapId], mapConfig.sky,
    `${variant.id}'s Garage preset mirrors the exact ${variant.mapId} battlefield atmosphere`);
  assert.deepEqual(garageSky, trim ? { ...mapConfig.sky, ...trim } : mapConfig.sky,
    `${variant.id} must reuse the ${variant.mapId} battlefield atmosphere, trimmed only by the declared Garage sun`);
  assert.equal(getGarageSkyPreset(variant.mapId), garageSky, `${variant.id}'s trimmed sky is one stable object`);
}
// the trim table: every outdoor Garage, nothing but the sun's elevation and azimuth, elevation 28-38 degrees, an azimuth
// 55-65 degrees off the back-light axis (the camera sits at azimuth ~43 degrees from the hero, the back axis at ~223)
assert.deepEqual(Object.keys(GARAGE_SUN_TRIM).sort(),
  ['alpine', 'badlands', 'coastal', 'desert', 'foundry', 'monsoon', 'railyard', 'urban', 'winter'],
  'every outdoor Garage declares its sun; Verdant (indoors) does not');
assert.deepEqual(GARAGE_SUN_TRIM, {
  desert: { sunElevationDeg: 36, sunAzimuthDeg: 283 }, winter: { sunElevationDeg: 28, sunAzimuthDeg: 163 },
  urban: { sunElevationDeg: 34, sunAzimuthDeg: 283 }, coastal: { sunElevationDeg: 32, sunAzimuthDeg: 163 },
  railyard: { sunElevationDeg: 30, sunAzimuthDeg: 283 }, monsoon: { sunElevationDeg: 30, sunAzimuthDeg: 163 },
  alpine: { sunElevationDeg: 28, sunAzimuthDeg: 283 }, badlands: { sunElevationDeg: 32, sunAzimuthDeg: 163 },
  foundry: { sunElevationDeg: 30, sunAzimuthDeg: 283 },
}, 'the Garage sun trim is pinned per Garage');
for (const [mapId, trim] of Object.entries(GARAGE_SUN_TRIM)) {
  assert.deepEqual(Object.keys(trim).sort(), ['sunAzimuthDeg', 'sunElevationDeg'], `${mapId}: the trim touches the sun only`);
  assert.ok(trim.sunElevationDeg >= 28 && trim.sunElevationDeg <= 38, `${mapId}: the Garage sun stands 28-38 degrees high`);
  const offBack = Math.abs(((trim.sunAzimuthDeg - 223 + 540) % 360) - 180);
  assert.ok(offBack >= 55 && offBack <= 65, `${mapId}: the Garage sun is a three-quarter back light (${offBack} degrees off the back axis)`);
}

assert.equal(getGarageSkyPreset('unknown'), GARAGE_SKY_PRESETS.verdant,
  'unknown Garage map ids fall back to Verdant without loading a battlefield');

console.log('garageSkyPresets.selftest: 10 lightweight Garage skies match battlefield presets');
