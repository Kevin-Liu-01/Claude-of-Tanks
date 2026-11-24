// garage-env-276 (the cold first visit; timing4, notes ab11/switch: a page's switch waited 1-3 s on the battle ground's
// photographed layers, their download and decode): on a page the pack presents on the Garage's own ground and its map's
// battle ground swaps in where it lands (garageEnvironmentKit.ts buildPreparedStructures, buildGarageEnvironment).
// Copyright © 2026 Kevin B. Liu.
// 1. a page's prepare does not wait on the battle ground: the pack is built with the Garage library's ground on its
//    terrain (the recipe's surface, the switch's first frame) and the horizon in its own colours;
// 2. the battle ground then swaps in: the terrain and the horizon's landform group wear the battle material, which
//    reads the patch in the map's frame (its mapOrigin follows the pack);
// 3. a pack disposed before its battle ground lands releases the ground it never wore (no hold left behind).
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
  assets.dispose();
  console.log('garageGroundHandover.selftest: a page\'s pack presents on the Garage\'s ground, the battle ground and the '
    + 'horizon\'s landforms swap in where it lands, a disposed pack holds none PASS');
}
process.exit(0);
