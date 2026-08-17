import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { pushHullFromObstacle, rayCollisionRecord, setObbShape } from './collision.js';
import { DESTRUCTIBLE_TYPES } from './maps/inhabitKit.js';
import { hedgehogBeamSpecs, sampleDiscGround, sampleObbGround } from './propPlacement.js';

const heightField = {
  getHeightAt(x, z) { return x * 0.21 - z * 0.13 + 2; },
};

const disc = sampleDiscGround(heightField, 4, -3, 2.5, 0.04);
const discSamples = [[4, -3]];
for (let index = 0; index < 8; index++) {
  const angle = index * Math.PI / 4;
  discSamples.push([4 + Math.cos(angle) * 2.5, -3 + Math.sin(angle) * 2.5]);
}
const discMin = Math.min(...discSamples.map(([x, z]) => heightField.getHeightAt(x, z)));
assert.ok(Math.abs(disc.y - (discMin - 0.04)) < 1e-10,
  'round props plant below their lowest sampled terrain support');
assert.ok(disc.spread > 0.5, 'ground sampling detects a meaningful cross-footprint slope');

const yaw = 0.41;
const obb = sampleObbGround(heightField, -2, 5, 1.7, 3.2, yaw, 0.03);
const obbSamples = [];
for (let ix = -1; ix <= 1; ix++) for (let iz = -1; iz <= 1; iz++) {
  const lx = ix * 1.7, lz = iz * 3.2;
  obbSamples.push([
    -2 + lx * Math.cos(yaw) + lz * Math.sin(yaw),
    5 - lx * Math.sin(yaw) + lz * Math.cos(yaw),
  ]);
}
const obbMin = Math.min(...obbSamples.map(([x, z]) => heightField.getHeightAt(x, z)));
assert.ok(Math.abs(obb.y - (obbMin - 0.03)) < 1e-10,
  'oriented props use their real rotated footprint instead of an enclosing AABB');

const specs = hedgehogBeamSpecs(0, 0, 0, 0.23, 1, [0.04, -0.03, 0.02]);
assert.equal(specs.length, 3, 'hedgehog exposes one collision slab per visible beam');
const records = specs.map((spec) => setObbShape({
  min: [0, spec.minY, 0], max: [0, spec.maxY, 0], kind: 'hedgehog',
}, 0, 0, spec.halfWidth + 0.025, spec.halfLength + 0.025, spec.yaw));

const first = specs[0];
const beamPoint = {
  x: Math.sin(first.yaw) * first.halfLength * 0.72,
  z: Math.cos(first.yaw) * first.halfLength * 0.72,
};
const push = { x: 0, y: 0, z: 0 };
assert.equal(pushHullFromObstacle(beamPoint, 0, 1, 1, 0, 0.04, 0.04, records[0], push), true,
  'tank movement contacts the narrow visible steel beam');

const normal = new Vector3();
assert.ok(rayCollisionRecord(
  new Vector3(beamPoint.x, 2, beamPoint.z), new Vector3(0, -1, 0), records[0], 4, normal,
) >= 0, 'shell ray contacts the same visible beam volume');

let emptyPoint = null;
for (let x = -1.05; x <= 1.05 && !emptyPoint; x += 0.05) {
  for (let z = -1.05; z <= 1.05; z += 0.05) {
    if (Math.hypot(x, z) > 1.05) continue;
    const hits = records.some((record) => rayCollisionRecord(
      new Vector3(x, 2, z), new Vector3(0, -1, 0), record, 4, normal,
    ) >= 0);
    if (!hits) emptyPoint = { x, z };
  }
}
assert.ok(emptyPoint, 'compound beams leave real open space inside the old circular force field');
assert.equal(records.some((record) => pushHullFromObstacle(
  emptyPoint, 0, 1, 1, 0, 0.02, 0.02, record, { x: 0, y: 0, z: 0 },
)), false, 'tank movement can pass through empty space between the steel beams');

assert.ok(DESTRUCTIBLE_TYPES.barrier.hw < DESTRUCTIBLE_TYPES.barrier.r * 0.35,
  'road barriers use their narrow concrete profile, not a radius-sized square');
assert.ok(DESTRUCTIBLE_TYPES.truck.hl > DESTRUCTIBLE_TYPES.truck.hw * 2.5,
  'trucks use their long vehicle footprint');
assert.equal(DESTRUCTIBLE_TYPES.roadsign.shape, 'circle',
  'thin roadside posts use round movement collision');
assert.ok(DESTRUCTIBLE_TYPES.roadsign.collisionR < DESTRUCTIBLE_TYPES.roadsign.r * 0.5,
  'roadside-post collision follows the post rather than the elevated sign face');

console.log('propPlacement.selftest: footprint grounding and compound hedgehog collision passed');
