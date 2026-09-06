import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { getSpec } from '../vehicles/specs.ts';
import { createCombatState } from '../sim/damage.ts';
import { createTankState, updateTank, SIM_DT } from '../sim/movement.ts';
import { LocalTankPredictor } from './localTankPrediction.ts';
import { NetworkInputCadence } from './inputCadence.ts';
import { createNetworkFramePump } from './networkFramePump.ts';
import { createNetworkRecoveryOwner } from './connectionRecovery.ts';
import { SnapshotBuffer, captureWorldSnapshot } from './snapshot.ts';
import { isSequenceNewer, nextSequence } from './protocol.ts';

const DRIVE = { throttle: 1, steer: 0, brake: false, fire: false, actionBits: 0,
  aimLocked: true, aimYaw: 0, aimPitch: 0, shellSlot: 0 };
const BRAKE = { ...DRIVE, throttle: 0, brake: true };
const NORMAL = new Vector3(0, 1, 0);
const FIELD = { getHeightAt: () => 0, getHeightAtFast: () => 0,
  getGroundType: () => 'hard', getNormalAt: () => NORMAL };

function link(random, blocked, delayMs, jitterMs, loss) {
  const queue = [];
  return {
    send(value, nowMs) {
      if (blocked(nowMs) || random() < loss) return;
      queue.push({ value, atMs: nowMs + delayMs + (random() * 2 - 1) * jitterMs });
      queue.sort((a, b) => a.atMs - b.atMs);
    },
    drain(nowMs, receive) {
      while (queue[0]?.atMs <= nowMs + 1e-8) receive(queue.shift().value);
    },
  };
}

function fixture({ twoWay = false, before = false, delayMs = 90,
  jitterMs = 15, loss = 0.03, startMs = 5000, endMs = 7000 } = {}) {
  let seed = 19273;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000; };
  const blocked = (timeMs) => timeMs >= startMs && timeMs < endMs;
  const uploads = link(random, (timeMs) => twoWay && blocked(timeMs), delayMs, jitterMs, loss);
  const downloads = link(random, blocked, delayMs, jitterMs, loss);
  const spec = getSpec('m1a2');
  const server = { id: 'viewer', spec, state: createTankState(spec, new Vector3(), 0),
    combat: createCombatState(spec), input: { ...DRIVE, aimPoint: new Vector3(0, 0, 500) } };
  const entity = { spec, state: createTankState(spec, new Vector3(), 0) };
  const prediction = new LocalTankPredictor({ entity, heightField: FIELD });
  const snapshots = new SnapshotBuffer({ immediateEntityId: 'viewer' });
  let nowMs = 0;
  let ackSeq = null;
  let nextSeq = 0x7ffffffe;
  let lastInputAtMs = 0;
  let nextTick = 1;
  let stoppedFrames = 0;
  let resetCount = 0;
  const snapshot = (tick) => captureWorldSnapshot({ tick, serverTimeMs: tick * SIM_DT * 1000,
    entities: [server], viewerId: 'viewer', ackInputSeq: ackSeq });
  snapshots.push(snapshot(0));
  prediction.reconcile(snapshots.sample(0).immediateAuthority);
  const client = { closed: false, connected: true, lastSubmittedInputSeq: null,
    clearPendingInputIntent() { resetCount++; } };
  // This is the exact pre-fix browser contract: without the admitted-receipt
  // owner, a healthy-open transport keeps forwarding controls during silence.
  if (!before) client.lastSnapshotReceivedAtMs = 0;
  const cadence = new NetworkInputCadence();
  const input = { frame: () => DRIVE, advance: (dt) => cadence.advance(dt),
    shouldSend: (value) => cadence.shouldSend(value), commit: (value) => cadence.commit(value),
    reset: () => cadence.reset(), resetCadence: () => cadence.reset(),
    acknowledge() {}, restore() {}, queueAction() {}, queueConsumable() {} };
  const match = { role: 'client', client,
    submitInput(value) {
      client.lastSubmittedInputSeq = nextSeq;
      uploads.send({ seq: nextSeq, input: { ...value } }, nowMs);
      nextSeq = nextSequence(nextSeq);
      return true;
    },
    update(timeMs) {
      downloads.drain(timeMs, (value) => {
        if (snapshots.push(value, timeMs) && !before) client.lastSnapshotReceivedAtMs = timeMs;
      });
      return snapshots.sample(timeMs);
    } };
  const bridge = { apply: (frame) => prediction.reconcile(frame.immediateAuthority),
    advancePrediction: (value, dt) => prediction.advancePrediction(value, dt),
    recordInput(value, dt, seq, displayDt) {
      if (value.brake && !value.throttle) stoppedFrames++;
      return prediction.recordInput(value, dt, seq, displayDt);
    } };
  const pump = createNetworkFramePump({ getMatch: () => match, getBridge: () => bridge,
    getStatus: () => null, getPlayer: () => entity, isBattleActive: () => true,
    recovery: createNetworkRecoveryOwner(), nextFrame: async () => {}, now: () => nowMs });
  pump.ensureInputRuntime(() => input);
  return { prediction, entity, server, client, pump,
    counts: () => ({ stoppedFrames, resetCount }),
    step(dt) {
      nowMs += dt * 1000;
      while (nextTick * SIM_DT * 1000 <= nowMs + 1e-8) {
        const timeMs = nextTick * SIM_DT * 1000;
        uploads.drain(timeMs, (packet) => {
          if (ackSeq != null && !isSequenceNewer(packet.seq, ackSeq)) return;
          ackSeq = packet.seq;
          lastInputAtMs = timeMs;
          Object.assign(server.input, packet.input);
        });
        // The authority's existing admitted-input lease, in simulation time.
        if (timeMs - lastInputAtMs > 500 + 1e-9) Object.assign(server.input, BRAKE);
        updateTank(server, FIELD, SIM_DT);
        if (nextTick % 3 === 0) downloads.send(snapshot(nextTick), timeMs);
        nextTick++;
      }
      pump.pump(dt, nowMs);
      return nowMs;
    } };
}

function measure(options, before) {
  const f = fixture({ ...options, before });
  const frameTimes = options.frameTimes || [1 / 60];
  let timeMs = 0;
  let index = 0;
  let recoveryErrorM = null;
  let maxBackwardStepM = 0;
  let previousZ = 0;
  while (timeMs < 9500) {
    timeMs = f.step(frameTimes[index++ % frameTimes.length]);
    maxBackwardStepM = Math.max(maxBackwardStepM, previousZ - f.entity.state.pos.z);
    previousZ = f.entity.state.pos.z;
    if (timeMs > 7000 && recoveryErrorM === null &&
        f.prediction.lastAuthorityTick * SIM_DT * 1000 >= 7000) {
      recoveryErrorM = f.prediction.getStats().lastPositionErrorM;
    }
  }
  f.pump.dispose();
  return { recoveryErrorM, maxBackwardStepM, ...f.prediction.getStats(), ...f.counts() };
}

for (const twoWay of [true, false]) {
  for (const frameTimes of [[1 / 60], [1 / 144], [1 / 120, 1 / 60, 1 / 90, 1 / 165]]) {
    const options = { twoWay, frameTimes };
    const before = measure(options, true);
    const after = measure(options, false);
    console.log(JSON.stringify({ scenario: twoWay ? 'two-way-blackout' : 'downlink-blackout',
      frameTimes, before: { recoveryErrorM: before.recoveryErrorM,
        hardSnaps: before.hardSnaps, maxBackwardStepM: before.maxBackwardStepM },
      after: { recoveryErrorM: after.recoveryErrorM, hardSnaps: after.hardSnaps,
        maxBackwardStepM: after.maxBackwardStepM, neutralUploads: after.stoppedFrames } }));
    assert.ok(after.stoppedFrames > 0, 'stale authority must brake prediction and uploads together');
    assert.equal(after.resetCount, 1, 'queued combat intent retires only once per outage');
    assert.equal(after.hardSnaps, 0, 'recovery cannot introduce a teleport');
    assert.ok(after.recoveryErrorM < 4, 'two-way delayed recovery remains within the existing smooth budget');
    assert.ok(after.maxBackwardStepM < 0.3, 'no hidden contact-independent backward release');
    if (twoWay) assert.ok(after.recoveryErrorM < before.recoveryErrorM * 0.65,
      'two-way silence materially reduces uncontrolled forward error');
  }
}

// Latency is not silence: an 800 ms RTT stream still advances every ~50 ms.
// A short dropped-state burst must not alter the driver's movement either.
for (const options of [
  { delayMs: 400, startMs: Infinity, endMs: Infinity },
  { startMs: 5000, endMs: 5250 },
]) {
  const f = fixture(options);
  for (let index = 0; index < 1440; index++) f.step(1 / 144);
  assert.equal(f.counts().stoppedFrames, 0,
    'high RTT and short jitter bursts preserve healthy held controls');
  assert.equal(f.counts().resetCount, 0,
    'healthy delayed streams retain their pending combat intent');
  f.pump.dispose();
}

// Exact admission/lifecycle seams around the real browser pump, independent
// of display rate or any server clock epoch. No direct game-state mutation.
{
  const sent = [];
  const statuses = [];
  const reconnects = [];
  const actions = [];
  let resets = 0;
  let cleared = 0;
  let canceledShots = 0;
  let shotPredictions = 0;
  let terminal = 0;
  const held = { throttle: 1, steer: 0.7, brake: false, fire: true, actionBits: 4,
    aimYaw: 1.3, aimPitch: -0.15, aimDistance: 420, shellSlot: 2, aimLocked: false };
  const client = { closed: false, connected: true, lastSubmittedInputSeq: 0,
    lastSnapshotReceivedAtMs: 0, lastSubmittedFireIntentSeq: 1, shotFeedbackVersion: 1,
    clearPendingInputIntent() { cleared++; }, requestReconnect(reason) { reconnects.push(reason); } };
  let match = { role: 'client', client,
    submitInput(input) { sent.push(input); client.lastSubmittedInputSeq++; return true; },
    update: () => null };
  const input = { frame: () => held, advance() {}, shouldSend: () => true,
    commit: () => SIM_DT, reset() { resets++; }, resetCadence() {},
    acknowledge() {}, restore() {}, queueAction: (action) => actions.push(action),
    queueConsumable: (slot) => actions.push(slot) };
  const bridge = { apply() {}, advancePrediction: () => true, recordInput: () => true,
    predictLocalShot() { shotPredictions++; }, cancelLocalShotPrediction() { canceledShots++; } };
  const pump = createNetworkFramePump({ getMatch: () => match, getBridge: () => bridge,
    getStatus: () => ({ set: (status) => statuses.push(status) }), getPlayer: () => null,
    isBattleActive: () => true, nextFrame: async () => {},
    recovery: createNetworkRecoveryOwner(), onDisconnect() { terminal++; } });
  pump.ensureInputRuntime(() => input);
  pump.pump(SIM_DT, 0);
  pump.pump(SIM_DT, 499);
  assert.equal(sent.at(-1), held, 'short authority jitter preserves native controls');
  const priorShots = shotPredictions;
  pump.pump(SIM_DT, 500);
  const neutral = sent.at(-1);
  assert.deepEqual(neutral, { ...held, throttle: 0, steer: 0, brake: true,
    fire: false, actionBits: 0, aimLocked: true },
  'neutral keeps valid aim/ammo, but disables drive, traverse and combat edges');
  assert.deepEqual({ resets, cleared, canceledShots }, { resets: 2, cleared: 1, canceledShots: 1 });
  pump.queueAction('repair');
  pump.queueConsumable(1);
  assert.deepEqual(actions, [], 'safety braking cannot accumulate delayed consumable edges');
  pump.pump(SIM_DT, 900);
  assert.equal(sent.at(-1), neutral, 'neutral owns one reusable packet for this outage');
  assert.equal(shotPredictions, priorShots, 'stale input cannot predict a local gunshot');
  assert.equal(cleared, 1, 'duplicate displayed authority does not renew or reset the lease');
  assert.deepEqual(statuses, [{ state: 'reconnecting', attempt: 1, reason: 'authority_stalled' }]);
  assert.deepEqual(reconnects, [], 'soft braking does not replace a live RTC transport');
  client.lastSnapshotReceivedAtMs = 901;
  pump.pump(SIM_DT, 901);
  assert.equal(sent.at(-1), held, 'a genuinely advancing receipt restores current controls');
  assert.equal(statuses.at(-1).state, 'reconnected');
  pump.queueAction('repair');
  assert.deepEqual(actions, ['repair'], 'only new post-recovery actions are admitted');
  pump.pump(SIM_DT, 1401);
  const sendsBeforeWatchdog = sent.length;
  pump.pump(SIM_DT, 5901);
  assert.equal(sent.length, sendsBeforeWatchdog, 'the original 5 s hard watchdog still stops its pump');
  assert.deepEqual(reconnects, ['authority_stalled']);
  pump.pump(SIM_DT, 65900);
  assert.equal(terminal, 0, 'soft braking does not shorten the existing hard recovery grace');
  pump.pump(SIM_DT, 65901);
  assert.equal(terminal, 1, 'the original hard recovery deadline remains bounded');
  match = { ...match, client: { ...client, lastSnapshotReceivedAtMs: 70000 } };
  pump.pump(SIM_DT, 70000);
  assert.equal(sent.at(-1), held, 'a new match releases the predecessor brake owner');
  pump.clearRound();
  pump.dispose();
}

console.log('networkFramePumpStaleAuthority.selftest: real delayed movement outage and recovery passed');
