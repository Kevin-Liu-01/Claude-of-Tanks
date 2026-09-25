import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TELEMETRY_BLOBS, TELEMETRY_DOUBLES, telemetryDataPoint, validateTelemetryRecord } from '../server/telemetryRecord.ts';
import {
  fetchTelemetryRows, formatTelemetryReport, loadTelemetryRows, parseLogLines, parseSince, parseSqlResult,
  summarizeTelemetry, telemetryQuery, TELEMETRY_DATASET,
} from './telemetry-report.mjs';

// The report is fed the same records three ways — Analytics Engine SQL rows,
// the Vercel fallback's log lines and `vercel logs --json` wrappers — and
// must fold them into one funnel, weighted by sample interval and the
// client's clean-session weight.

const build = 'v1.0.0+gd464a813f';
const at = (minutesAgo) => new Date(Date.parse('2026-09-25T12:00:00.000Z') - minutesAgo * 60_000).toISOString();
const cap = { webgl2: true, rendererFamily: 'apple', software: false, maxTextureUnits: 16, maxTextureSize: 16384,
  vertexTextureUnits: 16, colorBufferFloat: true, storage: true, worker: true, memoryClass: 'high', tier: 'desktop',
  autoTier: 'high', requiredTextureUnits: 16 };
const records = [
  // A: clean boot, solo battle folded into the session (weight 2: one of two clean sessions was sampled)
  [at(50), { v: 2, sid: 'sessionAAAA', build, kind: 'session', outcome: 'ready', stage: 'ready', ms: 4200, mode: 'unknown', w: 2,
    t: { imports: 12, renderer: 40, 'gap>sky': 3, sky: 300, vehicle: 900, ready: 7 }, cap, capOutcome: 'ok',
    entry: { mode: 'solo', outcome: 'ok', ms: 3000 }, notes: ['slow_reveal:extended'] }],
  // B: died in the sky stage — the session record carries the first error, a follow-up the second
  [at(40), { v: 2, sid: 'sessionBBBB', build, kind: 'session', outcome: 'error', stage: 'sky', ms: 900,
    t: { imports: 10, renderer: 38 }, cap, capOutcome: 'ok',
    error: { stage: 'sky', code: 'uncaught', message: 'Injected sky failure', frames: ['at bake (/assets/sky-1.js:1:1)'] } }],
  [at(40), { v: 2, sid: 'sessionBBBB', build, kind: 'error', stage: 'sky', code: 'unhandled_rejection', ready: false, ms: 950,
    error: { message: 'Second sky failure', frames: [] } }],
  // C: capability stop on an older build
  [at(30), { v: 2, sid: 'sessionCCCC', build: 'v0.9.0', kind: 'session', outcome: 'halted', stage: 'renderer', ms: 300,
    cap: { ...cap, webgl2: false, rendererFamily: 'unknown', memoryClass: 'low', tier: 'mobile', autoTier: 'low' },
    capOutcome: 'halted', capCode: 'no_webgl2' }],
  // D: ready, then a failed network entry follow-up, then a software-rendering notice
  [at(20), { v: 2, sid: 'sessionDDDD', build, kind: 'session', outcome: 'ready', stage: 'ready', ms: 6100, t: { renderer: 60, vehicle: 1500 },
    cap: { ...cap, software: true, rendererFamily: 'software' }, capOutcome: 'notice', capCode: 'software_rendering' }],
  [at(18), { v: 2, sid: 'sessionDDDD', build, kind: 'entry', outcome: 'failed', mode: 'network', code: 'entry_failed_peer',
    error: { message: 'peer gone', frames: [] }, notes: ['ice_degraded:turn_service_unconfigured', 'room_failure:rtc_connect_timeout'] }],
  // E: the inline watchdog alone — the entry graph never evaluated, so there is no session record
  [at(15), { v: 2, sid: 'sessionEEEE', build, kind: 'error', stage: 'download', code: 'chunk', outcome: 'halted', ready: false, ms: 61000,
    error: { message: 'A game file failed to download (sky-1.js)', frames: ['sky-1.js'], code: 'module' } }],
  // F: an error after ready in a session that was sampled out (no session record) — still a ready session
  [at(12), { v: 2, sid: 'sessionFFFF', build, kind: 'error', stage: 'ready', code: 'uncaught', ready: true, ms: 90000,
    error: { message: 'Late failure', frames: [] } }],
  // G: left mid-boot
  [at(10), { v: 2, sid: 'sessionGGGG', build, kind: 'session', outcome: 'left', stage: 'vehicle', ms: 7000, t: { renderer: 41 }, cap, capOutcome: 'ok' }],
  // H: very old, filtered out by --since on saved files
  [at(60 * 48), { v: 2, sid: 'sessionHHHH', build, kind: 'session', outcome: 'ready', stage: 'ready', ms: 100, cap, capOutcome: 'ok' }],
];

/** The SQL API shape (`FORMAT JSON`) for a record, with an optional sample interval. */
function sqlRow([stamp, record], sampleInterval = 1) {
  const validated = validateTelemetryRecord(record);
  assert.equal(validated.ok, true, JSON.stringify(validated));
  const point = telemetryDataPoint(validated.record);
  const row = { timestamp: stamp.replace('T', ' ').replace(/\.\d+Z$/, ''), _sample_interval: sampleInterval, index1: point.indexes[0] };
  point.blobs.forEach((value, index) => { row[`blob${index + 1}`] = value; });
  point.doubles.forEach((value, index) => { row[`double${index + 1}`] = value; });
  return row;
}

const sqlResult = {
  meta: [{ name: 'timestamp', type: 'DateTime' }],
  data: records.map((entry, index) => sqlRow(entry, index === 3 ? 3 : 1)),
  rows: records.length,
};
const rows = parseSqlResult(JSON.stringify(sqlResult));
assert.equal(rows.length, records.length, 'a FORMAT JSON result parses row by row');
assert.equal(rows[3].sampleInterval, 3, 'sampled rows keep their interval');
assert.equal(parseSqlResult(sqlResult.data.map((row) => JSON.stringify(row)).join('\n')).length, records.length, 'JSONEachRow parses too');
assert.equal(parseSqlResult(JSON.stringify(sqlResult.data)).length, records.length, 'a bare array parses');
assert.deepEqual(parseSqlResult(''), []);

const summary = summarizeTelemetry(rows);
assert.equal(summary.rows, records.length);
// A (w2) + B + C (interval 3) + D + E + F + G + H = 2 + 1 + 3 + 1 + 1 + 1 + 1 + 1
assert.equal(summary.sessions, 11, 'sessions are weighted by the clean-session weight and the sample interval; watchdog-only sids count once');
assert.equal(summary.ready, 5, 'A (2) + D + F (an error after ready) + H reached ready');
assert.equal(summary.readyRate, 5 / 11);
assert.equal(summary.entered, 2, 'only the folded solo entry of A entered a battle (weighted)');
assert.equal(summary.errored, 3, 'B, E and F carry errors');
assert.equal(summary.halted, 3, 'C halted, three times over its sample interval');
assert.equal(summary.left, 1);
assert.deepEqual(summary.bootMs, { p50: 4200, p90: 6100, samples: 3 }, 'boot-to-ready comes from ready session records only');
assert.deepEqual(summary.bootByBuild[build], { p50: 4200, p90: 6100, samples: 3 });
assert.deepEqual(summary.stageMs.vehicle, { p50: 900, p90: 1500, samples: 2 });
assert.deepEqual(summary.stageMs.gaps, { p50: 3, p90: 3, samples: 1 }, 'gap entries fold into one row');
assert.deepEqual(summary.entries, { ok: 2, failed: 1, cancelled: 0, timeout: 0 });
assert.deepEqual(summary.entryByMode, { 'solo:ok': 2, 'network:failed': 1 });
assert.deepEqual(summary.lastStageWithoutReady, { renderer: 3, sky: 1, download: 1, vehicle: 1 },
  'sessions that never reached ready are grouped by the last stage they began, the watchdog verdict included');
assert.deepEqual(summary.capabilityClasses, { 'apple/desktop/high': 5, 'unknown/mobile/low': 3, 'software/desktop/high': 1 });
assert.deepEqual(summary.memoryClasses, { high: 6, low: 3 });
assert.deepEqual(summary.capabilityFlags, { 'gl2/hw/cbf/st/wk': 5, 'nogl2/hw/cbf/st/wk': 3, 'gl2/sw/cbf/st/wk': 1 });
assert.deepEqual(summary.capabilityVerdicts, { 'halted:no_webgl2': 3, 'notice:software_rendering': 1 });
assert.deepEqual(summary.notes, { 'slow_reveal:extended': 1, 'ice_degraded:turn_service_unconfigured': 1, 'room_failure:rtc_connect_timeout': 1 });
assert.deepEqual(summary.builds, {
  [build]: { sessions: 8, ready: 5, entered: 2, errored: 3 },
  'v0.9.0': { sessions: 3, ready: 0, entered: 0, errored: 0 },
});
assert.deepEqual(summary.failures.map(({ kind, stage, code, build: b, count }) => [kind, stage, code, b, count]).sort(), [
  ['entry', 'network', 'entry_failed_peer', build, 1],
  ['error', 'download', 'chunk', build, 1],
  ['error', 'ready', 'uncaught', build, 1],
  ['error', 'sky', 'uncaught', build, 1],
  ['error', 'sky', 'unhandled_rejection', build, 1],
  ['halted', 'renderer', 'no_webgl2', 'v0.9.0', 3],
  ['left', 'vehicle', null, build, 1],
].sort());
assert.equal(summary.failures.find(({ code }) => code === 'chunk').sample, 'A game file failed to download (sky-1.js)');
assert.equal(summary.failures.find(({ code }) => code === 'entry_failed_peer').sample, 'peer gone');

const recent = summarizeTelemetry(rows, { since: parseSince('24h', Date.parse('2026-09-25T12:00:00.000Z')) });
assert.equal(recent.sessions, 10, '--since drops rows older than the window on saved files');
assert.equal(parseSince('90m', 1_000_000), 1_000_000 - 90 * 60_000);
assert.equal(parseSince('7d', 0), -7 * 86_400_000);
assert.equal(parseSince('soon'), null);

const text = formatTelemetryReport(summary);
assert.match(text, /^ENTRY FUNNEL/);
assert.match(text, /sessions 11 {2}ready 5 \(45\.5%\)/);
assert.match(text, /entered a battle 2 \(18\.2%\)/);
assert.match(text, /boot-to-ready p50 4200 ms {2}p90 6100 ms/);
assert.match(text, /entry results: ok 2 {2}failed 1/);
assert.match(text, /\n {4}sky\s+1\n/);
assert.match(text, /CAPABILITY[\s\S]*apple\/desktop\/high\s+5/);
assert.match(text, /halted:no_webgl2\s+3/);
assert.match(text, /FAILURES[\s\S]*error\s+sky\s+uncaught[\s\S]*Injected sky failure/);
assert.doesNotMatch(text, /sessionAAAA/, 'session ids are aggregated, never listed');
const empty = formatTelemetryReport(summarizeTelemetry([]));
assert.match(empty, /sessions 0 {2}ready 0 \(n\/a\)/);
assert.match(empty, /FAILURES[\s\S]*none/);

// The Vercel fallback's log lines: raw, and wrapped the way `vercel logs --json` emits them.
const logLines = records.map(([stamp, record], index) => {
  const line = JSON.stringify({ tag: 'cot-telemetry', at: stamp, ...validateTelemetryRecord(record).record });
  if (index % 3 === 0) return line;
  if (index % 3 === 1) return JSON.stringify({ timestampInMs: Date.parse(stamp), level: 'info', message: line, source: 'lambda' });
  return `${stamp} [info] ${line}`;
});
const fromLogs = parseLogLines([...logLines, 'not json at all', '{"tag":"other","message":"x"}', JSON.stringify({ message: 'no record here' })].join('\n'));
assert.equal(fromLogs.length, records.length, 'raw lines, vercel logs --json wrappers and prefixed lines all parse; junk is skipped');
assert.equal(fromLogs[0].at, at(50));
assert.deepEqual(fromLogs[0].timings, records[0][1].t);
const logSummary = summarizeTelemetry(fromLogs);
assert.equal(logSummary.sessions, 9, 'log rows carry no sample interval (C counts once): 2 + 1 + 1 + 1 + 1 + 1 + 1 + 1');
assert.equal(logSummary.ready, 5);
assert.deepEqual(logSummary.failures.find(({ kind }) => kind === 'halted'), { kind: 'halted', stage: 'renderer', code: 'no_webgl2', build: 'v0.9.0', count: 1, sample: null });

const query = telemetryQuery({ since: '24h', limit: 500 });
assert.match(query, new RegExp(`^SELECT timestamp, _sample_interval, index1, blob1, .*blob${TELEMETRY_BLOBS.length}, double1, .*double${TELEMETRY_DOUBLES.length} FROM ${TELEMETRY_DATASET} `));
assert.match(query, /WHERE timestamp > NOW\(\) - INTERVAL '24' HOUR ORDER BY timestamp DESC LIMIT 500 FORMAT JSON$/);
assert.match(telemetryQuery({ since: '90m' }), /INTERVAL '90' MINUTE/);
assert.match(telemetryQuery(), /INTERVAL '7' DAY ORDER BY timestamp DESC LIMIT 20000/);
assert.throws(() => telemetryQuery({ since: 'soon' }), /--since expects/);

const calls = [];
const fetched = await fetchTelemetryRows({
  env: { CLOUDFLARE_ACCOUNT_ID: 'acct123', CLOUDFLARE_API_TOKEN: 'secret-token' }, since: '24h', limit: 10,
  fetchImpl: async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, text: async () => JSON.stringify(sqlResult) }; },
});
assert.equal(fetched.length, records.length);
assert.equal(calls[0].url, 'https://api.cloudflare.com/client/v4/accounts/acct123/analytics_engine/sql');
assert.equal(calls[0].init.headers.authorization, 'Bearer secret-token');
assert.equal(calls[0].init.body, telemetryQuery({ since: '24h', limit: 10 }));
await assert.rejects(fetchTelemetryRows({ env: {} }), /No telemetry sink configured/, 'without credentials the report explains what to set');
await assert.rejects(fetchTelemetryRows({ env: { CLOUDFLARE_ACCOUNT_ID: 'a', CLOUDFLARE_API_TOKEN: 't' },
  fetchImpl: async () => ({ ok: false, status: 401, text: async () => 'unauthorized' }) }), /answered 401/);

const dir = await mkdtemp(join(tmpdir(), 'cot-telemetry-report-'));
const jsonFile = join(dir, 'result.json');
await writeFile(jsonFile, JSON.stringify(sqlResult));
assert.equal((await loadTelemetryRows({ fromJson: jsonFile })).length, records.length, 'a saved SQL API result loads');
const logsFile = join(dir, 'logs.jsonl');
await writeFile(logsFile, logLines.join('\n'));
assert.equal((await loadTelemetryRows({ logs: logsFile })).length, records.length, 'a vercel logs dump loads');
await assert.rejects(loadTelemetryRows({ env: {} }), /No telemetry sink configured/);

console.log('telemetry-report.selftest: SQL rows, log lines, weighted funnel, capability classes, failure table, query and loaders pass');
