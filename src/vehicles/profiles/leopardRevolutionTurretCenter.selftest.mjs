import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';

const tank = createTank('leo2_revolution', null, {
  proceduralOnly: true,
  geometryReceipt: true,
});

try {
  const turret = tank.root.getObjectByName('rig_turret');
  const gun = tank.root.getObjectByName('rig_gun');
  const recoil = tank.root.getObjectByName('rig_recoil');
  const muzzle = tank.root.getObjectByName('rig_muzzle');
  const bore = tank.root.getObjectByName('muzzleBoreShadowFallback');
  const gunMount = tank.root.getObjectByName('gunMount');
  const barrel = tank.root.getObjectByName('gun');
  const barrelDark = tank.root.getObjectByName('gunDark');

  assert.ok(turret, 'Leopard 2 Revolution rotating turret rig exists');
  assert.equal(turret.position.x, 0,
    'Leopard 2 Revolution turret remains centered laterally');
  assert.equal(turret.position.z, -0.50,
    'Leopard 2 Revolution complete turret sits 0.50 m aft of hull datum');
  assert.equal(gun?.parent, turret,
    'Leopard 2 Revolution gun remains owned by the translated turret rig');
  assert.equal(gun.position.z, 2.40,
    'Leopard 2 Revolution gun pitches at the visible mantlet trunnion');
  assert.ok(gunMount?.geometry && barrel?.geometry,
    'Leopard 2 Revolution keeps gun-owned mantlet and barrel geometry');
  assert.equal(bore?.parent, muzzle,
    'Leopard 2 Revolution bore fallback remains owned by its muzzle anchor');

  // The static slot face is centered at turret-local (0, .28, 2.60).  The
  // dark hole and armored ring are gun-owned at z=.205/.229 from the new
  // trunnion.  Their center must stay inside the slot throughout the legal
  // pitch sweep; the old deep pivot made the complete aperture orbit by more
  // than a metre through the turret face.
  const openingLocal = new THREE.Vector3(0, 0.28, 2.60);
  const apertureLocal = new THREE.Vector3(0, 0.03, 0.215);
  for (const pitchDeg of [-8, 0, 15]) {
    gun.rotation.x = -pitchDeg * Math.PI / 180;
    tank.root.updateMatrixWorld(true);
    const openingWorld = turret.localToWorld(openingLocal.clone());
    const apertureWorld = gun.localToWorld(apertureLocal.clone());
    assert.ok(apertureWorld.distanceTo(openingWorld) < 0.10,
      `mantlet ring and hole stay seated at ${pitchDeg} degrees`);
  }

  // Moving the pivot must not change the certified level-fire muzzle station.
  gun.rotation.x = 0;
  tank.root.updateMatrixWorld(true);
  const barrelBounds = new THREE.Box3().setFromObject(barrel);
  assert.ok(barrelBounds.max.z > 5.82 && barrelBounds.max.z < 5.85,
    'level-fire muzzle station remains unchanged');

  // The trunnion repair counter-shifts the physical tube by 1.05 m.  Its
  // firing datum must receive the same shift or the universal bore fallback
  // clamps 20 cm behind the stale datum and visibly floats past the cannon.
  const localFaceZ = Math.max(
    barrel.geometry.boundingBox?.max.z ?? -Infinity,
    barrelDark.geometry.boundingBox?.max.z ?? -Infinity,
  );
  assert.ok(Math.abs(muzzle.position.z - (localFaceZ + 0.020)) < 0.002,
    'muzzle anchor follows the counter-shifted physical tube face');

  for (const [yawDeg, pitchDeg] of [[0, 0], [31, -8], [-47, 15]]) {
    turret.rotation.y = yawDeg * Math.PI / 180;
    gun.rotation.x = -pitchDeg * Math.PI / 180;
    tank.root.updateMatrixWorld(true);
    const faceWorld = recoil.localToWorld(new THREE.Vector3(0, 0, localFaceZ));
    const boreWorld = bore.getWorldPosition(new THREE.Vector3());
    assert.ok(Math.abs(faceWorld.distanceTo(boreWorld) - 0.032) < 0.002,
      `gun hole stays on the physical muzzle at yaw ${yawDeg}, pitch ${pitchDeg}`);
  }
} finally {
  tank.dispose();
}

console.log('leopardRevolutionTurretCenter.selftest: centered turret and gun ownership pass');
