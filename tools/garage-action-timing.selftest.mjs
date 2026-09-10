import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installGarageActionTiming, summarizeGarageActionTiming, withGarageActionProfile,
  withGarageActionTrace } from './garage-action-timing.mjs';

const names = ['window', 'document', 'performance', 'PerformanceObserver',
  'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'Element'];
const saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
let now = 0, nextFrame = 0, observer;
const observers = [];
const frames = new Map(), listeners = new Map();
const elements = new Map();
const stage = { textContent: 'Building world' };
const loader = { getClientRects: () => [{}], querySelector: () => stage };
class Target { closest(selector) { return selector === '.battle' ? this : null; } }
class TaskObserver {
  static supportedEntryTypes = ['longtask'];
  static failType = null;
  pending = [];
  disconnected = false;
  constructor(callback) { this.callback = callback; observer = this; observers.push(this); }
  observe(options) { this.options = options; if (options.type === TaskObserver.failType) throw new Error('observe denied'); }
  takeRecords() { if (this.failDrain) throw new Error('drain failed'); return this.pending.splice(0); }
  disconnect() { this.disconnected = true; if (this.failDisconnect) throw new Error('disconnect failed'); }
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

  const script = overrides => ({ sourceURL: 'http://fixture/assets/main.js', sourceFunctionName: 'buildWorld',
    sourceCharPosition: 42, invoker: 'Window.requestAnimationFrame', invokerType: 'user-callback',
    windowAttribution: 'self', startTime: 150, duration: 80, executionStart: 151,
    forcedStyleAndLayoutDuration: 0, pauseDuration: 0,
    get window() { throw new Error('Window references must never be accessed'); }, ...overrides });
  const animation = (startTime, duration, scripts = []) => ({ startTime, duration, scripts,
    renderStart: 0, styleAndLayoutStart: 0, blockingDuration: 0, firstUIEventTimestamp: 0 });
  const beginAnimation = (types = ['longtask', 'long-animation-frame'], trusted = true) => {
    TaskObserver.supportedEntryTypes = types;
    observers.length = 0;
    browserWindow.location = { origin: 'http://fixture' };
    game.phase = 'garage'; game.battleCount = 0; elements.clear();
    installGarageActionTiming();
    const api = browserWindow.__ACTION_TRACE;
    api.arm('battle', '.battle'); now = 100;
    dispatch('click', { target: new Target(), isTrusted: trusted });
    tick(110);
    return { api, loaf: observers.find(value => value.options?.type === 'long-animation-frame'),
      tasks: observers.find(value => value.options?.type === 'longtask') };
  };
  const stopped = fixture => {
    fixture.api.stop(); fixture.api.stop();
    assert.ok(observers.every(value => value.disconnected));
    assert.equal(frames.size, 0);
    assert.ok([...listeners.values()].every(set => set.size === 0));
  };
  const observed = beginAnimation();
  assert.deepEqual(observed.loaf.options, { type: 'long-animation-frame', buffered: true });
  game.phase = 'battle'; game.battleCount = 1; tick(300);
  observed.loaf.pending.push(animation(40, 60), animation(80, 80), animation(150, 115, [script(),
    script({ sourceURL: 'https://foreign.invalid/private.js' }), script({ sourceURL: '', sourceCharPosition: -1,
      executionStart: Infinity, pauseDuration: NaN, invoker: 'x'.repeat(900) })]),
    animation(280, 80), animation(300, 80));
  const animationRow = observed.api.finish();
  assert.equal(animationRow.longAnimationFrameSupported, true);
  assert.equal(animationRow.longAnimationFrames.length, 3, 'drain retains only strict click/completion overlap, including straddles');
  const entry = animationRow.longAnimationFrames[1];
  assert.deepEqual([entry.startTime, entry.duration, entry.renderStart, entry.styleAndLayoutStart,
    entry.blockingDuration, entry.firstUIEventTimestamp], [150, 115, 0, 0, 0, 0], 'raw finite zeros remain meaningful');
  assert.equal(entry.scriptsFiltered, 1, 'foreign script metadata is excluded explicitly');
  assert.equal(entry.scripts.length, 2);
  assert.equal(entry.scripts[0].sourceCharPosition, 42);
  assert.equal(entry.scripts[0].forcedStyleAndLayoutDuration, 0);
  assert.equal(entry.scripts[1].sourceCharPosition, -1);
  assert.equal(entry.scripts[1].executionStart, null);
  assert.equal(entry.scripts[1].pauseDuration, null);
  assert.equal(entry.scripts[1].invoker.length, 512);
  assert.ok(!Object.hasOwn(entry.scripts[0], 'window'));
  assert.doesNotMatch(JSON.stringify(animationRow.longAnimationFrames), /foreign\.invalid/);
  const animationSummary = summarizeGarageActionTiming(animationRow);
  assert.equal(animationSummary.overlappingLongAnimationFrameCount, 3);
  assert.equal(animationSummary.unattributedGapMs, 190, 'LoAF attribution never subtracts from the existing LongTask remainder');
  assert.equal(animationSummary.overlappingLongTaskCount, 0);
  assert.equal(animationSummary.longAnimationFrameEvidenceIncomplete, true, 'filtered script details stay explicit');
  observed.loaf.pending.push(animation(180, 80));
  observed.api.arm('battle-again', '.battle'); now = 500;
  dispatch('click', { target: new Target(), isTrusted: true }); tick(510);
  const rearmed = observed.api.finish();
  assert.equal(animationRow.longAnimationFrames.length, 4, 'rearm drains the old owner before replacing it');
  assert.deepEqual(rearmed.longAnimationFrames, []);
  observed.loaf.callback({ getEntries: () => [animation(180, 80), animation(490, 80)] });
  assert.equal(rearmed.longAnimationFrames.length, 1, 'late old entries are filtered; genuine new-window straddles survive');
  observed.loaf.pending.push(animation(520, 80));
  stopped(observed);
  assert.equal(rearmed.longAnimationFrames.length, 2, 'stop drains pending evidence before disconnect');
  observed.loaf.callback({ getEntries() { throw new Error('late callback must not run'); } });
  assert.equal(rearmed.longAnimationFrameSupported, true);

  const capped = beginAnimation(['long-animation-frame']);
  const forty = Array.from({ length: 40 }, () => script());
  capped.loaf.callback({ getEntries: () => Array.from({ length: 130 }, () => animation(150, 115, forty)) });
  capped.loaf.pending.push(animation(NaN, 80), animation(150, Infinity));
  const cappedRow = capped.api.finish();
  assert.equal(cappedRow.longTaskSupported, false, 'LoAF availability is independent of LongTask support');
  assert.equal(cappedRow.longAnimationFrames.length, 128);
  assert.equal(cappedRow.longAnimationFramesDropped, 4);
  assert.equal(cappedRow.longAnimationFramesInvalid, 2);
  assert.ok(cappedRow.longAnimationFrames.every(value => value.scripts.length === 32 && value.scriptsDropped === 8));
  assert.equal(summarizeGarageActionTiming(cappedRow).unattributedGapMs, null);
  assert.equal(summarizeGarageActionTiming(cappedRow).longAnimationFrameEvidenceIncomplete, true);
  stopped(capped);

  const synthetic = beginAnimation(undefined, false);
  synthetic.loaf.pending.push(animation(150, 100));
  assert.deepEqual(synthetic.api.finish().longAnimationFrames, [], 'untrusted clicks never admit LoAF attribution');
  assert.equal(summarizeGarageActionTiming(synthetic.api.finish()).overlappingLongAnimationFrameCount, null);
  stopped(synthetic);
  const unavailable = beginAnimation(['longtask']);
  assert.equal(unavailable.api.finish().longAnimationFrameSupported, false);
  assert.equal(unavailable.api.finish().longAnimationFrames, null, 'unsupported is not an observed empty window');
  assert.equal(summarizeGarageActionTiming(unavailable.api.finish()).overlappingLongAnimationFrames, null);
  stopped(unavailable);
  TaskObserver.failType = 'long-animation-frame';
  const denied = beginAnimation();
  denied.tasks.pending.push(task(105, 80));
  assert.equal(denied.api.finish().longTaskSupported, true);
  assert.equal(denied.api.finish().longAnimationFrameSupported, false);
  assert.equal(denied.api.finish().longAnimationFrames, null);
  assert.equal(denied.api.finish().longTasks.length, 1);
  assert.equal(summarizeGarageActionTiming(denied.api.finish()).overlappingLongTaskMs, 5);
  assert.match(denied.api.finish().longAnimationFrameObservationError, /observe denied/);
  assert.equal(denied.loaf.disconnected, true);
  stopped(denied); TaskObserver.failType = null;
  for (const failure of ['callback', 'drain', 'disconnect']) {
    const broken = beginAnimation();
    broken.tasks.pending.push(task(105, 80));
    if (failure === 'callback') broken.loaf.callback({ getEntries() { throw new Error('callback failed'); } });
    else if (failure === 'drain') broken.loaf.failDrain = true;
    else broken.loaf.failDisconnect = true;
    const brokenRow = broken.api.finish();
    stopped(broken);
    assert.equal(brokenRow.longAnimationFrameSupported, false);
    assert.equal(brokenRow.longAnimationFrames, null, 'failed empty observation is unavailable, not evidence of absence');
    assert.match(brokenRow.longAnimationFrameObservationError, /failed/);
    assert.equal(brokenRow.longTaskSupported, true, 'observer failures cannot disable the original LongTask evidence');
    assert.equal(brokenRow.longTasks.length, 1);
    assert.equal(summarizeGarageActionTiming(brokenRow).overlappingLongTaskMs, 5);
    assert.equal(summarizeGarageActionTiming(brokenRow).unattributedGapMs, 5);
  }
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

function traceFixture(options = {}) {
  const { enabled = true, failStart = false, failWork = false, failStop = false,
    failWrite = false, interrupt = false, traceResult = {} } = options;
  const events = [], saved = [], cleanup = [], owners = [];
  const workError = Object.hasOwn(options, 'workError') ? options.workError : new Error('original action error');
  const receipt = { clickedAt: 110, totalMs: 20 };
  let active;
  return { events, saved, cleanup, owners, workError, receipt,
    run: () => withGarageActionTrace({
      enabled, action: 'battle', page: {},
      startTrace: async (_page, options) => {
        events.push('start');
        assert.deepEqual(options, { durationMs: 30000 });
        if (failStart) throw new Error('frame_trace_start_failed');
        return { stop: async reason => {
          events.push(`stop:${reason}`);
          if (failStop) throw new Error('PRIVATE protocol details');
          return { complete: true, baselinePageTimeMs: 100, captureEndPageTimeMs: 140,
            clockDriftMs: 0, rows: [{ kind: 'gc', startOffsetMs: 12, durationMs: 5, thread: 'page-main' }],
            rowsDropped: 0, dataLossOccurred: false, stopReason: reason, ...traceResult };
        } };
      },
      onOwner: owner => { active = owner; owners.push(owner === null ? 'released' : 'owned'); },
      onTrace: async (trace, capture) => {
        events.push('write');
        if (failWrite) throw new Error('PRIVATE output path');
        saved.push({ trace, capture });
      },
      onCleanupError: error => cleanup.push(error.message),
    }, async () => {
      events.push('trusted-action');
      if (interrupt) {
        const first = active.stop('interrupted');
        assert.equal(active.stop('interrupted'), first, 'signal and finally share one stop/persist owner');
        await first;
      }
      if (failWork) throw workError;
      return receipt;
    }),
  };
}
const noTrace = traceFixture({ enabled: false });
assert.equal(await noTrace.run(), noTrace.receipt);
assert.deepEqual(noTrace.events, ['trusted-action'], 'default never starts a trace or writes an artifact');
assert.deepEqual(noTrace.owners, []);
const traced = traceFixture();
assert.equal(await traced.run(), traced.receipt, 'diagnostic preserves the exact functional receipt');
assert.deepEqual(traced.events, ['start', 'trusted-action', 'stop:action-complete', 'write']);
assert.deepEqual(traced.owners, ['owned', 'released']);
assert.equal(traced.saved[0].capture.attributionOnly, true);
assert.equal(traced.saved[0].capture.completeForAction, true);
assert.equal(traced.saved[0].capture.censored, false);
assert.equal(traced.saved[0].capture.rowsRecorded, 1);
const deadlineTrace = traceFixture({ traceResult: { stopReason: 'deadline', captureEndPageTimeMs: 125 } });
assert.equal(await deadlineTrace.run(), deadlineTrace.receipt, 'deadline does not alter functional/readiness gates');
assert.equal(deadlineTrace.saved[0].capture.traceComplete, true, 'the bounded trace itself may be complete');
assert.equal(deadlineTrace.saved[0].capture.completeForAction, false, 'never claim a censored action was covered');
assert.equal(deadlineTrace.saved[0].capture.censored, true);
for (const traceResult of [
  { complete: false, rowsDropped: 1 },
  { complete: false, dataLossOccurred: true },
  { baselinePageTimeMs: 111 },
  { captureEndPageTimeMs: null },
]) {
  const incomplete = traceFixture({ traceResult });
  assert.equal(await incomplete.run(), incomplete.receipt);
  assert.equal(incomplete.saved[0].capture.completeForAction, false);
}
const traceActionFailure = traceFixture({ failWork: true });
await assert.rejects(traceActionFailure.run(), error => error === traceActionFailure.workError);
assert.equal(traceActionFailure.saved[0].capture.completedAction, false);
assert.equal(traceActionFailure.saved[0].capture.censored, true);
assert.equal(traceActionFailure.saved[0].capture.stopReason, 'action-failed');
const traceStartFailure = traceFixture({ failStart: true });
await assert.rejects(traceStartFailure.run(), /frame_trace_start_failed/);
assert.deepEqual(traceStartFailure.events, ['start', 'write'], 'failed startup cannot stop a foreign trace or click');
assert.equal(traceStartFailure.saved[0].trace, null);
assert.equal(traceStartFailure.saved[0].capture.rowsRecorded, null);
assert.equal(traceStartFailure.saved[0].capture.observationError, 'action_trace_start_failed');
const traceStopFailure = traceFixture({ failStop: true });
await assert.rejects(traceStopFailure.run(), /action_trace_stop_failed/);
assert.equal(traceStopFailure.saved[0].trace, null, 'failed flush is unavailable, not an empty trace');
assert.equal(traceStopFailure.saved[0].capture.observationError, 'action_trace_stop_failed');
assert.ok(!JSON.stringify(traceStopFailure.saved).includes('PRIVATE'));
assert.deepEqual(traceStopFailure.owners, ['owned', 'released']);
const traceDoubleFailure = traceFixture({ failWork: true, failStop: true });
await assert.rejects(traceDoubleFailure.run(), error => error === traceDoubleFailure.workError);
assert.deepEqual(traceDoubleFailure.cleanup, ['action_trace_stop_failed']);
for (const workError of [null, undefined, 0, false, '']) {
  const falsyFailure = traceFixture({ failWork: true, failStop: true, workError });
  let caught = false;
  try { await falsyFailure.run(); }
  catch (error) { caught = true; assert.equal(error, workError); }
  assert.equal(caught, true, 'every thrown JS value survives trace cleanup failure');
  assert.equal(falsyFailure.saved[0].capture.stopReason, 'action-failed');
  assert.deepEqual(falsyFailure.cleanup, ['action_trace_stop_failed']);
}
const traceWriteFailure = traceFixture({ failWrite: true });
await assert.rejects(traceWriteFailure.run(), /action_trace_write_failed/);
assert.deepEqual(traceWriteFailure.owners, ['owned', 'released']);
const interruptedTrace = traceFixture({ interrupt: true, failWork: true });
await assert.rejects(interruptedTrace.run(), error => error === interruptedTrace.workError);
assert.deepEqual(interruptedTrace.events, ['start', 'trusted-action', 'stop:interrupted', 'write']);
assert.equal(interruptedTrace.saved[0].capture.censored, true);
assert.equal(interruptedTrace.saved[0].capture.completedAction, false);
assert.deepEqual(interruptedTrace.owners, ['owned', 'released']);

const probeSource = readFileSync(new URL('./garage-battle-actions-probe.mjs', import.meta.url), 'utf8');
assert.match(probeSource, /if \(traceActions && profileActions\) throw/);
assert.ok(probeSource.indexOf('if (traceActions && profileActions)') < probeSource.indexOf('await mkdir(out)'));
assert.match(probeSource, /traceActions \? \[readFile\(new URL\('\.\/multiplayer-frame-trace\.mjs'/,
  'only requested timeline acquisitions hash the collector');
assert.match(probeSource, /traceActions \? \(await import\('\.\/multiplayer-frame-trace\.mjs'\)\)/);
assert.match(probeSource, /measurementMode: traceActions \? 'timeline-trace-attribution-only'/);
assert.match(probeSource, /const file = `\$\{action\}\.trace\.json`;[\s\S]*?flag: 'wx'/);
assert.match(probeSource, /activeActionTrace\?\.stop\('interrupted'\)[\s\S]*?finally\(closeOwnedBrowser\)/);
assert.match(probeSource, /if \(activeActionTrace\) \{[\s\S]*?await activeActionTrace\.stop/);
console.log('garage-action-timing.selftest: bounded intervals, LongTask/LoAF, optional action timelines and owned cleanup pass');
