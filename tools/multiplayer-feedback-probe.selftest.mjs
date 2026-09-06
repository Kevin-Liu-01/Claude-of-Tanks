import assert from 'node:assert/strict';
import { createContext, runInContext } from 'node:vm';
import { metricDistribution, summarizeFeedbackSample, installFeedbackPeerObserver,
  readFeedbackIceStats, startFeedbackSample, stopFeedbackSample, endFeedbackSample, resetFeedbackSampleBoundary,
  sanitizeFeedbackTimingWindows, sanitizeFeedbackActions, selectNativeFeedbackAmmo,
  measureNativeFeedback, readFeedbackAmmoReadiness, prepareNativeFeedbackInput,
  startFeedbackInputPreparation, finishFeedbackInputPreparation,
  projectNativePreparation } from './multiplayer-feedback-probe.mjs';

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
    shellSlot: 0, requestedShellSlot: 1, authorityShellSlot: null, selectionPending: null,
    ammo: 12, requestedAmmo: 4, reloadS: 0, inputPacketsSubmitted: 52 },
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

// A frame records its preceding gap at the END. Retain the actual preceding
// frame even beyond 250ms and even when dense following frames consume the cap.
// Trace-relative timestamps deliberately differ from PerformanceEntry time.
at = 5000;
trace.stats = () => {
  const durationMs = at - 3000;
  at += .4;
  return { durationMs };
};
trace.snapshot = () => ({
  frameSchema: ['tMs', 'phase', 'preBattleS', 'flags', 'gapMs', 'heapMB'],
  stats: { framesDropped: 0 },
  frames: [[2680.9, 'battle', 0, 0, 20, 418.22], [3000, 'battle', 0, 0, 319.1, 395.97],
    ...Array.from({ length: 200 }, (_, i) => [3000.25 + i / 4, 'battle', 0, 0, .25, 396])],
  events: [
    { tMs: 3400, name: 'longtask', data: { startTime: 5690, duration: 300,
      attribution: [{ containerSrc: 'PRIVATE_URL' }], name: 'PRIVATE_NAME' } },
    { tMs: 3400, name: 'longtask', data: { startTime: 5500, duration: 100 } },
    { tMs: 3450, name: 'longtask', data: { startTime: 5500, duration: 300 } },
    { tMs: 3000, name: 'longtask', data: { startTime: 'PRIVATE_CLOCK', duration: -1 } },
    { tMs: 2990, name: 'fire', data: { startTime: 123, duration: 20, room: 'PRIVATE_ROOM' } },
  ],
});
evaluate(startFeedbackSample);
at = 7000;
const expanded = summarizeFeedbackSample(evaluate(stopFeedbackSample));
const expandedWorst = expanded.timingWindows.windows.at(-1);
assert.ok(expandedWorst.frames.some((row) => Math.abs(row.dtFromCenterMs + 319.1) < .001),
  'the exact preceding frame survives expansion and dense-window downsampling');
assert.ok(expandedWorst.frames.some((row) => row.dtFromCenterMs === 0 && row.gapMs === 319.1));
assert.ok(Math.abs(expandedWorst.startDtFromCenterMs + 319.1) < .001);
assert.equal(expandedWorst.endDtFromCenterMs, 250);
assert.ok(Math.abs(expandedWorst.gapStartDtFromCenterMs + 319.1) < .001);
assert.ok(Math.abs(expandedWorst.precedingFrameDtFromCenterMs + 319.1) < .001);
assert.equal(expandedWorst.frames.length, 48);
assert.equal(expandedWorst.frameRowsOmitted, 154);
assert.equal(expanded.frameGapMs.max, 319.1, 'diagnostic expansion never rewrites historical aggregates');
assert.ok(Math.abs(expanded.timingWindows.traceClockReadSpanMs - .4) < .001);
const delayedTask = expandedWorst.events.find((row) => row.dtFromCenterMs === 400);
assert.deepEqual(delayedTask, { dtFromCenterMs: 400, name: 'longtask',
  startAtMs: 690, startDtFromCenterMs: -310, durationMs: 300 },
'actual task interval selects a delayed observer entry, not its delivery timestamp');
assert.equal(expandedWorst.events.filter((row) => row.dtFromCenterMs === 400).length, 1,
  'a completed task outside the expanded interval is excluded');
assert.deepEqual(expandedWorst.events.find((row) => row.dtFromCenterMs === 450),
  { dtFromCenterMs: 450, name: 'longtask', startAtMs: 500,
    startDtFromCenterMs: -500, durationMs: 300 },
  'a task starting before the window is retained when its actual duration overlaps the gap');
const unknownTask = expandedWorst.events.find((row) => row.dtFromCenterMs === 0);
assert.deepEqual(unknownTask, { dtFromCenterMs: 0, name: 'longtask',
  startAtMs: null, startDtFromCenterMs: null, durationMs: null });
assert.deepEqual(expandedWorst.events.find((row) => row.name === 'fire'),
  { dtFromCenterMs: -10, name: 'fire' }, 'other events cannot export arbitrary task payloads');
assert.doesNotMatch(JSON.stringify(expanded), /PRIVATE|attribution|containerSrc/);
assert.ok(JSON.stringify(expanded).length < 20000, 'expanded evidence remains bounded JSON');

const corruptIntervals = sanitizeFeedbackTimingWindows({ windows: [{ kind: 'worst-frame',
  atMs: 1000, gapStartDtFromCenterMs: -319.1, precedingFrameDtFromCenterMs: -319.1,
  frames: expandedWorst.frames,
  events: [
    { dtFromCenterMs: 500, name: 'longtask', startAtMs: 700, startDtFromCenterMs: -300,
      durationMs: -1, attribution: 'PRIVATE_URL' },
    { dtFromCenterMs: 500, name: 'longtask', startAtMs: 700, startDtFromCenterMs: -300,
      durationMs: Infinity },
    { dtFromCenterMs: 0, name: 'longtask', startAtMs: 'PRIVATE_CLOCK',
      startDtFromCenterMs: 'PRIVATE_CLOCK', durationMs: '300' },
  ] }] });
assert.equal(corruptIntervals.windows[0].events.length, 1,
  'invalid task durations cannot expand admission beyond the delivery window');
assert.equal(corruptIntervals.windows[0].events[0].durationMs, null);
assert.doesNotMatch(JSON.stringify(corruptIntervals), /PRIVATE/);

// A trace ring may have lost the predecessor. Keep the full recorded interval,
// but report the missing frame rather than constructing a fake heap sample.
trace.snapshot = () => ({ frameSchema: ['tMs', 'phase', 'preBattleS', 'flags', 'gapMs'],
  stats: { framesDropped: 1 }, frames: [[5000, 'battle', 0, 0, 400]], events: [] });
evaluate(startFeedbackSample);
at = 9000;
const missingPredecessor = summarizeFeedbackSample(evaluate(stopFeedbackSample));
assert.equal(missingPredecessor.timingWindows.windows[0].precedingFrameDtFromCenterMs, null);
assert.equal(missingPredecessor.timingWindows.windows[0].startDtFromCenterMs, -400);
assert.equal(missingPredecessor.timingWindows.windows[0].frames.length, 1);
assert.equal(missingPredecessor.traceFramesDropped, 1);

const ammoCalls = [];
let selectedSlot = 1;
let authoritySlot = 1;
let requestedSlot = 1;
let ammoCount = 4;
const ammoPage = { keyboard: { async press(key) { ammoCalls.push(['key', key]); } },
  async waitForFunction(predicate, options, args) {
    ammoCalls.push(['wait', options.timeout, args]);
    const ready = runInContext(`(${predicate.toString()})(${JSON.stringify(args)})`, createContext({ window: {
      __DEBUG: { game: { player: { _networkShellSlot: authoritySlot, input: { shellSlot: requestedSlot },
        combat: { shellSlot: selectedSlot, ammo: [0, ammoCount, 0] } } } },
    } }));
    if (!ready) throw new Error('PRIVATE_WAIT_TOKEN');
  } };
assert.equal(await selectNativeFeedbackAmmo(ammoPage), 1);
assert.deepEqual(ammoCalls, [], 'the default slot-one baseline adds no selection key or wait');
assert.equal(await selectNativeFeedbackAmmo(ammoPage, 2), 2);
assert.deepEqual(ammoCalls, [['key', '2'], ['wait', 10000, { ammoSlot: 2, requireReload: false }]],
  'native numeric key selection waits for slot acknowledgement, but not completed reload');
authoritySlot = 0;
await assert.rejects(selectNativeFeedbackAmmo(ammoPage, 2), /feedback_ammo_selection_timeout/,
  'an optimistic local slot change is not host acknowledgement');
authoritySlot = 1;
requestedSlot = 0;
await assert.rejects(selectNativeFeedbackAmmo(ammoPage, 2), /feedback_ammo_selection_timeout/,
  'a newer selection cannot be mistaken for the requested missile scenario');
requestedSlot = 1;
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

const readinessPlayer = { _networkShellSlot: 1, input: { shellSlot: 1 },
  combat: { shellSlot: 1, ammo: [24, 4, 18], reload: { t: 3 }, destroyed: false } };
const readinessContext = createContext({ window: { __DEBUG: { game: { player: readinessPlayer } } } });
const ammoReady = (requireReload) => runInContext(`(${readFeedbackAmmoReadiness.toString()})` +
  `(${JSON.stringify({ ammoSlot: 2, requireReload })})`, readinessContext);
assert.equal(ammoReady(false), true, 'setup acknowledges the requested slot while it is still loading');
assert.equal(ammoReady(true), false, 'a timed trigger waits for the real authoritative reload');
readinessPlayer.combat.reload.t = 0;
assert.equal(ammoReady(true), true);
readinessPlayer._networkAmmoSelectionPending = true;
assert.equal(ammoReady(false), false, 'equal slot values do not acknowledge an in-flight cancellation');
readinessPlayer._networkAmmoSelectionPending = false;
readinessPlayer.combat.ammo[1] = 0;
assert.equal(ammoReady(true), false, 'empty missiles cannot cause fallback shells to count as missile shots');
readinessPlayer.combat.ammo[1] = 4;
readinessPlayer.combat.destroyed = true;
assert.equal(ammoReady(true), false);
readinessPlayer.combat.destroyed = false;
readinessPlayer.combat.shellSlot = 0;
assert.equal(ammoReady(true), false, 'reload-ready prior ammo is not eligible while the switch is pending');

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
await assert.rejects(measureNativeFeedback(timeoutPage, 0, 2, {
  beforeSample: () => assert.fail('selection failure must not acquire optional diagnostics'),
}), (error) => {
  assert.equal(error.message, 'feedback_ammo_selection_timeout');
  assert.doesNotMatch(String(error), /PRIVATE/);
  return true;
});
assert.deepEqual(selectionCleanup, ['front', 'press:2', 'up:w', 'up:d', 'mouse:up', 'dispose']);
function sampleBoundaryPage() {
  const calls = [];
  return { calls, page: {
    async bringToFront() { calls.push('front'); },
    async waitForFunction(_predicate, _options, args) { calls.push(args ? 'ammo_ready' : 'countdown_ready'); },
    keyboard: { async press(key) { calls.push(`press:${key}`); },
      async up(key) { calls.push(`up:${key}`); }, async down(key) { calls.push(`down:${key}`); } },
    mouse: { async up() { calls.push('mouse:up'); } },
    async evaluate(fn) {
      if (fn === startFeedbackSample) { calls.push('sample_start'); return; }
      if (fn === endFeedbackSample) { calls.push('sample_end'); return 1234; }
      if (fn === resetFeedbackSampleBoundary) { calls.push('sample_reset'); return; }
      if (fn === stopFeedbackSample) { calls.push('sample_stop'); return {
        durationMs: 0, shots: [], predicted: [], actions: [], diagnostics: [], gapsMs: [],
      }; }
      calls.push('dispose');
    },
  } };
}
const boundary = sampleBoundaryPage();
await measureNativeFeedback(boundary.page, 0, 2, { async beforeSample() {
  boundary.calls.push('diagnostic_start');
  await Promise.resolve();
  boundary.calls.push('diagnostic_ready');
} });
assert.deepEqual(boundary.calls, ['front', 'countdown_ready', 'press:2', 'ammo_ready',
  'diagnostic_start', 'diagnostic_ready', 'sample_start', 'down:w', 'down:d', 'sample_stop',
  'up:w', 'up:d', 'mouse:up', 'dispose'],
'optional diagnostics start exactly once after native readiness, before timed listeners or held movement');
const rejectedBoundary = sampleBoundaryPage();
await assert.rejects(measureNativeFeedback(rejectedBoundary.page, 0, 2, {
  beforeSample: async () => { throw new Error('frame_trace_start_failed'); },
}), /frame_trace_start_failed/);
assert.deepEqual(rejectedBoundary.calls, ['front', 'countdown_ready', 'press:2', 'ammo_ready',
  'up:w', 'up:d', 'mouse:up', 'dispose'], 'failed diagnostic acquisition still releases trusted input');
const defaultBoundary = sampleBoundaryPage();
await measureNativeFeedback(defaultBoundary.page, 0);
assert.deepEqual(defaultBoundary.calls, ['front', 'countdown_ready', 'sample_start', 'down:w', 'down:d',
  'sample_stop', 'up:w', 'up:d', 'mouse:up', 'dispose'], 'legacy default adds neither selection nor diagnostics');
const preflightBoundary = sampleBoundaryPage();
const boundaryEvaluate = preflightBoundary.page.evaluate;
preflightBoundary.page.evaluate = async (fn, arg) => {
  if (fn.name === 'startFeedbackInputPreparation') {
    preflightBoundary.calls.push('preparation_start'); return { ready: true };
  }
  if (fn.name === 'finishFeedbackInputPreparation') {
    preflightBoundary.calls.push('preparation_end'); return { ready: true, nativeClickAttempts: 0, confirmedShots: 0 };
  }
  return boundaryEvaluate(fn, arg);
};
await measureNativeFeedback(preflightBoundary.page, 0, 2, { nativePreflight: true });
assert.ok(preflightBoundary.calls.indexOf('preparation_start') >= 0 &&
  preflightBoundary.calls.indexOf('preparation_start') < preflightBoundary.calls.indexOf('press:2'),
  'opt-in native input preparation must precede ammunition selection');
assert.ok(preflightBoundary.calls.indexOf('preparation_end') < preflightBoundary.calls.indexOf('sample_start'),
  'preparation observations must close before timed shot listeners start');

function inputPreparationPage({ locked = false, denied = false, consumesShot = false } = {}) {
  const calls = [], timers = new Map(), handlers = new Map();
  let now = 100, nextTimer = 0;
  const canvas = { isConnected: true, getBoundingClientRect: () => ({ x: 10, y: 20, width: 100, height: 60 }) };
  const doc = { pointerLockElement: locked ? canvas : null, hasFocus: () => true, hidden: false,
    elementFromPoint: () => canvas };
  const on = (name, fn) => { handlers.set(name, fn); return () => handlers.delete(name); };
  const player = { id: 'PRIVATE_PLAYER', input: { fire: false },
    combat: { ammo: [24, 4, 18], reload: { t: 0 }, destroyed: false } };
  const world = createContext({ window: { __DEBUG: { renderer: { domElement: canvas },
    input: { onAction: on, isLocked: () => doc.pointerLockElement === canvas,
      getState() { assert.fail('preflight cannot consume input'); },
      isDown() { assert.fail('preflight cannot consume action edges'); } },
    bus: { on }, settings: { isOpen: () => false }, killcam: { isActive: () => false },
    game: { phase: 'battle', preBattleS: 0, result: null, player }, network: { pendingInputEdges: 0 } } },
    document: doc, performance: { now: () => now },
    setTimeout(fn) { timers.set(++nextTimer, fn); return nextTimer; }, clearTimeout(id) { timers.delete(id); } });
  const invoke = (fn) => runInContext(`(${fn.toString()})()`, world);
  const page = {
    async evaluate(fn) { calls.push(fn.name || 'evaluate'); return invoke(fn); },
    mouse: { async click(x, y) {
      calls.push('native_click'); assert.equal(x, 60); assert.equal(y, 50);
      handlers.get('fire')();
      if (!denied) doc.pointerLockElement = canvas;
      if (consumesShot) {
        player.combat.ammo[0]--;
        player.combat.reload.t = 3;
        handlers.get('weapon:predicted')({ isPlayer: true });
        handlers.get('shell:fired')({ isPlayer: false });
      }
    } },
    async waitForFunction(fn, options) {
      assert.ok(options.timeout > 0 && options.timeout <= 10000);
      assert.equal(options.polling, 50);
      assert.equal(options.signal.aborted, false);
      now += 299;
      assert.equal(invoke(fn), false, 'do not admit the buffered preparation press');
      now += 2;
      if (consumesShot) {
        assert.equal(invoke(fn), false, 'real preparation reload cannot be erased');
        player.combat.reload.t = 0;
        assert.equal(invoke(fn), false, 'ammo decrement needs the real own-shot confirmation');
        handlers.get('shell:fired')({ isPlayer: true });
        now += 301;
      }
      if (!invoke(fn)) throw new Error('PRIVATE_LOCK_DENIAL');
      return { async dispose() { calls.push('wait_handle_disposed'); } };
    },
  };
  return { page, calls, timers, handlers, world, doc, canvas, invoke, player };
}

const alreadyPrepared = inputPreparationPage({ locked: true });
const alreadyReceipt = await prepareNativeFeedbackInput(alreadyPrepared.page);
assert.equal(alreadyReceipt.ready, true);
assert.equal(alreadyReceipt.nativeClickAttempts, 0);
assert.ok(!alreadyPrepared.calls.includes('native_click'), 'never fire a preparation shot when already locked');
assert.equal(alreadyPrepared.handlers.size, 0);
assert.equal(alreadyPrepared.timers.size, 0);
const pendingPreparation = inputPreparationPage({ locked: true });
pendingPreparation.player.input.fire = true;
pendingPreparation.world.window.__DEBUG.network.pendingInputEdges = 1;
pendingPreparation.page.waitForFunction = async (fn) => {
  assert.equal(pendingPreparation.invoke(fn), false);
  pendingPreparation.player.input.fire = false;
  assert.equal(pendingPreparation.invoke(fn), false, 'native fire retry must settle before measurement');
  pendingPreparation.world.window.__DEBUG.network.pendingInputEdges = 0;
  assert.equal(pendingPreparation.invoke(fn), true);
};
const pendingReceipt = await prepareNativeFeedbackInput(pendingPreparation.page);
assert.equal(pendingReceipt.nativeClickAttempts, 0);
assert.ok(!pendingPreparation.calls.includes('native_click'));
assert.equal(pendingPreparation.handlers.size, 0);
assert.equal(pendingPreparation.timers.size, 0);

for (const consumesShot of [false, true]) {
  const fixture = inputPreparationPage({ consumesShot });
  const receipt = await prepareNativeFeedbackInput(fixture.page);
  assert.equal(receipt.nativeClickAttempts, 1);
  assert.equal(receipt.nativeClickCompleted, true);
  assert.equal(receipt.fireActions, 1, 'raw action includes a swallowed acquisition click');
  assert.equal(receipt.confirmedShots, consumesShot ? 1 : 0);
  assert.equal(receipt.predictedShots, consumesShot ? 1 : 0);
  assert.deepEqual(receipt.ammoBefore, [24, 4, 18]);
  assert.deepEqual(receipt.ammoAfter, [consumesShot ? 23 : 24, 4, 18]);
  assert.equal(fixture.player.combat.ammo[0], receipt.ammoAfter[0], 'preparation cannot refund ammunition');
  assert.equal(fixture.handlers.size, 0);
  assert.equal(fixture.timers.size, 0);
  assert.ok(fixture.calls.includes('wait_handle_disposed'));
  assert.doesNotMatch(JSON.stringify(receipt), /PRIVATE/);
}

const deniedPreparation = inputPreparationPage({ denied: true, consumesShot: true });
await assert.rejects(prepareNativeFeedbackInput(deniedPreparation.page), (error) => {
  assert.equal(error.message, 'feedback_native_input_preparation_failed');
  assert.equal(error.nativePreparation.ready, false);
  assert.equal(error.nativePreparation.confirmedShots, 1, 'denial failure retains preparation fire evidence');
  assert.deepEqual(error.nativePreparation.ammoAfter, [23, 4, 18]);
  assert.doesNotMatch(JSON.stringify(error), /PRIVATE/);
  return true;
});
assert.equal(deniedPreparation.handlers.size, 0);
assert.equal(deniedPreparation.timers.size, 0);

for (const change of ['other_canvas', 'overlay', 'settings', 'killcam', 'destroyed', 'hidden']) {
  const fixture = inputPreparationPage({ locked: change === 'other_canvas' });
  const live = fixture.world.window.__DEBUG;
  if (change === 'other_canvas') { fixture.doc.pointerLockElement = {}; live.input.isLocked = () => true; }
  if (change === 'overlay') fixture.doc.elementFromPoint = () => ({});
  if (change === 'settings') live.settings.isOpen = () => true;
  if (change === 'killcam') live.killcam.isActive = () => true;
  if (change === 'destroyed') fixture.player.combat.destroyed = true;
  if (change === 'hidden') fixture.doc.hidden = true;
  if (change === 'other_canvas') {
    const state = fixture.invoke(startFeedbackInputPreparation);
    assert.equal(state.ready, false, 'some other element holding pointer lock is not the renderer');
    fixture.invoke(finishFeedbackInputPreparation);
  } else {
    await assert.rejects(prepareNativeFeedbackInput(fixture.page), /feedback_native_input_preparation_failed/);
    assert.ok(!fixture.calls.includes('native_click'), 'never click through an overlay or inactive firing lane');
  }
  assert.equal(fixture.handlers.size, 0);
  assert.equal(fixture.timers.size, 0);
}

const closedPreparation = inputPreparationPage();
closedPreparation.page.mouse.click = async () => { throw new Error('PRIVATE_CLOSED_URL'); };
await assert.rejects(prepareNativeFeedbackInput(closedPreparation.page), (error) => {
  assert.equal(error.message, 'feedback_native_input_preparation_failed');
  assert.equal(error.nativePreparation.nativeClickAttempts, 1);
  assert.equal(error.nativePreparation.nativeClickCompleted, false);
  return true;
});
assert.equal(closedPreparation.handlers.size, 0);
assert.equal(closedPreparation.timers.size, 0);

const stalledPreparation = inputPreparationPage();
stalledPreparation.page.mouse.click = () => new Promise(() => {});
await assert.rejects(prepareNativeFeedbackInput(stalledPreparation.page, 10), /feedback_native_input_preparation_failed/);
assert.equal(stalledPreparation.handlers.size, 0, 'timed-out native command does not keep observation listeners');
assert.equal(stalledPreparation.timers.size, 0);
assert.equal(projectNativePreparation(null), null);
assert.doesNotMatch(JSON.stringify(projectNativePreparation({
  nativeClickAttempts: Infinity, fireActions: -1, predictedShots: 'PRIVATE', confirmedShots: 999,
  durationMs: Infinity, ammoBefore: ['PRIVATE', -1, Infinity, 99], ammoAfter: [24, 4, 18, 999],
  url: 'PRIVATE', token: 'PRIVATE', ready: 'PRIVATE',
})), /PRIVATE/);
assert.deepEqual(projectNativePreparation({ ammoBefore: [], ammoAfter: [24, 4, 18, 999] }).ammoAfter, [24, 4, 18]);
const profileBoundary = sampleBoundaryPage();
await measureNativeFeedback(profileBoundary.page, 0, undefined, {
  async afterSampleStarted() { profileBoundary.calls.push('profiler_start'); },
  async afterSample(endedAt) { assert.equal(endedAt, 1234); profileBoundary.calls.push('profiler_stop'); },
});
assert.deepEqual(profileBoundary.calls, ['front', 'countdown_ready', 'sample_start', 'profiler_start', 'sample_reset',
  'down:w', 'down:d', 'sample_end', 'profiler_stop', 'sample_stop', 'up:w', 'up:d', 'mouse:up', 'dispose'],
  'source sampling excludes observer stats setup and report export, retaining native input cleanup');
for (const hook of ['afterSampleStarted', 'afterSample']) {
  const f = sampleBoundaryPage();
  await assert.rejects(measureNativeFeedback(f.page, 0, undefined, {
    [hook]: async () => { throw new Error('source_profile_stop_failed'); },
  }), /source_profile_stop_failed/);
  assert.deepEqual(f.calls.slice(-4), ['up:w', 'up:d', 'mouse:up', 'dispose']);
  assert.ok(!f.calls.includes('sample_stop'), 'failed collector cannot be followed by report export');
}

at = 100;
trace.stats = () => ({ durationMs: at });
trace.snapshot = () => {
  at += 50; // Deliberately expensive report assembly after source capture ended.
  return { frameSchema: ['tMs', 'phase', 'preBattleS', 'flags', 'gapMs'], stats: { framesDropped: 0 },
    frames: [[120, 'battle', 0, 0, 20], [160, 'battle', 0, 0, 40], [250, 'battle', 0, 0, 90]],
    events: [] };
};
evaluate(startFeedbackSample);
at = 140;
assert.equal(evaluate(endFeedbackSample), 140);
at = 200;
assert.equal(evaluate(endFeedbackSample), 140, 'repeated stop cannot move the observation boundary');
const stoppedBeforeExport = summarizeFeedbackSample(evaluate(stopFeedbackSample));
assert.equal(stoppedBeforeExport.sampleEndedAtMs, 140);
assert.equal(stoppedBeforeExport.durationMs, 40, 'profiler stop and export cost are not sample duration');
assert.equal(stoppedBeforeExport.frameGapMs.max, 20, 'no frames recorded during collector shutdown enter the sample');
assert.equal(stoppedBeforeExport.timingWindows.windows[0].endDtFromCenterMs, 20);

let statsReads = 0;
at = 100;
trace.stats = () => { statsReads++; return { durationMs: at }; };
const startupFrames = [[99, 'battle', 0, 0, 30], [720, 'battle', 0, 0, 621],
  [750, 'battle', 0, 0, 30], [770, 'battle', 0, 0, 20], [850, 'battle', 0, 0, 80]];
trace.snapshot = () => ({ frameSchema: ['tMs', 'phase', 'preBattleS', 'flags', 'gapMs'],
  stats: { framesDropped: 0 }, frames: startupFrames, events: [] });
evaluate(startFeedbackSample);
fire();
const combatBeforeReset = JSON.stringify(debug.game.player);
at = 735; // Reproduce a slow Profiler.start handshake before native controls begin.
evaluate(resetFeedbackSampleBoundary);
assert.equal(statsReads, 1, 'rebasing does not sort the application frame history again');
assert.equal(JSON.stringify(debug.game.player), combatBeforeReset, 'only observer state is reset');
assert.equal(context.window.__COT_FEEDBACK_SAMPLE.actions.length, 0);
at = 780;
evaluate(endFeedbackSample);
at = 900;
const rebased = summarizeFeedbackSample(evaluate(stopFeedbackSample));
assert.equal(rebased.sampleStartedAtMs, 735);
assert.equal(rebased.durationMs, 45);
assert.equal(rebased.observationResetExcludedMs, 635);
assert.equal(rebased.observationBoundaryFramesExcluded, 1, 'the straddling interval is accounted for explicitly');
assert.equal(rebased.frameGapMs.max, 20, 'startup and shutdown cannot masquerade as observed gameplay stalls');
assert.equal(rebased.timingWindows.windows[0].gapStartedBeforeSample, false);
assert.equal(startupFrames.length, 5, 'underlying game trace history is not cleared or rewritten');
console.log('multiplayer feedback probe selftest passed (metrics, native observer identity, correlation, privacy, cleanup)');
