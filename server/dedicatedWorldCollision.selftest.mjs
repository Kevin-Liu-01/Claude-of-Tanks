import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { Vector3 } from 'three';
import {
  createDedicatedWorldCollision,
  dedicatedCollisionManifestStats,
} from './dedicatedWorldCollision.ts';
import { MAP_IDS } from '../src/world/maps/index.ts';

const expected = {
  verdant: [6501, 6250, 6763],
  desert: [2381, 2337, 1823],
  winter: [5085, 4870, 4281],
  urban: [3590, 5302, 2399],
  coastal: [3308, 3103, 2648],
  autumn: [6085, 5811, 6261],
  steppe: [2234, 1950, 1392],
  railyard: [2708, 2547, 1973],
  frontier: [7436, 7174, 7583],
  fjord: [6377, 6218, 5597],
  delta: [7119, 6877, 8532],
  badlands: [2841, 2677, 1888],
  monsoon: [9269, 9034, 11093],
  alpine: [8539, 8342, 7575],
  caldera: [4684, 4579, 3572],
  foundry: [3946, 3791, 2939],
  ruinspires: [2822, 5138, 1159],
  blackglass: [3515, 4371, 2270],
  titan_gorge: [2472, 2284, 1144],
  skybridge: [3108, 3161, 1892],
  polders: [4051, 3823, 3506],
  copper_mesa: [2560, 2379, 1812],
  airfield: [3252, 3226, 2823],
  oasis: [2470, 2257, 1852],
  whiteout: [1449, 1267, 805],
  orchard: [4403, 4163, 4454],
  longleaf: [5631, 5421, 6154],
  mangrove: [4918, 4740, 5666],
  saltwind: [3349, 3158, 2723],
  reservoir: [5932, 5749, 6443],
};
const stats = dedicatedCollisionManifestStats();
assert.deepEqual(Object.keys(expected), MAP_IDS, 'every registered map has a fixed census expectation');
assert.deepEqual(Object.keys(stats), MAP_IDS, 'manifest order and map registry stay in lockstep');
assert.deepEqual(readdirSync(new URL('./world-collision-manifests/', import.meta.url))
  .filter((file) => file.endsWith('.json') && file !== 'index.json').sort(),
MAP_IDS.map((id) => `${id}.json`).sort(), 'exactly one collision shard exists for every canonical map');
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
const compoundStructure = world.getObstacles().find((record) => record.shape2?.kind === 'compound');
assert.ok(compoundStructure && compoundStructure.shape2.parts.length >= 2,
  'dedicated manifest preserves exact compound structure parts behind one broad-phase record');
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

console.log(`dedicatedWorldCollision.selftest: all ${MAP_IDS.length} exact map manifests passed`);
