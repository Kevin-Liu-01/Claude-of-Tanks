import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

const tank = createTank('strv81', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});
const turret = tank.root.getObjectByName('turret');
assert.ok(turret?.geometry, 'Strv 81 merged turret armor exists');

const position = turret.geometry.getAttribute('position');
const vertices = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const near = (a, b, epsilon = 1e-5) => a.distanceToSquared(b) <= epsilon * epsilon;
const targetTriangle = (targets) => {
  for (let index = 0; index < position.count; index += 3) {
    for (let corner = 0; corner < 3; corner++) {
      vertices[corner].fromBufferAttribute(position, index + corner);
    }
    if (targets.every((target) => vertices.some((vertex) => near(vertex, target)))) return true;
  }
  return false;
};

const correctCastRoof = [
  new THREE.Vector3(-0.35, 0.31, 1.55),
  new THREE.Vector3(0.90, 0.50, 1.04),
  new THREE.Vector3(-0.90, 0.50, 1.04),
];
assert.ok(targetTriangle(correctCastRoof),
  'the original Centurion cast-roof triangle remains intact');

const rejectedPrismRoof = [
  new THREE.Vector3(-1.10, 0.24, 1.20),
  new THREE.Vector3(0.78, 0.81, 0.95),
  new THREE.Vector3(-0.78, 0.81, 0.95),
];
assert.equal(targetTriangle(rejectedPrismRoof), false,
  'the duplicate Strv loft cannot overlap the original cast roof');

tank.dispose?.();
console.log('strv81TurretClosure.selftest: donor casting retained without duplicate prism');
