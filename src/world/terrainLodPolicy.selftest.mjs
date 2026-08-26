import assert from 'node:assert/strict';
import {
  chooseTerrainLodBuild,
  initialTerrainLods,
  terrainLodForDistance,
  warmTerrainLodBuilds,
} from './terrainLodPolicy.js';

assert.deepEqual(initialTerrainLods(50), [0],
  'opening near chunk creates only its exact visible level');
assert.deepEqual(initialTerrainLods(300), [1],
  'opening mid chunk starts only at its exact visible level');
assert.deepEqual(initialTerrainLods(600), [2], 'opening far chunk creates only visible detail');

assert.equal(terrainLodForDistance(170, 1), 0, 'near detail enters inside hysteresis');
assert.equal(terrainLodForDistance(205, 0), 0, 'fine LOD remains inside exit hysteresis');
assert.equal(terrainLodForDistance(230, 0), 1, 'fine LOD exits beyond hysteresis');

const chunks = [
  { cx: 0, cz: 0, level: 2, present: [false, false, true] },
  { cx: 500, cz: 0, level: 2, present: [false, false, true] },
];
assert.deepEqual(chooseTerrainLodBuild(chunks, 20, 0), {
  index: 0, level: 0, distanceM: 20, urgent: true,
}, 'missing visible geometry is the first streaming job');

chunks[0].present[0] = true;
chunks[0].present[2] = false;
chunks[0].level = 0;
assert.deepEqual(chooseTerrainLodBuild(chunks, 20, 0), {
  index: 0, level: 2, distanceM: 20, urgent: false,
}, 'deployment warm restores the coarse outward-travel fallback after visible detail');
chunks[0].present[2] = true;
assert.deepEqual(chooseTerrainLodBuild(chunks, 20, 0), {
  index: 1, level: 1, distanceM: 480, urgent: false,
}, 'the nearest upcoming transition band follows after the fallback exists');

const warmChunks = [
  { cx: 0, cz: 0, level: 2, present: [false, false, false] },
  { cx: 440, cz: 0, level: 2, present: [false, false, true] },
  { cx: 500, cz: 0, level: 2, present: [false, false, true] },
];
const completed = [];
const build = (job) => {
  completed.push([job.index, job.level]);
  warmChunks[job.index].present[job.level] = true;
  if (job.urgent) warmChunks[job.index].level = job.level;
};
assert.equal(warmTerrainLodBuilds(warmChunks, 20, 0, 2, build), 2,
  'countdown warm obeys its exact per-call job bound');
assert.deepEqual(completed, [[0, 0], [0, 2]],
  'countdown warm drains visible detail before its outward-travel fallback');
assert.equal(warmTerrainLodBuilds(warmChunks, 20, 0, 8, build), 2,
  'a later countdown slice drains the remaining lookahead and stops');
assert.equal(warmTerrainLodBuilds(warmChunks, 20, 0, 1, build), 0,
  'no geometry is rebuilt after the position is fully warm');

console.log('terrainLodPolicy.selftest: opening-region priority and one-job streaming passed');
