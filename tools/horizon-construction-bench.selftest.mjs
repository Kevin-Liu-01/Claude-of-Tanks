import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import * as THREE from 'three';
import { disposeObject3DResources, registerRetainedObject3DResources } from '../src/engine/resourceLifetime.ts';
import { parseOptions, trialPlan, describeAttribute, describeTexture, inspectAndDispose,
  memoryDelta, compareTrials, runFreshTrial, withLease, writeFreshReport,
} from './horizon-construction-bench.mjs';

// Importing the tool is inert: all tests below use small fixtures, not a real
// horizon build, native timing trial, worker process, browser or shared lease.
const argv = ['--baseline-root=/before', '--candidate-root=/after', '--maps=verdant,coastal',
  '--seeds=1337,2049', '--pairs=2', '--out=/evidence/result.json', '--canvas-module=/native/index.js'];
const options = parseOptions(argv);
assert.deepEqual(options.maps, ['verdant', 'coastal']);
assert.deepEqual(options.seeds, [1337, 2049]);
for (const invalid of ['--pairs=1', '--pairs=11', '--maps=verdant,verdant', '--seeds=1337,',
  '--seeds=-1', '--seeds=4294967296', '--seeds=0,0', '--tier=automatic', '--out=relative.json',
  '--out=/before/receipt.json', '--out=/before/..receipt.json', '--candidate-root=/before']) {
  const name = invalid.split('=')[0];
  assert.throws(() => parseOptions([...argv.filter(arg => !arg.startsWith(`${name}=`)), invalid]), invalid);
}
assert.throws(() => parseOptions(argv.filter(arg => !arg.startsWith('--seeds='))));
assert.throws(() => parseOptions([...argv, '--warmup=1']), 'No undeclared warmup option');
const plan = trialPlan(options);
assert.equal(plan.length, 16);
assert.deepEqual(plan.slice(0, 4).map(row => row.variant), ['baseline', 'candidate', 'candidate', 'baseline']);
assert.deepEqual(plan.slice(8, 12).map(row => row.variant), ['candidate', 'baseline', 'baseline', 'candidate']);
for (let index = 0; index < plan.length; index += 2) {
  const [a, b] = plan.slice(index, index + 2);
  assert.deepEqual([a.pair, a.map, a.seed], [b.pair, b.map, b.seed]);
  assert.notEqual(a.variant, b.variant, 'Each adjacent pair uses the identical map/seed');
}

const buffer = new Float32Array([99, 1, 2, 3, 4, 5, 6, 88]);
const attribute = new THREE.BufferAttribute(buffer.subarray(1, 7), 3);
const described = describeAttribute(attribute);
assert.equal(described.bytes, 24); assert.equal(described.count, 2);
assert.deepEqual(described.samples, [{ offset: 0, value: 1 }, { offset: 3, value: 4 }, { offset: 5, value: 6 }]);
buffer[0] = 7;
assert.equal(describeAttribute(attribute).sha256, described.sha256, 'Hash excludes backing buffer bytes outside the view');
buffer[2] = 8;
assert.notEqual(describeAttribute(attribute).sha256, described.sha256);
const pixels = new Uint8Array([1, 2, 3, 255, 4, 5, 6, 255]);
const texture = new THREE.DataTexture(pixels, 2, 1), hidden = new THREE.DataTexture(pixels.slice(), 2, 1);
assert.equal(describeTexture(texture).baseLevelPixelBytes, 8);
const geometry = new THREE.BufferGeometry().setAttribute('position', attribute).setIndex([0, 1, 0]);
const material = new THREE.MeshBasicMaterial({ map: texture });
const root = new THREE.Group(), a = new THREE.Mesh(geometry, material), b = new THREE.Mesh(geometry, material);
a.name = 'horizon-ring'; b.name = 'horizon-detail'; root.add(a, b);
registerRetainedObject3DResources(root, { textures: [hidden] });
const releases = { geometry: 0, material: 0, texture: 0 };
geometry.addEventListener('dispose', () => { releases.geometry++; });
material.addEventListener('dispose', () => { releases.material++; });
for (const t of [texture, hidden]) t.addEventListener('dispose', () => { releases.texture++; });
const inventory = inspectAndDispose(root, disposeObject3DResources);
assert.deepEqual(inventory.counts, { meshes: 2, geometries: 1, materials: 1, textures: 2 });
assert.deepEqual(releases, { geometry: 1, material: 1, texture: 2 }, 'Production ownership includes hidden textures exactly once');
assert.equal(inventory.logicalAttributeBytes, 24); assert.equal(inventory.logicalIndexBytes, 6);
assert.equal(inventory.baseLevelTexturePixelBytes, 16);
const serialized = JSON.stringify(inventory);
assert.ok(!serialized.includes('uuid'), 'Inventory contains no resource references or unstable UUIDs');
const beforeMemory = { heapUsed: 10, arrayBuffers: 20, external: 30, rss: 40 };
assert.deepEqual(memoryDelta(beforeMemory, { heapUsed: 9, arrayBuffers: 22, external: 33, rss: 35 }),
  { heapUsed: -1, arrayBuffers: 2, external: 3, rss: -5 }, 'Retained deltas remain signed, never clamped to manufacture zero');

const narrow = { ...options, maps: ['verdant'], seeds: [1337] };
const value = input => ({ map: input.map, seed: input.seed, tier: input.tier,
  constructionWallMs: 2, constructionCpuMs: { user: 1, system: 0.1 }, inventory,
  memory: { postDisposeDelta: { heapUsed: 1, arrayBuffers: -2, external: 3, rss: 4 } },
  rasterizer: { path: '/native/index.js', version: 'native-fixture' } });
const snapshot = root => ({ root, head: root, status: '', sourceTree: 'immutable' });
const success = input => ({ code: 0, signal: null, error: null, receipt: { ok: true, value: value(input) }, stdout: '', stderr: '' });
const calls = [];
const complete = await compareTrials(narrow, { snapshot, trial: async input => { calls.push(input.root); return success(input); } });
assert.equal(complete.pass, true); assert.equal(complete.runs.length, 4);
assert.deepEqual(calls, ['/before', '/after', '/after', '/before']);
assert.equal(complete.summary.length, 2);
assert.ok(complete.summary.every(item => item.trials === 2 && item.inventoryStable && item.rasterizerStable));
assert.equal(complete.summary[0].postDisposeDelta.arrayBuffers.median, -2);
const failed = await compareTrials(narrow, { snapshot, trial: async () =>
  ({ code: 1, signal: null, error: 'native import failed', stdout: 'partial', stderr: 'original exception', receipt: null }) });
assert.equal(failed.pass, false); assert.equal(failed.runs.length, 1);
assert.equal(failed.runs[0].stderr, 'original exception'); assert.equal(failed.sourceUnchanged, true);
const dirty = await compareTrials(narrow, { snapshot: root => ({ ...snapshot(root), status: ' M source.ts' }),
  trial: async () => { throw new Error('must not build dirty source'); } });
assert.equal(dirty.pass, false); assert.equal(dirty.runs.length, 0);
let changed = false;
const changedSource = await compareTrials(narrow, { snapshot: root => ({ ...snapshot(root), sourceTree: changed ? 'changed' : 'immutable' }),
  trial: async input => { changed = true; return success(input); } });
assert.equal(changedSource.pass, false); assert.equal(changedSource.sourceUnchanged, false);
assert.equal(changedSource.runs.length, 1); assert.ok(!changedSource.runs[0].valid);
const malformed = await compareTrials(narrow, { snapshot, trial: async () => ({ code: 0, signal: null, receipt: { ok: true } }) });
assert.equal(malformed.pass, false); assert.equal(malformed.runs.length, 1, 'Malformed IPC retains the original worker result');
const invalidMemory = await compareTrials(narrow, { snapshot, trial: async input => {
  const result = success(input); result.receipt.value.memory.postDisposeDelta.rss = null; return result;
} });
assert.equal(invalidMemory.pass, false); assert.equal(invalidMemory.summary.length, 0);
let snapshotsUnavailable = false;
const lostSource = await compareTrials(narrow, { snapshot: root => {
  if (snapshotsUnavailable) throw new Error('root disappeared'); return snapshot(root);
}, trial: async input => { snapshotsUnavailable = true; return success(input); } });
assert.equal(lostSource.pass, false); assert.equal(lostSource.runs.length, 1, 'Even a lost after-source read preserves the completed worker result');
let unstableIndex = 0;
const unstable = await compareTrials(narrow, { snapshot, trial: async input => {
  const result = success(input); result.receipt.value.inventory = { ...inventory, mutation: unstableIndex++ }; return result;
} });
assert.equal(unstable.pass, false); assert.equal(unstable.inputsDeterministic, false, 'Cold repetitions must retain identical actual resource inventories');
const abort = new AbortController(); abort.abort();
assert.equal((await compareTrials(narrow, { snapshot, signal: abort.signal })).runs.length, 0);

function fakeChild() {
  const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kill = signal => child.emit('close', null, signal);
  return child;
}
const child = fakeChild(); let launch;
const pending = runFreshTrial({ root: '/before' }, undefined, { spawnChild(command, args, options) {
  launch = { command, args, options }; return child;
} });
assert.equal(launch.args[0], '--expose-gc'); assert.equal(launch.args[2], '--worker');
child.stdout.write('native log'); child.emit('message', { ok: true }); child.emit('close', 0, null);
assert.deepEqual(await pending, { code: 0, signal: null, error: null, stdout: 'native log', stderr: '', receipt: { ok: true } });
const controller = new AbortController(), interruptedChild = fakeChild(); let settled = false;
const interrupted = runFreshTrial({ root: '/before' }, controller.signal, { spawnChild: () => interruptedChild })
  .then(result => { settled = true; return result; });
controller.abort(); await new Promise(resolve => setImmediate(resolve));
assert.equal(settled, false, 'Abort cannot finish before the owned child actually exits');
interruptedChild.emit('close', null, 'SIGTERM');
assert.match((await interrupted).error, /interrupted/);
const timedChild = fakeChild(); let timedSettled = false;
const timed = runFreshTrial({ root: '/before' }, undefined, { timeoutMs: 1, spawnChild: () => timedChild })
  .then(result => { timedSettled = true; return result; });
await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(timedSettled, false);
timedChild.emit('close', null, 'SIGTERM'); assert.match((await timed).error, /deadline/);

for (const fail of [false, true]) {
  const events = [], lock = { async acquire(ms) { events.push(['acquire', ms]); }, refresh() {}, release() { events.push(['release']); } };
  const run = withLease(async () => { events.push(['run']); if (fail) throw new Error('kept error'); return 7; }, lock);
  if (fail) await assert.rejects(run, /kept error/); else assert.equal(await run, 7);
  assert.deepEqual(events, [['acquire', 2700000], ['run'], ['release']], 'One lease, not one per worker');
}
const dir = fs.mkdtempSync(join(os.tmpdir(), 'cot-horizon-bench-unit-'));
try {
  const out = join(dir, 'receipt.json');
  const result = await writeFreshReport(out, async () => { throw new Error('retained acquisition failure'); });
  assert.equal(result.pass, false); assert.match(fs.readFileSync(out, 'utf8'), /retained acquisition failure/);
  const original = fs.readFileSync(out);
  await assert.rejects(writeFreshReport(out, async () => ({ pass: true })), /EEXIST/);
  assert.deepEqual(fs.readFileSync(out), original, 'Never overwrite earlier evidence');
} finally { fs.rmSync(join(dir, 'receipt.json')); fs.rmdirSync(dir); }
console.log('horizon construction benchmark: cold pairing, scope, resource bytes/disposal, source guards, raw failures, worker-close ownership and fresh evidence pass');
