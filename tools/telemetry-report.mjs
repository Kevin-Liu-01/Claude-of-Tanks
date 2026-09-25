#!/usr/bin/env node
// telemetry-report.mjs — read the entry-telemetry sink and print the entry
// funnel, boot timings, capability classes and the failure table
// (docs/ENTRY-RESILIENCE.md; schema server/telemetryRecord.ts).
//
//   node tools/telemetry-report.mjs                      # Analytics Engine SQL API (CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN)
//   node tools/telemetry-report.mjs --since=24h          # window: 90m, 24h, 7d (default 7d)
//   node tools/telemetry-report.mjs --from-json=x.json   # a saved SQL API result (FORMAT JSON or JSONEachRow)
//   node tools/telemetry-report.mjs --logs=x.jsonl       # `vercel logs --json` output / the fallback's log lines
//   node tools/telemetry-report.mjs --sql                # print the query and exit
//   node tools/telemetry-report.mjs --json               # machine-readable summary
//
// The report never prints anything the beacon did not accept (no addresses,
// agents, names or rooms), and session ids are aggregated, never listed.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  TELEMETRY_BLOBS, TELEMETRY_DOUBLES, TELEMETRY_STAGE_SLOTS, telemetryRowFromRecord, telemetryRowFromSql,
  validateTelemetryRecord,
} from '../server/telemetryRecord.ts';

export const TELEMETRY_DATASET = 'cot_telemetry';
export const TELEMETRY_SQL_ENDPOINT = 'https://api.cloudflare.com/client/v4/accounts/{account}/analytics_engine/sql';
const DEFAULT_SINCE = '7d';
const DEFAULT_LIMIT = 20_000;
const ENTRY_OUTCOMES = ['ok', 'failed', 'cancelled', 'timeout'];

const SINCE_RE = /^(\d+)([mhd])$/;
const UNITS = { m: ['MINUTE', 60_000], h: ['HOUR', 3_600_000], d: ['DAY', 86_400_000] };

/** `24h` → the epoch millisecond the window starts at, or null when unreadable. */
export function parseSince(value, now = Date.now()) {
  const match = SINCE_RE.exec(String(value || '').trim());
  if (!match) return null;
  return now - Number(match[1]) * UNITS[match[2]][1];
}

/** The SQL the report runs: every column of the window, newest first, bounded. */
export function telemetryQuery({ since = DEFAULT_SINCE, limit = DEFAULT_LIMIT } = {}) {
  const match = SINCE_RE.exec(String(since || '').trim());
  if (!match) throw new Error(`--since expects a duration like 24h, 90m or 7d (got ${since})`);
  const columns = ['timestamp', '_sample_interval', 'index1',
    ...TELEMETRY_BLOBS.map((_, index) => `blob${index + 1}`), ...TELEMETRY_DOUBLES.map((_, index) => `double${index + 1}`)];
  return `SELECT ${columns.join(', ')} FROM ${TELEMETRY_DATASET} `
    + `WHERE timestamp > NOW() - INTERVAL '${Number(match[1])}' ${UNITS[match[2]][0]} `
    + `ORDER BY timestamp DESC LIMIT ${Math.max(1, Math.floor(limit))} FORMAT JSON`;
}

/** Rows from a saved or fetched SQL API result: FORMAT JSON, JSONEachRow, or a bare array. */
export function parseSqlResult(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return [];
  let rows;
  if (trimmed.startsWith('{') && !trimmed.includes('\n{')) {
    const parsed = JSON.parse(trimmed);
    rows = Array.isArray(parsed.data) ? parsed.data : [parsed];
  } else if (trimmed.startsWith('[')) {
    rows = JSON.parse(trimmed);
  } else {
    rows = trimmed.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => JSON.parse(line));
  }
  return rows.filter((row) => row && typeof row === 'object' && typeof row.blob1 === 'string').map(telemetryRowFromSql);
}

/** Rows from the Vercel fallback's log lines, raw or wrapped by `vercel logs --json`. */
export function parseLogLines(text) {
  const rows = [];
  for (const line of String(text || '').split('\n')) {
    let value = line.trim();
    if (!value) continue;
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && parsed.tag !== 'cot-telemetry' && typeof parsed.message === 'string') {
        value = parsed.message;
      } else if (parsed && typeof parsed === 'object' && parsed.tag === 'cot-telemetry') {
        value = JSON.stringify(parsed);
      }
    } catch { /* a plain log line: look for the record inside */ }
    const start = value.indexOf('{"tag":"cot-telemetry"');
    if (start === -1) continue;
    let record;
    try { record = JSON.parse(value.slice(start)); } catch { continue; }
    const { at, tag: _tag, ...body } = record;
    const validated = validateTelemetryRecord(body);
    if (validated.ok) rows.push(telemetryRowFromRecord(validated.record, String(at || '')));
  }
  return rows;
}

function weightedPercentile(samples, fraction) {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a, b) => a.value - b.value);
  const total = sorted.reduce((sum, { weight }) => sum + weight, 0);
  let cumulative = 0;
  for (const sample of sorted) {
    cumulative += sample.weight;
    if (cumulative >= fraction * total) return Math.round(sample.value);
  }
  return Math.round(sorted[sorted.length - 1].value);
}

const percentiles = (samples) => ({
  p50: weightedPercentile(samples, 0.5), p90: weightedPercentile(samples, 0.9), samples: samples.length,
});

function count(map, key, weight = 1) { map.set(key, (map.get(key) || 0) + weight); }

function sortedEntries(map, limit = 50) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
    .map(([key, value]) => [key, Math.round(value * 100) / 100]);
}

function sessionOf(sessions, sid, build) {
  let entry = sessions.get(sid);
  if (!entry) {
    entry = { weight: 0, ready: false, entered: false, error: false, halted: false, left: false, build, bootMs: null, stage: null };
    sessions.set(sid, entry);
  }
  return entry;
}

/** Aggregate rows (from the SQL API or the log) into the funnel and the tables. */
export function summarizeTelemetry(rows, { since = null } = {}) {
  const window = since === null ? rows : rows.filter((row) => Date.parse(row.at.replace(' ', 'T') + (row.at.endsWith('Z') ? '' : 'Z')) >= since);
  const sessions = new Map();
  const failures = new Map();
  const stageSamples = new Map();
  const bootSamples = [];
  const bootByBuild = new Map();
  const entryOutcomes = new Map();
  const entryByMode = new Map();
  const capabilityClasses = new Map();
  const memoryClasses = new Map();
  const capFlags = new Map();
  const capVerdicts = new Map();
  const notes = new Map();
  const noteFailure = (kind, stage, code, build, weight, sample) => {
    const key = `${kind}|${stage || '-'}|${code || '-'}|${build || '-'}`;
    const entry = failures.get(key) || { kind, stage: stage || null, code: code || null, build: build || null, count: 0, sample: null };
    entry.count += weight;
    if (!entry.sample && sample) entry.sample = String(sample).slice(0, 120);
    failures.set(key, entry);
  };
  const entered = (row, entry, weight) => {
    const outcome = entry.outcome || 'unknown';
    count(entryOutcomes, outcome, weight);
    count(entryByMode, `${entry.mode || 'unknown'}:${outcome}`, weight);
    if (outcome !== 'ok') noteFailure('entry', entry.mode || null, entry.code || null, row.build, weight, row.message);
    return outcome === 'ok';
  };

  for (const row of window) {
    const weight = row.weight * row.sampleInterval;
    const session = sessionOf(sessions, row.sid || `row:${sessions.size}`, row.build);
    for (const note of row.notes) count(notes, note, row.sampleInterval);
    if (row.kind === 'session') {
      session.weight = weight;
      session.stage = row.stage || session.stage;
      session.ready = row.outcome === 'ready';
      session.halted = row.outcome === 'halted';
      session.left = row.outcome === 'left';
      if (row.outcome === 'error' || row.message) session.error = true;
      if (row.entry) session.entered = entered(row, row.entry, weight) || session.entered;
      if (row.ready && row.ms !== null) {
        session.bootMs = row.ms;
        bootSamples.push({ value: row.ms, weight });
        const build = bootByBuild.get(row.build) || [];
        build.push({ value: row.ms, weight });
        bootByBuild.set(row.build, build);
      }
      for (const [stage, ms] of Object.entries(row.timings)) {
        const key = stage.includes('>') ? 'gaps' : stage;
        const list = stageSamples.get(key) || [];
        list.push({ value: ms, weight });
        stageSamples.set(key, list);
      }
      if (row.rendererFamily || row.tier) count(capabilityClasses, `${row.rendererFamily || '?'}/${row.tier || '?'}/${row.autoTier || '?'}`, weight);
      if (row.memoryClass) count(memoryClasses, row.memoryClass, weight);
      if (row.capClass) count(capFlags, row.capClass, weight);
      if (row.capVerdict && row.capVerdict !== 'ok') count(capVerdicts, row.capVerdict, weight);
      if (row.outcome === 'halted') noteFailure('halted', row.stage, row.capVerdict.replace(/^halted:/, '') || row.code, row.build, weight, row.message);
      else if (row.outcome === 'error') noteFailure('error', row.stage, row.code, row.build, weight, row.message);
      else if (row.outcome === 'left') noteFailure('left', row.stage, null, row.build, weight, null);
      else if (row.message) noteFailure('error', row.stage, row.code, row.build, weight, row.message);
    } else if (row.kind === 'entry') {
      if (!session.weight) session.weight = weight;
      session.entered = entered(row, { mode: row.mode, outcome: row.outcome, code: row.code }, weight) || session.entered;
      if (row.outcome === 'ok') session.ready = true;
    } else if (row.kind === 'error') {
      if (!session.weight) session.weight = row.sampleInterval;
      session.error = true;
      if (row.ready === true) session.ready = true;
      session.stage = session.stage || row.stage;
      noteFailure('error', row.stage, row.code, row.build, row.sampleInterval, row.message);
    }
  }

  const builds = new Map();
  const lastStage = new Map();
  let total = 0, ready = 0, enteredCount = 0, errored = 0, halted = 0, left = 0;
  for (const session of sessions.values()) {
    const weight = session.weight || 1;
    total += weight;
    if (session.ready) ready += weight;
    if (session.entered) enteredCount += weight;
    if (session.error) errored += weight;
    if (session.halted) halted += weight;
    if (session.left) left += weight;
    if (!session.ready) count(lastStage, session.stage || '(before renderer)', weight);
    const build = builds.get(session.build || 'unknown') || { sessions: 0, ready: 0, entered: 0, errored: 0 };
    build.sessions += weight;
    if (session.ready) build.ready += weight;
    if (session.entered) build.entered += weight;
    if (session.error) build.errored += weight;
    builds.set(session.build || 'unknown', build);
  }
  const round = (value) => Math.round(value * 100) / 100;
  return {
    rows: window.length,
    sessions: round(total),
    ready: round(ready),
    readyRate: total ? ready / total : null,
    entered: round(enteredCount),
    enteredRate: total ? enteredCount / total : null,
    errored: round(errored),
    halted: round(halted),
    left: round(left),
    bootMs: percentiles(bootSamples),
    bootByBuild: Object.fromEntries([...bootByBuild.entries()].map(([build, list]) => [build, percentiles(list)])),
    stageMs: Object.fromEntries([...TELEMETRY_STAGE_SLOTS, 'gaps'].filter((stage) => stageSamples.has(stage))
      .map((stage) => [stage, percentiles(stageSamples.get(stage))])),
    entries: Object.fromEntries(ENTRY_OUTCOMES.map((outcome) => [outcome, round(entryOutcomes.get(outcome) || 0)])),
    entryByMode: Object.fromEntries(sortedEntries(entryByMode)),
    lastStageWithoutReady: Object.fromEntries(sortedEntries(lastStage)),
    capabilityClasses: Object.fromEntries(sortedEntries(capabilityClasses)),
    memoryClasses: Object.fromEntries(sortedEntries(memoryClasses)),
    capabilityFlags: Object.fromEntries(sortedEntries(capFlags)),
    capabilityVerdicts: Object.fromEntries(sortedEntries(capVerdicts)),
    notes: Object.fromEntries(sortedEntries(notes)),
    builds: Object.fromEntries([...builds.entries()].map(([build, row]) => [build, {
      sessions: round(row.sessions), ready: round(row.ready), entered: round(row.entered), errored: round(row.errored),
    }])),
    failures: [...failures.values()].map((row) => ({ ...row, count: round(row.count) }))
      .sort((a, b) => b.count - a.count).slice(0, 40),
  };
}

const pct = (value) => (value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`);
const ms = (value) => (value === null || value === undefined ? 'n/a' : `${Math.round(value)} ms`);
const n = (value) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

export function formatTelemetryReport(summary) {
  const lines = [];
  lines.push('ENTRY FUNNEL');
  lines.push(`  rows ${summary.rows}  sessions ${n(summary.sessions)}  ready ${n(summary.ready)} (${pct(summary.readyRate)})`
    + `  entered a battle ${n(summary.entered)} (${pct(summary.enteredRate)})  errored ${n(summary.errored)}`
    + `  halted ${n(summary.halted)}  left ${n(summary.left)}`);
  lines.push(`  boot-to-ready p50 ${ms(summary.bootMs.p50)}  p90 ${ms(summary.bootMs.p90)}  (${summary.bootMs.samples} samples)`);
  for (const [build, row] of Object.entries(summary.bootByBuild)) {
    lines.push(`    ${build.padEnd(28)} p50 ${ms(row.p50).padStart(9)}  p90 ${ms(row.p90).padStart(9)}  (${row.samples})`);
  }
  const outcomes = Object.entries(summary.entries).filter(([, value]) => value > 0)
    .map(([outcome, value]) => `${outcome} ${n(value)}`).join('  ');
  lines.push(`  entry results: ${outcomes || 'none'}`);
  const byMode = Object.entries(summary.entryByMode).map(([key, value]) => `${key} ${n(value)}`).join('  ');
  if (byMode) lines.push(`  by mode: ${byMode}`);
  const stages = Object.entries(summary.stageMs);
  if (stages.length) {
    lines.push('  stage p50/p90:');
    for (const [stage, row] of stages) lines.push(`    ${stage.padEnd(12)} ${ms(row.p50).padStart(9)} / ${ms(row.p90)} (${row.samples})`);
  }
  const stuck = Object.entries(summary.lastStageWithoutReady);
  if (stuck.length) {
    lines.push('  sessions that never reached ready, by last stage begun:');
    for (const [stage, value] of stuck) lines.push(`    ${stage.padEnd(20)} ${n(value)}`);
  }
  lines.push('CAPABILITY');
  for (const [title, table] of [
    ['  renderer / tier / auto tier:', summary.capabilityClasses], ['  memory class:', summary.memoryClasses],
    ['  flags (webgl2 / rasteriser / float buffers / storage / workers):', summary.capabilityFlags],
    ['  notices and stops:', summary.capabilityVerdicts], ['  notes (slow reveals, room failures, degraded ICE, HUD mask failures):', summary.notes],
  ]) {
    const entries = Object.entries(table);
    if (!entries.length) continue;
    lines.push(title);
    for (const [key, value] of entries) lines.push(`    ${key.padEnd(36)} ${n(value)}`);
  }
  lines.push('BUILDS');
  for (const [build, row] of Object.entries(summary.builds)) {
    lines.push(`  ${build.padEnd(28)} sessions ${n(row.sessions).padStart(7)}  ready ${n(row.ready).padStart(7)}`
      + `  entered ${n(row.entered).padStart(7)}  errored ${n(row.errored)}`);
  }
  lines.push('FAILURES (kind / stage / code / build → count, sample)');
  if (!summary.failures.length) lines.push('  none');
  for (const row of summary.failures) {
    lines.push(`  ${row.kind.padEnd(8)} ${String(row.stage || '-').padEnd(12)} ${String(row.code || '-').padEnd(26)} `
      + `${String(row.build || '-').padEnd(24)} ${n(row.count).padStart(6)}  ${row.sample || ''}`);
  }
  return lines.join('\n');
}

/** Run the query against the Analytics Engine SQL API; credentials are read from the environment, never printed. */
export async function fetchTelemetryRows({ env = process.env, since = DEFAULT_SINCE, limit = DEFAULT_LIMIT, fetchImpl = fetch } = {}) {
  const account = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const token = String(env.CLOUDFLARE_API_TOKEN || '').trim();
  if (!account || !token) {
    throw new Error('No telemetry sink configured: set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (Account Analytics: Read), or pass --from-json / --logs');
  }
  const response = await fetchImpl(TELEMETRY_SQL_ENDPOINT.replace('{account}', encodeURIComponent(account)), {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'text/plain' }, body: telemetryQuery({ since, limit }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Analytics Engine SQL API answered ${response.status}: ${text.slice(0, 300)}`);
  return parseSqlResult(text);
}

export async function loadTelemetryRows({ fromJson = null, logs = null, since = DEFAULT_SINCE, limit = DEFAULT_LIMIT, env = process.env } = {}) {
  if (fromJson) return parseSqlResult(await readFile(fromJson, 'utf8'));
  if (logs) return parseLogLines(await readFile(logs, 'utf8'));
  return fetchTelemetryRows({ env, since, limit });
}

function parseArgs(argv) {
  const args = { fromJson: null, logs: null, since: DEFAULT_SINCE, json: false, sql: false, limit: DEFAULT_LIMIT };
  for (const arg of argv) {
    if (arg === '--json') args.json = true;
    else if (arg === '--sql') args.sql = true;
    else if (arg.startsWith('--from-json=')) args.fromJson = arg.slice(12);
    else if (arg.startsWith('--logs=')) args.logs = arg.slice(7);
    else if (arg.startsWith('--since=')) args.since = arg.slice(8);
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice(8)) || DEFAULT_LIMIT;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (parseSince(args.since) === null) throw new Error(`--since expects a duration like 24h, 90m or 7d (got ${args.since})`);
  if (args.sql) {
    process.stdout.write(`${telemetryQuery({ since: args.since, limit: args.limit })}\n`);
    return;
  }
  const rows = await loadTelemetryRows(args);
  // Saved files are filtered locally; the SQL API already applied the window.
  const summary = summarizeTelemetry(rows, { since: args.fromJson || args.logs ? parseSince(args.since) : null });
  process.stdout.write(args.json ? `${JSON.stringify(summary, null, 2)}\n` : `${formatTelemetryReport(summary)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
