// Proof (implicit state machine audit M2, 2026-11-02): the room's lock and its start.
// 1. `settings.locked` was both the admin's `set_locked` switch and the "no joining while starting or playing" lock:
//    planStart set it, abortStart and finishMatch cleared it, so a room its admin locked unlocked itself after every
//    match and every aborted start. The admin's lock is the admin's alone now; the round's lock is the room's phase.
// 2. `startMatch` awaited the match host's start and then issued seat tokens and recorded the match on the room it read
//    before the await. Where the actor's host does not hold the room's other events behind the start (a Durable
//    Object's input gate opens across a non-storage await; the LAN service queues each room's events since mp-migration's
//    S1, server/rooms/localRoomService.ts serialize()) a leave or a kick lands inside that await: the departed seat was
//    handed a token for a match it is not in.
// 3. (round 2 U6/Q3) a room persisted before the split, admin-locked while waiting, unlocked at its first touch after
//    the deploy: the restore filled no adminLocked.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { RoomActor } from './roomActor.ts';
import { ROOM_MATCH_POLL_MS } from './protocol.ts';
import { createRoom, joinRoom, applyRoomCommand, planStart, abortStart, recordMatch, markMatchPlaying, finishMatch } from './roomPolicy.ts';
import { signSeatToken } from '../../../server/match/seatToken.ts';

const SECRET = 'room-lock-receipt-secret-0123456789abcdef';
const T0 = 1_700_000_000_000;
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const token = (seed) => seed.repeat(64).slice(0, 64);
const identity = (id, resume, next) => ({ roomCode: 'LOCK01', player: { id, name: id }, resumeToken: resume, nextResumeToken: next, selection: { specId: 'm1a1_abrams_hc' } });
const reject = (fn, code) => assert.throws(fn, (error) => error?.code === code, `expected ${code}`);

// ---- the policy: the admin's lock outlives the round; the round's own lock is the phase
{
  const room = createRoom({ roomCode: 'LOCK01', mode: 'private', creator: { id: 'admin', name: 'Admin' }, selection: { specId: 'm1a1_abrams_hc' }, settings: { teamSize: 2, mapId: 'verdant' }, now: T0 });
  joinRoom(room, { player: { id: 'guest', name: 'Guest' }, selection: { specId: 't90am' }, now: T0 + 1 });
  for (const id of ['admin', 'guest']) applyRoomCommand(room, id, { type: 'set_ready', ready: true }, T0 + 2);
  // an unlocked room refuses a fresh join only while a round starts or plays
  planStart(room, { seed: 1, now: T0 + 3 });
  reject(() => joinRoom(room, { player: { id: 'late1', name: 'Late' }, now: T0 + 4 }), 'room_locked');
  recordMatch(room, { id: 'm1', round: 1, mapId: 'verdant', seed: 1, startedAt: T0 + 5 }, T0 + 5);
  markMatchPlaying(room, T0 + 6);
  reject(() => joinRoom(room, { player: { id: 'late2', name: 'Late' }, now: T0 + 7 }), 'room_locked');
  finishMatch(room, { status: 'ended', result: 'alpha', reason: 'elimination' }, T0 + 8);
  assert.equal(room.settings.locked, false, 'nobody locked this room');
  joinRoom(room, { player: { id: 'late3', name: 'Late' }, now: T0 + 9 });
  applyRoomCommand(room, 'late3', { type: 'set_team', team: 'spectator' }, T0 + 10);

  // the admin locks it: the lock holds through a round and past its end, and through an aborted start
  applyRoomCommand(room, 'admin', { type: 'set_locked', locked: true }, T0 + 11);
  for (const id of ['admin', 'guest']) applyRoomCommand(room, id, { type: 'set_ready', ready: true }, T0 + 12);
  planStart(room, { seed: 2, now: T0 + 13 });
  recordMatch(room, { id: 'm2', round: 2, mapId: 'verdant', seed: 2, startedAt: T0 + 14 }, T0 + 14);
  finishMatch(room, { status: 'lost', reason: 'match_lost' }, T0 + 15);
  assert.equal(room.settings.locked, true, 'the admin\'s lock outlives the round it locked through');
  reject(() => joinRoom(room, { player: { id: 'late4', name: 'Late' }, now: T0 + 16 }), 'room_locked');
  for (const id of ['admin', 'guest']) applyRoomCommand(room, id, { type: 'set_ready', ready: true }, T0 + 17);
  planStart(room, { seed: 3, now: T0 + 18 });
  abortStart(room, T0 + 19);
  assert.equal(room.phase, 'waiting');
  assert.equal(room.settings.locked, true, 'an aborted start keeps the admin\'s lock');
  reject(() => joinRoom(room, { player: { id: 'late5', name: 'Late' }, now: T0 + 20 }), 'room_locked');
  applyRoomCommand(room, 'admin', { type: 'set_locked', locked: false }, T0 + 21);
  joinRoom(room, { player: { id: 'late6', name: 'Late' }, now: T0 + 22 });
}

// ---- the actor: a start whose match host answers later; a seat that leaves (or is kicked) inside that await
function harness() {
  let now = T0;
  const sent = new Map();
  let release = null;
  const matchHost = {
    transport: 'service', calls: [], stopped: [],
    start(config) { this.calls.push(config); return new Promise((resolve) => { release = () => resolve({ matchUrl: `/rooms/${config.roomId}/match` }); }); },
    async status() { return { roomId: 'LOCK01', matchId: 'x', phase: 'countdown', verdict: null }; },
    async stop(roomId) { this.stopped.push(roomId); },
  };
  let seed = 0;
  const actor = new RoomActor('LOCK01', {
    now: () => now, random: () => ((seed = (seed * 1103515245 + 12345) >>> 0) % 1000) / 1000, sha256Hex: sha256, seatSecret: SECRET, signSeatToken, matchHost,
    send(socketId, message) { if (!sent.has(socketId)) sent.set(socketId, []); sent.get(socketId).push(message); },
    closeSocket() {}, schedule() {}, persist() {},
  });
  const send = (socketId, type, payload = {}, requestId = `r${++seed}`) => actor.handleMessage(socketId, JSON.stringify({ type, requestId, payload }));
  const last = (socketId, type) => (sent.get(socketId) ?? []).filter((m) => m.type === type).at(-1) ?? null;
  return { actor, matchHost, send, last, release: () => release(), advance: async (ms) => { now += ms; await actor.tick(); } };
}
{
  const h = harness();
  h.actor.handleOpen('a'); await h.send('a', 'room_create', { ...identity('admin', token('a'), token('b')), mode: 'lan', settings: { teamSize: 2, mapId: 'verdant' } });
  h.actor.handleOpen('g'); await h.send('g', 'room_join', identity('guest', token('c'), token('d')));
  h.actor.handleOpen('k'); await h.send('k', 'room_join', identity('third', token('e'), token('f')));
  await h.send('a', 'room_command', { command: { type: 'set_locked', locked: true } });
  for (const socket of ['a', 'g', 'k']) await h.send(socket, 'room_command', { command: { type: 'set_ready', ready: true } });
  // driven as a host that hands each event to the actor without waiting for the one before (not the LAN service's queue)
  const starting = h.send('a', 'room_command', { command: { type: 'start' } }, 'start');
  await Promise.resolve();
  assert.equal(h.matchHost.calls.length, 1, 'the match host was asked');
  await h.send('g', 'room_leave', {}, 'leave');
  await h.send('a', 'room_command', { command: { type: 'kick', playerId: 'third' } }, 'kick');
  h.release();
  await starting;
  const state = h.actor.exportState();
  assert.deepEqual(Object.keys(state.matchTokens).sort(), ['admin'],
    `only seats still in the room hold a match token (held: ${Object.keys(state.matchTokens).join(', ')})`);
  assert.equal(h.last('a', 'match_start')?.payload.matchUrl, '/rooms/LOCK01/match', 'the admin still enters the match');
  // the round ends: the room keeps its admin's lock
  await h.advance(ROOM_MATCH_POLL_MS);
  h.matchHost.status = async () => ({ roomId: 'LOCK01', matchId: 'x', phase: 'ended', verdict: { result: 'alpha', reason: 'elimination' } });
  await h.advance(ROOM_MATCH_POLL_MS);
  assert.equal(h.actor.snapshot.phase, 'waiting');
  assert.equal(h.actor.snapshot.settings.locked, true, 'the match end left the admin\'s lock on');
  h.actor.handleOpen('n'); await h.send('n', 'room_join', identity('newcomer', token('1'), token('2')));
  assert.equal(h.last('n', 'error')?.payload.code, 'room_locked', 'a locked room refuses a fresh join after its match too');
}
{
  // every seat left inside the await: the started match is stopped, nothing is recorded
  const h = harness();
  h.actor.handleOpen('a'); await h.send('a', 'room_create', { ...identity('admin', token('a'), token('b')), mode: 'lan', settings: { teamSize: 2, mapId: 'verdant' } });
  await h.send('a', 'room_command', { command: { type: 'set_ready', ready: true } });
  const starting = h.send('a', 'room_command', { command: { type: 'start' } }, 'start');
  await Promise.resolve();
  await h.send('a', 'room_leave', {}, 'leave');
  h.release();
  await starting;
  assert.equal(h.actor.snapshot.match, null, 'no match is recorded for a room nobody is left in');
  assert.equal(h.actor.snapshot.phase, 'waiting');
  assert.deepEqual(Object.keys(h.actor.exportState().matchTokens), []);
  assert.deepEqual(h.matchHost.stopped, ['LOCK01'], 'the match the host started is stopped');
}
{
  // (round 2 U6/Q3) a room persisted before the split kept the admin's lock in `locked` alone. While the room waits that
  // is exactly the admin's switch (the round's lock was cleared at every match end and aborted start), so the restore
  // keeps it; before, joinLocked read the absent adminLocked as unlocked and the first touch after the deploy opened it.
  const preSplit = (phase, locked) => {
    const h = harness();
    h.actor.handleOpen('a');
    return h.send('a', 'room_create', { ...identity('admin', token('a'), token('b')), mode: 'lan', settings: { teamSize: 2, mapId: 'verdant' } }).then(() => {
      const state = h.actor.exportState();
      state.room.phase = phase;
      state.room.settings.locked = locked;
      delete state.room.settings.adminLocked;
      const restored = harness();
      restored.actor.restore(state);
      restored.actor.settleAfterRestore();
      return restored;
    });
  };
  const waitingLocked = await preSplit('waiting', true);
  assert.equal(waitingLocked.actor.snapshot.settings.adminLocked, true, 'a waiting room locked before the split restores with the admin\'s lock');
  waitingLocked.actor.handleOpen('n'); await waitingLocked.send('n', 'room_join', identity('newcomer', token('1'), token('2')));
  assert.equal(waitingLocked.last('n', 'error')?.payload.code, 'room_locked', 'the restored admin lock refuses a fresh join after the first touch');
  assert.equal(waitingLocked.actor.snapshot.settings.locked, true, 'the first touch after the deploy keeps the room locked');
  const waitingOpen = await preSplit('waiting', false);
  assert.equal(waitingOpen.actor.snapshot.settings.adminLocked, false, 'an unlocked waiting room restores unlocked');
  // a room written mid-round cannot tell the admin's lock from the round's; before the split its round end cleared both
  const playing = await preSplit('playing', true);
  assert.equal(playing.actor.snapshot.settings.adminLocked, false, 'a room written mid-round restores with no admin lock, as its round end would have left it');
}
console.log('roomLock.selftest: the admin\'s lock outlives rounds and aborted starts and a deploy; a start re-reads the room after the match host answers');
