import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
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
  // (2026-10-08, the ring worker) the ring's hook (horizonRingHook.ts) installs a ring that is an empty group here — the
  // terrain build's own delegates (in this slice, after the stub above) reach the ring through it — and supplies no
  // pipeline: the ring builds where it stands
  const horizonRing = () => ({
    HORIZON_SEGMENTS: 287,
    buildHorizonRingSteps: function* () { return new THREE.Group(); },
    horizonRingGeometrySteps: function* () { return null; },
  });
  function horizonRingSupplyFor() { return null; }
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

// 2026-10-01 (frozen pins retired): per-map sha256 goldens of four chunks (built on historical road, shoreline, exit,
// Badlands and relief inputs through a historical terrain module), the roster literals and the history comparisons
// were change detectors of authored heights. Every registered battlefield's CURRENT field now runs the same checks
// live: startup/live emitter byte parity on four chunks (a spawn or relief pair and both opposite corners), every LOD's
// topology, finite streams, sphere bounds and downward skirts, exact east seams across LODs including the direct-far
// path, and a one-metre crack negative control.

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
  // round 73 (2026-09-25, the ground redux): every chunk carries its baked fold term — one normalised byte per
  // vertex (−1 crest .. +1 hollow); the digests below stay on positions / normals / index / bounds
  // round 73b (2026-09-26): and its shore byte — metres landward of the waterline, inverted (0 = far) so a geometry
  // without the attribute reads as far from any shore; a build without shoreline contours (this fixture) writes zeros
  assert.deepEqual(Object.keys(geometry.attributes), ['position', 'normal', 'fold', 'shore']);
  assert.ok(geometry.attributes.fold.array instanceof Int8Array && geometry.attributes.fold.normalized === true
    && geometry.attributes.fold.count === vcount && geometry.attributes.fold.itemSize === 1, 'the fold byte rides every vertex');
  assert.ok(geometry.attributes.shore.array instanceof Uint8Array && geometry.attributes.shore.normalized === true
    && geometry.attributes.shore.count === vcount && geometry.attributes.shore.itemSize === 1, 'the shore byte rides every vertex');
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
  // These inspect the real spring, not the spawn and opposite map corners.
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

function testAuthoredChunks(hf, config) {
  // Alpine's spawn/corner chunks sit outside its authored trough: seat its adjacent pair on an actual relief midpoint.
  const relief = config.id === 'alpine' ? config.terrain.landforms[0].relief : null;
  const probe = relief ? { x: (relief.startX + relief.endX) / 2, z: (relief.startZ + relief.endZ) / 2 }
    : config.spawns.player;
  const nearX = Math.min(256, Math.max(-512, Math.floor((probe.x + 512) / 128) * 128 - 512));
  const nearZ = Math.min(384, Math.max(-512, Math.floor((probe.z + 512) / 128) * 128 - 512));
  const pool = new Map(), chunks = [];
  try {
    for (const [x, z] of [[nearX, nearZ], [nearX + 128, nearZ], [-512, -512], [384, 384]]) {
      chunks.push(buildCheckedChunk(hf, x, z, pool, `${config.id} authored`));
    }
    validateEastSeams(chunks[0], chunks[1], [96, 48, 24, 24]);
    const positions = chunks[1][3].attributes.position.array, originalY = positions[1];
    try {
      positions[1] = originalY + 1;
      assert.throws(() => validateEastSeams(chunks[0], chunks[1], [96, 48, 24, 24]),
        /shared border vertices/, 'authored relief rejects a cracked direct-far border');
    } finally { positions[1] = originalY; }
  } finally {
    for (const geometries of chunks) for (const geometry of geometries) geometry.dispose();
  }
}

async function testAllMapBytes() {
  const { createHeightField } = await import('./terrain.ts');
  const { getMapConfig, MAP_IDS } = await import('./maps/index.ts');
  for (const mapId of MAP_IDS) {
    const config = getMapConfig(mapId), hf = createHeightField(1337, config);
    testAuthoredChunks(hf, config);
    if (mapId === 'oasis') testOasisShorelineChunks(hf);
  }
  console.log(`terrainStreaming.selftest: ${MAP_IDS.length} maps × 4 chunks, all LOD bytes/bounds/skirts/seams and direct-far parity passed`);
}

if (process.argv.includes('--oasis-shoreline-only')) {
  const { createHeightField } = await import('./terrain.ts');
  const { getMapConfig } = await import('./maps/index.ts');
  testOasisShorelineChunks(createHeightField(1337, getMapConfig('oasis')));
} else if (!process.argv.includes('--scheduler-only')) await testAllMapBytes();
