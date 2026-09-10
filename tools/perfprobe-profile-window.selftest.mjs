import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { startPerfWindowProfile, installPerfWindowTiming } from './perfprobe-profile-window.mjs';

const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function fixture({ failCommand, writeFailure, creation } = {}) {
  const commands = [], saved = [], active = new Map();
  let serial = 0, time = 100, detached = 0;
  const raw = { nodes: [{ id: 1 }], samples: [1], timeDeltas: [1000], startTime: 100000, endTime: 101000 };
  const session = {
    async send(command) {
      commands.push(command);
      if (command === failCommand) throw new Error(command + ' failed');
      return command === 'Profiler.stop' ? { profile: raw } : {};
    },
    async detach() { detached++; },
  };
  const page = {
    target: () => ({ createCDPSession: () => creation ?? Promise.resolve(session) }),
    async evaluate() { return ++time; },
  };
  const options = {
    timeoutMs: 240000,
    timers: { setTimeout(fn, delay) { const id = ++serial; active.set(id, { fn, delay }); return id; },
      clearTimeout(id) { active.delete(id); } },
    async writeProfile(profile) {
      saved.push(profile);
      if (writeFailure) throw new Error('profile write failed');
      return { path: '/fixture/gameplay.cpuprofile' };
    },
  };
  return { page, options, commands, raw, saved, active, session,
    get detached() { return detached; },
    expire(delay) {
      const entries = [...active].filter(([, timer]) => timer.delay === delay);
      assert.equal(entries.length, 1);
      active.delete(entries[0][0]); entries[0][1].fn();
    },
  };
}

{
  const f = fixture();
  const owner = await startPerfWindowProfile(f.page, f.options);
  assert.equal(owner.receipt.status, 'recording');
  assert.deepEqual(f.commands, ['Profiler.enable', 'Profiler.start']);
  const edges = { startedAt: 103, endedAt: 60103, timeOrigin: 1234, done: true };
  const stopped = owner.stop(edges);
  assert.equal(owner.stop(null, 'late failure'), stopped, 'one stop promise and one raw profile');
  const receipt = await stopped;
  assert.equal(receipt.status, 'complete');
  assert.equal(receipt.completedWindow, true);
  assert.deepEqual(receipt.window, edges);
  assert.equal(receipt.alignment.attributionOnly, true);
  assert.equal(receipt.alignment.completedAction, true);
  assert.equal(receipt.alignment.beforeStartPageMs, 101);
  assert.equal(receipt.alignment.afterStartPageMs, 102);
  assert.deepEqual(f.saved, [f.raw]);
  assert.deepEqual(f.commands, ['Profiler.enable', 'Profiler.start', 'Profiler.stop', 'Profiler.disable']);
  assert.equal(f.detached, 1);
  assert.equal(f.active.size, 0);
}
for (const failCommand of ['Profiler.enable', 'Profiler.start']) {
  const f = fixture({ failCommand });
  await assert.rejects(startPerfWindowProfile(f.page, f.options), new RegExp(failCommand));
  assert.equal(f.detached, 1);
  assert.equal(f.active.size, 0);
}
{
  const f = fixture(), owner = await startPerfWindowProfile(f.page, f.options);
  const evaluate = f.page.evaluate;
  f.page.evaluate = () => new Promise(() => {});
  const pending = owner.readPage(() => null);
  await flush(); f.expire(5000);
  await assert.rejects(pending, /command timed out/);
  f.page.evaluate = evaluate;
  const receipt = await owner.stop(null, 'timing read failed');
  assert.equal(receipt.status, 'failed');
  assert.equal(f.detached, 1, 'unresponsive timing reads cannot prevent owned profile cleanup');
  assert.equal(f.active.size, 0);
}
for (const args of [{ failCommand: 'Profiler.stop' }, { failCommand: 'Profiler.disable' }, { writeFailure: true }]) {
  const f = fixture(args), owner = await startPerfWindowProfile(f.page, f.options);
  const receipt = await owner.stop({ done: true });
  assert.equal(receipt.status, 'failed', 'stop/write/disable failure is explicit, never successful attribution');
  assert.equal(f.detached, 1);
  assert.equal(f.active.size, 0);
}
{
  const f = fixture(), owner = await startPerfWindowProfile(f.page, f.options);
  const receipt = await owner.stop({ startedAt: 103, done: false }, new Error('sampler failed'));
  assert.equal(receipt.status, 'failed');
  assert.equal(receipt.completedWindow, false);
  assert.equal(receipt.alignment.completedAction, false);
  assert.match(receipt.error, /sampler failed/);
  assert.equal(f.saved.length, 1, 'failure still saves its raw partial profile and clock brackets');
  assert.equal(f.detached, 1);
}
{
  const f = fixture(), owner = await startPerfWindowProfile(f.page, f.options);
  f.expire(240000); await flush();
  const receipt = await owner.stop();
  assert.equal(receipt.status, 'failed');
  assert.match(receipt.error, /envelope timed out/);
  assert.equal(receipt.alignment.completedAction, false);
  assert.equal(f.saved.length, 1);
  assert.equal(f.detached, 1);
  assert.equal(f.active.size, 0);
}
{
  let resolveCreation;
  const creation = new Promise(resolve => { resolveCreation = resolve; });
  const f = fixture({ creation });
  const pending = startPerfWindowProfile(f.page, f.options);
  await flush(); f.expire(5000);
  await assert.rejects(pending, /command timed out/);
  resolveCreation(f.session); await flush();
  assert.equal(f.detached, 1, 'late acquired session is detached after its owner timed out');
  assert.deepEqual(f.commands, [], 'late creation never starts profiling');
  assert.equal(f.active.size, 0);
}

function timingFixture(supported = true) {
  let listener, records = [], disconnects = 0;
  class Observer {
    static supportedEntryTypes = supported ? ['longtask'] : [];
    constructor(callback) { listener = callback; }
    observe(options) { assert.deepEqual(JSON.parse(JSON.stringify(options)), { type: 'longtask', buffered: true }); }
    takeRecords() { const list = records; records = []; return list; }
    disconnect() { disconnects++; }
  }
  const window = { __DEBUG: { game: { phase: 'battle', preBattleS: 0 } } };
  const document = { hidden: false, visibilityState: 'visible' };
  runInNewContext(`(${installPerfWindowTiming.toString()})()`, { window, document, PerformanceObserver: Observer });
  return { api: window.__PERF_WINDOW_TIMING, window, document,
    tasks(entries) { listener({ getEntries: () => entries }); },
    pending(entries) { records.push(...entries); },
    get disconnects() { return disconnects; } };
}
const task = (startTime, duration) => ({ startTime, duration, name: 'self', attribution: [] });
{
  const f = timingFixture();
  f.tasks([task(1, 10)]);
  f.api.start(98, 100); f.api.frame(98, 100); f.api.frame(150, 160);
  f.tasks([task(40, 20), task(95, 110)]);
  f.api.frame(198, 200); f.api.end(198, 200);
  f.pending([task(190, 30), task(205, 70)]);
  const r = f.api.finish();
  assert.equal(r.longTaskSupported, true); assert.equal(r.complete, true);
  assert.equal(r.startPageMs, 100); assert.equal(r.endPageMs, 200);
  assert.equal(r.startRafMs, 98); assert.equal(r.endRafMs, 198);
  assert.equal(r.worstCallbackGap.durationMs, 60, 'actual callback clock, not RAF timestamp delta52');
  assert.equal(r.longTasks.length, 2);
  assert.equal(r.longTasks[0].straddlesStart, true);
  assert.equal(r.longTasks[0].straddlesEnd, true, 'early-delivered entry is relabeled against final edge');
  assert.equal(r.longTasks[1].straddlesEnd, true);
  assert.equal(r.longTasks[1].durationMs, 30, 'edge-straddling tasks are retained whole, never clipped');
  assert.equal(f.disconnects, 1);
}
{
  const f = timingFixture(); f.api.start(0, 0);
  for (let i = 0; i < 520; i++) { f.api.frame(i * 60, i * 60); f.tasks([task(i * 60, 55)]); }
  const r = f.api.finish();
  assert.equal(r.complete, false, 'failed sampler retains partial timing, never invents completion');
  assert.equal(r.longTasks.length, 512); assert.equal(r.longTasksDropped, 8);
  assert.equal(r.callbackGaps.length, 512); assert.equal(r.callbackGapsDropped, 7);
  assert.equal(r.callbackSamples, 520);
}
{
  const f = timingFixture(false); f.api.start(0, 0);
  assert.equal(f.api.finish().longTaskSupported, false, 'unsupported LongTask API is unavailable, not proof of no tasks');
}

const source = readFileSync(new URL('./perfprobe.mjs', import.meta.url), 'utf8');
const early = source.indexOf('if (profileWindow) await beginWindowProfile()');
const entry = source.indexOf("await D.beginBattleEntry('m1a2', map)");
assert.ok(early > 0 && early < source.indexOf('waitForControl: true, profileWindow })') && early < entry);
const stop = source.indexOf('if (profileWindow) await finishWindowProfile()');
assert.ok(stop > source.indexOf('recordPerfRosterEdges(rosterProvenance, perf)'));
assert.ok(stop < source.indexOf('const heapPostGc = await page.evaluate(readPerfHeapSnapshot, true)'));
assert.match(source, /if \(!noTrend && !profileWindow\)/);
assert.match(source, /REFUSED — CPU-profile diagnostic overhead/);
assert.match(source, /speedCertification: false/);
assert.match(source, /if \(\(rosterProvenance \|\| profileWindow\) && !report\)/);
assert.ok(source.lastIndexOf('await finishWindowProfile(') < source.indexOf('() => browser?.close()'));
console.log('perfprobe-profile-window: exact clock edges, bounded partial LongTasks, shared CDP profiler and timeout/failure/late-session cleanup pass');
