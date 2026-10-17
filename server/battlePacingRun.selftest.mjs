// The battlePacing core run in shards (test-speed R9a, 2026-10-16): the partition, the report check, the merge, the
// claims that give each share to exactly one process, and the run directory's hand-over from the eight shard receipts
// to the judge, on fixtures (no simulation). The shards and the judge themselves are
// server/battlePacingShard<n>.selftest.mjs and server/battlePacing.selftest.mjs.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAP_IDS } from '../src/world/maps/mapIds.ts';
import { mergeShardReports, PACING_SAMPLES, PACING_SHARDS, pacingMapLine, pacingRunOrder, pacingSeed, pacingShardMaps,
  pacingShardReportProblem } from './battlePacing.test-support.mjs';
import { claimPacingShare, gatherPacingShares, PACING_ROOT, pacingRunDirectory, pacingShareHolder, pacingShardReport,
  readPacingShardReport, releasePacingShare, runPacingShard, writePacingShardReport } from './battlePacingRun.test-support.mjs';

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

// the claims: one live holder per share, created whole; a dead holder's claim is taken over
const claims = mkdtempSync(join(tmpdir(), 'cot-battle-pacing-claim-'));
try {
  const live = new Set([100, 200]);
  const alive = (pid) => live.has(pid);
  assert.notEqual(pacingRunDirectory(claims), pacingRunDirectory(claims, '/another/tree'), 'each tree has its own records');
  assert.equal(pacingShareHolder(claims, 1), null);
  assert.equal(claimPacingShare(claims, 1, { pid: 100, by: 'battlePacingShard1', alive }), true, 'the first claim wins');
  assert.deepEqual({ ...pacingShareHolder(claims, 1), at: 0 }, { pid: 100, by: 'battlePacingShard1', at: 0 });
  assert.equal(claimPacingShare(claims, 1, { pid: 200, by: 'battlePacing', alive }), false, 'a live holder keeps it');
  assert.equal(pacingShareHolder(claims, 1).pid, 100);
  assert.equal(claimPacingShare(claims, 1, { pid: 100, alive }), true, 'its holder may claim it again');
  live.delete(100);
  assert.equal(claimPacingShare(claims, 1, { pid: 200, by: 'battlePacing', alive }), true, 'a dead holder\'s claim is taken over');
  assert.equal(pacingShareHolder(claims, 1).pid, 200);
  assert.equal(claimPacingShare(claims, 2, { pid: 100, alive, root: '/another/tree' }), true);
  assert.equal(claimPacingShare(claims, 2, { pid: 200, alive }), true, 'another tree\'s claim is not this tree\'s');
  const leftovers = readFileSync(join(pacingRunDirectory(claims), 'shard-1.claim'), 'utf8');
  assert.equal(JSON.parse(leftovers).pid, 200, 'a claim file is always whole JSON');
} finally { rmSync(claims, { recursive: true, force: true }); }

// the gather (a fake clock, sleep and pid table; `playShare` plays a fixture share and counts what is in flight)
const JUDGE = 7000;
function harness(dir, { live = new Set(), players = 2, onSleep = () => {}, onAlive = () => {}, timeOf, fail = null, wrong = null,
  ...rest } = {}) {
  const clock = { t: 0 }, sleeps = [], played = [], logs = [], playedAt = [];
  let inFlight = 0, maxInFlight = 0;
  const run = gatherPacingShares(dir, {
    pid: JUDGE, players, alive: (pid) => { onAlive(pid); return pid === JUDGE || live.has(pid); }, now: () => clock.t,
    log: (message) => logs.push(message),
    // a turn of the event loop, as a real timer gives, so a share in flight can settle
    sleep: async (ms) => { sleeps.push(ms); clock.t += ms; onSleep(sleeps.length); await new Promise((resolve) => { setImmediate(resolve); }); },
    playShare: async (shard) => {
      played.push(shard); playedAt.push(clock.t); inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => { setImmediate(resolve); });
      inFlight--;
      if (shard === fail) throw new Error(`fixture: a match on shard ${shard} failed its assertion`);
      const own = report(shard === wrong ? (shard % PACING_SHARDS) + 1 : shard, timeOf);
      return pacingShardReport(shard, own.maps, own.matches, 'battlePacing');
    },
    ...rest,
  });
  return { run, clock, sleeps, played, playedAt, logs, max: () => maxInFlight };
}
const fresh = () => mkdtempSync(join(tmpdir(), 'cot-battle-pacing-run-'));
const dirs = [];
const newDir = () => { const dir = fresh(); dirs.push(dir); return dir; };
try {
  // nothing written, nothing claimed: the judge waits out the grace for a shard the pool may be starting, then claims
  // and plays every share, `players` at a time, and writes the records (a shard started later finds them)
  let dir = newDir();
  let h = harness(dir);
  let { reports, playedHere } = await h.run;
  assert.equal(reports.size, 8);
  assert.deepEqual([...playedHere].sort((a, b) => a - b), shards);
  assert.equal(Math.min(...h.playedAt), 10_000, 'an unclaimed share is waited for the grace, then played');
  assert.equal(h.max(), 2, 'at most `players` shares in flight');
  for (const shard of shards) {
    assert.equal(readPacingShardReport(dir, shard).report?.by, 'battlePacing', `shard ${shard}'s records written for the shards`);
    assert.equal(pacingShareHolder(dir, shard).pid, JUDGE);
  }

  // every shard wrote its records: taken at once, nothing played
  dir = newDir();
  for (const shard of shards) writePacingShardReport(dir, shard, report(shard));
  h = harness(dir);
  ({ reports, playedHere } = await h.run);
  assert.equal(reports.size, 8);
  assert.deepEqual(playedHere, []);
  assert.equal(h.sleeps.length, 0, 'no wait when every report is there');

  // a share a live shard holds is waited for until its records land, well past the grace, and never played here
  dir = newDir();
  for (const shard of shards.filter((shard) => shard !== 3)) writePacingShardReport(dir, shard, report(shard));
  claimPacingShare(dir, 3, { pid: 4242, by: 'battlePacingShard3' });
  h = harness(dir, { live: new Set([4242]), onSleep: (n) => { if (n === 30) writePacingShardReport(dir, 3, report(3)); } });
  ({ reports, playedHere } = await h.run);
  assert.equal(reports.size, 8);
  assert.deepEqual(playedHere, [], 'the running shard\'s records are merged');
  assert.equal(h.sleeps.length, 30);

  // a shard that died without records (a failed assertion) is not waited for: its share is taken over and played
  dir = newDir();
  for (const shard of shards.filter((shard) => shard !== 5)) writePacingShardReport(dir, shard, report(shard));
  claimPacingShare(dir, 5, { pid: 5151, by: 'battlePacingShard5' });
  h = harness(dir);
  ({ reports, playedHere } = await h.run);
  assert.deepEqual(playedHere, [5]);
  assert.deepEqual(h.playedAt, [0], 'a dead holder is not waited for');
  assert.equal(reports.get(5).by, 'battlePacing');

  // a holder that writes its records and exits between the judge's read and its claim: the records are taken, not replayed
  dir = newDir();
  for (const shard of shards.filter((shard) => shard !== 6)) writePacingShardReport(dir, shard, report(shard));
  claimPacingShare(dir, 6, { pid: 6161, by: 'battlePacingShard6' });
  h = harness(dir, { onAlive: (pid) => { if (pid === 6161) writePacingShardReport(dir, 6, report(6)); } });
  ({ reports, playedHere } = await h.run);
  assert.equal(reports.size, 8);
  assert.deepEqual(playedHere, [], 'records that land during the claim are merged');
  assert.equal(reports.get(6).by, undefined, 'the shard\'s own records');

  // records that do not stand for this run (a stale shard count, a reseeded match) are refused, named and played again
  dir = newDir();
  for (const shard of shards) writePacingShardReport(dir, shard, report(shard));
  writePacingShardReport(dir, 2, report(2, undefined, { count: 4 }));
  const tampered = report(6); tampered.matches[0].seed += 1;
  writePacingShardReport(dir, 6, tampered);
  h = harness(dir);
  ({ reports, playedHere } = await h.run);
  assert.deepEqual([...playedHere].sort(), [2, 6]);
  assert.match(h.logs.join('\n'), /shard 2's records do not stand for this run \(shard 2 of 4/);
  assert.match(h.logs.join('\n'), /shard 6's records do not stand for this run \(.*played seed/);
  assert.equal(readPacingShardReport(dir, 6).report?.by, 'battlePacing', 'the refused records are replaced');

  // a live holder is waited for however long it plays; once it dies without records (a pool's timeout killed it),
  // its share is taken over at the next poll
  dir = newDir();
  for (const shard of shards.filter((shard) => shard !== 4)) writePacingShardReport(dir, shard, report(shard));
  claimPacingShare(dir, 4, { pid: 4444, by: 'battlePacingShard4' });
  const holding = new Set([4444]);
  h = harness(dir, { live: holding, pollMs: 30_000, onSleep: (n) => { if (n === 120) holding.delete(4444); } });
  ({ reports, playedHere } = await h.run);
  assert.deepEqual(playedHere, [4]);
  assert.deepEqual(h.playedAt, [3_600_000], 'an hour of polls, then played the moment its holder died');

  // a match that fails its assertion in a share played here fails the judge; so does a share that is not its share
  dir = newDir();
  h = harness(dir, { fail: 3, graceMs: 0 });
  await assert.rejects(h.run, /a match on shard 3 failed its assertion/);
  dir = newDir();
  h = harness(dir, { wrong: 7, graceMs: 0 });
  await assert.rejects(h.run, /the share of shard 7 played here is not its share/);

  // the shard receipt: claims its share and plays it once; leaves a share already played, or the live judge's, alone
  const fakePlay = () => {
    let calls = 0;
    const load = async () => ({ playPacingMaps: async (maps, samples) => {
      calls++;
      return { matches: maps.flatMap((mapId) => Array.from({ length: samples }, (_, sample) => ({
        mapId, seed: pacingSeed(MAP_IDS, mapId, sample), sample, timeS: 250, result: 'elimination', roster: [] }))), lines: [] };
    } });
    return { load, calls: () => calls };
  };
  const quiet = () => {};
  dir = newDir();
  let play = fakePlay();
  let ran = await runPacingShard(3, dir, play.load, { log: quiet, pid: 3333, alive: () => false });
  assert.equal(ran.played, true);
  assert.equal(play.calls(), 1);
  assert.equal(readPacingShardReport(dir, 3).report?.by, 'battlePacingShard3', 'its records stand for its share');
  assert.equal(pacingShareHolder(dir, 3).pid, 3333);
  play = fakePlay();
  ran = await runPacingShard(3, dir, play.load, { log: quiet, pid: 3334, alive: () => false });
  assert.deepEqual([ran.played, play.calls()], [false, 0], 'a share already played in this run is not played again');
  claimPacingShare(dir, 4, { pid: JUDGE, by: 'battlePacing' });
  play = fakePlay();
  ran = await runPacingShard(4, dir, play.load, { log: quiet, pid: 4000, alive: (pid) => pid === JUDGE });
  assert.deepEqual([ran.played, play.calls()], [false, 0], 'the live judge is playing it');
  play = fakePlay();
  ran = await runPacingShard(4, dir, play.load, { log: quiet, pid: 4001, alive: () => false });
  assert.deepEqual([ran.played, play.calls()], [true, 1], 'a dead holder\'s share is played');
  // the judge writes this share's records and exits between the shard's read and its claim: nothing to play
  claimPacingShare(dir, 6, { pid: JUDGE, by: 'battlePacing' });
  play = fakePlay();
  ran = await runPacingShard(6, dir, play.load, { log: quiet, pid: 6000,
    alive: (pid) => { if (pid === JUDGE) writePacingShardReport(dir, 6, report(6)); return false; } });
  assert.deepEqual([ran.played, play.calls()], [false, 0], 'records that land during the claim are not played again');
  // a match that fails its assertion fails the shard, which first gives up its claim: the judge then plays that share at
  // once instead of trusting the dead shard's pid (the system may reuse it for a live process the judge would wait on)
  const failingPlay = async () => ({ playPacingMaps: async () => { throw new Error('fixture: blackglass/2 resolves by the cap'); } });
  await assert.rejects(runPacingShard(7, dir, failingPlay, { log: quiet, pid: 7000, alive: () => false }), /resolves by the cap/);
  assert.equal(pacingShareHolder(dir, 7), null, 'a failed shard releases its claim');
  assert.ok(!existsSync(join(pacingRunDirectory(dir), 'shard-7.json')), 'and writes no records');
  claimPacingShare(dir, 8, { pid: JUDGE, by: 'battlePacing' });
  assert.equal(releasePacingShare(dir, 8, { pid: 8000 }), false, 'only its holder releases a claim');
  assert.equal(pacingShareHolder(dir, 8).pid, JUDGE);
  assert.equal(releasePacingShare(dir, 8, { pid: JUDGE }), true);
  assert.equal(pacingShareHolder(dir, 8), null);
  assert.equal(releasePacingShare(dir, 8, { pid: JUDGE }), false, 'an unclaimed share has nothing to release');
  play = fakePlay();
  ran = await runPacingShard(5, undefined, play.load, { log: quiet });
  assert.deepEqual([ran.played, play.calls()], [true, 1], 'no run directory: the shard plays and writes nothing');
  assert.ok(!existsSync(join(pacingRunDirectory(dir), 'shard-5.json')));
  // the judge then takes the shards' records as they are and plays only the rest
  h = harness(dir, { graceMs: 0 });
  ({ reports, playedHere } = await h.run);
  assert.equal(reports.get(3).by, 'battlePacingShard3');
  assert.equal(reports.get(4).by, 'battlePacingShard4');
  assert.deepEqual([...playedHere].sort(), [1, 2, 5, 7, 8]);
} finally {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
}

console.log(`battlePacingRun.selftest: ${PACING_SHARDS} shards cover the ${MAP_IDS.length} maps once; a report stands for its shard `
  + 'only on this tree at its seeds; the merge is the one-thread run; each share is claimed by one live process; the judge '
  + 'waits for running shards and plays the rest');
