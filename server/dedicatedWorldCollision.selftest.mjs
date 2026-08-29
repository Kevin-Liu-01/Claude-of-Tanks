import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import {
  createDedicatedWorldCollision,
  dedicatedCollisionManifestStats,
} from './dedicatedWorldCollision.ts';
import { MAP_IDS } from '../src/world/maps/index.ts';

const expected = {
  verdant: [6619, 6312, 6873],
  desert: [2408, 2308, 1847],
  winter: [5125, 4854, 4319],
  urban: [3663, 3409, 2479],
  coastal: [3440, 3156, 2789],
  autumn: [6004, 5679, 6203],
  steppe: [2175, 1848, 1340],
  railyard: [2664, 2353, 1947],
  frontier: [7364, 7022, 7537],
  fjord: [6534, 6233, 5758],
  delta: [7762, 7400, 8989],
  badlands: [2855, 2546, 1889],
  monsoon: [9975, 9646, 11754],
  alpine: [8850, 8533, 7898],
  caldera: [4732, 4408, 3621],
  foundry: [4039, 3614, 3077],
  ruinspires: [3020, 2557, 1331],
  blackglass: [3544, 3178, 2294],
  titan_gorge: [2489, 2167, 1181],
  skybridge: [3083, 2763, 1830],
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

const collider = world.getColliders().find((record) => !record.dead);
const centerZ = (collider.min[2] + collider.max[2]) * 0.5;
const centerY = (collider.min[1] + collider.max[1]) * 0.5;
const origin = new Vector3(collider.min[0] - 2, centerY, centerZ);
const hit = world.raycast(origin, new Vector3(1, 0, 0), collider.max[0] - collider.min[0] + 4);
assert.equal(hit?.kind, 'prop', 'headless raycast resolves captured shell cover');

console.log('dedicatedWorldCollision.selftest: all twenty exact map manifests passed');
