import assert from 'node:assert/strict';
import * as THREE from 'three';
import './profiles/t14RoofFidelity.selftest.mjs';
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
