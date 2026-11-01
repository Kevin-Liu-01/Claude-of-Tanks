import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { M60_TRACK_FINISH } from './patton.ts';

// Release 266 (the M60 batch): the M60A1 and M60A3 are rebuilt at true size on the owner's models' castings
// (pattonCast.ts buildM60CastSteps; Main's rulings 2026-10-28: the 0.9 compact envelope retired, the M60A3's ERA off).
// The old builder's attachment, cassette, shoulder and finish receipts went with it. What an M60 still has to carry:
// its canonical rigs at true size, the A1's searchlight glass riding the gun (no armour), one matte steel track band a
// side, and the authority's barrel ending on the drawn mouth (owner 2026-09-22: "the muzzle marker is the tube end").

const worldGeometryCenter = (mesh) => {
  mesh.geometry.computeBoundingBox();
  return mesh.localToWorld(mesh.geometry.boundingBox.getCenter(new THREE.Vector3()));
};

for (const id of ['m60a1', 'm60a3']) {
  const tank = createTank(id, null, { proceduralOnly: true, quality: 'high', camoSeed: 4242, geometryReceipt: true });
  const turret = tank.root.getObjectByName('rig_turret');
  const hull = tank.root.getObjectByName('rig_hull');
  const gun = tank.root.getObjectByName('rig_gun');
  assert.ok(turret && hull && gun, `${id}: the canonical hull, turret and gun rigs`);
  for (const rig of [hull, turret]) assert.equal(rig.scale.x, 1, `${id}: ${rig.name} at true size`);
  for (const key of ['m60CompactScaleReceipt', 'm60SideCassetteReceipt', 'm60FrontShoulderReceipt']) {
    assert.equal(hull.userData[key], undefined, `${id}: the retired builder's ${key} is not published`);
  }
  assert.equal(turret.userData.m60VariantAttachmentReceipt, undefined, `${id}: no retired attachment receipt`);

  const lens = gun.getObjectByName('gunMountGlass');
  if (id === 'm60a1') {
    assert.ok(lens?.isMesh, 'M60A1: the searchlight\'s glass is emitted in the pitching gun rig');
    assert.equal(lens.userData.combatHitboxRole, 'nonArmor', 'M60A1: the searchlight glass cannot enlarge the cannon\'s hitbox');
    tank.root.updateMatrixWorld(true);
    const before = worldGeometryCenter(lens).clone();
    gun.rotation.x = 0.18;
    tank.root.updateMatrixWorld(true);
    assert(worldGeometryCenter(lens).distanceTo(before) > 0.12, 'M60A1: the searchlight follows the gun\'s elevation');
    gun.rotation.x = 0;
  } else {
    assert.equal(Boolean(lens), false, 'M60A3: no searchlight over the gun (the owner\'s model), only its mounting studs');
  }

  const bands = [];
  tank.root.traverse((object) => {
    if (object.name === 'gearTrackBandL' || object.name === 'gearTrackBandR') bands.push(object);
  });
  assert.equal(bands.length, 2, `${id}: exactly one continuous band on each side`);
  for (const band of bands) {
    assert.equal(band.material.color.getHex(), M60_TRACK_FINISH.trackBandHex, `${id} ${band.name}: neutral track steel, not camouflage`);
    assert.equal(band.material.roughness, M60_TRACK_FINISH.trackBandRoughness, `${id} ${band.name}: exposed track steel stays matte`);
    assert.equal(band.userData.appearanceRole, 'trackBand', `${id} ${band.name}: its running-gear role`);
  }

  tank.root.updateMatrixWorld(true);
  const spec = getSpec(id);
  const marker = tank.root.getObjectByName('rig_muzzle').getWorldPosition(new THREE.Vector3());
  const mouthRing = tank.root.getObjectByName('muzzleBoreShadowFallback').getWorldPosition(new THREE.Vector3());
  const authorityMuzzleZ = spec.armor.turretPivot[2] + spec.armor.gunPivot[2] + spec.armor.gunBarrel.lengthM;
  assert.ok(Math.abs(authorityMuzzleZ - marker.z) < 2e-3,
    `${id}: the authority barrel ends on the muzzle marker (${authorityMuzzleZ} vs ${marker.z})`);
  assert.ok(Math.abs(authorityMuzzleZ - mouthRing.z) < 0.02,
    `${id}: the shell origin is within 2 cm of the visible mouth (${authorityMuzzleZ} vs ${mouthRing.z})`);
  tank.dispose();
}

console.log('m60FamilyAttachments.selftest: the rebuilt M60A1/A3 at true size, the A1\'s light on the gun, one band a side, the muzzle authority');
