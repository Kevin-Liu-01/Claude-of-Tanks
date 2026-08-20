import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import {
  createDedicatedWorldCollision,
  dedicatedCollisionManifestStats,
} from './dedicatedWorldCollision.js';
import { MAP_IDS } from '../src/world/maps/index.js';

const expected = {
  verdant: [3826, 473, 4114],
  desert: [1749, 550, 1255],
  winter: [3647, 527, 2890],
  urban: [1757, 978, 606],
  coastal: [2234, 464, 1603],
  autumn: [3747, 477, 3997],
  steppe: [1327, 531, 514],
  railyard: [1112, 459, 425],
  frontier: [4334, 595, 4512],
  fjord: [3555, 592, 2752],
  delta: [4913, 392, 6157],
  badlands: [2035, 729, 1063],
  monsoon: [5975, 674, 7754],
  alpine: [4879, 719, 3897],
  caldera: [2962, 844, 1868],
  foundry: [2155, 587, 1167],
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

console.log('dedicatedWorldCollision.selftest: all sixteen exact map manifests passed');
