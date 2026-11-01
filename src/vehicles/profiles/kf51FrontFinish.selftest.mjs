// kf51FrontFinish.selftest.mjs — the KF51 EVO's 267 build (profiles/kf51Evo.ts) as the real Panther KF51 EVO: the rig
// on the measured combat frame, the vertical gun-slot face between the arrowhead cheeks (the face kf51Specs.ts lays the
// mantlet on and kf51EvoGunFace.selftest.mjs reads), the Rh-130 (the turret's planned retrofit; the game keeps the
// 130 mm) in the EVO's gun-owned six-sided shroud, clear of that face over the whole elevation range, the right-cheek gunner's sight and the SEOSS behind it, the one roof weapon station, the KF51
// forged road-wheel faces on one suspension-bound gear course, and the two-row StrikeShield flank inside the 1.809 m
// authored width guard.
// Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { TANK_SPECS } from '../specs.ts';

const tank = createTank('kf51_evo', null, { proceduralOnly: true, geometryReceipt: true });
await Promise.resolve();

try {
  tank.root.updateMatrixWorld(true);
  const hullRig = tank.root.getObjectByName('rig_hull');
  const turretRig = tank.root.getObjectByName('rig_turret');
  const gunRig = tank.root.getObjectByName('rig_gun');
  assert.ok(hullRig && turretRig && gunRig, 'KF51 EVO keeps its hull, turret and gun rigs');
  const turretShell = turretRig.children.find((node) => node.isMesh && node.name === 'turret');
  assert.ok(turretShell, 'KF51 EVO turret has one merged structural shell');

  // the rig on the measured combat frame (combatGunRigs.generated.ts), visible and authoritative pivots together
  const receipt = turretRig.userData.kf51EvoTurretReceipt;
  assert.equal(receipt?.profile, 'kf51-evo-faceted-turret-r1', 'KF51 EVO publishes its faceted turret receipt');
  assert.deepEqual(turretRig.position.toArray(), [0, 1.71, 0.63], 'KF51 EVO turret rig sits at hull (0, 1.71, 0.63)');
  assert.deepEqual(TANK_SPECS.kf51_evo.armor.turretPivot, [0, 1.71, 0.63], 'the combat turret frame is the visible rig');
  const armor = TANK_SPECS.kf51_evo.armor;
  const gunWorld = gunRig.getWorldPosition(new THREE.Vector3());
  const authoritative = new THREE.Vector3(...armor.turretPivot).add(new THREE.Vector3(...armor.gunPivot));
  assert.ok(gunWorld.distanceTo(authoritative) < 1e-9, 'KF51 EVO visible and authoritative gun pivots coincide');

  // the gun slot: a level round between the cheeks meets the structural turret on its vertical face at z 1.10
  const shellHit = (x, y, direction = [0, 0, -1]) => {
    const origin = turretRig.localToWorld(new THREE.Vector3(x, y, 6));
    const dir = new THREE.Vector3(...direction).transformDirection(turretRig.matrixWorld);
    const hit = new THREE.Raycaster(origin, dir, 0, 12).intersectObject(turretShell, false)[0];
    return hit ? turretRig.worldToLocal(hit.point.clone()) : null;
  };
  for (const x of [-0.40, -0.2, 0, 0.2, 0.40]) {
    for (const y of [0.05, 0.25, 0.45, 0.65, 0.75]) {
      const hit = shellHit(x, y);
      assert.ok(hit && Math.abs(hit.z - receipt.slotFaceZ) < 0.005,
        `KF51 EVO gun slot at (${x}, ${y}) is the vertical face at z ${receipt.slotFaceZ} (got ${hit?.z.toFixed(3)})`);
    }
  }
  // the cheeks either side: arrowhead wedges reaching well forward of the slot face up to their ridge
  for (const x of [-1.1, -0.8, -0.55, 0.55, 0.8, 1.1]) {
    for (const y of [0.05, 0.25, receipt.cheekRidgeInner[1]]) {
      const hit = shellHit(x, y);
      assert.ok(hit && hit.z > receipt.slotFaceZ + 0.15, `KF51 EVO cheek at (${x}, ${y}) stands forward of the slot face`);
    }
  }
  assert.ok(receipt.cheekRidgeInner[1] <= 0.45 && receipt.cheekRidgeInner[2] > 2.3,
    'KF51 EVO cheek ridge holds the gun-face receipt datum (apex <= 0.45, tip past z 2.3)');

  // the EVO shroud: gun-owned, six-sided, and clear of the slot face at full elevation and full depression
  const gun = gunRig.userData.kf51EvoGunReceipt;
  assert.equal(gun?.profile, 'kf51-evo-rh130-shroud-r1', 'KF51 EVO publishes its Rh-130 shroud receipt');
  assert.equal(TANK_SPECS.kf51_evo.gun.caliberMm, 130, 'KF51 EVO keeps the game\'s 130 mm');
  assert.equal(gun.shroud.sides, 6, 'KF51 EVO shroud is the six-sided EVO sleeve');
  assert.equal(gun.barrelLengthM, 5.475, 'KF51 EVO tube keeps the measured 5.475 m from its pivot');
  assert.ok(gun.muzzleSectionRadiusM > gun.sleeveRadiusM, 'KF51 EVO Rh-130 steps out to its muzzle section');
  const tube = gunRig.getObjectByName('rig_recoil')?.children.find((node) => node.isMesh && node.name === 'gun');
  assert.ok(tube, 'KF51 EVO tube is drawn on the recoiling rig');
  tube.geometry.computeBoundingBox();
  const tubeBox = tube.geometry.boundingBox;
  assert.ok(tubeBox.max.z >= gun.barrelLengthM - 1e-3 && tubeBox.max.z < gun.barrelLengthM + 0.01,
    `KF51 EVO tube ends at its ${gun.barrelLengthM} m muzzle (${tubeBox.max.z.toFixed(3)})`);
  const shroud = gunRig.children.find((node) => node.isMesh && node.name === 'gunMount');
  assert.ok(shroud, 'KF51 EVO shroud is drawn in the gun mount (it elevates with the gun)');
  const position = shroud.geometry.getAttribute('position');
  const pivot = gunRig.position;
  for (const degrees of [-TANK_SPECS.kf51_evo.gunDepressionDeg, 0, TANK_SPECS.kf51_evo.gunElevationDeg]) {
    const pitch = degrees * Math.PI / 180;
    let minZ = Infinity;
    for (let index = 0; index < position.count; index++) {
      const y = position.getY(index), z = position.getZ(index);
      minZ = Math.min(minZ, pivot.z + z * Math.cos(pitch) - y * Math.sin(pitch));
    }
    assert.ok(minZ > receipt.slotFaceZ + 0.01,
      `KF51 EVO shroud stays ahead of the slot face at ${degrees} degrees (rear at ${minZ.toFixed(3)})`);
  }
  for (let index = 0; index < position.count; index++) {
    assert.ok(Math.abs(position.getX(index)) < receipt.slotHalfWidthM - 0.1,
      'KF51 EVO shroud clears the cheeks\' inner walls by 10 cm');
  }

  // the right cheek's gunner sight and the SEOSS behind it (+x is the vehicle's left)
  const roofProbe = (x, z) => {
    const origin = turretRig.localToWorld(new THREE.Vector3(x, 4, z));
    const down = new THREE.Vector3(0, -1, 0).transformDirection(turretRig.matrixWorld);
    const hit = new THREE.Raycaster(origin, down, 0, 6).intersectObject(turretShell, false)[0];
    return hit ? turretRig.worldToLocal(hit.point.clone()).y : null;
  };
  assert.ok(roofProbe(-0.86, 1.25) > receipt.roofY + 0.10, 'KF51 EVO gunner\'s sight box stands on the right cheek');
  assert.ok(roofProbe(-0.58, 0.42) > receipt.roofY + 0.40, 'KF51 EVO SEOSS head stands behind it, the tallest sight');
  assert.ok(Math.abs(roofProbe(0.42, -1.72) - receipt.roofY) < 1e-6, 'KF51 EVO roof is flat under the weapon station');

  // one remote weapon station, its Panther package
  const stations = [];
  turretRig.traverse((node) => {
    if (node.userData?.fittingRoot && node.userData.fitting === 'openYokeRws') stations.push(node);
  });
  assert.equal(stations.length, 1, 'KF51 EVO carries one roof weapon station');
  assert.equal(stations[0].userData.stationVariant, 'kf51-panther', 'KF51 EVO station keeps its Panther package');
  assert.equal(stations[0].userData.weaponRole, 'roof-primary', 'KF51 EVO station is the roof gun');

  // the KF51 forged road-wheel faces, one gear course
  const wheelLayers = [];
  hullRig.traverse((node) => { if (node.userData?.dynamicWheelFace) wheelLayers.push(node); });
  assert.equal(hullRig.userData.kf51EvoRunningGearReceipt?.forgedFaceLayers, wheelLayers.length,
    'KF51 EVO forged wheel faces are all suspension-bound gear layers');
  assert.equal(wheelLayers.length, 6, 'KF51 EVO draws its six forged-face layers');
  assert.equal(hullRig.userData.runningGearUnitCount, 1, 'KF51 EVO has one running-gear course');

  // the StrikeShield flank: six two-row modules a side, registered as external armor, inside the width guard
  const flank = hullRig.userData.kf51EvoFlankReceipt;
  assert.equal(flank?.modulesPerSide, 6, 'KF51 EVO flank carries six StrikeShield modules a side');
  assert.equal(flank.protectionRows, 2, 'KF51 EVO flank modules have two protection rows');
  const eraFinish = tank.root.userData.eraFinishReceipt;
  assert.ok(eraFinish?.visualSectors.includes(flank.visualEraSector), 'KF51 EVO flank is visual external armor');
  assert.equal(eraFinish?.semanticBucket, 'externalArmor', 'KF51 EVO flank ERA stays distinct from the hull envelope');
  const hullBounds = new THREE.Box3().setFromObject(hullRig);
  assert.ok(hullBounds.max.x <= 1.809 + 1e-6 && hullBounds.min.x >= -1.809 - 1e-6,
    `KF51 EVO hull stays inside the 1.809 m authored width guard (${hullBounds.min.x.toFixed(4)}..${hullBounds.max.x.toFixed(4)})`);

  // the upper glacis and the flank are the camouflaged hull shell
  const hullHit = (origin, direction) => new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(...direction), 0, 10)
    .intersectObject(hullRig, true).find((hit) => hit.object.isMesh);
  assert.equal(hullHit([0, 4, 2.9], [0, -1, 0])?.object.name, 'hull', 'KF51 EVO upper glacis is the camouflaged hull');
  const flankHit = hullHit([4, 1.05, -0.5], [-1, 0, 0]);
  assert.ok(flankHit?.point.x > 1.79 && flankHit.object.material?.map, 'KF51 EVO flank modules are camouflaged armor at x 1.80');
} finally {
  tank.dispose();
}

console.log('kf51FrontFinish.selftest: KF51 EVO rig, gun slot and cheeks, Rh-130 and shroud clearance, sights, roof station, forged wheels and StrikeShield flank pass');
