import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { CLOSE_REASON, MESSAGE_TYPE, NO_TICK, PROTOCOL_VERSION } from '../../src/mp/wire/constants.ts';
import { applySnapshotPacket, decodeMessage, encodeMessage } from '../../src/mp/wire/codec.ts';
import { createLocalRoomService } from './localRoomService.ts';
import { silentLogger } from './log.ts';
import { createMatchService } from './service.ts';
import { signSeatToken } from './seatToken.ts';

const secret = 'service-selftest-secret-0123456789';
const service = await createMatchService({ host: '127.0.0.1', port: 0, allowedOrigins: ['https://tanks.example'], seatSecret: secret, log: silentLogger, maxActors: 4 });
const rooms = createLocalRoomService({ service, seatSecret: secret });
const room = rooms.createRoom({
  roomId: 'svc-room', mapId: 'verdant', seed: 11, countdownS: 0, world: 'terrain',
  seats: [
    { playerId: 'alice', name: 'Alice', team: 'alpha', specId: 'm1a2' },
    { playerId: 'bob', name: 'Bob', team: 'bravo', specId: 't90m' },
    { playerId: 'eve', name: 'Eve', team: 'spectator', specId: '' },
  ],
  bots: [{ playerId: 'bot-1', name: 'Bot', team: 'alpha', specId: 'leo2a7v' }],
});
assert.equal(service.actors.size, 1);

/** Open a real socket, send one HELLO, collect decoded frames until closed or timeout. */
function connect({ origin = 'https://tanks.example', token, firstFrame = null, text = null } = {}) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(service.url, { origin, headers: origin ? { origin } : {} });
    socket.binaryType = 'nodebuffer';
    const result = { socket, messages: [], closeCode: null, closeReason: null, error: null, frames: [], history: new Map(), missing: 0, welcome: null };
    socket.on('error', (error) => { result.error = error; resolve(result); });
    socket.on('open', () => {
      if (text != null) socket.send(text);
      else if (firstFrame) socket.send(firstFrame);
      else socket.send(encodeMessage({ type: MESSAGE_TYPE.HELLO, protocolVersion: PROTOCOL_VERSION, capabilities: 1, token, clientBuild: 'service-selftest' }));
      resolve(result);
    });
    socket.on('message', (raw, isBinary) => {
      if (!isBinary) return;
      const decoded = decodeMessage(new Uint8Array(raw), { resolveBaseline: (tick) => result.history.get(tick) ?? null });
      assert.ok(decoded.ok, `client decodes server frames (${decoded.ok ? '' : decoded.error.code})`);
      result.messages.push(decoded.message);
      if (decoded.message.type === MESSAGE_TYPE.WELCOME) result.welcome = decoded.message;
      if (decoded.message.type === MESSAGE_TYPE.SNAPSHOT) {
        try {
          const frame = applySnapshotPacket(decoded.message, decoded.message.keyframe ? null : result.history.get(decoded.message.baseTick) ?? null);
          result.frames.push(frame);
          result.history.set(frame.tick, frame);
          socket.send(encodeMessage({ type: MESSAGE_TYPE.SNAPSHOT_ACK, tick: frame.tick }));
        } catch (error) {
          if (error?.code === 'missing_baseline') result.missing++; else throw error;
        }
      }
    });
    socket.on('close', (code, reason) => { result.closeCode = code; result.closeReason = String(reason); });
    setTimeout(() => reject(new Error('connect timeout')), 5000).unref();
  });
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const closeOf = (result) => result.messages.find((message) => message.type === MESSAGE_TYPE.CLOSE) ?? null;

// A seated player and a spectator over real sockets: welcome, 30 Hz snapshots, acks, deltas, pong, healthz/metrics.
const alice = await connect({ token: room.tokens.get('alice') });
const eve = await connect({ token: room.tokens.get('eve') });
await sleep(1100);
assert.ok(alice.welcome && alice.welcome.entityId === 1 && alice.welcome.roomId === 'svc-room', 'alice is welcomed into her seat');
assert.ok(eve.welcome && eve.welcome.entityId === 0, 'eve spectates');
assert.ok(alice.frames.length >= 26 && alice.frames.length <= 36, `alice received ${alice.frames.length} snapshots in ~1 s`);
assert.equal(alice.missing, 0);
assert.ok(alice.messages.filter((m) => m.type === MESSAGE_TYPE.SNAPSHOT && !m.keyframe).length >= 20, 'acknowledged baselines turn snapshots into deltas');
alice.socket.send(encodeMessage({ type: MESSAGE_TYPE.PING, clientTimeMs: 4321, snapshotAckTick: NO_TICK }));
// a real client streams controls every tick; a single frame would be released by the 500 ms lease
const drive = setInterval(() => {
  if (alice.socket.readyState !== alice.socket.OPEN) return;
  const controls = [];
  for (let n = 0; n < 3; n++) controls.push({ throttle: 127, steer: 0, flags: 0, aimYaw: 0, aimPitch: 0, aimDistance: 4000, shellSlot: 0, fireSeq: 0, actionSeq: 0, actionBits: 0 });
  alice.socket.send(encodeMessage({ type: MESSAGE_TYPE.INPUT, clientTick: room.actor.tick + 2, snapshotAckTick: NO_TICK, interpDelayMs: 80, controls }));
}, 1000 / 60);
await sleep(900);
clearInterval(drive);
assert.ok(alice.messages.some((m) => m.type === MESSAGE_TYPE.PONG && m.clientTimeMs === 4321), 'ping answered');
assert.ok(room.actor.authority.entityById.get('alice').state.speed > 0.5, 'input over the socket drives the tank');
const health = await (await fetch(`http://127.0.0.1:${service.address.port}/healthz`)).json();
assert.equal(health.ok, true);
assert.equal(health.actors, 1);
assert.equal(health.clients, 2);
const metrics = await (await fetch(`http://127.0.0.1:${service.address.port}/metrics`)).json();
assert.equal(metrics.actors.length, 1);
assert.ok(metrics.actors[0].tickMs.p95 >= 0 && metrics.service.rssMb > 0 && metrics.actors[0].snapshots > 40);
assert.equal((await fetch(`http://127.0.0.1:${service.address.port}/nope`)).status, 404);
console.log(`service.selftest: real sockets welcomed, ${alice.frames.length} snapshots in ~2 s, deltas after acks, pong, healthz/metrics ok`);

// Admission failures answer with typed CLOSE frames, never a hang.
const badToken = await connect({ token: 'not.a.token' });
await sleep(200);
assert.equal(closeOf(badToken)?.reason, CLOSE_REASON.BAD_TOKEN);
assert.ok(badToken.closeCode === 1000, 'the socket is closed cleanly after CLOSE');
const expiredToken = signSeatToken(secret, { ...room.claims.get('bob'), iat: Date.now() - 20_000, exp: Date.now() - 10_000 });
const expired = await connect({ token: expiredToken });
await sleep(200);
assert.equal(closeOf(expired)?.reason, CLOSE_REASON.TOKEN_EXPIRED);
const otherRoom = signSeatToken(secret, { ...room.claims.get('bob'), roomId: 'no-such-room' });
const unknown = await connect({ token: otherRoom });
await sleep(200);
assert.equal(closeOf(unknown)?.reason, CLOSE_REASON.ROOM_UNKNOWN);
const notHello = await connect({ firstFrame: encodeMessage({ type: MESSAGE_TYPE.PING, clientTimeMs: 1, snapshotAckTick: NO_TICK }) });
await sleep(200);
assert.equal(closeOf(notHello)?.reason, CLOSE_REASON.HELLO_REQUIRED);
const textFrame = await connect({ text: 'hello?' });
await sleep(200);
assert.equal(closeOf(textFrame)?.reason, CLOSE_REASON.MALFORMED);
const wrongOrigin = await connect({ origin: 'https://evil.example', token: room.tokens.get('bob') });
await sleep(200);
assert.ok(wrongOrigin.error || wrongOrigin.closeCode, 'a foreign origin never completes the upgrade');
assert.equal(wrongOrigin.welcome, null);
const noOrigin = await connect({ origin: null, token: room.tokens.get('bob') });
await sleep(200);
assert.equal(noOrigin.welcome, null, 'a missing origin is refused while an allowlist is configured');
assert.ok(service.stats().rejectedHellos >= 4 && service.stats().rejectedUpgrades >= 2, JSON.stringify(service.stats()));
console.log('service.selftest: bad, expired and foreign-room tokens, non-hello and text first frames, foreign origins all rejected with typed reasons');

// A reconnecting seat replaces the earlier socket; a departed seat leaves the match running.
const bob = await connect({ token: room.tokens.get('bob') });
await sleep(300);
assert.ok(bob.welcome && bob.welcome.entityId === 2);
const bobAgain = await connect({ token: rooms.issueToken(room, 'bob') });
await sleep(300);
assert.equal(closeOf(bob)?.reason, CLOSE_REASON.REPLACED);
assert.ok(bobAgain.welcome, 'the replacement is welcomed');
bobAgain.socket.send(encodeMessage({ type: MESSAGE_TYPE.LEAVE, reason: CLOSE_REASON.CLIENT_LEAVE }));
await sleep(300);
assert.equal(closeOf(bobAgain)?.reason, CLOSE_REASON.CLIENT_LEAVE);
const tickBefore = room.actor.tick;
await sleep(300);
assert.ok(room.actor.tick > tickBefore + 10, 'the match keeps ticking after departures');
assert.ok(alice.frames.at(-1).tick > tickBefore, 'alice still receives snapshots');
console.log('service.selftest: seat replacement and leave over sockets; the match runs on');

// Capacity and duplicate rooms are refused; drain closes every client with SERVER_DRAIN and stops the listeners.
assert.throws(() => rooms.createRoom({ roomId: 'svc-room', mapId: 'verdant', seats: [{ playerId: 'x', name: 'x', team: 'alpha', specId: 'm1a2' }], world: 'terrain' }), /already has a match/);
for (let index = 0; index < 3; index++) {
  rooms.createRoom({ roomId: `filler-${index}`, mapId: 'verdant', seats: [{ playerId: 'f', name: 'f', team: 'alpha', specId: 'm1a2' }], world: 'terrain' });
}
assert.throws(() => rooms.createRoom({ roomId: 'one-too-many', mapId: 'verdant', seats: [{ playerId: 'f', name: 'f', team: 'alpha', specId: 'm1a2' }], world: 'terrain' }), /full/);
await service.close();
await sleep(200);
assert.equal(closeOf(alice)?.reason, CLOSE_REASON.SERVER_DRAIN);
assert.equal(closeOf(eve)?.reason, CLOSE_REASON.SERVER_DRAIN);
assert.ok(alice.closeCode != null && eve.closeCode != null, 'sockets are closed after the drain');
assert.equal(service.draining, true);
assert.equal(room.actor.stopped, true);
await assert.rejects(fetch(`http://127.0.0.1:${service.address.port}/healthz`), 'the listener is gone');
console.log('service.selftest: capacity enforced, drain closed every client with SERVER_DRAIN and released the port');
