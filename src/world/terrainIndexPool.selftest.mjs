import assert from 'node:assert/strict';
import { acquireTerrainChunkIndex } from './terrain.js';

const pool = new Map();
const nearA = acquireTerrainChunkIndex(pool, 96);
const nearB = acquireTerrainChunkIndex(pool, 96);
const far = acquireTerrainChunkIndex(pool, 24);

assert.equal(nearA, nearB,
  'equal terrain resolutions share one immutable topology attribute');
assert.ok(nearA.array instanceof Uint16Array,
  'the largest terrain grid uses exact 16-bit indices');
assert.equal(nearA.count, 96 * 96 * 6 + 4 * 96 * 6,
  'near terrain topology retains every surface and skirt triangle');
assert.deepEqual(Array.from(nearA.array.subarray(0, 6)), [0, 97, 1, 1, 97, 98],
  'shared topology preserves the authored surface winding');
assert.equal(Math.max(...far.array), (24 + 1) ** 2 + 4 * 24 - 1,
  'the skirt addresses the complete grid without overflowing Uint16');
assert.equal(pool.size, 2, 'one pool entry exists per requested LOD resolution');
assert.equal(pool.get(96).references, 2,
  'the pool records avoided per-chunk index allocations');

console.log('terrainIndexPool.selftest: exact shared Uint16 topology passed');
