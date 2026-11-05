// Proof (implicit state machine audit F6, 2026-11-02): the Play menu adapter's attempt and the seat it hands off.
// (A) connect() awaited the daily-limit check() before it recorded the attempt (`pending`, the generation): a close
//     during that check found nothing to cancel, and the connect then opened a socket and seated the player in a room
//     the menu had left — every later connect refused ("already owns"), and the room's next match_start entered it.
//     Two connects inside the check both passed the one-owner guard.
// (B) onHostStart fired for a connection the menu had released to the battle owner on every later round, and the menu
//     treated it as its own (re-adopting it beside the attached room); it now names the owner.
// (C) (round 2 U8) the adapter's half of the seat was three nullable variables (pending, current, released) beside the
//     menu's declared seat. Its own hold is now one declared state (idle, connecting, held) written by one owner; the
//     seat it released to the session owner stays one separate slot, because it outlives the hold: the menu may hold
//     nothing, or a new room of its own, while the battle owner still plays rounds on the released one.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRoomConnectionAdapter } from './playMenuAdapter.ts';
import { createRoom, serializeRoom } from '../room/roomPolicy.ts';
import { Listeners } from '../transport/transport.ts';

const selection = { specId: 'm1a1_abrams_hc', mapId: 'verdant', equipment: [], camo: 'factory' };
const request = { kind: 'create', mode: 'private', roomsUrl: 'wss://rooms.test', player: { id: 'me', name: 'Me' }, selection, teamSize: 2 };
const room = createRoom({ roomCode: 'ADPSEA', mode: 'private', creator: { id: 'me', name: 'Me' }, selection: { specId: 'm1a1_abrams_hc' }, settings: { teamSize: 2, mapId: 'verdant' }, now: 1000 });

/** A room client double: admitted at once; the receipt delivers match_start. */
function fakeClient(options, made) {
  const listeners = { state: new Listeners(), start: new Listeners(), phase: new Listeners(), closed: new Listeners() };
  const client = {
    playerId: options.player.id, endpoint: options.endpoint, matchStart: null, phase: 'idle', disposed: false,
    async create() { client.phase = 'joined'; return serializeRoom(room); },
    async join() { client.phase = 'joined'; return serializeRoom(room); },
    async leave() { client.phase = 'closed'; }, dispose() { client.disposed = true; },
    command: async () => ({}), chat: async () => {},
    onState: (listener) => listeners.state.add(listener), onMatchStart: (listener) => listeners.start.add(listener),
    onPhase: (listener) => listeners.phase.add(listener), onClosed: (listener) => listeners.closed.add(listener), onChat: () => () => {},
    deliverStart(payload) { client.matchStart = payload; listeners.start.emit(payload); },
  };
  made.push(client);
  return client;
}
const limitPending = () => {
  let release = null;
  const limit = {
    asked: 0,
    appliesTo: () => true,
    until: () => Date.now() + 60_000,
    check() { limit.asked++; return new Promise((resolve) => { release = resolve; }); },
    release: (state) => release(state),
  };
  return limit;
};

// ---- (A) a close during the limit check cancels the attempt: no socket, no seat
{
  const made = [];
  const limit = limitPending();
  const adapter = createRoomConnectionAdapter({ createRoomClient: (options) => fakeClient(options, made), serviceLimit: limit });
  const attempt = adapter.connect(request);
  assert.equal(adapter.connecting, true, 'the attempt is the menu\'s from the first moment, the limit check included');
  await assert.rejects(adapter.connect(request), /already owns/, 'a second connect inside the check is refused');
  adapter.close('menu_closed');
  assert.equal(adapter.connecting, false);
  limit.release('ok');
  assert.equal(await attempt, null, 'the cancelled attempt publishes nothing');
  assert.equal(made.length, 0, 'no room client (no socket) for a room the menu left');
  assert.equal(adapter.current, null);
  // and the menu may connect again at once
  const again = adapter.connect(request);
  limit.release('ok');
  const connection = await again;
  assert.ok(connection && adapter.current === connection, 'a fresh connect owns the menu');
  adapter.close('done');
}

// ---- (B) the start of a later round on a released connection names its owner and its own role
{
  const made = [];
  const starts = [];
  const adapter = createRoomConnectionAdapter({
    createRoomClient: (options) => fakeClient(options, made),
    onHostStart: (state, connection, owner) => starts.push({ owner, role: connection.role }),
  });
  const connection = await adapter.connect(request);
  const payload = { matchId: 'm1-0000a1b2', round: 1, mapId: 'verdant', mode: 'standard', seed: 1, seat: 0, team: 'alpha', seatToken: 'x.y', matchUrl: 'rtc://ADPSEA/1', expiresAt: Date.now() + 60_000 };
  made[0].deliverStart(payload);
  adapter.forget();
  made[0].deliverStart({ ...payload, matchId: 'm2-0000c3d4', round: 2 });
  assert.deepEqual(starts, [{ owner: 'menu', role: 'host' }, { owner: 'released', role: 'host' }],
    'the menu hears whose seat a round starts on: its own, then the battle owner\'s');
  void connection;
}
// ---- (C) one declared hold, one writer; a released seat beside a new hold of the menu's own
{
  const source = readFileSync(new URL('./playMenuAdapter.ts', import.meta.url), 'utf8');
  assert.match(source, /type AdapterHold =\s*\| \{ state: 'idle' \}\s*\| \{ state: 'connecting'; attempt: [^}]+\}\s*\| \{ state: 'held'; connection: RoomConnection \};/,
    '(C) the adapter declares its hold: idle, connecting with its attempt, held with its connection');
  assert.doesNotMatch(source, /\blet (pending|current)\b/, '(C) no nullable pending or current beside the hold');
  const writes = [...source.matchAll(/\bhold = /g)].length;
  assert.equal(writes, 1, `(C) moveHold is the hold's one writer (${writes} writes)`);
  assert.equal([...source.matchAll(/\breleased = (?!null)/g)].length, 1, '(C) only forget() releases a seat');

  const made = [];
  const starts = [];
  const closes = [];
  const adapter = createRoomConnectionAdapter({
    createRoomClient: (options) => fakeClient(options, made),
    onHostStart: (state, connection, owner) => starts.push({ owner, generation: connection.generation }),
    onClose: (reason) => closes.push(reason),
  });
  const payload = { matchId: 'm1-0000e1e2', round: 1, mapId: 'verdant', mode: 'standard', seed: 1, seat: 0, team: 'alpha', seatToken: 'x.y', matchUrl: 'rtc://ADPSEA/1', expiresAt: Date.now() + 60_000 };
  assert.equal(adapter.current, null); assert.equal(adapter.connecting, false);
  const first = await adapter.connect(request);
  assert.equal(adapter.current, first, '(C) held');
  adapter.forget();
  assert.equal(adapter.current, null, '(C) a released seat is not the menu\'s');
  const second = await adapter.connect(request);
  assert.ok(second && second !== first && adapter.current === second, '(C) the menu holds a room of its own again beside the released one');
  made[0].deliverStart(payload);
  made[1].deliverStart({ ...payload, matchId: 'm2-0000e3e4' });
  assert.deepEqual(starts, [{ owner: 'released', generation: first.generation }, { owner: 'menu', generation: second.generation }],
    '(C) each room\'s round names its own owner');
  // the battle owner leaves the released room: the menu's own hold is untouched and hears no close
  first.session.close('left');
  assert.equal(adapter.current, second);
  assert.deepEqual(closes, []);
  adapter.close('done');
  assert.equal(adapter.current, null);
  assert.equal(made[1].disposed || made[1].phase === 'closed', true, '(C) the menu\'s own room is left on close');
}
console.log('playMenuAdapterSeat.selftest: a close during the limit check cancels the attempt; a released seat\'s round names its owner; the adapter\'s hold is one declared state beside the seat it released');
