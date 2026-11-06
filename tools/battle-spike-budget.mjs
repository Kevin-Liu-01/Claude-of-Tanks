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

/** Judge every record of a census folder; the battles the budget names that are missing fail, or (`stopped`: the census
 *  was stopped before it played them, round 3 A5) are LEFT for the next run, which is no failure. A battle the census
 *  played and failed (`failures`, its { scenario, size, error } rows) fails, stopped or not (round 3 A5 review). `left`
 *  counts battles, as the census does; `failed` counts limits and missing records. */
export function judgeCensus(dir, budget, cores = os.cpus().length, { stopped = false, failures = [] } = {}) {
  const lines = [];
  const failedBattles = new Map(failures.map((f) => [`${f.scenario}|${f.size}`, String(f.error ?? 'failed').split('\n')[0].slice(0, 200)]));
  const leftBattles = new Set();
  let failed = 0;
  for (const scenario of budget.scenarios) {
    for (const size of budget.sizes) {
      const battle = `${scenario}|${size}`;
      for (const pass of budget.passes ?? ['cold', 'warm']) {
        const key = `${scenario.replace(':', '-')}-${size}v${size}-${pass}`;
        const file = path.join(dir, `${key}.json`);
        if (!existsSync(file) && failedBattles.has(battle)) {
          lines.push(`${key}: FAIL (no record: the battle failed: ${failedBattles.get(battle)})`); failed++; continue;
        }
        if (!existsSync(file) && stopped) { lines.push(`${key}: LEFT (not played yet: the census was stopped)`); leftBattles.add(battle); continue; }
        if (!existsSync(file)) { lines.push(`${key}: FAIL (no record)`); failed++; continue; }
        const verdicts = judgeRecord(JSON.parse(readFileSync(file, 'utf8')), budget, cores);
        const bad = verdicts.filter((v) => v.verdict === 'FAIL');
        failed += bad.length;
        lines.push(`${key}: ${bad.length ? 'FAIL' : 'PASS'} — ${verdicts.map((v) => `${v.name} ${v.value} ≤ ${v.limit} ${v.verdict}${v.why ? ` (${v.why})` : ''}`).join('; ')}`);
      }
    }
  }
  return { lines, failed, left: leftBattles.size };
}

export function readBudget(file = BUDGET_FILE) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** The receipt's run: the census (unless --report names a finished one), then the judge. `deps` (round 3 A5) are its
 *  outside world, for a receipt that drives it without a browser: the census and the budget. */
export async function runBudget(args, { census = runCensus, budget = readBudget(), log = (line) => console.log(line) } = {}) {
  const gate = args.includes('--gate');
  const report = args.find((a) => a.startsWith('--report='))?.slice(9) ?? null;
  let dir = report ? path.resolve(report) : null, censusResult = null;
  if (!dir) {
    // (round 3 A5) --resume passes through: a census the capture hold stopped is finished by its next run in the same --out
    const passthrough = args.filter((a) => /^--(?:(?:root|out|port)=|resume(?:=|$))/.test(a));
    const options = parseCensusArgs([
      `--scenarios=${budget.scenarios.join(',')}`, `--sizes=${budget.sizes.join(',')}`, `--seconds=${budget.seconds}`,
      `--passes=${(budget.passes ?? ['cold', 'warm']).join(',')}`, `--driver=${budget.driver ?? 'watch'}`, `--trace=1`,
      `--port=${budget.port ?? 5397}`, ...passthrough,
    ]);
    dir = options.out;
    log(`[${TOOL}] ${budget.scenarios.length} battles × ${budget.sizes.join('/')} → ${dir}`);
    censusResult = await census(options);
  }
  if (!readdirSync(dir).length) throw new Error(`${dir} is empty`);
  // a census its budget or the capture hold stopped (its result, or the census.json a --report folder carries) is
  // incomplete: its unplayed battles are LEFT and the receipt exits 3, never a FAIL of records it never played; a battle
  // it played and failed stays a FAIL (round 3 A5 review: a failure before the stop read LEFT and the gate exited 3)
  let stopped = Boolean(censusResult?.stopped), failures = censusResult?.failures ?? [];
  if (!censusResult) {
    try {
      const summary = JSON.parse(readFileSync(path.join(dir, 'census.json'), 'utf8'));
      stopped = Boolean(summary.stopped);
      failures = Array.isArray(summary.failures) ? summary.failures : [];
    } catch { /* no summary */ }
  }
  const { lines, failed, left } = judgeCensus(dir, budget, undefined, { stopped, failures });
  for (const line of lines) log(`[${TOOL}] ${line}`);
  if (left) log(`[${TOOL}] INCOMPLETE: ${left} battle(s) left; run again with --out=${dir} --resume to finish the census`);
  log(`[${TOOL}] ${failed ? `${failed} limit(s) FAILED` : left ? 'no limit failed so far' : 'PASS'}`);
  if (failed && gate) process.exitCode = 1;
  else if (left) process.exitCode ||= 3;
  return { dir, lines, failed, left };
}

if (isMainModule(import.meta.url)) {
  runBudget(process.argv.slice(2)).catch((error) => { console.error(error); process.exitCode = 1; });
}
