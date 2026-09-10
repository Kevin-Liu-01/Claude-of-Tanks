import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { installGarageAudioIntent, readGarageAudioIntent, garageAudioGestureCandidates,
  checkGarageAudioGesture, checkGarageAudioIntent } from './garage-audio-intent.mjs';

const originals = new Map(['window', 'document', 'performance'].map(name =>
  [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
let now = 0;
const listeners = new Map(), calls = [];
const sentinel = new Error('native constructor rejection, never serialized');
class NativeAudioContext {
  static marker = Symbol('native static identity');
  constructor(...args) {
    calls.push({ args, newTarget: new.target });
    now += 7;
    if (args[0] === sentinel) throw sentinel;
    this.args = args;
  }
  method() { return this; }
}
const browserWindow = { AudioContext: NativeAudioContext, webkitAudioContext: NativeAudioContext };
const descriptors = new Map(['AudioContext', 'webkitAudioContext'].map(name =>
  [name, Object.getOwnPropertyDescriptor(browserWindow, name)]));
const browserDocument = {
  hidden: false, visibilityState: 'visible', hasFocus: () => true,
  addEventListener(type, fn, capture) {
    assert.equal(capture, true);
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
  },
  removeEventListener(type, fn, capture) { assert.equal(capture, true); listeners.get(type)?.delete(fn); },
};
const dispatch = event => { for (const listener of listeners.get(event.type) ?? []) listener(event); };
for (const [name, value] of Object.entries({ window: browserWindow, document: browserDocument,
  performance: { now: () => now } })) Object.defineProperty(globalThis, name, { configurable: true, value });

try {
  // Evaluate the serialized function just like evaluateOnNewDocument: no module closures.
  (0, eval)(`(${installGarageAudioIntent.toString()})()`);
  const trace = browserWindow.__GARAGE_AUDIO_INTENT, wrapper = browserWindow.AudioContext;
  assert.equal(trace.snapshot().count, 0, 'install never creates a context or test sound');
  assert.equal(browserWindow.webkitAudioContext, wrapper, 'native constructor aliases retain identity');
  assert.equal(wrapper.name, NativeAudioContext.name);
  assert.equal(wrapper.length, NativeAudioContext.length);
  assert.equal(wrapper.prototype, NativeAudioContext.prototype);
  assert.equal(wrapper.marker, NativeAudioContext.marker);
  assert.equal(Object.getPrototypeOf(wrapper), Object.getPrototypeOf(NativeAudioContext));
  assert.deepEqual(Reflect.ownKeys(wrapper), Reflect.ownKeys(NativeAudioContext));
  assert.throws(() => installGarageAudioIntent(), /already installed/, 'duplicate install cannot stack wrappers');

  const options = Object.freeze({ sampleRate: 44100, latencyHint: 'playback', sinkId: 'private-not-recorded' });
  const extra = Symbol('extra argument');
  const instance = new wrapper(options, extra);
  assert.equal(calls[0].args[0], options, 'native options retain identity, without getters/copies/defaults');
  assert.equal(calls[0].args[1], extra, 'all constructor arguments pass through');
  assert.equal(calls[0].newTarget, wrapper, 'direct newTarget is preserved exactly');
  assert.equal(instance.method(), instance);
  assert.ok(instance instanceof wrapper && instance instanceof NativeAudioContext);
  class DerivedContext extends wrapper {}
  const derived = new DerivedContext(options);
  assert.equal(calls[1].newTarget, DerivedContext, 'subclass newTarget is preserved');
  assert.ok(derived instanceof DerivedContext);
  class AlternateTarget {}
  const alternate = Reflect.construct(wrapper, [options], AlternateTarget);
  assert.equal(calls[2].newTarget, AlternateTarget);
  assert.equal(Object.getPrototypeOf(alternate), AlternateTarget.prototype);
  assert.throws(() => new browserWindow.webkitAudioContext(sentinel), error => error === sentinel,
    'native throws propagate unchanged');
  assert.throws(() => wrapper(), TypeError, 'native callable behavior remains unchanged');
  const snapshot = trace.snapshot();
  assert.equal(snapshot.count, 4, 'only construct, not failed function calls, is observed');
  assert.equal(snapshot.errorCount, 1);
  assert.deepEqual(snapshot.invocations.map(row => [row.startMs, row.endMs, row.error]),
    [[0, 7, false], [7, 14, false], [14, 21, false], [21, 28, true]]);
  assert.doesNotMatch(JSON.stringify(snapshot), /private-not-recorded|sampleRate|latencyHint|sinkId|native constructor rejection/);
  snapshot.invocations[0].startMs = -1;
  assert.equal(trace.snapshot().invocations[0].startMs, 0, 'snapshot does not expose mutable observer records');
  for (let index = 0; index < 70; index++) new wrapper();
  assert.equal(trace.snapshot().count, 74);
  assert.equal(trace.snapshot().invocations.length, 64);
  assert.equal(trace.snapshot().dropped, 10);

  const target = {};
  trace.armGesture(target);
  assert.throws(() => trace.armGesture(target), /not idle/);
  for (let index = 0; index < 40; index++) dispatch({ type: 'pointermove', isTrusted: true,
    target, clientX: index, clientY: 200, buttons: 1,
    movementX: 10, movementY: 0, pointerId: 7, pointerType: 'mouse', button: -1 });
  assert.equal(trace.finishGesture().events.length, 32);
  assert.equal(trace.snapshot().eventsDropped, 8);
  assert.deepEqual(trace.snapshot().events[0], { type: 'pointermove', trusted: true, canvasTarget: true,
    atMs: now, x: 0, y: 200, buttons: 1, movementX: 10, movementY: 0, pointerId: 7, pointerType: 'mouse', button: -1 });
  dispatch({ type: 'pointerup', target, isTrusted: true });
  assert.equal(trace.snapshot().eventsDropped, 8, 'finished gesture does not observe subsequent battle input');
  trace.armGesture(target);
  for (const type of ['gotpointercapture', 'pointercancel', 'lostpointercapture']) {
    dispatch({ type, isTrusted: true, target, pointerId: 7, pointerType: 'mouse' });
  }
  assert.deepEqual(trace.finishGesture().events.map(event => event.type),
    ['gotpointercapture', 'pointercancel', 'lostpointercapture'], 'capture and cancel evidence uses the same bounded observer');
  browserWindow.__DEBUG = { game: { phase: 'garage' }, showroom: { active: true, moving: true,
    debugState: () => ({ yawDeg: 12, dragging: true, sinceInputS: 0, pitchDeg: 5,
      stage: { cx: 0, cy: 0.2, hx: 0.4, hy: 0.5 } }) },
  frameLoopScheduler: { animationTicks: 42, queued: 'animation' }, garageFramePacer: { rendered: 30, skipped: 12 },
  renderer: { info: { render: { frame: 200 } } }, graphicsContextLost: false,
  garageGpuResidency: { suspended: false, releases: 0, resumes: 0, resumeFailures: 0, invalidations: 0, lastRelease: null },
  pedestalOnStage: true, pedestalVisual: { specId: 'm1a1', __pedestalCompiling: false, __pedestalCompileP: null,
    root: { uuid: 'hero-root-1', visible: true, position: { toArray: () => [-1500, 0.2, -1500] } } },
  camera: { quaternion: { toArray: () => [0, 0, 0, 1] } } };
  browserWindow.__PED_TRACE = Array.from({ length: 12 }, (_, t) => ({ t, ev: 'reveal', id: 'm1a1' }));
  assert.equal(readGarageAudioIntent().phase, 'garage');
  assert.equal(readGarageAudioIntent().observer.count, 74);
  const live = readGarageAudioIntent();
  assert.deepEqual(live.showroomState, { moving: true, dragging: true, sinceInputS: 0, pitchDeg: 5 });
  assert.deepEqual(live.visibility, { hidden: false, state: 'visible', focused: true });
  assert.equal(live.frameLoopScheduler.animationTicks, 42);
  assert.equal(live.garageFramePacer.rendered, 30);
  assert.equal(live.rendererFrame, 200);
  assert.equal(live.graphicsContextLost, false);
  assert.equal(live.garageGpuResidency.suspended, false);
  assert.deepEqual(live.pedestalState, { specId: 'm1a1', onStage: true, rootUuid: 'hero-root-1',
    rootPosition: [-1500, 0.2, -1500], rootVisible: true, compiling: false, compilePending: false });
  assert.equal(live.pedestalTrace.length, 8);
  assert.equal(live.pedestalTrace[0].t, 4, 'passive pedestal evidence retains only the newest eight small event records');
  live.pedestalTrace[0].ev = 'changed';
  assert.equal(browserWindow.__PED_TRACE[4].ev, 'reveal', 'passive receipt does not mutate live event evidence');
  const stopped = trace.stop();
  assert.deepEqual(stopped.cleanup, { restoredNames: ['AudioContext', 'webkitAudioContext'], notOwnedNames: [], failedNames: [] });
  assert.equal(trace.stop(), stopped, 'stop is idempotent');
  for (const [name, descriptor] of descriptors) assert.deepEqual(Object.getOwnPropertyDescriptor(browserWindow, name), descriptor);
  assert.equal(browserWindow.__GARAGE_AUDIO_INTENT, undefined);
  for (const set of listeners.values()) assert.equal(set.size, 0, 'stop removes every owned pointer listener');
  new wrapper(options);
  assert.equal(trace.snapshot().count, 74, 'retained wrapper still forwards but stops recording');
  assert.throws(() => trace.armGesture(target), /not idle/);

  installGarageAudioIntent();
  const ownershipTrace = browserWindow.__GARAGE_AUDIO_INTENT;
  const replacement = function OtherOwner() {};
  browserWindow.AudioContext = replacement;
  assert.deepEqual(ownershipTrace.snapshot().wrappedNames, ['webkitAudioContext']);
  assert.deepEqual(ownershipTrace.stop().cleanup.notOwnedNames, ['AudioContext']);
  assert.equal(browserWindow.AudioContext, replacement, 'stop never clobbers a later constructor owner');
  browserWindow.AudioContext = NativeAudioContext;

  Object.defineProperty(browserWindow, 'webkitAudioContext', { configurable: true, get: () => NativeAudioContext });
  installGarageAudioIntent();
  assert.equal(browserWindow.__GARAGE_AUDIO_INTENT.snapshot().installationErrors.length, 1,
    'unsupported descriptors fail coverage without changing accessor semantics');
  browserWindow.__GARAGE_AUDIO_INTENT.stop();
  Object.defineProperty(browserWindow, 'webkitAudioContext', descriptors.get('webkitAudioContext'));
} finally {
  browserWindow.__GARAGE_AUDIO_INTENT?.stop();
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
}

const viewport = { width: 1280, height: 720 };
for (const stage of [{ cx: 0, cy: 0.2, hx: 0.4, hy: 0.5 }, { cx: -0.2, cy: 0.1, hx: 2, hy: 3 }]) {
  for (const path of garageAudioGestureCandidates(stage, viewport)) {
    assert.equal(path.end.x - path.start.x, 100);
    assert.equal(path.start.y, path.end.y);
    for (const point of [path.start, path.end]) {
      assert.ok(point.x >= 12 && point.x <= viewport.width - 12 && point.y >= 12 && point.y <= viewport.height - 12);
      const xNdc = 2 * point.x / viewport.width - 1, yNdc = 1 - 2 * point.y / viewport.height;
      assert.ok(xNdc >= stage.cx - stage.hx && xNdc <= stage.cx + stage.hx);
      assert.ok(yNdc >= stage.cy - stage.hy && yNdc <= stage.cy + stage.hy);
    }
  }
}
assert.throws(() => garageAudioGestureCandidates(null, viewport), /finite/);
assert.deepEqual(garageAudioGestureCandidates({ cx: 0.25, cy: 0.5, hx: 0.4, hy: 0.4 }, viewport)[0],
  { start: { x: 750, y: 180 }, end: { x: 850, y: 180 } }, 'production NDC stage maps to CSS coordinates, with inverted y');
assert.throws(() => garageAudioGestureCandidates({ cx: 0, cy: 0.2, hx: 0.01, hy: 0.5 }, viewport), /too small/);
const observer = count => ({ count, errorCount: 0, dropped: 0, stopped: false, availableNames: ['AudioContext'],
  wrappedNames: ['AudioContext'], installationErrors: [], eventsDropped: 0,
  invocations: Array.from({ length: count }, (_, index) => ({ invocation: index + 1,
    name: 'AudioContext', startMs: 1400 + index, endMs: 1401 + index, error: false })),
  events: ['pointerdown', 'pointermove', 'pointerup'].map(type => ({ type, trusted: true, canvasTarget: true, buttons: type === 'pointerup' ? 0 : 1 })) });
const receipt = { before: { observer: observer(0), phase: 'garage', showroomActive: true, yawDeg: 0, quaternion: [0, 0, 0, 1] },
  after: { observer: observer(0), phase: 'garage', showroomActive: true, yawDeg: 4, quaternion: [0, 0, 0, 1] },
  canvasHitVerified: true, observationMs: 1000 };
const actions = ['battle', 'battle-again', 'return-to-garage'].map(action => ({ action, garageAudioIntent: { observer: observer(1) } }));
assert.deepEqual(checkGarageAudioGesture(receipt), []);
assert.deepEqual(checkGarageAudioIntent(receipt, actions), []);
assert.ok(checkGarageAudioIntent(null, []).length, 'missing evidence fails closed');
for (const mutate of [
  value => { value.before.observer = observer(1); },
  value => { value.after.observer = observer(1); },
  value => { value.after.observer.errorCount = 1; },
  value => { value.after.observer.dropped = 1; },
  value => { value.after.observer.wrappedNames = []; },
  value => { value.after.observer.availableNames = []; },
  value => { value.after.observer.stopped = true; },
  value => { value.after.observer.installationErrors = ['unsupported']; },
  value => { value.after.observer.events[0].trusted = false; },
  value => { value.after.observer.events[1].buttons = 0; },
  value => { value.after.observer.events[2].canvasTarget = false; },
  value => { value.after.observer.eventsDropped = 1; },
  value => { value.after.phase = 'battle'; },
  value => { value.after.showroomActive = false; },
  value => { value.canvasHitVerified = false; },
  value => { value.after.yawDeg = 0; },
  value => { value.observationMs = 999; },
]) {
  const changed = structuredClone(receipt);
  mutate(changed);
  assert.ok(checkGarageAudioIntent(changed, actions).length, `reject ${mutate}`);
}
const cameraOnly = structuredClone(receipt);
cameraOnly.after.yawDeg = 0;
cameraOnly.after.quaternion = [0, Math.sin(0.1), 0, Math.cos(0.1)];
assert.deepEqual(checkGarageAudioGesture(cameraOnly), [], 'actual camera movement is an independent orbit witness');
cameraOnly.after.quaternion = [0, 0, 0, -1];
assert.ok(checkGarageAudioGesture(cameraOnly).length, 'quaternion sign flip is not camera movement');
for (const mutate of [
  value => { value[0].garageAudioIntent.observer = observer(0); },
  value => { value[1].garageAudioIntent.observer = observer(2); },
  value => { value[2].garageAudioIntent.observer.invocations[0].endMs = null; },
  value => { value[1].garageAudioIntent.observer.invocations[0].error = true; },
  value => { value[2].garageAudioIntent.observer.invocations = []; },
]) {
  const changed = structuredClone(actions);
  mutate(changed);
  assert.ok(checkGarageAudioIntent(receipt, changed).length, `reject ${mutate}`);
}
const source = await readFile(new URL('./garage-battle-actions-probe.mjs', import.meta.url), 'utf8');
assert.ok(source.indexOf('evaluateOnNewDocument(installGarageAudioIntent)') < source.indexOf('page.goto(url.href'), 'constructor observation installs before boot');
assert.ok(source.indexOf('await runGarageAudioGesture()') < source.indexOf("await page.click('.cot-battle-mode')"), 'Garage gesture precedes every real Battle/mode click');
assert.match(source, /page\.mouse\.down\(/);
assert.match(source, /page\.mouse\.move\(path\.end\.x, path\.end\.y, \{ steps: 10 \}\)/);
assert.ok(source.indexOf('report.garageAudioIntent.held =') > source.indexOf('await page.mouse.move(path.end.x'),
  'held snapshot follows the tenth native move');
assert.ok(source.indexOf('report.garageAudioIntent.held =') < source.indexOf('await page.mouse.up('),
  'held snapshot precedes native release');
assert.ok(source.indexOf('report.garageAudioIntent.released =') > source.indexOf('await page.mouse.up('),
  'immediate release snapshot follows native release');
assert.match(source, /audioClockGate \|\| garageGestureAudioGate/, 'gesture gate retains real audio clock ownership proof');
console.log('garage audio intent: transparent native construction, bounded gesture receipts, lifecycle and fail-closed gates pass');
