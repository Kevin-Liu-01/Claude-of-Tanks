import assert from 'node:assert/strict';
import { createContext, runInContext } from 'node:vm';
import { metricDistribution, summarizeFeedbackSample, installFeedbackPeerObserver,
  readFeedbackIceStats, startFeedbackSample, stopFeedbackSample } from './multiplayer-feedback-probe.mjs';

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
const debug = { input: { onAction(name, callback) {
  assert.equal(name, 'fire'); fire = callback; return () => { unsubscribed++; };
} }, bus: { on(name, callback) { listeners.set(name, callback); return () => { unsubscribed++; }; } },
game: { phase: 'battle', preBattleS: 0, result: null, player: { id: 'PRIVATE_PLAYER', combat: { reload: { t: 0 } } } },
network: { rttMs: 4, transportBufferedBytes: 0, prediction: { hardSnaps: 0 } } };
const trace = { enabled: true, stats: () => ({ durationMs: at }), snapshot: () => ({
  frameSchema: ['tMs', 'phase', 'preBattleS', 'flags', 'gapMs'], stats: { framesDropped: 0 },
  frames: [[90, 'battle', 0, 0, 999], [120, 'battle', 0, 0, 16], [130, 'battle', 0, 1, 999],
    [140, 'battle', 0, 2, 999], [150, 'battle', 3, 0, 999], [160, 'garage', 0, 0, 999]],
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
assert.equal(timerCleared, 1);
assert.equal(unsubscribed, 3);
assert.equal(context.window.__COT_FEEDBACK_NETWORK.onAuthority, null);
assert.doesNotMatch(JSON.stringify(sample), /PRIVATE|OTHER_PLAYER|AMBIGUOUS/);
console.log('multiplayer feedback probe selftest passed (metrics, native observer identity, correlation, privacy, cleanup)');
