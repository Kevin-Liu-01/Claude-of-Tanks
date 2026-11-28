import assert from 'node:assert/strict';
import {
  TELEMETRY_BLOBS, TELEMETRY_DOUBLES, TELEMETRY_MAX_BODY_BYTES, parseTelemetryTimings,
  serializeTelemetryTimings, telemetryCapabilityClass, telemetryDataPoint, telemetryRowFromRecord,
  telemetryRowFromSql, validateTelemetryRecord,
} from './telemetryRecord.ts';
import { TELEMETRY_STAGE_SLOTS } from '../src/entry/telemetrySchema.ts';

// The shared v2 record: every refusal, every bound, and the Analytics Engine
// column layout both directions (record → data point → SQL row → named row).

const session = {
  v: 2, sid: 'sabcdef0123456789', build: 'v1.0.0+gd464a813f', kind: 'session', outcome: 'ready', stage: 'ready',
  ms: 4200.4, mode: 'unknown', w: 1,
  t: { imports: 12, renderer: 40, 'gap>sky': 3, sky: 300, lighting: 20, garage: 110, vehicle: 900, hud: 30, ui: 25,
    audio: 5, post: 40, ready: 7 },
  cap: { webgl2: true, rendererFamily: 'apple', software: false, maxTextureUnits: 16, maxTextureSize: 16384,
    vertexTextureUnits: 16, colorBufferFloat: true, storage: true, worker: true, memoryClass: 'high',
    tier: 'desktop', autoTier: 'high', requiredTextureUnits: 16 },
  capOutcome: 'ok',
  entry: { mode: 'solo', outcome: 'ok', ms: 3000 },
  notes: ['slow_reveal:paint:extended'],
};

{
  const validated = validateTelemetryRecord(session);
  assert.equal(validated.ok, true, JSON.stringify(validated));
  const { record } = validated;
  assert.equal(record.ms, 4200, 'milliseconds are rounded');
  assert.deepEqual(record.t, session.t);
  assert.deepEqual(record.cap, session.cap, 'the whitelisted capability summary survives intact');
  assert.deepEqual(record.entry, { mode: 'solo', outcome: 'ok', ms: 3000 });
  assert.deepEqual(record.notes, ['slow_reveal:paint:extended']);
  assert.equal(record.error, undefined);

  const point = telemetryDataPoint(record);
  assert.equal(point.blobs.length, TELEMETRY_BLOBS.length);
  assert.equal(point.doubles.length, TELEMETRY_DOUBLES.length);
  assert.ok(TELEMETRY_BLOBS.length <= 20 && TELEMETRY_DOUBLES.length <= 20, 'Analytics Engine takes twenty blobs and twenty doubles');
  assert.deepEqual(point.indexes, ['v1.0.0+gd464a813f'], 'the build is the sampling index');
  assert.ok(point.blobs.reduce((n, blob) => n + Buffer.byteLength(blob), 0) < 16 * 1024, 'blobs stay far below the 16 KB point limit');
  const blob = (name) => point.blobs[TELEMETRY_BLOBS.indexOf(name)];
  const double = (name) => point.doubles[TELEMETRY_DOUBLES.indexOf(name)];
  assert.equal(blob('kind'), 'session');
  assert.equal(blob('outcome'), 'ready');
  assert.equal(blob('rendererFamily'), 'apple');
  assert.equal(blob('capClass'), 'gl2/hw/cbf/st/wk');
  assert.equal(blob('capVerdict'), 'ok');
  assert.equal(blob('entry'), 'solo:ok:');
  assert.equal(blob('timings'), serializeTelemetryTimings(session.t));
  assert.equal(blob('notes'), 'slow_reveal:paint:extended');
  assert.equal(blob('schema'), 'v2');
  assert.equal(double('ms'), 4200);
  assert.equal(double('ready'), 1);
  assert.equal(double('weight'), 1);
  assert.equal(double('stage:vehicle'), 900);
  assert.equal(double('stage:studio'), -1, 'an absent stage slot is -1, never 0');
  assert.equal(double('gaps'), 3, 'gap entries are summed into one double');
  assert.equal(TELEMETRY_STAGE_SLOTS.length, 12);

  const row = telemetryRowFromRecord(record, '2026-09-25 12:00:00');
  assert.equal(row.kind, 'session');
  assert.equal(row.at, '2026-09-25 12:00:00');
  assert.equal(row.sampleInterval, 1);
  assert.deepEqual(row.timings, session.t, 'the timings blob round-trips');
  assert.deepEqual(row.entry, { mode: 'solo', outcome: 'ok' });
  assert.equal(row.ready, true);
  assert.equal(row.ms, 4200);
  assert.equal(row.maxTextureUnits, 16);
  assert.equal(row.sid, 'sabcdef0123456789');
  const sql = telemetryRowFromSql({ timestamp: 't', _sample_interval: 4, blob1: 'error', blob2: 'dev', blob3: 'halted',
    blob4: 'download', blob5: 'chunk', blob14: 'A game file failed', double1: 31000, double2: 1, double3: 0 });
  assert.equal(sql.kind, 'error');
  assert.equal(sql.sampleInterval, 4, 'sampled rows carry their interval');
  assert.equal(sql.ready, false);
  assert.equal(sql.entry, null);
  assert.deepEqual(sql.timings, {});
  assert.equal(sql.message, 'A game file failed');
}

{
  const error = validateTelemetryRecord({ v: 2, sid: 'sabcdef0123456789', build: 'dev', kind: 'error', stage: 'sky',
    code: 'uncaught', ready: false, ms: 812.7, error: { message: 'Injected\x00  failure', frames: ['a', 'b', 'c', 'd'] } });
  assert.equal(error.ok, true, JSON.stringify(error));
  assert.equal(error.record.outcome, undefined, 'an error record needs no outcome');
  assert.equal(error.record.error.message, 'Injected failure', 'control characters are stripped');
  assert.deepEqual(error.record.error.frames, ['a', 'b', 'c'], 'three frames are kept');
  assert.equal(error.record.ready, false);
  assert.equal(error.record.ms, 813);
  const point = telemetryDataPoint(error.record);
  assert.equal(point.doubles[TELEMETRY_DOUBLES.indexOf('ready')], 0);
  assert.equal(point.blobs[TELEMETRY_BLOBS.indexOf('frames')], 'a | b | c');
  const watchdog = validateTelemetryRecord({ v: 2, sid: 'inline-boot-1', build: 'v1.0.0', kind: 'error', stage: 'download',
    code: 'chunk', outcome: 'halted', ms: 61000, error: { message: 'A game file failed to download (sky-1.js)', frames: ['sky-1.js'] } });
  assert.equal(watchdog.ok, true, 'the inline watchdog verdict is an error record with an outcome');
  assert.equal(watchdog.record.outcome, 'halted');
  const folded = validateTelemetryRecord({ ...session, outcome: 'error', error: { message: 'boom', frames: [], stage: 'sky', code: 'uncaught' },
    errors: [{ message: 'second', frames: [] }, { message: 'third', frames: [] }, { message: 'fourth', frames: [] }, { message: 'fifth', frames: [] }] });
  assert.equal(folded.ok, true);
  assert.equal(folded.record.error.stage, 'sky', 'a folded error keeps the stage it interrupted');
  assert.equal(folded.record.errors.length, 3, 'at most three extra errors travel');
  assert.equal(telemetryDataPoint(folded.record).blobs[TELEMETRY_BLOBS.indexOf('stage')], 'ready',
    'the record stage wins over the folded error stage');
  const entry = validateTelemetryRecord({ v: 2, sid: 'sabcdef0123456789', build: 'dev', kind: 'entry', outcome: 'failed',
    mode: 'network', code: 'entry_failed_peer', error: { message: 'peer gone', frames: [] } });
  assert.equal(entry.ok, true);
  assert.equal(telemetryDataPoint(entry.record).blobs[TELEMETRY_BLOBS.indexOf('mode')], 'network');
}

{
  for (const [body, error] of [
    [[1, 2], 'invalid_body'],
    [{ ...session, v: 1 }, 'invalid_record:v'],
    [{ ...session, sid: 'short' }, 'invalid_record:sid'],
    [{ ...session, build: 'v1 0' }, 'invalid_record:build'],
    [{ ...session, kind: 'boot_stage' }, 'invalid_record:kind'],
    [{ ...session, outcome: 'maybe' }, 'invalid_record:outcome'],
    [{ ...session, kind: 'entry', outcome: 'ready' }, 'invalid_record:outcome'],
    [{ ...session, kind: 'error', outcome: 'ready', error: { message: 'x' } }, 'invalid_record:outcome'],
    [{ ...session, kind: 'error', outcome: undefined }, 'invalid_record:error'],
    [{ ...session, stage: 'has space' }, 'invalid_record:stage'],
    [{ ...session, code: 'bad code!' }, 'invalid_record:code'],
    [{ ...session, mode: 'ranked' }, 'invalid_record:mode'],
    [{ ...session, capOutcome: 'great' }, 'invalid_record:capOutcome'],
    [{ ...session, capCode: 'no way' }, 'invalid_record:capCode'],
    [{ ...session, entry: { outcome: 'maybe' } }, 'invalid_record:entry'],
    [{ ...session, entry: { outcome: 'ok', mode: 'ranked' } }, 'invalid_record:entry'],
  ]) {
    const refused = validateTelemetryRecord(body);
    assert.equal(refused.ok, false, `${error} is refused`);
    assert.equal(refused.error, error);
  }
  for (const [body, field] of [
    [{ ...session, ip: '1.2.3.4' }, 'ip'],
    [{ ...session, userAgent: 'Mozilla' }, 'userAgent'],
    [{ ...session, cap: { ...session.cap, email: 'a@b.c' } }, 'email'],
    [{ ...session, entry: { outcome: 'ok', roomCode: 'ABCDEF' } }, 'roomCode'],
    [{ ...session, error: { message: 'x', hostName: 'h' } }, 'hostName'],
    [{ ...session, errors: [{ message: 'x', playerName: 'Kevin' }] }, 'playerName'],
    [{ ...session, notes: [{ token: 'x' }] }, 'token'],
  ]) {
    const refused = validateTelemetryRecord(body);
    assert.equal(refused.ok, false, `${field} is a personal field`);
    assert.equal(refused.error, `pii_field:${field}`);
  }
  const dropped = validateTelemetryRecord({ ...session, unknownField: 1, ready: 'yes', w: 0,
    t: { renderer: 12.4, 'gap>sky': 3, 'bad key': 9, deep: { nested: 1 }, ...Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`extra${i}`, i])) },
    cap: { rendererFamily: 'NVIDIA', maxTextureUnits: -5, memoryClass: 'huge', webgl2: 'yes' },
    notes: ['fine', 'not fine!', 'fine', 'a', 'b', 'c', 'd', 'e', 'f'] });
  assert.equal(dropped.ok, true, 'unknown fields are dropped, not refused');
  assert.equal(dropped.record.unknownField, undefined);
  assert.equal(dropped.record.ready, undefined, 'a non-boolean ready is dropped');
  assert.equal(dropped.record.w, undefined, 'a zero weight is dropped');
  assert.equal(Object.keys(dropped.record.t).length, 24, 'timings keep the first 24 well-formed keys');
  assert.deepEqual(Object.entries(dropped.record.t).slice(0, 2), [['renderer', 12], ['gap>sky', 3]]);
  assert.deepEqual(dropped.record.cap, { rendererFamily: 'nvidia' }, 'capability keeps only whitelisted well-typed values');
  assert.deepEqual(dropped.record.notes, ['fine', 'a', 'b', 'c', 'd', 'e'], 'notes are deduplicated, bounded to the code alphabet and capped at six');
}

{
  assert.equal(telemetryCapabilityClass(undefined), '');
  assert.equal(telemetryCapabilityClass({ webgl2: false }), 'nogl2/?/?/?/?');
  assert.deepEqual(parseTelemetryTimings('renderer=40;sky=300;junk;=1;bad key=2;gap>sky=3'), { renderer: 40, sky: 300, 'gap>sky': 3 });
  assert.equal(serializeTelemetryTimings(undefined), '');
  assert.equal(TELEMETRY_MAX_BODY_BYTES, 2048);
  const worst = validateTelemetryRecord({ ...session, outcome: 'error', error: { message: 'x'.repeat(200), frames: ['y'.repeat(160), 'y'.repeat(160), 'y'.repeat(160)], stage: 'sky', code: 'uncaught' } });
  assert.ok(Buffer.byteLength(JSON.stringify(worst.record)) < TELEMETRY_MAX_BODY_BYTES,
    'a full session with a maximal folded error still fits the Worker body cap');
}

console.log('telemetryRecord.selftest: v2 validation, personal-field refusal, bounds, and the Analytics Engine layout round-trip pass');
