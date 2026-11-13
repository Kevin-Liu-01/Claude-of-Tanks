// Proof (implicit state machine audit M1, 2026-11-02): the resume hold and the seats' stall clocks. A migrated host
// holds its world, and the HELLOs of the seats it awaits, for up to RESUME_HOLD_MS after a boot of 3.4-4.3 s
// (unprepared); each returning seat's 5 s stall clock ran from the moment its link to the new host opened, about the
// election, so one missing seat could push every other seat into a fresh link during the hold. And a seat counted as
// back was never un-counted when its link closed, so the hold could release for a seat that had gone; a held link's
// frames queued with no count bound.
//   - recovery: before the WELCOME on a link to a newly elected host the clock allows the hold; after the WELCOME it runs
//     from the WELCOME (the hold's end); a plain link stalls at 5 s as before;
//   - client: a seat whose session followed the host change (migration.setGeneration) and whose new link is held
//     unanswered does not ask for a fresh link inside stall + hold; once welcomed it waits stall from the WELCOME;
//   - core: a held seat whose link closes is no longer back (the hold waits on), one back again releases it, and a held
//     link keeps at most 64 frames.
// Round 2 (Q1, 2026-11-04): the allowance was RESUME_HOLD_MS from the link's open, which is about the election, before
// the new host's boot: a boot slower than the stall clock's slack (a slower device) pushed every held seat into a fresh
// link during the hold. It is the host's boot bound and its hold now (recovery.ts MIGRATION_WELCOME_ALLOWANCE_MS): a seat
// whose new host boots for 10 s and then holds 3 s waits for its WELCOME without asking for a fresh link.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as recoveryModule from '../match/recovery.ts';
import { MatchClient } from '../match/matchClient.ts';
import { MigratingTransport, createLoopbackPair } from '../transport/index.ts';
import { encodeMessage } from '../wire/codec.ts';
import { INPUT_MARGIN_UNKNOWN, MESSAGE_TYPE, NO_ENTITY, NO_SEAT, NO_TICK, PHASE, PROTOCOL_VERSION, SNAPSHOT_HZ, TEAM, TICK_HZ, TICK_MS, VERDICT } from '../wire/constants.ts';
import { signSeatToken } from '../../../server/match/seatToken.ts';
import { createHostPortPair } from './hostProtocol.ts';
import { createMatchHostCore } from './matchHostCore.ts';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';

const { ConnectionRecovery } = recoveryModule;
const RESUME_HOLD_MS = recoveryModule.RESUME_HOLD_MS ?? 3_000;
const WELCOME_ALLOWANCE_MS = recoveryModule.MIGRATION_WELCOME_ALLOWANCE_MS ?? RESUME_HOLD_MS;
const STALL_MS = 5_000;

// ---- the recovery policy alone
{
  const stallAt = (input, untilMs = 20_000) => {
    const recovery = new ConnectionRecovery();
    for (let nowMs = 0; nowMs <= untilMs; nowMs += 50) {
      if (recovery.update({ transportState: 'open', lastAuthorityAtMs: null, openedAtMs: 0, ...input(nowMs), nowMs }).requestReconnect) return nowMs;
    }
    return null;
  };
  assert.equal(stallAt(() => ({ welcomed: false })), STALL_MS, 'a plain link with no WELCOME stalls at 5 s, as before');
  assert.equal(stallAt(() => ({ welcomed: false, holdAllowanceMs: RESUME_HOLD_MS })), STALL_MS + RESUME_HOLD_MS, 'a link to a newly elected host allows its resume hold before the WELCOME');
  assert.equal(stallAt((nowMs) => (nowMs >= 7_000 ? { welcomed: true, welcomedAtMs: 7_000, holdAllowanceMs: RESUME_HOLD_MS } : { welcomed: false, holdAllowanceMs: RESUME_HOLD_MS })),
    7_000 + STALL_MS, 'welcomed as the hold ends: the clock runs from the WELCOME');
}

// ---- a seat's client against a new host that holds its HELLO
{
  const run = ({ hostChanged, welcomeAtMs = null }) => {
    let nowMs = 1_000;
    const clock = () => nowMs;
    const old = createLoopbackPair({ clock });
    old.server.open();
    const migrating = new MigratingTransport(old.client);
    const client = new MatchClient({ transport: migrating, token: 'seat-token', clock });
    let stalledAt = null;
    client.onPhase((phase) => { if (phase === 'stalled' && stalledAt === null) stalledAt = nowMs; });
    client.connect();
    old.pump(nowMs);
    // the old host goes; the session follows the room's host change, then the seat's link moves to the new host
    if (hostChanged) client.migration.setGeneration(2);
    const next = createLoopbackPair({ clock });
    next.server.open();
    const openedAt = nowMs;
    migrating.replace(next.client, 'host changed');
    for (let step = 0; step < 1000 && stalledAt === null; step++) {
      nowMs += 50;
      if (welcomeAtMs !== null && nowMs - openedAt === welcomeAtMs) {
        next.server.send(encodeMessage({
          type: MESSAGE_TYPE.WELCOME, protocolVersion: PROTOCOL_VERSION, tickHz: TICK_HZ, snapshotHz: SNAPSHOT_HZ, seat: NO_SEAT, entityId: NO_ENTITY,
          team: TEAM.SPECTATOR, serverTick: 600, serverTimeMs: Math.round(600 * TICK_MS), seed: 1, capabilities: 0, roomId: 'HOLD01', mapId: 'verdant',
          mode: 'standard', rulesetJson: '{"mode":"standard"}', roster: [],
        }));
      }
      next.pump(nowMs);
      client.update(nowMs, 0.05);
    }
    client.dispose();
    return stalledAt === null ? null : stalledAt - openedAt;
  };
  assert.equal(run({ hostChanged: false }), STALL_MS, 'a reconnect to the same host stalls at 5 s');
  const held = run({ hostChanged: true });
  assert.ok(held !== null && held >= STALL_MS + WELCOME_ALLOWANCE_MS, `a held seat asks for no fresh link inside stall + its new host's boot and hold (stalled ${held} ms after its link opened; the allowance is ${WELCOME_ALLOWANCE_MS} ms)`);
  const welcomed = run({ hostChanged: true, welcomeAtMs: 7_000 });
  assert.equal(welcomed, 7_000 + STALL_MS, 'welcomed at the hold\'s end, it waits stall from the WELCOME for its first snapshot');
  // round 2 (Q1): a slow boot (10 s) and then the whole hold (3 s): welcomed 13 s after its link opened
  const slow = run({ hostChanged: true, welcomeAtMs: 13_000 });
  assert.equal(slow, 13_000 + STALL_MS, `a seat whose new host boots slowly waits for its WELCOME, then stall from it (it asked for a fresh link ${slow} ms after its link opened, inside the hold)`);
}

// ---- the core's hold: a seat whose link closed is not back; a held link's frames are bounded
{
  const seats = [
    { seat: 0, playerId: 'alice', name: 'Alice', team: 'alpha', specId: 'm1a1_abrams_hc', spawn: { x: -30, z: 0, yaw: 0 } },
    { seat: 1, playerId: 'bob', name: 'Bob', team: 'bravo', specId: 't90am', spawn: { x: 30, z: 0, yaw: Math.PI } },
  ];
  await ensureAuthorityFleet(seats.map((seat) => seat.specId));
  const hostSecret = createHash('sha256').update('resume-hold-clocks').digest('hex');
  const hello = (seat) => encodeMessage({ type: MESSAGE_TYPE.HELLO, protocolVersion: PROTOCOL_VERSION, capabilities: 0, clientBuild: 'hold',
    token: signSeatToken(hostSecret, { v: 1, roomId: 'HOLD01', seat: seat.seat, playerId: seat.playerId, name: seat.name, team: seat.team, specId: seat.specId, iat: Date.now() - 1000, exp: Date.now() + 3_600_000 }) });
  const ping = encodeMessage({ type: MESSAGE_TYPE.PING, clientTimeMs: 1, snapshotAckTick: NO_TICK });
  const pair = createHostPortPair();
  const posted = [];
  pair.main.onMessage((message) => posted.push(message));
  const core = createMatchHostCore({ port: pair.worker, buildWorld: async () => 'terrain', now: () => 0, schedule: () => () => {}, setTimer: () => 0, clearTimer: () => {} });
  // a resume with no rows (every hull on its spawn) at tick 300, both seats awaited
  const frame = { tick: 300, serverTimeMs: 5000, ackedInputTick: NO_TICK, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: INPUT_MARGIN_UNKNOWN,
    meta: { phase: PHASE.PLAYING, countdownMs: 0, battleTimeMs: 5000, verdict: VERDICT.NONE, verdictReason: '', destructibleRevision: 0 },
    destroyed: [], destruction: [], entities: [], shells: [], viewer: null, modeStateJson: null };
  pair.main.post({ type: 'boot', config: { roomId: 'HOLD01', matchId: 'm1-00h0ld00', generation: 2, mapId: 'verdant', mode: 'standard', seed: 3, seats, bots: [], countdownS: 0, battleLimitS: 600, hostSecret, manifestBase: null,
    resume: { tick: 300, battleTimeMs: 5000, phase: 'playing', frame, entities: [], resumeTick: 300, holdForSeats: ['alice', 'bob'] } } });
  const settle = async (rounds = 40) => { for (let n = 0; n < rounds; n++) await new Promise((resolve) => setImmediate(resolve)); };
  for (let n = 0; n < 400 && !core.actor; n++) await settle(1);
  assert.ok(core.actor, 'the core booted');
  const send = (peer, bytes) => pair.main.post({ type: 'link_frame', peer, bytes: bytes.slice().buffer });
  pair.main.post({ type: 'link_open', peer: 1, label: 'alice', playerId: 'alice' });
  send(1, hello(seats[0]));
  await settle();
  assert.equal(core.stats().resumeHold.arrived, 1, 'alice is back and held');
  pair.main.post({ type: 'link_close', peer: 1 });
  await settle(4);
  assert.equal(core.stats().resumeHold.arrived, 0, 'alice\'s link closed: she is no longer back');
  pair.main.post({ type: 'link_open', peer: 2, label: 'bob', playerId: 'bob' });
  send(2, hello(seats[1]));
  await settle();
  for (let n = 0; n < 100; n++) send(2, ping);
  await settle(4);
  assert.equal(core.stats().resumeHold.released, null, 'the hold waits for alice (before: released on "seats" for a seat that had gone)');
  assert.equal(core.actor.loop.running, false, 'the world is still held');
  pair.main.post({ type: 'link_open', peer: 3, label: 'alice', playerId: 'alice' });
  send(3, hello(seats[0]));
  await settle();
  assert.equal(core.stats().resumeHold.released, 'seats', 'alice back on a new link: the hold releases');
  assert.equal(core.stats().resumeHold.arrived, 2);
  assert.equal(core.actor.loop.running, true);
  const bob = core.actor.clientStats().find((entry) => entry.playerId === 'bob');
  assert.ok(bob, 'bob is welcomed at the release');
  assert.equal(bob.bytesIn, 64 * ping.byteLength, `a held link keeps 64 frames (bob's 100 pings delivered ${bob.bytesIn / ping.byteLength})`);
  assert.ok(posted.some((message) => message.type === 'link_send' && message.peer === 3), 'alice is welcomed on her new link');
  core.dispose();
  pair.main.close();
}
console.log('resumeHoldClocks: a held seat\'s stall clock allows the resume hold and restarts at its WELCOME; a seat whose link closed is not counted back; held frames are bounded');
