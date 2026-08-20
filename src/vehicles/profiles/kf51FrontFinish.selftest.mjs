import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';

const tank = createTank('kf51', null, {
  proceduralOnly: true,
  geometryReceipt: true,
});
await Promise.resolve();

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

  assert.deepEqual(hullRig.userData.kf51Finish, {
    kf51HullTurretSeatBridge: 14,
    kf51GlacisShoulderBridge: 4,
    kf51DeckPaletteHardware: 3,
    kf51TurretRoofBridge: 1,
    kf51TurretLowerCollar: 2,
    kf51TrackShoulderL: 2,
    kf51TrackShoulderR: 2,
    kf51TurretCheekBaseArmor: 1,
    kf51TurretMidwallBaseArmor: 1,
    kf51LowerGlacisCamo: 1,
  }, 'KF51 structural finish receipt records every palette-aware shell');

  const frontArmorHit = (x, y) => new THREE.Raycaster(
    new THREE.Vector3(x, y, 4),
    new THREE.Vector3(0, 0, -1),
    0,
    10,
  ).intersectObject(hullRig, true).find((hit) => hit.object.name === 'hull');
  const lowerGlacis = frontArmorHit(0, 0.75);
  assert.ok(lowerGlacis?.point.z > 3.4 && lowerGlacis.object.material?.map,
    'KF51 lower glacis is colored by the merged camouflage armor');
  for (const x of [-1.45, 1.45]) {
    const shoulder = frontArmorHit(x, 1.0);
    assert.ok(shoulder?.point.z > 3.64 && shoulder.object.material?.map,
      `KF51 ${x < 0 ? 'left' : 'right'} track shoulder joins the front mudguard in camo`);
  }

  const sideArmorHit = (y, z) => new THREE.Raycaster(
    new THREE.Vector3(4, y, z),
    new THREE.Vector3(-1, 0, 0),
    0,
    10,
  ).intersectObject(tank.root, true)
    .find((hit) => hit.object.name === 'turret');
  assert.ok(sideArmorHit(1.84, 0)?.object.material?.map,
    'KF51 lower turret collar closes the former black hull gap in camouflage');
  assert.ok(sideArmorHit(1.96, 0)?.object.material?.map,
    'KF51 cheek base is palette-aware armor instead of a shadow rail');

  const mudguards = [];
  tank.root.traverse((object) => {
    if (object.isMesh && object.material?.name === 'cot:kf51-mudguard') mudguards.push(object);
  });
  assert.equal(mudguards.length, 4, 'KF51 keeps four palette-painted corner mudguards');
  for (const mudguard of mudguards) {
    assert.ok(mudguard.material.color.getHex() > 0x202020,
      'KF51 mudguards are no longer pure-black cards');
  }
} finally {
  tank.dispose();
}

console.log('kf51FrontFinish.selftest: brow closure and camo finish pass');
