// RoomActor receipt: the room lifecycle on fake ports — admission with resume
// capabilities (hashes only), replacement of an old socket, admin migration
// (explicit leave at once, disconnect after the 30 s grace), the match
// lifecycle (seat tokens, host start, per-seat match_start, polls, verdict,
// rematch, lost host), expiry, hibernation round trips, rate and auth limits;
// and, with the peer-to-peer match host (§13, 2026-09-28): the election and
// the rtc:// URL, the per-match secret only on the host's copies, the relay
// rules, the host's reports, host migration on a dropped socket (8 s grace,
// fake clock), a leave, a kick, a decline and silence past three polls, the
// old host back as a peer, the lost end, hibernation with the host state.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { RoomActor } from './roomActor.ts';
import { createP2pMatchHost } from './p2pMatchHost.ts';
import {
  ROOM_ADMIN_DISCONNECT_GRACE_MS, ROOM_HOST_DISCONNECT_GRACE_MS, ROOM_IDLE_TTL_MS, ROOM_MATCH_POLL_MS, ROOM_MATCH_REPORT_STALE_AFTER_MS,
  ROOM_RATE_MAX_MESSAGES, ROOM_SEAT_DISCONNECT_TTL_MS, ROOM_SIGNAL_MAX_BYTES, ROOM_STATE_COALESCE_MS, ROOM_UNAUTHENTICATED_TIMEOUT_MS,
  readRoomSnapshot,
} from './protocol.ts';
import { signSeatToken, verifySeatToken } from '../../../server/match/seatToken.ts';

const SECRET = 'room-actor-receipt-secret-0123456789';
const T0 = 1_700_000_000_000;
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
/** The per-match host secret the contract names: sha256Hex(MATCH_SEAT_SECRET + ':' + matchId). */
const hostSecretOf = (matchId) => sha256(`${SECRET}:${matchId}`);

function createHarness({ code = 'ROOM01', host = null, region = undefined, transport = 'service', coalesce = false } = {}) {
  let now = T0;
  const sent = new Map();          // socketId -> envelopes
  const closed = new Map();        // socketId -> reason
  const keepalives = new Map();    // P1b: socketId -> the host's clock of its newest keepalive frame (the auto-response's record)
  const deferred = [];             // P1b: { at, callback } — the host's own timer, run by the receipt (`coalesce` opts in)
  let scheduledAt = null;
  let persists = 0;
  let seedTick = 0;
  const matchHost = host ?? (transport === 'p2p' ? createP2pMatchHost() : {
    transport: 'service',
    calls: [], statusValue: { phase: 'countdown', verdict: null }, fail: false,
    async start(config) { this.calls.push(config); if (this.fail) throw new Error('host down'); return { matchUrl: `/rooms/${config.roomId}/match` }; },
    async status(roomId) { if (this.statusValue === 'throw') throw new Error('unreachable'); return this.statusValue ? { roomId, matchId: 'x', ...this.statusValue } : null; },
    async stop() {},
  });
  const ports = {
    now: () => now,
    random: () => ((seedTick = (seedTick * 1103515245 + 12345) >>> 0) % 1000) / 1000,
    sha256Hex: sha256,
    seatSecret: SECRET,
    signSeatToken,
    matchHost,
    send(socketId, message) { if (!sent.has(socketId)) sent.set(socketId, []); sent.get(socketId).push(message); },
    closeSocket(socketId, reason) { closed.set(socketId, reason); },
    schedule(atMs) { scheduledAt = atMs; },
    persist() { persists++; },
    keepaliveAt: (socketId) => keepalives.get(socketId) ?? null,
    ...(coalesce ? { defer(callback, delayMs) { deferred.push({ at: now + delayMs, callback }); } } : {}),
    ...(region ? { region } : {}),
  };
  const actor = new RoomActor(code, ports);
  const drain = (socketId) => { const list = sent.get(socketId) ?? []; sent.set(socketId, []); return list; };
  const last = (socketId, type) => (sent.get(socketId) ?? []).filter((m) => m.type === type).at(-1) ?? null;
  const all = (socketId, type) => (sent.get(socketId) ?? []).filter((m) => m.type === type);
  const send = async (socketId, type, payload = {}, requestId) => { await actor.handleMessage(socketId, JSON.stringify({ type, requestId, payload })); };
  const command = async (socketId, command, requestId = `r${++seedTick}`) => { await send(socketId, 'room_command', { command }, requestId); return (sent.get(socketId) ?? []).findLast((m) => m.requestId === requestId) ?? null; };
  /** Run every deferred callback due at the clock (in order): the host's timer firing. */
  const runDeferred = () => {
    for (;;) {
      const index = deferred.findIndex((entry) => entry.at <= now);
      if (index < 0) return;
      const [entry] = deferred.splice(index, 1);
      entry.callback();
    }
  };
  const advance = async (ms) => { now += ms; runDeferred(); await actor.tick(); };
  return {
    actor, ports, matchHost, sent, closed, keepalives, deferred, drain, last, all, send, command, advance, runDeferred,
    get now() { return now; }, set now(v) { now = v; }, get scheduledAt() { return scheduledAt; }, get persists() { return persists; },
  };
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
  assert.equal(created.payload.region, undefined, 'a host without a region names none');
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

// ---- a host that knows its region names it in every admission reply (the status surface shows it)
{
  const h = createHarness({ region: 'iad' });
  h.actor.handleOpen('s1');
  await h.send('s1', 'room_create', { ...identity('admin'), mode: 'private' }, 'q1');
  assert.equal(h.last('s1', 'room_created').payload.region, 'iad');
  h.actor.handleOpen('s2');
  await h.send('s2', 'room_join', identity('guest', token('c'), token('d')), 'q2');
  assert.equal(h.last('s2', 'room_joined').payload.region, 'iad');
  assert.equal(h.last('s1', 'room_state').payload.room.region, undefined, 'the region is the reply\'s, never part of the room snapshot');
}


// ============================================================ peer-to-peer match host (§13, 2026-09-28)

/** Admin + guest (commanders) + a spectator, ready, started by the admin; sockets a / g / w. */
async function startedP2pRoom({ adminDeclines = false, third = false } = {}) {
  const h = createHarness({ transport: 'p2p' });
  h.actor.handleOpen('a'); await h.send('a', 'room_create', { ...identity('admin'), mode: 'private', settings: { teamSize: 2, mapId: 'verdant' } }, 'c');
  h.actor.handleOpen('g'); await h.send('g', 'room_join', identity('guest', token('c'), token('d')), 'j');
  if (third) { h.actor.handleOpen('t'); await h.send('t', 'room_join', identity('third', token('1'), token('2')), 't'); }
  h.actor.handleOpen('w'); await h.send('w', 'room_join', { ...identity('watcher', token('e'), token('f')), team: 'spectator' }, 'w');
  if (adminDeclines) assert.equal((await h.command('a', { type: 'host_decline', declined: true })).type, 'room_ack');
  await h.command('a', { type: 'set_ready', ready: true });
  await h.command('g', { type: 'set_ready', ready: true });
  if (third) await h.command('t', { type: 'set_ready', ready: true });
  h.drain('a'); h.drain('g'); h.drain('w'); h.drain('t');
  const ack = await h.command('a', { type: 'start' }, 'start');
  assert.equal(ack.type, 'room_ack', `the start is acknowledged: ${JSON.stringify(ack)}`);
  return { h, matchId: ack.payload.matchId };
}

// ---- start: the election, the rtc:// URL, the per-match secret only on the host's copies, tokens under it, no polls
{
  const { h, matchId } = await startedP2pRoom();
  const room = h.actor.snapshot;
  assert.deepEqual(room.host, { transport: 'p2p', hostId: 'admin', generation: 1, since: h.now });
  assert.equal(room.phase, 'starting');
  const hostSecret = hostSecretOf(matchId);
  for (const [socket, playerId, team] of [['a', 'admin', 'alpha'], ['g', 'guest', 'bravo'], ['w', 'watcher', 'spectator']]) {
    const start = h.last(socket, 'match_start');
    assert.ok(start, `${playerId} receives match_start`);
    assert.equal(start.payload.matchUrl, 'rtc://ROOM01/1');
    assert.equal(start.payload.hostId, 'admin');
    assert.equal(start.payload.team, team);
    assert.equal(start.payload.hostSecret, playerId === 'admin' ? hostSecret : undefined, 'the secret only in the host\'s own payload');
    const verified = verifySeatToken(hostSecret, start.payload.seatToken, h.now);
    assert.equal(verified.ok, true, 'every seat token of the match verifies with the per-match secret');
    assert.equal(verified.claims.playerId, playerId);
    assert.equal(verifySeatToken(SECRET, start.payload.seatToken, h.now).reason, 'bad_signature', 'never with the room\'s own secret');
    const changed = h.last(socket, 'host_changed');
    assert.deepEqual(changed.payload, { hostId: 'admin', generation: 1, resumeTick: 0, reason: 'start', ...(playerId === 'admin' ? { hostSecret } : {}) });
    const order = h.sent.get(socket).map((m) => m.type);
    assert.ok(order.indexOf('match_start') < order.indexOf('host_changed'), 'match_start precedes host_changed(start)');
  }
  for (const socket of ['a', 'g', 'w']) {
    assert.ok(!JSON.stringify(h.all(socket, 'room_state')).includes(hostSecret), 'room_state never carries the secret');
    assert.ok(!JSON.stringify(h.all(socket, 'room_state')).includes(SECRET));
  }
  const state = h.actor.exportState();
  assert.ok(!JSON.stringify(state).includes(hostSecret) && !JSON.stringify(state).includes('hostSecret'), 'the secret is derived, never stored');
  assert.equal(state.matchUrl, 'rtc://ROOM01/1');
  assert.equal(state.nextPollAt, null, 'a p2p match is never polled');
  assert.equal(state.hostReportDueAt, h.now + ROOM_MATCH_REPORT_STALE_AFTER_MS);
  assert.equal(h.scheduledAt, h.now + ROOM_MATCH_REPORT_STALE_AFTER_MS, 'the next deadline is the report budget');
  assert.equal(h.actor.snapshot.players.find((p) => p.id === 'admin').hostDeclined, false);
  // the p2p host's status derives from presence and reports
  assert.deepEqual(await h.matchHost.status('ROOM01'), { roomId: 'ROOM01', matchId, phase: 'loading', verdict: null, tick: 0 });
}

// ---- the relay: from added, the rules, the codes
{
  const { h } = await startedP2pRoom();
  h.drain('a'); h.drain('g'); h.drain('w');
  const offer = { to: 'admin', generation: 1, kind: 'offer', sdp: 'v=0 offer' };
  await h.send('g', 'room_signal', offer, 'sig1');
  assert.deepEqual(h.last('a', 'room_signal').payload, { ...offer, from: 'guest' });
  assert.deepEqual(h.last('g', 'room_ack').payload, { relayed: true });
  await h.send('a', 'room_signal', { to: 'guest', generation: 1, kind: 'answer', sdp: 'v=0 answer' });
  assert.deepEqual(h.last('g', 'room_signal').payload, { to: 'guest', generation: 1, kind: 'answer', sdp: 'v=0 answer', from: 'admin' });
  assert.equal(h.last('a', 'room_ack'), null, 'no requestId, no ack');
  const candidate = { to: 'admin', generation: 1, kind: 'candidate', candidate: { candidate: 'candidate:1 1 udp 1 203.0.113.1 5000 typ host', sdpMid: null, sdpMLineIndex: 0 } };
  await h.send('w', 'room_signal', candidate);
  assert.deepEqual(h.last('a', 'room_signal').payload, { ...candidate, from: 'watcher' }, 'a spectator signals the host like any peer');
  await h.send('g', 'room_signal', { ...offer, generation: 0 }, 'e1');
  assert.equal(h.last('g', 'error').payload.code, 'signal_generation');
  await h.send('g', 'room_signal', { ...offer, generation: 2 }, 'e2');
  assert.equal(h.last('g', 'error').payload.code, 'signal_generation');
  await h.send('g', 'room_signal', { to: 'watcher', generation: 1, kind: 'offer', sdp: 'x' }, 'e3');
  assert.equal(h.last('g', 'error').payload.code, 'signal_target', 'neither seat is the host');
  await h.send('g', 'room_signal', { to: 'guest', generation: 1, kind: 'offer', sdp: 'x' }, 'e4');
  assert.equal(h.last('g', 'error').payload.code, 'signal_target', 'not to oneself');
  await h.send('g', 'room_signal', { to: 'ghost', generation: 1, kind: 'offer', sdp: 'x' }, 'e5');
  assert.equal(h.last('g', 'error').payload.code, 'signal_target', 'not to a stranger');
  await h.send('g', 'room_signal', { to: 'bad id!', generation: 1, kind: 'offer', sdp: 'x' }, 'e6');
  assert.equal(h.last('g', 'error').payload.code, 'signal_target');
  await h.send('g', 'room_signal', { ...offer, sdp: 'v'.repeat(ROOM_SIGNAL_MAX_BYTES) }, 'e7');
  assert.equal(h.last('g', 'error').payload.code, 'signal_size');
  await h.send('g', 'room_signal', { ...offer, sdp: 'é'.repeat(ROOM_SIGNAL_MAX_BYTES / 2) }, 'e8');
  assert.equal(h.last('g', 'error').payload.code, 'signal_size', 'measured in UTF-8 bytes, not characters');
  await h.send('g', 'room_signal', { ...offer, kind: 'renegotiate' }, 'e9');
  assert.equal(h.last('g', 'error').payload.code, 'invalid_payload');
  await h.send('g', 'room_signal', { ...offer, candidate: 'not a record' }, 'e10');
  assert.equal(h.last('g', 'error').payload.code, 'invalid_payload');
  // a disconnected target is refused rather than silently dropped
  h.actor.handleClose('w');
  await h.send('a', 'room_signal', { to: 'watcher', generation: 1, kind: 'offer', sdp: 'x' }, 'e11');
  assert.equal(h.last('a', 'error').payload.code, 'signal_target');
  // an unseated socket is not in the room
  h.actor.handleOpen('z');
  await h.send('z', 'room_signal', offer, 'e12');
  assert.equal(h.last('z', 'error').payload.code, 'not_in_room');
  assert.equal(h.all('a', 'room_signal').length, 2);
  // out of phase: before any match
  const idle = createHarness({ transport: 'p2p' });
  idle.actor.handleOpen('a'); await idle.send('a', 'room_create', { ...identity('admin'), mode: 'private' });
  idle.actor.handleOpen('g'); await idle.send('g', 'room_join', identity('guest', token('c'), token('d')));
  await idle.send('g', 'room_signal', { to: 'admin', generation: 0, kind: 'offer', sdp: 'x' }, 'p1');
  assert.equal(idle.last('g', 'error').payload.code, 'signal_phase');
}

// ---- reports: identity, phases, the verdict, an ended without a verdict
{
  const { h, matchId } = await startedP2pRoom();
  const oldToken = h.last('g', 'match_start').payload.seatToken;
  h.drain('a'); h.drain('g'); h.drain('w');
  assert.equal((await h.command('g', { type: 'match_report', matchId, generation: 1, phase: 'playing', tick: 1 })).payload.code, 'host_only');
  assert.equal((await h.command('a', { type: 'match_report', matchId, generation: 2, phase: 'playing', tick: 1 })).payload.code, 'host_only');
  assert.equal((await h.command('a', { type: 'match_report', matchId: 'm1-deadbeef', generation: 1, phase: 'playing' })).payload.code, 'invalid_command');
  assert.equal((await h.command('a', { type: 'match_report', matchId, generation: 1, phase: 'live' })).payload.code, 'invalid_payload');
  assert.equal((await h.command('a', { type: 'match_report', matchId, generation: 1, phase: 'playing', tick: -1 })).payload.code, 'invalid_payload');
  assert.equal((await h.command('a', { type: 'match_report', matchId, generation: 1, phase: 'ended', verdict: { result: 'nobody', reason: 'x' } })).payload.code, 'invalid_payload');
  assert.equal(h.all('g', 'room_state').length, 0, 'refused reports change nothing');
  h.now += 1000;
  assert.equal((await h.command('a', { type: 'match_report', matchId, generation: 1, phase: 'loading' })).type, 'room_ack');
  assert.equal(h.actor.snapshot.match.status, 'starting');
  assert.deepEqual(h.actor.lastHostReport, { generation: 1, phase: 'loading', tick: 0, verdict: null, at: h.now });
  assert.equal(h.actor.exportState().hostReportDueAt, h.now + ROOM_MATCH_REPORT_STALE_AFTER_MS, 'every report renews the budget');
  assert.equal(h.all('g', 'room_state').length, 0, 'a report without a phase change broadcasts nothing');
  assert.equal((await h.command('a', { type: 'match_report', matchId, generation: 1, phase: 'countdown', tick: 0 })).type, 'room_ack');
  assert.equal((await h.command('a', { type: 'match_report', matchId, generation: 1, phase: 'playing', tick: 240 })).type, 'room_ack');
  assert.equal(h.actor.snapshot.match.status, 'playing');
  assert.equal(h.last('g', 'room_state').payload.room.phase, 'playing');
  assert.deepEqual(await h.matchHost.status('ROOM01'), { roomId: 'ROOM01', matchId, phase: 'playing', verdict: null, tick: 240 });
  assert.equal((await h.command('a', { type: 'match_report', matchId, generation: 1, phase: 'playing', tick: 300 })).type, 'room_ack');
  assert.equal(h.all('g', 'room_state').length, 1, 'a heartbeat broadcasts nothing');
  assert.equal((await h.command('a', { type: 'match_report', matchId, generation: 1, phase: 'ended', tick: 900, verdict: { result: 'alpha', reason: 'elimination' } })).type, 'room_ack');
  const room = h.actor.snapshot;
  assert.equal(room.phase, 'waiting');
  assert.equal(room.match.status, 'ended');
  assert.deepEqual(room.lastResult, { round: 1, result: 'alpha', reason: 'elimination' });
  assert.deepEqual(room.host, { transport: 'p2p', hostId: null, generation: 1, since: h.now }, 'the election clears, the generation stays');
  for (const socket of ['a', 'g', 'w']) {
    assert.equal(h.last(socket, 'match_status').payload.status, 'ended');
    assert.deepEqual(h.last(socket, 'match_status').payload.verdict, { result: 'alpha', reason: 'elimination' });
  }
  const state = h.actor.exportState();
  assert.equal(state.hostReport, null);
  assert.equal(state.hostReportDueAt, null);
  assert.deepEqual(state.matchTokens, {});
  assert.equal(h.scheduledAt, room.touchedAt + ROOM_IDLE_TTL_MS, 'only the expiry remains');
  assert.equal((await h.command('a', { type: 'match_report', matchId, generation: 1, phase: 'playing' })).payload.code, 'invalid_command', 'no running match');
  // rematch: generation 2, a new match secret, the old tokens dead
  await h.command('a', { type: 'set_ready', ready: true });
  await h.command('g', { type: 'set_ready', ready: true });
  const ack = await h.command('a', { type: 'start' });
  assert.equal(ack.type, 'room_ack');
  assert.equal(h.last('g', 'match_start').payload.matchUrl, 'rtc://ROOM01/2');
  assert.equal(h.actor.snapshot.host.generation, 2);
  assert.equal(verifySeatToken(hostSecretOf(ack.payload.matchId), h.last('g', 'match_start').payload.seatToken, h.now).ok, true);
  assert.equal(verifySeatToken(hostSecretOf(ack.payload.matchId), oldToken, h.now).reason, 'bad_signature', 'a rematch has its own secret');
  // an ended without a verdict is a lost match
  assert.equal((await h.command('a', { type: 'match_report', matchId: ack.payload.matchId, generation: 2, phase: 'ended', tick: 50 })).type, 'room_ack');
  assert.equal(h.actor.snapshot.match.status, 'lost');
  assert.deepEqual(h.actor.snapshot.lastResult, { round: 2, result: null, reason: 'host_ended' });
  assert.equal(h.last('g', 'match_status').payload.status, 'lost');
}

// ---- migration: the host's socket drops, the 8 s grace, host_changed with the resume tick, the old host back as a peer
{
  const { h, matchId } = await startedP2pRoom();
  const oldToken = h.last('a', 'match_start').payload.seatToken;
  await h.command('a', { type: 'match_report', matchId, generation: 1, phase: 'playing', tick: 420 });
  h.drain('a'); h.drain('g'); h.drain('w');
  h.actor.handleClose('a');
  assert.equal(h.last('g', 'room_state').payload.room.players.find((p) => p.id === 'admin').connected, false);
  assert.equal(h.scheduledAt, h.now + ROOM_HOST_DISCONNECT_GRACE_MS, 'the host lease is the nearest deadline (the admin lease is 30 s)');
  assert.equal(h.actor.exportState().hostLeaseAt, h.now + ROOM_HOST_DISCONNECT_GRACE_MS);
  await h.advance(ROOM_HOST_DISCONNECT_GRACE_MS - 1);
  assert.equal(h.actor.snapshot.host.hostId, 'admin', 'inside the grace nothing moves');
  assert.equal(h.last('g', 'host_changed'), null);
  await h.advance(1);
  const room = h.actor.snapshot;
  assert.deepEqual(room.host, { transport: 'p2p', hostId: 'guest', generation: 2, since: h.now });
  assert.equal(room.phase, 'playing', 'the match runs on');
  assert.equal(room.adminId, 'admin', 'the admin lease (30 s) is a separate matter');
  assert.deepEqual(h.last('g', 'host_changed').payload, { hostId: 'guest', generation: 2, resumeTick: 420, reason: 'timeout', hostSecret: hostSecretOf(matchId) });
  assert.deepEqual(h.last('w', 'host_changed').payload, { hostId: 'guest', generation: 2, resumeTick: 420, reason: 'timeout' });
  assert.equal(h.last('g', 'room_state').payload.room.host.generation, 2);
  assert.equal(h.actor.exportState().hostReport, null, 'the successor starts without a report');
  assert.equal(h.actor.exportState().hostReportDueAt, h.now + ROOM_MATCH_REPORT_STALE_AFTER_MS);
  // stale signals of generation 1 are refused; generation 2 flows between the new host and its peers
  await h.send('w', 'room_signal', { to: 'guest', generation: 1, kind: 'offer', sdp: 'x' }, 's1');
  assert.equal(h.last('w', 'error').payload.code, 'signal_generation');
  await h.send('w', 'room_signal', { to: 'guest', generation: 2, kind: 'offer', sdp: 'v=0' }, 's2');
  assert.equal(h.last('g', 'room_signal').payload.from, 'watcher');
  // the old host returns: a peer with the current URL, no secret, its reports refused, its old token still its own
  h.drain('a');
  h.actor.handleOpen('a2'); await h.send('a2', 'room_join', identity('admin', token('b'), token('9')), 'rj');
  const again = h.last('a2', 'match_start').payload;
  assert.equal(again.matchUrl, 'rtc://ROOM01/2');
  assert.equal(again.hostId, 'guest');
  assert.equal(again.hostSecret, undefined);
  assert.equal(again.seatToken, oldToken);
  assert.equal(h.actor.snapshot.players.find((p) => p.id === 'admin').isAdmin, true, 'back inside the admin grace: still the admin, no longer the host');
  assert.equal((await h.command('a2', { type: 'match_report', matchId, generation: 2, phase: 'playing', tick: 500 })).payload.code, 'host_only');
  assert.equal((await h.command('a2', { type: 'match_report', matchId, generation: 1, phase: 'playing', tick: 500 })).payload.code, 'host_only');
  await h.send('a2', 'room_signal', { to: 'guest', generation: 2, kind: 'offer', sdp: 'v=0 rejoin' }, 's3');
  assert.equal(h.last('g', 'room_signal').payload.from, 'admin');
  assert.equal((await h.command('g', { type: 'match_report', matchId, generation: 2, phase: 'playing', tick: 600 })).type, 'room_ack');
  // the successor's verdict
  await h.command('g', { type: 'match_report', matchId, generation: 2, phase: 'ended', tick: 1200, verdict: { result: 'bravo', reason: 'time_limit' } });
  assert.deepEqual(h.actor.snapshot.lastResult, { round: 1, result: 'bravo', reason: 'time_limit' });
  assert.equal(h.last('a2', 'match_status').payload.status, 'ended');
}

// ---- the host returns inside the grace: no migration, the secret again; then silence past three polls migrates
{
  const { h, matchId } = await startedP2pRoom();
  await h.command('a', { type: 'match_report', matchId, generation: 1, phase: 'playing', tick: 100 });
  h.actor.handleClose('a');
  await h.advance(ROOM_HOST_DISCONNECT_GRACE_MS / 2);
  h.actor.handleOpen('a2'); await h.send('a2', 'room_join', identity('admin', token('b'), token('9')));
  assert.equal(h.actor.exportState().hostLeaseAt, null, 'the lease clears when the host is back');
  assert.equal(h.last('a2', 'match_start').payload.hostSecret, hostSecretOf(matchId), 'the host receives its secret again');
  assert.equal(h.last('a2', 'match_start').payload.matchUrl, 'rtc://ROOM01/1');
  await h.advance(ROOM_HOST_DISCONNECT_GRACE_MS);
  assert.equal(h.actor.snapshot.host.hostId, 'admin', 'no migration');
  assert.equal(h.last('g', 'host_changed').payload.generation, 1);
  // connected but silent: the report budget runs out three polls after the last report
  const lastReportAt = h.actor.lastHostReport.at;
  h.now = lastReportAt + ROOM_MATCH_REPORT_STALE_AFTER_MS - 1;
  await h.actor.tick();
  assert.equal(h.actor.snapshot.host.hostId, 'admin');
  await h.advance(1);
  assert.deepEqual(h.last('g', 'host_changed').payload, { hostId: 'guest', generation: 2, resumeTick: 100, reason: 'timeout', hostSecret: hostSecretOf(matchId) });
  assert.equal(h.last('a2', 'host_changed').payload.hostSecret, undefined, 'the silent host, still seated, is a peer now');
  assert.equal(h.actor.snapshot.host.hostId, 'guest');
}

// ---- declines (P1b: a departure from hosting — the next candidate at once, never a seat that stepped down), a leave, a kick, and the lost end
{
  const { h, matchId } = await startedP2pRoom({ adminDeclines: true, third: true });
  assert.equal(h.actor.snapshot.host.hostId, 'guest', 'a declined admin yields the election to the lowest joinedAt willing commander');
  assert.equal(h.last('g', 'match_start').payload.hostSecret, hostSecretOf(matchId));
  assert.equal(h.last('a', 'match_start').payload.hostSecret, undefined);
  assert.equal(h.last('t', 'match_start').payload.hostId, 'guest');
  await h.command('g', { type: 'match_report', matchId, generation: 1, phase: 'playing', tick: 75 });
  // the host declines mid-match: the third seat is the willing successor, elected at once from the reported tick
  assert.equal((await h.command('g', { type: 'host_decline', declined: true })).type, 'room_ack');
  assert.deepEqual(h.last('t', 'host_changed').payload, { hostId: 'third', generation: 2, resumeTick: 75, reason: 'declined', hostSecret: hostSecretOf(matchId) });
  assert.equal(h.last('a', 'host_changed').payload.hostSecret, undefined);
  assert.equal(h.last('w', 'host_changed').payload.generation, 2);
  assert.deepEqual(h.actor.exportState().steppedDown, ['guest'], 'the seat that declined while hosting stepped down for this match');
  // the new host declines with no WILLING successor left (P1's rule kept it and stalled the peers for the report
  // budget): the admin — declined, but the last resort — takes over at once, reason declined, from tick 0 (the third
  // seat never reported); the guest, which stepped down, is not handed the match back
  assert.equal((await h.command('t', { type: 'host_decline', declined: true })).type, 'room_ack');
  assert.deepEqual(h.last('a', 'host_changed').payload, { hostId: 'admin', generation: 3, resumeTick: 0, reason: 'declined', hostSecret: hostSecretOf(matchId) });
  assert.equal(h.last('g', 'host_changed').payload.hostSecret, undefined);
  assert.equal(h.last('g', 'host_changed').payload.generation, 3);
  assert.equal(h.actor.snapshot.host.hostId, 'admin');
  assert.deepEqual(h.actor.exportState().steppedDown, ['guest', 'third']);
  // every commander has stepped down: the admin's decline finds nobody to hand the match to — it keeps hosting, no
  // election (the loop two seats that cannot host would otherwise run is cut here); its client boots afresh
  assert.equal((await h.command('a', { type: 'host_decline', declined: true })).type, 'room_ack');
  assert.equal(h.actor.snapshot.host.hostId, 'admin');
  assert.equal(h.actor.snapshot.host.generation, 3);
  assert.equal(h.all('a', 'host_changed').length, 3, 'start, generation 2, generation 3 — no fourth election');
  assert.deepEqual(h.actor.exportState().steppedDown, ['guest', 'third', 'admin']);
  // the host leaves: at once, by the full ladder — the guest, lowest joinedAt among the declined, stepped down or not
  await h.send('a', 'room_leave', {}, 'leave');
  assert.deepEqual(h.last('g', 'host_changed').payload, { hostId: 'guest', generation: 4, resumeTick: 0, reason: 'left', hostSecret: hostSecretOf(matchId) });
  assert.equal(h.actor.snapshot.phase, 'playing');
  assert.equal(h.actor.snapshot.adminId, 'guest', 'the admin role moved with the leave');
  // the guest leaves: the third seat, the last commander, hosts and is the admin now
  await h.send('g', 'room_leave', {}, 'leave2');
  assert.deepEqual(h.last('t', 'host_changed').payload, { hostId: 'third', generation: 5, resumeTick: 0, reason: 'left', hostSecret: hostSecretOf(matchId) });
  assert.equal(h.actor.snapshot.adminId, 'third');
  // the last commander leaves: lost
  await h.send('t', 'room_leave', {}, 'leave3');
  assert.equal(h.actor.snapshot.match.status, 'lost');
  assert.equal(h.actor.snapshot.phase, 'waiting');
  assert.deepEqual(h.actor.snapshot.lastResult, { round: 1, result: null, reason: 'match_lost' });
  assert.equal(h.last('w', 'match_status').payload.status, 'lost');
  assert.deepEqual(h.actor.snapshot.host, { transport: 'p2p', hostId: null, generation: 5, since: h.now });
  assert.equal(h.actor.exportState().hostLeaseAt, null);
  assert.deepEqual(h.actor.exportState().steppedDown, [], 'the stepped-down set clears with the match');
}
{
  // a kicked host migrates at once; a kick of a peer does not
  const { h, matchId } = await startedP2pRoom({ adminDeclines: true });
  assert.equal(h.actor.snapshot.host.hostId, 'guest');
  await h.command('g', { type: 'match_report', matchId, generation: 1, phase: 'playing', tick: 33 });
  h.actor.handleOpen('t'); await h.send('t', 'room_join', identity('third', token('1'), token('2')));
  assert.equal(h.last('t', 'error').payload.code, 'room_locked', 'a fresh join waits for the round');
  assert.equal((await h.command('a', { type: 'kick', playerId: 'watcher' })).type, 'room_ack');
  assert.equal(h.actor.snapshot.host.generation, 1, 'kicking a peer changes no host');
  assert.equal((await h.command('a', { type: 'kick', playerId: 'guest' })).type, 'room_ack');
  assert.deepEqual(h.last('a', 'host_changed').payload, { hostId: 'admin', generation: 2, resumeTick: 33, reason: 'left', hostSecret: hostSecretOf(matchId) });
  assert.equal(h.closed.get('g'), 'kicked');
}
{
  // the only commander's socket drops: after the grace the match is lost (spectators never host)
  const { h } = await startedP2pRoom();
  await h.send('g', 'room_leave', {}, 'leave');
  assert.equal(h.actor.snapshot.host.hostId, 'admin');
  h.actor.handleClose('a');
  await h.advance(ROOM_HOST_DISCONNECT_GRACE_MS);
  assert.equal(h.actor.snapshot.match.status, 'lost');
  assert.equal(h.last('w', 'match_status').payload.status, 'lost');
  assert.equal(h.actor.snapshot.host.hostId, null);
  // no connected commander at start is impossible (the start needs one), so a start never lacks a host
}

// ---- hibernation with the host state: the lease, the report and the election come back; a legacy state normalizes
{
  const { h, matchId } = await startedP2pRoom();
  await h.command('a', { type: 'match_report', matchId, generation: 1, phase: 'playing', tick: 800 });
  h.actor.handleClose('a');
  const state = JSON.parse(JSON.stringify(h.actor.exportState()));
  // `restore` takes ownership of the state it is given (the hosts hand it a fresh JSON.parse): copy per restore
  const copy = () => JSON.parse(JSON.stringify(state));
  const h2 = createHarness({ transport: 'p2p' });
  h2.now = h.now + 1000;
  h2.actor.restore(copy());
  h2.actor.attachSocket({ ...h.actor.socketRecord('g') });
  h2.actor.attachSocket({ ...h.actor.socketRecord('w') });
  h2.actor.settleAfterRestore();
  assert.deepEqual(h2.actor.snapshot.host, { transport: 'p2p', hostId: 'admin', generation: 1, since: state.room.host.since });
  assert.deepEqual(h2.actor.lastHostReport, { generation: 1, phase: 'playing', tick: 800, verdict: null, at: state.hostReport.at });
  assert.equal(h2.actor.exportState().hostLeaseAt, state.hostLeaseAt, 'the lease set before the restart stands');
  assert.equal(h2.actor.exportState().matchUrl, 'rtc://ROOM01/1');
  h2.now = state.hostLeaseAt;
  await h2.actor.tick();
  assert.deepEqual(h2.last('g', 'host_changed').payload, { hostId: 'guest', generation: 2, resumeTick: 800, reason: 'timeout', hostSecret: hostSecretOf(matchId) });
  // a restore without a lease (the host was connected when the state was written) starts one when the host is absent
  const h3 = createHarness({ transport: 'p2p' });
  h3.now = h.now + 5000;
  h3.actor.restore({ ...copy(), hostLeaseAt: null });
  h3.actor.attachSocket({ ...h.actor.socketRecord('g') });
  h3.actor.settleAfterRestore();
  assert.equal(h3.actor.exportState().hostLeaseAt, h3.now + ROOM_HOST_DISCONNECT_GRACE_MS);
  // a state written before the host record, the decline flag and the persisted URL reads as no election / nobody declined
  const legacy = copy();
  delete legacy.room.host;
  for (const player of legacy.room.players) delete player.hostDeclined;
  delete legacy.matchUrl; delete legacy.hostLeaseAt; delete legacy.hostReport; delete legacy.hostReportDueAt;
  const h4 = createHarness({ transport: 'p2p' });
  h4.actor.restore(legacy);
  assert.deepEqual(h4.actor.snapshot.host, { transport: 'p2p', hostId: null, generation: 0, since: legacy.room.createdAt });
  assert.ok(h4.actor.snapshot.players.every((p) => p.hostDeclined === false));
  assert.equal(h4.actor.exportState().matchUrl, '');
  assert.equal(h4.actor.lastHostReport, null);
  // a service host restoring the same state keeps the service transport on the record
  const h5 = createHarness();
  h5.actor.restore(legacy);
  assert.equal(h5.actor.snapshot.host.transport, 'service');
}

// ============================================================ P1b cost pass (2026-09-28)

// ---- the keepalive frame never reaches the actor: the 24 h expiry reads the host's record of it (`keepaliveAt`)
{
  const h = createHarness({ transport: 'p2p' });
  h.actor.handleOpen('a'); await h.send('a', 'room_create', { ...identity('admin'), mode: 'private' }, 'c');
  h.actor.handleOpen('g'); await h.send('g', 'room_join', identity('guest', token('c'), token('d')), 'j');
  h.actor.handleOpen('x');   // an unauthenticated socket: its keepalives never count
  const touchedAt = h.actor.snapshot.touchedAt;
  assert.equal(h.scheduledAt, T0 + ROOM_UNAUTHENTICATED_TIMEOUT_MS, 'the pending socket\'s timeout is the nearest deadline');
  await h.advance(ROOM_UNAUTHENTICATED_TIMEOUT_MS);
  assert.equal(h.closed.get('x'), 'authentication_timeout');
  assert.equal(h.scheduledAt, touchedAt + ROOM_IDLE_TTL_MS, 'only the expiry remains');
  // the seats keep alive through the runtime (the frames are auto-answered): the newest frame is the room's touch
  const lastFrameAt = touchedAt + ROOM_IDLE_TTL_MS - 60_000;
  h.keepalives.set('a', lastFrameAt - 3_600_000);
  h.keepalives.set('g', lastFrameAt);
  h.keepalives.set('x', lastFrameAt + 30_000);   // retired, unauthenticated: ignored
  const persistsBefore = h.persists;
  h.now = touchedAt + ROOM_IDLE_TTL_MS;
  await h.actor.tick();
  assert.notEqual(h.actor.snapshot, null, 'a room whose seats only keep alive does not expire');
  assert.equal(h.actor.snapshot.touchedAt, lastFrameAt, 'the newest seated keepalive is the touch');
  assert.equal(h.scheduledAt, lastFrameAt + ROOM_IDLE_TTL_MS, 'the expiry moved to 24 h after the newest keepalive');
  assert.equal(h.persists, persistsBefore + 1, 'the moved touch is persisted once');
  assert.equal(h.all('a', 'room_closed').length, 0);
  // no newer keepalive by the moved deadline: the room expires as before
  h.now = lastFrameAt + ROOM_IDLE_TTL_MS;
  await h.actor.tick();
  assert.equal(h.actor.snapshot, null, 'expired 24 h after the last keepalive');
  assert.equal(h.last('g', 'room_closed').payload.reason, 'expired');
  // a host without the port (the legacy service double) keeps the old rule: every touch is a handled message
  const plain = createHarness();
  delete plain.ports.keepaliveAt;
  plain.actor.handleOpen('a'); await plain.send('a', 'room_create', { ...identity('admin'), mode: 'private' }, 'c');
  plain.now = plain.actor.snapshot.touchedAt + ROOM_IDLE_TTL_MS;
  await plain.actor.tick();
  assert.equal(plain.actor.snapshot, null);
}

// ---- coalesced room_state: one fan-out per ROOM_STATE_COALESCE_MS, the newest revision on the trailing edge
{
  const h = createHarness({ transport: 'p2p', coalesce: true });
  h.actor.handleOpen('a'); await h.send('a', 'room_create', { ...identity('admin'), mode: 'private', settings: { teamSize: 2, mapId: 'verdant' } }, 'c');
  h.actor.handleOpen('g'); await h.send('g', 'room_join', identity('guest', token('c'), token('d')), 'j');
  h.actor.handleOpen('w'); await h.send('w', 'room_join', { ...identity('watcher', token('e'), token('f')), team: 'spectator' }, 'w');
  assert.equal(h.all('a', 'room_state').length, 2, 'joins broadcast at once (one per join)');
  h.drain('a'); h.drain('g'); h.drain('w');
  assert.equal(h.deferred.length, 0);
  // a change inside the window a join opened is absorbed like any other (the window counts every broadcast)
  await h.command('a', { type: 'set_ready', ready: true });
  assert.equal(h.all('g', 'room_state').length, 0, 'absorbed into the join\'s window');
  assert.ok(h.actor.statePending);
  h.now = h.deferred[0].at;
  h.runDeferred();
  assert.equal(h.all('g', 'room_state').length, 1);
  assert.equal(h.last('g', 'room_state').payload.room.players.find((p) => p.id === 'admin').ready, true);
  h.drain('a'); h.drain('g'); h.drain('w');
  h.now += ROOM_STATE_COALESCE_MS;
  // a burst of readiness and selection changes within one window: the first goes out at once, the rest ride one flush
  const leadAt = h.now;
  const ready = await h.command('g', { type: 'set_ready', ready: true });
  assert.equal(h.all('a', 'room_state').length, 1, 'the first change of a window goes out at once');
  assert.equal(h.last('a', 'room_state').payload.room.revision, ready.payload.revision, 'the ack names the state it broadcast');
  h.now += 50;
  const unready = await h.command('g', { type: 'set_ready', ready: false });
  h.now += 50;
  const vehicle = await h.command('g', { type: 'select_vehicle', specId: 't90m' });
  h.now += 50;
  const readyAgain = await h.command('g', { type: 'set_ready', ready: true });
  assert.equal(h.all('a', 'room_state').length, 1, 'changes inside the window are absorbed');
  assert.ok(h.actor.statePending, 'a coalesced change waits for the window');
  assert.equal(h.deferred.length, 1, 'one timer armed for the burst');
  assert.equal(h.deferred[0].at, leadAt + ROOM_STATE_COALESCE_MS, 'armed for the window\'s end after the leading broadcast');
  assert.ok(unready.payload.revision < vehicle.payload.revision && vehicle.payload.revision < readyAgain.payload.revision, 'every ack names its own revision');
  h.now = h.deferred[0].at - 1;
  h.runDeferred();
  assert.equal(h.all('a', 'room_state').length, 1, 'nothing before the window ends');
  h.now += 1;
  h.runDeferred();
  assert.equal(h.all('a', 'room_state').length, 2, 'the trailing edge: one broadcast for three changes');
  assert.equal(h.all('g', 'room_state').length, 2);
  assert.equal(h.all('w', 'room_state').length, 2);
  const flushed = h.last('a', 'room_state').payload.room;
  assert.equal(flushed.revision, readyAgain.payload.revision, 'the flush carries the newest revision');
  assert.equal(flushed.players.find((p) => p.id === 'guest').ready, true);
  assert.equal(flushed.players.find((p) => p.id === 'guest').specId, 't90m');
  assert.equal(h.actor.statePending, false);
  assert.equal(h.deferred.length, 0);
  // an instant event (a join) inside a window supersedes a pending coalesced change; the joiner has the room already
  h.now += ROOM_STATE_COALESCE_MS;
  await h.command('a', { type: 'set_ready', ready: true });            // leading edge of a new window
  h.now += 20;
  await h.command('g', { type: 'set_ready', ready: false });           // pending
  assert.ok(h.actor.statePending);
  h.actor.handleOpen('t'); await h.send('t', 'room_join', identity('third', token('1'), token('2')), 't');
  assert.equal(h.actor.statePending, false, 'the join\'s instant broadcast carried the pending change');
  assert.equal(h.last('a', 'room_state').payload.room.players.find((p) => p.id === 'guest').ready, false);
  assert.equal(h.last('a', 'room_state').payload.room.players.length, 4);
  // a coalescable change right after the instant one waits for the moved window's end: the armed timer re-arms
  const before = h.all('a', 'room_state').length;
  h.now += 20;
  await h.command('t', { type: 'select_vehicle', specId: 'kv2' });
  assert.equal(h.all('a', 'room_state').length, before, 'inside the window that the join opened');
  assert.equal(h.deferred.length, 1, 'the burst\'s timer is still the one armed');
  h.now = h.deferred[0].at;
  h.runDeferred();   // it fires 20 ms before the moved window's end (the join moved it): it re-arms instead of flushing
  assert.equal(h.all('a', 'room_state').length, before);
  assert.equal(h.deferred.length, 1, 're-armed for the window\'s end');
  assert.equal(h.deferred[0].at, h.now + 20);
  h.now = h.deferred[0].at;
  h.runDeferred();
  assert.equal(h.all('a', 'room_state').length, before + 1);
  assert.equal(h.last('a', 'room_state').payload.room.players.find((p) => p.id === 'third').specId, 'kv2');
  // a kick is a leave: instant
  h.now += 20;
  await h.command('a', { type: 'kick', playerId: 'third' });
  assert.equal(h.all('a', 'room_state').length, before + 2, 'a kick broadcasts at once');
  assert.equal(h.closed.get('t'), 'kicked');
  // a host without a deferral port (a harness, an older service) broadcasts every revision at once
  const plain = createHarness({ transport: 'p2p' });
  plain.actor.handleOpen('a'); await plain.send('a', 'room_create', { ...identity('admin'), mode: 'private' }, 'c');
  plain.actor.handleOpen('g'); await plain.send('g', 'room_join', identity('guest', token('c'), token('d')), 'j');
  plain.drain('a');
  await plain.command('g', { type: 'set_ready', ready: true });
  await plain.command('g', { type: 'set_ready', ready: false });
  assert.equal(plain.all('a', 'room_state').length, 2);
  assert.equal(plain.actor.statePending, false);
}

// ---- the stepped-down set survives a hibernation round trip; a state without it restores empty
{
  const { h, matchId } = await startedP2pRoom({ adminDeclines: true, third: true });
  await h.command('g', { type: 'host_decline', declined: true });
  assert.deepEqual(h.actor.exportState().steppedDown, ['guest']);
  const state = JSON.parse(JSON.stringify(h.actor.exportState()));
  const h2 = createHarness({ transport: 'p2p' });
  h2.actor.restore(state);
  h2.actor.settleAfterRestore();
  assert.deepEqual(h2.actor.exportState().steppedDown, ['guest']);
  h2.actor.handleOpen('a2'); await h2.send('a2', 'room_join', identity('admin', token('b'), token('9')), 'ra');
  h2.actor.handleOpen('g2'); await h2.send('g2', 'room_join', identity('guest', token('d'), token('8')), 'rg');
  h2.actor.handleOpen('t2'); await h2.send('t2', 'room_join', identity('third', token('2'), token('7')), 'rt');
  assert.equal(h2.actor.snapshot.host.hostId, 'third');
  // the restored host declines: the guest (stepped down before the restart) is skipped, the admin takes over
  await h2.command('t2', { type: 'host_decline', declined: true });
  assert.deepEqual(h2.last('a2', 'host_changed').payload, { hostId: 'admin', generation: 3, resumeTick: 0, reason: 'declined', hostSecret: hostSecretOf(matchId) });
  const legacy = { ...state, steppedDown: undefined };
  const h3 = createHarness({ transport: 'p2p' });
  h3.actor.restore(legacy);
  assert.deepEqual(h3.actor.exportState().steppedDown, [], 'a pre-P1b state reads as nobody stepped down');
}

// ============================================================ the lifecycle proofs (2026-09-30): rooms never hang

// ---- an emptied room keeps its code for the idle TTL with the expiry as its only deadline; the next seat to join owns it
// (the departed creator's id stayed admin before, so no joiner's snapshot validated: a dead code for 24 h)
{
  const h = createHarness({ transport: 'p2p' });
  h.actor.handleOpen('a'); await h.send('a', 'room_create', { ...identity('admin'), mode: 'private', settings: { teamSize: 1, mapId: 'verdant' } });
  await h.send('a', 'room_leave', {}, 'leave');
  assert.equal(h.closed.get('a'), 'client_leave');
  assert.ok(h.actor.snapshot, 'the room outlives its last seat');
  assert.deepEqual(h.actor.snapshot.players, []);
  assert.equal(h.actor.snapshot.phase, 'waiting');
  assert.equal(h.actor.nextDeadline(), h.actor.snapshot.touchedAt + ROOM_IDLE_TTL_MS, 'the idle expiry is its only deadline: no lease, no alarm loop');
  h.actor.handleOpen('b'); await h.send('b', 'room_join', identity('late', token('c'), token('d')), 'j');
  const joined = h.last('b', 'room_joined').payload.room;
  assert.equal(joined.adminId, 'late', 'the next seat owns the room');
  assert.equal(joined.players[0].isAdmin, true);
  assert.doesNotThrow(() => readRoomSnapshot(JSON.parse(JSON.stringify(joined))), 'its snapshot validates on the client');
  await h.command('b', { type: 'set_ready', ready: true });
  assert.equal((await h.command('b', { type: 'start' }, 'start')).type, 'room_ack', 'and it can start');
  assert.equal(h.actor.snapshot.host.hostId, 'late');
  assert.equal(h.last('b', 'match_start').payload.hostId, 'late');
}

// ---- the admin lease is no alarm while nobody else is connected (no 30 s re-arm loop: 2,880 alarms a day per abandoned room);
// a later admission runs the due lease at once, so the newcomer owns the room without a further wait
{
  const h = createHarness({ transport: 'p2p' });
  h.actor.handleOpen('a'); await h.send('a', 'room_create', { ...identity('admin'), mode: 'private', settings: { teamSize: 2 } });
  h.actor.handleClose('a');
  const droppedAt = h.now;
  assert.equal(h.actor.exportState().adminLeaseAt, droppedAt + ROOM_ADMIN_DISCONNECT_GRACE_MS, 'the lease is held');
  assert.equal(h.scheduledAt, droppedAt + ROOM_SEAT_DISCONNECT_TTL_MS, 'but the next alarm is the seat reap: nobody is there to migrate to');
  await h.advance(ROOM_ADMIN_DISCONNECT_GRACE_MS);
  assert.equal(h.actor.snapshot.adminId, 'admin');
  assert.equal(h.scheduledAt, droppedAt + ROOM_SEAT_DISCONNECT_TTL_MS, 'the due lease is not re-armed');
  await h.advance(ROOM_ADMIN_DISCONNECT_GRACE_MS);
  assert.equal(h.scheduledAt, droppedAt + ROOM_SEAT_DISCONNECT_TTL_MS, 'still no alarm for it a grace later');
  // a guest joins two minutes into the absence: the admission's reschedule finds the lease due and the tick migrates at once
  h.now = droppedAt + 120_000;
  h.actor.handleOpen('g'); await h.send('g', 'room_join', identity('guest', token('c'), token('d')), 'j');
  assert.ok(h.scheduledAt <= h.now, `the due lease is the next alarm now (${h.scheduledAt - h.now} ms)`);
  await h.actor.tick();
  assert.equal(h.actor.snapshot.adminId, 'guest', 'the newcomer is admin at once, not 30 s later');
  assert.equal(h.last('g', 'room_state').payload.room.adminId, 'guest');
  assert.equal(h.actor.exportState().adminLeaseAt, null);
  // the old admin back: a plain seat, and its own lease is gone with its return
  h.actor.handleOpen('a2'); await h.send('a2', 'room_join', identity('admin', token('b'), token('9')));
  assert.equal(h.actor.snapshot.players.find((p) => p.id === 'admin').isAdmin, false);
  assert.equal(h.actor.exportState().seatLeases.admin, undefined);
}

// ---- another seat's leave during the admin's grace keeps the lease (it cleared it before: the seats left behind had no admin)
{
  const h = createHarness({ transport: 'p2p' });
  h.actor.handleOpen('a'); await h.send('a', 'room_create', { ...identity('admin'), mode: 'private', settings: { teamSize: 3 } });
  h.actor.handleOpen('g'); await h.send('g', 'room_join', identity('guest', token('c'), token('d')));
  h.actor.handleOpen('t'); await h.send('t', 'room_join', identity('third', token('e'), token('f')));
  h.actor.handleClose('a');
  const droppedAt = h.now;
  assert.equal(h.scheduledAt, droppedAt + ROOM_ADMIN_DISCONNECT_GRACE_MS, 'a target exists: the lease is the alarm');
  await h.advance(1000);
  await h.send('t', 'room_leave', {}, 'leave');
  assert.equal(h.actor.exportState().adminLeaseAt, droppedAt + ROOM_ADMIN_DISCONNECT_GRACE_MS, 'the third seat\'s leave leaves the admin lease alone');
  assert.equal(h.scheduledAt, droppedAt + ROOM_ADMIN_DISCONNECT_GRACE_MS);
  await h.advance(ROOM_ADMIN_DISCONNECT_GRACE_MS - 1000);
  assert.equal(h.actor.snapshot.adminId, 'guest', 'the guest is admin when the grace ends');
  assert.equal(h.last('g', 'room_state').payload.room.adminId, 'guest');
}

// ---- a disconnected seat is reaped ROOM_SEAT_DISCONNECT_TTL_MS after its socket went while the room waits (a 1v1 room
// otherwise refused every newcomer for 24 h); a resume inside the lease keeps the seat; a seat of a running match waits
// for the match's end, then its lease restarts
{
  const h = createHarness({ transport: 'p2p' });
  h.actor.handleOpen('a'); await h.send('a', 'room_create', { ...identity('admin'), mode: 'private', settings: { teamSize: 1, mapId: 'verdant' } });
  h.actor.handleOpen('g'); await h.send('g', 'room_join', identity('guest', token('c'), token('d')));
  h.actor.handleClose('g');
  const droppedAt = h.now;
  assert.equal(h.actor.exportState().seatLeases.guest, droppedAt + ROOM_SEAT_DISCONNECT_TTL_MS);
  assert.equal(h.scheduledAt, droppedAt + ROOM_SEAT_DISCONNECT_TTL_MS, 'the reap is the next alarm');
  h.actor.handleOpen('n'); await h.send('n', 'room_join', identity('new', token('1'), token('2')), 'n1');
  assert.equal(h.last('n', 'error').payload.code, 'room_full', 'the ghost holds bravo: the stuck 1v1 room');
  h.actor.handleClose('n');
  // a resume inside the lease keeps the seat and drops the lease
  h.actor.handleOpen('g2'); await h.send('g2', 'room_join', identity('guest', token('d'), token('7')));
  assert.equal(h.actor.exportState().seatLeases.guest, undefined);
  h.actor.handleClose('g2');
  const droppedAgainAt = h.now;
  await h.advance(ROOM_SEAT_DISCONNECT_TTL_MS - 1);
  assert.equal(h.actor.snapshot.players.length, 2, 'inside the lease the seat stays');
  const touchedBefore = h.actor.snapshot.touchedAt;
  await h.advance(1);
  assert.deepEqual(h.actor.snapshot.players.map((p) => p.id), ['admin'], 'the seat is reaped at the lease');
  assert.equal(h.actor.snapshot.touchedAt, touchedBefore, 'housekeeping does not restart the 24 h idle clock');
  assert.equal(h.actor.exportState().seatLeases.guest, undefined);
  assert.equal(h.last('a', 'room_state').payload.room.players.length, 1, 'the seats present hear the roster change');
  assert.ok(h.now - droppedAgainAt === ROOM_SEAT_DISCONNECT_TTL_MS);
  h.actor.handleOpen('n2'); await h.send('n2', 'room_join', identity('new', token('1'), token('2')), 'n2');
  assert.equal(h.last('n2', 'room_joined').payload.room.players.length, 2, 'the newcomer takes the freed slot');
  // never during a match: the seat's lease waits for the match's end, then restarts
  await h.command('a', { type: 'set_ready', ready: true });
  await h.command('n2', { type: 'set_ready', ready: true });
  const ack = await h.command('a', { type: 'start' }, 'start');
  assert.equal(ack.type, 'room_ack');
  h.actor.handleClose('n2');
  const inMatchDropAt = h.now;
  assert.equal(h.actor.exportState().seatLeases.new, inMatchDropAt + ROOM_SEAT_DISCONNECT_TTL_MS);
  assert.ok(h.actor.nextDeadline() < inMatchDropAt + ROOM_SEAT_DISCONNECT_TTL_MS, 'the report budget, not the reap, is the next deadline');
  await h.advance(ROOM_MATCH_POLL_MS);
  await h.command('a', { type: 'match_report', matchId: ack.payload.matchId, generation: 1, phase: 'playing', tick: 600 });
  await h.advance(ROOM_MATCH_POLL_MS);
  await h.command('a', { type: 'match_report', matchId: ack.payload.matchId, generation: 1, phase: 'ended', tick: 1200, verdict: { result: 'alpha', reason: 'elimination' } });
  assert.equal(h.actor.snapshot.phase, 'waiting');
  assert.equal(h.actor.snapshot.players.length, 2, 'the seat is still there when the match ends');
  assert.equal(h.actor.exportState().seatLeases.new, h.now + ROOM_SEAT_DISCONNECT_TTL_MS, 'its lease restarts at the end');
  assert.equal(h.scheduledAt, h.now + ROOM_SEAT_DISCONNECT_TTL_MS);
  await h.advance(ROOM_SEAT_DISCONNECT_TTL_MS);
  assert.deepEqual(h.actor.snapshot.players.map((p) => p.id), ['admin']);
}

// ---- the elected last resort cannot host (`unable`): with nobody left the match is lost at once — not after the 30 s report budget
{
  const { h, matchId } = await startedP2pRoom();
  // the guest cannot host at all (the mobile tier says so on join); the admin hosts
  assert.equal((await h.command('g', { type: 'host_decline', declined: true, unable: true })).type, 'room_ack');
  assert.equal(h.actor.snapshot.host.hostId, 'admin');
  h.actor.handleClose('a');
  await h.advance(ROOM_HOST_DISCONNECT_GRACE_MS);
  assert.deepEqual(h.last('g', 'host_changed').payload, { hostId: 'guest', generation: 2, resumeTick: 0, reason: 'timeout', hostSecret: hostSecretOf(matchId) }, 'the last resort is elected');
  // its client answers at once: elected but unable
  const resolvedAt = h.now;
  assert.equal((await h.command('g', { type: 'host_decline', declined: true, unable: true })).type, 'room_ack');
  assert.equal(h.actor.snapshot.match.status, 'lost');
  assert.equal(h.actor.snapshot.phase, 'waiting');
  assert.deepEqual(h.actor.snapshot.lastResult, { round: 1, result: null, reason: 'match_lost' });
  assert.equal(h.last('w', 'match_status').payload.status, 'lost');
  assert.equal(h.last('g', 'match_status').payload.status, 'lost');
  assert.equal(h.actor.snapshot.host.hostId, null);
  assert.equal(h.actor.exportState().hostReportDueAt, null, 'no report budget is left to run');
  assert.equal(h.now, resolvedAt, 'resolved within the same instant');
  assert.deepEqual(h.actor.exportState().steppedDown, []);
}
{
  // a preference decline from the last resort keeps it hosting (P1b, unchanged): only `unable` ends the match
  const { h } = await startedP2pRoom();
  await h.command('g', { type: 'host_decline', declined: true });
  h.actor.handleClose('a');
  await h.advance(ROOM_HOST_DISCONNECT_GRACE_MS);
  assert.equal(h.actor.snapshot.host.hostId, 'guest');
  await h.command('g', { type: 'host_decline', declined: true });
  assert.equal(h.actor.snapshot.host.hostId, 'guest', 'kept: it may boot afresh');
  assert.ok(['starting', 'playing'].includes(h.actor.snapshot.match.status), 'the match runs on');
  assert.equal(h.actor.exportState().hostReportDueAt, h.now + ROOM_MATCH_REPORT_STALE_AFTER_MS, 'the report budget is what ends it if the kept host never boots');
}

// ---- seat leases survive a hibernation round trip; a state written before them gives every disconnected seat a lease from the restore
{
  const h = createHarness({ transport: 'p2p' });
  h.actor.handleOpen('a'); await h.send('a', 'room_create', { ...identity('admin'), mode: 'private', settings: { teamSize: 2 } });
  h.actor.handleOpen('g'); await h.send('g', 'room_join', identity('guest', token('c'), token('d')));
  h.actor.handleClose('g');
  const state = JSON.parse(JSON.stringify(h.actor.exportState()));
  assert.equal(state.seatLeases.guest, h.now + ROOM_SEAT_DISCONNECT_TTL_MS);
  const h2 = createHarness({ transport: 'p2p' });
  h2.now = h.now + 1000;
  h2.actor.restore(state);
  h2.actor.attachSocket({ ...h.actor.socketRecord('a') });
  h2.actor.settleAfterRestore();
  assert.equal(h2.actor.exportState().seatLeases.guest, state.seatLeases.guest, 'the lease keeps its deadline across the restart');
  assert.equal(h2.actor.exportState().seatLeases.admin, undefined, 'a re-attached seat holds none');
  assert.equal(h2.scheduledAt, state.seatLeases.guest);
  const legacy = { ...state };
  delete legacy.seatLeases;
  const h3 = createHarness({ transport: 'p2p' });
  h3.now = h.now + 5000;
  h3.actor.restore(legacy);
  h3.actor.settleAfterRestore();
  assert.equal(h3.actor.exportState().seatLeases.admin, h3.now + ROOM_SEAT_DISCONNECT_TTL_MS, 'a state without leases: every seat left without a socket is reaped from the restore');
  assert.equal(h3.actor.exportState().seatLeases.guest, h3.now + ROOM_SEAT_DISCONNECT_TTL_MS);
}

console.log('roomActor: PASS');
