import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  formatTelemetryReport, loadTelemetryEvents, parseSince, parseTelemetryRows, summarizeTelemetry,
} from './telemetry-report.mjs';

const at = (minutesAgo) => new Date(Date.parse('2026-09-24T12:00:00.000Z') - minutesAgo * 60_000).toISOString();
const build = 'v1.0.0+gd464a813f';
const rows = [
  // session A: full boot, solo battle ok
  { v: 1, at: at(50), sid: 'sessionAAAA', build, kind: 'boot_stage', stage: 'renderer', phase: 'begin' },
  { v: 1, at: at(50), sid: 'sessionAAAA', build, kind: 'boot_stage', stage: 'renderer', phase: 'end', ms: 40 },
  { v: 1, at: at(50), sid: 'sessionAAAA', build, kind: 'boot_stage', stage: 'vehicle', phase: 'end', ms: 900 },
  { v: 1, at: at(49), sid: 'sessionAAAA', build, kind: 'boot_ready', ms: 4200 },
  { v: 1, at: at(48), sid: 'sessionAAAA', build, kind: 'entry_result', mode: 'solo', outcome: 'ok', ms: 3000 },
  // session B: died in the sky stage (uncaught), never ready
  { v: 1, at: at(40), sid: 'sessionBBBB', build, kind: 'boot_stage', stage: 'renderer', phase: 'begin' },
  { v: 1, at: at(40), sid: 'sessionBBBB', build, kind: 'boot_stage', stage: 'sky', phase: 'begin' },
  { v: 1, at: at(40), sid: 'sessionBBBB', build, kind: 'boot_error', stage: 'sky', code: 'uncaught',
    error: { message: 'Injected sky failure', frames: ['at bake (/assets/sky-1.js:1:1)'] } },
  // session C: capability stop, older build
  { v: 1, at: at(30), sid: 'sessionCCCC', build: 'v0.9.0', kind: 'capability', outcome: 'halted', code: 'no_webgl2',
    reason: 'webgl2_unavailable', capability: { webgl2: false, rendererFamily: 'unknown' } },
  // session D: network entry failed after a degraded ICE room, plus a room failure
  { v: 1, at: at(20), sid: 'sessionDDDD', build, kind: 'boot_ready', ms: 6100 },
  { v: 1, at: at(19), sid: 'sessionDDDD', build, kind: 'ice_degraded', reason: 'turn_service_unconfigured' },
  { v: 1, at: at(18), sid: 'sessionDDDD', build, kind: 'room_failure', code: 'rtc_connect_timeout' },
  { v: 1, at: at(18), sid: 'sessionDDDD', build, kind: 'entry_result', mode: 'private', outcome: 'failed',
    code: 'rtc_connect_timeout' },
  { v: 1, at: at(17), sid: 'sessionDDDD', build, kind: 'slow_reveal', stage: 'primeReveal', code: 'extended', ms: 1600 },
  // 2026-09-25: the damage panel gave up on the M1A3's top-down masks
  { v: 1, at: at(16), sid: 'sessionDDDD', build, kind: 'hud_mask_failed', stage: 'damagePanel',
    code: 'top_mask_source_disposed', reason: 'm1a3', error: { message: 'top_mask_source_disposed', frames: [] } },
  // session E: very old, filtered out by --since
  { v: 1, at: at(60 * 48), sid: 'sessionEEEE', build, kind: 'boot_ready', ms: 100 },
];

const events = parseTelemetryRows([
  ...rows.slice(0, 5).map((row) => JSON.stringify({ tag: 'cot-telemetry', ...row })),
  ...rows.slice(5, 9).map((row) => `2026-09-24T11:20:00.000Z  ${JSON.stringify({ tag: 'cot-telemetry', ...row })}`),
  ...rows.slice(9),
  'not json at all', '{"kind":"boot_ready"}', '{"sid":"x"}', 42,
]);
assert.equal(events.length, rows.length, 'stored strings, log lines and objects parse; junk rows are skipped');

const summary = summarizeTelemetry(events);
assert.equal(summary.events, rows.length);
assert.equal(summary.sessions, 5);
assert.equal(summary.ready, 3);
assert.equal(summary.readyRate, 3 / 5);
assert.equal(summary.errored, 1);
assert.equal(summary.entered, 2);
assert.deepEqual(summary.entries, { ok: 1, failed: 1, cancelled: 0, timeout: 0, halted: 0, notice: 0 });
assert.deepEqual(summary.entryByMode, { 'solo:ok': 1, 'private:failed': 1 });
assert.deepEqual(summary.lastStageWithoutReady, { sky: 1, '(before renderer)': 1 },
  'sessions that never reached ready are grouped by the last stage they began');
assert.deepEqual(summary.capabilityStops, { no_webgl2: 1 });
assert.deepEqual(summary.iceDegraded, { turn_service_unconfigured: 1 });
assert.deepEqual(summary.roomFailures, { rtc_connect_timeout: 1 });
assert.deepEqual(summary.slowReveals, { extended: 1 });
assert.deepEqual(summary.hudMaskFailures, { 'm1a3:top_mask_source_disposed': 1 }, 'mask failures count per tank and pipeline code');
assert.deepEqual(summary.bootMs, { p50: 4200, p90: 6100, samples: 3 });
assert.deepEqual(summary.stageMs.vehicle, { p50: 900, p90: 900, samples: 1 });
assert.deepEqual(summary.builds, {
  [build]: { sessions: 4, ready: 3, errors: 1 },
  'v0.9.0': { sessions: 1, ready: 0, errors: 0 },
});
assert.deepEqual(summary.failures.map(({ kind, stage, code, build: b, count }) => [kind, stage, code, b, count]).sort(), [
  ['boot_error', 'sky', 'uncaught', build, 1],
  ['capability', null, 'no_webgl2', 'v0.9.0', 1],
  ['entry_result', null, 'rtc_connect_timeout', build, 1],
  ['room_failure', null, 'rtc_connect_timeout', build, 1],
  ['hud_mask_failed', 'damagePanel', 'top_mask_source_disposed', build, 1],
].sort());
assert.equal(summary.failures.find(({ kind }) => kind === 'boot_error').sample, 'Injected sky failure');
assert.equal(summary.failures.find(({ kind }) => kind === 'hud_mask_failed').sample, 'top_mask_source_disposed');

const recent = summarizeTelemetry(events, { since: parseSince('24h', Date.parse('2026-09-24T12:00:00.000Z')) });
assert.equal(recent.sessions, 4, '--since drops events older than the window');
assert.equal(parseSince('90m', 1_000_000), 1_000_000 - 90 * 60_000);
assert.equal(parseSince('7d', 0), -7 * 86_400_000);
assert.equal(parseSince('soon'), null);

const text = formatTelemetryReport(summary);
assert.match(text, /^ENTRY FUNNEL/);
assert.match(text, /sessions 5 {2}ready 3 \(60\.0%\)/);
assert.match(text, /boot-to-ready p50 4200 ms {2}p90 6100 ms/);
assert.match(text, /entry results: ok 1 {2}failed 1/);
assert.match(text, /\n {4}sky\s+1\n/);
assert.match(text, /\n {4}no_webgl2\s+1\n/);
assert.match(text, /HUD mask failures \(tank:code\):\n {4}m1a3:top_mask_source_disposed\s+1\n/);
assert.match(text, /FAILURES[\s\S]*boot_error\s+sky\s+uncaught[\s\S]*Injected sky failure/);
assert.doesNotMatch(text, /sessionAAAA/, 'session ids are aggregated, never listed');

const dir = await mkdtemp(join(tmpdir(), 'cot-telemetry-report-'));
const jsonl = join(dir, 'events.jsonl');
await writeFile(jsonl, rows.map((row) => JSON.stringify(row)).join('\n'));
assert.equal((await loadTelemetryEvents({ file: jsonl })).length, rows.length, 'a JSON-lines dump loads');
const jsonArray = join(dir, 'events.json');
await writeFile(jsonArray, JSON.stringify(rows));
assert.equal((await loadTelemetryEvents({ file: jsonArray })).length, rows.length, 'a JSON array loads');
await assert.rejects(loadTelemetryEvents({ env: {} }), /No telemetry store configured/,
  'without credentials or a file the report explains what to set');
const empty = formatTelemetryReport(summarizeTelemetry([]));
assert.match(empty, /sessions 0 {2}ready 0 \(n\/a\)/);
assert.match(empty, /FAILURES[\s\S]*none/);

console.log('telemetry-report.selftest: funnel, failure table, since-window and file loading pass');
