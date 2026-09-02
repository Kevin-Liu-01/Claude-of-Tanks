import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { M60_TRACK_FINISH } from './patton.ts';

const worldGeometryCenter = (mesh) => {
  mesh.geometry.computeBoundingBox();
  return mesh.localToWorld(mesh.geometry.boundingBox.getCenter(new THREE.Vector3()));
};

for (const id of ['m60a1', 'm60a3']) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });
  const turret = tank.root.getObjectByName('rig_turret');
  const hull = tank.root.getObjectByName('rig_hull');
  const gun = tank.root.getObjectByName('rig_gun');
  const attachments = turret?.userData.m60VariantAttachmentReceipt;
  const sideCassettes = hull?.userData.m60SideCassetteReceipt;
  const shoulders = hull?.userData.m60FrontShoulderReceipt;
  const compact = hull?.userData.m60CompactScaleReceipt;
  const searchlight = gun?.userData.m60SearchlightReceipt;

  assert.ok(sideCassettes, `${id}: side armor publishes its fender seating receipt`);
  assert(sideCassettes.cassetteTopY <= sideCassettes.fenderTopY - 0.14,
    `${id}: side armor hangs below rather than above/in line with the fender datum`);
  assert(sideCassettes.supportRailCenterY > sideCassettes.cassetteTopY,
    `${id}: upper support rail remains above the lowered cassette course`);
  assert.equal(sideCassettes.hangerCount, sideCassettes.count,
    `${id}: every lowered side cassette has a visible fender hanger`);
  assert(sideCassettes.cassetteCenterY < sideCassettes.previousCenterY,
    `${id}: side armor is lower than the superseded perched placement`);
  assert(sideCassettes.trackClearanceInnerX > 1.78,
    `${id}: lowered cassette wall remains outside the live track envelope`);
  assert(sideCassettes.exteriorX <= 1.8155,
    `${id}: track clearance does not widen the tank past its M60 fender envelope`);
  assert.equal(shoulders?.mirroredClosedVolumes, 2,
    `${id}: closed bow shoulders extend from both fenders`);
  assert.equal(shoulders?.texturedCamouflage, true,
    `${id}: bow shoulders use the hull camouflage material`);
  assert.equal(compact?.vehicleScale, 0.9, `${id}: complete vehicle is reduced by ten percent`);
  assert.equal(hull.scale.x, 0.9, `${id}: running gear and side protection share the hull scale`);
  assert.equal(turret.scale.x, 0.9, `${id}: turret, gun and roof equipment share the turret scale`);

  assert.ok(attachments?.roofShelf, `${id}: right roof shelf publishes a seating receipt`);
  assert.equal(attachments.roofShelf.conformalCorners, 4,
    `${id}: all roof-shelf corners descend to the cast roof`);
  assert(attachments.roofShelf.surfaceEmbeddedM >= 0.01,
    `${id}: shelf underside is embedded instead of hovering above the casting`);

  assert.ok(searchlight, `${id}: mantlet searchlight is present`);
  assert.equal(searchlight.owner, 'rig_gun', `${id}: searchlight pitches with the gun`);
  assert.equal(searchlight.lensBucket, 'gunMountGlass', `${id}: searchlight owns a real glass lens`);
  assert(searchlight.supportGapM <= 0.04,
    `${id}: searchlight yoke closes the gap to the marked gun-mount surface`);
  assert(searchlight.footprintZ[0] < 0.744 && searchlight.footprintZ[1] > 1.076,
    `${id}: searchlight footprint overlaps the complete marked mount patch`);

  const lens = gun.getObjectByName('gunMountGlass');
  assert.ok(lens?.isMesh, `${id}: glass lens is emitted in the pitching gun rig`);
  assert.equal(lens.userData.combatHitboxRole, 'nonArmor',
    `${id}: searchlight glass cannot enlarge the cannon armor hitbox`);
  tank.root.updateMatrixWorld(true);
  const before = worldGeometryCenter(lens).clone();
  gun.rotation.x = 0.18;
  tank.root.updateMatrixWorld(true);
  const after = worldGeometryCenter(lens).clone();
  assert(after.distanceTo(before) > 0.12,
    `${id}: searchlight follows gun elevation instead of remaining on the turret`);

  const bands = [];
  tank.root.traverse((object) => {
    if (object.name === 'gearTrackBandL' || object.name === 'gearTrackBandR') bands.push(object);
  });
  assert.equal(bands.length, 2, `${id}: exactly one continuous band remains on each side`);
  for (const band of bands) {
    assert.equal(band.material.color.getHex(), M60_TRACK_FINISH.trackBandHex,
      `${id} ${band.name}: track is neutral steel rather than camouflage-white`);
    assert.equal(band.material.roughness, M60_TRACK_FINISH.trackBandRoughness,
      `${id} ${band.name}: exposed track steel stays matte`);
    assert.equal(band.material.envMapIntensity, M60_TRACK_FINISH.trackBandEnvMapIntensity,
      `${id} ${band.name}: environment light cannot recolor the track`);
    assert.equal(band.userData.appearanceRole, 'trackBand',
      `${id} ${band.name}: semantic running-gear role survives the finish override`);
  }

  if (id === 'm60a1') {
    assert.equal(attachments.cheekPanels?.count, 12,
      'M60A1 has two conformal three-panel courses per side');
    assert.equal(attachments.cheekPanels.conformalSurfaceNormals, 12,
      'every M60A1 cheek panel derives its own cast-surface orientation');
    assert.equal(attachments.cheekPanels.courses, 2,
      'M60A1 cheek coverage is subdivided vertically to follow the casting');
    assert(attachments.cheekPanels.maximumTileSpanM <= 0.42,
      'M60A1 panels stay narrow enough to follow compound cheek curvature');
    assert(attachments.cheekPanels.maximumSupportGapM <= 0.002,
      'M60A1 panel inner faces remain supported at all audited corners');
    assert(attachments.cheekPanels.castEmbedM >= 0.055,
      'M60A1 cheek panels overlap the casting instead of floating beside it');
    assert(attachments.cheekPanels.maximumExteriorProjectionM <= 0.045,
      'M60A1 cheek faces remain close to the cast skin instead of standing proud');
    assert(attachments.cheekPanels.minimumExteriorProjectionM >= 0.04,
      'M60A1 cheek faces stay fully visible after the conformal seat correction');
  } else {
    assert(searchlight.widthM >= 0.56 && searchlight.lensDiameterM >= 0.34,
      'M60A3 carries the requested oversized gun-mounted searchlight');
    assert.equal(attachments.ttsHousing?.housingBucket, 'turretEquipment',
      'M60A3 sight housing is turret-owned equipment, not armor');
    assert.equal(attachments.ttsHousing?.duplicateHousingRemoved, true,
      'M60A3 emits one seated sight housing without overlapping duplicate boxes');
    const sight = turret.getObjectByName('turretEquipment');
    assert.ok(sight?.isMesh, 'M60A3 seated sight housing remains visible');
    assert.equal(sight.userData.combatHitboxRole, 'equipment',
      'M60A3 sight housing cannot inflate the turret armor envelope');
  }

  tank.dispose();
}

console.log('m60FamilyAttachments.selftest: lights, sight, panels, shelf, and tracks stay seated and material-correct');
