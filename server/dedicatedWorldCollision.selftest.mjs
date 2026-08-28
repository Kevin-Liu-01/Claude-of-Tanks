import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import {
  createDedicatedWorldCollision,
  dedicatedCollisionManifestStats,
} from './dedicatedWorldCollision.js';
import { MAP_IDS } from '../src/world/maps/index.js';

const expected = {
  verdant: [3816, 490, 4091],
  desert: [1792, 579, 1250],
  winter: [3566, 547, 2765],
  urban: [1786, 1003, 606],
  coastal: [2203, 470, 1552],
  autumn: [3694, 498, 3860],
  steppe: [1424, 546, 601],
  railyard: [1156, 481, 425],
  frontier: [4338, 599, 4512],
  fjord: [3558, 595, 2752],
  delta: [4933, 403, 6157],
  badlands: [2037, 741, 1063],
  monsoon: [6015, 688, 7754],
  alpine: [4878, 723, 3897],
  caldera: [2982, 862, 1868],
  foundry: [2138, 597, 1167],
  ruinspires: [1717, 1254, 22],
  blackglass: [1988, 913, 737],
  titan_gorge: [1982, 1033, 669],
  skybridge: [2286, 969, 1052],
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

const collider = world.getColliders().find((record) => !record.dead);
const centerZ = (collider.min[2] + collider.max[2]) * 0.5;
const centerY = (collider.min[1] + collider.max[1]) * 0.5;
const origin = new Vector3(collider.min[0] - 2, centerY, centerZ);
const hit = world.raycast(origin, new Vector3(1, 0, 0), collider.max[0] - collider.min[0] + 4);
assert.equal(hit?.kind, 'prop', 'headless raycast resolves captured shell cover');

console.log('dedicatedWorldCollision.selftest: all twenty exact map manifests passed');
