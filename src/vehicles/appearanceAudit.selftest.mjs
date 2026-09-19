import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  auditTankAppearance, normalizeTankAppearance, tagVehicleMaterial,
  VEHICLE_APPEARANCE_PALETTE,
} from './appearanceAudit.ts';

const root = new THREE.Group();
const badTrack = tagVehicleMaterial(new THREE.MeshStandardMaterial({ color: 0x6e603c }), 'trackSteel');
const shoe = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), badTrack);
shoe.name = 'gearTrackPads';
shoe.userData.runningGear = true;
root.add(shoe);
assert.equal(auditTankAppearance(root).issues[0]?.code, 'saturated-running-gear');
normalizeTankAppearance(root);
assert.equal(badTrack.color.getHex(), VEHICLE_APPEARANCE_PALETTE.trackSteel);
assert.deepEqual(auditTankAppearance(root).issues, []);

const armor = tagVehicleMaterial(new THREE.MeshStandardMaterial({ color: 0x4a5a32 }), 'armorPaint');
const guard = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), armor);
guard.name = 'hullTrackGuardL';
guard.userData.trackGuard = true;
root.add(guard);
normalizeTankAppearance(root);
assert.equal(armor.color.getHex(), 0x4a5a32, 'camouflage armor is never normalized as gear');
assert.deepEqual(auditTankAppearance(root).issues, []);

console.log('appearanceAudit.selftest: semantic gear palette and armor protection pass');

// The real native shoe shader multiplies material.color by instanceColor.
// Normalize exactly once; keep the shared near/far palette and buffer intact.
const shoeMaterial=tagVehicleMaterial(new THREE.MeshStandardMaterial({color:0xffffff}),'trackPad');
shoeMaterial.userData.appearanceColorSource='instance-palette';
const near=new THREE.InstancedMesh(new THREE.BoxGeometry(.5,.05,.15),shoeMaterial,3);
const shades=[0x2e302f,0x373a38,0x3e413e];
shades.forEach((hex,i)=>near.setColorAt(i,new THREE.Color(hex)));
near.userData.runningGear=true;
const far=new THREE.InstancedMesh(near.geometry,shoeMaterial,3);
far.instanceColor=near.instanceColor;far.userData.runningGear=true;
const tracks=new THREE.Group();tracks.add(near,far);
const original=near.instanceColor.array.slice();
normalizeTankAppearance(tracks);normalizeTankAppearance(tracks);
assert.equal(shoeMaterial.color.getHex(),0xffffff,'instance shade is not multiplied by a second dark base');
assert.deepEqual(near.instanceColor.array,original,'neutral source palettes retain their exact linear colors');
assert.equal(near.instanceColor,far.instanceColor,'near/far still share one immutable color buffer');
for(let i=0;i<3;i++) {
  const color=new THREE.Color();near.getColorAt(i,color);color.multiply(shoeMaterial.color);
  assert.equal(color.getHex(),shades[i],'effective shader color equals the intended track shade');
}
near.setColorAt(0,new THREE.Color(0x447711));
assert.ok(auditTankAppearance(tracks).issues.some(issue=>issue.code==='saturated-running-gear'),
  'instance color cannot bypass the neutral working-gear audit');
normalizeTankAppearance(tracks);
assert.deepEqual(auditTankAppearance(tracks).issues,[]);
console.log('appearanceAudit: shared near/far shoe palettes normalize once and retain neutral-color enforcement');

// Separate native batches can share a material without sharing their palette.
const extra = new THREE.InstancedMesh(near.geometry, shoeMaterial, 1);
extra.setColorAt(0, new THREE.Color(0x336611));
tracks.add(extra);
normalizeTankAppearance(tracks);
const extraColor = new THREE.Color();
extra.getColorAt(0, extraColor);
assert.equal(extraColor.getHex(), VEHICLE_APPEARANCE_PALETTE.trackPad);
assert.deepEqual(near.instanceColor.array.slice(3), original.slice(3));
assert.deepEqual(auditTankAppearance(tracks).issues, []);
