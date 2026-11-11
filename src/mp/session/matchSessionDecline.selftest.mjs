// Proof (implicit state machine audit M2, 2026-11-02): a seat's host decline lasts one match, unless it is the seat's own.
// The room's `hostDeclined` was set by every `host_decline` and never reset at a match's start or end, and the session's
// `declinedHosting` latch blocked the only re-offer path (the headroom recovery): a host that left its match (a Garage
// return mid-round) read as declined for the rest of its seat's life, so the admin-hosts-first election stopped holding
// after the first match. A mobile seat's `unable` is the seat's own and must survive the reset.
// Here: (1) the room actor resets the declines at a match's end and re-elects the admin first; (2) a session whose host
// left a round mid-match forgets that decline once the room is back to waiting, so its headroom path works again; (3) a
// mobile seat says its `unable` again when the room's reset reaches it.
// (4) (2026-11-03) The session withdraws only a decline of its own: one sent as its match ended that the room read after
// its reset, or a declined record an admission finds while the seat is willing. It used to withdraw every declined
// record it saw while willing in the lobby, so a decline sent straight through the room client (tools/mp-p2p-decline's
// "p2 and p3 have declined", the headless peer tool's declineHost hook) was undone as soon as the room echoed it, and the
// e2e passed only when it caught the echo inside the room's coalescing window.
// (5) (round 2 U7) A decline the room refuses stays the seat's and goes through its one owner: it is said again when
// the room's record moves or on an admission, never on every snapshot or every slow frame.
// (6)-(8) (round 2 Q4) The late mark ends only when no late say of the seat's may land: a refusal ends it, a timeout or
// a lost socket does not, and (8) names the failures that prove a command never reached the room's record.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { RoomActor } from '../room/roomActor.ts';
import { createP2pMatchHost } from '../room/p2pMatchHost.ts';
import { RoomClient } from '../room/roomClient.ts';
import { p2pMatchUrl } from '../room/protocol.ts';
import { createRoom, joinRoom, serializeRoom } from '../room/roomPolicy.ts';
import { MatchSession } from './matchSession.ts';
import { RecordingPresentation } from '../presentation/adapter.ts';
import { Listeners } from '../transport/transport.ts';
import { RtcWorld } from '../transport/rtcDouble.test-support.ts';
import { createInProcessHostPort } from '../host/inProcessHost.ts';
import { signSeatToken } from '../../../server/match/seatToken.ts';

const SECRET = 'session-decline-seat-secret-0123456789abcdef';
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (predicate, label, timeoutMs = 10_000) => {
  const started = Date.now();
  while (!predicate()) { if (Date.now() - started > timeoutMs) throw new Error(`timeout: ${label}`); await sleep(15); }
};

// ---- (1) the room: a host that declined while hosting is a candidate again at the next match
{
  let now = 1_700_000_000_000;
  const sent = new Map();
  let seed = 0;
  const actor = new RoomActor('DECL01', {
    now: () => now, random: () => ((seed = (seed * 1103515245 + 12345) >>> 0) % 1000) / 1000, sha256Hex: sha256, seatSecret: SECRET, signSeatToken,
    matchHost: createP2pMatchHost(),
    send(socketId, message) { if (!sent.has(socketId)) sent.set(socketId, []); sent.get(socketId).push(message); },
    closeSocket() {}, schedule() {}, persist() {},
  });
  const send = (socketId, type, payload = {}) => actor.handleMessage(socketId, JSON.stringify({ type, requestId: `r${++seed}`, payload }));
  const command = (socketId, cmd) => send(socketId, 'room_command', { command: cmd });
  const token = (c) => c.repeat(64);
  const identity = (id, a, b) => ({ roomCode: 'DECL01', player: { id, name: id }, resumeToken: token(a), nextResumeToken: token(b), selection: { specId: 'm1a1_abrams_hc' } });
  actor.handleOpen('a'); await send('a', 'room_create', { ...identity('admin', 'a', 'b'), mode: 'private', settings: { teamSize: 2, mapId: 'verdant' } });
  actor.handleOpen('g'); await send('g', 'room_join', identity('guest', 'c', 'd'));
  const start = async () => {
    await command('a', { type: 'set_ready', ready: true });
    await command('g', { type: 'set_ready', ready: true });
    await command('a', { type: 'start' });
    return actor.snapshot.match.id;
  };
  const first = await start();
  assert.equal(actor.snapshot.host.hostId, 'admin', 'setup: the admin hosts first');
  // the admin leaves the round mid-match (a Garage return): its session says it cannot host this match any more
  await command('a', { type: 'host_decline', declined: true, unable: true });
  assert.equal(actor.snapshot.host.hostId, 'guest', 'setup: the guest took the match over');
  await command('g', { type: 'match_report', matchId: first, generation: actor.snapshot.host.generation, phase: 'ended', tick: 900, verdict: { result: 'alpha', reason: 'elimination' } });
  assert.equal(actor.snapshot.phase, 'waiting');
  assert.equal(actor.snapshot.players.find((player) => player.id === 'admin').hostDeclined, false,
    'the room forgets a decline at the end of the match it was made for');
  await start();
  assert.equal(actor.snapshot.host.hostId, 'admin', 'the admin hosts first again at the next match');
}

// ---- the session over a scripted room socket
function scriptedTransport() {
  const frames = new Listeners();
  const states = new Listeners();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const outbound = [];
  const transport = {
    kind: 'scripted', state: 'idle', bufferedBytes: 0, stats: { framesSent: 0, bytesSent: 0, framesReceived: 0, bytesReceived: 0, framesDropped: 0, framesRejected: 0, reconnects: 0, opens: 0 },
    open() { transport.state = 'open'; states.emit({ state: 'open', previous: 'idle' }); },
    send(frame) { outbound.push(JSON.parse(decoder.decode(frame))); return true; },
    reconnect() {}, close() { transport.state = 'closed'; states.emit({ state: 'closed', previous: 'open', reason: 'client' }); },
    onFrame: (listener) => frames.add(listener), onState: (listener) => states.add(listener),
    deliver(envelope) { frames.emit(encoder.encode(JSON.stringify(envelope))); },
    blip() { transport.state = 'reconnecting'; states.emit({ state: 'reconnecting', previous: 'open', detail: 'blip' }); },
    outbound,
  };
  return transport;
}
const roomCode = 'SESDCL';
const room = createRoom({ roomCode, mode: 'lan', creator: { id: 'me', name: 'Me' }, selection: { specId: 'm1a1_abrams_hc' }, settings: { teamSize: 2, mapId: 'verdant', botsFill: false }, now: 1000 });
joinRoom(room, { player: { id: 'other', name: 'Other' }, selection: { specId: 't90am' }, team: null, now: 1001 });
const snapshot = ({ host = { transport: 'p2p', hostId: null, generation: 0, since: 0 }, phase = 'waiting', match = null, declined = false } = {}) => {
  const base = serializeRoom(room);
  return { ...base, phase, match, host, players: base.players.map((player) => (player.id === 'me' ? { ...player, hostDeclined: declined } : player)) };
};
const world = new RtcWorld();
const cores = [];
const declinesOf = (transport, from = 0) => transport.outbound.slice(from).filter((envelope) => envelope.payload?.command?.type === 'host_decline').map((envelope) => envelope.payload.command);
async function seat(p2p = {}, { declined = false, requestTimeoutMs = 60_000 } = {}) {
  let transport = null;
  const client = new RoomClient({ endpoint: 'ws://rooms.test', player: { id: 'me', name: 'Me' }, pingIntervalMs: 0, requestTimeoutMs, createTransport: () => { transport = scriptedTransport(); return transport; } });
  const session = new MatchSession({
    room: client, clock: () => performance.now(),
    createPresentation: () => { const presentation = new RecordingPresentation(16); return { adapter: presentation, controls: null, prediction: null, dispose: () => presentation.dispose() }; },
    p2p: { createPeerConnection: world.createPeerConnection, createHostPort: createInProcessHostPort({ world: 'terrain', onCore: (core) => cores.push(core), reportIntervalMs: 500 }), manifestBase: null, tier: 'desktop', countdownS: 1, ...p2p },
  });
  session.start();
  const joining = client.join({ roomCode });
  await sleep(0);
  const request = transport.outbound.find((envelope) => envelope.type === 'room_join');
  transport.deliver({ type: 'room_joined', requestId: request.requestId, payload: { room: snapshot({ declined }), playerId: 'me', seat: 0, chat: [] } });
  await joining;
  return { client, session, transport };
}

// ---- (2) a host that left its match mid-round is willing again once the room is back to waiting
{
  const { client, session, transport } = await seat();
  const pump = setInterval(() => session.update(performance.now(), 1 / 60), 16);
  try {
    const matchId = 'm1-0000d0d0';
    const hostSecret = sha256(`${SECRET}:${matchId}`);
    const seatToken = signSeatToken(hostSecret, { v: 1, roomId: roomCode, seat: 0, playerId: 'me', name: 'Me', team: 'alpha', specId: 'm1a1_abrams_hc', iat: Date.now() - 1000, exp: Date.now() + 3_600_000 });
    const match = { id: matchId, round: 1, status: 'playing', mapId: 'verdant', seed: 7, startedAt: 1000, endedAt: null, verdict: null };
    transport.deliver({ type: 'room_state', payload: { room: snapshot({ host: { transport: 'p2p', hostId: 'me', generation: 1, since: 2000 }, phase: 'starting', match: { ...match, status: 'starting' } }) } });
    transport.deliver({ type: 'match_start', payload: { matchId, round: 1, mapId: 'verdant', mode: 'standard', seed: 7, seat: 0, team: 'alpha', seatToken, matchUrl: p2pMatchUrl(roomCode, 1), hostId: 'me', hostSecret, expiresAt: Date.now() + 3_600_000 } });
    await until(() => session.phase === 'match' && session.matchHost?.state === 'live', 'this seat hosts round 1');
    // a Garage return mid-round: the host hands the match on as unable
    await session.leaveMatch('garage');
    assert.deepEqual(declinesOf(transport).at(-1), { type: 'host_decline', declined: true, unable: true }, 'setup: the leave handed the match on');
    // the room: the match runs on another host with this seat declined, then ends and resets every decline
    transport.deliver({ type: 'room_state', payload: { room: snapshot({ host: { transport: 'p2p', hostId: 'other', generation: 2, since: 3000 }, phase: 'playing', match, declined: true }) } });
    const ended = { host: { transport: 'p2p', hostId: null, generation: 2, since: 4000 }, phase: 'waiting', match: { ...match, status: 'ended', endedAt: 4000, verdict: { result: 'alpha', reason: 'elimination' } } };
    transport.deliver({ type: 'room_state', payload: { room: snapshot({ ...ended, declined: false }) } });
    // (4) the leave's decline was still on its way (this room never answers it): the room reads it after its reset, and
    // the session withdraws it once, the decline being over with its match
    const late = transport.outbound.length;
    transport.deliver({ type: 'room_state', payload: { room: snapshot({ ...ended, declined: true }) } });
    await sleep(0);
    assert.deepEqual(declinesOf(transport, late), [{ type: 'host_decline', declined: false }], '(4) its own decline, read after the reset, is withdrawn');
    transport.deliver({ type: 'room_state', payload: { room: snapshot({ ...ended, declined: false }) } });
    transport.deliver({ type: 'room_state', payload: { room: snapshot({ ...ended, declined: true }) } });
    await sleep(0);
    assert.deepEqual(declinesOf(transport, late), [{ type: 'host_decline', declined: false }], '(4) once: a later declined record is not that decline');
    transport.deliver({ type: 'room_state', payload: { room: snapshot({ ...ended, declined: false }) } });
    // this tab then runs slow in the lobby: the headroom path is open again (the leave's latch kept it shut)
    const mark = transport.outbound.length;
    for (let frame = 0; frame < 600; frame++) session.observeFrame(50);
    await sleep(0);
    assert.deepEqual(declinesOf(transport, mark), [{ type: 'host_decline', declined: true }],
      'a slow tab declines for headroom after a match it left has ended');
    assert.equal(session.hostHeadroom?.declined, true);
  } finally {
    clearInterval(pump);
    session.dispose(); client.dispose();
  }
}

// ---- (3) a mobile seat cannot host at all: the room's reset reaches it and it says so again
{
  const { client, session, transport } = await seat({ tier: 'mobile' });
  assert.deepEqual(declinesOf(transport), [{ type: 'host_decline', declined: true, unable: true }], 'setup: the mobile seat declined as unable on join');
  transport.deliver({ type: 'room_state', payload: { room: snapshot({ declined: true }) } });
  assert.equal(declinesOf(transport).length, 1, 'the room holds the decline: nothing more to say');
  // a match ended: the room reset every decline
  transport.deliver({ type: 'room_state', payload: { room: snapshot({ declined: false }) } });
  await sleep(0);
  assert.deepEqual(declinesOf(transport).slice(1), [{ type: 'host_decline', declined: true, unable: true }],
    'the mobile seat says again that it cannot host');
  session.dispose(); client.dispose();
}
// ---- (4) a decline sent straight through the room client stays; a declined record an admission finds is withdrawn
{
  const { client, session, transport } = await seat();
  void client.declineHost(true).catch(() => {});
  transport.deliver({ type: 'room_state', payload: { room: snapshot({ declined: true }) } });
  await sleep(0);
  assert.deepEqual(declinesOf(transport), [{ type: 'host_decline', declined: true }], '(4) the session leaves a decline it did not make to the room');
  session.dispose(); client.dispose();
}
{
  const { client, session, transport } = await seat({}, { declined: true });
  await sleep(0);
  assert.deepEqual(declinesOf(transport), [{ type: 'host_decline', declined: false }], '(4) admitted willing over an earlier page\'s decline: withdrawn');
  session.dispose(); client.dispose();
}
// ---- (5) (round 2 U7) a decline the room refuses (an older room, a timeout) stays the seat's own: said again when the
// room's record moves or on the next admission, never on every snapshot. The unable and headroom says' failure callbacks
// wrote `this.decline = null` past the owner, so every later room_state said `unable` again and emitted another
// 'declined' event, and every later slow frame said `headroom` again.
{
  const { client, session, transport } = await seat({ tier: 'mobile' });
  const events = [];
  session.onP2p((event) => events.push(event.kind));
  const refuse = () => {
    const say = transport.outbound.findLast((envelope) => envelope.payload?.command?.type === 'host_decline');
    transport.deliver({ type: 'error', requestId: say.requestId, payload: { code: 'invalid_command', message: 'an older room' } });
  };
  assert.deepEqual(declinesOf(transport), [{ type: 'host_decline', declined: true, unable: true }], 'setup: the mobile seat declined as unable on join');
  refuse();
  await sleep(0);
  for (let index = 0; index < 4; index++) transport.deliver({ type: 'room_state', payload: { room: snapshot({ declined: false }) } });
  await sleep(0);
  assert.equal(declinesOf(transport).length, 1, `(5) a refused unable decline is not said again on every room_state (${declinesOf(transport).length} says)`);
  assert.deepEqual(events.filter((kind) => kind === 'declined'), [], '(5) nor announced again');
  // the room's record moves (it read some decline, then reset): the seat's own decline is said again, once
  transport.deliver({ type: 'room_state', payload: { room: snapshot({ declined: true }) } });
  transport.deliver({ type: 'room_state', payload: { room: snapshot({ declined: false }) } });
  transport.deliver({ type: 'room_state', payload: { room: snapshot({ declined: false }) } });
  await sleep(0);
  assert.deepEqual(declinesOf(transport).slice(1), [{ type: 'host_decline', declined: true, unable: true }], '(5) a reset of the room\'s record says the unable decline again, once');
  session.dispose(); client.dispose();
}
{
  const { client, session, transport } = await seat();
  for (let frame = 0; frame < 600; frame++) session.observeFrame(50);
  await sleep(0);
  assert.deepEqual(declinesOf(transport), [{ type: 'host_decline', declined: true }], 'setup: a slow tab declined for headroom');
  const say = transport.outbound.findLast((envelope) => envelope.payload?.command?.type === 'host_decline');
  transport.deliver({ type: 'error', requestId: say.requestId, payload: { code: 'invalid_command', message: 'an older room' } });
  await sleep(0);
  for (let frame = 0; frame < 120; frame++) session.observeFrame(50);
  await sleep(0);
  assert.equal(declinesOf(transport).length, 1, `(5) a refused headroom decline is not said again on every slow frame (${declinesOf(transport).length} says)`);
  assert.equal(session.hostHeadroom?.declined, true, '(5) the seat still declines for headroom');
  session.dispose(); client.dispose();
}
{
  // the decline's one writer: no failure callback (or anything else) writes the field past setDecline
  const source = (await import('node:fs')).readFileSync(new URL('./matchSession.ts', import.meta.url), 'utf8');
  const writes = source.match(/this\.decline\s*=(?!=)/g) ?? [];
  assert.equal(writes.length, 1, `(5) setDecline is the decline's only writer (${writes.length} writes)`);
}
// ---- (6) (round 2 Q4, the review of round 3's declinesInFlight fix) a late decline the room refused never reaches it:
// the session's "my own decline is still on its way" mark (lateDecline) outlived that refusal, so the next declined
// record in that lobby, one other code sent through the room client, was withdrawn as if it were the late one
{
  const { client, session, transport } = await seat();
  const pump = setInterval(() => session.update(performance.now(), 1 / 60), 16);
  try {
    const matchId = 'm6-0000d6d6';
    const hostSecret = sha256(`${SECRET}:${matchId}`);
    const seatToken = signSeatToken(hostSecret, { v: 1, roomId: roomCode, seat: 0, playerId: 'me', name: 'Me', team: 'alpha', specId: 'm1a1_abrams_hc', iat: Date.now() - 1000, exp: Date.now() + 3_600_000 });
    const match = { id: matchId, round: 1, status: 'playing', mapId: 'verdant', seed: 7, startedAt: 1000, endedAt: null, verdict: null };
    transport.deliver({ type: 'room_state', payload: { room: snapshot({ host: { transport: 'p2p', hostId: 'me', generation: 1, since: 2000 }, phase: 'starting', match: { ...match, status: 'starting' } }) } });
    transport.deliver({ type: 'match_start', payload: { matchId, round: 1, mapId: 'verdant', mode: 'standard', seed: 7, seat: 0, team: 'alpha', seatToken, matchUrl: p2pMatchUrl(roomCode, 1), hostId: 'me', hostSecret, expiresAt: Date.now() + 3_600_000 } });
    await until(() => session.phase === 'match' && session.matchHost?.state === 'live', '(6) this seat hosts round 1');
    await session.leaveMatch('garage');
    const leaveSay = transport.outbound.findLast((envelope) => envelope.payload?.command?.type === 'host_decline');
    assert.deepEqual(leaveSay.payload.command, { type: 'host_decline', declined: true, unable: true }, '(6) setup: the leave handed the match on');
    // the room ends the match and resets every decline before it reads the leave's: the session marks its own as late
    const ended = { host: { transport: 'p2p', hostId: null, generation: 1, since: 4000 }, phase: 'waiting', match: { ...match, status: 'ended', endedAt: 4000, verdict: { result: 'alpha', reason: 'elimination' } } };
    transport.deliver({ type: 'room_state', payload: { room: snapshot({ ...ended, declined: false }) } });
    // ... and then refuses it: the late decline never reaches the room
    transport.deliver({ type: 'error', requestId: leaveSay.requestId, payload: { code: 'invalid_command', message: 'no match' } });
    await sleep(0);
    // a decline other code sends straight through the room client reaches the room and echoes
    const mark = transport.outbound.length;
    void client.declineHost(true).catch(() => {});
    transport.deliver({ type: 'room_state', payload: { room: snapshot({ ...ended, declined: true }) } });
    await sleep(0);
    assert.deepEqual(declinesOf(transport, mark), [{ type: 'host_decline', declined: true }], `(6) the session leaves a decline it did not make, once its own late one was refused (${JSON.stringify(declinesOf(transport, mark))})`);
  } finally {
    clearInterval(pump);
    session.dispose(); client.dispose();
  }
}
// ---- (7) (round 2 Q4, the review of (6)'s fix) a request that times out is no refusal: the room may have applied the
// late decline after its reset all the same, and its echo must still be withdrawn. 44af12dcec cleared the late mark on
// every failure, so the willing seat's record stayed declined (the next election passed it over, last resort only). The
// same holds for a request that timed out before the reset; the mark then never formed (the in-flight count had dropped).
const LATE_TIMEOUT_MS = 800;
const holdDeclines = (envelope) => envelope.payload?.command?.type === 'host_decline' && envelope.payload.command.declined === true;
// a room that answers every command at once but the ones `hold` keeps (a slow room that has not answered them in time)
function answering(transport, hold) {
  const answered = new Set();
  const timer = setInterval(() => {
    for (const envelope of transport.outbound) {
      if (envelope.type !== 'room_command' || answered.has(envelope.requestId) || hold(envelope)) continue;
      answered.add(envelope.requestId);
      transport.deliver({ type: 'room_ack', requestId: envelope.requestId, payload: { revision: 1 } });
    }
  }, 10);
  return () => clearInterval(timer);
}
// how each declineHost request of the seat ended ('ack' or the rejection's message)
function declineOutcomes(client) {
  const outcomes = [];
  const declineHost = client.declineHost.bind(client);
  client.declineHost = (...args) => {
    const request = declineHost(...args);
    request.then(() => outcomes.push('ack'), (error) => outcomes.push(String(error?.message ?? error)));
    return request;
  };
  return outcomes;
}
async function hostThenLeave(transport, session, matchId) {
  const hostSecret = sha256(`${SECRET}:${matchId}`);
  const seatToken = signSeatToken(hostSecret, { v: 1, roomId: roomCode, seat: 0, playerId: 'me', name: 'Me', team: 'alpha', specId: 'm1a1_abrams_hc', iat: Date.now() - 1000, exp: Date.now() + 3_600_000 });
  const match = { id: matchId, round: 1, status: 'playing', mapId: 'verdant', seed: 7, startedAt: 1000, endedAt: null, verdict: null };
  transport.deliver({ type: 'room_state', payload: { room: snapshot({ host: { transport: 'p2p', hostId: 'me', generation: 1, since: 2000 }, phase: 'starting', match: { ...match, status: 'starting' } }) } });
  transport.deliver({ type: 'match_start', payload: { matchId, round: 1, mapId: 'verdant', mode: 'standard', seed: 7, seat: 0, team: 'alpha', seatToken, matchUrl: p2pMatchUrl(roomCode, 1), hostId: 'me', hostSecret, expiresAt: Date.now() + 3_600_000 } });
  await until(() => session.phase === 'match' && session.matchHost?.state === 'live', `${matchId}: this seat hosts round 1`, 60_000);
  await session.leaveMatch('garage');
  const leaveSay = transport.outbound.findLast(holdDeclines);
  assert.deepEqual(leaveSay.payload.command, { type: 'host_decline', declined: true, unable: true }, `${matchId}: setup: the leave handed the match on`);
  const ended = { host: { transport: 'p2p', hostId: null, generation: 1, since: 4000 }, phase: 'waiting', match: { ...match, status: 'ended', endedAt: 4000, verdict: { result: 'alpha', reason: 'elimination' } } };
  return { leaveSay, ended };
}
for (const resetFirst of [true, false]) {
  const label = resetFirst ? '(7) timed out after the reset' : '(7) timed out before the reset';
  const { client, session, transport } = await seat({}, { requestTimeoutMs: LATE_TIMEOUT_MS });
  const outcomes = declineOutcomes(client);
  const stopAnswering = answering(transport, holdDeclines);
  const pump = setInterval(() => session.update(performance.now(), 1 / 60), 16);
  try {
    const { ended } = await hostThenLeave(transport, session, resetFirst ? 'm7-0000d7d7' : 'm7-0000e7e7');
    const reset = () => transport.deliver({ type: 'room_state', payload: { room: snapshot({ ...ended, declined: false }) } });
    // the room ends the match and resets every decline before it reads the leave's; its answer misses the budget
    if (resetFirst) reset();
    await until(() => outcomes.includes('room_command timed out'), `${label}: the leave's decline request timed out`);
    if (!resetFirst) reset();
    // ... and the room applied it after the reset all the same: its echo comes
    const mark = transport.outbound.length;
    transport.deliver({ type: 'room_state', payload: { room: snapshot({ ...ended, declined: true }) } });
    await sleep(0);
    assert.deepEqual(declinesOf(transport, mark), [{ type: 'host_decline', declined: false }],
      `${label}: the willing seat's own late decline, applied after the reset, is withdrawn (${JSON.stringify(declinesOf(transport, mark))})`);
    // once: the mark is spent, and a later declined record (another tool's) is left alone
    transport.deliver({ type: 'room_state', payload: { room: snapshot({ ...ended, declined: false }) } });
    transport.deliver({ type: 'room_state', payload: { room: snapshot({ ...ended, declined: true }) } });
    await sleep(0);
    assert.deepEqual(declinesOf(transport, mark), [{ type: 'host_decline', declined: false }], `${label}: withdrawn once`);
  } finally {
    stopAnswering();
    clearInterval(pump);
    session.dispose(); client.dispose();
  }
}
// ---- (8) (round 2 Q4 review) which failures prove a command never reached the room's record: a refusal with the room's
// own code, or a request never sent (not joined, no open socket). A timeout, a lost socket and the room's `internal` do not.
{
  const { roomCommandNeverApplied } = await import('../room/roomClient.ts');
  const { RoomError } = await import('../room/protocol.ts');
  assert.equal(roomCommandNeverApplied(new RoomError('invalid_command')), true, '(8) a refusal with the room\'s code');
  assert.equal(roomCommandNeverApplied(new RoomError('internal')), false, '(8) the room\'s internal fault may follow its write');
  assert.equal(roomCommandNeverApplied(new Error('boom')), false, '(8) a foreign error proves nothing');
  const { client, session, transport } = await seat({}, { requestTimeoutMs: 50 });
  const failure = (request) => request.then(() => null, (error) => error);
  const timedOut = await failure(client.declineHost(true));
  assert.equal(timedOut.message, 'room_command timed out', '(8) setup: an unanswered request times out');
  assert.equal(roomCommandNeverApplied(timedOut), false, '(8) a timeout may follow a write the room made');
  const pending = failure(client.declineHost(true));
  transport.blip();
  const lost = await pending;
  assert.equal(lost.message, 'connection lost', '(8) setup: a lost socket fails the request');
  assert.equal(roomCommandNeverApplied(lost), false, '(8) a lost socket may follow a write the room made');
  const notJoined = await failure(client.declineHost(true));
  assert.equal(notJoined.code, 'not_in_room', '(8) setup: a client that is not joined sends nothing');
  assert.equal(roomCommandNeverApplied(notJoined), true, '(8) a request never sent (not joined)');
  session.dispose(); client.dispose();
}
{
  // no open socket while joined: the request is never put on the wire
  const { roomCommandNeverApplied } = await import('../room/roomClient.ts');
  const { client, session, transport } = await seat();
  transport.state = 'closing';
  const unsent = await client.declineHost(true).then(() => null, (error) => error);
  assert.equal(unsent.message, 'not connected', '(8) setup: a joined client without an open socket');
  assert.equal(unsent.code, 'internal', '(8) still internal for every caller that reads only the code');
  assert.equal(roomCommandNeverApplied(unsent), true, '(8) a request never sent (no open socket)');
  session.dispose(); client.dispose();
}
for (const core of cores) core.dispose();
console.log('matchSessionDecline.selftest: a decline lasts its match (the room resets it, the session forgets it); a seat that cannot host says so again; the session withdraws only its own late decline or one an admission finds; a refused decline stays the seat\'s and is not said on every snapshot or frame; a refused late one marks nothing, a timed-out one is still withdrawn');
