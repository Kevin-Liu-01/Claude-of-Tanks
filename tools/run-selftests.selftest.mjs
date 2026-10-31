import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SELFTEST_SUITES } from './selftest-suites.mjs';
import { defaultTierFiles } from './selftest-tiers.mjs';
import { runSelftestFile, runSelftestSuite, selftestAdmissionSets, selftestMemoryGate, SELFTEST_DECLARED_INPUTS, selftestCpuLease, SELFTEST_EXCLUSIVE_CPU_FILES, SELFTEST_FIXTURE_KEYED_FILES, SELFTEST_GRAPH_GUARD, selftestChildEnv, selftestFailFast, selftestCommand, selftestPlan,
  selftestCacheEnv, selftestRunDirectory, SELFTEST_LAST_FILES, SELFTEST_OWNED_LEASE_FILES, SELFTEST_FRESH_FILES } from './run-selftests.mjs';
import { createSelftestCache } from './selftest-cache.mjs';
import { collectSelftestInputs } from './selftest-inputs.mjs';
// The runners read COT_SHOTS_LOCK_TIMEOUT_MS (landing chains export three hours); this receipt pins the default wait.
process.env.COT_SHOTS_LOCK_TIMEOUT_MS = '';

// 266: a selection is the default tier (tools/selftest-tiers.mjs); manual suites only by name (--heavy, npm run test:heavy)
assert.deepEqual(selftestCommand(['all', '--all']).files, defaultTierFiles(Object.values(SELFTEST_SUITES).flat()),
  'one cache-bypass command runs every group of the default tier, including former npm lifecycle hooks');
assert.deepEqual(selftestCommand([]).files, defaultTierFiles(Object.values(SELFTEST_SUITES).flat()));
assert.equal(selftestCommand(['core', '--plan']).plan, true);
assert.throws(() => selftestCommand(['all', '--typo']), /Unknown self-test option/);
assert.throws(() => selftestCommand(['all', '--changed=src/main.ts']), /never skips required checks/);
assert.equal(selftestCommand([]).order, 'longest', 'gate P7: longest-first admission is the default');
assert.equal(selftestCommand(['all', '--order=registry']).order, 'registry');
assert.throws(() => selftestCommand(['all', '--order=random']), /Unknown self-test option/);
// Gate P8 (2026-10-01): --only selects registry entries by glob; --shard=i/n runs one of n
// deterministic shards that together cover the selection exactly once, each in registry order.
{
  const registry = defaultTierFiles(Object.values(SELFTEST_SUITES).flat()); // what a selection draws from (266)
  assert.deepEqual(selftestCommand(['all', '--only=tools/run-selftests*.mjs']).files, ['tools/run-selftests.selftest.mjs']);
  const vehicles = selftestCommand(['--only=src/vehicles/**']).files;
  assert.deepEqual(vehicles, registry.filter(file => file.startsWith('src/vehicles/')), 'a tree glob keeps registry order');
  assert.ok(vehicles.length > 100);
  assert.deepEqual(selftestCommand(['core', '--only=tools/{capture-lock,selftest-cpu-pool}.selftest.mjs']).files,
    SELFTEST_SUITES.core.filter(file => ['tools/capture-lock.selftest.mjs', 'tools/selftest-cpu-pool.selftest.mjs'].includes(file)),
    'a group narrows first');
  assert.deepEqual(selftestCommand(['--only=tools/capture-lock.selftest.mjs', '--only=tools/capture-command.selftest.mjs']).files,
    registry.filter(file => file === 'tools/capture-lock.selftest.mjs' || file === 'tools/capture-command.selftest.mjs'));
  assert.throws(() => selftestCommand(['--only=nowhere/**']), /matched no registered receipt/);
  for (const durations of [undefined, new Map()]) {
    const shards = [1, 2, 3, 4, 5, 6].map(index => selftestCommand(['all', `--shard=${index}/6`], durations ? { durations } : undefined));
    assert.deepEqual(shards.flatMap(shard => shard.files).sort(), [...registry].sort(), 'six shards cover the default tier exactly once');
    for (const shard of shards) assert.deepEqual(shard.files, registry.filter(file => shard.files.includes(file)), 'registry order inside a shard');
    assert.equal(new Set(shards.map(shard => shard.shard.partition)).size, 1, 'every shard job derives the same partition');
    assert.equal(shards[0].shard.selected, registry.length);
    if (!durations) {
      // 2026-10-02: a shard holding one receipt cannot be split; since the fleet passes the weighted fleetLazy barrier
      // (8 x its run time) alone outweighs the even share, so it is measured against, not inside, the balance.
      const loads = shards.map(shard => shard.shard.loadMs);
      const divisible = shards.filter(shard => shard.files.length > 1).map(shard => shard.shard.loadMs);
      assert.ok(divisible.length >= 5 && Math.max(...divisible) / Math.min(...loads) < 1.25,
        `the committed snapshot balances six shards (${loads.join(', ')} ms)`);
    } else {
      const counts = shards.map(shard => shard.files.length);
      assert.ok(Math.max(...counts) - Math.min(...counts) <= 8, 'without a snapshot the shards balance by count');
    }
  }
  const narrowed = selftestCommand(['--only=src/ui/**', '--shard=2/3']);
  assert.ok(narrowed.files.every(file => file.startsWith('src/ui/')), '--shard partitions the --only selection');
  assert.throws(() => selftestCommand(['--shard=0/3']), /--shard must be i\/n/);
  assert.throws(() => selftestCommand(['--shard=1/3', '--shard=2/3']), /Unknown self-test option/, 'one shard per invocation');
  assert.equal(selftestCommand(['--write-durations']).writeDurations, true);
  for (const args of [['pre', '--write-durations'], ['--write-durations', '--only=src/**'], ['--write-durations', '--shard=1/2'], ['--write-durations', '--plan']]) {
    assert.throws(() => selftestCommand(args), /records the whole registry/);
  }
}
assert.ok(SELFTEST_FRESH_FILES.includes('server/match/tickCost.selftest.mjs'));
assert.ok(SELFTEST_FRESH_FILES.includes('server/match/loop.selftest.mjs'));
assert.ok(SELFTEST_FRESH_FILES.includes('src/mp/wire/wireFuzz.selftest.mjs'));
assert.ok(!SELFTEST_FRESH_FILES.includes('src/vehicles/fleetLazy.selftest.mjs'),
  'functional source proofs are separate from environmental timing assertions');
assert.deepEqual(selftestPlan(['a'], {
  lookup: () => ({ skip: false, reason: 'new input', inputs: 2 }),
  closureOf: () => new Set(['/fixture/src', '/fixture/tools/a.mjs']),
  scanMatch: () => false,
}, ['src/main.ts', 'docs/readme.md'], '/fixture'), [
  { file: 'a', action: 'run', reason: 'new input', inputs: 2, affectedBy: ['src/main.ts'], scanBy: [], broadOnly: true },
], 'impact planning is explanatory and includes directory inputs; a match through a fallback directory alone is broad');
// (2026-10-20, after 228p) a named file or a non-fallback directory is a read; a listing's pattern selects even a deleted path
assert.deepEqual(selftestPlan(['a'], {
  lookup: () => ({ skip: false, reason: 'new input', inputs: 3 }),
  closureOf: () => new Set(['/fixture/src', '/fixture/src/ui/hud.ts', '/fixture/public/icons']),
  scanMatch: (file, path) => path.startsWith('src/presentation/'),
}, ['src/ui/hud.ts', 'public/icons/a.webp', 'src/presentation/gone.ts', 'src/world/map.ts', 'api/x.ts'], '/fixture'), [
  { file: 'a', action: 'run', reason: 'new input', inputs: 3,
    affectedBy: ['src/ui/hud.ts', 'public/icons/a.webp', 'src/presentation/gone.ts', 'src/world/map.ts'],
    scanBy: ['src/presentation/gone.ts'], broadOnly: false },
], 'named files, named directories and listings select; the fallback alone only explains');

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

// 229: with cpuLease false the CPU children never touch the capture lock, serial or pooled; the browser child still
// runs alone (it takes the lock itself) and nothing is released that was never taken.
for (const concurrency of [1, 3]) {
  const events = [];
  const lock = { async acquire() { assert.fail('a CPU child queued for the capture lock'); }, release() { events.push('release'); },
    refresh() { assert.fail('no lease to refresh'); }, waiting: () => 4 };
  let active = 0;
  const status = await runSelftestSuite('no-lease', ['a', 'b', 'browser', 'c'], { concurrency, lock, ownedLeaseFiles: ['browser'],
    cpuLease: false, refreshMs: 5, log: () => {}, logError: () => {},
    async runFile(file) {
      if (file === 'browser') assert.equal(active, 0, 'the browser receipt still runs alone');
      active++; events.push(file); await new Promise((resolve) => setTimeout(resolve, 2)); active--;
      return { status: 0 };
    } });
  assert.equal(status, 0);
  assert.deepEqual(events.filter((event) => event !== 'release').sort(), ['a', 'b', 'browser', 'c'], `concurrency ${concurrency}`);
}
// the memory gate: a yes is reused for 5 s, a no is asked again every 15 s; no CLI, a usage error or 0 GB opens it; 30
// minutes of noes start the child anyway; the pool awaits it once per CPU child when there is no lease
{
  let clock = 0, asks = 0, answers = [0, 1, 1, 0];
  const waits = [], said = [];
  const gate = selftestMemoryGate({}, { ask: (gb) => { asks++; assert.equal(gb, 6); return { status: answers.shift() }; },
    sleep: async (ms) => { waits.push(ms); clock += ms; }, clock: () => clock, log: (line) => said.push(line) });
  await gate(); await gate(); assert.equal(asks, 1, 'a yes is reused');
  clock += 5_000; await gate();
  assert.equal(asks, 4, 'after 5 s it asks again and waits through two noes'); assert.deepEqual(waits, [15_000, 15_000]);
  assert.equal(said.length, 1, 'the wait is logged once in ten minutes');
  let missing = 0;
  const absent = selftestMemoryGate({}, { ask: () => { missing++; return { error: Object.assign(new Error('x'), { code: 'ENOENT' }) }; },
    log: () => {} });
  await absent(); await absent(); assert.equal(missing, 1, 'no headroom CLI: the gate opens for good');
  const usage = selftestMemoryGate({}, { ask: () => ({ status: 2 }), log: () => {},
    sleep: async () => assert.fail('a usage error never waits') });
  await usage();
  let slept = 0, now = 0;
  // (headroom can-start --gb 200 on a 128 GB machine answers 1, a no, for ever)
  const stuck = selftestMemoryGate({ COT_SELFTEST_MEMORY_GB: '200' }, { ask: () => ({ status: 1 }),
    sleep: async (ms) => { slept++; now += ms; }, clock: () => now, log: () => {} });
  await stuck(); assert.equal(slept, 120, '30 minutes of noes, then the child starts');
  await stuck(); await stuck(); assert.equal(slept, 120, 'and the gate stays open for the rest of the run');
  await selftestMemoryGate({ COT_SELFTEST_MEMORY_GB: '0' }, { ask: () => assert.fail('asked with the gate off') })();
  let defaulted = 0;
  await selftestMemoryGate({ COT_SELFTEST_MEMORY_GB: '' }, { ask: (gb) => { defaulted = gb; return { status: 0 }; } })();
  assert.equal(defaulted, 6, 'an empty setting is the default, not off');
  let gated = 0;
  const lock = { async acquire() { assert.fail('no lease'); }, release() {}, refresh() {}, waiting: () => 0 };
  for (const concurrency of [1, 2]) {
    gated = 0;
    await runSelftestSuite('gated', ['a', 'browser', 'b'], { concurrency, lock, ownedLeaseFiles: ['browser'], cpuLease: false,
      memoryGate: async () => { gated++; }, refreshMs: 5, log: () => {}, logError: () => {}, runFile: async () => ({ status: 0 }) });
    assert.equal(gated, 2, `concurrency ${concurrency}: every CPU child passes the memory gate, the browser child does not`);
  }
}
// CPU children run under nice: a real child reads its own priority
{
  const { mkdtempSync: temp, writeFileSync: put } = await import('node:fs');
  const { tmpdir: tmp } = await import('node:os');
  const { join: joinPath } = await import('node:path');
  const dir = temp(joinPath(tmp(), 'cot-nice-')), script = joinPath(dir, 'nice.mjs'), out = joinPath(dir, 'nice.txt');
  put(script, `import { getPriority } from 'node:os'; import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(out)}, String(getPriority()));`);
  const result = await runSelftestFile(script, { nice: 10, signals: { on() {}, removeListener() {} } });
  assert.equal(result.status, 0);
  assert.ok(Number((await import('node:fs')).readFileSync(out, 'utf8')) >= 10, 'the child runs at nice 10 or lower priority');
  (await import('node:fs')).rmSync(dir, { recursive: true, force: true });
}
// the CLI wiring: a real one-receipt run takes no capture lease and passes (the memory gate off, a scratch cache)
{
  const { spawnSync: run } = await import('node:child_process');
  const { mkdtempSync: temp } = await import('node:fs');
  const { tmpdir: tmp } = await import('node:os');
  const { join: joinPath } = await import('node:path');
  const scratch = temp(joinPath(tmp(), 'cot-runner-cli-'));
  try {
    // the lease setting pinned off and a 1 GB memory gate, whatever the caller's environment says; 10 min under load
    const cli = run(process.execPath, ['tools/run-selftests.mjs', 'all', '--only=tools/assert-graph-guard.selftest.mjs',
      `--report=${joinPath(scratch, 'report.json')}`], { encoding: 'utf8', timeout: 600_000,
      env: { ...process.env, COT_SELFTEST_CACHE_DIR: joinPath(scratch, 'cache'), COT_SELFTEST_CPU_LEASE: '', COT_SELFTEST_MEMORY_GB: '1',
        COT_SELFTEST_WORKERS: '2' } });
    assert.equal(cli.status, 0, cli.stdout + cli.stderr);
    assert.match(cli.stdout, /PASS tools\/assert-graph-guard\.selftest\.mjs/);
    const { options } = JSON.parse((await import('node:fs')).readFileSync(joinPath(scratch, 'report.json'), 'utf8'));
    assert.equal(options.cpuLease, false, 'the CLI ran without the capture lease');
    assert.equal(options.memoryGb, 1, 'the CLI built the memory gate from COT_SELFTEST_MEMORY_GB');
    assert.ok(options.memoryAsks >= 1 || /memory gate off/.test(cli.stdout), 'and the pool consulted it before the CPU child');
    assert.equal(options.childNice, 10);
  } finally { (await import('node:fs')).rmSync(scratch, { recursive: true, force: true }); }
}
assert.equal(selftestCpuLease({}), false, 'the runner takes no CPU lease by default');
assert.equal(selftestCpuLease({ COT_SELFTEST_CPU_LEASE: '1' }), true, 'COT_SELFTEST_CPU_LEASE=1 restores the shared lease');
{
  const leased = selftestAdmissionSets(true), free = selftestAdmissionSets(false);
  for (const file of SELFTEST_OWNED_LEASE_FILES) {
    assert.ok(leased.barriers.has(file) && !leased.last.has(file), `${file}: a first barrier under the shared lease`);
    assert.ok(!free.barriers.has(file) && free.last.has(file), `${file}: last without a CPU lease, so CPU work never waits on the GPU queue`);
  }
  for (const file of SELFTEST_EXCLUSIVE_CPU_FILES.filter((file) => !SELFTEST_OWNED_LEASE_FILES.includes(file))) {
    assert.ok(free.barriers.has(file), `${file}: still runs alone, first`);
  }
  for (const file of SELFTEST_LAST_FILES) assert.ok(free.last.has(file) && leased.last.has(file));
}
assert.equal(ordered.held, false);
const refreshes = ordered.refreshes;
await new Promise((resolve) => setTimeout(resolve, 15));
assert.equal(ordered.refreshes, refreshes, 'finished suites clear their heartbeat');

// Fast checks (2026-09-15): a failure no longer stops the group — every remaining file runs
// and every failure is named, so one run reports everything a round broke. The earliest
// registry entry still supplies the exit status. COT_SELFTEST_FAIL_FAST=1 (option failFast)
// restores stop-at-first-failure for debugging.
for (const failAt of ['a', 'browser']) {
  const failed = fixture({ failAt });
  assert.equal(await runSelftestSuite('failure', ['a', 'browser', 'never'], failed.options), 7);
  assert.equal(failed.events.includes('never'), true, 'later files still run after a failure');
  assert.deepEqual(failed.errors, [`[selftests] FAIL ${failAt}`]);
  assert.equal(failed.held, false, 'ordinary and own-lock failures release only runner ownership');
  const fast = fixture({ failAt });
  assert.equal(await runSelftestSuite('fail-fast', ['a', 'browser', 'never'], { ...fast.options, failFast: true }), 7);
  assert.equal(fast.events.includes('never'), false, 'fail-fast mode preserves the old stop-at-first-failure ordering');
  assert.deepEqual(fast.errors, [`[selftests] FAIL ${failAt}`]);
}
assert.equal(selftestFailFast({}), false); assert.equal(selftestFailFast({ COT_SELFTEST_FAIL_FAST: '1' }), true);
{
  // the result cache: an unchanged receipt is skipped with a SKIP line and reported as a
  // skipped timing row; a pass is recorded under the key the lookup produced; failures are not
  const cached = fixture();
  const records = [];
  const cache = {
    lookup: (file) => file === 'a' ? { skip: true, key: 'k-a', inputs: 3, passedAt: 'earlier' } : { skip: false, key: `k-${file}`, inputs: 1 },
    recordPass: (file, key) => records.push([file, key]),
  };
  const rows = [];
  assert.equal(await runSelftestSuite('cached', ['a', 'b', 'browser'], { ...cached.options, cache, onTiming: (row) => rows.push(row) }), 0);
  assert.equal(cached.events.includes('a'), false, 'an unchanged receipt does not run');
  assert.ok(cached.events.some((event) => /SKIP a: 3 inputs unchanged since PASS at earlier/.test(event)), 'the skip is logged with its evidence');
  assert.deepEqual(rows.map((row) => [row.file, row.skipped === true]), [['a', true], ['b', false], ['browser', false]]);
  assert.deepEqual(records, [['b', 'k-b'], ['browser', 'k-browser']], 'passes are recorded under their input keys');
  const failedCached = fixture({ failAt: 'b' });
  records.length = 0;
  assert.equal(await runSelftestSuite('cached-fail', ['b'], { ...failedCached.options, cache }), 7);
  assert.deepEqual(records, [], 'a failure is never recorded as a pass');
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
// Gate P5 (2026-10-01): the serial runner renews an expired batch in place while nobody waits in
// the capture queue, and drains exactly as before when someone does.
for (const waiters of [0, 1]) {
  const serial = fixture();
  let serialClock = 0;
  const serialRunFile = serial.options.runFile;
  serial.options.now = () => serialClock;
  serial.options.lock.waiting = () => waiters;
  serial.options.runFile = async (file) => {
    const result = await serialRunFile(file);
    serialClock += file === 'long-child' ? 120_000 : 30_000;
    return result;
  };
  assert.equal(await runSelftestSuite('serial-p5', ['a', 'b', 'long-child', 'c', 'browser', 'd'], serial.options), 0);
  assert.deepEqual(serial.events, waiters ? ['[selftests] serial-p5: 6 files', 'acquire', 'a', 'b',
    'release', 'acquire', 'long-child', 'release', 'acquire', 'c',
    'release', 'browser', 'acquire', 'd', '[selftests] PASS serial-p5', 'release'] : ['[selftests] serial-p5: 6 files',
    'acquire', 'a', 'b', 'long-child', 'c', 'release', 'browser', 'acquire', 'd', '[selftests] PASS serial-p5', 'release'],
  waiters ? 'a queued waiter: every expired batch drains and re-queues' : 'no waiter: expired batches renew in place');
}
const boundaryFail = fixture({ failAt: 'b' });
let failureClock = 0;
const failureRunFile = boundaryFail.options.runFile;
boundaryFail.options.now = () => failureClock;
boundaryFail.options.runFile = async (file) => { const result = await failureRunFile(file); failureClock += 45_000; return result; };
assert.equal(await runSelftestSuite('boundary-fail', ['a', 'b', 'never'], boundaryFail.options), 7);
assert.equal(boundaryFail.events.includes('never'), true, 'the batch boundary keeps running after a failure');
assert.equal(boundaryFail.events.filter(event => event === 'acquire').length, 3);
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
  'tools/cloud-history.browser.selftest.mjs',
  'tools/late-fx-matrix.browser.selftest.mjs',
  'tools/vehicle-ground-occlusion.browser.selftest.mjs',
  'tools/articulated-shadow-batch.browser.selftest.mjs',
  'tools/battle-geometry-sharing.browser.selftest.mjs',
  'tools/track-texture-source.browser.selftest.mjs',
  'tools/sourced-building-source.browser.selftest.mjs',
  'tools/horizon-panorama-bake.browser.selftest.mjs',
  'tools/black-world.browser.selftest.mjs', // 2026-10-19 (black-screen-228): the guard's battle receipt
  'tools/garage-roster-settle.browser.selftest.mjs', // 2026-10-30 (garage-roster-thrash-265): the roster settle guard
  'tools/garage-switch-probe.selftest.mjs', // 2026-09-26: self-leasing part 2
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
assert.deepEqual(registered.events, [`[selftests] actual-registry: ${SELFTEST_OWNED_LEASE_FILES.length + 2} files`, 'acquire', 'cpu', 'release',
  ...SELFTEST_OWNED_LEASE_FILES, 'acquire', cpuBrowserGuard, '[selftests] PASS actual-registry', 'release']);
const oldRegistry = actualRegistryFixture(['tools/source-dimension-frame.browser.selftest.mjs']);
await assert.rejects(runSelftestSuite('old-nested-registry', ['cpu', 'tools/resolved-depth-copy.browser.selftest.mjs'], oldRegistry.options),
  /runner must release/);
assert.equal(oldRegistry.held, false, 'the old nested-lock failure still releases owned runner resources');
for (const concurrency of [1, 2, 3, 4, 5, 6, 7, 8]) for (const lateFx of [
  'tools/late-fx-matrix.browser.selftest.mjs', 'tools/articulated-shadow-batch.browser.selftest.mjs',
  'tools/battle-geometry-sharing.browser.selftest.mjs',
  'tools/track-texture-source.browser.selftest.mjs',
  'tools/sourced-building-source.browser.selftest.mjs',
  'tools/garage-switch-probe.selftest.mjs',
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
  { file: 'never', runMs: 70, queueMs: 0, status: 7, error: undefined },
], 'execution and FIFO time stay separate, and the files after a failure are still measured');

for (const env of [{ NODE_DISABLE_COMPILE_CACHE: '1' }, { NODE_COMPILE_CACHE: '/explicit' }, { NODE_V8_COVERAGE: '/coverage' }]) {
  assert.deepEqual(selftestChildEnv(env), { ...env, NODE_OPTIONS: SELFTEST_GRAPH_GUARD },
    'respect caller opt-out, explicit cache and coverage (only the graph guard is added)');
}
const capped = { NODE_OPTIONS: '--max-old-space-size=4096' };
assert.equal(selftestChildEnv(capped).NODE_OPTIONS, `--max-old-space-size=4096 ${SELFTEST_GRAPH_GUARD}`, 'the heap cap is kept');
assert.equal(selftestChildEnv(selftestChildEnv(capped)).NODE_OPTIONS, selftestChildEnv(capped).NODE_OPTIONS, 'the guard is added once');
assert.equal(capped.NODE_OPTIONS, '--max-old-space-size=4096', 'never mutate parent environment');
assert.deepEqual(selftestCacheEnv(selftestChildEnv(capped)).NODE_OPTIONS, '--max-old-space-size=4096', 'the guard never keys a proof');
assert.equal('NODE_OPTIONS' in selftestCacheEnv(selftestChildEnv({})), false);
assert.equal(SELFTEST_GRAPH_GUARD, `--import=${new URL('./assert-graph-guard.mjs', import.meta.url).href}`,
  'assert-graph-guard.selftest spells the same flag');
// every declared-input receipt names all the code it runs: each declared file's relative imports, and every repository
// path a receipt joins onto the checkout, are declared too (a missed edge would reuse a PASS the code no longer earns)
{
  const { readFileSync: read, readdirSync: list, existsSync: exists, statSync: statOf } = await import('node:fs');
  const { dirname: dir, join: joinPath, relative: rel, resolve: res } = await import('node:path');
  const root = res(import.meta.dirname, '..');
  const { SELFTEST_SUITES } = await import('./selftest-suites.mjs');
  const registered = new Set(Object.values(SELFTEST_SUITES).flat());
  for (const [receipt, patterns] of Object.entries(SELFTEST_DECLARED_INPUTS)) {
    assert.ok(registered.has(receipt), `${receipt} is a registered receipt`);
    const declared = new Set([receipt]);
    for (const pattern of patterns) {
      if (!pattern.includes('*')) { assert.ok(exists(joinPath(root, pattern)), `${pattern} exists`); declared.add(pattern); continue; }
      const folder = dir(pattern), suffix = pattern.slice(pattern.indexOf('*') + 1);
      for (const name of list(joinPath(root, folder))) if (name.endsWith(suffix)) declared.add(`${folder}/${name}`);
    }
    for (const file of declared) {
      const text = read(joinPath(root, file), 'utf8');
      // the parsed imports (static and literal dynamic), never import text inside a fixture's source strings
      // parsed relative imports (never import text inside a fixture's source strings), and files the code reads by
      // new URL('./x', import.meta.url)
      const code = text.split('\n').filter((line) => !/^\s*(?:\/\/|\*|\/\*)/.test(line)).join('\n'); // comment lines name no file
      const urls = [...code.matchAll(/new URL\(\s*['"`](\.{1,2}\/[^'"`$]+)['"`]\s*,\s*import\.meta\.url/g),
        ...code.matchAll(/join\(\s*import\.meta\.dirname\s*,\s*['"`](\.{1,2}\/[^'"`$]+)['"`]\s*\)/g)].map((match) => match[1]);
      const edges = [...new Set([...collectSelftestInputs(text, file).imports, ...urls])].filter((specifier) => /^\.{1,2}\//.test(specifier))
        .map((specifier) => rel(root, res(root, dir(file), specifier)))
        // a directory named to find the checkout (resolve(import.meta.dirname, '../..')) reads no file itself
        .filter((edge) => !(exists(joinPath(root, edge)) && statOf(joinPath(root, edge)).isDirectory()));
      if (file === receipt) edges.push(...[...text.matchAll(/join\(repo,\s*'([^']+)'\)/g)].map((match) => match[1]));
      for (const edge of edges) assert.ok(declared.has(edge), `${receipt}: ${file} reaches ${edge}, which its declaration leaves out`);
    }
  }
}
// every fixture-live receipt is registered (a stale entry would silently key nothing)
{
  const { SELFTEST_SUITES } = await import('./selftest-suites.mjs');
  const registered = new Set(Object.values(SELFTEST_SUITES).flat());
  for (const file of SELFTEST_FIXTURE_KEYED_FILES) assert.ok(registered.has(file), `${file} is a registered receipt`);
}
const originalEnv = { EXAMPLE: 'preserved' }, cachedEnv = selftestChildEnv(originalEnv);
assert.equal(cachedEnv.EXAMPLE, 'preserved');
assert.equal(originalEnv.NODE_COMPILE_CACHE, undefined, 'never mutate parent environment');
assert.match(cachedEnv.NODE_COMPILE_CACHE, /cot-selftest-compile-/);

// Test-speed R9a (2026-10-16): the run's directory for records a judge merges (COT_SELFTEST_RUN_DIR) is fresh for each
// invocation unless the caller exported one, which it keeps; a judge is registered after the receipts it merges (the
// serial path) and the pool admits it last (tools/selftest-schedule.mjs admissionOrder `last`).
assert.deepEqual(selftestRunDirectory({ COT_SELFTEST_RUN_DIR: '/gate/run' }, () => assert.fail('made a directory')),
  { dir: '/gate/run', created: false }, 'a gate\'s exported directory is used and kept');
assert.deepEqual(selftestRunDirectory({}, () => '/tmp/cot-selftest-run-x'), { dir: '/tmp/cot-selftest-run-x', created: true });
const madeRunDirectory = selftestRunDirectory({});
try { assert.match(madeRunDirectory.dir, /cot-selftest-run-/); } finally { rmSync(madeRunDirectory.dir, { recursive: true, force: true }); }
const registry = Object.values(SELFTEST_SUITES).flat();
assert.deepEqual(SELFTEST_LAST_FILES, ['server/battlePacing.selftest.mjs']);
for (const judge of SELFTEST_LAST_FILES) assert.ok(registry.includes(judge), `${judge} is registered`);
const shardIndices = registry.map((file, index) => (/^server\/battlePacingShard\d\.selftest\.mjs$/.test(file) ? index : -1))
  .filter((index) => index >= 0);
assert.equal(shardIndices.length, 8, 'the eight battlePacing shards are registered');
assert.ok(shardIndices.every((index) => index < registry.indexOf('server/battlePacing.selftest.mjs')),
  'the shards precede their judge in registry order');
// the result cache keys a receipt on the variables its files read, but not on the run directory: its path changes every
// run (keyed, a receipt that reads it would never be reused), and a receipt reads only what its own run wrote there
const cacheEnvRoot = mkdtempSync(join(tmpdir(), 'cot-selftest-run-dir-key-'));
try {
  writeFileSync(join(cacheEnvRoot, 'judge.selftest.mjs'),
    'console.log(process.env.COT_SELFTEST_RUN_DIR, process.env.COT_PACING_JOBS);\n');
  const keyWith = (env) => createSelftestCache({ root: cacheEnvRoot, cacheDir: join(cacheEnvRoot, '.cache'), env, argv: [],
    nodeVersion: 'v-test' }).inputKey('judge.selftest.mjs').key;
  const runA = { COT_SELFTEST_RUN_DIR: '/tmp/cot-selftest-run-a', COT_PACING_JOBS: '4', NODE_COMPILE_CACHE: '/c' };
  const runB = { ...runA, COT_SELFTEST_RUN_DIR: '/tmp/cot-selftest-run-b' };
  assert.notEqual(keyWith(runA), keyWith(runB), 'the raw environment keys on the run directory (the defect left out below)');
  assert.equal(keyWith(selftestCacheEnv(runA)), keyWith(selftestCacheEnv(runB)), 'two runs\' directories, one key');
  assert.notEqual(keyWith(selftestCacheEnv(runA)), keyWith(selftestCacheEnv({ ...runA, COT_PACING_JOBS: '1' })),
    'every other variable a receipt reads still keys it');
  assert.deepEqual(selftestCacheEnv(runA), { COT_PACING_JOBS: '4', NODE_COMPILE_CACHE: '/c' });
  assert.equal(runA.COT_SELFTEST_RUN_DIR, '/tmp/cot-selftest-run-a', 'the caller\'s environment is left alone');
} finally { rmSync(cacheEnvRoot, { recursive: true, force: true }); }

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
// Gate P13 (2026-10-01): --logs sends each receipt's stdout and stderr to its own file through a
// descriptor (never a pipe), and the gate can run a receipt in another worktree through cwd.
const logFixture = mkdtempSync(join(tmpdir(), 'cot-receipt-logs-'));
try {
  const signals = new EventEmitter(), child = new EventEmitter();
  child.kill = () => true;
  let launched;
  const logFile = join(logFixture, 'nested', 'src', 'x.selftest.mjs.log');
  const pending = runSelftestFile('src/x.selftest.mjs', { signals, cwd: logFixture, logFile,
    spawnProcess: (...args) => { launched = args; return child; } });
  assert.equal(launched[2].cwd, logFixture);
  assert.equal(launched[2].stdio[0], 'inherit');
  assert.equal(typeof launched[2].stdio[1], 'number', 'stdout goes to a file descriptor, not a pipe');
  assert.equal(launched[2].stdio[1], launched[2].stdio[2], 'stderr shares the receipt log');
  child.emit('close', 0);
  assert.deepEqual(await pending, { status: 0, error: undefined });
  const script = join(logFixture, 'speaks.mjs');
  writeFileSync(script, "console.log('to stdout'); console.error('to stderr'); process.exitCode = 3;\n");
  const realLog = join(logFixture, 'speaks.log');
  assert.deepEqual(await runSelftestFile(script, { logFile: realLog }), { status: 3, error: undefined });
  assert.equal(readFileSync(realLog, 'utf8'), 'to stdout\nto stderr\n', 'a fresh child writes both streams to its log');
  // test-speed R9a: the runner sets the run directory on its own environment after it built the cache, and every child
  // it launches then reads it (a judge finds its shards' records there), with or without a preset compile cache
  const runDirProbe = join(logFixture, 'run-dir-probe.mjs');
  writeFileSync(runDirProbe, "process.exitCode = process.env.COT_SELFTEST_RUN_DIR === '/tmp/cot-selftest-run-probe' ? 0 : 7;\n");
  const savedRunDir = process.env.COT_SELFTEST_RUN_DIR, savedCompileCache = process.env.NODE_COMPILE_CACHE;
  try {
    for (const compileCache of [undefined, join(logFixture, 'compile')]) {
      if (compileCache === undefined) delete process.env.NODE_COMPILE_CACHE; else process.env.NODE_COMPILE_CACHE = compileCache;
      delete process.env.COT_SELFTEST_RUN_DIR;
      assert.equal((await runSelftestFile(runDirProbe, { logFile: join(logFixture, 'probe.log') })).status, 7);
      process.env.COT_SELFTEST_RUN_DIR = '/tmp/cot-selftest-run-probe';
      assert.equal((await runSelftestFile(runDirProbe, { logFile: join(logFixture, 'probe.log') })).status, 0,
        `a child reads the run directory (compile cache ${compileCache ? 'preset' : 'the runner\'s'})`);
    }
  } finally {
    if (savedRunDir === undefined) delete process.env.COT_SELFTEST_RUN_DIR; else process.env.COT_SELFTEST_RUN_DIR = savedRunDir;
    if (savedCompileCache === undefined) delete process.env.NODE_COMPILE_CACHE; else process.env.NODE_COMPILE_CACHE = savedCompileCache;
  }
  assert.equal(selftestCommand(['--logs=/tmp/receipt-logs']).logs, '/tmp/receipt-logs');
  assert.throws(() => selftestCommand(['--write-durations', '--logs=/tmp/x']), /records the whole registry/);
} finally { rmSync(logFixture, { recursive: true, force: true }); }
console.log('run-selftests: separate execution/FIFO timings and source-invalidated fresh-process compile caching pass');
