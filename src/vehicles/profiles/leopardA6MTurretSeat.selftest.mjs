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

console.log('Leopard 2A6M turret-seat selftest passed');
