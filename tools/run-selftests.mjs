import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync, writeFileSync } from 'node:fs';
import { availableParallelism, constants, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCaptureLock, selftestLockTimeoutMs } from './capture-lock.mjs';
import { SELFTEST_SUITES } from './selftest-suites.mjs';
import { captureQueueHasWaiters, runSelftestCpuPool } from './selftest-cpu-pool.mjs';
import { createSelftestCache, REPO_ROOT } from './selftest-cache.mjs';
import { resolveSelftestCacheDir } from './selftest-cache-dir.mjs';
import { createHash } from 'node:crypto';
import { admissionOrder, createRuntimeIndex, DURATION_SNAPSHOT_URL, durationSnapshotText, loadDurationSnapshot,
  parseShard, partitionShards, selectReceipts, snapshotWeights, splitGlobs } from './selftest-schedule.mjs';

// These real browser regressions own the shared lease inside their processes.
// Other subprocess tests either remain CPU-only or reject browser CLI input
// before acquisition. Keep those ordinary tests under the runner's lease.
export const SELFTEST_OWNED_LEASE_FILES = Object.freeze([
  'tools/source-dimension-frame.browser.selftest.mjs',
  'tools/resolved-depth-copy.browser.selftest.mjs',
  'tools/cloud-history.browser.selftest.mjs',
  'tools/late-fx-matrix.browser.selftest.mjs',
  'tools/vehicle-ground-occlusion.browser.selftest.mjs',
  'tools/articulated-shadow-batch.browser.selftest.mjs',
  'tools/battle-geometry-sharing.browser.selftest.mjs',
  'tools/track-texture-source.browser.selftest.mjs',
  'tools/sourced-building-source.browser.selftest.mjs',
  // 2026-10-04: the drift receipt on the far panorama's bake (Saltwind's far country as gauntlet wave 47 passed it)
  'tools/horizon-panorama-bake.browser.selftest.mjs',
  // 2026-09-26: part 2 of the Garage switch probe takes the capture lock itself (createCaptureLock in the receipt) —
  // under the runner's lease it deadlocked for 80 min (the runner refreshing its lease every 30 s while the child queued
  // on the same lock); it stays an exclusive-CPU file as well.
  'tools/garage-switch-probe.selftest.mjs',
]);

// This full-fleet child has a 240s no-progress functional-test watchdog. Do
// not compete with other native fleet builders while it runs.
// It still uses the runner's lease (unlike a self-leasing browser test).
export const SELFTEST_EXCLUSIVE_CPU_FILES = Object.freeze([
  'src/vehicles/fleetLazy.selftest.mjs',
  // Its unchanged 100 ms construction gate measures host time. Running beside
  // seven complete fleet builders tests CPU contention instead of this owner.
  'src/ui/garageArchitecture.selftest.mjs',
  // Heap/ArrayBuffer plateau measurements run without concurrent fleet/map
  // constructors. Preserve every GC and memory ceiling in the child.
  'server/dedicatedWorldCollisionMemory.selftest.mjs',
  // FSP-01: a real headless Garage gates warm switches on 120 ms p95
  // main-thread blocking and a 250 ms p95 first painted frame. Beside seven
  // fleet builders it would measure host contention, not the switch path.
  'tools/garage-switch-probe.selftest.mjs',
  // Multiplayer v2 (2026-09-26): the match tick-cost budget (p95 under 6 ms with 28 viewers) and the in-process soak
  // (tick rate, stalls) measure host time; beside seven other children they flaked in a landing chain and pass alone.
  'server/match/tickCost.selftest.mjs',
  'tools/mp-soak.selftest.mjs',
  // This short wall-clock cadence assertion must observe current scheduling,
  // without complete fleet constructors delaying its 250 ms timer sample.
  'server/match/loop.selftest.mjs',
]);

// A functional fleet sweep may reuse a source proof. Real frame/clock/heap
// measurements and browser state must be observed on this run's environment.
export const SELFTEST_FRESH_FILES = Object.freeze([
  ...SELFTEST_OWNED_LEASE_FILES,
  ...SELFTEST_EXCLUSIVE_CPU_FILES.filter(file => file !== 'src/vehicles/fleetLazy.selftest.mjs'),
  // The functional fuzz corpus also gates measured decode time.
  'src/mp/wire/wireFuzz.selftest.mjs',
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

// `logFile` (gate P13, `--logs=<dir>`) sends the child's stdout and stderr to that file through a
// file descriptor, never a pipe: a grandchild that outlives the receipt cannot hold the runner open.
// `cwd` lets the gate run a receipt in a baseline worktree. Defaults keep the inherited terminal.
export function runSelftestFile(file, { spawnProcess = spawn, signals = process, env = selftestChildEnv(),
  cwd = process.cwd(), logFile = null } = {}) {
  return new Promise((resolveResult) => {
    let output = null;
    if (logFile) {
      mkdirSync(dirname(logFile), { recursive: true });
      output = openSync(logFile, 'w');
    }
    let child;
    try {
      child = spawnProcess(process.execPath, [file], {
        cwd, env, stdio: output === null ? 'inherit' : ['inherit', output, output],
      });
    } finally {
      if (output !== null) closeSync(output); // the child holds its own descriptor
    }
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
    record(file, key, status, runMs) { if (status === 0 && key) cache.recordPass(file, key, { runMs }); },
  };
}

function validateRunOptions(maxLeaseBatchMs, concurrency) {
  if (!Number.isFinite(maxLeaseBatchMs) || maxLeaseBatchMs <= 0) {
    throw new TypeError('maxLeaseBatchMs must be finite and positive');
  }
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > MAX_SELFTEST_WORKERS) throw new TypeError(`concurrency must be an integer from 1 to ${MAX_SELFTEST_WORKERS}`);
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
  order, // pool admission order (registry indices); the serial path's total is order-independent
} = {}) {
  validateRunOptions(maxLeaseBatchMs, concurrency);
  const gate = selftestCacheGate(cache, log);
  const lockTimeoutMs = selftestLockTimeoutMs();
  if (concurrency > 1) return runSelftestCpuPool(suiteName, suite, {
    concurrency, runFile, lock, ownedLeaseFiles, exclusiveCpuFiles, refreshMs, maxLeaseBatchMs, now, log, logError, onTiming,
    failFast, gate, lockTimeoutMs, ...(order ? { order } : {}),
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
      // geometry/visual verification for the entire npm lifecycle. With no
      // capture queued behind the lease, the batch is renewed in place (gate P5).
      if (held && now() - acquiredAt >= maxLeaseBatchMs) {
        if (captureQueueHasWaiters(lock)) release();
        else { acquiredAt = now(); lock.refresh(); }
      }
      if (ownedLeaseFiles.includes(file)) release();
      else if (!held) {
        const queuedAt = now();
        await lock.acquire(lockTimeoutMs);
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
      gate.record(file, cached?.key, result.status, now() - startedAt);
    }
    if (failure !== null) return failure;
    log('[selftests] PASS ' + suiteName);
    return 0;
  } finally {
    process.removeListener('exit', release);
    release();
  }
}

const SELFTEST_BARRIER_FILES = Object.freeze([...new Set([...SELFTEST_EXCLUSIVE_CPU_FILES, ...SELFTEST_OWNED_LEASE_FILES])]);

// Gate P8 (2026-10-01): `--only=<glob>[,<glob>]` selects registry entries (`**`, `*`, `?`, `{a,b}`;
// matching nothing is an error) and `--shard=i/n` runs one of n deterministic shards balanced by the
// committed run-time snapshot (tools/selftest-durations.json). Both keep registry order and only
// narrow what this invocation runs; every receipt of the selection still runs in a fresh process.
export function selftestCommand(args, { durations = loadDurationSnapshot() } = {}) {
  const name = args[0] && !args[0].startsWith('--') ? args.shift() : 'all';
  const registered = name === 'all' ? Object.values(SELFTEST_SUITES).flat() : SELFTEST_SUITES[name];
  if (!registered) throw new Error(`Unknown self-test suite "${name}". Expected: all, ${Object.keys(SELFTEST_SUITES).join(', ')}`);
  const options = { name, files: registered, plan: false, report: null, changed: null, order: 'longest',
    only: [], shard: null, writeDurations: false, logs: null };
  for (const arg of args) {
    if (arg === '--plan') options.plan = true;
    else if (arg === '--all') continue; // handled by the cache; applies to every selected group
    else if (arg.startsWith('--report=')) options.report = resolve(arg.slice(9));
    else if (arg.startsWith('--changed=')) options.changed = arg.slice(10).split(',').filter(Boolean);
    else if (arg === '--order=registry' || arg === '--order=longest') options.order = arg.slice(8);
    else if (arg.startsWith('--only=')) options.only.push(...splitGlobs(arg.slice(7)));
    else if (arg.startsWith('--shard=') && !options.shard) options.shard = parseShard(arg.slice(8));
    else if (arg === '--write-durations') options.writeDurations = true;
    else if (arg.startsWith('--logs=') && arg.length > 7) options.logs = resolve(arg.slice(7));
    else throw new Error(`Unknown self-test option: ${arg}`);
  }
  if (options.changed && !options.plan) throw new Error('--changed explains impact with --plan; it never skips required checks');
  if (writeDurationsConflict(options)) throw new Error('--write-durations records the whole registry: `node tools/run-selftests.mjs --write-durations`, no other option');
  const selected = selectReceipts(registered, options.only);
  options.files = selected;
  if (options.shard) {
    const shards = partitionShards(selected, options.shard.count, {
      weightOf: snapshotWeights(selected, durations), barriers: new Set(SELFTEST_BARRIER_FILES),
    });
    const mine = shards[options.shard.index - 1];
    options.files = mine.indices.map(index => selected[index]);
    options.shard = { ...options.shard, selected: selected.length, receipts: options.files.length, loadMs: mine.loadMs,
      partition: createHash('sha1').update(JSON.stringify(shards.map(shard => shard.indices.map(index => selected[index])))).digest('hex').slice(0, 12) };
  }
  return options;
}
function writeDurationsConflict(options) {
  return options.writeDurations && (options.name !== 'all' || options.plan || options.only.length || options.shard
    || options.changed || options.report || options.logs || options.order !== 'longest');
}

export function selftestPlan(files, cache, changed = null, root = process.cwd()) {
  return files.map(file => {
    const proof = cache.lookup(file);
    const inputs = changed ? [...cache.closureOf(resolve(root, file))] : [];
    const affected = changed?.filter(path => inputs.some(input => {
      const absolute = resolve(root, path);
      return input === absolute || absolute.startsWith(input + '/');
    }));
    return { file, action: proof.skip ? 'reuse' : 'run', reason: proof.reason,
      inputs: proof.inputs, ...(affected ? { affectedBy: affected } : {}) };
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let command;
  try { command = selftestCommand(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 2; }
  if (command) {
    const { name: suiteName, files: suite } = command;
    const childEnv = selftestChildEnv();
    // Gate P18: proofs are keyed on the root commit; the first run adopts the URL-keyed store.
    const cacheLocation = resolveSelftestCacheDir(REPO_ROOT, childEnv);
    if (cacheLocation.adoption === 'linked') console.log(`[selftests] result cache now keyed on the ${cacheLocation.identity}; adopted ${cacheLocation.legacyDir}`);
    const cache = createSelftestCache({ alwaysRun: SELFTEST_FRESH_FILES, env: childEnv, cacheDir: cacheLocation.dir });
    const runtimes = createRuntimeIndex(cacheLocation.dir);
    if (command.shard) console.log(`[selftests] shard ${command.shard.index}/${command.shard.count}: ${command.shard.receipts} of ${command.shard.selected} selected receipts (~${(command.shard.loadMs / 60_000).toFixed(1)} min weighted; partition ${command.shard.partition})`);
    else if (command.only.length) console.log(`[selftests] --only=${command.only.join(',')}: ${suite.length} receipts`);
    if (command.writeDurations) {
      writeFileSync(DURATION_SNAPSHOT_URL, durationSnapshotText(suite, file => runtimes.runMsOf(file)));
      runtimes.persist();
      console.log(`[selftests] wrote ${fileURLToPath(DURATION_SNAPSHOT_URL)}: ${suite.filter(file => runtimes.runMsOf(file) !== undefined).length} of ${suite.length} receipts have a recorded run time`);
    } else if (!suite.length) {
      console.log(`[selftests] ${suiteName}: this shard has no receipts`);
    } else if (command.plan) {
      const checks = selftestPlan(suite, cache, command.changed);
      console.log(JSON.stringify({ checks: checks.length,
        run: checks.filter(row => row.action === 'run').length,
        reuse: checks.filter(row => row.action === 'reuse').length,
        ...(command.changed ? { affected: checks.filter(row => row.affectedBy.length).length } : {}),
        rows: checks }, null, 2));
      cache.persist();
    } else {
      let completed = 0, executionMs = 0, queueMs = 0, skipped = 0;
      const failures = [], rows = [];
      const suiteStarted = performance.now();
      const concurrency = selftestWorkerCount();
      const startedAt = new Date().toISOString();
      // Gate P7: barriers first, then longest-first by the last observed run time (this machine's
      // index; the committed snapshot covers receipts it has not seen, e.g. on a fresh clone).
      const snapshot = loadDurationSnapshot();
      const runMsOf = file => runtimes.runMsOf(file) ?? snapshot.get(file);
      const order = command.order === 'longest' ? admissionOrder(suite, { runMsOf, barriers: new Set(SELFTEST_BARRIER_FILES) }) : undefined;
      if (order) console.log(`[selftests] ${suiteName}: admission longest-first (${suite.filter(file => runMsOf(file) !== undefined).length} of ${suite.length} run times known; barriers first); --order=registry admits in registry order`);
      const logOf = file => join(command.logs, `${file}.log`);
      process.exitCode = await runSelftestSuite(suiteName, suite, {
        concurrency,
        failFast: selftestFailFast(),
        cache,
        order,
        ...(command.logs ? { runFile: file => runSelftestFile(file, { logFile: logOf(file) }) } : {}),
        onTiming(row) {
          rows.push({ ...row, error: row.error?.message });
          completed++; executionMs += row.runMs; queueMs += row.queueMs;
          if (row.skipped) { skipped++; return; }
          // an ordinary verdict (not a spawn error or an interruption) is a scheduling observation
          if (!row.error && Number.isInteger(row.status) && row.status >= 0 && row.status < 128) runtimes.record(row.file, row.runMs);
          const state = row.status === 0 && !row.error ? 'PASS' : 'FAIL';
          if (state === 'FAIL') failures.push(row.file);
          console.log(`[selftests] ${suiteName} ${completed}/${suite.length} ${state} ${row.file}: ${row.runMs.toFixed(0)}ms child, ${row.queueMs.toFixed(0)}ms FIFO${command.logs && state === 'FAIL' ? ` (log: ${logOf(row.file)})` : ''}`);
        },
      });
      cache.persist();
      runtimes.persist();
      if (skipped) console.log(`[selftests] ${suiteName}: ${skipped} of ${suite.length} receipts skipped (inputs unchanged since their last PASS; --all or COT_SELFTEST_CACHE=0 runs everything)${cache.enabled ? '' : ' [cache disabled]'}`);
      if (failures.length) console.error(`[selftests] ${suiteName}: ${failures.length} FAILED\n  ${failures.join('\n  ')}`);
      console.log(`[selftests] ${suiteName}: ${(performance.now() - suiteStarted).toFixed(0)}ms elapsed, ${executionMs.toFixed(0)}ms summed child across ${concurrency} CPU workers, ${queueMs.toFixed(0)}ms runner FIFO; browser children remain exclusive`);
      const reportPath = command.report ?? resolve('node_modules/.cache/cot-selftests/latest-run.json');
      mkdirSync(dirname(reportPath), { recursive: true });
      writeFileSync(reportPath, JSON.stringify({ startedAt, finishedAt: new Date().toISOString(),
        status: process.exitCode, admission: command.order, ...(command.only.length ? { only: command.only } : {}),
        ...(command.shard ? { shard: command.shard } : {}), ...(command.logs ? { logs: command.logs } : {}),
        selected: suite.length, completed, executed: completed - skipped,
        reused: skipped, elapsedMs: performance.now() - suiteStarted, executionMs, queueMs, rows }, null, 2) + '\n');
      console.log(`[selftests] report: ${reportPath}`);
    }
  }
}
