import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createCacheExperiment, createTerrainRayExperiment,
  runWinterCacheBenchmark } from './terrain-fast-cache-benchmark.mjs';

const analytic = (x, z) => Math.sin(x * 0.013) * 7.123456789 + Math.cos(z * 0.021) * 5.234567891;
const baseline = readFileSync(new URL('./fixtures/terrain-fast-cache-baseline.txt', import.meta.url), 'utf8');
assert.equal(createHash('sha256').update(baseline.trimEnd()).digest('hex'),
  '2299e7cf114af4db5434b0b41a3ccb15fe9bac3e3a1f6f65f3db01493d7fad0c',
  'the old ff68c3d6c cache fixture must not silently follow runtime changes');
const tile = createCacheExperiment('tile', analytic);
const vertex = createCacheExperiment('vertex', analytic);
assert.equal(vertex.getHeightAtFast(0.25, 0.75), tile.getHeightAtFast(0.25, 0.75));
assert.equal(tile.stats.analyticCalls, 289, 'production first miss fills the complete 17x17 tile');
assert.equal(vertex.stats.analyticCalls, 4, 'prototype first miss evaluates only the four used vertices');
assert.equal(vertex.bytes.vertices, 131329, 'validity is one bit per vertex, including the far corner');
assert.equal(vertex.bytes.heights, tile.bytes.heights, 'same 1025x1025 Float32 storage');
assert.equal(vertex.bytes.completedTiles, tile.bytes.completedTiles);

function oracle(x, z) {
  const gx = Math.max(0, Math.min(1024 - 1e-4, x + 512));
  const gz = Math.max(0, Math.min(1024 - 1e-4, z + 512));
  const ix = Math.floor(gx), iz = Math.floor(gz);
  const fx = gx - ix, fz = gz - iz;
  const a0 = Math.fround(analytic(ix - 512, iz - 512));
  const a1 = Math.fround(analytic(ix + 1 - 512, iz - 512));
  const b0 = Math.fround(analytic(ix - 512, iz + 1 - 512));
  const b1 = Math.fround(analytic(ix + 1 - 512, iz + 1 - 512));
  const a = a0 + (a1 - a0) * fx;
  const b = b0 + (b1 - b0) * fx;
  return a + (b - a) * fz;
}

// Borders, exact vertices and fractional points retain Float32-before-lerp.
const edges = [-1e9, -512, -511.9999, -496.0001, -496, -495.9999,
  -0.0001, 0, 0.0001, 15.9999, 16, 16.0001, 511.9999, 512, 1e9];
for (let index = 0; index < edges.length; index++) {
  for (const [x, z] of [[edges[index], edges.at(-index - 1)], [edges[index], edges[index]]]) {
    assert.equal(tile.getHeightAtFast(x, z), oracle(x, z));
    assert.equal(vertex.getHeightAtFast(x, z), oracle(x, z));
  }
}
let random = 1337;
for (let index = 0; index < 128; index++) {
  random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
  const x = random / 2 ** 32 * 1040 - 520;
  random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
  const z = random / 2 ** 32 * 1040 - 520;
  const result = vertex.getHeightAtFast(x, z);
  assert.equal(result, tile.getHeightAtFast(x, z));
  assert.equal(result, oracle(x, z));
}

const sharedBorder = createCacheExperiment('vertex', analytic);
sharedBorder.getHeightAtFast(15.75, 0.25);
assert.equal(sharedBorder.stats.analyticCalls, 4);
sharedBorder.getHeightAtFast(16.25, 0.25);
assert.equal(sharedBorder.stats.analyticCalls, 6, 'neighboring tiles reuse the same two border vertices');
sharedBorder.getHeightAtFast(16.25, 0.25);
assert.equal(sharedBorder.stats.analyticCalls, 6, 'repeated partial-tile reads do no analytic work');

const warmPoint = [{ x: 0, z: 0, radiusM: 0 }];
const partial = createCacheExperiment('vertex', analytic);
const complete = createCacheExperiment('tile', analytic);
partial.getHeightAtFast(0.25, 0.75);
complete.getHeightAtFast(0.25, 0.75);
const lazyWarm = partial.warmFastTilesAround(warmPoint);
assert.equal(partial.stats.analyticCalls, 4, 'creating the warm iterator performs no work');
assert.deepEqual([...lazyWarm], [2080], 'partial tiles yield when their remaining vertices actually finish');
assert.equal(partial.stats.analyticCalls, 289, 'warm fills the other 285 vertices once');
assert.deepEqual([...complete.warmFastTilesAround(warmPoint)], [],
  'baseline already filled the tile: this intentionally differs from partial prototype progress');
assert.deepEqual([...partial.warmFastTilesAround(warmPoint)], []);
for (let z = 0; z <= 16; z++) for (let x = 0; x <= 16; x++) {
  // Interior reads never cross into an unwarmed neighbor tile.
  const px = Math.min(x, 15.9999), pz = Math.min(z, 15.9999);
  assert.equal(partial.getHeightAtFast(px, pz), complete.getHeightAtFast(px, pz));
}
assert.equal(partial.stats.analyticCalls, 289, 'completed tile shortcut requires no vertex refills');

const points = [{ x: -512, z: -512, radiusM: 16 }, { x: -511, z: -511, radiusM: 0 }];
const warmTile = createCacheExperiment('tile', analytic);
const warmVertex = createCacheExperiment('vertex', analytic);
const originalPoints = structuredClone(points);
const iterator = warmVertex.warmFastTilesAround(points);
assert.deepEqual(iterator.next(), { value: 0, done: false });
iterator.return();
assert.equal(warmVertex.stats.completedTiles, 1, 'abandoning warm leaves later tiles untouched');
assert.deepEqual([...warmVertex.warmFastTilesAround(points)], [1, 64, 65]);
assert.deepEqual([...warmTile.warmFastTilesAround(points)], [0, 1, 64, 65]);
assert.equal(warmVertex.stats.analyticCalls, 33 * 33, 'warm avoids duplicate analytic border evaluations');
assert.equal(warmTile.stats.analyticCalls, 4 * 17 * 17, 'baseline repeats shared borders');
assert.deepEqual(points, originalPoints, 'caller warm points are not mutated');

for (const value of [0, -0, NaN, 2.123456789]) {
  const independent = createCacheExperiment('vertex', () => value);
  independent.getHeightAtFast(0.5, 0.5);
  independent.getHeightAtFast(0.5, 0.5);
  assert.equal(independent.stats.analyticCalls, 4, 'zero and NaN heights are not a missing-data sentinel');
}
assert.throws(() => createCacheExperiment('invalid', analytic));

// Real source march/refinement, with synthetic terrain to keep this unit light.
const rayField = { maxY: 13 };
const rayTile = createCacheExperiment('tile', analytic);
const rayVertex = createCacheExperiment('vertex', analytic);
const beforeRay = createTerrainRayExperiment(THREE, rayField, rayTile.getHeightAtFast);
const afterRay = createTerrainRayExperiment(THREE, rayField, rayVertex.getHeightAtFast);
for (const direction of [new THREE.Vector3(0, -0.1, 1).normalize(),
  new THREE.Vector3(0.25, 0, 1).normalize(), new THREE.Vector3(0, 1, 0)]) {
  const origin = new THREE.Vector3(0, 10, -80);
  assert.equal(afterRay(origin, direction, 200), beforeRay(origin, direction, 200));
}

for (const failure of [null, 'acquire', 'measure']) {
  const calls = [];
  const lock = { async acquire() { calls.push('acquire'); if (failure === 'acquire') throw new Error('acquire'); },
    release() { calls.push('release'); } };
  const pending = runWinterCacheBenchmark({ lock, async measure() {
    calls.push('measure'); if (failure === 'measure') throw new Error('measure'); return 'receipt';
  } });
  if (failure) await assert.rejects(pending, new RegExp(failure));
  else assert.equal(await pending, 'receipt');
  assert.deepEqual(calls, failure === 'acquire' ? ['acquire', 'release'] : ['acquire', 'measure', 'release']);
}

console.log('terrain fast cache experiment selftest passed');
