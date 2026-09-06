import assert from 'node:assert/strict';
import { createFrameLoopScheduler } from '../engine/frameLoopScheduler.ts';
import { createNetworkBrowserSessionRuntime } from './networkBrowserSessionRuntime.ts';
import { createBrowserInputRuntime } from './browserInputRuntime.ts';
import { AuthoritativeMatchRuntime, MatchClientRuntime } from './matchRuntime.ts';
import { createLoopbackTransportPair } from './loopbackTransport.ts';
import { captureWorldSnapshot } from './snapshot.ts';

// Real scheduler -> session -> frame pump -> protocol client -> authority.
// No renderer, fake animation frames, GPU, wall timers, or browser flags are
// required to prove that background networking is a distinct owner.
let nowMs = 0;
let focused = true;
let hidden = false;
let interval;
let nextFrameId = 0;
let renderTicks = 0;
let presentationCalls = 0;
const timerIntervals = [];
let lastInputs;
const frames = new Map();
const windowEvents = new Map();
const documentEvents = new Map();
const submittedBackgroundInputs = [];
const host = new AuthoritativeMatchRuntime({ simulation: {
  step({ inputs }) { lastInputs = inputs; },
  snapshot({ tick, ackInputSeq }) {
    return captureWorldSnapshot({ tick, serverTimeMs: tick * 1000 / 60,
      entities: [], viewerId: 'local', ackInputSeq, meta: { phase: 'playing' } });
  },
} });
function attach(id) {
  const link = createLoopbackTransportPair({ direct: true });
  host.attachPeer({ peerId: id, transport: link.host });
  const client = new MatchClientRuntime({ playerId: id, transport: link.client, clock: () => nowMs });
  client.connect();
  client.readyForMatch();
  return client;
}
const client = attach('local');
const remote = attach('remote');
const player = { state: { pos: { x: 0, y: 0, z: 0 }, yaw: 0 },
  input: { throttle: 1, steer: 0.25, fire: true, aimLocked: false,
    aimPoint: { x: 33, y: 12, z: 100 }, shellSlot: 2 }, combat: { destroyed: false } };
const session = createNetworkBrowserSessionRuntime({
  getPlayer: () => player, isBattleActive: () => true,
  shouldPresentDisconnect: () => true, nextFrame: async () => {},
});
session.publishMatch({ role: 'host', client, ready: () => client.readyForMatch(),
  advance(elapsedMs, input) {
    if (input) {
      if (!focused) submittedBackgroundInputs.push(input);
      client.submitInput(input, host.tick);
    }
    host.advance(elapsedMs);
    return client.update(nowMs);
  },
  close() { client.close(); host.close(); },
});
session.publishBridge({ entities: new Map(), dispose() {},
  apply() { presentationCalls++; },
  advancePrediction() { presentationCalls++; return false; },
  recordInput() { presentationCalls++; return true; },
});
const browserInput = session.ensureInputRuntime(createBrowserInputRuntime);
browserInput.queueConsumable(0);
let foregroundDt = 1 / 60;
const scheduler = createFrameLoopScheduler({
  tick(at) { renderTicks++; session.pump(foregroundDt, at); scheduler.schedule(); },
  isBootComplete: () => true,
  hasBackgroundWork: () => !!session.match,
  backgroundTick: (at) => session.pumpBackground(at),
  documentState: {
    get hidden() { return hidden; }, hasFocus: () => focused,
    addEventListener(type, listener) { documentEvents.set(type, listener); },
    removeEventListener(type) { documentEvents.delete(type); },
  },
  inputTarget: {
    addEventListener(type, listener) { windowEvents.set(type, listener); },
    removeEventListener(type) { windowEvents.delete(type); },
  },
  now: () => nowMs,
  setRecurring(callback, intervalMs) { timerIntervals.push(intervalMs); interval = callback; return 1; },
  clearRecurring() {},
  requestFrame(callback) { frames.set(++nextFrameId, callback); return nextFrameId; },
  cancelFrame(id) { frames.delete(id); },
});
function render() {
  const [id, callback] = frames.entries().next().value;
  frames.delete(id);
  callback(nowMs);
}
const remoteInput = { throttle: 0.6, steer: 0, fire: false,
  aimYaw: 0.75, aimPitch: 0.1, aimDistance: 125, shellSlot: 1 };
remote.submitInput(remoteInput);
scheduler.schedule();
render();
assert.equal(host.tick, 1);
assert.deepEqual(timerIntervals, [100], 'foreground and room-free work retain the original rescue cadence');
assert.equal(client.getStats().pendingInputEdges, 2, 'pre-blur unacknowledged fire/repair exists');
const localAim = { yaw: lastInputs.get('local').aimYaw, pitch: lastInputs.get('local').aimPitch };
const beforeBackgroundPresentation = presentationCalls;
focused = false;
windowEvents.get('blur')();
assert.equal(timerIntervals.at(-1), 50, 'only active background networking requests the faster cadence');
assert.equal(client.getStats().pendingInputEdges, 0, 'blur cancels retry intent before sending neutral');
const neutral = host.peers.get('local').input;
assert.equal(neutral.throttle, 0);
assert.equal(neutral.steer, 0);
assert.equal(neutral.brake, true);
assert.equal(neutral.fire, false);
assert.equal(neutral.actionBits, 0);
assert.equal(neutral.aimLocked, true, 'neutral input freezes gunlay/casemate auto-traverse');
assert.equal(neutral.shellSlot, 2);
assert.deepEqual({ yaw: neutral.aimYaw, pitch: neutral.aimPitch }, localAim);
assert.equal(host.peers.get('remote').input.throttle, 0.6, 'host blur never neutralizes another player');

for (let step = 1; step <= 200; step++) {
  nowMs = step * 50;
  if (step === 101) {
    hidden = true;
    documentEvents.get('visibilitychange')();
  }
  remote.submitInput(remoteInput);
  interval();
}
assert.equal(host.tick, 601, 'ten seconds background time advances all 600 fixed authority ticks');
assert.equal(lastInputs.get('local').throttle, 0);
assert.equal(lastInputs.get('local').fire, false);
assert.equal(lastInputs.get('local').actionBits, 0);
assert.equal(lastInputs.get('remote').throttle, 0.6, 'fresh remote controls retain independent authority');
assert.equal(renderTicks, 1);
assert.equal(presentationCalls, beforeBackgroundPresentation, 'background work never touches bridge/FX/presentation');
assert.equal(frames.size, 0);
assert.equal(new Set(submittedBackgroundInputs).size, 1, 'one neutral packet owner is reused without per-tick allocation');
assert.ok(client.lastSnapshotTick >= 600, 'transport receipts progress while visuals sleep');
assert.ok(session.latestSnapshot.tick >= 594, 'the normal delayed presentation sample remains available for resume');

const beforeFreeze = host.tick;
nowMs += 10_000;
interval();
assert.ok(host.tick - beforeFreeze <= 6, 'OS suspension never replays ten seconds as a catch-up teleport');
const afterBoundedResume = host.tick;
focused = true;
hidden = false;
player.input.throttle = 0;
player.input.steer = 0;
player.input.fire = false;
windowEvents.get('focus')();
documentEvents.get('visibilitychange')();
assert.equal(frames.size, 1);
assert.equal(timerIntervals.at(-1), 100, 'foreground resumes the original rescue timer cadence');
foregroundDt = 0.1; // main's resume clamp must not duplicate background elapsed.
render();
assert.equal(host.tick, afterBoundedResume, 'same-time background/foreground handoff advances authority once');
assert.equal(client.getStats().pendingInputEdges, 0, 'focus cannot replay pre-blur fire or consumables');
nowMs += 1000 / 60;
foregroundDt = 1 / 60;
render();
assert.ok(host.tick > afterBoundedResume, 'normal foreground fixed-step progression resumes immediately');
scheduler.dispose();
session.close('test_complete');
remote.close();

console.log('networkBackgroundLifecycle.selftest: real scheduler/session authority, neutral ownership, hidden bounds, no GPU or duplicate resume passed');
