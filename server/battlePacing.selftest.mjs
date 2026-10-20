import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { isMainThread, parentPort, workerData, Worker } from 'node:worker_threads';
import { MAP_IDS } from '../src/world/maps/mapIds.ts';
import { mergeShardReports, PACING_SAMPLES, pacingMapLine, pacingRunOrder, pacingShardMaps, pacingStats,
  pacingVerdicts } from './battlePacing.test-support.mjs';
import { gatherPacingShares, pacingRunDirectory, pacingShardReport } from './battlePacingRun.test-support.mjs';

// Modes (docs/DEVELOPMENT.md, "The pacing tail"):
// - core (npm test): the 132 matches, four per map, judged by the gate below; one match may end inside 90 s. Since
//   2026-10-16 (test-speed R9a) the eight server/battlePacingShard<n>.selftest.mjs receipts play them, one thread
//   each, and write their records into the run's directory (COT_SELFTEST_RUN_DIR, a fresh one per tools/run-selftests
//   invocation or per gate pool); this receipt waits for any share a live shard is playing, merges the records (every
//   map's samples exactly once, at their seeds, on this tree) and judges them. A share nobody plays in this run (a
//   shard that failed, was skipped or has not started) is claimed and played here, so the gate always judges all 132
//   and each share is played once (server/battlePacingRun.test-support.mjs). Without a run directory, as in
//   `node server/battlePacing.selftest.mjs`, this receipt plays all 132 itself.
// - tail (COT_PACING_TAIL=1, `npm run test:pacing:tail`): the 264 matches, the 132 plus samples 4-7 on every map,
//   judged by the same gate with the owner's floor as a rate: at most 0.5 % of them inside 90 s.
// - COT_PACING_MAPS=a,b plays those maps' matches of the full run (the seeds are keyed to each map's index in MAP_IDS)
//   and reports them without the distribution gate, which a subset of the maps cannot answer.
//   COT_PACING_REPORT=<file> writes the match records: tools/pacing-tail.mjs merges a run played in shards, judges it
//   by the same gate and, given the PR head's records on the same matches, compares the share inside 90 s.
// - COT_PACING_JOBS=<n> plays the maps on n worker threads of this file (default: a quarter of the cores, 1 to 4;
//   COT_PACING_JOBS=1 plays them on the main thread). Every mode above takes it for what this receipt plays itself;
//   the core run with a run directory plays only the shares no shard claimed (none in an ordinary pool run), up to n
//   at once, one worker each (229: one thread made a judge whose shards were skipped play 132 matches in a row). The maps are dealt
//   round-robin and each worker plays its share in MAPS order; the records and the log come back in MAPS order and
//   sample order, so the report, the printed lines and the gate equal the one-thread run's. Each match is a function of
//   its seed and map alone (the shards of tools/pacing-tail.mjs rely on it too); a record that moved with the job count
//   would be a defect in the simulation, not in this receipt.
const TAIL = process.env.COT_PACING_TAIL === '1';
const SAMPLES = TAIL ? PACING_SAMPLES.tail : PACING_SAMPLES.core;
const MAPS = process.env.COT_PACING_MAPS
  ? process.env.COT_PACING_MAPS.split(',').filter((id) => MAP_IDS.includes(id))
  : MAP_IDS;
const PARTIAL = MAPS.length < MAP_IDS.length;
const RUN_DIR = process.env.COT_SELFTEST_RUN_DIR;
const JOBS = Math.floor(Number(process.env.COT_PACING_JOBS))
  || Math.max(1, Math.min(4, Math.floor(availableParallelism() / 4)));
// The unclaimed shares of the core run this receipt plays at once, each on its own worker thread when more than one. In a
// pool every shard claims its own share before the judge is admitted, so this matters when the shards did not run
// (--only on the judge, or their PASSes reused while the judge's was not): then the judge plays them JOBS at a time, as
// the one-receipt run did (229, critic r1: one thread made that 132 matches in a row).
const SHARE_PLAYERS = JOBS;
// Each worker's old-generation cap: max(2048, 1.5 x the one-thread run's peak heap). That run's whole-process max RSS,
// an upper bound on its heap, was 1,118 MB over all 33 maps (2026-10-13), and a worker plays at most 9 of them.
const WORKER_HEAP_MB = 2048;

// The matches themselves: server/battlePacingPlay.test-support.mjs (shared with the shards), imported only when this
// receipt plays some of them.
async function playMaps(maps, samples, onLine = () => {}) {
  const { playPacingMaps } = await import('./battlePacingPlay.test-support.mjs');
  return playPacingMaps(maps, samples, onLine);
}

// The share's result, or the worker's failure (an assertion's error, or an exit before the result).
function workerResult(worker) {
  return new Promise((resolve, reject) => {
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.once('exit', (code) => reject(new Error(`battlePacing: a worker exited with code ${code} before its result`)));
  });
}

// Plays `maps` (a sublist of MAPS, in MAPS order) here: their records in that order, each map's line printed (as it
// finishes on one thread; in map order after the workers).
async function playHere(maps) {
  const say = (line) => console.log(line);
  if (JOBS <= 1 || maps.length < 2) return (await playMaps(maps, SAMPLES, say)).matches;
  // maps[i] goes to share i % n as its floor(i / n)-th map.
  const shares = Array.from({ length: Math.min(JOBS, maps.length) }, () => []);
  maps.forEach((mapId, index) => shares[index % shares.length].push(mapId));
  const workers = shares.map((share) => new Worker(new URL(import.meta.url), {
    workerData: { maps: share, samples: SAMPLES },
    resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_MB },
  }));
  let results;
  try {
    results = await Promise.all(workers.map(workerResult));
  } catch (error) {
    await Promise.all(workers.map((worker) => worker.terminate()));
    throw error;
  }
  const matches = [];
  for (let index = 0; index < maps.length; index++) {
    const share = results[index % shares.length];
    const position = Math.floor(index / shares.length);
    say(share.lines[position]);
    matches.push(...share.matches.slice(position * SAMPLES, (position + 1) * SAMPLES));
  }
  return matches;
}

// One share of the core run played here (on its own worker thread when SHARE_PLAYERS > 1), as its shard would report it.
async function playShare(shard) {
  const maps = pacingShardMaps(MAP_IDS, shard);
  if (SHARE_PLAYERS <= 1) return pacingShardReport(shard, maps, (await playMaps(maps, SAMPLES)).matches, 'battlePacing');
  const worker = new Worker(new URL(import.meta.url), {
    workerData: { maps, samples: SAMPLES },
    resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_MB },
  });
  try {
    return pacingShardReport(shard, maps, (await workerResult(worker)).matches, 'battlePacing');
  } finally {
    await worker.terminate();
  }
}

// The run's matches: the core run merges the shards' records from this run and plays only the shares nobody else
// plays (SHARE_PLAYERS at a time); the tail and a subset of the maps play everything here, as before.
async function playAll() {
  const say = (message) => console.log(`battlePacing.selftest: ${message}`);
  if (!TAIL && !PARTIAL && !RUN_DIR) {
    say(`no run directory (COT_SELFTEST_RUN_DIR): all ${MAP_IDS.length * SAMPLES} matches play here on ${Math.min(JOBS, MAPS.length)} `
      + 'thread(s), beside any shard that played its share in this run; a pool that runs the shards exports one directory for its '
      + 'receipts (docs/DEVELOPMENT.md, "The pacing tail")');
  }
  if (TAIL || PARTIAL || !RUN_DIR) return playHere(MAPS);
  const { reports, playedHere } = await gatherPacingShares(RUN_DIR, { playShare, players: SHARE_PLAYERS, log: say });
  const matches = pacingRunOrder(MAP_IDS, mergeShardReports([...reports.values()], MAP_IDS));
  for (const mapId of MAPS) console.log(pacingMapLine(mapId, matches, SAMPLES));
  const shards = [...reports.keys()].sort((a, b) => a - b);
  say(`the records of shard(s) ${shards.filter((shard) => !playedHere.includes(shard)).join(', ') || 'none'} from this run`
    + (playedHere.length ? `; shard(s) ${[...playedHere].sort((a, b) => a - b).join(', ')} played here` : '')
    + ` (${pacingRunDirectory(RUN_DIR)})`);
  return matches;
}

function judge(matches) {
  if (process.env.COT_PACING_REPORT) {
    writeFileSync(process.env.COT_PACING_REPORT, JSON.stringify({
      mode: TAIL ? 'tail' : 'core', samples: SAMPLES, maps: MAPS, matches,
    }, null, 1));
  }

  // The gate (battlePacing.test-support.mjs). History: active route recovery removes idle deployment time, and
  // no-contact bots search from 25 s (fc966a16d). The owner accepted the faster battles that gives (ruling 2026-10-03):
  // a 3–8 minute median (209 s measured; searching after the old 120–165 s deployment windows gave 342 s). The fast
  // tail still guards against bots converging and deciding matches in about two minutes. Each outcome is chaotic in its
  // inputs, so the tail is a share, not a count: p10 at least 120 s, at most 5 % of the matches inside 120 s (5 of 132
  // measured, 98–119 s), none inside 90 s. PR #9 (2026-10-04): the ruling replaced the pending-ruling band and the two
  // named floor exceptions the PR carried (Polders 41002, Mars 51000).
  // The owner's ruling of 2026-10-05, "floor as a tail rate", replaces "none inside 90 s": the fastest single match is a
  // lottery (the physics lane's set moved 91 of the 132 times by more than 10 %, and the inside-90 match moved from seed
  // to seed with every change), so the floor is a rate judged on the tail mode's 264 matches: at most 0.5 % inside 90 s,
  // and no more than the PR head's share on the same matches (the documented procedure; a receipt cannot run the head).
  // The core run's 132 matches allow one. Each fast match is still printed by map, seed and seconds, so a seed that
  // crosses into the tail is named in the log.
  const stats = pacingStats(matches);
  for (const entry of stats.fast) {
    console.log(`battlePacing.selftest: fast match ${entry.mapId} seed ${entry.seed} ${entry.timeS.toFixed(0)} s`);
  }
  const summary = `median=${stats.medianS.toFixed(1)}s p10=${stats.p10S.toFixed(1)}s sub120=${stats.sub120} ` +
    `sub90=${stats.sub90} timeouts=${stats.timeouts}/${stats.matches}`;
  if (PARTIAL) {
    console.log(`battlePacing.selftest: ${MAPS.length} of ${MAP_IDS.length} maps, ${summary}; a subset of the maps has `
      + 'no distribution gate (tools/pacing-tail.mjs judges a run merged from shards)');
  } else {
    for (const verdict of pacingVerdicts(stats)) assert.ok(verdict.ok, `battlePacing (${TAIL ? 'tail' : 'core'}): ${verdict.label}`);
    console.log(`battlePacing.selftest: ${TAIL ? 'tail' : 'core'} ${summary}`);
  }
}

// A worker plays its share and hands back the records and lines; only the main thread prints, writes and judges.
if (isMainThread) judge(await playAll());
else parentPort.postMessage(await playMaps(workerData.maps, workerData.samples));
