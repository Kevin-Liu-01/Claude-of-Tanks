// The battlePacing core run in shards (test-speed R9a, 2026-10-16): the partition, the report check, the merge and the
// run directory's hand-over from the eight shard receipts to the judge, on fixtures (no simulation). The shards and the
// judge themselves are server/battlePacingShard<n>.selftest.mjs and server/battlePacing.selftest.mjs.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAP_IDS } from '../src/world/maps/mapIds.ts';
import { mergeShardReports, PACING_SAMPLES, PACING_SHARDS, pacingMapLine, pacingRunOrder, pacingSeed, pacingShardMaps,
  pacingShardReportProblem } from './battlePacing.test-support.mjs';
import { collectPacingShardReports, markPacingShardStarted, PACING_ROOT, writePacingShardReport } from './battlePacingRun.test-support.mjs';

const SAMPLES = PACING_SAMPLES.core;
const shards = Array.from({ length: PACING_SHARDS }, (_, index) => index + 1);

// the partition: every map in exactly one shard, the shares tools/pacing-tail.mjs --shards=8 prints
const shares = shards.map((shard) => pacingShardMaps(MAP_IDS, shard));
assert.deepEqual(shares.flat().sort(), [...MAP_IDS].sort(), 'the eight shards play every map');
assert.equal(new Set(shares.flat()).size, MAP_IDS.length, 'and each map once');
assert.deepEqual(shares.map((share) => share.length), [5, 4, 4, 4, 4, 4, 4, 4], '33 maps over eight shards');
for (const [index, share] of shares.entries()) {
  assert.deepEqual(share, MAP_IDS.filter((_id, mapIndex) => mapIndex % PACING_SHARDS === index), 'pacing-tail\'s round-robin');
}
assert.throws(() => pacingShardMaps(MAP_IDS, 0), /no shard 0 of 8/);
assert.throws(() => pacingShardMaps(MAP_IDS, 9), /no shard 9 of 8/);

/** Shard `shard`'s report as runPacingShard writes it; `timeOf(mapId, sample)` gives each match's length. */
const report = (shard, timeOf = () => 200, extra = {}) => {
  const maps = pacingShardMaps(MAP_IDS, shard);
  return { mode: 'core', shard, count: PACING_SHARDS, samples: SAMPLES, maps, root: PACING_ROOT, ...extra,
    matches: maps.flatMap((mapId) => Array.from({ length: SAMPLES }, (_, sample) => ({
      mapId, seed: pacingSeed(MAP_IDS, mapId, sample), sample, timeS: timeOf(mapId, sample), result: 'elimination',
      roster: ['m1a1_abrams_hc'] }))) };
};
const check = (value, shard = 3) => pacingShardReportProblem(value, { mapIds: MAP_IDS, shard, samples: SAMPLES, root: PACING_ROOT });

// a report stands for its shard only when it is exactly that shard's matches, on this tree
assert.equal(check(report(3)), null);
assert.match(check(report(4)), /shard 4 of 8, not 3 of 8/);
assert.match(check(report(3, undefined, { root: '/elsewhere' })), /played on \/elsewhere/);
assert.match(check(report(3, undefined, { mode: 'tail' })), /mode tail/);
assert.match(check(report(3, undefined, { samples: 8 })), /8 samples a map/);
assert.match(check(report(3, undefined, { count: 4 })), /shard 3 of 4/);
const short = report(3); short.matches.pop();
assert.match(check(short), /15 matches, not 16/);
const reseeded = report(3); reseeded.matches[5].seed += 1;
assert.match(check(reseeded), /played seed/);
const swapped = report(3); [swapped.matches[0], swapped.matches[1]] = [swapped.matches[1], swapped.matches[0]];
assert.match(check(swapped), /match 0 is/);
const untimed = report(3); untimed.matches[2].timeS = Number.NaN;
assert.match(check(untimed), /no time or result/);
const remapped = report(3); remapped.maps = [...remapped.maps].reverse();
assert.match(check(remapped), /maps /);
assert.equal(check(null), 'no report');

// the merge: the eight shards are the 132, in the one-thread run's order, and the log lines are the old receipt's
const merged = pacingRunOrder(MAP_IDS, mergeShardReports(shards.map((shard) => report(shard, (mapId, sample) => 150 + sample)), MAP_IDS));
assert.equal(merged.length, MAP_IDS.length * SAMPLES);
assert.deepEqual(merged.map((match) => `${match.mapId}/${match.sample}`),
  MAP_IDS.flatMap((mapId) => Array.from({ length: SAMPLES }, (_, sample) => `${mapId}/${sample}`)), 'MAP_IDS order, then sample order');
assert.equal(pacingMapLine('verdant', merged, SAMPLES), 'verdant: 150/151/152/153s timeouts=0/4');
assert.equal(pacingMapLine('moon', [...merged].reverse().map((match) => (match.mapId === 'moon' && match.sample === 2
  ? { ...match, timeS: 900, result: 'time_limit' } : match)), SAMPLES), 'moon: 150/151/900/153s timeouts=1/4',
'sample order whatever the records\' order; a time-limit result counts as a timeout');
assert.throws(() => mergeShardReports(shards.slice(1).map((shard) => report(shard)), MAP_IDS), /no shard played verdant/,
  'a missing shard fails the merge closed');
assert.throws(() => mergeShardReports([...shards, 2].map((shard) => report(shard)), MAP_IDS), /in two shards/);

// the hand-over through the run directory (a fake clock, sleep and pid table)
const dir = mkdtempSync(join(tmpdir(), 'cot-battle-pacing-run-'));
try {
  const clock = { t: 0 };
  const sleeps = [];
  const live = new Set();
  const collect = (options = {}) => collectPacingShardReports(dir, {
    now: () => clock.t, sleep: async (ms) => { sleeps.push(ms); clock.t += ms; options.onSleep?.(); },
    alive: (pid) => live.has(pid), log: (message) => logs.push(message), ...options,
  });
  let logs = [];

  // nothing written, no shard started: the judge waits out the grace for a shard the pool may be starting, then plays
  let got = await collect();
  assert.equal(got.size, 0);
  assert.equal(clock.t, 10_000, 'a shard with no mark is waited for only the grace');

  // every shard wrote its records: collected at once
  for (const shard of shards) writePacingShardReport(dir, shard, report(shard));
  clock.t = 0; sleeps.length = 0;
  got = await collect();
  assert.deepEqual([...got.keys()].sort((a, b) => a - b), shards);
  assert.equal(sleeps.length, 0, 'no wait when every report is there');

  // a shard still running (a live mark on this tree) is waited for until its records land
  const fresh = mkdtempSync(join(tmpdir(), 'cot-battle-pacing-run-'));
  try {
    for (const shard of shards.filter((shard) => shard !== 3)) writePacingShardReport(fresh, shard, report(shard));
    markPacingShardStarted(fresh, 3, { pid: 4242 });
    live.add(4242);
    clock.t = 0; sleeps.length = 0;
    got = await collectPacingShardReports(fresh, {
      now: () => clock.t, alive: (pid) => live.has(pid), log: () => {},
      sleep: async (ms) => { clock.t += ms; sleeps.push(ms); if (sleeps.length === 30) writePacingShardReport(fresh, 3, report(3)); },
    });
    assert.equal(got.size, 8, 'the running shard\'s records are merged');
    assert.equal(sleeps.length, 30, 'after waiting for it, well past the grace');

    // a shard that died without records (a failed assertion) is not waited for: the judge plays its share
    markPacingShardStarted(fresh, 5, { pid: 5151 });
    rmSync(join(fresh, 'battle-pacing', 'shard-5.json'));
    clock.t = 0; sleeps.length = 0;
    got = await collectPacingShardReports(fresh, { now: () => clock.t, alive: () => false, log: () => {},
      sleep: async (ms) => { clock.t += ms; sleeps.push(ms); } });
    assert.equal(got.size, 7);
    assert.ok(!got.has(5));
    assert.equal(sleeps.length, 0, 'a dead mark is not waited for');

    // a live mark from another tree is not this run's shard
    markPacingShardStarted(fresh, 5, { pid: 4242, root: '/another/tree' });
    clock.t = 0;
    got = await collectPacingShardReports(fresh, { now: () => clock.t, alive: () => true, log: () => {},
      sleep: async (ms) => { clock.t += ms; } });
    assert.equal(got.size, 7);
    assert.equal(clock.t, 0);

    // a shard that never finishes is waited for at most maxWaitMs
    markPacingShardStarted(fresh, 5, { pid: 4242 });
    clock.t = 0; logs = [];
    got = await collectPacingShardReports(fresh, { now: () => clock.t, alive: () => true, log: (message) => logs.push(message),
      maxWaitMs: 60_000, sleep: async (ms) => { clock.t += ms; } });
    assert.equal(got.size, 7);
    assert.equal(clock.t, 60_000);
    assert.match(logs.join('\n'), /stopped waiting for 1 shard/);
  } finally { rmSync(fresh, { recursive: true, force: true }); }

  // records that do not stand for this run (another tree's, a stale shard count) are refused, named and replayed
  writePacingShardReport(dir, 2, report(2, undefined, { root: '/another/tree' }));
  writePacingShardReport(dir, 6, report(6, undefined, { count: 4 }));
  clock.t = 0; logs = [];
  got = await collect();
  assert.equal(got.size, 6);
  assert.ok(!got.has(2) && !got.has(6));
  assert.match(logs.join('\n'), /shard 2's records do not stand for this run \(played on \/another\/tree/);
  assert.match(logs.join('\n'), /shard 6's records do not stand for this run \(shard 6 of 4/);
} finally { rmSync(dir, { recursive: true, force: true }); }

console.log(`battlePacingRun.selftest: ${PACING_SHARDS} shards cover the ${MAP_IDS.length} maps once; a report stands for its shard `
  + 'only on this tree at its seeds; the merge is the one-thread run; the judge waits for running shards and replays the rest');
