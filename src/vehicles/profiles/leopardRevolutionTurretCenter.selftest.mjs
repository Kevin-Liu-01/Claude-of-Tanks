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
  const turretArmor = tank.root.getObjectByName('turret');
  const gunMount = tank.root.getObjectByName('gunMount');
  const barrel = tank.root.getObjectByName('gun');
  const barrelDark = tank.root.getObjectByName('gunDark');

  assert.ok(turret, 'Leopard 2 Revolution rotating turret rig exists');
  assert.equal(turret.position.x, 0,
    'Leopard 2 Revolution turret remains centered laterally');
  assert.ok(Math.abs(turret.position.z - 0.45) < 1e-9,
    'Leopard 2 Revolution yaw pivot sits at the structural turret center');
  assert.equal(gun?.parent, turret,
    'Leopard 2 Revolution gun remains owned by the translated turret rig');
  assert.equal(gun.position.z, 1.45,
    'Leopard 2 Revolution gun pitches at the visible mantlet trunnion');
  assert.ok(gunMount?.geometry && barrel?.geometry,
    'Leopard 2 Revolution keeps gun-owned mantlet and barrel geometry');
  assert.equal(bore?.parent, muzzle,
    'Leopard 2 Revolution bore fallback remains owned by its muzzle anchor');

  turretArmor.geometry.computeBoundingBox();
  const turretArmorCenter = turretArmor.geometry.boundingBox.getCenter(new THREE.Vector3());
  assert.ok(Math.abs(turretArmorCenter.x) < 0.001 && Math.abs(turretArmorCenter.z) < 0.001,
    'the structural turret envelope is centered on the yaw origin');
  for (const yawDeg of [0, 37, -71, 180]) {
    turret.rotation.y = yawDeg * Math.PI / 180;
    tank.root.updateMatrixWorld(true);
    const centerWorld = turretArmor.localToWorld(turretArmorCenter.clone());
    const pivotWorld = turret.getWorldPosition(new THREE.Vector3());
    assert.ok(Math.hypot(centerWorld.x - pivotWorld.x, centerWorld.z - pivotWorld.z) < 0.002,
      `structural turret center stays on the yaw axis at ${yawDeg} degrees`);
  }
  turret.rotation.y = 0;

  // The static slot face is centered at turret-local (0, .28, 1.65).  The
  // dark hole and armored ring are gun-owned at z=.205/.229 from the new
  // trunnion.  Their center must stay inside the slot throughout the legal
  // pitch sweep; the old deep pivot made the complete aperture orbit by more
  // than a metre through the turret face.
  const openingLocal = new THREE.Vector3(0, 0.28, 1.65);
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

  const parts = tank.root.userData.combatGeometryParts;
  const centerOf = (part) => ({
    x: (part.min[0] + part.max[0]) * 0.5,
    z: (part.min[2] + part.max[2]) * 0.5,
  });
  const roofSeat = (bucket, x, z, label) => {
    const part = parts.find((candidate) => {
      if (candidate.bucket !== bucket) return false;
      const center = centerOf(candidate);
      return Math.abs(center.x - x) < 0.006 && Math.abs(center.z - z) < 0.006;
    });
    assert.ok(part, `${label} remains present after the yaw-pivot rebase`);
    assert.ok(Math.abs(part.min[1] - 0.66) < 0.006,
      `${label} is seated directly on the turret roof`);
  };
  roofSeat('turretDark', -0.80, -1.525, 'SEOSS pedestal');
  roofSeat('turretEquipment', -0.85, -2.21, 'rear electronics module');
  roofSeat('turretEquipment', 0.43, -2.20, 'RWS base plate');
  roofSeat('turretEquipment', 0.22, -2.15, 'RWS ammunition bin');
  roofSeat('turretEquipment', -0.30, -2.52, 'crosswind mast base');
  roofSeat('turretHatch', 0.55, -1.05, 'commander hatch');
  roofSeat('turretHatch', -0.60, -0.90, 'loader hatch');

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
