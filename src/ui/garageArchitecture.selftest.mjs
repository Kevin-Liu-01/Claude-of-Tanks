import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GARAGE_VARIANTS } from '../game/garageVariants.ts';
import { createGarageArchitectureController } from './garageArchitecture.ts';
import { GARAGE_WRECK_ASSET } from './garageWreckGeometry.generated.ts';

const kitSource = await readFile(new URL('./garageEnvironmentKit.ts', import.meta.url), 'utf8');
const facilitySource = await readFile(new URL('./garageFacilityDetails.ts', import.meta.url), 'utf8');
const recipeSource = await readFile(new URL('./garageEnvironmentRecipes.ts', import.meta.url), 'utf8');
const stageSource = await readFile(new URL('./garageStage.ts', import.meta.url), 'utf8');
assert.doesNotMatch(`${kitSource}\n${recipeSource}`,
  /\b(createWorld|createMap|createVegetation|createProps)\s*\(|heightField\.update|from ['"]\.\.\/world\/terrain|fleetFactory|tankFactory|world\/wrecks/i,
  'Garage packs may reuse renderer assets, never battlefield runtime services');
assert.match(kitSource, /garageTerrainPatches\.generated\.ts/,
  'Garage terrain must use build-time battlefield excerpts');
assert.match(kitSource, /garageWreckGeometry\.generated\.ts/,
  'Garage wrecks must use a build-time first-party proxy instead of a fleet runtime');
assert.match(recipeSource, /world\/maps\/(structureKit|railKit|villageKit|urbanKit)/,
  'Garage recipes must use the real connected map structure builders');
assert.match(facilitySource, /createWorkshopPartLibrary/,
  'outdoor facilities must reuse the first-party workshop part vocabulary');
assert.doesNotMatch(facilitySource, /fleetFactory|tankFactory/,
  'baked service vehicles must not import the playable fleet into Garage boot');
assert.match(stageSource, /light\.visible = true;[\s\S]*light\.intensity = isVerdant/,
  'Verdant fixtures must preserve a stable light count across environment switches');
assert.match(stageSource, /garage_outdoor_shader_seed/,
  'Verdant boot must seed the shared outdoor PBR/CSM program under cover');
assert.equal(GARAGE_WRECK_ASSET.sourceSpecId, 'm1a2');
assert.ok(GARAGE_WRECK_ASSET.sourceTriangles > 30_000,
  'the tiny Garage wreck proxy must originate from a complete first-party vehicle');
assert.ok(GARAGE_WRECK_ASSET.triangles > 100 && GARAGE_WRECK_ASSET.triangles < 500,
  'the generated Garage wreck silhouette must remain deliberately tiny');

const scene = new THREE.Group();
const controller = createGarageArchitectureController({}, scene);
const signatures = new Set();
let maxBuildMs = 0;
let maxColdTransactionMs = 0;
for (const variant of GARAGE_VARIANTS) {
  const startedAt = performance.now();
  controller.setVariant(variant);
  const stats = await controller.whenReady();
  maxColdTransactionMs = Math.max(maxColdTransactionMs, performance.now() - startedAt);
  maxBuildMs = Math.max(maxBuildMs, stats.lastBuildMs);
  assert.equal(stats.key, variant.architecture);
  assert.equal(stats.mapId, variant.mapId);
  if (variant.id === 'verdant_motor_pool') {
    assert.equal(stats.mode, 'verdant-workshop');
    assert.equal(stats.enclosingSurfaces, 4,
      'Verdant must keep its restored enclosed workshop shell');
    assert.equal(stats.source, 'verdant-workshop');
    assert.equal(stats.terrainVertices, 0,
      'Verdant must not allocate the replacement outdoor terrain pack');
    assert.equal(stats.facilityStations, 4);
    assert.equal(stats.cached, 1);
    signatures.add(stats.signature);
    continue;
  }
  assert.equal(stats.mode, 'garage-environment');
  assert.equal(stats.enclosingSurfaces, 0,
    `${variant.id} must remain an open Garage environment`);
  assert.equal(stats.source, 'authentic-garage-scene-pack');
  assert.ok(stats.objects >= 8 && stats.drawCalls <= 20,
    `${variant.id} must merge its scene into a bounded draw-call graph`);
  assert.ok(stats.triangles > 0 && stats.triangles <= 30_000,
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
  assert.equal(stats.backdropLayers, 3,
    `${variant.id} must close the view with three map-derived terrain bands`);
  assert.ok(stats.groundCover >= 48,
    `${variant.id} must retain bounded static biome ground cover`);
  assert.equal(stats.wrecks, 2,
    `${variant.id} must stage two first-party background wrecks`);
  assert.equal(stats.structures, 5,
    `${variant.id} must frame the hero with five connected map structures`);
  assert.ok(stats.facilityProps >= 100,
    `${variant.id} must distribute a complete service facility around the hero`);
  assert.equal(stats.facilityStations, 2,
    `${variant.id} must have two complete maintenance stations`);
  assert.ok(stats.looseParts >= 40,
    `${variant.id} must include workshop equipment and stocked spare parts`);
  assert.ok(stats.serviceVehicles >= 1,
    `${variant.id} must include at least one baked service vehicle or running assembly`);
  if (variant.architecture === 'rail_roundhouse') {
    assert.ok(stats.railSegments >= 120,
      'Cinder Junction must be a real rail facility with three complete roads');
  }
  assert.ok(stats.cached <= stats.cacheLimit && stats.cacheLimit === 2,
    `${variant.id} must obey the two-pack transition cache`);
  signatures.add(stats.signature);
}
assert.equal(signatures.size, GARAGE_VARIANTS.length,
  'every Garage choice must have a distinct environment signature');
assert.equal(controller.stats().cached, 2);
assert.ok(controller.stats().residentTextureSets <= 9,
  'PBR residency must remain bounded after visiting every environment');
assert.ok(maxBuildMs < 100,
  `headless environment geometry construction exceeded budget (${maxBuildMs.toFixed(1)} ms)`);
assert.ok(maxColdTransactionMs < 750,
  `cold asynchronous Garage module transaction exceeded budget (${maxColdTransactionMs.toFixed(1)} ms)`);
controller.dispose();
assert.equal(scene.children.length, 0);

console.log('garageArchitecture.selftest: ok');
