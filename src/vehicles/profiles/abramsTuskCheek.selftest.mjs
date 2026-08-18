import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';

const tank = createTank('m1a2_tusk', null, {
  proceduralOnly: true,
  geometryReceipt: true,
});
const detail = tank.root.getObjectByName('turretDetail');
assert.ok(detail?.geometry, 'TUSK turret detail geometry exists');

const position = detail.geometry.getAttribute('position');
const normal = detail.geometry.getAttribute('normal');
const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();
const rightCheekFace = [];

for (let i = 0; i < position.count; i += 3) {
  a.fromBufferAttribute(position, i);
  b.fromBufferAttribute(position, i + 1);
  c.fromBufferAttribute(position, i + 2);
  const centroid = a.clone().add(b).add(c).multiplyScalar(1 / 3);
  const area = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
  const faceNormal = new THREE.Vector3().fromBufferAttribute(normal, i);
  if (centroid.x > 0.65 && centroid.z > 1.0 && area > 0.12
    && faceNormal.x > 0.4 && faceNormal.z > 0.4) {
    rightCheekFace.push({
      vertices: [a.clone(), b.clone(), c.clone()],
      normal: faceNormal,
    });
  }
}

assert.equal(rightCheekFace.length, 2,
  'right unified cheek exposes one closed two-triangle ERA face');
assert.ok(rightCheekFace[0].normal.distanceTo(rightCheekFace[1].normal) < 1e-6,
  'right ERA face shares one normal and cannot read as a protruding cheek triangle');
const xs = rightCheekFace.flatMap(({ vertices }) => vertices.map((v) => v.x));
assert.ok(Math.min(...xs) < 0.73 && Math.max(...xs) > 1.58,
  'right ERA face reaches from the gun throat to the outer shoulder');

tank.dispose();
console.log('abramsTuskCheek.selftest: right cheek ERA is continuous, seated, and smooth');
