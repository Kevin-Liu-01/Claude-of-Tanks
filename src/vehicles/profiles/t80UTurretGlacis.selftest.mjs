import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';

const tank = createTank('t80u', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});

try {
  const hullRig = tank.root.getObjectByName('rig_hull');
  const turretRig = tank.root.getObjectByName('rig_turret');
  const gunRig = tank.root.getObjectByName('rig_gun');
  const hull = hullRig?.getObjectByName('hull');
  const turret = turretRig?.getObjectByName('turret');
  assert.ok(hullRig && turretRig && gunRig && hull?.isMesh && turret?.isMesh,
    'T-80U keeps hull, turret, and gun geometry on articulated rigs');

  const glacis = hullRig.userData.t80uHullGlacisReceipt;
  assert.ok(glacis, 'T-80U exposes its lower-glacis attachment receipt');
  assert.equal(glacis.architecture, 'raised-overlapping-lower-glacis');
  assert.equal(glacis.lowerGlacisTopY, glacis.matingNoseBottomY,
    'lower glacis and steep nose share one attachment datum');
  assert.ok(glacis.overlapLengthM >= 0.35,
    'lower glacis overlaps the nose underside by at least 350 mm');
  assert.equal(glacis.attachmentGapM, 0,
    'lower glacis permits no daylight below the steep nose');

  const position = hull.geometry.getAttribute('position');
  const normal = hull.geometry.getAttribute('normal');
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  let raisedLowerTopFaces = 0;
  let matingNoseUndersideFaces = 0;
  for (let index = 0; index < position.count; index += 3) {
    a.fromBufferAttribute(position, index);
    b.fromBufferAttribute(position, index + 1);
    c.fromBufferAttribute(position, index + 2);
    n.fromBufferAttribute(normal, index).normalize();
    const centroid = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    if (Math.abs(centroid.y - 0.89) > 0.006
      || centroid.z < 2.95 || centroid.z > 3.33
      || Math.abs(centroid.x) > 1.15) continue;
    if (n.y > 0.98) raisedLowerTopFaces += 1;
    if (n.y < -0.98) matingNoseUndersideFaces += 1;
  }
  assert.ok(raisedLowerTopFaces >= 1,
    'raised lower-glacis top reaches the 0.89 m mating plane');
  assert.ok(matingNoseUndersideFaces >= 1,
    'steep-nose underside remains on the same 0.89 m mating plane');

  assert.equal(turretRig.userData.t80uTurretEraReceipt, undefined,
    'owner-rejected replacement turret/ERA architecture stays removed');

  const modernizedTurret = turretRig.userData.t80uT90StyleTurretReceipt;
  assert.ok(modernizedTurret,
    'T-80U exposes its cast-dome T-90-style protection and equipment receipt');
  assert.equal(modernizedTurret.architecture, 'cast-dome-t90-k5-package');
  assert.equal(modernizedTurret.replacementTurret, false,
    'modernized protection preserves the characteristic T-80U cast dome');
  assert.ok(modernizedTurret.frontEraModulesPerSide >= 7,
    'each turret cheek carries a dense seven-module Kontakt-5 fan');
  assert.ok(modernizedTurret.flankEraModulesPerSide >= 5,
    'Kontakt-5 continues into at least five flank return modules per side');
  assert.ok(modernizedTurret.crownEraModulesPerSide >= 3,
    'low crown protection covers both roof shoulders without blocking hatches');
  assert.ok(modernizedTurret.eraSupportEmbedM >= 0.04,
    'ERA support shoes overlap their armor carriers instead of floating');
  assert.equal(modernizedTurret.plantedSightFoundation, true);
  assert.equal(modernizedTurret.plantedCommanderStation, true);
  assert.equal(modernizedTurret.plantedSmokeFoundations, true);
  assert.equal(modernizedTurret.rearEquipmentReseated, true);

  const mantlet = gunRig.userData.t80uMantletReceipt;
  assert.ok(mantlet, 'T-80U exposes its compact mantlet receipt');
  assert.equal(mantlet.architecture, 'compact-rounded-rocking-shield');
  assert.ok(mantlet.widthM >= 0.68 && mantlet.widthM <= 0.72,
    'mantlet spans the central K-5 valley without covering the cheek fields');
  assert.ok(mantlet.heightM <= 0.50,
    'mantlet remains compact against the low Soviet turret face');
  assert.ok(mantlet.rearEmbedM >= 0.08,
    'rocking shield enters the turret nose deeply enough to prevent daylight');
  assert.equal(mantlet.supportedUpperLip, true);
  assert.equal(mantlet.supportedLowerLip, true);
  assert.equal(mantlet.canvasBootRing, true);
  assert.equal(mantlet.gunOwned, true,
    'the complete mantlet pitches with the gun');
  assert.equal(mantlet.materialBucketMerged, true,
    'mantlet detail remains merged into existing material buckets');

  turret.geometry.computeBoundingBox();
  assert.ok(turret.geometry.boundingBox.max.x <= 1.67
    && turret.geometry.boundingBox.min.x >= -1.67,
  'restored turret stays inside its former calibrated width');
  assert.ok(turret.geometry.boundingBox.max.z >= 1.60,
    'restored clamshell reaches forward around the compact mantlet valley');

  for (const yaw of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
    turretRig.rotation.y = yaw;
    tank.root.updateMatrixWorld(true);
    assert.equal(turret.parent, turretRig, `turret armor remains turret-owned through yaw ${yaw}`);
    assert.equal(gunRig.parent, turretRig, `gun remains turret-owned through yaw ${yaw}`);
  }
} finally {
  tank.dispose();
}

console.log('t80UTurretGlacis.selftest: raised bow joint, dense cast-dome K-5 turret, and compact rounded mantlet verified');
