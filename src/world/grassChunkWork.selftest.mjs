import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { createGrassChunkWork, advanceGrassChunkWork, writeGrassTuftData } from './grassChunkWork.ts';

function random(seed) {
  let calls = 0;
  return Object.assign(() => {
    calls++;
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }, { calls: () => calls });
}
function makeTuft() {
  const scratch = new Array(10).fill(0);
  return (x, z, rng) => {
    const roll = rng(), yaw = rng() * Math.PI * 2;
    const sxz = .74 + rng() * .62, sy = .55 + rng() * .85;
    const r = rng(), g = rng(), b = rng(), v = rng();
    if (roll < .22 || x < -53) return null;
    scratch[0] = x; scratch[1] = Math.sin(x / 23) - Math.cos(z / 31) - .03;
    scratch[2] = z; scratch[3] = yaw; scratch[4] = sxz; scratch[5] = sy;
    scratch[6] = r; scratch[7] = g; scratch[8] = b; scratch[9] = v < .71 ? 0 : 1;
    return scratch;
  };
}
const geometries = [new THREE.PlaneGeometry(.71, .83), new THREE.PlaneGeometry(.53, 1.14)];
for (const geometry of geometries) geometry.translate(0, .415, 0).computeBoundingSphere();
const material = new THREE.MeshBasicMaterial();
const candidateCount = 517;

// Independent original path: retained accepted records, original direct
// matrix arithmetic, real InstancedMesh allocation and Three's complete scan.
function original(seed) {
  const rng = random(seed), tuft = makeTuft(), rows = [[], []];
  for (let i = 0; i < candidateCount; i++) {
    const t = tuft(-64 + rng() * 128, 128 + rng() * 128, rng);
    if (t) rows[t[9]].push(t.slice());
  }
  const meshes = rows.map((tufts, vv) => {
    const mesh = new THREE.InstancedMesh(geometries[vv], material, tufts.length);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(tufts.length * 3), 3);
    tufts.forEach((t, i) => {
      const yaw = t[3], sn = Math.sin(yaw), cs = Math.cos(yaw), sxz = t[4], sy = t[5];
      const ma = mesh.instanceMatrix.array, mi = i * 16;
      ma[mi] = cs * sxz; ma[mi + 1] = 0; ma[mi + 2] = -sn * sxz; ma[mi + 3] = 0;
      ma[mi + 4] = 0; ma[mi + 5] = sy; ma[mi + 6] = 0; ma[mi + 7] = 0;
      ma[mi + 8] = sn * sxz; ma[mi + 9] = 0; ma[mi + 10] = cs * sxz; ma[mi + 11] = 0;
      ma[mi + 12] = t[0]; ma[mi + 13] = t[1]; ma[mi + 14] = t[2]; ma[mi + 15] = 1;
      mesh.instanceColor.array.set(t.slice(6, 9), i * 3);
    });
    mesh.computeBoundingSphere();
    return mesh;
  });
  return { meshes, calls: rng.calls(), tail: rng() };
}
function create(seed, count = candidateCount, publish) {
  const rng = random(seed);
  return { rng, work: createGrassChunkWork({ candidateCount: count,
    random: rng, x0: -64, z0: 128, size: 128, makeTuft: makeTuft(),
    staging: [new Float64Array(count * 10), new Float64Array(count * 10)],
    variantSphere: vv => geometries[vv].boundingSphere,
    publish,
  }) };
}
for (const cap of [1, 7, 250, 10000]) {
  const expected = original(42), { rng, work } = create(42);
  assert.throws(() => work.buffers, /not complete/);
  let calls = 0, totalSteps = 0;
  while (!work.complete) {
    const steps = advanceGrassChunkWork(work, cap, 1.5, () => 0);
    assert.ok(steps > 0 && steps <= cap);
    totalSteps += steps;
    assert.ok(++calls < 5000);
  }
  assert.equal(rng.calls(), expected.calls, 'every scheduling policy preserves RNG consumption');
  assert.equal(rng(), expected.tail);
  assert.equal(work.buffers.length, 2);
  let accepted = 0;
  for (const result of work.buffers) {
    const before = expected.meshes[result.variant];
    accepted += before.count;
    assert.deepEqual(result.matrices, before.instanceMatrix.array, 'byte-exact original Float32 transforms');
    assert.deepEqual(result.colors, before.instanceColor.array, 'byte-exact original colors');
    assert.deepEqual(result.sphere, before.boundingSphere, 'exact original ordered Three sphere unions');
    before.dispose();
  }
  assert.ok(totalSteps >= candidateCount + 2 * accepted,
    'both matrix writes AND bounding-sphere instances are charged as separate bounded steps');
}
{
  const { work } = create(93);
  let clock = 0;
  assert.equal(advanceGrassChunkWork(work, 250, 1.5, () => clock++), 2, 'deadline stops independently of hard cap');
  assert.equal(advanceGrassChunkWork(work, 250, 1.5, () => NaN), 1, 'invalid clock cannot drain a job');
  let backwards = 10;
  assert.equal(advanceGrassChunkWork(work, 250, 1.5, () => backwards--), 1);
  assert.equal(advanceGrassChunkWork(work, Infinity, 1.5, () => 0), 0);
  assert.equal(advanceGrassChunkWork(work, 250, 0, () => 0), 0);
}
for (const stage of ['candidates', 'allocate', 'write', 'bounds', 'publish']) {
  let published = false;
  const { work } = create(71, candidateCount, () => { published = true; });
  while (work.getState().stage !== stage) work.step();
  work.cancel(); work.cancel();
  assert.equal(work.getState().stage, 'cancelled');
  assert.equal(work.complete, false);
  assert.equal(published, false, `cancellation in ${stage} must not publish`);
  assert.throws(() => work.step(), /cancelled/);
  assert.throws(() => work.buffers, /not complete/);
}
for (const stopAfter of [1, candidateCount + 3, candidateCount + 160]) {
  const { work } = create(71);
  advanceGrassChunkWork(work, stopAfter, 1.5, () => 0);
  work.cancel(); work.cancel();
  assert.equal(work.complete, false);
  assert.throws(() => work.step(), /cancelled/);
  assert.throws(() => work.buffers, /not complete/);
}
{
  const { work, rng } = create(12, 0);
  advanceGrassChunkWork(work, 250, 1.5, () => 0);
  assert.ok(work.complete); assert.deepEqual(work.buffers, []); assert.equal(rng.calls(), 0);
}
{
  let published = 0, clock = 0;
  const { work } = create(12, candidateCount, buffers => {
    published++;
    assert.equal(work.getState().stage, 'publish');
    assert.equal(work.complete, false);
    assert.equal(buffers.length, 2);
    clock += 7; // This unpreemptible final operation is still timed, not a hidden tail.
  });
  while (work.getState().stage !== 'publish') {
    advanceGrassChunkWork(work, 1, 1.5, () => clock);
    assert.equal(published, 0);
  }
  const state = work.getState();
  assert.equal(state.candidatesDone, candidateCount);
  assert.ok(state.accepted > 0);
  assert.equal(advanceGrassChunkWork(work, 250, 1.5, () => clock), 1);
  assert.equal(published, 1);
  assert.equal(work.getState().stage, 'complete');
  work.step();
  assert.equal(published, 1, 'publication is exactly once');
}

// Execute the actual production scheduler: an urgent second chunk cannot
// drain or overwrite the scratch owned by a partly built first chunk.
const source = readFileSync(new URL('./vegetation.ts', import.meta.url), 'utf8');
const a = source.indexOf('  function advanceDeferredGrass(): void {');
const b = source.indexOf('  function updateGrassVisibility()', a);
assert.ok(a > 0 && b > a);
const schedule = new Function(`return ${stripTypeScriptTypes(`function run(active, urgent, ahead) {
  let grassBuildJob = active;
  const grassSelection = { urgent, ahead };
  const deferFarGrass = true, disposed = false, calls = [];
  function beginGrassChunk(gc) { calls.push(['begin', gc]); grassBuildJob = gc; }
  function advanceGrassChunk(...args) { calls.push(['advance', ...args]); }
  ${source.slice(a, b)}
  advanceDeferredGrass();
  return calls;
}`)};`)();
assert.deepEqual(schedule('existing', 'urgent', 'ahead'), [['advance', 'existing']]);
assert.deepEqual(schedule(null, 'urgent', 'ahead'), [['begin', 'urgent'], ['advance', 'urgent']]);
assert.deepEqual(schedule(null, null, 'ahead'), [['begin', 'ahead'], ['advance', 'ahead']]);
assert.deepEqual(schedule(null, null, null), []);
assert.ok(source.indexOf('for (const entry of chunkMeshes) group.add(entry.mesh)')
  > source.indexOf('if (!job.complete) return false'), 'no partial chunk attaches');
assert.match(source, /grassBuildJob\?\.job\?\.cancel\(\)/, 'world eviction cancels pending CPU ownership');
assert.match(source, /if \(disposed\) return;[\s\S]*uWindTime\.value \+= dt/, 'disposed worlds cannot resume streaming');

// Exercise actual production publication, including failure rollback. Completed
// attributes are adopted unchanged; partial mesh containers never attach and
// cleanup must not dispose their shared world geometry/material.
const publishStart = source.indexOf('  function publishGrassChunk(');
const publishEnd = source.indexOf('  const spawn =', publishStart);
const publishSource = stripTypeScriptTypes(source.slice(publishStart, publishEnd));
function publication(failAttribute = false) {
  const group = new THREE.Group(), created = [];
  let attributes = 0, disposedMeshes = 0;
  class Mesh extends THREE.InstancedMesh {
    constructor(geometry, mat, count) {
      assert.equal(count, 0, 'no unsliced identity-matrix initialization');
      assert.equal(group.children.length, 0, 'all variants prepare before any attachment');
      super(geometry, mat, count);
      created.push(this);
      this.addEventListener('dispose', () => disposedMeshes++);
    }
    computeBoundingSphere() { assert.fail('publication must not re-scan instance bounds'); }
  }
  class Attribute extends THREE.InstancedBufferAttribute {
    constructor(array, size) {
      if (failAttribute && ++attributes === 3) throw new Error('attribute failure');
      super(array, size);
    }
  }
  const variants = geometries.map(geo => ({ geo, geoFar: geo, matMid: material }));
  const publish = new Function('THREE', 'group', 'grassVariants', `${publishSource}; return publishGrassChunk;`)(
    { ...THREE, InstancedMesh: Mesh, InstancedBufferAttribute: Attribute }, group, variants);
  const { work } = create(42);
  while (!work.complete) work.step();
  const chunk = { built: false, meshes: null };
  if (failAttribute) {
    assert.throws(() => publish(chunk, work.buffers), /attribute failure/);
    assert.equal(group.children.length, 0);
    assert.equal(disposedMeshes, created.length);
    assert.equal(chunk.built, false); assert.equal(chunk.meshes, null);
  } else {
    publish(chunk, work.buffers);
    assert.equal(chunk.built, true);
    assert.equal(group.children.length, 2);
    for (const [i, record] of chunk.meshes.entries()) {
      const buffer = work.buffers[i];
      assert.equal(record.mesh.instanceMatrix.array, buffer.matrices);
      assert.equal(record.mesh.instanceColor.array, buffer.colors);
      assert.equal(record.mesh.boundingSphere, buffer.sphere);
      assert.equal(record.mesh.count, buffer.count);
      assert.equal(record.mesh.visible, false);
      assert.equal(record.mesh.frustumCulled, true);
      assert.equal(record.mesh.receiveShadow, true);
      record.mesh.dispose();
    }
  }
}
let sharedDisposed = 0;
const sharedDispose = () => sharedDisposed++;
for (const resource of [...geometries, material]) resource.addEventListener('dispose', sharedDispose);
publication(); publication(true);
assert.equal(sharedDisposed, 0);

// Read-only checkpoint counts visible pending separately from merely-ahead
// work, handles the pre-first-camera state honestly, and cannot advance jobs.
const stateStart = source.indexOf('  function getGrassWorkState()');
const stateEnd = source.indexOf('\n  return { group, update, dispose,', stateStart);
const stateFunction = stripTypeScriptTypes(source.slice(stateStart, stateEnd));
let stateReads = 0;
const activeState = { stage: 'write', candidatesDone: 20, candidatesTotal: 20,
  accepted: 12, variant: 0, variantsTotal: 2, instancesDone: 5, instancesTotal: 9 };
const active = { ix: 2, iz: 3, job: { getState() { stateReads++; return activeState; } } };
const carpetSnapshot = { cold: true, pending: true, stage: 'candidates' };
const checkpoints = new Function('grassChunks', 'grassFadeEnd', 'grassAheadDistance', 'grassBuildJob', 'disposed', 'carpetWork',
  `${stateFunction}; return getGrassWorkState;`)([
    { built: true, cameraDist: 0 }, { built: false, cameraDist: 20 },
    { built: false, cameraDist: 99 }, { built: false, cameraDist: 100 },
    { built: false, cameraDist: 150 }, { built: false }, { built: true },
  ], 100, 150, active, false, { getState: () => carpetSnapshot });
assert.deepEqual(checkpoints(), { total: 7, built: 2, pendingVisible: 2, pendingAhead: 1,
  cameraUnknown: 2, active: { ...activeState, chunkX: 2, chunkZ: 3 }, carpet: carpetSnapshot, disposed: false });
assert.equal(stateReads, 1);

const disposeStart = source.indexOf('  function dispose(): void {', source.indexOf('  function setSniperFade('));
const disposeEnd = source.indexOf('  function getGrassWorkState()', disposeStart);
assert.ok(disposeStart > 0 && disposeEnd > disposeStart);
const disposeFunction = stripTypeScriptTypes(source.slice(disposeStart, disposeEnd));
{
  let published = false;
  const { work } = create(71, candidateCount, () => { published = true; });
  while (work.getState().stage !== 'write') work.step();
  const pendingChunk = { job: work };
  const retainedStaging = [new Float64Array(100), new Float64Array(100)];
  const carpet = new Map([[1, [1, 2, 3]]]);
  const cleanup = new Function('pendingChunk', 'midTuftScratch', 'carpetCache', `
    let disposed = false, grassBuildJob = pendingChunk;
    const carpetWork = { cancel() {} };
    ${disposeFunction}
    return { dispose, current: () => ({ disposed, active: grassBuildJob }) };
  `)(pendingChunk, retainedStaging, carpet);
  cleanup.dispose(); cleanup.dispose();
  assert.deepEqual(cleanup.current(), { disposed: true, active: null });
  assert.equal(pendingChunk.job, null);
  assert.equal(work.getState().stage, 'cancelled');
  assert.equal(published, false);
  assert.deepEqual(retainedStaging.map(buffer => buffer.length), [0, 0]);
  assert.equal(carpet.size, 0);
}
// A deliberately altered matrix/color or bounds must not pass the oracle.
const control = original(42), { work } = create(42);
while (!work.complete) work.step();
work.buffers[0].matrices[13] += .01;
assert.notDeepEqual(work.buffers[0].matrices, control.meshes[0].instanceMatrix.array);
work.buffers[1].sphere.radius += .01;
assert.notDeepEqual(work.buffers[1].sphere, control.meshes[1].boundingSphere);
for (const mesh of control.meshes) mesh.dispose();
for (const geometry of geometries) geometry.dispose();
material.dispose();
assert.equal(typeof writeGrassTuftData, 'function');
console.log('grassChunkWork: eager/budget parity, exact RNG/transforms/colors/Three bounds, sliced finalization, deadline/hard caps, urgent ownership and cancellation pass');
