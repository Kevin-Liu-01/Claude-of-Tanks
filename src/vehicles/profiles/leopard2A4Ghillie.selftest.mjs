import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

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
// 2026-10-05 (tank-accessories lane): the suit runs on the shared builder; its garnish is one spray-card draw per owner
get('leo2a4_ghillie_hull_leaves');
get('leo2a4_ghillie_turret_leaves');

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
  'leo2a4_ghillie_hull_net', 'leo2a4_ghillie_hull_leaves',
  'leo2a4_ghillie_turret_net', 'leo2a4_ghillie_turret_leaves',
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
// 2026-10-08 (tank-accessories round 5): the suit is laid against the assembled armour. A heavy garnished net rests on
// the plate between what holds it up (the rolls bunched round the openings, the sticks pushed under it on the crown,
// its own folds and creases) and sags back onto the plate between them, so one sample point no longer measures its
// stand-off (the round-4 slab floated at one height, which the critics read as "shrink-wrapped" and "a fence"). The
// shroud is still its own suspended layer: around each sample it never sinks into the armour, and it stands clear of
// it — 5 cm on the crown, 3 cm on the deck — somewhere within 35 cm.
const clothGaps = (cloth, armor, cx, cz) => {
  const gaps = [];
  for (let dx = -0.35; dx <= 0.351; dx += 0.07) for (let dz = -0.35; dz <= 0.351; dz += 0.07) {
    const c = topHit(cloth, cx + dx, cz + dz), a = topHit(armor, cx + dx, cz + dz);
    if (c && a) gaps.push(c.point.y - a.point.y);
  }
  return gaps;
};
const crownGaps = clothGaps(turretNet, turretArmor, 0, -0.90);
assert.ok(crownGaps.length > 20 && Math.min(...crownGaps) > 0.003 && Math.max(...crownGaps) >= 0.05,
  `turret shroud is a separately suspended cloth layer with a visible air gap (${Math.min(...crownGaps).toFixed(3)}..${Math.max(...crownGaps).toFixed(3)} m)`);
const deckGaps = clothGaps(hullNet, hullArmor, 0, -3.20);
assert.ok(deckGaps.length > 20 && Math.min(...deckGaps) > 0.003 && Math.max(...deckGaps) >= 0.03,
  `hull blanket floats above the deck instead of re-skinning the armor surface (${Math.min(...deckGaps).toFixed(3)}..${Math.max(...deckGaps).toFixed(3)} m)`);

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
const otcoTurretRig = otco.root.getObjectByName('rig_turret');
const otcoTurretArmor = otcoTurretRig?.getObjectByName('turret');
const otcoTurretCloth = otcoTurretRig?.getObjectByName('turretCloth');
assert.ok(otcoTurretRig && otcoTurretArmor?.isMesh && otcoTurretCloth?.isMesh,
  'OTCO publishes separate turret armor and genuine canvas equipment meshes');
assert.equal(otcoTurretArmor.material.userData.camoProjection, 'vehicle-scale-box-uv',
  'OTCO structural turret surfaces inherit the vehicle-scale camouflage projection');
assert.equal(otcoTurretCloth.material.userData.camoProjection, undefined,
  'OTCO keeps genuine canvas stowage outside the projected armor camouflage');
const hasLocalVertex = (mesh, expected, epsilon = 1e-5) => {
  const positions = mesh.geometry.getAttribute('position');
  for (let index = 0; index < positions.count; index++) {
    if (Math.abs(positions.getX(index) - expected[0]) <= epsilon
      && Math.abs(positions.getY(index) - expected[1]) <= epsilon
      && Math.abs(positions.getZ(index) - expected[2]) <= epsilon) return true;
  }
  return false;
};
for (const side of [-1, 1]) {
  for (const point of [
    [side * 0.52, 0.22, 1.62],
    [side * 1.50, 0.20, 1.20],
    [side * 1.48, 0.34, 1.14],
    [side * 0.61, 0.31, -1.98],
  ]) {
    assert.ok(hasLocalVertex(otcoTurretArmor, point),
      `OTCO structural shroud vertex ${point.join(',')} belongs to camouflaged turret armor`);
    assert.equal(hasLocalVertex(otcoTurretCloth, point), false,
      `OTCO structural shroud vertex ${point.join(',')} is excluded from canvas stowage`);
  }
}
assert.deepEqual(otcoTurretRig.userData.leopard2A4OTCOTurretCamoReceipt, {
  architecture: 'mirrored-structural-side-shrouds',
  visibleMaterial: 'cot:armor-paint',
  bucket: 'turret',
  excludesCanvasStowage: true,
  mirrored: true,
}, 'OTCO records the structural camouflage ownership contract');

tank.dispose();
otco.dispose();
console.log('Leopard 2A4 full-ghillie selftest passed');
