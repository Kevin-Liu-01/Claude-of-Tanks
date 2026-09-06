import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import {
  chooseTerrainLodBuild, initialTerrainLods, terrainLodForDistance, warmTerrainLodBuilds,
} from './terrainLodPolicy.ts';
import { registerRetainedObject3DResources, releaseObject3DGpuResources,
  disposeObject3DResources } from '../engine/resourceLifetime.ts';

// Execute the actual chunk generators, startup and live scheduler. Only the
// unrelated canvas material/horizon builders are stubbed; real Three buffers,
// shared topology, bounds and retained-resource ownership remain in use.
const source = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
const chunkSource = source.slice(source.indexOf('const CHUNKS = 8'));
assert.ok(chunkSource.startsWith('const CHUNKS = 8'), 'chunk source boundary is exact');
let clockMs = 0;
let clockStepMs = 0;
const measuredClock = { now() { const value = clockMs; clockMs += clockStepMs; return value; } };
const compile = new Function('THREE', 'initialTerrainLods', 'terrainLodForDistance',
  'warmTerrainLodBuilds', 'chooseTerrainLodBuild', 'registerRetainedObject3DResources',
  'performance', stripTypeScriptTypes(`
  const MAP_SIZE = 1024, HALF = 512;
  function* buildHorizonRingSteps() { return new THREE.Group(); }
  function* createSplatMaterialSteps() { return new THREE.MeshStandardMaterial(); }
  ${chunkSource.replace(/^export /gm, '')}
`) + 'return { terrainBuildSteps, buildFineGridSteps, buildChunkGeometrySteps };');
const api = compile(THREE, initialTerrainLods, terrainLodForDistance,
  warmTerrainLodBuilds, chooseTerrainLodBuild, registerRetainedObject3DResources, measuredClock);

function drain(generator) {
  let result = generator.next();
  while (!result.done) result = generator.next();
  return result.value;
}

function fixture() {
  let calls = 0;
  const hf = {
    getHeightAt(x, z) { calls++; return x * 0.025 - z * 0.01; },
    _layout: { spawns: { player: { x: -448, z: -448 } } },
  };
  const group = drain(api.terrainBuildSteps(hf, {}, null, { streamFarLods: true }));
  calls = 0;
  return { group, hf, calls: () => calls, resetCalls() { calls = 0; },
    update: group.userData.updateLOD, warm: group.userData.warmStreaming,
    stats: group.userData.streamingStats };
}

const farCamera = new THREE.Vector3(448, 0, 448);
const f = fixture();
const target = f.group.children.at(-1);
const originalGeometry = target.geometry;
for (let frame = 0; frame < 3; frame++) f.update(farCamera);
assert.equal(f.calls(), 0, 'new work starts only on the existing fourth-update cadence');
f.update(farCamera);
assert.ok(f.calls() > 0 && f.calls() <= 99 * 32,
  `one live update takes at most 32 fine-grid row checkpoints, got ${f.calls()} samples`);
assert.equal(f.stats.streamedGeometryCount, 0, 'a partial job is not counted as completed');
assert.equal(target.geometry, originalGeometry, 'partial buffers never replace visible terrain');
for (let frame = 0; frame < 2; frame++) {
  const before = f.calls();
  f.update(farCamera);
  assert.ok(f.calls() > before && f.calls() - before <= 99 * 32,
    'a pending job progresses on intervening updates without starting another');
}
assert.equal(f.warm(farCamera, 0), 0, 'zero warm budget cannot advance pending work');
const beforeWarm = f.calls();
assert.equal(f.warm(farCamera, 1), 1, 'countdown drains the same partial job to completion');
assert.equal(f.calls(), 99 * 99, 'mixed live/countdown does not restart the fine-grid sampling');
assert.ok(f.calls() > beforeWarm);
assert.equal(f.stats.streamedGeometryCount, 1);
assert.notEqual(target.geometry, originalGeometry);
assert.equal(target.geometry.getAttribute('position').count, 97 * 97 + 4 * 96);
assert.equal(f.warm(farCamera, 2), 2, 'warm budget counts completed jobs, never checkpoints');
let warmCompletions = 3;
while (true) {
  const completed = f.warm(farCamera, 1);
  if (completed === 0) break;
  warmCompletions += completed;
  assert.ok(warmCompletions <= 192, 'fixed camera warming terminates');
}
const warmedCount = f.stats.streamedGeometryCount;
const warmedCalls = f.calls();
for (let frame = 0; frame < 40; frame++) f.update(farCamera);
assert.equal(f.stats.streamedGeometryCount, warmedCount, 'idle terrain creates no repeated work');
assert.equal(f.calls(), warmedCalls, 'idle terrain never resamples heights');
assert.equal(f.warm(farCamera, 1), 0, 'zero still means no pending or selectable job');

// The measured deadline complements the hard checkpoint count: one expensive
// row may exceed the target but cannot force a second row into that update.
const timed = fixture();
clockMs = 0;
clockStepMs = 3;
for (let frame = 0; frame < 4; frame++) timed.update(farCamera);
assert.equal(timed.calls(), 99, '2 ms target stops after one measured expensive row');
clockStepMs = 0;

// Camera reversal must affect publication and the next candidate even when it
// happens on a non-start frame. Keep the useful partial result, not a second
// simultaneous generator; complete it before urgent work in the new region.
const moving = fixture();
for (let frame = 0; frame < 4; frame++) moving.update(farCamera);
const movedTarget = moving.group.children.at(-1);
const retainedFar = movedTarget.geometry;
const nextCamera = new THREE.Vector3(448, 0, -448);
moving.update(nextCamera);
let framesToComplete = 1;
while (moving.stats.streamedGeometryCount === 0) {
  moving.update(nextCamera);
  assert.ok(++framesToComplete < 40, 'one pending job finishes without starvation');
}
assert.equal(movedTarget.geometry, retainedFar, 'old-camera detail is retained off-tree, not mounted');
const secondTarget = moving.group.children[8]; // horizon + row 0, column 7
const secondOld = secondTarget.geometry;
while (moving.stats.streamedGeometryCount === 1) {
  moving.update(nextCamera);
  assert.ok(++framesToComplete < 80, 'the new nearest urgent chunk follows pending completion');
}
assert.notEqual(secondTarget.geometry, secondOld, 'selection uses the latest camera, not the job start');

// GPU suspension preserves resumable CPU state. Actual retirement still
// disposes off-tree completed LODs through the established retained set.
const partialCalls = timed.calls();
releaseObject3DGpuResources(timed.group, { releaseMaterials: false });
assert.equal(timed.calls(), partialCalls, 'suspension does not pump or rebuild a pending job');
assert.equal(timed.warm(farCamera, 1), 1);
assert.equal(timed.calls(), 99 * 99, 'resuming preserves fine-grid work completed before suspension');
for (const test of [f, timed, moving]) {
  const expected = test.stats.initialGeometryCount + test.stats.streamedGeometryCount;
  assert.equal(disposeObject3DResources(test.group).geometries, expected,
    'all completed streamed LODs remain owned even when off-tree');
}

console.log('terrainStreaming.selftest: cadence, bounded partial work, warm, camera fairness and lifetime passed');

// Golden bytes were recorded from the pre-slicing 9afc1d5f51 terrain source.
// Per map: seed 1337, the spawn chunk and its eastern neighbor, both opposite
// map corners; padded Float64 fine grids; all three LOD position/normal/Uint16
// index streams and Float64 bounds; plus the direct-sampled far-only path.
// Changes to authored heights/topology require an explicit reviewed refresh.
const GEOMETRY_GOLDENS = {
  verdant: 'ce8c920efa466396eb9faf3aeefe91d500dc9f7728c6a2af40d0fed83cb7274b',
  desert: '242cc58db7003e9ed59cd69e2cd337ef988cf229296132aaf03d3923f926ea4b',
  winter: 'a129b98a82687bba6f15e5cf8d1508e8caaf650fab4118ac7f4864278534bb7c',
  urban: 'dc86077914e20440ae7cdcfb044343da6c1386495e2023981261725b8dbd0bd9',
  coastal: 'e289f011ff9a15ad122cb4fab22171bba2592e9be529e8f96bc888f66cb15d00',
  autumn: 'e839a30f703c6c9bc7b7ee3457a0f2eb766ddfa4594d389b7340ff2a4eb0d1fd',
  steppe: 'a25c054b4fd84f49464f4f6352a6fce3b9e1f486649483236e75f2ef238c2836',
  railyard: '3d7a7820ec57287383057592bf0385b7fc0bbb541605e012274319363ff2559e',
  frontier: '7923000c873765c228c7639f8b061c6c14902777bb0ca8c3865ba4e953e0a809',
  fjord: 'b2284feb737079e6fc1b5330163c3cbfa83bd6d1e0e02a94a83c8d929a6de7d6',
  delta: '6c45703262406db09e70a4787274d237e2c065f8dda4953eaa47a8fca883f637',
  badlands: 'c2706acb41b314d8429a01a9a3d3edc40213347776952e091468234d3fca6aec',
  monsoon: '67ee14156a4eb586960cd923372ff9b4e716fd1310192fd7a5fa56902fe8da4d',
  alpine: '61438df867319f1946416ed226c61f2c6f04cabe5a1094fe0a3c166faa30a718',
  caldera: 'f0ce3fc2d566e9fcfca70d0bd4ae01387d1978607e61376b9e67ac7f43b223cd',
  foundry: '50f8b4f2f103d1be9ab38be99768be59aa6ed3bb23a0e315ad0345ebcb252e86',
  ruinspires: '3034b3fb807d8108a814b497aa92cb9acc6eaa80b736aec77aa0bbbdeeec3d13',
  blackglass: '31ea78388d0b10ba7914d9902ac21c9f49136fe2f5f5ef4c8713e42897554277',
  titan_gorge: '13abde544a10ceb96f05e20b767fdd6df15121e4c91857ce594bc66db47887e4',
  skybridge: '13f67e43c27dc650573a9ea5cf92b95a10032eb1f1fd3be3c9d64d5bc9c87731',
};

function drainWithCount(generator) {
  let checkpoints = 0;
  let result = generator.next();
  while (!result.done) { checkpoints++; result = generator.next(); }
  return { value: result.value, checkpoints };
}

function bytes(array) { return new Uint8Array(array.buffer, array.byteOffset, array.byteLength); }

function geometryArrays(geometry) {
  return [geometry.attributes.position.array, geometry.attributes.normal.array,
    geometry.index.array,
    new Float64Array([...geometry.boundingSphere.center.toArray(), geometry.boundingSphere.radius])];
}

function validateGeometry(geometry, segs) {
  const positions = geometry.attributes.position.array;
  const normals = geometry.attributes.normal.array;
  const n = segs + 1;
  const vcount = n * n + 4 * segs;
  assert.ok(positions instanceof Float32Array);
  assert.ok(normals instanceof Float32Array);
  assert.ok(geometry.index.array instanceof Uint16Array);
  assert.equal(positions.length, vcount * 3);
  assert.equal(normals.length, vcount * 3);
  assert.equal(geometry.index.count, segs * segs * 6 + 4 * segs * 6);
  for (const index of geometry.index.array) assert.ok(index >= 0 && index < vcount);
  for (let k = 0; k < 4 * segs; k++) {
    const side = Math.floor(k / segs);
    const at = k % segs;
    const sourceIndex = [at, at * n + segs, segs * n + segs - at, (segs - at) * n][side];
    const skirtIndex = n * n + k;
    assert.equal(positions[skirtIndex * 3], positions[sourceIndex * 3]);
    assert.equal(positions[skirtIndex * 3 + 2], positions[sourceIndex * 3 + 2]);
    assert.equal(positions[skirtIndex * 3 + 1], Math.fround(positions[sourceIndex * 3 + 1] - 6.5));
    assert.ok(normals[skirtIndex * 3 + 1] < 0, 'retained skirt normals point downward');
  }
}

function validateEastSeams(west, east) {
  for (let westLevel = 0; westLevel < 3; westLevel++) {
    for (let eastLevel = 0; eastLevel < 3; eastLevel++) {
      const westSegs = [96, 48, 24][westLevel];
      const eastSegs = [96, 48, 24][eastLevel];
      const sharedSegs = Math.min(westSegs, eastSegs);
      for (let row = 0; row <= sharedSegs; row++) {
        const wi = (row * westSegs / sharedSegs * (westSegs + 1) + westSegs) * 3;
        const ei = row * eastSegs / sharedSegs * (eastSegs + 1) * 3;
        assert.deepEqual(west[westLevel].attributes.position.array.slice(wi, wi + 3),
          east[eastLevel].attributes.position.array.slice(ei, ei + 3), 'shared border vertices are exact across LODs');
        for (let axis = 0; axis < 3; axis++) {
          assert.ok(Math.abs(west[westLevel].attributes.normal.array[wi + axis]
            - east[eastLevel].attributes.normal.array[ei + axis]) < 1e-6,
          'fine-step border normals retain the same shading across LODs');
        }
      }
    }
  }
}

async function testAllMapBytes() {
  const { createHeightField } = await import('./terrain.ts');
  const { getMapConfig, MAP_IDS } = await import('./maps/index.ts');
  assert.equal(MAP_IDS.length, 20);
  assert.deepEqual(Object.keys(GEOMETRY_GOLDENS), [...MAP_IDS]);
  for (const mapId of MAP_IDS) {
    const config = getMapConfig(mapId);
    const hf = createHeightField(1337, config);
    const hash = createHash('sha256');
    const nearX = Math.min(256, Math.max(-512, Math.floor((config.spawns.player.x + 512) / 128) * 128 - 512));
    const nearZ = Math.min(384, Math.max(-512, Math.floor((config.spawns.player.z + 512) / 128) * 128 - 512));
    const chunks = [];
    const pool = new Map();
    for (const [x, z] of [[nearX, nearZ], [nearX + 128, nearZ], [-512, -512], [384, 384]]) {
      const progress = { done: 0, total: 1 };
      const eagerFine = drainWithCount(api.buildFineGridSteps(hf, x, z, progress));
      const liveFine = drainWithCount(api.buildFineGridSteps(hf, x, z, null, 1));
      assert.equal(eagerFine.checkpoints, 12, 'startup retains eight-row checkpoints');
      assert.equal(liveFine.checkpoints, 99, 'live work yields every padded fine-grid row');
      assert.deepEqual(bytes(liveFine.value.hgrid), bytes(eagerFine.value.hgrid));
      hash.update(bytes(liveFine.value.hgrid));
      const geometries = [];
      for (const [segs, grid] of [[96, liveFine.value], [48, liveFine.value], [24, liveFine.value], [24, null]]) {
        const eager = drainWithCount(api.buildChunkGeometrySteps(hf, x, z, segs, grid, progress, pool));
        const live = drainWithCount(api.buildChunkGeometrySteps(hf, x, z, segs, grid, null, pool, 1));
        assert.equal(eager.checkpoints, Math.floor((segs + 1) / 8));
        assert.equal(live.checkpoints, segs + 1, 'live geometry yields every surface row before atomic finalization');
        assert.equal(eager.value.index, live.value.index, 'streamed geometry retains shared world-local topology');
        const eagerArrays = geometryArrays(eager.value);
        geometryArrays(live.value).forEach((array, index) => {
          assert.deepEqual(bytes(array), bytes(eagerArrays[index]), `${mapId}: live/startup bytes match`);
          hash.update(bytes(array));
        });
        validateGeometry(live.value, segs);
        geometries.push(live.value);
        eager.value.dispose();
      }
      chunks.push(geometries);
    }
    validateEastSeams(chunks[0], chunks[1]);
    assert.equal(hash.digest('hex'), GEOMETRY_GOLDENS[mapId], `${mapId}: exact pre-change geometry and bounds`);
    for (const geometries of chunks) for (const geometry of geometries) geometry.dispose();
  }
  console.log('terrainStreaming.selftest: 20 maps × 4 chunks, all LOD bytes/bounds/skirts/seams and direct-far parity passed');
}

if (!process.argv.includes('--scheduler-only')) await testAllMapBytes();
