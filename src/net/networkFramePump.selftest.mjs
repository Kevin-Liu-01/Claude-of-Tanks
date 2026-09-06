import assert from 'node:assert/strict';
import { createNetworkFramePump } from './networkFramePump.ts';
import { createNetworkRecoveryOwner } from './connectionRecovery.ts';
import { BrowserInputRuntime } from './browserInputRuntime.ts';

const calls = [];
const client = {
  closed: false,
  connected: true,
  lastSubmittedInputSeq: 9,
  drainEventsThrough(tick, target) { target.push({ type: 'tick', tick }); },
  getStats() { return { rttMs: 42 }; },
  clearPendingInputIntent() { calls.push(['clearIntent']); },
};
const match = {
  role: 'host',
  client,
  advance(dtMs, input) { calls.push(['advance', dtMs, input]); return { tick: 12 }; },
  update(nowMs) { calls.push(['update', nowMs]); return { tick: 13 }; },
  submitInput(input) { calls.push(['submit', input]); return true; },
};
const bridge = {
  apply(snapshot, dt, events) { calls.push(['apply', snapshot.tick, dt, [...events]]); },
  advancePrediction(input, elapsed) {
    calls.push(['predict', input, elapsed]);
    return true;
  },
  recordInput(input, elapsed, sequence, presentationElapsed) {
    calls.push(['record', input, elapsed, sequence, presentationElapsed]);
    return true;
  },
  endDisconnected() { calls.push(['disconnected']); },
  getPredictionStats() { return { hardSnaps: 0 }; },
  beginBackground() { calls.push(['beginBackground']); },
  retainBackgroundState(snapshot, events) {
    calls.push(['retainBackgroundState', snapshot.tick, [...events]]);
  },
};
const status = {
  diagnosticsVisible: true,
  update(stats) { calls.push(['diagnostics', stats]); },
};
const recovery = {
  update(_now, unavailable) { return unavailable; }, attach() {}, snapshot() {}, dispose() {},
};
const input = {
  frame() { return { throttle: 1, actionBits: 4 }; },
  advance(dt) { calls.push(['inputAdvance', dt]); },
  shouldSend() { return input.send; },
  commit() { calls.push(['commit']); return 0.025; },
  acknowledge(bits) { calls.push(['ack', bits]); },
  restore(bits) { calls.push(['restore', bits]); },
  resetCadence() { calls.push(['resetCadence']); },
  reset() { calls.push(['reset']); },
  queueAction(action) { calls.push(['action', action]); },
  queueConsumable(slot) { calls.push(['consumable', slot]); },
  send: true,
};
let nextFrameAction = async () => {};

const pump = createNetworkFramePump({
  getMatch: () => match,
  getBridge: () => bridge,
  getStatus: () => status,
  getPlayer: () => ({ id: 'player' }),
  isBattleActive: () => true,
  recovery,
  nextFrame: () => nextFrameAction(),
  now: () => 0,
});
pump.ensureInputRuntime(() => input);
pump.queueAction('reloadMagazine');
pump.queueConsumable(2);
pump.pump(1 / 60, 500);
assert.ok(calls.some(([name, bits]) => name === 'ack' && bits === 4));
assert.ok(calls.some(([name, tick, , events]) =>
  name === 'apply' && tick === 12 && events[0].tick === 12));
assert.deepEqual(pump.diagnostics(), { rttMs: 42, prediction: { hardSnaps: 0 } });
assert.equal((await pump.waitForSnapshot((snapshot) => snapshot.tick === 12, 10, 'timeout')).tick, 12);

match.role = 'client';
pump.pump(0.025, 750);
assert.ok(calls.some(([name]) => name === 'inputAdvance'));
assert.ok(calls.some(([name]) => name === 'submit'));
assert.ok(calls.some(([name, , elapsed, sequence]) =>
  name === 'record' && elapsed === 0.025 && sequence === 9));
assert.ok(calls.some(([name, , , , presentationElapsed]) =>
  name === 'record' && presentationElapsed === 0.025),
'accepted uploads advance prediction by the render delta, not a batched interval');

const predictionCallsBeforeHold = calls.filter(([name]) =>
  name === 'record' || name === 'predict').length;
input.send = false;
pump.pump(1 / 120, 758);
const predictionCallsAfterHold = calls.filter(([name]) =>
  name === 'record' || name === 'predict');
assert.equal(predictionCallsAfterHold.length, predictionCallsBeforeHold + 1,
  'a cadence-held upload still advances local prediction exactly once');
assert.deepEqual(predictionCallsAfterHold.at(-1).slice(0, 3),
  ['predict', { throttle: 1, actionBits: 4 }, 1 / 120],
  'the held frame advances by its own render delta on every pose axis');

// Browser input becomes null when the tank is destroyed. Neither role may
// stop its display-clock correction settling or submit invented controls.
const liveInputFrame = input.frame;
input.frame = () => null;
for (const role of ['client', 'host']) {
  match.role = role;
  const before = calls.length;
  pump.pump(1 / 60, role === 'client' ? 800 : 850);
  const frameCalls = calls.slice(before);
  assert.deepEqual(frameCalls.filter(([name]) => name === 'predict'),
    [['predict', null, 1 / 60]],
    `${role} advances terminal display settling exactly once without controls`);
  assert.equal(frameCalls.some(([name]) => name === 'submit' || name === 'record'), false,
    `${role} does not invent input or replay history to settle a wreck`);
}
input.frame = liveInputFrame;
match.role = 'client';

// Background client pumping preserves aim/ammo but submits only neutral
// intent and advances transport without invoking any presentation port.
input.frame = () => ({ throttle: 1, steer: 1, fire: true, actionBits: 4,
  aimYaw: 0.8, aimPitch: -0.2, shellSlot: 2 });
let beforeBackground = calls.length;
pump.pumpBackground(875);
let backgroundCalls = calls.slice(beforeBackground);
const submittedNeutral = backgroundCalls.find(([name]) => name === 'submit')?.[1];
assert.deepEqual(submittedNeutral, { throttle: 0, steer: 0, fire: false, actionBits: 0,
  aimYaw: 0.8, aimPitch: -0.2, shellSlot: 2, brake: true, aimLocked: true });
assert.equal(backgroundCalls.some(([name]) =>
  ['apply', 'record', 'predict', 'diagnostics'].includes(name)), false,
'background clients must not invoke bridge, prediction or HUD work');
assert.equal(backgroundCalls.filter(([name]) => name === 'clearIntent').length, 1);
assert.equal(backgroundCalls.filter(([name]) => name === 'beginBackground').length, 1,
  'the focus boundary invalidates old prediction/effects exactly once');
assert.deepEqual(backgroundCalls.find(([name]) => name === 'retainBackgroundState'),
  ['retainBackgroundState', 13, [{ type: 'tick', tick: 13 }]],
  'reliable events reach the CPU-only metadata port before their transient payload is discarded');
beforeBackground = calls.length;
pump.pumpBackground(875);
assert.equal(calls.length, beforeBackground, 'duplicate blur/visibility timestamp does not upload or advance twice');
pump.pumpBackground(890);
backgroundCalls = calls.slice(beforeBackground);
assert.equal(backgroundCalls.find(([name]) => name === 'submit')?.[1], submittedNeutral,
  'background input retains one reusable neutral owner');
assert.equal(backgroundCalls.some(([name]) => name === 'clearIntent'), false);
assert.equal(backgroundCalls.some(([name]) => name === 'beginBackground'), false);
input.frame = liveInputFrame;

client.closed = true;
pump.pump(0.025, 900);
assert.ok(calls.some(([name]) => name === 'disconnected'),
  'the recovery expiry produces one presentation edge');

pump.clearRound();
assert.equal(pump.latestSnapshot, null);
await assert.rejects(pump.waitForSnapshot(() => true, 10, 'timeout'),
  { code: 'rtc_recovery_exhausted' }, 'a terminal loader rejects instead of waiting forever');
pump.dispose();
let recoveryFrames = 0;
nextFrameAction = async () => {
  recoveryFrames += 1;
  client.closed = false;
  match.role = 'host';
  pump.pump(1 / 60, 950);
};
client.closed = true;
assert.equal((await pump.waitForSnapshot(
  (snapshot) => snapshot.tick === 12,
  10,
  'recovery timed out',
)).tick, 12);
assert.equal(recoveryFrames, 1,
  'the covered snapshot barrier survives one replaceable transport generation');
pump.dispose();
assert.ok(calls.filter(([name]) => name === 'reset').length >= 2);

console.log('networkFramePump.selftest: host/client cadence and snapshot ownership passed');

{
  let now = 0;
  let reconnects = 0;
  const failures = [];
  const statuses = [];
  const listeners = new Set();
  const remote = {
    closed: false, connected: true, lastSubmittedInputSeq: null,
    lastSnapshotReceivedAtMs: 0,
    onConnection(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    requestReconnect(reason) {
      reconnects++;
      this.closed = true;
      this.connected = false;
      this.closeReason = reason;
      for (const listener of listeners) listener(false);
    },
  };
  const match = { role: 'client', client: remote, update: () => ({ tick: 1 }), submitInput: () => true };
  const recovery = createNetworkRecoveryOwner({ now: () => now });
  recovery.attach(remote, { set: (status) => statuses.push(status) });
  const pump = createNetworkFramePump({
    getMatch: () => match, getBridge: () => null, getStatus: () => null,
    getPlayer: () => null, isBattleActive: () => true, recovery,
    nextFrame: async () => {}, now: () => now,
    onDisconnect: (reason) => failures.push(reason),
  });
  pump.pump(0, now);
  now = 4999;
  pump.pump(0, now);
  assert.equal(reconnects, 0, 'short jitter stays inside the authority silence grace');
  now = 5000;
  pump.pump(0, now);
  pump.pump(0, now);
  assert.equal(reconnects, 1, 'an open but silent channel requests one recoverable generation');
  assert.equal(statuses.at(-1).reason, 'authority_stalled');
  now = 6000;
  remote.closed = false;
  remote.connected = true;
  remote.lastSnapshotReceivedAtMs = null;
  for (const listener of listeners) listener(true);
  pump.pump(0, now);
  assert.equal(recovery.snapshot(now).recovering, true,
    'WELCOME and reopened channels alone cannot reset a stalled authority deadline');
  remote.lastSnapshotReceivedAtMs = now;
  pump.pump(0, now);
  assert.equal(recovery.snapshot(now).recovering, false, 'fresh authority restores the existing match');
  now = 11000;
  pump.pumpBackground(now);
  assert.equal(reconnects, 2, 'the render-free background pump also observes stale authority');
  now = 71000;
  pump.pumpBackground(now);
  pump.pump(0, now);
  remote.closed = false;
  remote.lastSnapshotReceivedAtMs = now;
  pump.pump(0, now);
  assert.deepEqual(failures, ['rtc_recovery_exhausted'],
    'terminal expiry is exactly once and late packets cannot resurrect the battle');
  pump.dispose();
  recovery.dispose();
}

{
  let now = 0;
  let resets = 0;
  let clearedIntent = 0;
  const uploads = [];
  const failures = [];
  const remote = {
    closed: false, connected: true, lastSubmittedInputSeq: 0,
    lastSnapshotReceivedAtMs: 0,
    clearPendingInputIntent() { clearedIntent++; },
    requestReconnect() {
      this.closed = true;
      this.connected = false;
      this.lastSnapshotReceivedAtMs = null;
    },
  };
  const player = {
    state: { pos: { x: 0, y: 0, z: 0 }, yaw: 0 },
    input: { throttle: 1, fire: true, aimLocked: false, shellSlot: 2 },
  };
  const input = new BrowserInputRuntime();
  const reset = input.reset.bind(input);
  input.reset = () => { resets++; reset(); };
  const match = {
    role: 'client', client: remote, update: () => null,
    submitInput(frame) { uploads.push(frame); return true; },
  };
  const recovery = createNetworkRecoveryOwner({ now: () => now });
  const pump = createNetworkFramePump({
    getMatch: () => match, getBridge: () => null, getStatus: () => null,
    getPlayer: () => player, isBattleActive: () => true, recovery,
    nextFrame: async () => {}, onDisconnect: (reason) => failures.push(reason),
  });
  pump.ensureInputRuntime(() => input);
  const initialResets = resets;
  pump.queueAction('specialAction');
  pump.queueConsumable(0);
  now = 5000;
  pump.pump(1 / 60, now);
  assert.equal(input.pendingActionBits, 0, 'the first outage drops unsubmitted browser action edges');
  assert.equal(resets, initialResets + 1);
  assert.equal(clearedIntent, 1, 'the outage also retires acknowledged-upload retry intent');
  for (let frame = 0; frame < 3; frame++) {
    pump.queueAction('reloadMagazine');
    pump.queueConsumable(2);
    pump.pump(1 / 60, now + frame);
  }
  assert.equal(input.pendingActionBits, 0, 'action presses during recovery are not deferred');
  assert.equal(uploads.length, 0);
  assert.equal(resets, initialResets + 1, 'repeated outage frames do not reset every frame');
  assert.equal(clearedIntent, 1);

  remote.closed = false;
  remote.connected = true;
  now = 5100;
  pump.pump(1 / 60, now);
  pump.queueAction('selfRight');
  pump.queueConsumable(1);
  assert.equal(input.pendingActionBits, 0, 'WELCOME without fresh authority keeps action admission closed');
  remote.lastSnapshotReceivedAtMs = now;
  pump.pump(1 / 60, now);
  assert.equal(uploads.at(-1).actionBits, 0, 'old browser actions are not replayed after recovery');
  assert.equal(uploads.at(-1).throttle, 1, 'physical controls resume from the fresh player sample');
  assert.equal(uploads.at(-1).fire, true);
  assert.equal(uploads.at(-1).shellSlot, 2);
  pump.queueAction('selfRight');
  pump.queueConsumable(1);
  assert.notEqual(input.pendingActionBits, 0, 'new action presses are accepted after fresh authority');
  now += 20;
  remote.lastSnapshotReceivedAtMs = now;
  pump.pump(1 / 60, now);
  assert.notEqual(uploads.at(-1).actionBits, 0);

  pump.queueAction('specialAction');
  remote.closed = true;
  remote.connected = false;
  now += 1;
  pump.pump(1 / 60, now);
  assert.equal(input.pendingActionBits, 0, 'native transport loss starts a new neutralization boundary');
  assert.equal(resets, initialResets + 2);
  assert.equal(clearedIntent, 2);
  remote.closed = false;
  remote.connected = true;
  now += 1;
  pump.pump(1 / 60, now);
  pump.clearRound();
  pump.queueAction('specialAction');
  pump.queueConsumable(0);
  assert.equal(input.pendingActionBits, 0,
    'a recent pre-outage receipt and round clear do not reopen action admission');
  remote.closed = true;
  remote.connected = false;
  pump.pump(1 / 60, now);
  assert.equal(resets, initialResets + 2, 'channel reopen alone is still the same input outage');
  now += 60_000;
  pump.pump(1 / 60, now);
  assert.deepEqual(failures, ['rtc_recovery_exhausted']);
  const terminalResets = resets;
  const terminalClears = clearedIntent;
  const terminalUploads = uploads.length;
  remote.closed = false;
  remote.connected = true;
  remote.lastSnapshotReceivedAtMs = now;
  pump.clearRound();
  pump.queueAction('specialAction');
  pump.queueConsumable(0);
  pump.pump(1 / 60, now);
  assert.equal(input.pendingActionBits, 0, 'terminal state rejects late action presses even after round clear');
  assert.equal(uploads.length, terminalUploads);
  assert.equal(resets, terminalResets);
  assert.equal(clearedIntent, terminalClears);
  pump.dispose();
  recovery.dispose();
}

{
  const failures = [];
  let errors = 0;
  const badHost = { role: 'host', client: null, advance() { throw new Error('simulation failed'); } };
  const pump = createNetworkFramePump({
    getMatch: () => badHost, getBridge: () => null, getStatus: () => null,
    getPlayer: () => null, isBattleActive: () => true,
    recovery: createNetworkRecoveryOwner(), nextFrame: async () => {},
    onHostError: () => errors++, onDisconnect: (reason) => failures.push(reason),
  });
  pump.pump(0, 0);
  pump.pump(0, 1);
  assert.deepEqual(failures, ['host_runtime_failed']);
  assert.equal(errors, 1, 'host authority errors do not repeat every render frame');
  pump.dispose();
}
