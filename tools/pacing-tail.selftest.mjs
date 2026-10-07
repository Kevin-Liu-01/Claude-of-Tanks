// The pacing gate and its shard merge (the owner's ruling of 2026-10-05, "floor as a tail rate"): pure fixtures, no
// simulation. server/battlePacing.selftest plays the matches; this holds the arithmetic both it and
// tools/pacing-tail.mjs judge them by.
import assert from 'node:assert/strict';
import { pacingSeed, pacingStats, pacingVerdicts, sub90Allowed, sub120Allowed } from '../server/battlePacing.test-support.mjs';
import { mergeShardReports } from './pacing-tail.mjs';

const maps = ['a', 'b', 'c'];
// the seed of a map's match is keyed to its index in the full list, whatever subset a run plays
assert.equal(pacingSeed(maps, 'c', 5), 21000 + 2 * 1000 + 5);
assert.equal(pacingSeed(['a', 'b', 'c', 'd'], 'c', 5), pacingSeed(maps, 'c', 5));
assert.throws(() => pacingSeed(maps, 'z', 0), /unknown map/);

// the floor as a rate: one match inside 90 s in the core's 132 and in the tail's 264 (0.38 %), two in 400 (0.5 %)
assert.equal(sub90Allowed(132), 1);
assert.equal(sub90Allowed(264), 1);
assert.equal(sub90Allowed(400), 2);
assert.equal(sub120Allowed(132), 7);
assert.equal(sub120Allowed(264), 13);

/** `count` matches at 200 s, with the given fast times replacing the first ones. */
function run(count, fast = []) {
  return Array.from({ length: count }, (_, index) => ({
    mapId: 'm', seed: 21000 + index, timeS: index < fast.length ? fast[index] : 200, result: 'elimination',
  }));
}
const allOk = (matches, baseline = null) => pacingVerdicts(pacingStats(matches), baseline).every((verdict) => verdict.ok);
assert.ok(allOk(run(264, [87.9])), 'one match inside 90 s of 264 passes');
assert.ok(!allOk(run(264, [56.2, 87.9])), 'two of 264 fail the 0.5 % rate');
assert.ok(allOk(run(132, [87.9])), 'the core run allows one');
assert.ok(!allOk(run(132, [80, 85])), 'and not two');
// against the PR head on the same matches: no worse a share inside 90 s
assert.ok(allOk(run(264, [87.9]), pacingStats(run(264, [56.2]))), 'one against the head\'s one passes');
assert.ok(!allOk(run(264, [87.9]), pacingStats(run(264))), 'one against the head\'s none fails');
// the rest of the gate
assert.ok(!allOk(run(132).map((match) => ({ ...match, timeS: 170 }))), 'a median under 180 s fails');
assert.ok(!allOk(run(132, Array(14).fill(110))), 'p10 under 120 s fails');
const timeouts = run(132).map((match, index) => (index < 17 ? { ...match, timeS: 900, result: 'time_limit' } : match));
assert.ok(!allOk(timeouts), 'more than 12.5 % at the cap fails');
assert.equal(pacingVerdicts(pacingStats(run(132))).length, 5, 'five verdicts without a baseline');
assert.equal(pacingVerdicts(pacingStats(run(132)), pacingStats(run(132))).length, 6, 'six with one');

// shard reports merge into the full run, or fail closed
const report = (shardMaps, samples = 2) => ({
  samples, matches: shardMaps.flatMap((mapId) => Array.from({ length: samples }, (_, sample) => (
    { mapId, seed: pacingSeed(maps, mapId, sample), sample, timeS: 200, result: 'elimination' }))),
});
assert.equal(mergeShardReports([report(['a', 'c']), report(['b'])], maps).length, 6);
assert.throws(() => mergeShardReports([report(['a', 'b']), report(['b', 'c'])], maps), /two shards/);
assert.throws(() => mergeShardReports([report(['a', 'b'])], maps), /no shard played c/);
assert.throws(() => mergeShardReports([report(['a', 'b']), report(['c'], 1)], maps), /different sample counts/);
console.log('pacing-tail.selftest: seeds keyed to the full map list, the floor as a rate, the head comparison, the shard merge');
