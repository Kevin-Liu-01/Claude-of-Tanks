import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

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
  const muzzleSeat = bore?.userData?.muzzleSeatReceipt;

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
  assert.equal(muzzleSeat?.supportSource, 'terminal-cap',
    'Leopard 2 Revolution bore is measured from its physical terminal cap');
  assert.ok(muzzleSeat?.lipAdvanceM >= 0.0034 && muzzleSeat?.lipAdvanceM <= 0.0161,
    'Leopard 2 Revolution bore uses a scale-aware terminal lip');

  turretArmor.geometry.computeBoundingBox();
  const turretArmorCenter = turretArmor.geometry.boundingBox.getCenter(new THREE.Vector3());
  assert.ok(Math.abs(turretArmorCenter.x) < 0.001 && Math.abs(turretArmorCenter.z + 0.10) < 0.002,
    'removing the asymmetric bow lip changes only the visual envelope, not the yaw origin');

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
  const detachedRightForeWing = parts.find((part) =>
    part.bucket === 'turret'
    && Math.abs(part.min[0] - 0.10) < 0.002
    && Math.abs(part.max[0] - 1.42) < 0.002
    && Math.abs(part.min[1] - 0.19) < 0.002
    && Math.abs(part.max[2] - 2.87) < 0.002);
  assert.equal(detachedRightForeWing, undefined,
    'the detached right-front turret wing remains removed');
  const detachedRightBowLip = parts.find((part) =>
    part.bucket === 'turret'
    && Math.abs(part.min[0] - 0.10) < 0.002
    && Math.abs(part.max[0] - 0.62) < 0.002
    && Math.abs(part.min[1] - 0.28) < 0.002
    && Math.abs(part.max[1] - 0.37) < 0.002
    && Math.abs(part.max[2] - 2.87) < 0.002);
  assert.equal(detachedRightBowLip, undefined,
    'the owner-selected right bow lip remains removed');
  const detachedRightBowTint = turret.children.find((child) => {
    if (!child.isMesh || !child.geometry) return false;
    child.geometry.computeBoundingBox();
    const bounds = child.geometry.boundingBox;
    return bounds
      && Math.abs(bounds.min.x + 0.92) < 0.002
      && Math.abs(bounds.max.x - 0.83) < 0.002
      && Math.abs(bounds.min.y - 0.3175) < 0.002
      && Math.abs(bounds.max.y - 0.666) < 0.002
      && Math.abs(bounds.max.z - 3.79) < 0.002;
  });
  assert.equal(detachedRightBowTint, undefined,
    'the owner-selected right bow tint remains removed');
  const turretRingApron = parts.find((part) =>
    part.bucket === 'turret'
    && Math.abs(part.min[1] - 0.035) < 0.002
    && Math.abs(part.max[1] - 0.18) < 0.002
    && Math.abs((part.max[0] - part.min[0]) - 2.68) < 0.01
    && Math.abs((part.max[2] - part.min[2]) - 2.68) < 0.01);
  assert.ok(turretRingApron, 'the closed turret-ring apron remains present');
  const ringCenterLocal = new THREE.Vector3(
    (turretRingApron.min[0] + turretRingApron.max[0]) * 0.5,
    (turretRingApron.min[1] + turretRingApron.max[1]) * 0.5,
    (turretRingApron.min[2] + turretRingApron.max[2]) * 0.5,
  );
  assert.ok(Math.abs(ringCenterLocal.x) < 0.002 && Math.abs(ringCenterLocal.z) < 0.002,
    'the closed turret-ring apron is centered on the corrected yaw axis');
  for (const yawDeg of [0, 78, -78, 180]) {
    turret.rotation.y = yawDeg * Math.PI / 180;
    tank.root.updateMatrixWorld(true);
    const ringCenterWorld = turret.localToWorld(ringCenterLocal.clone());
    const pivotWorld = turret.getWorldPosition(new THREE.Vector3());
    assert.ok(Math.hypot(ringCenterWorld.x - pivotWorld.x, ringCenterWorld.z - pivotWorld.z) < 0.002,
      `turret-ring apron stays on the yaw axis at ${yawDeg} degrees`);
  }
  turret.rotation.y = 0;

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
    assert.ok(Math.abs(faceWorld.distanceTo(boreWorld) - muzzleSeat.lipAdvanceM) < 0.002,
      `gun hole stays on the physical muzzle at yaw ${yawDeg}, pitch ${pitchDeg}`);
  }
} finally {
  tank.dispose();
}

console.log('leopardRevolutionTurretCenter.selftest: centered turret and gun ownership pass');
