import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import {
  createDedicatedWorldCollision,
  dedicatedCollisionManifestStats,
} from './dedicatedWorldCollision.js';
import { MAP_IDS } from '../src/world/maps/index.js';

const expected = {
  verdant: [3771, 448, 4114],
  desert: [1768, 533, 1283],
  winter: [3621, 509, 2890],
  urban: [1727, 946, 606],
  coastal: [2162, 447, 1575],
  autumn: [3723, 462, 3997],
  steppe: [1304, 519, 514],
  railyard: [1092, 431, 425],
  frontier: [4113, 517, 4376],
  fjord: [3938, 583, 3206],
  delta: [4729, 385, 6132],
  badlands: [1923, 691, 1004],
  monsoon: [5821, 639, 7733],
  alpine: [4681, 677, 3809],
  caldera: [2889, 835, 1820],
  foundry: [2028, 495, 1211],
};
const stats = dedicatedCollisionManifestStats();
assert.deepEqual(Object.keys(stats), MAP_IDS, 'manifest order and map registry stay in lockstep');
for (const [mapId, counts] of Object.entries(expected)) {
  assert.deepEqual(Object.values(stats[mapId]), counts, `${mapId} manifest census`);
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
