// The Multiplayer v2 exit flow at the session layer, on stub sockets and
// injected timers: Leave battle sends the wire LEAVE, closes the match socket,
// releases the presentation and returns the session to the lobby — in that
// order, with no listener or timer left behind; the seat re-enters the same
// running match with its retained match_start and the same token; a room
// leave sends room_leave, closes the room socket, stops the keepalive and
// forgets the capability; the server dropping the seat (a wire CLOSE with a
// seat-drop reason) reaches the session as `lost` with the reason readable,
// and the same leave cleans up without a LEAVE frame on a dead socket; the
// room ending the seat (kicked) tears the match down through the same path.
import assert from 'node:assert/strict';
import { MatchSession } from './matchSession.ts';
import { RoomClient } from '../room/roomClient.ts';
import { ROOM_CLIENT_MESSAGE, ROOM_SERVER_MESSAGE } from '../room/protocol.ts';
import { RecordingPresentation } from '../presentation/adapter.ts';
import { CLOSE_REASON, MESSAGE_TYPE, PROTOCOL_VERSION, SNAPSHOT_HZ, TEAM, TICK_HZ, decodeMessage, encodeMessage } from '../wire/index.ts';
import { SEAT_DROP_REASONS } from './networkStatus.ts';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const settle = async (times = 8) => { for (let index = 0; index < times; index++) await tick(); };
const encoder = new TextEncoder();
const decoder = new TextDecoder();

// ------------------------------------------------------------ stub sockets and timers

class FakeSocket {
  constructor(url, order) {
    this.url = url;
    this.order = order;
    this.readyState = 0;
    this.binaryType = 'blob';
    this.bufferedAmount = 0;
    this.sent = [];
    this.closes = [];
    this.listeners = new Map();
    this.kind = url.includes('/match') ? 'match' : 'room';
  }
  addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(listener); }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  get listenerCount() { let count = 0; for (const set of this.listeners.values()) count += set.size; return count; }
  emit(type, event = {}) { for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event); }
  open() { this.readyState = 1; this.emit('open', {}); }
  send(data) {
    const bytes = data instanceof Uint8Array ? data.slice() : new Uint8Array(data);
    this.sent.push(bytes);
    if (this.kind === 'match') {
      const decoded = decodeMessage(bytes);
      this.order.push(`match.send:${decoded.ok ? decoded.message.type : 'bad'}`);
    } else {
      this.order.push(`room.send:${JSON.parse(decoder.decode(bytes)).type}`);
    }
  }
  close(code, reason) { this.closes.push([code, reason]); this.readyState = 3; this.order.push(`${this.kind}.close:${code}:${reason}`); }
  receive(bytes) { this.emit('message', { data: bytes }); }
  drop(code = 1006) { this.readyState = 3; this.emit('close', { code, reason: '' }); }
}

function createHarness() {
  const order = [];
  const sockets = [];
  const timers = [];
  let nowMs = 100_000;
  const clock = () => nowMs;
  const setTimer = (callback, delayMs) => { const handle = { callback, delayMs, cleared: false, fired: false }; timers.push(handle); return handle; };
  const clearTimer = (handle) => { handle.cleared = true; };
  const createSocket = (url) => { const socket = new FakeSocket(url, order); sockets.push(socket); return socket; };
  const stored = new Map();
  const storage = { getItem: (key) => stored.get(key) ?? null, setItem: (key, value) => { stored.set(key, value); }, removeItem: (key) => { stored.delete(key); } };
  const room = new RoomClient({
    endpoint: 'ws://rooms.test', player: { id: 'me', name: 'Me' }, storage, clock, clientBuild: 'receipt', setTimer, clearTimer,
    transport: { createSocket, setTimer, clearTimer, random: () => 0.5 },
  });
  const presentations = [];
  const session = new MatchSession({
    room, clock, clientBuild: 'receipt',
    transport: { createSocket, setTimer, clearTimer, random: () => 0.5 },
    createPresentation: () => {
      const presentation = { adapter: new RecordingPresentation(8), controls: null, prediction: null, disposed: false, dispose() { presentation.disposed = true; order.push('presentation.dispose'); } };
      presentations.push(presentation);
      return presentation;
    },
  });
  const phases = [];
  session.onPhase((change) => { phases.push(change.phase); order.push(`phase:${change.phase}`); });
  const roomPhases = [];
  room.onPhase((change) => roomPhases.push(change.phase));
  const lastEnvelope = (socket) => JSON.parse(decoder.decode(socket.sent.at(-1)));
  const reply = (socket, envelope) => socket.receive(encoder.encode(JSON.stringify(envelope)));
  const roomSnapshot = (phase = 'playing', match = { id: 'm1-abc', round: 1, status: 'playing', mapId: 'verdant', seed: 7, startedAt: 0, endedAt: null, verdict: null }) => ({
    v: 2, roomCode: 'ROOM01', mode: 'lan', phase, adminId: 'me', revision: 3, round: 1,
    settings: { gameMode: 'standard', mapId: 'verdant', teamSize: 2, maxSpectators: 2, botsFill: true, allowTeamSwitch: true, locked: false, arrangement: null, campaignOperationId: null },
    players: [
      { id: 'me', name: 'Me', team: 'alpha', seat: 0, specId: 'm1a2', equipment: [], camo: 'factory', ready: true, connected: true, isAdmin: true, joinedAt: 1 },
      { id: 'foe', name: 'Foe', team: 'bravo', seat: 1, specId: 'm1a2', equipment: [], camo: 'factory', ready: true, connected: true, isAdmin: false, joinedAt: 2 },
    ],
    match, lastResult: null, createdAt: 0, touchedAt: 0,
  });
  const matchStart = { matchId: 'm1-abc', round: 1, mapId: 'verdant', mode: 'standard', seed: 7, seat: 0, team: 'alpha', seatToken: 'tok-me', matchUrl: '/match', expiresAt: 9e12 };
  const welcome = () => ({
    type: MESSAGE_TYPE.WELCOME, protocolVersion: PROTOCOL_VERSION, tickHz: TICK_HZ, snapshotHz: SNAPSHOT_HZ, seat: 0, entityId: 1, team: TEAM.ALPHA,
    serverTick: 600, serverTimeMs: 10_000, seed: 7, capabilities: 0, roomId: 'ROOM01', mapId: 'verdant', mode: 'standard', rulesetJson: '{}',
    roster: [
      { entityId: 1, seat: 0, team: TEAM.ALPHA, bot: false, connected: true, playerId: 'me', name: 'Me', specId: 'm1a2' },
      { entityId: 2, seat: 1, team: TEAM.BRAVO, bot: false, connected: true, playerId: 'foe', name: 'Foe', specId: 'm1a2' },
    ],
  });
  /** The room host: admit the join with the running match's match_start. */
  const admit = async ({ withMatch = true } = {}) => {
    const joining = room.join({ roomCode: 'ROOM01' });
    await settle();
    const socket = sockets.find((candidate) => candidate.kind === 'room' && candidate.readyState === 0);
    socket.open();
    await settle();
    const envelope = lastEnvelope(socket);
    assert.equal(envelope.type, ROOM_CLIENT_MESSAGE.JOIN);
    reply(socket, { type: ROOM_SERVER_MESSAGE.JOINED, requestId: envelope.requestId, payload: { room: roomSnapshot(withMatch ? 'playing' : 'waiting', withMatch ? undefined : null), playerId: 'me', seat: 0, chat: [], region: 'test' } });
    if (withMatch) reply(socket, { type: ROOM_SERVER_MESSAGE.MATCH_START, payload: { ...matchStart } });
    await joining;
    await settle();
    return socket;
  };
  /** The match host: open the newest match socket and answer its HELLO with a WELCOME. */
  const welcomeMatch = async () => {
    await settle();
    const socket = sockets.filter((candidate) => candidate.kind === 'match').at(-1);
    assert.ok(socket && socket.readyState === 0, 'a fresh match socket was created');
    socket.open();
    await settle();
    const hello = decodeMessage(socket.sent.at(-1));
    assert.equal(hello.ok && hello.message.type, MESSAGE_TYPE.HELLO);
    assert.equal(hello.message.token, 'tok-me', 'the seat token rides HELLO');
    socket.receive(encodeMessage(welcome()));
    await settle();
    return socket;
  };
  const advance = (ms) => { nowMs += ms; session.update(nowMs, ms / 1000); };
  return { order, sockets, timers, room, session, presentations, phases, roomPhases, storage, stored, admit, welcomeMatch, lastEnvelope, reply, advance, matchStart, clock: () => nowMs };
}

// ------------------------------------------------------------ leave battle: LEAVE, close, presentation, lobby — then re-entry, then the room leave
{
  const h = createHarness();
  h.session.start();
  const roomSocket = await h.admit();
  assert.equal(h.room.phase, 'joined');
  assert.equal(h.room.region, 'test');
  assert.equal(h.room.seat, 0);
  assert.ok(h.room.rttMs >= 0, 'the admission round trip is the first room RTT');
  assert.ok(h.room.matchStart, 'the seat holds the running match\'s match_start');
  assert.equal(h.session.phase, 'match', 'the session entered the announced match');
  const matchSocket1 = await h.welcomeMatch();
  assert.ok(h.session.match?.welcome, 'welcomed');
  assert.equal(h.session.round?.matchStart.matchId, 'm1-abc');
  assert.equal(h.presentations.length, 1);
  h.advance(50); h.advance(50);
  const pings = matchSocket1.sent.filter((bytes) => decodeMessage(bytes).message?.type === MESSAGE_TYPE.PING).length;
  assert.ok(pings >= 1, 'the live client pings');

  // ---- the exit
  h.order.length = 0;
  await h.session.leaveMatch('leave battle');
  assert.deepEqual(h.order, [`match.send:${MESSAGE_TYPE.LEAVE}`, 'match.close:1000:leave', 'presentation.dispose', 'phase:lobby'],
    'LEAVE on the wire, the socket closed, the presentation released, the session back in the lobby — in that order');
  const leave = decodeMessage(matchSocket1.sent.at(-1));
  assert.equal(leave.message.reason, CLOSE_REASON.CLIENT_LEAVE, 'the LEAVE names the client\'s own departure');
  assert.equal(matchSocket1.listenerCount, 0, 'the dead match socket keeps no listeners');
  assert.deepEqual(matchSocket1.closes, [[1000, 'leave']]);
  assert.equal(h.session.match, null);
  assert.equal(h.session.round, null);
  assert.equal(h.session.update(h.clock() + 16, 0.016), null, 'a left session produces no frames');
  assert.equal(h.presentations[0].disposed, true);
  assert.equal(h.room.phase, 'joined', 'the room seat stays');
  assert.ok(h.room.matchStart, 'the match_start is retained for a re-entry');
  const matchTimers = h.timers.filter((timer) => !timer.cleared && !timer.fired);
  assert.equal(matchTimers.length, 1, 'only the room keepalive stays armed');
  assert.equal(matchTimers[0].delayMs, 15_000);

  // ---- re-entry into the same running match with the retained match_start and the same token
  h.order.length = 0;
  const reentry = h.session.enterMatch(h.room.matchStart);
  const matchSocket2 = await h.welcomeMatch();
  await reentry;
  assert.notEqual(matchSocket2, matchSocket1, 'a fresh socket');
  assert.equal(h.session.phase, 'match');
  assert.equal(h.session.round?.matchStart.matchId, 'm1-abc', 'the same match');
  assert.equal(h.session.match?.welcome?.entityId, 1, 'the same entity');
  assert.equal(h.presentations.length, 2, 'a fresh presentation for the re-entered round');
  assert.ok(h.order.includes('phase:loading') && h.order.includes('phase:match'));
  await h.session.leaveMatch('leave again');
  assert.equal(matchSocket2.listenerCount, 0);

  // ---- the room leave: room_leave, the socket closed, the keepalive stopped, the capability forgotten
  assert.equal(h.room.hasResumeCapability('ROOM01'), true);
  h.order.length = 0;
  const leaving = h.room.leave();
  await settle();
  const envelope = h.lastEnvelope(roomSocket);
  assert.equal(envelope.type, ROOM_CLIENT_MESSAGE.LEAVE);
  h.reply(roomSocket, { type: ROOM_SERVER_MESSAGE.ACK, requestId: envelope.requestId, payload: { left: true } });
  await leaving;
  assert.deepEqual(h.order, ['room.send:room_leave', 'room.close:1000:room client', 'phase:lobby'].filter((entry) => entry !== 'phase:lobby'),
    'room_leave on the wire, then the room socket closed');
  assert.equal(h.room.phase, 'closed');
  assert.equal(h.room.lastClosedReason, 'left_room');
  assert.equal(h.room.hasResumeCapability('ROOM01'), false, 'an explicit leave forgets the capability');
  assert.equal(roomSocket.listenerCount, 0, 'the dead room socket keeps no listeners');
  h.session.dispose();
  h.room.dispose();
  assert.ok(h.timers.every((timer) => timer.cleared || timer.fired), 'no timer is left armed after the exit');
  assert.ok(h.sockets.every((socket) => socket.listenerCount === 0 && socket.readyState === 3), 'every socket is closed and unlistened');
}

// ------------------------------------------------------------ the server drops the seat: CLOSE(replaced) → lost with the reason, the same clean leave
{
  const h = createHarness();
  h.session.start();
  await h.admit();
  const matchSocket = await h.welcomeMatch();
  const lost = [];
  h.session.onPhase((change) => { if (change.phase === 'lost') lost.push(h.session.match?.lastCloseReason ?? null); });
  matchSocket.receive(encodeMessage({ type: MESSAGE_TYPE.CLOSE, reason: CLOSE_REASON.REPLACED, detail: 'seat reconnected' }));
  await settle();
  assert.equal(h.session.phase, 'lost');
  assert.deepEqual(lost, [CLOSE_REASON.REPLACED], 'the session names the wire reason while the client is still attached');
  assert.ok(SEAT_DROP_REASONS.has(lost[0]), 'a replacement is a seat drop');
  assert.equal(h.session.match?.lastCloseDetail, 'seat reconnected');
  assert.deepEqual(matchSocket.closes, [[1000, 'seat reconnected']], 'a deliberate server close is never reconnected');
  assert.equal(h.session.match?.transport.state, 'closed');
  h.order.length = 0;
  await h.session.leaveMatch('dropped');
  assert.deepEqual(h.order, ['presentation.dispose', 'phase:lobby'], 'no LEAVE frame on a dead socket; the presentation is released and the session returns to the lobby');
  assert.equal(matchSocket.listenerCount, 0);
  assert.equal(h.room.phase, 'joined', 'a match-level drop leaves the room seat to the room');
  h.session.dispose();
  h.room.dispose();
  assert.ok(h.timers.every((timer) => timer.cleared || timer.fired));
}

// ------------------------------------------------------------ the room ends the seat: room_closed(kicked) tears the match down through the same leave
{
  const h = createHarness();
  h.session.start();
  const roomSocket = await h.admit();
  const matchSocket = await h.welcomeMatch();
  const closed = [];
  h.room.onClosed((change) => closed.push(change.reason));
  h.order.length = 0;
  h.reply(roomSocket, { type: ROOM_SERVER_MESSAGE.CLOSED, payload: { reason: 'kicked' } });
  await settle();
  assert.deepEqual(closed, ['kicked']);
  assert.equal(h.room.phase, 'closed');
  assert.equal(h.room.hasResumeCapability('ROOM01'), false, 'a kick forgets the capability');
  assert.deepEqual(h.order.filter((entry) => !entry.startsWith('room.')), [`match.send:${MESSAGE_TYPE.LEAVE}`, 'match.close:1000:leave', 'presentation.dispose', 'phase:lobby'],
    'the room closing runs the same match leave');
  assert.ok(h.order.includes('room.close:1000:room client'));
  assert.equal(matchSocket.listenerCount, 0);
  assert.equal(roomSocket.listenerCount, 0);
  h.session.dispose();
  h.room.dispose();
  assert.ok(h.timers.every((timer) => timer.cleared || timer.fired));
}

console.log('exitFlow.selftest: leave battle (LEAVE → close → presentation → lobby, no timers or listeners left), re-entry with the retained match_start and token, the room leave, a server seat drop and a room kick through the same path — PASS');
