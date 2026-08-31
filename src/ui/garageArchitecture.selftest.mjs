import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GARAGE_VARIANTS } from '../game/garageVariants.ts';
import { createGarageArchitectureController } from './garageArchitecture.ts';

const kitSource = await readFile(new URL('./garageEnvironmentKit.ts', import.meta.url), 'utf8');
const recipeSource = await readFile(new URL('./garageEnvironmentRecipes.ts', import.meta.url), 'utf8');
assert.doesNotMatch(`${kitSource}\n${recipeSource}`,
  /\b(createWorld|createMap|createVegetation|createProps)\s*\(|heightField\.update|from ['"]\.\.\/world\/terrain/i,
  'Garage packs may reuse renderer assets, never battlefield runtime services');
assert.match(kitSource, /garageTerrainPatches\.generated\.ts/,
  'Garage terrain must use build-time battlefield excerpts');
assert.match(recipeSource, /world\/maps\/(structureKit|railKit|villageKit|urbanKit)/,
  'Garage recipes must use the real connected map structure builders');

const scene = new THREE.Group();
const controller = createGarageArchitectureController({}, scene);
const signatures = new Set();
let maxBuildMs = 0;
for (const variant of GARAGE_VARIANTS) {
  const startedAt = performance.now();
  controller.setVariant(variant);
  const stats = await controller.whenReady();
  maxBuildMs = Math.max(maxBuildMs, performance.now() - startedAt);
  assert.equal(stats.key, variant.architecture);
  assert.equal(stats.mapId, variant.mapId);
  assert.equal(stats.mode, 'garage-environment');
  assert.equal(stats.enclosingSurfaces, 0,
    `${variant.id} must remain an open Garage environment`);
  assert.equal(stats.source, 'authentic-garage-scene-pack');
  assert.ok(stats.objects >= 8 && stats.drawCalls <= 20,
    `${variant.id} must merge its scene into a bounded draw-call graph`);
  assert.ok(stats.triangles > 0 && stats.triangles <= 350_000,
    `${variant.id} must stay inside the Garage environment geometry budget`);
  assert.equal(stats.terrainVertices, 41 * 37,
    `${variant.id} must use its compact battlefield-derived terrain excerpt`);
  assert.equal(stats.terrainSourceAnchor?.length, 2);
  assert.ok(stats.sourceStructure && stats.sourceBeat,
    `${variant.id} must identify its real landmark and presentation beat`);
  assert.ok(stats.terrainProfile.length > 24,
    `${variant.id} must identify the battlefield-derived terrain`);
  assert.ok(stats.serviceFrame.length > 16);
  assert.ok(stats.distinctiveElements.length >= 4);
  assert.ok(stats.landmarkHeightM >= 7);
  assert.equal(stats.sourceLandmarkLocal?.[1], stats.landmarkHeightM);
  assert.ok(stats.textureSets.length >= 6,
    `${variant.id} must use real PBR surface sets`);
  assert.ok(stats.treeSpecies.length >= 2 && stats.trees >= 5,
    `${variant.id} must use battlefield tree geometry`);
  assert.ok(stats.cached <= stats.cacheLimit && stats.cacheLimit === 2,
    `${variant.id} must obey the two-pack transition cache`);
  signatures.add(stats.signature);
}
assert.equal(signatures.size, GARAGE_VARIANTS.length,
  'every Garage choice must have a distinct environment signature');
assert.equal(controller.stats().cached, 2);
assert.ok(controller.stats().residentTextureSets <= 9,
  'PBR residency must remain bounded after visiting every environment');
assert.ok(maxBuildMs < 250,
  `headless environment construction exceeded transition budget (${maxBuildMs.toFixed(1)} ms)`);
controller.dispose();
assert.equal(scene.children.length, 0);

console.log('garageArchitecture.selftest: ok');
