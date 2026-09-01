import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { vehicleMarkingAnchor } from '../vehicleMarkings.ts';

function countPanelCarrierFaces(mesh, carrierXM = 1.115) {
  const position = mesh.geometry.getAttribute('position');
  let count = 0;
  for (let i = 0; i < position.count; i += 3) {
    const vertices = [0, 1, 2].map((offset) => new THREE.Vector3(
      position.getX(i + offset), position.getY(i + offset), position.getZ(i + offset)));
    if (!vertices.every((vertex) => Math.abs(Math.abs(vertex.x) - carrierXM) < 1e-5)) continue;
    const centroid = vertices[0].clone().add(vertices[1]).add(vertices[2]).multiplyScalar(1 / 3);
    if (centroid.y > 0.15 && centroid.y < 0.58
        && centroid.z > -2.45 && centroid.z < -1.10) count += 1;
  }
  return count;
}

function countPreserieGlacisRearFaces(mesh, rearStationZM) {
  const position = mesh.geometry.getAttribute('position');
  let count = 0;
  for (let i = 0; i < position.count; i += 3) {
    const vertices = [0, 1, 2].map((offset) => new THREE.Vector3(
      position.getX(i + offset), position.getY(i + offset), position.getZ(i + offset)));
    if (!vertices.every((vertex) => Math.abs(vertex.z - rearStationZM) < 1e-5)) continue;
    const bounds = new THREE.Box3().setFromPoints(vertices);
    if (bounds.min.y >= 0.99 && bounds.max.y <= 1.255
        && bounds.min.x >= -0.93 && bounds.max.x <= 0.93) count += 1;
  }
  return count;
}

{
  const tank = createTank('ariete', null, { proceduralOnly: true, geometryReceipt: true });
  const hullRig = tank.root.getObjectByName('rig_hull');
  const hull = hullRig.getObjectByName('hull');
  const glacis = hullRig.userData.arietePreserieGlacisSeatReceipt;
  assert.ok(glacis, 'Ariete Preserie exposes its upper-glacis seating receipt');
  assert.equal(glacis.revision, 'upper-glacis-rear-seat-r1');
  assert.equal(glacis.formerRearStationZM, 3.38,
    'receipt preserves the former forward rear-cap station');
  assert.equal(glacis.rearStationZM, 2.98,
    'upper-glacis rear cap returns to the hull carrier');
  assert.equal(glacis.carrierFaceZM, 3.00,
    'upper glacis targets the accepted hull-front plane');
  assert.ok(glacis.buriedEdgeOverlapM >= 0.019,
    'upper glacis overlaps the hull carrier by at least 19 mm');
  assert.equal(glacis.maxSupportGapM, 0, 'no support gap remains behind the upper glacis');
  assert.equal(glacis.noseTipZM, 3.60, 'the correction preserves the Preserie bow projection');
  assert.equal(glacis.lowerGlacisUnchanged, true, 'the lower glacis remains on its accepted station');
  assert.ok(countPreserieGlacisRearFaces(hull, glacis.rearStationZM) >= 2,
    'the structural hull contains the re-seated upper-glacis rear face');
  tank.dispose();
}

for (const id of ['ariete_c1', 'ariete_c2']) {
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  const spec = getSpec(id);
  assert.deepEqual(spec.dims, {
    hullLengthM: 8.349,
    overallLengthM: 10.637,
    widthM: 3.96,
    heightM: id === 'ariete_c1' ? 2.805 : 2.827,
  }, `${id}: registered dimensions are exactly ten percent larger`);
  assert.equal(spec.visual.trackWidthM, 0.66, `${id}: shoe course scales by ten percent`);
  assert(Math.abs(spec.armor.turretPivot[1] - 1.54) < 1e-12,
    `${id}: armor and turret rise together in the enlarged frame`);
  const trackPlate = spec.armor.hullPlates.find((plate) => plate.name === 'track_R');
  assert(Math.abs(Math.max(...trackPlate.verts.map((vertex) => vertex[1])) - 1.166) < 1e-12,
    `${id}: combat course follows the enlarged rendered track envelope`);

  const leftBand = tank.root.getObjectByName('gearTrackBandL');
  const turret = tank.root.getObjectByName('rig_turret');
  const turretArmor = turret.getObjectByName('turret');
  const hull = tank.root.getObjectByName('hull');
  const hullRig = tank.root.getObjectByName('rig_hull');
  assert.ok(leftBand?.geometry, `${id}: one native smart track band exists`);
  leftBand.geometry.computeBoundingBox();
  const bandWorldBounds = new THREE.Box3().setFromObject(leftBand);
  assert(bandWorldBounds.max.x - bandWorldBounds.min.x >= 0.649,
    `${id}: rendered band carries the enlarged 0.66 m shoe width`);
  assert(Math.abs(turret.position.y - 1.54) < 1e-9,
    `${id}: articulated turret is seated in the enlarged frame`);
  hull.geometry.computeBoundingBox();
  assert(hull.geometry.boundingBox.min.y >= 0.539,
    `${id}: armor floor rises above the terrain-seated course`);
  assert.deepEqual(hullRig.scale.toArray(), [1, 1, 1],
    `${id}: baked enlargement leaves the hull articulation rig at identity scale`);
  assert.deepEqual(turret.scale.toArray(), [1, 1, 1],
    `${id}: baked enlargement leaves the turret articulation rig at identity scale`);
  assert.deepEqual(hullRig.userData.arieteFamilyScaleReceipt, {
    uniformScale: 1.1,
    bakedGeometry: true,
    armorFrameScaled: true,
    turretPivotScaled: true,
    trackContactMetadataScaled: true,
    trackHitGeometryScaled: true,
  }, `${id}: render, armor and external movement metadata share one enlarged frame`);
  assert.equal(hullRig.userData.nativeRoadWheelStations, 7,
    `${id}: exactly seven suspension-driven road-wheel stations`);
  const gear = hullRig.userData.runningGearReceipts.at(-1);
  const arieteGear = hullRig.userData.arieteRunningGearReceipt;
  assert.equal(gear.wheelR, 0.38, `${id}: slightly larger road wheels are installed`);
  assert.equal(gear.wheelY, 0.53, `${id}: enlarged road wheels remain terrain seated`);
  assert.equal(gear.sprocket.r, 0.25, `${id}: rear wheel uses the requested two-thirds profile`);
  assert.equal(gear.sprocket.y, 0.84, `${id}: rear wheel is raised into the return run`);
  assert(Math.abs(arieteGear.rearSprocketRadiusRatio - (0.25 / 0.37)) < 1e-9,
    `${id}: rear terminal reduction is recorded against the original wheel`);
  assert.equal(arieteGear.linkedCourseAdjusted, true, `${id}: linked track course was regenerated`);

  const panel = turret.userData.arieteSidePanelReceipt;
  assert.equal(panel.owner, 'turret', `${id}: both marked panels belong to the articulated turret`);
  assert.equal(panel.formerInnerFaceXM, 1.40, `${id}: receipt records the former floating seat`);
  assert.equal(panel.innerFaceXM, 1.115, `${id}: panel inner faces move onto the bustle carrier`);
  assert.ok(panel.carrierOverlapM >= 0.01, `${id}: panels overlap the carrier by at least 10 mm`);
  assert.equal(panel.maxSupportGapM, 0, `${id}: no daylight remains below either panel`);
  assert.equal(panel.rackSupportArmsPerSide, 3, `${id}: outer rack is tied to the re-seated panel`);
  assert.equal(panel.rearBasketBridgesPerSide, 1, `${id}: aft panel is returned into the basket frame`);
  assert.ok(countPanelCarrierFaces(turretArmor, 1.115 * 1.1) >= 4,
    `${id}: both panel inner faces exist on the recorded carrier plane`);

  const equipment = turret.userData.arieteEquipmentReceipt;
  if (id === 'ariete_c1') {
    assert.equal(equipment.manualPintles, 2, 'C1 carries two manual machine-gun stations');
    assert.ok(turret.getObjectByName('arieteC1CommanderMg'), 'C1 commander MG is present');
    assert.ok(turret.getObjectByName('arieteC1LoaderMg'), 'C1 loader MG is present');
    assert.equal(turret.getObjectByName('arieteC2RemoteRws'), undefined,
      'C1 does not inherit the C2 remote tower');
  } else {
    assert.equal(equipment.remoteControlled, true, 'C2 roof weapon is remotely controlled');
    assert.equal(equipment.remoteWeaponSide, 'right', 'C2 remote tower is right mounted');
    assert.equal(equipment.rotatingShoulderModules, 4, 'all four marked shoulder modules are turret owned');
    assert.equal(equipment.rotatingApuAssembly, true, 'marked rear APU assembly is turret owned');
    const remoteRws = turret.getObjectByName('arieteC2RemoteRws');
    assert.ok(remoteRws, 'C2 T-90-style automated tower is present');
    const era = turret.userData.arieteC2EraReceipt;
    assert.equal(era.carrierDerivedTransforms, true,
      'C2 ERA transforms derive from the armor faces they protect');
    assert.ok(era.contactEmbedM >= 0.01, 'C2 ERA embeds at least 10 mm into every carrier');
    assert.equal(era.maxSupportGapM, 0, 'C2 ERA permits no support daylight');
    assert.equal(era.faceNormalAlignmentDeg, 0, 'C2 ERA backs share their carrier normals');
    assert.equal(era.turretCheekCarrier, 'forward-face',
      'C2 cheek ERA is seated on the marked forward cheek rather than its roof or outer wall');
    assert.equal(era.turretCheekSides, 2, 'C2 protects both turret cheeks symmetrically');
    assert.equal(era.turretCheekRows, 2, 'C2 forward cheek field has two continuous rows');
    assert.equal(era.turretCheekColumnsPerSide, 5,
      'C2 forward cheek field has five columns on each side');
    assert.ok(era.turretCheekForwardNormalDotMin > 0.70,
      'every C2 cheek cassette follows a strongly forward-facing carrier normal');
    assert.equal(era.turretCheekCassettes, 20, 'C2 carries dense paired cheek courses');
    assert.equal(era.turretSideCassettes, 16, 'C2 carries two complete turret-side courses');
    assert.equal(era.turretBustleCassettes, 12, 'C2 carries paired aft bustle courses');
    assert.equal(era.totalTurretCassettes, 48, 'C2 turret receives substantially denser ERA');
    assert.equal(era.sideSkirtCassettes, 52, 'C2 skirts carry two rows across all 13 bays per side');
    assert.equal(era.totalCassettes, 100, 'C2 upgrade contains one hundred seated cassettes');
    const hullExternalArmor = hullRig.getObjectByName('hullExternalArmor');
    assert.ok(hullExternalArmor?.geometry, 'C2 skirt ERA uses the hull external-armor mesh');
    hullExternalArmor.geometry.computeBoundingBox();
    assert.ok(Math.abs(hullExternalArmor.geometry.boundingBox.min.x + 1.812 * 1.1) < 1e-5
      && Math.abs(hullExternalArmor.geometry.boundingBox.max.x - 1.812 * 1.1) < 1e-5,
    'C2 layered skirt lids finish 12 mm proud of the published cassette plane');
    for (const yaw of [0, Math.PI / 3]) {
      turret.rotation.y = yaw;
      tank.root.updateMatrixWorld(true);
      assert.equal(remoteRws.parent, turret, `C2 remote tower remains turret-owned through yaw ${yaw}`);
    }
  }
  const marking = vehicleMarkingAnchor(id);
  assert.equal(marking.owner, 'turret', `${id}: insignia is seated on the articulated turret`);
  assert.equal(marking.sizeM, 0.23, `${id}: insignia is scaled to clear adjacent equipment`);
  tank.dispose();
}

console.log('arieteProportions.selftest: Preserie glacis seat and C1/C2 ten-percent enlargement verified');
