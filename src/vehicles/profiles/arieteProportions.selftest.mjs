import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { vehicleMarkingAnchor } from '../vehicleMarkings.ts';

// 269: the new turret's walls (profiles/arieteProtoTurret.ts) on their recorded plane, both sides
function countWallFaces(mesh, wallXM) {
  const position = mesh.geometry.getAttribute('position'), index = mesh.geometry.index;
  const sides = new Set();
  for (let i = 0; i < (index?.count ?? position.count); i += 3) {
    const vertices = [0, 1, 2].map((offset) => new THREE.Vector3().fromBufferAttribute(position,
      index ? index.getX(i + offset) : i + offset));
    if (!vertices.every((vertex) => Math.abs(Math.abs(vertex.x) - wallXM) < 1e-5)) continue;
    if (Math.sign(vertices[0].x) === Math.sign(vertices[1].x) && Math.sign(vertices[1].x) === Math.sign(vertices[2].x)) {
      sides.add(Math.sign(vertices[0].x));
    }
  }
  return sides.size;
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
  const tank = createTank('c1_ariete_preserie', null, { proceduralOnly: true, geometryReceipt: true });
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

for (const id of ['c1_ariete_proto_serie1', 'c2_ariete_proto']) {
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  const spec = getSpec(id);
  assert.deepEqual(spec.dims, {
    hullLengthM: 8.349,
    overallLengthM: 10.637,
    widthM: 3.96,
    heightM: id === 'c1_ariete_proto_serie1' ? 2.805 : 2.827,
  }, `${id}: registered dimensions are exactly ten percent larger`);
  assert.equal(spec.visual.trackWidthM, 0.66, `${id}: shoe course scales by ten percent`);
  // release 231: the turret rides ARIETE_PROTO_TURRET_LIFT_M (0.04) over the print seat, so 1.44 x 1.10
  assert(Math.abs(spec.armor.turretPivot[1] - 1.584) < 1e-9,
    `${id}: armor and turret rise together in the enlarged frame`);
  const trackPlate = spec.armor.hullPlates.find((plate) => plate.name === 'track_R');
  assert(Math.abs(Math.max(...trackPlate.verts.map((vertex) => vertex[1])) - 1.166) < 1e-12,
    `${id}: combat course follows the enlarged rendered track envelope`);

  const leftBand = tank.root.getObjectByName('gearTrackBandL');
  const turret = tank.root.getObjectByName('rig_turret');
  const turretArmor = turret.getObjectByName('turret');
  const hull = tank.root.getObjectByName('hull');
  const hullRig = tank.root.getObjectByName('rig_hull');
  const leftSkirt = hullRig.getObjectByName('hullTrackGuardL');
  const rightSkirt = hullRig.getObjectByName('hullTrackGuardR');
  assert.ok(leftBand?.geometry, `${id}: one native smart track band exists`);
  leftBand.geometry.computeBoundingBox();
  const bandWorldBounds = new THREE.Box3().setFromObject(leftBand);
  assert(bandWorldBounds.max.x - bandWorldBounds.min.x >= 0.649,
    `${id}: rendered band carries the enlarged 0.66 m shoe width`);
  assert(Math.abs(turret.position.y - 1.584) < 1e-9,
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
  const skirtSeat = hullRig.userData.arieteSideSkirtFenderSeatReceipt;
  assert.equal(skirtSeat.revision, 'full-height-fender-seat-r1',
    `${id}: skirt/fender closure uses the full-height seat`);
  assert.equal(skirtSeat.sides, 2, `${id}: both skirt runs receive fender bridges`);
  assert.equal(skirtSeat.fenderBridgeCoursesPerSide, 2,
    `${id}: each side has level aft and raked forward fender courses`);
  assert.equal(skirtSeat.skirtPanelsPerSide, id === 'c1_ariete_proto_serie1' ? 7 : 13,
    `${id}: fender closure preserves the mark-specific panel count`);
  assert.equal(skirtSeat.lowerEdgesPreserved, true,
    `${id}: attaching the skirts does not lower their accepted hems`);
  assert.ok(skirtSeat.verticalSeatOverlapM >= 0.06,
    `${id}: outer skirt carriers overlap the hull-side fender seat by at least 60 mm`);
  assert.ok(skirtSeat.inboardHullOverlapM >= 0.055,
    `${id}: fender bridges overlap the structural hull inboard by at least 55 mm`);
  assert.equal(skirtSeat.maxSupportGapM, 0,
    `${id}: skirt-to-fender attachment permits no unsupported gap`);
  hull.geometry.computeBoundingBox();
  for (const [side, skirt] of [['left', leftSkirt], ['right', rightSkirt]]) {
    assert.ok(skirt?.geometry, `${id}: ${side} structural skirt mesh exists`);
    skirt.geometry.computeBoundingBox();
    assert.ok(skirt.geometry.boundingBox.max.y >= skirtSeat.sideWallBottomYM,
      `${id}: ${side} skirt reaches the hull-side fender sill`);
    assert.ok(skirt.geometry.boundingBox.min.z <= skirtSeat.skirtSeatRearM + 1e-5,
      `${id}: ${side} fender seat spans the rear apron instead of stopping at the heavy panels`);
  }
  assert.ok(leftSkirt.geometry.boundingBox.max.x > hull.geometry.boundingBox.min.x,
    `${id}: left fender bridge physically overlaps the hull`);
  assert.ok(rightSkirt.geometry.boundingBox.min.x < hull.geometry.boundingBox.max.x,
    `${id}: right fender bridge physically overlaps the hull`);
  assert.equal(hullRig.userData.nativeRoadWheelStations, 7,
    `${id}: exactly seven suspension-driven road-wheel stations`);
  const gear = hullRig.userData.runningGearReceipts.at(-1);
  const arieteGear = hullRig.userData.arieteRunningGearReceipt;
  // owner 2026-09-23 (round 46): 650 mm wheels that read as seven separate road wheels on the 0.71 pitch.
  assert.equal(gear.wheelR, 0.325, `${id}: road wheels are the 650 mm Ariete size`);
  {
    const zs = [...gear.wheelZs].sort((a, b) => a - b);
    const pitch = Math.min(...zs.slice(1).map((z, i) => z - zs[i]));
    assert.ok(2 * gear.wheelR <= pitch - 0.05, `${id}: road wheels keep a visible gap (2R ${2 * gear.wheelR} vs pitch ${pitch})`);
  }
  assert.ok(Math.abs(gear.wheelY - (gear.botY + gear.trackTh / 2 + gear.wheelR)) < 1e-9, `${id}: enlarged road wheels rest on the band face (ground-datum seat, 2026-09-17)`);
  assert.equal(gear.sprocket.r, 0.25, `${id}: rear wheel uses the requested two-thirds profile`);
  assert.equal(gear.sprocket.y, 0.84, `${id}: rear wheel is raised into the return run`);
  assert(Math.abs(arieteGear.rearSprocketRadiusRatio - (0.25 / 0.37)) < 1e-9,
    `${id}: rear terminal reduction is recorded against the original wheel`);
  assert.equal(arieteGear.linkedCourseAdjusted, true, `${id}: linked track course was regenerated`);

  // 269 (the owner, 2026-11-03: "make the c1 arietee proto annd c2 ariete hhave completeely new turrets"): the old
  // turret's bustle side panels, racks and baskets are gone with it; the new turret (profiles/arieteProtoTurret.ts, from
  // the C1 and C2 photographs and the series C1 print's turret shell) publishes its measured plan instead
  const shell = turret.userData.arieteProtoTurretReceipt;
  assert.equal(shell?.revision, 'r269-photo-turret', `${id}: the photograph-built turret replaced the old one`);
  assert.equal(shell.owner, 'turret', `${id}: the new turret belongs to the articulated turret`);
  assert.equal(shell.followsTurretYaw, true, `${id}: the new turret follows the turret's yaw`);
  // (the armour template's turret half-width, modern3Specs.ts tw 1.28: the regenerated anatomy fits its plates to them)
  assert.equal(shell.wallHalfWidthM, 1.28, `${id}: its walls stand on the armour template's turret width`);
  assert.ok(shell.cheekRakeDeg >= 45 && shell.cheekRakeDeg <= 55,
    `${id}: the cheek faces rake back as the photographs show (${shell.cheekRakeDeg} deg from vertical)`);
  assert.ok(shell.cheekSweepDeg >= 12 && shell.cheekSweepDeg <= 22, `${id}: the cheek faces sweep back into an arrow plan`);
  assert.ok(shell.cheekTipZM - shell.stowageRearZM > 4.4 && shell.cheekTipZM - shell.stowageRearZM < 4.8,
    `${id}: the turret's length is the photographs' 4.6 m class`);
  assert.equal(shell.maxSupportGapM, 0, `${id}: no daylight under any part of the new turret`);
  assert.equal(shell.smokeTubesPerSide, 4, `${id}: four smoke tubes a side`);
  assert.equal(countWallFaces(turretArmor, shell.wallHalfWidthM * 1.1), 2,
    `${id}: both walls exist on the recorded plane`);
  if (id === 'c1_ariete_proto_serie1') {
    assert.equal(shell.c1CheekEra, 16, 'C1 keeps its release-240 cheek ERA, four by two a side');
    assert.equal(hullRig.userData.arieteC1EraReceipt.turretCheekCassettes, 16, 'C1 cheek ERA is on its receipt');
  }

  const equipment = turret.userData.arieteEquipmentReceipt;
  if (id === 'c1_ariete_proto_serie1') {
    // VH.14 (coordinator ruling 2026-10-14: roof weapons match the real vehicle): the Ariete's AA MG 42/59 is the
    // loader's, a working station; the commander's cupola carries none
    assert.equal(equipment.manualPintles, 1, 'C1 carries the loader\'s manual machine-gun station');
    assert.ok(turret.getObjectByName('arieteC1CommanderMg') === undefined, 'no C1 commander MG');
    assert.ok(turret.getObjectByName('arieteC1LoaderMg')?.userData.remoteControlled, 'C1 loader MG is a working station');
    assert.ok(turret.getObjectByName('arieteC2RemoteRws') === undefined,
      'C1 does not inherit the C2 remote tower');
  } else {
    assert.equal(equipment.remoteControlled, true, 'C2 roof weapon is remotely controlled');
    // 269 (C2 photographs 3 and 5): the loader's shielded gun stands on the turret's left, ahead of his hatch
    assert.equal(equipment.remoteWeaponSide, 'left', 'C2 roof gun is left mounted');
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
    // 269 (C2 photographs 3 and 5): each cheek's front is one row, an inner plate beside the gun and the main plate
    assert.equal(era.turretCheekRows, 1, 'C2 forward cheek field is one row of plates');
    assert.equal(era.turretCheekColumnsPerSide, 2,
      'C2 forward cheek field has its inner and main plate on each side');
    assert.ok(era.turretCheekForwardNormalDotMin > 0.70,
      'every C2 cheek cassette follows a strongly forward-facing carrier normal');
    // 269 (C2 photographs 1-5, the new turret): two front plates a side, a side plate over each cheek module and a faced
    // plate on each of the two wall boxes a side; the photographs show no plates on the bustle
    assert.equal(era.turretCheekCassettes, 4, 'C2 carries two front plates on each cheek');
    assert.equal(era.turretSideCassettes, 6, 'C2 carries a cheek side plate and two faced wall boxes a side');
    assert.equal(era.turretBustleCassettes, 0, 'C2 bustle carries no add-on plates');
    assert.equal(era.totalTurretCassettes, 10, 'C2 turret carries ten add-on plates');
    // (release 240: the profile run's raked end bays keep their upper row only: 52 -> 48)
    assert.equal(era.sideSkirtCassettes, 48, 'C2 skirts carry two rows across the 13 bays, one on the raked end bays');
    assert.equal(era.totalCassettes, 58, 'C2 upgrade contains fifty-eight seated plates (48 on the skirts)');
    const hullExternalArmor = hullRig.getObjectByName('hullExternalArmor');
    assert.ok(hullExternalArmor?.geometry, 'C2 skirt ERA uses the hull external-armor mesh');
    hullExternalArmor.geometry.computeBoundingBox();
    assert.ok(Math.abs(hullExternalArmor.geometry.boundingBox.min.x + 1.812 * 1.1) < 1e-5
      && Math.abs(hullExternalArmor.geometry.boundingBox.max.x - 1.812 * 1.1) < 1e-5,
    'C2 layered skirt lids finish 12 mm proud of the published cassette plane');
    for (const yaw of [0, Math.PI / 3]) {
      turret.rotation.y = yaw;
      tank.root.updateMatrixWorld(true);
      assert.ok(remoteRws.parent === turret, `C2 remote tower remains turret-owned through yaw ${yaw}`);
    }
  }
  const marking = vehicleMarkingAnchor(id);
  assert.equal(marking.owner, 'turret', `${id}: insignia is seated on the articulated turret`);
  assert.equal(marking.sizeM, 0.23, `${id}: insignia is scaled to clear adjacent equipment`);
  tank.dispose();
}

console.log('arieteProportions.selftest: Preserie glacis seat and C1/C2 ten-percent enlargement verified');
