// The per-viewer snapshot budget and the keyframe slots (mp-scale-251; interestTiers.ts, publisher.ts;
// docs/MULTIPLAYER-V2.md §13.30), on the real actor over the bare height field: thirty seated viewers, the viewer p1 with
// allies placed near, mid and far and an enemy at 40 m, every hull driving so its rows change every tick. With a tight
// uplink target the budget defers rows and p1's stream shrinks, while its own row is fresh on every snapshot and no row
// waits past twice its tier's cadence (MAX_DEFERRED_STALENESS); with the budget off the tiers' cadences are exact. Both
// keep the spotting invariant (each frame's entity set is the authority's visibility set for p1). Thirty viewers joined
// at once never draw more than two periodic keyframes on one snapshot. The row weigher (rows.ts estimateEntityRowBytes)
// is exact against the patch the codec writes.
import assert from 'node:assert/strict';
import { MESSAGE_TYPE, NO_TICK, PROTOCOL_VERSION } from '../../src/mp/wire/constants.ts';
import { applySnapshotPacket, decodeMessage, encodeMessage } from '../../src/mp/wire/codec.ts';
import { ByteWriter } from '../../src/mp/wire/bytes.ts';
import { diffEntityRow, estimateEntityRowBytes, writeEntityRowPatch } from '../../src/mp/wire/rows.ts';
import { quantizeAimDistance, quantizeAngle } from '../../src/mp/wire/quantize.ts';
import { createLoopbackLink } from './link.ts';
import { createMatchActor } from './matchActor.ts';
import { KEYFRAME_INTERVAL_TICKS } from './publisher.ts';
import { MAX_DEFERRED_STALENESS, snapshotRowBudgetBytes } from './interestTiers.ts';
import { ensureAuthorityFleet } from '../../src/vehicles/authorityFleet.ts';

await ensureAuthorityFleet();

// ---- the row weigher: exact against the codec's patch for rows without ERA, auxiliary state or a wreck body
{
  let seed = 0x5eed;
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 2 ** 32; };
  const int = (low, high) => low + Math.floor(rnd() * (high - low + 1));
  const row = (entityId, tick) => ({
    entityId, tick, x: int(-2e6, 2e6), y: int(-2e4, 2e4), z: int(-2e6, 2e6), speed: int(-2000, 2000), verticalSpeed: int(-300, 300),
    yaw: int(0, 65535), pitch: int(0, 65535), roll: int(0, 65535), turretYaw: int(0, 65535), gunPitch: int(0, 65535),
    hp: int(0, 3000), maxHp: 3000, reload: int(0, 4000), reloadTotal: 4000, reloadKind: int(0, 3),
    gunReload: int(0, 4000), gunReloadTotal: 4000, gunReloadKind: int(0, 3), magazineRounds: int(0, 9), magazineCapacity: 9,
    shellSlot: int(0, 2), ammo0: int(0, 400), ammo1: int(0, 40), ammo2: int(0, 4), flags: int(0, 255), eraSpent: [],
  });
  const nudge = (base, tick) => {
    const next = { ...base, tick, eraSpent: [] };
    for (const key of ['x', 'y', 'z', 'speed', 'yaw', 'pitch', 'roll', 'turretYaw', 'hp', 'reload', 'ammo0', 'flags']) {
      if (rnd() < 0.5) next[key] = key === 'x' || key === 'z' ? base[key] + int(-3000, 3000) * (rnd() < 0.2 ? 30 : 1)
        : key === 'pitch' || key === 'roll' ? (base[key] + int(-200, 200) + 65536) % 65536 : Math.max(0, base[key] + int(-50, 50));
    }
    if (rnd() < 0.3) next.gunReload = next.reload;
    return next;
  };
  const writer = new ByteWriter(256);
  let cases = 0;
  for (let n = 0; n < 2000; n++) {
    const base = row(1 + (n % 60), 1000);
    const next = nudge(base, 1003);
    for (const [candidate, against] of [[next, base], [base, null]]) {
      writer.reset();
      writeEntityRowPatch(writer, diffEntityRow(candidate, against, candidate.tick), against, candidate.tick);
      const actual = diffEntityRow(candidate, against, candidate.tick).mask === 0 ? 0 : writer.length;
      assert.equal(estimateEntityRowBytes(candidate, against), actual, `the weigher is exact (${JSON.stringify({ candidate, against }).slice(0, 120)})`);
      cases++;
    }
  }
  console.log(`snapshotBudget.selftest: the row weigher equals the codec's patch on ${cases} rows`);
}

// ---- the actor: thirty viewers, p1's allies near / mid / far, an enemy at 40 m
const TICK_MS = 1000 / 60;
const flush = () => new Promise((resolve) => setImmediate(resolve));
const X0 = -250;
const placements = [
  // (each group well inside its tier's band: near under 100 m, mid 100-300 m, far past 300 m)
  ...[30, 45, 60, 75, 90, 55, 70, 85].map((dx, i) => ({ name: `near${i}`, team: 'alpha', dx, dz: 5 * i })),
  ...[130, 160, 190, 220, 250, 280, 140, 170, 200, 230, 260, 285].map((dx, i) => ({ name: `mid${i}`, team: 'alpha', dx, dz: 5 * i })),
  ...[330, 350, 370, 390, 410, 430, 340, 360].map((dx, i) => ({ name: `far${i}`, team: 'alpha', dx, dz: 10 * i })),
  { name: 'enemy', team: 'bravo', dx: 40, dz: -20 },
];

async function run(uplinkTargetBps) {
  let nowMs = 20_000;
  const seats = [
    { seat: 0, playerId: 'p1', name: 'Viewer', team: 'alpha', specId: 'm1a1_abrams_hc', spawn: { x: X0, z: 0, yaw: 0 } },
    ...placements.map((place, index) => ({
      seat: index + 1, playerId: place.name, name: place.name, team: place.team, specId: place.team === 'alpha' ? 'm1a1_abrams_hc' : 't90am',
      spawn: { x: X0 + place.dx, z: place.dz, yaw: 0 },
    })),
  ];
  const actor = createMatchActor({
    roomId: `budget-${uplinkTargetBps}`, mapId: 'verdant', seed: 31, countdownS: 0, world: 'terrain', snapshotHz: 30,
    now: () => nowMs, schedule: () => () => {}, seats, uplinkTargetBps,
  });
  const ids = Object.fromEntries(seats.map((seat) => [seat.playerId, actor.wireIdOf(seat.playerId)]));
  const clients = seats.map((seat) => {
    const link = createLoopbackLink(seat.playerId);
    const client = { seat, link, frames: [], history: new Map(), latestTick: NO_TICK, bytes: 0, keyframeTicks: [] };
    link.client.onMessage((bytes) => {
      const decoded = decodeMessage(bytes, { resolveBaseline: (tick) => client.history.get(tick) ?? null });
      assert.ok(decoded.ok, `${seat.playerId} decodes every frame`);
      if (decoded.message.type !== MESSAGE_TYPE.SNAPSHOT) return;
      const frame = applySnapshotPacket(decoded.message, decoded.message.keyframe ? null : client.history.get(decoded.message.baseTick) ?? null);
      client.bytes += bytes.byteLength;
      if (decoded.message.keyframe) client.keyframeTicks.push(frame.tick);
      client.frames.push(frame);
      client.history.set(frame.tick, frame);
      if (client.history.size > 64) client.history.delete(client.history.keys().next().value);
      client.latestTick = frame.tick;
    });
    const hello = { type: MESSAGE_TYPE.HELLO, protocolVersion: PROTOCOL_VERSION, capabilities: 1, token: '', clientBuild: 'budget' };
    assert.ok(actor.attach(link.server, hello, { v: 1, roomId: actor.roomId, seat: seat.seat, playerId: seat.playerId, name: seat.name, team: seat.team, specId: seat.specId, iat: 0, exp: 1 }));
    return client;
  });
  const oracleAt = new Map();
  for (let n = 0; n < 420; n++) {
    nowMs += TICK_MS;
    for (const client of clients) {
      client.link.client.send(encodeMessage({
        type: MESSAGE_TYPE.INPUT, clientTick: actor.tick + 3, snapshotAckTick: client.latestTick, interpDelayMs: 67,
        controls: [{ throttle: 30, steer: 0, flags: 0, aimYaw: quantizeAngle(0), aimPitch: 0, aimDistance: quantizeAimDistance(500), shellSlot: 0, fireSeq: 0, actionSeq: 0, actionBits: 0 }],
      }));
    }
    actor.advance(nowMs);
    if (actor.tick % 2 === 0) {
      const oracle = actor.authority.snapshot({ tick: actor.tick, serverTimeMs: 0, viewerId: 'p1', ackInputSeq: null });
      oracleAt.set(actor.tick, new Set(oracle.entities.map((row) => ids[row.id])));
    }
    await flush();
  }
  const stats = actor.stats();
  actor.stop();
  return { clients, ids, oracleAt, stats, p1: clients[0] };
}

/** Snapshots between an entity's fresh samples on the viewer's frames (rows of one tick are one sample). */
function freshGaps(frames, entityId) {
  const ticks = [];
  for (const frame of frames) {
    const row = frame.entities.find((entry) => entry.entityId === entityId);
    if (row && ticks.at(-1) !== row.tick) ticks.push(row.tick);
  }
  return ticks.slice(1).map((tick, index) => (tick - ticks[index]) / 2); // 30 Hz: a snapshot every 2 ticks
}

const tight = await run(1_500_000);
const open = await run(0);
const budget = snapshotRowBudgetBytes(tight.clients.length, 30, 1_500_000);
for (const [label, result] of [['tight', tight], ['open', open]]) {
  const frames = result.p1.frames.filter((frame) => frame.tick >= 120);
  assert.ok(frames.length >= 140, `${label}: p1 assembled ${frames.length} snapshots`);
  for (const frame of frames) {
    const oracle = result.oracleAt.get(frame.tick);
    assert.deepEqual(new Set(frame.entities.map((row) => row.entityId)), oracle, `${label}: frame ${frame.tick} carries the authority's visibility set and nothing else`);
    const own = frame.entities.find((row) => row.entityId === result.ids.p1);
    assert.equal(own.tick, frame.tick, `${label}: p1's own row is fresh on every snapshot`);
  }
}
{
  const frames = open.p1.frames.filter((frame) => frame.tick >= 120);
  for (const place of placements.filter((entry) => entry.team === 'alpha')) {
    const cadence = place.name.startsWith('near') ? 1 : place.name.startsWith('mid') ? 2 : 3;
    const gaps = freshGaps(frames, open.ids[place.name]);
    assert.ok(gaps.length && gaps.every((gap) => gap === cadence), `open: ${place.name} refreshed every ${cadence} snapshot(s) (${gaps.slice(0, 12).join(',')})`);
  }
  assert.equal(open.stats.interest.deferred, 0, 'open: no row deferred');
}
let worstNear = 0, worstMid = 0, worstFar = 0;
{
  const frames = tight.p1.frames.filter((frame) => frame.tick >= 120);
  for (const place of placements.filter((entry) => entry.team === 'alpha')) {
    const cadence = place.name.startsWith('near') ? 1 : place.name.startsWith('mid') ? 2 : 3;
    const gaps = freshGaps(frames, tight.ids[place.name]);
    const worst = Math.max(...gaps);
    if (cadence === 1) worstNear = Math.max(worstNear, worst); else if (cadence === 2) worstMid = Math.max(worstMid, worst); else worstFar = Math.max(worstFar, worst);
    assert.ok(worst <= cadence * MAX_DEFERRED_STALENESS, `tight: ${place.name} never waits past ${cadence * MAX_DEFERRED_STALENESS} snapshots (${gaps.slice(0, 16).join(',')})`);
  }
  assert.ok(tight.stats.interest.deferred > 0, `tight: the budget (${budget} B a snapshot) deferred rows (${tight.stats.interest.deferred})`);
  assert.ok(tight.p1.bytes < open.p1.bytes * 0.9, `tight: p1's stream shrinks (${tight.p1.bytes} vs ${open.p1.bytes} bytes)`);
}
// keyframe slots: after the joins, never more than two periodic keyframes on one snapshot across thirty viewers
{
  const perTick = new Map();
  for (const client of open.clients) for (const tick of client.keyframeTicks) if (tick >= 60) perTick.set(tick, (perTick.get(tick) ?? 0) + 1);
  const worst = Math.max(0, ...perTick.values());
  const total = [...perTick.values()].reduce((sum, count) => sum + count, 0);
  assert.ok(total >= 1, `periodic keyframes were drawn (${total})`);
  assert.ok(worst <= 2, `thirty viewers' periodic keyframes spread over the cycle (at most ${worst} on one snapshot)`);
  void KEYFRAME_INTERVAL_TICKS;
}
console.log(`snapshotBudget.selftest: tight (${budget} B a snapshot over ${tight.clients.length} viewers) deferred ${tight.stats.interest.deferred} rows, `
  + `p1 ${tight.p1.bytes} vs ${open.p1.bytes} bytes; worst waits near ${worstNear}, mid ${worstMid}, far ${worstFar} snapshots `
  + `(bounds ${MAX_DEFERRED_STALENESS}, ${2 * MAX_DEFERRED_STALENESS}, ${3 * MAX_DEFERRED_STALENESS}); the own row always fresh, the visibility set exact, keyframe slots spread PASS`);
