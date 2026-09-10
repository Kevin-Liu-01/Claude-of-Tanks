import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createFrameTraceCollector, startMultiplayerFrameTrace } from './multiplayer-frame-trace.mjs';

const marker = { name: 'cot-multiplayer-trace-start', cat: 'blink.user_timing', ph: 'I',
  ts: 1_000_000, pid: 11, tid: 22, args: { url: 'PRIVATE_URL' } };
const endMarker = { ...marker, name: 'cot-multiplayer-trace-end', ts: 1_300_000 };
const event = (name, ts, dur, extra = {}) => ({ name, ts, dur, ph: 'X', pid: 11, tid: 22,
  args: { token: 'PRIVATE_TOKEN' }, ...extra });
const collector = createFrameTraceCollector({ maxRows: 5 });
collector.add([marker, event('RunTask', 1_010_000, 250_000),
  event('MinorGC', 1_015_000, 220_000), event('PRIVATE_NAME', 1_000_000, 1_000_000),
  { name: 'thread_name', ph: 'M', pid: 30, tid: 40, args: { name: 'CrGpuMain' } },
  event('GPUTask', 1_020_000, 800, { pid: 30, tid: 40 }),
  event('Paint', 1_100_000, undefined, { ph: 'B' }),
  event('', 1_104_000, undefined, { ph: 'E' })]);
collector.add([endMarker]);
const report = collector.finish(500, false, 800);
assert.equal(report.complete, true);
assert.deepEqual(report.rows.map(row => [row.kind, row.startOffsetMs, row.durationMs, row.thread]),
  [['task', 10, 250, 'page-main'], ['minor-gc', 15, 220, 'page-main'],
    ['gpu-task', 20, 0.8, 'gpu'], ['paint', 100, 4, 'page-main']]);
assert.doesNotMatch(JSON.stringify(report), /PRIVATE|args|pid|tid|url/i);
assert.equal(report.baselinePageTimeMs, 500);
assert.equal(report.captureEndPageTimeMs, 800);
assert.equal(report.clockDriftMs, 0);
assert.equal(report.diagnosticOverhead, true);

const scriptEvents = [
  ['EvaluateScript', 'script-evaluation'], ['v8.evaluateModule', 'script-evaluation'],
  ['v8.compile', 'script-compilation'], ['v8.compileModule', 'script-compilation'],
  ['RunMicrotasks', 'microtasks'], ['RunYieldContinuation', 'yield-continuation'],
];
for (const [name, kind] of scriptEvents) {
  const scripts = createFrameTraceCollector();
  scripts.add([marker, event(name, 1_001_000, 99), event(name, 1_002_000, 100),
    event(name, 1_003_000, undefined, { ph: 'B' }),
    event('PRIVATE_CHILD', 1_003_100, undefined, { ph: 'B' }),
    event('', 1_003_200, undefined, { ph: 'E' }),
    event('', 1_004_000, undefined, { ph: 'E' }), endMarker]);
  const result = scripts.finish(500, false, 800);
  assert.equal(result.complete, true, name);
  assert.equal(result.subThresholdEvents, 1, `${name}: ordinary duration threshold remains unchanged`);
  assert.deepEqual(result.rows, [
    { kind, startOffsetMs: 2, durationMs: 0.1, thread: 'page-main' },
    { kind, startOffsetMs: 3, durationMs: 1, thread: 'page-main' },
  ], `${name}: complete and begin/end durations normalize without raw event data`);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|args|pid|tid|url/i);

  const dropped = createFrameTraceCollector({ maxRows: 1 });
  dropped.add([marker, event(name, 1_001_000, 1000), event(name, 1_002_000, 1000), endMarker]);
  const lost = dropped.finish(500, false, 800);
  assert.equal(lost.complete, false, `${name}: row loss remains fail-closed`);
  assert.equal(lost.rowsDropped, 1);
  assert.equal(lost.rows.length, 1);
  assert.equal(lost.scriptDetail, 'selected-evaluation-compilation-microtask-continuation-events',
    'configured detail never promises that every script event survived');

  const open = createFrameTraceCollector();
  open.add([marker, event(name, 1_001_000, undefined, { ph: 'B' }), endMarker]);
  const unfinishedScript = open.finish(500, false, 800);
  assert.equal(unfinishedScript.complete, false, `${name}: open selected script interval is incomplete`);
  assert.equal(unfinishedScript.openDurationEvents, 1);
  assert.deepEqual(unfinishedScript.openIntervals, [{ kind, startOffsetMs: 1, thread: 'page-main' }]);
  assert.doesNotMatch(JSON.stringify(unfinishedScript), /PRIVATE|args|pid|tid|url/i);

  for (const invalid of [event(name, NaN, 500), event(name, 1_001_000, -1),
    event(name, 1_001_000, undefined), event(name, 1_001_000, 60_000_001),
    event(name, 1_001_000, 500, { tid: 'PRIVATE_THREAD' })]) {
    const malformedScript = createFrameTraceCollector();
    malformedScript.add([marker, invalid, endMarker]);
    const rejected = malformedScript.finish(500, false, 800);
    assert.equal(rejected.complete, false, name);
    assert.equal(rejected.malformed, 1);
    assert.deepEqual(rejected.rows, []);
    assert.doesNotMatch(JSON.stringify(rejected), /PRIVATE|args|pid|tid|url/i);
  }
}

const nestedScripts = createFrameTraceCollector();
nestedScripts.add([marker,
  event('RunMicrotasks', 1_001_000, undefined, { ph: 'B' }),
  event('EvaluateScript', 1_002_000, 6000),
  event('v8.compileModule', 1_003_000, undefined, { ph: 'B' }),
  event('', 1_005_000, undefined, { ph: 'E' }),
  event('RunYieldContinuation', 1_006_000, 1000),
  event('', 1_009_000, undefined, { ph: 'E' }),
  event('V8.CompileModule', 1_010_000, 1000), event('V8.StackGuard', 1_011_000, 1000), endMarker]);
const nestedScriptReport = nestedScripts.finish(500, false, 800);
assert.equal(nestedScriptReport.complete, true);
assert.deepEqual(nestedScriptReport.rows.map(row => [row.kind, row.startOffsetMs, row.durationMs]),
  [['microtasks', 1, 8], ['script-evaluation', 2, 6], ['script-compilation', 3, 2],
    ['yield-continuation', 6, 1]], 'inclusive nested intervals survive; no broad V8-name matching');
assert.equal(nestedScriptReport.durationMeaning,
  'Inclusive wall time; union overlapping page-main intervals within the sample, not additive or leaf CPU time; other labels may combine threads');
assert.equal(nestedScriptReport.scriptDetail, 'selected-evaluation-compilation-microtask-continuation-events');
assert.equal(nestedScriptReport.rows.reduce((sum, row) => sum + row.durationMs, 0), 17,
  'nested fixture has 17 ms of additive durations but only 8 ms of covered wall time');
assert.equal(Math.max(...nestedScriptReport.rows.map(row => row.startOffsetMs + row.durationMs)) -
  Math.min(...nestedScriptReport.rows.map(row => row.startOffsetMs)), 8,
  'these fully nested same-thread intervals occupy one 8 ms union, not 17 ms of CPU');
assert.doesNotMatch(JSON.stringify(nestedScriptReport), /PRIVATE|args|pid|tid|url/i);

const shortEvents = createFrameTraceCollector();
shortEvents.add([marker, event('RunTask', 1_001_000, 90),
  event('MinorGC', 1_002_000, 90, { cat: 'devtools.timeline,v8' }),
  event('MajorGC', 1_003_000, undefined, { ph: 'B', cat: 'devtools.timeline,v8' }),
  event('', 1_003_050, undefined, { ph: 'E', cat: 'devtools.timeline,v8' }), endMarker]);
assert.equal(shortEvents.finish(500, false, 800).subThresholdEvents, 1);
assert.deepEqual(shortEvents.finish(500, false, 800).rows.map(row => [row.kind, row.durationMs]),
  [['minor-gc', 0.09], ['major-gc', 0.05]],
  'top-level minor and major pauses survive below the ordinary 0.1 ms duration threshold');
assert.equal(shortEvents.finish(500, false, 800).gcDurationThresholdMs, 0);
assert.equal(shortEvents.finish(500, false, 800).allGcDurationsRetained, undefined,
  'threshold policy is not an unconditional claim that every GC event survived capture');

const limited = createFrameTraceCollector({ maxRows: 1 });
limited.add([marker, event('MajorGC', 1_001_000, 1000), event('Paint', 1_002_000, 1000)]);
assert.equal(limited.finish(100, false).complete, false);
assert.equal(limited.finish(100, false).rowsDropped, 1);
assert.equal(limited.finish(100, false).gcDurationThresholdMs, 0,
  'an incomplete trace still reports the filtering policy without promising retention');
assert.equal(collector.finish(500, true).complete, false, 'Chrome data loss invalidates completeness');
assert.equal(createFrameTraceCollector().finish(500, false).complete, false, 'missing clock marker is not aligned');
assert.equal(createFrameTraceCollector().finish(NaN, false).complete, false);
assert.throws(() => createFrameTraceCollector({ maxRows: 50_001 }), /invalid_options/);
assert.throws(() => createFrameTraceCollector({ durationMs: 30_001 }), /invalid_options/);

// Every begin participates in stack nesting, including ignored events.
const nested = createFrameTraceCollector();
nested.add([marker, event('RunTask', 1_001_000, undefined, { ph: 'B' }),
  event('PRIVATE_NESTED', 1_002_000, undefined, { ph: 'B' }),
  event('', 1_003_000, undefined, { ph: 'E' }),
  event('', 1_005_000, undefined, { ph: 'E' })]);
assert.deepEqual(nested.finish(10, false).rows.map(row => [row.kind, row.durationMs]), [['task', 4]]);
const unfinished = createFrameTraceCollector();
unfinished.add([marker, event('MajorGC', 1_002_000, undefined, { ph: 'B' })]);
assert.equal(unfinished.finish(0, false).openDurationEvents, 1);
assert.equal(unfinished.finish(0, false).complete, false);
assert.deepEqual(unfinished.finish(0, false).openIntervals,
  [{ kind: 'major-gc', startOffsetMs: 2, thread: 'page-main' }]);
const overflowing = createFrameTraceCollector();
overflowing.add([marker, ...Array.from({ length: 127 }, () => event('ignored', 1_000_000, undefined, { ph: 'B' })),
  event('MajorGC', 1_001_000, undefined, { ph: 'B' }),
  event('ignored', 1_002_000, undefined, { ph: 'B' }),
  event('', 1_003_000, undefined, { ph: 'E' }), event('', 1_004_000, undefined, { ph: 'E' }), endMarker]);
assert.equal(overflowing.finish(500, false, 800).rows[0].durationMs, 3,
  'overflow ends cannot consume retained parent begins');
assert.equal(overflowing.finish(500, false, 800).complete, false);
assert.equal(collector.finish(500, false).complete, false, 'flush alone does not certify sample coverage');

for (const invalid of [
  event('RunTask', undefined, 500), event('RunTask', -1, 500), event('RunTask', 'PRIVATE_CLOCK', 500),
  event('MajorGC', NaN, 500), event('Paint', Infinity, undefined, { ph: 'B' }),
  event('ignored', undefined, undefined, { ph: 'B' }), event('', undefined, undefined, { ph: 'E' }),
  event('RunTask', 1_010_000, 500, { pid: 'PRIVATE_PID' }),
  event('MinorGC', 1_010_000, 500, { tid: 1.5 }),
]) {
  const malformed = createFrameTraceCollector();
  malformed.add([marker, invalid, endMarker]);
  const result = malformed.finish(500, false, 800);
  assert.equal(result.complete, false, 'invalid supported duration evidence cannot certify completeness');
  assert.equal(result.malformed, 1);
  assert.equal(result.rows.length, 0);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
}

class Clock {
  timers = new Map(); next = 0; delays = [];
  setTimeout = (fn, delay) => { this.delays.push(delay); this.timers.set(++this.next, fn); return this.next; };
  clearTimeout = (id) => this.timers.delete(id);
  tick() { const values = [...this.timers.values()]; this.timers.clear(); for (const fn of values) fn(); }
}
function fixture({ startFails = false, markerFails = false, endMarkerFails = false,
  detachFails = false, flush = true } = {}) {
  const clock = new Clock();
  const session = new EventEmitter();
  const sent = [];
  let detached = 0;
  let pageReads = 0;
  session.send = async (method, params) => {
    sent.push({ method, params });
    if (method === 'Tracing.start' && startFails) throw new Error('PRIVATE_ERROR');
    if (method === 'Tracing.end' && flush) {
      session.emit('Tracing.dataCollected', { value: [marker, event('MinorGC', 1_002_000, 6000), endMarker] });
      session.emit('Tracing.tracingComplete', { dataLossOccurred: false });
    }
    return {};
  };
  session.detach = async () => {
    detached++;
    if (detachFails) throw new Error('PRIVATE_DETACH');
  };
  const page = { target: () => ({ createCDPSession: async () => session }), evaluate: async () => {
    if (markerFails || (endMarkerFails && pageReads > 0)) throw new Error('PRIVATE_PAGE');
    return pageReads++ ? 800 : 500;
  } };
  return { page, clock, session, sent, detached: () => detached };
}
const f = fixture();
const trace = await startMultiplayerFrameTrace(f.page, {}, f.clock);
const firstStop = trace.stop();
assert.equal(trace.stop(), firstStop, 'idempotent stop shares flush and cleanup');
const live = await firstStop;
assert.equal(live.complete, true);
assert.equal(live.rows[0].kind, 'minor-gc');
assert.equal(f.detached(), 1);
assert.equal(f.clock.timers.size, 0);
assert.equal(f.session.listenerCount('Tracing.dataCollected'), 0);
const start = f.sent.find(row => row.method === 'Tracing.start').params;
assert.equal(start.transferMode, 'ReportEvents');
assert.equal(start.traceConfig.traceBufferSizeInKb, 32768);
assert.equal(start.traceConfig.recordMode, 'recordUntilFull');
assert.deepEqual(start.traceConfig.includedCategories,
  ['devtools.timeline', 'blink.user_timing', 'toplevel', 'v8.execute'],
  'only microtask execution adds a category; no verbose GPU, GC or compilation phases');
assert.deepEqual(start.traceConfig.excludedCategories, ['*']);
assert.equal(start.traceConfig.enableArgumentFilter, true);
assert.equal(live.gcDetail, 'top-level-pause-events');
assert.equal(limited.finish(100, false).gcDetail, 'top-level-pause-events',
  'detail describes the configured evidence scope, not completeness');
assert.ok(!JSON.stringify(start).includes('screenshot'));
assert.ok(!f.sent.some(row => /collectGarbage|MemoryDump/.test(row.method)));

const failure = fixture({ startFails: true });
await assert.rejects(startMultiplayerFrameTrace(failure.page, {}, failure.clock), /frame_trace_start_failed/);
assert.ok(!failure.sent.some(row => row.method === 'Tracing.end'), 'never stop another owner on start rejection');
assert.equal(failure.detached(), 1);
assert.equal(failure.clock.timers.size, 0);
const badMarker = fixture({ markerFails: true });
await assert.rejects(startMultiplayerFrameTrace(badMarker.page, {}, badMarker.clock), /frame_trace_start_failed/);
assert.equal(badMarker.sent.filter(row => row.method === 'Tracing.end').length, 1);
assert.equal(badMarker.detached(), 1);

for (const timing of ['same-turn', 'after-rejection']) {
  for (const detachFails of [false, true]) {
    const late = fixture({ detachFails });
    let resolveCreation;
    const creation = new Promise(resolve => { resolveCreation = resolve; });
    late.page.target = () => ({ createCDPSession: () => creation });
    const starting = startMultiplayerFrameTrace(late.page, {}, late.clock);
    const rejected = assert.rejects(starting, error => {
      assert.equal(error.message, 'frame_trace_start_failed', 'late cleanup preserves the startup failure');
      assert.doesNotMatch(JSON.stringify(error), /PRIVATE/);
      return true;
    });
    await new Promise(resolve => setImmediate(resolve));
    late.clock.tick();
    // Resolve before the rejected race has reached its catch: the late-owner
    // handler must not depend on an abandonment flag that is still false.
    if (timing === 'same-turn') resolveCreation(late.session);
    await rejected;
    if (timing === 'after-rejection') resolveCreation(late.session);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(late.detached(), 1, `${timing}: every late session detaches exactly once`);
    assert.equal(late.sent.length, 0, 'timed-out creation never starts or stops another trace');
    assert.equal(late.clock.timers.size, 0, 'late cleanup leaves no deadline');
    assert.equal(late.session.eventNames().length, 0, 'no late trace listeners survive');
  }
}

const unflushed = fixture({ flush: false });
const pending = await startMultiplayerFrameTrace(unflushed.page, {}, unflushed.clock);
const stopped = pending.stop();
await new Promise(resolve => setImmediate(resolve));
assert.equal(unflushed.clock.delays.at(-1), 30_000,
  'export flush has a separate bounded budget after the gameplay sample, not a five-second command budget');
unflushed.clock.tick();
await assert.rejects(stopped, error => error.message === 'frame_trace_stop_failed' &&
  error.traceStage === 'flush' && error.traceFailure === 'timeout' && error.completeBeforeStop === false);
assert.equal(unflushed.detached(), 1);
assert.equal(unflushed.clock.timers.size, 0);
assert.throws(() => createFrameTraceCollector({ flushTimeoutMs: 30_001 }), /invalid_options/);

for (const endMarkerFails of [true, false]) {
  const failedCleanup = fixture({ endMarkerFails, detachFails: true });
  const captured = await startMultiplayerFrameTrace(failedCleanup.page, {}, failedCleanup.clock);
  await assert.rejects(captured.stop(), (error) => {
    assert.equal(error.message, endMarkerFails ? 'frame_trace_stop_failed' : 'frame_trace_cleanup_failed');
    assert.equal(error.cleanupFailed, true);
    assert.equal(error.traceStage, endMarkerFails ? 'end-mark' : undefined);
    assert.equal(error.traceFailure, endMarkerFails ? 'protocol-or-target-error' : undefined);
    assert.equal(error.completeBeforeStop, endMarkerFails ? false : undefined);
    assert.doesNotMatch(JSON.stringify(error), /PRIVATE/);
    return true;
  });
  assert.equal(failedCleanup.detached(), 1);
  assert.equal(failedCleanup.clock.timers.size, 0);
  assert.equal(failedCleanup.session.eventNames().length, 0,
    'listener removal precedes a failing native detach');
}
console.log('multiplayer frame trace: bounded, aligned, redacted and cleanup gates passed');
