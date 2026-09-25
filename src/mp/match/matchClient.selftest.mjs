import assert from 'node:assert/strict';
import { createLoopbackPair } from '../transport/index.ts';
import { CLOSE_REASON, MESSAGE_TYPE, NO_ENTITY, NO_TICK, PHASE, TEAM, TICK_HZ } from '../wire/index.ts';
import { HeadlessMatchClientDriver, MatchClient } from './index.ts';
import { ScriptedMatchServer } from './scriptedServer.test-support.ts';

const SPEC = {
  enginePowerHp: 1500, weightTons: 60, topSpeedKmh: 65, reverseSpeedKmh: 30, hullTraverseDegS: 42,
  turretTraverseDegS: 40, gunPitchDegS: 25, gunElevationDeg: 20, gunDepressionDeg: 10, pivotStyle: 'neutral',
  terrainResistance: { hard: 0.8, medium: 1, soft: 1.8 },
  dims: { hullLengthM: 7.8, overallLengthM: 9.8, widthM: 3.7, heightM: 2.4 },
  gun: { caliberMm: 120, baseAccuracy: 0.3, aimTimeS: 2, bloom: { move: 0.1, hullRot: 0.1, turret: 0.08, afterShot: 3 } },
  armor: { boundingRadiusM: 4.8, turretPivot: [0, 1.5, 0], gunPivot: [0, 0.3, 0.2], gunBarrel: { lengthM: 5.3 } },
};
const height = (x, z) => 0.25 * Math.sin(z / 2) + 0.15 * Math.sin(x / 2);
const FIELD = { getHeightAt: height, getHeightAtFast: height, getGroundType: () => 'hard' };
const TICK_MS = 1000 / TICK_HZ;
// The charter's soak link: 100 ms RTT ± 30 ms jitter, 3 % loss, each direction half. On an ordered
// socket nothing is lost outright: the loss models the server dropping a stale snapshot under
// backpressure and a datagram transport losing input frames; reliable one-shots always arrive.
const LOSSY_TYPES = new Set([MESSAGE_TYPE.SNAPSHOT, MESSAGE_TYPE.INPUT]);
const lossFilter = (frame) => LOSSY_TYPES.has(frame[1]);
const LINK = { latencyMs: 50, jitterMs: 15, loss: 0.03, lossFilter };

function seats() {
  return [
    { entityId: 1, specId: 'm1', playerId: 'p1', name: 'One', team: TEAM.ALPHA, token: 'tok-1', x: 0, z: 0, yaw: 0 },
    { entityId: 2, specId: 'm1', playerId: 'p2', name: 'Two', team: TEAM.BRAVO, token: 'tok-2', x: 60, z: 40, yaw: Math.PI },
  ];
}

function bots() {
  return [
    { entityId: 3, specId: 'm1', team: TEAM.BRAVO, x: 40, z: 30, yaw: 1, drive: (t) => ({ throttle: 0.9, steer: Math.sin(t / 90) * 0.5 }), fireEveryTicks: 180 },
    { entityId: 4, specId: 'm1', team: TEAM.ALPHA, x: -30, z: 20, yaw: 2, drive: () => ({ throttle: 0.6, steer: -0.3 }) },
    { entityId: 5, specId: 'm1', team: TEAM.ALPHA, x: -60, z: -40, yaw: 0, drive: (t) => ({ throttle: t % 600 < 300 ? 1 : 0, steer: 0 }) },
  ];
}

const driveScript = (tick) => ({
  throttle: tick > 150 ? 1 : 0, steer: tick > 400 && tick < 700 ? 0.5 : tick > 900 && tick < 1000 ? -0.7 : 0,
  brake: false, fire: tick % 300 === 0 && tick > 200, aimLocked: true, aimYaw: 0.3, aimPitch: 0, aimDistance: 300,
  shellSlot: 0, actionPresses: tick === 500 ? 1 : 0,
});

/** One world: a virtual clock, the fixture server, and clients on impaired loopback pairs. */
function createWorld({ link = LINK, seatsList = seats(), botList = bots(), countdownTicks = 60, serverOptions = {} } = {}) {
  let nowMs = 10_000;
  const clock = () => nowMs;
  const server = new ScriptedMatchServer({ clock, heightField: FIELD, specFor: () => SPEC, seats: seatsList, bots: botList, countdownTicks, ...serverOptions });
  const pairs = [];
  let frozen = false;
  const pump = (t) => { for (const pair of pairs) pair.pump(t); if (!frozen) server.advance(t); for (const pair of pairs) pair.pump(t); };
  const addClient = ({ token, controls = driveScript, prediction = true, seed = 0x6f0b, clientOptions = {} }) => {
    const pair = createLoopbackPair({ clock, clientToServer: link, serverToClient: link, random: mulberry(seed) });
    pairs.push(pair);
    server.attach(pair.server);
    const client = new MatchClient({
      transport: pair.client, token, clock, controls,
      prediction: prediction ? { world: { heightField: FIELD }, specFor: () => SPEC } : null,
      ...clientOptions,
    });
    const driver = new HeadlessMatchClientDriver({ client, advanceClock: (ms) => (nowMs += ms), pump });
    return { client, driver, pair };
  };
  return {
    server, clock, addClient, pump,
    now: () => nowMs,
    freeze(value) { frozen = value; },
    /** Advance every client one frame on the shared clock. */
    frame(drivers) { nowMs += 1000 / 60; for (const driver of drivers) driver.step(nowMs); },
    /** Let the links and the server run for `ms` without stepping any client. */
    settle(ms) { for (let t = 0; t < ms; t += 5) { nowMs += 5; pump(nowMs); } },
  };
}

function mulberry(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
}

// ------------------------------------------------------------ two players, a spectator, three bots: the charter's gates
{
  const world = createWorld();
  const one = world.addClient({ token: 'tok-1', seed: 11 });
  const two = world.addClient({ token: 'tok-2', seed: 22, controls: (tick) => ({ ...driveScript(tick), steer: -driveScript(tick).steer }) });
  const watcher = world.addClient({ token: 'nobody', seed: 33, prediction: false, controls: null });
  const phases = [];
  one.client.onPhase((phase, detail) => phases.push([phase, detail]));
  let welcome = null;
  one.client.onWelcome((message) => { welcome = message; });
  one.client.connect(); two.client.connect(); watcher.client.connect();
  const seconds = 20;
  const drivers = [one.driver, two.driver, watcher.driver];
  for (let f = 0; f < seconds * 60; f++) world.frame(drivers);

  // Handshake and roster.
  assert.ok(welcome, 'WELCOME arrived');
  assert.equal(welcome.entityId, 1);
  assert.equal(welcome.roster.length, 5);
  assert.equal(one.client.roster.find((entry) => entry.entityId === 1).playerId, 'p1');
  assert.equal(one.client.isSeated, true);
  assert.equal(watcher.client.isSeated, false);
  assert.equal(watcher.client.ownEntityId, NO_ENTITY);
  assert.deepEqual(phases.slice(0, 2).map(([phase]) => phase), ['handshaking', 'live']);
  assert.equal(one.client.phase, 'live');

  // Clock: the estimated server time agrees with the server within the jitter.
  const stats = one.client.stats();
  const serverNowEstimate = one.client.serverClock.serverNow(world.now());
  assert.ok(Math.abs(serverNowEstimate - world.server.serverTimeMs) < 30, `offset error ${serverNowEstimate - world.server.serverTimeMs} ms`);
  assert.ok(stats.rttMs > 90 && stats.rttMs < 160, `RTT measured ${stats.rttMs}`);
  assert.ok(stats.clockSamples >= 16, 'the sample window filled');
  assert.ok(stats.lossRate > 0.01 && stats.lossRate < 0.06, `loss estimated ${stats.lossRate}`);
  assert.ok(stats.interpolationDelayMs >= 2 * 1000 / 30 - 1e-6 && stats.interpolationDelayMs <= 4 * 1000 / 30 + 1e-6,
    `delay inside 2..4 intervals: ${stats.interpolationDelayMs}`);
  assert.equal(stats.matchPhase, PHASE.PLAYING);
  assert.equal(stats.decodeErrors, 0);
  assert.equal(stats.serverErrors, 0);

  // Smoothness gates.
  for (const [label, driver] of [['one', one.driver], ['two', two.driver]]) {
    const gates = driver.gates();
    assert.equal(gates.hardSnaps, 0, `${label}: no hard snaps`);
    assert.ok(gates.maxRemoteStepM <= 0.5, `${label}: remote pose steps ≤ 0.5 m (${gates.maxRemoteStepM.toFixed(3)})`);
    assert.equal(gates.remoteStepsOver, 0);
    assert.ok(gates.maxOwnStepM <= 0.5, `${label}: own pose steps ≤ 0.5 m (${gates.maxOwnStepM.toFixed(3)})`);
    assert.ok(gates.maxCorrectionStepM <= 0.25, `${label}: correction release ≤ 0.25 m (${gates.maxCorrectionStepM.toFixed(3)})`);
    const rttTicks = Math.ceil(gates.rttMs / TICK_MS);
    // The raw lag includes the lead the client chose (2 ticks here); the intrinsic lag is the link and the server.
    assert.ok(gates.intrinsicAckLagP50 <= rttTicks + 2, `${label}: input ack lag p50 ${gates.intrinsicAckLagP50} ≤ RTT (${rttTicks} ticks) + 2`);
    assert.ok(gates.intrinsicAckLagP95 <= rttTicks + 4, `${label}: p95 ${gates.intrinsicAckLagP95}`);
    assert.ok(gates.ackLagP50 <= gates.intrinsicAckLagP50 + one.client.stats().inputLeadTicks + 1, `${label}: raw ${gates.ackLagP50} = intrinsic + lead`);
    assert.ok(gates.keyframes >= Math.floor(seconds / 2) - 1, `${label}: a keyframe every 2 s (${gates.keyframes})`);
    assert.ok(gates.maxExtrapolatedMs <= 1000 / 30 + 1e-6, `${label}: extrapolation capped at one interval`);
    assert.ok(gates.framesWithSample > seconds * 60 - 40, `${label}: frames rendered`);
    assert.ok(gates.eventsDelivered > 0 && gates.ownShotsDelivered >= 3, `${label}: events ${gates.eventsDelivered}, own shots ${gates.ownShotsDelivered}`);
    assert.ok(gates.predictedShots >= 3, `${label}: fire edges predicted immediately (${gates.predictedShots})`);
    assert.ok(gates.bytesIn / seconds < 18 * 1024, `${label}: ${(gates.bytesIn / seconds / 1024).toFixed(1)} KB/s down inside the budget`);
    assert.ok(gates.bytesOut / seconds < 4 * 1024, `${label}: ${(gates.bytesOut / seconds / 1024).toFixed(2)} KB/s up`);
  }
  const prediction = one.client.stats().prediction;
  assert.ok(prediction.maxPositionErrorM < 0.05, `own misprediction stays under 5 cm (${prediction.maxPositionErrorM.toFixed(4)})`);
  assert.equal(prediction.checkpointsRejected, 0);
  assert.ok(prediction.checkpointsApplied > 500);
  assert.ok(one.client.localTank.pos.distanceTo(world.server.entity(1).state.pos) < 3, 'the local tank runs just ahead of the authority');
  assert.ok(one.client.stats().ownShotsConfirmed >= 3, 'the authority confirmed the predicted shots');
  assert.equal(one.client.stats().pendingActionBits, 0, 'the action press was acknowledged');
  assert.ok(one.client.stats().inputLeadTicks <= 4, `lead settled (${one.client.stats().inputLeadTicks})`);
  const info = world.server.sessionInfo(one.pair.server);
  assert.ok(info.marginTicks >= 1 && info.marginTicks <= 4, `controls arrive 1..3 ticks early (${info.marginTicks})`);
  assert.equal(info.inputRejected, 0);

  // The spectator: frames, explicit acks, no INPUT.
  const watcherInfo = world.server.sessionInfo(watcher.pair.server);
  assert.equal(watcherInfo.seated, false);
  assert.equal(watcherInfo.inputFrames, 0, 'a spectator sends no INPUT');
  assert.notEqual(watcherInfo.ackedTick, NO_TICK, 'a spectator acknowledges snapshots explicitly');
  assert.ok(watcher.driver.gates().framesWithSample > 1000);
  assert.equal(watcher.client.localTank, null);
  assert.equal(watcher.driver.gates().hardSnaps, 0);
  assert.equal(watcher.driver.gates().remoteStepsOver, 0);
  world.frame(drivers);
  const watcherFrame = watcher.driver.step(world.now());
  assert.equal(watcherFrame.entities.length, 5, 'a spectator sees every tank');
  assert.equal(watcherFrame.viewer.state, null);

  // Interest management: player two is an enemy of player one; it is present only within the radius.
  const oneFrame = one.driver.step(world.now());
  assert.ok(oneFrame.entities.some((entity) => entity.entityId === 2), 'the nearby enemy is visible');
  assert.ok(oneFrame.entities.every((entity) => entity.entityId !== 1 || entity.snapped === false));

  // Leave: LEAVE goes out, the transport closes, the server sees it.
  two.client.leave();
  assert.equal(two.client.phase, 'left');
  assert.equal(two.pair.client.state, 'closed');
  world.settle(200);
  assert.equal(world.server.sessionInfo(two.pair.server).left, true, 'the server received LEAVE');
  assert.equal(two.pair.server.state, 'closed', 'the server-side socket closed behind it');
  assert.equal(two.driver.step(world.now() + 20), null, 'a left client produces no frames');
  // A server close: the wire CLOSE precedes the socket close and is not reconnected.
  world.server.kick(watcher.pair.server, CLOSE_REASON.MATCH_ENDED, 'match over');
  world.settle(200);
  watcher.driver.step(world.now());
  assert.equal(watcher.client.phase, 'closed');
  assert.equal(watcher.client.lastCloseReason, CLOSE_REASON.MATCH_ENDED);
  assert.equal(watcher.client.lastCloseDetail, 'match over');
  assert.equal(watcher.pair.client.state, 'closed');
  one.client.dispose();
  assert.equal(one.pair.client.state, 'closed');
}

// ------------------------------------------------------------ keyframe recovery after a dropped baseline
{
  const world = createWorld({ botList: bots().slice(0, 1) });
  // A three-frame ring evicts the baseline the server still builds against at 100 ms RTT.
  const player = world.addClient({ token: 'tok-1', seed: 44, clientOptions: { snapshotRing: 3 } });
  player.client.connect();
  player.driver.run(12_000);
  const stats = player.client.stats();
  const gates = player.driver.gates();
  assert.ok(stats.missingBaselines > 0, `baselines went missing (${stats.missingBaselines})`);
  assert.ok(stats.keyframeRequests > 0, `keyframes were requested (${stats.keyframeRequests})`);
  assert.ok(stats.keyframes > 6, `recovering keyframes arrived beyond the 2 s cadence (${stats.keyframes})`);
  assert.ok(gates.keyframeRecoveries > 0, `every gap recovered (${gates.keyframeRecoveries})`);
  assert.ok(stats.snapshotsAccepted > 200, `assembly kept going (${stats.snapshotsAccepted})`);
  assert.equal(stats.decodeErrors, 0, 'a missing baseline is not a decode error');
  assert.equal(gates.hardSnaps, 0);
  assert.equal(gates.remoteStepsOver, 0);
  assert.equal(player.client.phase, 'live');
}

// ------------------------------------------------------------ stall → reconnect → recovery, then the 60 s grace
{
  const world = createWorld({ link: { latencyMs: 30, jitterMs: 5, loss: 0 }, botList: [] });
  const player = world.addClient({ token: 'tok-1', seed: 55 });
  const phases = [];
  player.client.onPhase((phase) => phases.push(phase));
  player.client.connect();
  player.driver.run(3_000);
  assert.equal(player.client.phase, 'live');
  const before = player.client.stats();
  world.freeze(true);
  player.driver.run(5_500);
  assert.ok(phases.includes('stalled'), `stalled after 5 s without authority: ${phases.join(',')}`);
  assert.ok(player.client.stats().reconnects >= 1, 'a fresh socket was requested');
  assert.ok(phases.includes('reconnecting'));
  world.freeze(false);
  player.driver.run(4_000);
  assert.equal(player.client.phase, 'live', `authority resumed: ${phases.join(',')}`);
  const after = player.client.stats();
  assert.ok(after.snapshotsAccepted > before.snapshotsAccepted + 60, 'snapshots flow again');
  assert.ok(after.keyframes > before.keyframes, 'the new socket started with a keyframe');
  assert.equal(after.prediction.hardSnaps, 0, 'a reconnect re-seeds prediction instead of snapping');
  assert.ok(player.client.localTank.pos.distanceTo(world.server.entity(1).state.pos) < 3);
  assert.equal(world.server.sessionInfo(player.pair.server).welcomed, true);
  // Now the server dies for good: 60 s after the loss of authority the match fails (5 s to notice + 60 s grace).
  world.freeze(true);
  const frozenAt = world.now();
  player.driver.run(55_000);
  assert.notEqual(player.client.phase, 'failed', 'still inside the grace');
  while (player.client.phase !== 'failed' && world.now() - frozenAt < 80_000) player.driver.step();
  assert.equal(player.client.phase, 'failed');
  const failedAfterMs = world.now() - frozenAt;
  assert.ok(failedAfterMs >= 64_000 && failedAfterMs <= 67_000, `failed ${failedAfterMs} ms after the loss`);
  assert.equal(player.pair.client.state, 'closed');
  assert.equal(player.driver.step()?.phase ?? 'failed', 'failed');
  assert.ok(player.client.stats().stalls >= 2);
}

// ------------------------------------------------------------ input edges survive loss; a wrong token spectates; rates reject
{
  const world = createWorld({ link: { latencyMs: 60, jitterMs: 20, loss: 0.15, lossFilter }, botList: [] });
  let presses = 0;
  const player = world.addClient({
    token: 'tok-1', seed: 66,
    controls: (tick) => ({ ...driveScript(tick), fire: tick % 120 === 0 && tick > 100, actionPresses: tick % 200 === 0 && tick > 100 && tick < 550 ? (presses++, 2) : 0 }),
  });
  player.client.connect();
  player.driver.run(12_000);
  assert.ok(presses >= 2, `presses happened (${presses})`);
  const stats = player.client.stats();
  assert.equal(stats.pendingActionBits, 0, 'every press was acknowledged despite 15 % loss');
  assert.ok(world.server.stats.shotsFired >= 3, `every fire edge reached the authority once (${world.server.stats.shotsFired})`);
  assert.ok(stats.ownShotsConfirmed <= stats.ownShotsPredicted);
  assert.equal(stats.serverErrors, 0);
  assert.ok(world.server.stats.inputHeld < world.server.stats.inputControlsApplied * 0.05, 'the three-tick redundancy covers most losses');
  assert.equal(player.driver.gates().hardSnaps, 0);
}

console.log('mp match client: handshake, clock, input stream, snapshots, interpolation, prediction and events end to end over an impaired loopback — gates: no hard snaps, remote/own steps ≤ 0.5 m, release ≤ 0.25 m, ack lag ≤ RTT + 2 ticks, keyframe recovery, stall/reconnect/grace, leave/kick pass');
