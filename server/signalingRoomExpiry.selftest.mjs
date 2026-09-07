import assert from 'node:assert/strict';
import {
  SignalingRoomStore, MAX_RETIRED_PEER_IDS,
  SIGNALING_DETACHED_GRACE_MS, SIGNALING_PEER_IDLE_TTL_MS,
} from './roomStore.ts';

const hostToken = 'a'.repeat(64);
const guestToken = 'b'.repeat(64);
const nextToken = 'c'.repeat(64);
function fixture(options = {}) {
  let now = 1000;
  const store = new SignalingRoomStore({ now: () => now, roomCodeFactory: () => 'LEASE1', ...options });
  const host = {};
  const room = store.create(host, { player: { id: 'host', name: 'Host' },
    nextResumeToken: hostToken, maxPlayers: 2 });
  const join = (connection, id = 'guest', proof = '', proposal = proof ? nextToken : guestToken) => store.join(connection, {
    roomCode: room.roomCode, player: { id, name: id }, resumeToken: proof,
    nextResumeToken: proposal,
  });
  const guest = {};
  join(guest);
  return { store, host, guest, room, join, time: () => now, advance: (delta) => { now += delta; } };
}
const code = (expected) => (error) => error.code === expected;

{
  const f = fixture();
  f.store.detach(f.host);
  assert.equal(f.store.nextExpiryAt(), f.time() + SIGNALING_DETACHED_GRACE_MS);
  for (let index = 0; index < 3; index++) {
    f.advance(29_999);
    f.store.poll(f.guest);
    assert.deepEqual(f.store.sweepExpired(), []);
  }
  f.advance(3);
  assert.throws(() => f.store.poll(f.guest), code('room_not_found'), 'guest cannot renew a dead host');
  const expired = f.store.sweepExpired();
  assert.equal(expired.length, 2);
  assert.ok(expired.every((event) => event.message.type === 'room_closed'
    && event.message.payload.reason === 'expired' && event.message.payload.detail === 'host_timeout'));
  assert.equal(f.store.rooms.size, 0);
  assert.equal(f.store.membership.size, 0);
  assert.equal(f.store.nextExpiryAt(), null);
  assert.deepEqual(f.store.sweepExpired(), [], 'expiry is exactly once');
}

{
  const f = fixture();
  f.advance(SIGNALING_PEER_IDLE_TTL_MS - 1);
  f.store.poll(f.guest);
  f.advance(1);
  assert.throws(() => f.store.poll(f.host), code('room_not_found'), 'half-open host cannot revive its expired lease');
  assert.throws(() => f.join({}, 'newcomer'), code('room_not_found'), 'new guest cannot revive a dead host');
  assert.equal(f.store.sweepExpired().length, 2);
}

{
  const f = fixture();
  f.store.detach(f.guest);
  f.advance(SIGNALING_DETACHED_GRACE_MS - 1);
  const replacement = {};
  f.join(replacement, 'guest', guestToken);
  f.store.detach(f.guest);
  f.advance(1);
  assert.deepEqual(f.store.sweepExpired(), [], 'on-time resume and stale close preserve the replacement');
  assert.equal(f.store.membership.has(replacement), true);
  assert.equal(f.store.rooms.get('LEASE1').peers.get('guest').lastActivityAt, f.time() - 1);
}

{
  const f = fixture();
  f.advance(170_000);
  f.store.detach(f.guest);
  assert.equal(f.store.nextExpiryAt(), 181_000, 'late detach cannot extend the original silence lease');
  f.store.poll(f.host);
  f.advance(10_000);
  const notices = f.store.sweepExpired();
  assert.equal(notices.find((entry) => entry.connection === f.host).message.type, 'peer_left');
  assert.equal(f.store.rooms.get('LEASE1').peers.size, 1);
}

{
  const f = fixture();
  f.advance(SIGNALING_PEER_IDLE_TTL_MS - 1);
  f.store.poll(f.host);
  f.advance(1);
  assert.throws(() => f.store.relay(f.host, { roomCode: 'LEASE1', toPeerId: 'guest',
    signal: { kind: 'restart' } }), code('peer_not_found'), 'expired target must not revoke the healthy sender');
  assert.deepEqual(f.store.poll(f.host), []);
  assert.throws(() => f.store.poll(f.guest), code('resume_denied'));
  assert.throws(() => f.store.relay(f.guest, { roomCode: 'LEASE1', toPeerId: 'host',
    signal: { kind: 'restart' } }), code('resume_denied'));
  assert.throws(() => f.join({}, 'guest', guestToken), code('resume_denied'));
  const notices = f.store.sweepExpired();
  assert.equal(notices.find((entry) => entry.connection === f.guest).message.type, 'room_closed');
  assert.equal(notices.find((entry) => entry.connection === f.guest).message.payload.reason, 'expired');
  assert.equal(notices.find((entry) => entry.connection === f.host).message.type, 'peer_left');
  assert.throws(() => f.join({}, 'guest', '', nextToken), code('resume_denied'), 'public retired ID is not authority');
  const newcomer = {};
  f.join(newcomer, 'newcomer');
  assert.throws(() => f.join({}, 'guest', guestToken), code('room_full'), 'proof does not exceed physical capacity');
  f.store.leave(newcomer);
  const returning = {};
  f.join(returning, 'guest', guestToken);
  assert.equal(f.store.rooms.get('LEASE1').retiredPeers.size, 0);
  assert.equal(f.store.membership.has(returning), true);
  f.store.leave(returning);
  f.join({}, 'guest');
  assert.equal(f.store.rooms.get('LEASE1').retiredPeers.size, 0, 'explicit leave retains existing fresh-join semantics');
}

{
  const f = fixture();
  const snapshot = f.store.exportState((connection) => connection === f.host ? 'host' : 'guest');
  f.advance(170_000);
  const restored = new SignalingRoomStore({ now: f.time });
  restored.restoreState(snapshot, () => null);
  assert.equal(restored.nextExpiryAt(), 181_000, 'missing socket does not acquire a fresh detach grace on restore');
  const live = new SignalingRoomStore({ now: f.time });
  live.restoreState(snapshot, (id) => id === 'host' ? f.host : f.guest);
  assert.equal(live.recoverActivity({}, f.time()), false);
  assert.equal(live.recoverActivity(f.host, NaN), false);
  assert.equal(live.recoverActivity(f.host, 169_000), true);
  assert.equal(live.recoverActivity(f.guest, 170_000), true);
  assert.equal(live.recoverActivity(f.host, 2000), true);
  assert.equal(live.nextExpiryAt(), 349_000, 'only saved socket activity extends a restored lease');
  delete snapshot.rooms[0].peers[0].lastActivityAt;
  delete snapshot.rooms[0].peers[1].lastActivityAt;
  snapshot.rooms[0].peers[1].disconnectedAt = 2000;
  const legacy = new SignalingRoomStore({ now: f.time });
  legacy.restoreState(snapshot, () => null);
  assert.equal(legacy.nextExpiryAt(), 92_000, 'legacy detached clock is not reset on deployment');
}

{
  const f = fixture({ roomTtlMs: 500 });
  f.advance(500);
  const expired = f.store.sweepExpired();
  assert.ok(expired.every((entry) => entry.message.payload.reason === 'expired'
    && entry.message.payload.detail === undefined), 'room TTL retains precedence');
}

{
  const f = fixture();
  f.store.leave(f.guest);
  for (let index = 0; index < MAX_RETIRED_PEER_IDS; index++) {
    const guest = {};
    f.join(guest, `guest${index}`);
    f.store.detach(guest);
    f.advance(SIGNALING_DETACHED_GRACE_MS);
    f.store.poll(f.host);
    f.store.sweepExpired();
  }
  const room = f.store.rooms.get('LEASE1');
  assert.equal(room.retiredPeers.size, MAX_RETIRED_PEER_IDS);
  assert.equal(room.peers.size, 1);
  assert.throws(() => f.join({}, 'novel'), code('room_full'), 'full identity budget never evicts proof');
  assert.throws(() => f.join({}, 'guest0', '', nextToken), code('resume_denied'));
  const saved = f.store.exportState(() => 'host');
  assert.equal(JSON.stringify(saved).includes(guestToken), false);
  const restored = new SignalingRoomStore({ now: f.time });
  restored.restoreState(saved, () => f.host);
  assert.equal(restored.rooms.get('LEASE1').retiredPeers.size, MAX_RETIRED_PEER_IDS);
  assert.throws(() => restored.join({}, { roomCode: 'LEASE1', player: { id: 'guest0', name: 'Guest' },
    nextResumeToken: nextToken }), code('resume_denied'));
  f.join({}, 'guest0', guestToken);
  assert.equal(room.retiredPeers.size, MAX_RETIRED_PEER_IDS - 1);
  assert.equal(room.peers.size, 2);
}

assert.throws(() => new SignalingRoomStore({ detachedGraceMs: 0 }), TypeError);
assert.throws(() => new SignalingRoomStore({ peerIdleTtlMs: Infinity }), TypeError);
console.log('signalingRoomExpiry.selftest: detached/silent expiry, own activity, restore clocks, exact fences and bounded retired proofs passed');
