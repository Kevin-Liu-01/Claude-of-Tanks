import assert from 'node:assert/strict';
import { MOVEMENT_CHECKPOINT_VERSION } from '../../src/mp/match/movementCheckpoint.ts';
import {
  CLOSE_REASON, CONTROL_FLAGS, MESSAGE_TYPE, NO_ENTITY, NO_TICK, PHASE, PROTOCOL_VERSION, TEAM, VERDICT,
} from '../../src/mp/wire/constants.ts';
import { applySnapshotPacket, decodeMessage, encodeMessage } from '../../src/mp/wire/codec.ts';
import { quantizeAimDistance, quantizeAngle } from '../../src/mp/wire/quantize.ts';
import { createLoopbackLink } from './link.ts';
import { createMatchActor } from './matchActor.ts';

const TICK_MS = 1000 / 60;
let nowMs = 10_000;
const now = () => nowMs;
const schedule = () => () => {};
const flush = () => new Promise((resolve) => setImmediate(resolve));

/** A headless client over the loopback: decodes everything, keeps frames by tick, records closes. */
function createHeadlessClient(actor, seat, playerId, { ackDelayMs = 0 } = {}) {
  const link = createLoopbackLink(playerId);
  const client = {
    playerId, seat, link, welcome: null, frames: [], packets: [], events: [], errors: [], pongs: [],
    closed: null, missingBaselines: 0, history: new Map(), pendingAcks: [],
    latestTick: NO_TICK,
    send(message) { link.client.send(encodeMessage(message)); },
    /** The newest tick this client has assembled, delayed by ackDelayMs to emulate a real path. */
    ackTick() {
      while (client.pendingAcks.length && client.pendingAcks[0].at <= nowMs) client.latestTick = client.pendingAcks.shift().tick;
      return client.latestTick;
    },
  };
  link.client.onMessage((bytes) => {
    const decoded = decodeMessage(bytes, { resolveBaseline: (tick) => client.history.get(tick) ?? null });
    assert.ok(decoded.ok, `client ${playerId} decodes every server frame (${decoded.ok ? '' : decoded.error.code})`);
    const message = decoded.message;
    switch (message.type) {
      case MESSAGE_TYPE.WELCOME: client.welcome = message; break;
      case MESSAGE_TYPE.SNAPSHOT: {
        client.packets.push(message);
        let frame;
        try {
          frame = applySnapshotPacket(message, message.keyframe ? null : client.history.get(message.baseTick) ?? null);
        } catch (error) {
          if (error?.code === 'missing_baseline') { client.missingBaselines++; return; }
          throw error;
        }
        client.frames.push(frame);
        client.history.set(frame.tick, frame);
        if (client.history.size > 64) client.history.delete(client.history.keys().next().value);
        client.pendingAcks.push({ tick: frame.tick, at: nowMs + ackDelayMs });
        break;
      }
      case MESSAGE_TYPE.EVENT: client.events.push(...message.events.map((event) => ({ ...event, tick: message.tick }))); break;
      case MESSAGE_TYPE.ERROR: client.errors.push(message); break;
      case MESSAGE_TYPE.PONG: client.pongs.push(message); break;
      case MESSAGE_TYPE.CLOSE: client.closed = message; break;
      default: assert.fail(`unexpected server message type ${message.type}`);
    }
  });
  link.client.onClose((reason, detail) => { client.closed ??= { reason, detail }; });
  const hello = { type: MESSAGE_TYPE.HELLO, protocolVersion: PROTOCOL_VERSION, capabilities: 1, token: 'issued-elsewhere', clientBuild: 'selftest' };
  const claims = { v: 1, roomId: actor.roomId, seat, playerId, name: playerId, team: 'alpha', specId: 'm1a2', iat: 0, exp: 1 };
  client.attached = actor.attach(link.server, hello, claims);
  return client;
}

const control = (overrides = {}) => ({
  throttle: 0, steer: 0, flags: 0, aimYaw: quantizeAngle(0), aimPitch: 0, aimDistance: quantizeAimDistance(500),
  shellSlot: 0, fireSeq: 0, actionSeq: 0, actionBits: 0, ...overrides,
});

async function advanceTicks(actor, ticks, perTick = null) {
  for (let n = 0; n < ticks; n++) {
    nowMs += TICK_MS;
    if (perTick) perTick(actor.tick + 1);
    actor.advance(nowMs);
    await flush();
  }
}

// ---------------------------------------------------------------- the room
const verdicts = [];
const actor = createMatchActor({
  roomId: 'room-actor-test', mapId: 'verdant', seed: 4242, countdownS: 0.5, world: 'terrain', now, schedule,
  seats: [
    { seat: 0, playerId: 'p1', name: 'One', team: 'alpha', specId: 'm1a2' },
    { seat: 1, playerId: 'p2', name: 'Two', team: 'alpha', specId: 'm1a2' },
    { seat: 2, playerId: 'p3', name: 'Three', team: 'bravo', specId: 't90m' },
    { seat: 3, playerId: 'p4', name: 'Four', team: 'bravo', specId: 't90m' },
    { seat: 9, playerId: 's1', name: 'Watcher', team: 'spectator', specId: '' },
  ],
  bots: [
    { playerId: 'bot-a', name: 'Bot A', team: 'alpha', specId: 'leo2a7v' },
    { playerId: 'bot-b', name: 'Bot B', team: 'bravo', specId: 'leo2a7v' },
  ],
  onVerdict: (verdict) => verdicts.push(verdict),
});
assert.equal(actor.authority.entities.length, 6);
assert.equal(actor.loop.running, true);

const p1 = createHeadlessClient(actor, 0, 'p1', { ackDelayMs: 100 });
const p2 = createHeadlessClient(actor, 1, 'p2');
const p3 = createHeadlessClient(actor, 2, 'p3');
const p4 = createHeadlessClient(actor, 3, 'p4');
const s1 = createHeadlessClient(actor, 9, 's1');
await flush();
for (const client of [p1, p2, p3, p4, s1]) {
  assert.equal(client.attached, true);
  assert.ok(client.welcome, `${client.playerId} welcomed`);
  assert.equal(client.welcome.roster.length, 6, 'the roster lists every entity: four seats and two bots');
  assert.equal(client.welcome.seat, client.seat);
  assert.equal(client.welcome.mapId, 'verdant');
  assert.equal(JSON.parse(client.welcome.rulesetJson).mode, 'standard');
}
assert.equal(p1.welcome.entityId, 1);
assert.equal(p3.welcome.team, TEAM.BRAVO);
assert.equal(s1.welcome.entityId, NO_ENTITY);
assert.equal(s1.welcome.team, TEAM.SPECTATOR);
assert.deepEqual(p1.welcome.roster.filter((row) => row.bot).map((row) => row.playerId), ['bot-a', 'bot-b']);
assert.ok(p2.events.some((event) => event.kind === 'roster' && event.payload.playerId === 'p3' && event.payload.connected === true), 'roster events announce joins');
console.log('matchActor.selftest: five clients welcomed with the full roster, seats, teams and ruleset');

// ---------------------------------------------------------------- inputs, cadence, deltas, interest
let fireSeq = 0;
const driveP1 = (tick) => {
  const frames = [control({ throttle: 127, fireSeq }), control({ throttle: 127, fireSeq }), control({ throttle: 127, fireSeq })];
  p1.send({ type: MESSAGE_TYPE.INPUT, clientTick: tick + 2, snapshotAckTick: p1.ackTick(), interpDelayMs: 100, controls: frames });
  for (const other of [p2, p3, p4]) {
    if (other.closed) continue;
    other.send({ type: MESSAGE_TYPE.INPUT, clientTick: tick + 2, snapshotAckTick: other.ackTick(), interpDelayMs: 67, controls: [control({ flags: CONTROL_FLAGS.BRAKE })] });
  }
};
await advanceTicks(actor, 180, driveP1);
const p1Entity = actor.authority.entityById.get('p1');
assert.ok(p1Entity.state.speed > 1, `p1 drives under its own input (${p1Entity.state.speed.toFixed(2)} m/s)`);
assert.equal(actor.authority.entityById.get('p2').state.speed < 0.2, true, 'a braking client stays put');
for (const client of [p1, p2, p3, p4, s1]) {
  const expected = 90;
  assert.ok(Math.abs(client.frames.length - expected) <= 2, `${client.playerId}: ${client.frames.length} snapshots in 3 s (30 Hz)`);
  assert.equal(client.missingBaselines, 0, `${client.playerId} never needed a missing baseline`);
  assert.equal(client.packets[0].keyframe, true, 'the first snapshot is a keyframe');
}
const keyframes = p1.packets.filter((packet) => packet.keyframe).length;
// every snapshot before the first (100 ms late) acknowledgement is a keyframe, then one every two seconds
const settledKeyframes = p1.packets.slice(8).filter((packet) => packet.keyframe).length;
assert.ok(keyframes >= 2 && keyframes <= 6, `keyframes until the first ack, then every two seconds (${keyframes} in 3 s)`);
assert.ok(settledKeyframes >= 1 && settledKeyframes <= 2, `after the first ack, keyframes come every two seconds (${settledKeyframes})`);
assert.ok(p1.packets.filter((packet) => !packet.keyframe).length >= 80, 'the rest are deltas against the acknowledged baseline');
assert.equal(p2.packets.filter((packet) => packet.keyframe).length, 2, 'an immediately acknowledging client sees exactly the two-second keyframes');
const latest = p1.frames.at(-1);
assert.ok(latest.ackedInputTick !== NO_TICK && latest.ackedInputTick >= actor.tick - 4, `input acknowledged (${latest.ackedInputTick} vs ${actor.tick})`);
assert.ok(latest.inputMarginTicks >= 0 && latest.inputMarginTicks <= 3, `input margin reported (${latest.inputMarginTicks})`);
assert.ok(latest.viewer && latest.viewer.entityId === 1 && latest.viewer.movementVersion === MOVEMENT_CHECKPOINT_VERSION, 'the seated viewer gets its prediction section');
assert.equal(s1.frames.at(-1).viewer, null, 'a spectator gets none');
assert.equal(latest.meta.phase, PHASE.PLAYING);
const ownRow = latest.entities.find((row) => row.entityId === 1);
assert.ok(ownRow && ownRow.speed > 100, 'own row carries the live speed');
assert.ok(latest.entities.some((row) => row.entityId === 2) && latest.entities.some((row) => row.entityId === 5), 'teammates and the allied bot are always present');
// interest management: the wire carries exactly the authority's visibility set for the viewer
{
  const oracle = actor.authority.snapshot({ tick: actor.tick, serverTimeMs: 0, viewerId: 'p1', ackInputSeq: null });
  const oracleIds = new Set(oracle.entities.map((row) => p1.welcome.roster.find((entry) => entry.playerId === row.id).entityId));
  assert.deepEqual(new Set(latest.entities.map((row) => row.entityId)), oracleIds, 'hidden enemies are absent from the wire');
  assert.equal(s1.frames.at(-1).entities.length, 6, 'a spectator sees both teams');
}
// server-measured latency feeds the rewind budget: p1 acks 100 ms late and interpolates at 100 ms -> ~9 ticks
const p1Stats = actor.clientStats().find((entry) => entry.playerId === 'p1');
assert.ok(p1Stats.rttMs >= 90 && p1Stats.rttMs <= 140, `server measured p1's round trip (${p1Stats.rttMs.toFixed(1)} ms)`);
assert.ok(p1Stats.rewindTicks >= 8 && p1Stats.rewindTicks <= 10, `rewind budget from owd + interpolation (${p1Stats.rewindTicks} ticks)`);
// the authority's reveal rules: phase changes reach seated viewers through snapshot meta, spectators see every event
assert.ok(s1.events.some((event) => event.kind === 'match_started'), 'reliable events reach the spectator');
assert.ok(p1.events.some((event) => event.kind === 'roster' && event.payload.playerId === 'p4'), 'reliable events reach the seated client');
assert.ok(p1.frames.some((frame) => frame.meta.phase === PHASE.COUNTDOWN) && latest.meta.phase === PHASE.PLAYING, 'the phase rides the snapshot meta');
console.log(`matchActor.selftest: 30 Hz cadence, ${keyframes} keyframes / ${p1.packets.length - keyframes} deltas, acks, margin ${latest.inputMarginTicks}, rewind ${p1Stats.rewindTicks} ticks`);

// ---------------------------------------------------------------- keyframe request: a NO_TICK acknowledgement drops the baseline
{
  const packetsBefore = p2.packets.length;
  p2.send({ type: MESSAGE_TYPE.SNAPSHOT_ACK, tick: NO_TICK });
  await flush();
  // p2 keeps acknowledging its held frames in its INPUT stream: the latched request still wins
  await advanceTicks(actor, 2, driveP1);
  const fresh = p2.packets.slice(packetsBefore);
  assert.ok(fresh.length >= 1 && fresh[0].keyframe, 'the next snapshot after a NO_TICK ack is a keyframe');
  await advanceTicks(actor, 4, driveP1);
  assert.ok(p2.packets.slice(packetsBefore + 1).every((packet) => !packet.keyframe), 'then deltas resume against the new baseline');
  assert.equal(p2.missingBaselines, 0);
  console.log('matchActor.selftest: a NO_TICK acknowledgement requests a keyframe at once');
}

// ---------------------------------------------------------------- fire: an edge fires once and shells appear on the wire
fireSeq = 1;
await advanceTicks(actor, 30, driveP1);
const fired = p1.events.filter((event) => event.kind === 'shell_fired' && event.payload.shooterId === 'p1');
assert.equal(fired.length, 1, `one trigger press fires exactly one shell (${fired.length})`);
assert.ok(p1.frames.slice(-30).some((frame) => frame.shells.some((shell) => shell.shooterEntityId === 1)), 'the shell rides the snapshot');
assert.equal(p1.frames.at(-1).ackedFireSeq, 1);
console.log('matchActor.selftest: a fire edge fires once, acknowledged by sequence, shells on the wire');

// ---------------------------------------------------------------- chat, malformed, rejected input classes
p1.send({ type: MESSAGE_TYPE.CHAT, text: '  push ​ left  ' });
await flush();
for (const client of [p2, p3, s1]) {
  const chat = client.events.find((event) => event.kind === 'chat');
  assert.ok(chat && chat.payload.text === 'push left' && chat.payload.playerId === 'p1', `${client.playerId} receives normalized chat`);
}
p1.send({ type: MESSAGE_TYPE.CHAT, text: 'again' });
await flush();
assert.ok(p1.errors.some((error) => error.reason === CLOSE_REASON.CHAT_REJECTED), 'chat cooldown rejects the immediate repeat');
p1.link.client.send(new Uint8Array([1, 2, 3]));
await flush();
assert.ok(p1.errors.some((error) => error.reason === CLOSE_REASON.MALFORMED), 'malformed frames answer with a typed error');
s1.send({ type: MESSAGE_TYPE.INPUT, clientTick: actor.tick, snapshotAckTick: NO_TICK, interpDelayMs: 0, controls: [control()] });
await flush();
assert.ok(s1.errors.some((error) => error.reason === CLOSE_REASON.NOT_SEATED), 'spectator input is refused');
p2.send({ type: MESSAGE_TYPE.INPUT, clientTick: actor.tick + 1000, snapshotAckTick: NO_TICK, interpDelayMs: 0, controls: [control()] });
await flush();
assert.ok(p2.errors.some((error) => error.reason === CLOSE_REASON.INPUT_TOO_FAR_AHEAD), 'far-ahead input is rejected');
p2.send({ type: MESSAGE_TYPE.PING, clientTimeMs: 1234, snapshotAckTick: p2.ackTick() });
await flush();
assert.ok(p2.pongs.some((pong) => pong.clientTimeMs === 1234 && pong.serverTick === actor.tick), 'ping is answered with the server tick');
assert.ok(!p1.closed && !p2.closed && !s1.closed, 'rejections never close the link');
console.log('matchActor.selftest: chat normalized and rate-limited; malformed, spectator and far-ahead inputs rejected without closing');

// ---------------------------------------------------------------- backpressure: drop the stale snapshot, then close when sustained
p4.link.client.pressure = 100 * 1024;
const p4Before = p4.frames.length;
await advanceTicks(actor, 30, driveP1);
assert.equal(p4.frames.length, p4Before, 'a congested client receives no queued-behind snapshots');
assert.ok(actor.clientStats().find((entry) => entry.playerId === 'p4').droppedSnapshots >= 10, 'dropped snapshots are counted');
assert.ok(p3.frames.length > p4.frames.length, 'other clients are unaffected');
await advanceTicks(actor, 150, driveP1);
assert.ok(p4.closed && p4.closed.reason === CLOSE_REASON.BACKPRESSURE, `sustained pressure closes with a typed reason (${p4.closed?.reason})`);
p3.link.client.pressure = 600 * 1024;
await advanceTicks(actor, 4, driveP1);
assert.ok(p3.closed && p3.closed.reason === CLOSE_REASON.BACKPRESSURE, 'the hard bound closes immediately');
assert.equal(actor.stats().backpressureCloses, 2);
assert.ok(p2.events.some((event) => event.kind === 'roster' && event.payload.playerId === 'p4' && event.payload.connected === false), 'departures are announced');
console.log('matchActor.selftest: backpressure drops stale snapshots, then closes sustained or hard-bound clients');

// ---------------------------------------------------------------- seat replacement and leave; the match keeps running
const p2b = createHeadlessClient(actor, 1, 'p2');
await flush();
assert.ok(p2.closed && p2.closed.reason === CLOSE_REASON.REPLACED, 'a reconnecting seat replaces the old link');
assert.ok(p2b.welcome && p2b.welcome.entityId === 2);
await advanceTicks(actor, 30, driveP1);
assert.ok(p2b.frames.length >= 13, 'the replacement receives snapshots');
p2b.send({ type: MESSAGE_TYPE.LEAVE, reason: CLOSE_REASON.CLIENT_LEAVE });
await flush();
assert.ok(p2b.closed && p2b.closed.reason === CLOSE_REASON.CLIENT_LEAVE);
const tickBefore = actor.tick;
await advanceTicks(actor, 60, driveP1);
assert.equal(actor.tick, tickBefore + 60, 'departures never stall the tick');
assert.equal(actor.authority.entityById.get('p2').input.brake, true, 'a departed seat goes neutral');
assert.ok(p1.frames.at(-1).tick > tickBefore, 'remaining clients keep receiving');
const stats = actor.stats();
assert.equal(stats.clients, 2);
assert.equal(stats.tickMs.count, actor.tick);
assert.ok(stats.lagComp.rewoundShots >= 1, `lag compensation wrapped the fired shell (${stats.lagComp.rewoundShots})`);
console.log(`matchActor.selftest: replace + leave handled, match continues (tick ${actor.tick}); rewound shots ${stats.lagComp.rewoundShots}, mismatch mean ${stats.lagComp.mismatchMeanM.toFixed(2)} m`);
actor.stop();
await flush();
assert.equal(actor.stopped, true);
assert.ok(p1.closed && p1.closed.reason === CLOSE_REASON.ROOM_CLOSED, 'stop closes the remaining clients with ROOM_CLOSED');

// ---------------------------------------------------------------- verdict: the clock ends the match, the callback fires, the actor lingers then stops
{
  const verdictActor = createMatchActor({
    roomId: 'room-verdict', mapId: 'verdant', seed: 7, countdownS: 0, battleLimitS: 1, world: 'terrain', now, schedule,
    endedLingerTicks: 30,
    seats: [{ seat: 0, playerId: 'v1', name: 'V', team: 'alpha', specId: 'm1a2' }],
    bots: [{ playerId: 'vb', name: 'VB', team: 'bravo', specId: 't90m' }],
    onVerdict: (verdict) => verdicts.push(verdict),
  });
  const v1 = createHeadlessClient(verdictActor, 0, 'v1');
  await flush();
  await advanceTicks(verdictActor, 75);
  assert.equal(verdicts.length, 1, 'the verdict callback fired once');
  assert.equal(verdicts[0].roomId, 'room-verdict');
  assert.equal(verdicts[0].reason, 'time_limit');
  assert.ok(['alpha', 'bravo', 'draw'].includes(verdicts[0].result));
  assert.equal(verdicts[0].entities.length, 2);
  const endedFrame = v1.frames.find((frame) => frame.meta.verdict !== VERDICT.NONE);
  assert.ok(endedFrame && endedFrame.meta.phase === PHASE.ENDED && endedFrame.meta.verdictReason === 'time_limit', 'snapshots mirror the verdict');
  await advanceTicks(verdictActor, 40);
  assert.equal(verdictActor.stopped, true, 'the actor stops after the linger window');
  assert.ok(v1.closed && v1.closed.reason === CLOSE_REASON.MATCH_ENDED, 'clients are closed with MATCH_ENDED');
  console.log(`matchActor.selftest: verdict ${verdicts[0].result} by ${verdicts[0].reason} at tick ${verdicts[0].tick}, actor lingered then stopped`);
}
