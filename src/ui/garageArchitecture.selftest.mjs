import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GARAGE_VARIANTS } from '../game/garageVariants.ts';
import { createGarageArchitectureController } from './garageArchitecture.ts';

const scene = new THREE.Group();
const controller = createGarageArchitectureController({}, scene);
const signatures = new Set();
for (const variant of GARAGE_VARIANTS) {
  const stats = controller.setVariant(variant);
  assert.equal(stats.key, variant.architecture);
  assert.equal(stats.mapId, variant.mapId);
  assert.ok(stats.objects >= 6, `${variant.architecture} needs a readable staging shell`);
  assert.ok(stats.triangles > 0 && stats.triangles < 10_000,
    `${variant.architecture} synchronous shell must stay bounded`);
  if (variant.id === 'verdant_motor_pool') {
    assert.equal(stats.mode, 'verdant-workshop');
    assert.ok(stats.enclosingSurfaces > 0, 'Verdant preserves its original enclosed motor pool');
  } else {
    assert.equal(stats.mode, 'map-staging');
    assert.equal(stats.enclosingSurfaces, 0,
      `${variant.id} must remain an open battlefield staging area`);
  }
  signatures.add(stats.signature);
}
assert.equal(signatures.size, GARAGE_VARIANTS.length,
  'every battlefield choice must have a distinct staging signature');
assert.equal(controller.stats().cached, GARAGE_VARIANTS.length);
controller.dispose();
assert.equal(scene.children.length, 0);

console.log('garageArchitecture.selftest: ok');
