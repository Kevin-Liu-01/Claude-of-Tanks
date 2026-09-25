// RoomActor receipt: the room lifecycle on fake ports — admission with resume
// capabilities (hashes only), replacement of an old socket, admin migration
// (explicit leave at once, disconnect after the 30 s grace), the match
// lifecycle (seat tokens, host start, per-seat match_start, polls, verdict,
// rematch, lost host), expiry, hibernation round trips, rate and auth limits.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { RoomActor } from './roomActor.ts';
import {
  ROOM_ADMIN_DISCONNECT_GRACE_MS, ROOM_IDLE_TTL_MS, ROOM_MATCH_POLL_MS, ROOM_RATE_MAX_MESSAGES, ROOM_UNAUTHENTICATED_TIMEOUT_MS,
} from './protocol.ts';
import { signSeatToken, verifySeatToken } from '../../../server/match/seatToken.ts';

const SECRET = 'room-actor-receipt-secret-0123456789';
const T0 = 1_700_000_000_000;

function createHarness({ code = 'ROOM01', host = null } = {}) {
  let now = T0;
  const sent = new Map();          // socketId -> envelopes
  const closed = new Map();        // socketId -> reason
  let scheduledAt = null;
  let persists = 0;
  let seedTick = 0;
  const matchHost = host ?? {
    calls: [], statusValue: { phase: 'countdown', verdict: null }, fail: false,
    async start(config) { this.calls.push(config); if (this.fail) throw new Error('host down'); return { matchUrl: `/rooms/${config.roomId}/match` }; },
    async status(roomId) { if (this.statusValue === 'throw') throw new Error('unreachable'); return this.statusValue ? { roomId, matchId: 'x', ...this.statusValue } : null; },
    async stop() {},
  };
  const ports = {
    now: () => now,
    random: () => ((seedTick = (seedTick * 1103515245 + 12345) >>> 0) % 1000) / 1000,
    sha256Hex: (text) => createHash('sha256').update(text).digest('hex'),
    signSeatToken: (claims) => signSeatToken(SECRET, claims),
    matchHost,
    send(socketId, message) { if (!sent.has(socketId)) sent.set(socketId, []); sent.get(socketId).push(message); },
    closeSocket(socketId, reason) { closed.set(socketId, reason); },
    schedule(atMs) { scheduledAt = atMs; },
    persist() { persists++; },
  };
  const actor = new RoomActor(code, ports);
  const drain = (socketId) => { const list = sent.get(socketId) ?? []; sent.set(socketId, []); return list; };
  const last = (socketId, type) => (sent.get(socketId) ?? []).filter((m) => m.type === type).at(-1) ?? null;
  const send = async (socketId, type, payload = {}, requestId) => { await actor.handleMessage(socketId, JSON.stringify({ type, requestId, payload })); };
  const advance = async (ms) => { now += ms; await actor.tick(); };
  return { actor, ports, matchHost, sent, closed, drain, last, send, advance, get now() { return now; }, set now(v) { now = v; }, get scheduledAt() { return scheduledAt; }, get persists() { return persists; } };
}

const token = (seed) => seed.repeat(64).slice(0, 64);
const identity = (id, resume = token('a'), next = token('b')) => ({ roomCode: 'ROOM01', player: { id, name: id }, resumeToken: resume, nextResumeToken: next, selection: { specId: 'm1a2' } });

// ---- admission, capabilities, replacement, chat
{
  const h = createHarness();
  h.actor.handleOpen('s1');
  await h.send('s1', 'room_join', identity('guest'), 'q0');
  assert.equal(h.last('s1', 'error').payload.code, 'room_not_found');
  await h.send('s1', 'room_create', { ...identity('admin'), mode: 'private', settings: { teamSize: 2, mapId: 'verdant' } }, 'q1');
  const created = h.last('s1', 'room_created');
  assert.equal(created.requestId, 'q1');
  assert.equal(created.payload.room.adminId, 'admin');
  assert.equal(created.payload.seat, 0);
  const state = h.actor.exportState();
  assert.equal(state.resumeHashes.admin, createHash('sha256').update(token('b')).digest('hex'), 'the NEXT capability is what resumes; only its hash is kept');
  assert.ok(!JSON.stringify(state).includes(token('a')) && !JSON.stringify(state).includes(token('b')), 'raw capabilities never persist');
  await h.send('s1', 'room_create', { ...identity('admin2'), mode: 'private' }, 'q2');
  assert.equal(h.last('s1', 'error').payload.code, 'already_joined');
  h.actor.handleOpen('s2');
  await h.send('s2', 'room_create', { ...identity('other'), mode: 'private' }, 'q3');
  assert.equal(h.last('s2', 'error').payload.code, 'room_code_exhausted');
  await h.send('s2', 'room_join', identity('guest', token('c'), token('d')), 'q4');
  const joined = h.last('s2', 'room_joined');
  assert.equal(joined.payload.room.players.length, 2);
  assert.equal(joined.payload.room.players[1].team, 'bravo', 'auto-balance');
  assert.equal(h.last('s1', 'room_state').payload.room.players.length, 2, 'others receive the state');
  // chat: bounded history replayed on join
  await h.send('s2', 'room_chat', { text: '  hello   there ' }, 'q5');
  assert.equal(h.last('s1', 'room_chat').payload.entry.text, 'hello there');
  assert.equal(h.last('s2', 'room_ack').requestId, 'q5');
  await h.send('s2', 'room_chat', { text: '' }, 'q6');
  assert.equal(h.last('s2', 'error').payload.code, 'chat_rejected');
  // resume from another socket with the rotated capability replaces the first socket
  h.actor.handleOpen('s3');
  await h.send('s3', 'room_join', identity('guest', token('d'), token('e')), 'q7');
  assert.equal(h.last('s3', 'room_joined').payload.playerId, 'guest');
  assert.deepEqual(h.last('s3', 'room_joined').payload.chat.map((e) => e.text), ['hello there'], 'history replays');
  assert.equal(h.closed.get('s2'), 'resume_denied');
  assert.equal(h.last('s2', 'error').payload.code, 'resume_denied');
  // a stranger with the same id but a foreign capability is refused; the old (pre-rotation) token no longer works
  h.actor.handleOpen('s4');
  await h.send('s4', 'room_join', identity('guest', token('f'), token('f')), 'q8');
  assert.equal(h.last('s4', 'error').payload.code, 'resume_denied');
  await h.send('s4', 'room_join', identity('guest', token('c'), token('c')), 'q9');
  assert.equal(h.last('s4', 'error').payload.code, 'resume_denied');
  await h.send('s4', 'room_join', { ...identity('bad', 'nothex'), }, 'q10');
  assert.equal(h.last('s4', 'error').payload.code, 'invalid_resume_token');
  // commands: readiness and a guest refused admin settings
  await h.send('s3', 'room_command', { command: { type: 'set_map', mapId: 'alpine' } }, 'q11');
  assert.equal(h.last('s3', 'error').payload.code, 'admin_only');
  await h.send('s3', 'room_command', { command: { type: 'set_ready', ready: true } }, 'q12');
  assert.equal(h.last('s3', 'room_ack').requestId, 'q12');
  assert.equal(h.last('s1', 'room_state').payload.room.players.find((p) => p.id === 'guest').ready, true);
  // an unauthenticated socket sending commands is not in the room
  await h.send('s4', 'room_command', { command: { type: 'set_ready', ready: true } }, 'q13');
  assert.equal(h.last('s4', 'error').payload.code, 'not_in_room');
  await h.send('s4', 'bogus_type', {}, 'q14');
  assert.equal(h.last('s4', 'error').payload.code, 'unknown_message');
  assert.ok(h.persists > 0);
}

// ---- match lifecycle: tokens, host start, match_start per seat, polls, verdict, rematch
{
  const h = createHarness();
  h.actor.handleOpen('a'); await h.send('a', 'room_create', { ...identity('admin'), mode: 'private', settings: { teamSize: 2, mapId: 'verdant' } }, 'c');
  h.actor.handleOpen('g'); await h.send('g', 'room_join', identity('guest', token('c'), token('d')), 'j');
  h.actor.handleOpen('w'); await h.send('w', 'room_join', { ...identity('watcher', token('e'), token('f')), team: 'spectator' }, 'w');
  await h.send('g', 'room_command', { command: { type: 'start' } }, 'x');
  assert.equal(h.last('g', 'error').payload.code, 'admin_only');
  await h.send('a', 'room_command', { command: { type: 'start' } }, 'x2');
  assert.equal(h.last('a', 'error').payload.code, 'players_not_ready');
  await h.send('a', 'room_command', { command: { type: 'set_ready', ready: true } });
  await h.send('g', 'room_command', { command: { type: 'set_ready', ready: true } });
  h.drain('a'); h.drain('g'); h.drain('w');
  await h.send('a', 'room_command', { command: { type: 'start' } }, 'start');
  assert.equal(h.matchHost.calls.length, 1);
  const config = h.matchHost.calls[0];
  assert.equal(config.roomId, 'ROOM01');
  assert.equal(config.seats.length, 3);
  assert.equal(config.bots.length, 2, 'two per side, one human each: two bots');
  assert.equal(config.mapId, 'verdant');
  const ack = h.last('a', 'room_ack');
  assert.equal(ack.requestId, 'start');
  assert.equal(h.last('a', 'room_state').payload.room.phase, 'starting');
  for (const [socket, playerId, team] of [['a', 'admin', 'alpha'], ['g', 'guest', 'bravo'], ['w', 'watcher', 'spectator']]) {
    const start = h.last(socket, 'match_start');
    assert.ok(start, `${playerId} receives match_start`);
    assert.equal(start.payload.matchUrl, '/rooms/ROOM01/match');
    assert.equal(start.payload.team, team);
    const verified = verifySeatToken(SECRET, start.payload.seatToken, h.now);
    assert.equal(verified.ok, true);
    assert.equal(verified.claims.playerId, playerId);
    assert.equal(verified.claims.roomId, 'ROOM01');
    assert.equal(verified.claims.seat, start.payload.seat);
  }
  assert.notEqual(h.last('a', 'match_start').payload.seatToken, h.last('g', 'match_start').payload.seatToken);
  // the room is locked while the match runs; a start is refused
  await h.send('a', 'room_command', { command: { type: 'start' } }, 'again');
  assert.equal(h.last('a', 'error').payload.code, 'lobby_locked');
  // a guest reconnecting during the match receives match_start again with the same token
  const guestToken = h.last('g', 'match_start').payload.seatToken;
  h.actor.handleClose('g');
  h.actor.handleOpen('g2'); await h.send('g2', 'room_join', identity('guest', token('d'), token('7')), 'rj');
  assert.equal(h.last('g2', 'match_start').payload.seatToken, guestToken);
  // polls: countdown → playing → verdict
  assert.equal(h.scheduledAt, h.now + ROOM_MATCH_POLL_MS);
  await h.advance(ROOM_MATCH_POLL_MS);
  assert.equal(h.actor.snapshot.match.status, 'starting');
  h.matchHost.statusValue = { phase: 'playing', verdict: null };
  await h.advance(ROOM_MATCH_POLL_MS);
  assert.equal(h.actor.snapshot.match.status, 'playing');
  assert.equal(h.last('a', 'room_state').payload.room.phase, 'playing');
  h.matchHost.statusValue = { phase: 'ended', verdict: { result: 'bravo', reason: 'elimination' } };
  await h.advance(ROOM_MATCH_POLL_MS);
  const room = h.actor.snapshot;
  assert.equal(room.phase, 'waiting');
  assert.equal(room.match.status, 'ended');
  assert.deepEqual(room.lastResult, { round: 1, result: 'bravo', reason: 'elimination' });
  assert.equal(h.last('a', 'match_status').payload.status, 'ended');
  assert.equal(h.last('a', 'match_status').payload.verdict.result, 'bravo');
  assert.ok(room.players.every((p) => !p.ready));
  assert.equal(h.scheduledAt, room.touchedAt + ROOM_IDLE_TTL_MS, 'only the expiry remains scheduled');
  // rematch: ready again, start again; the round advances and fresh tokens go out
  h.matchHost.statusValue = { phase: 'countdown', verdict: null };
  await h.send('a', 'room_command', { command: { type: 'set_ready', ready: true } });
  await h.send('g2', 'room_command', { command: { type: 'set_ready', ready: true } });
  h.drain('a'); h.drain('g2');
  await h.send('a', 'room_command', { command: { type: 'start' } }, 'start2');
  assert.equal(h.matchHost.calls.length, 2);
  assert.equal(h.matchHost.calls[1].round, 2);
  assert.notEqual(h.matchHost.calls[1].seed, h.matchHost.calls[0].seed);
  assert.notEqual(h.last('g2', 'match_start').payload.seatToken, guestToken, 'a rematch issues new tokens');
  assert.equal(h.actor.snapshot.round, 2);
  // the host dies: two missed polls → lost, the room offers a rematch (waiting again)
  h.matchHost.statusValue = null;
  await h.advance(ROOM_MATCH_POLL_MS);
  assert.equal(h.actor.snapshot.match.status, 'starting', 'one miss is tolerated');
  h.matchHost.statusValue = 'throw';
  await h.advance(ROOM_MATCH_POLL_MS);
  assert.equal(h.actor.snapshot.match.status, 'lost');
  assert.equal(h.actor.snapshot.phase, 'waiting');
  assert.equal(h.last('a', 'match_status').payload.status, 'lost');
  assert.deepEqual(h.actor.snapshot.lastResult, { round: 2, result: null, reason: 'match_lost' });
  // host unavailable at start: the room returns to waiting and the admin hears why
  h.matchHost.fail = true;
  await h.send('a', 'room_command', { command: { type: 'set_ready', ready: true } });
  await h.send('g2', 'room_command', { command: { type: 'set_ready', ready: true } });
  await h.send('a', 'room_command', { command: { type: 'start' } }, 'start3');
  assert.equal(h.last('a', 'error').payload.code, 'match_host_unavailable');
  assert.equal(h.actor.snapshot.phase, 'waiting');
  assert.equal(h.actor.snapshot.round, 2, 'a failed start does not consume a round');
}

// ---- admin migration: explicit leave at once; disconnect after the grace; the room never closes
{
  const h = createHarness();
  h.actor.handleOpen('a'); await h.send('a', 'room_create', { ...identity('admin'), mode: 'private', settings: { teamSize: 3 } });
  h.actor.handleOpen('b'); await h.send('b', 'room_join', identity('second', token('c'), token('d')));
  h.actor.handleOpen('c'); await h.send('c', 'room_join', identity('third', token('e'), token('f')));
  h.actor.handleClose('b');
  assert.equal(h.last('a', 'room_state').payload.room.players.find((p) => p.id === 'second').connected, false);
  await h.send('a', 'room_leave', {}, 'leave');
  assert.equal(h.closed.get('a'), 'client_leave');
  const afterLeave = h.last('c', 'room_state').payload.room;
  assert.equal(afterLeave.adminId, 'third', 'explicit leave migrates at once to the senior CONNECTED seat');
  assert.equal(afterLeave.players.length, 2);
  // the new admin's socket drops: nothing moves inside the grace, then it migrates to whoever is connected
  h.actor.handleOpen('b2'); await h.send('b2', 'room_join', identity('second', token('d'), token('7')));
  h.actor.handleClose('c');
  assert.equal(h.scheduledAt, h.now + ROOM_ADMIN_DISCONNECT_GRACE_MS);
  await h.advance(ROOM_ADMIN_DISCONNECT_GRACE_MS - 1);
  assert.equal(h.actor.snapshot.adminId, 'third');
  await h.advance(1);
  assert.equal(h.actor.snapshot.adminId, 'second');
  assert.equal(h.last('b2', 'room_state').payload.room.adminId, 'second');
  // the old admin comes back: a plain seat now
  h.actor.handleOpen('c2'); await h.send('c2', 'room_join', identity('third', token('f'), token('8')));
  assert.equal(h.actor.snapshot.players.find((p) => p.id === 'third').isAdmin, false);
  // everybody drops: the room stays for 24 h
  h.actor.handleClose('b2'); h.actor.handleClose('c2');
  assert.ok(h.actor.snapshot, 'the room survives every departure');
  await h.advance(ROOM_ADMIN_DISCONNECT_GRACE_MS * 2);
  assert.ok(h.actor.snapshot);
  await h.advance(ROOM_IDLE_TTL_MS);
  assert.equal(h.actor.snapshot, null, 'expired 24 h after the last message');
  assert.equal(h.actor.empty, true);
}

// ---- hibernation: export → restore → re-attach sockets; the lease and the poll survive
{
  const h = createHarness();
  h.actor.handleOpen('a'); await h.send('a', 'room_create', { ...identity('admin'), mode: 'private', settings: { teamSize: 2 } });
  h.actor.handleOpen('b'); await h.send('b', 'room_join', identity('guest', token('c'), token('d')));
  await h.send('a', 'room_command', { command: { type: 'set_ready', ready: true } });
  await h.send('b', 'room_command', { command: { type: 'set_ready', ready: true } });
  await h.send('a', 'room_command', { command: { type: 'start' } }, 's');
  const state = JSON.parse(JSON.stringify(h.actor.exportState()));
  const h2 = createHarness({ host: h.matchHost });
  h2.now = h.now + 1000;
  h2.actor.restore(state);
  h2.actor.attachSocket({ ...h.actor.socketRecord('a') });
  h2.actor.settleAfterRestore();
  assert.equal(h2.actor.snapshot.match.status, 'starting');
  assert.equal(h2.actor.snapshot.players.find((p) => p.id === 'admin').connected, true);
  assert.equal(h2.actor.snapshot.players.find((p) => p.id === 'guest').connected, false, 'a socket the host did not keep is disconnected');
  assert.ok(h2.scheduledAt !== null && h2.scheduledAt <= h.now + ROOM_MATCH_POLL_MS + 1000);
  h.matchHost.statusValue = { phase: 'ended', verdict: { result: 'draw', reason: 'time' } };
  await h2.advance(ROOM_MATCH_POLL_MS);
  assert.equal(h2.actor.snapshot.lastResult.result, 'draw');
  // a socket attached with a player id the room does not know is retired
  h2.actor.attachSocket({ id: 'z', playerId: 'ghost', acceptedAt: h2.now, lastActivity: h2.now, rateStart: h2.now, rateCount: 0 });
  assert.equal(h2.closed.get('z'), 'resume_denied');
  // a start that was in flight when the host restarted is abandoned
  const inflight = { ...state, startInFlight: true, room: { ...state.room, phase: 'starting' } };
  const h3 = createHarness({ host: h.matchHost });
  h3.actor.restore(inflight);
  assert.equal(h3.actor.snapshot.phase, 'waiting');
}

// ---- limits: unauthenticated timeout, message rate, kick
{
  const h = createHarness();
  h.actor.handleOpen('idle');
  assert.equal(h.scheduledAt, h.now + ROOM_UNAUTHENTICATED_TIMEOUT_MS);
  await h.advance(ROOM_UNAUTHENTICATED_TIMEOUT_MS);
  assert.equal(h.closed.get('idle'), 'authentication_timeout');
  h.actor.handleOpen('a'); await h.send('a', 'room_create', { ...identity('admin'), mode: 'private' });
  for (let index = 0; index < ROOM_RATE_MAX_MESSAGES; index++) await h.send('a', 'room_ping', {});
  assert.equal(h.closed.get('a'), 'rate_limit');
  assert.equal(h.actor.snapshot.players[0].connected, false);
  h.actor.handleOpen('a2'); await h.send('a2', 'room_join', identity('admin', token('b'), token('c')));
  h.actor.handleOpen('g'); await h.send('g', 'room_join', identity('guest', token('d'), token('e')));
  await h.send('a2', 'room_command', { command: { type: 'kick', playerId: 'guest' } }, 'k');
  assert.equal(h.closed.get('g'), 'kicked');
  assert.equal(h.last('g', 'room_closed').payload.reason, 'kicked');
  assert.equal(h.actor.snapshot.players.length, 1);
  h.actor.handleOpen('g2'); await h.send('g2', 'room_join', identity('guest', token('e'), token('f')));
  assert.equal(h.last('g2', 'room_joined').payload.room.players.length, 2, 'a kicked player may join again as a new seat');
  // a malformed frame and an oversized one are refused without effect
  await h.actor.handleMessage('a2', '{not json');
  assert.equal(h.last('a2', 'error').payload.code, 'invalid_payload');
}

console.log('roomActor: PASS');
