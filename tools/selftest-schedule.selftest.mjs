import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha1 } from './selftest-cache.mjs';
import { admissionOrder, createRuntimeIndex, durationSnapshotText, globToRegExp, loadDurationSnapshot, parseShard,
  partitionShards, selectReceipts, snapshotWeights, splitGlobs, unknownRunMs } from './selftest-schedule.mjs';

// Gate P7 (2026-10-01): the pool admits barriers first, then the longest receipts, by the last
// observed run time. Selection and verdicts never depend on it; these fixtures pin the order rules
// and the run-time index the order reads.

// unknown run times are scheduled early: the 90th percentile of the known ones, at least 1 s
assert.equal(unknownRunMs([]), 0, 'no observations: unknown work keeps registry order');
assert.equal(unknownRunMs([10, 20, 30]), 1000, 'short suites still treat an unknown receipt as at least 1 s');
assert.equal(unknownRunMs(Array.from({ length: 11 }, (_, index) => index * 10_000)), 90_000);
assert.equal(unknownRunMs([5_000, undefined, NaN, -1, 7_000]), 5_000, 'only finite, non-negative times count');

const files = ['fleet-a', 'short', 'browser', 'fleet-b', 'new', 'exclusive', 'medium'];
const times = { 'fleet-a': 150_000, short: 400, browser: 4_000, 'fleet-b': 200_000, exclusive: 100_000, medium: 9_000 };
const order = admissionOrder(files, { runMsOf: (file) => times[file], barriers: new Set(['browser', 'exclusive']) });
assert.deepEqual(order.map((index) => files[index]), ['browser', 'exclusive', 'fleet-b', 'fleet-a', 'new', 'medium', 'short'],
  'barriers first in registry order, then longest-first; an unknown receipt takes the 90th percentile (150 s, a tie kept in registry order)');
assert.deepEqual([...order].sort((a, b) => a - b), files.map((_, index) => index), 'a permutation: every receipt is admitted once');
assert.deepEqual(admissionOrder(['a', 'b', 'c'], { runMsOf: () => 1_000 }), [0, 1, 2], 'equal times keep registry order');
assert.deepEqual(admissionOrder(['a', 'b', 'c', 'd'], { barriers: new Set(['c']) }), [2, 0, 1, 3],
  'cold index: barriers first, the rest in registry order (its head lists the fleet sweeps)');
assert.deepEqual(admissionOrder(['a', 'b'], { runMsOf: (file) => file === 'a' ? 10 : undefined, unknownMs: 5 }), [0, 1],
  'an explicit unknown estimate is honoured');

// the run-time index: rebuilt from the newest proof record per receipt, then kept in runtimes.json
const cacheDir = mkdtempSync(join(tmpdir(), 'cot-selftest-schedule-'));
try {
  const proof = (file, key, runMs, passedAt, mtimeSeconds) => {
    const path = join(cacheDir, `${sha1(file)}-${key.repeat(64).slice(0, 64)}.json`);
    writeFileSync(path, JSON.stringify({ file, key, passedAt, version: 2, ...(runMs === undefined ? {} : { runMs }) }) + '\n');
    utimesSync(path, mtimeSeconds, mtimeSeconds);
  };
  proof('src/a.selftest.mjs', 'a', 12_345.6, '2026-09-28T00:00:00.000Z', 1_000);
  proof('src/a.selftest.mjs', 'b', 40_000, '2026-09-30T00:00:00.000Z', 2_000);
  proof('src/b.selftest.mjs', 'c', undefined, '2026-09-30T00:00:00.000Z', 2_000);
  writeFileSync(join(cacheDir, 'edges.json'), '{}\n');
  writeFileSync(join(cacheDir, `${'f'.repeat(40)}-${'0'.repeat(64)}.json`), '{ partial');
  const first = createRuntimeIndex(cacheDir, { clock: () => '2026-10-01T00:00:00.000Z' });
  assert.equal(first.runMsOf('src/a.selftest.mjs'), 40_000, 'the newest proof record names the run time');
  assert.equal(first.runMsOf('src/b.selftest.mjs'), undefined, 'a record without runMs is not an observation');
  assert.equal(first.size(), 1, 'partial records and other cache files are ignored');
  first.record('src/b.selftest.mjs', 2_500.4);
  first.record('src/c.selftest.mjs', -5);
  first.record('src/d.selftest.mjs', NaN);
  first.persist();
  const stored = JSON.parse(readFileSync(first.path, 'utf8'));
  assert.equal(stored.version, 1);
  assert.deepEqual(stored.byFile, {
    'src/a.selftest.mjs': { runMs: 40_000, at: '2026-09-30T00:00:00.000Z' },
    'src/b.selftest.mjs': { runMs: 2_500, at: '2026-10-01T00:00:00.000Z' },
  });
  proof('src/a.selftest.mjs', 'd', 1, '2026-10-02T00:00:00.000Z', 3_000);
  assert.equal(createRuntimeIndex(cacheDir).runMsOf('src/a.selftest.mjs'), 40_000, 'once built, the index is read instead of the proofs');
  // two concurrent runners merge; the newer observation of a receipt wins
  const runnerA = createRuntimeIndex(cacheDir, { clock: () => '2026-10-03T00:00:00.000Z' });
  const runnerB = createRuntimeIndex(cacheDir, { clock: () => '2026-10-04T00:00:00.000Z' });
  runnerA.record('src/a.selftest.mjs', 111);
  runnerA.record('src/e.selftest.mjs', 5);
  runnerB.record('src/a.selftest.mjs', 222);
  runnerB.persist();
  runnerA.persist();
  const merged = createRuntimeIndex(cacheDir);
  assert.equal(merged.runMsOf('src/a.selftest.mjs'), 222, 'a stale writer does not overwrite a newer observation');
  assert.equal(merged.runMsOf('src/e.selftest.mjs'), 5, 'concurrent runners keep each other\'s receipts');
  assert.equal(merged.runMsOf('src/b.selftest.mjs'), 2_500);
  writeFileSync(merged.path, '{ torn');
  assert.equal(createRuntimeIndex(cacheDir).runMsOf('src/a.selftest.mjs'), 1, 'a torn index is rebuilt from the proofs');
  const missingDir = join(cacheDir, 'missing', 'nested');
  const empty = createRuntimeIndex(missingDir);
  assert.equal(empty.runMsOf('anything'), undefined);
  empty.persist();
  empty.record('x', 3);
  empty.persist();
  assert.equal(createRuntimeIndex(missingDir).runMsOf('x'), 3, 'the index creates its directory on first write');
  mkdirSync(join(cacheDir, 'not-a-cache'));
} finally {
  rmSync(cacheDir, { recursive: true, force: true });
}
console.log('selftest-schedule: barriers-first longest-first admission, unknown-time default and the merged run-time index pass');

// Gate P8 (2026-10-01): --only globs and deterministic, duration-balanced shards.
{
  const registry = ['src/vehicles/fleetLazy.selftest.mjs', 'src/vehicles/profiles/t90.selftest.mjs', 'src/ui/hud.selftest.mjs',
    'tools/run-selftests.selftest.mjs', 'tools/selftest-cpu-pool.selftest.mjs', 'tools/attribution-audit.mjs', 'server/match/loop.selftest.mjs'];
  const pick = (...globs) => selectReceipts(registry, globs);
  assert.deepEqual(pick('src/vehicles/**'), registry.slice(0, 2), '** spans directories');
  assert.deepEqual(pick('src/vehicles/*.selftest.mjs'), [registry[0]], '* stays inside one directory');
  assert.deepEqual(pick('**/loop.selftest.mjs'), [registry[6]], 'a leading **/ also matches at any depth');
  assert.deepEqual(pick('tools/{run-selftests,selftest-cpu-pool}.selftest.mjs'), registry.slice(3, 5), 'brace alternatives');
  assert.deepEqual(pick('src/ui/'), [registry[2]], 'a trailing slash selects a tree');
  assert.deepEqual(pick('tools/attribution-audit.mjs'), [registry[5]], 'an exact path selects one receipt');
  assert.deepEqual(pick('server/**', 'src/ui/**'), [registry[2], registry[6]], 'several globs keep registry order');
  assert.deepEqual(pick('tools/?un-selftests.selftest.mjs'), [registry[3]]);
  assert.equal(globToRegExp('a.b+c').test('a.b+c'), true, 'regular-expression characters are literal');
  assert.equal(globToRegExp('a.b').test('axb'), false);
  assert.throws(() => pick('src/nothing/**'), /matched no registered receipt/, 'an empty selection is an error, never an empty gate');
  assert.throws(() => globToRegExp('src/{a,b'), /Unbalanced braces/);
  assert.deepEqual(selectReceipts(registry, []), registry);
  assert.deepEqual(splitGlobs('src/{a,b}/**,tools/x.mjs,,'), ['src/{a,b}/**', 'tools/x.mjs'], 'commas split outside braces only');

  assert.deepEqual(parseShard('2/6'), { index: 2, count: 6 });
  assert.deepEqual(parseShard('1/1'), { index: 1, count: 1 });
  for (const bad of ['0/3', '4/3', '1/0', 'a/b', '1.5/3', '-1/3', '2', '/3', '1/3/4']) {
    assert.throws(() => parseShard(bad), /--shard must be i\/n/, `${bad} is rejected`);
  }

  // shards: exact cover, registry order inside each, balanced by weight, identical on every call
  const files = Array.from({ length: 40 }, (_, index) => `src/r${String(index).padStart(2, '0')}.selftest.mjs`);
  const weights = new Map(files.map((file, index) => [file, ((index * 7919) % 97 + 1) * 1000]));
  weights.set(files[3], 180_000);
  const weightOf = (file) => weights.get(file);
  for (const count of [1, 2, 3, 5, 6, 8]) {
    const shards = partitionShards(files, count, { weightOf, barriers: new Set([files[10]]) });
    assert.equal(shards.length, count);
    assert.deepEqual(shards.flatMap((shard) => shard.indices).sort((a, b) => a - b), files.map((_, index) => index),
      `${count} shards cover every receipt exactly once`);
    for (const shard of shards) assert.deepEqual(shard.indices, [...shard.indices].sort((a, b) => a - b), 'registry order inside a shard');
    const loads = shards.map((shard) => shard.loadMs);
    const heaviest = Math.max(...files.map((file, index) => (index === 10 ? 8 : 1) * weightOf(file)));
    assert.ok(Math.max(...loads) - Math.min(...loads) <= heaviest, `${count} shards: imbalance stays within one receipt's weight`);
    assert.deepEqual(partitionShards(files, count, { weightOf, barriers: new Set([files[10]]) }), shards, 'deterministic');
  }
  const barrierHeavy = partitionShards(['bar', 'a', 'b', 'c'], 2, { weightOf: () => 10, barriers: new Set(['bar']) });
  assert.deepEqual(barrierHeavy.map((shard) => shard.indices), [[0], [1, 2, 3]], 'a barrier loads its shard as eight workers\' worth');
  assert.deepEqual(partitionShards(['a', 'b'], 3).map((shard) => shard.indices), [[0], [1], []], 'more shards than receipts leaves some empty');

  // the committed snapshot weights the shards; unknown receipts weigh the median; no snapshot: 1 each
  const snapshot = new Map([['src/a', 4_000], ['src/b', 1_000], ['src/c', 9_000]]);
  const snapshotWeight = snapshotWeights(['src/a', 'src/b', 'src/c', 'src/new'], snapshot);
  assert.deepEqual(['src/a', 'src/new'].map(snapshotWeight), [4_000, 4_000]);
  assert.equal(snapshotWeights(['x'], new Map())('x'), 1);
  const text = durationSnapshotText(['src/b', 'src/a', 'src/none', 'src/tiny'], (file) => ({ 'src/a': 1_234, 'src/b': 56_789, 'src/tiny': 3 })[file]);
  assert.deepEqual(JSON.parse(text).runMs, { 'src/a': 1_200, 'src/b': 56_800, 'src/tiny': 100 }, 'rounded to 100 ms, sorted, unknown omitted');
  const snapshotDir = mkdtempSync(join(tmpdir(), 'cot-duration-snapshot-'));
  try {
    const path = join(snapshotDir, 'durations.json');
    writeFileSync(path, text);
    assert.deepEqual([...loadDurationSnapshot(path)], [['src/a', 1_200], ['src/b', 56_800], ['src/tiny', 100]]);
    assert.equal(loadDurationSnapshot(join(snapshotDir, 'missing.json')).size, 0, 'a missing snapshot weighs every receipt 1');
  } finally { rmSync(snapshotDir, { recursive: true, force: true }); }
  assert.ok(loadDurationSnapshot().size > 1000, 'the committed snapshot covers the registry');
}
console.log('selftest-schedule: --only globs, exact-cover deterministic shards and the committed run-time snapshot pass');
