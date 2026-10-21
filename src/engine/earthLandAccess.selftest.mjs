// earthLandAccess.selftest.mjs — the lunar Earth's land mask loads with the world that draws it (the 228 entry diet,
// 2026-10-18; integ/228's bundle budget: game.entryRaw 819,657 over 818,369, the Earthrise rebuild's sky in the entry).
// Pinned without a GPU:
// - only a sky that draws the Earth (SkyPreset.earth over 0.5, the shader's own test) asks for the mask: the Moon alone;
// - the loader resolves once to the very module sky.ts used to import statically, and the raster it hands back is that
//   module's own cached texture (built on the first call, the same bytes), null before the load;
// - the world build awaits the load before the world exists (map.ts createMapAsync), so every sky applied on a built
//   world finds it loaded; sky.ts binds the placeholder (and the raster once it arrives) only for a sky applied without
//   that build, and never imports the mask statically (tools/boot-static-closure.selftest.mjs keeps it out of the boot).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadEarthLand, loadedEarthLandTexture, skyDrawsEarth } from './earthLandAccess.ts';
import { getMapConfig, MAP_IDS } from '../world/maps/index.ts';
import { runtimeImportSpecifiers } from '../../tools/static-import-closure.mjs';

const here = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');

// ---- which skies draw the Earth
for (const [sky, draws] of [[null, false], [undefined, false], [{}, false], [{ earth: 0 }, false], [{ earth: 0.5 }, false],
  [{ earth: null }, false], [{ earth: 0.51 }, true], [{ earth: 1 }, true]]) {
  assert.equal(skyDrawsEarth(sky), draws, `skyDrawsEarth(${JSON.stringify(sky)})`);
}
const drawing = MAP_IDS.filter((id) => skyDrawsEarth(getMapConfig(id).sky));
assert.deepEqual(drawing, ['moon'], 'the Moon is the one map whose sky draws the Earth (its world loads the mask)');

// ---- the loader
assert.equal(loadedEarthLandTexture(), null, 'no raster before the module has loaded');
const first = loadEarthLand();
assert.equal(loadEarthLand(), first, 'one load per page');
const mask = await first;
const direct = await import('./earthLandMask.ts');
assert.equal(mask, direct, 'the loader resolves to the land mask module itself');
const texture = loadedEarthLandTexture();
assert.ok(texture, 'loaded, the raster is synchronous');
assert.equal(texture, direct.earthLandTexture(), 'the module\'s own cached texture: built once, on the first call');
assert.equal(loadedEarthLandTexture(), texture, 'and kept');
assert.equal(texture.image.width, 1024);
assert.equal(texture.image.height, 512);

// ---- the seams: sky.ts never imports the mask statically; the world build awaits it before the world exists
const sky = here('./sky.ts');
assert.ok(!runtimeImportSpecifiers(sky, 'sky.ts').some((spec) => /earthLandMask/.test(spec)),
  'sky.ts holds no static import of earthLandMask.ts (the entry chunk would take its coastlines back)');
assert.match(sky, /if \(preset\.earth > 0\.5\) u\.uEarthLand\.value = earthLandTexture\(u\);/,
  'the dome binds the land mask only where it draws the Earth');
assert.match(sky, /const land = loadedEarthLandTexture\(\);\s*if \(land\) return land;/, 'loaded, the raster as before');
assert.match(sky, /if \(u\.uEarth\.value > 0\.5\) u\.uEarthLand\.value = loadedEarthLandTexture\(\);[\s\S]{0,80}return EARTH_LAND_PLACEHOLDER;/,
  'unloaded, the placeholder until the module arrives, then the raster (while the sky still draws the Earth)');
const map = here('../world/map.ts');
const build = map.slice(map.indexOf('export async function createMapAsync('));
const started = build.indexOf('const earthLandReady = skyDrawsEarth(');
const awaited = build.indexOf('if (earthLandReady) await earthLandReady;');
const assembled = build.indexOf('const world = assembleWorld(');
assert.ok(started > 0 && started < build.indexOf("await step('Surveying terrain'"), 'the load starts with the build, beside the terrain');
assert.ok(awaited > started && awaited < assembled, 'and is awaited before the world is assembled');

console.log('earthLandAccess.selftest: the Moon\'s land mask loads with its world (1024 x 512, one module, one raster)');
