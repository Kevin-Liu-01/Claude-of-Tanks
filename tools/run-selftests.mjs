import { spawn } from 'node:child_process';
import { availableParallelism, constants, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCaptureLock } from './capture-lock.mjs';
import { SELFTEST_SUITES } from './selftest-suites.mjs';
import { runSelftestCpuPool } from './selftest-cpu-pool.mjs';
import { createSelftestCache } from './selftest-cache.mjs';

// These real browser regressions own the shared lease inside their processes.
// Other subprocess tests either remain CPU-only or reject browser CLI input
// before acquisition. Keep those ordinary tests under the runner's lease.
export const SELFTEST_OWNED_LEASE_FILES = Object.freeze([
  'tools/source-dimension-frame.browser.selftest.mjs',
  'tools/resolved-depth-copy.browser.selftest.mjs',
  'tools/late-fx-matrix.browser.selftest.mjs',
  'tools/articulated-shadow-batch.browser.selftest.mjs',
  'tools/battle-geometry-sharing.browser.selftest.mjs',
  'tools/track-texture-source.browser.selftest.mjs',
  'tools/sourced-building-source.browser.selftest.mjs',
]);

// This full-fleet child has a 240s no-progress functional-test watchdog. Do
// not compete with other native fleet builders while it runs.
// It still uses the runner's lease (unlike a self-leasing browser test).
export const SELFTEST_EXCLUSIVE_CPU_FILES = Object.freeze([
  'src/vehicles/fleetLazy.selftest.mjs',
  // Its unchanged 100 ms construction gate measures host time. Running beside
  // seven complete fleet builders tests CPU contention instead of this owner.
  'src/ui/garageArchitecture.selftest.mjs',
  // The local signaling lifecycle injects a 200x clock and 200 ms request
  // deadlines. Fleet-wide geometry contention can turn healthy socket replies
  // into false timeout failures, so verify this timing contract in isolation.
  'tools/production-room-abandonment.selftest.mjs',
  // Heap/ArrayBuffer plateau measurements run without concurrent fleet/map
  // constructors. Preserve every GC and memory ceiling in the child.
  'server/dedicatedWorldCollisionMemory.selftest.mjs',
  // FSP-01: a real headless Garage gates warm switches on 120 ms p95
  // main-thread blocking and a 250 ms p95 first painted frame. Beside seven
  // fleet builders it would measure host contention, not the switch path.
  'tools/garage-switch-probe.selftest.mjs',
]);

// This caches compilation, NEVER test results or module instances. Every file
// still executes all assertions in a fresh process. Node validates source and
// engine versions. Respect explicit cache/coverage settings and opt-outs.
export function selftestChildEnv(env = process.env) {
  if (env.NODE_COMPILE_CACHE || env.NODE_DISABLE_COMPILE_CACHE || env.NODE_V8_COVERAGE) return env;
  return { ...env, NODE_COMPILE_CACHE: join(tmpdir(), `cot-selftest-compile-${process.getuid?.() ?? 'user'}`) };
}

// Bounded fresh CPU children; real browser regressions remain exclusive.
// Respect smaller hosts and explicit serial/debug overrides without omitting
// any assertion or caching a test result.
export const MAX_SELFTEST_WORKERS = 8;
export function selftestWorkerCount(env = process.env, availableCpus = availableParallelism()) {
  const count = Number(env.COT_SELFTEST_WORKERS ?? Math.min(MAX_SELFTEST_WORKERS, availableCpus));
  if (!Number.isInteger(count) || count < 1 || count > MAX_SELFTEST_WORKERS) throw new TypeError(`COT_SELFTEST_WORKERS must be an integer from 1 to ${MAX_SELFTEST_WORKERS}`);
  return count;
}

export function runSelftestFile(file, { spawnProcess = spawn, signals = process, env = selftestChildEnv() } = {}) {
  return new Promise((resolveResult) => {
    const child = spawnProcess(process.execPath, [file], {
      cwd: process.cwd(), env, stdio: 'inherit',
    });
    let error, interruptedBy;
    const interrupt = () => { interruptedBy ??= 'SIGINT'; child.kill('SIGINT'); };
    const terminate = () => { interruptedBy ??= 'SIGTERM'; child.kill('SIGTERM'); };
    // Repeated signals must keep reaching surviving children while they drain.
    // Removing a one-shot handler early could terminate the parent and release
    // its resource lease before the last child has actually closed.
    signals.on('SIGINT', interrupt);
    signals.on('SIGTERM', terminate);
    child.once('error', (failure) => { error = failure; });
    child.once('close', (status, signal) => {
      signals.removeListener('SIGINT', interrupt);
      signals.removeListener('SIGTERM', terminate);
      const exitSignal = interruptedBy || signal;
      // A child may clean up and exit zero after SIGTERM. The requested suite
      // interruption must still stop subsequent tests with the normal code.
      resolveResult({ status: exitSignal ? 128 + constants.signals[exitSignal] : status, error });
    });
  });
}

// Fast checks (2026-09-15): every file in a group runs and every failure is reported
// before the group returns (the earliest registry entry supplies the exit status), so one
// run surfaces everything a round broke instead of one failure per 40-minute cycle.
// COT_SELFTEST_FAIL_FAST=1 restores stop-at-first-failure for debugging.
export function selftestFailFast(env = process.env) {
  return env.COT_SELFTEST_FAIL_FAST === '1';
}

// A receipt whose observable inputs are byte-identical to its last PASS is skipped with a
// SKIP line (tools/selftest-cache.mjs derives the inputs; `--all` / COT_SELFTEST_CACHE=0
// run everything). The pool and the serial path share this gate.
export function selftestCacheGate(cache, log) {
  if (!cache) return { lookup: () => null, record: () => {} };
  return {
    lookup(file) {
      const hit = cache.lookup(file);
      if (!hit.skip) return hit.key ? { key: hit.key } : null;
      log(`[selftests] SKIP ${file}: ${hit.inputs} inputs unchanged since PASS at ${hit.passedAt}`);
      return { skip: true, key: hit.key };
    },
    record(file, key, status) { if (status === 0 && key) cache.recordPass(file, key); },
  };
}

export async function runSelftestSuite(suiteName, suite, {
  runFile = runSelftestFile,
  lock = createCaptureLock(),
  ownedLeaseFiles = SELFTEST_OWNED_LEASE_FILES,
  exclusiveCpuFiles = SELFTEST_EXCLUSIVE_CPU_FILES,
  refreshMs = 30_000,
  maxLeaseBatchMs = 45_000,
  now = () => performance.now(),
  log = console.log,
  logError = console.error,
  onTiming = () => {},
  concurrency = 1,
  failFast = false,
  cache = null,
} = {}) {
  if (!Number.isFinite(maxLeaseBatchMs) || maxLeaseBatchMs <= 0) {
    throw new TypeError('maxLeaseBatchMs must be finite and positive');
  }
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > MAX_SELFTEST_WORKERS) throw new TypeError(`concurrency must be an integer from 1 to ${MAX_SELFTEST_WORKERS}`);
  const gate = selftestCacheGate(cache, log);
  if (concurrency > 1) return runSelftestCpuPool(suiteName, suite, {
    concurrency, runFile, lock, ownedLeaseFiles, exclusiveCpuFiles, refreshMs, maxLeaseBatchMs, now, log, logError, onTiming,
    failFast, gate,
  });
  let held = false;
  let acquiredAt = 0;
  let refresher;
  const release = () => {
    clearInterval(refresher);
    if (!held) return;
    held = false;
    lock.release();
  };
  process.once('exit', release);
  log('[selftests] ' + suiteName + ': ' + suite.length + ' files');
  let failure = null;
  try {
    for (const file of suite) {
      let queueMs = 0;
      const cached = gate.lookup(file);
      if (cached?.skip) { onTiming({ file, runMs: 0, queueMs: 0, status: 0, error: undefined, skipped: true }); continue; }
      // Complete every child before yielding. Long full-fleet suites must
      // rejoin the FIFO between bounded batches, rather than starving native
      // geometry/visual verification for the entire npm lifecycle.
      if (held && now() - acquiredAt >= maxLeaseBatchMs) release();
      if (ownedLeaseFiles.includes(file)) release();
      else if (!held) {
        const queuedAt = now();
        await lock.acquire(45 * 60 * 1000);
        queueMs = now() - queuedAt;
        held = true;
        acquiredAt = now();
        refresher = setInterval(() => lock.refresh(), refreshMs);
        refresher.unref();
      }
      // Awaiting the child keeps the lease heartbeat responsive throughout
      // full-fleet CPU tests; spawnSync could let a healthy lease go stale.
      const startedAt = now();
      let result;
      try { result = await runFile(file); }
      finally {
        onTiming({ file, runMs: now() - startedAt, queueMs,
          status: result?.status ?? null, error: result?.error });
      }
      if (result.error) throw result.error;
      if (result.status !== 0) {
        logError('[selftests] FAIL ' + file);
        failure ??= result.status ?? 1;
        // fail-fast, or a child that died to a signal (a requested interruption ends the suite)
        if (failFast || result.status === null || result.status >= 128) return failure;
        continue;
      }
      gate.record(file, cached?.key, result.status);
    }
    if (failure !== null) return failure;
    log('[selftests] PASS ' + suiteName);
    return 0;
  } finally {
    process.removeListener('exit', release);
    release();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const suiteName = process.argv[2];
  const suite = SELFTEST_SUITES[suiteName];
  if (!suite) {
    console.error('Unknown self-test suite "' + (suiteName || '') + '". Expected: ' + Object.keys(SELFTEST_SUITES).join(', '));
    process.exitCode = 2;
  } else {
    let completed = 0, executionMs = 0, queueMs = 0, skipped = 0;
    const failures = [];
    const suiteStarted = performance.now();
    const concurrency = selftestWorkerCount();
    const cache = createSelftestCache();
    process.exitCode = await runSelftestSuite(suiteName, suite, {
      concurrency,
      failFast: selftestFailFast(),
      cache,
      onTiming(row) {
        completed++; executionMs += row.runMs; queueMs += row.queueMs;
        if (row.skipped) { skipped++; return; }
        const state = row.status === 0 && !row.error ? 'PASS' : 'FAIL';
        if (state === 'FAIL') failures.push(row.file);
        console.log(`[selftests] ${suiteName} ${completed}/${suite.length} ${state} ${row.file}: ${row.runMs.toFixed(0)}ms child, ${row.queueMs.toFixed(0)}ms FIFO`);
      },
    });
    cache.persist();
    if (skipped) console.log(`[selftests] ${suiteName}: ${skipped} of ${suite.length} receipts skipped (inputs unchanged since their last PASS; --all or COT_SELFTEST_CACHE=0 runs everything)${cache.enabled ? '' : ' [cache disabled]'}`);
    if (failures.length) console.error(`[selftests] ${suiteName}: ${failures.length} FAILED\n  ${failures.join('\n  ')}`);
    console.log(`[selftests] ${suiteName}: ${(performance.now() - suiteStarted).toFixed(0)}ms elapsed, ${executionMs.toFixed(0)}ms summed child across ${concurrency} CPU workers, ${queueMs.toFixed(0)}ms runner FIFO; browser children remain exclusive`);
  }
}
