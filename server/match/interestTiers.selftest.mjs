// The interest tiers of the per-viewer publisher (P3b, 2026-09-29; docs/MULTIPLAYER-V2.md §13.9): the pure rules
// (tier radii, the phased cadence, when a fresh row is due, engagement), then the real actor on the bare height field
// with hulls placed at known distances from the viewer — the own row and the near ally and the near enemy refreshed
// every snapshot, the middle ally every second, the far ally every third (the row's capture tick says so on the
// viewer's decoded frames), a spectator at full rate, the spotting invariant upstream of every tier (the frames'
// entity set is exactly the authority's visibility set for the viewer: a hidden enemy is never sent at any tier), a far
// ally's shell landing beside the viewer putting it on the near tier for four seconds, and the actor's counters.
import assert from 'node:assert/strict';
import { CONTROL_FLAGS, MESSAGE_TYPE, NO_TICK, PROTOCOL_VERSION, TICK_HZ } from '../../src/mp/wire/constants.ts';
import { applySnapshotPacket, decodeMessage, encodeMessage } from '../../src/mp/wire/codec.ts';
import { quantizeAimDistance, quantizeAimPitch, quantizeAngle } from '../../src/mp/wire/quantize.ts';
import { createLoopbackLink } from './link.ts';
import { createMatchActor } from './matchActor.ts';
import {
  INTEREST_CADENCE, INTEREST_ENGAGED_TICKS, INTEREST_MID_M, INTEREST_NEAR_M, createViewerInterest, engageEntity, interestTierFor, needsFreshRow,
  recordRow, refreshDue, viewerTierFor,
} from './interestTiers.ts';
import { ensureAuthorityFleet } from '../../src/vehicles/authorityFleet.ts';

// The actor reads finalized combat anatomy; production hosts load their roster's groups first (Node: all).
await ensureAuthorityFleet();

// ------------------------------------------------------------ the rules
assert.equal(interestTierFor(0), 0);
assert.equal(interestTierFor(INTEREST_NEAR_M ** 2), 0, 'the near radius is inclusive');
assert.equal(interestTierFor((INTEREST_NEAR_M + 0.1) ** 2), 1);
assert.equal(interestTierFor(INTEREST_MID_M ** 2), 1);
assert.equal(interestTierFor((INTEREST_MID_M + 0.1) ** 2), 2);
assert.deepEqual([...INTEREST_CADENCE], [1, 2, 3]);
for (let index = 0; index < 30; index++) assert.equal(refreshDue(index, 7, 1), true, 'the near tier refreshes every snapshot');
{
  // every id on the far tier is refreshed exactly every third snapshot, and the refreshes of 28 ids spread over the three phases
  for (const id of [1, 9, 28]) {
    const due = [];
    for (let index = 0; index < 30; index++) if (refreshDue(index, id, 3)) due.push(index);
    assert.equal(due.length, 10, `id ${id}: ten refreshes in thirty snapshots`);
    for (let n = 1; n < due.length; n++) assert.equal(due[n] - due[n - 1], 3);
  }
  for (let index = 0; index < 6; index++) {
    let count = 0;
    for (let id = 1; id <= 28; id++) if (refreshDue(index, id, 3)) count++;
    assert.ok(count === 9 || count === 10, `snapshot ${index}: a third of the far rows (${count})`);
  }
}
{
  const interest = createViewerInterest();
  const row = { entityId: 5, tick: 0 };
  assert.equal(needsFreshRow(interest, 5, 2, 10), true, 'no held row: fresh');
  recordRow(interest, 5, 2, 10, row, true);
  assert.deepEqual([...interest.published], [0, 0, 1]);
  assert.deepEqual([...interest.population], [0, 0, 1]);
  assert.equal(needsFreshRow(interest, 5, 2, 11), refreshDue(11, 5, 3), 'held and seen in the previous snapshot: the cadence decides');
  assert.equal(needsFreshRow(interest, 5, 2, 13), true, 'absent from the previous snapshot (hidden meanwhile): fresh');
  assert.equal(needsFreshRow(interest, 5, 0, 11), true, 'the near tier: always');
  recordRow(interest, 5, 1, 11, row, false);
  assert.equal(interest.held, 1);
  assert.equal(viewerTierFor(interest, 5, 100, 1e6), 2, 'far by distance');
  engageEntity(interest, 5, 100 + INTEREST_ENGAGED_TICKS);
  assert.equal(viewerTierFor(interest, 5, 100, 1e6), 0, 'engaged: near whatever the distance');
  assert.equal(viewerTierFor(interest, 5, 100 + INTEREST_ENGAGED_TICKS, 1e6), 2, 'the engagement expires');
  engageEntity(interest, 5, 50);
  assert.equal(interest.engagedUntil[5], 100 + INTEREST_ENGAGED_TICKS, 'an earlier engagement never shortens a later one');
  engageEntity(interest, 0, 500);
  engageEntity(interest, 200, 500);
  assert.equal(interest.engagedUntil[0], 0, 'ids outside the roster are ignored');
}
console.log('interestTiers.selftest: radii, the phased cadences, fresh-row rules and engagement verified');

// ------------------------------------------------------------ the actor: hulls at known distances from the viewer
const TICK_MS = 1000 / 60;
let nowMs = 20_000;
const now = () => nowMs;
const schedule = () => () => {};
const flush = () => new Promise((resolve) => setImmediate(resolve));

function createHeadlessClient(actor, seat, playerId, team) {
  const link = createLoopbackLink(playerId);
  const client = { playerId, seat, link, welcome: null, frames: [], events: [], history: new Map(), latestTick: NO_TICK, send(message) { link.client.send(encodeMessage(message)); } };
  link.client.onMessage((bytes) => {
    const decoded = decodeMessage(bytes, { resolveBaseline: (tick) => client.history.get(tick) ?? null });
    assert.ok(decoded.ok, `client ${playerId} decodes every server frame (${decoded.ok ? '' : decoded.error.code})`);
    const message = decoded.message;
    if (message.type === MESSAGE_TYPE.WELCOME) client.welcome = message;
    else if (message.type === MESSAGE_TYPE.SNAPSHOT) {
      const frame = applySnapshotPacket(message, message.keyframe ? null : client.history.get(message.baseTick) ?? null);
      client.frames.push(frame);
      client.history.set(frame.tick, frame);
      if (client.history.size > 64) client.history.delete(client.history.keys().next().value);
      client.latestTick = frame.tick;
    } else if (message.type === MESSAGE_TYPE.EVENT) client.events.push(...message.events.map((event) => ({ ...event, tick: message.tick })));
  });
  const hello = { type: MESSAGE_TYPE.HELLO, protocolVersion: PROTOCOL_VERSION, capabilities: 1, token: 'issued-elsewhere', clientBuild: 'tiers' };
  assert.ok(actor.attach(link.server, hello, { v: 1, roomId: actor.roomId, seat, playerId, name: playerId, team, specId: 'm1a2', iat: 0, exp: 1 }));
  return client;
}

const control = (overrides = {}) => ({
  throttle: 0, steer: 0, flags: 0, aimYaw: quantizeAngle(0), aimPitch: 0, aimDistance: quantizeAimDistance(500),
  shellSlot: 0, fireSeq: 0, actionSeq: 0, actionBits: 0, ...overrides,
});

// the viewer p1 at x = -200; allies at 60 m (near), 200 m (mid) and 400 m (far); an enemy at 40 m (spotted unconditionally)
// and one at 420 m (spotted or not, the oracle decides); every hull drives slowly along +z so its rows change every tick
const X0 = -200;
const seats = [
  { seat: 0, playerId: 'p1', name: 'Viewer', team: 'alpha', specId: 'm1a2', spawn: { x: X0, z: 0, yaw: 0 } },
  { seat: 1, playerId: 'p2', name: 'Near', team: 'alpha', specId: 'm1a2', spawn: { x: X0 + 60, z: 0, yaw: 0 } },
  { seat: 2, playerId: 'p5', name: 'Mid', team: 'alpha', specId: 'm1a2', spawn: { x: X0 + 200, z: 0, yaw: 0 } },
  { seat: 3, playerId: 'p6', name: 'Far', team: 'alpha', specId: 'm1a2', spawn: { x: X0 + 400, z: 0, yaw: -Math.PI / 2 } },
  { seat: 4, playerId: 'p3', name: 'NearEnemy', team: 'bravo', specId: 't90m', spawn: { x: X0 + 40, z: 0, yaw: 0 } },
  { seat: 5, playerId: 'p4', name: 'FarEnemy', team: 'bravo', specId: 't90m', spawn: { x: X0 + 420, z: 0, yaw: 0 } },
  { seat: 9, playerId: 's1', name: 'Watcher', team: 'spectator', specId: '' },
];
// at an explicit 30 Hz: the cadences below are written in ticks (4 = every second snapshot, 6 = every third)
const actor = createMatchActor({ roomId: 'room-tiers', mapId: 'verdant', seed: 77, countdownS: 0, world: 'terrain', now, schedule, seats, snapshotHz: 30 });
const ids = Object.fromEntries(seats.filter((seat) => seat.team !== 'spectator').map((seat) => [seat.playerId, actor.wireIdOf(seat.playerId)]));
const p1 = createHeadlessClient(actor, 0, 'p1', 'alpha');
const p2 = createHeadlessClient(actor, 1, 'p2', 'alpha');
const p5 = createHeadlessClient(actor, 2, 'p5', 'alpha');
const p6 = createHeadlessClient(actor, 3, 'p6', 'alpha');
const p3 = createHeadlessClient(actor, 4, 'p3', 'bravo');
const p4 = createHeadlessClient(actor, 5, 'p4', 'bravo');
const s1 = createHeadlessClient(actor, 9, 's1', 'spectator');
await flush();
for (const client of [p1, p2, p5, p6, p3, p4, s1]) assert.ok(client.welcome, `${client.playerId} welcomed`);
const oracleAt = new Map();
/** Per-client control overrides (an aim, a fire edge) on top of the slow drive. */
const overrides = new Map();
async function advanceTicks(ticks) {
  for (let n = 0; n < ticks; n++) {
    nowMs += TICK_MS;
    const tick = actor.tick + 1;
    for (const client of [p1, p2, p5, p6, p3]) {
      client.send({ type: MESSAGE_TYPE.INPUT, clientTick: tick + 2, snapshotAckTick: client.latestTick, interpDelayMs: 67, controls: [control({ throttle: 30, ...(overrides.get(client) ?? {}) })] });
    }
    p4.send({ type: MESSAGE_TYPE.INPUT, clientTick: tick + 2, snapshotAckTick: p4.latestTick, interpDelayMs: 67, controls: [control({ flags: CONTROL_FLAGS.BRAKE })] });
    s1.send({ type: MESSAGE_TYPE.SNAPSHOT_ACK, tick: s1.latestTick });
    actor.advance(nowMs);
    if (actor.tick % 2 === 0) {
      const oracle = actor.authority.snapshot({ tick: actor.tick, serverTimeMs: 0, viewerId: 'p1', ackInputSeq: null });
      oracleAt.set(actor.tick, new Set(oracle.entities.map((row) => ids[row.id])));
    }
    await flush();
  }
}
await advanceTicks(240);
const settled = (client, from) => client.frames.filter((frame) => frame.tick >= from);
const rowOf = (frame, entityId) => frame.entities.find((row) => row.entityId === entityId) ?? null;
const distinctTickGaps = (frames, entityId) => {
  const ticks = [];
  for (const frame of frames) { const row = rowOf(frame, entityId); if (row && ticks.at(-1) !== row.tick) ticks.push(row.tick); }
  return ticks.slice(1).map((tick, index) => tick - ticks[index]);
};
{
  const frames = settled(p1, 120);
  assert.ok(frames.length >= 55, `p1 assembled ${frames.length} snapshots after settling`);
  for (const frame of frames) {
    for (const [name, entityId] of [['own', ids.p1], ['the near ally', ids.p2], ['the near enemy', ids.p3]]) {
      const row = rowOf(frame, entityId);
      assert.ok(row, `${name} is in every frame`);
      assert.equal(row.tick, frame.tick, `${name} is refreshed every snapshot (tick ${row.tick} in frame ${frame.tick})`);
    }
    const mid = rowOf(frame, ids.p5);
    const far = rowOf(frame, ids.p6);
    assert.ok(mid && far, 'allies are always present');
    assert.ok(frame.tick - mid.tick <= 2, `the middle ally's row is at most one snapshot old (${frame.tick - mid.tick} ticks)`);
    assert.ok(frame.tick - far.tick <= 4, `the far ally's row is at most two snapshots old (${frame.tick - far.tick} ticks)`);
    // the spotting invariant upstream of every tier: exactly the authority's visibility set for p1
    const oracle = oracleAt.get(frame.tick);
    assert.ok(oracle, `an oracle for tick ${frame.tick}`);
    assert.deepEqual(new Set(frame.entities.map((row) => row.entityId)), oracle, `frame ${frame.tick} carries the authority's visibility set and nothing else`);
  }
  const midGaps = distinctTickGaps(frames, ids.p5);
  const farGaps = distinctTickGaps(frames, ids.p6);
  assert.ok(midGaps.length >= 25 && midGaps.every((gap) => gap === 4), `the middle ally's samples are two snapshots apart (${[...new Set(midGaps)].join(',')})`);
  assert.ok(farGaps.length >= 15 && farGaps.every((gap) => gap === 6), `the far ally's samples are three snapshots apart (${[...new Set(farGaps)].join(',')})`);
  const enemyFar = frames.filter((frame) => rowOf(frame, ids.p4)).length;
  console.log(`interestTiers.selftest: p1 sees own/near ally/near enemy every snapshot, the middle ally every second, the far ally every third; the far enemy at 420 m was visible in ${enemyFar} of ${frames.length} frames (the oracle's set every time)`);
  // the spectator has no hull to measure from: every moving entity fresh in every frame; the braking far enemy's row is
  // fresh whenever a quantized field moved (its suspension settles) and otherwise the very row of the previous frame,
  // carried forward by the delta codec with its tick — an older tick is only ever an identical pose
  const braking = ids.p4;
  const spectatorFrames = settled(s1, 120);
  let carried = 0;
  for (let index = 0; index < spectatorFrames.length; index++) {
    const frame = spectatorFrames[index];
    assert.equal(frame.entities.length, 6, 'a spectator sees both teams');
    for (const row of frame.entities) {
      if (row.entityId !== braking) assert.equal(row.tick, frame.tick, `a spectator's rows are all fresh (entity ${row.entityId})`);
      else if (row.tick !== frame.tick) { if (index > 0) assert.deepEqual(row, rowOf(spectatorFrames[index - 1], braking), 'an older tick is the previous frame\'s row, field for field'); carried++; }
    }
  }
  assert.ok(carried > 0, `the braking hull's unchanged rows were carried forward (${carried} of ${spectatorFrames.length})`);
  // the counters
  const stats = actor.clientStats().find((entry) => entry.playerId === 'p1');
  assert.deepEqual(stats.interest.population.slice(0, 2), [3, 1], `p1's tiers: three near (own, ally, enemy), one middle (${stats.interest.population})`);
  assert.ok(stats.interest.population[2] >= 1, 'at least the far ally on the far tier');
  assert.ok(stats.interest.published[1] > 0 && stats.interest.published[2] > 0 && stats.interest.held > 0, `rows published per tier ${stats.interest.published}, held ${stats.interest.held}`);
  const totals = actor.stats().interest;
  assert.ok(totals.held > stats.interest.held, 'the actor total sums the viewers');
  assert.equal(actor.stats().snapshotHz, 30);
}

// ------------------------------------------------------------ engagement: a hit puts the shooter on the near tier for four seconds, whatever its distance
{
  const viewer = actor.entityForWireId(ids.p1);
  const shooter = actor.entityForWireId(ids.p3);
  // the near enemy (40 m, level ground) lays its gun on the viewer's hull and fires once
  const aimAtViewer = () => {
    const dx = viewer.state.pos.x - shooter.state.pos.x;
    const dz = viewer.state.pos.z - shooter.state.pos.z;
    const distanceM = Math.hypot(dx, dz);
    const dy = viewer.state.pos.y + 1.2 - (shooter.state.pos.y + 2.2);
    return { aimYaw: quantizeAngle(Math.atan2(dx, dz)), aimPitch: quantizeAimPitch(Math.atan2(dy, distanceM)), aimDistance: quantizeAimDistance(distanceM) };
  };
  overrides.set(p3, { ...aimAtViewer(), fireSeq: 0 });
  // the turret slews a quarter turn at the spec's traverse rate before the trigger
  for (let n = 0; n < 8; n++) { await advanceTicks(30); overrides.set(p3, { ...aimAtViewer(), fireSeq: 0 }); }
  overrides.set(p3, { ...aimAtViewer(), fireSeq: 1 });
  await advanceTicks(90);
  const hit = p1.events.find((event) => event.kind === 'shell_hit' && event.payload.shooterId === 'p3' && event.payload.targetId === 'p1');
  assert.ok(hit, `p3's shell hit p1 as p1 saw it (${p1.events.filter((event) => event.payload.shooterId === 'p3').map((event) => event.kind).join(',') || 'no event'})`);
  // the shooter leaps 380 m away (this open ground keeps it spotted): far by distance, near by engagement
  shooter.state.pos.x = viewer.state.pos.x + 380;
  shooter.state.pos.z = viewer.state.pos.z;
  overrides.set(p3, { fireSeq: 1 });
  const leapTick = actor.tick;
  await advanceTicks(120);
  const distanceNow = Math.hypot(shooter.state.pos.x - viewer.state.pos.x, shooter.state.pos.z - viewer.state.pos.z);
  assert.ok(distanceNow > INTEREST_MID_M, `the shooter is far by distance now (${distanceNow.toFixed(0)} m)`);
  const engagedFrames = p1.frames.filter((frame) => frame.tick > leapTick + 4 && frame.tick < hit.tick + INTEREST_ENGAGED_TICKS - 4);
  assert.ok(engagedFrames.length >= 40, `frames inside the engagement window after the leap (${engagedFrames.length})`);
  for (const frame of engagedFrames) {
    const row = rowOf(frame, ids.p3);
    assert.ok(row, `the engaged enemy is still visible (frame ${frame.tick})`);
    assert.equal(row.tick, frame.tick, `the engaged far enemy is refreshed every snapshot (frame ${frame.tick}, hit at ${hit.tick})`);
  }
  await advanceTicks(INTEREST_ENGAGED_TICKS + 120);
  const after = p1.frames.filter((frame) => frame.tick > hit.tick + INTEREST_ENGAGED_TICKS + 30);
  assert.ok(after.every((frame) => rowOf(frame, ids.p3)), 'the enemy stays spotted after the engagement');
  const gaps = distinctTickGaps(after, ids.p3);
  assert.ok(gaps.length >= 8 && gaps.every((gap) => gap === 6), `after the engagement the far enemy is on the far cadence (${[...new Set(gaps)].join(',')})`);
  console.log(`interestTiers.selftest: p3's hit at tick ${hit.tick} kept it on the near tier for ${INTEREST_ENGAGED_TICKS / TICK_HZ} s at ${distanceNow.toFixed(0)} m, then the far cadence again`);
}
actor.stop();
await flush();
console.log('interestTiers.selftest: tiers, cadences, the spotting invariant, spectators, engagement and counters verified on the real actor');
