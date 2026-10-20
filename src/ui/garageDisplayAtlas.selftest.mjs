// garage r9 display atlas receipt: the generator's check is green; every rect the kit names exists; rects are disjoint
// and inside the atlas; a swapped atlas reaches every display and decal material with no code change; the kit's signs
// never bake type in the browser.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GARAGE_VARIANTS } from '../game/garageVariants.ts';
import { GARAGE_DISPLAY_ATLAS_MANIFEST } from './garageDisplayAtlas.generated.ts';
import {
  createGarageDecalMaterial, createGarageDisplayMaterial, garageDisplayAtlasTestHooks, garageDisplayRect,
  garageDisplayRectNames, garageStillRectName,
} from './garageDisplayAtlas.ts';
import { buildGarageKitDressing, clearGarageKitCache } from './garageKitPlacement.ts';
import { GARAGE_KIT_PLACEMENTS } from './garageKitPlacements.ts';
import { analyzeModuleSource } from '../../tools/i18n-page-catalogs.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const check = spawnSync(process.execPath, ['tools/generate-garage-display-atlas.mjs', '--check'], { cwd: root, encoding: 'utf8' });
assert.equal(check.status, 0, `garage:atlas:check failed:\n${check.stdout}${check.stderr}`);

const manifest = GARAGE_DISPLAY_ATLAS_MANIFEST;
assert.ok(manifest.width <= 2048 && manifest.height <= 1024, 'the atlas stays 2048 x 1024 or smaller');
assert.ok(manifest.bytes.albedo <= 650_000, `the atlas file is ${manifest.bytes.albedo} B (limit 650 KB)`);
const rects = Object.entries(manifest.rects);
for (const [name, rect] of rects) {
  for (const key of ['u0', 'v0', 'u1', 'v1']) assert.ok(rect[key] >= 0 && rect[key] <= 1, `${name}.${key} inside the atlas`);
  assert.ok(rect.u1 > rect.u0 && rect.v1 > rect.v0, `${name} has area`);
}
for (let i = 0; i < rects.length; i += 1) {
  for (let j = i + 1; j < rects.length; j += 1) {
    const [ax, ay, aw, ah] = rects[i][1].px, [bx, by, bw, bh] = rects[j][1].px;
    assert.ok(ax + aw <= bx || bx + bw <= ax || ay + ah <= by || by + bh <= ay, `${rects[i][0]} and ${rects[j][0]} overlap`);
  }
}
// the minimum content: brand pieces, tank images, readouts, maps, nameboards and pictograms for every Garage
assert.ok(garageDisplayRectNames('brand').length >= 6, 'brand banners, crests, wordmarks and the stripe');
assert.ok(garageDisplayRectNames('still').length >= 8, 'eight or more battlefield stills');
assert.ok(garageDisplayRectNames('readout').length >= 4, 'readouts for the monitors');
assert.ok(garageDisplayRectNames('picto').length >= 15, 'the ISO-style pictograms');
for (const mapId of manifest.garages) {
  assert.ok(garageDisplayRect(`map.${mapId}`), `${mapId}: its map for the screens`);
  assert.ok(garageDisplayRect(`name.${mapId}`), `${mapId}: its nameboard`);
  assert.ok(garageDisplayRect(garageStillRectName(mapId)), `${mapId}: its own (or its sister map's) still`);
}
assert.deepEqual(new Set(manifest.garages), new Set(GARAGE_VARIANTS.map((variant) => variant.mapId)), 'the atlas covers the ten Garages');

// every rect name the kit sources name resolves (geometry references names, never pixels)
const kitFiles = (await readdir(new URL('.', import.meta.url))).filter((file) => /^garage(.*Kit.*|KitPlacements|VerdantKit)\.ts$/.test(file));
assert.ok(kitFiles.length >= 10, 'the kit modules are scanned');
const named = new Set();
for (const file of kitFiles) {
  const source = await readFile(new URL(`./${file}`, import.meta.url), 'utf8');
  for (const match of source.matchAll(/'((?:brand|media|map|readout|picto|num|glow|plate|decal|stencil|panel|name)\.[a-z0-9.]+)'/g)) named.add(match[1]);
  assert.doesNotMatch(source, /makeSignTexture|Monument|fillText/, `${file}: sign type comes from the atlas generator, never the browser`);
}
for (const name of named) assert.doesNotThrow(() => garageDisplayRect(name), `the kit names '${name}', which the atlas lacks`);

// the rect names never read as translation keys: a template opening on a group the catalog also uses as a namespace
// (`media.${id}`) makes the i18n page scan keep that whole namespace in the game's catalogs (the engineering critic,
// 2026-10-18: every media.* caption on the boot path, check:bundle over budget)
{
  const english = Object.keys(JSON.parse(await readFile(new URL('./i18nCatalog.en-US.json', import.meta.url), 'utf8')));
  for (const file of ['garageDisplayAtlas.ts', 'garageDisplayKit.ts', 'garageKitPlacement.ts', ...kitFiles]) {
    const source = await readFile(new URL(`./${file}`, import.meta.url), 'utf8');
    const scan = analyzeModuleSource(source, `src/ui/${file}`, { root, keys: english });
    assert.deepEqual(scan.patterns.map(String), [], `${file}: builds rect names the i18n scan reads as key patterns`);
    assert.deepEqual([...scan.prefixes], [], `${file}: names a key prefix`);
  }
}
assert.ok(named.size >= 30, `the kit uses ${named.size} atlas rects`);
assert.throws(() => garageDisplayRect('brand.nonexistent'), /no rect/);

// the swap test: a fixture atlas reaches every display and decal material of every placed Garage, no code change
const hooks = garageDisplayAtlasTestHooks();
hooks.reset();
const fixtureAlbedo = new THREE.DataTexture(new Uint8Array([255, 0, 255, 255]), 1, 1);
const fixtureEmissive = new THREE.DataTexture(new Uint8Array([0, 255, 0, 255]), 1, 1);
const display = createGarageDisplayMaterial();
const decal = createGarageDecalMaterial();
const before = [display.map, display.emissiveMap, decal.map];
const packMaterials = [];
for (const [architecture, placement] of Object.entries(GARAGE_KIT_PLACEMENTS)) {
  clearGarageKitCache();
  const variant = GARAGE_VARIANTS.find((v) => v.architecture === architecture);
  const kit = buildGarageKitDressing({ variant, placement, buckets: {}, groundAtWorld: () => 0 });
  packMaterials.push(...kit.materials.filter((material) => material.name === 'garage:display-lit' || material.name === 'garage:display-decal'));
}
assert.ok(packMaterials.length >= 2, 'the placed Garages carry display and decal materials');
hooks.inject(fixtureAlbedo, fixtureEmissive);
assert.ok(before.every((texture) => texture !== fixtureAlbedo && texture !== fixtureEmissive), 'placeholders before the atlas arrives');
assert.equal(display.map, fixtureAlbedo);
assert.equal(display.emissiveMap, fixtureEmissive);
assert.equal(decal.map, fixtureAlbedo);
for (const material of packMaterials) assert.equal(material.map, fixtureAlbedo, `${material.name}: follows the swapped atlas`);
// a material created after the atlas arrived starts on it
assert.equal(createGarageDisplayMaterial().map, fixtureAlbedo);
hooks.reset();
console.log(`garageDisplayAtlas.selftest: ${rects.length} rects, ${named.size} named by the kit, swap reaches ${packMaterials.length + 2} materials`);
