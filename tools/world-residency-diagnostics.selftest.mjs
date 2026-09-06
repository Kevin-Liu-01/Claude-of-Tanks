import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import {
  installResidencyGeometryTracker, summarizeResidencyHeap, warmResidencyTerrain, writeResidencyHeapSnapshot,
  collectResidencyPrograms, writeResidencyPrograms,
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
console.log('world-residency-diagnostics.selftest: weak world-root GC census, owner/LOD tracking, disposal/reupload, native class/retainer parsing and snapshot streaming passed');
