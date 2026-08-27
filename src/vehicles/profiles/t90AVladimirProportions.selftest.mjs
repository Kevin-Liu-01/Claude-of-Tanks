import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';

const near = (value, target, epsilon = 1e-6) => Math.abs(value - target) <= epsilon;

const tank = createTank('t90a_vladimir', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});

try {
  const hullRig = tank.root.getObjectByName('rig_hull');
  const turretRig = tank.root.getObjectByName('rig_turret');
  const gunRig = tank.root.getObjectByName('rig_gun');
  const turret = turretRig?.getObjectByName('turret');
  assert.ok(turretRig && gunRig && turret?.isMesh,
    'T-90A Vladimir keeps structural turret and gun geometry on articulated rigs');

  const hull = hullRig?.getObjectByName('hull');
  const hullReceipt = hullRig?.userData.t90aVladimirHullReceipt;
  assert.ok(hullRig && hull?.isMesh && hullReceipt,
    'T-90A Vladimir exposes its running-gear and glacis geometry receipt');
  assert.ok(near(hullReceipt.roadWheelBottomY, 0.125),
    'road-wheel tangent remains at the measured 125-mm station');
  assert.ok(near(hullReceipt.trackBandTopY, 0.125),
    'loaded track upper face reaches the road-wheel tangent');
  assert.ok(near(hullReceipt.roadWheelToTrackGapM, 0),
    'no air gap remains between road wheels and the loaded track course');
  assert.ok(near(hullReceipt.trackEnvelopeHeightM, 0.79),
    'track envelope is 60 mm shorter while its return run remains fixed');
  assert.deepEqual(hullReceipt.upperGlacisRear, [0, 1.29, 1.68],
    'upper glacis starts at the accepted deck shoulder');
  assert.deepEqual(hullReceipt.lowerGlacisRear, [0, 0.60, 1.68],
    'lower glacis starts at the accepted belly shoulder');
  assert.deepEqual(hullReceipt.prow, [0, 1.08, 2.10],
    'upper and lower glacis converge at one shared prow');
  assert.ok(hullReceipt.upperGlacisPitchRad > 0.45,
    'upper glacis is visibly raked instead of a terminal wall');
  assert.ok(hullReceipt.lowerGlacisPitchRad < -0.84,
    'lower glacis is visibly raked instead of flat');
  assert.equal(hullReceipt.bowArmorRows, 2,
    'both bow armor rows are reseated on the upper glacis');

  const hullPosition = hull.geometry.attributes.position;
  let prowVertices = 0;
  let upperShoulderVertices = 0;
  let lowerShoulderVertices = 0;
  for (let index = 0; index < hullPosition.count; index += 1) {
    const y = hullPosition.getY(index);
    const z = hullPosition.getZ(index);
    if (near(y, 1.08, 1e-5) && near(z, 2.10, 1e-5)) prowVertices += 1;
    if (near(y, 1.29, 1e-5) && near(z, 1.68, 1e-5)) upperShoulderVertices += 1;
    if (near(y, 0.60, 1e-5) && near(z, 1.68, 1e-5)) lowerShoulderVertices += 1;
  }
  assert.ok(prowVertices >= 4, `shared prow exists in structural hull geometry (${prowVertices} vertices)`);
  assert.ok(upperShoulderVertices >= 2,
    `upper glacis shoulder exists in structural hull geometry (${upperShoulderVertices} vertices)`);
  assert.ok(lowerShoulderVertices >= 2,
    `lower glacis shoulder exists in structural hull geometry (${lowerShoulderVertices} vertices)`);

  const proportion = turretRig.userData.t90aVladimirProportionReceipt;
  assert.ok(proportion, 'T-90A Vladimir exposes its cheek proportion receipt');
  assert.ok(near(proportion.lowerCheekBaseY, -0.015), 'marked lower cheek base remains fixed');
  assert.ok(near(proportion.originalLowerCheekHeightM, 0.125), 'marked lower cheek course remains explicit');
  assert.ok(near(proportion.lowerCheekHeightMultiplier, 2), 'lower cheek course uses requested 2x multiplier');
  assert.ok(near(proportion.lowerCheekHeightM, 0.25), 'lower cheek course is exactly 250 mm tall');
  assert.ok(near(proportion.lowerCheekTopY, 0.235), 'lower cheek reaches the 235-mm joint station');
  assert.ok(near(proportion.cheekBaseY, 0.235), 'upper cheek begins at the lower cheek top');
  assert.ok(near(proportion.originalCheekHeightM, 0.26), 'marked original cheek course remains explicit');
  assert.ok(near(proportion.requestedCheekHeightMultiplier, 1.8), 'requested 1.8x roof target remains explicit');
  assert.ok(near(proportion.cheekHeightM, 0.333), 'connected upper cheek spans exactly 333 mm');
  assert.ok(near(proportion.cheekHeightMultiplier, 0.333 / 0.26),
    'upper cheek height is derived from the shared edge and accepted roof station');
  assert.ok(near(proportion.cheekTopY, 0.568), 'cheek course reaches the new 568-mm top station');
  assert.ok(near(proportion.lowerCheekTopPlanScale, 1.02), 'lower course exposes its top perimeter scale');
  assert.ok(near(proportion.cheekBasePlanScale, 1.02), 'upper course reuses the lower top perimeter scale');
  assert.ok(near(proportion.courseOverlapM, 0), 'cheek courses do not intersect');
  assert.equal(proportion.edgeMatched, true, 'cheek courses share one exact edge ring');
  assert.ok(near(proportion.eraRaisedM, 0.208), 'Kontakt-5 package follows the structural rise');
  assert.equal(proportion.eraFlankBanksMirrored, true,
    'Kontakt-5 flank cassettes occupy both turret cheeks instead of two right-side quadrants');
  assert.ok(near(proportion.eraFlankTileInsetM, 0.03),
    'flank cassettes are inset 30 mm through the cheek skin');
  assert.ok(near(proportion.eraFlankTileDepthM, 0.11),
    'flank cassettes carry enough depth to remain buried through the armor plane');
  assert.ok(near(proportion.eraFlankTilePitchRad, -1.05),
    'flank cassettes follow the sloped cheek plane');
  assert.ok(near(proportion.shtoraCenterY, 0.28), 'Shtora optical centres sit at the mantlet-side station');
  assert.ok(near(proportion.shtoraSupportY, 0.20), 'Shtora support shoes move with the complete eye assembly');
  assert.ok(near(proportion.shtoraLoweredM, 0.208), 'Shtora package drops by the former cheek-rise inheritance');
  assert.ok(near(proportion.shtoraToGunAxisM, 0.12), 'Shtora optical centres sit 120 mm above the gun axis');
  assert.ok(near(proportion.shtoraCenterY - gunRig.position.y, proportion.shtoraToGunAxisM),
    'Shtora-to-gun alignment receipt matches the articulated gun rig');

  const position = turret.geometry.attributes.position;
  let topCourseVertices = 0;
  let lowerCourseVertices = 0;
  for (let index = 0; index < position.count; index += 1) {
    if (near(position.getY(index), 0.568, 1e-5)) topCourseVertices += 1;
    if (near(position.getY(index), 0.235, 1e-5)) lowerCourseVertices += 1;
  }
  assert.ok(lowerCourseVertices >= 100,
    `new connected lower-cheek top course is present (${lowerCourseVertices} vertices)`);
  assert.ok(topCourseVertices >= 100,
    `new connected cheek top course is present in structural geometry (${topCourseVertices} vertices)`);

  const gun = gunRig.userData.t90aVladimirGunReceipt;
  assert.ok(gun, 'T-90A Vladimir exposes its cannon proportion receipt');
  assert.ok(near(gun.sleeveRadiusM, 0.078), 'cannon carries the enlarged 78-mm sleeve radius');
  assert.ok(near(gun.muzzleRadiusM, 0.060), 'muzzle remains a substantial 60-mm radius');
  assert.ok(near(gun.fumeExtractorRadiusM, 0.105), 'fume extractor is enlarged with the sleeve');
  assert.ok(near(gun.muzzleZ, 4.475), 'accepted cannon length is preserved');
  assert.equal(gun.sealedBoot, true, 'cannon root is sealed by a tapered boot');
  assert.ok(gunRig.getObjectByName('muzzleBoreShadowDisc'), 'cannon has a recessed muzzle bore');

  const equipment = turretRig.userData.t90aVladimirEquipmentReceipt;
  assert.ok(equipment, 'T-90A Vladimir exposes its cheek and RWS equipment receipt');
  assert.equal(equipment.smokeBanks, 2, 'both cheeks carry smoke banks');
  assert.equal(equipment.smokeCanistersPerBank, 6, 'each cheek bank carries six canisters');
  assert.equal(equipment.remoteWeapon, 'kord', 'roof station uses a Kord-class machine gun');
  assert.equal(equipment.remoteControlled, true, 'Kord is an automated controlled station');
  const smokeLeft = turretRig.getObjectByName('t90aVladimirSmokeBankL');
  const smokeRight = turretRig.getObjectByName('t90aVladimirSmokeBankR');
  const remoteKord = turretRig.getObjectByName('t90aVladimirRemoteKord');
  assert.ok(smokeLeft && smokeRight, 'mirrored cheek smoke-bank groups are present');
  assert.ok(remoteKord, 'remote Kord group is present');

  const sideRails = turretRig.userData.t90aVladimirSideRailReceipt;
  assert.ok(sideRails, 'Vladimir exposes the articulated side-rail receipt');
  assert.equal(sideRails.owner, 'rig_turret', 'side rails are owned by the turret rig');
  assert.equal(sideRails.articulated, true, 'side rails are explicitly articulated');
  assert.equal(sideRails.hullRailParts, 0, 'no fixed hull rail replica remains');
  assert.equal(sideRails.bustleAligned, true, 'side rails follow the bustle taper');
  assert.equal(sideRails.flushToBustle, true, 'side rails are explicitly seated on the bustle skin');
  assert.ok(near(sideRails.shellPenetrationM, 0.0095),
    'rail inner faces penetrate the bustle skin by 9.5 mm');
  assert.ok(near(sideRails.maxOutsetM, 0.018),
    'rail centerlines remain only 18 mm outside the measured bustle side');
  assert.equal(sideRails.segmentsPerSide, 4,
    'each side uses four aligned rail segments across the bustle facets');
  assert.deepEqual(sideRails.railZRange, [-2.60, -0.68],
    'longitudinal rails remain within the authored bustle run');
  assert.deepEqual(sideRails.supportStations,
    [[-0.68, 1.230], [-1.10, 1.226], [-1.70, 1.042], [-2.30, 0.830], [-2.60, 0.700]],
    'five mounting stations follow the measured bustle taper on each side');

  const parts = tank.root.userData.combatGeometryParts;
  const legacyHullRails = parts.filter((part) => {
    if (part.bucket !== 'hull') return false;
    const width = part.max[0] - part.min[0];
    const height = part.max[1] - part.min[1];
    const depth = part.max[2] - part.min[2];
    return Math.abs(width - 0.09) < 2e-4
      && Math.abs(height - 0.07) < 2e-4
      && Math.abs(depth - 1.80) < 2e-4;
  });
  assert.equal(legacyHullRails.length, 0,
    'the former fixed fender-height rail pair is absent from rig_hull');

  const articulatedRailSegments = parts.filter((part) => {
    if (part.bucket !== 'turretDetail' || part.parent !== 'turretG') return false;
    const width = part.max[0] - part.min[0];
    const height = part.max[1] - part.min[1];
    const depth = part.max[2] - part.min[2];
    const centerY = (part.min[1] + part.max[1]) * 0.5;
    const centerZ = (part.min[2] + part.max[2]) * 0.5;
    return Math.abs(height - 0.055) < 2e-4
      && Math.abs(centerY - 0.34) < 2e-4
      && centerZ <= -0.67 && centerZ >= -2.61
      && Math.max(width, depth) > 0.30;
  });
  assert.equal(articulatedRailSegments.length, 8,
    'four surface-following rail segments occupy each bustle side');

  const articulatedRailUprights = parts.filter((part) => {
    if (part.bucket !== 'turretDetail' || part.parent !== 'turretG') return false;
    const width = part.max[0] - part.min[0];
    const height = part.max[1] - part.min[1];
    const depth = part.max[2] - part.min[2];
    const centerY = (part.min[1] + part.max[1]) * 0.5;
    const centerZ = (part.min[2] + part.max[2]) * 0.5;
    return Math.abs(width - 0.055) < 2e-4
      && Math.abs(height - 0.24) < 2e-4
      && Math.abs(depth - 0.055) < 2e-4
      && Math.abs(centerY - 0.31) < 2e-4
      && centerZ <= -0.67 && centerZ >= -2.61;
  });
  assert.equal(articulatedRailUprights.length, 10,
    'five flush mounting uprights connect each rail to the bustle wall');

  const flankEra = parts.filter((part) => {
    if (part.bucket !== 'turretTrack' || part.parent !== 'turretG') return false;
    const height = part.max[1] - part.min[1];
    const centerX = (part.min[0] + part.max[0]) * 0.5;
    const centerZ = (part.min[2] + part.max[2]) * 0.5;
    return height > 0.30 && Math.abs(centerX) > 0.8 && centerZ > 0.30;
  });
  assert.equal(flankEra.length, 6, 'six sloped flank ERA cassettes are present');
  assert.equal(flankEra.filter((part) => (part.min[0] + part.max[0]) * 0.5 < 0).length, 3,
    'three ERA cassettes seat on the left cheek');
  assert.equal(flankEra.filter((part) => (part.min[0] + part.max[0]) * 0.5 > 0).length, 3,
    'three ERA cassettes seat on the right cheek');

  const bustleFace = turretRig.userData.t90aVladimirBustleFaceReceipt;
  assert.ok(bustleFace?.seated, 'rear-side dark service faces expose a seated receipt');
  assert.ok(near(bustleFace.outerFaceOffsetM, 0.096),
    'dark service faces are recessed inside their armor-bin face');
  assert.ok(near(bustleFace.faceThicknessM, 0.012),
    'dark service faces use the flush 12-mm seam plate');

  tank.root.updateMatrixWorld(true);
  const gunBounds = new THREE.Box3().setFromObject(gunRig);
  const gunSize = gunBounds.getSize(new THREE.Vector3());
  assert.ok(gunSize.x >= 0.69, `enlarged saddle reads at least 690 mm wide (${gunSize.x})`);
  assert.ok(gunSize.z >= 4.66, `cannon retains its long 2A46M silhouette (${gunSize.z})`);

  const turretDetail = turretRig.getObjectByName('turretDetail');
  assert.ok(turretDetail && turretRig.getObjectById(turretDetail.id) === turretDetail,
    'merged rail geometry remains inside the articulated turret hierarchy');
  for (const yaw of [0, Math.PI / 2]) {
    turretRig.rotation.y = yaw;
    tank.root.updateMatrixWorld(true);
    assert.equal(gunRig.parent, turretRig, `gun remains turret-owned through yaw ${yaw}`);
    assert.equal(smokeLeft.parent, turretRig, `left smoke bank remains turret-owned through yaw ${yaw}`);
    assert.equal(smokeRight.parent, turretRig, `right smoke bank remains turret-owned through yaw ${yaw}`);
    assert.equal(remoteKord.parent, turretRig, `remote Kord remains turret-owned through yaw ${yaw}`);
    assert.ok(turretRig.getObjectById(turretDetail.id) === turretDetail,
      `side rails remain turret-owned through yaw ${yaw}`);
  }
} finally {
  tank.dispose();
}

console.log('t90AVladimirProportions.selftest: compact tracks, raked glacis, reseated bow fittings, aligned Shtora, connected cheeks, ERA, smoke banks, RWS, and enlarged cannon verified');
