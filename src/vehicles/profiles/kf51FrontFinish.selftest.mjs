import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';

const tank = createTank('kf51', null, {
  proceduralOnly: true,
  geometryReceipt: true,
});

try {
  tank.root.updateMatrixWorld(true);
  const hullRig = tank.root.getObjectByName('rig_hull');
  const turret = tank.root.getObjectByName('turret');
  const turretDetail = tank.root.getObjectByName('turretDetail');
  assert.ok(hullRig && turret && turretDetail,
    'KF51 retains canonical hull, turret, and detail geometry');

  const frontHits = (mesh, y) => new THREE.Raycaster(
    new THREE.Vector3(0, y, 4),
    new THREE.Vector3(0, 0, -1),
    0,
    10,
  ).intersectObject(mesh, false);

  const browHit = frontHits(turret, 2.25)[0];
  assert.ok(browHit && browHit.point.z >= 2.14,
    `KF51 camouflaged brow cassette closes the square above the gun (${browHit?.point.z} m)`);
  assert.ok(frontHits(turret, 2.06)[0]?.point.z < 2.14,
    'KF51 brow cassette remains above the gun-shroud crown');

  // The upper-glacis surface must now be the merged camouflaged hull mesh,
  // rather than an unnamed, solid-tone comparison shell sitting above it.
  const topHullHit = (x, z) => new THREE.Raycaster(
    new THREE.Vector3(x, 4, z),
    new THREE.Vector3(0, -1, 0),
    0,
    10,
  ).intersectObject(hullRig, true)
    .find((hit) => hit.object.isMesh && hit.point.y < 1.7);
  for (const [x, z, label] of [
    [0, 3.0, 'main upper glacis'],
    [0, 2.4, 'former full-width front moat'],
    [1.6, 0, 'former wide turret-side moat'],
  ]) {
    assert.equal(topHullHit(x, z)?.object.name, 'hull',
      `KF51 ${label} exposes the palette-aware camouflaged armor mesh`);
  }

  // These exact side rays used to hit the two long turretDetail rails at
  // x=1.5025/1.4425. Structural returns now live in the camo turret bucket.
  for (const z of [0.95, -0.565]) {
    const detailHits = new THREE.Raycaster(
      new THREE.Vector3(3, 1.8835, z),
      new THREE.Vector3(-1, 0, 0),
      0,
      10,
    ).intersectObject(turretDetail, false);
    assert.equal(detailHits.length, 0,
      `KF51 turret-side armor return at z=${z} is no longer grey detail geometry`);
  }
} finally {
  tank.dispose();
}

console.log('kf51FrontFinish.selftest: brow closure and camo finish pass');
