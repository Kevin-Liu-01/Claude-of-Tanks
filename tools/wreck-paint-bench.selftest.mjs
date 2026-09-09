import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RECIPES, parseArgs, schedule, stageCategory, outputIdentity, measureSteps,
  distribution, summarize, ownWorker, registerCancellation, sourceTreeIdentity } from './wreck-paint-bench.mjs';

assert.deepEqual(parseArgs(['--baseline=/before', '--candidate=/after', '--out=/fresh']),
  { baseline: '/before', candidate: '/after', out: '/fresh' });
for (const args of [[], ['--baseline=relative'], ['--baseline=/a', '--candidate=/a', '--out=/x'],
  ['--baseline=/a', '--candidate=/b', '--out=/x', '--out=/y'],
  ['--baseline=/a', '--candidate=/b', '--out=/x', '--runs=1']]) assert.throws(() => parseArgs(args));
const planned = schedule();
assert.equal(planned.length, 12);
assert.deepEqual(planned.map(row => row.role), Array.from({ length: 6 }, () => ['baseline', 'candidate']).flat());
for (const recipe of RECIPES) for (const role of ['baseline', 'candidate']) {
  assert.equal(planned.filter(row => row.role === role && row.recipe === recipe).length, 3);
}
for (const [stage, category] of [['construct', 'constructor'], ['collect-instances-16', 'collection'],
  ['collect-nodes-32', 'collection'], ['normalize-visible-16', 'normalization'], ['normalize-shadow-16', 'normalization'],
  ['paint-vertices-2048', 'painting'], ['compact-index-probes-2048', 'compaction'],
  ['compact-position-2048', 'compaction'], ['merge-visible', 'rest'], ['finalize', 'rest']]) {
  assert.equal(stageCategory(`wreck-k2:${stage}`), category);
}
assert.equal(stageCategory('return-and-dispose'), 'rest');
assert.deepEqual(distribution([3, 1, 2]), { min: 1, max: 3, median: 2 });
assert.equal(distribution([4, 2]).median, 3);
for (const values of [[], [NaN], [Infinity], [-1]]) assert.throws(() => distribution(values));
const sourceFixture = mkdtempSync(join(tmpdir(), 'cot-wreck-bench-selftest-'));
try {
  mkdirSync(join(sourceFixture, 'src'));
  writeFileSync(join(sourceFixture, 'src/fixture.ts'), 'export const value = 1;');
  const before = sourceTreeIdentity(sourceFixture);
  assert.equal(before.files, 1); assert.deepEqual(sourceTreeIdentity(sourceFixture), before);
  writeFileSync(join(sourceFixture, 'src/fixture.ts'), 'export const value = 2;');
  assert.notEqual(sourceTreeIdentity(sourceFixture).hash, before.hash, 'Source mutation changes the pinned identity');
  symlinkSync(join(sourceFixture, 'src/fixture.ts'), join(sourceFixture, 'src/linked.ts'));
  assert.throws(() => sourceTreeIdentity(sourceFixture), /linked\/special/, 'Executed symlink targets cannot be omitted silently');
} finally { rmSync(sourceFixture, { recursive: true, force: true }); }

function fixture() {
  let disposals = 0;
  const attribute = array => ({ array, count: array.length / 3, itemSize: 3,
    normalized: false, usage: 35044, gpuType: 1015, name: '' });
  const geometry = () => ({ name: '', type: 'BufferGeometry',
    attributes: { position: attribute(new Float32Array([0, -0, 0, 1, 0, 0, 0, 1, 0])) },
    index: { ...attribute(new Uint16Array([0, 1, 2])), count: 3, itemSize: 1 },
    morphAttributes: {}, morphTargetsRelative: false, groups: [], userData: {},
    drawRange: { start: 0, count: Infinity }, boundingBox: null, boundingSphere: null,
    dispose() { disposals++; } });
  return { baked: { hx: 1, hz: 2, h: 3, tris: 1, geo: geometry(), shadowGeo: geometry() },
    disposals: () => disposals };
}
const reference = outputIdentity(fixture().baked);
assert.equal(reference.details.visible.drawRange.count, 'Infinity');
for (const mutate of [
  baked => { baked.geo.attributes.position.array[0] = -0; },
  baked => { baked.geo.attributes.position.normalized = true; },
  baked => { baked.geo.attributes.position.usage++; },
  baked => { baked.geo.index.array[0] = 2; },
  baked => { baked.shadowGeo.attributes.position.array[1] = 0; },
  baked => { baked.geo.groups.push({ start: 0, count: 3, materialIndex: 0 }); },
  baked => { baked.geo.userData.test = true; },
  baked => { baked.geo.boundingSphere = { center: { toArray: () => [0, 0, 0] }, radius: 1 }; },
  baked => { baked.hx = 4; },
]) {
  const { baked } = fixture(); mutate(baked);
  assert.notEqual(outputIdentity(baked).sha256, reference.sha256, 'Storage, shadow and metadata changes cannot pass parity');
}
assert.throws(() => outputIdentity(null));
const invalidIndex = fixture(); invalidIndex.baked.geo.index.itemSize = 3;
assert.throws(() => outputIdentity(invalidIndex.baked), /scalar indices/);
const outOfBoundsIndex = fixture(); outOfBoundsIndex.baked.geo.index.array[0] = 3;
assert.throws(() => outputIdentity(outOfBoundsIndex.baked));
const measuredFixture = fixture(); let closed = false, clock = 0;
function* steps() {
  try {
    for (const stage of ['construct', 'compact-index-3', 'paint-vertices-3', 'finalize']) yield { stage: `wreck-k2:${stage}` };
    return measuredFixture.baked;
  } finally { closed = true; }
}
const measured = measureSteps(steps(), () => clock++);
assert.equal(measured.synchronousMs, 5);
assert.deepEqual(measured.categoryMs, { constructor: 1, collection: 0, normalization: 0, painting: 1, compaction: 1, rest: 2 });
assert.equal(measured.paintRows, 3); assert.equal(measured.stages.at(-1).stage, 'return-and-dispose');
assert.equal(closed, true); assert.equal(measuredFixture.disposals(), 2);
let failedClosed = false;
function* failedSteps() { try { throw new Error('fixture bake failure'); } finally { failedClosed = true; } }
assert.throws(() => measureSteps(failedSteps()), /fixture bake failure/); assert.equal(failedClosed, true);
const missingPaint = fixture();
assert.throws(() => measureSteps((function* () { return missingPaint.baked; })()), /paint-vertices/);
assert.equal(missingPaint.disposals(), 2, 'Invalid returned output remains owned');
const samples = planned.map((job, index) => ({ ...job, ...measured,
  output: structuredClone(measured.output),
  paintRows: job.role === 'baseline' ? 6 : 3, synchronousMs: index + 1, moduleImportMs: 1, builderAcquisitionMs: 2 }));
const summary = summarize(samples);
assert.equal(summary.length, 2); assert.equal(summary[0].baseline.samples, 3);
assert.equal(summary[0].baseline.synchronousMs.median, 5);
assert.equal(summary[0].candidate.synchronousMs.median, 6);
assert.equal(summary[0].candidateMinusBaselineMedianMs, 1, 'Slower candidate is reported honestly, not rejected or hidden');
assert.throws(() => summarize(samples.slice(1)), /Every planned/);
const reordered = structuredClone(samples); [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
assert.throws(() => summarize(reordered));
const mismatch = structuredClone(samples); mismatch[1].output.details.h = 4;
assert.throws(() => summarize(mismatch), /Exact t90m output differs/);
const unstable = structuredClone(samples); unstable[4].paintRows++;
assert.throws(() => summarize(unstable), /deterministic/);

function fakeChild() {
  const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  child.kills = []; child.kill = signal => { child.kills.push(signal); return true; };
  return child;
}
function fakeTimers() {
  let nextId = 0;
  const pending = new Map();
  return {
    setTimer(callback, delay) { const id = ++nextId; pending.set(id, { callback, delay }); return id; },
    clearTimer(id) { pending.delete(id); },
    fire(delay) {
      const entry = [...pending.entries()].find(([, task]) => task.delay === delay);
      assert.ok(entry, `Expected owned ${delay}ms timer`);
      pending.delete(entry[0]); entry[1].callback();
    },
    size: () => pending.size,
  };
}
const child = fakeChild(), owner = ownWorker(child);
let settled = false; owner.done.then(() => { settled = true; });
child.emit('message', { fixture: true }); child.emit('exit', 0);
await Promise.resolve(); assert.equal(settled, false, 'Exit alone cannot release the child/FIFO owner');
child.stdout.emit('data', Buffer.from('output')); child.emit('close', 0, null);
assert.deepEqual(await owner.done, { stdout: 'output', stderr: '', receipt: { fixture: true }, error: null });

const signalEmitter = new EventEmitter(), cancelled = fakeChild(), cancelTimers = fakeTimers();
const cancelledOwner = ownWorker(cancelled, { ...cancelTimers, graceMs: 1 });
let active = null;
const cancellation = registerCancellation(() => active, signalEmitter);
signalEmitter.emit('SIGINT'); assert.equal(cancellation.isInterrupted(), true);
active = cancelledOwner;
signalEmitter.emit('SIGINT'); signalEmitter.emit('SIGTERM');
assert.deepEqual(cancelled.kills, ['SIGTERM', 'SIGTERM']);
assert.equal(cancelTimers.size(), 2, 'Repeated signals cannot create detached force-kill timers');
cancelTimers.fire(1);
assert.equal(cancelled.kills.at(-1), 'SIGKILL', 'Repeated cancellation retains one bounded force-kill timer');
let drained = false; cancelledOwner.done.then(() => { drained = true; });
await Promise.resolve(); assert.equal(drained, false, 'Cancellation still awaits actual child close');
cancelled.emit('close', null, 'SIGKILL');
assert.match((await cancelledOwner.done).error, /Interrupted/);
assert.equal(cancelTimers.size(), 0);
active = null; cancellation.dispose(); cancellation.dispose();
assert.equal(signalEmitter.listenerCount('SIGINT'), 0); assert.equal(signalEmitter.listenerCount('SIGTERM'), 0);

const timed = fakeChild(), timeoutTimers = fakeTimers();
const timedOwner = ownWorker(timed, { ...timeoutTimers, timeoutMs: 1, graceMs: 2 });
timeoutTimers.fire(1); timeoutTimers.fire(2);
assert.deepEqual(timed.kills, ['SIGTERM', 'SIGKILL']); timed.emit('close', null, 'SIGKILL');
assert.match((await timedOwner.done).error, /time bound/);
assert.equal(timeoutTimers.size(), 0);
const failed = fakeChild(), failedOwner = ownWorker(failed);
let spawnFailureDrained = false; failedOwner.done.then(() => { spawnFailureDrained = true; });
failed.emit('error', new Error('spawn failure'));
await Promise.resolve(); assert.equal(spawnFailureDrained, false, 'Spawn error cannot bypass close/drain');
failed.emit('close', -2, null);
assert.match((await failedOwner.done).error, /spawn failure/);
const silent = fakeChild(), silentOwner = ownWorker(silent); silent.emit('close', 0, null);
assert.match((await silentOwner.done).error, /receipt/);
const noisy = fakeChild(), noiseTimers = fakeTimers(), noisyOwner = ownWorker(noisy, noiseTimers);
noisy.stdout.emit('data', Buffer.alloc(300000, 'x')); noisy.stderr.emit('data', Buffer.alloc(300000, 'y'));
noisy.emit('close', null, 'SIGTERM');
const noiseResult = await noisyOwner.done;
assert.match(noiseResult.error, /output exceeded/);
assert.equal(noiseResult.stdout.length + noiseResult.stderr.length, 256 * 1024, 'Retained logs stay bounded after overflow');
assert.equal(noiseTimers.size(), 0);
console.log('wreck-paint-bench.selftest: parser, fixed alternating samples, exact output identity, checkpoint timing, honest medians and bounded child drain pass; no factory/process/FIFO/GPU work');
