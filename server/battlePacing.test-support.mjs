// The battlePacing receipt's matches and its gate, shared by the receipt and by tools/pacing-tail.mjs (which judges a
// run played in shards). Pure: no simulation is imported here.
//
// The owner's rulings:
// - 2026-10-03: a 3-8 minute median (the opening's active route recovery and the 25 s no-contact search made battles
//   faster than the old 342 s), p10 at least 120 s, at most 5 % of the matches inside 120 s, none inside 90 s.
// - 2026-10-05, "floor as a tail rate": each match is chaotic in every input, so a change anywhere in movement or the
//   bots moves most outcomes (on the physics lane's merged tree only 41 of the 132 stayed within 10 % of the PR head's
//   time) and the single fastest match is a lottery: over 264 matches the PR head had one inside 90 s (moon 52007, 56.2
//   s), and the physics lane's tree one (urban 24003, 87.9 s). The floor is now a rate: at most 0.5 % of the matches
//   inside 90 s, judged on the 264 matches of the tail mode, and no more than the PR head's share on the same matches
//   (docs/DEVELOPMENT.md, "The pacing tail"). The core receipt's 132 matches allow one.

const PACING_SEED_BASE = 21000;
/** Samples per map: the core receipt's 132 matches, and the tail mode's 264 (the 132 plus samples 4-7). */
export const PACING_SAMPLES = Object.freeze({ core: 4, tail: 8 });
const MEDIAN_BAND_S = Object.freeze({ min: 180, max: 480 });
const P10_MIN_S = 120;
const SUB120_MAX_SHARE = 0.05;
const SUB90_MAX_SHARE = 0.005;
const TIMEOUT_MAX_SHARE = 0.125;

/**
 * The seed of `sample` on `mapId`, keyed to the map's index in `mapIds` (the full MAP_IDS), so a run over some of the
 * maps (COT_PACING_MAPS, or a shard) plays exactly the full run's matches on them.
 */
export function pacingSeed(mapIds, mapId, sample) {
  const index = mapIds.indexOf(mapId);
  if (index < 0) throw new Error(`battlePacing: unknown map ${mapId}`);
  return PACING_SEED_BASE + index * 1000 + sample;
}

// The core run in shards (test-speed R9a, 2026-10-16): the 132 matches used to play on four worker threads inside one
// receipt, four threads counted as one slot by every pool, for 318 s on a quiet gate. Each of the eight
// server/battlePacingShard<n>.selftest.mjs receipts now plays one share of the maps on one thread and writes its
// records into the run's directory; server/battlePacing.selftest.mjs merges the eight (every map's samples exactly once)
// and judges the 132 by the same gate. Every map and seed still plays in every run.
/** The core run's shard count: server/battlePacingShard1.selftest.mjs ... server/battlePacingShard8.selftest.mjs. */
export const PACING_SHARDS = 8;

/** Shard `shard` (1-based) of `count`: the maps whose index in `mapIds` is `shard - 1` modulo `count`. */
export function pacingShardMaps(mapIds, shard, count = PACING_SHARDS) {
  if (!Number.isInteger(shard) || shard < 1 || shard > count) throw new Error(`battlePacing: no shard ${shard} of ${count}`);
  return mapIds.filter((_id, index) => index % count === shard - 1);
}

/** One map's log line from its records, in sample order (the receipt prints one per map, in MAP_IDS order). */
export function pacingMapLine(mapId, records, samples) {
  const own = records.filter((record) => record.mapId === mapId).sort((a, b) => a.sample - b.sample);
  return `${mapId}: ${own.map((record) => record.timeS.toFixed(0)).join('/')}s `
    + `timeouts=${own.filter((record) => record.result === 'time_limit').length}/${samples}`;
}

/**
 * The merged match records of shard reports, checked to hold every map's samples exactly once: tools/pacing-tail.mjs
 * merges the tail's shards with it, and server/battlePacing.selftest.mjs the core run's.
 */
export function mergeShardReports(reports, mapIds) {
  const samples = new Set(reports.map((report) => report.samples));
  if (samples.size !== 1) throw new Error(`pacing-tail: shards played different sample counts (${[...samples].join(', ')})`);
  const [perMap] = samples;
  const seen = new Map();
  for (const report of reports) {
    for (const match of report.matches) {
      if (seen.has(match.seed)) throw new Error(`pacing-tail: seed ${match.seed} (${match.mapId}) is in two shards`);
      seen.set(match.seed, match);
    }
  }
  const missing = mapIds.filter((mapId) => ![...seen.values()].some((match) => match.mapId === mapId));
  if (missing.length) throw new Error(`pacing-tail: no shard played ${missing.join(', ')}`);
  if (seen.size !== mapIds.length * perMap) {
    throw new Error(`pacing-tail: ${seen.size} matches merged, ${mapIds.length * perMap} expected`);
  }
  return [...seen.values()];
}

/** Records in the one-thread run's order: MAP_IDS order, then sample order. */
export function pacingRunOrder(mapIds, records) {
  return [...records].sort((a, b) => (mapIds.indexOf(a.mapId) - mapIds.indexOf(b.mapId)) || (a.sample - b.sample));
}

/**
 * Why a shard's report cannot stand for that shard in this run, or null when it can: it must name the shard, the shard
 * count, the sample count and the tree, and hold exactly its maps' matches at their seeds, each with a finite time and
 * a result. mergeShardReports then holds every map's samples exactly once across the shards.
 */
export function pacingShardReportProblem(report, { mapIds, shard, count = PACING_SHARDS, samples, root }) {
  if (!report || typeof report !== 'object') return 'no report';
  if (report.mode !== 'core') return `mode ${report.mode}, not core`;
  if (report.shard !== shard || report.count !== count) return `shard ${report.shard} of ${report.count}, not ${shard} of ${count}`;
  if (report.samples !== samples) return `${report.samples} samples a map, not ${samples}`;
  if (report.root !== root) return `played on ${report.root}, not ${root}`;
  const maps = pacingShardMaps(mapIds, shard, count);
  if (JSON.stringify(report.maps) !== JSON.stringify(maps)) return `maps ${report.maps}, not ${maps.join(',')}`;
  if (!Array.isArray(report.matches) || report.matches.length !== maps.length * samples) {
    return `${report.matches?.length} matches, not ${maps.length * samples}`;
  }
  for (const [position, match] of report.matches.entries()) {
    const mapId = maps[Math.floor(position / samples)], sample = position % samples;
    if (match?.mapId !== mapId || match.sample !== sample) return `match ${position} is ${match?.mapId}/${match?.sample}, not ${mapId}/${sample}`;
    if (match.seed !== pacingSeed(mapIds, mapId, sample)) return `${mapId}/${sample} played seed ${match.seed}`;
    if (!Number.isFinite(match.timeS) || typeof match.result !== 'string') return `${mapId}/${sample} has no time or result`;
  }
  return null;
}

/** The distribution of match records ({ mapId, seed, timeS, result }). */
export function pacingStats(matches) {
  const times = matches.map((match) => match.timeS).sort((a, b) => a - b);
  const count = times.length;
  return {
    matches: count,
    medianS: times[Math.floor(count / 2)],
    p10S: times[Math.floor(count * 0.1)],
    fastestS: times[0],
    sub120: times.filter((time) => time < 120).length,
    sub90: times.filter((time) => time < 90).length,
    timeouts: matches.filter((match) => match.result === 'time_limit').length,
    fast: matches.filter((match) => match.timeS < 120).sort((a, b) => a.timeS - b.timeS),
  };
}

/** How many of `count` matches may end inside 90 s: 0.5 % of them, and never fewer than one (the core's 132). */
export function sub90Allowed(count) {
  return Math.max(1, Math.floor(count * SUB90_MAX_SHARE));
}

/** How many of `count` matches may end inside 120 s (5 %, rounded as the 2026-10-03 receipt rounded it). */
export function sub120Allowed(count) {
  return Math.round(count * SUB120_MAX_SHARE);
}

/**
 * The gate's verdicts on a run's statistics, each { label, ok }. With a baseline (the PR head's statistics on the same
 * matches, from the documented procedure) the share inside 90 s may be no more than the baseline's.
 */
export function pacingVerdicts(stats, baseline = null) {
  const verdicts = [
    { label: `median ${stats.medianS.toFixed(1)} s inside ${MEDIAN_BAND_S.min}-${MEDIAN_BAND_S.max} s`,
      ok: stats.medianS >= MEDIAN_BAND_S.min && stats.medianS <= MEDIAN_BAND_S.max },
    { label: `p10 ${stats.p10S.toFixed(1)} s at least ${P10_MIN_S} s`, ok: stats.p10S >= P10_MIN_S },
    { label: `${stats.sub120} of ${stats.matches} matches inside 120 s, at most ${sub120Allowed(stats.matches)}`,
      ok: stats.sub120 <= sub120Allowed(stats.matches) },
    { label: `${stats.sub90} of ${stats.matches} matches inside 90 s, at most ${sub90Allowed(stats.matches)}`,
      ok: stats.sub90 <= sub90Allowed(stats.matches) },
    { label: `${stats.timeouts} of ${stats.matches} matches at the 900 s cap, at most ${Math.floor(stats.matches * TIMEOUT_MAX_SHARE)}`,
      ok: stats.timeouts <= Math.floor(stats.matches * TIMEOUT_MAX_SHARE) },
  ];
  if (baseline) {
    const share = stats.sub90 / stats.matches, baseShare = baseline.sub90 / baseline.matches;
    verdicts.push({
      label: `the share inside 90 s ${(share * 100).toFixed(2)} % no more than the baseline's ${(baseShare * 100).toFixed(2)} %`,
      ok: share <= baseShare + 1e-12,
    });
  }
  return verdicts;
}
