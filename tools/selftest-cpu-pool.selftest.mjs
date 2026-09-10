import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSelftestSuite, runSelftestFile, selftestWorkerCount } from './run-selftests.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
assert.equal(selftestWorkerCount({}), 1, 'parallel scheduling is initially opt-in');
assert.equal(selftestWorkerCount({ COT_SELFTEST_WORKERS: '2' }), 2);
for (const value of ['0', '3', '', 'NaN', 'Infinity', '2x']) {
  assert.throws(() => selftestWorkerCount({ COT_SELFTEST_WORKERS: value }), /1 or 2/);
}
function fixture() {
  const starts = [], pending = new Map(), active = new Set(), timings = [], errors = [];
  let held = false, clock = 0, acquisitions = 0, refreshes = 0;
  const lock = {
    async acquire(timeout) {
      assert.equal(timeout, 45 * 60 * 1000);
      assert.equal(held, false); assert.equal(active.size, 0);
      held = true; acquisitions++;
    },
    release() { assert.equal(held, true); assert.equal(active.size, 0, 'never release a live child'); held = false; },
    refresh() { assert.equal(held, true); refreshes++; },
  };
  const options = { concurrency: 2, lock, ownedLeaseFiles: ['browser'], now: () => clock,
    refreshMs: 5, log() {}, logError: error => errors.push(error), onTiming: row => timings.push(row),
    runFile(file) {
      assert.equal(held, file !== 'browser');
      assert.ok(active.size < 2);
      if (file === 'browser') assert.equal(active.size, 0, 'browser runs alone');
      active.add(file); starts.push(file);
      return new Promise((resolve, reject) => pending.set(file, { resolve, reject }));
    },
  };
  return { options, starts, active, timings, errors,
    get held() { return held; }, get acquisitions() { return acquisitions; }, get refreshes() { return refreshes; },
    time(value) { clock = value; },
    finish(file, result = { status: 0 }, rejected = false) {
      const child = pending.get(file); assert.ok(child, `owned ${file}`);
      active.delete(file); pending.delete(file);
      child[rejected ? 'reject' : 'resolve'](result);
    },
  };
}

const normal = fixture();
const normalRun = runSelftestSuite('parallel', ['a', 'b', 'browser', 'c', 'd'], normal.options);
await tick(); assert.deepEqual(normal.starts, ['a', 'b']);
await new Promise(resolve => setTimeout(resolve, 15));
assert.ok(normal.refreshes > 0, 'CPU pool maintains the lease heartbeat');
normal.finish('b'); await tick();
assert.deepEqual(normal.starts, ['a', 'b'], 'browser barrier drains both earlier CPU children');
normal.finish('a'); await tick();
assert.deepEqual(normal.starts, ['a', 'b', 'browser']); assert.equal(normal.held, false);
normal.finish('browser'); await tick();
assert.deepEqual(normal.starts, ['a', 'b', 'browser', 'c', 'd']);
normal.finish('d'); normal.finish('c'); assert.equal(await normalRun, 0);
assert.equal(normal.acquisitions, 2); assert.equal(normal.held, false);
assert.deepEqual(normal.timings.map(row => row.file).sort(), ['a', 'b', 'browser', 'c', 'd'].sort());
const stoppedRefreshes = normal.refreshes;
await new Promise(resolve => setTimeout(resolve, 15));
assert.equal(normal.refreshes, stoppedRefreshes, 'finished pool clears its heartbeat');

for (const first of ['a', 'b']) {
  const failed = fixture(), other = first === 'a' ? 'b' : 'a';
  const pending = runSelftestSuite('failure', ['a', 'b', 'never'], failed.options);
  await tick(); failed.finish(first, { status: 7 }); await tick();
  assert.deepEqual(failed.starts, ['a', 'b'], 'first observed failure stops new admission');
  assert.equal(failed.held, true, 'already started peer must be drained');
  failed.finish(other, { status: 9 });
  assert.equal(await pending, first === 'a' ? 7 : 9, 'earliest failed suite entry supplies deterministic status');
  assert.equal(failed.held, false); assert.equal(failed.timings.length, 2);
  assert.deepEqual(failed.errors, ['[selftests] FAIL a']);
}
const rejected = fixture(), launchError = new Error('spawn failed');
const rejectedRun = runSelftestSuite('spawn-failure', ['a', 'b', 'never'], rejected.options);
const rejectedResult = rejectedRun.catch(error => error);
await tick(); rejected.finish('b', launchError, true); await tick();
assert.equal(rejected.held, true); rejected.finish('a');
assert.equal(await rejectedResult, launchError); assert.equal(rejected.held, false);

const observed = fixture(), observationError = new Error('observer failed');
observed.options.onTiming = () => { throw observationError; };
let observerFinished = false;
const observerResult = runSelftestSuite('observer-error', ['a', 'b', 'never'], observed.options)
  .catch(error => { observerFinished = true; return error; });
await tick(); observed.finish('a'); await tick();
assert.equal(observerFinished, false); assert.equal(observed.held, true);
observed.finish('b'); assert.equal(await observerResult, observationError);
assert.equal(observed.held, false); assert.deepEqual(observed.starts, ['a', 'b']);

const fair = fixture();
const fairRun = runSelftestSuite('fair', ['a', 'b', 'c'], fair.options);
await tick(); fair.time(46_000); fair.finish('a'); await tick();
assert.deepEqual(fair.starts, ['a', 'b'], 'expired batch admits no more work while draining');
assert.equal(fair.held, true); fair.finish('b'); await tick();
assert.equal(fair.acquisitions, 2, 'drained batch rejoins normal FIFO');
assert.deepEqual(fair.starts, ['a', 'b', 'c']); fair.finish('c'); assert.equal(await fairRun, 0);
assert.equal(fair.held, false);

const browserFailure = fixture();
const browserRun = runSelftestSuite('browser-failure', ['browser', 'never'], browserFailure.options);
await tick(); browserFailure.finish('browser', { status: 4 });
assert.equal(await browserRun, 4); assert.equal(browserFailure.acquisitions, 0);
assert.deepEqual(browserFailure.starts, ['browser']);
const blocked = fixture();
blocked.options.lock.acquire = async () => { throw new Error('busy'); };
await assert.rejects(runSelftestSuite('blocked', ['never'], blocked.options), /busy/);
assert.deepEqual(blocked.starts, []); assert.equal(blocked.held, false);
for (const concurrency of [0, -1, 3, NaN, Infinity]) {
  const invalid = fixture();
  await assert.rejects(runSelftestSuite('invalid', ['never'], { ...invalid.options, concurrency }), /1 or 2/);
  assert.equal(invalid.acquisitions, 0); assert.deepEqual(invalid.starts, []);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  const signals = new EventEmitter(), children = new Map(), kills = [];
  const state = fixture();
  state.options.runFile = file => runSelftestFile(file, {
    signals, spawnProcess() {
      const child = new EventEmitter(); child.kill = value => kills.push([file, value]);
      state.active.add(file); state.starts.push(file); children.set(file, child);
      child.once('close', () => state.active.delete(file)); return child;
    },
  });
  const pending = runSelftestSuite('signal', ['a', 'b', 'never'], state.options);
  await tick(); signals.emit(signal);
  assert.deepEqual(kills, [['a', signal], ['b', signal]], 'signal reaches both owned children');
  const otherSignal = signal === 'SIGINT' ? 'SIGTERM' : 'SIGINT';
  assert.equal(signals.emit(signal), true, 'repeated signal stays handled during drain');
  assert.equal(signals.emit(otherSignal), true, 'mixed signal also reaches both survivors');
  assert.deepEqual(kills.slice(2), [['a', signal], ['b', signal], ['a', otherSignal], ['b', otherSignal]]);
  children.get('a').emit('close', 0); await tick(); assert.equal(state.held, true);
  const count = kills.length;
  assert.equal(signals.listenerCount('SIGINT'), 1);
  assert.equal(signals.listenerCount('SIGTERM'), 1);
  assert.equal(signals.emit(signal), true);
  assert.equal(signals.emit(otherSignal), true);
  assert.deepEqual(kills.slice(count), [['b', signal], ['b', otherSignal]], 'only live peer receives repeats');
  assert.deepEqual(state.starts, ['a', 'b'], 'interrupted pool admits no more work');
  children.get('b').emit('close', 0);
  assert.equal(await pending, signal === 'SIGINT' ? 130 : 143);
  assert.equal(state.held, false); assert.deepEqual(state.starts, ['a', 'b']);
  assert.equal(signals.listenerCount('SIGINT') + signals.listenerCount('SIGTERM'), 0);
}

// Real fresh Node processes must overlap to satisfy this rendezvous. This is
// a concurrency/independence proof, not a timing speedup or performance gate.
const directory = mkdtempSync(join(tmpdir(), 'cot-cpu-pool-'));
try {
  const files = ['a', 'b'].map(id => join(directory, `${id}.mjs`));
  for (const [index, file] of files.entries()) {
    const own = join(directory, `${index}.ready`), peer = join(directory, `${1 - index}.ready`);
    writeFileSync(file, `import assert from 'node:assert/strict';
import {writeFileSync,existsSync} from 'node:fs';
globalThis.executions=(globalThis.executions||0)+1;assert.equal(globalThis.executions,1);
writeFileSync(${JSON.stringify(own)},String(process.pid));
const until=Date.now()+10000;
while(!existsSync(${JSON.stringify(peer)})){assert.ok(Date.now()<until,'both fresh children must overlap');await new Promise(r=>setTimeout(r,5));}
`);
  }
  const real = fixture();
  assert.equal(await runSelftestSuite('real-processes', files, { ...real.options, runFile: runSelftestFile }), 0);
  assert.notEqual(readFileSync(join(directory, '0.ready'), 'utf8'), readFileSync(join(directory, '1.ready'), 'utf8'));
  assert.equal(real.held, false);
} finally { rmSync(directory, { recursive: true, force: true }); }
console.log('selftest CPU pool: two fresh workers, exact dispatch/coverage, exclusive browser barriers, bounded FIFO batches, failure/observer/signal drain and real-process rendezvous pass');
