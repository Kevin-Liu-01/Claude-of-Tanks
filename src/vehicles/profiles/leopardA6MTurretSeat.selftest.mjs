import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';

const visual = createTank('leo2a6m', null, {
  proceduralOnly: true,
  geometryReceipt: true,
});
visual.root.updateMatrixWorld(true);

const turretRig = visual.root.getObjectByName('rig_turret');
const hullRig = visual.root.getObjectByName('rig_hull');
assert.ok(turretRig && hullRig, 'leo2a6m keeps the canonical hull/turret rig');

const findMesh = (root, name) => {
  let found = null;
  root.traverse((node) => {
    if (!found && node.isMesh && node.name === name) found = node;
  });
  assert.ok(found, `leo2a6m has merged ${name} geometry`);
  return found;
};

const turret = findMesh(turretRig, 'turret');
const detail = findMesh(turretRig, 'turretDetail');
const hull = findMesh(hullRig, 'hull');

const downHits = (mesh, x, localZ) => {
  const ray = new THREE.Raycaster(
    new THREE.Vector3(x, 4, localZ + turretRig.position.z),
    new THREE.Vector3(0, -1, 0),
    0,
    10,
  );
  return ray.intersectObject(mesh, false).map((hit) => hit.point.y);
};

// The exact user-marked lug used to occupy this ray at world y~2.50 while
// the cheek surface sat at ~2.14.  Nothing may remain in that air column.
assert.equal(downHits(detail, 0.55, 2.28).length, 0,
  'marked freestanding A6M apex lug is removed');

// Every replacement fastener is a low-profile head embedded in the sloped
// armor: the first detail hit can stand no more than 22 mm above the first
// structural armor hit on the same vertical ray.
for (const [x, z] of [[0.47, 2.30], [0.62, 2.17], [0.79, 2.02], [1.00, 1.67], [1.18, 1.43]]) {
  const armorY = downHits(turret, x, z)[0];
  const detailY = downHits(detail, x, z)[0];
  assert.ok(Number.isFinite(armorY) && Number.isFinite(detailY),
    `A6M fastener ray (${x},${z}) intersects detail and armor`);
  assert.ok(detailY - armorY <= 0.022 && detailY - armorY >= -0.004,
    `A6M fastener at (${x},${z}) is surface-seated (${detailY - armorY} m gap)`);
}

// Crown-return sample rays must hit connected armor through the former open
// triangle between the arrow wedge and the forward V-roof.
for (const [x, z] of [[0.55, 1.25], [0.85, 1.00]]) {
  const hits = downHits(turret, x, z);
  assert.ok(hits.length > 0 && hits[0] > 2.30,
    `A6M crown return closes roof/wedge ray (${x},${z})`);
}

// The 2A6-pattern center brow now bridges the two inner cheek edges above
// the gun.  These centerline rays used to miss entirely at z >= 1.85; the
// replacement must form a continuous, sloping structural roof without
// dropping into the 2.13 m gun-axis corridor.
for (const [z, minY, maxY] of [
  [1.85, 2.32, 2.40],
  [2.10, 2.28, 2.36],
  [2.18, 2.25, 2.33],
]) {
  const hits = downHits(turret, 0, z);
  assert.ok(hits.length > 0 && hits[0] >= minY && hits[0] <= maxY,
    `A6M center brow seats above the gun at z=${z} (${hits[0]} m)`);
}
const gunAxisY = turretRig.position.y + 0.33;
const forwardGunCorridorHits = new THREE.Raycaster(
  new THREE.Vector3(0, gunAxisY, 4.0 + turretRig.position.z),
  new THREE.Vector3(0, 0, -1), 0, 1.8,
).intersectObject(turret, false);
assert.equal(forwardGunCorridorHits.length, 0,
  'A6M brow leaves the forward L/55 gun corridor open');

// The bearing collar reaches the 1.67 m hull deck instead of leaving the
// old 35-40 mm air slit under the dark turret basket.
const turretBounds = new THREE.Box3().setFromObject(turret);
assert.ok(turretBounds.min.y >= 1.64 && turretBounds.min.y <= 1.67,
  `A6M bearing collar lands on deck (${turretBounds.min.y} m)`);
const hullDeck = new THREE.Raycaster(
  new THREE.Vector3(0.8, 4, 0.35), new THREE.Vector3(0, -1, 0), 0, 10,
).intersectObject(hull, false)[0]?.point.y;
assert.ok(Number.isFinite(hullDeck) && turretBounds.min.y <= hullDeck + 0.002,
  `A6M bearing overlaps hull deck (${turretBounds.min.y} <= ${hullDeck})`);

// The cage keeps its low protective rail, but every lower bracket now rises
// to the real skirt face before turning inward.  Six sections on each side
// must therefore report the same continuous rail -> heel -> skirt path.
const cageReceipts = hullRig.userData.leopardSlatMountReceipts;
assert.equal(cageReceipts?.length, 12, 'A6M records both six-section cage runs');
for (const receipt of cageReceipts) {
  assert.equal(receipt.outerX, 1.990, 'A6M cage retains the certified outer plane');
  assert.equal(receipt.seatX, 1.875, 'A6M cage bracket reaches the skirt seat');
  assert.equal(receipt.railY, 0.78, 'A6M cage retains its lower protective rail');
  assert.equal(receipt.lowerMountY, 0.90, 'A6M lower bracket lands on the skirt face');
  assert.ok(receipt.lowerMountY > receipt.railY,
    'A6M cage has a vertical heel between its lower rail and skirt mount');
}

// The same cheek-fitting roof bridge is a family component on both the A6M
// and A6.  Its dimensions follow the crown-return opening exactly.
const expectedBridge = {
  frontZ: 2.20,
  rearZ: 0.50,
  frontHalfWidth: 0.39,
  rearHalfWidth: 0.28,
  ribZ: [0.82, 1.14, 1.46],
};
assert.deepEqual(turretRig.userData.leopardA6MantletRoofBridge, expectedBridge,
  'A6M uses the fitted family mantlet-roof bridge');

const a6 = createTank('leo2a6', null, {
  proceduralOnly: true,
  geometryReceipt: true,
});
a6.root.updateMatrixWorld(true);
const a6TurretRig = a6.root.getObjectByName('rig_turret');
const a6GunRig = a6.root.getObjectByName('rig_gun');
const a6MuzzleRig = a6.root.getObjectByName('rig_muzzle');
assert.ok(a6TurretRig && a6GunRig && a6MuzzleRig,
  'leo2a6 keeps its canonical turret, gun, and muzzle rigs');
assert.deepEqual(a6TurretRig.userData.leopardA6MantletRoofBridge, expectedBridge,
  'A6 uses the same fitted family mantlet-roof bridge as the A6M');

const a6Gun = findMesh(a6GunRig, 'gun');
const a6GunDark = findMesh(a6GunRig, 'gunDark');
const physicalGunFaceZ = Math.max(
  new THREE.Box3().setFromObject(a6Gun).max.z,
  new THREE.Box3().setFromObject(a6GunDark).max.z,
);
const muzzleWorld = new THREE.Vector3();
a6MuzzleRig.getWorldPosition(muzzleWorld);
assert.ok(Math.abs(muzzleWorld.z - physicalGunFaceZ) <= 0.012,
  `A6 muzzle rig sits on the physical barrel face (${muzzleWorld.z} vs ${physicalGunFaceZ})`);

console.log('Leopard 2A6M turret-seat selftest passed');
