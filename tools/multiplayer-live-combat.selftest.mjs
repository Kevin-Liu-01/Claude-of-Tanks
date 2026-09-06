import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  liveCombatTimingWindows, sanitizeLiveCombatHealth, persistLiveCombatHealth,
  withLiveCombatFrameTrace, parseLiveCombatFrameTraceWindow,
} from './multiplayer-live-combat.mjs';

const schema = ['tMs', 'phase', 'preBattleS', 'flags', 'gapMs', 'programs', 'geometries',
  'textures', 'heapMB', 'renderScale', 'PRIVATE_COLUMN'];
const row = (at, gap) => [at, 'battle', 0, 0, gap, 300, 1057, 196, 443.64, 1, 'PRIVATE_POSITION'];
const source = { frameSchema: schema, frames: [row(100, 16), row(500, 400),
  ...Array.from({ length: 100 }, (_, i) => row(501 + i * 2, 2))],
  clock: { pageTimeMs: 1000, traceTimeMs: 0, readSpanMs: 0.25 },
  events: [
    { tMs: 110, name: 'shell:fired', data: { shooterId: 'PRIVATE_ID' } },
    // Observer delivery is outside the window; actual task overlaps the gap.
    { tMs: 999, name: 'longtask', data: { startTime: 1200, duration: 350, url: 'PRIVATE_URL' } },
    { tMs: 490, name: 'PRIVATE_EVENT', data: 'PRIVATE_TOKEN' },
  ] };
const windows = liveCombatTimingWindows(source);
const worst = windows.windows[0];
assert.equal(worst.atMs, 500);
assert.equal(worst.gapStartDtFromCenterMs, -400);
assert.equal(worst.precedingFrameDtFromCenterMs, -400);
assert.equal(worst.frames.length, 48);
assert.ok(worst.frames.some(frame => frame.dtFromCenterMs === -400), 'retain the actual previous frame');
assert.ok(worst.frames.some(frame => frame.dtFromCenterMs === 0), 'retain the end of the worst interval');
assert.ok(worst.frameRowsOmitted > 0);
assert.deepEqual(worst.events.map(event => event.name), ['shell:fired', 'longtask']);
assert.equal(worst.events[1].durationMs, 350);
assert.equal(worst.events[1].startDtFromCenterMs, -300);
assert.equal(windows.traceClockReadSpanMs, 0.25);
assert.doesNotMatch(JSON.stringify(windows), /PRIVATE|shooterId|url/);
assert.deepEqual(liveCombatTimingWindows(null).windows, []);

const fixture = {
  role: 'client', measuredDurationMs: 21000,
  rendered: {
    phase: 'battle', result: 'victory', rosterSize: 14, visibleRosterSize: 14,
    playerId: 'PRIVATE_ID', errors: ['PRIVATE_URL'],
    trace: { frames: 1140, durationMs: 23567.6, liveSpikes: 1, maxGapMs: 52.1,
      sessionId: 'PRIVATE_SESSION' },
    traceAnomalies: [{ data: 'PRIVATE_TOKEN' }], timingWindows: windows,
    network: { connected: true, inputAckLag: 0, transportBufferedBytes: 0,
      prediction: { hardSnaps: 0, maxPositionErrorM: 0.732, token: 'PRIVATE_TOKEN' },
      transport: { token: 'PRIVATE_TOKEN' } },
    events: { fired: 54, firedBy: { PRIVATE_ID: 4 }, hits: 55, damage: 35309 },
    motion: { maxStepM: 0.1, last: { x: 'PRIVATE_POSITION' } },
    renderer: { calls: 1, programs: 300, token: 'PRIVATE_TOKEN' },
    telemetry: { simulation: { tanks: 14 }, world: { obstacles: 99, colliders: 99 },
      quality: { preset: 'low', gpu: 'PRIVATE_GPU' } },
    glErrors: { preCombat: 0, beforeShadowProbe: 0, afterShadowProbe: 0 },
    shadows: { enabled: true, shaderErrors: 0, cascades: [1, 2, 3, 4] },
    shadowSample: { skipped: false, changedPixelRatio: .1, darkenedPixelRatio: .1 },
  },
  authority: { tick: 1200, averageAdvanceMs: .519, maxAdvanceMs: 4,
    stats: { invalidMessages: 0, droppedCatchUpMs: 0 },
    combatBaseline: { invalidMessages: 0, droppedCatchUpMs: 0 },
    start: { PRIVATE_ID: { x: 'PRIVATE_POSITION' } } },
  clients: Array.from({ length: 20 }, () => ({ playerId: 'PRIVATE_ID', network: { inputAckLag: 0 } })),
  browserErrors: ['PRIVATE_URL'], browserGlWarnings: ['PRIVATE_STACK'],
  frameTrace: { complete: true, rows: [{ kind: 'PRIVATE_EVENT' }], baselinePageTimeMs: 1000 },
};
const health = sanitizeLiveCombatHealth(fixture);
assert.equal(health.gateState, 'not-evaluated');
assert.equal(health.rendered.trace.liveSpikes, 1, 'the failed metric is not erased or normalized');
assert.equal(health.rendered.trace.maxGapMs, 52.1);
assert.equal(health.rendered.errorCount, 1);
assert.equal(health.rendered.events.uniqueShooters, 1);
assert.equal(health.rendered.network.prediction.hardSnaps, 0);
assert.equal(health.clients.length, 14);
assert.equal(health.browserErrorCount, 1);
assert.equal(health.browserGlWarningCount, 1);
assert.doesNotMatch(JSON.stringify(health), /PRIVATE|playerId|sessionId|token|stack|positions/);
assert.equal(sanitizeLiveCombatHealth({ rendered: { trace: { maxGapMs: '52.1' } } }).rendered.trace.maxGapMs,
  null, 'invalid/missing values are not mistaken for healthy zero');

let persisted;
await assert.rejects(async () => {
  await persistLiveCombatHealth(fixture, '/owned/client-health.json', async (path, data) => {
    assert.equal(path, '/owned/client-health.json'); persisted = JSON.parse(data);
  });
  assert.equal(fixture.rendered.trace.liveSpikes, 0, 'unchanged failed gate');
}, /unchanged failed gate/);
assert.equal(persisted.rendered.trace.liveSpikes, 1, 'failed gate retains the complete sanitized receipt');
await assert.rejects(() => persistLiveCombatHealth(fixture, '/owned/client-health.json',
  async () => { throw new Error('write_failed'); }), /write_failed/);

let started = 0, stopped = 0;
const start = async () => { started++; return { stop: async () => {
  stopped++; return { complete: true, clockDriftMs: 0 };
} }; };
assert.deepEqual(await withLiveCombatFrameTrace({}, false, async () => 7, start), { value: 7, frameTrace: null });
assert.equal(started, 0, 'default certification does not start Chrome tracing');
assert.deepEqual(await withLiveCombatFrameTrace({}, true, async () => 8, start),
  { value: 8, frameTrace: { complete: true, clockDriftMs: 0, captureComplete: true,
    clockAligned: true, attributionValid: true } });
await assert.rejects(() => withLiveCombatFrameTrace({}, true,
  async () => { throw new Error('measurement_failed'); }, start), /measurement_failed/);
assert.equal(stopped, 2, 'an owned capture stops even when the measurement fails');
const failedStop = await withLiveCombatFrameTrace({}, true, async () => 9,
  async () => ({ stop: async () => { throw new Error('PRIVATE_PROTOCOL_ERROR'); } }));
assert.equal(failedStop.value, 9);
assert.equal(failedStop.frameTrace.complete, false);
assert.doesNotMatch(JSON.stringify(failedStop), /PRIVATE/);

for (const drift of [undefined, NaN, Infinity, -Infinity, 999, 2.001, -2.001, -2, 0, 2]) {
  const aligned = Number.isFinite(drift) && Math.abs(drift) <= 2;
  const measured = await withLiveCombatFrameTrace({}, true, async () => 10,
    async () => ({ stop: async () => ({ complete: true, clockDriftMs: drift }) }));
  assert.equal(measured.frameTrace.complete, aligned, 'whole capture requires a finite aligned clock');
  assert.equal(measured.frameTrace.attributionValid, aligned);
  assert.equal(measured.frameTrace.clockAligned, aligned);
  assert.equal(measured.frameTrace.captureComplete, true, 'retain collector completeness separately');
}

class WindowClock {
  now = 0; next = 0; timers = new Map();
  setTimeout = (callback, delay) => {
    const id = ++this.next;
    this.timers.set(id, { callback, at: this.now + delay });
    return id;
  };
  clearTimeout = id => this.timers.delete(id);
  advance(ms) {
    this.now += ms;
    for (const [id, timer] of this.timers) {
      if (timer.at > this.now) continue;
      this.timers.delete(id); timer.callback();
    }
  }
}
const defer = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flushPromises = () => new Promise(resolve => setImmediate(resolve));
function windowFixture(clockDriftMs = 0) {
  const timers = new WindowClock();
  const measurement = defer();
  const state = { starts: 0, stops: 0, options: null };
  const start = async (_page, options) => {
    state.starts++; state.options = options;
    const baseline = timers.now;
    return { stop: async () => {
      state.stops++;
      return { complete: true, clockDriftMs, baselinePageTimeMs: baseline, captureEndPageTimeMs: timers.now };
    } };
  };
  return { timers, measurement, state, start,
    options: { window: { delayMs: 8000, durationMs: 8000 }, timers } };
}
const delayed = windowFixture();
const delayedResult = withLiveCombatFrameTrace({}, true, () => delayed.measurement.promise,
  delayed.start, delayed.options);
assert.equal(delayed.state.starts, 0, 'an opt-in delayed capture must not begin before its window');
delayed.timers.advance(7999); await flushPromises();
assert.equal(delayed.state.starts, 0);
delayed.timers.advance(1); await flushPromises();
assert.equal(delayed.state.starts, 1);
assert.deepEqual(delayed.state.options, { durationMs: 8000 });
delayed.timers.advance(8000); delayed.measurement.resolve(17);
const delayedReceipt = await delayedResult;
assert.equal(delayedReceipt.value, 17);
assert.equal(delayedReceipt.frameTrace.complete, true);
assert.equal(delayedReceipt.frameTrace.windowFullyCaptured, true);
assert.deepEqual(delayedReceipt.frameTrace.requestedWindow, { delayMs: 8000, durationMs: 8000 });
assert.match(delayedReceipt.frameTrace.coverage, /not whole-battle/);
assert.equal(delayed.state.stops, 1);
assert.equal(delayed.timers.timers.size, 0);
const delayedHealth = sanitizeLiveCombatHealth({ frameTrace: delayedReceipt.frameTrace });
assert.deepEqual(delayedHealth.frameTrace.requestedWindow, { delayMs: 8000, durationMs: 8000 });
assert.equal(delayedHealth.frameTrace.windowFullyCaptured, true);
assert.equal(delayedHealth.frameTrace.attributionValid, true);
assert.equal(delayedHealth.frameTrace.clockAligned, true);
assert.match(delayedHealth.frameTrace.coverage, /not whole-battle/);

for (const drift of [null, NaN, Infinity, -Infinity, 999, 2.001, -2.001, -2, -0.009, 2]) {
  const aligned = Number.isFinite(drift) && Math.abs(drift) <= 2;
  const f = windowFixture(drift);
  const measured = withLiveCombatFrameTrace({}, true, () => f.measurement.promise, f.start, f.options);
  f.timers.advance(8000); await flushPromises();
  f.timers.advance(8000); f.measurement.resolve(21);
  const { frameTrace } = await measured;
  assert.equal(frameTrace.complete, aligned, 'delayed capture requires a finite aligned clock');
  assert.equal(frameTrace.attributionValid, aligned);
  assert.equal(frameTrace.clockAligned, aligned);
  assert.equal(frameTrace.captureComplete, true);
  assert.equal(frameTrace.windowFullyCaptured, true, 'duration coverage alone cannot prove alignment');
}

for (const failed of [false, true]) {
  const early = windowFixture();
  const primary = new Error('measurement_failed');
  const result = withLiveCombatFrameTrace({}, true, async () => {
    if (failed) throw primary;
    return 18;
  }, early.start, early.options);
  // Even a timer callback already queued by the platform must not acquire later.
  const queued = [...early.timers.timers.values()][0].callback;
  if (failed) await assert.rejects(result, error => error === primary);
  else {
    const receipt = await result;
    assert.equal(receipt.frameTrace.complete, false);
    assert.equal(receipt.frameTrace.failure, 'frame_trace_window_not_started');
  }
  queued(); early.timers.advance(8000); await flushPromises();
  assert.equal(early.state.starts, 0);
  assert.equal(early.state.stops, 0);
  assert.equal(early.timers.timers.size, 0);
}

const shorter = windowFixture();
const shorterResult = withLiveCombatFrameTrace({}, true, () => shorter.measurement.promise,
  shorter.start, shorter.options);
shorter.timers.advance(8000); await flushPromises();
shorter.timers.advance(500); shorter.measurement.resolve(19);
const shorterReceipt = await shorterResult;
assert.equal(shorterReceipt.frameTrace.captureComplete, true);
assert.equal(shorterReceipt.frameTrace.windowFullyCaptured, false);
assert.equal(shorterReceipt.frameTrace.complete, false, 'a shorter requested window cannot pass');
assert.equal(shorterReceipt.frameTrace.attributionValid, false);
assert.equal(shorter.state.stops, 1);

for (const rejectStart of [false, true]) {
  const late = windowFixture();
  const admission = defer();
  const primary = new Error('measurement_failed');
  const lateResult = withLiveCombatFrameTrace({}, true, () => late.measurement.promise,
    () => { late.state.starts++; return admission.promise; }, late.options);
  late.timers.advance(8000); await flushPromises();
  late.measurement.reject(primary);
  const rejection = assert.rejects(lateResult, error => error === primary);
  await flushPromises();
  if (rejectStart) admission.reject(new Error('PRIVATE_START_ERROR'));
  else admission.resolve({ stop: async () => {
    late.state.stops++; throw new Error('PRIVATE_STOP_ERROR');
  } });
  await rejection;
  assert.equal(late.state.starts, 1);
  assert.equal(late.state.stops, rejectStart ? 0 : 1,
    'late acquired capture stops exactly once without replacing measurement failure');
  assert.equal(late.timers.timers.size, 0);
}

const unavailable = windowFixture();
const unavailableResult = withLiveCombatFrameTrace({}, true, () => unavailable.measurement.promise,
  async () => { throw new Error('PRIVATE_START_ERROR'); }, unavailable.options);
unavailable.timers.advance(8000); await flushPromises();
unavailable.measurement.resolve(20);
const unavailableReceipt = await unavailableResult;
assert.equal(unavailableReceipt.frameTrace.complete, false);
assert.equal(unavailableReceipt.frameTrace.failure, 'frame_trace_start_failed');
assert.doesNotMatch(JSON.stringify(unavailableReceipt), /PRIVATE/);

assert.equal(parseLiveCombatFrameTraceWindow([]), null);
assert.equal(parseLiveCombatFrameTraceWindow(['--frame-trace']), null);
assert.deepEqual(parseLiveCombatFrameTraceWindow(['--frame-trace', '--frame-trace-window=8000,8000']),
  { delayMs: 8000, durationMs: 8000 });
assert.deepEqual(parseLiveCombatFrameTraceWindow(['--frame-trace', '--frame-trace-window=0,30000']),
  { delayMs: 0, durationMs: 30000 });
for (const invalid of ['-1,8000', '8000,0', '30001,1', '0,30001', '1.5,8',
  '1e3,8', '8,8,8', 'NaN,8', ',8', '8,', '8, 8']) {
  assert.throws(() => parseLiveCombatFrameTraceWindow(['--frame-trace', `--frame-trace-window=${invalid}`]),
    /frame_trace_window_invalid/);
}
for (const args of [['--frame-trace-window=8000,8000'], ['--frame-trace', '--frame-trace-window'],
  ['--frame-trace', '--frame-trace-window=1,1', '--frame-trace-window=2,2']]) {
  assert.throws(() => parseLiveCombatFrameTraceWindow(args), /frame_trace_window_invalid/);
}
await assert.rejects(withLiveCombatFrameTrace({}, false, async () => 0, start,
  { window: { delayMs: 1, durationMs: 1 } }), /frame_trace_window_invalid/);

const runner = await readFile(new URL('./multiplayer-live-combat.mjs', import.meta.url), 'utf8');
const collecting = runner.indexOf('const fullReport = await collectFullReport');
const saving = runner.indexOf('await persistLiveCombatHealth', collecting);
const firstGate = runner.indexOf('assert.equal(liveInvalidMessages', collecting);
assert.ok(collecting > 0 && saving > collecting && saving < firstGate,
  'persist before the first authority gate, not only the final renderer gate');
assert.match(runner, /assert\.equal\(report\.trace\.liveSpikes, 0,/);
console.log('multiplayer-live-combat.selftest: sanitized failure receipts, complete gap windows, trace cleanup passed');
