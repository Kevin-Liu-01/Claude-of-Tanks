import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

const tank = createTank('m48a5_patton', null, { proceduralOnly: true, geometryReceipt: true });
const turretRig = tank.root.getObjectByName('rig_turret');
const turret = tank.root.getObjectByName('turret');
assert.ok(turretRig && turret, 'M48 structural turret remains complete');

const receipts = turretRig.userData.m48RoofSeatReceipts;
assert.deepEqual(receipts?.map((receipt) => receipt.id),
  ['loader-hatch', 'commander-cupola', 'gunner-sight'],
  'all three marked M48 roof fittings receive explicit cast supports');
for (const receipt of receipts) {
  assert(receipt.roofContactMarginM >= 0.007,
    `${receipt.id}: support embeds into the measured cast roof`);
  assert(receipt.fittingOverlapM >= 0.002,
    `${receipt.id}: support overlaps the fitting underside`);
  assert(receipt.perimeterSamples >= 4,
    `${receipt.id}: support follows the local roof instead of using a point mount`);
}

const seatReceipt = turretRig.userData.m48TurretSeatReceipt;
// (2026-10-25, the owner: "redesign and refit the m48a5 turret": the reference-sized dome sits on its ring; the turret
// seat (turretSeatRace.ts) stands its underside over the deck, so the 55 mm rig lift is gone)
assert.deepEqual(seatReceipt, {
  sourceRingY: 1.595,
  liftM: 0,
  seatedRingY: 1.595,
}, 'M48 turret sits on its ring, seated over the deck by the turret seat');
assert(Math.abs(turretRig.position.y - seatReceipt.seatedRingY) < 1e-9,
  'complete articulated turret is placed at the reseated ring height');
const gunRig = tank.root.getObjectByName('rig_gun');
const gunWorld = gunRig.getWorldPosition(new THREE.Vector3());
assert(Math.abs(gunWorld.y - 1.93) < 1e-9,
  'gun, mantlet, and recoil rig rise with the turret instead of remaining in the hull');

const position = turret.geometry.getAttribute('position');
// (2026-10-25: 996 with the rear-left drum gone, 1124 with it)
assert(position && position.count / 3 >= 990,
  'M48 turret contains the three merged roof-seat solids without extra draw meshes');
const bounds = new THREE.Box3().setFromObject(turret);
assert(Number.isFinite(bounds.min.y) && Number.isFinite(bounds.max.y),
  'M48 roof-seat geometry preserves a finite structural envelope');

tank.dispose();
console.log('m48RoofSeating.selftest: loader hatch, commander cupola, and gunner sight are cast-roof seated');
