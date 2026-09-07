import assert from 'node:assert/strict';
import { createDevTraceCore } from './perfTrace.ts';
import { buildQaSummary } from '../ui/perfHud.ts';
import { debugModeRequested } from './debugIntent.ts';

let clock = 1000;
const game = {
  phase: 'battle', timeS: 1, preBattleS: 0, result: null,
  player: { input: { throttle: 0.5, steer: -0.25, fire: false } },
};
const renderer = {
  info: {
    programs: [{}, {}],
    memory: { geometries: 42, textures: 17 },
    render: { frame: 1, calls: 12, triangles: 3456 },
  },
};
const actionHandlers = new Map();
const input = {
  actionDefs: [{ id: 'reload' }, { id: 'sniperToggle' }],
  onAction(id, fn) { actionHandlers.set(id, fn); },
};
const trace = createDevTraceCore({
  enabled: true, now: () => clock,
  eventCapacity: 5, frameCapacity: 8,
});
trace.configure({
  game, renderer, input,
  getContext: () => ({ cameraMode: 'CHASE', renderScale: 0.75 }),
  getTelemetry: () => ({ quality: { preset: 'mobile' } }),
});
trace.clear();

const reused = { id: 7, nested: { hp: 900 }, loop: null };
reused.loop = reused;
trace.event('tank:damaged', reused);
reused.id = 99;
reused.nested.hp = 0;
const copied = trace.tail(1, 'bus')[0];
assert.equal(copied.data.id, 7, 'bus payload is copied at emission time');
assert.equal(copied.data.nested.hp, 900);
assert.equal(copied.data.loop, '[Circular]');

trace.event('network:roomState', {
  playerId: 'p1', role: 'client',
  state: {
    roomCode: 'ABC123', phase: 'waiting', revision: 8, round: 2,
    players: [
      { id: 'p1', ready: true, connected: true, equipment: ['rammer', 'optics'] },
      { id: 'p2', ready: false, connected: false, equipment: ['vstab'] },
    ],
  },
});
const roomTrace = trace.tail(1, 'bus')[0].data;
assert.equal(roomTrace.state.playerCount, 2);
assert.equal(roomTrace.state.readyCount, 1);
assert.equal(roomTrace.state.connectedCount, 1);
assert.equal(roomTrace.state.players, undefined,
  'QA traces summarize room revisions without cloning complete lobby records');

actionHandlers.get('reload')('KeyR');
assert.equal(trace.tail(1, 'action')[0].name, 'reload');

clock += 16;
trace.frame(16);
clock += 16;
game.timeS += 0.016;
renderer.info.render.frame++;
trace.frame(16);

// A marked, synthetic main-thread stall must be classified as a screen freeze.
clock += 320;
trace.frame(100);
clock += 448;
trace.frame(100);
let anomalies = trace.tail(20, 'anomaly');
assert.ok(anomalies.some((row) => row.name === 'screen:freeze'));
assert.ok(anomalies.some((row) => row.name === 'sim:freeze'));
assert.ok(anomalies.some((row) => row.name === 'render:freeze'));

clock += 16;
game.timeS += 0.016;
renderer.info.render.frame++;
trace.frame(16);
anomalies = trace.tail(20, 'anomaly');
assert.ok(anomalies.some((row) => row.name === 'sim:resume'));
assert.ok(anomalies.some((row) => row.name === 'render:resume'));

const liveSpikesBeforeResult = trace.stats().liveSpikes;
game.result = 'victory';
clock += 60;
renderer.info.render.frame++;
trace.frame(60);
assert.equal(trace.stats().liveSpikes, liveSpikesBeforeResult,
  'result-transition gaps are reported but not mislabeled as live gameplay spikes');
game.result = null;

for (let i = 0; i < 12; i++) trace.event(`bounded:${i}`, { i });
const stats = trace.stats();
assert.equal(stats.frames, 6);
assert.equal(stats.events, 5);
assert.ok(stats.eventsDropped > 0, 'bounded event ring reports overwritten rows');
assert.ok(stats.freezes >= 2);
assert.ok(stats.liveFreezes >= 1, 'live gameplay freeze counter remains strict');
assert.ok(stats.maxGapMs >= 448);

const snapshot = trace.snapshot();
assert.deepEqual(snapshot.frameSchema.slice(0, 5), ['tMs', 'gapMs', 'dtMs', 'simS', 'preBattleS']);
assert.equal(snapshot.frames[0][0], 16, 'clear resets the trace-relative clock');
assert.equal(snapshot.frames[0].length, snapshot.frameSchema.length);
const columns = Object.fromEntries(snapshot.frameSchema.map((name, i) => [name, i]));
assert.equal(snapshot.frames[0][columns.geometries], 42);
assert.equal(snapshot.frames[0][columns.textures], 17);
assert.equal(snapshot.frames[0][columns.renderScale], 0.75);
assert.equal(snapshot.telemetry.quality.preset, 'mobile');
assert.equal(trace.snapshot({ frames: false, events: false }).frames.length, 0);
const exported = JSON.parse(trace.exportJson());
assert.equal(exported?.version, 1);
const exportedWithoutFrames = JSON.parse(trace.exportJson(false, { frames: false, gpu: false }));
assert.equal(exportedWithoutFrames?.frames?.length, 0);

assert.equal(debugModeRequested('?debug=1'), true);
assert.equal(debugModeRequested('?debug=off'), false);
const qaSummary = buildQaSummary({
  capturedAt: '2026-08-22T00:00:00.000Z', traceStats: { frames: 120 },
  hudSnapshot: { stats: { fps: 55.5 }, telemetry: { quality: { preset: 'mobile' } } },
});
assert.equal(qaSummary.trace.frames, 120);
assert.equal(qaSummary.frame.fps, 55.5);
assert.equal(qaSummary.telemetry.quality.preset, 'mobile');

// freeze/resume do not bubble from document to window. Exercise actual EventTarget
// dispatch and exact cleanup, not a source-string assertion or a synthetic window event.
class TraceTarget extends EventTarget {
  listeners = new Set();
  addEventListener(name, listener, options) {
    this.listeners.add(listener);
    super.addEventListener(name, listener, options);
  }
  removeEventListener(name, listener, options) {
    this.listeners.delete(listener);
    super.removeEventListener(name, listener, options);
  }
}
const priorGlobals = new Map(['window', 'document', 'PerformanceObserver'].map((name) =>
  [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
const browserWindow = Object.assign(new TraceTarget(), { innerWidth: 800, innerHeight: 600 });
const browserDocument = Object.assign(new TraceTarget(), {
  hidden: true, visibilityState: 'hidden', hasFocus: () => false,
});
const canvas = new TraceTarget();
const observers = [];
class TraceObserver {
  disconnected = 0;
  constructor(callback) { this.callback = callback; observers.push(this); }
  observe() {}
  disconnect() { this.disconnected++; }
}
let browserTrace;
let successor;
try {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: browserWindow });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: browserDocument });
  Object.defineProperty(globalThis, 'PerformanceObserver', { configurable: true, value: TraceObserver });
  browserTrace = createDevTraceCore({ enabled: true, now: () => clock, eventCapacity: 32,
    frameCapacity: 4, renderer: { ...renderer, domElement: canvas } });
  let inputOff = 0;
  browserTrace.configure({ input: { actionDefs: [{ id: 'fire' }], onAction() {
    return () => { inputOff++; };
  } } });
  browserDocument.dispatchEvent(new Event('freeze'));
  clock += 1000;
  browserDocument.dispatchEvent(new Event('resume'));
  assert.deepEqual(browserTrace.tail(8, 'lifecycle').map((row) => row.name), ['freeze', 'resume']);
  assert.deepEqual(browserTrace.tail(1, 'lifecycle')[0].data, {
    persisted: undefined, hidden: true, visibilityState: 'hidden', focused: false, viewport: [800, 600],
  });
  assert.equal(browserWindow.listeners.size, 6);
  assert.equal(browserDocument.listeners.size, 4);
  assert.equal(canvas.listeners.size, 2);
  browserTrace.stop();
  browserDocument.dispatchEvent(new Event('freeze'));
  assert.equal(browserTrace.tail(8, 'lifecycle').length, 2, 'stop still pauses without rebinding');
  browserTrace.start();
  browserDocument.dispatchEvent(new Event('resume'));
  assert.equal(browserTrace.tail(8, 'lifecycle').length, 3);
  successor = createDevTraceCore({ enabled: true, now: () => clock, eventCapacity: 8, frameCapacity: 4 });
  browserTrace.dispose();
  browserTrace.dispose();
  assert.equal(inputOff, 1);
  assert.equal(observers[0].disconnected, 1);
  assert.equal(browserWindow.__QA_TRACE, successor, 'old cleanup cannot unpublish a newer recorder');
  const eventsAfterDispose = browserTrace.stats().events;
  browserTrace.start();
  browserDocument.dispatchEvent(new Event('freeze'));
  observers[0].callback({ getEntries: () => [{ startTime: clock, duration: 100 }] });
  assert.equal(browserTrace.active, false);
  assert.equal(browserTrace.stats().events, eventsAfterDispose, 'late observer delivery remains inert');
  successor.dispose();
  assert.equal(observers[1].disconnected, 1);
  assert.equal(browserWindow.listeners.size + browserDocument.listeners.size + canvas.listeners.size, 0);
  assert.equal(browserWindow.__QA_TRACE, undefined);
  assert.equal(browserWindow.__DEV_TRACE, undefined);
} finally {
  browserTrace?.dispose?.();
  successor?.dispose?.();
  for (const [name, descriptor] of priorGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
}

console.log('perfTrace selftest: pass');
