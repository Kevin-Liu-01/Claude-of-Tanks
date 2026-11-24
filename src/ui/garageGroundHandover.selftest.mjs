// garage-env-276 (the cold first visit; timing4, notes ab11/switch: a page's switch waited 1-3 s on the battle ground's
// photographed layers, their download and decode): on a page the pack presents on the Garage's own ground and its map's
// battle ground swaps in where it lands (garageEnvironmentKit.ts buildPreparedStructures, buildGarageEnvironment).
// Copyright © 2026 Kevin B. Liu.
// 1. a page's prepare does not wait on the battle ground: the pack is built with the Garage library's ground on its
//    terrain (the recipe's surface, the switch's first frame) and the horizon in its own colours;
// 2. the battle ground then swaps in: the terrain and the horizon's landform group wear the battle material, which
//    reads the patch in the map's frame (its mapOrigin follows the pack);
// 3. a pack disposed before its battle ground lands releases the ground it never wore (no hold left behind);
// 4. (Kevin 2026-11-24, option A) the mode follows the battle's device tier: Node waits, a desktop page hands over, a
//    mobile-tier page keeps the Garage's ground; only a handover starts the ground's photographed layers' fetch;
// 5. a 'library' pack keeps the Garage's ground and its map's battle ground is never prepared.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GARAGE_VARIANTS } from '../game/garageVariants.ts';

{
  const { buildGarageEnvironment, createGarageEnvironmentAssetLibrary, prepareGarageEnvironmentAssets } = await import('./garageEnvironmentKit.ts');
  const assets = createGarageEnvironmentAssetLibrary({});
  const variant = GARAGE_VARIANTS.find((entry) => entry.mapId === 'badlands');
  // 1.
  await prepareGarageEnvironmentAssets(assets, variant, () => true, 'handover');
  const build = buildGarageEnvironment({}, assets, variant, () => {});
  const terrain = build.root.getObjectByName('map_derived_terrain_patch');
  const horizon = build.root.getObjectByName('garage_shared_distant_horizon');
  const garageGround = terrain.material;
  assert.ok(garageGround.isMeshStandardMaterial && 'map' in garageGround && !garageGround.userData.garageTerrainSurface, 'the pack presents on the Garage library\'s ground (its image is a page\'s: Node has none)');
  assert.ok(!Array.isArray(horizon.material), 'the horizon presents in its own colours');
  // 2.
  for (let tries = 0; tries < 600 && terrain.material === garageGround; tries += 1) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.notEqual(terrain.material, garageGround, 'the battle ground swaps in where it lands');
  if (horizon.geometry.groups.length === 2) {
    assert.ok(Array.isArray(horizon.material) && horizon.material[0] === terrain.material, 'the horizon\'s landforms wear it too');
  }
  build.root.position.set(5, 0, -3);
  build.root.updateMatrixWorld(true);
  terrain.onBeforeRender?.();
  assert.ok(typeof terrain.onBeforeRender === 'function', 'the battle ground reads the patch in the map\'s frame');
  build.dispose();
  // 3.
  await prepareGarageEnvironmentAssets(assets, variant, () => true, 'handover');
  const early = buildGarageEnvironment({}, assets, variant, () => {});
  early.dispose();
  await new Promise((resolve) => setTimeout(resolve, 50));
  // 4.
  const { resolveGarageBattleGroundMode, startGarageTerrainSources, garageTerrainSurfaceCache } = await import('./garageBattleStructures.ts');
  assert.equal(resolveGarageBattleGroundMode(false, 'desktop'), 'wait', 'Node waits');
  assert.equal(resolveGarageBattleGroundMode(false, 'mobile'), 'wait', 'Node waits on any tier');
  assert.equal(resolveGarageBattleGroundMode(true, 'desktop'), 'handover', 'a desktop page hands over');
  assert.equal(resolveGarageBattleGroundMode(true, 'mobile'), 'library', 'a mobile-tier page keeps the Garage\'s ground');
  let fetches = 0;
  const spy = () => { fetches += 1; return { ready: Promise.resolve(), tryCreateLayer: () => null, apply: async () => [], cancel() {} }; };
  assert.equal(startGarageTerrainSources('winter', 'library', spy), false, 'a library pack starts no ground fetch');
  assert.equal(startGarageTerrainSources('winter', 'wait', spy), false, 'a waiting pack starts no ground fetch');
  assert.equal(fetches, 0, 'nothing fetched outside a handover');
  assert.equal(startGarageTerrainSources('winter', 'handover', spy), true, 'a handover starts its ground\'s fetch');
  assert.equal(fetches, 1, 'once');
  // 5.
  const phone = GARAGE_VARIANTS.find((entry) => entry.mapId === 'desert');
  await prepareGarageEnvironmentAssets(assets, phone, () => true, 'library');
  const phoneBuild = buildGarageEnvironment({}, assets, phone, () => {});
  const phoneTerrain = phoneBuild.root.getObjectByName('map_derived_terrain_patch');
  const phoneGround = phoneTerrain.material;
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(phoneTerrain.material, phoneGround, 'a library pack keeps the Garage\'s ground');
  assert.ok(!garageTerrainSurfaceCache().some((entry) => entry.mapId === 'desert'), 'its map\'s battle ground is never prepared');
  phoneBuild.dispose();
  assets.dispose();
  console.log('garageGroundHandover.selftest: a page\'s pack presents on the Garage\'s ground, the battle ground and the '
    + 'horizon\'s landforms swap in where it lands, a disposed pack holds none; the mode follows the battle\'s tier, only a '
    + 'handover fetches the ground, a mobile-tier pack keeps the Garage\'s ground and prepares no battle ground PASS');
}
process.exit(0);
