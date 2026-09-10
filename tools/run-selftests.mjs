import { spawn } from 'node:child_process';
import { constants, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCaptureLock } from './capture-lock.mjs';
import { SELFTEST_SUITES } from './selftest-suites.mjs';
import { runSelftestCpuPool } from './selftest-cpu-pool.mjs';

// These real browser regressions own the shared lease inside their processes.
// Other subprocess tests either remain CPU-only or reject browser CLI input
// before acquisition. Keep those ordinary tests under the runner's lease.
export const SELFTEST_OWNED_LEASE_FILES = Object.freeze([
  'tools/source-dimension-frame.browser.selftest.mjs',
  'tools/resolved-depth-copy.browser.selftest.mjs',
  'tools/late-fx-matrix.browser.selftest.mjs',
]);

// This caches compilation, NEVER test results or module instances. Every file
// still executes all assertions in a fresh process. Node validates source and
// engine versions. Respect explicit cache/coverage settings and opt-outs.
export function selftestChildEnv(env = process.env) {
  if (env.NODE_COMPILE_CACHE || env.NODE_DISABLE_COMPILE_CACHE || env.NODE_V8_COVERAGE) return env;
  return { ...env, NODE_COMPILE_CACHE: join(tmpdir(), `cot-selftest-compile-${process.getuid?.() ?? 'user'}`) };
}

// Opt in while the complete real-suite parity run is being qualified. This
// controls scheduling only: no test, assertion or failure gate is omitted.
export function selftestWorkerCount(env = process.env) {
  const count = Number(env.COT_SELFTEST_WORKERS ?? 1);
  if (count !== 1 && count !== 2) throw new TypeError('COT_SELFTEST_WORKERS must be 1 or 2');
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

export async function runSelftestSuite(suiteName, suite, {
  runFile = runSelftestFile,
  lock = createCaptureLock(),
  ownedLeaseFiles = SELFTEST_OWNED_LEASE_FILES,
  refreshMs = 30_000,
  maxLeaseBatchMs = 45_000,
  now = () => performance.now(),
  log = console.log,
  logError = console.error,
  onTiming = () => {},
  concurrency = 1,
} = {}) {
  if (!Number.isFinite(maxLeaseBatchMs) || maxLeaseBatchMs <= 0) {
    throw new TypeError('maxLeaseBatchMs must be finite and positive');
  }
  if (concurrency !== 1 && concurrency !== 2) throw new TypeError('concurrency must be 1 or 2');
  if (concurrency === 2) return runSelftestCpuPool(suiteName, suite, {
    runFile, lock, ownedLeaseFiles, refreshMs, maxLeaseBatchMs, now, log, logError, onTiming,
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
  try {
    for (const file of suite) {
      let queueMs = 0;
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
        return result.status ?? 1;
      }
    }
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
    let completed = 0, executionMs = 0, queueMs = 0;
    const suiteStarted = performance.now();
    const concurrency = selftestWorkerCount();
    process.exitCode = await runSelftestSuite(suiteName, suite, {
      concurrency,
      onTiming(row) {
        completed++; executionMs += row.runMs; queueMs += row.queueMs;
        const state = row.status === 0 && !row.error ? 'PASS' : 'FAIL';
        console.log(`[selftests] ${suiteName} ${completed}/${suite.length} ${state} ${row.file}: ${row.runMs.toFixed(0)}ms child, ${row.queueMs.toFixed(0)}ms FIFO`);
      },
    });
    console.log(`[selftests] ${suiteName}: ${(performance.now() - suiteStarted).toFixed(0)}ms elapsed, ${executionMs.toFixed(0)}ms summed child across ${concurrency} CPU workers, ${queueMs.toFixed(0)}ms runner FIFO; browser children remain exclusive`);
  }
}
