// The battlePacing core run in shards (test-speed R9a, 2026-10-16): how the eight shard receipts and the judge,
// server/battlePacing.selftest.mjs, share the 132 matches inside one run. No simulation is imported here.
//
// The run's directory is COT_SELFTEST_RUN_DIR: tools/run-selftests.mjs makes a fresh one for each invocation, and a
// gate that runs the receipts with its own pool exports one fresh directory for that pool (docs/DEVELOPMENT.md, "The
// pacing tail"). Records never outlive their run, so nothing here is a cache: every share is played in every run, by
// exactly one process, and the judge reads only what this run wrote on this tree (each tree has its own subdirectory).
// - A share is played by whoever claims it first. A claim names its pid, and it is created atomically (link), so no
//   two live processes hold one. The claim of a process that died (a shard that failed earlier in this run) is taken
//   over.
// - A shard receipt claims its own share, plays its maps on one thread with every per-match assertion and writes the
//   records (atomically, so a reader sees all of them or none). If the share already has records from this run, or
//   the judge holds its claim, the shard has nothing to play: the judge receipt plays and judges those matches.
// - The judge takes every share's records, waits while a live process holds a share's claim, gives an unclaimed share
//   a short grace (a pool may start a shard a moment after the judge), then claims and plays whatever is left. The
//   runner admits the judge last, so in `npm test` it only merges; a pool that orders receipts otherwise (longest
//   first by an old run time) still plays each share once.
import { createHash } from 'node:crypto';
import { linkSync, mkdirSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAP_IDS } from '../src/world/maps/mapIds.ts';
import { PACING_SAMPLES, PACING_SHARDS, pacingShardMaps, pacingShardReportProblem, pacingStats } from './battlePacing.test-support.mjs';

/** The tree the records were played on (a gate may run a baseline tree beside the candidate). */
export const PACING_ROOT = realpathSync(fileURLToPath(new URL('..', import.meta.url)));

/** This tree's directory for the battlePacing records inside the run's directory `dir`. */
export function pacingRunDirectory(dir, root = PACING_ROOT) {
  return join(dir, 'battle-pacing', createHash('sha256').update(root).digest('hex').slice(0, 16));
}

const shardFile = (dir, shard, suffix, root = PACING_ROOT) => join(pacingRunDirectory(dir, root), `shard-${shard}.${suffix}`);
const temporaryOf = (path) => `${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;

function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = temporaryOf(path);
  writeFileSync(temporary, JSON.stringify(value));
  renameSync(temporary, path);
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

const pidAlive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
};
const pause = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/** Who holds share `shard`'s claim in `dir` ({ pid, by, at }), or null. */
export function pacingShareHolder(dir, shard, { root = PACING_ROOT } = {}) {
  return readJson(shardFile(dir, shard, 'claim', root));
}

/**
 * Claims share `shard` in `dir` for process `pid`: true when `pid` now holds it. A share nobody claimed is created
 * atomically (a complete file is linked into place, so a reader never sees a half-written claim and two creators
 * cannot both win). A claim whose holder is dead is taken over: two processes taking over the same dead claim at once
 * may both play the share, which writes the same records twice and costs time, nothing else.
 */
export function claimPacingShare(dir, shard, { pid = process.pid, by, alive = pidAlive, root = PACING_ROOT } = {}) {
  const path = shardFile(dir, shard, 'claim', root);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = temporaryOf(path);
  writeFileSync(temporary, JSON.stringify({ pid, by, at: new Date().toISOString() }));
  try {
    linkSync(temporary, path);
    unlinkSync(temporary);
    return true;
  } catch (error) {
    if (error.code !== 'EEXIST') { unlinkSync(temporary); throw error; }
  }
  const holder = readJson(path);
  if (holder?.pid !== pid && alive(holder?.pid)) { unlinkSync(temporary); return false; }
  renameSync(temporary, path);
  return readJson(path)?.pid === pid;
}

/** Writes shard `shard`'s report into `dir`. */
export function writePacingShardReport(dir, shard, report, { root = PACING_ROOT } = {}) {
  writeJsonAtomic(shardFile(dir, shard, 'json', root), report);
}

/** Shard `shard`'s report in `dir` when it stands for that shard in this run (null otherwise), and why not. */
export function readPacingShardReport(dir, shard, { count = PACING_SHARDS, samples = PACING_SAMPLES.core, mapIds = MAP_IDS,
  root = PACING_ROOT } = {}) {
  const report = readJson(shardFile(dir, shard, 'json', root));
  if (!report) return { report: null, problem: null };
  const problem = pacingShardReportProblem(report, { mapIds, shard, count, samples, root });
  return problem ? { report: null, problem } : { report, problem: null };
}

/**
 * Every share's records for this run: { reports: Map shard -> report, playedHere: the shards played here }. A share
 * with valid records is taken as it is; a share whose claim a live process holds is waited for (that process is
 * playing it in this run; a pool's timeout bounds a hung one, whose claim then dies); an unclaimed share waits out
 * `graceMs` from the start; any other share (no claim, a dead holder's, refused records) is claimed and played here by
 * `playShare(shard)`, at most `players` at a time, and its report written for the shards. A failure of `playShare` (an
 * assertion inside a match) fails the whole call once the shares in flight settle.
 */
export async function gatherPacingShares(dir, {
  playShare, players = 1,
  shards = Array.from({ length: PACING_SHARDS }, (_, index) => index + 1),
  count = PACING_SHARDS, samples = PACING_SAMPLES.core, mapIds = MAP_IDS, root = PACING_ROOT, pid = process.pid,
  alive = pidAlive, sleep = pause, now = () => Date.now(), graceMs = 10_000, pollMs = 1_000, log = () => {},
} = {}) {
  const reports = new Map(), playing = new Map(), refused = new Set(), playedHere = [];
  const started = now();
  let failure = null;
  for (;;) {
    if (failure) {
      await Promise.allSettled([...playing.values()]);
      throw failure;
    }
    let waiting = 0;
    for (const shard of shards) {
      if (reports.has(shard) || playing.has(shard)) continue;
      const { report, problem } = readPacingShardReport(dir, shard, { count, samples, mapIds, root });
      if (report) { reports.set(shard, report); continue; }
      if (problem && !refused.has(shard)) {
        refused.add(shard);
        log(`shard ${shard}'s records do not stand for this run (${problem}); its share plays again`);
      }
      // an unclaimed share waits out the grace; a claim a live process holds is refused (the share is waited for)
      if (!pacingShareHolder(dir, shard, { root }) && now() - started < graceMs) { waiting++; continue; }
      if (playing.size >= players || !claimPacingShare(dir, shard, { pid, by: 'battlePacing', alive, root })) {
        waiting++;
        continue;
      }
      // the holder may have written its records and exited between the read above and the claim
      const landed = readPacingShardReport(dir, shard, { count, samples, mapIds, root }).report;
      if (landed) { reports.set(shard, landed); continue; }
      playedHere.push(shard);
      playing.set(shard, (async () => {
        try {
          const played = await playShare(shard);
          const playedProblem = pacingShardReportProblem(played, { mapIds, shard, count, samples, root });
          if (playedProblem) throw new Error(`battlePacing: the share of shard ${shard} played here is not its share (${playedProblem})`);
          writePacingShardReport(dir, shard, played, { root });
          reports.set(shard, played);
        } catch (error) {
          failure ??= error;
        } finally {
          playing.delete(shard);
        }
      })());
    }
    if (failure) continue;
    if (!waiting && !playing.size) break;
    await Promise.race([sleep(pollMs), ...playing.values()]);
  }
  return { reports, playedHere };
}

/** Shard `shard`'s report of `matches` played on `maps` by `by`, as the judge reads it. */
export function pacingShardReport(shard, maps, matches, by, { samples = PACING_SAMPLES.core, root = PACING_ROOT } = {}) {
  return { mode: 'core', shard, count: PACING_SHARDS, samples, maps, matches, root, by };
}

/**
 * One shard receipt (server/battlePacingShard<n>.selftest.mjs): with a run directory, claims its share, plays its maps'
 * core matches on this thread (every per-match assertion included) and writes the records for the judge; a share
 * already played in this run, or claimed by the live judge, is left to the judge, which plays and judges it. Without a
 * run directory the shard plays its share and the judge, which has no records, plays it again. `loadPlay` imports
 * server/battlePacingPlay.test-support.mjs; the shard passes it, so this module (and its fixture receipt) stays free of
 * the simulation, and the share is claimed before the simulation loads.
 */
export async function runPacingShard(shard, dir, loadPlay, { log = console.log, pid = process.pid, alive = pidAlive } = {}) {
  const name = `battlePacingShard${shard}`;
  const maps = pacingShardMaps(MAP_IDS, shard);
  const samples = PACING_SAMPLES.core;
  if (dir) {
    if (!claimPacingShare(dir, shard, { pid, by: name, alive })) {
      const holder = pacingShareHolder(dir, shard);
      log(`${name}: ${holder?.by ?? 'another process'} (pid ${holder?.pid}) is playing ${maps.join(', ')} in this run and judges them`);
      return { played: false };
    }
    // read after the claim: a holder that wrote this share's records and exited has left a claim this shard just took
    const { report } = readPacingShardReport(dir, shard);
    if (report) {
      log(`${name}: ${maps.join(', ')} already played in this run (by ${report.by}); server/battlePacing.selftest.mjs judges them`);
      return { played: false };
    }
  }
  const { playPacingMaps } = await loadPlay();
  const { matches } = await playPacingMaps(maps, samples, (line) => log(line));
  if (dir) writePacingShardReport(dir, shard, pacingShardReport(shard, maps, matches, name));
  const stats = pacingStats(matches);
  for (const entry of stats.fast) log(`${name}: fast match ${entry.mapId} seed ${entry.seed} ${entry.timeS.toFixed(0)} s`);
  log(`${name}: ${maps.length} maps x ${samples} (${maps.join(', ')}) resolve by the cap; `
    + (dir ? `records for server/battlePacing.selftest.mjs in ${pacingRunDirectory(dir)}`
      : 'no run directory (COT_SELFTEST_RUN_DIR), so the judge plays this share itself'));
  return { played: true, matches };
}
