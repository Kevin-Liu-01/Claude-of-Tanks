import assert from 'node:assert/strict';
import { createFrameLoopScheduler } from '../engine/frameLoopScheduler.ts';
import { beginPrivateClientMatch, beginPrivateHostMatch } from './privateMatchHandoff.ts';
import { createNetworkBrowserSessionRuntime } from './networkBrowserSessionRuntime.ts';
import { createBrowserInputRuntime } from './browserInputRuntime.ts';
import { createWebRTCSplitTransport } from './channelTransport.ts';
import { captureWorldSnapshot } from './snapshot.ts';
import { MATCH_CONTROL_CHANNEL_LABEL, MATCH_STATE_CHANNEL_LABEL } from './webrtcPeer.ts';

// Native message dispatch is explicit and independent from timers. This tests
// the application's real handoff/codec/wake seam, NOT Chrome's decision about
// when a hidden document gets to run its networking tasks.
class NativeChannel extends EventTarget {
  readyState = 'open';
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  queue = [];
  constructor(label) {
    super();
    this.label = label;
    this.ordered = label === MATCH_CONTROL_CHANNEL_LABEL;
    this.maxRetransmits = this.ordered ? null : 0;
  }
  send(value) {
    assert.equal(this.readyState, 'open');
    assert.ok(this.queue.length < 256, 'fixture inbox stays bounded');
    this.queue.push(typeof value === 'string' ? value
      : value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  }
  deliverTo(target) {
    if (!this.queue.length) return false;
    target.dispatchEvent(new MessageEvent('message', { data: this.queue.shift() }));
    return true;
  }
  close() {
    if (this.readyState === 'closed') return;
    this.readyState = 'closed';
    this.dispatchEvent(new Event('close'));
    this.queue.length = 0;
  }
}

let nowMs = 0, focused = true, timerCalls = 0, presentation = 0, wakeCalls = 0;
let lastInputs, hostMatch, clientMatch, session, scheduler;
const events = new Map();
const timers = new Map();
let timerId = 0;
const channels = Array.from({ length: 2 }, () => [
  new NativeChannel(MATCH_CONTROL_CHANNEL_LABEL), new NativeChannel(MATCH_STATE_CHANNEL_LABEL),
]);
const transports = channels.map(([control, state]) => createWebRTCSplitTransport(control, state));
function deliverAll() {
  for (let pass = 0; pass < 256; pass++) {
    let delivered = false;
    for (let side = 0; side < 2; side++) for (let lane = 0; lane < 2; lane++) {
      delivered = channels[side][lane].deliverTo(channels[1 - side][lane]) || delivered;
    }
    if (!delivered) return;
  }
  assert.fail('fixture network dispatch did not settle');
}
const lobby = { mode: 'private', phase: 'starting', mapId: 'winter', matchSeed: 7, teamSize: 1,
  players: [{ id: 'host', specId: 'm1a2', team: 'alpha' },
    { id: 'guest', specId: 'm1a2', team: 'bravo' }] };
const player = { state: { pos: { x: 0, y: 0, z: 0 }, yaw: 0 },
  input: { throttle: 1, steer: .2, fire: true, shellSlot: 0,
    aimPoint: { x: 0, y: 0, z: 100 } }, combat: { destroyed: false } };
try {
  hostMatch = beginPrivateHostMatch({ lobbyState: lobby, session: {
    roomInfo: { peerId: 'host', mode: 'private' },
    takeMatchChannels: () => [{ peerId: 'guest', transport: transports[0] }],
  }, simulationFactory: ({ players }) => ({
    requiredPeerIds: players.map(player => player.id),
    step({ inputs }) { lastInputs = inputs; },
    snapshot({ tick, ackInputSeq }) {
      return captureWorldSnapshot({ tick, serverTimeMs: tick * 1000 / 60,
        entities: [], viewerId: 'host', ackInputSeq, meta: { phase: 'playing' } });
    },
  }) });
  clientMatch = await beginPrivateClientMatch({ lobbyState: lobby, session: {
    roomInfo: { peerId: 'guest', mode: 'private' }, takeMatchTransport: async () => transports[1],
  } });
  deliverAll();
  assert.equal(clientMatch.client.connected, true);
  hostMatch.ready(); clientMatch.ready(); deliverAll();
  session = createNetworkBrowserSessionRuntime({ getPlayer: () => player,
    isBattleActive: () => true, shouldPresentDisconnect: () => true, nextFrame: async () => {},
    onBackgroundActivity() { wakeCalls++; scheduler.wakeBackground(); },
  });
  session.publishMatch(hostMatch); // The real returned private-host object, no copied/hand-written port.
  assert.equal(session.match, hostMatch);
  session.publishBridge({ entities: new Map(), dispose() {}, apply() { presentation++; },
    recordInput() { presentation++; return true; }, advancePrediction() { presentation++; return true; } });
  session.ensureInputRuntime(createBrowserInputRuntime);
  scheduler = createFrameLoopScheduler({ tick() { assert.fail('hidden input wake cannot render'); },
    isBootComplete: () => true, hasBackgroundWork: () => !!session.match,
    backgroundTick: at => session.pumpBackground(at), now: () => nowMs,
    documentState: { get hidden() { return !focused; }, hasFocus: () => focused },
    inputTarget: { addEventListener(name, callback) { events.set(name, callback); },
      removeEventListener(name) { events.delete(name); } },
    setRecurring(callback) {
      timers.set(++timerId, () => { timerCalls++; callback(); }); return timerId;
    }, clearRecurring(id) { timers.delete(id); }, requestFrame() { return 1; }, cancelFrame() {},
  });
  session.pump(1 / 60, nowMs); deliverAll();
  assert.equal(hostMatch.host.matchStarted, true);
  const initialTick = hostMatch.host.tick, initialPresentation = presentation;
  focused = false; events.get('blur')();
  assert.equal(hostMatch.host.tick, initialTick);
  const input = { throttle: .6, steer: .1, brake: false, fire: false,
    aimYaw: 0, aimPitch: 0, shellSlot: 0, actionBits: 0 };
  nowMs = 1000 / 30;
  assert.equal(clientMatch.submitInput(input), true);
  assert.equal(hostMatch.host.tick, initialTick, 'a queued send alone cannot service hidden authority');
  assert.ok(channels[1][1].queue[0] instanceof ArrayBuffer, 'INPUT traverses the compact binary state lane');
  channels[1][1].deliverTo(channels[0][1]);
  assert.equal(hostMatch.host.tick, initialTick + 2, 'delivered native message advances through accepted-input wake');
  assert.equal(wakeCalls, 1);
  assert.equal(scheduler.stats.backgroundActivityTicks, 1);
  assert.equal(lastInputs.get('guest').throttle, .6);
  assert.equal(lastInputs.get('host').throttle, 0);
  assert.equal(lastInputs.get('host').fire, false);
  assert.equal(lastInputs.get('host').actionBits, 0);
  deliverAll();
  for (let step = 2; step <= 30; step++) {
    nowMs = step * 1000 / 30;
    clientMatch.submitInput(input); deliverAll();
  }
  assert.equal(hostMatch.host.tick - initialTick, 60, '30 delivered inputs service one second without timers');
  assert.equal(presentation, initialPresentation);
  assert.equal(hostMatch.host.stats.invalidMessages, 0);
  assert.equal(hostMatch.host.stats.futureInputs, 0);
  assert.equal(hostMatch.host.stats.staleInputs, 0);
  assert.ok(clientMatch.client.getStats().snapshotPacketsReceived >= 20);
  const atClose = wakeCalls;
  clientMatch.submitInput(input);
  assert.equal(channels[1][1].queue.length, 1);
  session.close('test_complete');
  nowMs += 1000 / 30;
  channels[1][1].deliverTo(channels[0][1]);
  assert.equal(wakeCalls, atClose);
  assert.equal(timerCalls, 0);
  console.log(JSON.stringify({ scenario: 'actual-private-handoff-split-binary-hidden-input',
    inputMessages: 30, simulatedTicks: 60, nativeTimerCallbacks: timerCalls,
    backgroundActivityTicks: scheduler.stats.backgroundActivityTicks, backgroundPresentationCalls: 0,
    browserSchedulingCertified: false }));
} finally {
  scheduler?.dispose();
  session?.close('test_cleanup');
  clientMatch?.close('test_cleanup');
  hostMatch?.close('test_cleanup');
  for (const transport of transports) transport.dispose();
  for (const pair of channels) for (const channel of pair) channel.close();
}

console.log('networkBackgroundPrivateTransport.selftest: PASS');
