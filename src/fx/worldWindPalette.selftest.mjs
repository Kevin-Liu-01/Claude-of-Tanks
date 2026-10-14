// (EF.12, MASTER 94) one world wind for the presentation (the media and the pooled columns), and the earth dust in the
// map's own ground colour.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { worldWind, refreshWorldWind, groundWindFromAloft } from './worldWind.ts';
import { surfaceLook, setMapGroundAlbedo, mapTintHex, MAP_DUST_SHARE } from './mapPalette.ts';
import { SURFACE_LOOKS, linearHex } from './surfaceLooks.ts';

// the wind: a published surface wind wins, else the clouds' wind brought down, else the fixed lean
refreshWorldWind({ surfaceWind: { x: -2, z: 1 } });
assert.deepEqual([worldWind.x, worldWind.z], [-2, 1]);
refreshWorldWind({ volumetricClouds: { currentPreset: { windDirRad: Math.PI / 2, windSpeed: 6 } } });
assert.ok(Math.abs(worldWind.x) < 1e-9 && Math.abs(worldWind.z - groundWindFromAloft(6)) < 1e-9, 'the clouds\' wind, brought down');
assert.ok(Math.abs(groundWindFromAloft(6) - 2.4) < 1e-9); assert.equal(groundWindFromAloft(30), 4.5); assert.equal(groundWindFromAloft(1), 1.2);
refreshWorldWind(null);
assert.deepEqual([worldWind.x, worldWind.z], [1.6, 0.55], 'the fixed lean');
assert.ok(Math.abs(1.6 * 0.515 - 0.82) < 0.01 && Math.abs(0.55 * 0.515 - 0.28) < 0.01, "the columns' share keeps their old lean on the fixed wind");
const fx = await readFile(new URL('./effects.ts', import.meta.url), 'utf8');
assert.match(fx, /COLUMN_WIND_X = worldWind\.x \* COLUMN_WIND_SHARE; COLUMN_WIND_Z = worldWind\.z \* COLUMN_WIND_SHARE;/, 'the columns follow it every frame');
const media = await readFile(new URL('./volumeMedia.ts', import.meta.url), 'utf8');
assert.match(media, /refreshWorldWind\(ud\);\s*uWind\.value\.set\(worldWind\.x, 0, worldWind\.z\);/, 'the media drift on the same wind');

// the palette: none set -> the tables; a red badland's ground reddens the soil dust at its own luminance; snow keeps its own
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
assert.equal(surfaceLook('soil'), SURFACE_LOOKS.soil, 'the table before any map');
assert.equal(mapTintHex(0xa8a189), 0xa8a189, 'the dry table before any map');
assert.equal(setMapGroundAlbedo(linearHex(0xaa8161)), true);
assert.equal(setMapGroundAlbedo(linearHex(0xaa8161)), false, 'an unchanged ground changes nothing');
const soil = surfaceLook('soil').dust, base = SURFACE_LOOKS.soil.dust;
assert.ok(soil[0] / soil[1] > base[0] / base[1] + 0.05, `soil dust reddens (${(soil[0] / soil[1]).toFixed(2)} vs ${(base[0] / base[1]).toFixed(2)})`);
assert.ok(Math.abs(lum(soil) - lum(base)) < 0.02 * lum(base) + 1e-3, 'at its own luminance');
assert.equal(surfaceLook('snow'), SURFACE_LOOKS.snow, 'snow keeps its own');
assert.ok(MAP_DUST_SHARE.sand < MAP_DUST_SHARE.soil, 'sand takes a lighter share');
const tinted = mapTintHex(0xa8a189);
assert.ok(((tinted >> 16) & 255) - ((tinted >> 8) & 255) > (0xa8 - 0xa1) + 4, 'the dry wake reddens too');
// a grey basalt map greys the soil
setMapGroundAlbedo(linearHex(0x4b4845));
const grey = surfaceLook('soil').dust;
assert.ok(Math.abs(grey[0] / grey[2] - 1) < Math.abs(base[0] / base[2] - 1), 'over basalt the soil dust greys');
setMapGroundAlbedo(null);
assert.equal(surfaceLook('soil'), SURFACE_LOOKS.soil, 'no ground: the tables again');
const recipes = await readFile(new URL('./blastRecipes.ts', import.meta.url), 'utf8');
assert.doesNotMatch(recipes, /SURFACE_LOOKS\[/, 'the recipes read the map-tinted looks');
assert.match(fx, /setMapGroundAlbedo\(\(engineCtx\.scene\?\.userData\?\.lightModel/, "the map's ground is read every frame");
console.log('worldWindPalette: one wind for media and columns; earth dust in the map\'s ground colour — ok');
