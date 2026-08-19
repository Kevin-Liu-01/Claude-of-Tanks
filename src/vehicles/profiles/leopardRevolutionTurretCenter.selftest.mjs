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
  const gunMount = tank.root.getObjectByName('gunMount');
  const barrel = tank.root.getObjectByName('gun');

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
} finally {
  tank.dispose();
}

console.log('leopardRevolutionTurretCenter.selftest: centered turret and gun ownership pass');
