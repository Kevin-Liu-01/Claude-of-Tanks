import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';
import { M60_TRACK_FINISH } from './patton.js';

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
  const gun = tank.root.getObjectByName('rig_gun');
  const attachments = turret?.userData.m60VariantAttachmentReceipt;
  const searchlight = gun?.userData.m60SearchlightReceipt;

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
    assert.equal(attachments.cheekPanels?.count, 6,
      'M60A1 has three conformal cheek panels per side');
    assert.equal(attachments.cheekPanels.conformalSurfaceNormals, 6,
      'every M60A1 cheek panel derives its own cast-surface orientation');
    assert(attachments.cheekPanels.castEmbedM >= 0.02,
      'M60A1 cheek panels overlap the casting instead of floating beside it');
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
