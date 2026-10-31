import { spawn, spawnSync } from 'node:child_process';
import { closeSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism, constants, getPriority, setPriority, tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCaptureLock, selftestLockTimeoutMs } from './capture-lock.mjs';
import { SELFTEST_SUITES } from './selftest-suites.mjs';
import { defaultTierFiles, manualSuiteFiles, manualSuiteOf, parseSuiteNames } from './selftest-tiers.mjs';
import { captureQueueHasWaiters, runSelftestCpuPool } from './selftest-cpu-pool.mjs';
import { createSelftestCache, REPO_ROOT, SELFTEST_BROAD_DIRS } from './selftest-cache.mjs';
import { resolveSelftestCacheDir } from './selftest-cache-dir.mjs';
import { createHash } from 'node:crypto';
import { admissionOrder, createRuntimeIndex, DURATION_SNAPSHOT_URL, durationSnapshotText, loadDurationSnapshot,
  parseShard, partitionShards, selectReceipts, snapshotWeights, splitGlobs } from './selftest-schedule.mjs';

// These real browser regressions own the shared lease inside their processes.
// Other subprocess tests either remain CPU-only or reject browser CLI input
// before acquisition. Those ordinary tests run under the runner's lease only
// with COT_SELFTEST_CPU_LEASE=1 (selftestCpuLease); by default they take none.
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
  // 2026-10-19 (black-screen-228): the black-world guard's battle receipt
  'tools/black-world.browser.selftest.mjs',
  // 2026-10-30 (garage-roster-thrash-265): the roster settle guard serves the checkout and takes the lock itself
  'tools/garage-roster-settle.browser.selftest.mjs',
  // 2026-10-30 (hud-self-measure-266): the HUD self-measure guard serves the checkout and takes the lock itself
  'tools/hud-self-measure.browser.selftest.mjs',
  // 2026-09-26: part 2 of the Garage switch probe takes the capture lock itself (createCaptureLock in the receipt) —
  // under the runner's lease it deadlocked for 80 min (the runner refreshing its lease every 30 s while the child queued
  // on the same lock); it stays an exclusive-CPU file as well.
  'tools/garage-switch-probe.selftest.mjs',
]);

// This full-fleet child has a 240s no-progress functional-test watchdog. Do
// not compete with other native fleet builders while it runs. These run alone
// within this suite's pool (other sessions' work is not held off without the
// lease), at the runner's own priority, and under the runner's lease when one is held.
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
  // Multiplayer v2 (2026-09-26): the match tick-cost budget (p95 under 6 ms with 28 viewers) measures host time; beside
  // seven other children it flaked in a landing chain and passes alone. (267: the in-process soak left this list: it
  // judges its gates net of the starvation it measures, so it runs beside the others.)
  'server/match/tickCost.selftest.mjs',
  // This short wall-clock cadence assertion must observe current scheduling,
  // without complete fleet constructors delaying its 250 ms timer sample.
  'server/match/loop.selftest.mjs',
  // (2026-10-16, integ/226 triage) the real-socket service's 20 Hz snapshot cadence over a measured window: beside
  // seven fleet builders its timers measure the contention, not the cadence.
  'server/match/service.selftest.mjs',
]);

// A functional fleet sweep may reuse a source proof. Real frame/clock/heap
// measurements and browser state must be observed on this run's environment.
export const SELFTEST_FRESH_FILES = Object.freeze([
  ...SELFTEST_OWNED_LEASE_FILES,
  ...SELFTEST_EXCLUSIVE_CPU_FILES.filter(file => file !== 'src/vehicles/fleetLazy.selftest.mjs'),
  // The functional fuzz corpus also gates measured decode time.
  'src/mp/wire/wireFuzz.selftest.mjs',
]);

// Receipts the cache would never key (a browser or git tool, a computed import or a whole-environment read sits in
// their closure) that never run those tools against this checkout: keyed by their inputs like any other receipt (229;
// tools/selftest-cache.mjs fixtureKeyed). Their closures still hold every tool file, so an edit to one re-runs them.
export const SELFTEST_FIXTURE_KEYED_FILES = Object.freeze([
  // static reads of this checkout's sources (the step table names tools as data; none is run). fresh.selftest stays
  // live: its verdict reads release/fingerprints.tsv, which no closure holds (229, critic r2)
  'tools/changed-only/fleet-partition.selftest.mjs',
  // the release plan and its CLI driven with fake runners; the planned tools are argument lists
  'tools/tank-release-plan.selftest.mjs',
]);

// Receipts that run only on fixture repositories they write in tmpdir: keyed by the receipt and the code its
// declaration names (one directory level per `*`), not by the import scan's closure, which holds every source
// directory (the fixture walks read directories; the step table names the real tools as data). They re-run when that
// code changes, not on every edit (229, critic r2: the chain alone is 240-540 s under load). run-selftests.selftest
// holds each declaration to its files' relative imports and repository paths.
export const SELFTEST_DECLARED_INPUTS = Object.freeze(Object.fromEntries([
  'tools/changed-only/chain.selftest.mjs', 'tools/changed-only/resolver.selftest.mjs', 'tools/changed-only/world.selftest.mjs',
].map((file) => [file, Object.freeze(['tools/changed-only/*.mjs', 'tools/tank-regen-changed.mjs', 'tools/capture-lock.mjs',
  'tools/selftest-inputs.mjs', 'tools/id-list.mjs'])])));

// Test-speed R9a (2026-10-16): a judge merges the records other receipts of the same run wrote
// and plays whatever nobody else plays in the run. server/battlePacing.selftest.mjs judges the
// 132 matches its eight one-thread shards (server/battlePacingShard<n>.selftest.mjs) played. The
// pool admits a judge after every other receipt; the registry lists it after its shards for
// the serial path.
export const SELFTEST_LAST_FILES = Object.freeze(['server/battlePacing.selftest.mjs']);

// The run's own directory for records receipts hand to a judge (COT_SELFTEST_RUN_DIR): a fresh
// one per invocation unless the caller (a gate running its own pool) exported one, and removed
// after the run when this runner made it. Records never outlive their run, so this is not a
// result cache: every receipt still runs.
export function selftestRunDirectory(env = process.env, make = () => mkdtempSync(join(tmpdir(), 'cot-selftest-run-'))) {
  if (env.COT_SELFTEST_RUN_DIR) return { dir: env.COT_SELFTEST_RUN_DIR, created: false };
  return { dir: make(), created: true };
}

// Every child also preloads tools/assert-graph-guard.mjs: an equality assert on a three.js graph object fails with
// identity labels instead of node's whole-graph inspect and diff (the 226 T-72 receipts reached 40 GB).
export const SELFTEST_GRAPH_GUARD = `--import=${new URL('./assert-graph-guard.mjs', import.meta.url).href}`;
// ...and tools/selftest-observe.mjs: what the receipt and every process it starts read, listed and probed (266), which
// keys its PASS beside the static closure and selects it in lane mode. It records only with an observe directory.
export const SELFTEST_OBSERVER = `--import=${new URL('./selftest-observe.mjs', import.meta.url).href}`;
const SELFTEST_PRELOADS = [SELFTEST_GRAPH_GUARD, SELFTEST_OBSERVER];

// The environment the result cache keys receipts on: a copy taken before the run directory is
// set, without it. The directory's path changes every run and a receipt reads only what its own
// run wrote there, so it is not an input; keyed, it would make every receipt that reads it miss.
export function selftestCacheEnv(env = process.env) {
  const { COT_SELFTEST_RUN_DIR: _runDirectory, ...keyed } = env;
  // The graph guard decides only failing asserts on graph objects, the observer only records, and their URLs name this
  // checkout: neither keys a proof (worktrees share one store).
  for (const preload of SELFTEST_PRELOADS) if (keyed.NODE_OPTIONS?.includes(preload)) {
    const options = keyed.NODE_OPTIONS.replace(preload, '').trim();
    if (options) keyed.NODE_OPTIONS = options; else delete keyed.NODE_OPTIONS;
  }
  return keyed;
}

// This caches compilation, NEVER test results or module instances. Every file
// still executes all assertions in a fresh process. Node validates source and
// engine versions. Respect explicit cache/coverage settings and opt-outs; the graph guard and the observer are always
// preloaded.
export function selftestChildEnv(env = process.env) {
  const options = env.NODE_OPTIONS ?? '';
  const missing = SELFTEST_PRELOADS.filter((preload) => !options.includes(preload));
  const guarded = missing.length ? { ...env, NODE_OPTIONS: [options, ...missing].join(' ').trim() } : env;
  if (env.NODE_COMPILE_CACHE || env.NODE_DISABLE_COMPILE_CACHE || env.NODE_V8_COVERAGE) return guarded;
  return { ...guarded, NODE_COMPILE_CACHE: join(tmpdir(), `cot-selftest-compile-${process.getuid?.() ?? 'user'}`) };
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
// `observeDir` (the runner's, per receipt) turns the observer on for this child and every process it starts; the
// result then carries `observed` ({ reads, lists, probes }: checkout paths relative to `cwd`) and the directory is
// removed.
export function runSelftestFile(file, { spawnProcess = spawn, signals = process, env = selftestChildEnv(),
  cwd = process.cwd(), logFile = null, nice = 0, observeDir = null } = {}) {
  return new Promise((resolveResult) => {
    let output = null;
    if (logFile) {
      mkdirSync(dirname(logFile), { recursive: true });
      output = openSync(logFile, 'w');
    }
    if (observeDir) env = { ...env, COT_SELFTEST_OBSERVE_DIR: observeDir, COT_SELFTEST_OBSERVE_ROOT: realpathSync(cwd) };
    let child;
    try {
      child = spawnProcess(process.execPath, [file], {
        cwd, env, stdio: output === null ? 'inherit' : ['inherit', output, output],
      });
    } finally {
      if (output !== null) closeSync(output); // the child holds its own descriptor
    }
    // CPU work under nice (229): never raise a child above the runner's own niceness
    if (nice && child?.pid) { try { setPriority(child.pid, Math.max(nice, getPriority(child.pid))); } catch { /* exited */ } }
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
      const result = { status: exitSignal ? 128 + constants.signals[exitSignal] : status, error };
      resolveResult(observeDir ? { ...result, observed: collectObservations(observeDir) } : result);
    });
  });
}

/** Every process's record in one receipt's observe directory, merged (tools/selftest-observe.mjs); the directory goes. */
function collectObservations(dir) {
  const merged = { reads: new Set(), lists: new Set(), probes: new Set() };
  let names = [];
  try { names = readdirSync(dir); } catch { /* no process recorded anything */ }
  for (const name of names) {
    try {
      const record = JSON.parse(readFileSync(join(dir, name), 'utf8'));
      for (const kind of Object.keys(merged)) for (const path of record[kind] ?? []) merged[kind].add(path);
    } catch { /* a process killed mid-write: its record is partial, so it is left out */ }
  }
  rmSync(dir, { recursive: true, force: true }); // this receipt's own directory
  return Object.fromEntries(Object.entries(merged).map(([kind, paths]) => [kind, [...paths].sort()]));
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
    // a PASS keeps what the run observed: keyed beside the closure, and the receipt's latest reads for lane mode
    record(file, key, status, runMs, observed) {
      if (status !== 0) return;
      if (key) cache.recordPass(file, key, { runMs, observed });
      if (observed) cache.recordObserved(file, observed);
    },
  };
}

function validateRunOptions(maxLeaseBatchMs, concurrency) {
  if (!Number.isFinite(maxLeaseBatchMs) || maxLeaseBatchMs <= 0) {
    throw new TypeError('maxLeaseBatchMs must be finite and positive');
  }
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > MAX_SELFTEST_WORKERS) throw new TypeError(`concurrency must be an integer from 1 to ${MAX_SELFTEST_WORKERS}`);
}

// 229: CPU receipts take no capture lease unless COT_SELFTEST_CPU_LEASE=1. The lease made every npm test queue in the
// GPU FIFO for each 45 s batch whenever a capture waited: on 2026-10-19 the queue held 45 tickets, its head 2 h 48 min
// old, and two cold runs timed out at 30 min without starting a receipt. CPU work runs under nice and the capture lock
// is for the GPU (house rule); the browser receipts still take the lock themselves, and run last so the CPU work never
// waits behind the GPU queue. COT_SELFTEST_CPU_LEASE=1 restores the shared lease (a quiet-window gate that wants GPU
// captures and CPU receipts never to overlap).
export function selftestCpuLease(env = process.env) {
  return env.COT_SELFTEST_CPU_LEASE === '1';
}

/**
 * Without the lease nothing serializes suites machine-wide, so each CPU child waits until Headroom
 * (`headroom can-start --gb N`, the house memory gate, exit 0 yes / 1 no) says N GB fit; COT_SELFTEST_MEMORY_GB sets N
 * (default 6; 0 turns it off). A yes is reused for 5 s; a no is asked again every 15 s and logged every 10 minutes.
 * After 30 minutes of noes (the gate then stays open for the run), or on any other answer (no CLI, a usage error), the
 * child starts and the gate says so:
 * memory is Headroom's to report and memguard's to enforce, never a reason to hang a suite.
 */
export function selftestMemoryGate(env = process.env, { ask = (gb) => spawnSync('headroom', ['can-start', '--gb', String(gb)],
  { stdio: 'ignore', timeout: 20_000 }), sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), clock = () => Date.now(),
  log = console.log } = {}) {
  const raw = env.COT_SELFTEST_MEMORY_GB;
  const gb = raw === undefined || raw === '' ? 6 : Number(raw);
  if (!Number.isFinite(gb) || gb <= 0) return Object.assign(async () => {}, { gb: 0 });
  let openUntil = 0, available = true;
  const gate = Object.assign(async () => {
    const waitedFrom = clock();
    let loggedAt = -Infinity;
    while (available && clock() >= openUntil) {
      const answer = ask(gb);
      gate.asks++;
      if (answer.status === 0) { openUntil = clock() + 5_000; return; }
      if (answer.error || answer.status !== 1) {
        available = false;
        log(`[selftests] memory gate off: headroom can-start answered ${answer.error?.code ?? `exit ${answer.status}`}`);
        return;
      }
      if (clock() - waitedFrom >= 30 * 60_000) {
        available = false; // once per run: the rest of the suite never stalls on it again
        log(`[selftests] memory gate: ${gb} GB not free after 30 min; open for the rest of this run`); return;
      }
      if (clock() - loggedAt >= 10 * 60_000) {
        log(`[selftests] waiting for ${gb} GB (headroom can-start); COT_SELFTEST_MEMORY_GB=0 turns this off`); loggedAt = clock();
      }
      await sleep(15_000);
    }
  }, { gb, asks: 0 });
  return gate;
}

/** The niceness of ordinary CPU children (the exclusive and browser receipts keep the runner's). */
export const SELFTEST_CHILD_NICE = 10;

/** Barriers run alone and first; with no CPU lease the browser barriers move last (after the judges). */
export function selftestAdmissionSets(cpuLease) {
  if (cpuLease) return { barriers: new Set(SELFTEST_BARRIER_FILES), last: new Set(SELFTEST_LAST_FILES) };
  // (a file in both lists, the garage switch probe, takes the lock itself: it goes last)
  return { barriers: new Set(SELFTEST_EXCLUSIVE_CPU_FILES.filter((file) => !SELFTEST_OWNED_LEASE_FILES.includes(file))),
    last: new Set([...SELFTEST_LAST_FILES, ...SELFTEST_OWNED_LEASE_FILES]) };
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
  cpuLease = true, // false: CPU children take no capture lease (selftestCpuLease)
  memoryGate = async () => {}, // with no lease, awaited before each CPU child (selftestMemoryGate)
} = {}) {
  validateRunOptions(maxLeaseBatchMs, concurrency);
  const gate = selftestCacheGate(cache, log);
  const lockTimeoutMs = selftestLockTimeoutMs();
  if (concurrency > 1) return runSelftestCpuPool(suiteName, suite, {
    concurrency, runFile, lock, ownedLeaseFiles, exclusiveCpuFiles, refreshMs, maxLeaseBatchMs, now, log, logError, onTiming,
    failFast, gate, lockTimeoutMs, cpuLease, memoryGate, ...(order ? { order } : {}),
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
      else if (!cpuLease) {
        const waitedFrom = now();
        await memoryGate();
        queueMs = now() - waitedFrom;
      } else if (!held) {
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
      gate.record(file, cached?.key, result.status, now() - startedAt, result.observed);
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
// Tiers (266, tools/selftest-tiers.mjs): a selection is the default tier unless `--heavy=<suite>[,<suite>]` (or all)
// names manual suites, which only `npm run test:heavy` passes; `--only-from=<file>` reads one glob per line.
export function selftestCommand(args, { durations = loadDurationSnapshot() } = {}) {
  const name = args[0] && !args[0].startsWith('--') ? args.shift() : 'all';
  const registered = name === 'all' ? Object.values(SELFTEST_SUITES).flat() : SELFTEST_SUITES[name];
  if (!registered) throw new Error(`Unknown self-test suite "${name}". Expected: all, ${Object.keys(SELFTEST_SUITES).join(', ')}`);
  const options = { name, files: registered, plan: false, report: null, changed: null, order: 'longest',
    only: [], shard: null, writeDurations: false, logs: null, heavy: null, registered: registered.length };
  for (const arg of args) {
    if (arg === '--plan') options.plan = true;
    else if (arg === '--all') continue; // handled by the cache; applies to every selected group
    else if (arg.startsWith('--report=')) options.report = resolve(arg.slice(9));
    else if (arg.startsWith('--changed=')) options.changed = arg.slice(10).split(',').filter(Boolean);
    else if (arg === '--order=registry' || arg === '--order=longest') options.order = arg.slice(8);
    else if (arg.startsWith('--only=')) options.only.push(...splitGlobs(arg.slice(7)));
    else if (arg.startsWith('--only-from=') && arg.length > 12) options.only.push(...readFileSync(resolve(arg.slice(12)), 'utf8')
      .split('\n').map((line) => line.trim()).filter(Boolean));
    else if (arg.startsWith('--heavy=') && !options.heavy) options.heavy = parseSuiteNames(arg.slice(8));
    else if (arg.startsWith('--shard=') && !options.shard) options.shard = parseShard(arg.slice(8));
    else if (arg === '--write-durations') options.writeDurations = true;
    else if (arg.startsWith('--logs=') && arg.length > 7) options.logs = resolve(arg.slice(7));
    else throw new Error(`Unknown self-test option: ${arg}`);
  }
  if (options.changed && !options.plan) throw new Error('--changed explains impact with --plan; it never skips required checks');
  if (writeDurationsConflict(options)) throw new Error('--write-durations records the whole registry: `node tools/run-selftests.mjs --write-durations`, no other option');
  if (options.writeDurations) { options.files = registered; return options; } // every tier keeps a scheduling time
  const tiered = options.heavy ? manualSuiteFiles(registered, options.heavy) : defaultTierFiles(registered);
  options.tier = options.heavy ? options.heavy.join(',') : 'default';
  const selected = selectTier(tiered, registered, options);
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
    || options.changed || options.report || options.logs || options.order !== 'longest' || options.heavy);
}
/** --only within the selected tier; a selection that matches only another tier's receipts says which suite holds them. */
function selectTier(tiered, registered, options) {
  try { return selectReceipts(tiered, options.only); }
  catch (error) {
    let elsewhere = [];
    try { elsewhere = selectReceipts(registered, options.only); } catch { throw error; }
    const suites = [...new Set(elsewhere.map((file) => manualSuiteOf(file) ?? 'default'))];
    throw new Error(`--only=${options.only.join(',')} matched no ${options.tier}-tier receipt; it matches ${elsewhere.length} in `
      + `${suites.join(', ')} (${suites.includes('default') ? 'drop --heavy' : `npm run test:heavy -- ${suites.join(' ')}`})`);
  }
}

/**
 * How a receipt reads a changed path (relative or absolute; it may no longer exist): 'scan' when a listing it runs
 * covers the path (tools/selftest-scans.mjs), 'named' when its closure holds the file or a directory above it other than
 * the broad fallback, 'broad' when only a fallback directory (SELFTEST_BROAD_DIRS) holds it, else null.
 * A broad match alone is the cache's caution, not a read: the 228p selection could not tell it from runtimeStyles' scan.
 */
export function selftestReadOf(cache, file, path, root = process.cwd()) {
  const closure = cache.closureOf(resolve(root, file));
  const absolute = resolve(root, path);
  if (cache.scanMatch(file, relative(root, absolute))) return 'scan';
  if (closure.has(absolute)) return 'named';
  let broad = false;
  for (let dir = dirname(absolute); dir.startsWith(root + sep); dir = dirname(dir)) {
    if (!closure.has(dir)) continue;
    if (!SELFTEST_BROAD_DIRS.includes(relative(root, dir))) return 'named';
    broad = true;
  }
  return broad ? 'broad' : null;
}

export function selftestPlan(files, cache, changed = null, root = process.cwd()) {
  return files.map(file => {
    const proof = cache.lookup(file);
    const row = { file, action: proof.skip ? 'reuse' : 'run', reason: proof.reason, inputs: proof.inputs };
    if (!changed) return row;
    const reads = changed.map(path => [path, selftestReadOf(cache, file, path, root)]).filter(([, read]) => read);
    // affectedBy: every changed path the receipt may read; scanBy: those a listing covers (select it, deleted paths
    // included); broadOnly: it matches only through the fallback, which never by itself names a read
    return { ...row, affectedBy: reads.map(([path]) => path), scanBy: reads.filter(([, read]) => read === 'scan').map(([path]) => path),
      broadOnly: reads.length > 0 && reads.every(([, read]) => read === 'broad') };
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
    const cache = createSelftestCache({ alwaysRun: SELFTEST_FRESH_FILES, fixtureKeyed: SELFTEST_FIXTURE_KEYED_FILES,
      declaredInputs: SELFTEST_DECLARED_INPUTS,
      env: selftestCacheEnv(childEnv), cacheDir: cacheLocation.dir });
    const runtimes = createRuntimeIndex(cacheLocation.dir);
    if (command.shard) console.log(`[selftests] shard ${command.shard.index}/${command.shard.count}: ${command.shard.receipts} of ${command.shard.selected} selected receipts (~${(command.shard.loadMs / 60_000).toFixed(1)} min weighted; partition ${command.shard.partition})`);
    else if (command.only.length) console.log(`[selftests] --only=${command.only.length > 8 ? `<${command.only.length} entries>` : command.only.join(',')}: ${suite.length} receipts`);
    if (!command.writeDurations) console.log(command.heavy
      ? `[selftests] manual tier: ${command.heavy.join(', ')} (${suite.length} receipts; the owner triggers these runs)`
      : `[selftests] default tier: ${suite.length} of ${command.registered} registered receipts; manual suites run only through npm run test:heavy`);
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
        ...(command.changed ? { affected: checks.filter(row => row.affectedBy.length).length,
          scanned: checks.filter(row => row.scanBy.length).length, broadOnly: checks.filter(row => row.broadOnly).length } : {}),
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
      const cpuLease = selftestCpuLease();
      const memoryGate = cpuLease ? null : selftestMemoryGate();
      const order = command.order === 'longest' ? admissionOrder(suite, { runMsOf, ...selftestAdmissionSets(cpuLease) }) : undefined;
      if (order) console.log(`[selftests] ${suiteName}: admission longest-first (${suite.filter(file => runMsOf(file) !== undefined).length} of ${suite.length} run times known; ${cpuLease ? 'barriers first' : 'exclusive CPU first, browser receipts last'}); --order=registry admits in registry order`);
      console.log(`[selftests] ${suiteName}: ${cpuLease ? 'CPU receipts share the capture lease (COT_SELFTEST_CPU_LEASE=1)' : 'CPU receipts take no capture lease; browser receipts queue for the GPU themselves'}`);
      const logOf = file => join(command.logs, `${file}.log`);
      const runDirectory = selftestRunDirectory();
      process.env.COT_SELFTEST_RUN_DIR = runDirectory.dir; // every child inherits it (selftestChildEnv)
      process.exitCode = await runSelftestSuite(suiteName, suite, {
        concurrency,
        failFast: selftestFailFast(),
        cache,
        order,
        cpuLease,
        ...(memoryGate ? { memoryGate } : {}),
        // CPU children under nice; the timing-sensitive exclusive and browser receipts keep the runner's priority
        runFile: file => runSelftestFile(file, { ...(command.logs ? { logFile: logOf(file) } : {}),
          nice: SELFTEST_BARRIER_FILES.includes(file) ? 0 : SELFTEST_CHILD_NICE,
          observeDir: join(runDirectory.dir, 'observe', createHash('sha1').update(file).digest('hex')) }),
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
      if (runDirectory.created) rmSync(runDirectory.dir, { recursive: true, force: true });
      if (skipped) console.log(`[selftests] ${suiteName}: ${skipped} of ${suite.length} receipts skipped (inputs unchanged since their last PASS; --all or COT_SELFTEST_CACHE=0 runs everything)${cache.enabled ? '' : ' [cache disabled]'}`);
      if (failures.length) console.error(`[selftests] ${suiteName}: ${failures.length} FAILED\n  ${failures.join('\n  ')}`);
      console.log(`[selftests] ${suiteName}: ${(performance.now() - suiteStarted).toFixed(0)}ms elapsed, ${executionMs.toFixed(0)}ms summed child across ${concurrency} CPU workers, ${queueMs.toFixed(0)}ms runner FIFO; browser children remain exclusive`);
      const reportPath = command.report ?? resolve('node_modules/.cache/cot-selftests/latest-run.json');
      mkdirSync(dirname(reportPath), { recursive: true });
      writeFileSync(reportPath, JSON.stringify({ startedAt, finishedAt: new Date().toISOString(),
        status: process.exitCode, admission: command.order, ...(command.only.length ? { only: command.only } : {}),
        ...(command.shard ? { shard: command.shard } : {}), ...(command.logs ? { logs: command.logs } : {}),
        selected: suite.length, completed, executed: completed - skipped,
        options: { cpuLease, memoryGb: memoryGate?.gb ?? 0, memoryAsks: memoryGate?.asks ?? 0, childNice: SELFTEST_CHILD_NICE },
        reused: skipped, elapsedMs: performance.now() - suiteStarted, executionMs, queueMs, rows }, null, 2) + '\n');
      console.log(`[selftests] report: ${reportPath}`);
    }
  }
}
