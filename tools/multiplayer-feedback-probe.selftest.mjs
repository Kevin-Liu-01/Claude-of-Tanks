import assert from 'node:assert/strict';
import { createContext, runInContext } from 'node:vm';
import { metricDistribution, summarizeFeedbackSample, installFeedbackPeerObserver,
  readFeedbackIceStats, startFeedbackSample, stopFeedbackSample,
  sanitizeFeedbackTimingWindows, sanitizeFeedbackActions, selectNativeFeedbackAmmo,
  measureNativeFeedback } from './multiplayer-feedback-probe.mjs';

assert.deepEqual(metricDistribution([0, 10, 20, 30, null, NaN, Infinity, -1, '90']),
  { count: 4, p50: 10, p95: 30, p99: 30, max: 30 });
assert.deepEqual(metricDistribution([]), { count: 0, p50: null, p95: null, p99: null, max: null });
const raw = { durationMs: 20000, gapsMs: Array.from({ length: 100 }, (_, i) => i + 1),
  actions: [{ ready: true, matched: true }, { ready: true, matched: false }, { ready: false }],
  shots: [{ inputToFeedbackMs: 120, inputToNextRafMs: 130, authorityToFeedbackMs: 80 }], predicted: [],
  diagnostics: [{ hardSnaps: 5, reconciliations: 100, droppedHistory: 1, rttMs: 25 },
    { hardSnaps: 5, reconciliations: 110, droppedHistory: 1, rttMs: 30 }],
  traceFramesDropped: 0, observerFailures: 0, roomCode: 'PRIVATE_ROOM', sdp: 'PRIVATE_SDP' };
const summary = summarizeFeedbackSample(raw, [{ stunRttMs: 4, localType: 'relay', remoteType: 'host',
  protocol: 'udp', address: 'PRIVATE_IP', credential: 'PRIVATE_TURN' }]);
assert.equal(summary.frameGapMs.p95, 95);
assert.equal(summary.frameGapMs.p99, 99);
assert.equal(summary.hardSnaps, 0, 'report sample counter delta, not prior cumulative failures');
assert.equal(summary.reconciliations, 10);
assert.equal(summary.firing.readyAttempts, 2);
assert.equal(summary.firing.unmatchedReadyAttempts, 1);
assert.equal(summary.firing.predicted.count, 0, 'no speculative feedback is fabricated');
assert.equal(summary.sampleStartedAtMs, null, 'older reports have no invented browser clock origin');
assert.equal(summary.firing.actions[0].eligibility.locked, null,
  'missing historical eligibility is unknown rather than admitted');
assert.equal(summary.firing.confirmed.predictionSuppressedCount, 0,
  'legacy reports do not invent exact intent confirmations');
assert.equal(summary.ice.stunRttMs.p50, 4);
assert.doesNotMatch(JSON.stringify(summary), /PRIVATE/);
assert.equal(summarizeFeedbackSample({ ...raw, diagnostics: [{ hardSnaps: 5 }, { hardSnaps: 1 }] }).hardSnaps,
  null, 'counter reset must not masquerade as zero corrections');

let at = 100;
let fire;
const listeners = new Map();
const rafs = new Map();
let nextRaf = 0;
let timer;
let timerCleared = 0;
let unsubscribed = 0;
class Channel {
  label = 'cot-match-v1';
  listeners = new Map();
  addEventListener(name, callback) { this.listeners.set(name, callback); }
}
class Peer {
  connectionState = 'connected';
  listeners = new Map();
  constructor(config) { this.config = config; }
  addEventListener(name, callback) { this.listeners.set(name, callback); }
  createDataChannel() { return new Channel(); }
  async getStats() {
    return new Map([
      ['transport', { type: 'transport', selectedCandidatePairId: 'PRIVATE_PAIR' }],
      ['PRIVATE_PAIR', { localCandidateId: 'PRIVATE_LOCAL', remoteCandidateId: 'PRIVATE_REMOTE', currentRoundTripTime: 0.024 }],
      ['PRIVATE_LOCAL', { candidateType: 'relay', protocol: 'udp', relayProtocol: 'tls', address: 'PRIVATE_ADDRESS' }],
      ['PRIVATE_REMOTE', { candidateType: 'srflx', credential: 'PRIVATE_CREDENTIAL' }],
    ]);
  }
}
const debug = { input: { isLocked: () => false, isCursorAim: () => false,
  getState() { assert.fail('observation cannot poll input or read its buffered fire state'); },
  isDown() { assert.fail('observation cannot consume press latches'); },
  padActive() { assert.fail('observation cannot poll gamepad state'); },
  onAction(name, callback) {
  assert.equal(name, 'fire'); fire = callback; return () => { unsubscribed++; };
} }, bus: { on(name, callback) { listeners.set(name, callback); return () => { unsubscribed++; }; } },
game: { phase: 'battle', preBattleS: 0, result: null, player: { id: 'PRIVATE_PLAYER',
  input: { fire: false, shellSlot: 1 }, combat: { shellSlot: 0, ammo: [12, 4, 0], reload: { t: 0 } } } },
network: { rttMs: 4, transportBufferedBytes: 0, inputPacketsSubmitted: 52, prediction: { hardSnaps: 0 } } };
const trace = { enabled: true, stats: () => ({ durationMs: at }), snapshot: () => ({
  frameSchema: ['tMs', 'phase', 'preBattleS', 'flags', 'gapMs'], stats: { framesDropped: 0 },
  frames: [[90, 'battle', 0, 0, 999], [120, 'battle', 0, 0, 16], [130, 'battle', 0, 1, 999],
    [140, 'battle', 0, 2, 999], [150, 'battle', 3, 0, 999], [160, 'garage', 0, 0, 999]],
  events: [{ tMs: 100, kind: 'action', name: 'fire', data: { roomCode: 'PRIVATE_ROOM' } },
    { tMs: 110, kind: 'bus', name: 'weapon:predicted', data: { playerId: 'PRIVATE_PLAYER' } },
    { tMs: 120, name: 'PRIVATE_EVENT_NAME', data: 'PRIVATE_TOKEN' },
    { tMs: 125, name: 'longtask', data: { containerSrc: 'PRIVATE_URL' } }],
}) };
const context = createContext({ window: { __DEBUG: debug, __QA_TRACE: trace, RTCPeerConnection: Peer },
  document: { hidden: false, hasFocus: () => true }, performance: { now: () => at },
  setInterval(callback) { timer = callback; return 1; }, clearInterval() { timerCleared++; },
  requestAnimationFrame(callback) { rafs.set(++nextRaf, callback); return nextRaf; },
  cancelAnimationFrame(id) { rafs.delete(id); } });
const evaluate = (fn) => runInContext(`(${fn.toString()})()`, context);
evaluate(installFeedbackPeerObserver);
const peer = new context.window.RTCPeerConnection({ iceTransportPolicy: 'all' });
assert.ok(peer instanceof Peer, 'observer retains native instance identity');
assert.equal(peer.config.iceTransportPolicy, 'all', 'observer cannot force a relay path');
const channel = peer.createDataChannel();
evaluate(startFeedbackSample);
fire();
at = 110;
listeners.get('weapon:predicted')({ isPlayer: true });
at = 125;
channel.listeners.get('message')({ data: JSON.stringify({ type: 'event', payload: { events: [
  { type: 'shell_fired', shooterId: 'PRIVATE_PLAYER', shellId: 'PRIVATE_SHELL' },
  { type: 'shell_fired', shooterId: 'OTHER_PLAYER', shellId: 'OTHER_SHELL' },
] } }) });
at = 180;
listeners.get('shell:fired')({ isPlayer: false, shellId: 'OTHER_SHELL' });
listeners.get('shell:fired')({ isPlayer: true, shellId: 'PRIVATE_SHELL', feedbackPredicted: true });
at = 190;
for (const callback of rafs.values()) callback();
rafs.clear();
at = 210;
fire();
at = 220;
fire();
at = 230;
listeners.get('shell:fired')({ isPlayer: true, shellId: 'AMBIGUOUS' });
at = 240;
timer();
const ice = await evaluate(readFeedbackIceStats);
assert.equal(ice[0].stunRttMs, 24, 'RTC candidate RTT seconds must become milliseconds');
assert.equal(ice[0].relayProtocol, 'tls');
assert.doesNotMatch(JSON.stringify(ice), /PRIVATE/);
const sample = evaluate(stopFeedbackSample);
assert.deepEqual(Array.from(sample.gapsMs), [16], 'exclude pre-sample, hidden, unfocused, countdown, garage frames');
assert.equal(sample.shots.length, 1, 'one own confirmed shot, not opponent or ambiguous actions');
assert.equal(sample.shots[0].inputToFeedbackMs, 80);
assert.equal(sample.shots[0].inputToNextRafMs, 90);
assert.equal(sample.shots[0].authorityToFeedbackMs, 55);
assert.equal(sample.predicted.length, 1);
assert.equal(sample.predicted[0].inputToFeedbackMs, 10);
assert.equal(sample.shots[0].predictionSuppressed, true);
assert.equal(summarizeFeedbackSample(sample).firing.confirmed.predictionSuppressedCount, 1,
  'production receipt proves the real confirmation matched the predicted shot');
assert.equal(sample.actions.filter((row) => row.ambiguous).length, 2);
assert.equal(sample.sampleStartedAtMs, 100, 'clock alignment uses browser performance time, not wall time');
assert.equal(summarizeFeedbackSample(sample).sampleStartedAtMs, 100);
assert.deepEqual(JSON.parse(JSON.stringify(sample.actions[0])), {
  atMs: 0, ready: true, matched: true, ambiguous: false,
  eligibility: { locked: false, cursorAim: false, mouseFireLane: false,
    pointerLocked: false, focused: true, hidden: false, fireHeld: null, currentInputFire: false,
    shellSlot: 0, requestedShellSlot: 1, ammo: 12, requestedAmmo: 4, reloadS: 0, inputPacketsSubmitted: 52 },
}, 'reload-ready actions retain the observed blocked mouse lane and pending ammo switch');
assert.equal(summary.firing.readyAttempts, 2, 'new diagnostics do not rewrite historical readiness');
assert.equal(timerCleared, 1);
assert.equal(unsubscribed, 3);
assert.equal(context.window.__COT_FEEDBACK_NETWORK.onAuthority, null);
assert.doesNotMatch(JSON.stringify(sample), /PRIVATE|OTHER_PLAYER|AMBIGUOUS/);

const timing = JSON.parse(JSON.stringify(summarizeFeedbackSample(sample).timingWindows));
assert.equal(timing.halfWidthMs, 250);
assert.deepEqual(timing.windows.map((row) => row.kind),
  ['first-click', 'subsequent-click', 'subsequent-click', 'worst-frame']);
assert.deepEqual(timing.windows.slice(0, 3).map((row) => row.atMs), [0, 110, 120]);
assert.deepEqual(timing.windows[0].events.map((row) => [row.dtFromCenterMs, row.name]),
  [[0, 'fire'], [10, 'weapon:predicted'], [25, 'longtask']]);
assert.equal(timing.windows.at(-1).atMs, 20);
assert.equal(timing.windows.at(-1).gapStartedBeforeSample, false);
assert.equal(timing.windows[0].frames[0].dtFromCenterMs, -10,
  'diagnostic context may precede the click without changing live-only gap aggregates');
assert.equal(timing.windows[0].frames[0].programs, null, 'absent trace counters remain unavailable');

// The exported function must remain safe even when a stored artifact contains
// unexpected payload fields, numeric-looking secrets or excessive rows.
const untrusted = { windows: [
  { kind: 'PRIVATE_KIND', frames: [], events: [] },
  ...Array.from({ length: 10 }, () => ({ kind: 'first-click', atMs: 'PRIVATE_CLOCK',
    token: 'PRIVATE_TOKEN', frames: Array.from({ length: 80 }, () => ({ dtFromCenterMs: 0,
      programs: 'PRIVATE_PROGRAM', gapMs: 16, room: 'PRIVATE_ROOM' })),
    events: [{ dtFromCenterMs: 0, name: 'PRIVATE_EVENT' },
      { dtFromCenterMs: 251, name: 'fire' },
      ...Array.from({ length: 50 }, () => ({ dtFromCenterMs: 0, name: 'fire', sdp: 'PRIVATE_SDP' }))],
  })),
] };
const projected = sanitizeFeedbackTimingWindows(untrusted);
assert.equal(projected.windows.length, 5);
assert.equal(projected.windows[0].frames.length, 48);
assert.equal(projected.windows[0].events.length, 32);
assert.equal(projected.windows[0].atMs, null);
assert.doesNotMatch(JSON.stringify(projected), /PRIVATE/);
assert.equal(sanitizeFeedbackTimingWindows(null), null);
const actionSecrets = Array.from({ length: 200 }, () => ({ atMs: 'PRIVATE_CLOCK', ready: true,
  matched: false, ambiguous: false, roomCode: 'PRIVATE_ROOM', eligibility: {
    locked: 'PRIVATE_BOOL', currentInputFire: true, shellSlot: '1', requestedShellSlot: 1,
    ammo: Infinity, reloadS: NaN, inputPacketsSubmitted: 9, position: [1, 2, 3], token: 'PRIVATE_TOKEN',
  } }));
const safeActions = sanitizeFeedbackActions(actionSecrets);
assert.equal(safeActions.length, 128);
assert.equal(safeActions[0].atMs, null);
assert.equal(safeActions[0].eligibility.locked, null);
assert.equal(safeActions[0].eligibility.shellSlot, null);
assert.equal(safeActions[0].eligibility.ammo, null);
assert.equal(safeActions[0].eligibility.currentInputFire, true);
assert.equal(safeActions[0].eligibility.requestedShellSlot, 1);
assert.doesNotMatch(JSON.stringify(safeActions), /PRIVATE|position|token/);
assert.deepEqual(sanitizeFeedbackActions(null), []);
assert.equal(sanitizeFeedbackActions([null])[0].ready, null);

// Actual serialized browser observer path: dense trace windows stay bounded,
// preserve their center frame, and reveal a foreground-gap boundary overlap.
at = 1000;
trace.snapshot = () => ({ frameSchema: ['tMs', 'phase', 'preBattleS', 'flags', 'gapMs',
  'programs', 'geometries', 'textures', 'renderScale', 'heapMB'], stats: { framesDropped: 0 },
frames: Array.from({ length: 2001 }, (_, index) => [1000 + index / 4, 'battle', 0, 0,
  index === 500 ? 155 : 1 / 4, 19, 300, 25, 1, 88]),
events: Array.from({ length: 501 }, (_, index) => ({ tMs: 1000 + index,
  name: 'shell:fired', data: { room: 'PRIVATE_ROOM', address: 'PRIVATE_IP' } })),
});
evaluate(startFeedbackSample);
for (let index = 0; index < 8; index++) { at = 1000 + index * 50; fire(); }
for (let index = 0; index < 150; index++) fire();
at = 1600;
const crowded = evaluate(stopFeedbackSample);
assert.equal(crowded.actions.length, 128, 'the live browser observer also bounds click context');
assert.equal(summarizeFeedbackSample(crowded).firing.actions.length, 128);
assert.equal(crowded.timingWindows.windows.length, 5, 'four click windows plus one worst frame');
for (const window of crowded.timingWindows.windows) {
  assert.ok(window.frames.length <= 48 && window.events.length <= 32);
  assert.ok(window.frameRowsOmitted > 0, 'downsampling is explicit rather than silently complete');
  assert.ok(window.frames.every((row) => Math.abs(row.dtFromCenterMs) <= 250));
}
const worst = crowded.timingWindows.windows.at(-1);
assert.equal(worst.atMs, 125);
assert.equal(worst.gapStartedBeforeSample, true);
assert.ok(worst.frames.some((row) => row.dtFromCenterMs === 0 && row.gapMs === 155),
  'the worst frame is never lost when bounding a dense window');
assert.equal(worst.frames[0].programs, 19);
assert.equal(worst.frames[0].heapMB, 88);
assert.equal(timerCleared, 2);
assert.equal(unsubscribed, 6);
assert.equal(rafs.size, 0);
assert.equal(context.window.__COT_FEEDBACK_NETWORK.onAuthority, null);
assert.doesNotMatch(JSON.stringify(summarizeFeedbackSample(crowded)), /PRIVATE/);

const ammoCalls = [];
let selectedSlot = 1;
let ammoCount = 4;
const ammoPage = { keyboard: { async press(key) { ammoCalls.push(['key', key]); } },
  async waitForFunction(predicate, options, slot) {
    ammoCalls.push(['wait', options.timeout, slot]);
    const ready = runInContext(`(${predicate.toString()})(${slot})`, createContext({ window: {
      __DEBUG: { game: { player: { combat: { shellSlot: selectedSlot, ammo: [0, ammoCount, 0] } } } },
    } }));
    if (!ready) throw new Error('PRIVATE_WAIT_TOKEN');
  } };
assert.equal(await selectNativeFeedbackAmmo(ammoPage), 1);
assert.deepEqual(ammoCalls, [], 'the default slot-one baseline adds no selection key or wait');
assert.equal(await selectNativeFeedbackAmmo(ammoPage, 2), 2);
assert.deepEqual(ammoCalls, [['key', '2'], ['wait', 10000, 2]],
  'native numeric key selection precedes a bounded presented slot/ammo check, not authority readiness');
for (const badCount of [0, -1, Infinity, '4', undefined]) {
  ammoCount = badCount;
  await assert.rejects(selectNativeFeedbackAmmo(ammoPage, 2), /^Error: feedback_ammo_selection_timeout$/);
}
ammoCount = 4;
selectedSlot = 0;
await assert.rejects(selectNativeFeedbackAmmo(ammoPage, 2), /feedback_ammo_selection_timeout/,
  'available ammunition in a different slot does not admit the sample');
const beforeInvalidAmmo = ammoCalls.length;
for (const slot of [0, 4, null, '2', Infinity, 1.5]) {
  await assert.rejects(selectNativeFeedbackAmmo(ammoPage, slot), TypeError);
}
assert.equal(ammoCalls.length, beforeInvalidAmmo, 'invalid slots never issue a key or touch the page');

// Selection timeouts use the same finally cleanup as timed failures, even
// though no sample listeners or held movement keys have been acquired yet.
const selectionCleanup = [];
let waits = 0;
const timeoutPage = { async bringToFront() { selectionCleanup.push('front'); },
  async waitForFunction(_predicate, options) {
    if (++waits === 2) {
      assert.equal(options.timeout, 10000);
      throw new Error('PRIVATE_TIMEOUT_DETAILS');
    }
  }, keyboard: { async press(key) { selectionCleanup.push(`press:${key}`); },
    async up(key) { selectionCleanup.push(`up:${key}`); }, async down() { assert.fail('no timed input before selection'); } },
  mouse: { async up() { selectionCleanup.push('mouse:up'); } },
  async evaluate(fn) {
    assert.notEqual(fn, startFeedbackSample, 'selection failure must not install timed listeners');
    selectionCleanup.push('dispose');
  } };
await assert.rejects(measureNativeFeedback(timeoutPage, 0, 2), (error) => {
  assert.equal(error.message, 'feedback_ammo_selection_timeout');
  assert.doesNotMatch(String(error), /PRIVATE/);
  return true;
});
assert.deepEqual(selectionCleanup, ['front', 'press:2', 'up:w', 'up:d', 'mouse:up', 'dispose']);
console.log('multiplayer feedback probe selftest passed (metrics, native observer identity, correlation, privacy, cleanup)');
