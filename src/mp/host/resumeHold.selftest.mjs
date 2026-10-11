// The resume hold (2026-10-10; matchHostCore.ts RESUME_HOLD_MS): the browser e2e saw "B's hull as C saw it moved 10.8 /
// 12.5 / 17.8 m across the migration". A migrated host started its loop the moment it booted; a hull restored with speed
// (its newest row, captured while it drove) rolled on under the empty input while the peers were still re-offering, so a
// peer's first frame from the new host showed it metres from the last one it saw. Here, in virtual time, on the real host
// runtime and core, alice hosts, bob drives his tank and lets go, carl (bob's ally) watches; alice's host goes, bob is
// elected and resumes from his retained state, and carl comes back late:
//   no hold   — bob's hull coasts on the new actor while carl is away: carl's first row is metres from his last (the defect)
//   hold      — the world stands still until bob and carl are back: carl's first row is where his last was, the hold
//               released on 'seats', and the hull coasts afterwards on every screen
//   timeout   — a seat that never returns: the world moves at RESUME_HOLD_MS anyway
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { signSeatToken } from '../../../server/match/seatToken.ts';
import { MatchClient } from '../match/matchClient.ts';
import { CLOSE_REASON } from '../wire/constants.ts';
import { dequantizePosition, dequantizeVelocity } from '../wire/quantize.ts';
import { MigratingTransport, WebRtcTransport } from '../transport/index.ts';
import { FakeSignalRelay, RtcWorld } from '../transport/rtcDouble.test-support.ts';
import { createHostPortPair } from './hostProtocol.ts';
import { RESUME_HOLD_MS, createMatchHostCore } from './matchHostCore.ts';
import { createMatchHost } from './matchHost.ts';
import { decodeBootConfig, decodeMigrationKeyframe, deriveMigrationKey, openMigrationBlob, resumeHoldSeats, resumeStateFromRetained } from './migrationState.ts';

const TICK_MS = 1000 / 60;
const SEAT_SECRET = 'room-seat-secret-0123456789abcdef';
const matchId = 'm1-0e1d0e1d';
const hostSecret = createHash('sha256').update(`${SEAT_SECRET}:${matchId}`).digest('hex');
const tokenFor = (seat, playerId, team, specId) => signSeatToken(hostSecret, { v: 1, roomId: 'ROOM02', seat, playerId, name: playerId, team, specId, iat: Date.now() - 1000, exp: Date.now() + 3_600_000 });
// alice, bob and carl on one side, close together on the bare height field; dave (the other side, far off) never connects
const seats = [
  { seat: 0, playerId: 'alice', name: 'Alice', team: 'alpha', specId: 'm1a2', spawn: { x: -40, z: 0, yaw: 0 } },
  { seat: 1, playerId: 'bob', name: 'Bob', team: 'alpha', specId: 'm1a2', spawn: { x: 0, z: 0, yaw: 0 } },
  { seat: 2, playerId: 'carl', name: 'Carl', team: 'alpha', specId: 'leo2a7v', spawn: { x: 40, z: 0, yaw: 0 } },
  { seat: 3, playerId: 'dave', name: 'Dave', team: 'bravo', specId: 't90m', spawn: { x: 600, z: 600, yaw: Math.PI } },
];
const roomPlayers = [
  { id: 'alice', connected: false, team: 'alpha' }, // the host that went (its tab closed)
  { id: 'bob', connected: true, team: 'alpha' },
  { id: 'carl', connected: true, team: 'alpha' },
  { id: 'dave', connected: false, team: 'bravo' },
];

async function migrationCase({ label, hold, carlBackAfterMs, holdFor = null }) {
  // ---- virtual time shared by everything
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
  const world = new RtcWorld();
  const relay = new FakeSignalRelay('alice', 1);
  const hosts = [];
  const clients = [];
  const cores = [];
  const settle = async (rounds = 6) => {
    for (let index = 0; index < rounds; index++) {
      await new Promise((resolve) => setImmediate(resolve));
      relay.flush(); world.flush();
      for (const host of hosts) host.pump(nowMs);
    }
  };
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
  const createPort = () => {
    const pair = createHostPortPair();
    cores.push(createMatchHostCore({
      port: pair.worker, buildWorld: async () => 'terrain', now: time.clock, schedule: time.schedule, setTimer: time.setTimer, clearTimer: time.clearTimer,
      keyframeIntervalMs: 500, configIntervalMs: 1500, reportIntervalMs: 2000,
    }));
    return pair.main;
  };
  const rtcFor = (playerId) => new WebRtcTransport({ signaler: relay.signalerFor(playerId), createPeerConnection: world.createPeerConnection, clock: time.clock, setTimer: time.setTimer, clearTimer: time.clearTimer, random: () => 0.5 });
  const idle = () => ({ throttle: 0, steer: 0, brake: false, fire: false, aimLocked: false, aimYaw: 0, aimPitch: 0, aimDistance: 300, shellSlot: 0, actionPresses: 0 });
  let bobDrives = false;

  // ---- alice hosts; her own seat over the loopback, bob and carl through WebRTC
  const config = { roomId: 'ROOM02', matchId, generation: 1, mapId: 'verdant', mode: 'standard', seed: 7, seats, bots: [], countdownS: 0, battleLimitS: 600, hostSecret, manifestBase: null, resume: null };
  const alice = createMatchHost({
    playerId: 'alice', generation: () => relay.generation, createPort, createPeerConnection: world.createPeerConnection,
    room: { signaler: relay.signalerFor('alice'), reportMatch: async () => {} }, clock: time.clock, setTimer: time.setTimer, clearTimer: time.clearTimer,
  });
  hosts.push(alice);
  const starting = alice.start(config);
  await settle(12);
  await starting;
  const aliceClient = new MatchClient({ transport: new MigratingTransport(alice.transport), token: tokenFor(0, 'alice', 'alpha', 'm1a2'), clock: time.clock, controls: idle });
  clients.push(aliceClient);
  aliceClient.connect();
  const bobTransport = new MigratingTransport(rtcFor('bob'));
  const bobClient = new MatchClient({ transport: bobTransport, token: tokenFor(1, 'bob', 'alpha', 'm1a2'), clock: time.clock,
    controls: () => ({ ...idle(), throttle: bobDrives ? 1 : 0 }) });
  clients.push(bobClient);
  bobClient.connect();
  const carlRtc = rtcFor('carl');
  const carlTransport = new MigratingTransport(carlRtc);
  const carlClient = new MatchClient({ transport: carlTransport, token: tokenFor(2, 'carl', 'alpha', 'leo2a7v'), clock: time.clock, controls: idle });
  clients.push(carlClient);
  carlClient.connect();
  await advance(TICK_MS * 30);
  assert.ok(aliceClient.welcome && bobClient.welcome && carlClient.welcome, `${label}: every seat welcomed by alice's actor`);
  const bobId = bobClient.welcome.entityId;

  // ---- bob drives, then lets go; alice's host goes at once (the e2e's order)
  bobDrives = true;
  await advance(3000);
  bobDrives = false;
  await advance(TICK_MS * 2);
  const rowOf = (client) => {
    const frame = client.retainedMigration().latestFrame;
    const row = frame?.entities.find((entry) => entry.entityId === bobId);
    return row ? { tick: frame.tick, x: dequantizePosition(row.x), z: dequantizePosition(row.z), speed: dequantizeVelocity(row.speed) } : null;
  };
  const lastSeenByCarl = rowOf(carlClient);
  const bobOwn = rowOf(bobClient);
  assert.ok(lastSeenByCarl && bobOwn, `${label}: carl and bob both hold bob's row`);
  assert.ok(bobOwn.speed > 4, `${label}: bob's hull is still rolling when the host goes (${bobOwn.speed.toFixed(1)} m/s)`);
  const retained = bobClient.retainedMigration();
  alice.stop(CLOSE_REASON.ROOM_CLOSED, 'host left');
  carlRtc.close(); // carl's link died with the host; he re-offers to the new host later (below)
  await settle(4);

  // ---- bob is elected and resumes from his retained state (MatchSession.becomeHost's arithmetic)
  relay.elect('bob');
  const key = await deriveMigrationKey(hostSecret);
  const keyframe = decodeMigrationKeyframe(await openMigrationBlob(key, retained.keyframe.blob));
  const bootConfig = decodeBootConfig(await openMigrationBlob(key, retained.config.blob));
  const { state, baseTick, baseAtMs } = resumeStateFromRetained(keyframe, retained.keyframe.receivedAtMs, retained.latestFrame, retained.latestFrameAtMs, retained.fallen, retained.destruction ?? []);
  const resumeTick = baseTick + Math.max(0, Math.ceil((nowMs - baseAtMs) / TICK_MS)) + 120;
  const holdForSeats = holdFor ?? resumeHoldSeats(roomPlayers, bootConfig.seats, 'alice');
  const resume = { ...state, resumeTick, ...(hold ? { holdForSeats } : {}) };
  const bob = createMatchHost({
    playerId: 'bob', generation: () => relay.generation, createPort, createPeerConnection: world.createPeerConnection,
    room: { signaler: relay.signalerFor('bob'), reportMatch: async () => {} }, clock: time.clock, setTimer: time.setTimer, clearTimer: time.clearTimer,
  });
  hosts.push(bob);
  const starting2 = bob.start({ ...bootConfig, generation: relay.generation, hostSecret, manifestBase: null, resume });
  await settle(12);
  await starting2;
  const core = cores[1];
  const hullOnBob = () => core.actor.entityForWireId(bobId).state;
  const restored = { x: hullOnBob().pos.x, z: hullOnBob().pos.z };
  assert.ok(Math.hypot(restored.x - bobOwn.x, restored.z - bobOwn.z) < 0.6, `${label}: bob's hull restored from his own newest row`);
  bobTransport.replace(bob.transport, 'host migration');

  // ---- carl comes back late
  const tickBeforeCarl = core.actor.tick;
  await advance(carlBackAfterMs);
  const whileAway = { tick: core.actor.tick, movedM: Math.hypot(hullOnBob().pos.x - restored.x, hullOnBob().pos.z - restored.z) };
  const carlBefore = carlClient.snapshotsAcceptedCount;
  carlTransport.replace(rtcFor('carl'), 'host migration');
  for (let n = 0; n < 120 && carlClient.snapshotsAcceptedCount === carlBefore; n++) await advance(TICK_MS);
  assert.ok(carlClient.snapshotsAcceptedCount > carlBefore, `${label}: carl receives frames from bob's actor`);
  const firstSeenByCarl = rowOf(carlClient);
  const jumpM = Math.hypot(firstSeenByCarl.x - lastSeenByCarl.x, firstSeenByCarl.z - lastSeenByCarl.z);
  await advance(2000);
  const afterM = Math.hypot(hullOnBob().pos.x - restored.x, hullOnBob().pos.z - restored.z);
  const holdStats = core.stats().resumeHold;
  for (const client of clients) client.dispose();
  bob.stop();
  await settle(4);
  return { label, speed: bobOwn.speed, resumeTick, tickBeforeCarl, whileAway, jumpM, afterM, holdStats };
}

// ---- the hold list: connected seats with a battle seat, the elected one among them, the host that went never
assert.deepEqual(resumeHoldSeats(roomPlayers, seats, 'alice'), ['bob', 'carl']);
assert.deepEqual(resumeHoldSeats([...roomPlayers.slice(0, 3), { id: 'spec', connected: true, team: 'spectator' }], seats, 'alice'), ['bob', 'carl'], 'spectators are not awaited');
assert.deepEqual(resumeHoldSeats([{ id: 'alice', connected: true, team: 'alpha' }, ...roomPlayers.slice(1)], seats, 'alice'), ['bob', 'carl'], 'a silent host that kept its room socket is not awaited');
assert.deepEqual(resumeHoldSeats([...roomPlayers, { id: 'zed', connected: true, team: 'alpha' }], seats, 'alice'), ['bob', 'carl'], 'only seats of the boot plan');

// ---- no hold (the pre-fix order): the hull coasts while carl is away; carl's first row is metres off his last
const plain = await migrationCase({ label: 'no hold', hold: false, carlBackAfterMs: 2000 });
assert.equal(plain.holdStats, null, 'no resume hold without awaited seats');
assert.ok(plain.whileAway.tick > plain.resumeTick + 60, `no hold: the new world ran while carl was away (${plain.whileAway.tick} vs ${plain.resumeTick})`);
assert.ok(plain.whileAway.movedM > 2, `no hold: bob's hull coasted ${plain.whileAway.movedM.toFixed(2)} m on the new actor before carl was back`);
assert.ok(plain.jumpM > 2, `no hold: carl's first row of bob is ${plain.jumpM.toFixed(2)} m from his last (the e2e's jump)`);

// ---- the hold: the world stands still until bob and carl are back, then the hull coasts on every screen
const held = await migrationCase({ label: 'hold', hold: true, carlBackAfterMs: 2000 });
assert.equal(held.tickBeforeCarl, held.resumeTick, 'hold: the new actor sits at the resume tick');
assert.equal(held.whileAway.tick, held.resumeTick, 'hold: the world does not tick while carl is away');
assert.ok(held.whileAway.movedM < 0.01, `hold: bob's hull stands still while carl is away (${held.whileAway.movedM.toFixed(3)} m)`);
// carl's last row trails bob's own newest (the overlay the hull was restored from) by at most one snapshot interval of driving
const oneIntervalM = held.speed / 20 * 1.5 + 0.15;
assert.ok(held.jumpM < oneIntervalM, `hold: carl's first row of bob is where his last was (${held.jumpM.toFixed(2)} m, under one snapshot interval of driving ${oneIntervalM.toFixed(2)} m; without the hold ${plain.jumpM.toFixed(2)} m)`);
assert.ok(held.afterM > 2, `hold: the hull coasts once the world moves (${held.afterM.toFixed(2)} m)`);
assert.equal(held.holdStats.released, 'seats', 'hold: released when every awaited seat was back');
assert.equal(held.holdStats.awaited, 2);
assert.equal(held.holdStats.arrived, 2);
assert.ok(held.holdStats.heldMs >= 1900 && held.holdStats.heldMs < RESUME_HOLD_MS, `hold: held for carl's return (${held.holdStats.heldMs} ms)`);

// ---- a seat that never returns: the world moves at RESUME_HOLD_MS
const late = await migrationCase({ label: 'timeout', hold: true, carlBackAfterMs: RESUME_HOLD_MS + 1000 });
assert.equal(late.holdStats.released, 'timeout', 'timeout: the hold ends at RESUME_HOLD_MS');
assert.equal(late.holdStats.arrived, 1, 'timeout: bob was back, carl was not');
assert.ok(Math.abs(late.holdStats.heldMs - RESUME_HOLD_MS) <= 20, `timeout: held ${late.holdStats.heldMs} ms`);
assert.ok(late.whileAway.tick > late.resumeTick, 'timeout: the world moved without carl');

console.log(`resumeHold.selftest: bob let go at ${held.speed.toFixed(1)} m/s; carl's first row of bob after 2 s away: ${plain.jumpM.toFixed(2)} m without the hold, ${held.jumpM.toFixed(2)} m with it (held ${held.holdStats.heldMs} ms, released on seats); a seat that never returns: released at ${late.holdStats.heldMs} ms`);
