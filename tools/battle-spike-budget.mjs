#!/usr/bin/env node
// The spike-budget receipt (battle-spikes-253, docs/PERF-SPIKES.md "The budget"): it replays the budget's battles on the
// production build through the census (tools/battle-spike-census.mjs) and fails when one exceeds the budget
// (tools/battle-spike-budget.json). The battles are watched (every seat a bot's, the camera riding the human seat's
// hull) on a fresh profile with a pinned roster, so a build plays the same battle tick for tick on every run. Per
// battle and pass (cold, warm) it judges, from control release to the end:
//   - links: the WebGL programs linked (the combat warm must have compiled every one before the reveal);
//   - longTasks: main-thread tasks over 50 ms (time: held under load, as the frame counts below);
//   - allocMBPerS: the JS heap's allocation rate (the trace's scavenges), which the machine's load does not move;
//   - hitchesPerMin: intervals past 33 ms and twice the battle's median a minute (tools/battle-spike-analysis.mjs);
//   - over33PerMin and over50PerMin: frame intervals past 33 and 50 ms a minute.
//   The last three are time, so they are judged only while the load average stays at or below loadPerCore × the
//   cores; past it the line says HELD (load).
//
//   node tools/battle-spike-budget.mjs [--gate] [--root=.] [--out=<dir>] [--port=5397] [--report=<census dir>]
//
// --gate exits 1 on any FAIL. --report judges a finished census folder instead of playing (the same records).
import path from 'node:path';
import os from 'node:os';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isMainModule } from './map-probe-runtime.mjs';
import { parseCensusArgs, runCensus } from './battle-spike-census.mjs';

const TOOL = 'battle-spike-budget';
const BUDGET_FILE = fileURLToPath(new URL('./battle-spike-budget.json', import.meta.url));

/** One battle record's live readings (the census's `live` block; the minute normalises the frame counts). */
export function liveReadings(record) {
  const live = record.live ?? {};
  const minutes = Math.max(1e-6, (record.window.endMs - record.window.liveStartMs) / 60000);
  return {
    links: live.links?.links ?? null,
    longTasks: live.longTasks ?? null,
    allocMBPerS: live.heap?.allocMBPerS ?? null,
    over33PerMin: live.intervals?.over33 != null ? +(live.intervals.over33 / minutes).toFixed(1) : null,
    over50PerMin: live.intervals?.over50 != null ? +(live.intervals.over50 / minutes).toFixed(1) : null,
    hitchesPerMin: live.intervals?.hitches != null ? +(live.intervals.hitches / minutes).toFixed(1) : null,
  };
}

const TIME_LIMITS = new Set(['over33PerMin', 'over50PerMin', 'hitchesPerMin', 'longTasks']);

/**
 * Judge one record against its pass's limits: [{ name, value, limit, verdict: PASS | FAIL | HELD }]. A time limit
 * is HELD when the record's load (the worse of before and after) passed loadPerCore × cores.
 */
export function judgeRecord(record, budget, cores = os.cpus().length) {
  const limits = budget.limits?.[record.pass] ?? {};
  const readings = liveReadings(record);
  const load = Math.max(record.load?.before?.[0] ?? 0, record.load?.after?.[0] ?? 0);
  const loaded = load > (budget.loadPerCore ?? 0.75) * cores;
  return Object.entries(limits).map(([name, limit]) => {
    const value = readings[name];
    if (value == null) return { name, value, limit, verdict: 'FAIL', why: 'not measured' };
    if (TIME_LIMITS.has(name) && loaded) return { name, value, limit, verdict: 'HELD', why: `load ${load} on ${cores} cores` };
    return { name, value, limit, verdict: value <= limit ? 'PASS' : 'FAIL' };
  });
}

/** Judge every record of a census folder; the battles the budget names that are missing fail. */
export function judgeCensus(dir, budget, cores = os.cpus().length) {
  const lines = [];
  let failed = 0;
  for (const scenario of budget.scenarios) {
    for (const size of budget.sizes) {
      for (const pass of budget.passes ?? ['cold', 'warm']) {
        const key = `${scenario.replace(':', '-')}-${size}v${size}-${pass}`;
        const file = path.join(dir, `${key}.json`);
        if (!existsSync(file)) { lines.push(`${key}: FAIL (no record)`); failed++; continue; }
        const verdicts = judgeRecord(JSON.parse(readFileSync(file, 'utf8')), budget, cores);
        const bad = verdicts.filter((v) => v.verdict === 'FAIL');
        failed += bad.length;
        lines.push(`${key}: ${bad.length ? 'FAIL' : 'PASS'} — ${verdicts.map((v) => `${v.name} ${v.value} ≤ ${v.limit} ${v.verdict}${v.why ? ` (${v.why})` : ''}`).join('; ')}`);
      }
    }
  }
  return { lines, failed };
}

export function readBudget(file = BUDGET_FILE) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

if (isMainModule(import.meta.url)) {
  const args = process.argv.slice(2);
  const gate = args.includes('--gate');
  const report = args.find((a) => a.startsWith('--report='))?.slice(9) ?? null;
  const budget = readBudget();
  const run = async () => {
    let dir = report ? path.resolve(report) : null;
    if (!dir) {
      const passthrough = args.filter((a) => /^--(root|out|port)=/.test(a));
      const options = parseCensusArgs([
        `--scenarios=${budget.scenarios.join(',')}`, `--sizes=${budget.sizes.join(',')}`, `--seconds=${budget.seconds}`,
        `--passes=${(budget.passes ?? ['cold', 'warm']).join(',')}`, `--driver=${budget.driver ?? 'watch'}`, `--trace=1`,
        `--port=${budget.port ?? 5397}`, ...passthrough,
      ]);
      dir = options.out;
      console.log(`[${TOOL}] ${budget.scenarios.length} battles × ${budget.sizes.join('/')} → ${dir}`);
      await runCensus(options);
    }
    if (!readdirSync(dir).length) throw new Error(`${dir} is empty`);
    const { lines, failed } = judgeCensus(dir, budget);
    for (const line of lines) console.log(`[${TOOL}] ${line}`);
    console.log(`[${TOOL}] ${failed ? `${failed} limit(s) FAILED` : 'PASS'}`);
    if (failed && gate) process.exitCode = 1;
  };
  run().catch((error) => { console.error(error); process.exitCode = 1; });
}
