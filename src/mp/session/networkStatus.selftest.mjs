// The Multiplayer v2 network status model: a scripted event sequence over
// structural sources (room joined / reconnecting; a match link connecting,
// live, every metric of the threshold table crossing its degraded and bad
// limits, a stale authority, reconnect attempts with their countdown, the
// recovery, a server-side seat drop, an explicit leave), the banner and the
// telemetry summary that follow from the snapshot, the in-place snapshot
// contract; then the same model on a real MatchClient over an impaired
// loopback against the scripted match server (live → good, a frozen server →
// stalled and reconnecting, the recovery → good, a leave → offline).
import assert from 'node:assert/strict';
import {
  NETWORK_HEALTH_THRESHOLDS, NetworkStatusModel, SEAT_DROP_REASONS, closeReasonName, networkBannerFor, resolveNetworkHealth,
} from './networkStatus.ts';
import { createLoopbackPair } from '../transport/index.ts';
import { CLOSE_REASON, MESSAGE_TYPE, TEAM } from '../wire/index.ts';
import { HeadlessMatchClientDriver, MatchClient } from '../match/index.ts';
import { ScriptedMatchServer } from '../match/scriptedServer.test-support.ts';

// ------------------------------------------------------------ scripted sources

function scriptedRoom() {
  const phaseListeners = new Set();
  const stateListeners = new Set();
  const closedListeners = new Set();
  const source = {
    phase: 'idle', room: null, seat: null, region: null, rttMs: null,
    onPhase(listener) { phaseListeners.add(listener); return () => phaseListeners.delete(listener); },
    onState(listener) { stateListeners.add(listener); return () => stateListeners.delete(listener); },
    onClosed(listener) { closedListeners.add(listener); return () => closedListeners.delete(listener); },
    emitPhase(change) { source.phase = change.phase; for (const listener of [...phaseListeners]) listener(change); },
    emitState(room) { source.room = room; for (const listener of [...stateListeners]) listener(room); },
    emitClosed(reason) { source.phase = 'closed'; for (const listener of [...closedListeners]) listener({ reason }); },
    listeners: () => phaseListeners.size + stateListeners.size + closedListeners.size,
  };
  return source;
}

function scriptedMatch() {
  const stateListeners = new Set();
  const phaseListeners = new Set();
  const stats = { framesSent: 0, bytesSent: 0, framesReceived: 0, bytesReceived: 0, framesDropped: 0, framesRejected: 0, reconnects: 0, opens: 0 };
  const prediction = { visibleCorrections: 0 };
  const source = {
    transport: {
      state: 'idle', stats,
      onState(listener) { stateListeners.add(listener); return () => stateListeners.delete(listener); },
    },
    phase: 'idle', welcome: null,
    serverClock: { rttMs: null, rttJitterMs: 0 },
    interpolator: { delay: 100, bufferedFrames: 3 },
    snapshots: { acceptedCount: 0, estimatedMissingCount: 0 },
    lastAuthorityReceivedAtMs: null,
    predictorStats: prediction,
    bytesInPerSecond: 12_000, bytesOutPerSecond: 3_000,
    lastCloseReason: null,
    onPhase(listener) { phaseListeners.add(listener); return () => phaseListeners.delete(listener); },
    emitTransport(change) { source.transport.state = change.state; for (const listener of [...stateListeners]) listener(change); },
    emitPhase(phase, detail = '') { source.phase = phase; for (const listener of [...phaseListeners]) listener(phase, detail); },
    listeners: () => stateListeners.size + phaseListeners.size,
  };
  return source;
}

const roomSnapshot = (players, phase = 'waiting', match = null) => ({
  v: 2, roomCode: 'ABC123', mode: 'lan', phase, adminId: 'p1', revision: 1, round: 0,
  settings: { gameMode: 'standard', mapId: 'verdant', teamSize: 14, maxSpectators: 8, botsFill: true, allowTeamSwitch: true, locked: false, arrangement: null, campaignOperationId: null },
  players, match, lastResult: null, createdAt: 0, touchedAt: 0,
});
const player = (id, team, seat) => ({ id, name: id, team, seat, specId: 'm1a2', equipment: [], camo: 'factory', ready: true, connected: true, isAdmin: seat === 0, joinedAt: seat });

{
  let nowMs = 100_000;
  const clock = () => nowMs;
  const model = new NetworkStatusModel({ clock, sampleIntervalMs: 250, windowMs: 1000, lossWindowMs: 2000 });
  const events = [];
  model.onEvent((event) => events.push(event));
  const seen = [];
  model.onChange((snapshot) => seen.push(snapshot));
  const s = model.snapshot;

  // ---- nothing attached
  assert.equal(s.health, 'unknown');
  assert.equal(s.healthReason, 'idle');
  assert.equal(model.banner(), null);

  // ---- a room only (the lobby strip): joined, seat, roster count, region, the room's own RTT
  const room = scriptedRoom();
  room.rttMs = 24; room.region = 'lan'; room.seat = 3;
  room.room = roomSnapshot([player('p1', 'alpha', 0), player('p2', 'bravo', 1), player('p3', 'alpha', 2), player('me', 'bravo', 3), player('watcher', 'spectator', 4)]);
  room.phase = 'joined';
  model.attachRoom(room);
  assert.equal(s.room, 'joined');
  assert.equal(s.seat, 3);
  assert.equal(s.rosterCount, 4, 'spectators are not seated commanders');
  assert.equal(s.rosterCapacity, 28);
  assert.equal(s.roomRegion, 'lan');
  assert.equal(s.roomRttMs, 24);
  assert.equal(s.roomPhase, 'waiting');
  assert.equal(s.health, 'good');
  assert.equal(s.healthReason, 'room');
  assert.equal(model.banner(), null);
  room.rttMs = 320;
  room.emitState(room.room);
  assert.deepEqual([s.health, s.healthReason], ['degraded', 'rtt'], 'a slow room link reads degraded before any match');
  room.rttMs = 24;
  room.emitPhase({ phase: 'reconnecting', detail: 'socket closed (1006)', attempt: 2, retryDelayMs: 1000 });
  assert.deepEqual([s.health, s.healthReason], ['bad', 'room_reconnecting']);
  assert.equal(s.roomReconnectAttempt, 2);
  assert.equal(s.roomReconnects, 1);
  assert.deepEqual(model.banner(), { kind: 'reconnecting', scope: 'room', attempt: 2, nextRetryS: 1 });
  nowMs += 600;
  assert.equal(model.banner().nextRetryS, 1, 'the countdown rounds up between samples');
  nowMs += 500;
  assert.equal(model.banner().nextRetryS, 0);
  room.emitPhase({ phase: 'joined', detail: '' });
  assert.deepEqual([s.health, s.healthReason], ['good', 'room']);
  assert.deepEqual(events.filter((event) => event.scope === 'room').map((event) => event.kind), ['reconnect', 'recovered']);

  // ---- a match link attaches: connecting, then live
  const match = scriptedMatch();
  model.attachMatch(match);
  assert.equal(s.attached, true);
  assert.deepEqual([s.health, s.healthReason], ['unknown', 'connecting']);
  assert.equal(model.banner(), null, 'connecting shows on the strip, never as a banner');
  match.emitTransport({ state: 'connecting', previous: 'idle', attempt: 0 });
  match.emitTransport({ state: 'open', previous: 'connecting', attempt: 0, resumed: false });
  match.welcome = { seat: 3 };
  match.emitPhase('handshaking');
  assert.deepEqual([s.health, s.healthReason], ['unknown', 'connecting']);
  match.serverClock.rttMs = 60; match.serverClock.rttJitterMs = 4;
  match.lastAuthorityReceivedAtMs = nowMs;
  match.snapshots.acceptedCount = 1;
  match.emitPhase('live');
  assert.deepEqual([s.health, s.healthReason], ['good', 'live']);
  assert.equal(s.snapshotHz, 30, 'the authority rate stands in before the first window');
  assert.equal(s.rttMs, 60);
  assert.equal(s.interpolationDelayMs, 100);
  assert.equal(s.bufferedFrames, 3);
  assert.equal(s.bytesInPerS, 12_000);

  // The cadence needs a full window: 30 snapshots over 1 s read as 30 Hz, 12 as a bad cadence.
  // Rates are measured over windows that need not align with a scripted phase: run each phase for
  // two windows so the last closed window lies wholly inside it.
  let pendingSnapshots = 0;
  let pendingCorrections = 0;
  let pendingMissing = 0;
  const advance = (ms, snapshotsPerS = 30, correctionsPerS = 0, missingPerS = 0) => {
    for (let elapsed = 0; elapsed < ms; elapsed += 50) {
      nowMs += 50;
      pendingSnapshots += snapshotsPerS * 0.05;
      const arrived = Math.floor(pendingSnapshots);
      pendingSnapshots -= arrived;
      match.snapshots.acceptedCount += arrived;
      pendingMissing += missingPerS * 0.05;
      const lost = Math.floor(pendingMissing);
      pendingMissing -= lost;
      match.snapshots.estimatedMissingCount += lost;
      pendingCorrections += correctionsPerS * 0.05;
      const corrected = Math.floor(pendingCorrections);
      pendingCorrections -= corrected;
      match.predictorStats.visibleCorrections += corrected;
      match.lastAuthorityReceivedAtMs = nowMs;
      model.update(nowMs);
    }
  };
  const samplesBefore = seen.length;
  advance(1000);
  assert.ok(seen.length - samplesBefore >= 4 && seen.length - samplesBefore <= 5, `samples at the 250 ms cadence (${seen.length - samplesBefore})`);
  assert.ok(Math.abs(s.snapshotHz - 30) <= 2, `measured cadence ${s.snapshotHz}`);
  assert.deepEqual([s.health, s.healthReason], ['good', 'live']);
  assert.ok(seen.every((snapshot) => snapshot === s), 'listeners always receive the one snapshot object (no allocation per sample)');

  // ---- every metric of the table, degraded then bad, in the table's order of precedence
  match.serverClock.rttMs = NETWORK_HEALTH_THRESHOLDS.degraded.rttMs; advance(250);
  assert.deepEqual([s.health, s.healthReason], ['degraded', 'rtt']);
  match.serverClock.rttMs = NETWORK_HEALTH_THRESHOLDS.bad.rttMs; advance(250);
  assert.deepEqual([s.health, s.healthReason], ['bad', 'rtt']);
  match.serverClock.rttMs = 60;
  match.serverClock.rttJitterMs = 45; advance(250);
  assert.deepEqual([s.health, s.healthReason], ['degraded', 'jitter']);
  match.serverClock.rttJitterMs = 120; advance(250);
  assert.deepEqual([s.health, s.healthReason], ['bad', 'jitter']);
  match.serverClock.rttJitterMs = 4;
  // Loss reads over its own window (2 s here): 2 gaps/s beside 30 snapshots/s is 6.25 %, 6/s is 16.7 %.
  advance(4000, 30, 0, 2);
  assert.deepEqual([s.health, s.healthReason], ['degraded', 'loss']);
  assert.ok(s.lossRate > 0.055 && s.lossRate < 0.07, `loss ${s.lossRate}`);
  advance(4000, 30, 0, 6);
  assert.deepEqual([s.health, s.healthReason], ['bad', 'loss']);
  advance(4000, 30);
  assert.deepEqual([s.health, s.healthReason], ['good', 'live'], 'a windowed loss rate recovers');
  advance(2000, 20);
  assert.deepEqual([s.health, s.healthReason], ['degraded', 'cadence'], `20 of 30 Hz (${s.snapshotHz})`);
  assert.ok(Math.abs(s.snapshotHz - 20) <= 1, `measured ${s.snapshotHz} Hz`);
  advance(2000, 12);
  assert.deepEqual([s.health, s.healthReason], ['bad', 'cadence'], `12 of 30 Hz (${s.snapshotHz})`);
  advance(2000, 30);
  assert.deepEqual([s.health, s.healthReason], ['good', 'live']);
  advance(2000, 30, 3);
  assert.deepEqual([s.health, s.healthReason], ['degraded', 'corrections']);
  assert.ok(Math.abs(s.correctionsPerS - 3) <= 1, `corrections/s ${s.correctionsPerS}`);
  advance(2000, 30, 8);
  assert.deepEqual([s.health, s.healthReason], ['bad', 'corrections']);
  advance(2000, 30, 0);
  assert.deepEqual([s.health, s.healthReason], ['good', 'live']);
  assert.deepEqual(model.banner(), null);

  // ---- the client's own stall: a 600 ms gap between updates is not the link's fault (no verdict from age or cadence)
  nowMs += 600; model.update(nowMs);
  assert.equal(s.localStallMs, 600);
  assert.equal(s.snapshotAgeMs, 600);
  assert.deepEqual([s.health, s.healthReason], ['good', 'live'], 'a self-stalled window judges neither freshness nor cadence');
  advance(2000);
  assert.equal(s.localStallMs, 50, 'the next clean window carries only the ordinary 50 ms update gap');
  assert.deepEqual([s.health, s.healthReason], ['good', 'live']);

  // ---- a stale authority: the socket is open, the client keeps updating, nothing arrives
  const idle = (ms) => { for (let elapsed = 0; elapsed < ms; elapsed += 50) { nowMs += 50; model.update(nowMs); } };
  idle(300);
  assert.deepEqual([s.health, s.healthReason], ['degraded', 'stale']);
  assert.deepEqual(model.banner(), { kind: 'degraded', reason: 'stale' });
  idle(800);
  assert.deepEqual([s.health, s.healthReason], ['bad', 'stale']);
  assert.ok(s.snapshotAgeMs >= 1000 && s.snapshotAgeMs <= 1100, `age at the last 250 ms sample (${s.snapshotAgeMs})`);
  // The recovery declares a stall (5 s): the verdict names it and the banner says the authority stopped answering.
  match.emitPhase('stalled', 'authority_stalled');
  assert.deepEqual([s.health, s.healthReason], ['bad', 'stalled']);
  assert.deepEqual(model.banner(), { kind: 'stalled' });

  // ---- reconnect attempts: the attempt ordinal, the countdown, the events
  match.emitTransport({ state: 'reconnecting', previous: 'open', reason: 'stalled', detail: 'no accepted authority for 5000 ms', attempt: 1, retryDelayMs: 250 });
  match.emitPhase('reconnecting');
  assert.deepEqual([s.health, s.healthReason], ['bad', 'reconnecting']);
  assert.equal(s.reconnectAttempt, 1);
  assert.equal(s.nextRetryMs, 250);
  assert.deepEqual(model.banner(), { kind: 'reconnecting', scope: 'match', attempt: 1, nextRetryS: 1 });
  nowMs += 250;
  match.emitTransport({ state: 'connecting', previous: 'reconnecting', attempt: 1 });
  match.emitTransport({ state: 'reconnecting', previous: 'connecting', reason: 'network', detail: 'socket closed (1006)', attempt: 2, retryDelayMs: 3000 });
  assert.equal(s.reconnectAttempt, 2);
  assert.equal(s.reconnects, 2);
  assert.deepEqual(model.banner(), { kind: 'reconnecting', scope: 'match', attempt: 2, nextRetryS: 3 });
  nowMs += 2100;
  assert.equal(model.banner().nextRetryS, 1);
  nowMs += 900;
  match.emitTransport({ state: 'connecting', previous: 'reconnecting', attempt: 2 });
  match.emitTransport({ state: 'open', previous: 'connecting', attempt: 2, resumed: true });
  match.emitPhase('handshaking');
  assert.equal(s.reconnectAttempt, 0);
  assert.deepEqual([s.health, s.healthReason], ['unknown', 'connecting']);
  match.lastAuthorityReceivedAtMs = nowMs;
  match.emitPhase('live');
  advance(2000);
  assert.deepEqual([s.health, s.healthReason], ['good', 'live']);
  assert.equal(model.banner(), null);
  const matchEvents = events.filter((event) => event.scope === 'match' || event.kind === 'health');
  assert.deepEqual(matchEvents.filter((event) => event.kind !== 'health').map((event) => [event.kind, event.attempt ?? event.attempts]),
    [['reconnect', 1], ['reconnect', 2], ['recovered', 2]]);
  const healthEvents = events.filter((event) => event.kind === 'health');
  assert.ok(healthEvents.length > 6, 'health changes are events');
  assert.ok(healthEvents.every((event) => event.previous !== event.health));

  // ---- the server ends the seat (a kick, a timeout): dropped, offline, the banner names the wire reason
  match.lastCloseReason = CLOSE_REASON.IDLE_TIMEOUT;
  match.emitPhase('closed', 'idle');
  match.emitTransport({ state: 'closed', previous: 'open', reason: 'server', detail: 'idle' });
  assert.deepEqual([s.health, s.healthReason], ['offline', 'dropped']);
  assert.equal(s.closeReason, 'idle_timeout');
  assert.equal(s.seatDropped, true);
  assert.deepEqual(model.banner(), { kind: 'dropped', reason: 'idle_timeout' });
  assert.deepEqual(events.filter((event) => event.kind === 'dropped'), [{ kind: 'dropped', scope: 'match', reason: 'idle_timeout' }]);
  const summary = model.summary();
  assert.equal(summary.health, 'offline');
  assert.equal(summary.worst, 'offline');
  assert.equal(summary.reconnects, 2);
  assert.equal(summary.roomReconnects, 1);
  assert.equal(summary.drops, 1);
  assert.equal(summary.lastDrop, 'idle_timeout');
  assert.ok(summary.impairedMs > 5000 && summary.impairedMs < 20_000, `impaired for ${summary.impairedMs} ms`);

  // ---- a match that ends is not a drop; an explicit leave is offline without a banner
  const ended = scriptedMatch();
  model.attachMatch(ended);
  assert.equal(match.listeners(), 0, 'the previous source is unsubscribed');
  ended.lastCloseReason = CLOSE_REASON.MATCH_ENDED;
  ended.emitPhase('closed', 'match over');
  assert.deepEqual([s.health, s.healthReason], ['offline', 'closed']);
  assert.equal(s.seatDropped, false);
  assert.equal(model.banner(), null, 'the verdict screen owns a match_ended close');
  ended.emitPhase('left');
  assert.deepEqual([s.health, s.healthReason], ['offline', 'left']);
  assert.equal(model.banner(), null);
  // A close with no wire reason (the transport gave up) is a lost link.
  const lost = scriptedMatch();
  model.attachMatch(lost);
  lost.emitPhase('failed', 'no authority for 60000 ms');
  assert.deepEqual([s.health, s.healthReason], ['offline', 'failed']);
  assert.deepEqual(model.banner(), { kind: 'failed' });
  model.detachMatch();
  assert.equal(s.attached, false);
  assert.deepEqual([s.health, s.healthReason], ['good', 'room'], 'the room verdict returns once the match is detached');
  assert.equal(model.summary().drops, 1, 'the summary keeps the battle\'s drop across rounds');

  // ---- the room closes under the seat
  room.emitClosed('kicked');
  assert.deepEqual([s.health, s.healthReason], ['offline', 'room_closed']);
  model.dispose();
  assert.equal(room.listeners(), 0);
  assert.equal(lost.listeners(), 0);
}

// ------------------------------------------------------------ the pure verdict and banner over a bare snapshot
{
  const base = new NetworkStatusModel().snapshot;
  const at = (patch) => ({ ...base, ...patch });
  assert.deepEqual(resolveNetworkHealth(at({})), { health: 'unknown', reason: 'idle' });
  assert.deepEqual(resolveNetworkHealth(at({ attached: true, link: 'live', rttMs: 999 })), { health: 'bad', reason: 'rtt' });
  assert.deepEqual(resolveNetworkHealth(at({ attached: true, link: 'live', rttMs: 40, room: 'reconnecting' })), { health: 'degraded', reason: 'room_reconnecting' });
  assert.deepEqual(resolveNetworkHealth(at({ attached: true, link: 'live', snapshotAgeMs: 2000, lossRate: 0.5 })), { health: 'bad', reason: 'stale' }, 'stale outranks loss');
  const strict = { degraded: { ...NETWORK_HEALTH_THRESHOLDS.degraded, rttMs: 20 }, bad: { ...NETWORK_HEALTH_THRESHOLDS.bad, rttMs: 30 } };
  assert.deepEqual(resolveNetworkHealth(at({ attached: true, link: 'live', rttMs: 25 }), strict), { health: 'degraded', reason: 'rtt' }, 'the table is injectable');
  assert.deepEqual(networkBannerFor(at({ attached: true, transport: 'reconnecting', link: 'reconnecting', reconnectAttempt: 0, retryAtMs: null })),
    { kind: 'reconnecting', scope: 'match', attempt: 1, nextRetryS: 0 }, 'a reconnecting link without an attempt still counts as the first');
  assert.equal(closeReasonName(CLOSE_REASON.REPLACED), 'replaced');
  assert.equal(closeReasonName(CLOSE_REASON.NONE), null);
  assert.equal(closeReasonName(null), null);
  assert.ok(SEAT_DROP_REASONS.has(CLOSE_REASON.REPLACED) && SEAT_DROP_REASONS.has(CLOSE_REASON.IDLE_TIMEOUT) && SEAT_DROP_REASONS.has(CLOSE_REASON.SERVER_DRAIN));
  assert.ok(!SEAT_DROP_REASONS.has(CLOSE_REASON.MATCH_ENDED) && !SEAT_DROP_REASONS.has(CLOSE_REASON.CLIENT_LEAVE) && !SEAT_DROP_REASONS.has(CLOSE_REASON.NONE));
}

// ------------------------------------------------------------ a real MatchClient over an impaired loopback against the scripted server

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
const LOSSY_TYPES = new Set([MESSAGE_TYPE.SNAPSHOT, MESSAGE_TYPE.INPUT]);
const LINK = { latencyMs: 50, jitterMs: 15, loss: 0.03, lossFilter: (frame) => LOSSY_TYPES.has(frame[1]) };

function mulberry(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
}

{
  let nowMs = 10_000;
  const clock = () => nowMs;
  const seats = [{ entityId: 1, specId: 'm1', playerId: 'p1', name: 'One', team: TEAM.ALPHA, token: 'tok-1', x: 0, z: 0, yaw: 0 }];
  const bots = [{ entityId: 2, specId: 'm1', team: TEAM.BRAVO, x: 60, z: 40, yaw: 1, drive: (t) => ({ throttle: 0.9, steer: Math.sin(t / 90) * 0.5 }) }];
  const server = new ScriptedMatchServer({ clock, heightField: FIELD, specFor: () => SPEC, seats, bots, countdownTicks: 60 });
  const pair = createLoopbackPair({ clock, clientToServer: LINK, serverToClient: LINK, random: mulberry(0x6f0b) });
  server.attach(pair.server);
  let frozen = false;
  const pump = (t) => { pair.pump(t); if (!frozen) server.advance(t); pair.pump(t); };
  const controls = (tick) => ({ throttle: tick > 150 ? 1 : 0, steer: 0, brake: false, fire: false, aimLocked: true, aimYaw: 0.3, aimPitch: 0, aimDistance: 300, shellSlot: 0, actionPresses: 0 });
  const client = new MatchClient({ transport: pair.client, token: 'tok-1', clock, controls, prediction: { world: { heightField: FIELD }, specFor: () => SPEC } });
  const driver = new HeadlessMatchClientDriver({ client, advanceClock: (ms) => (nowMs += ms), pump });
  const model = new NetworkStatusModel({ clock });
  const events = [];
  model.onEvent((event) => events.push(event));
  model.attachMatch(client);
  const s = model.snapshot;
  const frame = () => { nowMs += 1000 / 60; driver.step(nowMs); model.update(nowMs); };
  const seconds = (count) => { for (let f = 0; f < count * 60; f++) frame(); };
  client.connect();
  seconds(8);
  assert.equal(client.phase, 'live');
  assert.deepEqual([s.attached, s.transport, s.link, s.welcomed], [true, 'open', 'live', true]);
  assert.ok(s.rttMs > 60 && s.rttMs < 130, `window-minimum RTT ${s.rttMs} on a 100 ± 30 ms link`);
  assert.ok(s.rttMedianMs >= s.rttMs && s.rttMedianMs < 160, `median RTT ${s.rttMedianMs} (pings and pongs land on frame boundaries, so it may equal the floor)`);
  assert.ok(s.rttJitterMs < NETWORK_HEALTH_THRESHOLDS.degraded.jitterMs, `spread ${s.rttJitterMs}`);
  assert.ok(s.localStallMs < 250, `a 60 Hz loop carries only frame gaps (${s.localStallMs} ms)`);
  assert.ok(s.snapshotHz > 26 && s.snapshotHz <= 31, `cadence ${s.snapshotHz} Hz at 3 % loss`);
  assert.ok(s.lossRate >= 0 && s.lossRate < 0.06, `loss ${s.lossRate}`);
  assert.ok(client.snapshots.estimatedMissingCount > 0, 'the impaired link did lose snapshots');
  assert.ok(s.snapshotAgeMs < 250, `age ${s.snapshotAgeMs}`);
  assert.ok(s.interpolationDelayMs >= 2 * 1000 / 30 - 1e-6 && s.interpolationDelayMs <= 4 * 1000 / 30 + 1e-6, `delay ${s.interpolationDelayMs}`);
  assert.ok(s.bufferedFrames >= 1, `buffer ${s.bufferedFrames}`);
  assert.ok(s.bytesInPerS > 500 && s.bytesOutPerS > 500, `rates ${s.bytesInPerS} / ${s.bytesOutPerS}`);
  assert.equal(s.correctionsPerS, 0, 'a straight drive on a smooth field stages no visible correction');
  assert.deepEqual([s.health, s.healthReason], ['good', 'live']);
  assert.equal(model.banner(), null);
  assert.equal(client.predictorStats.visibleCorrections, 0);

  // The authority stops: stale → the 5 s stall → the transport asked for a fresh socket (reconnecting with a countdown).
  frozen = true;
  const frozenAt = nowMs;
  const banners = new Set();
  while (client.phase !== 'reconnecting' && nowMs - frozenAt < 8000) { frame(); const banner = model.banner(); if (banner) banners.add(banner.kind); }
  assert.equal(client.phase, 'reconnecting', `the stall asked for a fresh socket (${client.phase})`);
  assert.deepEqual([s.health, s.healthReason], ['bad', 'reconnecting']);
  // The client asks for a fresh socket in the very update that declares the stall, so the real path walks
  // degraded (stale) → reconnecting; the `stalled` banner exists for a recovery that cannot reconnect (scripted above).
  assert.ok(banners.has('degraded') && banners.has('reconnecting'), `the banner walked degraded → reconnecting (${[...banners].join(',')})`);
  assert.ok(s.reconnectAttempt >= 1 && s.reconnects >= 1);
  assert.ok(s.retryAtMs !== null && s.retryAtMs >= nowMs, 'the next attempt is in the future');
  assert.equal(model.banner().kind, 'reconnecting');
  assert.ok(events.some((event) => event.kind === 'reconnect' && event.scope === 'match'));

  // The authority returns: the resumed socket, a fresh handshake, live and good again.
  frozen = false;
  seconds(8);
  assert.equal(client.phase, 'live');
  assert.deepEqual([s.health, s.healthReason], ['good', 'live']);
  assert.equal(s.reconnectAttempt, 0);
  assert.ok(events.some((event) => event.kind === 'recovered' && event.scope === 'match'), 'the recovery is an event');
  assert.ok(model.summary().impairedMs >= 5000, `the outage counts as impaired time (${model.summary().impairedMs} ms)`);

  // A server-side seat drop: the wire CLOSE names it; the model reads it as dropped.
  server.kick(pair.server, CLOSE_REASON.REPLACED, 'seat reconnected');
  for (let t = 0; t < 400; t += 5) { nowMs += 5; pump(nowMs); }
  driver.step(nowMs);
  model.update(nowMs);
  assert.equal(client.phase, 'closed');
  assert.deepEqual([s.health, s.healthReason, s.closeReason, s.seatDropped], ['offline', 'dropped', 'replaced', true]);
  assert.deepEqual(model.banner(), { kind: 'dropped', reason: 'replaced' });
  assert.equal(model.summary().lastDrop, 'replaced');
  client.dispose();
  model.dispose();
}

console.log('mp network status: room and match sources, every threshold, stale/stall/reconnect countdown, seat drops, leave, summary; a real client over an impaired loopback — PASS');

// ------------------------------------------------------------ peer-to-peer (P2 client lane): the session's facts, the events, the banner, the summary
{
  const { NetworkStatusModel: Model, networkBannerFor } = await import('./networkStatus.ts');
  let nowMs = 50_000;
  const model = new Model({ clock: () => nowMs });
  const events = [];
  model.onEvent((event) => events.push(event));
  const listeners = new Set();
  const facts = { role: 'peer', generation: 1, hostId: 'alice', migrating: false, migrationHostId: null, candidateType: 'srflx', viaTurn: false, peersConnected: 0, relayed: 0, uplinkBytesPerS: 0, hostState: null };
  const roomListeners = { phase: new Set(), state: new Set(), closed: new Set() };
  const roomSource = {
    phase: 'joined', room: { players: [{ id: 'alice', name: 'Alice' }, { id: 'bob', name: 'Bob' }] }, seat: 1, region: 'lan', rttMs: 12,
    onPhase: (listener) => { roomListeners.phase.add(listener); return () => roomListeners.phase.delete(listener); },
    onState: (listener) => { roomListeners.state.add(listener); return () => roomListeners.state.delete(listener); },
    onClosed: (listener) => { roomListeners.closed.add(listener); return () => roomListeners.closed.delete(listener); },
  };
  model.attachRoom(roomSource);
  model.attachP2p({ get p2p() { return facts; }, onP2p: (listener) => { listeners.add(listener); return () => listeners.delete(listener); } });
  const s = model.snapshot;
  assert.deepEqual([s.role, s.generation, s.hostId, s.candidateType, s.viaTurn, s.peersConnected, s.hostUplinkKbps, s.migrating], ['peer', 1, 'alice', 'srflx', false, 0, 0, false], 'the p2p facts ride the snapshot');
  assert.equal(model.banner(nowMs), null, 'no banner on a settled peer');
  // an election: the banner names the new host by its room name; the events count the migration
  facts.migrating = true; facts.migrationHostId = 'bob';
  for (const listener of listeners) listener({ kind: 'migration', phase: 'begin', hostId: 'bob', generation: 2, role: 'peer', detail: 'timeout' });
  assert.deepEqual(model.banner(nowMs), { kind: 'migrating', host: 'Bob', self: false });
  assert.deepEqual(events.filter((event) => event.kind === 'migration'), [{ kind: 'migration', phase: 'begin', role: 'peer', hostId: 'bob', reason: 'timeout' }]);
  assert.deepEqual(networkBannerFor({ ...s, migrating: true, migrationHostId: 'carol' }, nowMs), { kind: 'migrating', host: 'carol', self: false }, 'an unknown id stands for itself');
  // this seat becomes the host: the role event, the badge facts, the uplink in kbit/s, TURN from a relayed peer
  facts.role = 'host'; facts.generation = 2; facts.hostId = 'bob'; facts.peersConnected = 3; facts.relayed = 1; facts.viaTurn = true; facts.uplinkBytesPerS = 12_500;
  for (const listener of listeners) listener({ kind: 'role', role: 'host', generation: 2 });
  assert.deepEqual(events.filter((event) => event.kind === 'host'), [{ kind: 'host', role: 'host', migrated: true }], 'a role change while migrating is a migration onto this seat');
  assert.deepEqual([s.role, s.generation, s.peersConnected, s.viaTurn, s.hostUplinkKbps], ['host', 2, 3, true, 100]);
  assert.deepEqual(model.banner(nowMs), { kind: 'migrating', host: 'Bob', self: true }, 'the banner says so while the host boots');
  facts.migrating = false; facts.migrationHostId = null;
  for (const listener of listeners) listener({ kind: 'migration', phase: 'end', hostId: 'bob', generation: 2, role: 'host', detail: 'welcomed' });
  assert.equal(model.banner(nowMs), null);
  const summary = model.summary();
  assert.equal(summary.hosted, 1);
  assert.equal(summary.migrations, 1);
  // detaching clears the facts; the summary keeps its counts
  model.detachP2p();
  assert.deepEqual([s.role, s.generation, s.peersConnected, s.migrating], [null, 0, 0, false]);
  assert.equal(model.summary().hosted, 1);
  model.dispose();
  console.log('networkStatus.selftest: the peer-to-peer facts, the migration banner, the host and migration events and the summary counts verified');
}
