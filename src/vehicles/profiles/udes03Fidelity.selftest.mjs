// 274 (owner 2026-11-20: "redesign the udes to be more like a prototype of the strv 103a"): the UDES 03 is the S-tank's
// trials prototype on the family casemate (profiles/strv103Family.ts mark p): the A hull and running gear, its shorter
// 105 mm test tube, bare fenders without the production bins or Ksp box, ballast plates on the glacis, the trials kit.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

const visual = createTank('udes03', null, { proceduralOnly: true, quality: 'high', camoSeed: 4242, geometryReceipt: true });
visual.root.updateMatrixWorld(true);
const hull = visual.root.getObjectByName('rig_hull');
assert.ok(hull, 'UDES 03 owns an articulated hull rig');

const gear = hull.userData.runningGearReceipts?.[0];
assert.equal(hull.userData.nativeRoadWheelStations, 4, 'the S-tank four-wheel course');
assert.ok(gear.sprocket.z > 0 && gear.idler.z < 0, 'front drive, raised rear idler: the S-tank layout');
assert.equal(hull.userData.fixedGunPort?.axisY, 1.59, 'the gun leaves through the family port at the A bore');

const bore = visual.root.getObjectByName('muzzleBoreShadowDisc').getWorldPosition(new THREE.Vector3());
assert.ok(Math.abs(bore.x) < 1e-6 && Math.abs(bore.y - 1.59) < 0.01, 'the fixed gun rides the A bore');
assert.ok(bore.z > 4.12 && bore.z < 4.15, 'the shorter trials tube ends at the published 7.65 overall');
assert.equal(visual.root.getObjectByName('strv103_side_tow_rope'), undefined, 'bare fenders: no production bins or rope');
let turretMeshes = 0;
visual.root.getObjectByName('rig_turret')?.traverse((o) => { if (o.isMesh) turretMeshes++; });
assert.equal(turretMeshes, 0, 'fixed mount: the virtual turret rig stays empty');

console.log('udes03Fidelity.selftest: the S-tank trials prototype (A casemate, short tube, bare fenders) passed');
