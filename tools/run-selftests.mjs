import { spawn } from 'node:child_process';
import { constants } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCaptureLock } from './capture-lock.mjs';
import { SELFTEST_SUITES } from './selftest-suites.mjs';

// These real browser regressions own the shared lease inside their processes.
// Other subprocess tests either remain CPU-only or reject browser CLI input
// before acquisition. Keep those ordinary tests under the runner's lease.
export const SELFTEST_OWNED_LEASE_FILES = Object.freeze([
  'tools/source-dimension-frame.browser.selftest.mjs',
  'tools/resolved-depth-copy.browser.selftest.mjs',
]);

export function runSelftestFile(file, { spawnProcess = spawn, signals = process } = {}) {
  return new Promise((resolveResult) => {
    const child = spawnProcess(process.execPath, [file], {
      cwd: process.cwd(), env: process.env, stdio: 'inherit',
    });
    let error, interruptedBy;
    const interrupt = () => { interruptedBy = 'SIGINT'; child.kill('SIGINT'); };
    const terminate = () => { interruptedBy = 'SIGTERM'; child.kill('SIGTERM'); };
    signals.once('SIGINT', interrupt);
    signals.once('SIGTERM', terminate);
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
} = {}) {
  if (!Number.isFinite(maxLeaseBatchMs) || maxLeaseBatchMs <= 0) {
    throw new TypeError('maxLeaseBatchMs must be finite and positive');
  }
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
      // Complete every child before yielding. Long full-fleet suites must
      // rejoin the FIFO between bounded batches, rather than starving native
      // geometry/visual verification for the entire npm lifecycle.
      if (held && now() - acquiredAt >= maxLeaseBatchMs) release();
      if (ownedLeaseFiles.includes(file)) release();
      else if (!held) {
        await lock.acquire(45 * 60 * 1000);
        held = true;
        acquiredAt = now();
        refresher = setInterval(() => lock.refresh(), refreshMs);
        refresher.unref();
      }
      // Awaiting the child keeps the lease heartbeat responsive throughout
      // full-fleet CPU tests; spawnSync could let a healthy lease go stale.
      const result = await runFile(file);
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
  } else process.exitCode = await runSelftestSuite(suiteName, suite);
}
