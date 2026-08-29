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
  assert.ok(stats.objects >= 6, `${variant.architecture} needs a readable structural kit`);
  assert.ok(stats.triangles > 0 && stats.triangles < 10_000,
    `${variant.architecture} must stay a low-poly background shell`);
  signatures.add(stats.signature);
}
assert.equal(signatures.size, GARAGE_VARIANTS.length,
  'every battlefield choice must have a structurally distinct garage signature');
assert.equal(controller.stats().cached, GARAGE_VARIANTS.length);
controller.dispose();
assert.equal(scene.children.length, 0);

console.log('garageArchitecture.selftest: ok');
