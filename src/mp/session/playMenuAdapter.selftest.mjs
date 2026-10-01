// The Play menu's room connection (src/mp/session/playMenuAdapter.ts) over real sockets against the in-process
// room service: create and join through the menu's contract, the lobby shape the menu renders, the seat's commands,
// the match_start handoff, `forget()` keeping the seat for the session owner, a superseded attempt disposed, an
// unreachable room host and a deployment without one classified as the room service being unavailable.
import assert from 'node:assert/strict';
import net from 'node:net';
import { WebSocket } from 'ws';
import { createRoomConnectionAdapter, isMultiplayerV2Session } from './playMenuAdapter.ts';
import { RoomClient, RoomConnectError } from '../room/roomClient.ts';
import { classifyRoomFailure } from './roomFailure.ts';
import { createRoomsServer } from '../../../server/rooms/serve.ts';

const server = await createRoomsServer({ seatSecret: 'play-menu-adapter-receipt-secret-0123456789', world: 'terrain', countdownS: 1, battleLimitS: 30 });
const memory = () => { const map = new Map(); return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k) }; };
const until = (predicate, label, timeoutMs = 8000) => new Promise((resolve, reject) => {
  const started = Date.now();
  const poll = () => {
    if (predicate()) return resolve();
    if (Date.now() - started > timeoutMs) return reject(new Error(`timeout: ${label}`));
    setTimeout(poll, 10);
  };
  poll();
});
const freePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});
const selection = { specId: 'm1a2', mapId: 'verdant', equipment: [], camo: 'factory' };
const clients = [];
/** Node's `ws` reports a socket closed before its handshake completed as an 'error' nobody may own (the transport drops
 * its listeners with the socket, as the exit flow's receipt requires); a browser socket never throws for it. */
const socket = (url) => { const ws = new WebSocket(url); ws.on('error', () => {}); return ws; };
function adapter(events, over = {}) {
  return createRoomConnectionAdapter({
    storage: memory(), clientBuild: 'receipt',
    createRoomClient: (options) => {
      const client = new RoomClient({ ...options, pingIntervalMs: 0, transport: { createSocket: socket } });
      clients.push(client);
      return client;
    },
    onHostStart: (state, connection) => events.push(['start', connection.role, state.phase]),
    onClose: (reason) => events.push(['close', reason]),
    onStatus: ({ state }) => events.push(['status', state]),
    onError: (error) => events.push(['error', error?.code ?? String(error)]),
    ...over,
  });
}

try {
  // ---- create: the admin's connection, the lobby shape, the observation
  const hostEvents = [];
  const host = adapter(hostEvents);
  assert.equal(host.connecting, false);
  const created = await host.connect({ kind: 'create', mode: 'private', roomsUrl: server.url, player: { id: 'alice', name: 'Alice' }, selection, teamSize: 2 });
  assert.ok(created && host.current === created);
  assert.equal(created.role, 'host');
  assert.equal(created.mode, 'private');
  assert.match(created.roomInfo.roomCode, /^[A-Z0-9]{6}$/);
  assert.equal(created.roomInfo.peerId, 'alice');
  assert.equal(created.roomInfo.hostId, 'alice');
  assert.equal(created.roomInfo.hostName, 'Alice');
  assert.ok(isMultiplayerV2Session(created.session), 'the session carries the marker main.ts routes on');
  assert.deepEqual(hostEvents, [['status', 'connecting'], ['status', 'connected']]);
  const lobby = created.session.lobby;
  assert.equal(lobby.roomCode, created.roomInfo.roomCode);
  assert.equal(lobby.hostId, 'alice');
  assert.equal(lobby.phase, 'waiting');
  assert.equal(lobby.players.length, 1);
  assert.equal(lobby.players[0].specId, 'm1a2');
  const observed = [];
  const stop = host.observe((state) => observed.push(state.revision));
  assert.equal(observed.length, 1, 'observe replays the newest lobby at once');
  await assert.rejects(host.connect({ kind: 'create', mode: 'private', roomsUrl: server.url, player: { id: 'alice', name: 'Alice' }, selection, teamSize: 2 }),
    /already owns this menu/);

  // ---- join: the guest's connection, the lobby on both sides, a seat command
  const guestEvents = [];
  const guest = adapter(guestEvents);
  const joined = await guest.connect({ kind: 'join', mode: 'private', roomsUrl: server.url, roomCode: created.roomInfo.roomCode.toLowerCase(), player: { id: 'bob', name: 'Bob' }, selection: { ...selection, specId: 't90m' }, teamSize: 2 });
  assert.equal(joined.role, 'client');
  assert.equal(joined.roomInfo.hostName, 'Alice');
  await until(() => observed.length >= 2 && created.session.lobby.players.length === 2, 'the host sees the guest');
  await joined.session.command({ type: 'set_ready', ready: true });
  await until(() => created.session.lobby.players.find((player) => player.id === 'bob')?.ready === true
    && joined.session.lobby.players.find((player) => player.id === 'bob')?.ready === true, 'both seats see the guest ready');
  stop();

  // ---- the start reaches both seats through onHostStart (the host's admin command)
  await created.session.command({ type: 'set_ready', ready: true });
  await created.session.command({ type: 'start', matchSeed: 7 });
  await until(() => hostEvents.some(([name]) => name === 'start') && guestEvents.some(([name]) => name === 'start'), 'both seats received match_start');
  assert.deepEqual(hostEvents.find(([name]) => name === 'start'), ['start', 'host', 'starting']);
  assert.deepEqual(guestEvents.find(([name]) => name === 'start'), ['start', 'client', 'starting']);
  assert.ok(created.session.lastMatchStart, 'the seat keeps its match_start for a rejoin');

  // ---- forget(): the session owner keeps the seat; the menu's onClose stays silent when the room later ends for it
  host.forget();
  assert.equal(host.current, null);
  assert.equal(host.connecting, false);
  assert.equal(created.session.client.phase, 'joined', 'the socket and the seat survive the menu releasing them');
  const closedFor = [];
  created.session.onClosed((reason) => closedFor.push(reason));
  await joined.session.command({ type: 'set_ready', ready: false }).catch(() => { /* a starting room may refuse */ });
  guest.close('left_room');
  await until(() => guest.current === null && clients.at(-1).phase === 'closed', 'the guest left');
  assert.ok(!guestEvents.some(([name]) => name === 'close'), 'an explicit close is never reported as a failure');
  created.session.close('left_room');
  await until(() => created.session.client.phase === 'closed', 'the host left');
  assert.ok(!hostEvents.some(([name]) => name === 'close'), 'a forgotten connection never calls the menu back');

  // ---- a superseded attempt (the menu switched modes while connecting) disposes its client silently
  const superseded = [];
  const flaky = adapter(superseded);
  const attempt = flaky.connect({ kind: 'create', mode: 'lan', roomsUrl: server.url, player: { id: 'carol', name: 'Carol' }, selection, teamSize: 1 });
  assert.equal(flaky.connecting, true);
  flaky.close('mode_changed');
  assert.equal(await attempt, null, 'a cancelled acquisition publishes nothing');
  assert.equal(flaky.connecting, false);
  assert.ok(!superseded.some(([name]) => name === 'error'));

  // ---- validation: an incomplete request, a bad code, no room host for this deployment
  const invalid = adapter([]);
  await assert.rejects(invalid.connect({ kind: 'join', mode: 'private', roomsUrl: server.url, roomCode: 'AB', player: { id: 'dan', name: 'Dan' }, selection, teamSize: 1 }),
    (error) => error.code === 'invalid_room_code');
  await assert.rejects(invalid.connect({ kind: 'create', mode: 'private', roomsUrl: '', player: { id: 'dan', name: 'Dan' }, selection, teamSize: 1 }),
    (error) => error.code === 'room_unconfigured' && classifyRoomFailure(error).code === 'room_service_unavailable');
  await assert.rejects(invalid.connect({ kind: 'create', mode: 'private', roomsUrl: server.url, player: { id: '', name: 'Dan' }, selection, teamSize: 1 }), TypeError);
  assert.equal(invalid.connecting, false, 'a refused request leaves the menu free');

  // ---- an unreachable room host: RoomConnectError, classified as the room service being unavailable, retryable
  const unreachable = [];
  const nobody = adapter(unreachable, { createRoomClient: (options) => {
    const client = new RoomClient({ ...options, pingIntervalMs: 0, transport: { createSocket: socket, reconnect: { initialDelayMs: 10, maxDelayMs: 20, factor: 1, jitterFraction: 0, windowMs: 200, attemptTimeoutMs: 500 } } });
    clients.push(client);
    return client;
  } });
  const deadPort = await freePort();
  await assert.rejects(nobody.connect({ kind: 'create', mode: 'lan', roomsUrl: `ws://127.0.0.1:${deadPort}`, player: { id: 'erin', name: 'Erin' }, selection, teamSize: 1 }),
    (error) => error instanceof RoomConnectError && error.code === 'room_unreachable');
  const failure = classifyRoomFailure(unreachable.find(([name]) => name === 'error') ? { code: 'room_unreachable' } : null);
  assert.equal(failure.code, 'room_service_unavailable');
  assert.equal(failure.canRetry, true);
  assert.equal(nobody.current, null);
  assert.equal(nobody.connecting, false, 'the menu may retry at once');

  // ---- the lifecycle proofs (2026-09-30): the room host closes the socket and stays away for the reconnect window →
  // the menu hears `room_unreachable` — "Room service unavailable" with Try again — after showing the interruption
  {
    const away = await createRoomsServer({ seatSecret: 'play-menu-adapter-receipt-secret-0123456789', world: 'terrain', countdownS: 1, battleLimitS: 30 });
    const events = [];
    const menu = adapter(events, { createRoomClient: (options) => {
      const client = new RoomClient({ ...options, pingIntervalMs: 0, transport: { createSocket: socket, reconnect: { initialDelayMs: 20, maxDelayMs: 40, factor: 1, jitterFraction: 0, windowMs: 600, attemptTimeoutMs: 300 } } });
      clients.push(client);
      return client;
    } });
    const connection = await menu.connect({ kind: 'create', mode: 'private', roomsUrl: away.url, player: { id: 'fay', name: 'Fay' }, selection, teamSize: 1 });
    assert.ok(connection && menu.current === connection);
    await away.close();
    await until(() => events.some(([name]) => name === 'close'), 'the menu hears the close', 5000);
    const close = events.find(([name]) => name === 'close');
    assert.equal(close[1], 'room_unreachable');
    const failure = classifyPrivateRoomFailure({ code: close[1] });
    assert.equal(failure.code, 'signaling_unavailable', 'presented as the room service being unavailable');
    assert.equal(failure.canRetry, true, 'with Try again');
    assert.ok(events.some(([name, state]) => name === 'status' && state === 'reconnecting'), 'the interruption was shown first');
    assert.equal(menu.current, null);
    assert.equal(menu.connecting, false, 'Try again may connect at once');
  }
  assert.throws(() => createRoomConnectionAdapter({ onHostStart: 'nope' }), /requires every lifecycle port/);
} finally {
  for (const client of clients) { try { client.dispose(); } catch { /* already gone */ } }
  await server.close();
}
console.log('playMenuAdapter.selftest: create, join, the lobby shape, the start handoff, forget, cancel, validation and an unreachable host');
