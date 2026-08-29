import assert from 'node:assert/strict';
import { GARAGE_VARIANTS } from '../game/garageVariants.ts';
import { sampleGarageMapStageData } from './garageMapStage.ts';

const exterior = GARAGE_VARIANTS.filter((variant) => variant.id !== 'verdant_motor_pool');
const receipts = [];
for (const variant of exterior) {
  const sample = sampleGarageMapStageData(variant.mapId);
  assert.equal(sample.mapId, variant.mapId);
  assert.ok(sample.beat.id, `${variant.mapId}: missing real tactical beat`);
  assert.ok(sample.structureId, `${variant.mapId}: missing tactical structure`);
  assert.ok(sample.landmarkLocal, `${variant.mapId}: missing local landmark transform`);
  assert.equal(sample.terrainPositions.length, 1369 * 3);
  assert.equal(sample.terrainColors.length, 1369 * 3);
  assert.equal(sample.terrainIndices.length, 36 * 36 * 6);
  assert.ok(sample.trees.reduce((sum, set) => sum + set.placements.length, 0) >= 5,
    `${variant.mapId}: canonical tree placement is empty`);
  const ys = [];
  for (let i = 1; i < sample.terrainPositions.length; i += 3) ys.push(sample.terrainPositions[i]);
  assert.ok(Math.max(...ys) - Math.min(...ys) > 1,
    `${variant.mapId}: terrain slice lost battlefield relief`);
  receipts.push(`${sample.mapId}:${sample.beat.id}:${sample.structureId}`);
}
assert.equal(new Set(receipts).size, exterior.length,
  'each staging area needs its own canonical map/beat/structure receipt');

const first = sampleGarageMapStageData(exterior[0].mapId);
const repeat = sampleGarageMapStageData(exterior[0].mapId);
assert.deepEqual(first.anchor, repeat.anchor, 'staging anchor must be deterministic');
assert.deepEqual(first.landmarkLocal, repeat.landmarkLocal,
  'tactical landmark placement must be deterministic');
assert.deepEqual(first.terrainPositions, repeat.terrainPositions,
  'terrain slice must reproduce exact bytes');

console.log('garageMapStage.selftest: nine canonical map slices pass');
