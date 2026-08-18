import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';

const tank = createTank('leo2a4', null, {
  proceduralOnly: true,
  geometryReceipt: true,
  quality: 'high',
});
tank.root.updateMatrixWorld(true);

const hullRig = tank.root.getObjectByName('rig_hull');
const turretRig = tank.root.getObjectByName('rig_turret');
assert.ok(hullRig && turretRig, 'Leopard 2A4 retains canonical hull/turret rigs');

const get = (name) => {
  const object = tank.root.getObjectByName(name);
  assert.ok(object?.isMesh && object.geometry, `${name} is a merged equipment mesh`);
  return object;
};
const hullNet = get('leo2a4_ghillie_hull_net');
const turretNet = get('leo2a4_ghillie_turret_net');
get('leo2a4_ghillie_hull_light');
get('leo2a4_ghillie_hull_dark');
get('leo2a4_ghillie_turret_light');
get('leo2a4_ghillie_turret_dark');

const belongsTo = (object, parent) => {
  for (let node = object; node; node = node.parent) if (node === parent) return true;
  return false;
};
assert.ok(belongsTo(hullNet, hullRig), 'hull ghillie is hull-owned');
assert.ok(belongsTo(turretNet, turretRig), 'turret ghillie yaws with the turret');

const hullBounds = new THREE.Box3().setFromObject(hullNet);
assert.ok(hullBounds.min.x <= -1.80 && hullBounds.max.x >= 1.80,
  'ghillie reaches both hull skirt faces');
assert.ok(hullBounds.min.z <= -3.79 && hullBounds.max.z >= 3.87,
  'ghillie covers the complete rear-to-bow hull envelope');
assert.ok(hullBounds.min.y >= 0.56,
  'hull ghillie stays above the road-wheel and linked-track corridor');

const completeGhillie = new THREE.Box3();
for (const name of [
  'leo2a4_ghillie_hull_net', 'leo2a4_ghillie_hull_light', 'leo2a4_ghillie_hull_dark',
  'leo2a4_ghillie_turret_net', 'leo2a4_ghillie_turret_light', 'leo2a4_ghillie_turret_dark',
]) completeGhillie.union(new THREE.Box3().setFromObject(get(name)));
assert.ok(completeGhillie.min.x >= -1.85 && completeGhillie.max.x <= 1.85,
  'broken-outline leaves remain inside the certified 3.70 m A4 width');

const downHits = (x, worldZ) => new THREE.Raycaster(
  new THREE.Vector3(x, 5, worldZ), new THREE.Vector3(0, -1, 0), 0, 10,
).intersectObject(turretNet, false);
for (const [label, x, z] of [
  ['commander hatch', 0.60, -0.45],
  ['loader hatch', -0.64, -0.25],
  ['EMES sight', 0.64, 1.05],
]) assert.equal(downHits(x, z).length, 0, `${label} has an explicit roof opening`);
for (const [x, z] of [[-0.90, 1.00], [-1.00, -0.90], [0, -1.85]]) {
  assert.ok(downHits(x, z).length > 0, `nearby crown armor remains covered at (${x}, ${z})`);
}

const topHit = (object, x, z) => new THREE.Raycaster(
  new THREE.Vector3(x, 5, z), new THREE.Vector3(0, -1, 0), 0, 10,
).intersectObject(object, false)[0];
const turretArmor = tank.root.getObjectByName('turret');
const hullArmor = tank.root.getObjectByName('hull');
const turretClothHit = topHit(turretNet, 0, -0.90);
const turretArmorHit = topHit(turretArmor, 0, -0.90);
assert.ok(turretClothHit && turretArmorHit
  && turretClothHit.point.y - turretArmorHit.point.y >= 0.05,
'turret shroud is a separately suspended cloth layer with a visible air gap');
const hullClothHit = topHit(hullNet, 0, -3.20);
const hullArmorHit = topHit(hullArmor, 0, -3.20);
assert.ok(hullClothHit && hullArmorHit && hullClothHit.point.y - hullArmorHit.point.y >= 0.04,
  'hull blanket floats above the deck instead of re-skinning the armor surface');

const gunCorridorHits = new THREE.Raycaster(
  new THREE.Vector3(0, 1.90, 6), new THREE.Vector3(0, 0, -1), 0, 10,
).intersectObject(turretNet, false);
assert.ok(gunCorridorHits.every((hit) => hit.point.z < -1.9),
  'front ghillie leaves the complete mantlet/recoil corridor open');

const otco = createTank('leo2a4_otco', null, {
  proceduralOnly: true,
  geometryReceipt: true,
  quality: 'high',
});
assert.equal(otco.root.getObjectByName('leo2a4_ghillie_hull_net'), undefined,
  'the separate OTCO variant does not inherit the base A4 field suit');

tank.dispose();
otco.dispose();
console.log('Leopard 2A4 full-ghillie selftest passed');
