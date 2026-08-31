import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GARAGE_VARIANTS } from '../game/garageVariants.ts';
import { createGarageArchitectureController } from './garageArchitecture.ts';

const kitSource = await readFile(new URL('./garageEnvironmentKit.ts', import.meta.url), 'utf8');
assert.doesNotMatch(kitSource, /from ['"]\.\.\/world\//,
  'Garage environments must never import battlefield terrain or world services');
assert.doesNotMatch(kitSource, /getMapConfig|buildWorld|createTerrain|createVegetation/,
  'Garage environments must remain self-contained presentation vignettes');

const scene = new THREE.Group();
const controller = createGarageArchitectureController({}, scene);
const signatures = new Set();
for (const variant of GARAGE_VARIANTS) {
  const stats = controller.setVariant(variant);
  assert.equal(stats.key, variant.architecture);
  assert.equal(stats.mapId, variant.mapId);
  if (variant.id === 'verdant_motor_pool') {
    assert.equal(stats.mode, 'verdant-workshop');
    assert.ok(stats.enclosingSurfaces > 0, 'Verdant preserves its original enclosed motor pool');
    assert.ok(stats.objects >= 6 && stats.triangles > 0,
      'Verdant keeps its authored portal structure');
  } else {
    assert.equal(stats.mode, 'garage-environment');
    assert.equal(stats.enclosingSurfaces, 0,
      `${variant.id} must remain an open Garage environment`);
    assert.equal(stats.source, 'custom-garage-environment');
    assert.ok(stats.objects >= 5,
      `${variant.id} must build its authored static environment`);
    assert.ok(stats.triangles > 0 && stats.triangles <= 10_000,
      `${variant.id} must stay inside the Garage environment geometry budget`);
    assert.ok(stats.terrainVertices >= 625,
      `${variant.id} must own a small terrain surface`);
    assert.ok(stats.sourceStructure && stats.sourceBeat,
      `${variant.id} must identify its landmark and presentation beat`);
    assert.equal(typeof stats.terrainProfile, 'string');
    assert.ok(stats.terrainProfile.length > 12,
      `${variant.id} must describe its map-specific terrain profile`);
    assert.ok(stats.serviceFrame.length > 8,
      `${variant.id} must identify its service-frame composition`);
    assert.ok(stats.distinctiveElements.length >= 4,
      `${variant.id} must expose at least four recognizable visual cues`);
    assert.ok(stats.landmarkHeightM >= 7,
      `${variant.id} landmark must frame the hero tank at Garage scale`);
    assert.equal(stats.sourceLandmarkLocal?.[1], stats.landmarkHeightM);
  }
  signatures.add(stats.signature);
}
assert.equal(signatures.size, GARAGE_VARIANTS.length,
  'every Garage choice must have a distinct environment signature');
assert.equal(controller.stats().cached, GARAGE_VARIANTS.length);
controller.dispose();
assert.equal(scene.children.length, 0);

console.log('garageArchitecture.selftest: ok');
