// The pacing tail played in shards (the owner's ruling of 2026-10-05, "floor as a tail rate"; docs/DEVELOPMENT.md,
// "The pacing tail"). battlePacing's tail mode plays 264 matches, a few hours in one process; shards of the maps run side
// by side, each writing its match records, and this tool merges them and judges the merged run by the receipt's gate.
// Given the PR head's records on the same matches it also holds the share inside 90 s to no more than the head's.
//
//   node tools/pacing-tail.mjs --shards=3
//       prints three COT_PACING_MAPS lists; play each on the tree under test (and on the PR head):
//       COT_PACING_TAIL=1 COT_PACING_MAPS=<list> COT_PACING_REPORT=<shard.json> node server/battlePacing.selftest.mjs
//   node tools/pacing-tail.mjs --merge=a.json,b.json,c.json [--baseline=head-a.json,head-b.json,head-c.json]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pacingStats, pacingVerdicts } from '../server/battlePacing.test-support.mjs';

const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;

/** The merged match records of shard reports, checked to hold every map's samples exactly once. */
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { MAP_IDS } = await import('../src/world/maps/index.ts');
  const shards = arg('shards');
  if (shards) {
    const count = Number(shards);
    for (let index = 0; index < count; index++) {
      console.log(MAP_IDS.filter((_id, mapIndex) => mapIndex % count === index).join(','));
    }
  } else {
    const read = (list) => list.split(',').filter(Boolean).map((file) => JSON.parse(readFileSync(file, 'utf8')));
    const mergeList = arg('merge');
    if (!mergeList) {
      console.error('usage: node tools/pacing-tail.mjs --shards=<n> | --merge=a.json,... [--baseline=...]');
      process.exit(2);
    }
    let stats, baseline = null;
    try {
      stats = pacingStats(mergeShardReports(read(mergeList), MAP_IDS));
      const baselineList = arg('baseline');
      if (baselineList) baseline = pacingStats(mergeShardReports(read(baselineList), MAP_IDS));
    } catch (error) {
      console.error(error.message);
      process.exit(2);
    }
    for (const entry of stats.fast) console.log(`pacing-tail: fast match ${entry.mapId} seed ${entry.seed} ${entry.timeS.toFixed(1)} s`);
    let failed = 0;
    for (const verdict of pacingVerdicts(stats, baseline)) {
      console.log(`${verdict.ok ? '  ok  ' : 'FAIL  '}${verdict.label}`);
      if (!verdict.ok) failed++;
    }
    console.log(`pacing-tail: ${stats.matches} matches, median ${stats.medianS.toFixed(1)} s, p10 ${stats.p10S.toFixed(1)} s, `
      + `${stats.sub120} inside 120 s, ${stats.sub90} inside 90 s (fastest ${stats.fastestS.toFixed(1)} s)`
      + (baseline ? `; baseline ${baseline.sub90} of ${baseline.matches} inside 90 s` : ''));
    if (failed) process.exit(1);
  }
}
