import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

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
  const gunMount = gunRig?.getObjectByName('gunMount');
  const gunMountDark = gunRig?.getObjectByName('gunMountDark');
  assert.ok(turretRig && gunRig && turret?.isMesh
    && gunMount?.isMesh && gunMountDark?.isMesh,
  'T-90A Vladimir keeps structural turret, gun, and housing geometry on articulated rigs');
  assert.ok(gunMount.parent === gunRig,
    'Vladimir saddle and recoil housing rise with the articulated cannon');
  assert.ok(gunMountDark.parent?.parent === gunRig,
    'Vladimir housing seams rise with the articulated cannon');

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
  assert.ok(near(proportion.eraFlankTileInsetM, 0.015),
    'flank cassette backs penetrate 15 mm through the cheek skin');
  assert.ok(near(proportion.eraFlankTileDepthM, 0.11),
    'flank cassettes carry enough depth to remain buried through the armor plane');
  assert.equal(proportion.eraFlankTilePitchRad, null,
    'flank cassette rotations come from carrier normals, not one generic pitch');
  assert.equal(proportion.eraFlankRows, 2,
    'Vladimir carries two conformal ERA rows on each cheek');
  assert.equal(proportion.eraFlankColumnsPerSide, 3,
    'each cheek ERA row contains three aligned cassettes');
  assert.ok(near(proportion.eraFlankRowOffsetM, 0.305),
    'cheek ERA rows use a non-overlapping 305-mm on-surface cadence');
  assert.equal(proportion.eraFlankLayered, true,
    'every visible ERA cassette includes a buried attachment layer');
  const eraSeat = turretRig.userData.t90aVladimirEraSeatReceipt;
  assert.ok(eraSeat, 'Vladimir exposes its faceted Kontakt-5 seating receipt');
  assert.equal(eraSeat.revision, 'faceted-carrier-k5-r1');
  assert.equal(eraSeat.owner, 'rig_turret');
  assert.equal(eraSeat.carrier, 'faceted-turret-cheeks');
  assert.equal(eraSeat.seatMode, 'carrier-point-normal');
  assert.equal(eraSeat.visibleMaterial, 'cot:armor-paint',
    'Kontakt-5 inherits the turret camouflage instead of spare-track gray');
  assert.equal(eraSeat.semanticBucket, 'turretExternalArmor');
  assert.equal(eraSeat.cassetteCount, 12,
    'three columns and two rows remain complete on both cheeks');
  assert.ok(near(eraSeat.contactEmbedM, 0.015));
  assert.ok(near(eraSeat.rowPitchM, 0.305));
  assert.ok(near(eraSeat.rowGapM, 0.005),
    'adjacent courses retain a 5-mm seam instead of coplanar overlap');
  assert.equal(eraSeat.carrierNormalAlignmentDeg, 0,
    'cassette backs share the marked carrier-face normals');
  assert.deepEqual(eraSeat.stations, ['rear-return', 'mid-cheek', 'front-cheek']);
  const structuralPositions = turret.geometry.attributes.position;
  const triangle = new THREE.Triangle();
  const ta = new THREE.Vector3();
  const tb = new THREE.Vector3();
  const tc = new THREE.Vector3();
  const closest = new THREE.Vector3();
  const targetPoint = new THREE.Vector3();
  const carrierNormal = new THREE.Vector3();
  const triangleNormal = new THREE.Vector3();
  for (const seat of eraSeat.carrierSeats) {
    targetPoint.fromArray(seat.point);
    carrierNormal.fromArray(seat.normal).normalize();
    let closestDistanceM = Infinity;
    let normalAlignment = -1;
    for (let index = 0; index < structuralPositions.count; index += 3) {
      ta.fromBufferAttribute(structuralPositions, index);
      tb.fromBufferAttribute(structuralPositions, index + 1);
      tc.fromBufferAttribute(structuralPositions, index + 2);
      triangle.set(ta, tb, tc).closestPointToPoint(targetPoint, closest);
      const distanceM = closest.distanceTo(targetPoint);
      if (distanceM >= closestDistanceM) continue;
      closestDistanceM = distanceM;
      triangle.getNormal(triangleNormal);
      normalAlignment = triangleNormal.dot(carrierNormal);
    }
    assert.ok(closestDistanceM < 0.001,
      `${seat.station} carrier point lies on the structural turret (${closestDistanceM.toFixed(6)} m)`);
    assert.ok(normalAlignment > 0.9999,
      `${seat.station} ERA normal matches its structural carrier (${normalAlignment.toFixed(6)})`);
  }
  assert.equal(turretRig.getObjectByName('turretTrack'), undefined,
    'no Vladimir ERA remains in the spare-track material bucket');
  const eraMesh = turretRig.getObjectByName('turretExternalArmor');
  assert.ok(eraMesh?.isMesh, 'faceted Kontakt-5 cassettes remain turret-owned external armor');
  assert.equal(eraMesh.material, turret.material,
    'merged Vladimir ERA mesh shares the vehicle armor-paint material');
  assert.equal(tank.root.userData.eraFinishReceipt?.bodyAndCoverUseVehiclePaint, true,
    'cassette bodies and covers both retain vehicle-scale camouflage');
  assert.equal(proportion.sideHeadsFlush, true,
    'unequal side blocks are explicitly seated through the turret cheek');
  assert.ok(near(proportion.sideHeadOriginalAbsX, 1.44),
    'the former detached side-head station remains documented');
  assert.ok(near(proportion.sideHeadMaxAbsX, 1.28),
    'both complete side heads move inward onto the turret shell');
  assert.ok(near(proportion.sideHeadInboardShiftMinM, 0.16),
    'each side head moves inward by at least 160 mm');
  assert.ok(near(proportion.shtoraCenterY, 0.28), 'Shtora optical centres sit at the mantlet-side station');
  assert.ok(near(proportion.shtoraSupportY, 0.20), 'Shtora support shoes move with the complete eye assembly');
  assert.ok(near(proportion.shtoraLoweredM, 0.208), 'Shtora package drops by the former cheek-rise inheritance');
  assert.ok(near(proportion.shtoraToGunAxisM, 0.08), 'Shtora optical centres sit 80 mm above the raised gun axis');
  assert.ok(near(proportion.shtoraCenterY - gunRig.position.y, proportion.shtoraToGunAxisM),
    'Shtora-to-gun alignment receipt matches the articulated gun rig');
  assert.ok(near(proportion.chevronForwardM, 0.12),
    'Vladimir installs its complete frontal chevron ahead of the cast cheek');
  assert.equal(proportion.chevronRowsPerCheek, 2,
    'Vladimir exposes both joined chevron rows on each cheek');
  assert.equal(proportion.chevronTilesTotal, 24,
    'Vladimir keeps three distinct K-5 tiles on every chevron carrier face');
  assert.ok(proportion.chevronInnerLaneClearanceM >= 0.025,
    'inner chevron carriers leave a physical lane around each Shtora housing');
  assert.ok(proportion.chevronOuterLaneClearanceM >= 0.10,
    'outer chevron carriers remain clear of each Shtora housing');

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
  assert.ok(near(gun.gunAssemblyRaiseM, 0.04),
    'complete Vladimir cannon and recoil housing rise together by 40 mm');
  assert.ok(near(gun.gunAxisY, 0.20),
    'raised Vladimir trunnion is published in turret-local space');
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
    if (part.bucket !== 'turretExternalArmor' || part.parent !== 'turretG') return false;
    const width = part.max[0] - part.min[0];
    const height = part.max[1] - part.min[1];
    const depth = part.max[2] - part.min[2];
    const centerX = (part.min[0] + part.max[0]) * 0.5;
    const centerZ = (part.min[2] + part.max[2]) * 0.5;
    return width > 0.29 && height > 0.20 && depth > 0.33 && depth < 0.50
      && Math.abs(centerX) > 0.9 && centerZ > 0.30;
  });
  assert.equal(flankEra.length, eraSeat.cassetteCount,
    'the twelve sloped flank cassettes remain distinct from the deeper frontal chevron carriers');
  assert.equal(flankEra.filter((part) => (part.min[0] + part.max[0]) * 0.5 < 0).length, 6,
    'six ERA cassettes seat on the left cheek');
  assert.equal(flankEra.filter((part) => (part.min[0] + part.max[0]) * 0.5 > 0).length, 6,
    'six ERA cassettes seat on the right cheek');
  assert.ok(flankEra.every((part) => part.min[1] >= 0.17),
    'every flank cassette clears the former below-carrier placement');
  for (const right of flankEra.filter((part) => (part.min[0] + part.max[0]) * 0.5 > 0)) {
    const cx = (right.min[0] + right.max[0]) * 0.5;
    const cy = (right.min[1] + right.max[1]) * 0.5;
    const cz = (right.min[2] + right.max[2]) * 0.5;
    assert.ok(flankEra.some((left) => near((left.min[0] + left.max[0]) * 0.5, -cx, 1e-5)
      && near((left.min[1] + left.max[1]) * 0.5, cy, 1e-5)
      && near((left.min[2] + left.max[2]) * 0.5, cz, 1e-5)),
    'each right-cheek cassette has one exact mirrored left-cheek seat');
  }

  const flankEraBackers = parts.filter((part) => {
    if (part.bucket !== 'turretExternalArmor' || part.parent !== 'turretG') return false;
    const width = part.max[0] - part.min[0];
    const height = part.max[1] - part.min[1];
    const depth = part.max[2] - part.min[2];
    const centerX = (part.min[0] + part.max[0]) * 0.5;
    const centerY = (part.min[1] + part.max[1]) * 0.5;
    const centerZ = (part.min[2] + part.max[2]) * 0.5;
    return Math.abs(centerX) > 0.9 && centerZ > 0.30
      && centerY > 0.20 && centerY < 0.50
      && width > 0.24 && width < 0.38
      && height > 0.15 && height < 0.19
      && depth > 0.29 && depth < 0.38;
  });
  assert.equal(flankEraBackers.length, 12,
    'all twelve flank ERA cassettes have conformal buried backers');

  const seatedSideHeads = parts.filter((part) => {
    if (part.bucket !== 'turret' || part.parent !== 'turretG') return false;
    const centerX = (part.min[0] + part.max[0]) * 0.5;
    const centerY = (part.min[1] + part.max[1]) * 0.5;
    const centerZ = (part.min[2] + part.max[2]) * 0.5;
    return Math.abs(centerX) >= 1.26 && Math.abs(centerX) <= 1.29
      && centerY >= 0.11 && centerY <= 0.16
      && centerZ >= -0.56 && centerZ <= -0.43;
  });
  assert.equal(seatedSideHeads.length, 2,
    'both unequal side blocks occupy the inward turret-shell stations');
  assert.ok(seatedSideHeads.every((part) => Math.min(Math.abs(part.min[0]), Math.abs(part.max[0])) < 1.19),
    'each side block penetrates inward through the aft cheek surface');

  const fenderAttachment = hullRig.userData.t90aVladimirFenderAttachmentReceipt;
  assert.ok(fenderAttachment?.seated, 'former turret strip exposes a seated hull attachment receipt');
  assert.equal(fenderAttachment.owner, 'rig_hull', 'fender shoulder pieces are fixed to the hull rig');
  assert.equal(fenderAttachment.formerOwner, 'rig_turret', 'receipt records the corrected articulation owner');
  assert.equal(fenderAttachment.turretOwnedPieces, 0, 'no fender shoulder pieces remain turret-owned');
  assert.equal(fenderAttachment.visiblePiecesPerSide, 3, 'each hull shoulder retains three overlapping visible pieces');
  assert.equal(fenderAttachment.carrierPiecesPerSide, 1, 'each shoulder has one buried hull carrier');

  const hullFenderPieces = parts.filter((part) => {
    if (part.bucket !== 'hullDetail' || part.parent !== 'hullG') return false;
    const centerX = (part.min[0] + part.max[0]) * 0.5;
    const centerY = (part.min[1] + part.max[1]) * 0.5;
    const centerZ = (part.min[2] + part.max[2]) * 0.5;
    return Math.abs(centerX) > 1.54 && Math.abs(centerX) < 1.76
      && near(centerY, fenderAttachment.seatY, 1e-5)
      && centerZ > -0.58 && centerZ < -0.47;
  });
  assert.equal(hullFenderPieces.length, 6,
    'three fixed fender pieces per side are present at the hull crown');
  const hullFenderCarriers = parts.filter((part) => {
    if (part.bucket !== 'hullDark' || part.parent !== 'hullG') return false;
    const size = part.max.map((value, index) => value - part.min[index]);
    const centerX = (part.min[0] + part.max[0]) * 0.5;
    const centerZ = (part.min[2] + part.max[2]) * 0.5;
    return near(Math.abs(centerX), 1.50, 1e-5)
      && near(centerZ, fenderAttachment.seatZ, 1e-5)
      && near(size[0], 0.28, 1e-5)
      && near(size[1], 0.05, 1e-5)
      && near(size[2], 0.43, 1e-5);
  });
  assert.equal(hullFenderCarriers.length, 2,
    'both hull-owned fender courses overlap a buried support carrier');
  const legacyTurretFenderPieces = parts.filter((part) => {
    if (part.bucket !== 'turretDetail' || part.parent !== 'turretG') return false;
    const centerX = (part.min[0] + part.max[0]) * 0.5;
    const centerY = (part.min[1] + part.max[1]) * 0.5;
    const centerZ = (part.min[2] + part.max[2]) * 0.5;
    return Math.abs(centerX) > 1.54 && Math.abs(centerX) < 1.76
      && near(centerY, 0.128, 1e-5)
      && centerZ > 0.17 && centerZ < 0.28;
  });
  assert.equal(legacyTurretFenderPieces.length, 0,
    'the floating turret-owned fender-strip replicas are absent');

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

console.log('t90AVladimirProportions.selftest: two-row backed ERA, flush side heads, hull-owned fender shoulders, bustle rails, and calibrated roof/cue proportions verified');
