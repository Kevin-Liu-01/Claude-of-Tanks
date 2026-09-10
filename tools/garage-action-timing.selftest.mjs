import assert from 'node:assert/strict';
import { installGarageActionTiming, summarizeGarageActionTiming, withGarageActionProfile } from './garage-action-timing.mjs';

const names = ['window', 'document', 'performance', 'PerformanceObserver',
  'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'Element'];
const saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
let now = 0, nextFrame = 0, observer;
const frames = new Map(), listeners = new Map();
const elements = new Map();
const stage = { textContent: 'Building world' };
const loader = { getClientRects: () => [{}], querySelector: () => stage };
class Target { closest(selector) { return selector === '.battle' ? this : null; } }
class TaskObserver {
  static supportedEntryTypes = ['longtask'];
  pending = [];
  disconnected = false;
  constructor(callback) { this.callback = callback; observer = this; }
  observe(options) { this.options = options; }
  takeRecords() { return this.pending.splice(0); }
  disconnect() { this.disconnected = true; }
}
const game = { phase: 'garage', battleCount: 0, preBattleS: 0, mapId: 'urban', tanks: [] };
const browserWindow = { __DEBUG: { game, selectedSpecId: 'm1a1',
  garage: { getSelectedMap: () => 'urban' }, pedestalVisual: { specId: 'm1a1' }, pedestalOnStage: true },
  __BATTLE_LOAD: { stages: { world: 4000 } },
  __BATTLE_DEFERRED_WARM: { stages: { rarePrograms: 841 }, done: true },
  __COMBAT_RARE_WARM: { stages: { destruction: 841 } },
  __COMBAT_WARM: { totalMs: 999 },
  __GL_DIAG: { errors: ['example link failure'], rescue: 'example-rescue' },
};
const audioContext = { state: 'running', currentTime: 1 };
browserWindow.__COT_AUDIO = { ctx: audioContext, loadingActive: true,
  ambientState: () => ({ active: false }) };
const browserDocument = {
  visibilityState: 'visible', hidden: false, hasFocus: () => true,
  querySelector: selector => elements.get(selector) || null,
  addEventListener(type, listener) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(listener);
  },
  removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
};
const replacement = { window: browserWindow, document: browserDocument,
  performance: { now: () => now }, PerformanceObserver: TaskObserver,
  requestAnimationFrame: callback => { const id = ++nextFrame; frames.set(id, callback); return id; },
  cancelAnimationFrame: id => frames.delete(id), getComputedStyle: () => ({ opacity: '1' }), Element: Target };
for (const [name, value] of Object.entries(replacement)) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
const dispatch = (type, event = {}) => { for (const listener of listeners.get(type) || []) listener(event); };
const tick = at => {
  now = at;
  const [id, callback] = frames.entries().next().value;
  frames.delete(id);
  callback(at);
};
const task = (startTime, duration) => ({ startTime, duration, name: 'self',
  attribution: [{ name: 'unknown', containerType: 'window', containerSrc: 'http://fixture/' }] });
try {
  installGarageActionTiming();
  assert.deepEqual(observer.options, { type: 'longtask', buffered: true });
  const trace = browserWindow.__ACTION_TRACE;
  tick(50);
  trace.arm('battle', '.battle');
  now = 100;
  dispatch('click', { target: new Target(), isTrusted: true });
  elements.set('.cot-bl.on, .cot-bl.leaving', loader);
  tick(200);
  now = 1000;
  browserDocument.hidden = true;
  browserDocument.visibilityState = 'hidden';
  dispatch('visibilitychange');
  now = 2000;
  browserDocument.hidden = false;
  browserDocument.visibilityState = 'visible';
  dispatch('visibilitychange');
  stage.textContent = 'Compiling tank materials';
  audioContext.currentTime = 2;
  tick(5200);
  game.phase = 'battle';
  game.battleCount = 1;
  game.player = { specId: 'm1a1' };
  elements.clear();
  browserWindow.__COT_AUDIO.loadingActive = false;
  audioContext.currentTime = 3;
  tick(6000);
  assert.equal(trace.done(), true);
  // Delivery may lag rAF completion: finish must drain pending observer data.
  observer.pending.push(task(0, 60), task(1000, 3000), task(2000, 3000), task(8000, 100));
  const row = trace.finish();
  assert.equal(row.coverMs, 100);
  assert.equal(row.totalMs, 5900);
  assert.equal(row.maxFrameGapMs, 5000);
  assert.deepEqual([row.worstCallbackGap.startMs, row.worstCallbackGap.endMs], [200, 5200]);
  assert.equal(row.worstCallbackGap.before.loaderStage, 'Building world');
  assert.equal(row.worstCallbackGap.after.loaderStage, 'Compiling tank materials');
  assert.equal(row.longTasks.length, 2, 'startup/post-completion tasks do not contaminate action attribution');
  assert.equal(row.longTasks[0].attribution[0].containerType, 'window');
  const timing = summarizeGarageActionTiming(row);
  assert.equal(timing.overlappingLongTaskMs, 4000, 'overlapping task intervals count only once');
  assert.equal(timing.unattributedGapMs, 1000, 'callback delay outside observed tasks is left unattributed');
  assert.equal(timing.hiddenAtEitherEndpoint, false);
  assert.equal(timing.visibilityEventsWithinGap.length, 2,
    'a hidden/visible cycle cannot disappear because both sampled endpoints were visible');
  assert.deepEqual(row.loadingTraces.__BATTLE_LOAD, { stages: { world: 4000 } });
  assert.deepEqual(row.graphicsDiagnostics.errors, ['example link failure']);
  assert.deepEqual(row.loadingTraces.__BATTLE_DEFERRED_WARM, browserWindow.__BATTLE_DEFERRED_WARM);
  assert.deepEqual(row.loadingTraces.__COMBAT_RARE_WARM, browserWindow.__COMBAT_RARE_WARM);
  assert.deepEqual(row.loadingTraces.__COMBAT_WARM, browserWindow.__COMBAT_WARM);
  assert.equal(row.audio.loadingActiveObserved, true);
  assert.equal(row.audio.coveredLoadingClockWitness.before.contextId,
    row.audio.coveredLoadingClockWitness.after.contextId);
  assert.equal(row.audio.coveredLoadingClockWitness.before.currentTimeS, 1);
  assert.equal(row.audio.coveredLoadingClockWitness.after.currentTimeS, 2);
  assert.equal(row.audio.completion.state, 'running');
  assert.equal(row.audio.completion.loadingActive, false);
  assert.equal(row.audio.completion.ambientActive, false);
  browserWindow.__BATTLE_LOAD.stages.world = 9000;
  assert.equal(row.loadingTraces.__BATTLE_LOAD.stages.world, 4000, 'debug receipt is copied at completion');

  tick(25000);
  assert.equal(row.maxFrameGapMs, 5000, 'post-completion screenshot pauses are excluded');
  trace.arm('battle-again', '.battle');
  now = 25010;
  dispatch('click', { target: new Target(), isTrusted: true });
  elements.set('.cot-bl.on, .cot-bl.leaving', loader);
  tick(25020);
  const next = trace.finish();
  assert.equal(next.maxFrameGapMs, 10, 'a fresh trusted click resets previous idle/capture gaps');
  assert.deepEqual(next.longTasks, []);
  observer.callback({ getEntries: () => Array.from({ length: 600 }, () => task(25020, 100)) });
  assert.equal(next.longTasks.length, 512, 'long-task retention is bounded');
  assert.equal(next.longTasksDropped, 88, 'dropped evidence is explicit, not silently complete');
  assert.equal(summarizeGarageActionTiming(next).longTaskEvidenceIncomplete, true);
  const unsupported = summarizeGarageActionTiming({ ...row, longTaskSupported: false, longTasks: [] });
  assert.equal(unsupported.overlappingLongTaskMs, null);
  assert.equal(unsupported.unattributedGapMs, null,
    'unsupported Long Tasks API cannot claim absence of main-thread work');

  trace.arm('battle-again', '.battle');
  now = 26000;
  dispatch('click', { target: new Target(), isTrusted: true });
  browserWindow.__COT_AUDIO = { ...browserWindow.__COT_AUDIO, loadingActive: true };
  tick(26010);
  const retainedContextId = trace.finish().audio.last.contextId;
  assert.equal(retainedContextId, row.audio.completion.contextId,
    'reinstalling the API wrapper preserves actual context identity across actions');
  browserWindow.__COT_AUDIO.ctx = { state: 'running', currentTime: 100 };
  tick(26020);
  assert.equal(trace.finish().audio.runningClockWitness, null,
    'a replacement context with a larger clock cannot fake clock advancement');
  browserWindow.__COT_AUDIO.ctx.state = 'suspended';
  browserWindow.__COT_AUDIO.ctx.currentTime = 101;
  tick(26030);
  assert.equal(trace.finish().audio.runningClockWitness, null, 'suspended clocks are not playback proof');
  browserWindow.__COT_AUDIO.ctx.state = 'running';
  tick(26040);
  tick(26050);
  assert.equal(trace.finish().audio.runningClockWitness, null, 'a running but frozen clock cannot pass');
  browserWindow.__COT_AUDIO.ctx.currentTime = 102;
  tick(26060);
  assert.ok(trace.finish().audio.coveredLoadingClockWitness);
  for (let i = 0; i < 80; i++) tick(26100 + i * 20);
  assert.equal(trace.finish().audio.samples.length, 64, 'audio rAF evidence retention is bounded');
  assert.ok(trace.finish().audio.samplesDropped > 0);

  trace.arm('return-to-garage', '.battle');
  now = 28000;
  dispatch('click', { target: new Target(), isTrusted: true });
  browserWindow.__COT_AUDIO.ctx = audioContext;
  browserWindow.__COT_AUDIO.loadingActive = false;
  game.phase = 'garage';
  elements.clear();
  elements.set('.cot-garage', loader);
  tick(28010);
  assert.equal(trace.done(), true);
  assert.equal(trace.finish().audio.completion.contextId, retainedContextId);
  assert.equal(trace.finish().audio.completion.loadingActive, false);
  assert.equal(trace.finish().audio.completion.ambientActive, false);

  trace.arm('battle', '.battle');
  now = 29000;
  dispatch('click', { target: new Target(), isTrusted: true });
  delete browserWindow.__COT_AUDIO;
  tick(29010);
  assert.equal(trace.finish().audio.last, null, 'missing audio stays unobserved, not silently stopped');
  assert.equal(trace.finish().audio.unavailableSamples, 1);
  trace.stop();
  assert.equal(observer.disconnected, true);
  assert.equal(frames.size, 0);
  assert.ok([...listeners.values()].every(set => set.size === 0));
} finally {
  browserWindow.__ACTION_TRACE?.stop();
  for (const name of names) {
    const descriptor = saved.get(name);
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
}

function profileFixture({ enabled = true, failMethod = null, failWork = false, failWrite = false } = {}) {
  const events = [], saved = [], cleanup = [];
  const workError = new Error('action failed');
  let pageTime = 100;
  return { events, saved, cleanup, workError,
    run: () => withGarageActionProfile({
      enabled, action: 'battle', page: { evaluate: async () => pageTime++ },
      cdp: { send: async method => {
        events.push(method);
        if (method === failMethod) throw new Error(method);
        return method === 'Profiler.stop' ? { profile: { nodes: [], startTime: 100000, endTime: 150000 } } : {};
      } },
      onProfile: async (profile, capture) => {
        events.push('write');
        if (failWrite) throw new Error('write failed');
        saved.push({ profile, capture });
      },
      onCleanupError: error => cleanup.push(error.message),
    }, async () => { events.push('trusted-action'); if (failWork) throw workError; return 'receipt'; }),
  };
}
const normal = profileFixture({ enabled: false });
assert.equal(await normal.run(), 'receipt');
assert.deepEqual(normal.events, ['trusted-action'], 'unprofiled default sends no profiler commands');
const profiled = profileFixture();
assert.equal(await profiled.run(), 'receipt');
assert.deepEqual(profiled.events, ['Profiler.enable', 'Profiler.start', 'trusted-action',
  'Profiler.stop', 'write', 'Profiler.disable']);
assert.equal(profiled.saved[0].capture.attributionOnly, true);
assert.equal(profiled.saved[0].capture.completedAction, true);
assert.equal(profiled.saved[0].capture.afterStartPageMs, 101);
const failedAction = profileFixture({ failWork: true });
await assert.rejects(failedAction.run(), error => error === failedAction.workError);
assert.equal(failedAction.saved[0].capture.completedAction, false, 'failed actions retain partial attribution');
assert.equal(failedAction.events.at(-1), 'Profiler.disable');
const failedCleanup = profileFixture({ failWork: true, failMethod: 'Profiler.stop' });
await assert.rejects(failedCleanup.run(), error => error === failedCleanup.workError);
assert.deepEqual(failedCleanup.cleanup, ['Profiler.stop'], 'cleanup must not replace the primary action failure');
assert.equal(failedCleanup.events.at(-1), 'Profiler.disable');
const failedStart = profileFixture({ failMethod: 'Profiler.start' });
await assert.rejects(failedStart.run(), /Profiler.start/);
assert.deepEqual(failedStart.events, ['Profiler.enable', 'Profiler.start', 'Profiler.disable']);
const failedWrite = profileFixture({ failWrite: true });
await assert.rejects(failedWrite.run(), /write failed/);
assert.equal(failedWrite.events.at(-1), 'Profiler.disable');
console.log('garage-action-timing.selftest: bounded intervals, long-task overlap, visibility, diagnostics and cleanup pass');
