import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SELFTEST_SUITES } from './selftest-suites.mjs';
import { runSelftestFile, runSelftestSuite, selftestChildEnv, SELFTEST_OWNED_LEASE_FILES } from './run-selftests.mjs';

function fixture({ failAt, errorAt, acquireError } = {}) {
  const events = [], errors = [];
  let held = false, refreshes = 0;
  const lock = {
    async acquire(timeout) {
      assert.equal(timeout, 45 * 60 * 1000);
      assert.equal(held, false, 'never nest the ordinary-test lease');
      if (acquireError) throw acquireError;
      held = true; events.push('acquire');
    },
    release() { assert.equal(held, true); held = false; events.push('release'); },
    refresh() { assert.equal(held, true); refreshes++; },
  };
  const options = {
    lock, ownedLeaseFiles: ['browser'], refreshMs: 5,
    log: (message) => events.push(message), logError: (message) => errors.push(message),
    async runFile(file) {
      assert.equal(held, file !== 'browser', 'actual browser child owns its own lease');
      events.push(file);
      if (file === 'slow') await new Promise((resolve) => setTimeout(resolve, 25));
      return { status: file === failAt ? 7 : 0, error: file === errorAt ? new Error('spawn failed') : undefined };
    },
  };
  return { options, events, errors, get held() { return held; }, get refreshes() { return refreshes; } };
}

const ordered = fixture();
assert.equal(await runSelftestSuite('fixture', ['a', 'slow', 'b', 'browser', 'c', 'd'], ordered.options), 0);
assert.deepEqual(ordered.events, ['[selftests] fixture: 6 files', 'acquire', 'a', 'slow', 'b',
  'release', 'browser', 'acquire', 'c', 'd', '[selftests] PASS fixture', 'release']);
assert.ok(ordered.refreshes > 0, 'async child waiting refreshes the held lease');
assert.equal(ordered.held, false);
const refreshes = ordered.refreshes;
await new Promise((resolve) => setTimeout(resolve, 15));
assert.equal(ordered.refreshes, refreshes, 'finished suites clear their heartbeat');

for (const failAt of ['a', 'browser']) {
  const failed = fixture({ failAt });
  assert.equal(await runSelftestSuite('failure', ['a', 'browser', 'never'], failed.options), 7);
  assert.equal(failed.events.includes('never'), false, 'preserve fail-fast ordering');
  assert.deepEqual(failed.errors, [`[selftests] FAIL ${failAt}`]);
  assert.equal(failed.held, false, 'ordinary and own-lock failures release only runner ownership');
}
const spawnFailed = fixture({ errorAt: 'a' });
await assert.rejects(runSelftestSuite('spawn-error', ['a'], spawnFailed.options), /spawn failed/);
assert.equal(spawnFailed.held, false);
const blocked = fixture({ acquireError: new Error('busy') });
await assert.rejects(runSelftestSuite('blocked', ['never'], blocked.options), /busy/);
assert.equal(blocked.events.includes('release'), false, 'failed acquisition cannot release another owner');
assert.equal(blocked.events.includes('never'), false);
const browserOnly = fixture();
assert.equal(await runSelftestSuite('browser-only', ['browser', 'browser'], browserOnly.options), 0);
assert.equal(browserOnly.events.includes('acquire'), false, 'consecutive own-lock children need no outer lease');
const terminated = fixture();
terminated.options.runFile = async () => ({ status: null });
assert.equal(await runSelftestSuite('terminated', ['a'], terminated.options), 1,
  'signal termination preserves the old null-status failure code');
assert.equal(terminated.held, false);

// Fake elapsed time: even a child that exceeds the entire batch budget keeps
// exclusive ownership until it has completed. Subsequent files rejoin FIFO,
// with exact coverage/order and no reset of failure behavior.
const fair = fixture();
let clockMs = 0;
const fairRunFile = fair.options.runFile;
fair.options.now = () => clockMs;
fair.options.maxLeaseBatchMs = 45_000;
fair.options.runFile = async (file) => {
  const result = await fairRunFile(file);
  clockMs += file === 'long-child' ? 120_000 : 30_000;
  assert.equal(fair.held, file !== 'browser', 'never release a live child mid-file');
  return result;
};
assert.equal(await runSelftestSuite('fair', ['a', 'b', 'long-child', 'c', 'browser', 'd'], fair.options), 0);
assert.deepEqual(fair.events, ['[selftests] fair: 6 files', 'acquire', 'a', 'b',
  'release', 'acquire', 'long-child', 'release', 'acquire', 'c',
  'release', 'browser', 'acquire', 'd', '[selftests] PASS fair', 'release']);
const boundaryFail = fixture({ failAt: 'b' });
let failureClock = 0;
const failureRunFile = boundaryFail.options.runFile;
boundaryFail.options.now = () => failureClock;
boundaryFail.options.runFile = async (file) => { const result = await failureRunFile(file); failureClock += 45_000; return result; };
assert.equal(await runSelftestSuite('boundary-fail', ['a', 'b', 'never'], boundaryFail.options), 7);
assert.equal(boundaryFail.events.includes('never'), false);
assert.equal(boundaryFail.events.filter(event => event === 'acquire').length, 2);
assert.equal(boundaryFail.held, false);
for (const budget of [0, -1, NaN, Infinity]) {
  const invalidBudget = fixture();
  await assert.rejects(runSelftestSuite('invalid-budget', ['never'], { ...invalidBudget.options, maxLeaseBatchMs: budget }), /finite and positive/);
  assert.equal(invalidBudget.events.length, 0, 'invalid scheduling options cannot acquire or run');
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  const signals = new EventEmitter(), child = new EventEmitter(), kills = [];
  child.kill = (value) => { kills.push(value); return true; };
  let launch;
  const pending = runSelftestFile('fixture.mjs', {
    signals, spawnProcess: (...args) => { launch = args; return child; },
  });
  assert.deepEqual(launch.slice(0, 2), [process.execPath, ['fixture.mjs']]);
  assert.equal(launch[2].cwd, process.cwd());
  assert.deepEqual(launch[2].env, selftestChildEnv());
  assert.equal(launch[2].stdio, 'inherit');
  signals.emit(signal);
  assert.deepEqual(kills, [signal], 'forward termination only to the owned child');
  let finished = false;
  pending.then(() => { finished = true; });
  await Promise.resolve();
  assert.equal(finished, false, 'lease must remain held until the child actually closes');
  child.emit('close', 0);
  assert.deepEqual(await pending, { status: signal === 'SIGINT' ? 130 : 143, error: undefined },
    'graceful child cleanup cannot turn a requested interruption into suite success');
  assert.equal(signals.listenerCount('SIGINT') + signals.listenerCount('SIGTERM'), 0);
}
for (const [signal, status] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGKILL', 137]]) {
  const signals = new EventEmitter(), child = new EventEmitter();
  child.kill = () => assert.fail('spontaneous child termination must not send another signal');
  const pending = runSelftestFile('terminated.mjs', { signals, spawnProcess: () => child });
  child.emit('close', null, signal);
  assert.deepEqual(await pending, { status, error: undefined },
    'owned child signal termination propagates the customary exit status');
  assert.equal(signals.listenerCount('SIGINT') + signals.listenerCount('SIGTERM'), 0);
}
const spawnSignals = new EventEmitter(), failedChild = new EventEmitter();
failedChild.kill = () => false;
const failedLaunch = runSelftestFile('missing.mjs', { signals: spawnSignals, spawnProcess: () => failedChild });
const error = new Error('ENOENT');
failedChild.emit('error', error);
failedChild.emit('close', -2);
assert.deepEqual(await failedLaunch, { status: -2, error });
assert.equal(spawnSignals.listenerCount('SIGINT') + spawnSignals.listenerCount('SIGTERM'), 0);
await assert.rejects(runSelftestFile('bad-launch.mjs', {
  signals: spawnSignals, spawnProcess() { throw new Error('synchronous launch failure'); },
}), /synchronous launch failure/);
assert.equal(spawnSignals.listenerCount('SIGINT') + spawnSignals.listenerCount('SIGTERM'), 0);

assert.deepEqual(SELFTEST_OWNED_LEASE_FILES, [
  'tools/source-dimension-frame.browser.selftest.mjs',
  'tools/resolved-depth-copy.browser.selftest.mjs',
  'tools/late-fx-matrix.browser.selftest.mjs',
  'tools/articulated-shadow-batch.browser.selftest.mjs',
  'tools/track-texture-source.browser.selftest.mjs',
]);
for (const file of SELFTEST_OWNED_LEASE_FILES) {
  assert.equal(Object.values(SELFTEST_SUITES).flat().filter((entry) => entry === file).length, 1);
}
// Exercise the actual production default registry, including CPU-only CLI
// guards whose filenames contain "browser" but acquire no real lease here.
const cpuBrowserGuard = 'tools/lobby-prefetch-before-ready.browser.selftest.mjs';
function actualRegistryFixture(ownedLeaseFiles = SELFTEST_OWNED_LEASE_FILES) {
  const result = fixture();
  result.options.ownedLeaseFiles = ownedLeaseFiles;
  result.options.runFile = async file => {
    assert.equal(result.held, !SELFTEST_OWNED_LEASE_FILES.includes(file),
      `${file}: runner must release before a child acquires the same FIFO`);
    result.events.push(file);
    return { status: 0 };
  };
  return result;
}
const registered = actualRegistryFixture();
assert.equal(await runSelftestSuite('actual-registry', ['cpu', ...SELFTEST_OWNED_LEASE_FILES, cpuBrowserGuard], registered.options), 0);
assert.deepEqual(registered.events, ['[selftests] actual-registry: 7 files', 'acquire', 'cpu', 'release',
  ...SELFTEST_OWNED_LEASE_FILES, 'acquire', cpuBrowserGuard, '[selftests] PASS actual-registry', 'release']);
const oldRegistry = actualRegistryFixture(['tools/source-dimension-frame.browser.selftest.mjs']);
await assert.rejects(runSelftestSuite('old-nested-registry', ['cpu', 'tools/resolved-depth-copy.browser.selftest.mjs'], oldRegistry.options),
  /runner must release/);
assert.equal(oldRegistry.held, false, 'the old nested-lock failure still releases owned runner resources');
for (const concurrency of [1, 2, 3, 4, 5, 6, 7, 8]) for (const lateFx of [
  'tools/late-fx-matrix.browser.selftest.mjs', 'tools/articulated-shadow-batch.browser.selftest.mjs',
  'tools/track-texture-source.browser.selftest.mjs',
]) {
  const current = actualRegistryFixture();
  assert.equal(await runSelftestSuite('late-fx-barrier', ['cpu', lateFx, cpuBrowserGuard],
    { ...current.options, concurrency }), 0, `${lateFx}: real native registry entry is an exclusive browser barrier`);
  const missing = actualRegistryFixture(SELFTEST_OWNED_LEASE_FILES.filter(file => file !== lateFx));
  await assert.rejects(runSelftestSuite('missing-late-fx', ['cpu', lateFx],
    { ...missing.options, concurrency }), /runner must release/);
  assert.equal(missing.held, false, 'reject the previous nested-lock configuration in either runner');
}
const overbroadRegistry = actualRegistryFixture([...SELFTEST_OWNED_LEASE_FILES, cpuBrowserGuard]);
await assert.rejects(runSelftestSuite('overbroad-registry', [cpuBrowserGuard], overbroadRegistry.options), /runner must release/);
const invalid = spawnSync(process.execPath, ['tools/run-selftests.mjs', 'missing-suite'], { encoding: 'utf8' });
assert.equal(invalid.status, 2);
assert.match(invalid.stderr, /Unknown self-test suite/);
assert.equal(invalid.stdout, '', 'unknown suites do not acquire resources or launch checks');
console.log('run-selftests: bounded FIFO batches, nonnested browser ownership, refresh, exact order and failure/signal cleanup pass');

const measured = fixture();
let measuredClock = 0;
const timings = [];
const measuredAcquire = measured.options.lock.acquire;
measured.options.lock.acquire = async timeout => { await measuredAcquire(timeout); measuredClock += 120; };
measured.options.now = () => measuredClock;
measured.options.onTiming = row => timings.push(row);
measured.options.runFile = async file => { measuredClock += file === 'a' ? 30 : 70; return { status: file === 'a' ? 0 : 7 }; };
assert.equal(await runSelftestSuite('measured', ['a', 'b', 'never'], measured.options), 7);
assert.deepEqual(timings, [
  { file: 'a', runMs: 30, queueMs: 120, status: 0, error: undefined },
  { file: 'b', runMs: 70, queueMs: 0, status: 7, error: undefined },
], 'execution and FIFO time stay separate, including the terminal failing file');

for (const env of [{ NODE_DISABLE_COMPILE_CACHE: '1' }, { NODE_COMPILE_CACHE: '/explicit' }, { NODE_V8_COVERAGE: '/coverage' }]) {
  assert.equal(selftestChildEnv(env), env, 'respect caller opt-out, explicit cache and coverage');
}
const originalEnv = { EXAMPLE: 'preserved' }, cachedEnv = selftestChildEnv(originalEnv);
assert.equal(cachedEnv.EXAMPLE, 'preserved');
assert.equal(originalEnv.NODE_COMPILE_CACHE, undefined, 'never mutate parent environment');
assert.match(cachedEnv.NODE_COMPILE_CACHE, /cot-selftest-compile-/);

// Real fresh processes prove that compiled code reuse does not cache test
// results/global state and that editing the source cannot reuse a stale pass.
const cacheFixture = mkdtempSync(join(tmpdir(), 'cot-compile-regression-'));
try {
  const file = join(cacheFixture, 'fixture.mjs');
  const env = { ...process.env, NODE_COMPILE_CACHE: join(cacheFixture, 'cache') };
  delete env.NODE_DISABLE_COMPILE_CACHE;
  const source = `import assert from 'node:assert/strict';\nimport { getCompileCacheDir } from 'node:module';\nassert.ok(getCompileCacheDir());\nglobalThis.executions = (globalThis.executions || 0) + 1;\nassert.equal(globalThis.executions, 1);\n`;
  writeFileSync(file, source);
  for (let run = 0; run < 2; run++) {
    const child = spawnSync(process.execPath, [file], { env, encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
  }
  writeFileSync(file, source + `assert.fail('changed source still executes');\n`);
  const changed = spawnSync(process.execPath, [file], { env, encoding: 'utf8' });
  assert.notEqual(changed.status, 0);
  assert.match(changed.stderr, /changed source still executes/);
} finally { rmSync(cacheFixture, { recursive: true, force: true }); }
console.log('run-selftests: separate execution/FIFO timings and source-invalidated fresh-process compile caching pass');
