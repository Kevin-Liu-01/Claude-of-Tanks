#!/usr/bin/env node
// telemetry-report.mjs — read the entry-resilience beacon list (api/telemetry.ts)
// and print the entry funnel plus a failure table (docs/ENTRY-RESILIENCE.md).
//
//   node tools/telemetry-report.mjs                 # Redis list from the KV/Upstash env
//   node tools/telemetry-report.mjs --since=24h     # only events newer than 24 hours (also 90m, 7d)
//   node tools/telemetry-report.mjs --file=x.jsonl  # a saved Vercel log export / JSON-lines dump
//   node tools/telemetry-report.mjs --json          # machine-readable summary
//
// The list holds at most 5000 events for 30 days; the report never prints
// anything the beacon did not accept (no addresses, agents, names or rooms).
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { TELEMETRY_LIST_KEY, telemetryStoreConfig } from '../api/telemetry.ts';

const OUTCOMES = ['ok', 'failed', 'cancelled', 'timeout', 'halted', 'notice'];

export function parseSince(value, now = Date.now()) {
  const match = /^(\d+)([mhd])$/.exec(String(value || '').trim());
  if (!match) return null;
  const unit = { m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]];
  return now - Number(match[1]) * unit;
}

/** Turn stored rows (JSON strings, Vercel log lines or objects) into event objects. */
export function parseTelemetryRows(rows) {
  const events = [];
  for (const row of rows) {
    let value = row;
    if (typeof row === 'string') {
      const start = row.indexOf('{');
      if (start === -1) continue;
      try { value = JSON.parse(row.slice(start)); } catch { continue; }
    }
    if (value && typeof value === 'object' && typeof value.kind === 'string' && typeof value.sid === 'string') {
      events.push(value);
    }
  }
  return events;
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * (sorted.length - 1) + 0.5))];
}

function count(map, key) { map.set(key, (map.get(key) || 0) + 1); }

function sortedEntries(map, limit = 50) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

/** Aggregate events into the funnel and failure tables. */
export function summarizeTelemetry(events, { since = null } = {}) {
  const rows = since === null ? events : events.filter((event) => Date.parse(event.at) >= since);
  const sessions = new Map();
  const failures = new Map();
  const lastStage = new Map();
  const bootMs = [];
  const stageMs = new Map();
  const entryOutcomes = new Map();
  const entryByMode = new Map();
  const capabilityStops = new Map();
  const iceDegraded = new Map();
  const roomFailures = new Map();
  const slowReveals = new Map();
  const builds = new Map();

  const session = (sid) => {
    let entry = sessions.get(sid);
    if (!entry) {
      entry = { ready: false, error: false, entered: false, stage: null, build: null };
      sessions.set(sid, entry);
    }
    return entry;
  };
  const failureKey = (event, code) => `${event.kind}|${event.stage || '-'}|${code || '-'}|${event.build || '-'}`;
  const noteFailure = (event, code, message) => {
    const key = failureKey(event, code);
    const entry = failures.get(key) || { kind: event.kind, stage: event.stage || null, code: code || null,
      build: event.build || null, count: 0, sample: null };
    entry.count += 1;
    if (!entry.sample && message) entry.sample = String(message).slice(0, 120);
    failures.set(key, entry);
  };

  for (const event of rows) {
    const s = session(event.sid);
    s.build = event.build || s.build;
    const build = builds.get(event.build || 'unknown') || { sessions: new Set(), ready: 0, errors: 0 };
    build.sessions.add(event.sid);
    builds.set(event.build || 'unknown', build);
    switch (event.kind) {
      case 'boot_stage':
        if (event.phase === 'begin') s.stage = event.stage || s.stage;
        if (event.phase === 'end' && typeof event.ms === 'number') {
          const list = stageMs.get(event.stage) || [];
          list.push(event.ms);
          stageMs.set(event.stage, list);
        }
        break;
      case 'boot_ready':
        if (!s.ready) build.ready += 1;
        s.ready = true;
        if (typeof event.ms === 'number') bootMs.push(event.ms);
        break;
      case 'boot_error':
        if (!s.error) build.errors += 1;
        s.error = true;
        noteFailure(event, event.code || event.reason, event.error?.message);
        break;
      case 'capability':
        if (event.outcome === 'halted') {
          count(capabilityStops, event.code || 'unknown');
          noteFailure(event, event.code, event.reason);
        }
        break;
      case 'entry_result':
        s.entered = true;
        count(entryOutcomes, event.outcome || 'unknown');
        count(entryByMode, `${event.mode || 'unknown'}:${event.outcome || 'unknown'}`);
        if (event.outcome && event.outcome !== 'ok') noteFailure(event, event.code, event.error?.message);
        break;
      case 'slow_reveal':
        count(slowReveals, event.code || event.stage || 'unknown');
        break;
      case 'room_failure':
        count(roomFailures, event.code || 'unknown');
        noteFailure(event, event.code, null);
        break;
      case 'ice_degraded':
        count(iceDegraded, event.reason || event.code || 'unknown');
        break;
      default:
        break;
    }
  }
  for (const entry of sessions.values()) {
    if (!entry.ready) count(lastStage, entry.stage || '(before renderer)');
  }
  const total = sessions.size;
  const ready = [...sessions.values()].filter((entry) => entry.ready).length;
  const errored = [...sessions.values()].filter((entry) => entry.error).length;
  const entered = [...sessions.values()].filter((entry) => entry.entered).length;
  return {
    events: rows.length,
    sessions: total,
    ready,
    readyRate: total ? ready / total : null,
    errored,
    entered,
    bootMs: { p50: percentile(bootMs, 0.5), p90: percentile(bootMs, 0.9), samples: bootMs.length },
    stageMs: Object.fromEntries([...stageMs.entries()].map(([stage, list]) => [stage, {
      p50: percentile(list, 0.5), p90: percentile(list, 0.9), samples: list.length,
    }])),
    entries: Object.fromEntries(OUTCOMES.map((outcome) => [outcome, entryOutcomes.get(outcome) || 0])),
    entryByMode: Object.fromEntries(sortedEntries(entryByMode)),
    lastStageWithoutReady: Object.fromEntries(sortedEntries(lastStage)),
    capabilityStops: Object.fromEntries(sortedEntries(capabilityStops)),
    slowReveals: Object.fromEntries(sortedEntries(slowReveals)),
    roomFailures: Object.fromEntries(sortedEntries(roomFailures)),
    iceDegraded: Object.fromEntries(sortedEntries(iceDegraded)),
    builds: Object.fromEntries([...builds.entries()].map(([build, entry]) => [build, {
      sessions: entry.sessions.size, ready: entry.ready, errors: entry.errors,
    }])),
    failures: [...failures.values()].sort((a, b) => b.count - a.count).slice(0, 40),
  };
}

const pct = (value) => (value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`);
const ms = (value) => (value === null || value === undefined ? 'n/a' : `${Math.round(value)} ms`);

export function formatTelemetryReport(summary) {
  const lines = [];
  lines.push('ENTRY FUNNEL');
  lines.push(`  events ${summary.events}  sessions ${summary.sessions}  ready ${summary.ready} (${pct(summary.readyRate)})`
    + `  errored ${summary.errored}  entered a battle ${summary.entered}`);
  lines.push(`  boot-to-ready p50 ${ms(summary.bootMs.p50)}  p90 ${ms(summary.bootMs.p90)}  (${summary.bootMs.samples} samples)`);
  const outcomes = Object.entries(summary.entries).filter(([, n]) => n > 0)
    .map(([outcome, n]) => `${outcome} ${n}`).join('  ');
  lines.push(`  entry results: ${outcomes || 'none'}`);
  const byMode = Object.entries(summary.entryByMode).map(([key, n]) => `${key} ${n}`).join('  ');
  if (byMode) lines.push(`  by mode: ${byMode}`);
  const stages = Object.entries(summary.stageMs);
  if (stages.length) {
    lines.push('  stage p50/p90:');
    for (const [stage, row] of stages) lines.push(`    ${stage.padEnd(12)} ${ms(row.p50).padStart(9)} / ${ms(row.p90)} (${row.samples})`);
  }
  const stuck = Object.entries(summary.lastStageWithoutReady);
  if (stuck.length) {
    lines.push('  sessions that never reached ready, by last stage begun:');
    for (const [stage, n] of stuck) lines.push(`    ${stage.padEnd(20)} ${n}`);
  }
  for (const [title, table] of [
    ['  capability stops:', summary.capabilityStops], ['  slow reveals:', summary.slowReveals],
    ['  room failures:', summary.roomFailures], ['  ICE degraded:', summary.iceDegraded],
  ]) {
    const entries = Object.entries(table);
    if (!entries.length) continue;
    lines.push(title);
    for (const [key, n] of entries) lines.push(`    ${key.padEnd(32)} ${n}`);
  }
  lines.push('BUILDS');
  for (const [build, row] of Object.entries(summary.builds)) {
    lines.push(`  ${build.padEnd(28)} sessions ${String(row.sessions).padStart(5)}  ready ${String(row.ready).padStart(5)}  errored ${row.errors}`);
  }
  lines.push('FAILURES (kind / stage / code / build → count, sample)');
  if (!summary.failures.length) lines.push('  none');
  for (const row of summary.failures) {
    lines.push(`  ${row.kind.padEnd(13)} ${String(row.stage || '-').padEnd(12)} ${String(row.code || '-').padEnd(22)} `
      + `${String(row.build || '-').padEnd(24)} ${String(row.count).padStart(5)}  ${row.sample || ''}`);
  }
  return lines.join('\n');
}

export async function loadTelemetryEvents({ file = null, limit = 5000, env = process.env } = {}) {
  if (file) {
    const text = await readFile(file, 'utf8');
    const trimmed = text.trim();
    if (trimmed.startsWith('[')) return parseTelemetryRows(JSON.parse(trimmed));
    return parseTelemetryRows(trimmed.split('\n'));
  }
  const config = telemetryStoreConfig(env);
  if (!config) {
    throw new Error('No telemetry store configured: set UPSTASH_REDIS_REST_URL/_TOKEN (or the KV names) or pass --file');
  }
  const { Redis } = await import('@upstash/redis');
  const redis = new Redis({ url: config.url, token: config.token });
  const rows = await redis.lrange(TELEMETRY_LIST_KEY, 0, Math.max(0, limit - 1));
  return parseTelemetryRows(rows.map((row) => (typeof row === 'string' ? row : JSON.stringify(row))));
}

function parseArgs(argv) {
  const args = { file: null, since: null, json: false, limit: 5000 };
  for (const arg of argv) {
    if (arg === '--json') args.json = true;
    else if (arg.startsWith('--file=')) args.file = arg.slice(7);
    else if (arg.startsWith('--since=')) args.since = arg.slice(8);
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice(8)) || 5000;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const since = args.since ? parseSince(args.since) : null;
  if (args.since && since === null) throw new Error(`--since expects a duration like 24h, 90m or 7d (got ${args.since})`);
  const events = await loadTelemetryEvents({ file: args.file, limit: args.limit });
  const summary = summarizeTelemetry(events, { since });
  process.stdout.write(args.json ? `${JSON.stringify(summary, null, 2)}\n` : `${formatTelemetryReport(summary)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
