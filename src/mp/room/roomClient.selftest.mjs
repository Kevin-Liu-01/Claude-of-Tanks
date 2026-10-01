// RoomClient receipt over real sockets against the in-process room service
// (server/rooms): create, join, readiness, start with per-seat tokens the
// match service accepts, chat, resume with the stored capability, a stranger
// refused, admin migration on leave, a lost match, rematch, leave.
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { RoomClient } from './roomClient.ts';
import { RoomError } from './protocol.ts';
import { createRoomsServer } from '../../../server/rooms/serve.ts';
import { silentLogger } from '../../../server/match/log.ts';
import { verifySeatToken } from '../../../server/match/seatToken.ts';

const SECRET = 'room-client-receipt-secret-0123456789';
const server = await createRoomsServer({ seatSecret: SECRET, world: 'terrain', countdownS: 1, battleLimitS: 30 });
const memory = () => { const map = new Map(); return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k), map }; };
const clients = [];
function client(id, storage = memory()) {
  const created = new RoomClient({
    endpoint: server.url, player: { id, name: `Name ${id}` }, storage, clientBuild: 'receipt', pingIntervalMs: 0,
    transport: { createSocket: (url) => new WebSocket(url) },
  });
  clients.push(created);
  return created;
}
const until = (predicate, label, timeoutMs = 8000) => new Promise((resolve, reject) => {
  const started = Date.now();
  const poll = () => {
    if (predicate()) return resolve();
    if (Date.now() - started > timeoutMs) return reject(new Error(`timeout: ${label}`));
    setTimeout(poll, 10);
  };
  poll();
});
const rejects = async (promise, code) => {
  let thrown = null;
  try { await promise; } catch (error) { thrown = error; }
  assert.ok(thrown instanceof RoomError, `expected RoomError ${code}, got ${thrown}`);
  assert.equal(thrown.code, code);
};

try {
  // ---- create / join / state
  const a = client('alice');
  const room = await a.create({ mode: 'private', selection: { specId: 'm1a2' }, settings: { teamSize: 2, mapId: 'verdant' } });
  assert.match(room.roomCode, /^[A-Z0-9]{6}$/);
  assert.equal(a.isAdmin, true);
  assert.equal(a.phase, 'joined');
  assert.equal(a.seat, 0, 'the creator holds seat 0');
  assert.equal(a.region, 'lan', 'the local host names its region in the admission reply');
  assert.ok(Number.isFinite(a.rttMs) && a.rttMs >= 0 && a.rttMs < 5000, `the admission round trip is the first RTT sample (${a.rttMs})`);
  assert.equal(a.stats().region, 'lan');
  assert.ok(a.hasResumeCapability(room.roomCode), 'the capability is stored');
  const bStorage = memory();
  const b = client('bob', bStorage);
  const states = [];
  a.onState((state) => states.push(state.revision));
  const joined = await b.join({ roomCode: room.roomCode, selection: { specId: 't90m' } });
  assert.equal(joined.players.length, 2);
  assert.equal(b.me.team, 'bravo');
  await until(() => a.room?.players.length === 2, 'alice sees bob');
  await rejects(client('carol').join({ roomCode: 'NOPE99' }), 'room_not_found');
  await rejects(b.command({ type: 'set_map', mapId: 'alpine' }), 'admin_only');
  await rejects(b.setReady(true).then(() => b.command({ type: 'set_team', team: 'alpha' })), 'vehicle_locked');
  await a.setReady(true);
  await until(() => a.room?.players.every((p) => p.ready), 'both ready');

  // ---- chat
  const chat = [];
  a.onChat((entry) => chat.push(entry));
  await b.chat('  gg   wp ');
  await until(() => chat.length === 1, 'alice receives chat');
  assert.equal(chat[0].text, 'gg wp');
  assert.equal(chat[0].playerId, 'bob');

  // ---- start: per-seat tokens, an actor in the match service, resolvable match URL
  const starts = new Map();
  a.onMatchStart((payload) => starts.set('alice', payload));
  b.onMatchStart((payload) => starts.set('bob', payload));
  await a.start();
  await until(() => starts.size === 2, 'both seats receive match_start');
  const alice = starts.get('alice');
  const bob = starts.get('bob');
  assert.equal(alice.matchUrl, '/match');
  assert.equal(a.resolveUrl(alice.matchUrl), `${server.url}/match`);
  assert.notEqual(alice.seatToken, bob.seatToken);
  const verified = verifySeatToken(SECRET, bob.seatToken, Date.now());
  assert.equal(verified.ok, true);
  assert.equal(verified.claims.playerId, 'bob');
  assert.equal(verified.claims.roomId, room.roomCode);
  assert.ok(server.matchService.actors.get(room.roomCode), 'a MatchActor runs for the room');
  assert.equal(server.matchService.actors.get(room.roomCode).stats().bots, 2, 'bots fill the empty slots');
  await until(() => a.room?.phase === 'starting', 'room is starting');
  await rejects(b.setReady(false), 'lobby_locked');

  // ---- resume: bob's socket drops, a new client with the same storage takes the seat back and gets match_start again
  b.disconnect('reload');
  await until(() => a.room?.players.find((p) => p.id === 'bob')?.connected === false, 'alice sees bob disconnected');
  const b2 = client('bob', bStorage);
  const resumed = await b2.join({ roomCode: room.roomCode });
  assert.equal(resumed.players.length, 2, 'a resume keeps the seat');
  assert.equal(b2.matchStart?.seatToken, bob.seatToken, 'the seat token is re-sent to the resumed seat');
  await until(() => a.room?.players.find((p) => p.id === 'bob')?.connected === true, 'alice sees bob back');
  // a stranger with bob's id but no capability is refused; bob's own client stays
  await rejects(client('bob', memory()).join({ roomCode: room.roomCode }), 'resume_denied');
  assert.equal(b2.phase, 'joined');

  // ---- the container dies: two polls without an answer → match_lost, the room offers a rematch
  const statuses = [];
  b2.onMatchStatus((payload) => statuses.push(payload.status));
  server.matchService.removeActor(room.roomCode);
  const actor = server.roomService.room(room.roomCode);
  await actor.observeMatchNow();
  await actor.observeMatchNow();
  await until(() => statuses.includes('lost'), 'bob hears match_lost');
  await until(() => a.room?.phase === 'waiting' && a.room.lastResult?.reason === 'match_lost', 'room waiting again');

  // ---- rematch in the same room: fresh tokens, round 2
  await a.setReady(true);
  await b2.setReady(true);
  const restarts = [];
  b2.onMatchStart((payload) => restarts.push(payload));
  await a.start();
  await until(() => restarts.length === 1, 'bob receives the rematch');
  assert.equal(restarts[0].round, 2);
  assert.notEqual(restarts[0].seatToken, bob.seatToken);

  // ---- admin migration on explicit leave; the room survives; bob leaves too
  await a.leave();
  assert.equal(a.phase, 'closed');
  await until(() => b2.isAdmin, 'bob becomes admin at once');
  assert.equal(b2.room.players.length, 1);
  await b2.leave();
  assert.ok(server.roomService.rooms.get(room.roomCode)?.snapshot, 'the room outlives its last player');

  // ---- P1b (2026-09-28): the keepalive is the room's exact text frame, answered by the service outside the actor
  // (the Durable Object's auto-response does the same): the answer is the RTT readout, and the actor never sees a touch
  {
    const keep = new RoomClient({
      endpoint: server.url, player: { id: 'keeper', name: 'Keeper' }, storage: memory(), clientBuild: 'receipt', pingIntervalMs: 30,
      transport: { createSocket: (url) => new WebSocket(url) },
    });
    clients.push(keep);
    const kept = await keep.create({ mode: 'private', selection: { specId: 'm1a2' } });
    const touchedAt = server.roomService.rooms.get(kept.roomCode).snapshot.touchedAt;
    await until(() => keep.stats().keepalivesAnswered >= 4, 'four keepalive answers');
    const stats = keep.stats();
    assert.equal(stats.keepalive, 'frame', 'the WebSocket transport carries the room\'s text frame');
    assert.ok(stats.keepalivesSent >= stats.keepalivesAnswered, `sent ${stats.keepalivesSent} ≥ answered ${stats.keepalivesAnswered}`);
    assert.ok(Number.isFinite(keep.rttMs) && keep.rttMs >= 0 && keep.rttMs < 5000, `the keepalive answer is the RTT readout (${keep.rttMs})`);
    assert.ok(keep.lastKeepaliveAt !== null);
    assert.equal(server.roomService.rooms.get(kept.roomCode).snapshot.touchedAt, touchedAt, 'the frames never reached the actor (no touch)');
    assert.equal(server.roomService.rooms.get(kept.roomCode).socketCount, 1);
    keep.dispose();
  }
  // a transport without the frame (no pair configured) keeps the room_ping envelope: answered by the actor, which touches
  {
    const legacy = new RoomClient({
      endpoint: server.url, player: { id: 'legacy', name: 'Legacy' }, storage: memory(), clientBuild: 'receipt', pingIntervalMs: 30,
      transport: { createSocket: (url) => new WebSocket(url), keepalive: null },
    });
    clients.push(legacy);
    const kept = await legacy.create({ mode: 'private', selection: { specId: 'm1a2' } });
    const touchedAt = server.roomService.rooms.get(kept.roomCode).snapshot.touchedAt;
    await until(() => legacy.stats().keepalivesAnswered >= 2, 'two envelope pongs');
    assert.equal(legacy.stats().keepalive, 'envelope');
    assert.ok(server.roomService.rooms.get(kept.roomCode).snapshot.touchedAt > touchedAt, 'a handled ping touches the room');
    assert.ok(Number.isFinite(legacy.rttMs) && legacy.rttMs >= 0);
    legacy.dispose();
  }

  // ---- the lifecycle proofs (2026-09-30): a resume the room refuses ends the client with the room's code — it sat in
  // `connecting` before while the room retired the silent socket every 15 s and the transport reopened it, without end
  {
    const sockets = [];
    const gone = new RoomClient({
      endpoint: server.url, player: { id: 'gone', name: 'Gone' }, storage: memory(), clientBuild: 'receipt', pingIntervalMs: 0,
      transport: { createSocket: (url) => { const ws = new WebSocket(url); ws.on('error', () => {}); sockets.push(ws); return ws; }, reconnect: { initialDelayMs: 10, maxDelayMs: 20, factor: 1, jitterFraction: 0, windowMs: 5000, attemptTimeoutMs: 1000 } },
    });
    clients.push(gone);
    const closedReasons = [];
    const phases = [];
    gone.onClosed(({ reason }) => closedReasons.push(reason));
    gone.onPhase((change) => phases.push(change.phase));
    const created = await gone.create({ mode: 'private', selection: { specId: 'm1a2' } });
    // the room goes away behind the client's back (its storage reset, a redeploy) and the socket drops: the transport
    // reconnects inside its window and the client presents its capability to a room that has no such seat
    server.roomService.rooms.delete(created.roomCode);
    sockets.at(-1).terminate();
    await until(() => closedReasons.length === 1, 'the refused resume ends the client', 5000);
    assert.equal(closedReasons[0], 'room_not_found', 'the room\'s refusal reaches onClosed (the Play menu shows the room as gone)');
    assert.equal(gone.phase, 'closed');
    assert.equal(gone.lastClosedReason, 'room_not_found');
    assert.ok(phases.includes('reconnecting') && phases.includes('connecting'), `the resume was attempted (${phases.join(',')})`);
    assert.equal(gone.stats().transport, 'none', 'the socket is released');
  }

  // ---- two clients of one seat sharing its capability (two tabs): the room retires the first; it must not resume and take
  // the seat back — the two flapped it between them without end before (the lifecycle proofs, 2026-09-30)
  {
    const shared = memory();
    const first = client('twin', shared);
    const firstReasons = [];
    const firstPhases = [];
    first.onClosed(({ reason }) => firstReasons.push(reason));
    first.onPhase((change) => firstPhases.push(change.phase));
    const created = await first.create({ mode: 'private', selection: { specId: 'm1a2' } });
    const second = client('twin', shared);
    const secondReasons = [];
    second.onClosed(({ reason }) => secondReasons.push(reason));
    const rejoined = await second.join({ roomCode: created.roomCode });
    assert.equal(rejoined.players.length, 1, 'one seat');
    await until(() => firstReasons.length === 1, 'the first client ends', 3000);
    assert.equal(firstReasons[0], 'resume_denied');
    assert.equal(first.phase, 'closed');
    assert.ok(!firstPhases.includes('reconnecting'), `no reconnect attempt (${firstPhases.join(',')})`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    assert.equal(second.phase, 'joined', 'the second client keeps the seat');
    assert.deepEqual(secondReasons, [], 'and is never retired by a resume of the first');
    assert.equal(server.roomService.rooms.get(created.roomCode).socketCount, 1, 'one socket on the room');
    second.dispose();
  }

  // ---- the room host gone for the whole reconnect window: `room_unreachable` — the code a failed admission carries too, so
  // the Play menu shows "Room service unavailable" with Try again instead of a generic connection failure
  {
    const away = await createRoomsServer({ host: '127.0.0.1', port: 0, seatSecret: SECRET, world: 'terrain', matchTransport: 'p2p', log: silentLogger });
    const lost = new RoomClient({
      endpoint: away.url, player: { id: 'lost', name: 'Lost' }, storage: memory(), clientBuild: 'receipt', pingIntervalMs: 0,
      transport: { createSocket: (url) => { const ws = new WebSocket(url); ws.on('error', () => {}); return ws; }, reconnect: { initialDelayMs: 20, maxDelayMs: 40, factor: 1, jitterFraction: 0, windowMs: 600, attemptTimeoutMs: 300 } },
    });
    clients.push(lost);
    const reasons = [];
    const phases = [];
    lost.onClosed(({ reason }) => reasons.push(reason));
    lost.onPhase((change) => phases.push(change.phase));
    await lost.create({ mode: 'private', selection: { specId: 'm1a2' } });
    await away.close();
    await until(() => reasons.length === 1, 'the window ran out', 5000);
    assert.equal(reasons[0], 'room_unreachable');
    assert.equal(lost.lastClosedReason, 'room_unreachable');
    assert.ok(phases.includes('reconnecting'), 'the interruption was surfaced first');
    assert.equal(lost.phase, 'closed');
  }
  console.log('roomClient: PASS');
} finally {
  for (const entry of clients) entry.dispose();
  await server.close();
}
