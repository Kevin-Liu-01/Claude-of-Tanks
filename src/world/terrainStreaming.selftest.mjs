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
import { historicalBadlandsInput, historicalPlayableReliefInput } from './shorelineHistoryTestOracle.mjs';

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
  function* createSplatMaterialSteps() {
    return { material: new THREE.MeshStandardMaterial(), textures: new Set() };
  }
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

// Geometry expectations include the authored 30-map environment. Before this
// refresh, the eager emitter from 12cbcc7607efa6a6990b4f051e9709dc7432b508
// was independently executed against the SAME current heightfields as both
// current startup/live emitters: all 30 maps × 4 chunks × 4 geometry paths
// matched bit-for-bit, including bounds/skirts and all nine east-seam LOD pairs.
// Proof receipt SHA256: 100012b3ea4ab5edb8cb53b3c9783267f106b2de8e7d31eeb5a2b7009fb52df8.
// The original 9afc1d5f51 fingerprints remain unchanged for 13 maps. Seven
// prior fingerprints needed refresh (verdant, winter, coastal, autumn, fjord,
// delta, monsoon); parity rules out the sliced emitter for these samples,
// without attributing the historical change to a specific edit. Ten authored
// maps are newly covered. This test has no git
// or external receipt dependency: the reviewed expected bytes are pinned below.
// Per map: seed 1337, the spawn chunk and its eastern neighbor, both opposite
// map corners; padded Float64 fine grids; all three LOD position/normal/Uint16
// index streams and Float64 bounds; plus the direct-sampled far-only path.
// Changes to authored heights/topology require an explicit reviewed refresh.
const GEOMETRY_GOLDENS = {
  verdant: '86532d696a6ab164c64b79ea866a91cc93283bf50f4fc4af7c856119e52ae0b4',
  desert: '242cc58db7003e9ed59cd69e2cd337ef988cf229296132aaf03d3923f926ea4b',
  winter: 'bf912f3e4ae03b039f58ec8efed1ee1113e9d8de3d06afb228c4fd9d7fad7a85',
  urban: 'dc86077914e20440ae7cdcfb044343da6c1386495e2023981261725b8dbd0bd9',
  coastal: 'b83cd815364f2ff958731818bb7d18177a05af898ab6b02b78e8c78e70afb1b7',
  autumn: '607a488ca94ccb00cb0a7f25eacc7160a755c0ade180496be8a49cf9581843ec',
  steppe: 'a25c054b4fd84f49464f4f6352a6fce3b9e1f486649483236e75f2ef238c2836',
  railyard: '3d7a7820ec57287383057592bf0385b7fc0bbb541605e012274319363ff2559e',
  frontier: '7923000c873765c228c7639f8b061c6c14902777bb0ca8c3865ba4e953e0a809',
  fjord: '9371c7fc56eec9ac5e6f0854dd251c0b570afb1be46439f8ed5d5ddc381349b1',
  delta: '597a1d1fc40c2c9385102b7f3c027eddd1f788a023516d4045fe581084370dfa',
  badlands: 'c2706acb41b314d8429a01a9a3d3edc40213347776952e091468234d3fca6aec',
  monsoon: '3de3731955a71bdc7feed06875992d7343ec02733146db7984df5f36290cb803',
  alpine: '61438df867319f1946416ed226c61f2c6f04cabe5a1094fe0a3c166faa30a718',
  caldera: 'f0ce3fc2d566e9fcfca70d0bd4ae01387d1978607e61376b9e67ac7f43b223cd',
  foundry: '50f8b4f2f103d1be9ab38be99768be59aa6ed3bb23a0e315ad0345ebcb252e86',
  ruinspires: '3034b3fb807d8108a814b497aa92cb9acc6eaa80b736aec77aa0bbbdeeec3d13',
  blackglass: '31ea78388d0b10ba7914d9902ac21c9f49136fe2f5f5ef4c8713e42897554277',
  titan_gorge: '13abde544a10ceb96f05e20b767fdd6df15121e4c91857ce594bc66db47887e4',
  skybridge: '13f67e43c27dc650573a9ea5cf92b95a10032eb1f1fd3be3c9d64d5bc9c87731',
  // Published 37271a90b authored basin contours, then 56924f7bf revised
  // drainage/composition. Authenticated history replay preserves emitter and
  // eager/live parity: docs/POLDERS-STREAMING-GOLDEN.md.
  polders: 'b933cb9c4bd67070e904ffe66696ec235014bb53398886534f920f1345bc5f51',
  copper_mesa: 'ae0d5b90fb81ac1f36efa7e3c2e73b9a7259f3564aca6b461ab6f4d698544f46',
  airfield: '55490ff86d039a9015d19034937ae5b4e6ed4f5b85eb8b2f6f70d05830a2e254',
  oasis: '17a01efc7ebc768078e8a829038c1e5dbebc601d5fa9e409bebfb743755ee01f',
  whiteout: '78fbeb41aea88985263132f39fdaf99832cb4cc790a6e784d2b0db2d460c3615',
  orchard: 'e084ffa305d7847a26bc81dab51d5fc6fcb57bd32052888c7885dd54bb388136',
  longleaf: '597146dfdb29062a529e77c8d47beaae5feed9436ec68d78b0230783d5676203',
  mangrove: '4ec02e0d658d3200ab167cb16ca25f4d8f2c4f7dd24d0f4adef1fab2586be9d2',
  saltwind: 'ddf8d6cdf0ec6196bfad3e2b6fa60915ed872d5ea54540851b24e72be440b5f6',
  reservoir: '40c628b2578a24456afd9fe3fa9c5f676905ad8cb2c06bc77f71f8f3f8f7ef1f',
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
  assert.deepEqual(Object.keys(geometry.attributes), ['position', 'normal']);
  assert.deepEqual(geometry.groups, []);
  assert.deepEqual(geometry.drawRange, { start: 0, count: Infinity });
  assert.equal(geometry.boundingBox, null, 'chunk emitter retains sphere-only bounds');
  assert.equal(positions.length, vcount * 3);
  assert.equal(normals.length, vcount * 3);
  assert.equal(geometry.index.count, segs * segs * 6 + 4 * segs * 6);
  for (const index of geometry.index.array) assert.ok(index >= 0 && index < vcount);
  const center = geometry.boundingSphere.center;
  const radiusSquared = geometry.boundingSphere.radius ** 2;
  assert.ok(Number.isFinite(radiusSquared));
  for (let i = 0; i < vcount; i++) {
    const offset = i * 3;
    for (let axis = 0; axis < 3; axis++) {
      assert.ok(Number.isFinite(positions[offset + axis]));
      assert.ok(Number.isFinite(normals[offset + axis]));
    }
    assert.ok((positions[offset] - center.x) ** 2
      + (positions[offset + 1] - center.y) ** 2
      + (positions[offset + 2] - center.z) ** 2 <= radiusSquared + 1e-8,
    'published sphere contains every surface and skirt vertex');
  }
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

function validateEastSeams(west, east, levels = [96, 48, 24]) {
  for (let westLevel = 0; westLevel < levels.length; westLevel++) {
    for (let eastLevel = 0; eastLevel < levels.length; eastLevel++) {
      const westSegs = levels[westLevel];
      const eastSegs = levels[eastLevel];
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

function buildCheckedChunk(hf, x, z, pool, label, hash = null) {
  const progress = { done: 0, total: 1 };
  const eagerFine = drainWithCount(api.buildFineGridSteps(hf, x, z, progress));
  const liveFine = drainWithCount(api.buildFineGridSteps(hf, x, z, null, 1));
  assert.equal(eagerFine.checkpoints, 12, 'startup retains eight-row checkpoints');
  assert.equal(liveFine.checkpoints, 99, 'live work yields every padded fine-grid row');
  assert.deepEqual(bytes(liveFine.value.hgrid), bytes(eagerFine.value.hgrid));
  hash?.update(bytes(liveFine.value.hgrid));
  const geometries = [];
  for (const [segs, grid] of [[96, liveFine.value], [48, liveFine.value], [24, liveFine.value], [24, null]]) {
    const eager = drainWithCount(api.buildChunkGeometrySteps(hf, x, z, segs, grid, progress, pool));
    const live = drainWithCount(api.buildChunkGeometrySteps(hf, x, z, segs, grid, null, pool, 1));
    assert.equal(eager.checkpoints, Math.floor((segs + 1) / 8));
    assert.equal(live.checkpoints, segs + 1, 'live geometry yields every surface row before atomic finalization');
    assert.equal(eager.value.index, live.value.index, 'streamed geometry retains shared world-local topology');
    const eagerArrays = geometryArrays(eager.value);
    geometryArrays(live.value).forEach((array, index) => {
      assert.deepEqual(bytes(array), bytes(eagerArrays[index]), `${label}: live/startup bytes match`);
      hash?.update(bytes(array));
    });
    validateGeometry(live.value, segs);
    geometries.push(live.value);
    eager.value.dispose();
  }
  return geometries;
}

function validateShorelineCrossing(hf, geometry, segs) {
  // The east edge at x=-128 intersects both wet core and dry bank. Require
  // both from actual emitted vertices so an unrelated corner cannot pass.
  let wet = 0, dry = 0;
  for (let row = 0; row <= segs; row++) {
    const vertex = (row * (segs + 1) + segs) * 3;
    const positions = geometry.attributes.position.array;
    const water = hf.getWaterMaskAt(positions[vertex], positions[vertex + 2]);
    if (water > 0.98) wet++;
    if (water === 0) dry++;
  }
  assert.ok(wet > 0 && dry > 0, 'shoreline seam must include actual wet-core and dry-bank vertices');
}

function testOasisShorelineChunks(hf) {
  // Separate from the historical four-chunk digest: these inspect the real
  // spring, not the spawn and opposite map corners. Shape approval/golden
  // updates remain independent of exact emitter, topology and seam parity.
  const pool = new Map();
  for (const z of [-128, 0]) {
    const west = buildCheckedChunk(hf, -256, z, pool, 'oasis shoreline west');
    const east = buildCheckedChunk(hf, -128, z, pool, 'oasis shoreline east');
    try {
      validateEastSeams(west, east, [96, 48, 24, 24]);
      for (let lod = 0; lod < 4; lod++) validateShorelineCrossing(hf, west[lod], [96, 48, 24, 24][lod]);
      assert.throws(() => validateShorelineCrossing({ getWaterMaskAt: () => 0 }, west[0], 96),
        /actual wet-core and dry-bank/, 'an entirely dry unrelated chunk must not satisfy shoreline coverage');
      const position = east[0].attributes.position.array;
      const originalY = position[1];
      position[1] = originalY + 1;
      assert.throws(() => validateEastSeams(west, east, [96, 48, 24, 24]),
        /shared border vertices/, 'the shoreline seam check rejects a one-metre crack');
      position[1] = originalY;
    } finally {
      for (const geometry of [...west, ...east]) geometry.dispose();
    }
  }
  console.log('terrainStreaming.selftest: Oasis spring four chunks, wet/dry borders, all LOD paths and east seams passed');
}

function testCurrentAuthoredChunks(hf, config, historicalField) {
  // The three original digests below remain historical. Exercise current
  // canyon/published relief through the SAME actual startup/live emitters,
  // including direct-far borders, rather than replacing that old fingerprint.
  // Alpine's historical spawn/corner chunks are outside the changed trough.
  // Seat its CURRENT adjacent pair on an actual authored relief midpoint;
  // leave every original historical sampling coordinate below untouched.
  const relief = config.id === 'alpine' ? config.terrain.landforms[0].relief : null;
  const probe = relief ? { x: (relief.startX + relief.endX) / 2, z: (relief.startZ + relief.endZ) / 2 }
    : config.spawns.player;
  const nearX = Math.min(256, Math.max(-512, Math.floor((probe.x + 512) / 128) * 128 - 512));
  const nearZ = Math.min(384, Math.max(-512, Math.floor((probe.z + 512) / 128) * 128 - 512));
  const pool = new Map(), historicalPool = new Map(), chunks = [];
  const hash = createHash('sha256'), historicalHash = createHash('sha256');
  try {
    for (const [x, z] of [[nearX, nearZ], [nearX + 128, nearZ], [-512, -512], [384, 384]]) {
      chunks.push(buildCheckedChunk(hf, x, z, pool, `current ${config.id} relief`, hash));
      const before = buildCheckedChunk(historicalField, x, z, historicalPool,
        `historical ${config.id} at current coordinates`, historicalHash);
      for (const geometry of before) geometry.dispose();
    }
    validateEastSeams(chunks[0], chunks[1], [96, 48, 24, 24]);
    const digest = hash.digest('hex'), historicalDigest = historicalHash.digest('hex');
    assert.notEqual(digest, historicalDigest,
      'current authored relief differs from the historical field at the SAME sampling coordinates');
    const positions = chunks[1][3].attributes.position.array, originalY = positions[1];
    try {
      positions[1] = originalY + 1;
      assert.throws(() => validateEastSeams(chunks[0], chunks[1], [96, 48, 24, 24]),
        /shared border vertices/, 'current authored relief rejects a cracked direct-far border');
    } finally { positions[1] = originalY; }
    console.log(JSON.stringify({ test: 'terrainStreaming current relief', id: config.id, seed: 1337, chunks: 4,
      pairedChunk: [nearX, nearZ], hash: digest, historicalAtSameCoordinates: historicalDigest,
      scope: 'actual LOD emission/seams/bounds, not a replacement geometry golden or art approval' }));
  } finally {
    for (const geometries of chunks) for (const geometry of geometries) geometry.dispose();
  }
}

async function testAllMapBytes() {
  const { createHeightField } = await import('./terrain.ts');
  const { getMapConfig, MAP_IDS } = await import('./maps/index.ts');
  assert.equal(MAP_IDS.length, 30);
  assert.deepEqual(Object.keys(GEOMETRY_GOLDENS), [...MAP_IDS]);
  for (const mapId of MAP_IDS) {
    const config = historicalPlayableReliefInput(historicalBadlandsInput(getMapConfig(mapId)));
    const hf = createHeightField(1337, config);
    const hash = createHash('sha256');
    const corrupt = mapId === 'polders' ? createHash('sha256') : null;
    let streams = 0;
    const checkedHash = { update(data) {
      hash.update(data);
      if (!corrupt) return;
      // Stream 1 is the padded fine grid; stream 2 is the actual first
      // LOD's position bytes. Flip one bit of its first height on a copy.
      const payload = ++streams === 2 ? data.slice() : data;
      if (streams === 2) payload[4] ^= 1;
      corrupt.update(payload);
    } };
    const nearX = Math.min(256, Math.max(-512, Math.floor((config.spawns.player.x + 512) / 128) * 128 - 512));
    const nearZ = Math.min(384, Math.max(-512, Math.floor((config.spawns.player.z + 512) / 128) * 128 - 512));
    const chunks = [];
    const pool = new Map();
    for (const [x, z] of [[nearX, nearZ], [nearX + 128, nearZ], [-512, -512], [384, 384]]) {
      chunks.push(buildCheckedChunk(hf, x, z, pool, mapId, checkedHash));
    }
    validateEastSeams(chunks[0], chunks[1]);
    assert.equal(hash.digest('hex'), GEOMETRY_GOLDENS[mapId], `${mapId}: reviewed authored geometry and bounds`);
    if (corrupt) {
      assert.equal(streams, 4 * (1 + 4 * 4), 'all fine-grid and geometry streams enter both hashes');
      assert.throws(() => assert.equal(corrupt.digest('hex'), GEOMETRY_GOLDENS.polders),
        { code: 'ERR_ASSERTION' }, 'one-bit corruption in current Polders height bytes must fail');
      for (const stale of [
        '701d4611153e67baea6505fa125c0a185bfdd1dbe2fad6df5ab98791554f722b',
        '96956e342ce22d4aebc4a43168fc47ea1698d81c3712169cf2c5484e1b6cf49f',
      ]) assert.throws(() => assert.equal(GEOMETRY_GOLDENS.polders, stale),
        { code: 'ERR_ASSERTION' }, 'neither superseded published landform may replace the current golden');
    }
    for (const geometries of chunks) for (const geometry of geometries) geometry.dispose();
    if (mapId === 'oasis') testOasisShorelineChunks(hf);
    if (['frontier', 'alpine', 'badlands'].includes(mapId)) {
      const current = getMapConfig(mapId);
      testCurrentAuthoredChunks(createHeightField(1337, current), current, hf);
    }
  }
  console.log('terrainStreaming.selftest: 30 maps × 4 chunks, all LOD bytes/bounds/skirts/seams and direct-far parity passed');
}

if (process.argv.includes('--oasis-shoreline-only')) {
  const { createHeightField } = await import('./terrain.ts');
  const { getMapConfig } = await import('./maps/index.ts');
  testOasisShorelineChunks(createHeightField(1337, getMapConfig('oasis')));
} else if (!process.argv.includes('--scheduler-only')) await testAllMapBytes();
