import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha1 } from './selftest-cache.mjs';
import { admissionOrder, createRuntimeIndex, unknownRunMs } from './selftest-schedule.mjs';

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
