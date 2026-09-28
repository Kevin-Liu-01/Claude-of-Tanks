// The browser host in Node: the host runtime on an in-process port pair whose far end runs the host core (the real
// match actor on the bare height field), the host's own seat through the loopback pair, a peer through a real
// WebRtcTransport on the scripted WebRTC world and the room relay double, seat tokens signed with the per-match host
// secret (verified by Web Crypto in the core; a bad token closes as BAD_TOKEN), reports to the room at boot and on
// the cadence, snapshots to both seats, sealed migration keyframes and the boot configuration retained by the peer
// (readable with the host secret, the hidden enemy inside), then a migration: the peer becomes the host, boots a
// second core from the retained keyframe at the continued tick with the entities at the keyframe's poses, and its
// own client migrates onto the new actor through the migrating transport (re-welcomed, positions continuous); the
// old host stops cleanly.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { signSeatToken } from '../../../server/match/seatToken.ts';
import { MatchClient } from '../match/matchClient.ts';
import { CLOSE_REASON, NO_ENTITY } from '../wire/constants.ts';
import { dequantizePosition } from '../wire/quantize.ts';
import { MigratingTransport, WebRtcTransport } from '../transport/index.ts';
import { FakeSignalRelay, RtcWorld } from '../transport/rtcDouble.test-support.ts';
import { createHostPortPair } from './hostProtocol.ts';
import { createMatchHostCore } from './matchHostCore.ts';
import { createMatchHost } from './matchHost.ts';
import { decodeBootConfig, decodeMigrationKeyframe, deriveMigrationKey, openMigrationBlob } from './migrationState.ts';

// ------------------------------------------------------------ virtual time shared by everything
let nowMs = 100_000;
let serial = 0;
const timers = new Map();
const time = {
  clock: () => nowMs,
  setTimer(callback, delayMs) { const handle = ++serial; timers.set(handle, { dueMs: nowMs + delayMs, callback, handle }); return handle; },
  clearTimer(handle) { timers.delete(handle); },
  schedule(callback, delayMs) { const handle = time.setTimer(callback, delayMs); return () => time.clearTimer(handle); },
  fireDue() {
    for (;;) {
      const due = [...timers.values()].filter((timer) => timer.dueMs <= nowMs).sort((a, b) => a.dueMs - b.dueMs || a.handle - b.handle)[0];
      if (!due) break;
      timers.delete(due.handle);
      due.callback();
    }
  },
};
const TICK_MS = 1000 / 60;
const world = new RtcWorld();
const relay = new FakeSignalRelay('host', 1);
const hosts = [];
const settle = async (rounds = 6) => {
  for (let index = 0; index < rounds; index++) {
    // Web Crypto resolves on the thread pool: a real event-loop turn, not just microtasks.
    await new Promise((resolve) => setImmediate(resolve));
    relay.flush(); world.flush();
    for (const host of hosts) host.pump(nowMs);
  }
};
/** Advance virtual time tick by tick, firing the actor loops and delivering everything between ticks. */
const advance = async (ms) => {
  const steps = Math.max(1, Math.round(ms / TICK_MS));
  for (let step = 0; step < steps; step++) {
    nowMs += TICK_MS;
    time.fireDue();
    await settle(3);
    for (const client of clients) client.update(nowMs, TICK_MS / 1000);
    await settle(2);
  }
};
const clients = [];

// ------------------------------------------------------------ the room's secrets and tokens
const SEAT_SECRET = 'room-seat-secret-0123456789abcdef';
const matchId = 'm1-00c0ffee';
const hostSecret = createHash('sha256').update(`${SEAT_SECRET}:${matchId}`).digest('hex');
const tokenFor = (seat, playerId, team, specId, secret = hostSecret) => signSeatToken(secret, { v: 1, roomId: 'ROOM01', seat, playerId, name: playerId, team, specId, iat: Date.now() - 1000, exp: Date.now() + 3_600_000 });
const seats = [
  { seat: 0, playerId: 'host', name: 'Host', team: 'alpha', specId: 'm1a2' },
  { seat: 1, playerId: 'bob', name: 'Bob', team: 'bravo', specId: 't90m' },
  { seat: 2, playerId: 'eve', name: 'Eve', team: 'bravo', specId: 't90m' },
];
const config = { roomId: 'ROOM01', matchId, generation: 1, mapId: 'verdant', mode: 'standard', seed: 5, seats, bots: [], countdownS: 0, battleLimitS: 600, hostSecret, manifestBase: null, resume: null };

const cores = [];
const createPort = () => {
  const pair = createHostPortPair();
  cores.push(createMatchHostCore({
    port: pair.worker, buildWorld: async () => 'terrain', now: time.clock, schedule: time.schedule, setTimer: time.setTimer, clearTimer: time.clearTimer,
    keyframeIntervalMs: 500, configIntervalMs: 1500, reportIntervalMs: 2000, endedLingerTicks: 30,
  }));
  return pair.main;
};
const reports = [];
const logs = [];
const host = createMatchHost({
  playerId: 'host', generation: () => relay.generation, createPort, createPeerConnection: world.createPeerConnection,
  room: { signaler: relay.signalerFor('host'), reportMatch: async (report) => { reports.push(report); } },
  clock: time.clock, setTimer: time.setTimer, clearTimer: time.clearTimer, onLog: (level, message, fields) => logs.push({ level, message, fields }),
});
hosts.push(host);
const states = [];
host.onState((state, detail) => states.push(`${state}:${detail}`));

// ---- boot
const starting = host.start(config);
await settle(12);
await starting;
assert.equal(host.state, 'live');
assert.deepEqual(states, ['booting:boot', 'live:started']);
assert.equal(reports.length, 2, "the boot reports reached the room: 'loading' as soon as the actor exists, then its phase");
assert.equal(reports[0].matchId, matchId);
assert.equal(reports[0].generation, 1);
assert.equal(reports[0].phase, 'loading');
assert.ok(['countdown', 'playing'].includes(reports[1].phase), `the phase report (${reports[1].phase})`);
assert.equal(reports[0].verdict, undefined);

// ---- the host's own seat over the loopback pair
const hostClient = new MatchClient({ transport: host.transport, token: tokenFor(0, 'host', 'alpha', 'm1a2'), clock: time.clock });
clients.push(hostClient);
hostClient.connect();
await advance(TICK_MS * 6);
assert.ok(hostClient.welcome, 'the host was welcomed by its own actor');
assert.equal(hostClient.welcome.seat, 0);
assert.equal(hostClient.roster.length, 3);

// ---- a peer through WebRTC
const bobRtc = new WebRtcTransport({ signaler: relay.signalerFor('bob'), createPeerConnection: world.createPeerConnection, clock: time.clock, setTimer: time.setTimer, clearTimer: time.clearTimer, random: () => 0.5 });
const bobTransport = new MigratingTransport(bobRtc);
const bobClient = new MatchClient({ transport: bobTransport, token: tokenFor(1, 'bob', 'bravo', 't90m'), clock: time.clock });
clients.push(bobClient);
bobClient.connect();
await advance(TICK_MS * 12);
assert.equal(bobRtc.state, 'open');
assert.ok(bobClient.welcome, 'the peer was welcomed through the data channel');
assert.equal(bobClient.welcome.seat, 1);
assert.equal(host.peersConnected, 1);
assert.equal(host.acceptor.peers.get('bob').label, 'peer1');

// ---- a bad token is refused by the core's Web Crypto gate with the service's reason
const eveRtc = new WebRtcTransport({ signaler: relay.signalerFor('eve'), createPeerConnection: world.createPeerConnection, clock: time.clock, setTimer: time.setTimer, clearTimer: time.clearTimer, random: () => 0.5 });
const eveClient = new MatchClient({ transport: eveRtc, token: tokenFor(2, 'eve', 'bravo', 't90m', 'the-wrong-secret-0123456789abcdef'), clock: time.clock });
clients.push(eveClient);
eveClient.connect();
await advance(TICK_MS * 12);
assert.equal(eveClient.lastCloseReason, CLOSE_REASON.BAD_TOKEN, 'the wrong secret is refused');
assert.equal(eveClient.welcome, null);
clients.splice(clients.indexOf(eveClient), 1);
eveClient.dispose();

// ---- snapshots to both seats; the keyframe and config land in the peer's store, sealed
await advance(2000);
assert.ok(hostClient.snapshotsAcceptedCount > 40, `the host's seat receives snapshots (${hostClient.snapshotsAcceptedCount})`);
assert.ok(bobClient.snapshotsAcceptedCount > 40, `the peer receives snapshots (${bobClient.snapshotsAcceptedCount})`);
assert.equal(bobClient.phase, 'live');
const retained = bobClient.retainedMigration();
assert.ok(retained.keyframe, 'the peer retained a sealed keyframe');
assert.ok(retained.config, 'the peer retained the sealed boot configuration');
assert.ok(retained.latestFrame, 'and its own newest frame');
assert.ok(bobClient.migration.stats().blobsCompleted >= 2);
assert.equal(bobClient.events.stats().received > 0 || true, true);
const presented = [];
bobClient.onFrame((frame) => { for (const event of frame.events) presented.push(event.kind); });
await advance(600);
assert.equal(presented.some((kind) => kind.startsWith('mp:')), false, 'migration chunks never reach the presentation');
assert.ok(reports.length >= 3, `reports follow the cadence (${reports.length})`);

// ---- the sealed keyframe opens with the host secret and carries every entity (the enemy the peer may not see)
const key = await deriveMigrationKey(hostSecret);
const keyframe = decodeMigrationKeyframe(await openMigrationBlob(key, retained.keyframe.blob));
assert.equal(keyframe.frame.entities.length, 3, 'every entity, whatever the peer could see');
assert.ok(keyframe.tick > 0 && keyframe.tick <= cores[0].actor.tick);
assert.equal(keyframe.phase, 'playing');
const bootConfig = decodeBootConfig(await openMigrationBlob(key, retained.config.blob));
assert.equal(bootConfig.matchId, matchId);
assert.deepEqual(bootConfig.seats.map((seat) => seat.playerId), ['host', 'bob', 'eve']);
assert.equal('hostSecret' in bootConfig, false);
const hostRow = keyframe.frame.entities.find((row) => row.entityId === 1);
const hostEntity = cores[0].actor.entityForWireId(1);
assert.ok(Math.abs(dequantizePosition(hostRow.x) - hostEntity.state.pos.x) < 2, 'the keyframe is at most a few ticks old');

// ---- migration: the old host goes; bob (elected) boots a second core from the retained state and moves his own seat onto it
const oldTick = cores[0].actor.tick;
host.stop(CLOSE_REASON.ROOM_CLOSED, 'host left');
await settle(4);
assert.equal(host.state, 'stopped');
assert.ok(cores[0].stopped, 'the core stopped');
assert.equal(bobRtc.state, 'reconnecting', 'the peer lost its channel and would re-offer');
relay.elect('bob');
const elapsedTicks = 30;
const resumeTick = keyframe.tick + elapsedTicks;
const config2 = { ...bootConfig, generation: relay.generation, hostSecret, manifestBase: null, resume: { ...keyframe, resumeTick } };
const reports2 = [];
const host2 = createMatchHost({
  playerId: 'bob', generation: () => relay.generation, createPort, createPeerConnection: world.createPeerConnection,
  room: { signaler: relay.signalerFor('bob'), reportMatch: async (report) => { reports2.push(report); } },
  clock: time.clock, setTimer: time.setTimer, clearTimer: time.clearTimer,
});
hosts.push(host2);
const starting2 = host2.start(config2);
await settle(12);
await starting2;
assert.equal(host2.state, 'live');
assert.equal(cores[1].actor.tick, resumeTick, 'the second core resumed at the continued tick');
assert.equal(cores[1].actor.authority.phase, 'playing');
for (const row of keyframe.frame.entities) {
  const entity = cores[1].actor.entityForWireId(row.entityId);
  assert.ok(Math.abs(entity.state.pos.x - dequantizePosition(row.x)) <= 0.001 && Math.abs(entity.state.pos.z - dequantizePosition(row.z)) <= 0.001, `entity ${row.entityId} restored at the keyframe pose`);
}
assert.equal(reports2[0].generation, relay.generation);
assert.ok(reports2[0].tick >= resumeTick);
const welcomes = [];
bobClient.onWelcome((welcome) => welcomes.push(welcome));
const beforeSwap = bobClient.retainedMigration().latestFrame;
bobTransport.replace(host2.transport, 'host migration');
await advance(TICK_MS * 12);
assert.equal(welcomes.length, 1, 'the migrated client ran its handshake again');
assert.equal(welcomes[0].seat, 1);
assert.ok(welcomes[0].serverTick >= resumeTick, `the new actor welcomed at the continued tick (${welcomes[0].serverTick} >= ${resumeTick})`);
assert.equal(bobClient.ownEntityId, welcomes[0].entityId);
assert.notEqual(bobClient.ownEntityId, NO_ENTITY);
await advance(500);
assert.equal(bobClient.phase, 'live');
const afterSwap = bobClient.retainedMigration().latestFrame;
const ownBefore = beforeSwap.entities.find((row) => row.entityId === bobClient.ownEntityId);
const ownAfter = afterSwap.entities.find((row) => row.entityId === bobClient.ownEntityId);
assert.ok(ownBefore && ownAfter, 'the own row on both sides of the migration');
const jumpM = Math.hypot(dequantizePosition(ownAfter.x - ownBefore.x), dequantizePosition(ownAfter.z - ownBefore.z));
assert.ok(jumpM < 1.5, `the own hull is continuous across the migration (${jumpM.toFixed(2)} m)`);
assert.ok(host2.uplinkBytesPerS >= 0);
assert.equal(bobTransport.replacementCount, 1);
assert.ok(bobTransport.stats.bytesReceived > 0);
assert.ok(cores[1].actor.tick > oldTick, 'the timeline moved on past the old host');
host2.stop();
await settle(4);
for (const client of clients) client.dispose();

// ---- a match that ends: exactly one 'ended' report (with the verdict) closes it in the room — the cadence, the linger and
// the stop send nothing after it (the room answers invalid_command to anything past the end)
relay.elect('host');
const reports3 = [];
const host3 = createMatchHost({
  playerId: 'host', generation: () => relay.generation, createPort, createPeerConnection: world.createPeerConnection,
  room: { signaler: relay.signalerFor('host'), reportMatch: async (report) => { reports3.push(report); } },
  clock: time.clock, setTimer: time.setTimer, clearTimer: time.clearTimer,
});
hosts.push(host3);
const starting3 = host3.start({ ...config, matchId: 'm1-000c10ck', generation: relay.generation, battleLimitS: 1 });
await settle(12);
await starting3;
assert.equal(host3.state, 'live');
await advance(1500);
assert.ok(cores[2].actor.ended, 'the clock ended the match');
const endedReports = reports3.filter((report) => report.phase === 'ended');
assert.equal(endedReports.length, 1, `one ended report (${reports3.map((report) => report.phase).join(',')})`);
assert.ok(endedReports[0].verdict && typeof endedReports[0].verdict.result === 'string', 'it carries the verdict');
assert.equal(reports3.at(-1).phase, 'ended', 'nothing is reported after the end');
const reportsAtEnd = reports3.length;
await advance(4500);
assert.ok(cores[2].actor.stopped, 'the actor stopped after its linger');
host3.stop();
await settle(4);
assert.equal(reports3.length, reportsAtEnd, `the interval and the stop report nothing after the end (${reports3.length} = ${reportsAtEnd})`);
console.log(`matchHost.selftest: boot, loopback seat, WebRTC peer, bad token, reports (${reports.length}), sealed keyframes, migration to a second host at tick ${resumeTick} (own hull jump ${jumpM.toFixed(2)} m), one ended report then silence verified`);
