// A viewer frame from the authority's view (mp-scale-251; observeForViewer and snapshotMeta, docs/MULTIPLAYER-V2.md
// §13.30): two actors on the same seed and the same scripted inputs, one reading each viewer's full world snapshot
// (frameView 'snapshot') and one the view without its per-entity capture (the default), send every viewer the same bytes
// on every snapshot, keyframes and deltas, spectators and seats, shells in flight and events alike. And a viewer of a
// room past 32 hulls, its own last in the roster, receives all of them (the world snapshot stopped at 32: a viewer of a
// 32v32 test room saw the first 32 it may observe, and its own row only if it came early enough).
import assert from 'node:assert/strict';
import { MESSAGE_TYPE, NO_TICK, PROTOCOL_VERSION } from '../../src/mp/wire/constants.ts';
import { applySnapshotPacket, decodeMessage, encodeMessage, peekMessageType } from '../../src/mp/wire/codec.ts';
import { quantizeAimDistance, quantizeAngle } from '../../src/mp/wire/quantize.ts';
import { createLoopbackLink } from './link.ts';
import { createMatchActor } from './matchActor.ts';
import { ensureAuthorityFleet } from '../../src/vehicles/authorityFleet.ts';

await ensureAuthorityFleet();
const TICK_MS = 1000 / 60;
const flush = () => new Promise((resolve) => setImmediate(resolve));

function room(frameView, { seats, bots, world = 'dedicated', mapId = 'verdant' }) {
  let nowMs = 0;
  const actor = createMatchActor({ roomId: `view-${frameView}`, mapId, seed: 909, countdownS: 0, world, seats, bots, frameView, now: () => nowMs, schedule: () => () => {} });
  const clients = seats.map((seat) => {
    const link = createLoopbackLink(seat.playerId);
    const client = { seat, link, snapshots: [], latestTick: NO_TICK, fireSeq: 0 };
    link.client.onMessage((bytes) => {
      if (peekMessageType(bytes) !== MESSAGE_TYPE.SNAPSHOT) return;
      client.snapshots.push(bytes);
      client.latestTick = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(2, true);
    });
    const hello = { type: MESSAGE_TYPE.HELLO, protocolVersion: PROTOCOL_VERSION, capabilities: 1, token: '', clientBuild: 'view' };
    assert.ok(actor.attach(link.server, hello, { v: 1, roomId: actor.roomId, seat: seat.seat, playerId: seat.playerId, name: seat.name, team: seat.team, specId: seat.specId, iat: 0, exp: 1 }));
    return client;
  });
  return {
    actor, clients,
    async tick(n) {
      for (const client of clients) {
        if (client.seat.team === 'spectator') { client.link.client.send(encodeMessage({ type: MESSAGE_TYPE.SNAPSHOT_ACK, tick: client.latestTick })); continue; }
        if (n % 40 === client.seat.seat % 40) client.fireSeq = (client.fireSeq + 1) & 0xffff;
        client.link.client.send(encodeMessage({
          type: MESSAGE_TYPE.INPUT, clientTick: actor.tick + 2, snapshotAckTick: client.latestTick, interpDelayMs: 100,
          controls: [{ throttle: 90, steer: (n >> 7) % 2 ? 40 : -40, flags: 0, aimYaw: quantizeAngle(client.seat.team === 'alpha' ? 0 : Math.PI), aimPitch: 0,
            aimDistance: quantizeAimDistance(300), shellSlot: 0, fireSeq: client.fireSeq, actionSeq: 0, actionBits: 0 }],
        }));
      }
      await Promise.resolve();
      nowMs += TICK_MS;
      actor.advance(nowMs);
    },
  };
}

// ---- the same bytes from both views: Verdant 7v7, five seats and a spectator, bots filling, 20 s with shots in flight
{
  const specs = ['m1a1_abrams_hc', 't90am', 'leo2_improved'];
  const seats = [
    ...[0, 1, 2, 3, 4].map((index) => ({ seat: index, playerId: `p${index}`, name: `P${index}`, team: index % 2 ? 'bravo' : 'alpha', specId: specs[index % 3] })),
    { seat: 9, playerId: 'watch', name: 'Watch', team: 'spectator', specId: '' },
  ];
  const bots = [];
  for (const team of ['alpha', 'bravo']) for (let n = 0; n < (team === 'alpha' ? 4 : 5); n++) bots.push({ playerId: `bot-${team}-${n}`, name: `B${n}`, team, specId: specs[n % 3] });
  const a = room('snapshot', { seats, bots });
  const b = room('observe', { seats, bots });
  for (let n = 0; n < 1200; n++) {
    await a.tick(n);
    await b.tick(n);
    if (n % 60 === 0) await flush();
  }
  let frames = 0, keyframes = 0, shellsSeen = 0;
  for (let index = 0; index < seats.length; index++) {
    const left = a.clients[index].snapshots, right = b.clients[index].snapshots;
    assert.equal(right.length, left.length, `${seats[index].playerId}: as many snapshots`);
    for (let k = 0; k < left.length; k++) {
      assert.deepEqual(right[k], left[k], `${seats[index].playerId}: snapshot ${k} the same bytes`);
      frames++;
      if (left[k][10] & 1) keyframes++;
    }
    // the decoded stream carries shells in flight at some point (the views agree on them too)
    const history = new Map();
    for (const bytes of left) {
      const decoded = decodeMessage(bytes, { resolveBaseline: (tick) => history.get(tick) ?? null });
      const frame = applySnapshotPacket(decoded.message, decoded.message.keyframe ? null : history.get(decoded.message.baseTick) ?? null);
      history.set(frame.tick, frame);
      shellsSeen += frame.shells.length;
    }
  }
  assert.ok(shellsSeen > 0, `shells in flight were framed (${shellsSeen} shell rows)`);
  a.actor.stop(); b.actor.stop();
  console.log(`frameView.selftest: ${frames} frames (${keyframes} keyframes, ${shellsSeen} shell rows) the same bytes from the viewer snapshot and the view`);
}

// ---- a room past 32 hulls: a viewer last in the roster receives all of them, its own row included
{
  const seats = [];
  for (let index = 0; index < 40; index++) {
    seats.push({ seat: index, playerId: `s${index}`, name: `S${index}`, team: 'alpha', specId: 'm1a1_abrams_hc', spawn: { x: -300 + 12 * (index % 10), z: 12 * Math.floor(index / 10), yaw: 0 } });
  }
  const r = room('observe', { seats, bots: [], world: 'terrain' });
  for (let n = 0; n < 120; n++) { await r.tick(n); if (n % 30 === 0) await flush(); }
  const last = r.clients.at(-1);
  const history = new Map();
  let frame = null;
  for (const bytes of last.snapshots) {
    const decoded = decodeMessage(bytes, { resolveBaseline: (tick) => history.get(tick) ?? null });
    frame = applySnapshotPacket(decoded.message, decoded.message.keyframe ? null : history.get(decoded.message.baseTick) ?? null);
    history.set(frame.tick, frame);
  }
  const ownId = r.actor.wireIdOf('s39');
  assert.equal(frame.entities.length, 40, `the last viewer receives all 40 hulls (${frame.entities.length})`);
  assert.ok(frame.entities.some((row) => row.entityId === ownId), 'its own row among them');
  r.actor.stop();
  console.log('frameView.selftest: a viewer last in a 40-hull roster receives all 40 hulls, its own among them PASS');
}
