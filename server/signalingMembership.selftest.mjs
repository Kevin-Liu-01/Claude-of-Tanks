import assert from 'node:assert/strict';
import { SignalingRoomStore } from './roomStore.ts';
import { SignalingResumeCredentials } from '../src/net/signalingResumeCredentials.ts';

const store = new SignalingRoomStore();
const host = {};
const created = store.create(host, { player: { id: 'owner', name: 'Host' }, sessionId: 'owner-session' });
assert.match(created.resumeToken, /^[a-f0-9]{64}$/);
const guest = {};
const joined = store.join(guest, { roomCode: created.roomCode,
  player: { id: 'guest', name: 'Guest' }, sessionId: 'guest-session' });
assert.equal(JSON.stringify(joined.result.peers).includes(created.resumeToken), false);
assert.equal(JSON.stringify(joined.notify).includes('resumeToken'), false);
assert.equal(JSON.stringify([...store.rooms.values()][0].peers.get('owner')).includes(created.resumeToken), false,
  'stored membership retains a hash, not the bearer capability');

for (const resumeToken of [undefined, '', 'f'.repeat(64)]) {
  const attacker = {};
  assert.throws(() => store.join(attacker, { roomCode: created.roomCode,
    player: { id: 'owner', name: 'Imposter' }, sessionId: 'guessed-session', resumeToken }),
  (error) => error.code === 'resume_denied');
  assert.deepEqual(store.leave(attacker), []);
  assert.equal(store.membership.has(host), true);
  assert.equal(store.rooms.has(created.roomCode), true, 'guessing host identity cannot close its room');
}

const resume = { roomCode: created.roomCode, player: { id: 'owner', name: 'Host' },
  sessionId: 'owner-new-session', resumeToken: created.resumeToken, nextResumeToken: 'a'.repeat(64) };
const recovered = {};
store.join(recovered, resume);
assert.equal(store.membership.has(host), false, 'replacement fences the retired connection');
assert.throws(() => store.relay(host, { roomCode: created.roomCode, toPeerId: 'guest',
  signal: { kind: 'restart' } }), (error) => error.code === 'not_in_room');
assert.throws(() => store.poll(host), (error) => error.code === 'resume_denied');
assert.deepEqual(store.leave(host), []);
assert.deepEqual(store.detach(host), []);
assert.ok(store.rooms.has(created.roomCode));
assert.throws(() => store.join({}, { ...resume, nextResumeToken: 'b'.repeat(64) }),
  (error) => error.code === 'resume_denied', 'an old token cannot rotate away its successor');
const retryConnection = {};
const retry = store.join(retryConnection, resume);
assert.equal(retry.result.resumeToken, resume.nextResumeToken,
  'a lost rotation response is safely replayable with its persisted next capability');
assert.deepEqual(store.leave(recovered), []);
assert.deepEqual(store.poll(retryConnection), []);

store.leave(guest);
const newGuest = {};
store.join(newGuest, { roomCode: created.roomCode, player: { id: 'guest', name: 'New guest' },
  sessionId: 'fresh-guest-session' });
assert.throws(() => store.join({}, { roomCode: created.roomCode,
  player: { id: 'guest', name: 'Old guest' }, sessionId: 'old-guest-session',
  resumeToken: joined.result.resumeToken }), (error) => error.code === 'resume_denied',
  'a departed player token cannot take over a newly occupied seat');
const closed = store.leave(retryConnection);
assert.equal(closed[0].message.payload.reason, 'host_left');
assert.equal(store.rooms.size, 0);

const values = new Map();
const storage = { getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value) };
const key = JSON.stringify(['wss://signal.example/signal', 'ABC234', 'owner']);
const credentials = new SignalingResumeCredentials(storage);
const first = credentials.prepare(key);
const reloadBeforeAck = new SignalingResumeCredentials(storage);
assert.deepEqual(reloadBeforeAck.prepare(key), first,
  'reload after uncertain admission preserves exactly the already-proposed credential');
reloadBeforeAck.accept(key, first.nextResumeToken);
const afterReload = new SignalingResumeCredentials(storage).prepare(key);
assert.equal(afterReload.resumeToken, first.nextResumeToken);
assert.notEqual(afterReload.nextResumeToken, first.nextResumeToken);
const alternate = credentials.prepare(JSON.stringify(['wss://other.example/signal', 'ABC234', 'owner']));
assert.equal(alternate.resumeToken, '', 'credentials are isolated by endpoint, room and player');
assert.equal(JSON.parse([...values.values()][0]).find((entry) => entry.key === key).current ===
  first.nextResumeToken, true, 'a stale client writing another room cannot roll back newer stored credentials');
assert.throws(() => credentials.prepare(key), (error) => error.code === 'resume_denied',
  'retired automatic resume must not overwrite the newer same-tab capability before server rejection');
credentials.forget(key);
assert.equal(JSON.parse([...values.values()][0]).some((entry) => entry.key === key), true,
  'retired client cleanup cannot delete a successor credential in the same tab');
const rotated = new SignalingResumeCredentials(storage);
for (let index = 0; index < 40; index++) rotated.prepare(`room-${index}`);
assert.equal(JSON.parse([...values.values()][0]).length, 16, 'tab credential persistence is bounded');

{
  const shared = new Map();
  const disk = { getItem: (name) => shared.get(name) ?? null,
    setItem: (name, value) => shared.set(name, value) };
  const staleEmpty = new SignalingResumeCredentials(disk);
  const initial = new SignalingResumeCredentials(disk);
  const proposal = initial.prepare(key);
  assert.throws(() => staleEmpty.prepare(key), (error) => error.code === 'resume_denied',
    'helper created before ownership existed cannot overwrite a later credential');
  const acceptedElsewhere = new SignalingResumeCredentials(disk);
  acceptedElsewhere.accept(key, proposal.nextResumeToken);
  const successor = new SignalingResumeCredentials(disk);
  const next = successor.prepare(key);
  assert.throws(() => initial.accept(key, proposal.nextResumeToken),
    (error) => error.code === 'resume_denied', 'late ACK cannot erase successor pending rotation');
  successor.accept(key, next.nextResumeToken);
  assert.throws(() => initial.accept(key, proposal.nextResumeToken),
    (error) => error.code === 'resume_denied', 'late ACK cannot roll back an accepted successor');
  initial.forget(key);
  const beforeRace = new SignalingResumeCredentials(disk);
  const winnerProposal = beforeRace.prepare(key);
  const saved = JSON.parse([...shared.values()][0]);
  saved[0].next = 'd'.repeat(64);
  disk.setItem([...shared.keys()][0], JSON.stringify(saved));
  const loser = new SignalingResumeCredentials(disk);
  beforeRace.accept(key, winnerProposal.nextResumeToken);
  assert.throws(() => loser.accept(key, 'd'.repeat(64)), (error) => error.code === 'resume_denied');
  loser.forget(key);
  assert.equal(new SignalingResumeCredentials(disk).prepare(key).resumeToken ===
    winnerProposal.nextResumeToken, true,
  'admitted winner overrides competing pending proposal, and losing cleanup preserves winner');
}

console.log('signalingMembership.selftest: takeover denial, response-loss-safe rotation, old-connection fences, and reload persistence passed');
