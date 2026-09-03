import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import {
  createDedicatedWorldCollision,
  dedicatedCollisionManifestStats,
} from './dedicatedWorldCollision.ts';
import { MAP_IDS } from '../src/world/maps/index.ts';

const expected = {
  verdant: [6660, 6385, 6920],
  desert: [2401, 2338, 1823],
  winter: [5200, 4972, 4380],
  urban: [3613, 5310, 2399],
  coastal: [3428, 3199, 2741],
  autumn: [6017, 5724, 6200],
  steppe: [2261, 1960, 1394],
  railyard: [2708, 2558, 1973],
  frontier: [7454, 7180, 7586],
  fjord: [6207, 6016, 5400],
  delta: [7708, 7437, 8970],
  badlands: [2859, 2688, 1890],
  monsoon: [9848, 9594, 11597],
  alpine: [8552, 8346, 7574],
  caldera: [4396, 4269, 3265],
  foundry: [3925, 3772, 2939],
  ruinspires: [2834, 5281, 1159],
  blackglass: [3542, 4367, 2270],
  titan_gorge: [2500, 2302, 1161],
  skybridge: [3026, 3087, 1790],
};
const stats = dedicatedCollisionManifestStats();
assert.deepEqual(Object.keys(stats), MAP_IDS, 'manifest order and map registry stay in lockstep');
for (const [mapId, counts] of Object.entries(expected)) {
  assert.deepEqual(Object.values(stats[mapId]), counts, `${mapId} manifest census`);
  const mapWorld = createDedicatedWorldCollision(mapId);
  const hedgehogObstacles = mapWorld.getObstacles().filter((record) => record.kind === 'hedgehog');
  const hedgehogColliders = mapWorld.getColliders().filter((record) => record.kind === 'hedgehog');
  assert.ok(hedgehogObstacles.length >= 3 && hedgehogObstacles.length % 3 === 0,
    `${mapId} hedgehogs remain complete three-beam compounds`);
  assert.equal(hedgehogColliders.length, hedgehogObstacles.length,
    `${mapId} movement and shell hedgehog censuses agree`);
  assert.ok(hedgehogObstacles.every((record) => record.shape2?.kind === 'obb'),
    `${mapId} dedicated movement preserves narrow hedgehog beam shapes`);
  assert.ok(hedgehogColliders.every((record) => record.shape2?.kind === 'obb'),
    `${mapId} dedicated shell collision preserves narrow hedgehog beam shapes`);
  const treeObstacles = mapWorld.getObstacles().filter((record) => record.treeIdx != null);
  const treeColliders = mapWorld.getColliders().filter((record) => record.treeIdx != null);
  assert.ok(treeObstacles.length > 0, `${mapId} captures reachable trees as movement obstacles`);
  assert.equal(treeColliders.length, treeObstacles.length,
    `${mapId} movement and shell tree censuses agree`);
  assert.ok(treeObstacles.every((record) => record.crushable && record.kind === 'tree'),
    `${mapId} every reachable tree follows the shared destruction behavior`);
  assert.ok(treeObstacles.every((record) => record.crushMin === 0 && record.crushKeep === 1),
    `${mapId} trees topple immediately without becoming invisible speed bumps`);
}

const world = createDedicatedWorldCollision('verdant');
assert.equal(world.getObstacles().length, expected.verdant[0]);
assert.equal(world.getColliders().length, expected.verdant[1]);
assert.equal(world.getConcealment().length, expected.verdant[2]);
assert.ok(world.getObstacles().some((record) => record.shape2?.kind === 'convex'));
assert.ok(world.getObstacles().some((record) => record.crushable));
const destructible = world.getObstacles().find((record) => record.crushable &&
  record.propIdx != null && world.getColliders().some((entry) => entry.propIdx === record.propIdx));
const destructibleCollider = world.getColliders().find((record) =>
  record.propIdx === destructible.propIdx);
assert.equal(world.crushObstacle(destructible), true);
assert.equal(destructibleCollider.dead, true, 'destroyed server cover opens shell and LOS paths');

const tree = world.getObstacles().find((record) => record.treeIdx != null);
const treeCollider = world.getColliders().find((record) => record.treeIdx === tree.treeIdx);
assert.equal(world.crushObstacle(tree), true, 'dedicated tree yields to shell or ram destruction');
assert.equal(treeCollider.dead, true, 'felled dedicated tree leaves the shell/LOS collider set');

const shapeCenter = (shape, record) => {
  if (!shape) return [(record.min[0] + record.max[0]) * 0.5, (record.min[2] + record.max[2]) * 0.5];
  if (shape.kind === 'compound') return shapeCenter(shape.parts[0], record);
  return [shape.cx, shape.cz];
};
let hit = null;
for (const collider of world.getColliders()) {
  if (collider.dead || collider.max[1] - collider.min[1] < 0.2) continue;
  const [centerX, centerZ] = shapeCenter(collider.shape2, collider);
  hit = world.raycast(
    new Vector3(centerX, collider.max[1] + 2, centerZ),
    new Vector3(0, -1, 0),
    collider.max[1] - collider.min[1] + 4,
  );
  if (hit?.kind === 'prop') break;
}
assert.equal(hit?.kind, 'prop', 'headless raycast resolves captured shell cover');
const compound = world.getColliders().find((record) => record.shape2?.kind === 'compound');
assert.ok(compound, 'dedicated manifest retains compound structure footprints');
assert.ok(compound.shape2.parts.length >= 2 && compound.shape2.parts.length <= 64,
  'dedicated compound remains tight and bounded after inflation');

console.log('dedicatedWorldCollision.selftest: all twenty exact map manifests passed');
