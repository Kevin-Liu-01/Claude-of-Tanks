import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSelftestSuite, runSelftestFile, selftestWorkerCount, SELFTEST_EXCLUSIVE_CPU_FILES } from './run-selftests.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
assert.equal(selftestWorkerCount({}), Math.min(8, availableParallelism()), 'bounded pool is the CLI default');
for(const available of [1,2,3,4,5,6,7,8,18,64])
  assert.equal(selftestWorkerCount({},available),Math.min(8,available),'respect available CPUs and eight-worker ceiling');
assert.equal(selftestWorkerCount({COT_SELFTEST_WORKERS:'1'},18),1,'explicit serial debugging stays supported');
assert.equal(selftestWorkerCount({COT_SELFTEST_WORKERS:'4'},1),4,'explicit existing override remains authoritative');
for(const available of [0,-1,2.5,NaN])
  assert.throws(()=>selftestWorkerCount({},available),/integer from 1 to 8/);
for(const value of [1,2,3,4,5,6,7,8])assert.equal(selftestWorkerCount({ COT_SELFTEST_WORKERS: String(value) }), value);
for (const value of ['0', '9', '2.5', '', 'NaN', 'Infinity', '2x']) {
  assert.throws(() => selftestWorkerCount({ COT_SELFTEST_WORKERS: value }), /integer from 1 to 8/);
}
function fixture(concurrency=2) {
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
  const options = { concurrency, lock, ownedLeaseFiles: ['browser'], now: () => clock,
    refreshMs: 5, log() {}, logError: error => errors.push(error), onTiming: row => timings.push(row),
    runFile(file) {
      assert.equal(held, file !== 'browser');
      assert.ok(active.size < concurrency);
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

assert.deepEqual(SELFTEST_EXCLUSIVE_CPU_FILES,['src/vehicles/fleetLazy.selftest.mjs','src/ui/garageArchitecture.selftest.mjs','server/dedicatedWorldCollisionMemory.selftest.mjs']);
for(const file of SELFTEST_EXCLUSIVE_CPU_FILES)for(const concurrency of [2,4,8])for(const status of [0,7]){
  const isolated=fixture(concurrency);
  const run=runSelftestSuite('exclusive-cpu',['a','b',file,'after'],isolated.options);
  await tick();assert.deepEqual(isolated.starts,['a','b']);
  isolated.finish('a');await tick();assert.deepEqual(isolated.starts,['a','b']);
  isolated.finish('b');await tick();assert.deepEqual(isolated.starts,['a','b',file]);
  assert.equal(isolated.held,true,'exclusive CPU child retains the runner-owned lease');
  assert.equal(isolated.active.size,1,'timed fleet test has no CPU peers');
  isolated.time(46_000);isolated.finish(file,{status});await tick();
  if(status===0){
    assert.deepEqual(isolated.starts,['a','b',file,'after']);
    assert.equal(isolated.acquisitions,2,'long exclusive child yields FIFO before later CPU work');
    isolated.finish('after');
  }else assert.deepEqual(isolated.starts,['a','b',file],'exclusive failure stops admission');
  assert.equal(await run,status);assert.equal(isolated.held,false);
}

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
for (const concurrency of [0, -1, 9, 2.5, NaN, Infinity]) {
  const invalid = fixture();
  await assert.rejects(runSelftestSuite('invalid', ['never'], { ...invalid.options, concurrency }), /integer from 1 to 8/);
  assert.equal(invalid.acquisitions, 0); assert.deepEqual(invalid.starts, []);
}

for (const concurrency of [3, 4, 5, 6, 7, 8]) {
  const files = Array.from({ length: concurrency }, (_, index) => `cpu-${index}`);
  const barrier = fixture(concurrency);
  const barrierRun = runSelftestSuite('wide-barrier', [...files, 'browser', 'after'], barrier.options);
  await tick(); assert.deepEqual(barrier.starts, files);
  for (const file of files.slice(1)) { barrier.finish(file); await tick(); }
  assert.deepEqual(barrier.starts, files, 'browser waits for every CPU peer');
  assert.equal(barrier.held, true);
  barrier.finish(files[0]); await tick();
  assert.deepEqual(barrier.starts, [...files, 'browser']); assert.equal(barrier.held, false);
  barrier.finish('browser'); await tick(); barrier.finish('after');
  assert.equal(await barrierRun, 0); assert.equal(barrier.acquisitions, 2);
  assert.equal(barrier.timings.length, files.length + 2);

  const failure = fixture(concurrency);
  const failureRun = runSelftestSuite('wide-failure', [...files, 'never'], failure.options);
  await tick(); failure.finish(files.at(-1), { status: 9 }); await tick();
  assert.deepEqual(failure.starts, files); assert.equal(failure.held, true);
  failure.finish(files[0], { status: 7 }); await tick();
  for (const file of files.slice(1, -1)) failure.finish(file);
  assert.equal(await failureRun, 7, 'registry order wins over completion order at every width');
  assert.equal(failure.held, false); assert.deepEqual(failure.starts, files);

  const observer = fixture(concurrency), error = new Error('wide observer failure');
  observer.options.onTiming = () => { throw error; };
  let settled = false;
  const observerRun = runSelftestSuite('wide-observer', [...files, 'never'], observer.options)
    .catch(failure => { settled = true; return failure; });
  await tick(); observer.finish(files[0]); await tick();
  assert.equal(settled, false); assert.equal(observer.held, true);
  for (const file of files.slice(1)) observer.finish(file);
  assert.equal(await observerRun, error); assert.equal(observer.held, false);
  assert.deepEqual(observer.starts, files);

  const fair = fixture(concurrency);
  const fairRun = runSelftestSuite('wide-fifo', [...files, 'after'], fair.options);
  await tick(); fair.time(46_000);
  for (const file of files.slice(1)) { fair.finish(file); await tick(); }
  assert.deepEqual(fair.starts, files); assert.equal(fair.held, true);
  fair.finish(files[0]); await tick();
  assert.equal(fair.acquisitions, 2); assert.deepEqual(fair.starts, [...files, 'after']);
  fair.finish('after'); assert.equal(await fairRun, 0); assert.equal(fair.held, false);
}

for (const concurrency of [2, 3, 4, 5, 6, 7, 8]) for (const signal of ['SIGINT', 'SIGTERM']) {
  const signals = new EventEmitter(), children = new Map(), kills = [];
  const state = fixture(concurrency);
  const files = Array.from({ length: concurrency }, (_, index) => `cpu-${index}`);
  state.options.runFile = file => runSelftestFile(file, {
    signals, spawnProcess() {
      const child = new EventEmitter(); child.kill = value => kills.push([file, value]);
      state.active.add(file); state.starts.push(file); children.set(file, child);
      child.once('close', () => state.active.delete(file)); return child;
    },
  });
  const pending = runSelftestSuite('signal', [...files, 'never'], state.options);
  await tick(); signals.emit(signal);
  assert.deepEqual(kills, files.map(file => [file, signal]), 'signal reaches all owned children');
  const otherSignal = signal === 'SIGINT' ? 'SIGTERM' : 'SIGINT';
  assert.equal(signals.emit(signal), true, 'repeated signal stays handled during drain');
  assert.equal(signals.emit(otherSignal), true, 'mixed signal also reaches all survivors');
  assert.deepEqual(kills.slice(concurrency), [signal, otherSignal].flatMap(value => files.map(file => [file, value])));
  for (const file of files.slice(0, -1)) children.get(file).emit('close', 0);
  await tick(); assert.equal(state.held, true);
  const count = kills.length;
  assert.equal(signals.listenerCount('SIGINT'), 1);
  assert.equal(signals.listenerCount('SIGTERM'), 1);
  assert.equal(signals.emit(signal), true);
  assert.equal(signals.emit(otherSignal), true);
  assert.deepEqual(kills.slice(count), [[files.at(-1), signal], [files.at(-1), otherSignal]], 'only live peer receives repeats');
  assert.deepEqual(state.starts, files, 'interrupted pool admits no more work');
  children.get(files.at(-1)).emit('close', 0);
  assert.equal(await pending, signal === 'SIGINT' ? 130 : 143);
  assert.equal(state.held, false); assert.deepEqual(state.starts, files);
  assert.equal(signals.listenerCount('SIGINT') + signals.listenerCount('SIGTERM'), 0);
}

// Real fresh Node processes must overlap to satisfy this rendezvous. This is
// a concurrency/independence proof, not a timing speedup or performance gate.
for (const concurrency of [2, 3, 4, 5, 6, 7, 8]) {
const directory = mkdtempSync(join(tmpdir(), 'cot-cpu-pool-'));
try {
  const files = Array.from({ length: concurrency }, (_, index) => join(directory, `${index}.mjs`));
  for (const [index, file] of files.entries()) {
    const own = join(directory, `${index}.ready`), peers = files.map((_, index) => join(directory, `${index}.ready`));
    writeFileSync(file, `import assert from 'node:assert/strict';
import {writeFileSync,existsSync} from 'node:fs';
globalThis.executions=(globalThis.executions||0)+1;assert.equal(globalThis.executions,1);
writeFileSync(${JSON.stringify(own)},String(process.pid));
const until=Date.now()+10000;
while(!${JSON.stringify(peers)}.every(path=>existsSync(path))){assert.ok(Date.now()<until,'all fresh children must overlap');await new Promise(r=>setTimeout(r,5));}
`);
  }
  const real = fixture(concurrency);
  assert.equal(await runSelftestSuite('real-processes', files, { ...real.options, runFile: runSelftestFile }), 0);
  assert.equal(new Set(files.map((_, index) => readFileSync(join(directory, `${index}.ready`), 'utf8'))).size, concurrency);
  assert.equal(real.held, false);
} finally { rmSync(directory, { recursive: true, force: true }); }
}
console.log('selftest CPU pool: two to eight fresh workers, exact dispatch/coverage, exclusive browser barriers, bounded FIFO batches, failure/observer/signal drain and real-process rendezvous pass');
