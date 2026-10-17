// The battlePacing core run in shards (test-speed R9a, 2026-10-16): how the eight shard receipts hand their records to
// the judge, server/battlePacing.selftest.mjs, inside one run. No simulation is imported until a shard plays.
//
// The run's directory is COT_SELFTEST_RUN_DIR: tools/run-selftests.mjs makes a fresh one for each invocation, and a
// gate that runs the receipts itself exports one fresh directory for its whole pool (docs/DEVELOPMENT.md, "The pacing
// tail"). Records never outlive their run, so nothing here is a cache: every shard plays in every run, and the judge
// reads only what this run's shards wrote on this tree.
// - A shard marks itself started (its pid and tree), plays its maps on one thread with every per-match assertion, and
//   writes its records (atomically, so a reader sees all of them or none).
// - The judge waits for any shard still running (a started mark whose pid is alive), reads every report that names
//   this tree, shard and seeds, plays any share it has no records of (a shard that failed, never started, ran
//   elsewhere, or no run directory at all) and judges the merged 132.
import { mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAP_IDS } from '../src/world/maps/mapIds.ts';
import { PACING_SAMPLES, PACING_SHARDS, pacingShardMaps, pacingShardReportProblem, pacingStats } from './battlePacing.test-support.mjs';

/** The tree the records were played on (a gate may run a baseline tree beside the candidate). */
export const PACING_ROOT = realpathSync(fileURLToPath(new URL('..', import.meta.url)));

const shardFile = (dir, shard, suffix) => join(dir, 'battle-pacing', `shard-${shard}.${suffix}`);

function writeJsonAtomic(path, value) {
  mkdirSync(join(path, '..'), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(value));
  renameSync(temporary, path);
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

/** Marks shard `shard` started in `dir` (its pid and tree), so a judge waits for its records. */
export function markPacingShardStarted(dir, shard, { pid = process.pid, root = PACING_ROOT } = {}) {
  writeJsonAtomic(shardFile(dir, shard, 'started'), { pid, root, startedAt: new Date().toISOString() });
}

/** Writes shard `shard`'s report into `dir`. */
export function writePacingShardReport(dir, shard, report) {
  writeJsonAtomic(shardFile(dir, shard, 'json'), report);
}

const pidAlive = (pid) => {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
};
const pause = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * The reports of `shards` in `dir` that stand for their shards in this run: Map shard -> report. Waits while a shard
 * without a report is still running (its started mark names this tree and its pid is alive), and for `graceMs` for a
 * shard with no mark yet (a pool may start the judge a moment after a shard). Any other shard is left to the caller.
 */
export async function collectPacingShardReports(dir, {
  shards = Array.from({ length: PACING_SHARDS }, (_, index) => index + 1),
  count = PACING_SHARDS, samples = PACING_SAMPLES.core, mapIds = MAP_IDS, root = PACING_ROOT,
  alive = pidAlive, sleep = pause, now = () => Date.now(), graceMs = 10_000, pollMs = 1_000, maxWaitMs = 45 * 60_000,
  log = () => {},
} = {}) {
  const reports = new Map(), refused = new Set();
  const started = now();
  for (;;) {
    let waiting = 0;
    for (const shard of shards) {
      if (reports.has(shard) || refused.has(shard)) continue;
      const report = readJson(shardFile(dir, shard, 'json'));
      if (report) {
        const problem = pacingShardReportProblem(report, { mapIds, shard, count, samples, root });
        if (problem) { refused.add(shard); log(`shard ${shard}'s records do not stand for this run (${problem})`); }
        else reports.set(shard, report);
        continue;
      }
      const mark = readJson(shardFile(dir, shard, 'started'));
      if (mark ? mark.root === root && alive(mark.pid) : now() - started < graceMs) waiting++;
    }
    if (!waiting) break;
    if (now() - started >= maxWaitMs) { log(`stopped waiting for ${waiting} shard(s) after ${Math.round(maxWaitMs / 60_000)} min`); break; }
    await sleep(pollMs);
  }
  return reports;
}

/**
 * One shard receipt (server/battlePacingShard<n>.selftest.mjs): plays its maps' core matches on this thread, every
 * per-match assertion included, and with a run directory writes its records for the judge.
 */
export async function runPacingShard(shard, dir) {
  if (dir) markPacingShardStarted(dir, shard);
  const maps = pacingShardMaps(MAP_IDS, shard);
  const samples = PACING_SAMPLES.core;
  const { playPacingMaps } = await import('./battlePacingPlay.test-support.mjs');
  const { matches } = await playPacingMaps(maps, samples, (line) => console.log(line));
  if (dir) writePacingShardReport(dir, shard, { mode: 'core', shard, count: PACING_SHARDS, samples, maps, matches, root: PACING_ROOT });
  const stats = pacingStats(matches);
  for (const entry of stats.fast) console.log(`battlePacingShard${shard}: fast match ${entry.mapId} seed ${entry.seed} ${entry.timeS.toFixed(0)} s`);
  console.log(`battlePacingShard${shard}: ${maps.length} maps x ${samples} (${maps.join(', ')}) resolve by the cap; `
    + (dir ? `records for server/battlePacing.selftest.mjs in ${dir}` : 'no run directory (COT_SELFTEST_RUN_DIR), so the judge plays this share itself'));
}

