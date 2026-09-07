import assert from 'node:assert/strict';
import { startMultiplayerCpuTimeline } from './multiplayer-cpu-timeline.mjs';

const names = ['TaskDuration', 'ScriptDuration', 'LayoutDuration',
  'RecalcStyleDuration', 'JSHeapUsedSize'];
const fields = ['relativeTimeMs', 'taskDurationMs', 'scriptDurationMs',
  'layoutDurationMs', 'recalcStyleDurationMs', 'jsHeapUsedSizeDeltaBytes'];
async function flush() { for (let index = 0; index < 30; index++) await Promise.resolve(); }

function fakeClock() {
  let at = 1000;
  let serial = 0;
  const timers = new Map();
  const clock = {
    now: () => at,
    setTimeout(callback, delay) { timers.set(++serial, { at: at + delay, callback }); return serial; },
    clearTimeout(id) { timers.delete(id); },
    timers,
    async advance(ms) {
      const end = at + ms;
      await flush();
      for (;;) {
        const due = [...timers].filter(([, timer]) => timer.at <= end)
          .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        at = due[1].at;
        timers.delete(due[0]);
        due[1].callback();
        await flush();
      }
      at = end;
      await flush();
    },
  };
  return clock;
}

function fixture({ handle, create, evaluate, detach, timestamp = true } = {}) {
  const clock = fakeClock();
  const calls = [];
  let metricCalls = 0;
  let detachCalls = 0;
  let targetCalls = 0;
  function metrics(values = [4, 2, 0.5, 0.25, 10000]) {
    const metrics = names.map((name, index) => ({ name, value: values[index] }));
    if (timestamp) metrics.push({ name: 'Timestamp', value: 50 + clock.now() / 1000 });
    metrics.push({ name: 'PRIVATE_URL', value: 'PRIVATE_TOKEN' });
    return { metrics, title: 'PRIVATE_ROOM', url: 'PRIVATE_URL', targetId: 'PRIVATE_ID' };
  }
  const session = {
    async send(method, options) {
      calls.push(method);
      if (method === 'Performance.enable') assert.deepEqual(options, { timeDomain: 'timeTicks' });
      if (method === 'Performance.getMetrics') metricCalls++;
      if (handle) {
        const reply = handle({ method, metricCalls, clock, metrics });
        if (reply !== undefined) return reply;
      }
      if (method === 'Performance.getMetrics') return metrics();
      return {};
    },
    async detach() { detachCalls++; if (detach) return detach(); },
  };
  const page = {
    target() {
      targetCalls++;
      return { createCDPSession: () => create ? create(session) : Promise.resolve(session) };
    },
    async evaluate(callback) {
      assert.match(callback.toString(), /performance\.now\(\)/);
      if (evaluate) return evaluate(clock);
      return clock.now() + 5000;
    },
  };
  return { clock, page, calls, metrics, session, get metricCalls() { return metricCalls; },
    get detachCalls() { return detachCalls; }, get targetCalls() { return targetCalls; } };
}

function assertReleased(test) {
  assert.equal(test.detachCalls, 1);
  assert.equal(test.calls.filter((name) => name === 'Performance.disable').length, 1);
  assert.equal(test.clock.timers.size, 0, 'no command, sample or deadline timer remains');
}

const normal = fixture({ handle({ method, metricCalls, metrics }) {
  if (method !== 'Performance.getMetrics') return;
  return metrics(metricCalls === 1 ? [4, 2, 0.5, 0.25, 10000] : [4.08, 2.04, 0.51, 0.255, 9000]);
} });
const timeline = await startMultiplayerCpuTimeline(normal.page, {}, normal.clock);
await normal.clock.advance(100);
const pendingStop = timeline.stop();
assert.equal(timeline.stop(), pendingStop, 'repeated stop joins exact cleanup promise');
const receipt = await pendingStop;
assertReleased(normal);
assert.equal(normal.targetCalls, 1);
assert.deepEqual(Object.keys(receipt), ['sampleIntervalMs', 'baselinePageTimeMs', 'baselineRequestSpanMs', 'rows']);
assert.equal(receipt.sampleIntervalMs, 100);
assert.equal(receipt.baselinePageTimeMs, 6000);
assert.equal(receipt.baselineRequestSpanMs, 0);
assert.equal(receipt.rows.length, 2);
assert.deepEqual(receipt.rows[0], Object.fromEntries(fields.map((name) => [name, 0])));
assert.equal(receipt.rows[1].relativeTimeMs, 100);
for (const [key, expected] of [['taskDurationMs', 80], ['scriptDurationMs', 40],
  ['layoutDurationMs', 10], ['recalcStyleDurationMs', 5], ['jsHeapUsedSizeDeltaBytes', -1000]]) {
  assert.ok(Math.abs(receipt.rows[1][key] - expected) < 1e-9);
}
for (const row of receipt.rows) {
  assert.deepEqual(Object.keys(row), fields);
  assert.ok(Object.values(row).every((value) => typeof value === 'number' && Number.isFinite(value)));
}
assert.doesNotMatch(JSON.stringify(receipt), /PRIVATE|Timestamp|https?:|url|targetId/);

for (const options of [{ sampleIntervalMs: 49 }, { sampleIntervalMs: 1001 },
  { durationMs: 30001 }, { durationMs: 0 }, { maxRows: 351 }, { maxRows: 1.5 },
  { commandTimeoutMs: 0 }, { commandTimeoutMs: Infinity }]) {
  const test = fixture();
  await assert.rejects(startMultiplayerCpuTimeline(test.page, options, test.clock), /cpu_timeline_invalid_options/);
  assert.equal(test.targetCalls, 0, 'invalid settings cannot acquire a session');
}

for (const [options, elapsed, expectedRows] of [
  [{}, 30000, 300], [{ sampleIntervalMs: 50 }, 30000, 350],
  [{ maxRows: 1 }, 1000, 1], [{ durationMs: 250 }, 1000, 3],
]) {
  const test = fixture();
  const sampler = await startMultiplayerCpuTimeline(test.page, options, test.clock);
  await test.clock.advance(elapsed);
  const output = await sampler.stop();
  assert.equal(output.rows.length, expectedRows);
  assert.ok(output.rows.every((row) => row.relativeTimeMs < 30000));
  assertReleased(test);
}

const noTimestamp = fixture({ timestamp: false });
const fallback = await startMultiplayerCpuTimeline(noTimestamp.page, {}, noTimestamp.clock);
await noTimestamp.clock.advance(100);
assert.equal((await fallback.stop()).rows[1].relativeTimeMs, 100, 'missing baseline Timestamp uses monotonic receipt clock');
assertReleased(noTimestamp);

const aligned = fixture({ handle({ method, metricCalls, clock, metrics }) {
  if (method !== 'Performance.getMetrics' || metricCalls === 1) return;
  const reply = metrics();
  return new Promise((resolve) => clock.setTimeout(() => resolve(reply), 50));
}, evaluate(clock) { return new Promise((resolve) => clock.setTimeout(() => resolve(6020), 20)); } });
const alignedStart = startMultiplayerCpuTimeline(aligned.page, {}, aligned.clock);
await aligned.clock.advance(20);
const alignedTimeline = await alignedStart;
await aligned.clock.advance(150);
const alignedReceipt = await alignedTimeline.stop();
assert.equal(alignedReceipt.baselinePageTimeMs, 6020);
assert.equal(alignedReceipt.baselineRequestSpanMs, 20);
assert.equal(alignedReceipt.rows[1].relativeTimeMs, 120,
  'CDP sampling timestamp excludes the delayed response and retains baseline request skew');
assertReleased(aligned);

for (const failureAt of ['create', 'enable', 'baseline', 'page-time', 'sample', 'disable', 'detach']) {
  const privateFailure = () => { throw new Error('PRIVATE_TOKEN PRIVATE_ROOM https://PRIVATE_URL'); };
  const test = fixture({
    create: failureAt === 'create' ? privateFailure : undefined,
    evaluate: failureAt === 'page-time' ? privateFailure : undefined,
    detach: failureAt === 'detach' ? privateFailure : undefined,
    handle({ method, metricCalls }) {
      if (failureAt === 'enable' && method === 'Performance.enable') privateFailure();
      if (failureAt === 'disable' && method === 'Performance.disable') privateFailure();
      if (method === 'Performance.getMetrics' &&
        ((failureAt === 'baseline' && metricCalls === 1) || (failureAt === 'sample' && metricCalls === 2))) privateFailure();
    },
  });
  if (['create', 'enable', 'baseline', 'page-time'].includes(failureAt)) {
    await assert.rejects(startMultiplayerCpuTimeline(test.page, {}, test.clock), /^Error: cpu_timeline_start_failed$/);
    if (failureAt !== 'create') assertReleased(test);
    else assert.equal(test.clock.timers.size, 0);
  } else {
    const sampler = await startMultiplayerCpuTimeline(test.page, {}, test.clock);
    await test.clock.advance(100);
    await assert.rejects(sampler.stop(), /^Error: cpu_timeline_(sample|cleanup)_failed$/);
    assertReleased(test);
  }
}

for (const corrupt of ['missing', 'duplicate', 'nonfinite', 'reset', 'oversized', 'missing-timestamp']) {
  const test = fixture({ handle({ method, metricCalls, metrics }) {
    if (method !== 'Performance.getMetrics' || metricCalls === 1) return;
    const reply = metrics();
    if (corrupt === 'missing') reply.metrics.shift();
    if (corrupt === 'duplicate') reply.metrics.push(reply.metrics[0]);
    if (corrupt === 'nonfinite') reply.metrics[0].value = Infinity;
    if (corrupt === 'reset') reply.metrics[0].value = 0;
    if (corrupt === 'oversized') reply.metrics = Array.from({ length: 513 }, () => ({}));
    if (corrupt === 'missing-timestamp') reply.metrics = reply.metrics.filter((metric) => metric.name !== 'Timestamp');
    return reply;
  } });
  const sampler = await startMultiplayerCpuTimeline(test.page, {}, test.clock);
  await test.clock.advance(100);
  await assert.rejects(sampler.stop(), /^Error: cpu_timeline_sample_failed$/);
  assertReleased(test);
}

let releasePending;
const slow = fixture({ handle({ method, metricCalls, metrics }) {
  if (method === 'Performance.getMetrics' && metricCalls === 2) {
    return new Promise((resolve) => { releasePending = () => resolve(metrics()); });
  }
} });
const slowTimeline = await startMultiplayerCpuTimeline(slow.page, { commandTimeoutMs: 5000 }, slow.clock);
await slow.clock.advance(1000);
assert.equal(slow.metricCalls, 2, 'a slow response cannot overlap or build a request queue');
const slowReceipt = await slowTimeline.stop();
assertReleased(slow);
releasePending();
await flush();
assert.equal(slowReceipt.rows.length, 1, 'a late response after stop cannot append a row');

for (const stuckMethod of ['Performance.getMetrics', 'Performance.disable', 'detach']) {
  const test = fixture({
    detach: stuckMethod === 'detach' ? () => new Promise(() => {}) : undefined,
    handle({ method, metricCalls }) {
      if (method === stuckMethod && (method !== 'Performance.getMetrics' || metricCalls === 2)) return new Promise(() => {});
    },
  });
  const sampler = await startMultiplayerCpuTimeline(test.page, { commandTimeoutMs: 100 }, test.clock);
  if (stuckMethod === 'Performance.getMetrics') await test.clock.advance(250);
  const stopped = sampler.stop();
  const rejected = assert.rejects(stopped, /^Error: cpu_timeline_(sample|cleanup)_failed$/);
  await test.clock.advance(200);
  await rejected;
  assertReleased(test);
}

let finishCreation;
const late = fixture({ create(session) { return new Promise((resolve) => { finishCreation = () => resolve(session); }); } });
const lateStart = startMultiplayerCpuTimeline(late.page, { commandTimeoutMs: 100 }, late.clock);
const lateRejected = assert.rejects(lateStart, /^Error: cpu_timeline_start_failed$/);
await late.clock.advance(100);
await lateRejected;
finishCreation();
await flush();
assertReleased(late);

// Resolve creation just before the command deadline runs, but do not flush its
// promise reactions first. Ownership must survive a timeout winning while the
// creation observer still sees startup as active.
for (const cleanup of ['success', 'disable-fails', 'detach-fails', 'both-stuck']) {
  let finishBoundaryCreation;
  const boundary = fixture({
    create(session) {
      return new Promise((resolve) => { finishBoundaryCreation = () => resolve(session); });
    },
    handle({ method }) {
      if (method !== 'Performance.disable') return;
      if (cleanup === 'disable-fails') throw new Error('PRIVATE_DISABLE');
      if (cleanup === 'both-stuck') return new Promise(() => {});
    },
    detach() {
      if (cleanup === 'detach-fails') throw new Error('PRIVATE_DETACH');
      if (cleanup === 'both-stuck') return new Promise(() => {});
    },
  });
  const boundaryStart = startMultiplayerCpuTimeline(boundary.page, { commandTimeoutMs: 100 }, boundary.clock);
  const boundaryRejected = assert.rejects(boundaryStart, /^Error: cpu_timeline_start_failed$/);
  await flush();
  const [boundaryTimerId, boundaryTimer] = [...boundary.clock.timers][0];
  finishBoundaryCreation();
  await Promise.resolve();
  boundary.clock.timers.delete(boundaryTimerId);
  boundaryTimer.callback();
  await boundary.clock.advance(200);
  await boundaryRejected;
  assertReleased(boundary);
  assert.deepEqual(boundary.calls, ['Performance.disable'], 'timed-out creation never enables or samples');
}

for (const primary of ['start', 'sample']) {
  const test = fixture({
    handle({ method, metricCalls }) {
      if (method === 'Performance.disable' || (primary === 'start' && method === 'Performance.enable')
        || (primary === 'sample' && method === 'Performance.getMetrics' && metricCalls === 2)) {
        throw new Error('PRIVATE_PROTOCOL_FAILURE');
      }
    },
    detach() { throw new Error('PRIVATE_DETACH'); },
  });
  if (primary === 'start') {
    await assert.rejects(startMultiplayerCpuTimeline(test.page, {}, test.clock), /^Error: cpu_timeline_start_failed$/);
  } else {
    const sampler = await startMultiplayerCpuTimeline(test.page, {}, test.clock);
    await test.clock.advance(100);
    await assert.rejects(sampler.stop(), /^Error: cpu_timeline_sample_failed$/);
  }
  assertReleased(test);
}

console.log('multiplayer CPU timeline selftest passed');
