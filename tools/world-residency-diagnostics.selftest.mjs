import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import {
  installResidencyGeometryTracker, summarizeResidencyHeap, warmResidencyTerrain, writeResidencyHeapSnapshot,
  collectResidencyPrograms, writeResidencyPrograms,
  residencyAllocationPlan, createResidencyAllocationSampler,
} from './world-residency-diagnostics.mjs';
import { RESIDENCY_TERRAIN_PROTOCOL, settleResidencyTerrain } from './world-residency-acquisition.mjs';

if (typeof globalThis.gc !== 'function') {
  const result = spawnSync(process.execPath, ['--expose-gc', fileURLToPath(import.meta.url)],
    { stdio: 'inherit', timeout: 30_000 });
  assert.equal(result.status, 0, result.error?.message || 'native GC selftest child failed');
  process.exit(0);
}

const scene = new THREE.Scene(), world = new THREE.Group(), terrain = new THREE.Group();
world.name = 'world-monsoon'; terrain.name = 'terrain';
world.add(terrain); scene.add(world);
const near = new THREE.PlaneGeometry(), far = new THREE.PlaneGeometry();
const mesh = new THREE.Mesh(near, new THREE.MeshBasicMaterial());
terrain.add(mesh);
const resident = new Set();
const renderer = {
  info: { memory: { geometries: 0 } },
  renderBufferDirect(camera, renderScene, geometry) {
    if (resident.has(geometry.id)) return;
    resident.add(geometry.id);
    this.info.memory.geometries++;
    geometry.addEventListener('dispose', function disposed(event) {
      resident.delete(geometry.id);
      renderer.info.memory.geometries--;
      event.target.removeEventListener('dispose', disposed);
    });
  },
};
globalThis.window = { __DEBUG: { renderer, scene } };
installResidencyGeometryTracker();
const render = geometry => renderer.renderBufferDirect(null, scene, geometry, mesh.material, mesh, null);
const inventory = () => window.__RESIDENCY_DIAGNOSTICS.inventory();
render(near); render(near);
assert.equal(inventory().residentTracked, 1, 'repeated native submissions do not inflate geometry counts');
mesh.geometry = far; render(far);
assert.equal(inventory().residentTracked, 2, 'unmounted but uploaded near LOD is still inventoried');
assert.equal(inventory().owners['world-monsoon/terrain'].geometries, 2);
assert.equal(inventory().rendererGeometries, 2);
assert.equal(inventory().worlds[0].uuid, world.uuid);
assert.deepEqual(inventory().worldRoots, [{ uuid: world.uuid, name: world.name, cpuAlive: true }]);
assert.equal(inventory().worldRootsAlive, 1, 'multiple uploaded geometries count their world only once');
assert.equal(inventory().rows.some(row => Object.values(row).some(value => typeof value === 'object')), false,
  'returned diagnostic rows contain no live geometry/world references');
near.dispose();
assert.equal(inventory().residentTracked, 1, 'actual dispose events remove the allocation');
render(near);
assert.equal(inventory().allocations, 3, 'a released resource can lazily reupload and be tracked again');
assert.equal(inventory().worldRoots.length, 1, 'reupload does not add another weak root record');
near.dispose(); far.dispose();
assert.equal(inventory().residentTracked, 0);
assert.equal(inventory().disposals, 3);
let pending = 3;
window.__DEBUG.camera = { position: new THREE.Vector3() };
window.__DEBUG.world = { warmTerrainLookahead(position, maxJobs) {
  assert.equal(position, window.__DEBUG.camera.position); assert.equal(maxJobs, 1);
  return pending-- > 0 ? 1 : 0;
} };
assert.deepEqual(warmResidencyTerrain(), { jobs: 3, exhausted: true });
window.__DEBUG.world.warmTerrainLookahead = () => 1;
assert.throws(warmResidencyTerrain, /finite settled topology/);
window.__DEBUG.camera = new THREE.PerspectiveCamera();
window.__DEBUG.world.group = world;
terrain.userData.streamingStats = { initialGeometryCount: 64, streamedGeometryCount: 0, indexPool: { references: 64 } };
pending = 3;
window.__DEBUG.world.warmTerrainLookahead = (position, maxJobs) => {
  assert.equal(position, window.__DEBUG.camera.position); assert.equal(maxJobs, 1);
  if (pending-- <= 0) return 0;
  terrain.userData.streamingStats.streamedGeometryCount++;
  terrain.userData.streamingStats.indexPool.references++;
  return 1;
};
const prepared = settleResidencyTerrain();
assert.equal(prepared.protocol, RESIDENCY_TERRAIN_PROTOCOL);
assert.equal(prepared.jobs, 3);
assert.equal(prepared.topology.indexReferences, 67);
assert.deepEqual(settleResidencyTerrain(prepared), { ...prepared, verified: true, pendingAfterRender: 0 });
window.__DEBUG.camera.position.x++;
assert.throws(() => settleResidencyTerrain(prepared), /camera changed/);
window.__DEBUG.camera.position.x--;
terrain.userData.streamingStats.streamedGeometryCount++;
assert.throws(() => settleResidencyTerrain(prepared), /topology or capture camera changed/);
window.__DEBUG.world.warmTerrainLookahead = () => 1;
assert.throws(() => settleResidencyTerrain(prepared), /not settled/);
assert.throws(settleResidencyTerrain, /finite settled topology/);
for (const value of [2, -1, undefined, NaN]) {
  window.__DEBUG.world.warmTerrainLookahead = () => value;
  assert.throws(settleResidencyTerrain, /single-job budget/);
}
const program = { id: 7, name: 'fixture', usedTimes: 1, cacheKey: 'fixture-key',
  vertexShader: 'vertex source', fragmentShader: 'fragment source' };
renderer.info.programs = [program];
renderer.getContext = () => ({ getShaderSource: source => source });
renderer.properties = { has: material => material === mesh.material,
  get: () => ({ programs: new Map([['fixture-key', program]]) }) };
const programInventory = collectResidencyPrograms();
assert.equal(programInventory.programs[0].vertexSource, 'vertex source');
assert.deepEqual(programInventory.materials[0].programs, [7]);
assert.ok(programInventory.materials[0].owners[0].includes('world-monsoon/terrain'));
assert.equal(JSON.stringify(programInventory).includes('isMaterial'), false, 'inventory retains scalar ownership only');
delete globalThis.window;

// Real collection between event-loop tasks. Keep the tracker, disposed/undisposed
// geometries and their callbacks alive, but never return their mesh or world.
const gcScene = new THREE.Scene();
const gcRenderer = { info: { memory: { geometries: 0 } }, renderBufferDirect() {} };
globalThis.window = { __DEBUG: { renderer: gcRenderer, scene: gcScene } };
installResidencyGeometryTracker();
function uploadWorld(name, keepResident = false, dispose = false) {
  const root = new THREE.Group(), props = new THREE.Group();
  root.name = name; props.name = 'props';
  const geometry = new THREE.PlaneGeometry();
  const object = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  root.add(props); props.add(object);
  if (keepResident) gcScene.add(root);
  gcRenderer.renderBufferDirect(null, gcScene, geometry, object.material, object, null);
  if (dispose) geometry.dispose();
  return { uuid: root.uuid, root: new WeakRef(root), mesh: new WeakRef(object), geometry };
}
const live = uploadWorld('world-live', true);
const released = uploadWorld('world-repeat');
const disposed = uploadWorld('world-repeat', false, true);
const tick = () => new Promise(resolve => setImmediate(resolve));
for (let attempt = 0; attempt < 16; attempt++) {
  await tick();
  globalThis.gc();
  await tick();
  if (!released.root.deref() && !released.mesh.deref() && !disposed.root.deref() && !disposed.mesh.deref()) break;
}
assert.equal(released.root.deref(), undefined, 'live geometry and its dispose callback do not retain the old world');
assert.equal(released.mesh.deref(), undefined, 'the callback also does not retain the originating mesh');
assert.equal(disposed.root.deref(), undefined, 'disposed geometry and its tracker history do not retain the world');
assert.equal(disposed.mesh.deref(), undefined);
assert.equal(released.geometry.hasEventListener('dispose', released.geometry._listeners.dispose[0]), true,
  'the undisposed geometry still owns the registered diagnostic callback throughout collection');
assert.equal(disposed.geometry._listeners.dispose.length, 0, 'disposed geometry detached its callback');
const census = inventory();
assert.deepEqual(census.worldRoots, [
  { uuid: live.uuid, name: 'world-live', cpuAlive: true },
  { uuid: released.uuid, name: 'world-repeat', cpuAlive: false },
  { uuid: disposed.uuid, name: 'world-repeat', cpuAlive: false },
], 'distinct world builds are counted by UUID, including collected roots after geometry disposal');
assert.equal(census.worldRootsAlive, 1, 'a known scene-owned world remains alive');
assert.equal(census.worldRootsAlive, census.worldRoots.filter(row => row.cpuAlive).length);
assert.equal(census.worldRoots.some(row => Object.values(row).some(value => typeof value === 'object')), false,
  'root census receipts contain only scalar values');
assert.deepEqual(JSON.parse(JSON.stringify(census.worldRoots)), census.worldRoots);
assert.match(census.worldRootsCoverage, /first geometry upload/);
assert.equal(census.residentTracked, 2, 'root census does not change existing geometry disposal accounting');
released.geometry.dispose(); live.geometry.dispose();
assert.equal(inventory().residentTracked, 0);
assert.equal(inventory().worldRoots.length, 3, 'scalar historical root evidence survives geometry disposal');
delete globalThis.window;

const snapshot = {
  snapshot: { meta: {
    node_fields: ['type', 'name', 'id', 'self_size', 'edge_count'],
    node_types: [['object', 'string', 'code']],
    edge_fields: ['type', 'name_or_index', 'to_node'], edge_types: [['property', 'internal']],
  } },
  strings: ['Context', 'Group', 'world-monsoon', 'name', 'currentWorld', 'compiled function'],
  nodes: [0, 0, 1, 32, 1, 0, 1, 2, 64, 1, 1, 2, 3, 24, 0, 2, 5, 4, 2048, 0],
  edges: [0, 4, 5, 0, 3, 10],
};
const summary = summarizeResidencyHeap(snapshot);
assert.deepEqual(summary.byType.code, { count: 1, bytes: 2048 }, 'JIT/code size is separate from object retention');
assert.deepEqual(summary.byClass['object/Group'], { count: 1, bytes: 64 });
assert.equal(summary.worldRoots.length, 1);
assert.deepEqual(summary.worldRoots[0], { id: 2, class: 'Group', name: 'world-monsoon',
  retainers: [{ id: 1, type: 'object', name: 'Context', edgeType: 'property', edge: 'currentWorld' }] });
const unsupported = structuredClone(snapshot); unsupported.snapshot.meta.node_fields[3] = 'changed';
assert.throws(() => summarizeResidencyHeap(unsupported), /Unsupported/);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cot-residency-diagnostics-'));
try {
  const config = { maps: ['verdant', 'winter', 'caldera'], sweeps: 3, directory: temp };
  assert.equal(residencyAllocationPlan(config), null, 'default acquisition never enables allocation sampling');
  const plan = residencyAllocationPlan({ ...config, startAt: '0:verdant', stopAt: '1:verdant' });
  assert.deepEqual(plan.options, { samplingInterval: 16384, stackDepth: 16,
    includeObjectsCollectedByMajorGC: false, includeObjectsCollectedByMinorGC: false });
  const protocol = JSON.parse(fs.readFileSync(new URL('../node_modules/devtools-protocol/json/js_protocol.json', import.meta.url)));
  const samplingCommand = protocol.domains.find(domain => domain.domain === 'HeapProfiler')
    .commands.find(command => command.name === 'startSampling');
  for (const name of Object.keys(plan.options)) {
    assert.ok(samplingCommand.parameters.some(parameter => parameter.name === name),
      `${name} is supported by the locally pinned native protocol, not an invented profiler option`);
  }
  for (const [startAt, stopAt] of [
    ['', '1:verdant'], ['0:verdant', ''], ['0:verdant', '0:verdant'],
    ['1:verdant', '0:caldera'], ['0:winter', '0:verdant'], ['0:verdant', '3:verdant'],
    ['-1:verdant', '1:verdant'], ['01:verdant', '1:verdant'], ['0:missing', '1:verdant'],
    ['0:verdant', '1:verdant,2:verdant'],
  ]) assert.throws(() => residencyAllocationPlan({ ...config, startAt, stopAt }), /allocation|Allocation/);
  assert.throws(() => residencyAllocationPlan({ ...config, directory: '', startAt: '0:verdant', stopAt: '1:verdant' }), /diagnostics-dir/);
  assert.equal(residencyAllocationPlan({ ...config, startAt: '0:caldera', stopAt: '1:verdant' }).stopAt, '1:verdant',
    'endpoint order follows the declared sweep order, not map names');

  const probe = fs.readFileSync(new URL('./world-residency-probe.mjs', import.meta.url), 'utf8');
  const collectSource = probe.slice(probe.indexOf('async function collectSettled('), probe.indexOf('async function verifiedCameraState('));
  assert.equal(createHash('sha256').update(collectSource).digest('hex'),
    '3617bb7ad960a7bf82b76f9d0b0c8a2f783626b58002441f1b681cf60ffee137',
    'the exact default GC/heap acquisition remains unchanged by this opt-in diagnostic');
  assert.match(probe, /await collectSettled\(page, cdp\)[^\n]+\n\s+if \(allocationSampler\) await allocationSampler\.checkpoint/,
    'sampling begins/ends only after the existing two-GC heap receipt');
  assert.match(probe, /finally \{\s+if \(allocationSampler\)[\s\S]+?await allocationSampler\.dispose\(\)[\s\S]+?if \(browser\) await browser\.close\(\)/,
    'an active sampler stops before its owned browser closes');
  const rawProfile = { head: { id: 1, selfSize: 32, children: [],
    callFrame: { functionName: 'retainedFixture', scriptId: '1', url: 'fixture.ts', lineNumber: 2, columnNumber: 0 } },
    samples: [{ size: 32, nodeId: 1, ordinal: 1 }] };
  const events = [];
  const allocationCdp = { async send(method, options) {
    events.push(method);
    if (method === 'HeapProfiler.startSampling') assert.deepEqual(options, plan.options);
    if (method === 'HeapProfiler.stopSampling') return { profile: rawProfile };
    if (method === 'Runtime.getHeapUsage') return { usedSize: 12345 };
    return {};
  } };
  const collect = new Function('sleep', 'browserReceipt', `${collectSource}; return collectSettled;`)(
    async milliseconds => { assert.equal(milliseconds, 250); events.push('sleep250'); }, () => {});
  const fixturePage = { async evaluate() { events.push('pageReceipt'); return { contextLost: false }; } };
  const sampler = createResidencyAllocationSampler(allocationCdp, plan, temp);
  const first = await collect(fixturePage, allocationCdp);
  const defaultEvents = ['Runtime.discardConsoleEntries', 'HeapProfiler.collectGarbage', 'sleep250',
    'HeapProfiler.collectGarbage', 'Runtime.getHeapUsage', 'pageReceipt'];
  assert.deepEqual(events, defaultEvents, 'disabled/default sampling adds no native commands or extra warm frames');
  assert.equal(first.gcPasses, 2);
  await sampler.checkpoint('0:verdant');
  await sampler.checkpoint('0:winter');
  const second = await collect(fixturePage, allocationCdp);
  await sampler.checkpoint('1:verdant');
  sampler.requireComplete();
  await sampler.dispose();
  assert.deepEqual(events, [...defaultEvents, 'HeapProfiler.startSampling', ...defaultEvents, 'HeapProfiler.stopSampling']);
  assert.deepEqual(second.heap, first.heap, 'native heap bytes are never adjusted by sampled allocations');
  assert.equal(sampler.receipt.status, 'complete');
  assert.equal(sampler.receipt.startedAt, '0:verdant');
  assert.equal(sampler.receipt.stoppedAt, '1:verdant');
  assert.deepEqual(JSON.parse(fs.readFileSync(sampler.receipt.profile.file)), rawProfile, 'the full unmodified native profile is outside the scalar report');
  assert.equal(sampler.receipt.profile.bytes, fs.statSync(sampler.receipt.profile.file).size);
  assert.equal(sampler.receipt.profile.sha256.length, 64);
  assert.equal(JSON.stringify(sampler.receipt).includes('retainedFixture'), false, 'reports retain no native profile tree');
  assert.match(sampler.receipt.interpretation, /Statistical.*not exact.*never subtracted/);
  const duplicate = createResidencyAllocationSampler(allocationCdp, plan, temp);
  await duplicate.checkpoint('0:verdant');
  await assert.rejects(duplicate.checkpoint('1:verdant'), /EEXIST/, 'raw allocation evidence cannot be overwritten');
  await duplicate.dispose();
  assert.equal(duplicate.receipt.status, 'failed');

  async function allocationFailureCase(name, failStart = false, failStop = false) {
    const directory = path.join(temp, name); fs.mkdirSync(directory);
    const calls = [];
    const native = { async send(method) {
      calls.push(method);
      if (failStart && method.endsWith('startSampling')) throw new Error('Unsupported native sampling option');
      if (failStop && method.endsWith('stopSampling')) throw new Error('Native stop failed');
      return { profile: rawProfile };
    } };
    return { sampler: createResidencyAllocationSampler(native, plan, directory), calls };
  }
  const aborted = await allocationFailureCase('aborted');
  await aborted.sampler.checkpoint('0:verdant');
  await aborted.sampler.checkpoint('0:winter');
  assert.throws(() => aborted.sampler.requireComplete(), /declared stop/);
  await aborted.sampler.dispose();
  await aborted.sampler.dispose();
  assert.deepEqual(aborted.calls, ['HeapProfiler.startSampling', 'HeapProfiler.stopSampling']);
  assert.equal(aborted.sampler.receipt.status, 'aborted');
  assert.equal(aborted.sampler.receipt.stoppedAt, null, 'cleanup cannot impersonate the requested successful endpoint');
  assert.equal(aborted.sampler.receipt.cleanup.checkpoint, '0:winter');
  assert.match(aborted.sampler.receipt.cleanup.profile.file, /\.aborted\.heapprofile\.json$/);
  const unsupportedSampling = await allocationFailureCase('unsupported', true);
  await assert.rejects(unsupportedSampling.sampler.checkpoint('0:verdant'), /Unsupported/);
  await unsupportedSampling.sampler.dispose();
  assert.deepEqual(unsupportedSampling.calls, ['HeapProfiler.startSampling', 'HeapProfiler.stopSampling'], 'no weaker options or fallback after native rejection');
  assert.equal(unsupportedSampling.sampler.receipt.status, 'failed');
  const stopFailure = await allocationFailureCase('stop-failure', false, true);
  await stopFailure.sampler.checkpoint('0:verdant');
  await assert.rejects(stopFailure.sampler.checkpoint('1:verdant'), /Native stop failed/);
  await assert.rejects(stopFailure.sampler.dispose(), /Native stop failed/);
  await stopFailure.sampler.dispose();
  assert.equal(stopFailure.calls.length, 3, 'cleanup makes only one bounded stop attempt after an uncertain failure');
  assert.equal(stopFailure.sampler.receipt.status, 'failed');
  assert.equal(stopFailure.sampler.receipt.cleanup.stopped, false);
  const ordering = await allocationFailureCase('ordering');
  await assert.rejects(ordering.sampler.checkpoint('1:verdant'), /without active sampling/);
  assert.deepEqual(ordering.calls, []);
  const repeatedStart = await allocationFailureCase('repeated-start');
  await repeatedStart.sampler.checkpoint('0:verdant');
  await assert.rejects(repeatedStart.sampler.checkpoint('0:verdant'), /repeated/);
  await repeatedStart.sampler.dispose();
  assert.equal(repeatedStart.sampler.receipt.status, 'failed');

  const cdp = new EventEmitter();
  cdp.send = async method => {
    assert.equal(method, 'HeapProfiler.takeHeapSnapshot');
    cdp.emit('HeapProfiler.addHeapSnapshotChunk', { chunk: '{"native":' });
    cdp.emit('HeapProfiler.addHeapSnapshotChunk', { chunk: 'true}' });
  };
  const output = path.join(temp, 'native.heapsnapshot');
  const receipt = await writeResidencyHeapSnapshot(cdp, output);
  assert.equal(receipt.bytes, fs.statSync(output).size);
  assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), { native: true });
  assert.equal(cdp.listenerCount('HeapProfiler.addHeapSnapshotChunk'), 0);
  await assert.rejects(writeResidencyHeapSnapshot(cdp, output), /EEXIST/, 'existing native evidence is never overwritten');
  const programs = writeResidencyPrograms(programInventory, temp, 'fixture');
  const recorded = JSON.parse(fs.readFileSync(programs.file, 'utf8'));
  assert.equal(recorded.programs[0].vertexSource.hash.length, 64);
  assert.equal(fs.readFileSync(recorded.programs[0].vertexSource.file, 'utf8'), 'vertex source');
  assert.deepEqual(recorded.materials[0].programs, [7]);
  assert.throws(() => writeResidencyPrograms(programInventory, temp, 'fixture'), /EEXIST/);
  assert.throws(() => writeResidencyPrograms({ programs: [{ vertexSource: null }], materials: [] }, temp, 'invalid'),
    /source unavailable/);
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
console.log('world-residency-diagnostics.selftest: opt-in retained allocation sampling, unchanged default GC, weak world-root census, ownership, native heap/program evidence and cleanup passed');
