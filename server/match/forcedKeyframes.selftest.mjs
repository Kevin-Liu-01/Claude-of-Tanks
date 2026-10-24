// Forced keyframes draw on a bucket (security audit 2026-10-22, NV-11; server/match/publisher.ts): a viewer that never
// acknowledges, or retracts every acknowledgement with NO_TICK, drew a full keyframe on every 20 Hz snapshot — about
// 8x an honest stream on the host player's uplink. Now it gets a burst of eight, then one per half second and nothing
// in between. An honest viewer keeps its deltas and its 2 s cadence; one whose acknowledgements arrive 300 ms late
// loses no snapshot while it joins; an honest gap recovery still gets its keyframe with the next snapshot.
import assert from 'node:assert/strict';
import { MESSAGE_TYPE, NO_TICK, PROTOCOL_VERSION } from '../../src/mp/wire/constants.ts';
import { applySnapshotPacket, decodeMessage, encodeMessage } from '../../src/mp/wire/codec.ts';
import { createLoopbackLink } from './link.ts';
import { createMatchActor } from './matchActor.ts';
import { ensureAuthorityFleet } from '../../src/vehicles/authorityFleet.ts';

await ensureAuthorityFleet();

const TICK_MS = 1000 / 60;
let nowMs = 80_000;
const now = () => nowMs;
const schedule = () => () => {};
const flush = () => new Promise((resolve) => setImmediate(resolve));
const seats = [
  { seat: 0, playerId: 'honest', name: 'Honest', team: 'alpha', specId: 'm1a1_abrams_hc' },
  { seat: 1, playerId: 'silent', name: 'Silent', team: 'bravo', specId: 't90am' },
  { seat: 2, playerId: 'retract', name: 'Retract', team: 'bravo', specId: 't90am' },
  { seat: 3, playerId: 'slow', name: 'Slow', team: 'alpha', specId: 'm1a1_abrams_hc' },
];
const viewers = [];

/** ack: 'all' acknowledges every snapshot (after delayMs), 'none' never, 'retract' acknowledges then sends NO_TICK. */
function attachViewer(actor, seat, playerId, team, ack, delayMs = 0) {
  const link = createLoopbackLink(playerId);
  const viewer = { ack, delayMs, keyframes: [], deltas: 0, bytes: 0, pending: [], history: new Map(),
    send: (message) => link.client.send(encodeMessage(message)) };
  link.client.onMessage((bytes) => {
    const decoded = decodeMessage(bytes, { resolveBaseline: (tick) => viewer.history.get(tick) ?? null });
    assert.ok(decoded.ok, decoded.ok ? '' : decoded.error.code);
    const message = decoded.message;
    if (message.type !== MESSAGE_TYPE.SNAPSHOT) return;
    viewer.bytes += bytes.byteLength;
    const frame = applySnapshotPacket(message, message.keyframe ? null : viewer.history.get(message.baseTick) ?? null);
    if (message.keyframe) viewer.keyframes.push(frame.tick); else viewer.deltas++;
    viewer.history.set(frame.tick, frame);
    if (viewer.ack === 'none') return;
    viewer.pending.push({ tick: frame.tick, at: nowMs + viewer.delayMs });
  });
  const hello = { type: MESSAGE_TYPE.HELLO, protocolVersion: PROTOCOL_VERSION, capabilities: 1, token: 'x', clientBuild: 'keyframes' };
  actor.attach(link.server, hello, { v: 1, roomId: actor.roomId, seat, playerId, name: playerId, team, specId: 'm1a1_abrams_hc', iat: 0, exp: 1 });
  viewers.push(viewer);
  return viewer;
}

async function advance(actor, ticks) {
  for (let n = 0; n < ticks; n++) {
    nowMs += TICK_MS;
    for (const viewer of viewers) {
      while (viewer.pending.length && viewer.pending[0].at <= nowMs) {
        viewer.send({ type: MESSAGE_TYPE.SNAPSHOT_ACK, tick: viewer.pending.shift().tick });
        if (viewer.ack === 'retract') viewer.send({ type: MESSAGE_TYPE.SNAPSHOT_ACK, tick: NO_TICK });
      }
    }
    actor.advance(nowMs);
    await flush();
  }
}

const actor = createMatchActor({ roomId: 'forced-keyframes', mapId: 'verdant', seed: 23, seats, world: 'terrain', countdownS: 0, now, schedule });
const honest = attachViewer(actor, 0, 'honest', 'alpha', 'all');
const silent = attachViewer(actor, 1, 'silent', 'bravo', 'none');
const retract = attachViewer(actor, 2, 'retract', 'bravo', 'retract');
const slow = attachViewer(actor, 3, 'slow', 'alpha', 'all', 300);
await advance(actor, 300); // 5 s: 100 snapshots

const snapshots = (viewer) => viewer.keyframes.length + viewer.deltas;
const gaps = (ticks) => ticks.slice(1).map((tick, i) => tick - ticks[i]);
for (const [name, viewer] of [['silent', silent], ['retract', retract]]) {
  assert.ok(viewer.keyframes.length >= 14 && viewer.keyframes.length <= 20,
    `${name}: a burst of 8, then one keyframe per half second (${viewer.keyframes.length} in 5 s, not ~100)`);
  // the first keyframe is the cadence's own (no token), then the burst of eight, then the refill's spacing
  assert.ok(gaps(viewer.keyframes.slice(9)).every((gap) => gap >= 27), `${name}: past the burst, keyframes ≥ 27 ticks apart (${gaps(viewer.keyframes).join(',')})`);
  assert.equal(viewer.deltas, 0, `${name}: nothing to apply a delta to, so none is sent`);
}
assert.ok(honest.keyframes.length <= 4, `the honest viewer keeps the 2 s cadence (${honest.keyframes.length} keyframes)`);
assert.ok(snapshots(honest) >= 98, `the honest viewer misses no snapshot (${snapshots(honest)})`);
assert.equal(snapshots(slow), snapshots(honest), `acknowledging 300 ms late loses no snapshot while joining (${snapshots(slow)})`);
assert.ok(slow.keyframes.length <= 10, `its first round trip is keyframes, then deltas (${slow.keyframes.length} keyframes)`);
assert.ok(silent.bytes < honest.bytes, `the silent viewer's stream is now below an honest one (${silent.bytes} vs ${honest.bytes} bytes)`);

// honest gap recoveries are answered with the next snapshot, two in a row included (the burst)
for (let round = 0; round < 2; round++) {
  const before = honest.keyframes.length;
  const tickAtRequest = actor.tick;
  honest.send({ type: MESSAGE_TYPE.SNAPSHOT_ACK, tick: NO_TICK });
  await advance(actor, 3);
  assert.equal(honest.keyframes.length, before + 1, `recovery ${round + 1} is answered with the next snapshot`);
  assert.ok(honest.keyframes.at(-1) - tickAtRequest <= 3);
}

actor.stop();
console.log(`forcedKeyframes: PASS (5 s: silent ${silent.keyframes.length}, retract ${retract.keyframes.length} keyframes; honest ${snapshots(honest)} and slow ${snapshots(slow)} snapshots)`);
