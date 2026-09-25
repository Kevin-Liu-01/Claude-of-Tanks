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

function createAccumulator() {
  const acc = {
    sessions: new Map(), failures: new Map(), stageMs: new Map(), bootMs: [], entryOutcomes: new Map(),
    entryByMode: new Map(), capabilityStops: new Map(), iceDegraded: new Map(), roomFailures: new Map(),
    slowReveals: new Map(), builds: new Map(),
  };
  acc.session = (sid) => {
    let entry = acc.sessions.get(sid);
    if (!entry) {
      entry = { ready: false, error: false, entered: false, stage: null, build: null };
      acc.sessions.set(sid, entry);
    }
    return entry;
  };
  acc.build = (name) => {
    let entry = acc.builds.get(name);
    if (!entry) {
      entry = { sessions: new Set(), ready: 0, errors: 0 };
      acc.builds.set(name, entry);
    }
    return entry;
  };
  acc.noteFailure = (event, code, message) => {
    const key = `${event.kind}|${event.stage || '-'}|${code || '-'}|${event.build || '-'}`;
    const entry = acc.failures.get(key) || { kind: event.kind, stage: event.stage || null, code: code || null,
      build: event.build || null, count: 0, sample: null };
    entry.count += 1;
    if (!entry.sample && message) entry.sample = String(message).slice(0, 120);
    acc.failures.set(key, entry);
  };
  return acc;
}

/** One fold per event kind; each receives the accumulator, the event, its session and its build row. */
const FOLDS = {
  boot_stage(acc, event, session) {
    if (event.phase === 'begin') session.stage = event.stage || session.stage;
    if (event.phase === 'end' && typeof event.ms === 'number') {
      const list = acc.stageMs.get(event.stage) || [];
      list.push(event.ms);
      acc.stageMs.set(event.stage, list);
    }
  },
  boot_ready(acc, event, session, build) {
    if (!session.ready) build.ready += 1;
    session.ready = true;
    if (typeof event.ms === 'number') acc.bootMs.push(event.ms);
  },
  boot_error(acc, event, session, build) {
    if (!session.error) build.errors += 1;
    session.error = true;
    acc.noteFailure(event, event.code || event.reason, event.error?.message);
  },
  capability(acc, event) {
    if (event.outcome !== 'halted') return;
    count(acc.capabilityStops, event.code || 'unknown');
    acc.noteFailure(event, event.code, event.reason);
  },
  entry_result(acc, event, session) {
    session.entered = true;
    count(acc.entryOutcomes, event.outcome || 'unknown');
    count(acc.entryByMode, `${event.mode || 'unknown'}:${event.outcome || 'unknown'}`);
    if (event.outcome && event.outcome !== 'ok') acc.noteFailure(event, event.code, event.error?.message);
  },
  slow_reveal(acc, event) { count(acc.slowReveals, event.code || event.stage || 'unknown'); },
  room_failure(acc, event) {
    count(acc.roomFailures, event.code || 'unknown');
    acc.noteFailure(event, event.code, null);
  },
  ice_degraded(acc, event) { count(acc.iceDegraded, event.reason || event.code || 'unknown'); },
};

const percentiles = (list) => ({ p50: percentile(list, 0.5), p90: percentile(list, 0.9), samples: list.length });

/** Aggregate events into the funnel and failure tables. */
export function summarizeTelemetry(events, { since = null } = {}) {
  const rows = since === null ? events : events.filter((event) => Date.parse(event.at) >= since);
  const acc = createAccumulator();
  for (const event of rows) {
    const session = acc.session(event.sid);
    session.build = event.build || session.build;
    const build = acc.build(event.build || 'unknown');
    build.sessions.add(event.sid);
    FOLDS[event.kind]?.(acc, event, session, build);
  }
  const lastStage = new Map();
  for (const entry of acc.sessions.values()) {
    if (!entry.ready) count(lastStage, entry.stage || '(before renderer)');
  }
  const sessions = [...acc.sessions.values()];
  const total = sessions.length;
  const ready = sessions.filter((entry) => entry.ready).length;
  return {
    events: rows.length,
    sessions: total,
    ready,
    readyRate: total ? ready / total : null,
    errored: sessions.filter((entry) => entry.error).length,
    entered: sessions.filter((entry) => entry.entered).length,
    bootMs: percentiles(acc.bootMs),
    stageMs: Object.fromEntries([...acc.stageMs.entries()].map(([stage, list]) => [stage, percentiles(list)])),
    entries: Object.fromEntries(OUTCOMES.map((outcome) => [outcome, acc.entryOutcomes.get(outcome) || 0])),
    entryByMode: Object.fromEntries(sortedEntries(acc.entryByMode)),
    lastStageWithoutReady: Object.fromEntries(sortedEntries(lastStage)),
    capabilityStops: Object.fromEntries(sortedEntries(acc.capabilityStops)),
    slowReveals: Object.fromEntries(sortedEntries(acc.slowReveals)),
    roomFailures: Object.fromEntries(sortedEntries(acc.roomFailures)),
    iceDegraded: Object.fromEntries(sortedEntries(acc.iceDegraded)),
    builds: Object.fromEntries([...acc.builds.entries()].map(([build, entry]) => [build, {
      sessions: entry.sessions.size, ready: entry.ready, errors: entry.errors,
    }])),
    failures: [...acc.failures.values()].sort((a, b) => b.count - a.count).slice(0, 40),
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
